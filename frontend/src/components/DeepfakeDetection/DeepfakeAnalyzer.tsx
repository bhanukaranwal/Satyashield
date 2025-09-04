import React, { useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CloudArrowUpIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  PauseIcon,
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  SpeakerWaveIcon
} from '@heroicons/react/24/outline'
import { useDropzone } from 'react-dropzone'
import { ProgressBar } from '../Common/ProgressBar'
import { AlertBanner } from '../Common/AlertBanner'
import { LoadingSpinner } from '../Common/LoadingSpinner'

interface DeepfakeResult {
  analysisId: string
  isDeepfake: boolean
  confidence: number
  processingTime: number
  anomalies: string[]
  frameLevelAnalysis?: FrameAnalysis[]
  audioAnalysis?: AudioAnalysis[]
}

interface FrameAnalysis {
  frameNumber: number
  timestamp: number
  isManipulated: boolean
  confidence: number
  anomalies: string[]
}

interface AudioAnalysis {
  isManipulated: boolean
  confidence: number
  anomalies: string[]
  spectralAnalysis?: any
}

interface DeepfakeAnalyzerProps {
  onAnalysisComplete?: (result: DeepfakeResult) => void
  maxFileSize?: number
  acceptedFileTypes?: string[]
}

const DeepfakeAnalyzer: React.FC<DeepfakeAnalyzerProps> = ({
  onAnalysisComplete,
  maxFileSize = 100 * 1024 * 1024, // 100MB
  acceptedFileTypes = ['video/mp4', 'video/avi', 'video/mov', 'image/jpeg', 'image/png', 'audio/wav', 'audio/mp3']
}) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle')
  const [analysisResult, setAnalysisResult] = useState<DeepfakeResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0]
      if (rejection.errors.some((e: any) => e.code === 'file-too-large')) {
        setError(`File is too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB`)
      } else if (rejection.errors.some((e: any) => e.code === 'file-invalid-type')) {
        setError('Unsupported file type. Please upload video, image, or audio files.')
      }
      return
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      setUploadedFile(file)
      setError(null)
      
      // Create preview URL
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      
      // Reset states
      setAnalysisStatus('idle')
      setAnalysisResult(null)
      setProgress(0)
    }
  }, [maxFileSize])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    multiple: false
  })

  // Start analysis
  const startAnalysis = async () => {
    if (!uploadedFile) return

    setAnalysisStatus('uploading')
    setProgress(10)

    try {
      // Upload file
      const formData = new FormData()
      formData.append('file', uploadedFile)
      
      const uploadResponse = await fetch('/api/deepfake/analyze', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
      }

      const { analysisId } = await uploadResponse.json()
      setProgress(30)
      setAnalysisStatus('processing')

      // Poll for results
      await pollAnalysisResult(analysisId)

    } catch (error) {
      setError(error.message)
      setAnalysisStatus('error')
    }
  }

  // Poll analysis result
  const pollAnalysisResult = async (analysisId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/deepfake/analysis/${analysisId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch analysis result')
        }

        const result = await response.json()
        
        if (result.status === 'completed') {
          clearInterval(pollInterval)
          setAnalysisResult(result.result)
          setAnalysisStatus('completed')
          setProgress(100)
          onAnalysisComplete?.(result.result)
        } else if (result.status === 'failed') {
          clearInterval(pollInterval)
          throw new Error(result.error || 'Analysis failed')
        } else {
          // Update progress based on status
          if (result.status === 'processing') {
            setProgress(prev => Math.min(prev + 5, 90))
          }
        }
      } catch (error) {
        clearInterval(pollInterval)
        setError(error.message)
        setAnalysisStatus('error')
      }
    }, 2000)

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval)
      if (analysisStatus === 'processing') {
        setError('Analysis timeout. Please try again.')
        setAnalysisStatus('error')
      }
    }, 300000)
  }

  // Reset analyzer
  const resetAnalyzer = () => {
    setUploadedFile(null)
    setAnalysisStatus('idle')
    setAnalysisResult(null)
    setProgress(0)
    setError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  // Get file type icon
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return VideoCameraIcon
    if (file.type.startsWith('image/')) return PhotoIcon
    if (file.type.startsWith('audio/')) return SpeakerWaveIcon
    return DocumentIcon
  }

  // Toggle video playback
  const toggleVideoPlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getRiskColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-red-600 bg-red-50 border-red-200'
    if (confidence >= 0.6) return 'text-orange-600 bg-orange-50 border-orange-200'
    if (confidence >= 0.4) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-green-600 bg-green-50 border-green-200'
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Deepfake Detection
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Upload video, image, or audio files to detect AI-generated content
        </p>
      </div>

      {/* File Upload Area */}
      {!uploadedFile && (
        <motion.div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-all duration-200 
            ${isDragActive 
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
            }
          `}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="mx-auto h-16 w-16 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {isDragActive ? 'Drop your file here' : 'Choose file or drag it here'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Support for video (MP4, AVI, MOV), image (JPEG, PNG), and audio (WAV, MP3) files
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Maximum file size: {maxFileSize / (1024 * 1024)}MB
          </p>
        </motion.div>
      )}

      {/* Uploaded File Preview */}
      {uploadedFile && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              {React.createElement(getFileIcon(uploadedFile), { className: "h-8 w-8 text-blue-500" })}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {uploadedFile.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(uploadedFile.size)} • {uploadedFile.type}
                </p>
              </div>
            </div>
            <button
              onClick={resetAnalyzer}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          </div>

          {/* File Preview */}
          {previewUrl && (
            <div className="mb-4">
              {uploadedFile.type.startsWith('video/') && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    className="w-full max-h-64 rounded-lg"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                  <button
                    onClick={toggleVideoPlayback}
                    className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg opacity-0 hover:opacity-100 transition-opacity"
                  >
                    {isPlaying ? (
                      <PauseIcon className="h-12 w-12 text-white" />
                    ) : (
                      <PlayIcon className="h-12 w-12 text-white" />
                    )}
                  </button>
                </div>
              )}
              {uploadedFile.type.startsWith('image/') && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full max-h-64 object-contain rounded-lg"
                />
              )}
              {uploadedFile.type.startsWith('audio/') && (
                <audio
                  controls
                  src={previewUrl}
                  className="w-full"
                />
              )}
            </div>
          )}

          {/* Analysis Controls */}
          {analysisStatus === 'idle' && (
            <button
              onClick={startAnalysis}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Start Deepfake Analysis
            </button>
          )}

          {/* Progress */}
          {(analysisStatus === 'uploading' || analysisStatus === 'processing') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {analysisStatus === 'uploading' ? 'Uploading file...' : 'Analyzing content...'}
                </span>
                <span className="text-sm text-gray-500">{progress}%</span>
              </div>
              <ProgressBar progress={progress} />
              <LoadingSpinner size="small" />
            </div>
          )}
        </motion.div>
      )}

      {/* Error Alert */}
      {error && (
        <AlertBanner
          type="error"
          title="Analysis Error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Analysis Results */}
      <AnimatePresence>
        {analysisResult && analysisStatus === 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Analysis Results
              </h3>
              {analysisResult.isDeepfake ? (
                <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
              ) : (
                <CheckCircleIcon className="h-8 w-8 text-green-500" />
              )}
            </div>

            {/* Main Result */}
            <div className={`rounded-lg p-4 border ${getRiskColor(analysisResult.confidence)} mb-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-lg">
                    {analysisResult.isDeepfake ? 'Deepfake Detected' : 'Content Appears Authentic'}
                  </h4>
                  <p className="text-sm opacity-75">
                    Confidence: {(analysisResult.confidence * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {(analysisResult.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs opacity-75">
                    {analysisResult.processingTime.toFixed(1)}s
                  </div>
                </div>
              </div>
            </div>

            {/* Anomalies */}
            {analysisResult.anomalies && analysisResult.anomalies.length > 0 && (
              <div className="mb-6">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                  Detected Anomalies
                </h5>
                <div className="space-y-2">
                  {analysisResult.anomalies.map((anomaly, index) => (
                    <div
                      key={index}
                      className="flex items-start space-x-2 text-sm text-orange-700 dark:text-orange-300"
                    >
                      <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{anomaly}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frame-level Analysis (for videos) */}
            {analysisResult.frameLevelAnalysis && analysisResult.frameLevelAnalysis.length > 0 && (
              <div className="mb-6">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                  Frame-level Analysis
                </h5>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {analysisResult.frameLevelAnalysis.map((frame, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700 rounded p-2"
                    >
                      <span>Frame {frame.frameNumber} ({frame.timestamp.toFixed(2)}s)</span>
                      <div className="flex items-center space-x-2">
                        <span className={frame.isManipulated ? 'text-red-600' : 'text-green-600'}>
                          {frame.isManipulated ? 'Manipulated' : 'Authentic'}
                        </span>
                        <span className="text-gray-500">
                          {(frame.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3">
              <button
                onClick={resetAnalyzer}
                className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Analyze Another File
              </button>
              <button
                onClick={() => {
                  // Generate and download report
                  const report = {
                    filename: uploadedFile?.name,
                    analysis: analysisResult,
                    timestamp: new Date().toISOString()
                  }
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `deepfake-analysis-${Date.now()}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Download Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default DeepfakeAnalyzer
