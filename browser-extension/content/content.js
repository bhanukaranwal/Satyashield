class SatyaShieldContentScript {
  constructor() {
    this.apiUrl = 'https://api.satyashield.com'
    this.isEnabled = true
    this.scanResults = new Map()
    this.observers = new Map()
    this.riskThreshold = 70
    this.lastScanTime = 0
    this.scanCooldown = 5000 // 5 seconds
    
    this.init()
  }

  async init() {
    console.log('SatyaShield: Initializing content script')
    
    // Load user settings
    await this.loadSettings()
    
    // Set up page monitoring
    this.setupPageMonitoring()
    
    // Set up message listener
    this.setupMessageListener()
    
    // Inject overlay styles and elements
    this.injectOverlay()
    
    // Start initial scan
    if (this.isEnabled) {
      this.performInitialScan()
    }
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        'isEnabled',
        'riskThreshold',
        'scanMode',
        'notificationLevel'
      ])
      
      this.isEnabled = settings.isEnabled !== false
      this.riskThreshold = settings.riskThreshold || 70
      this.scanMode = settings.scanMode || 'automatic'
      this.notificationLevel = settings.notificationLevel || 'medium'
    } catch (error) {
      console.error('SatyaShield: Failed to load settings', error)
    }
  }

  setupPageMonitoring() {
    // Monitor DOM changes
    const observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return
      
      const hasSignificantChanges = mutations.some(mutation => 
        mutation.type === 'childList' && 
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some(node => 
          node.nodeType === Node.ELEMENT_NODE &&
          (node.tagName === 'FORM' || 
           node.className?.includes('investment') ||
           node.className?.includes('trading') ||
           node.textContent?.includes('SEBI') ||
           node.textContent?.includes('investment'))
        )
      )
      
      if (hasSignificantChanges) {
        this.throttledScan()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    })

    this.observers.set('dom', observer)

    // Monitor URL changes (for SPAs)
    let currentUrl = window.location.href
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href
        this.handleUrlChange()
      }
    })

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    })

    this.observers.set('url', urlObserver)
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'scan_page':
          this.scanCurrentPage().then(sendResponse)
          return true // Keep message channel open for async response
          
        case 'toggle_protection':
          this.toggleProtection().then(sendResponse)
          return true
          
        case 'get_page_info':
          sendResponse(this.getPageInfo())
          break
          
        case 'update_settings':
          this.updateSettings(request.settings).then(sendResponse)
          return true
          
        default:
          console.warn('SatyaShield: Unknown message action:', request.action)
      }
    })
  }

  injectOverlay() {
    // Create overlay container
    const overlay = document.createElement('div')
    overlay.id = 'satyashield-overlay'
    overlay.className = 'satyashield-overlay'
    overlay.innerHTML = `
      <div id="satyashield-alerts-container"></div>
      <div id="satyashield-scan-indicator" class="satyashield-scan-indicator hidden">
        <div class="satyashield-spinner"></div>
        <span>Scanning for fraud...</span>
      </div>
    `
    
    document.documentElement.appendChild(overlay)
  }

  async performInitialScan() {
    if (Date.now() - this.lastScanTime < this.scanCooldown) {
      return
    }

    this.showScanIndicator()
    
    try {
      const results = await this.scanCurrentPage()
      this.processScanResults(results)
    } catch (error) {
      console.error('SatyaShield: Initial scan failed', error)
    } finally {
      this.hideScanIndicator()
    }
  }

  throttledScan = this.debounce(() => {
    this.performInitialScan()
  }, 2000)

  debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  async scanCurrentPage() {
    const pageInfo = this.getPageInfo()
    const pageContent = this.extractPageContent()
    
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/scan/webpage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`
        },
        body: JSON.stringify({
          url: window.location.href,
          domain: window.location.hostname,
          title: document.title,
          content: pageContent,
          metadata: pageInfo,
          timestamp: new Date().toISOString()
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const results = await response.json()
      this.lastScanTime = Date.now()
      
      return results
    } catch (error) {
      console.error('SatyaShield: Scan request failed', error)
      throw error
    }
  }

  getPageInfo() {
    return {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      hasSSL: window.location.protocol === 'https:',
      userAgent: navigator.userAgent,
      referrer: document.referrer,
      cookies: document.cookie ? document.cookie.split(';').length : 0,
      hasJavaScript: true,
      pageLanguage: document.documentElement.lang || 'unknown',
      metaTags: this.extractMetaTags(),
      forms: this.analyzeForms(),
      links: this.analyzeLinks(),
      certificates: this.analyzeCertificates(),
      reputation: this.checkDomainReputation()
    }
  }

  extractPageContent() {
    // Extract text content while preserving structure
    const content = {
      text: document.body.innerText || '',
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
        level: h.tagName,
        text: h.textContent
      })),
      links: Array.from(document.querySelectorAll('a[href]')).map(link => ({
        text: link.textContent,
        href: link.href,
        external: !link.href.includes(window.location.hostname)
      })),
      images: Array.from(document.querySelectorAll('img[src]')).map(img => ({
        src: img.src,
        alt: img.alt || ''
      })),
      forms: Array.from(document.querySelectorAll('form')).map(form => ({
        action: form.action,
        method: form.method,
        fields: Array.from(form.querySelectorAll('input,select,textarea')).map(field => ({
          type: field.type,
          name: field.name,
          required: field.required
        }))
      })),
      keywords: this.extractKeywords()
    }

    return content
  }

  extractMetaTags() {
    const metaTags = {}
    document.querySelectorAll('meta').forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property')
      const content = meta.getAttribute('content')
      if (name && content) {
        metaTags[name] = content
      }
    })
    return metaTags
  }

  analyzeForms() {
    const forms = Array.from(document.querySelectorAll('form'))
    return forms.map(form => {
      const fields = Array.from(form.querySelectorAll('input,select,textarea'))
      
      return {
        action: form.action,
        method: form.method.toLowerCase(),
        hasPasswordField: fields.some(f => f.type === 'password'),
        hasFileUpload: fields.some(f => f.type === 'file'),
        hasHiddenFields: fields.some(f => f.type === 'hidden'),
        fieldCount: fields.length,
        hasSSL: form.action.startsWith('https://') || window.location.protocol === 'https:',
        suspiciousKeywords: this.checkSuspiciousKeywords(form.innerHTML)
      }
    })
  }

  analyzeLinks() {
    const links = Array.from(document.querySelectorAll('a[href]'))
    const externalLinks = links.filter(link => !link.href.includes(window.location.hostname))
    const suspiciousLinks = externalLinks.filter(link => 
      this.checkSuspiciousKeywords(link.href + ' ' + link.textContent)
    )

    return {
      total: links.length,
      external: externalLinks.length,
      suspicious: suspiciousLinks.length,
      domains: [...new Set(externalLinks.map(link => new URL(link.href).hostname))]
    }
  }

  analyzeCertificates() {
    // Basic SSL analysis (limited in content script context)
    return {
      hasSSL: window.location.protocol === 'https:',
      mixedContent: this.hasMixedContent(),
      securityHeaders: this.checkSecurityHeaders()
    }
  }

  hasMixedContent() {
    const httpResources = Array.from(document.querySelectorAll('img,script,link')).filter(el => {
      const src = el.src || el.href
      return src && src.startsWith('http:') && window.location.protocol === 'https:'
    })
    
    return httpResources.length > 0
  }

  checkSecurityHeaders() {
    // This would need to be checked via background script
    // as content scripts can't access response headers
    return {
      checked: false,
      reason: 'Headers not accessible from content script'
    }
  }

  checkDomainReputation() {
    const domain = window.location.hostname
    const suspiciousPatterns = [
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // IP addresses
      /[0-9]{4,}/, // Long numbers in domain
      /xn--/, // Punycode domains
      /(fake|scam|fraud|phish|malware)/i, // Suspicious keywords
      /[a-z]{20,}/, // Very long domain names
    ]

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(domain))
    
    return {
      domain,
      isSuspicious,
      reasons: suspiciousPatterns
        .filter(pattern => pattern.test(domain))
        .map(pattern => `Matches pattern: ${pattern.toString()}`)
    }
  }

  extractKeywords() {
    const text = document.body.innerText.toLowerCase()
    const financialKeywords = [
      'investment', 'trading', 'broker', 'sebi', 'nse', 'bse',
      'mutual fund', 'ipo', 'demat', 'portfolio', 'equity',
      'commodity', 'derivative', 'option', 'future', 'margin',
      'leverage', 'return', 'profit', 'guaranteed', 'risk-free'
    ]

    const fraudKeywords = [
      'guaranteed returns', 'risk-free', 'instant profit',
      'double your money', 'insider information', 'hot tip',
      'limited time offer', 'exclusive deal', 'secret strategy',
      'get rich quick', 'no risk', 'sure shot', 'foolproof'
    ]

    const foundFinancial = financialKeywords.filter(keyword => text.includes(keyword))
    const foundFraud = fraudKeywords.filter(keyword => text.includes(keyword))

    return {
      financial: foundFinancial,
      fraud: foundFraud,
      riskScore: foundFraud.length * 20 // Each fraud keyword adds 20 points
    }
  }

  checkSuspiciousKeywords(text) {
    const suspiciousKeywords = [
      'guaranteed returns', 'risk-free investment', 'double your money',
      'insider trading', 'secret tips', 'instant profit',
      'no risk guaranteed', 'sure shot profit', 'get rich quick',
      'urgent investment opportunity', 'limited seats left',
      'call now', 'act fast', 'exclusive offer'
    ]

    return suspiciousKeywords.some(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  processScanResults(results) {
    if (!results || !results.data) {
      console.warn('SatyaShield: Invalid scan results')
      return
    }

    const { riskScore, threats, recommendations } = results.data

    // Store results
    this.scanResults.set(window.location.href, {
      ...results.data,
      timestamp: Date.now()
    })

    // Display alerts based on risk score and notification level
    if (riskScore >= this.riskThreshold) {
      this.showHighRiskAlert(riskScore, threats)
    } else if (riskScore >= 50 && this.notificationLevel !== 'low') {
      this.showMediumRiskAlert(riskScore, threats)
    } else if (riskScore >= 25 && this.notificationLevel === 'high') {
      this.showLowRiskAlert(riskScore, threats)
    }

    // Update page indicators
    this.updatePageIndicators(riskScore, threats)

    // Send results to background script
    chrome.runtime.sendMessage({
      action: 'scan_results',
      data: {
        url: window.location.href,
        results: results.data
      }
    })
  }

  showHighRiskAlert(riskScore, threats) {
    const alertHtml = `
      <div class="satyashield-alert satyashield-alert-critical" id="satyashield-alert-${Date.now()}">
        <div class="satyashield-alert-header">
          <div class="satyashield-alert-icon">⚠️</div>
          <div class="satyashield-alert-title">High Risk Website Detected</div>
          <button class="satyashield-alert-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="satyashield-alert-content">
          <p><strong>Risk Score: ${riskScore}%</strong></p>
          <p>This website has been flagged as potentially fraudulent.</p>
          <ul>
            ${threats.map(threat => `<li>${threat.description}</li>`).join('')}
          </ul>
          <div class="satyashield-alert-actions">
            <button onclick="window.close()" class="satyashield-btn-danger">Leave Site</button>
            <button onclick="this.closest('.satyashield-alert').remove()" class="satyashield-btn-secondary">Continue at Risk</button>
          </div>
        </div>
      </div>
    `

    const alertsContainer = document.getElementById('satyashield-alerts-container')
    alertsContainer.innerHTML = alertHtml

    // Auto-hide after 30 seconds for critical alerts
    setTimeout(() => {
      const alert = document.querySelector('.satyashield-alert-critical')
      if (alert) {
        alert.style.opacity = '0.8'
      }
    }, 30000)
  }

  showMediumRiskAlert(riskScore, threats) {
    const alertHtml = `
      <div class="satyashield-alert satyashield-alert-warning" id="satyashield-alert-${Date.now()}">
        <div class="satyashield-alert-header">
          <div class="satyashield-alert-icon">⚡</div>
          <div class="satyashield-alert-title">Potential Risk Detected</div>
          <button class="satyashield-alert-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="satyashield-alert-content">
          <p><strong>Risk Score: ${riskScore}%</strong></p>
          <p>Please exercise caution on this website.</p>
          <details>
            <summary>View Details</summary>
            <ul>
              ${threats.map(threat => `<li>${threat.description}</li>`).join('')}
            </ul>
          </details>
        </div>
      </div>
    `

    const alertsContainer = document.getElementById('satyashield-alerts-container')
    alertsContainer.innerHTML = alertHtml

    // Auto-hide after 15 seconds
    setTimeout(() => {
      const alert = document.querySelector('.satyashield-alert-warning')
      if (alert) alert.remove()
    }, 15000)
  }

  showLowRiskAlert(riskScore, threats) {
    const alertHtml = `
      <div class="satyashield-alert satyashield-alert-info" id="satyashield-alert-${Date.now()}">
        <div class="satyashield-alert-header">
          <div class="satyashield-alert-icon">ℹ️</div>
          <div class="satyashield-alert-title">Security Notice</div>
          <button class="satyashield-alert-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="satyashield-alert-content">
          <p>Risk Score: ${riskScore}% - Minor security considerations detected.</p>
        </div>
      </div>
    `

    const alertsContainer = document.getElementById('satyashield-alerts-container')
    alertsContainer.innerHTML = alertHtml

    // Auto-hide after 10 seconds
    setTimeout(() => {
      const alert = document.querySelector('.satyashield-alert-info')
      if (alert) alert.remove()
    }, 10000)
  }

  updatePageIndicators(riskScore, threats) {
    // Update page favicon with risk indicator
    this.updateFavicon(riskScore)
    
    // Update page title with risk indicator
    if (riskScore >= this.riskThreshold) {
      document.title = `🚨 ${document.title.replace(/^🚨 /, '')}`
    }

    // Highlight suspicious elements
    this.highlightSuspiciousElements(threats)
  }

  updateFavicon(riskScore) {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')

    // Draw background circle
    ctx.fillStyle = riskScore >= 70 ? '#ef4444' : riskScore >= 50 ? '#f59e0b' : '#22c55e'
    ctx.beginPath()
    ctx.arc(16, 16, 15, 0, 2 * Math.PI)
    ctx.fill()

    // Draw shield icon
    ctx.fillStyle = 'white'
    ctx.font = '16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('🛡️', 16, 20)

    // Update favicon
    const link = document.createElement('link')
    link.type = 'image/x-icon'
    link.rel = 'shortcut icon'
    link.href = canvas.toDataURL('image/x-icon')
    document.getElementsByTagName('head')[0].appendChild(link)
  }

  highlightSuspiciousElements(threats) {
    threats.forEach(threat => {
      if (threat.elements && threat.elements.length > 0) {
        threat.elements.forEach(elementInfo => {
          const element = document.querySelector(elementInfo.selector)
          if (element) {
            element.classList.add('satyashield-suspicious')
            element.title = `SatyaShield: ${threat.description}`
          }
        })
      }
    })
  }

  showScanIndicator() {
    const indicator = document.getElementById('satyashield-scan-indicator')
    if (indicator) {
      indicator.classList.remove('hidden')
    }
  }

  hideScanIndicator() {
    const indicator = document.getElementById('satyashield-scan-indicator')
    if (indicator) {
      indicator.classList.add('hidden')
    }
  }

  async toggleProtection() {
    this.isEnabled = !this.isEnabled
    await chrome.storage.sync.set({ isEnabled: this.isEnabled })
    
    if (this.isEnabled) {
      this.performInitialScan()
    } else {
      // Clear all alerts and indicators
      const alertsContainer = document.getElementById('satyashield-alerts-container')
      if (alertsContainer) {
        alertsContainer.innerHTML = ''
      }
      
      // Remove highlights
      document.querySelectorAll('.satyashield-suspicious').forEach(el => {
        el.classList.remove('satyashield-suspicious')
      })
    }

    return { enabled: this.isEnabled }
  }

  async updateSettings(settings) {
    Object.assign(this, settings)
    await chrome.storage.sync.set(settings)
    
    // Re-scan if settings changed significantly
    if (settings.riskThreshold !== undefined || settings.scanMode !== undefined) {
      this.performInitialScan()
    }

    return { success: true }
  }

  handleUrlChange() {
    console.log('SatyaShield: URL changed, re-scanning...')
    setTimeout(() => this.performInitialScan(), 1000) // Delay to let page load
  }

  async getAuthToken() {
    const { authToken } = await chrome.storage.local.get(['authToken'])
    return authToken || null
  }

  cleanup() {
    // Clean up observers
    this.observers.forEach(observer => observer.disconnect())
    this.observers.clear()

    // Remove overlay
    const overlay = document.getElementById('satyashield-overlay')
    if (overlay) {
      overlay.remove()
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SatyaShieldContentScript()
  })
} else {
  new SatyaShieldContentScript()
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.satyaShieldContentScript) {
    window.satyaShieldContentScript.cleanup()
  }
})
