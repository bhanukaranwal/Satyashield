import { Schema, model, Document, Types } from 'mongoose'

export interface IFraudAlert extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  alertType: AlertType
  severity: AlertSeverity
  title: string
  description: string
  riskScore: number
  status: AlertStatus
  detectionTime: Date
  evidenceData: IEvidenceData
  investigationNotes?: string
  resolution?: string
  assignedInvestigator?: Types.ObjectId
  tags: string[]
  sourceSystem: string
  externalId?: string
  metadata: Record<string, any>
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
  MARKET_MANIPULATION = 'MARKET_MANIPULATION',
  IDENTITY_THEFT = 'IDENTITY_THEFT',
  PUMP_AND_DUMP = 'PUMP_AND_DUMP',
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
  ESCALATED = 'ESCALATED',
  CLOSED = 'CLOSED',
}

interface IEvidenceData {
  sourceUrl?: string
  screenshots?: string[]
  videos?: string[]
  audioFiles?: string[]
  documents?: string[]
  socialMediaPosts?: ISocialMediaPost[]
  advisorDetails?: IAdvisorDetails
  tradingAppDetails?: ITradingAppDetails
  documentAnalysis?: IDocumentAnalysis
  deepfakeAnalysis?: IDeepfakeAnalysis
  financialData?: IFinancialData
  networkAnalysis?: INetworkAnalysis
  metadata?: Record<string, any>
}

interface ISocialMediaPost {
  platform: 'TELEGRAM' | 'WHATSAPP' | 'TWITTER' | 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN'
  postId: string
  content: string
  authorId: string
  authorName: string
  authorVerified: boolean
  timestamp: Date
  engagement: {
    likes?: number
    shares?: number
    comments?: number
    views?: number
    reactions?: Record<string, number>
  }
  mediaContent?: {
    images?: string[]
    videos?: string[]
    links?: string[]
  }
  sentimentScore: number
  fraudProbability: number
  keywordMatches: string[]
  languageDetected: string
  location?: {
    country?: string
    city?: string
    coordinates?: [number, number]
  }
}

interface IAdvisorDetails {
  name: string
  sebiRegNumber?: string
  panNumber?: string
  licenseType?: string
  registrationDate?: Date
  expiryDate?: Date
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED'
  riskIndicators: string[]
  complianceHistory: IComplianceRecord[]
  businessAddress?: string
  contactDetails?: {
    phone?: string
    email?: string
    website?: string
  }
  associatedEntities?: string[]
}

interface IComplianceRecord {
  date: Date
  type: 'VIOLATION' | 'WARNING' | 'PENALTY' | 'SUSPENSION' | 'FINE' | 'SHOW_CAUSE'
  description: string
  amount?: number
  status: 'ACTIVE' | 'RESOLVED' | 'APPEALED' | 'OVERTURNED'
  referenceNumber?: string
  authority: string
}

interface ITradingAppDetails {
  appName: string
  packageName: string
  bundleId?: string
  developer: string
  version: string
  storeRating?: number
  downloadCount?: number
  releaseDate?: Date
  lastUpdated?: Date
  permissions: string[]
  brokerLicense?: string
  brokerName?: string
  sslCertificate?: ISSLCertificate
  similarityScore?: number
  legitimateAppName?: string
  screenshots?: string[]
  reviewAnalysis?: {
    positiveReviews: number
    negativeReviews: number
    suspiciousReviews: number
    averageRating: number
    reviewSentiment: number
  }
}

interface ISSLCertificate {
  issuer: string
  subject: string
  serialNumber: string
  validFrom: Date
  validTo: Date
  isValid: boolean
  trustScore: number
  certificateChain: string[]
  vulnerabilities?: string[]
}

