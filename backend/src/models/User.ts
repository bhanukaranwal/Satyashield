import { Schema, model, Document, Types } from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export interface IUser extends Document {
  _id: Types.ObjectId
  email: string
  username: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string
  avatar?: string
  role: UserRole
  permissions: Types.ObjectId[]
  preferences: IUserPreferences
  profile: IUserProfile
  subscription: ISubscription
  security: ISecuritySettings
  activity: IActivityLog[]
  emailVerified: boolean
  phoneVerified: boolean
  isActive: boolean
  isBlocked: boolean
  lastLoginAt?: Date
  loginAttempts: number
  lockUntil?: Date
  passwordChangedAt: Date
  createdAt: Date
  updatedAt: Date
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>
  generateAuthToken(): string
  generateRefreshToken(): string
  incrementLoginAttempts(): Promise<void>
  resetLoginAttempts(): Promise<void>
  isLocked(): boolean
  toJSON(): any
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  INVESTIGATOR = 'INVESTIGATOR',
  ANALYST = 'ANALYST',
  VIEWER = 'VIEWER',
  INVESTOR = 'INVESTOR',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  API_USER = 'API_USER',
}

interface IUserPreferences {
  language: 'en' | 'hi' | 'te' | 'ta' | 'bn' | 'gu' | 'mr'
  theme: 'light' | 'dark' | 'system'
  timezone: string
  dateFormat: string
  timeFormat: '12h' | '24h'
  currency: string
  notifications: INotificationPreferences
  dashboard: IDashboardPreferences
  privacy: IPrivacySettings
}

interface INotificationPreferences {
  email: {
    fraudAlerts: boolean
    systemUpdates: boolean
    weeklyReports: boolean
    monthlyReports: boolean
    marketing: boolean
    newsletter: boolean
    accountActivity: boolean
  }
  sms: {
    criticalAlerts: boolean
    verificationCodes: boolean
    loginNotifications: boolean
  }
  push: {
    realTimeAlerts: boolean
    dailySummary: boolean
    investigationUpdates: boolean
    systemMaintenance: boolean
  }
  inApp: {
    allAlerts: boolean
    mentions: boolean
    systemMessages: boolean
    chatMessages: boolean
  }
  frequency: {
    immediate: boolean
    hourly: boolean
    daily: boolean
    weekly: boolean
  }
}

interface IDashboardPreferences {
  defaultView: 'overview' | 'alerts' | 'analytics' | 'monitoring' | 'investigations'
  widgets: IDashboardWidget[]
  refreshInterval: number
  autoRefresh: boolean
  showTutorial: boolean
  compactMode: boolean
  showPreview: boolean
}

interface IDashboardWidget {
  id: string
  type: 'chart' | 'metric' | 'list' | 'map' | 'table' | 'calendar' | 'feed'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: Record<string, any>
  isVisible: boolean
  isLocked: boolean
  refreshRate: number
}

interface IPrivacySettings {
  profileVisibility: 'public' | 'private' | 'team'
  activityTracking: boolean
  dataCollection: boolean
  analyticsOptIn: boolean
  thirdPartySharing: boolean
  locationTracking: boolean
}

interface IUserProfile {
  bio?: string
  company?: string
  jobTitle?: string
  department?: string
  experience?: string
  specializations: string[]
  certifications: ICertification[]
  socialLinks: ISocialLink[]
  address?: IAddress
  emergencyContact?: IEmergencyContact
  profileCompleteness: number
}

interface ICertification {
  name: string
  issuer: string
  issuedDate: Date
  expiryDate?: Date
  credentialId?: string
  verificationUrl?: string
  isVerified: boolean
  skills: string[]
}

interface ISocialLink {
  platform: 'linkedin' | 'twitter' | 'github' | 'website' | 'facebook' | 'instagram'
  url: string
  verified: boolean
  primary: boolean
}

interface IAddress {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
  coordinates?: [number, number]
  type: 'home' | 'work' | 'other'
}

interface IEmergencyContact {
  name: string
  relationship: string
  phoneNumber: string
  email?: string
}

interface ISubscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  startDate: Date
  endDate?: Date
  trialEndDate?: Date
  autoRenew: boolean
  paymentMethod?: IPaymentMethod
  billingCycle: 'monthly' | 'yearly'
  usage: ISubscriptionUsage
  features: string[]
  addons: IAddon[]
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
  CUSTOM = 'CUSTOM',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRIAL = 'TRIAL',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

