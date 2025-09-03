import 'dotenv/config'
import App from './app'
import { logger } from './middleware/logger'

const PORT = parseInt(process.env.PORT || '5000', 10)
const NODE_ENV = process.env.NODE_ENV || 'development'

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'REDIS_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
]

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

// Initialize and start the application
const app = new App()

app.listen(PORT)

logger.info(`Environment: ${NODE_ENV}`)
logger.info(`MongoDB URI: ${process.env.MONGODB_URI?.replace(/\/\/.*@/, '//**:**@')}`)
logger.info(`Redis URI: ${process.env.REDIS_URI?.replace(/\/\/.*@/, '//**:**@')}`)

export default app