interface IDocumentAnalysis {
  documentType: 'IPO_PROSPECTUS' | 'CORPORATE_ANNOUNCEMENT' | 'ADVISOR_CERTIFICATE' | 'FINANCIAL_STATEMENT' | 'REGULATORY_FILING' | 'OTHER'
  authenticity: {
    score: number
    confidence: number
    anomalies: string[]
    forgeryIndicators: string[]
  }
  ocrText?: string
  extractedData?: Record<string, any>
  metadata?: {
    creationDate?: Date
    modificationDate?: Date
    author?: string
    software?: string
    fileSize?: number
    format?: string
    pages?: number
  }
  digitalSignature?: {
    isPresent: boolean
    isValid?: boolean
    signerInfo?: string
    timestamp?: Date
  }
  complianceCheck?: {
    requiredFields: string[]
    missingFields: string[]
    formatCompliance: boolean
    contentCompliance: boolean
  }
}

interface IDeepfakeAnalysis {
  fileType: 'IMAGE' | 'VIDEO' | 'AUDIO'
  analysisResults: {
    isDeepfake: boolean
    confidence: number
    overallScore: number
    processingTime: number
  }
  frameLevelAnalysis?: IFrameAnalysis[]
  audioAnalysis?: IAudioAnalysis
  technicalMetadata: {
    resolution?: string
    duration?: number
    frameRate?: number
    codec?: string
    bitrate?: number
    fileSize: number
  }
  anomalies: string[]
  modelVersion: string
  analysisTimestamp: Date
}

interface IFrameAnalysis {
  frameNumber: number
  timestamp: number
  isManipulated: boolean
  confidence: number
  anomalies: string[]
  facialLandmarks?: number[][]
  attentionMaps?: number[][]
}

interface IAudioAnalysis {
  isManipulated: boolean
  confidence: number
  anomalies: string[]
  voicePrintAnalysis?: {
    consistency: number
    naturalness: number
    artifactDetection: string[]
  }
  spectralAnalysis?: {
    frequencyAnomalies: string[]
    noiseProfile: Record<string, number>
  }
}

interface IFinancialData {
  securitySymbol?: string
  priceData?: {
    currentPrice: number
    priceChange: number
    priceChangePercent: number
    volume: number
    marketCap?: number
    timestamp: Date
  }
  tradingPatterns?: {
    unusualVolume: boolean
    priceManipulation: boolean
    suspiciousOrders: boolean
    patterns: string[]
  }
  fundamentalData?: Record<string, any>
  newsImpact?: {
    sentimentScore: number
    relevanceScore: number
    credibilityScore: number
  }
}

interface INetworkAnalysis {
  sourceNodes: string[]
  targetNodes: string[]
  connectionStrength: number
  networkMetrics: {
    centrality: number
    clustering: number
    pathLength: number
  }
  suspiciousConnections: string[]
  communityDetection?: {
    communities: string[][]
    modularityScore: number
  }
}

const fraudAlertSchema = new Schema<IFraudAlert>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    alertType: {
      type: String,
      enum: Object.values(AlertType),
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: Object.values(AlertSeverity),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
      index: 'text',
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
      index: 'text',
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(AlertStatus),
      default: AlertStatus.ACTIVE,
      index: true,
    },
    detectionTime: {
      type: Date,
      required: true,
      index: true,
    },
    evidenceData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    investigationNotes: {
      type: String,
      maxlength: 5000,
    },
    resolution: {
      type: String,
      maxlength: 2000,
    },
    assignedInvestigator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    tags: [{
      type: String,
      maxlength: 50,
    }],
    sourceSystem: {
      type: String,
      required: true,
      default: 'SATYASHIELD',
    },
    externalId: {
      type: String,
      sparse: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'fraud_alerts',
  }
)

// Indexes for performance
fraudAlertSchema.index({ userId: 1, status: 1 })
fraudAlertSchema.index({ alertType: 1, severity: 1 })
fraudAlertSchema.index({ detectionTime: -1 })
fraudAlertSchema.index({ riskScore: -1 })
fraudAlertSchema.index({ status: 1, assignedInvestigator: 1 })
fraudAlertSchema.index({ createdAt: -1 })
fraudAlertSchema.index({ 'evidenceData.sourceUrl': 1 }, { sparse: true })