interface IPaymentMethod {
  type: 'CREDIT_CARD' | 'DEBIT_CARD' | 'UPI' | 'NET_BANKING' | 'WALLET'
  last4?: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
  billingAddress?: IAddress
  isDefault: boolean
}

interface ISubscriptionUsage {
  alertsProcessed: number
  apiCalls: number
  storageUsed: number
  usersManaged: number
  reportsGenerated: number
  limits: {
    alertsPerMonth: number
    apiCallsPerDay: number
    storageGB: number
    maxUsers: number
    maxReports: number
  }
  resetDate: Date
}

interface IAddon {
  name: string
  price: number
  billingCycle: 'monthly' | 'yearly'
  features: string[]
  isActive: boolean
  startDate: Date
  endDate?: Date
}

interface ISecuritySettings {
  twoFactorEnabled: boolean
  twoFactorMethod: 'app' | 'sms' | 'email'
  backupCodes?: string[]
  trustedDevices: ITrustedDevice[]
  securityQuestions: ISecurityQuestion[]
  passwordPolicy: IPasswordPolicy
  sessionTimeout: number
  ipRestrictions: string[]
  allowedDomains: string[]
}

interface ITrustedDevice {
  deviceId: string
  deviceName: string
  deviceType: 'desktop' | 'mobile' | 'tablet'
  browser: string
  os: string
  ipAddress: string
  location?: string
  firstUsed: Date
  lastUsed: Date
  isActive: boolean
}

interface ISecurityQuestion {
  question: string
  answerHash: string
  createdAt: Date
}

interface IPasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSymbols: boolean
  expiryDays: number
  historyCount: number
}

