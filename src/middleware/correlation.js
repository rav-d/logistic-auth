// TIR Browser Platform - Correlation ID Middleware
// MANDATORY: Implements exact correlation ID format and propagation

/**
 * Generates correlation ID in TIR Browser mandatory format
 * Format: cid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}
 * Example: cid-1703123456789-k2j8h9x3q
 */
function generateCorrelationId() {
    return `cid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validates correlation ID format
 * @param {string} correlationId - Correlation ID to validate
 * @returns {boolean} - True if format is valid
 */
function validateCorrelationId(correlationId) {
    if (!correlationId) {
        return false;
    }
    
    // Validate format: cid-{timestamp}-{random}
    const pattern = /^cid-\d+-[a-z0-9]{9}$/;
    return pattern.test(correlationId);
}

/**
 * MANDATORY: Correlation ID middleware for all Express applications
 * - Extracts existing correlation ID or generates new one
 * - Sets correlation ID in process environment for logger access
 * - Adds correlation ID to response headers
 * - Validates correlation ID format
 */
function correlationMiddleware(req, res, next) {
    // Extract existing correlation ID (case-insensitive header check)
    const existingCorrelationId = req.headers['x-correlation-id'] || req.headers['X-Correlation-ID'];
    
    let correlationId;
    
    if (existingCorrelationId) {
        // Validate existing correlation ID
        if (validateCorrelationId(existingCorrelationId)) {
            correlationId = existingCorrelationId;
        } else {
            // Invalid format - generate new one and log warning
            correlationId = generateCorrelationId();
            console.warn('Invalid correlation ID format received:', existingCorrelationId);
        }
    } else {
        // Generate new correlation ID for entry point
        correlationId = generateCorrelationId();
    }
    
    // Set correlation ID in request object
    req.correlationId = correlationId;
    
    // Normalize header (lowercase)
    req.headers['x-correlation-id'] = correlationId;
    
    // Add to response headers for client tracking
    res.setHeader('X-Correlation-ID', correlationId);
    
    // MANDATORY: Set in process environment for logger access
    process.env.CORRELATION_ID = correlationId;
    
    // Extract and set user ID if available (from JWT token)
    if (req.user && req.user.id) {
        process.env.USER_ID = req.user.id;
    } else {
        process.env.USER_ID = null;
    }
    
    next();
}

/**
 * Validation middleware for correlation ID format
 * Returns 400 error for invalid correlation ID format
 */
function correlationValidationMiddleware(req, res, next) {
    const correlationId = req.headers['x-correlation-id'];
    
    if (correlationId && !validateCorrelationId(correlationId)) {
        return res.status(400).json({
            error: 'Invalid correlation ID format',
            expected: 'cid-{timestamp}-{random}',
            received: correlationId,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
    
    next();
}

module.exports = {
    correlationMiddleware,
    correlationValidationMiddleware,
    generateCorrelationId,
    validateCorrelationId
};