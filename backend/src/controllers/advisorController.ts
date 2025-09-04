import { Request, Response, NextFunction } from 'express'
import { validationResult } from 'express-validator'
import { Types } from 'mongoose'
import { AdvisorVerification } from '../models/AdvisorVerification'
import SEBIAPIService from '../services/sebiAPIService'
import { logger } from '../middleware/logger'
import { ApiResponse } from '../types/api'
import { catchAsync, ValidationError, NotFoundError } from '../middleware/errorHandler'
import redisClient from '../config/redis'
import multer from 'multer'
import csv from 'csv-parser'
import fs from 'fs'

const upload = multer({ dest: 'uploads/csv/' })

export class AdvisorController {

  // Verify single advisor
  static verifyAdvisor = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid input data', errors.array()[0].param, errors.array()[0].value)
    }

    const { searchType, sebiRegNumber, advisorName, panNumber } = req.body
    const userId = (req as any).user.id

    let searchResult
    
    switch (searchType) {
      case 'sebi':
        if (!sebiRegNumber) {
          throw new ValidationError('SEBI registration number is required', 'sebiRegNumber')
        }
        searchResult = await SEBIAPIService.verifyAdvisor(sebiRegNumber)
        break
        
      case 'name':
        if (!advisorName) {
          throw new ValidationError('Advisor name is required', 'advisorName')
        }
        const nameResults = await SEBIAPIService.searchAdvisors({ advisorName })
        searchResult = nameResults.length > 0 ? nameResults : null
        break
        
      case 'pan':
        if (!panNumber) {
          throw new ValidationError('PAN number is required', 'panNumber')
        }
        const panResults = await SEBIAPIService.searchAdvisors({ panNumber })
        searchResult = panResults.length > 0 ? panResults : null
        break
        
      default:
        throw new ValidationError('Invalid search type', 'searchType', searchType)
    }

    if (!searchResult) {
      throw new NotFoundError('Advisor')
    }

    // Log verification attempt
    await AdvisorVerification.create({
      userId: new Types.ObjectId(userId),
      searchType,
      searchValue: sebiRegNumber || advisorName || panNumber,
      result: Array.isArray(searchResult) ? searchResult : [searchResult],
      verificationDate: new Date()
    })

    const response: ApiResponse = {
      success: true,
      data: Array.isArray(searchResult) ? searchResult : [searchResult]
    }

    logger.info('Advisor verification completed', {
      userId,
      searchType,
      resultCount: Array.isArray(searchResult) ? searchResult.length : 1
    })

    res.json(response)
  })

  // Bulk advisor verification
  static bulkVerifyAdvisors = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const upload = multer({ dest: 'uploads/csv/' })
    
    upload.single('file')(req, res, async (err) => {
      if (err) {
        throw new ValidationError('File upload failed', 'file')
      }

      if (!req.file) {
        throw new ValidationError('CSV file is required', 'file')
      }

      const userId = (req as any).user.id
      const filePath = req.file.path
      const results: any[] = []

      try {
        // Parse CSV file
        const csvData: any[] = []
        
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => csvData.push(data))
            .on('end', resolve)
            .on('error', reject)
        })

        if (csvData.length === 0) {
          throw new ValidationError('CSV file is empty or invalid format', 'file')
        }

        // Validate CSV headers
        const requiredHeaders = ['sebi_reg_number', 'advisor_name', 'pan_number']
        const headers = Object.keys(csvData[0])
        const missingHeaders = requiredHeaders.filter(header => !headers.includes(header))
        
        if (missingHeaders.length > 0) {
          throw new ValidationError(
            `Missing required CSV headers: ${missingHeaders.join(', ')}`,
            'file'
          )
        }

        // Process each row
        for (const row of csvData.slice(0, 100)) { // Limit to 100 advisors per request
          try {
            let advisor = null
            const searchData = {
              input: row,
              advisor: null,
              error: null
            }

            // Try SEBI number first
            if (row.sebi_reg_number && row.sebi_reg_number.trim()) {
              advisor = await SEBIAPIService.verifyAdvisor(row.sebi_reg_number.trim())
            }

            // Try name if SEBI lookup failed
            if (!advisor && row.advisor_name && row.advisor_name.trim()) {
              const nameResults = await SEBIAPIService.searchAdvisors({ 
                advisorName: row.advisor_name.trim() 
              })
              advisor = nameResults.length > 0 ? nameResults[0] : null
            }

            searchData.advisor = advisor
            results.push(searchData)

          } catch (error) {
            results.push({
              input: row,
              advisor: null,
              error: error.message
            })
          }

          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        // Log bulk verification
        await AdvisorVerification.create({
          userId: new Types.ObjectId(userId),
          searchType: 'bulk',
          searchValue: `${csvData.length} advisors`,
          result: results,
          verificationDate: new Date(),
          metadata: {
            fileName: req.file.originalname,
            totalRows: csvData.length,
            processedRows: results.length
          }
        })

        const response: ApiResponse = {
          success: true,
          data: results,
          metadata: {
            totalProcessed: results.length,
            successful: results.filter(r => r.advisor).length,
            failed: results.filter(r => !r.advisor).length
          }
        }

        logger.info('Bulk advisor verification completed', {
          userId,
          totalProcessed: results.length,
          successful: results.filter(r => r.advisor).length
        })

        res.json(response)

      } finally {
        // Clean up uploaded file
        try {
          fs.unlinkSync(filePath)
        } catch (error) {
          logger.warn('Failed to clean up uploaded file', { filePath, error: error.message })
        }
      }
    })
  })

  // Get verification history
  static getVerificationHistory = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user.id
    const userRole = (req as any).user.role
    const {
      page = 1,
      limit = 20,
      searchType,
      dateFrom,
      dateTo
    } = req.query

    // Build filter
    const filter: any = {}
    
    // Role-based access control
    if (userRole === 'INVESTOR') {
      filter.userId = new Types.ObjectId(userId)
    }
    // Investigators and above can see all verifications

    if (searchType) filter.searchType = searchType

    if (dateFrom || dateTo) {
      filter.verificationDate = {}
      if (dateFrom) filter.verificationDate.$gte = new Date(dateFrom as string)
      if (dateTo) filter.verificationDate.$lte = new Date(dateTo as string)
    }

    // Execute query
    const pageNum = Math.max(1, parseInt(page as string))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)))
    const skip = (pageNum - 1) * limitNum

    const [verifications, totalCount] = await Promise.all([
      AdvisorVerification.find(filter)
        .sort({ verificationDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'email firstName lastName')
        .lean(),
      AdvisorVerification.countDocuments(filter)
    ])

    const totalPages = Math.ceil(totalCount / limitNum)

    const response: ApiResponse = {
      success: true,
      data: {
        verifications,
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

    res.json(response)
  })

  // Get advisor statistics
  static getAdvisorStatistics = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user.id
    const userRole = (req as any).user.role
    const { timeRange = '30d' } = req.query

    // Calculate date range
    const now = new Date()
    let startDate: Date
    
    switch (timeRange) {
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

    const filter: any = {
      verificationDate: { $gte: startDate }
    }

    if (userRole === 'INVESTOR') {
      filter.userId = new Types.ObjectId(userId)
    }

    // Check cache
    const cacheKey = `advisor_stats:${userRole}:${userId}:${timeRange}`
    const cached = await redisClient.get(cacheKey)
    
    if (cached) {
      res.json(JSON.parse(cached))
      return
    }

    // Get statistics
    const [
      totalVerifications,
      verificationsByType,
      successfulVerifications,
      trendsData
    ] = await Promise.all([
      AdvisorVerification.countDocuments(filter),
      AdvisorVerification.aggregate([
        { $match: filter },
        { $group: { _id: '$searchType', count: { $sum: 1 } } }
      ]),
      AdvisorVerification.countDocuments({
        ...filter,
        'result.0': { $exists: true }
      }),
      AdvisorVerification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$verificationDate' } },
            count: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$result' }, 0] }, 1, 0]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ])

    const statistics = {
      totalVerifications,
      successfulVerifications,
      successRate: totalVerifications > 0 ? 
        Math.round((successfulVerifications / totalVerifications) * 100) : 0,
      verificationsByType: verificationsByType.reduce((acc, item) => {
        acc[item._id] = item.count
        return acc
      }, {}),
      trends: trendsData.map(item => ({
        date: item._id,
        total: item.count,
        successful: item.successful,
        successRate: item.count > 0 ? Math.round((item.successful / item.count) * 100) : 0
      }))
    }

    const response: ApiResponse = {
      success: true,
      data: statistics
    }

    // Cache for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(response), 3600)

    res.json(response)
  })

  // Search advisors by location
  static searchAdvisorsByLocation = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { city, state } = req.query

    if (!city || !state) {
      throw new ValidationError('City and state are required', 'location')
    }

    const advisors = await SEBIAPIService.getAdvisorsByCity(city as string, state as string)

    const response: ApiResponse = {
      success: true,
      data: advisors
    }

    res.json(response)
  })

  // Get compliance alerts for advisors
  static getComplianceAlerts = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { daysFromNow = 30 } = req.query

    const expiringAdvisors = await SEBIAPIService.getExpiringLicenses(parseInt(daysFromNow as string))

    const response: ApiResponse = {
      success: true,
      data: {
        expiringLicenses: expiringAdvisors,
        alertCount: expiringAdvisors.length
      }
    }

    res.json(response)
  })
}

export default AdvisorController
