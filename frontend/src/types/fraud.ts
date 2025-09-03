export interface FraudAlert {
  id: string
  userId: string
  alertType: AlertType
  severity: AlertSeverity
  title: string
  description: string
  riskScore: number
  status: AlertStatus
  detectionTime: Date
  evidenceData: EvidenceData
  investigationNotes?: string
  resolution?: string
  createdAt: Date
  updatedAt: Date
}

export enum AlertType {
  ADVISOR_FRAUD = 'ADVISOR_FRAUD',
  DEEPFAKE_DETECTED = 'DEEPFAKE_DETECTED',
  SOCIAL_MEDIA_SCAM = 'SOCIAL_MEDIA_SCAM',
  FAKE_IPO = 'FAKE_IPO',
  TRADING_APP_FRAUD = 'TRADING_APP_FRAUD',
  CORPORATE_ANNOUNCEMENT_FRAUD = 'CORPORATE_ANNOUNCEMENT_FRAUD',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

export interface EvidenceData {
  sourceUrl?: string
  screenshots?: string[]
  videos?: string[]
  socialMediaPosts?: SocialMediaPost[]
  advisorDetails?: AdvisorDetails
  tradingAppDetails?: TradingAppDetails
  documentAnalysis?: DocumentAnalysis
  metadata?: Record<string, any>
}

export interface SocialMediaPost {
  platform: 'TELEGRAM' | 'WHATSAPP' | 'TWITTER' | 'FACEBOOK' | 'INSTAGRAM'
  postId: string
  content: string
  authorId: string
  authorName: string
  timestamp: Date
  engagement: {
    likes?: number
    shares?: number
    comments?: number
    views?: number
  }
  sentimentScore: number
  fraudProbability: number
}

export interface AdvisorDetails {
  name: string
  sebiRegNumber?: string
  licenseType?: string
  registrationDate?: Date
  expiryDate?: Date
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED' | 'SUSPENDED'
  riskIndicators: string[]
  complianceHistory: ComplianceRecord[]
}

export interface ComplianceRecord {
  date: Date
  type: 'VIOLATION' | 'WARNING' | 'PENALTY' | 'SUSPENSION'
  description: string
  amount?: number
  status: 'ACTIVE' | 'RESOLVED' | 'APPEALED'
}

export interface TradingAppDetails {
  appName: string
  packageName: string
  developer: string
  version: string
  storeRating?: number
  downloadCount?: number
  brokerLicense?: string
  sslCertificate?: SSLCertificate
  similarityScore?: number
  legitimateAppName?: string
}

export interface SSLCertificate {
  issuer: string
  subject: string
  validFrom: Date
  validTo: Date
  isValid: boolean
  trustScore: number
}

export interface DocumentAnalysis {
  documentType: 'IPO_PROSPECTUS' | 'CORPORATE_ANNOUNCEMENT' | 'ADVISOR_CERTIFICATE' | 'OTHER'
  authenticity: {
    score: number
    confidence: number
    anomalies: string[]
  }
  ocrText?: string
  metadata?: {
    creationDate?: Date
    modificationDate?: Date
    author?: string
    software?: string
  }
}

export interface RiskScore {
  overall: number
  factors: {
    historicalData: number
    socialMediaSentiment: number
    regulatoryCompliance: number
    technicalAnalysis: number
    marketBehavior: number
  }
  reasoning: string[]
  lastUpdated: Date
}

export interface FraudPattern {
  id: string
  name: string
  description: string
  category: AlertType
  indicators: string[]
  riskLevel: AlertSeverity
  detectionAlgorithm: string
  accuracy: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface FraudStatistics {
  totalAlerts: number
  alertsByType: Record<AlertType, number>
  alertsBySeverity: Record<AlertSeverity, number>
  alertsByStatus: Record<AlertStatus, number>
  trendsLast30Days: {
    date: string
    count: number
    avgRiskScore: number
  }[]
  topRiskFactors: {
    factor: string
    count: number
    avgImpact: number
  }[]
}

export interface DeepfakeDetectionResult {
  id: string
  fileHash: string
  fileName: string
  fileSize: number
  mimeType: string
  analysisStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  result?: {
    isDeepfake: boolean
    confidence: number
    frameLevelAnalysis: FrameAnalysis[]
    audioAnalysis?: AudioAnalysis
    overallScore: number
    anomalies: string[]
  }
  processingTime?: number
  createdAt: Date
  completedAt?: Date
}

export interface FrameAnalysis {
  frameNumber: number
  timestamp: number
  isManipulated: boolean
  confidence: number
  anomalies: string[]
  landmarks?: FacialLandmark[]
}

export interface FacialLandmark {
  x: number
  y: number
  confidence: number
}

export interface AudioAnalysis {
  isManipulated: boolean
  confidence: number
  anomalies: string[]
  voicePrintAnalysis?: {
    consistency: number
    naturalness: number
    artifactDetection: string[]
  }
}
