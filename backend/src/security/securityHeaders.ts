import { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import { logger } from '../middleware/logger'

export class SecurityHeaders {
  
  static configureHelmet() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "https://api.satyashield.com", "wss://api.satyashield.com"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: []
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
          usb: ['none']
        }
      }
    })
  }
  
  static customSecurityHeaders(req: Request, res: Response, next: NextFunction) {
    // Remove server fingerprinting
    res.removeHeader('X-Powered-By')
    res.removeHeader('Server')
    
    // Custom security headers
    res.setHeader('X-Content-Security-Policy-Report-Only', 'default-src \'self\'')
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('X-Download-Options', 'noopen')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    
    // Security event logging
    if (req.headers['x-forwarded-for'] || req.connection.remoteAddress) {
      logger.info('Security headers applied', {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        method: req.method,
        url: req.originalUrl
      })
    }
    
    next()
  }
  
  static validateOrigin(req: Request, res: Response, next: NextFunction) {
    const allowedOrigins = [
      'https://satyashield.com',
      'https://www.satyashield.com',
      'https://app.satyashield.com'
    ]
    
    const origin = req.headers.origin
    
    if (req.method === 'OPTIONS') {
      // Handle preflight requests
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
        res.setHeader('Access-Control-Max-Age', '86400')
      }
      res.status(204).send()
      return
    }
    
    if (origin && !allowedOrigins.includes(origin)) {
      logger.warn('Blocked request from unauthorized origin', { origin, ip: req.ip })
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origin not allowed',
          timestamp: new Date()
        }
      })
      return
    }
    
    next()
  }
  
  static detectSuspiciousActivity(req: Request, res: Response, next: NextFunction) {
    const suspiciousPatterns = [
      /\b(script|javascript|vbscript|onload|onerror|onclick)\b/i,
      /\b(union|select|insert|update|delete|drop|create|alter)\b/i,
      /<script[^>]*>.*?<\/script>/gi,
      /\b(eval|setTimeout|setInterval)\s*\(/i
    ]
    
    const checkValue = (value: string, context: string) => {
      if (typeof value !== 'string') return false
      
      return suspiciousPatterns.some(pattern => {
        if (pattern.test(value)) {
          logger.warn('Suspicious activity detected', {
            context,
            value: value.substring(0, 100),
            ip: req.ip,
            userAgent: req.headers['user-agent']
          })
          return true
        }
        return false
      })
    }
    
    // Check query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (checkValue(String(value), `query.${key}`)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SUSPICIOUS_INPUT',
            message: 'Suspicious content detected',
            timestamp: new Date()
          }
        })
        return
      }
    }
    
    // Check request body
    if (req.body && typeof req.body === 'object') {
      const checkObject = (obj: any, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            if (checkValue(value, `${prefix}${key}`)) {
              return true
            }
          } else if (typeof value === 'object' && value !== null) {
            if (checkObject(value, `${prefix}${key}.`)) {
              return true
            }
          }
        }
        return false
      }
      
      if (checkObject(req.body, 'body.')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SUSPICIOUS_INPUT',
            message: 'Suspicious content detected',
            timestamp: new Date()
          }
        })
        return
      }
    }
    
    next()
  }
}
