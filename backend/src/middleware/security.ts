import helmet from 'helmet'
import { Request, Response, NextFunction } from 'express'
import { logger } from './logger'
import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import redisClient from '../config/redis'

export class SecurityMiddleware {
  
  // Configure helmet for security headers
  static configureHelmet() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'", 
            "'unsafe-inline'", 
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net"
          ],
          fontSrc: [
            "'self'", 
            "https://fonts.gstatic.com",
            "https://cdn.jsdelivr.net"
          ],
          imgSrc: [
            "'self'", 
            "data:", 
            "https:",
            "blob:"
          ],
          scriptSrc: [
            "'self'",
            process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ""
          ].filter(Boolean),
          connectSrc: [
            "'self'",
            "https://api.satyashield.com",
            "wss://api.satyashield.com",
            "https://www.sebi.gov.in"
          ],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "blob:"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : undefined
        }
      },
      
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      
      // X-Frame-Options
      frameguard: {
        action: 'deny'
      },
      
      // X-Content-Type-Options
      noSniff: true,
      
      // X-XSS-Protection
      xssFilter: true,
      
      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },
      
      // Permissions Policy
      permissionsPolicy: {
        features: {
          camera: ['self'],
          microphone: ['self'],
          geolocation: ['none'],
          payment: ['self'],
          usb: ['none'],
          bluetooth: ['none'],
          magnetometer: ['none'],
          accelerometer: ['none'],
          gyroscope: ['none']
        }
      }
    })
  }
  
  // Custom security headers
  static customHeaders(req: Request, res: Response, next: NextFunction) {
    // Remove server fingerprinting
    res.removeHeader('X-Powered-By')
    res.removeHeader('Server')
    
    // Additional security headers
    res.setHeader('X-Content-Security-Policy-Report-Only', "default-src 'self'")
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('X-Download-Options', 'noopen')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')
    
    // Log security events
    logger.info('Security headers applied', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString()
    })
    
    next()
  }
  
  // Rate limiting configuration
  static createRateLimiter(windowMs: number = 15 * 60 * 1000, max: number = 100) {
    return rateLimit({
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:'
      }),
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later',
          retryAfter: Math.ceil(windowMs / 1000)
        }
      },
      onLimitReached: (req: Request) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          endpoint: req.originalUrl,
          timestamp: new Date().toISOString()
        })
      }
    })
  }
  
  // Input sanitization
  static sanitizeInput(req: Request, res: Response, next: NextFunction) {
    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        return value.replace(/<script[^>]*>.*?<\/script>/gi, '')
                    .replace(/<[^>]*>/g, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+=/gi, '')
                    .trim()
      }
      if (typeof value === 'object' && value !== null) {
        const sanitized: any = {}
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeValue(val)
        }
        return sanitized
      }
      return value
    }
    
    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeValue(req.query)
    }
    
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeValue(req.body)
    }
    
    next()
  }
  
  // Detect suspicious patterns
  static detectSuspiciousActivity(req: Request, res: Response, next: NextFunction) {
    const suspiciousPatterns = [
      /\b(script|javascript|vbscript|onload|onerror|onclick)\b/i,
      /\b(union|select|insert|update|delete|drop|create|alter)\b/i,
      /<script[^>]*>.*?<\/script>/gi,
      /\b(eval|setTimeout|setInterval)\s*\(/i,
      /\b(document\.cookie|document\.write)\b/i
    ]
    
    const checkSuspiciousContent = (content: string, context: string): boolean => {
      return suspiciousPatterns.some(pattern => {
        if (pattern.test(content)) {
          logger.warn('Suspicious content detected', {
            context,
            content: content.substring(0, 200),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
          })
          return true
        }
        return false
      })
    }
    
    // Check URL parameters
    const queryString = req.url.split('?')[1]
    if (queryString && checkSuspiciousContent(queryString, 'query')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUSPICIOUS_INPUT',
          message: 'Suspicious content detected in request',
          timestamp: new Date().toISOString()
        }
      })
    }
    
    // Check request body
    if (req.body && typeof req.body === 'object') {
      const bodyString = JSON.stringify(req.body)
      if (checkSuspiciousContent(bodyString, 'body')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SUSPICIOUS_INPUT',
            message: 'Suspicious content detected in request body',
            timestamp: new Date().toISOString()
          }
        })
      }
    }
    
    next()
  }
  
  // CORS configuration
  static configureCORS() {
    const allowedOrigins = [
      'https://satyashield.com',
      'https://www.satyashield.com',
      'https://app.satyashield.com',
      ...(process.env.NODE_ENV === 'development' ? [
        'http://localhost:3000',
        'http://localhost:8080'
      ] : [])
    ]
    
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin
      
      if (allowedOrigins.includes(origin as string)) {
        res.setHeader('Access-Control-Allow-Origin', origin as string)
      }
      
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader(
        'Access-Control-Allow-Methods', 
        'GET, POST, PUT, DELETE, OPTIONS, PATCH'
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control'
      )
      
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Max-Age', '86400')
        return res.status(200).end()
      }
      
      next()
    }
  }
}

// Export individual middleware functions
export const helmetSecurity = SecurityMiddleware.configureHelmet()
export const customHeaders = SecurityMiddleware.customHeaders
export const rateLimiter = SecurityMiddleware.createRateLimiter()
export const authRateLimiter = SecurityMiddleware.createRateLimiter(15 * 60 * 1000, 5) // 5 requests per 15 minutes for auth
export const sanitizeInput = SecurityMiddleware.sanitizeInput
export const detectSuspicious = SecurityMiddleware.detectSuspiciousActivity
export const corsConfig = SecurityMiddleware.configureCORS()
