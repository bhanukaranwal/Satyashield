# SatyaShield API Documentation

## Overview
The SatyaShield API provides comprehensive fraud detection capabilities for the Indian securities market. This RESTful API enables real-time fraud detection, advisor verification, deepfake analysis, and social media monitoring.

## Base URL
- **Production**: `https://api.satyashield.com/api/v1`
- **Staging**: `https://staging-api.satyashield.com/api/v1`
- **Development**: `http://localhost:5000/api/v1`

## Authentication

### JWT Bearer Token
All API requests require authentication using JWT Bearer tokens.

Authorization: Bearer <your-jwt-token>



### Obtaining Tokens

#### Login
POST /auth/login
Content-Type: application/json

{
"email": "user@example.com",
"password": "securePassword123"
}



**Response:**
{
"success": true,
"data": {
"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
"expiresAt": "2025-09-04T10:30:00.000Z",
"user": {
"id": "60d5ec49f1b2c8b1f8c4e123",
"email": "user@example.com",
"role": "INVESTOR"
}
}
}



## Core Endpoints

### Fraud Detection

#### Create Fraud Alert
POST /fraud/alerts
Content-Type: application/json
Authorization: Bearer <token>

{
"alertType": "ADVISOR_FRAUD",
"severity": "HIGH",
"title": "Suspicious Investment Advisor",
"description": "Advisor claiming guaranteed 50% returns",
"evidenceData": {
"advisorDetails": {
"name": "John Scammer",
"sebiRegNumber": "INH123456789",
"claims": ["Guaranteed returns", "Risk-free investment"]
},
"sourceUrl": "https://suspicious-site.com/advisor"
}
}



**Response:**
{
"success": true,
"data": {
"id": "64a1b2c3d4e5f6789012345",
"alertType": "ADVISOR_FRAUD",
"severity": "HIGH",
"riskScore": 85,
"status": "ACTIVE",
"detectionTime": "2025-09-04T04:10:00.000Z",
"title": "Suspicious Investment Advisor",
"description": "Advisor claiming guaranteed 50% returns"
}
}



#### Get Fraud Alerts
GET /fraud/alerts?page=1&limit=20&severity=HIGH&status=ACTIVE
Authorization: Bearer <token>



**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `severity` (optional): Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)
- `status` (optional): Filter by status (ACTIVE, INVESTIGATING, RESOLVED, FALSE_POSITIVE)
- `alertType` (optional): Filter by alert type
- `search` (optional): Search in title and description
- `dateFrom` (optional): Filter alerts from date (ISO 8601)
- `dateTo` (optional): Filter alerts to date (ISO 8601)

**Response:**
{
"success": true,
"data": {
"alerts": [
{
"id": "64a1b2c3d4e5f6789012345",
"alertType": "ADVISOR_FRAUD",
"severity": "HIGH",
"title": "Suspicious Investment Advisor",
"riskScore": 85,
"status": "ACTIVE",
"detectionTime": "2025-09-04T04:10:00.000Z"
}
],
"pagination": {
"page": 1,
"limit": 20,
"total": 150,
"totalPages": 8,
"hasNext": true,
"hasPrev": false
}
}
}



### SEBI Advisor Verification

#### Verify Single Advisor
POST /advisors/verify
Content-Type: application/json
Authorization: Bearer <token>

{
"searchType": "sebi",
"sebiRegNumber": "INH000000001"
}



**Response:**
{
"success": true,
"data": [
{
"name": "ABC Investment Advisors",
"sebiRegNumber": "INH000000001",
"licenseType": "INVESTMENT_ADVISOR",
"verificationStatus": "VERIFIED",
"registrationDate": "2020-01-15T00:00:00.000Z",
"expiryDate": "2025-01-15T00:00:00.000Z",
"riskIndicators": [],
"complianceHistory": [
{
"date": "2023-06-15T00:00:00.000Z",
"type": "WARNING",
"description": "Minor compliance issue resolved",
"status": "RESOLVED"
}
]
}
]
}



#### Bulk Advisor Verification
POST /advisors/bulk-verify
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: advisors.csv



**CSV Format:**
sebi_reg_number,advisor_name,pan_number
INH000000001,ABC Investment Advisors,ABCDE1234F
INH000000002,XYZ Financial Services,XYZAB5678G



### Deepfake Detection

#### Analyze Video/Image
POST /deepfake/analyze
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: suspicious_video.mp4
analysisType: video



**Response:**
{
"success": true,
"data": {
"id": "64a1b2c3d4e5f6789012346",
"fileName": "suspicious_video.mp4",
"fileSize": 15728640,
"analysisStatus": "COMPLETED",
"result": {
"isDeepfake": true,
"confidence": 0.87,
"overallScore": 87,
"frameLevelAnalysis": [
{
"frameNumber": 1,
"timestamp": 0.033,
"isManipulated": true,
"confidence": 0.89,
"anomalies": ["Facial landmark inconsistency"]
}
],
"anomalies": [
"Temporal inconsistency detected",
"Unnatural eye movement patterns"
]
},
"processingTime": 45.2
}
}



