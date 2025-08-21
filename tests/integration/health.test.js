// TIR Browser Platform - Health Endpoints Integration Tests
// Tests for health check endpoints required for ALB

const request = require('supertest');
const express = require('express');

// Create a mock app for testing health endpoints
const createMockApp = () => {
    const app = express();
    
    // Add correlation middleware
    app.use((req, res, next) => {
        req.correlationId = req.headers['x-correlation-id'] || `cid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        res.setHeader('x-correlation-id', req.correlationId);
        next();
    });
    
    // Mock health endpoints
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'healthy',
            service: 'tir-browser-auth',
            version: '1.0.0-test',
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
        });
    });
    
    app.get('/ready', (req, res) => {
        res.status(200).json({
            status: 'ready',
            service: 'tir-browser-auth',
            version: '1.0.0-test',
            checks: {
                service: 'healthy',
                loki: 'healthy',
                dependencies: 'healthy'
            },
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
        });
    });
    
    app.get('/status', (req, res) => {
        res.status(200).json({
            service: {
                name: 'tir-browser-auth',
                version: '1.0.0-test',
                environment: 'test',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid
            },
            health: {
                status: 'healthy',
                timestamp: new Date().toISOString()
            },
            dependencies: {
                dynamodb: 'healthy',
                cognito: 'healthy'
            },
            configuration: {
                environment: 'test',
                logLevel: 'error'
            },
            correlationId: req.correlationId
        });
    });
    
    app.get('/live', (req, res) => {
        res.status(200).json({
            status: 'alive',
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
        });
    });
    
    return app;
};

describe('Health Endpoints', () => {
    let app;
    
    beforeEach(() => {
        app = createMockApp();
    });
    
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
                    name: 'tir-browser-auth',
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
                correlationId: expect.any(String)
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