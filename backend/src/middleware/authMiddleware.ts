import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '../models/User'
import { logger } from './logger'
import redisClient from '../config/redis'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

export class AuthMiddleware {
  
  // JWT Authentication middleware
  static async authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authorization token required',
            timestamp: new Date()
          }
        })
        return
      }

      const token = authHeader.substring(7) // Remove 'Bearer ' prefix

      // Check if token is blacklisted
      const isBlacklisted = await redisClient.get(`blacklist:${token}`)
      if (isBlacklisted) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Token has been revoked',
            timestamp: new Date()
          }
        })
        return
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      
      // Check if user still exists and is active
      const user = await User.findById(decoded.id).select('email role isActive isBlocked')
      
      if (!user || !user.isActive || user.isBlocked) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'User account not found or inactive',
            timestamp: new Date()
          }
        })
        return
      }

      // Check password change timestamp
      if (decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Password has been changed. Please log in again.',
            timestamp: new Date()
          }
        })
        return
      }

      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role
      }

      // Update last activity
      await User.findByIdAndUpdate(user._id, { 
        lastLoginAt: new Date(),
        'metadata.lastActivity': new Date()
      })

      logger.info('User authenticated successfully', { 
        userId: user._id, 
        email: user.email,
        userAgent: req.headers['user-agent']
      })

      next()

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token has expired',
            timestamp: new Date()
          }
        })
        return
      }

      if (error.name === 'JsonWebTokenError') {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid token format',
            timestamp: new Date()
          }
        })
        return
      }

      logger.error('JWT authentication error', { error: error.message })
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Authentication service error',
          timestamp: new Date()
        }
      })
    }
  }

  // Role-based authorization middleware
  static authorize(...allowedRoles: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authentication required',
            timestamp: new Date()
          }
        })
        return
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Unauthorized access attempt', {
          userId: req.user.id,
          role: req.user.role,
          requiredRoles: allowedRoles,
          endpoint: req.originalUrl
        })

        res.status(403).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Insufficient permissions',
            timestamp: new Date()
          }
        })
        return
      }

      next()
    }
  }

  // Optional authentication - doesn't fail if no token provided
  static async optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next()
    }

    try {
      await AuthMiddleware.authenticateJWT(req, res, next)
    } catch (error) {
      // Continue without authentication if token is invalid
      next()
    }
  }

  // API Key authentication for external integrations
  static async authenticateAPIKey(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = req.headers['x-api-key'] as string
      
      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_REQUIRED',
            message: 'API key required in X-API-Key header',
            timestamp: new Date()
          }
        })
        return
      }

      // Check API key in Redis (for performance) or database
      const keyData = await redisClient.get(`api_key:${apiKey}`)
      
      if (!keyData) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key',
            timestamp: new Date()
          }
        })
        return
      }

      const { userId, permissions, rateLimit } = JSON.parse(keyData)
      
      // Check rate limiting for API key
      const rateLimitKey = `api_rate_limit:${apiKey}`
      const currentCount = await redisClient.incr(rateLimitKey)
      
      if (currentCount === 1) {
        await redisClient.expire(rateLimitKey, 3600) // 1 hour window
      }
      
      if (currentCount > rateLimit) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'API rate limit exceeded',
            timestamp: new Date()
          }
        })
        return
      }

      req.user = {
        id: userId,
        email: 'api-user',
        role: 'API_USER',
        permissions
      }

      next()

    } catch (error) {
      logger.error('API key authentication error', { error: error.message })
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'API authentication service error',
          timestamp: new Date()
        }
      })
    }
  }

  // Two-factor authentication middleware
  static async verify2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { twoFactorCode } = req.body
      
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authentication required',
            timestamp: new Date()
          }
        })
        return
      }

      const user = await User.findById(req.user.id)
      
      if (!user || !user.security.twoFactorEnabled) {
        return next() // Skip 2FA if not enabled
      }

      if (!twoFactorCode) {
        res.status(400).json({
          success: false,
          error: {
            code: 'TWO_FACTOR_REQUIRED',
            message: 'Two-factor authentication code required',
            timestamp: new Date()
          }
        })
        return
      }

      // Verify 2FA code (implementation would depend on 2FA provider)
      const isValid = await this.verify2FACode(user, twoFactorCode)
      
      if (!isValid) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_2FA_CODE',
            message: 'Invalid two-factor authentication code',
            timestamp: new Date()
          }
        })
        return
      }

      next()

    } catch (error) {
      logger.error('2FA verification error', { error: error.message })
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '2FA verification service error',
          timestamp: new Date()
        }
      })
    }
  }

  private static async verify2FACode(user: any, code: string): Promise<boolean> {
    // Implementation would verify TOTP/SMS code
    // This is a placeholder implementation
    return true
  }
}

export const { authenticateJWT, authorize, optionalAuth, authenticateAPIKey, verify2FA } = AuthMiddleware