#### Get Analysis Status
GET /deepfake/analysis/{analysisId}
Authorization: Bearer <token>



### Social Media Monitoring

#### Start Social Media Scan
POST /social/scan
Content-Type: application/json
Authorization: Bearer <token>

{
"platforms": ["TELEGRAM", "TWITTER"],
"keywords": ["guaranteed returns", "risk-free investment"],
"duration": 3600,
"language": "en"
}



**Response:**
{
"success": true,
"data": {
"scanId": "64a1b2c3d4e5f6789012347",
"status": "ACTIVE",
"platforms": ["TELEGRAM", "TWITTER"],
"startTime": "2025-09-04T04:10:00.000Z",
"estimatedEndTime": "2025-09-04T05:10:00.000Z"
}
}



#### Get Scan Results
GET /social/scan/{scanId}/results
Authorization: Bearer <token>



### IPO Verification

#### Verify IPO Authenticity
POST /ipo/verify
Content-Type: application/json
Authorization: Bearer <token>

{
"companyName": "ABC Technologies Ltd",
"issueSize": "1000 Crores",
"priceRange": "100-120",
"openDate": "2025-09-15",
"closeDate": "2025-09-18"
}



### Trading App Validation

#### Validate Trading App
POST /trading-apps/validate
Content-Type: application/json
Authorization: Bearer <token>

{
"appName": "TradingPro",
"packageName": "com.example.tradingpro",
"developer": "FinTech Solutions",
"version": "1.2.3",
"storeUrl": "https://play.google.com/store/apps/details?id=com.example.tradingpro"
}



## WebSocket API

### Connection
const socket = io('wss://api.satyashield.com', {
auth: {
token: 'your-jwt-token'
}
});



### Real-time Events

#### Fraud Alert
socket.on('fraud_alert', (data) => {
console.log('New fraud alert:', data);
// Handle real-time fraud alert
});



#### Risk Score Update
socket.on('risk_score_update', (data) => {
console.log('Risk score updated:', data);
// Update UI with new risk score
});



#### System Status
socket.on('system_status', (data) => {
console.log('System status:', data);
// Handle system status changes
});



## Error Handling

### Error Response Format
{
"success": false,
"error": {
"code": "VALIDATION_ERROR",
"message": "Invalid input data",
"details": "Email format is invalid",
"timestamp": "2025-09-04T04:10:00.000Z",
"requestId": "req_123456789"
}
}



### Common Error Codes
- `AUTHENTICATION_ERROR` (401): Invalid or expired token
- `AUTHORIZATION_ERROR` (403): Insufficient permissions
- `VALIDATION_ERROR` (400): Invalid input data
- `NOT_FOUND` (404): Resource not found
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error
- `SERVICE_UNAVAILABLE` (503): Service temporarily unavailable

## Rate Limiting

- **Default**: 100 requests per 15 minutes per IP
- **Authenticated**: 1000 requests per 15 minutes per user
- **Premium**: 5000 requests per 15 minutes per user

### Rate Limit Headers
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1725426600



## SDK Examples

### Node.js SDK
const SatyaShield = require('@satyashield/sdk');

const client = new SatyaShield({
apiKey: 'your-api-key',
baseURL: 'https://api.satyashield.com/api/v1'
});

// Verify advisor
const advisor = await client.advisors.verify({
sebiRegNumber: 'INH000000001'
});

// Create fraud alert
const alert = await client.fraud.createAlert({
alertType: 'ADVISOR_FRAUD',
severity: 'HIGH',
title: 'Suspicious Activity'
});



### Python SDK
from satyashield import SatyaShieldClient

client = SatyaShieldClient(
api_key='your-api-key',
base_url='https://api.satyashield.com/api/v1'
)

Analyze deepfake
result = client.deepfake.analyze_video('suspicious_video.mp4')
print(f"Deepfake probability: {result.confidence}")

Monitor social media
scan = client.social.start_scan(
platforms=['TELEGRAM', 'TWITTER'],
keywords=['guaranteed returns']
)



## Webhooks

### Configuration
POST /webhooks
Content-Type: application/json
Authorization: Bearer <token>

{
"url": "https://your-app.com/webhooks/satyashield",
"events": ["fraud_alert.created", "analysis.completed"],
"secret": "your-webhook-secret"
}



### Webhook Payload
{
"id": "evt_123456789",
"type": "fraud_alert.created",
"created": "2025-09-04T04:10:00.000Z",
"data": {
"object": {
"id": "64a1b2c3d4e5f6789012345",
"alertType": "ADVISOR_FRAUD",
"severity": "HIGH",
"riskScore": 85
}
}
}
