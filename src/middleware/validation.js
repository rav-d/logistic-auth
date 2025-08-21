const logger = require('../services/logger')('auth:validation');

// Validation schemas for different endpoints
const VALIDATION_SCHEMAS = {
    '/auth/register': {
        userType: { type: 'string', required: true, enum: ['provider', 'driver', 'internal'] },
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        password: { type: 'string', required: true, minLength: 8, maxLength: 128 },
        country: { type: 'string', required: true, pattern: /^[A-Z]{2}$/ },
        givenName: { type: 'string', required: false, maxLength: 50 },
        familyName: { type: 'string', required: false, maxLength: 50 },
        phoneNumber: { type: 'string', required: false, pattern: /^\+[1-9]\d{1,14}$/ },
        profile: { type: 'object', required: false }
    },
    '/auth/login': {
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        password: { type: 'string', required: true, minLength: 1 }
    },
    '/auth/forgot-password': {
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    },
    '/auth/reset-password': {
        token: { type: 'string', required: true, minLength: 1 },
        password: { type: 'string', required: true, minLength: 8, maxLength: 128 }
    },
    '/auth/verify-email': {
        token: { type: 'string', required: true, minLength: 1 }
    }
};

// Password complexity validation
function validatePasswordComplexity(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const errors = [];
    
    if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
        errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// Input sanitization
function sanitizeInput(input) {
    if (typeof input === 'string') {
        // Remove potential XSS vectors
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }
    return input;
}

// Validate field against schema
function validateField(value, fieldName, schema) {
    const errors = [];
    
    // Check required
    if (schema.required && (value === undefined || value === null || value === '')) {
        errors.push(`${fieldName} is required`);
        return { isValid: false, errors };
    }
    
    // Skip validation if not required and value is empty
    if (!schema.required && (value === undefined || value === null || value === '')) {
        return { isValid: true, errors: [] };
    }
    
    // Type validation
    if (schema.type === 'string' && typeof value !== 'string') {
        errors.push(`${fieldName} must be a string`);
    }
    
    if (schema.type === 'object' && typeof value !== 'object') {
        errors.push(`${fieldName} must be an object`);
    }
    
    // Length validation
    if (schema.minLength && value && value.length < schema.minLength) {
        errors.push(`${fieldName} must be at least ${schema.minLength} characters long`);
    }
    
    if (schema.maxLength && value && value.length > schema.maxLength) {
        errors.push(`${fieldName} must be no more than ${schema.maxLength} characters long`);
    }
    
    // Pattern validation
    if (schema.pattern && value && !schema.pattern.test(value)) {
        errors.push(`${fieldName} format is invalid`);
    }
    
    // Enum validation
    if (schema.enum && value && !schema.enum.includes(value)) {
        errors.push(`${fieldName} must be one of: ${schema.enum.join(', ')}`);
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// Main validation middleware
function validationMiddleware(req, res, next) {
    const endpoint = req.path;
    const schema = VALIDATION_SCHEMAS[endpoint];
    
    if (!schema) {
        // No validation schema for this endpoint
        return next();
    }
    
    const body = req.body || {};
    const errors = [];
    const sanitizedBody = {};
    
    // Validate and sanitize each field
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
        const value = body[fieldName];
        const sanitizedValue = sanitizeInput(value);
        
        const validation = validateField(sanitizedValue, fieldName, fieldSchema);
        if (!validation.isValid) {
            errors.push(...validation.errors);
        }
        
        sanitizedBody[fieldName] = sanitizedValue;
    }
    
    // Special validation for password complexity
    if (body.password && (endpoint === '/auth/register' || endpoint === '/auth/reset-password')) {
        const passwordValidation = validatePasswordComplexity(body.password);
        if (!passwordValidation.isValid) {
            errors.push(...passwordValidation.errors);
        }
    }
    
    // If there are validation errors
    if (errors.length > 0) {
        logger.warn('Validation failed', {
            endpoint,
            errors,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            category: 'input_validation'
        });
        
        return res.status(400).json({
            error: 'Validation failed',
            message: 'Invalid input data',
            details: errors,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
    
    // Replace body with sanitized version
    req.body = sanitizedBody;
    
    next();
}

module.exports = validationMiddleware;
