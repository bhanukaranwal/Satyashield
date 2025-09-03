import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from transformers import AutoTokenizer, AutoModel
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
import re
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@dataclass
class FraudPredictionResult:
    is_fraud: bool
    confidence: float
    fraud_probability: float
    risk_factors: List[str]
    risk_scores: Dict[str, float]
    model_predictions: Dict[str, float]
    explanation: str

class FraudFeatureExtractor:
    """Extract features from various data sources for fraud detection"""
    
    def __init__(self):
        self.financial_keywords = [
            'guaranteed', 'risk-free', 'double money', 'insider', 'secret',
            'sure profit', 'no risk', 'instant wealth', 'get rich quick',
            'limited time', 'exclusive offer', 'urgent', 'act now'
        ]
        
        self.suspicious_patterns = [
            r'guaranteed\s+\d+%\s+returns?',
            r'double\s+your\s+money',
            r'risk[\s-]*free\s+investment',
            r'\d+%\s+profit\s+guaranteed',
            r'insider\s+information',
            r'secret\s+tips?',
            r'sure\s+shot\s+profit',
            r'no\s+risk\s+investment'
        ]
    
    def extract_text_features(self, text: str) -> Dict[str, float]:
        """Extract fraud-related features from text content"""
        features = {}
        
        if not text:
            return {f'text_{k}': 0.0 for k in ['keyword_score', 'pattern_score', 'urgency_score', 'guarantee_score']}
        
        text_lower = text.lower()
        
        # Keyword-based features
        keyword_count = sum(1 for keyword in self.financial_keywords if keyword in text_lower)
        features['text_keyword_score'] = min(keyword_count / len(self.financial_keywords), 1.0)
        
        # Pattern matching
        pattern_matches = sum(1 for pattern in self.suspicious_patterns 
                            if re.search(pattern, text_lower))
        features['text_pattern_score'] = min(pattern_matches / len(self.suspicious_patterns), 1.0)
        
        # Urgency indicators
        urgency_words = ['urgent', 'limited time', 'act now', 'hurry', 'deadline', 'expires']
        urgency_count = sum(1 for word in urgency_words if word in text_lower)
        features['text_urgency_score'] = min(urgency_count / len(urgency_words), 1.0)
        
        # Guarantee claims
        guarantee_patterns = [r'guaranteed?', r'100%', r'sure', r'certain', r'promise']
        guarantee_count = sum(1 for pattern in guarantee_patterns 
                            if re.search(pattern, text_lower))
        features['text_guarantee_score'] = min(guarantee_count / len(guarantee_patterns), 1.0)
        
        return features
    
    def extract_advisor_features(self, advisor_data: Dict) -> Dict[str, float]:
        """Extract features from advisor information"""
        features = {}
        
        # SEBI registration validity
        features['advisor_sebi_valid'] = 1.0 if advisor_data.get('sebiValid') else 0.0
        
        # License expiry status
        if advisor_data.get('expiryDate'):
            expiry_date = datetime.fromisoformat(advisor_data['expiryDate'].replace('Z', '+00:00'))
            days_to_expiry = (expiry_date - datetime.now()).days
            features['advisor_expiry_risk'] = max(0, (30 - days_to_expiry) / 30) if days_to_expiry < 30 else 0
        else:
            features['advisor_expiry_risk'] = 1.0
        
        # Compliance history
        compliance_issues = advisor_data.get('complianceIssues', [])
        features['advisor_compliance_score'] = min(len(compliance_issues) / 5, 1.0)
        
        # Social media sentiment
        sentiment = advisor_data.get('socialSentiment', {})
        features['advisor_negative_sentiment'] = sentiment.get('negative', 0)
        
        # Years of operation
        if advisor_data.get('registrationDate'):
            reg_date = datetime.fromisoformat(advisor_data['registrationDate'].replace('Z', '+00:00'))
            years_operating = (datetime.now() - reg_date).days / 365
            features['advisor_experience'] = min(years_operating / 10, 1.0)  # Normalize to 10 years
        else:
            features['advisor_experience'] = 0.0
        
        return features
    
    def extract_social_media_features(self, social_data: Dict) -> Dict[str, float]:
        """Extract features from social media content"""
        features = {}
        
        # Platform credibility (some platforms are more prone to fraud)
        platform_risk = {
            'TELEGRAM': 0.8, 'WHATSAPP': 0.7, 'TWITTER': 0.4,
            'FACEBOOK': 0.5, 'INSTAGRAM': 0.3, 'LINKEDIN': 0.2
        }
        features['social_platform_risk'] = platform_risk.get(social_data.get('platform'), 0.5)
        
        # User credibility
        features['social_user_credibility'] = 1.0 - social_data.get('userCredibility', 0.5)
        
        # Engagement anomalies
        engagement = social_data.get('engagement', {})
        likes = engagement.get('likes', 0)
        views = engagement.get('views', 1)
        engagement_ratio = likes / views if views > 0 else 0
        
        # Suspicious if engagement is too high (bot activity) or too low (fake content)
        if engagement_ratio > 0.5 or engagement_ratio < 0.01:
            features['social_engagement_anomaly'] = 0.8
        else:
            features['social_engagement_anomaly'] = 0.0
        
        # Posting frequency (accounts that post too frequently might be bots)
        post_frequency = social_data.get('postFrequency', 1)  # posts per day
        features['social_bot_probability'] = min(post_frequency / 50, 1.0)  # Normalize to 50 posts/day
        
        # Content similarity to known fraud patterns
        features['social_fraud_pattern_match'] = social_data.get('fraudPatternScore', 0)
        
        return features
    
    def extract_financial_features(self, financial_data: Dict) -> Dict[str, float]:
        """Extract features from financial data"""
        features = {}
        
        # Promised returns (unrealistic returns are fraud indicators)
        promised_returns = financial_data.get('promisedReturns', 0)
        features['financial_unrealistic_returns'] = min(max(promised_returns - 15, 0) / 50, 1.0)  # >15% is suspicious
        
        # Investment amount requirements
        min_investment = financial_data.get('minInvestment', 0)
        features['financial_min_investment_risk'] = 1.0 if min_investment > 100000 else min_investment / 100000
        
        # Lock-in period (very long or very short can be suspicious)
        lock_in_days = financial_data.get('lockInDays', 0)
        if lock_in_days > 365 * 5 or lock_in_days < 30:  # >5 years or <1 month
            features['financial_lockin_risk'] = 0.8
        else:
            features['financial_lockin_risk'] = 0.0
        
        # Fee structure transparency
        features['financial_fee_transparency'] = 1.0 - financial_data.get('feeTransparency', 1.0)
        
        return features
    
    def extract_technical_features(self, technical_data: Dict) -> Dict[str, float]:
        """Extract features from technical analysis (website, app, etc.)"""
        features = {}
        
        # SSL certificate validity
        features['tech_ssl_valid'] = 1.0 if technical_data.get('sslValid') else 0.0
        
        # Domain age (newer domains are riskier)
        domain_age_days = technical_data.get('domainAgeDays', 0)
        features['tech_domain_risk'] = max(0, (365 - domain_age_days) / 365) if domain_age_days < 365 else 0
        
        # Website similarity to legitimate sites (phishing indicator)
        features['tech_similarity_score'] = technical_data.get('similarityToLegitSites', 0)
        
        # Mobile app store ratings
        app_rating = technical_data.get('appStoreRating', 5.0)
        features['tech_app_rating_risk'] = max(0, (4.0 - app_rating) / 4.0)  # <4.0 is suspicious
        
        # Privacy policy and terms presence
        has_privacy_policy = technical_data.get('hasPrivacyPolicy', False)
        has_terms = technical_data.get('hasTerms', False)
        features['tech_legal_docs_missing'] = 0.0 if (has_privacy_policy and has_terms) else 0.5
        
        return features

