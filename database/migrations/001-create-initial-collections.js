module.exports = {
  async up(db, client) {
    // Create Users collection with indexes
    await db.createCollection('users', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['email', 'username', 'password', 'role'],
          properties: {
            email: {
              bsonType: 'string',
              pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
            },
            username: {
              bsonType: 'string',
              minLength: 3,
              maxLength: 50
            },
            password: {
              bsonType: 'string',
              minLength: 60, // bcrypt hash length
              maxLength: 60
            },
            role: {
              enum: ['INVESTOR', 'ADVISOR', 'INVESTIGATOR', 'ANALYST', 'ADMIN', 'SUPER_ADMIN']
            },
            emailVerified: {
              bsonType: 'bool'
            },
            isActive: {
              bsonType: 'bool'
            },
            isBlocked: {
              bsonType: 'bool'
            }
          }
        }
      }
    })

    // Create indexes for users
    await db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { username: 1 }, unique: true },
      { key: { role: 1 } },
      { key: { createdAt: 1 } },
      { key: { lastLoginAt: 1 } },
      { key: { emailVerified: 1, isActive: 1 } }
    ])

    // Create FraudAlerts collection
    await db.createCollection('fraudalerts', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'alertType', 'severity', 'title', 'riskScore'],
          properties: {
            userId: {
              bsonType: 'objectId'
            },
            alertType: {
              enum: ['ADVISOR_FRAUD', 'DEEPFAKE_DETECTED', 'SOCIAL_MEDIA_SCAM', 'FAKE_IPO', 'TRADING_APP_FRAUD', 'CORPORATE_ANNOUNCEMENT_FRAUD', 'SUSPICIOUS_ACTIVITY']
            },
            severity: {
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
            },
            status: {
              enum: ['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED']
            },
            riskScore: {
              bsonType: 'number',
              minimum: 0,
              maximum: 100
            }
          }
        }
      }
    })

    // Create indexes for fraud alerts
    await db.collection('fraudalerts').createIndexes([
      { key: { userId: 1 } },
      { key: { alertType: 1 } },
      { key: { severity: 1 } },
      { key: { status: 1 } },
      { key: { detectionTime: -1 } },
      { key: { riskScore: -1 } },
      { key: { userId: 1, status: 1 } },
      { key: { alertType: 1, severity: 1 } },
      { key: { detectionTime: -1, severity: 1 } }
    ])

    // Create AdvisorVerifications collection
    await db.createCollection('advisorverifications', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'searchType', 'searchValue', 'verificationDate'],
          properties: {
            userId: {
              bsonType: 'objectId'
            },
            searchType: {
              enum: ['sebi', 'name', 'pan', 'bulk']
            },
            searchValue: {
              bsonType: 'string'
            },
            verificationDate: {
              bsonType: 'date'
            }
          }
        }
      }
    })

    // Create indexes for advisor verifications
    await db.collection('advisorverifications').createIndexes([
      { key: { userId: 1 } },
      { key: { searchType: 1 } },
      { key: { verificationDate: -1 } },
      { key: { searchValue: 1 } },
      { key: { userId: 1, verificationDate: -1 } }
    ])

    // Create DeepfakeAnalyses collection
    await db.createCollection('deepfakeanalyses', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'fileName', 'analysisStatus'],
          properties: {
            userId: {
              bsonType: 'objectId'
            },
            fileName: {
              bsonType: 'string'
            },
            analysisStatus: {
              enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
            },
            fileSize: {
              bsonType: 'number',
              minimum: 0
            }
          }
        }
      }
    })

    // Create indexes for deepfake analyses
    await db.collection('deepfakeanalyses').createIndexes([
      { key: { userId: 1 } },
      { key: { analysisStatus: 1 } },
      { key: { createdAt: -1 } },
      { key: { userId: 1, analysisStatus: 1 } }
    ])

    // Create SocialMediaScans collection
    await db.createCollection('socialmediascans', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'platforms', 'keywords', 'status'],
          properties: {
            userId: {
              bsonType: 'objectId'
            },
            platforms: {
              bsonType: 'array',
              items: {
                enum: ['TELEGRAM', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'LINKEDIN']
              }
            },
            keywords: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              }
            },
            status: {
              enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']
            },
            duration: {
              bsonType: 'number',
              minimum: 60,
              maximum: 86400
            }
          }
        }
      }
    })

    // Create indexes for social media scans
    await db.collection('socialmediascans').createIndexes([
      { key: { userId: 1 } },
      { key: { status: 1 } },
      { key: { startTime: -1 } },
      { key: { userId: 1, status: 1 } }
    ])

    // Create AuditLogs collection for compliance
    await db.createCollection('auditlogs', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'action', 'resource', 'timestamp'],
          properties: {
            userId: {
              bsonType: 'objectId'
            },
            action: {
              bsonType: 'string'
            },
            resource: {
              bsonType: 'string'
            },
            timestamp: {
              bsonType: 'date'
            },
            ipAddress: {
              bsonType: 'string'
            },
            userAgent: {
              bsonType: 'string'
            }
          }
        }
      }
    })

    // Create indexes for audit logs
    await db.collection('auditlogs').createIndexes([
      { key: { userId: 1 } },
      { key: { timestamp: -1 } },
      { key: { action: 1 } },
      { key: { resource: 1 } },
      { key: { userId: 1, timestamp: -1 } },
      { key: { timestamp: -1 }, expireAfterSeconds: 31536000 } // Expire after 1 year
    ])

    console.log('Initial collections and indexes created successfully')
  },

  async down(db, client) {
    // Drop collections in reverse order
    await db.collection('auditlogs').drop()
    await db.collection('socialmediascans').drop()
    await db.collection('deepfakeanalyses').drop()
    await db.collection('advisorverifications').drop()
    await db.collection('fraudalerts').drop()
    await db.collection('users').drop()

    console.log('All collections dropped successfully')
  }
}
