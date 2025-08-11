// TIR Browser Platform - Test Setup
// Global test configuration and setup

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SERVICE_SECRET_ARN = 'arn:aws:secretsmanager:test:secret:test-secret-key';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.SERVICE_VERSION = '1.0.0-test';

// Suppress console output during tests (except errors)
const originalConsole = console;
global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: originalConsole.error, // Keep error logging for debugging
    debug: jest.fn()
};

// Global test timeout
jest.setTimeout(10000);

// Clean up after tests
afterAll(async () => {
    // Allow time for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
});