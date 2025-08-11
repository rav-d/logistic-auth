// TIR Browser Platform - Metrics Middleware
// Automatically tracks HTTP request metrics for Prometheus

const metricsService = require('../services/metrics');
const logger = require('../services/logger')('auth:metrics-middleware');

/**
 * Middleware to track HTTP request metrics
 */
function metricsMiddleware(req, res, next) {
    const startTime = Date.now();
    
    // Track request start
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Override response methods to capture metrics
    res.send = function(body) {
        recordMetrics();
        return originalSend.call(this, body);
    };
    
    res.json = function(body) {
        recordMetrics();
        return originalJson.call(this, body);
    };
    
    // Handle response finish event
    res.on('finish', recordMetrics);
    
    function recordMetrics() {
        // Avoid double recording
        if (res.metricsRecorded) return;
        res.metricsRecorded = true;
        
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        const route = getRoutePattern(req);
        
        // Record HTTP request metrics
        metricsService.recordHttpRequest(
            req.method,
            route,
            res.statusCode,
            duration
        );
        
        logger.debug('HTTP request metrics recorded', {
            method: req.method,
            route,
            statusCode: res.statusCode,
            duration,
            category: 'metrics'
        });
    }
    
    next();
}

/**
 * Get route pattern for metrics (normalize dynamic routes)
 */
function getRoutePattern(req) {
    // Use the matched route if available (from Express router)
    if (req.route && req.route.path) {
        return req.route.path;
    }
    
    // Normalize common patterns
    let path = req.path;
    
    // Replace UUIDs and IDs with placeholders
    path = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
    path = path.replace(/\/\d+/g, '/:id');
    
    // Replace correlation IDs
    path = path.replace(/\/cid-\d+-[a-z0-9]+/gi, '/:correlationId');
    
    return path || '/';
}

module.exports = { metricsMiddleware };