interface IActivityLog {
  action: string
  resource?: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress: string
  userAgent: string
  location?: string
  timestamp: Date
  sessionId?: string
  riskScore?: number
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    phoneNumber: {
      type: String,
      sparse: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number'],
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.INVESTOR,
      index: true,
    },
    permissions: [{
      type: Schema.Types.ObjectId,
      ref: 'Permission',
    }],
    preferences: {
      language: {
        type: String,
        enum: ['en', 'hi', 'te', 'ta', 'bn', 'gu', 'mr'],
        default: 'en',
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      timezone: {
        type: String,
        default: 'Asia/Kolkata',
      },
      dateFormat: {
        type: String,
        default: 'DD/MM/YYYY',
      },
      timeFormat: {
        type: String,
        enum: ['12h', '24h'],
        default: '24h',
      },
      currency: {
        type: String,
        default: 'INR',
      },
      notifications: {
        email: {
          fraudAlerts: { type: Boolean, default: true },
          systemUpdates: { type: Boolean, default: true },
          weeklyReports: { type: Boolean, default: false },
          monthlyReports: { type: Boolean, default: true },
          marketing: { type: Boolean, default: false },
          newsletter: { type: Boolean, default: false },
          accountActivity: { type: Boolean, default: true },
        },
        sms: {
          criticalAlerts: { type: Boolean, default: true },
          verificationCodes: { type: Boolean, default: true },
          loginNotifications: { type: Boolean, default: false },
        },
        push: {
          realTimeAlerts: { type: Boolean, default: true },
          dailySummary: { type: Boolean, default: false },
          investigationUpdates: { type: Boolean, default: true },
          systemMaintenance: { type: Boolean, default: true },
        },
        inApp: {
          allAlerts: { type: Boolean, default: true },
          mentions: { type: Boolean, default: true },
          systemMessages: { type: Boolean, default: true },
          chatMessages: { type: Boolean, default: true },
        },
        frequency: {
          immediate: { type: Boolean, default: true },
          hourly: { type: Boolean, default: false },
          daily: { type: Boolean, default: false },
          weekly: { type: Boolean, default: false },
        },
      },
      dashboard: {
        defaultView: {
          type: String,
          enum: ['overview', 'alerts', 'analytics', 'monitoring', 'investigations'],
          default: 'overview',
        },
        widgets: [{
          id: String,
          type: {
            type: String,
            enum: ['chart', 'metric', 'list', 'map', 'table', 'calendar', 'feed'],
          },
          title: String,
          position: {
            x: Number,
            y: Number,
          },
          size: {
            width: Number,
            height: Number,
          },
          config: Schema.Types.Mixed,
          isVisible: { type: Boolean, default: true },
          isLocked: { type: Boolean, default: false },
          refreshRate: { type: Number, default: 30 },
        }],
        refreshInterval: { type: Number, default: 30 },
        autoRefresh: { type: Boolean, default: true },
        showTutorial: { type: Boolean, default: true },
        compactMode: { type: Boolean, default: false },
        showPreview: { type: Boolean, default: true },
      },
      privacy: {
        profileVisibility: {
          type: String,
          enum: ['public', 'private', 'team'],
          default: 'team',
        },
        activityTracking: { type: Boolean, default: true },
        dataCollection: { type: Boolean, default: true },
        analyticsOptIn: { type: Boolean, default: true },
        thirdPartySharing: { type: Boolean, default: false },
        locationTracking: { type: Boolean, default: false },
      },
    },
    profile: {
      bio: { type: String, maxlength: 500 },
      company: { type: String, maxlength: 100 },
      jobTitle: { type: String, maxlength: 100 },
      department: { type: String, maxlength: 100 },
      experience: { type: String, maxlength: 50 },
      specializations: [{ type: String, maxlength: 50 }],
      certifications: [{
        name: { type: String, required: true },
        issuer: { type: String, required: true },
        issuedDate: { type: Date, required: true },
        expiryDate: Date,
        credentialId: String,
        verificationUrl: String,
        isVerified: { type: Boolean, default: false },
        skills: [String],
      }],
      socialLinks: [{
        platform: {
          type: String,
          enum: ['linkedin', 'twitter', 'github', 'website', 'facebook', 'instagram'],
          required: true,
        },
        url: { type: String, required: true },
        verified: { type: Boolean, default: false },
        primary: { type: Boolean, default: false },
      }],
      address: {
        street: String,
        city: String,
        state: String,
        postalCode: String,
        country: String,
        coordinates: [Number],
        type: {
          type: String,
          enum: ['home', 'work', 'other'],
          default: 'home',
        },
      },
      emergencyContact: {
        name: String,
        relationship: String,
        phoneNumber: String,
        email: String,
      },
      profileCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    },
    subscription: {
      plan: {
        type: String,
        enum: Object.values(SubscriptionPlan),
        default: SubscriptionPlan.FREE,
      },
      status: {
        type: String,
        enum: Object.values(SubscriptionStatus),
        default: SubscriptionStatus.TRIAL,
      },
      startDate: { type: Date, default: Date.now },
      endDate: Date,
      trialEndDate: {
        type: Date,
        default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      },
      autoRenew: { type: Boolean, default: true },
      paymentMethod: {
        type: {
          type: String,
          enum: ['CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'NET_BANKING', 'WALLET'],
        },
        last4: String,
        brand: String,
        expiryMonth: Number,
        expiryYear: Number,
        billingAddress: {
          street: String,
          city: String,
          state: String,
          postalCode: String,
          country: String,
          coordinates: [Number],
          type: {
            type: String,
            enum: ['home', 'work', 'other'],
            default: 'home',
          },
        },
        isDefault: { type: Boolean, default: true },
      },
      billingCycle: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly',
      },
      usage: {
        alertsProcessed: { type: Number, default: 0 },
        apiCalls: { type: Number, default: 0 },
        storageUsed: { type: Number, default: 0 },
        usersManaged: { type: Number, default: 0 },
        reportsGenerated: { type: Number, default: 0 },
        limits: {
          alertsPerMonth: { type: Number, default: 100 },
          apiCallsPerDay: { type: Number, default: 1000 },
          storageGB: { type: Number, default: 1 },
          maxUsers: { type: Number, default: 1 },
          maxReports: { type: Number, default: 10 },
        },
        resetDate: {
          type: Date,
          default: () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        },
      },
      features: [String],
      addons: [{
        name: { type: String, required: true },
        price: { type: Number, required: true },
        billingCycle: {
          type: String,
          enum: ['monthly', 'yearly'],
          required: true,
        },
        features: [String],
        isActive: { type: Boolean, default: true },
        startDate: { type: Date, default: Date.now },
        endDate: Date,
      }],
    },
    security: {
      twoFactorEnabled: { type: Boolean, default: false },
      twoFactorMethod: {
        type: String,
        enum: ['app', 'sms', 'email'],
        default: 'app',
      },
      backupCodes: [String],
      trustedDevices: [{
        deviceId: { type: String, required: true },
        deviceName: { type: String, required: true },
        deviceType: {
          type: String,
          enum: ['desktop', 'mobile', 'tablet'],
          required: true,
        },
        browser: String,
        os: String,
        ipAddress: String,
        location: String,
        firstUsed: { type: Date, default: Date.now },
        lastUsed: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true },
      }],
      securityQuestions: [{
        question: { type: String, required: true },
        answerHash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      }],
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSymbols: { type: Boolean, default: false },
        expiryDays: { type: Number, default: 90 },
        historyCount: { type: Number, default: 5 },
      },
      sessionTimeout: { type: Number, default: 3600 }, // 1 hour in seconds
      ipRestrictions: [String],
      allowedDomains: [String],
    },
    activity: [{
      action: { type: String, required: true },
      resource: String,
      resourceId: String,
      details: Schema.Types.Mixed,
      ipAddress: { type: String, required: true },
      userAgent: { type: String, required: true },
      location: String,
      timestamp: { type: Date, default: Date.now },
      sessionId: String,
      riskScore: { type: Number, min: 0, max: 100 },
    }],
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    isBlocked: { type: Boolean, default: false, index: true },
    lastLoginAt: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    passwordChangedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'users',
  }
)

