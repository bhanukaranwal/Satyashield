import numpy as np
import cv2
import tensorflow as tf
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Tuple, Optional
import logging
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class DeepfakeResult:
    is_deepfake: bool
    confidence: float
    frame_level_results: List[Dict]
    audio_result: Optional[Dict] = None
    processing_time: float = 0.0
    anomalies: List[str] = None

class FaceXRayNet(nn.Module):
    """Advanced deepfake detection model using FaceX-ray architecture"""
    
    def __init__(self, num_classes=2):
        super(FaceXRayNet, self).__init__()
        
        # Encoder (Feature Extraction)
        self.encoder = nn.Sequential(
            # Block 1
            nn.Conv2d(3, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
            
            # Block 2
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
            
            # Block 3
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
            
            # Block 4
            nn.Conv2d(256, 512, kernel_size=3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.Conv2d(512, 512, kernel_size=3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.Conv2d(512, 512, kernel_size=3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )
        
        # Attention mechanism
        self.attention = nn.Sequential(
            nn.Conv2d(512, 256, kernel_size=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 1, kernel_size=1),
            nn.Sigmoid()
        )
        
        # Global Average Pooling
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))
        
        # Classifier
        self.classifier = nn.Sequential(
            nn.Linear(512, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes)
        )
        
    def forward(self, x):
        # Extract features
        features = self.encoder(x)
        
        # Apply attention
        attention_weights = self.attention(features)
        attended_features = features * attention_weights
        
        # Global pooling
        pooled = self.global_pool(attended_features)
        pooled = pooled.view(pooled.size(0), -1)
        
        # Classification
        output = self.classifier(pooled)
        
        return output, attention_weights

class TemporalConsistencyAnalyzer:
    """Analyzes temporal consistency across video frames"""
    
    def __init__(self, window_size=5):
        self.window_size = window_size
        self.frame_buffer = []
        
    def analyze_consistency(self, frames: List[np.ndarray]) -> Dict:
        """Analyze temporal consistency across frames"""
        consistency_scores = []
        optical_flows = []
        
        for i in range(1, len(frames)):
            # Calculate optical flow
            flow = cv2.calcOpticalFlowPyrLK(
                cv2.cvtColor(frames[i-1], cv2.COLOR_BGR2GRAY),
                cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY),
                None, None
            )
            
            if flow[0] is not None:
                optical_flows.append(flow)
                
                # Calculate consistency score based on flow patterns
                flow_magnitude = np.sqrt(flow[0][:, :, 0]**2 + flow[0][:, :, 1]**2)
                consistency_score = 1.0 - np.std(flow_magnitude) / np.mean(flow_magnitude)
                consistency_scores.append(max(0, consistency_score))
        
        avg_consistency = np.mean(consistency_scores) if consistency_scores else 0.0
        
        return {
            "consistency_score": avg_consistency,
            "anomalies": self._detect_anomalies(consistency_scores),
            "flow_patterns": self._analyze_flow_patterns(optical_flows)
        }
    
    def _detect_anomalies(self, scores: List[float]) -> List[str]:
        """Detect anomalies in consistency scores"""
        anomalies = []
        
        if not scores:
            return anomalies
            
        mean_score = np.mean(scores)
        std_score = np.std(scores)
        
        # Detect sudden drops in consistency
        for i, score in enumerate(scores):
            if score < mean_score - 2 * std_score:
                anomalies.append(f"Sudden consistency drop at frame {i}")
        
        # Detect overall low consistency
        if mean_score < 0.3:
            anomalies.append("Overall low temporal consistency")
            
        return anomalies
    
    def _analyze_flow_patterns(self, flows: List) -> Dict:
        """Analyze optical flow patterns for anomalies"""
        if not flows:
            return {"pattern_score": 0.0, "anomalies": []}
        
        # Analyze flow smoothness and patterns
        pattern_scores = []
        
        for flow in flows:
            if flow[0] is not None:
                # Calculate flow smoothness
                dx = flow[0][:, :, 0]
                dy = flow[0][:, :, 1]
                
                # Smoothness based on gradient
                dx_grad = np.gradient(dx)
                dy_grad = np.gradient(dy)
                
                smoothness = 1.0 / (1.0 + np.mean(np.abs(dx_grad[0]) + np.abs(dx_grad[1]) + 
                                                 np.abs(dy_grad[0]) + np.abs(dy_grad[1])))
                pattern_scores.append(smoothness)
        
        avg_pattern_score = np.mean(pattern_scores) if pattern_scores else 0.0
        
        return {
            "pattern_score": avg_pattern_score,
            "anomalies": ["Erratic motion patterns detected"] if avg_pattern_score < 0.4 else []
        }

class DeepfakeDetector:
    """Main deepfake detection class"""
    
    def __init__(self, model_path: str, device: str = "cpu"):
        self.device = torch.device(device)
        self.model = None
        self.temporal_analyzer = TemporalConsistencyAnalyzer()
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        # Load model
        self._load_model(model_path)
        
    def _load_model(self, model_path: str):
        """Load the deepfake detection model"""
        try:
            self.model = FaceXRayNet(num_classes=2)
            
            # Load weights if available
            try:
                checkpoint = torch.load(model_path, map_location=self.device)
                self.model.load_state_dict(checkpoint['model_state_dict'])
                logger.info(f"Loaded deepfake model from {model_path}")
            except FileNotFoundError:
                logger.warning(f"Model file not found at {model_path}, using untrained model")
            
            self.model.to(self.device)
            self.model.eval()
            
        except Exception as e:
            logger.error(f"Failed to load deepfake model: {e}")
            raise
    
    def preprocess_frame(self, frame: np.ndarray) -> torch.Tensor:
        """Preprocess a single frame for model input"""
        # Resize to model input size
        frame_resized = cv2.resize(frame, (224, 224))
        
        # Normalize
        frame_normalized = frame_resized.astype(np.float32) / 255.0
        
        # Convert to tensor
        frame_tensor = torch.from_numpy(frame_normalized).permute(2, 0, 1).unsqueeze(0)
        
        return frame_tensor.to(self.device)
    
    def detect_faces(self, frame: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """Detect faces in frame"""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_detector.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )
        return faces
    
    def analyze_frame(self, frame: np.ndarray) -> Dict:
        """Analyze a single frame for deepfake indicators"""
        start_time = time.time()
        
        try:
            # Detect faces
            faces = self.detect_faces(frame)
            
            if len(faces) == 0:
                return {
                    "has_faces": False,
                    "is_deepfake": False,
                    "confidence": 0.0,
                    "processing_time": time.time() - start_time
                }
            
            frame_results = []
            
            for (x, y, w, h) in faces:
                # Extract face region
                face_region = frame[y:y+h, x:x+w]
                
                # Preprocess
                face_tensor = self.preprocess_frame(face_region)
                
                # Model inference
                with torch.no_grad():
                    output, attention = self.model(face_tensor)
                    probabilities = F.softmax(output, dim=1)
                    
                    deepfake_prob = probabilities[0][1].item()
                    is_deepfake = deepfake_prob > 0.5
                    
                frame_results.append({
                    "bbox": (x, y, w, h),
                    "is_deepfake": is_deepfake,
                    "confidence": deepfake_prob,
                    "attention_map": attention.cpu().numpy() if attention is not None else None
                })
            
            # Aggregate results
            avg_confidence = np.mean([r["confidence"] for r in frame_results])
            is_deepfake = avg_confidence > 0.5
            
            return {
                "has_faces": True,
                "is_deepfake": is_deepfake,
                "confidence": avg_confidence,
                "faces": frame_results,
                "processing_time": time.time() - start_time
            }
            
        except Exception as e:
            logger.error(f"Error analyzing frame: {e}")
            return {
                "has_faces": False,
                "is_deepfake": False,
                "confidence": 0.0,
                "error": str(e),
                "processing_time": time.time() - start_time
            }
    
    def analyze_video(self, video_path: str, sample_rate: int = 5) -> DeepfakeResult:
        """Analyze a video for deepfake content"""
        start_time = time.time()
        
        try:
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                raise ValueError(f"Could not open video file: {video_path}")
            
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            frames = []
            frame_results = []
            frame_idx = 0
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Sample frames at specified rate
                if frame_idx % sample_rate == 0:
                    frames.append(frame)
                    result = self.analyze_frame(frame)
                    result["frame_number"] = frame_idx
                    result["timestamp"] = frame_idx / fps
                    frame_results.append(result)
                
                frame_idx += 1
            
            cap.release()
            
            # Temporal consistency analysis
            temporal_analysis = self.temporal_analyzer.analyze_consistency(frames)
            
            # Aggregate results
            valid_results = [r for r in frame_results if r["has_faces"]]
            
            if not valid_results:
                return DeepfakeResult(
                    is_deepfake=False,
                    confidence=0.0,
                    frame_level_results=frame_results,
                    processing_time=time.time() - start_time,
                    anomalies=["No faces detected in video"]
                )
            
            # Calculate overall confidence
            confidences = [r["confidence"] for r in valid_results]
            overall_confidence = np.mean(confidences)
            
            # Weight temporal consistency
            temporal_weight = 0.3
            final_confidence = (
                overall_confidence * (1 - temporal_weight) +
                temporal_analysis["consistency_score"] * temporal_weight
            )
            
            is_deepfake = final_confidence > 0.5
            
            # Collect anomalies
            anomalies = []
            anomalies.extend(temporal_analysis["anomalies"])
            anomalies.extend(temporal_analysis["flow_patterns"]["anomalies"])
            
            # Check for statistical anomalies
            if np.std(confidences) > 0.3:
                anomalies.append("High variance in frame-level confidence scores")
            
            if overall_confidence > 0.7 and temporal_analysis["consistency_score"] < 0.3:
                anomalies.append("High deepfake confidence with low temporal consistency")
            
            return DeepfakeResult(
                is_deepfake=is_deepfake,
                confidence=final_confidence,
                frame_level_results=frame_results,
                processing_time=time.time() - start_time,
                anomalies=anomalies
            )
            
        except Exception as e:
            logger.error(f"Error analyzing video: {e}")
            return DeepfakeResult(
                is_deepfake=False,
                confidence=0.0,
                frame_level_results=[],
                processing_time=time.time() - start_time,
                anomalies=[f"Analysis failed: {str(e)}"]
            )
    
    def analyze_image(self, image_path: str) -> DeepfakeResult:
        """Analyze a single image for deepfake content"""
        start_time = time.time()
        
        try:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not load image: {image_path}")
            
            result = self.analyze_frame(image)
            
            return DeepfakeResult(
                is_deepfake=result["is_deepfake"],
                confidence=result["confidence"],
                frame_level_results=[result],
                processing_time=time.time() - start_time,
                anomalies=[] if result["has_faces"] else ["No faces detected in image"]
            )
            
        except Exception as e:
            logger.error(f"Error analyzing image: {e}")
            return DeepfakeResult(
                is_deepfake=False,
                confidence=0.0,
                frame_level_results=[],
                processing_time=time.time() - start_time,
                anomalies=[f"Analysis failed: {str(e)}"]
            )

class AudioDeepfakeDetector:
    """Audio deepfake detection component"""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load audio deepfake detection model"""
        try:
            # Placeholder for audio model loading
            # In practice, this would load a trained audio deepfake detection model
            logger.info("Audio deepfake detector initialized")
        except Exception as e:
            logger.error(f"Failed to load audio model: {e}")
    
    def analyze_audio(self, audio_path: str) -> Dict:
        """Analyze audio for deepfake content"""
        try:
            # Placeholder for audio analysis
            # In practice, this would extract audio features and run inference
            return {
                "is_deepfake": False,
                "confidence": 0.0,
                "features": {},
                "anomalies": []
            }
        except Exception as e:
            logger.error(f"Error analyzing audio: {e}")
            return {
                "is_deepfake": False,
                "confidence": 0.0,
                "error": str(e),
                "anomalies": [f"Audio analysis failed: {str(e)}"]
            }
