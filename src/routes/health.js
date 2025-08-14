// TIR Browser Platform - Health Check Endpoints
// MANDATORY: Health and readiness endpoints for ALB health checks

const express = require('express');
const router = express.Router();
const logger = require('../services/logger')('auth:health-endpoints');
const { serviceClients } = require('../services/service-client');
const metricsService = require('../services/metrics');

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns 200 if service is running
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 correlationId:
 *                   type: string
 */
router.get('/health', (req, res) => {
    logger.debug('Health check requested', {
        category: 'health_check'
    });
    
    res.status(200).json({
        status: 'healthy',
        service: 'tir-browser-auth',
        version: process.env.SERVICE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
    });
});

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Readiness check for ALB
 *     description: Checks dependencies and external services for ALB health checks
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 checks:
 *                   type: object
 *       503:
 *         description: Service not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/ready', async (req, res) => {
    logger.debug('Readiness check requested', {
        category: 'readiness_check'
    });
    
    // Optional Loki health check (if LOKI_HOST configured)
    async function checkLoki() {
        if (!process.env.LOKI_HOST) return 'not_configured';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            const response = await fetch(`${process.env.LOKI_HOST}/ready`, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response.ok ? 'healthy' : 'unhealthy';
        } catch (e) {
            return 'error';
        }
    }

    const checks = {
        service: 'healthy',
        database: 'healthy', // Would check DB connection in real service
        loki: await checkLoki(),
        dependencies: await checkServiceDependencies()
    };
    
    // Check if all checks are healthy (including nested dependencies)
    const isReady = checks.service === 'healthy' && 
                   checks.database === 'healthy' && 
                   Object.values(checks.dependencies).every(status => status === 'healthy');
    
    const statusCode = isReady ? 200 : 503;
    
    logger.debug('Readiness check completed', {
        status: isReady ? 'ready' : 'not_ready',
        checks,
        statusCode,
        category: 'readiness_check'
    });
    
    res.status(statusCode).json({
        status: isReady ? 'ready' : 'not_ready',
        service: 'tir-browser-auth',
        version: process.env.SERVICE_VERSION || '1.0.0',
        checks,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
    });
});

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Detailed status information
 *     description: Returns comprehensive service status including dependencies and configuration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed service status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     environment:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     memory:
 *                       type: object
 *                     pid:
 *                       type: number
 *                 health:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                 dependencies:
 *                   type: object
 *                 configuration:
 *                   type: object
 *                 correlationId:
 *                   type: string
 */
router.get('/status', async (req, res) => {
    logger.debug('Status check requested', {
        category: 'status_check'
    });
    
    const status = {
        service: {
            name: 'tir-browser-auth',
            version: process.env.SERVICE_VERSION || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid
        },
        health: {
            status: 'healthy',
            timestamp: new Date().toISOString()
        },
        dependencies: {
            services: await checkServiceDependencies()
        },
        configuration: {
            logLevel: process.env.LOG_LEVEL || 'info',
            serviceSecret: process.env.SERVICE_SECRET_ARN ? 'configured' : 'not_configured'
        }
    };
    
    
    logger.debug('Status check completed', {
        uptime: status.service.uptime,
        memoryUsage: status.service.memory.heapUsed,
        category: 'status_check'
    });
    
    res.status(200).json({
        ...status,
        correlationId: req.correlationId
    });
});

/**
 * Check service dependencies
 * @returns {object} - Status of each service dependency
 */
async function checkServiceDependencies() {
    const dependencies = {};
    
    // Check configured service clients
    const serviceChecks = Object.entries(serviceClients).map(async ([serviceName, client]) => {
        try {
            const isHealthy = await client.testConnectivity(2000); // 2 second timeout
            dependencies[serviceName] = isHealthy ? 'healthy' : 'unhealthy';
        } catch (error) {
            dependencies[serviceName] = 'error';
        }
    });
    
    await Promise.all(serviceChecks);
    
    return dependencies;
}

/**
 * @swagger
 * /live:
 *   get:
 *     summary: Liveness probe
 *     description: Simple liveness check for Kubernetes/container orchestration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: alive
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 correlationId:
 *                   type: string
 */
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
    });
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     description: Returns Prometheus-formatted metrics for monitoring and alerting
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP tir_browser_http_requests_total Total number of HTTP requests
 *                 # TYPE tir_browser_http_requests_total counter
 *                 auth_http_requests_total{method="GET",route="/health",status_code="200"} 1
 */
router.get('/metrics', async (req, res) => {
    logger.debug('Metrics endpoint requested', {
        category: 'metrics_request'
    });
    
    try {
        const metrics = await metricsService.getMetrics();
        res.set('Content-Type', metricsService.getContentType());
        res.status(200).send(metrics);
        
        logger.debug('Metrics served successfully', {
            category: 'metrics_request'
        });
    } catch (error) {
        logger.error('Failed to serve metrics', error, {
            category: 'metrics_request'
        });
        
        res.status(500).json({
            error: 'Failed to retrieve metrics',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;