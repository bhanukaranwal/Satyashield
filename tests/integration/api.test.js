const request = require('supertest');
const app = require('../../src/app');
const { User } = require('../../src/models/User');
const { FraudAlert } = require('../../src/models/FraudAlert');
const jwt = require('jsonwebtoken');

describe('SatyaShield API Integration Tests', () => {
  let authToken;
  let testUser;

  beforeEach(async () => {
    // Setup test user
    testUser = await User.create({
      email: 'test@satyashield.com',
      username: 'testuser',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      role: 'INVESTIGATOR',
      emailVerified: true
    });

    authToken = jwt.sign(
      { id: testUser._id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    await User.deleteMany({});
    await FraudAlert.deleteMany({});
  });

  describe('Authentication', () => {
    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@satyashield.com',
          password: 'TestPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.email).toBe('test@satyashield.com');
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@satyashield.com',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should refresh access token', async () => {
      const refreshToken = jwt.sign(
        { id: testUser._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
    });
  });

  describe('Fraud Detection', () => {
    test('should create fraud alert', async () => {
      const alertData = {
        alertType: 'ADVISOR_FRAUD',
        severity: 'HIGH',
        title: 'Test Fraud Alert',
        description: 'This is a test alert for suspicious activity',
        evidenceData: {
          advisorDetails: {
            name: 'John Scammer',
            sebiRegNumber: 'INH123456789'
          }
        }
      };

      const response = await request(app)
        .post('/api/fraud/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(alertData.title);
      expect(response.body.data.riskScore).toBeGreaterThan(0);
    });

    test('should get fraud alerts with pagination', async () => {
      // Create test alerts
      await FraudAlert.create([
        {
          userId: testUser._id,
          alertType: 'ADVISOR_FRAUD',
          severity: 'HIGH',
          title: 'Alert 1',
          description: 'Description 1',
          riskScore: 85,
          detectionTime: new Date(),
          evidenceData: {}
        },
        {
          userId: testUser._id,
          alertType: 'DEEPFAKE_DETECTED',
          severity: 'CRITICAL',
          title: 'Alert 2',
          description: 'Description 2',
          riskScore: 95,
          detectionTime: new Date(),
          evidenceData: {}
        }
      ]);

      const response = await request(app)
        .get('/api/fraud/alerts?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.alerts).toHaveLength(2);
      expect(response.body.data.pagination.total).toBe(2);
    });

    test('should filter alerts by severity', async () => {
      await FraudAlert.create([
        {
          userId: testUser._id,
          alertType: 'ADVISOR_FRAUD',
          severity: 'HIGH',
          title: 'High Alert',
          description: 'High severity alert',
          riskScore: 85,
          detectionTime: new Date(),
          evidenceData: {}
        },
        {
          userId: testUser._id,
          alertType: 'SOCIAL_MEDIA_SCAM',
          severity: 'LOW',
          title: 'Low Alert',
          description: 'Low severity alert',
          riskScore: 25,
          detectionTime: new Date(),
          evidenceData: {}
        }
      ]);

      const response = await request(app)
        .get('/api/fraud/alerts?severity=HIGH')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.alerts).toHaveLength(1);
      expect(response.body.data.alerts[0].severity).toBe('HIGH');
    });

    test('should update alert status', async () => {
      const alert = await FraudAlert.create({
        userId: testUser._id,
        alertType: 'ADVISOR_FRAUD',
        severity: 'HIGH',
        title: 'Test Alert',
        description: 'Test description',
        riskScore: 85,
        detectionTime: new Date(),
        evidenceData: {}
      });

      const response = await request(app)
        .patch(`/api/fraud/alerts/${alert._id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'INVESTIGATING' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('INVESTIGATING');
    });
  });

  describe('SEBI Advisor Verification', () => {
    test('should verify advisor by SEBI number', async () => {
      const response = await request(app)
        .post('/api/advisors/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          searchType: 'sebi',
          sebiRegNumber: 'INH000000001'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should handle invalid SEBI number format', async () => {
      const response = await request(app)
        .post('/api/advisors/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          searchType: 'sebi',
          sebiRegNumber: 'INVALID'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should process bulk advisor verification', async () => {
      const csvContent = `sebi_reg_number,advisor_name,pan_number
INH000000001,ABC Advisors,ABCDE1234F
INH000000002,XYZ Services,XYZAB5678G`;

      const response = await request(app)
        .post('/api/advisors/bulk-verify')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), 'advisors.csv');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('Deepfake Detection', () => {
    test('should accept video file for analysis', async () => {
      const videoBuffer = Buffer.alloc(1024); // Mock video data

      const response = await request(app)
        .post('/api/deepfake/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', videoBuffer, 'test_video.mp4')
        .field('analysisType', 'video');

      expect(response.status).toBe(202); // Accepted for processing
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.analysisStatus).toBe('PENDING');
    });

    test('should reject unsupported file types', async () => {
      const textBuffer = Buffer.from('This is not a video file');

      const response = await request(app)
        .post('/api/deepfake/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', textBuffer, 'test.txt');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should get analysis results', async () => {
      // This would typically require a mock analysis result
      const analysisId = '64a1b2c3d4e5f6789012346';

      const response = await request(app)
        .get(`/api/deepfake/analysis/${analysisId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // This test would need proper mock data setup
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Social Media Monitoring', () => {
    test('should start social media scan', async () => {
      const scanData = {
        platforms: ['TELEGRAM', 'TWITTER'],
        keywords: ['guaranteed returns', 'risk-free'],
        duration: 3600,
        language: 'en'
      };

      const response = await request(app)
        .post('/api/social/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scanData);

      expect(response.status).toBe(201);
      expect(response.body.data.scanId).toBeDefined();
      expect(response.body.data.status).toBe('ACTIVE');
    });

    test('should validate scan parameters', async () => {
      const response = await request(app)
        .post('/api/social/scan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platforms: ['INVALID_PLATFORM'],
          keywords: []
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const requests = [];

      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/fraud/alerts')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      
      // All requests should succeed within rate limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle missing authorization', async () => {
      const response = await request(app)
        .get('/api/fraud/alerts');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should handle invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/fraud/alerts')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/fraud/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Performance', () => {
    test('should respond within acceptable time limits', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/fraud/alerts')
        .set('Authorization', `Bearer ${authToken}`);

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Less than 1 second
    });

    test('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .get('/api/fraud/alerts')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});
