import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { logger } from '../middleware/logger'
import redisClient from '../config/redis'
import { AdvisorDetails } from '../types'

export interface SEBIAdvisorResponse {
  name: string
  sebiRegNumber: string
  licenseType: string
  registrationDate: Date
  expiryDate: Date
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED'
  businessAddress: string
  contactDetails: {
    phone?: string
    email?: string
    website?: string
  }
  complianceHistory: any[]
}

export interface SEBISearchParams {
  sebiRegNumber?: string
  advisorName?: string
  panNumber?: string
  city?: string
  state?: string
}

export class SEBIAPIService {
  private static instance: SEBIAPIService
  private apiClient: AxiosInstance
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.SEBI_API_URL || 'https://www.sebi.gov.in/api'
    this.apiKey = process.env.SEBI_API_KEY || ''
    
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SatyaShield-FraudDetection/1.0'
      }
    })

    this.setupInterceptors()
  }

  static getInstance(): SEBIAPIService {
    if (!SEBIAPIService.instance) {
      SEBIAPIService.instance = new SEBIAPIService()
    }
    return SEBIAPIService.instance
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.info('SEBI API Request', { 
          url: config.url, 
          method: config.method?.toUpperCase() 
        })
        return config
      },
      (error) => {
        logger.error('SEBI API Request Error', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor
    this.apiClient.interceptors.response.use(
      (response) => {
        logger.info('SEBI API Response', { 
          status: response.status, 
          url: response.config.url 
        })
        return response
      },
      (error) => {
        logger.error('SEBI API Response Error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        })
        return Promise.reject(error)
      }
    )
  }

  async verifyAdvisor(sebiRegNumber: string): Promise<SEBIAdvisorResponse | null> {
    try {
      // Check cache first
      const cacheKey = `sebi:advisor:${sebiRegNumber}`
      const cachedResult = await redisClient.get(cacheKey)
      
      if (cachedResult) {
        logger.info('SEBI advisor data retrieved from cache', { sebiRegNumber })
        return JSON.parse(cachedResult)
      }

      // Make API call to SEBI
      const response: AxiosResponse = await this.apiClient.get(`/advisors/${sebiRegNumber}`)
      
      if (response.data && response.data.status === 'success') {
        const advisorData: SEBIAdvisorResponse = {
          name: response.data.advisor.name,
          sebiRegNumber: response.data.advisor.registrationNumber,
          licenseType: response.data.advisor.licenseType,
          registrationDate: new Date(response.data.advisor.registrationDate),
          expiryDate: new Date(response.data.advisor.expiryDate),
          status: response.data.advisor.status,
          businessAddress: response.data.advisor.address,
          contactDetails: {
            phone: response.data.advisor.phone,
            email: response.data.advisor.email,
            website: response.data.advisor.website
          },
          complianceHistory: response.data.advisor.complianceHistory || []
        }

        // Cache for 1 hour
        await redisClient.set(cacheKey, JSON.stringify(advisorData), 3600)
        
        logger.info('SEBI advisor verified successfully', { 
          sebiRegNumber, 
          advisorName: advisorData.name 
        })
        
        return advisorData
      }

      return null

    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn('SEBI advisor not found', { sebiRegNumber })
        return null
      }

      logger.error('SEBI advisor verification failed', { 
        sebiRegNumber, 
        error: error.message 
      })
      
      // Return cached data if available during API failure
      try {
        const cacheKey = `sebi:advisor:${sebiRegNumber}`
        const cachedResult = await redisClient.get(cacheKey)
        if (cachedResult) {
          logger.info('Returning cached SEBI data due to API failure', { sebiRegNumber })
          return JSON.parse(cachedResult)
        }
      } catch (cacheError) {
        logger.error('Cache retrieval failed', cacheError)
      }

      throw new Error(`SEBI verification failed: ${error.message}`)
    }
  }

  async searchAdvisors(params: SEBISearchParams): Promise<SEBIAdvisorResponse[]> {
    try {
      const cacheKey = `sebi:search:${JSON.stringify(params)}`
      const cachedResult = await redisClient.get(cacheKey)
      
      if (cachedResult) {
        logger.info('SEBI search results retrieved from cache', { params })
        return JSON.parse(cachedResult)
      }

      const response: AxiosResponse = await this.apiClient.post('/advisors/search', params)
      
      if (response.data && response.data.status === 'success') {
        const advisors: SEBIAdvisorResponse[] = response.data.advisors.map((advisor: any) => ({
          name: advisor.name,
          sebiRegNumber: advisor.registrationNumber,
          licenseType: advisor.licenseType,
          registrationDate: new Date(advisor.registrationDate),
          expiryDate: new Date(advisor.expiryDate),
          status: advisor.status,
          businessAddress: advisor.address,
          contactDetails: {
            phone: advisor.phone,
            email: advisor.email,
            website: advisor.website
          },
          complianceHistory: advisor.complianceHistory || []
        }))

        // Cache for 30 minutes
        await redisClient.set(cacheKey, JSON.stringify(advisors), 1800)
        
        logger.info('SEBI advisor search completed', { 
          searchParams: params, 
          resultCount: advisors.length 
        })
        
        return advisors
      }

      return []

    } catch (error) {
      logger.error('SEBI advisor search failed', { params, error: error.message })
      throw new Error(`SEBI search failed: ${error.message}`)
    }
  }

  async getComplianceHistory(sebiRegNumber: string): Promise<any[]> {
    try {
      const cacheKey = `sebi:compliance:${sebiRegNumber}`
      const cachedResult = await redisClient.get(cacheKey)
      
      if (cachedResult) {
        return JSON.parse(cachedResult)
      }

      const response: AxiosResponse = await this.apiClient.get(`/advisors/${sebiRegNumber}/compliance`)
      
      if (response.data && response.data.status === 'success') {
        const complianceHistory = response.data.complianceHistory.map((record: any) => ({
          date: new Date(record.date),
          type: record.type,
          description: record.description,
          amount: record.amount,
          status: record.status,
          referenceNumber: record.referenceNumber,
          authority: record.authority || 'SEBI'
        }))

        // Cache for 2 hours
        await redisClient.set(cacheKey, JSON.stringify(complianceHistory), 7200)
        
        return complianceHistory
      }

      return []

    } catch (error) {
      logger.error('SEBI compliance history retrieval failed', { 
        sebiRegNumber, 
        error: error.message 
      })
      return []
    }
  }

  async bulkVerifyAdvisors(sebiRegNumbers: string[]): Promise<Map<string, SEBIAdvisorResponse | null>> {
    const results = new Map<string, SEBIAdvisorResponse | null>()
    const batchSize = 10 // Process in batches to avoid overwhelming the API
    
    logger.info('Starting bulk SEBI advisor verification', { 
      count: sebiRegNumbers.length 
    })

    for (let i = 0; i < sebiRegNumbers.length; i += batchSize) {
      const batch = sebiRegNumbers.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (sebiRegNumber) => {
        try {
          const advisor = await this.verifyAdvisor(sebiRegNumber)
          results.set(sebiRegNumber, advisor)
          return { sebiRegNumber, success: true }
        } catch (error) {
          logger.error('Bulk verification failed for advisor', { 
            sebiRegNumber, 
            error: error.message 
          })
          results.set(sebiRegNumber, null)
          return { sebiRegNumber, success: false, error: error.message }
        }
      })

      await Promise.all(batchPromises)
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < sebiRegNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    logger.info('Bulk SEBI advisor verification completed', { 
      total: sebiRegNumbers.length,
      successful: Array.from(results.values()).filter(v => v !== null).length
    })

    return results
  }

  async getAdvisorsByCity(city: string, state: string): Promise<SEBIAdvisorResponse[]> {
    return this.searchAdvisors({ city, state })
  }

  async getActiveAdvisors(): Promise<SEBIAdvisorResponse[]> {
    try {
      const cacheKey = 'sebi:advisors:active'
      const cachedResult = await redisClient.get(cacheKey)
      
      if (cachedResult) {
        return JSON.parse(cachedResult)
      }

      const response: AxiosResponse = await this.apiClient.get('/advisors/active')
      
      if (response.data && response.data.status === 'success') {
        const advisors = response.data.advisors.map((advisor: any) => ({
          name: advisor.name,
          sebiRegNumber: advisor.registrationNumber,
          licenseType: advisor.licenseType,
          registrationDate: new Date(advisor.registrationDate),
          expiryDate: new Date(advisor.expiryDate),
          status: advisor.status,
          businessAddress: advisor.address,
          contactDetails: {
            phone: advisor.phone,
            email: advisor.email,
            website: advisor.website
          },
          complianceHistory: []
        }))

        // Cache for 6 hours
        await redisClient.set(cacheKey, JSON.stringify(advisors), 21600)
        
        return advisors
      }

      return []

    } catch (error) {
      logger.error('Failed to get active advisors', error)
      return []
    }
  }

  async validateSebiRegNumber(sebiRegNumber: string): Promise<boolean> {
    // SEBI registration number format: INH followed by 9 digits
    const sebiRegex = /^INH\d{9}$/
    
    if (!sebiRegex.test(sebiRegNumber)) {
      return false
    }

    try {
      const advisor = await this.verifyAdvisor(sebiRegNumber)
      return advisor !== null && advisor.status === 'ACTIVE'
    } catch (error) {
      return false
    }
  }

  async getExpiringLicenses(daysFromNow: number = 30): Promise<SEBIAdvisorResponse[]> {
    try {
      const cacheKey = `sebi:expiring:${daysFromNow}`
      const cachedResult = await redisClient.get(cacheKey)
      
      if (cachedResult) {
        return JSON.parse(cachedResult)
      }

      const response: AxiosResponse = await this.apiClient.get(`/advisors/expiring/${daysFromNow}`)
      
      if (response.data && response.data.status === 'success') {
        const advisors = response.data.advisors.map((advisor: any) => ({
          name: advisor.name,
          sebiRegNumber: advisor.registrationNumber,
          licenseType: advisor.licenseType,
          registrationDate: new Date(advisor.registrationDate),
          expiryDate: new Date(advisor.expiryDate),
          status: advisor.status,
          businessAddress: advisor.address,
          contactDetails: {
            phone: advisor.phone,
            email: advisor.email,
            website: advisor.website
          },
          complianceHistory: []
        }))

        // Cache for 1 hour
        await redisClient.set(cacheKey, JSON.stringify(advisors), 3600)
        
        return advisors
      }

      return []

    } catch (error) {
      logger.error('Failed to get expiring licenses', error)
      return []
    }
  }

  async syncAdvisorDatabase(): Promise<{ synced: number; errors: number }> {
    try {
      logger.info('Starting SEBI advisor database sync')
      
      let synced = 0
      let errors = 0
      let page = 1
      const pageSize = 100

      while (true) {
        try {
          const response: AxiosResponse = await this.apiClient.get(`/advisors/all?page=${page}&limit=${pageSize}`)
          
          if (!response.data || !response.data.advisors || response.data.advisors.length === 0) {
            break
          }

          for (const advisorData of response.data.advisors) {
            try {
              const cacheKey = `sebi:advisor:${advisorData.registrationNumber}`
              const advisor: SEBIAdvisorResponse = {
                name: advisorData.name,
                sebiRegNumber: advisorData.registrationNumber,
                licenseType: advisorData.licenseType,
                registrationDate: new Date(advisorData.registrationDate),
                expiryDate: new Date(advisorData.expiryDate),
                status: advisorData.status,
                businessAddress: advisorData.address,
                contactDetails: {
                  phone: advisorData.phone,
                  email: advisorData.email,
                  website: advisorData.website
                },
                complianceHistory: advisorData.complianceHistory || []
              }

              await redisClient.set(cacheKey, JSON.stringify(advisor), 86400) // 24 hours
              synced++

            } catch (advisorError) {
              logger.error('Error syncing individual advisor', { 
                advisor: advisorData.registrationNumber, 
                error: advisorError.message 
              })
              errors++
            }
          }

          page++
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (pageError) {
          logger.error('Error syncing advisor page', { page, error: pageError.message })
          errors++
          break
        }
      }

      logger.info('SEBI advisor database sync completed', { synced, errors })
      
      return { synced, errors }

    } catch (error) {
      logger.error('SEBI advisor database sync failed', error)
      throw new Error(`Database sync failed: ${error.message}`)
    }
  }
}

export default SEBIAPIService.getInstance()
