'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { FraudAlert, AlertSeverity, AlertStatus, AlertType } from '@/types/fraud'
import { useFraudDetection } from '@/hooks/useFraudDetection'
import { format } from 'date-fns'

interface FraudAlertsProps {
  className?: string
}

const FraudAlerts: React.FC<FraudAlertsProps> = ({ className }) => {
  const { alerts, loading, error, updateAlertStatus, exportAlerts } = useFraudDetection()
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null)
  const [filters, setFilters] = useState({
    severity: '',
    status: '',
    type: '',
    dateRange: '7d',
    search: '',
  })
  const [sortBy, setSortBy] = useState('detectionTime')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const itemsPerPage = 20

  const severityColors = {
    [AlertSeverity.LOW]: 'bg-green-100 text-green-800 border-green-200',
    [AlertSeverity.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [AlertSeverity.HIGH]: 'bg-orange-100 text-orange-800 border-orange-200',
    [AlertSeverity.CRITICAL]: 'bg-red-100 text-red-800 border-red-200',
  }

  const statusColors = {
    [AlertStatus.ACTIVE]: 'bg-red-100 text-red-800 border-red-200',
    [AlertStatus.INVESTIGATING]: 'bg-blue-100 text-blue-800 border-blue-200',
    [AlertStatus.RESOLVED]: 'bg-green-100 text-green-800 border-green-200',
    [AlertStatus.FALSE_POSITIVE]: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  const typeIcons = {
    [AlertType.ADVISOR_FRAUD]: ShieldExclamationIcon,
    [AlertType.DEEPFAKE_DETECTED]: ExclamationTriangleIcon,
    [AlertType.SOCIAL_MEDIA_SCAM]: EyeIcon,
    [AlertType.FAKE_IPO]: ExclamationTriangleIcon,
    [AlertType.TRADING_APP_FRAUD]: ShieldExclamationIcon,
    [AlertType.CORPORATE_ANNOUNCEMENT_FRAUD]: ExclamationTriangleIcon,
    [AlertType.SUSPICIOUS_ACTIVITY]: EyeIcon,
  }

  const filteredAndSortedAlerts = useMemo(() => {
    let filtered = alerts.filter(alert => {
      const matchesSeverity = !filters.severity || alert.severity === filters.severity
      const matchesStatus = !filters.status || alert.status === filters.status
      const matchesType = !filters.type || alert.alertType === filters.type
      const matchesSearch = !filters.search || 
        alert.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        alert.description.toLowerCase().includes(filters.search.toLowerCase())
      
      // Date range filtering
      const now = new Date()
      const alertDate = new Date(alert.detectionTime)
      const daysDiff = Math.floor((now.getTime() - alertDate.getTime()) / (1000 * 60 * 60 * 24))
      
      let matchesDate = true
      switch (filters.dateRange) {
        case '1d':
          matchesDate = daysDiff <= 1
          break
        case '7d':
          matchesDate = daysDiff <= 7
          break
        case '30d':
          matchesDate = daysDiff <= 30
          break
        case '90d':
          matchesDate = daysDiff <= 90
          break
      }

      return matchesSeverity && matchesStatus && matchesType && matchesSearch && matchesDate
    })

    // Sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy as keyof FraudAlert]
      let bValue: any = b[sortBy as keyof FraudAlert]

      if (sortBy === 'detectionTime' || sortBy === 'createdAt' || sortBy === 'updatedAt') {
        aValue = new Date(aValue)
        bValue = new Date(bValue)
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [alerts, filters, sortBy, sortOrder])

  const paginatedAlerts = useMemo(() => {
    const start = (page - 1) * itemsPerPage
    return filteredAndSortedAlerts.slice(start, start + itemsPerPage)
  }, [filteredAndSortedAlerts, page])

  const totalPages = Math.ceil(filteredAndSortedAlerts.length / itemsPerPage)

  const handleStatusUpdate = async (alertId: string, newStatus: AlertStatus) => {
    try {
      await updateAlertStatus(alertId, newStatus)
      // Optionally close the modal if resolved
      if (newStatus === AlertStatus.RESOLVED && selectedAlert?.id === alertId) {
        setSelectedAlert(null)
      }
    } catch (error) {
      console.error('Failed to update alert status:', error)
    }
  }

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-50'
    if (score >= 60) return 'text-orange-600 bg-orange-50'
    if (score >= 40) return 'text-yellow-600 bg-yellow-50'
    return 'text-green-600 bg-green-50'
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Fraud Alerts
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {filteredAndSortedAlerts.length} alerts found
            </p>
          </div>
          <div className="flex items-center space-x-3 mt-4 lg:mt-0">
            <button
              onClick={() => exportAlerts(filteredAndSortedAlerts)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search alerts..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={filters.severity}
            onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Severities</option>
            <option value={AlertSeverity.LOW}>Low</option>
            <option value={AlertSeverity.MEDIUM}>Medium</option>
            <option value={AlertSeverity.HIGH}>High</option>
            <option value={AlertSeverity.CRITICAL}>Critical</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value={AlertStatus.ACTIVE}>Active</option>
            <option value={AlertStatus.INVESTIGATING}>Investigating</option>
            <option value={AlertStatus.RESOLVED}>Resolved</option>
            <option value={AlertStatus.FALSE_POSITIVE}>False Positive</option>
          </select>

          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Types</option>
            <option value={AlertType.ADVISOR_FRAUD}>Advisor Fraud</option>
            <option value={AlertType.DEEPFAKE_DETECTED}>Deepfake</option>
            <option value={AlertType.SOCIAL_MEDIA_SCAM}>Social Media Scam</option>
            <option value={AlertType.FAKE_IPO}>Fake IPO</option>
            <option value={AlertType.TRADING_APP_FRAUD}>Trading App Fraud</option>
            <option value={AlertType.CORPORATE_ANNOUNCEMENT_FRAUD}>Corporate Fraud</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>

          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split(':')
              setSortBy(field)
              setSortOrder(order as 'asc' | 'desc')
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="detectionTime:desc">Newest First</option>
            <option value="detectionTime:asc">Oldest First</option>
            <option value="riskScore:desc">Highest Risk</option>
            <option value="riskScore:asc">Lowest Risk</option>
            <option value="severity:desc">Most Severe</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-600">
            Error loading alerts: {error.message}
          </div>
        ) : paginatedAlerts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            No alerts found matching your criteria
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Alert
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Risk Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Detection Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {paginatedAlerts.map((alert, index) => {
                    const AlertIcon = typeIcons[alert.alertType] || ExclamationTriangleIcon
                    return (
                      <motion.tr
                        key={alert.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        onClick={() => setSelectedAlert(alert)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <AlertIcon className="w-8 h-8 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {alert.title}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">
                                {alert.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${severityColors[alert.severity]}`}>
                            {alert.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-lg ${getRiskScoreColor(alert.riskScore)}`}>
                            {alert.riskScore}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${statusColors[alert.status]}`}>
                            {alert.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(alert.detectionTime), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedAlert(alert)
                              }}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              View
                            </button>
                            {alert.status !== AlertStatus.RESOLVED && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStatusUpdate(alert.id, AlertStatus.INVESTIGATING)
                                }}
                                className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                              >
                                Investigate
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing {((page - 1) * itemsPerPage) + 1} to {Math.min(page * itemsPerPage, filteredAndSortedAlerts.length)} of {filteredAndSortedAlerts.length} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alert Detail Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto"
            onClick={() => setSelectedAlert(null)}
          >
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />
              
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                className="inline-block w-full max-w-4xl px-6 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Alert Details
                  </h3>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <XCircleIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main Content */}
                  <div className="lg:col-span-2 space-y-6">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {selectedAlert.title}
                      </h4>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedAlert.description}
                      </p>
                    </div>

                    {/* Evidence Data */}
                    {selectedAlert.evidenceData && (
                      <div>
                        <h5 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                          Evidence
                        </h5>
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap overflow-x-auto">
                            {JSON.stringify(selectedAlert.evidenceData, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Investigation Notes */}
                    {selectedAlert.investigationNotes && (
                      <div>
                        <h5 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
                          Investigation Notes
                        </h5>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                          <p className="text-gray-800 dark:text-gray-200">
                            {selectedAlert.investigationNotes}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar */}
                  <div className="space-y-6">
                    {/* Metadata */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Alert Information
                      </h5>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Alert ID</dt>
                          <dd className="text-sm text-gray-900 dark:text-white font-mono">{selectedAlert.id}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Type</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{selectedAlert.alertType.replace('_', ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Severity</dt>
                          <dd>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${severityColors[selectedAlert.severity]}`}>
                              {selectedAlert.severity}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Risk Score</dt>
                          <dd>
                            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-lg ${getRiskScoreColor(selectedAlert.riskScore)}`}>
                              {selectedAlert.riskScore}%
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                          <dd>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${statusColors[selectedAlert.status]}`}>
                              {selectedAlert.status}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Detected</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">
                            {format(new Date(selectedAlert.detectionTime), 'PPpp')}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                      <h5 className="font-semibold text-gray-900 dark:text-white">
                        Actions
                      </h5>
                      {selectedAlert.status !== AlertStatus.INVESTIGATING && (
                        <button
                          onClick={() => handleStatusUpdate(selectedAlert.id, AlertStatus.INVESTIGATING)}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Start Investigation
                        </button>
                      )}
                      {selectedAlert.status !== AlertStatus.RESOLVED && (
                        <button
                          onClick={() => handleStatusUpdate(selectedAlert.id, AlertStatus.RESOLVED)}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Mark as Resolved
                        </button>
                      )}
                      {selectedAlert.status !== AlertStatus.FALSE_POSITIVE && (
                        <button
                          onClick={() => handleStatusUpdate(selectedAlert.id, AlertStatus.FALSE_POSITIVE)}
                          className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Mark as False Positive
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default FraudAlerts
