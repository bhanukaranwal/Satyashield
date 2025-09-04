const request = require('supertest')
const app = require('../../backend/src/app')
const { User } = require('../../backend/src/models/User')
const { FraudAlert } = require('../../backend/src/models/FraudAlert')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')

describe('Fraud Detection Integration Tests', () => {
  let authToken
  let testUser
  let testFiles

  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      email: 'fraud.test@satyashield.com',
      username: 'fraudtester',
      password: 'SecureTest123!',
      firstName: 'Fraud',
      lastName: 'Tester',
      role: 'INVESTIGATOR',
      emailVerified: true
    })

    authToken = jwt.sign(
      { id: testUser._id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    // Prepare test files
    testFiles = {
      validVideo: path.join(__dirname, '../fixtures/test_video.mp4'),
      suspiciousImage: path.join(__dirname, '../fixtures/suspicious_image.jpg'),
      csvAdvisors: path.join(__dirname, '../fixtures/advisors.csv')
    }
  })

  afterAll(async () => {
    await User.deleteMany({})
    await FraudAlert.deleteMany({})
  })

  describe('Deepfake Detection', () => {
    test('should analyze video file successfully', async () => {
      // Create a mock video file for testing
      const mockVideoBuffer = Buffer.alloc(1024)
      
      const response = await request(app)
        .post('/api/deepfake/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', mockVideoBuffer, 'test_video.mp4')
        .field('analysisType', 'video')

      expect(response.status).toBe(202)
      expect(response.body.success).toBe(true)
      expect(response.body.data.id).toBeDefined()
      expect(response.body.data.analysisStatus).toBe('PENDING')
    })

    test('should reject invalid file types', async () => {
      const textBuffer = Buffer.from('This is not a video file')

      const response = await request(app)
        .post('/api/deepfake/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', textBuffer, 'test.txt')

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    test('should enforce file size limits', async () => {
      // Create a large buffer (over 100MB)
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024)

      const response = await request(app)
        .post('/api/deepfake/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeBuffer, 'large_video.mp4')

      expect(response.status).toBe(400)
      expect(response.body.error.message).toContain('file too large')
    })
  })

  describe('SEBI Advisor Verification', () => {
    test('should verify advisor with valid SEBI number', async () => {
      const response = await request(app)
        .post('/api/advisors/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          searchType: 'sebi',
          sebiRegNumber: 'INH000000001'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toBeInstanceOf(Array)
    })

    test('should handle invalid SEBI number format', async () => {
      const response = await request(app)
        .post('/api/advisors/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          searchType: 'sebi',
          sebiRegNumber: 'INVALID123'
        })

      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    test('should process bulk advisor verification', async () => {
      const csvContent = `sebi_reg_number,advisor_name,pan_number
INH000000001,Test Advisor 1,ABCDE1234F
INH000000002,Test Advisor 2,XYZAB5678G`

      const response = await request(app)
        .post('/api/advisors/bulk-verify')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'test_advisors.csv')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2)
    })
  })

  describe('Social Media Monitoring', () => {
    test('should start social media scan', async () => {
      const scanConfig = {
        platforms: ['TELEGRAM', 'TWITTER'],
        keywords: ['guaranteed returns', 'risk-free investment'],
        duration: 3600,
        language: 'en'
      }

      const response = await request(app)
        .post('/api/social/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scanConfig)

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.scanId).toBeDefined()
      expect(response.body.data.status).toBe('ACTIVE')
    })

    test('should validate scan parameters', async () => {
      const response = await request(app)
        .post('/api/social/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platforms: ['INVALID_PLATFORM'],
          keywords: []
        })

      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('Fraud Alert Management', () => {
    test('should create fraud alert with analysis', async () => {
      const alertData = {
        alertType: 'DEEPFAKE_DETECTED',
        severity: 'HIGH',
        title: 'Deepfake Video Detected',
        description: 'AI analysis detected manipulated video content',
        evidenceData: {
          analysisResult: {
            confidence: 0.87,
            anomalies: ['Temporal inconsistency', 'Facial landmark anomalies']
          },
          filePath: '/uploads/suspicious_video.mp4'
        }
      }

      const response = await request(app)
        .post('/api/fraud/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData)

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.riskScore).toBeGreaterThan(80)
    })

    test('should get fraud statistics', async () => {
      const response = await request(app)
        .get('/api/fraud/statistics?timeRange=7d')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('totalAlerts')
      expect(response.body.data).toHaveProperty('alertsByType')
      expect(response.body.data).toHaveProperty('alertsBySeverity')
    })
  })

  describe('Real-time Features', () => {
    test('should establish websocket connection', (done) => {
      const io = require('socket.io-client')
      const client = io('http://localhost:5000', {
        auth: { token: authToken }
      })

      client.on('connect', () => {
        expect(client.connected).toBe(true)
        client.disconnect()
        done()
      })

      client.on('connect_error', (error) => {
        done(error)
      })
    })

    test('should receive real-time fraud alerts', (done) => {
      const io = require('socket.io-client')
      const client = io('http://localhost:5000', {
        auth: { token: authToken }
      })

      client.on('connect', () => {
        client.on('fraud_alert', (data) => {
          expect(data.type).toBe('fraud_alert')
          expect(data.payload).toHaveProperty('id')
          expect(data.payload).toHaveProperty('severity')
          client.disconnect()
          done()
        })

        // Trigger a fraud alert
        setTimeout(async () => {
          await request(app)
            .post('/api/fraud/alerts')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              alertType: 'SUSPICIOUS_ACTIVITY',
              severity: 'CRITICAL',
              title: 'Real-time Test Alert',
              description: 'Testing real-time notifications'
            })
        }, 100)
      })
    })
  })

  describe('API Security', () => {
    test('should enforce rate limiting', async () => {
      const requests = []

      // Make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/fraud/alerts')
            .set('Authorization', `Bearer ${authToken}`)
        )
      }

      const responses = await Promise.all(requests)
      
      // All should succeed within rate limit
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status)
        if (response.status === 200) {
          expect(response.headers['x-ratelimit-remaining']).toBeDefined()
        }
      })
    })

    test('should validate JWT tokens', async () => {
      const response = await request(app)
        .get('/api/fraud/alerts')
        .set('Authorization', 'Bearer invalid-token')

      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR')
    })
  })

  describe('Performance Tests', () => {
    test('should handle concurrent requests', async () => {
      const concurrentRequests = 20
      const requests = []

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .get('/api/fraud/alerts')
            .set('Authorization', `Bearer ${authToken}`)
        )
      }

      const startTime = Date.now()
      const responses = await Promise.all(requests)
      const responseTime = Date.now() - startTime

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // Should complete within reasonable time
      expect(responseTime).toBeLessThan(5000) // 5 seconds
    })
  })
})
