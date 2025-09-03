import Redis from 'ioredis'
import { logger } from '../middleware/logger'

const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379'

class RedisClient {
  public client: Redis
  public subscriber: Redis
  public publisher: Redis

  constructor() {
    const config = {
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4,
    }

    this.client = new Redis(REDIS_URI, {
      ...config,
      db: 0, // Main database
    })

    this.subscriber = new Redis(REDIS_URI, {
      ...config,
      db: 1, // Pub/Sub database
    })

    this.publisher = new Redis(REDIS_URI, {
      ...config,
      db: 1, // Pub/Sub database
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Main client events
    this.client.on('connect', () => {
      logger.info('Redis client connected')
    })

    this.client.on('ready', () => {
      logger.info('Redis client ready')
    })

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error)
    })

    this.client.on('close', () => {
      logger.warn('Redis client connection closed')
    })

    this.client.on('reconnecting', (delay) => {
      logger.info(`Redis client reconnecting in ${delay}ms`)
    })

    // Subscriber events
    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected')
    })

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error)
    })

    // Publisher events
    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected')
    })

    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error:', error)
    })
  }

  public async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ])
      logger.info('All Redis connections established')
    } catch (error) {
      logger.error('Failed to connect to Redis:', error)
      throw error
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.quit(),
        this.subscriber.quit(),
        this.publisher.quit()
      ])
      logger.info('All Redis connections closed')
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error)
      throw error
    }
  }

  // Cache methods
  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key)
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error)
      return null
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value)
      } else {
        await this.client.set(key, value)
      }
      return true
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error)
      return false
    }
  }

  public async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key)
      return result > 0
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error)
      return false
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key)
      return result === 1
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error)
      return false
    }
  }

  public async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field)
    } catch (error) {
      logger.error(`Redis HGET error for key ${key}, field ${field}:`, error)
      return null
    }
  }

  public async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.client.hset(key, field, value)
      return true
    } catch (error) {
      logger.error(`Redis HSET error for key ${key}, field ${field}:`, error)
      return false
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key)
    } catch (error) {
      logger.error(`Redis HGETALL error for key ${key}:`, error)
      return {}
    }
  }

  // List operations
  public async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lpush(key, ...values)
    } catch (error) {
      logger.error(`Redis LPUSH error for key ${key}:`, error)
      return 0
    }
  }

  public async rpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.rpush(key, ...values)
    } catch (error) {
      logger.error(`Redis RPUSH error for key ${key}:`, error)
      return 0
    }
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lrange(key, start, stop)
    } catch (error) {
      logger.error(`Redis LRANGE error for key ${key}:`, error)
      return []
    }
  }

  // Set operations
  public async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members)
    } catch (error) {
      logger.error(`Redis SADD error for key ${key}:`, error)
      return 0
    }
  }

  public async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key)
    } catch (error) {
      logger.error(`Redis SMEMBERS error for key ${key}:`, error)
      return []
    }
  }

  // Pub/Sub methods
  public async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(channel, message)
    } catch (error) {
      logger.error(`Redis PUBLISH error for channel ${channel}:`, error)
      return 0
    }
  }

  public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      await this.subscriber.subscribe(channel)
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(message)
        }
      })
    } catch (error) {
      logger.error(`Redis SUBSCRIBE error for channel ${channel}:`, error)
    }
  }

  // Pattern matching
  public async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern)
    } catch (error) {
      logger.error(`Redis KEYS error for pattern ${pattern}:`, error)
      return []
    }
  }

  // Expiration
  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds)
      return result === 1
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error)
      return false
    }
  }

  public async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key)
    } catch (error) {
      logger.error(`Redis TTL error for key ${key}:`, error)
      return -1
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient()

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect()
}

export const disconnectRedis = async (): Promise<void> => {
  await redisClient.disconnect()
}

export default redisClient
