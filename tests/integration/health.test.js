// TIR Browser Platform - Health Endpoints Integration Tests
// Tests for health check endpoints required for ALB

const request = require('supertest');
const app = require('../../src/app');

describe('Health Endpoints', () => {
    describe('GET /health', () => {
        test('should return 200 with health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body).toMatchObject({
                status: 'healthy',
                service: 'tir-browser-auth',
                version: expect.any(String),
                timestamp: expect.any(String),
                correlationId: expect.stringMatching(/^cid-\d+-[a-z0-9]{9}$/)
            });
        });
        
        test('should include correlation ID in response headers', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.headers['x-correlation-id']).toMatch(/^cid-\d+-[a-z0-9]{9}$/);
        });
    });
    
    describe('GET /ready', () => {
        test('should return readiness status', async () => {
            const response = await request(app)
                .get('/ready');
            
            expect(response.status).toBeOneOf([200, 503]);
            expect(response.body).toMatchObject({
                status: expect.stringMatching(/^(ready|not_ready)$/),
                service: 'tir-browser-auth',
                version: expect.any(String),
                checks: expect.any(Object),
                timestamp: expect.any(String),
                correlationId: expect.stringMatching(/^cid-\d+-[a-z0-9]{9}$/)
            });
        });
        
        test('should include dependency checks', async () => {
            const response = await request(app)
                .get('/ready');
            
            expect(response.body.checks).toHaveProperty('service');
            expect(response.body.checks).toHaveProperty('loki');
            expect(response.body.checks).toHaveProperty('dependencies');
        });
    });
    
    describe('GET /status', () => {
        test('should return detailed status information', async () => {
            const response = await request(app)
                .get('/status')
                .expect(200);
            
            expect(response.body).toMatchObject({
                service: {
                    name: 'tir-browser-auth,
                    version: expect.any(String),
                    environment: expect.any(String),
                    uptime: expect.any(Number),
                    memory: expect.any(Object),
                    pid: expect.any(Number)
                },
                health: {
                    status: 'healthy',
                    timestamp: expect.any(String)
                },
                dependencies: expect.any(Object),
                configuration: expect.any(Object),
                correlationId: expect.stringMatching(/^cid-\d+-[a-z0-9]{9}$/)
            });
        });
    });
    
    describe('GET /live', () => {
        test('should return liveness status', async () => {
            const response = await request(app)
                .get('/live')
                .expect(200);
            
            expect(response.body).toMatchObject({
                status: 'alive',
                timestamp: expect.any(String),
                correlationId: expect.stringMatching(/^cid-\d+-[a-z0-9]{9}$/)
            });
        });
    });
    
    describe('Correlation ID Propagation', () => {
        test('should use provided correlation ID', async () => {
            const testCorrelationId = 'cid-1703123456789-testid123';
            
            const response = await request(app)
                .get('/health')
                .set('X-Correlation-ID', testCorrelationId)
                .expect(200);
            
            expect(response.body.correlationId).toBe(testCorrelationId);
            expect(response.headers['x-correlation-id']).toBe(testCorrelationId);
        });
        
        test('should generate new correlation ID if not provided', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body.correlationId).toMatch(/^cid-\d+-[a-z0-9]{9}$/);
            expect(response.headers['x-correlation-id']).toMatch(/^cid-\d+-[a-z0-9]{9}$/);
        });
    });
});

// Custom Jest matcher for multiple possible values
expect.extend({
    toBeOneOf(received, expected) {
        const pass = expected.includes(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be one of ${expected}`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be one of ${expected}`,
                pass: false,
            };
        }
    },
});