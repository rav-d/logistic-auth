// TIR Browser Platform - Jest Configuration
// Test configuration for sample application

module.exports = {
    // Test environment
    testEnvironment: 'node',
    
    // Test file patterns - Jest v30 supports more extensions
    testMatch: [
        '**/tests/**/*.test.{js,mjs,cjs}',
        '**/tests/**/*.spec.{js,mjs,cjs}'
    ],
    
    // Coverage configuration
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/app.js', // Exclude main app file from coverage
        '!**/node_modules/**'
    ],
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    
    // Test timeout
    testTimeout: 10000,
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Force exit after tests complete
    forceExit: true,
    
    // Detect open handles
    detectOpenHandles: true,
    
    // Jest v30 specific configurations
    globalsCleanup: true,
    waitForUnhandledRejections: true
};