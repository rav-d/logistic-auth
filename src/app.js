// TIR Browser Platform - auth Service
// Reference implementation demonstrating TIR Browser development standards

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// TIR Browser middleware imports
const { correlationMiddleware } = require('./middleware/correlation');
const { apiLoggingMiddleware, errorLoggingMiddleware } = require('./middleware/logging');
const { metricsMiddleware } = require('./middleware/metrics');
const logger = require('./services/logger')('auth:main');
const metricsService = require('./services/metrics');

// Route imports
const healthRoutes = require('./routes/health');
const apiRoutes = require('./routes/api');

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// MANDATORY: Set service name for authentication
process.env.SERVICE_NAME = 'auth';

/**
 * Application Configuration
 */

// Security middleware - Helmet v8 with Express v4
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "script-src": ["'self'"],
            "img-src": ["'self'", "data:", "https:"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    exposedHeaders: ['X-Correlation-ID']
}));

// Compression for better performance
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * MANDATORY TIR Browser Middleware
 * Order is critical - correlation must be first, then logging
 */

// 1. MANDATORY: Correlation ID middleware (must be first)
app.use(correlationMiddleware);

// 2. Metrics middleware (before path rewriting)
app.use(metricsMiddleware);

// Development path rewriting - strip /auth prefix from shared ALB
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/auth')) {
      req.url = req.url.replace(/^\/auth/, '') || '/';
    }
    next();
  });
}

// 3. MANDATORY: API request/response logging
app.use(apiLoggingMiddleware);

/**
 * Routes Configuration
 */

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Health check routes (no authentication required)
app.use('/', healthRoutes);

// API routes (authentication required)
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
    logger.info('Root endpoint accessed', {
        userAgent: req.get('User-Agent'),
        category: 'api_request'
    });
    
    res.status(200).json({
        service: 'TIR Browser auth Service',
        version: process.env.SERVICE_VERSION || '1.0.0',
        description: 'TIR Browser Platform auth service',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            health: '/health',
            readiness: '/ready',
            status: '/status',
            api: '/api',
            documentation: '/api-docs'
        },
        documentation: {
            standards: 'Implements TIR Browser logging and authentication standards',
            correlationId: 'All requests include correlation ID tracking',
            authentication: 'Service-to-service JWT authentication',
            logging: 'Structured JSON logging with Loki integration'
        },
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    logger.warn('Route not found', {
        path: req.originalUrl,
        method: req.method,
        category: 'api_request'
    });
    
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
    });
});

/**
 * MANDATORY: Error handling middleware (must be last)
 */
app.use(errorLoggingMiddleware);

/**
 * Application Startup
 */

// Validate required environment variables
function validateEnvironment() {
    const required = ['SERVICE_SECRET_ARN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        logger.error('Missing required environment variables', null, {
            missingVariables: missing,
            category: 'application_startup'
        });
        process.exit(1);
    }
    
    logger.info('Environment validation passed', {
        nodeEnv: process.env.NODE_ENV,
        logLevel: process.env.LOG_LEVEL,
        lokiHost: process.env.LOKI_HOST ? 'configured' : 'not_configured',
        category: 'application_startup'
    });
}

// Test Loki connectivity on startup
async function testLokiConnection() {
    if (!process.env.LOKI_HOST) {
        logger.warn('Loki host not configured - logs will only go to console and file', {
            category: 'application_startup'
        });
        return;
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${process.env.LOKI_HOST}/ready`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            logger.info('Loki connection successful', {
                lokiHost: process.env.LOKI_HOST,
                category: 'application_startup'
            });
        } else {
            logger.warn('Loki health check failed', {
                lokiHost: process.env.LOKI_HOST,
                status: response.status,
                category: 'application_startup'
            });
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            logger.warn('Loki connection timeout - service may be starting up', {
                lokiHost: process.env.LOKI_HOST,
                category: 'application_startup'
            });
        } else {
            logger.warn('Loki connection failed - logs will fallback to file', {
                lokiHost: process.env.LOKI_HOST,
                error: error.message,
                category: 'application_startup'
            });
        }
    }
}

// Graceful shutdown handling
function setupGracefulShutdown(server) {
    const shutdown = (signal) => {
        logger.info('Shutdown signal received', {
            signal,
            category: 'application_shutdown'
        });
        
        server.close((err) => {
            if (err) {
                logger.error('Error during server shutdown', err, {
                    category: 'application_shutdown'
                });
                process.exit(1);
            }
            
            logger.info('Server shutdown completed', {
                category: 'application_shutdown'
            });
            process.exit(0);
        });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the application
async function startApplication() {
    try {
        // Validate environment
        validateEnvironment();
        
        // Test Loki connection
        await testLokiConnection();
        
        // Start server
        const server = app.listen(PORT, '0.0.0.0', () => {
            logger.info('TIR Browser auth Service started', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                version: process.env.SERVICE_VERSION || '1.0.0',
                pid: process.pid,
                category: 'application_startup',
                eventType: 'APPLICATION_STARTED'
            });
        });
        
        // Setup graceful shutdown
        setupGracefulShutdown(server);
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error, {
                category: 'application_error'
            });
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection', reason, {
                promise: promise.toString(),
                category: 'application_error'
            });
            process.exit(1);
        });
        
    } catch (error) {
        logger.error('Failed to start application', error, {
            category: 'application_startup'
        });
        process.exit(1);
    }
}

// Start the application
startApplication();

module.exports = app;