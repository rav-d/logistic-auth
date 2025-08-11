// TIR Browser Platform - API Logging Middleware
// MANDATORY: Logs all API requests and responses with proper correlation

const logger = require('../services/logger')('auth:api-middleware');

/**
 * MANDATORY: API request/response logging middleware
 * Logs all incoming requests and outgoing responses with timing and correlation
 */
function apiLoggingMiddleware(req, res, next) {
    const startTime = Date.now();
    
    // Log request start
    logger.debug('API request started', {
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        contentLength: req.get('Content-Length'),
        category: 'api_request'
    });
    
    // Capture original res.end to log response
    const originalEnd = res.end;
    const originalSend = res.send;
    
    // Override res.end to capture response timing
    res.end = function(chunk, encoding) {
        const duration = Date.now() - startTime;
        
        logger.debug('API request completed', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            contentLength: res.get('Content-Length'),
            category: 'api_request'
        });
        
        originalEnd.call(this, chunk, encoding);
    };
    
    // Override res.send to capture response data size
    res.send = function(body) {
        const duration = Date.now() - startTime;
        
        // Log response details
        logger.debug('API response sent', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            responseSize: body ? Buffer.byteLength(JSON.stringify(body)) : 0,
            category: 'api_request'
        });
        
        originalSend.call(this, body);
    };
    
    next();
}

/**
 * Error logging middleware
 * MANDATORY: Logs all HTTP errors with full context
 */
function errorLoggingMiddleware(error, req, res, next) {
    const correlationId = req.correlationId;
    
    // Log error with full context
    logger.error('HTTP error occurred', error, {
        correlationId,
        path: req.path,
        method: req.method,
        statusCode: error.statusCode || 500,
        userId: req.user?.id,
        serviceContext: req.serviceContext?.service,
        category: 'http_error'
    });
    
    // Send structured error response
    const errorResponse = {
        error: {
            message: error.message || 'Internal server error',
            correlationId,
            timestamp: new Date().toISOString()
        }
    };
    
    // Add error details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = error.stack;
        errorResponse.error.details = error.details;
    }
    
    res.status(error.statusCode || 500).json(errorResponse);
}

/**
 * Business event logging helper
 * MANDATORY: Use for all business operations
 */
function logBusinessEvent(eventType, message, metadata = {}) {
    logger.info(message, {
        ...metadata,
        category: 'business_event',
        eventType
    });
}

/**
 * Database operation logging wrapper
 * MANDATORY: Use for all database operations
 */
async function logDatabaseOperation(operation, table, queryFn, metadata = {}) {
    const startTime = Date.now();
    
    logger.debug('Database operation started', {
        operation,
        table,
        ...metadata,
        category: 'database_operation'
    });
    
    try {
        const result = await queryFn();
        const duration = Date.now() - startTime;
        
        logger.debug('Database operation completed', {
            operation,
            table,
            duration,
            success: true,
            ...metadata,
            category: 'database_operation'
        });
        
        return result;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('Database operation failed', error, {
            operation,
            table,
            duration,
            success: false,
            ...metadata,
            category: 'database_operation'
        });
        
        throw error;
    }
}

/**
 * Service communication logging wrapper
 * MANDATORY: Use for all service-to-service calls
 */
async function logServiceCall(targetService, endpoint, callFn, metadata = {}) {
    const startTime = Date.now();
    
    logger.debug('Service call started', {
        targetService,
        endpoint,
        ...metadata,
        category: 'service_communication'
    });
    
    try {
        const result = await callFn();
        const duration = Date.now() - startTime;
        
        logger.debug('Service call completed', {
            targetService,
            endpoint,
            duration,
            success: true,
            statusCode: result?.status || result?.statusCode,
            ...metadata,
            category: 'service_communication'
        });
        
        return result;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('Service call failed', error, {
            targetService,
            endpoint,
            duration,
            success: false,
            ...metadata,
            category: 'service_communication'
        });
        
        throw error;
    }
}

module.exports = {
    apiLoggingMiddleware,
    errorLoggingMiddleware,
    logBusinessEvent,
    logDatabaseOperation,
    logServiceCall
};