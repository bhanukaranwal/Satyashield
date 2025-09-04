import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import redisClient from '../config/redis'
import { logger } from './logger'

// Store for rate limit data
const RedisStore = require('rate-limit-redis')

export class RateLimitMiddleware {
  
  // General API rate limiting
  static createGeneralLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        client: redisClient.client,
        prefix: 'rl:general:'
      }),
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again after 15 minutes',
          retryAfter: 15 * 60
        }
      },
      onLimitReached: (req: Request) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          endpoint: req.originalUrl
        })
      }
    })
  }

  // Authentication endpoints rate limiting (stricter)
  static createAuthLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 auth requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        client: redisClient.client,
        prefix: 'rl:auth:'
      }),
      message: {
        success: false,
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts, please try again after 15 minutes',
          retryAfter: 15 * 60
        }
      },
      onLimitReached: (req: Request) => {
        logger.warn('Auth rate limit exceeded', {
          ip: req.ip,
          endpoint: req.originalUrl,
          body: req.body?.email || 'no email provided'
        })
      }
    })
  }

  // API endpoints rate limiting (higher limits for authenticated users)
  static createAPILimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req: Request) => {
        // Different limits based on user role
        const user = (req as any).user
        if (!user) return 50 // Unauthenticated users
        
        switch (user.role) {
          case 'ADMIN':
          case 'SUPER_ADMIN':
            return 1000
          case 'INVESTIGATOR':
          case 'ANALYST':
            return 500
          case 'INVESTOR':
            return 200
          default:
            return 100
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        client: redisClient.client,
        prefix: 'rl:api:'
      }),
      keyGenerator: (req: Request) => {
        // Use user ID for authenticated requests, IP for others
        const user = (req as any).user
        return user ? `user:${user.id}` : `ip:${req.ip}`
      },
      message: {
        success: false,
        error: {
          code: 'API_RATE_LIMIT_EXCEEDED',
          message: 'API rate limit exceeded, please try again later',
          retryAfter: 15 * 60
        }
      }
    })
  }

  // File upload rate limiting
  static createUploadLimiter() {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // Limit file uploads
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        client: redisClient.client,
        prefix: 'rl:upload:'
      }),
      message: {
        success: false,
        error: {
          code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
          message: 'Too many file uploads, please try again after 1 hour',
          retryAfter: 60 * 60
        }
      }
    })
  }

  // Dynamic rate limiting based on endpoint
  static createDynamicLimiter(options: {
    windowMs: number
    max: number
    prefix: string
    message?: string
  }) {
    return rateLimit({
      windowMs: options.windowMs,
      max: options.max,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        client: redisClient.client,
        prefix: `rl:${options.prefix}:`
      }),
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Rate limit exceeded',
          retryAfter: Math.floor(options.windowMs / 1000)
        }
      }
    })
  }

  // Custom rate limiter for specific operations
  static async customRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    req: Request,
    res: Response
  ): Promise<boolean> {
    try {
      const redisKey = `custom_rl:${key}`
      const current = await redisClient.incr(redisKey)
      
      if (current === 1) {
        await redisClient.expire(redisKey, Math.floor(windowMs / 1000))
      }
      
      if (current > limit) {
        const ttl = await redisClient.ttl(redisKey)
        
        res.status(429).json({
          success: false,
          error: {
            code: 'CUSTOM_RATE_LIMIT_EXCEEDED',
            message: 'Operation rate limit exceeded',
            retryAfter: ttl
          }
        })
        
        return false
      }
      
      return true
      
    } catch (error) {
      logger.error('Custom rate limit error', { error: error.message, key })
      return true // Allow request if rate limiting fails
    }
  }

  // Burst protection for critical operations
  static createBurstProtection(maxBurst: number = 3, windowMs: number = 60000) {
    return async (req: Request, res: Response, next: Function) => {
      const key = `burst:${req.ip}:${req.originalUrl}`
      
      try {
        const count = await redisClient.incr(key)
        
        if (count === 1) {
          await redisClient.expire(key, Math.floor(windowMs / 1000))
        }
        
        if (count > maxBurst) {
          const ttl = await redisClient.ttl(key)
          
          logger.warn('Burst protection triggered', {
            ip: req.ip,
            endpoint: req.originalUrl,
            count,
            maxBurst
          })
          
          res.status(429).json({
            success: false,
            error: {
              code: 'BURST_PROTECTION_TRIGGERED',
              message: 'Too many rapid requests detected',
              retryAfter: ttl
            }
          })
          return
        }
        
        next()
        
      } catch (error) {
        logger.error('Burst protection error', { error: error.message })
        next() // Allow request if burst protection fails
      }
    }
  }
}

// Export commonly used limiters
export const generalLimiter = RateLimitMiddleware.createGeneralLimiter()
export const authLimiter = RateLimitMiddleware.createAuthLimiter()
export const apiLimiter = RateLimitMiddleware.createAPILimiter()
export const uploadLimiter = RateLimitMiddleware.createUploadLimiter()
export const { createDynamicLimiter, customRateLimit, createBurstProtection } = RateLimitMiddleware
