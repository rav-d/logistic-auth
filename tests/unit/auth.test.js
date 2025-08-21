const request = require('supertest');
const app = require('../../src/app');

describe('Authentication Service - Unit Tests', () => {
    describe('Health Check Endpoints', () => {
        test('GET /health should return 200', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('GET /ready should return 200', async () => {
            const response = await request(app)
                .get('/ready')
                .expect(200);
            
            expect(response.body).toHaveProperty('status', 'ready');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Input Validation', () => {
        test('POST /auth/register with invalid email should return 400', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    userType: 'provider',
                    email: 'invalid-email',
                    password: 'TestPassword123!',
                    country: 'TR'
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error', 'Validation failed');
            expect(response.body.details).toContain('email format is invalid');
        });

        test('POST /auth/register with weak password should return 400', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    userType: 'provider',
                    email: 'test@example.com',
                    password: 'weak',
                    country: 'TR'
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error', 'Validation failed');
            expect(response.body.details).toContain('Password must be at least 8 characters long');
        });

        test('POST /auth/register with invalid userType should return 400', async () => {
            const response = await request(app)
                .post('/auth/register')
                .send({
                    userType: 'invalid',
                    email: 'test@example.com',
                    password: 'TestPassword123!',
                    country: 'TR'
                })
                .expect(400);
            
            expect(response.body).toHaveProperty('error', 'Validation failed');
            expect(response.body.details).toContain('userType must be one of: provider, driver, internal');
        });
    });

    describe('Rate Limiting', () => {
        test('Should include rate limit headers', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.headers).toHaveProperty('x-ratelimit-limit');
            expect(response.headers).toHaveProperty('x-ratelimit-remaining');
            expect(response.headers).toHaveProperty('x-ratelimit-reset');
        });
    });

    describe('Error Handling', () => {
        test('GET /nonexistent should return 404', async () => {
            const response = await request(app)
                .get('/nonexistent')
                .expect(404);
            
            expect(response.body).toHaveProperty('error', 'Route not found');
            expect(response.body).toHaveProperty('correlationId');
        });
    });
});
