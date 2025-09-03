import mongoose from 'mongoose'
import { logger } from '../middleware/logger'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/satyashield'

export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', false)
    
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0,
      autoIndex: process.env.NODE_ENV !== 'production'
    }

    await mongoose.connect(MONGODB_URI, options)
    
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully')
    })

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error)
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected')
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close()
      logger.info('MongoDB connection closed through app termination')
      process.exit(0)
    })

  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error)
    throw error
  }
}

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect()
    logger.info('MongoDB disconnected')
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error)
    throw error
  }
}

export { mongoose }