// Compound indexes for common queries
fraudAlertSchema.index({ 
  alertType: 1, 
  severity: 1, 
  status: 1, 
  detectionTime: -1 
})

// Text search index
fraudAlertSchema.index({
  title: 'text',
  description: 'text',
  'evidenceData.advisorDetails.name': 'text',
  'evidenceData.tradingAppDetails.appName': 'text',
})

// TTL index for auto-cleanup of resolved alerts after 2 years
fraudAlertSchema.index(
  { updatedAt: 1 },
  { 
    expireAfterSeconds: 63072000, // 2 years
    partialFilterExpression: { 
      status: { $in: [AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE, AlertStatus.CLOSED] }
    }
  }
)

// Middleware
fraudAlertSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === AlertStatus.RESOLVED) {
    this.resolution = this.resolution || 'Alert resolved'
  }
  next()
})

fraudAlertSchema.pre('save', function(next) {
  // Auto-assign tags based on alert type and content
  const autoTags = []
  
  if (this.alertType === AlertType.ADVISOR_FRAUD) {
    autoTags.push('advisor', 'sebi')
  }
  
  if (this.alertType === AlertType.DEEPFAKE_DETECTED) {
    autoTags.push('deepfake', 'ai-detection')
  }
  
  if (this.severity === AlertSeverity.CRITICAL) {
    autoTags.push('critical', 'urgent')
  }
  
  if (this.riskScore >= 80) {
    autoTags.push('high-risk')
  }
  
  // Merge with existing tags
  this.tags = [...new Set([...this.tags, ...autoTags])]
  
  next()
})

// Virtual for age in days
fraudAlertSchema.virtual('ageInDays').get(function(this: IFraudAlert) {
  return Math.floor((Date.now() - this.detectionTime.getTime()) / (1000 * 60 * 60 * 24))
})

// Virtual for investigation duration
fraudAlertSchema.virtual('investigationDuration').get(function(this: IFraudAlert) {
  if (this.status === AlertStatus.RESOLVED || this.status === AlertStatus.CLOSED) {
    return this.updatedAt.getTime() - this.detectionTime.getTime()
  }
  return Date.now() - this.detectionTime.getTime()
})

// Methods
fraudAlertSchema.methods.escalate = function(this: IFraudAlert, investigatorId?: Types.ObjectId) {
  this.status = AlertStatus.ESCALATED
  this.severity = AlertSeverity.CRITICAL
  if (investigatorId) {
    this.assignedInvestigator = investigatorId
  }
  return this.save()
}

fraudAlertSchema.methods.resolve = function(this: IFraudAlert, resolution: string) {
  this.status = AlertStatus.RESOLVED
  this.resolution = resolution
  return this.save()
}

fraudAlertSchema.methods.markAsFalsePositive = function(this: IFraudAlert, reason: string) {
  this.status = AlertStatus.FALSE_POSITIVE
  this.resolution = reason
  return this.save()
}

// Statics
fraudAlertSchema.statics.findByRiskScore = function(minScore: number, maxScore: number = 100) {
  return this.find({
    riskScore: { $gte: minScore, $lte: maxScore }
  }).sort({ riskScore: -1 })
}

fraudAlertSchema.statics.findActiveByType = function(alertType: AlertType) {
  return this.find({
    alertType,
    status: { $in: [AlertStatus.ACTIVE, AlertStatus.INVESTIGATING] }
  }).sort({ detectionTime: -1 })
}

fraudAlertSchema.statics.getStatsByDateRange = function(startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        detectionTime: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          type: '$alertType',
          severity: '$severity',
          status: '$status'
        },
        count: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        maxRiskScore: { $max: '$riskScore' },
        minRiskScore: { $min: '$riskScore' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ])
}

export const FraudAlert = model<IFraudAlert>('FraudAlert', fraudAlertSchema)
