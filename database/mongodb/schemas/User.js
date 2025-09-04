const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
  },
  role: {
    type: String,
    enum: {
      values: ['INVESTOR', 'ADVISOR', 'INVESTIGATOR', 'ANALYST', 'ADMIN', 'SUPER_ADMIN'],
      message: '{VALUE} is not a valid role'
    },
    default: 'INVESTOR'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'te', 'ta', 'bn', 'gu', 'mr'],
      default: 'en'
    },
    notifications: {
      email: {
        fraudAlerts: { type: Boolean, default: true },
        systemUpdates: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false }
      },
      sms: {
        criticalAlerts: { type: Boolean, default: true },
        loginAlerts: { type: Boolean, default: false }
      },
      push: {
        fraudAlerts: { type: Boolean, default: true },
        generalUpdates: { type: Boolean, default: true }
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'private', 'contacts'],
        default: 'private'
      },
      dataSharing: { type: Boolean, default: false },
      analytics: { type: Boolean, default: true }
    }
  },
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: {
      type: String,
      default: null
    },
    backupCodes: [{
      type: String
    }],
    trustedDevices: [{
      deviceId: String,
      deviceName: String,
      addedAt: Date,
      lastUsed: Date
    }],
    apiKeys: [{
      name: String,
      key: String,
      permissions: [String],
      createdAt: Date,
      lastUsed: Date,
      expiresAt: Date
    }]
  },
  metadata: {
    registrationIp: String,
    registrationUserAgent: String,
    lastLoginIp: String,
    lastLoginUserAgent: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    },
    referralCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String],
    notes: String
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'users'
})

// Indexes
userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ username: 1 }, { unique: true })
userSchema.index({ role: 1 })
userSchema.index({ isActive: 1, isBlocked: 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ lastLoginAt: -1 })
userSchema.index({ 'metadata.referralCode': 1 })
userSchema.index({ emailVerified: 1, phoneVerified: 1 })

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`
})

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now())
})

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  
  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    this.passwordChangedAt = new Date()
    next()
  } catch (error) {
    next(error)
  }
})

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    })
  }
  
  const updates = { $inc: { loginAttempts: 1 } }
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2 hours
  }
  
  return this.updateOne(updates)
}

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  })
}

// Static method to find by credentials
userSchema.statics.findByCredentials = async function(email, password) {
  const user = await this.findOne({ 
    email: email.toLowerCase(),
    isActive: true,
    isBlocked: false
  })
  
  if (!user) {
    throw new Error('Invalid credentials')
  }
  
  if (user.isLocked) {
    throw new Error('Account temporarily locked due to too many failed login attempts')
  }
  
  const isMatch = await user.comparePassword(password)
  
  if (!isMatch) {
    await user.incLoginAttempts()
    throw new Error('Invalid credentials')
  }
  
  if (user.loginAttempts > 0) {
    await user.resetLoginAttempts()
  }
  
  // Update last login
  user.lastLoginAt = new Date()
  user.metadata.lastLoginIp = this.currentIp
  user.metadata.lastLoginUserAgent = this.currentUserAgent
  await user.save()
  
  return user
}

// Transform JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject()
  
  // Remove sensitive fields
  delete user.password
  delete user.emailVerificationToken
  delete user.passwordResetToken
  delete user.security.twoFactorSecret
  delete user.security.backupCodes
  
  return user
}

module.exports = mongoose.model('User', userSchema)
