import { Request, Response, NextFunction } from 'express'
import { logger } from './logger'
import { ApiResponse } from '../types/api'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly timestamp: Date

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message)
    
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.timestamp = new Date()
    
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  public readonly field?: string
  public readonly value?: any

  constructor(message: string, field?: string, value?: any) {
    super(message, 400)
    this.field = field
    this.value = value
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401)
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409)
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number

  constructor(message: string = 'Rate limit exceeded', retryAfter: number = 60) {
    super(message, 429)
    this.retryAfter = retryAfter
  }
}

export class ErrorHandler {
  
  // Main error handling middleware
  static handle(error: Error, req: Request, res: Response, next: NextFunction): void {
    let appError: AppError

    // Convert known errors to AppError instances
    if (error instanceof AppError) {
      appError = error
    } else if (error.name === 'ValidationError') {
      appError = ErrorHandler.handleValidationError(error)
    } else if (error.name === 'CastError') {
      appError = ErrorHandler.handleCastError(error)
    } else if (error.name === 'MongoError' && (error as any).code === 11000) {
      appError = ErrorHandler.handleDuplicateKeyError(error)
    } else if (error.name === 'JsonWebTokenError') {
      appError = new AuthenticationError('Invalid token')
    } else if (error.name === 'TokenExpiredError') {
      appError = new AuthenticationError('Token expired')
    } else {
      appError = new AppError('Internal server error', 500, false)
    }

    // Log error
    ErrorHandler.logError(appError, req)

    // Send error response
    ErrorHandler.sendErrorResponse(appError, res, req)
  }

  // Handle Mongoose validation errors
  private static handleValidationError(error: any): ValidationError {
    const field = Object.keys(error.errors)[0]
    const message = error.errors[field]?.message || 'Validation failed'
    return new ValidationError(message, field)
  }

  // Handle Mongoose cast errors (invalid ObjectId, etc.)
  private static handleCastError(error: any): ValidationError {
    const message = `Invalid ${error.path}: ${error.value}`
    return new ValidationError(message, error.path, error.value)
  }

  // Handle MongoDB duplicate key errors
  private static handleDuplicateKeyError(error: any): ConflictError {
    const field = Object.keys(error.keyValue)[0]
    const value = error.keyValue[field]
    return new ConflictError(`${field} '${value}' already exists`)
  }

  // Log error details
  private static logError(error: AppError, req: Request): void {
    const errorInfo = {
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      timestamp: error.timestamp,
      stack: error.stack,
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        userId: (req as any).user?.id
      }
    }

    if (error.statusCode >= 500) {
      logger.error('Server Error', errorInfo)
    } else if (error.statusCode >= 400) {
      logger.warn('Client Error', errorInfo)
    } else {
      logger.info('Error Info', errorInfo)
    }
  }

  // Send error response to client
  private static sendErrorResponse(error: AppError, res: Response, req: Request): void {
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    const errorResponse: ApiResponse = {
      success: false,
      error: {
        code: ErrorHandler.getErrorCode(error.statusCode),
        message: error.isOperational ? error.message : 'Something went wrong',
        timestamp: error.timestamp
      }
    }

    // Add additional error details in development
    if (isDevelopment && !error.isOperational) {
      errorResponse.error.details = error.message
      errorResponse.error.stack = error.stack
    }

    // Add field information for validation errors
    if (error instanceof ValidationError) {
      errorResponse.error.field = error.field
      errorResponse.error.value = error.value
    }

    // Add retry information for rate limit errors
    if (error instanceof RateLimitError) {
      errorResponse.error.retryAfter = error.retryAfter
      res.set('Retry-After', error.retryAfter.toString())
    }

    res.status(error.statusCode).json(errorResponse)
  }

  // Get error code from status code
  private static getErrorCode(statusCode: number): string {
    const errorCodes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'AUTHENTICATION_ERROR',
      403: 'AUTHORIZATION_ERROR',
      404: 'NOT_FOUND',
      409: 'CONFLICT_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT'
    }

    return errorCodes[statusCode] || 'UNKNOWN_ERROR'
  }

  // Handle async errors
  static catchAsync(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      fn(req, res, next).catch(next)
    }
  }

  // Handle 404 errors for undefined routes
  static handleNotFound(req: Request, res: Response, next: NextFunction): void {
    const error = new NotFoundError(`Route ${req.originalUrl} not found`)
    next(error)
  }

  // Handle uncaught exceptions
  static handleUncaughtException(): void {
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
      })
      
      // Graceful shutdown
      process.exit(1)
    })
  }

  // Handle unhandled promise rejections
  static handleUnhandledRejection(): void {
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString(),
        timestamp: new Date()
      })
      
      // Graceful shutdown
      process.exit(1)
    })
  }
}

// Global error handlers setup
ErrorHandler.handleUncaughtException()
ErrorHandler.handleUnhandledRejection()

export const errorHandler = ErrorHandler.handle
export const catchAsync = ErrorHandler.catchAsync
export const notFoundHandler = ErrorHandler.handleNotFound
