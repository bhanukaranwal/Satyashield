import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit'
import LinearGradient from 'react-native-linear-gradient'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { Card, Title, Paragraph, Badge, FAB, Portal, Modal } from 'react-native-paper'
import { useFocusEffect } from '@react-navigation/native'

import { RootState } from '../store'
import { fetchDashboardData, selectAlert } from '../store/slices/dashboardSlice'
import { FraudAlert, AlertSeverity, AlertStatus } from '../types'
import { theme } from '../theme'
import LoadingSpinner from '../components/LoadingSpinner'
import AlertCard from '../components/AlertCard'
import StatCard from '../components/StatCard'
import RealTimeIndicator from '../components/RealTimeIndicator'

const { width: screenWidth } = Dimensions.get('window')

interface DashboardScreenProps {
  navigation: any
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const dispatch = useDispatch()
  const {
    statistics,
    recentAlerts,
    trendData,
    loading,
    error,
    lastUpdated,
    isConnected,
  } = useSelector((state: RootState) => state.dashboard)
  
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d')
  const [filterModalVisible, setFilterModalVisible] = useState(false)

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchDashboardData(selectedTimeRange))
    }, [dispatch, selectedTimeRange])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await dispatch(fetchDashboardData(selectedTimeRange))
    setRefreshing(false)
  }, [dispatch, selectedTimeRange])

  const handleAlertPress = useCallback((alert: FraudAlert) => {
    dispatch(selectAlert(alert))
    navigation.navigate('AlertDetail', { alertId: alert.id })
  }, [dispatch, navigation])

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${theme.colors.primaryRgb}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${theme.colors.textRgb}, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: theme.colors.primary,
    },
  }

  const trendChartData = useMemo(() => ({
    labels: trendData?.labels || [],
    datasets: [
      {
        data: trendData?.fraudAlerts || [],
        color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
        strokeWidth: 2,
      },
      {
        data: trendData?.riskScores || [],
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2,
      },
    ],
    legend: ['Alerts', 'Risk Score'],
  }), [trendData])

  const severityDistribution = useMemo(() => [
    {
      name: 'Critical',
      population: statistics?.alertsBySeverity?.CRITICAL || 0,
      color: '#EF4444',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'High',
      population: statistics?.alertsBySeverity?.HIGH || 0,
      color: '#F97316',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'Medium',
      population: statistics?.alertsBySeverity?.MEDIUM || 0,
      color: '#EAB308',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
    {
      name: 'Low',
      population: statistics?.alertsBySeverity?.LOW || 0,
      color: '#22C55E',
      legendFontColor: theme.colors.text,
      legendFontSize: 12,
    },
  ], [statistics])

  const statCards = useMemo(() => [
    {
      title: 'Total Alerts',
      value: statistics?.totalAlerts || 0,
      change: '+12.5%',
      changeType: 'positive' as const,
      icon: 'shield-alert',
      color: '#EF4444',
    },
    {
      title: 'High Risk',
      value: statistics?.alertsBySeverity?.HIGH || 0,
      change: '-8.2%',
      changeType: 'negative' as const,
      icon: 'alert-triangle',
      color: '#F97316',
    },
    {
      title: 'Resolved',
      value: statistics?.alertsByStatus?.RESOLVED || 0,
      change: '+15.3%',
      changeType: 'positive' as const,
      icon: 'check-circle',
      color: '#22C55E',
    },
    {
      title: 'Investigating',
      value: statistics?.alertsByStatus?.INVESTIGATING || 0,
      change: '+5.7%',
      changeType: 'positive' as const,
      icon: 'magnify',
      color: '#3B82F6',
    },
  ], [statistics])

  if (loading && !refreshing) {
    return <LoadingSpinner message="Loading dashboard..." />
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={64} color={theme.colors.error} />
        <Text style={styles.errorText}>Failed to load dashboard</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryDark]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>SatyaShield</Text>
            <Text style={styles.headerSubtitle}>Fraud Detection Dashboard</Text>
          </View>
          <View style={styles.headerActions}>
            <RealTimeIndicator connected={isConnected} />
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setFilterModalVisible(true)}
            >
              <Icon name="filter" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          {statCards.map((stat, index) => (
            <StatCard key={index} {...stat} />
          ))}
        </View>

        {/* Trend Chart */}
        <Card style={styles.chartCard}>
          <Card.Content>
            <Title>Fraud Alert Trends</Title>
            <Paragraph>Last {selectedTimeRange}</Paragraph>
            <LineChart
              data={trendChartData}
              width={screenWidth - 64}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
          </Card.Content>
        </Card>

        {/* Severity Distribution */}
        <Card style={styles.chartCard}>
          <Card.Content>
            <Title>Alert Severity Distribution</Title>
            <PieChart
              data={severityDistribution}
              width={screenWidth - 64}
              height={220}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
              style={styles.chart}
            />
          </Card.Content>
        </Card>

        {/* Recent Alerts */}
        <Card style={styles.alertsCard}>
          <Card.Content>
            <View style={styles.alertsHeader}>
              <Title>Recent Alerts</Title>
              <TouchableOpacity
                onPress={() => navigation.navigate('Alerts')}
                style={styles.viewAllButton}
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Icon name="arrow-right" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            {recentAlerts.length === 0 ? (
              <View style={styles.noAlertsContainer}>
                <Icon name="shield-check" size={48} color={theme.colors.success} />
                <Text style={styles.noAlertsText}>No recent alerts</Text>
                <Text style={styles.noAlertsSubtext}>Your system is secure</Text>
              </View>
            ) : (
              recentAlerts.slice(0, 5).map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onPress={() => handleAlertPress(alert)}
                  style={styles.alertCard}
                />
              ))
            )}
          </Card.Content>
        </Card>

        {/* Quick Actions */}
        <Card style={styles.actionsCard}>
          <Card.Content>
            <Title>Quick Actions</Title>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => navigation.navigate('AdvisorVerification')}
              >
                <Icon name="shield-account" size={32} color="white" />
                <Text style={styles.actionButtonText}>Verify Advisor</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.secondary }]}
                onPress={() => navigation.navigate('DeepfakeDetection')}
              >
                <Icon name="face-recognition" size={32} color="white" />
                <Text style={styles.actionButtonText}>Deepfake Check</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.warning }]}
                onPress={() => navigation.navigate('SocialMonitoring')}
              >
                <Icon name="eye" size={32} color="white" />
                <Text style={styles.actionButtonText}>Social Monitor</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
                onPress={() => navigation.navigate('Reports')}
              >
                <Icon name="chart-line" size={32} color="white" />
                <Text style={styles.actionButtonText}>Generate Report</Text>
              </TouchableOpacity>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Filter Modal */}
      <Portal>
        <Modal
          visible={filterModalVisible}
          onDismiss={() => setFilterModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <Text style={styles.modalTitle}>Time Range</Text>
          {['1d', '7d', '30d', '90d'].map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeOption,
                selectedTimeRange === range && styles.selectedTimeRange,
              ]}
              onPress={() => {
                setSelectedTimeRange(range)
                setFilterModalVisible(false)
              }}
            >
              <Text
                style={[
                  styles.timeRangeText,
                  selectedTimeRange === range && styles.selectedTimeRangeText,
                ]}
              >
                {range === '1d' ? 'Last 24 hours' :
                 range === '7d' ? 'Last 7 days' :
                 range === '30d' ? 'Last 30 days' :
                 'Last 90 days'}
              </Text>
              {selectedTimeRange === range && (
                <Icon name="check" size={20} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </Modal>
      </Portal>

      {/* Floating Action Button */}
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() =>
          Alert.alert(
            'Create Alert',
            'What would you like to do?',
            [
              { text: 'Manual Alert', onPress: () => navigation.navigate('CreateAlert') },
              { text: 'Scan Document', onPress: () => navigation.navigate('DocumentScanner') },
              { text: 'Cancel', style: 'cancel' },
            ]
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  filterButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  alertsCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
  alertCard: {
    marginBottom: 8,
  },
  noAlertsContainer: {
    alignItems: 'center',
    padding: 32,
  },
  noAlertsText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 12,
  },
  noAlertsSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  actionsCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  actionButton: {
    width: (screenWidth - 64) / 2 - 8,
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  timeRangeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedTimeRange: {
    backgroundColor: `${theme.colors.primary}20`,
  },
  timeRangeText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  selectedTimeRangeText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.primary,
  },
  bottomSpacing: {
    height: 80,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.error,
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
})

export default DashboardScreen
