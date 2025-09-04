import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  HashtagIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  ShareIcon,
  FlagIcon
} from '@heroicons/react/24/outline'
import { AlertBanner } from '../Common/AlertBanner'
import { LoadingSpinner } from '../Common/LoadingSpinner'
import { Badge } from '../Common/Badge'

interface SocialPost {
  id: string
  platform: 'TELEGRAM' | 'TWITTER' | 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP' | 'LINKEDIN'
  content: string
  authorId: string
  authorName: string
  authorVerified: boolean
  timestamp: Date
  engagement: {
    likes?: number
    shares?: number
    comments?: number
    views?: number
  }
  fraudProbability: number
  sentimentScore: number
  riskFactors: string[]
  keywordMatches: string[]
}

interface MonitoringConfig {
  platforms: string[]
  keywords: string[]
  duration: number
  language: string
  minRiskScore: number
}

interface SocialFeedAnalyzerProps {
  onPostDetected?: (post: SocialPost) => void
}

const SocialFeedAnalyzer: React.FC<SocialFeedAnalyzerProps> = ({
  onPostDetected
}) => {
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [monitoringConfig, setMonitoringConfig] = useState<MonitoringConfig>({
    platforms: ['TELEGRAM', 'TWITTER'],
    keywords: ['guaranteed returns', 'risk-free investment', 'double your money'],
    duration: 3600, // 1 hour
    language: 'en',
    minRiskScore: 60
  })
  const [detectedPosts, setDetectedPosts] = useState<SocialPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout>()
  const pollRef = useRef<NodeJS.Timeout>()

  // Platform icons mapping
  const platformIcons = {
    TELEGRAM: '📱',
    TWITTER: '🐦',
    FACEBOOK: '📘',
    INSTAGRAM: '📷',
    WHATSAPP: '💬',
    LINKEDIN: '💼'
  }

  // Start monitoring
  const startMonitoring = async () => {
    try {
      setError(null)
      setIsMonitoring(true)
      setDetectedPosts([])

      const response = await fetch('/api/social/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(monitoringConfig)
      })

      if (!response.ok) {
        throw new Error('Failed to start monitoring')
      }

      const result = await response.json()
      setScanId(result.scanId)
      setTimeRemaining(monitoringConfig.duration)

      // Start countdown timer
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            stopMonitoring()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Start polling for results
      startPolling(result.scanId)

    } catch (error) {
      setError(error.message)
      setIsMonitoring(false)
    }
  }

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
    setTimeRemaining(0)
    setScanId(null)
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
    }
  }, [])

  // Poll for new results
  const startPolling = (scanId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/social/scan/${scanId}/results`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })

        if (response.ok) {
          const results = await response.json()
          
          if (results.posts && results.posts.length > 0) {
            setDetectedPosts(prev => {
              const newPosts = results.posts.filter(
                (newPost: SocialPost) => !prev.some(existingPost => existingPost.id === newPost.id)
              )
              
              // Notify about new high-risk posts
              newPosts.forEach((post: SocialPost) => {
                if (post.fraudProbability >= monitoringConfig.minRiskScore) {
                  onPostDetected?.(post)
                }
              })
              
              return [...prev, ...newPosts]
            })
          }
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 5000) // Poll every 5 seconds
  }

  // Format time remaining
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`
    }
    return `${mins}m ${secs}s`
  }

  // Get risk color based on fraud probability
  const getRiskColor = (probability: number) => {
    if (probability >= 80) return 'bg-red-100 text-red-800 border-red-200'
    if (probability >= 60) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (probability >= 40) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-green-100 text-green-800 border-green-200'
  }

  // Get sentiment indicator
  const getSentimentIndicator = (score: number) => {
    if (score > 0.1) return { emoji: '😊', label: 'Positive', color: 'text-green-600' }
    if (score < -0.1) return { emoji: '😔', label: 'Negative', color: 'text-red-600' }
    return { emoji: '😐', label: 'Neutral', color: 'text-gray-600' }
  }

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Social Media Fraud Monitor
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Real-time monitoring of social media platforms for fraudulent investment content
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Monitoring Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Platforms Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Platforms to Monitor
            </label>
            <div className="space-y-2">
              {['TELEGRAM', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'LINKEDIN'].map(platform => (
                <label key={platform} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={monitoringConfig.platforms.includes(platform)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMonitoringConfig(prev => ({
                          ...prev,
                          platforms: [...prev.platforms, platform]
                        }))
                      } else {
                        setMonitoringConfig(prev => ({
                          ...prev,
                          platforms: prev.platforms.filter(p => p !== platform)
                        }))
                      }
                    }}
                    disabled={isMonitoring}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {platformIcons[platform as keyof typeof platformIcons]} {platform}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Keywords to Track
            </label>
            <textarea
              value={monitoringConfig.keywords.join(', ')}
              onChange={(e) => {
                setMonitoringConfig(prev => ({
                  ...prev,
                  keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                }))
              }}
              disabled={isMonitoring}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter keywords separated by commas"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Monitoring Duration
            </label>
            <select
              value={monitoringConfig.duration}
              onChange={(e) => setMonitoringConfig(prev => ({
                ...prev,
                duration: parseInt(e.target.value)
              }))}
              disabled={isMonitoring}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={7200}>2 hours</option>
              <option value={14400}>4 hours</option>
              <option value={28800}>8 hours</option>
            </select>
          </div>

          {/* Risk Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Minimum Risk Score: {monitoringConfig.minRiskScore}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={monitoringConfig.minRiskScore}
              onChange={(e) => setMonitoringConfig(prev => ({
                ...prev,
                minRiskScore: parseInt(e.target.value)
              }))}
              disabled={isMonitoring}
              className="w-full"
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div className="mt-6 flex space-x-3">
          {!isMonitoring ? (
            <button
              onClick={startMonitoring}
              disabled={monitoringConfig.platforms.length === 0 || monitoringConfig.keywords.length === 0}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <EyeIcon className="w-5 h-5 mr-2" />
              Start Monitoring
            </button>
          ) : (
            <button
              onClick={stopMonitoring}
              className="flex items-center px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Stop Monitoring
            </button>
          )}
        </div>
      </div>

      {/* Monitoring Status */}
      {isMonitoring && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <LoadingSpinner size="small" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  Monitoring Active
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Scanning {monitoringConfig.platforms.join(', ')} for {monitoringConfig.keywords.length} keywords
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center text-blue-900 dark:text-blue-100">
                <ClockIcon className="w-4 h-4 mr-1" />
                <span className="font-mono text-sm">{formatTime(timeRemaining)}</span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {detectedPosts.length} posts detected
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error Alert */}
      {error && (
        <AlertBanner
          type="error"
          title="Monitoring Error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Detected Posts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Detected Posts ({detectedPosts.length})
            </h3>
            {detectedPosts.length > 0 && (
              <button
                onClick={() => {
                  const csv = detectedPosts.map(post => ({
                    platform: post.platform,
                    author: post.authorName,
                    content: post.content.substring(0, 100),
                    fraudProbability: post.fraudProbability,
                    timestamp: post.timestamp
                  }))
                  
                  const csvContent = [
                    ['Platform', 'Author', 'Content', 'Fraud Probability', 'Timestamp'],
                    ...csv.map(row => Object.values(row))
                  ].map(row => row.join(',')).join('\n')
                  
                  const blob = new Blob([csvContent], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `social-media-scan-${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <AnimatePresence>
            {detectedPosts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                {isMonitoring ? (
                  <div className="flex flex-col items-center space-y-2">
                    <MagnifyingGlassIcon className="w-12 h-12" />
                    <p>Scanning social media platforms...</p>
                    <p className="text-sm">Results will appear here as they are detected</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <EyeIcon className="w-12 h-12" />
                    <p>No posts detected yet</p>
                    <p className="text-sm">Start monitoring to see results</p>
                  </div>
                )}
              </div>
            ) : (
              detectedPosts
                .sort((a, b) => b.fraudProbability - a.fraudProbability)
                .map((post, index) => {
                  const sentiment = getSentimentIndicator(post.sentimentScore)
                  
                  return (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">
                            {platformIcons[post.platform as keyof typeof platformIcons]}
                          </span>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {post.authorName}
                              </span>
                              {post.authorVerified && (
                                <CheckCircleIcon className="w-4 h-4 text-blue-500" />
                              )}
                              <Badge variant="secondary" size="small">
                                {post.platform}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(post.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(post.fraudProbability)}`}>
                            {post.fraudProbability}% Risk
                          </div>
                          <button
                            onClick={() => {
                              // Report post functionality
                              alert(`Reported post ${post.id}`)
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Report post"
                          >
                            <FlagIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-gray-900 dark:text-white leading-relaxed">
                          {post.content}
                        </p>
                      </div>

                      {/* Engagement Stats */}
                      <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {post.engagement.likes && (
                          <div className="flex items-center space-x-1">
                            <HeartIcon className="w-4 h-4" />
                            <span>{post.engagement.likes.toLocaleString()}</span>
                          </div>
                        )}
                        {post.engagement.shares && (
                          <div className="flex items-center space-x-1">
                            <ShareIcon className="w-4 h-4" />
                            <span>{post.engagement.shares.toLocaleString()}</span>
                          </div>
                        )}
                        {post.engagement.comments && (
                          <div className="flex items-center space-x-1">
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                            <span>{post.engagement.comments.toLocaleString()}</span>
                          </div>
                        )}
                        <div className={`flex items-center space-x-1 ${sentiment.color}`}>
                          <span>{sentiment.emoji}</span>
                          <span>{sentiment.label}</span>
                        </div>
                      </div>

                      {/* Risk Factors */}
                      {post.riskFactors.length > 0 && (
                        <div className="mb-4">
                          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Risk Factors:
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {post.riskFactors.map((factor, idx) => (
                              <Badge key={idx} variant="warning" size="small">
                                {factor}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Keyword Matches */}
                      {post.keywordMatches.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Matched Keywords:
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {post.keywordMatches.map((keyword, idx) => (
                              <div key={idx} className="flex items-center space-x-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
                                <HashtagIcon className="w-3 h-3" />
                                <span>{keyword}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )
                })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default SocialFeedAnalyzer
