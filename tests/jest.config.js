module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Roots
  roots: [
    '<rootDir>/backend/src',
    '<rootDir>/backend/tests',
    '<rootDir>/frontend/src',
    '<rootDir>/frontend/tests',
    '<rootDir>/ai-engine',
    '<rootDir>/tests'
  ],
  
  // Test patterns
  testMatch: [
    '**/tests/**/*.test.{js,ts}',
    '**/src/**/__tests__/**/*.{js,ts}',
    '**/src/**/*.{test,spec}.{js,ts}'
  ],
  
  // Transform files
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Module name mapping
  moduleNameMapping: {
    '@/(.*)': '<rootDir>/src/$1',
    '@backend/(.*)': '<rootDir>/backend/src/$1',
    '@frontend/(.*)': '<rootDir>/frontend/src/$1',
    '@tests/(.*)': '<rootDir>/tests/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'clover',
    'json-summary'
  ],
  
  // Coverage collection
  collectCoverageFrom: [
    'backend/src/**/*.{js,ts}',
    'frontend/src/**/*.{js,ts,tsx}',
    'ai-engine/src/**/*.py',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!**/*.d.ts',
    '!**/tests/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './backend/src/services/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './frontend/src/components/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Projects for multi-project setup
  projects: [
    {
      displayName: 'Backend',
      testMatch: ['<rootDir>/backend/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      globalSetup: '<rootDir>/tests/backend-setup.js',
      globalTeardown: '<rootDir>/tests/backend-teardown.js'
    },
    {
      displayName: 'Frontend',
      testMatch: ['<rootDir>/frontend/**/*.test.{ts,tsx}'],
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/frontend-setup.js']
    },
    {
      displayName: 'Integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.{js,ts}'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      globalSetup: '<rootDir>/tests/integration-setup.js',
      globalTeardown: '<rootDir>/tests/integration-teardown.js'
    },
    {
      displayName: 'E2E',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.{js,ts}'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      testTimeout: 60000
    }
  ],
  
  // Global variables
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: {
        target: 'es2020',
        module: 'esnext',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }
  },
  
  // Error handling
  bail: false,
  errorOnDeprecated: true,
  
  // Watch mode
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
    '<rootDir>/.next/'
  ],
  
  // Cache
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Reporters
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage',
      filename: 'test-report.html',
      expand: true
    }],
    ['jest-junit', {
      outputDirectory: './coverage',
      outputName: 'junit.xml'
    }]
  ]
}
