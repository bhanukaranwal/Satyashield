import { FraudAlert, AlertType, AlertSeverity, AlertStatus } from '../models/FraudAlert'
import { User } from '../models/User'
import { Types } from 'mongoose'
import axios from 'axios'
import { logger } from '../middleware/logger'
import redisClient from '../config/redis'
import { WebSocketService } from './websocketService'

export interface FraudAnalysisResult {
  riskScore: number
  alertType: AlertType
  severity: AlertSeverity
  threats: FraudThreat[]
  recommendations: string[]
  confidence: number
}

export interface FraudThreat {
  type: string
  description: string
  severity: number
  evidence: any[]
  mitigationSteps: string[]
}

export class FraudDetectionService {
  private static instance: FraudDetectionService
  private aiEngineUrl: string
  private webSocketService: WebSocketService

  constructor() {
    this.aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000'
    this.webSocketService = WebSocketService.getInstance()
  }

  static getInstance(): FraudDetectionService {
    if (!FraudDetectionService.instance) {
      FraudDetectionService.instance = new FraudDetectionService()
    }
    return FraudDetectionService.instance
  }

  async analyzeAdvisorFraud(advisorData: any): Promise<FraudAnalysisResult> {
    try {
      logger.info('Analyzing advisor fraud', { advisorName: advisorData.name })

      const analysis: FraudAnalysisResult = {
        riskScore: 0,
        alertType: AlertType.ADVISOR_FRAUD,
        severity: AlertSeverity.LOW,
        threats: [],
        recommendations: [],
        confidence: 0
      }

      // Check SEBI registration status
      const sebiVerification = await this.verifySebiRegistration(advisorData.sebiRegNumber)
      if (!sebiVerification.isValid) {
        analysis.threats.push({
          type: 'INVALID_SEBI_REGISTRATION',
          description: 'Advisor does not have valid SEBI registration',
          severity: 40,
          evidence: [sebiVerification],
          mitigationSteps: ['Verify SEBI registration independently', 'Contact SEBI directly']
        })
        analysis.riskScore += 40
      }

      // Analyze suspicious claims
      const suspiciousClaims = this.detectSuspiciousClaims(advisorData.marketingContent || '')
      if (suspiciousClaims.length > 0) {
        analysis.threats.push({
          type: 'SUSPICIOUS_CLAIMS',
          description: `Found ${suspiciousClaims.length} suspicious investment claims`,
          severity: 30,
          evidence: suspiciousClaims,
          mitigationSteps: ['Verify all claims independently', 'Request documented proof']
        })
        analysis.riskScore += suspiciousClaims.length * 10
      }

      // Check historical compliance
      const complianceIssues = await this.checkComplianceHistory(advisorData.sebiRegNumber)
      if (complianceIssues.length > 0) {
        analysis.threats.push({
          type: 'COMPLIANCE_VIOLATIONS',
          description: `Found ${complianceIssues.length} compliance violations`,
          severity: 25,
          evidence: complianceIssues,
          mitigationSteps: ['Review compliance history', 'Consider alternative advisor']
        })
        analysis.riskScore += complianceIssues.length * 15
      }

      // Social media sentiment analysis
      const socialAnalysis = await this.analyzeSocialMediaPresence(advisorData.name)
      if (socialAnalysis.negativeScore > 0.7) {
        analysis.threats.push({
          type: 'NEGATIVE_SOCIAL_SENTIMENT',
          description: 'High negative sentiment in social media mentions',
          severity: 20,
          evidence: [socialAnalysis],
          mitigationSteps: ['Research online reviews', 'Check investor complaints']
        })
        analysis.riskScore += 20
      }

      // Determine severity based on risk score
      if (analysis.riskScore >= 80) {
        analysis.severity = AlertSeverity.CRITICAL
      } else if (analysis.riskScore >= 60) {
        analysis.severity = AlertSeverity.HIGH
      } else if (analysis.riskScore >= 40) {
        analysis.severity = AlertSeverity.MEDIUM
      }

      analysis.confidence = Math.min(95, 60 + (analysis.threats.length * 10))

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis)

      logger.info('Advisor fraud analysis completed', {
        riskScore: analysis.riskScore,
        threatsCount: analysis.threats.length
      })

      return analysis

    } catch (error) {
      logger.error('Error in advisor fraud analysis', error)
      throw new Error('Failed to analyze advisor fraud')
    }
  }

  async analyzeSocialMediaFraud(socialData: any): Promise<FraudAnalysisResult> {
    try {
      logger.info('Analyzing social media fraud', { platform: socialData.platform })

      const analysis: FraudAnalysisResult = {
        riskScore: 0,
        alertType: AlertType.SOCIAL_MEDIA_SCAM,
        severity: AlertSeverity.LOW,
        threats: [],
        recommendations: [],
        confidence: 0
      }

      // Analyze content using AI
      const aiAnalysis = await this.callAIEngine('/api/v1/fraud/analyze-social', socialData)
      
      if (aiAnalysis.fraudProbability > 0.7) {
        analysis.threats.push({
          type: 'HIGH_FRAUD_PROBABILITY',
          description: 'AI model indicates high probability of fraudulent content',
          severity: 35,
          evidence: [aiAnalysis],
          mitigationSteps: ['Verify all claims independently', 'Report suspicious content']
        })
        analysis.riskScore += 35
      }

      // Check for pump-and-dump patterns
      const pumpDumpScore = this.detectPumpAndDump(socialData.content)
      if (pumpDumpScore > 0.6) {
        analysis.threats.push({
          type: 'PUMP_AND_DUMP_PATTERN',
          description: 'Content matches pump-and-dump scheme patterns',
          severity: 40,
          evidence: [{ score: pumpDumpScore, patterns: socialData.detectedPatterns }],
          mitigationSteps: ['Do not invest based on social media tips', 'Research independently']
        })
        analysis.riskScore += 40
      }

      // Analyze user credibility
      const credibilityScore = await this.analyzeUserCredibility(socialData.authorId)
      if (credibilityScore < 0.3) {
        analysis.threats.push({
          type: 'LOW_CREDIBILITY_SOURCE',
          description: 'Content from low-credibility or suspicious account',
          severity: 25,
          evidence: [{ credibilityScore, userAnalysis: credibilityScore }],
          mitigationSteps: ['Verify source credibility', 'Check account history']
        })
        analysis.riskScore += 25
      }

      // Check for coordinated manipulation
      const coordinationScore = await this.detectCoordinatedManipulation(socialData)
      if (coordinationScore > 0.5) {
        analysis.threats.push({
          type: 'COORDINATED_MANIPULATION',
          description: 'Content appears to be part of coordinated manipulation campaign',
          severity: 30,
          evidence: [{ coordinationScore }],
          mitigationSteps: ['Report coordinated manipulation', 'Ignore coordinated campaigns']
        })
        analysis.riskScore += 30
      }

      // Determine severity
      if (analysis.riskScore >= 80) {
        analysis.severity = AlertSeverity.CRITICAL
      } else if (analysis.riskScore >= 60) {
        analysis.severity = AlertSeverity.HIGH
      } else if (analysis.riskScore >= 40) {
        analysis.severity = AlertSeverity.MEDIUM
      }

      analysis.confidence = Math.min(95, 50 + (analysis.threats.length * 15))
      analysis.recommendations = this.generateRecommendations(analysis)

      return analysis

    } catch (error) {
      logger.error('Error in social media fraud analysis', error)
      throw new Error('Failed to analyze social media fraud')
    }
  }

  async analyzeDeepfake(mediaData: any): Promise<FraudAnalysisResult> {
    try {
      logger.info('Analyzing deepfake content', { fileType: mediaData.fileType })

      const analysis: FraudAnalysisResult = {
        riskScore: 0,
        alertType: AlertType.DEEPFAKE_DETECTED,
        severity: AlertSeverity.LOW,
        threats: [],
        recommendations: [],
        confidence: 0
      }

      // Call AI engine for deepfake detection
      const deepfakeAnalysis = await this.callAIEngine('/api/v1/deepfake/analyze', {
        file: mediaData.filePath,
        analysisType: mediaData.fileType
      })

      if (deepfakeAnalysis.isDeepfake && deepfakeAnalysis.confidence > 0.8) {
        analysis.threats.push({
          type: 'DEEPFAKE_DETECTED',
          description: `High confidence deepfake detection (${(deepfakeAnalysis.confidence * 100).toFixed(1)}%)`,
          severity: 45,
          evidence: [deepfakeAnalysis],
          mitigationSteps: ['Do not trust manipulated media', 'Verify through official sources']
        })
        analysis.riskScore = deepfakeAnalysis.confidence * 100
      }

      // Analyze technical anomalies
      if (deepfakeAnalysis.anomalies && deepfakeAnalysis.anomalies.length > 0) {
        analysis.threats.push({
          type: 'TECHNICAL_ANOMALIES',
          description: `Detected ${deepfakeAnalysis.anomalies.length} technical anomalies`,
          severity: 20,
          evidence: deepfakeAnalysis.anomalies,
          mitigationSteps: ['Examine media carefully', 'Look for inconsistencies']
        })
        analysis.riskScore += deepfakeAnalysis.anomalies.length * 5
      }

      // Check metadata authenticity
      const metadataAnalysis = this.analyzeMediaMetadata(mediaData.metadata)
      if (metadataAnalysis.suspicious) {
        analysis.threats.push({
          type: 'SUSPICIOUS_METADATA',
          description: 'Media metadata shows signs of manipulation',
          severity: 15,
          evidence: [metadataAnalysis],
          mitigationSteps: ['Verify original source', 'Check creation timestamp']
        })
        analysis.riskScore += 15
      }

      // Determine severity
      if (analysis.riskScore >= 85) {
        analysis.severity = AlertSeverity.CRITICAL
      } else if (analysis.riskScore >= 70) {
        analysis.severity = AlertSeverity.HIGH
      } else if (analysis.riskScore >= 50) {
        analysis.severity = AlertSeverity.MEDIUM
      }

      analysis.confidence = Math.min(98, deepfakeAnalysis.confidence * 100)
      analysis.recommendations = this.generateRecommendations(analysis)

      return analysis

    } catch (error) {
      logger.error('Error in deepfake analysis', error)
      throw new Error('Failed to analyze deepfake content')
    }
  }

  async createFraudAlert(
    userId: Types.ObjectId,
    analysisResult: FraudAnalysisResult,
    evidenceData: any
  ): Promise<FraudAlert> {
    try {
      const alert = new FraudAlert({
        userId,
        alertType: analysisResult.alertType,
        severity: analysisResult.severity,
        title: this.generateAlertTitle(analysisResult),
        description: this.generateAlertDescription(analysisResult),
        riskScore: analysisResult.riskScore,
        status: AlertStatus.ACTIVE,
        detectionTime: new Date(),
        evidenceData: {
          ...evidenceData,
          threats: analysisResult.threats,
          recommendations: analysisResult.recommendations,
          confidence: analysisResult.confidence
        }
      })

      await alert.save()

      // Cache alert for quick access
      await redisClient.set(
        `alert:${alert._id}`,
        JSON.stringify(alert),
        3600 // 1 hour TTL
      )

      // Send real-time notification
      await this.webSocketService.broadcastAlert(alert)

      // Send email/SMS notification for high-severity alerts
      if (analysisResult.severity === AlertSeverity.CRITICAL || analysisResult.severity === AlertSeverity.HIGH) {
        await this.sendCriticalAlertNotification(userId, alert)
      }

      logger.info('Fraud alert created', { alertId: alert._id, riskScore: analysisResult.riskScore })

      return alert

    } catch (error) {
      logger.error('Error creating fraud alert', error)
      throw new Error('Failed to create fraud alert')
    }
  }

  private async verifySebiRegistration(sebiRegNumber: string): Promise<any> {
    try {
      if (!sebiRegNumber) {
        return { isValid: false, reason: 'No SEBI registration number provided' }
      }

      // Call SEBI API (mock implementation)
      const response = await axios.get(`${process.env.SEBI_API_URL}/verify/${sebiRegNumber}`, {
        timeout: 10000,
        headers: {
          'Authorization': `Bearer ${process.env.SEBI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      })

      return {
        isValid: response.data.status === 'ACTIVE',
        registrationDate: response.data.registrationDate,
        expiryDate: response.data.expiryDate,
        licenseType: response.data.licenseType,
        status: response.data.status
      }

    } catch (error) {
      logger.warn('SEBI verification failed', { sebiRegNumber, error: error.message })
      return { isValid: false, reason: 'SEBI verification service unavailable' }
    }
  }

  private detectSuspiciousClaims(content: string): string[] {
    const suspiciousPatterns = [
      /guaranteed\s+returns?/gi,
      /risk[\s-]*free\s+investment/gi,
      /double\s+your\s+money/gi,
      /100%\s+profit/gi,
      /insider\s+information/gi,
      /secret\s+strategy/gi,
      /no\s+risk\s+guaranteed/gi,
      /sure\s+shot\s+profit/gi,
      /get\s+rich\s+quick/gi,
      /instant\s+profit/gi,
      /limited\s+time\s+offer/gi,
      /exclusive\s+deal/gi
    ]

    const foundClaims: string[] = []
    
    suspiciousPatterns.forEach(pattern => {
      const matches = content.match(pattern)
      if (matches) {
        foundClaims.push(...matches)
      }
    })

    return foundClaims
  }

  private async checkComplianceHistory(sebiRegNumber: string): Promise<any[]> {
    try {
      // Mock implementation - in reality, this would call SEBI compliance API
      const cachedHistory = await redisClient.get(`compliance:${sebiRegNumber}`)
      if (cachedHistory) {
        return JSON.parse(cachedHistory)
      }

      // Simulate API call
      const complianceIssues: any[] = []
      
      // Cache for 1 hour
      await redisClient.set(
        `compliance:${sebiRegNumber}`,
        JSON.stringify(complianceIssues),
        3600
      )

      return complianceIssues

    } catch (error) {
      logger.warn('Compliance history check failed', { sebiRegNumber })
      return []
    }
  }

  private async analyzeSocialMediaPresence(advisorName: string): Promise<any> {
    try {
      // Call AI engine for sentiment analysis
      const response = await this.callAIEngine('/api/v1/sentiment/analyze', {
        query: advisorName,
        sources: ['twitter', 'reddit', 'news']
      })

      return {
        positiveScore: response.sentiment.positive || 0,
        negativeScore: response.sentiment.negative || 0,
        neutralScore: response.sentiment.neutral || 0,
        mentionCount: response.mentions || 0,
        credibilityScore: response.credibility || 0.5
      }

    } catch (error) {
      logger.warn('Social media analysis failed', { advisorName })
      return { positiveScore: 0.5, negativeScore: 0.3, neutralScore: 0.2 }
    }
  }

  private detectPumpAndDump(content: string): number {
    const pumpPatterns = [
      /buy\s+now/gi,
      /price\s+will\s+explode/gi,
      /going\s+to\s+moon/gi,
      /don't\s+miss\s+out/gi,
      /last\s+chance/gi,
      /act\s+fast/gi,
      /limited\s+seats/gi,
      /urgent/gi,
      /rocket\s*🚀/gi,
      /to\s+the\s+moon/gi
    ]

    const dumpPatterns = [
      /sell\s+everything/gi,
      /get\s+out\s+now/gi,
      /crash\s+coming/gi,
      /dump\s+before/gi
    ]

    const pumpMatches = pumpPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern)
      return count + (matches ? matches.length : 0)
    }, 0)

    const dumpMatches = dumpPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern)
      return count + (matches ? matches.length : 0)
    }, 0)

    // Calculate score based on pattern matches
    const totalPatterns = pumpMatches + dumpMatches
    return Math.min(1, totalPatterns * 0.2)
  }

  private async analyzeUserCredibility(userId: string): Promise<number> {
    try {
      // Check user history, verification status, follower count, etc.
      const cachedScore = await redisClient.get(`credibility:${userId}`)
      if (cachedScore) {
        return parseFloat(cachedScore)
      }

      // Mock credibility analysis
      let credibilityScore = 0.5

      // Factors that increase credibility
      // - Verified account: +0.3
      // - High follower count: +0.2
      // - Long account history: +0.2
      // - Professional profile: +0.1

      // Factors that decrease credibility
      // - New account: -0.3
      // - No profile picture: -0.1
      // - Suspicious posting patterns: -0.2

      // Cache for 24 hours
      await redisClient.set(`credibility:${userId}`, credibilityScore.toString(), 86400)

      return credibilityScore

    } catch (error) {
      logger.warn('User credibility analysis failed', { userId })
      return 0.5 // Default neutral score
    }
  }

  private async detectCoordinatedManipulation(socialData: any): Promise<number> {
    try {
      // Analyze patterns that suggest coordinated manipulation:
      // - Multiple accounts posting similar content
      // - Synchronized posting times
      // - Similar language patterns
      // - Bot-like behavior

      const response = await this.callAIEngine('/api/v1/coordination/detect', {
        content: socialData.content,
        authorId: socialData.authorId,
        timestamp: socialData.timestamp,
        platform: socialData.platform
      })

      return response.coordinationScore || 0

    } catch (error) {
      logger.warn('Coordination detection failed', { socialData: socialData.authorId })
      return 0
    }
  }

  private analyzeMediaMetadata(metadata: any): any {
    const suspicious = {
      suspicious: false,
      reasons: []
    }

    if (!metadata) {
      return suspicious
    }

    // Check for missing or suspicious metadata
    if (!metadata.creationDate) {
      suspicious.suspicious = true
      suspicious.reasons.push('Missing creation date')
    }

    if (metadata.software && metadata.software.includes('deepfake')) {
      suspicious.suspicious = true
      suspicious.reasons.push('Suspicious creation software detected')
    }

    // Check for timeline inconsistencies
    if (metadata.creationDate && metadata.modificationDate) {
      const created = new Date(metadata.creationDate)
      const modified = new Date(metadata.modificationDate)
      
      if (modified < created) {
        suspicious.suspicious = true
        suspicious.reasons.push('Modification date is before creation date')
      }
    }

    return suspicious
  }

  private generateAlertTitle(analysis: FraudAnalysisResult): string {
    const titles = {
      [AlertType.ADVISOR_FRAUD]: 'Suspicious Investment Advisor Detected',
      [AlertType.DEEPFAKE_DETECTED]: 'Deepfake Content Identified',
      [AlertType.SOCIAL_MEDIA_SCAM]: 'Social Media Fraud Pattern Detected',
      [AlertType.FAKE_IPO]: 'Potentially Fraudulent IPO Detected',
      [AlertType.TRADING_APP_FRAUD]: 'Suspicious Trading Application',
      [AlertType.CORPORATE_ANNOUNCEMENT_FRAUD]: 'Questionable Corporate Announcement',
      [AlertType.SUSPICIOUS_ACTIVITY]: 'Suspicious Financial Activity'
    }

    return titles[analysis.alertType] || 'Fraud Alert'
  }

  private generateAlertDescription(analysis: FraudAnalysisResult): string {
    const mainThreats = analysis.threats
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 3)
      .map(threat => threat.description)
      .join('. ')

    return `Risk Score: ${analysis.riskScore}%. ${mainThreats}. Please review the evidence and take appropriate action.`
  }

  private generateRecommendations(analysis: FraudAnalysisResult): string[] {
    const recommendations: string[] = []

    if (analysis.riskScore >= 80) {
      recommendations.push('IMMEDIATE ACTION REQUIRED: Do not proceed with any transactions')
      recommendations.push('Report this incident to relevant authorities (SEBI, Cyber Crime)')
      recommendations.push('Block/avoid all communication with the flagged entity')
    } else if (analysis.riskScore >= 60) {
      recommendations.push('Exercise extreme caution before proceeding')
      recommendations.push('Verify all information through independent sources')
      recommendations.push('Consider seeking professional financial advice')
    } else if (analysis.riskScore >= 40) {
      recommendations.push('Conduct additional due diligence')
      recommendations.push('Verify credentials and registrations independently')
      recommendations.push('Monitor for additional red flags')
    }

    // Add specific recommendations based on threat types
    analysis.threats.forEach(threat => {
      recommendations.push(...threat.mitigationSteps)
    })

    return [...new Set(recommendations)] // Remove duplicates
  }

  private async callAIEngine(endpoint: string, data: any): Promise<any> {
    try {
      const response = await axios.post(`${this.aiEngineUrl}${endpoint}`, data, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AI_ENGINE_API_KEY}`
        }
      })

      return response.data
    } catch (error) {
      logger.error('AI Engine call failed', { endpoint, error: error.message })
      throw new Error(`AI Engine call failed: ${error.message}`)
    }
  }

  private async sendCriticalAlertNotification(userId: Types.ObjectId, alert: FraudAlert): Promise<void> {
    try {
      const user = await User.findById(userId)
      if (!user) return

      // Send email notification
      if (user.preferences.notifications.email.fraudAlerts) {
        // Email notification logic would go here
        logger.info('Critical alert email sent', { userId, alertId: alert._id })
      }

      // Send SMS notification
      if (user.preferences.notifications.sms.criticalAlerts && user.phoneNumber) {
        // SMS notification logic would go here
        logger.info('Critical alert SMS sent', { userId, alertId: alert._id })
      }

    } catch (error) {
      logger.error('Failed to send critical alert notification', error)
    }
  }
}

export default FraudDetectionService.getInstance()
