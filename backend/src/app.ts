import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { Server } from 'socket.io'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'

// Import configurations
import { connectDatabase } from './config/database'
import { connectRedis } from './config/redis'
import { setupPassport } from './config/jwt'

// Import middlewares
import { errorHandler } from './middleware/errorHandler'
import { logger, requestLogger } from './middleware/logger'
import { authMiddleware } from './middleware/auth'
import { validateRequest } from './middleware/validation'

// Import routes
import authRoutes from './routes/authRoutes'
import fraudRoutes from './routes/fraudRoutes'
import advisorRoutes from './routes/advisorRoutes'
import deepfakeRoutes from './routes/deepfakeRoutes'
import socialRoutes from './routes/socialRoutes'
import ipoRoutes from './routes/ipoRoutes'
import tradingAppRoutes from './routes/tradingAppRoutes'
import corporateRoutes from './routes/corporateRoutes'
import reportRoutes from './routes/reportRoutes'

// Import WebSocket handlers
import { setupSocketHandlers } from './websocket/socketHandler'

// Import job schedulers
import './jobs/fraudScanJob'
import './jobs/socialMediaScanJob'
import './jobs/advisorUpdateJob'
import './jobs/reportGenerationJob'

class App {
  public app: Application
  public server: any
  public io: Server

  constructor() {
    this.app = express()
    this.server = createServer(this.app)
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    })

    this.initializeDatabase()
    this.initializeMiddlewares()
    this.initializeRoutes()
    this.initializeSwagger()
    this.initializeWebSocket()
    this.initializeErrorHandling()
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await connectDatabase()
      await connectRedis()
      logger.info('Database connections established')
    } catch (error) {
      logger.error('Database connection failed:', error)
      process.exit(1)
    }
  }

  private initializeMiddlewares(): void {
    // Security middlewares
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }))

    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL || 'https://satyashield.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      optionsSuccessStatus: 200
    }))

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP
      message: {
        error: 'Too many requests from this IP, please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false
    })
    this.app.use('/api/', limiter)

    // Body parsing middlewares
    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }))
    
    // Compression
    this.app.use(compression())

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }))
    }
    this.app.use(requestLogger)

    // Passport initialization
    setupPassport(this.app)

    // Trust proxy for production
    if (process.env.NODE_ENV === 'production') {
      this.app.set('trust proxy', 1)
    }
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      })
    })

    // API routes
    this.app.use('/api/auth', authRoutes)
    this.app.use('/api/fraud', authMiddleware, fraudRoutes)
    this.app.use('/api/advisors', authMiddleware, advisorRoutes)
    this.app.use('/api/deepfake', authMiddleware, deepfakeRoutes)
    this.app.use('/api/social', authMiddleware, socialRoutes)
    this.app.use('/api/ipo', authMiddleware, ipoRoutes)
    this.app.use('/api/trading-apps', authMiddleware, tradingAppRoutes)
    this.app.use('/api/corporate', authMiddleware, corporateRoutes)
    this.app.use('/api/reports', authMiddleware, reportRoutes)

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
          timestamp: new Date().toISOString()
        }
      })
    })
  }

  private initializeSwagger(): void {
    const options = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'SatyaShield API',
          version: '1.0.0',
          description: 'Securities Market Fraud Detection Platform API',
          contact: {
            name: 'SatyaShield Team',
            email: 'support@satyashield.com'
          }
        },
        servers: [
          {
            url: process.env.API_URL || 'http://localhost:5000/api',
            description: 'Development server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        },
        security: [
          {
            bearerAuth: []
          }
        ]
      },
      apis: ['./src/routes/*.ts', './src/models/*.ts']
    }

    const specs = swaggerJsdoc(options)
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      explorer: true,
      customSiteTitle: 'SatyaShield API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true
      }
    }))
  }

  private initializeWebSocket(): void {
    setupSocketHandlers(this.io)
    
    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`)
      
      socket.on('disconnect', (reason) => {
        logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`)
      })

      socket.on('error', (error) => {
        logger.error(`WebSocket error for client ${socket.id}:`, error)
      })
    })
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler)

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this))
    process.on('SIGINT', this.gracefulShutdown.bind(this))
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error)
      this.gracefulShutdown()
    })
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
      this.gracefulShutdown()
    })
  }

  private gracefulShutdown(): void {
    logger.info('Starting graceful shutdown...')
    
    this.server.close(() => {
      logger.info('HTTP server closed')
      
      // Close database connections
      // mongoose.connection.close()
      // redisClient.quit()
      
      logger.info('Graceful shutdown completed')
      process.exit(0)
    })

    // Force close after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down')
      process.exit(1)
    }, 30000)
  }

  public listen(port: number): void {
    this.server.listen(port, () => {
      logger.info(`🚀 SatyaShield Backend running on port ${port}`)
      logger.info(`📚 API Documentation available at http://localhost:${port}/api-docs`)
      logger.info(`🔍 Health check available at http://localhost:${port}/health`)
    })
  }

  public getServer() {
    return this.server
  }

  public getSocketIO() {
    return this.io
  }
}

export default App