class EnsembleFraudClassifier(nn.Module):
    """Neural network component of the ensemble model"""
    
    def __init__(self, input_dim: int, hidden_dims: List[int] = [256, 128, 64]):
        super(EnsembleFraudClassifier, self).__init__()
        
        layers = []
        prev_dim = input_dim
        
        for hidden_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, hidden_dim),
                nn.BatchNorm1d(hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.3)
            ])
            prev_dim = hidden_dim
        
        # Output layer
        layers.append(nn.Linear(prev_dim, 2))  # Binary classification
        
        self.model = nn.Sequential(*layers)
        self.softmax = nn.Softmax(dim=1)
    
    def forward(self, x):
        logits = self.model(x)
        probabilities = self.softmax(logits)
        return logits, probabilities

class FraudClassifier:
    """Main fraud classification system using ensemble methods"""
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        self.feature_extractor = FraudFeatureExtractor()
        self.scaler = StandardScaler()
        
        # Traditional ML models
        self.isolation_forest = IsolationForest(contamination=0.1, random_state=42)
        self.random_forest = RandomForestClassifier(n_estimators=100, random_state=42)
        
        # Neural network model
        self.neural_net = None
        self.feature_dim = None
        
        # NLP model for text analysis
        self.tokenizer = None
        self.text_model = None
        
        self.is_trained = False
        
        if model_path:
            self.load_model(model_path)
    
    def initialize_nlp_model(self):
        """Initialize NLP model for text analysis"""
        try:
            self.tokenizer = AutoTokenizer.from_pretrained('bert-base-uncased')
            self.text_model = AutoModel.from_pretrained('bert-base-uncased')
            self.text_model.eval()
            logger.info("NLP model initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize NLP model: {e}")
            self.tokenizer = None
            self.text_model = None
    
    def extract_text_embeddings(self, text: str) -> np.ndarray:
        """Extract BERT embeddings from text"""
        if not self.tokenizer or not self.text_model or not text:
            return np.zeros(768)  # BERT base embedding size
        
        try:
            inputs = self.tokenizer(text, return_tensors='pt', truncation=True, 
                                  padding=True, max_length=512)
            
            with torch.no_grad():
                outputs = self.text_model(**inputs)
                # Use CLS token embedding
                embeddings = outputs.last_hidden_state[:, 0, :].numpy()
                return embeddings.flatten()
        
        except Exception as e:
            logger.error(f"Text embedding extraction failed: {e}")
            return np.zeros(768)
    
    def prepare_features(self, data: Dict) -> np.ndarray:
        """Prepare feature vector from input data"""
        features = {}
        
        # Extract features from different data sources
        if 'text' in data:
            text_features = self.feature_extractor.extract_text_features(data['text'])
            features.update(text_features)
        
        if 'advisorData' in data:
            advisor_features = self.feature_extractor.extract_advisor_features(data['advisorData'])
            features.update(advisor_features)
        
        if 'socialData' in data:
            social_features = self.feature_extractor.extract_social_media_features(data['socialData'])
            features.update(social_features)
        
        if 'financialData' in data:
            financial_features = self.feature_extractor.extract_financial_features(data['financialData'])
            features.update(financial_features)
        
        if 'technicalData' in data:
            technical_features = self.feature_extractor.extract_technical_features(data['technicalData'])
            features.update(technical_features)
        
        # Convert to numpy array
        feature_vector = np.array(list(features.values()))
        
        # Add text embeddings if available
        if 'text' in data:
            text_embeddings = self.extract_text_embeddings(data['text'])
            feature_vector = np.concatenate([feature_vector, text_embeddings])
        
        return feature_vector
    
    def train(self, training_data: List[Dict], labels: List[int]):
        """Train the ensemble fraud classifier"""
        logger.info(f"Training fraud classifier with {len(training_data)} samples")
        
        # Initialize NLP model
        self.initialize_nlp_model()
        
        # Prepare features
        X = np.array([self.prepare_features(data) for data in training_data])
        y = np.array(labels)
        
        # Store feature dimension
        self.feature_dim = X.shape[1]
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Train traditional ML models
        logger.info("Training Isolation Forest...")
        self.isolation_forest.fit(X_scaled[y == 0])  # Train only on normal samples
        
        logger.info("Training Random Forest...")
        self.random_forest.fit(X_scaled, y)
        
        # Train neural network
        logger.info("Training Neural Network...")
        self.neural_net = EnsembleFraudClassifier(self.feature_dim)
        self._train_neural_net(X_scaled, y)
        
        self.is_trained = True
        logger.info("Fraud classifier training completed")
    
    def _train_neural_net(self, X: np.ndarray, y: np.ndarray, epochs: int = 100):
        """Train the neural network component"""
        X_tensor = torch.FloatTensor(X)
        y_tensor = torch.LongTensor(y)
        
        optimizer = torch.optim.Adam(self.neural_net.parameters(), lr=0.001, weight_decay=1e-5)
        criterion = nn.CrossEntropyLoss()
        
        self.neural_net.train()
        
        for epoch in range(epochs):
            optimizer.zero_grad()
            logits, _ = self.neural_net(X_tensor)
            loss = criterion(logits, y_tensor)
            loss.backward()
            optimizer.step()
            
            if epoch % 20 == 0:
                logger.info(f"Neural net training epoch {epoch}, loss: {loss.item():.4f}")
        
        self.neural_net.eval()
    
    def predict(self, data: Dict) -> FraudPredictionResult:
        """Predict fraud probability for given data"""
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        # Prepare features
        feature_vector = self.prepare_features(data)
        X = feature_vector.reshape(1, -1)
        X_scaled = self.scaler.transform(X)
        
        # Get predictions from all models
        model_predictions = {}
        
        # Isolation Forest (anomaly detection)
        iso_pred = self.isolation_forest.predict(X_scaled)[0]
        iso_score = self.isolation_forest.score_samples(X_scaled)[0]
        model_predictions['isolation_forest'] = float(1 if iso_pred == -1 else 0)
        
        # Random Forest
        rf_prob = self.random_forest.predict_proba(X_scaled)[0]
        model_predictions['random_forest'] = float(rf_prob[1])  # Probability of fraud class
        
        # Neural Network
        X_tensor = torch.FloatTensor(X_scaled)
        with torch.no_grad():
            _, nn_prob = self.neural_net(X_tensor)
            model_predictions['neural_network'] = float(nn_prob[0][1])
        
        # Ensemble prediction (weighted average)
        weights = {'isolation_forest': 0.2, 'random_forest': 0.4, 'neural_network': 0.4}
        fraud_probability = sum(model_predictions[model] * weights[model] 
                              for model in model_predictions.keys())
        
        # Determine if fraud based on threshold
        fraud_threshold = 0.5
        is_fraud = fraud_probability > fraud_threshold
        
        # Calculate confidence (distance from threshold)
        confidence = abs(fraud_probability - fraud_threshold) * 2
        confidence = min(confidence, 1.0)
        
        # Extract risk factors
        risk_factors = self._extract_risk_factors(data, fraud_probability)
        
        # Generate explanation
        explanation = self._generate_explanation(model_predictions, risk_factors, is_fraud)
        
        # Calculate individual risk scores
        risk_scores = self._calculate_risk_scores(data)
        
        return FraudPredictionResult(
            is_fraud=is_fraud,
            confidence=confidence,
            fraud_probability=fraud_probability,
            risk_factors=risk_factors,
            risk_scores=risk_scores,
            model_predictions=model_predictions,
            explanation=explanation
        )
    
    def _extract_risk_factors(self, data: Dict, fraud_prob: float) -> List[str]:
        """Extract specific risk factors that contributed to the fraud prediction"""
        risk_factors = []
        
        # Text-based risk factors
        if 'text' in data and data['text']:
            text_features = self.feature_extractor.extract_text_features(data['text'])
            if text_features.get('text_guarantee_score', 0) > 0.3:
                risk_factors.append("Unrealistic guarantee claims detected")
            if text_features.get('text_urgency_score', 0) > 0.4:
                risk_factors.append("High-pressure urgency tactics identified")
            if text_features.get('text_keyword_score', 0) > 0.5:
                risk_factors.append("Multiple fraud-related keywords found")
        
        # Advisor-specific risk factors
        if 'advisorData' in data:
            advisor_data = data['advisorData']
            if not advisor_data.get('sebiValid', True):
                risk_factors.append("Invalid or expired SEBI registration")
            if advisor_data.get('complianceIssues', []):
                risk_factors.append("Previous compliance violations found")
            if advisor_data.get('socialSentiment', {}).get('negative', 0) > 0.7:
                risk_factors.append("Negative social media sentiment")
        
        # Social media risk factors
        if 'socialData' in data:
            social_data = data['socialData']
            if social_data.get('platform') in ['TELEGRAM', 'WHATSAPP']:
                risk_factors.append("Content from high-risk platform")
            if social_data.get('userCredibility', 1.0) < 0.3:
                risk_factors.append("Low credibility source")
        
        # Financial risk factors
        if 'financialData' in data:
            financial_data = data['financialData']
            if financial_data.get('promisedReturns', 0) > 25:
                risk_factors.append("Unrealistic return promises")
            if financial_data.get('minInvestment', 0) > 500000:
                risk_factors.append("Unusually high minimum investment")
        
        # Technical risk factors
        if 'technicalData' in data:
            tech_data = data['technicalData']
            if not tech_data.get('sslValid', True):
                risk_factors.append("Invalid SSL certificate")
            if tech_data.get('domainAgeDays', 365) < 90:
                risk_factors.append("Very new domain registration")
        
        return risk_factors
    
    def _calculate_risk_scores(self, data: Dict) -> Dict[str, float]:
        """Calculate risk scores for different categories"""
        risk_scores = {
            'text_risk': 0.0,
            'advisor_risk': 0.0,
            'social_risk': 0.0,
            'financial_risk': 0.0,
            'technical_risk': 0.0
        }
        
        if 'text' in data:
            text_features = self.feature_extractor.extract_text_features(data['text'])
            risk_scores['text_risk'] = np.mean(list(text_features.values()))
        
        if 'advisorData' in data:
            advisor_features = self.feature_extractor.extract_advisor_features(data['advisorData'])
            risk_scores['advisor_risk'] = np.mean(list(advisor_features.values()))
        
        if 'socialData' in data:
            social_features = self.feature_extractor.extract_social_media_features(data['socialData'])
            risk_scores['social_risk'] = np.mean(list(social_features.values()))
        
        if 'financialData' in data:
            financial_features = self.feature_extractor.extract_financial_features(data['financialData'])
            risk_scores['financial_risk'] = np.mean(list(financial_features.values()))
        
        if 'technicalData' in data:
            technical_features = self.feature_extractor.extract_technical_features(data['technicalData'])
            risk_scores['technical_risk'] = np.mean(list(technical_features.values()))
        
        return risk_scores
    
    def _generate_explanation(self, model_predictions: Dict, risk_factors: List[str], is_fraud: bool) -> str:
        """Generate human-readable explanation of the prediction"""
        if is_fraud:
            explanation = "HIGH FRAUD RISK DETECTED. "
        else:
            explanation = "Low fraud risk. "
        
        # Add model consensus information
        fraud_votes = sum(1 for pred in model_predictions.values() if pred > 0.5)
        total_models = len(model_predictions)
        
        explanation += f"Model consensus: {fraud_votes}/{total_models} models indicate fraud risk. "
        
        # Add top risk factors
        if risk_factors:
            top_factors = risk_factors[:3]  # Top 3 risk factors
            explanation += f"Primary concerns: {'; '.join(top_factors)}. "
        
        # Add recommendation
        if is_fraud:
            explanation += "RECOMMENDATION: Avoid this investment opportunity and report if encountered."
        else:
            explanation += "RECOMMENDATION: Proceed with standard due diligence."
        
        return explanation
    
    def save_model(self, path: str):
        """Save the trained model"""
        if not self.is_trained:
            raise ValueError("No trained model to save")
        
        model_data = {
            'scaler': self.scaler,
            'isolation_forest': self.isolation_forest,
            'random_forest': self.random_forest,
            'neural_net_state': self.neural_net.state_dict() if self.neural_net else None,
            'feature_dim': self.feature_dim,
            'is_trained': self.is_trained
        }
        
        joblib.dump(model_data, path)
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """Load a trained model"""
        try:
            model_data = joblib.load(path)
            
            self.scaler = model_data['scaler']
            self.isolation_forest = model_data['isolation_forest']
            self.random_forest = model_data['random_forest']
            self.feature_dim = model_data['feature_dim']
            self.is_trained = model_data['is_trained']
            
            if model_data['neural_net_state'] and self.feature_dim:
                self.neural_net = EnsembleFraudClassifier(self.feature_dim)
                self.neural_net.load_state_dict(model_data['neural_net_state'])
                self.neural_net.eval()
            
            # Initialize NLP model
            self.initialize_nlp_model()
            
            logger.info(f"Model loaded from {path}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def evaluate_model(self, test_data: List[Dict], test_labels: List[int]) -> Dict[str, float]:
        """Evaluate model performance on test data"""
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        predictions = []
        probabilities = []
        
        for data in test_data:
            result = self.predict(data)
            predictions.append(1 if result.is_fraud else 0)
            probabilities.append(result.fraud_probability)
        
        # Calculate metrics
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
        
        accuracy = accuracy_score(test_labels, predictions)
        precision = precision_score(test_labels, predictions)
        recall = recall_score(test_labels, predictions)
        f1 = f1_score(test_labels, predictions)
        auc = roc_auc_score(test_labels, probabilities)
        
        metrics = {
            'accuracy': accuracy,
            'precision': precision,
            'recall': recall,
            'f1_score': f1,
            'auc_roc': auc
        }
        
        logger.info(f"Model evaluation results: {metrics}")
        return metrics
