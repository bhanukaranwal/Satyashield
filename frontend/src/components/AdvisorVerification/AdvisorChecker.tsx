'use client'

import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  CalendarIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { AdvisorDetails } from '@/types/fraud'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import toast from 'react-hot-toast'

interface AdvisorSearchForm {
  sebiRegNumber?: string
  advisorName?: string
  panNumber?: string
  searchType: 'sebi' | 'name' | 'pan'
}

const schema = yup.object({
  sebiRegNumber: yup.string().when('searchType', {
    is: 'sebi',
    then: yup.string().required('SEBI Registration Number is required').matches(/^[A-Z]{3}[0-9]{6}$/, 'Invalid SEBI format (e.g., INH000000001)'),
  }),
  advisorName: yup.string().when('searchType', {
    is: 'name',
    then: yup.string().required('Advisor name is required').min(3, 'Name must be at least 3 characters'),
  }),
  panNumber: yup.string().when('searchType', {
    is: 'pan',
    then: yup.string().required('PAN number is required').matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
  }),
  searchType: yup.string().oneOf(['sebi', 'name', 'pan']).required(),
})

interface AdvisorCheckerProps {
  className?: string
}

const AdvisorChecker: React.FC<AdvisorCheckerProps> = ({ className }) => {
  const [searchResults, setSearchResults] = useState<AdvisorDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorDetails | null>(null)
  const [bulkUpload, setBulkUpload] = useState<File | null>(null)
  const [bulkResults, setBulkResults] = useState<any[]>([])

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<AdvisorSearchForm>({
    resolver: yupResolver(schema),
    defaultValues: {
      searchType: 'sebi',
    },
  })

  const searchType = watch('searchType')

  const searchAdvisor = useCallback(async (data: AdvisorSearchForm) => {
    setLoading(true)
    try {
      const response = await fetch('/api/advisors/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const results = await response.json()
      setSearchResults(results.data || [])
      
      if (results.data?.length === 0) {
        toast.error('No advisors found matching your search criteria')
      } else {
        toast.success(`Found ${results.data.length} advisor(s)`)
      }
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Failed to search advisors')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBulkUpload = useCallback(async (file: File) => {
    if (!file || !file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/advisors/bulk-verify', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Bulk verification failed')
      }

      const results = await response.json()
      setBulkResults(results.data || [])
      toast.success(`Verified ${results.data?.length || 0} advisors`)
    } catch (error) {
      console.error('Bulk upload error:', error)
      toast.error('Failed to process bulk verification')
    } finally {
      setLoading(false)
    }
  }, [])

  const getVerificationStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'EXPIRED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'SUSPENDED':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'UNVERIFIED':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRiskLevel = (advisor: AdvisorDetails) => {
    let riskScore = 0
    
    if (advisor.verificationStatus === 'SUSPENDED') riskScore += 40
    if (advisor.verificationStatus === 'EXPIRED') riskScore += 30
    if (advisor.verificationStatus === 'UNVERIFIED') riskScore += 50
    if (advisor.riskIndicators.length > 0) riskScore += advisor.riskIndicators.length * 10
    if (advisor.complianceHistory.some(record => record.type === 'VIOLATION')) riskScore += 25

    if (riskScore >= 70) return { level: 'HIGH', color: 'text-red-600 bg-red-50' }
    if (riskScore >= 40) return { level: 'MEDIUM', color: 'text-yellow-600 bg-yellow-50' }
    return { level: 'LOW', color: 'text-green-600 bg-green-50' }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
              <ShieldCheckIcon className="w-8 h-8 mr-3 text-blue-600" />
              SEBI Advisor Verification
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Verify SEBI registered investment advisors and check compliance status
            </p>
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit(searchAdvisor)} className="space-y-4">
          <div className="flex items-center space-x-4 mb-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="sebi"
                {...register('searchType')}
                className="mr-2"
              />
              SEBI Registration Number
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="name"
                {...register('searchType')}
                className="mr-2"
              />
              Advisor Name
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="pan"
                {...register('searchType')}
                className="mr-2"
              />
              PAN Number
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {searchType === 'sebi' && (
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Enter SEBI Registration Number (e.g., INH000000001)"
                  {...register('sebiRegNumber')}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.sebiRegNumber && (
                  <p className="text-red-600 text-sm mt-1">{errors.sebiRegNumber.message}</p>
                )}
              </div>
            )}

            {searchType === 'name' && (
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Enter Advisor Name"
                  {...register('advisorName')}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.advisorName && (
                  <p className="text-red-600 text-sm mt-1">{errors.advisorName.message}</p>
                )}
              </div>
            )}

            {searchType === 'pan' && (
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Enter PAN Number (e.g., ABCDE1234F)"
                  {...register('panNumber')}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {errors.panNumber && (
                  <p className="text-red-600 text-sm mt-1">{errors.panNumber.message}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
                  Search
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                reset()
                setSearchResults([])
                setSelectedAdvisor(null)
              }}
              className="px-4 py-3 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </form>

        {/* Bulk Upload Section */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Bulk Verification
          </h3>
          <div className="flex items-center space-x-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setBulkUpload(file)
                }
              }}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 dark:bg-gray-700 dark:border-gray-600 focus:outline-none"
            />
            <button
              onClick={() => bulkUpload && handleBulkUpload(bulkUpload)}
              disabled={!bulkUpload || loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Upload & Verify
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Upload a CSV file with columns: sebi_reg_number, advisor_name, pan_number
          </p>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Search Results ({searchResults.length} found)
          </h3>
          <div className="space-y-4">
            {searchResults.map((advisor, index) => {
              const risk = getRiskLevel(advisor)
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedAdvisor(advisor)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                          {advisor.name}
                        </h4>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getVerificationStatusColor(advisor.verificationStatus)}`}>
                          {advisor.verificationStatus}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${risk.color}`}>
                          {risk.level} RISK
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">SEBI Reg No:</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {advisor.sebiRegNumber || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">License Type:</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {advisor.licenseType || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Registration Date:</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {advisor.registrationDate ? new Date(advisor.registrationDate).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Expiry Date:</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {advisor.expiryDate ? new Date(advisor.expiryDate).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {advisor.riskIndicators.length > 0 && (
                        <div className="mt-3">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Risk Indicators:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {advisor.riskIndicators.map((indicator, idx) => (
                              <span
                                key={idx}
                                className="inline-flex px-2 py-1 text-xs bg-red-100 text-red-800 rounded"
                              >
                                {indicator}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      {advisor.verificationStatus === 'VERIFIED' ? (
                        <CheckCircleIcon className="w-8 h-8 text-green-500" />
                      ) : advisor.verificationStatus === 'SUSPENDED' ? (
                        <XCircleIcon className="w-8 h-8 text-red-500" />
                      ) : (
                        <ExclamationTriangleIcon className="w-8 h-8 text-yellow-500" />
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Bulk Results */}
      {bulkResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Bulk Verification Results ({bulkResults.length} processed)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Advisor Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    SEBI Reg No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Risk Level
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {bulkResults.map((result, index) => {
                  const risk = result.advisor ? getRiskLevel(result.advisor) : { level: 'UNKNOWN', color: 'text-gray-600 bg-gray-50' }
                  return (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {result.input?.advisor_name || result.advisor?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {result.input?.sebi_reg_number || result.advisor?.sebiRegNumber || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                          result.advisor ? getVerificationStatusColor(result.advisor.verificationStatus) : 'bg-red-100 text-red-800 border-red-200'
                        }`}>
                          {result.advisor?.verificationStatus || 'NOT FOUND'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${risk.color}`}>
                          {risk.level}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {result.advisor && (
                          <button
                            onClick={() => setSelectedAdvisor(result.advisor)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                const csvContent = bulkResults.map(result => ({
                  name: result.input?.advisor_name || result.advisor?.name || 'N/A',
                  sebi_reg_number: result.input?.sebi_reg_number || result.advisor?.sebiRegNumber || 'N/A',
                  status: result.advisor?.verificationStatus || 'NOT FOUND',
                  risk_level: result.advisor ? getRiskLevel(result.advisor).level : 'UNKNOWN',
                }))
                
                const csv = [
                  ['Name', 'SEBI Reg Number', 'Status', 'Risk Level'],
                  ...csvContent.map(row => [row.name, row.sebi_reg_number, row.status, row.risk_level])
                ].map(row => row.join(',')).join('\n')
                
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'advisor_verification_results.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Download Results CSV
            </button>
          </div>
        </motion.div>
      )}

      {/* Selected Advisor Details Modal */}
      {selectedAdvisor && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 overflow-y-auto"
          onClick={() => setSelectedAdvisor(null)}
        >
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />
            
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="inline-block w-full max-w-4xl px-6 py-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  <UserIcon className="w-8 h-8 mr-3 text-blue-600" />
                  Advisor Details
                </h3>
                <button
                  onClick={() => setSelectedAdvisor(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Information */}
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Basic Information
                    </h4>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
                          <dd className="text-sm text-gray-900 dark:text-white font-semibold">{selectedAdvisor.name}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">SEBI Registration</dt>
                          <dd className="text-sm text-gray-900 dark:text-white font-mono">{selectedAdvisor.sebiRegNumber || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">License Type</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{selectedAdvisor.licenseType || 'N/A'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                          <dd>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getVerificationStatusColor(selectedAdvisor.verificationStatus)}`}>
                              {selectedAdvisor.verificationStatus}
                            </span>
                          </dd>
                        </div>
                        {selectedAdvisor.registrationDate && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Registration Date</dt>
                            <dd className="text-sm text-gray-900 dark:text-white">
                              {new Date(selectedAdvisor.registrationDate).toLocaleDateString()}
                            </dd>
                          </div>
                        )}
                        {selectedAdvisor.expiryDate && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Expiry Date</dt>
                            <dd className="text-sm text-gray-900 dark:text-white">
                              {new Date(selectedAdvisor.expiryDate).toLocaleDateString()}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </div>

                  {/* Risk Indicators */}
                  {selectedAdvisor.riskIndicators.length > 0 && (
                    <div>
                      <h5 className="text-md font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                        <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-yellow-500" />
                        Risk Indicators
                      </h5>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                        <div className="flex flex-wrap gap-2">
                          {selectedAdvisor.riskIndicators.map((indicator, idx) => (
                            <span
                              key={idx}
                              className="inline-flex px-3 py-1 text-sm bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full"
                            >
                              {indicator}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Compliance History */}
                  {selectedAdvisor.complianceHistory.length > 0 && (
                    <div>
                      <h5 className="text-md font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                        <DocumentTextIcon className="w-5 h-5 mr-2 text-blue-500" />
                        Compliance History
                      </h5>
                      <div className="space-y-3">
                        {selectedAdvisor.complianceHistory.map((record, idx) => (
                          <div
                            key={idx}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                                    record.type === 'VIOLATION' ? 'bg-red-100 text-red-800' :
                                    record.type === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                                    record.type === 'PENALTY' ? 'bg-orange-100 text-orange-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {record.type}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(record.date).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white">{record.description}</p>
                                {record.amount && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    Amount: ₹{record.amount.toLocaleString()}
                                  </p>
                                )}
                              </div>
                              <span className={`inline-flex px-2 py-1 text-xs rounded ${
                                record.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                                record.status === 'ACTIVE' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {record.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Risk Assessment */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-900 dark:text-white mb-3">
                      Risk Assessment
                    </h5>
                    {(() => {
                      const risk = getRiskLevel(selectedAdvisor)
                      return (
                        <div className="text-center">
                          <div className={`inline-flex px-4 py-2 text-lg font-bold rounded-lg ${risk.color}`}>
                            {risk.level} RISK
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            Based on verification status, compliance history, and risk indicators
                          </p>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-3">
                    <h5 className="font-semibold text-gray-900 dark:text-white">
                      Quick Actions
                    </h5>
                    <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Generate Report
                    </button>
                    <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      Add to Watchlist
                    </button>
                    <button className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
                      Create Alert
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default AdvisorChecker