// Indexes
userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ username: 1 }, { unique: true })
userSchema.index({ role: 1, isActive: 1 })
userSchema.index({ 'subscription.plan': 1, 'subscription.status': 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ lastLoginAt: -1 })

// Virtual for full name
userSchema.virtual('fullName').get(function(this: IUser) {
  return `${this.firstName} ${this.lastName}`
})

// Virtual for account locked status
userSchema.virtual('isLocked').get(function(this: IUser) {
  return !!(this.lockUntil && this.lockUntil > new Date())
})

// Pre-save middleware
userSchema.pre('save', async function(this: IUser, next) {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    this.passwordChangedAt = new Date()
  }

  // Calculate profile completeness
  if (this.isModified('profile') || this.isNew) {
    let completeness = 0
    const profile = this.profile

    if (profile.bio) completeness += 10
    if (profile.company) completeness += 10
    if (profile.jobTitle) completeness += 10
    if (profile.address?.city) completeness += 15
    if (profile.certifications.length > 0) completeness += 20
    if (profile.socialLinks.length > 0) completeness += 15
    if (this.avatar) completeness += 20

    this.profile.profileCompleteness = completeness
  }

  next()
})

// Methods
userSchema.methods.comparePassword = async function(this: IUser, candidatePassword: string): Promise<boolean> {
  if (!this.password) return false
  return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.generateAuthToken = function(this: IUser): string {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRE || '1d' }
  )
}

userSchema.methods.generateRefreshToken = function(this: IUser): string {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  )
}

userSchema.methods.incrementLoginAttempts = async function(this: IUser): Promise<void> {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < new Date()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    })
  }

  const updates: any = { $inc: { loginAttempts: 1 } }

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) }
  }

  return this.updateOne(updates)
}

userSchema.methods.resetLoginAttempts = async function(this: IUser): Promise<void> {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLoginAt: new Date() }
  })
}

userSchema.methods.isLocked = function(this: IUser): boolean {
  return !!(this.lockUntil && this.lockUntil > new Date())
}

// Transform toJSON to exclude sensitive information
userSchema.methods.toJSON = function(this: IUser) {
  const userObject = this.toObject()
  delete userObject.password
  delete userObject.security.backupCodes
  delete userObject.security.securityQuestions
  delete userObject.loginAttempts
  delete userObject.lockUntil
  return userObject
}

// Static methods
userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true, isBlocked: false })
}

userSchema.statics.findByRole = function(role: UserRole) {
  return this.find({ role, isActive: true })
}

userSchema.statics.findExpiredTrials = function() {
  return this.find({
    'subscription.status': SubscriptionStatus.TRIAL,
    'subscription.trialEndDate': { $lt: new Date() }
  })
}

export const User = model<IUser>('User', userSchema)
