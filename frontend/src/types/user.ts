export interface User {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string
  phoneNumber?: string
  avatar?: string
  role: UserRole
  permissions: Permission[]
  preferences: UserPreferences
  profile: UserProfile
  subscription: Subscription
  twoFactorEnabled: boolean
  emailVerified: boolean
  phoneVerified: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

export enum UserRole {
  ADMIN = 'ADMIN',
  INVESTIGATOR = 'INVESTIGATOR',
  ANALYST = 'ANALYST',
  VIEWER = 'VIEWER',
  INVESTOR = 'INVESTOR',
}

export interface Permission {
  id: string
  name: string
  description: string
  resource: string
  actions: string[]
}

export interface UserPreferences {
  language: 'en' | 'hi'
  theme: 'light' | 'dark' | 'system'
  timezone: string
  dateFormat: string
  currency: string
  notifications: NotificationPreferences
  dashboard: DashboardPreferences
}

export interface NotificationPreferences {
  email: {
    fraudAlerts: boolean
    weeklyReports: boolean
    systemUpdates: boolean
    marketing: boolean
  }
  sms: {
    criticalAlerts: boolean
    verificationCodes: boolean
  }
  push: {
    realTimeAlerts: boolean
    dailySummary: boolean
  }
  inApp: {
    allAlerts: boolean
    mentions: boolean
    systemMessages: boolean
  }
}

export interface DashboardPreferences {
  defaultView: 'overview' | 'alerts' | 'analytics' | 'monitoring'
  widgets: DashboardWidget[]
  refreshInterval: number
  showTutorial: boolean
}

export interface DashboardWidget {
  id: string
  type: 'chart' | 'metric' | 'list' | 'map' | 'table'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: Record<string, any>
  isVisible: boolean
}

export interface UserProfile {
  bio?: string
  company?: string
  jobTitle?: string
  experience?: string
  specializations: string[]
  certifications: Certification[]
  socialLinks: SocialLink[]
  address?: Address
}

export interface Certification {
  name: string
  issuer: string
  issuedDate: Date
  expiryDate?: Date
  credentialId?: string
  verificationUrl?: string
}

export interface SocialLink {
  platform: 'linkedin' | 'twitter' | 'github' | 'website'
  url: string
  verified: boolean
}

export interface Address {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface Subscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  startDate: Date
  endDate?: Date
  autoRenew: boolean
  paymentMethod?: PaymentMethod
  usage: SubscriptionUsage
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRIAL = 'TRIAL',
}

export interface PaymentMethod {
  type: 'CREDIT_CARD' | 'DEBIT_CARD' | 'UPI' | 'NET_BANKING' | 'WALLET'
  last4?: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
}

export interface SubscriptionUsage {
  alertsProcessed: number
  apiCalls: number
  storageUsed: number
  usersManaged: number
  limits: {
    alertsPerMonth: number
    apiCallsPerDay: number
    storageGB: number
    maxUsers: number
  }
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  tokenType: 'Bearer'
}

export interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
  captcha?: string
}

export interface RegisterData {
  email: string
  username: string
  password: string
  firstName: string
  lastName: string
  phoneNumber?: string
  acceptTerms: boolean
  marketingConsent?: boolean
}

export interface ResetPasswordData {
  email: string
  token: string
  newPassword: string
}

export interface ChangePasswordData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface TwoFactorSetup {
  secret: string
  qrCode: string
  backupCodes: string[]
}

export interface VerifyTwoFactorData {
  code: string
  token?: string
}
