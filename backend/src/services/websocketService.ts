import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { User } from '../models/User'
import { FraudAlert } from '../models/FraudAlert'
import { logger } from '../middleware/logger'
import redisClient from '../config/redis'
import { Types } from 'mongoose'

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string
    email: string
    role: string
  }
}

export interface SocketEventData {
  type: string
  payload: any
  timestamp: Date
  userId?: string
  room?: string
}

export class WebSocketService {
  private static instance: WebSocketService
  private io: SocketIOServer | null = null
  private connectedUsers: Map<string, Set<string>> = new Map() // userId -> set of socketIds
  private socketUserMap: Map<string, string> = new Map() // socketId -> userId
  private rooms: Map<string, Set<string>> = new Map() // roomId -> set of socketIds

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService()
    }
    return WebSocketService.instance
  }

  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true
    })

    this.setupMiddleware()
    this.setupEventHandlers()
    
    logger.info('WebSocket service initialized')
  }

  private setupMiddleware(): void {
    if (!this.io) return

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '')
        
        if (!token) {
          return next(new Error('Authentication token required'))
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        const user = await User.findById(decoded.id).select('-password')
        
        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'))
        }

        socket.user = {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        }

        next()
      } catch (error) {
        logger.error('WebSocket authentication failed', { error: error.message })
        next(new Error('Authentication failed'))
      }
    })

    // Rate limiting middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      const userId = socket.user?.id
      if (!userId) return next()

      const key = `ws_rate_limit:${userId}`
      const current = await redisClient.get(key)
      
      if (current && parseInt(current) > 100) { // 100 messages per minute
        return next(new Error('Rate limit exceeded'))
      }

      next()
    })
  }

  private setupEventHandlers(): void {
    if (!this.io) return

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket)
    })
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.user!.id
    const socketId = socket.id

    logger.info('WebSocket client connected', { 
      userId, 
      socketId, 
      userAgent: socket.handshake.headers['user-agent'] 
    })

    // Track user connection
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set())
    }
    this.connectedUsers.get(userId)!.add(socketId)
    this.socketUserMap.set(socketId, userId)

    // Join user-specific room
    socket.join(`user:${userId}`)

    // Join role-based rooms
    const userRole = socket.user!.role
    socket.join(`role:${userRole}`)

    // Set up event listeners
    this.setupSocketEventListeners(socket)

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason)
    })

    // Send initial connection confirmation
    socket.emit('connected', {
      message: 'Successfully connected to SatyaShield',
      userId,
      timestamp: new Date(),
      serverTime: Date.now()
    })
  }

  private setupSocketEventListeners(socket: AuthenticatedSocket): void {
    const userId = socket.user!.id

    // Join specific rooms
    socket.on('join_room', async (data: { room: string }) => {
      try {
        const { room } = data
        
        // Validate room access
        if (await this.canJoinRoom(userId, room)) {
          socket.join(room)
          
          if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set())
          }
          this.rooms.get(room)!.add(socket.id)

          socket.emit('room_joined', { room, timestamp: new Date() })
          logger.info('User joined room', { userId, room, socketId: socket.id })
        } else {
          socket.emit('error', { message: 'Access denied to room', room })
        }
      } catch (error) {
        logger.error('Error joining room', { userId, error: error.message })
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // Leave room
    socket.on('leave_room', (data: { room: string }) => {
      const { room } = data
      socket.leave(room)
      
      if (this.rooms.has(room)) {
        this.rooms.get(room)!.delete(socket.id)
      }

      socket.emit('room_left', { room, timestamp: new Date() })
      logger.info('User left room', { userId, room, socketId: socket.id })
    })

    // Real-time alert acknowledgment
    socket.on('alert_acknowledged', async (data: { alertId: string }) => {
      try {
        const alert = await FraudAlert.findById(data.alertId)
        if (alert && alert.userId.toString() === userId) {
          // Update alert acknowledgment in database
          await FraudAlert.findByIdAndUpdate(data.alertId, {
            $addToSet: { 'metadata.acknowledgedBy': userId },
            'metadata.acknowledgedAt': new Date()
          })

          socket.emit('alert_ack_confirmed', { 
            alertId: data.alertId, 
            timestamp: new Date() 
          })
        }
      } catch (error) {
        logger.error('Error acknowledging alert', { userId, alertId: data.alertId, error: error.message })
      }
    })

    // Subscribe to specific alert types
    socket.on('subscribe_alerts', (data: { alertTypes: string[], severities: string[] }) => {
      socket.join(`alerts:${userId}`)
      
      // Store subscription preferences in Redis
      redisClient.hset(`user_subscriptions:${userId}`, {
        alertTypes: JSON.stringify(data.alertTypes),
        severities: JSON.stringify(data.severities),
        subscribedAt: Date.now()
      })

      socket.emit('subscription_confirmed', { 
        alertTypes: data.alertTypes, 
        severities: data.severities,
        timestamp: new Date()
      })
    })

    // Heartbeat/ping handling
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() })
    })

    // Rate limiting for user messages
    socket.on('user_message', async (data) => {
      await this.handleRateLimit(userId, 'message')
      // Handle user messages here
    })

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket client error', { 
        userId, 
        socketId: socket.id, 
        error: error.message 
      })
    })
  }

  private handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
    const userId = socket.user!.id
    const socketId = socket.id

    logger.info('WebSocket client disconnected', { 
      userId, 
      socketId, 
      reason 
    })

    // Remove from tracking
    if (this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId)!.delete(socketId)
      if (this.connectedUsers.get(userId)!.size === 0) {
        this.connectedUsers.delete(userId)
      }
    }

    this.socketUserMap.delete(socketId)

    // Remove from rooms
    for (const [room, sockets] of this.rooms.entries()) {
      sockets.delete(socketId)
      if (sockets.size === 0) {
        this.rooms.delete(room)
      }
    }
  }

  // Public methods for broadcasting events

  async broadcastAlert(alert: FraudAlert): Promise<void> {
    if (!this.io) return

    const eventData: SocketEventData = {
      type: 'fraud_alert',
      payload: {
        id: alert._id,
        alertType: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        riskScore: alert.riskScore,
        detectionTime: alert.detectionTime,
        status: alert.status
      },
      timestamp: new Date(),
      userId: alert.userId.toString()
    }

    // Send to specific user
    this.io.to(`user:${alert.userId}`).emit('fraud_alert', eventData)

    // Send to relevant role-based rooms (investigators, analysts)
    if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
      this.io.to('role:INVESTIGATOR').emit('fraud_alert', eventData)
      this.io.to('role:ANALYST').emit('fraud_alert', eventData)
      this.io.to('role:ADMIN').emit('fraud_alert', eventData)
    }

    // Cache the alert for offline users
    await this.cacheAlertForOfflineUsers(alert)

    logger.info('Fraud alert broadcasted', { 
      alertId: alert._id, 
      userId: alert.userId, 
      severity: alert.severity 
    })
  }

  async broadcastRiskScoreUpdate(userId: string, riskData: any): Promise<void> {
    if (!this.io) return

    const eventData: SocketEventData = {
      type: 'risk_score_update',
      payload: riskData,
      timestamp: new Date(),
      userId
    }

    this.io.to(`user:${userId}`).emit('risk_score_update', eventData)
  }

  async broadcastSystemStatus(status: any): Promise<void> {
    if (!this.io) return

    const eventData: SocketEventData = {
      type: 'system_status',
      payload: status,
      timestamp: new Date()
    }

    this.io.emit('system_status', eventData)
  }

  async sendPersonalNotification(userId: string, notification: any): Promise<void> {
    if (!this.io) return

    const eventData: SocketEventData = {
      type: 'personal_notification',
      payload: notification,
      timestamp: new Date(),
      userId
    }

    this.io.to(`user:${userId}`).emit('personal_notification', eventData)

    // If user is offline, cache the notification
    if (!this.connectedUsers.has(userId)) {
      await this.cacheNotificationForOfflineUser(userId, notification)
    }
  }

  async broadcastToRoom(room: string, eventType: string, data: any): Promise<void> {
    if (!this.io) return

    const eventData: SocketEventData = {
      type: eventType,
      payload: data,
      timestamp: new Date(),
      room
    }

    this.io.to(room).emit(eventType, eventData)
  }

  // Utility methods

  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size
  }

  getUserSocketCount(userId: string): number {
    return this.connectedUsers.get(userId)?.size || 0
  }

  getConnectionStats(): any {
    return {
      totalConnections: this.socketUserMap.size,
      uniqueUsers: this.connectedUsers.size,
      totalRooms: this.rooms.size,
      timestamp: new Date()
    }
  }

  private async canJoinRoom(userId: string, room: string): Promise<boolean> {
    // Implement room access control logic
    const user = await User.findById(userId)
    if (!user) return false

    // Check if user has permission to join specific rooms
    const publicRooms = ['general', 'alerts']
    const roleBasedRooms = [`role:${user.role}`]
    const userRoom = `user:${userId}`

    return publicRooms.includes(room) || 
           roleBasedRooms.includes(room) || 
           room === userRoom ||
           (user.role === 'ADMIN') // Admins can join any room
  }

  private async handleRateLimit(userId: string, action: string): Promise<void> {
    const key = `ws_rate_limit:${userId}:${action}`
    const current = await redisClient.incr(key)
    
    if (current === 1) {
      await redisClient.expire(key, 60) // 1 minute window
    }
  }

  private async cacheAlertForOfflineUsers(alert: FraudAlert): Promise<void> {
    const key = `offline_alerts:${alert.userId}`
    const alertData = {
      id: alert._id,
      alertType: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      riskScore: alert.riskScore,
      timestamp: Date.now()
    }

    await redisClient.lpush(key, JSON.stringify(alertData))
    await redisClient.ltrim(key, 0, 99) // Keep last 100 alerts
    await redisClient.expire(key, 86400 * 7) // 7 days
  }

  private async cacheNotificationForOfflineUser(userId: string, notification: any): Promise<void> {
    const key = `offline_notifications:${userId}`
    const notificationData = {
      ...notification,
      timestamp: Date.now()
    }

    await redisClient.lpush(key, JSON.stringify(notificationData))
    await redisClient.ltrim(key, 0, 49) // Keep last 50 notifications
    await redisClient.expire(key, 86400 * 3) // 3 days
  }

  async getOfflineAlerts(userId: string): Promise<any[]> {
    const key = `offline_alerts:${userId}`
    const alerts = await redisClient.lrange(key, 0, -1)
    
    // Clear the cache after retrieving
    await redisClient.del(key)
    
    return alerts.map(alert => JSON.parse(alert))
  }

  async getOfflineNotifications(userId: string): Promise<any[]> {
    const key = `offline_notifications:${userId}`
    const notifications = await redisClient.lrange(key, 0, -1)
    
    // Clear the cache after retrieving
    await redisClient.del(key)
    
    return notifications.map(notification => JSON.parse(notification))
  }

  shutdown(): void {
    if (this.io) {
      this.io.close()
      this.io = null
    }
    
    this.connectedUsers.clear()
    this.socketUserMap.clear()
    this.rooms.clear()
    
    logger.info('WebSocket service shut down')
  }
}

export default WebSocketService.getInstance()
