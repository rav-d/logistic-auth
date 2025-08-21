const logger = require('../services/logger')('auth:rate-limiting');
const redisService = require('../services/redis');

// Fallback in-memory store for when Redis is not available
const rateLimitStore = new Map();

// Rate limit configuration
const RATE_LIMITS = {
    DEFAULT: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
    },
    BY_USER_TYPE: {
        ADMIN: { maxRequests: 200 },
        PROVIDER: { maxRequests: 150 },
        DRIVER: { maxRequests: 100 },
        INTERNAL: { maxRequests: 200 }
    },
    BY_ENDPOINT: {
        '/auth/login': { maxRequests: 5 }, // Stricter for login
        '/auth/register': { maxRequests: 3 }, // Very strict for registration
        '/auth/forgot-password': { maxRequests: 3 } // Strict for password reset
    }
};

function getRateLimitKey(req) {
    const userType = req.user?.userType || 'ANONYMOUS';
    const endpoint = req.path;
    const identifier = req.user?.id || req.ip;
    
    return `rate_limit:${userType}:${endpoint}:${identifier}`;
}

function getRateLimit(req) {
    const endpoint = req.path;
    const userType = req.user?.userType || 'DEFAULT';
    
    // Check endpoint-specific limits first
    if (RATE_LIMITS.BY_ENDPOINT[endpoint]) {
        return {
            ...RATE_LIMITS.DEFAULT,
            ...RATE_LIMITS.BY_ENDPOINT[endpoint]
        };
    }
    
    // Check user type limits
    if (RATE_LIMITS.BY_USER_TYPE[userType]) {
        return {
            ...RATE_LIMITS.DEFAULT,
            ...RATE_LIMITS.BY_USER_TYPE[userType]
        };
    }
    
    return RATE_LIMITS.DEFAULT;
}

// Cleanup expired entries for in-memory fallback
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > data.windowMs) {
            rateLimitStore.delete(key);
        }
    }
}

// Cleanup expired entries every 5 minutes for in-memory fallback
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Rate limiting middleware with Redis support and in-memory fallback
 */
async function rateLimitingMiddleware(req, res, next) {
    const key = getRateLimitKey(req);
    const limit = getRateLimit(req);
    const now = Date.now();
    
    try {
        let currentCount = 0;
        let windowStart = now;
        let ttl = Math.ceil(limit.windowMs / 1000);
        
        // Try Redis first, fallback to in-memory
        if (redisService && redisService.isReady()) {
            // Use Redis for rate limiting
            const redisKey = key;
            const expirationSeconds = Math.ceil(limit.windowMs / 1000);
            
            // Increment counter in Redis
            currentCount = await redisService.incr(redisKey, expirationSeconds);
            
            if (currentCount === null) {
                // Redis failed, fallback to in-memory
                logger.warn('Redis rate limiting failed, falling back to in-memory', {
                    key,
                    category: 'rate_limiting'
                });
                throw new Error('Redis unavailable');
            }
            
            // Get TTL for reset time
            const keyTtl = await redisService.ttl(redisKey);
            if (keyTtl > 0) {
                ttl = keyTtl;
                windowStart = now - ((expirationSeconds - keyTtl) * 1000);
            }
            
        } else {
            // Fallback to in-memory storage
            let rateLimitData = rateLimitStore.get(key);
            
            if (!rateLimitData || now - rateLimitData.windowStart > limit.windowMs) {
                // Start new window
                rateLimitData = {
                    count: 0,
                    windowStart: now,
                    windowMs: limit.windowMs
                };
            }
            
            rateLimitData.count++;
            rateLimitStore.set(key, rateLimitData);
            
            currentCount = rateLimitData.count;
            windowStart = rateLimitData.windowStart;
            ttl = Math.ceil((rateLimitData.windowStart + rateLimitData.windowMs - now) / 1000);
        }
        
        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': limit.maxRequests,
            'X-RateLimit-Remaining': Math.max(0, limit.maxRequests - currentCount),
            'X-RateLimit-Reset': new Date(windowStart + limit.windowMs).toISOString()
        });
        
        // Check if limit exceeded
        if (currentCount > limit.maxRequests) {
            logger.warn('Rate limit exceeded', {
                key,
                count: currentCount,
                limit: limit.maxRequests,
                userType: req.user?.userType || 'ANONYMOUS',
                endpoint: req.path,
                ip: req.ip,
                storage: 'redis',
                category: 'rate_limiting'
            });
            
            return res.status(429).json({
                error: 'Too many requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: ttl,
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }
        
        next();
        
    } catch (error) {
        // If Redis fails, fallback to in-memory
        if (error && error.message === 'Redis unavailable') {
            logger.warn('Using in-memory rate limiting fallback', {
                key,
                category: 'rate_limiting'
            });
            
            // Retry with in-memory storage
            let rateLimitData = rateLimitStore.get(key);
            
            if (!rateLimitData || now - rateLimitData.windowStart > limit.windowMs) {
                rateLimitData = {
                    count: 0,
                    windowStart: now,
                    windowMs: limit.windowMs
                };
            }
            
            rateLimitData.count++;
            rateLimitStore.set(key, rateLimitData);
            
            // Set rate limit headers
            res.set({
                'X-RateLimit-Limit': limit.maxRequests,
                'X-RateLimit-Remaining': Math.max(0, limit.maxRequests - rateLimitData.count),
                'X-RateLimit-Reset': new Date(rateLimitData.windowStart + limit.windowMs).toISOString()
            });
            
            // Check if limit exceeded
            if (rateLimitData.count > limit.maxRequests) {
                logger.warn('Rate limit exceeded (in-memory fallback)', {
                    key,
                    count: rateLimitData.count,
                    limit: limit.maxRequests,
                    userType: req.user?.userType || 'ANONYMOUS',
                    endpoint: req.path,
                    ip: req.ip,
                    storage: 'memory',
                    category: 'rate_limiting'
                });
                
                return res.status(429).json({
                    error: 'Too many requests',
                    message: 'Rate limit exceeded. Please try again later.',
                    retryAfter: Math.ceil((rateLimitData.windowStart + limit.windowMs - now) / 1000),
                    correlationId: req.correlationId,
                    timestamp: new Date().toISOString()
                });
            }
            
            next();
        } else {
            // Unexpected error, allow request to proceed
            logger.error('Rate limiting error, allowing request', error, {
                key,
                category: 'rate_limiting'
            });
            next();
        }
    }
}

module.exports = rateLimitingMiddleware;
