import { Request, Response, NextFunction } from 'express'
import { Types } from 'mongoose'
import { validationResult } from 'express-validator'
import { FraudAlert, AlertType, AlertSeverity, AlertStatus } from '../models/FraudAlert'
import FraudDetectionService from '../services/fraudDetectionService'
import { logger } from '../middleware/logger'
import { ApiResponse, PaginationParams } from '../types/api'
import redisClient from '../config/redis'

export class FraudController {
  
  // Create fraud alert
  async createAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            timestamp: new Date()
          }
        })
        return
      }

      const userId = new Types.ObjectId((req as any).user.id)
      const { alertType, severity, title, description, evidenceData } = req.body

      // Analyze the fraud data
      let analysisResult
      
      switch (alertType) {
        case AlertType.ADVISOR_FRAUD:
          analysisResult = await FraudDetectionService.analyzeAdvisorFraud(evidenceData.advisorDetails)
          break
        case AlertType.SOCIAL_MEDIA_SCAM:
          analysisResult = await FraudDetectionService.analyzeSocialMediaFraud(evidenceData.socialData)
          break
        case AlertType.DEEPFAKE_DETECTED:
          analysisResult = await FraudDetectionService.analyzeDeepfake(evidenceData.mediaData)
          break
        default:
          // For manual alerts, use provided data
          analysisResult = {
            riskScore: 50, // Default risk score for manual alerts
            alertType,
            severity: severity || AlertSeverity.MEDIUM,
            threats: [],
            recommendations: [],
            confidence: 0.5
          }
      }

      // Create fraud alert
      const alert = await FraudDetectionService.createFraudAlert(
        userId,
        analysisResult,
        evidenceData
      )

      const response: ApiResponse = {
        success: true,
        data: {
          id: alert._id,
          alertType: alert.alertType,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          riskScore: alert.riskScore,
          status: alert.status,
          detectionTime: alert.detectionTime,
          createdAt: alert.createdAt
        }
      }

      logger.info('Fraud alert created successfully', { 
        alertId: alert._id, 
        userId, 
        riskScore: alert.riskScore 
      })

      res.status(201).json(response)

    } catch (error) {
      logger.error('Error creating fraud alert', { error: error.message, userId: (req as any).user?.id })
      next(error)
    }
  }

  // Get fraud alerts with pagination and filtering
  async getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id
      const userRole = (req as any).user.role

      const {
        page = 1,
        limit = 20,
        severity,
        status,
        alertType,
        search,
        dateFrom,
        dateTo,
        sortBy = 'detectionTime',
        sortOrder = 'desc'
      } = req.query

      // Build filter query
      const filter: any = {}
      
      // Role-based access control
      if (userRole === 'INVESTOR') {
        filter.userId = new Types.ObjectId(userId)
      } else if (userRole === 'INVESTIGATOR' || userRole === 'ANALYST') {
        filter.$or = [
          { userId: new Types.ObjectId(userId) },
          { assignedInvestigator: new Types.ObjectId(userId) },
          { status: { $in: [AlertStatus.ACTIVE, AlertStatus.INVESTIGATING] } }
        ]
      }
      // ADMIN and SUPER_ADMIN can see all alerts (no additional filter)

      if (severity) filter.severity = severity
      if (status) filter.status = status
      if (alertType) filter.alertType = alertType

      // Date range filter
      if (dateFrom || dateTo) {
        filter.detectionTime = {}
        if (dateFrom) filter.detectionTime.$gte = new Date(dateFrom as string)
        if (dateTo) filter.detectionTime.$lte = new Date(dateTo as string)
      }

      // Text search
      if (search) {
        filter.$text = { $search: search as string }
      }

      // Calculate pagination
      const pageNum = Math.max(1, parseInt(page as string))
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)))
      const skip = (pageNum - 1) * limitNum

      // Build sort object
      const sort: any = {}
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1

      // Execute query with caching
      const cacheKey = `alerts:${userId}:${JSON.stringify(filter)}:${pageNum}:${limitNum}:${sortBy}:${sortOrder}`
      const cached = await redisClient.get(cacheKey)
      
      if (cached) {
        logger.info('Returning cached fraud alerts', { userId, page: pageNum })
        res.json(JSON.parse(cached))
        return
      }

      // Execute queries
      const [alerts, totalCount] = await Promise.all([
        FraudAlert.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .select('alertType severity title description riskScore status detectionTime createdAt updatedAt')
          .lean(),
        FraudAlert.countDocuments(filter)
      ])

      const totalPages = Math.ceil(totalCount / limitNum)
      
      const response: ApiResponse = {
        success: true,
        data: {
          alerts,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            totalPages,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1
          }
        }
      }

      // Cache for 5 minutes
      await redisClient.set(cacheKey, JSON.stringify(response), 300)

      logger.info('Fraud alerts retrieved', { 
        userId, 
        count: alerts.length, 
        page: pageNum 
      })

      res.json(response)

    } catch (error) {
      logger.error('Error getting fraud alerts', { error: error.message, userId: (req as any).user?.id })
      next(error)
    }
  }

  // Get single alert by ID
  async getAlertById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { alertId } = req.params
      const userId = (req as any).user.id
      const userRole = (req as any).user.role

      if (!Types.ObjectId.isValid(alertId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid alert ID format',
            timestamp: new Date()
          }
        })
        return
      }

      // Check cache first
      const cacheKey = `alert:${alertId}`
      const cached = await redisClient.get(cacheKey)
      let alert

      if (cached) {
        alert = JSON.parse(cached)
      } else {
        alert = await FraudAlert.findById(alertId).lean()
        
        if (alert) {
          await redisClient.set(cacheKey, JSON.stringify(alert), 3600) // Cache for 1 hour
        }
      }

      if (!alert) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Alert not found',
            timestamp: new Date()
          }
        })
        return
      }

      // Access control
      const hasAccess = userRole === 'ADMIN' || 
                       userRole === 'SUPER_ADMIN' || 
                       alert.userId.toString() === userId ||
                       alert.assignedInvestigator?.toString() === userId ||
                       (userRole === 'INVESTIGATOR' && ['ACTIVE', 'INVESTIGATING'].includes(alert.status))

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Access denied to this alert',
            timestamp: new Date()
          }
        })
        return
      }

      const response: ApiResponse = {
        success: true,
        data: alert
      }

      res.json(response)

    } catch (error) {
      logger.error('Error getting alert by ID', { 
        error: error.message, 
        alertId: req.params.alertId 
      })
      next(error)
    }
  }

  // Update alert status
  async updateAlertStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
            timestamp: new Date()
          }
        })
        return
      }

      const { alertId } = req.params
      const { status, investigationNotes, resolution, assignedInvestigator } = req.body
      const userId = (req as any).user.id
      const userRole = (req as any).user.role

      if (!Types.ObjectId.isValid(alertId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid alert ID format',
            timestamp: new Date()
          }
        })
        return
      }

      const alert = await FraudAlert.findById(alertId)

      if (!alert) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Alert not found',
            timestamp: new Date()
          }
        })
        return
      }

      // Access control for status updates
      const canUpdate = userRole === 'ADMIN' || 
                        userRole === 'SUPER_ADMIN' || 
                        userRole === 'INVESTIGATOR' ||
                        alert.assignedInvestigator?.toString() === userId

      if (!canUpdate) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Access denied to update this alert',
            timestamp: new Date()
          }
        })
        return
      }

      // Update fields
      const updateData: any = { status }
      
      if (investigationNotes) updateData.investigationNotes = investigationNotes
      if (resolution) updateData.resolution = resolution
      if (assignedInvestigator) updateData.assignedInvestigator = new Types.ObjectId(assignedInvestigator)

      // Add audit trail
      if (!updateData.metadata) updateData.metadata = {}
      updateData.metadata.lastUpdatedBy = userId
      updateData.metadata.statusHistory = [
        ...(alert.metadata?.statusHistory || []),
        {
          status: alert.status,
          changedTo: status,
          changedBy: userId,
          timestamp: new Date(),
          notes: investigationNotes
        }
      ]

      const updatedAlert = await FraudAlert.findByIdAndUpdate(
        alertId,
        updateData,
        { new: true, runValidators: true }
      )

      // Clear cache
      await redisClient.del(`alert:${alertId}`)

      const response: ApiResponse = {
        success: true,
        data: updatedAlert
      }

      logger.info('Alert status updated', { 
        alertId, 
        oldStatus: alert.status, 
        newStatus: status, 
        updatedBy: userId 
      })

      res.json(response)

    } catch (error) {
      logger.error('Error updating alert status', { 
        error: error.message, 
        alertId: req.params.alertId 
      })
      next(error)
    }
  }

  // Get fraud statistics
  async getStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id
      const userRole = (req as any).user.role
      const { timeRange = '30d' } = req.query

      // Calculate date range
      const now = new Date()
      let startDate: Date
      
      switch (timeRange) {
        case '1d':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }

      // Build filter based on user role
      const filter: any = {
        detectionTime: { $gte: startDate }
      }

      if (userRole === 'INVESTOR') {
        filter.userId = new Types.ObjectId(userId)
      }

      // Check cache
      const cacheKey = `fraud_stats:${userRole}:${userId}:${timeRange}`
      const cached = await redisClient.get(cacheKey)
      
      if (cached) {
        logger.info('Returning cached fraud statistics', { userId, timeRange })
        res.json(JSON.parse(cached))
        return
      }

      // Get statistics
      const [
        totalAlerts,
        alertsByType,
        alertsBySeverity,
        alertsByStatus,
        trendsData
      ] = await Promise.all([
        FraudAlert.countDocuments(filter),
        FraudAlert.aggregate([
          { $match: filter },
          { $group: { _id: '$alertType', count: { $sum: 1 } } }
        ]),
        FraudAlert.aggregate([
          { $match: filter },
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]),
        FraudAlert.aggregate([
          { $match: filter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        FraudAlert.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectionTime' } },
              count: { $sum: 1 },
              avgRiskScore: { $avg: '$riskScore' }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: 30 }
        ])
      ])

      // Format results
      const statistics = {
        totalAlerts,
        alertsByType: alertsByType.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        alertsBySeverity: alertsBySeverity.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        alertsByStatus: alertsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        trendsLast30Days: trendsData.map(item => ({
          date: item._id,
          count: item.count,
          avgRiskScore: Math.round(item.avgRiskScore * 100) / 100
        }))
      }

      const response: ApiResponse = {
        success: true,
        data: statistics
      }

      // Cache for 1 hour
      await redisClient.set(cacheKey, JSON.stringify(response), 3600)

      logger.info('Fraud statistics retrieved', { userId, timeRange, totalAlerts })

      res.json(response)

    } catch (error) {
      logger.error('Error getting fraud statistics', { error: error.message, userId: (req as any).user?.id })
      next(error)
    }
  }

  // Delete alert (soft delete)
  async deleteAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { alertId } = req.params
      const userId = (req as any).user.id
      const userRole = (req as any).user.role

      if (!Types.ObjectId.isValid(alertId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid alert ID format',
            timestamp: new Date()
          }
        })
        return
      }

      const alert = await FraudAlert.findById(alertId)

      if (!alert) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Alert not found',
            timestamp: new Date()
          }
        })
        return
      }

      // Only admins and alert creators can delete
      const canDelete = userRole === 'ADMIN' || 
                       userRole === 'SUPER_ADMIN' || 
                       alert.userId.toString() === userId

      if (!canDelete) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Access denied to delete this alert',
            timestamp: new Date()
          }
        })
        return
      }

      // Soft delete by updating status
      await FraudAlert.findByIdAndUpdate(alertId, {
        status: 'CLOSED',
        'metadata.deletedBy': userId,
        'metadata.deletedAt': new Date()
      })

      // Clear cache
      await redisClient.del(`alert:${alertId}`)

      logger.info('Alert deleted', { alertId, deletedBy: userId })

      res.json({
        success: true,
        message: 'Alert deleted successfully'
      })

    } catch (error) {
      logger.error('Error deleting alert', { 
        error: error.message, 
        alertId: req.params.alertId 
      })
      next(error)
    }
  }

  // Export alerts
  async exportAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id
      const userRole = (req as any).user.role
      const { format = 'csv', ...filters } = req.query

      // Build filter (similar to getAlerts)
      const filter: any = {}
      
      if (userRole === 'INVESTOR') {
        filter.userId = new Types.ObjectId(userId)
      }

      // Apply other filters
      if (filters.severity) filter.severity = filters.severity
      if (filters.status) filter.status = filters.status
      if (filters.alertType) filter.alertType = filters.alertType

      const alerts = await FraudAlert.find(filter)
        .select('alertType severity title description riskScore status detectionTime createdAt')
        .lean()

      if (format === 'csv') {
        const csv = this.convertToCSV(alerts)
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', 'attachment; filename=fraud_alerts.csv')
        res.send(csv)
      } else {
        res.json({
          success: true,
          data: alerts
        })
      }

      logger.info('Alerts exported', { userId, format, count: alerts.length })

    } catch (error) {
      logger.error('Error exporting alerts', { error: error.message, userId: (req as any).user?.id })
      next(error)
    }
  }

  private convertToCSV(alerts: any[]): string {
    if (alerts.length === 0) return ''

    const headers = ['ID', 'Type', 'Severity', 'Title', 'Risk Score', 'Status', 'Detection Time']
    const rows = alerts.map(alert => [
      alert._id,
      alert.alertType,
      alert.severity,
      `"${alert.title}"`,
      alert.riskScore,
      alert.status,
      alert.detectionTime.toISOString()
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }
}

export default new FraudController()
