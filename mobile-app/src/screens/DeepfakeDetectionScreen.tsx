import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ScrollView,
  Dimensions,
  PermissionsAndroid,
  Platform
} from 'react-native'
import { launchImageLibrary, launchCamera, MediaType } from 'react-native-image-picker'
import DocumentPicker from 'react-native-document-picker'
import Video from 'react-native-video'
import { ProgressBar } from '../components/ProgressBar'
import { theme } from '../theme'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'

const { width: screenWidth } = Dimensions.get('window')

interface DeepfakeDetectionScreenProps {
  navigation: any
}

const DeepfakeDetectionScreen: React.FC<DeepfakeDetectionScreenProps> = ({ navigation }) => {
  const [selectedMedia, setSelectedMedia] = useState<any>(null)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<Video>(null)

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'SatyaShield needs access to camera for deepfake detection',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        )
        return granted === PermissionsAndroid.RESULTS.GRANTED
      } catch (err) {
        console.warn(err)
        return false
      }
    }
    return true
  }

  const showMediaOptions = () => {
    Alert.alert(
      'Select Media',
      'Choose how you want to add media for deepfake detection',
      [
        { text: 'Camera', onPress: openCamera },
        { text: 'Photo Library', onPress: openImageLibrary },
        { text: 'File Browser', onPress: openDocumentPicker },
        { text: 'Cancel', style: 'cancel' }
      ]
    )
  }

  const openCamera = async () => {
    const hasPermission = await requestCameraPermission()
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Camera permission is required for this feature')
      return
    }

    launchCamera(
      {
        mediaType: 'mixed' as MediaType,
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
      },
      (response) => {
        if (response.didCancel || response.errorMessage) {
          return
        }
        
        if (response.assets && response.assets[0]) {
          setSelectedMedia(response.assets[0])
        }
      }
    )
  }

  const openImageLibrary = () => {
    launchImageLibrary(
      {
        mediaType: 'mixed' as MediaType,
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
      },
      (response) => {
        if (response.didCancel || response.errorMessage) {
          return
        }
        
        if (response.assets && response.assets[0]) {
          setSelectedMedia(response.assets[0])
        }
      }
    )
  }

  const openDocumentPicker = async () => {
    try {
      const results = await DocumentPicker.pick({
        type: [
          DocumentPicker.types.images,
          DocumentPicker.types.video,
          DocumentPicker.types.audio
        ],
      })
      
      if (results && results[0]) {
        setSelectedMedia({
          uri: results[0].uri,
          type: results[0].type,
          fileName: results[0].name,
          fileSize: results[0].size
        })
      }
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to pick document')
      }
    }
  }

  const analyzeMedia = async () => {
    if (!selectedMedia) {
      Alert.alert('Error', 'Please select a media file first')
      return
    }

    setLoading(true)
    setProgress(0)
    setAnalysisResult(null)

    try {
      const formData = new FormData()
      formData.append('file', {
        uri: selectedMedia.uri,
        type: selectedMedia.type,
        name: selectedMedia.fileName || 'media_file'
      } as any)

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 500)

      const response = await fetch(`${process.env.API_URL}/api/deepfake/analyze`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      const result = await response.json()
      setAnalysisResult(result.data)
      setProgress(100)

      // Show notification based on result
      if (result.data.isDeepfake) {
        Alert.alert(
          'Deepfake Detected!',
          `This media appears to be artificially generated with ${(result.data.confidence * 100).toFixed(1)}% confidence.`,
          [{ text: 'OK', style: 'default' }]
        )
      }

    } catch (error) {
      Alert.alert('Error', 'Failed to analyze media. Please try again.')
      console.error('Analysis error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAuthToken = async () => {
    // Implement token retrieval from secure storage
    return 'your-auth-token'
  }

  const resetAnalysis = () => {
    setSelectedMedia(null)
    setAnalysisResult(null)
    setProgress(0)
  }

  const getRiskColor = (confidence: number) => {
    if (confidence >= 0.8) return theme.colors.error
    if (confidence >= 0.6) return theme.colors.warning
    if (confidence >= 0.4) return theme.colors.info
    return theme.colors.success
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deepfake Detection</Text>
      </View>

      {/* Upload Section */}
      {!selectedMedia ? (
        <View style={styles.uploadSection}>
          <TouchableOpacity style={styles.uploadButton} onPress={showMediaOptions}>
            <Icon name="cloud-upload" size={64} color={theme.colors.primary} />
            <Text style={styles.uploadText}>Tap to upload media</Text>
            <Text style={styles.uploadSubtext}>
              Support for photos, videos, and audio files
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mediaPreview}>
          {/* Media Preview */}
          <View style={styles.previewContainer}>
            {selectedMedia.type?.startsWith('image/') ? (
              <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} />
            ) : selectedMedia.type?.startsWith('video/') ? (
              <Video
                ref={videoRef}
                source={{ uri: selectedMedia.uri }}
                style={styles.previewVideo}
                controls={true}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.audioPreview}>
                <Icon name="music" size={64} color={theme.colors.primary} />
                <Text style={styles.audioText}>Audio File</Text>
              </View>
            )}
          </View>

          {/* File Info */}
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{selectedMedia.fileName}</Text>
            <Text style={styles.fileDetails}>
              {formatFileSize(selectedMedia.fileSize)} • {selectedMedia.type}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.resetButton} onPress={resetAnalysis}>
              <Icon name="refresh" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.resetButtonText}>Choose Different</Text>
            </TouchableOpacity>
            
            {!loading && !analysisResult && (
              <TouchableOpacity style={styles.analyzeButton} onPress={analyzeMedia}>
                <Icon name="magnify" size={20} color="white" />
                <Text style={styles.analyzeButtonText}>Analyze</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Progress */}
          {loading && (
            <View style={styles.progressSection}>
              <Text style={styles.progressText}>
                {progress < 50 ? 'Uploading...' : 'Analyzing...'}
              </Text>
              <ProgressBar progress={progress} style={styles.progressBar} />
              <Text style={styles.progressPercent}>{progress}%</Text>
            </View>
          )}

          {/* Results */}
          {analysisResult && (
            <View style={styles.resultsSection}>
              <View style={[
                styles.resultHeader,
                { backgroundColor: analysisResult.isDeepfake ? theme.colors.errorLight : theme.colors.successLight }
              ]}>
                <Icon 
                  name={analysisResult.isDeepfake ? "alert-circle" : "check-circle"} 
                  size={32} 
                  color={analysisResult.isDeepfake ? theme.colors.error : theme.colors.success} 
                />
                <View style={styles.resultHeaderText}>
                  <Text style={[
                    styles.resultTitle,
                    { color: analysisResult.isDeepfake ? theme.colors.error : theme.colors.success }
                  ]}>
                    {analysisResult.isDeepfake ? 'Deepfake Detected' : 'Content Appears Authentic'}
                  </Text>
                  <Text style={styles.resultSubtitle}>
                    Confidence: {(analysisResult.confidence * 100).toFixed(1)}%
                  </Text>
                </View>
              </View>

              {/* Risk Score */}
              <View style={styles.riskScoreContainer}>
                <Text style={styles.riskScoreLabel}>Risk Score</Text>
                <View style={styles.riskScoreBar}>
                  <View 
                    style={[
                      styles.riskScoreFill,
                      { 
                        width: `${analysisResult.confidence * 100}%`,
                        backgroundColor: getRiskColor(analysisResult.confidence)
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.riskScoreValue, { color: getRiskColor(analysisResult.confidence) }]}>
                  {(analysisResult.confidence * 100).toFixed(0)}%
                </Text>
              </View>

              {/* Processing Time */}
              <View style={styles.processingTime}>
                <Icon name="clock-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.processingTimeText}>
                  Processed in {analysisResult.processingTime.toFixed(1)}s
                </Text>
              </View>

              {/* Anomalies */}
              {analysisResult.anomalies && analysisResult.anomalies.length > 0 && (
                <View style={styles.anomaliesSection}>
                  <Text style={styles.anomaliesTitle}>Detected Anomalies:</Text>
                  {analysisResult.anomalies.map((anomaly: string, index: number) => (
                    <View key={index} style={styles.anomalyItem}>
                      <Icon name="alert" size={16} color={theme.colors.warning} />
                      <Text style={styles.anomalyText}>{anomaly}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.resultActions}>
                <TouchableOpacity style={styles.shareButton} onPress={() => {
                  // Implement sharing functionality
                  Alert.alert('Share', 'Sharing functionality to be implemented')
                }}>
                  <Icon name="share" size={20} color={theme.colors.primary} />
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.reportButton} onPress={() => {
                  // Implement report generation
                  Alert.alert('Report', 'Report generation to be implemented')
                }}>
                  <Icon name="file-document" size={20} color={theme.colors.primary} />
                  <Text style={styles.reportButtonText}>Generate Report</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  uploadSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    alignItems: 'center',
    padding: 48,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    width: '100%',
  },
  uploadText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 16,
  },
  uploadSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  mediaPreview: {
    flex: 1,
  },
  previewContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
  },
  previewVideo: {
    width: '100%',
    height: 200,
  },
  audioPreview: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
  audioText: {
    fontSize: 16,
    color: theme.colors.primary,
    marginTop: 8,
  },
  fileInfo: {
    marginBottom: 16,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  fileDetails: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 8,
  },
  resetButtonText: {
    marginLeft: 8,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  analyzeButtonText: {
    marginLeft: 8,
    color: 'white',
    fontWeight: '600',
  },
  progressSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 12,
  },
  progressBar: {
    marginBottom: 8,
  },
  progressPercent: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  resultsSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  resultHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  resultSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  riskScoreContainer: {
    marginBottom: 16,
  },
  riskScoreLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 8,
  },
  riskScoreBar: {
    height: 8,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  riskScoreFill: {
    height: '100%',
    borderRadius: 4,
  },
  riskScoreValue: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  processingTime: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  processingTimeText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  anomaliesSection: {
    marginBottom: 16,
  },
  anomaliesTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: 8,
  },
  anomalyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  anomalyText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  resultActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  shareButtonText: {
    marginLeft: 8,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  reportButtonText: {
    marginLeft: 8,
    color: theme.colors.primary,
    fontWeight: '500',
  },
})

export default DeepfakeDetectionScreen
