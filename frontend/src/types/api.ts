export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: ApiError
  metadata?: ResponseMetadata
}

export interface ApiError {
  code: string
  message: string
  details?: string
  field?: string
  timestamp: Date
}

export interface ResponseMetadata {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  hasNext?: boolean
  hasPrev?: boolean
  requestId: string
  processingTime: number
}

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  filters?: Record<string, any>
}

export interface ApiConfig {
  baseURL: string
  timeout: number
  retryAttempts: number
  retryDelay: number
  headers?: Record<string, string>
}

export interface WebSocketMessage {
  type: WebSocketMessageType
  payload: any
  timestamp: Date
  id: string
}

export enum WebSocketMessageType {
  FRAUD_ALERT = 'FRAUD_ALERT',
  RISK_SCORE_UPDATE = 'RISK_SCORE_UPDATE',
  SYSTEM_STATUS = 'SYSTEM_STATUS',
  USER_NOTIFICATION = 'USER_NOTIFICATION',
  REAL_TIME_UPDATE = 'REAL_TIME_UPDATE',
  HEARTBEAT = 'HEARTBEAT',
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
  speed: number
  timeRemaining: number
}

export interface FileUploadResponse {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  url: string
  thumbnailUrl?: string
  metadata?: Record<string, any>
}

export interface BulkOperation<T> {
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  data: T[]
  options?: {
    validateOnly?: boolean
    continueOnError?: boolean
    batchSize?: number
  }
}

export interface BulkOperationResult<T> {
  successful: T[]
  failed: BulkOperationError[]
  totalProcessed: number
  totalSuccessful: number
  totalFailed: number
}

export interface BulkOperationError {
  item: any
  error: ApiError
  index: number
}

export interface SearchResult<T> {
  items: T[]
  total: number
  aggregations?: Record<string, any>
  suggestions?: string[]
  took: number
}

export interface CacheOptions {
  ttl?: number
  key?: string
  tags?: string[]
  revalidate?: boolean
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: Date
  retryAfter?: number
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: Date
  version: string
  uptime: number
  checks: {
    database: ComponentHealth
    redis: ComponentHealth
    aiEngine: ComponentHealth
    externalApis: ComponentHealth
  }
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy'
  responseTime: number
  error?: string
  lastCheck: Date
}
