// TIR Browser Platform - Service Authentication Middleware
// Implements service-to-service JWT authentication with shared secret

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { promisify } = require('util');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const logger = require('../services/logger')('auth:auth-middleware');

/**
 * Service Authentication Class
 * Handles JWT token generation and verification for service-to-service communication
 */
class ServiceAuth {
    constructor() {
        this.secretArn = process.env.SERVICE_SECRET_ARN;
        this.secret = null;
        this.secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-central-1' });
        
        if (!this.secretArn) {
            throw new Error('SERVICE_SECRET_ARN environment variable is required');
        }
    }
    
    /**
     * Fetch secret from AWS Secrets Manager
     * @returns {Promise<string>} - The secret value
     */
    async getSecret() {
        if (this.secret) {
            return this.secret;
        }
        
        try {
            const command = new GetSecretValueCommand({ SecretId: this.secretArn });
            const response = await this.secretsClient.send(command);
            this.secret = response.SecretString;
            return this.secret;
        } catch (error) {
            logger.error('Failed to fetch service secret from AWS Secrets Manager', {
                error: error.message,
                secretArn: this.secretArn,
                category: 'service_authentication'
            });
            throw error;
        }
    }

    /**
     * Generate JWT token for service-to-service communication
     * @param {string} serviceName - Name of the calling service
     * @returns {Promise<string>} - JWT token valid for 5 minutes
     */
    async generateToken(serviceName) {
        const secret = await this.getSecret();
        const payload = {
            service: serviceName,
            iat: Math.floor(Date.now() / 1000), // Issued At Time
            exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes expiration
        };
        
        return jwt.sign(payload, secret);
    }

    /**
     * Verify JWT token from service-to-service communication
     * @param {string} token - JWT token to verify
     * @returns {Promise<object|null>} - Decoded token payload or null if invalid
     */
    async verifyToken(token) {
        try {
            const secret = await this.getSecret();
            return jwt.verify(token, secret);
        } catch (error) {
            logger.warn('Service token verification failed', {
                error: error.message,
                category: 'service_authentication'
            });
            return null;
        }
    }
}

// Singleton instance
const serviceAuth = new ServiceAuth();

// AWS Cognito configuration
const cognitoConfig = {
    region: process.env.COGNITO_REGION || 'eu-central-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID
};

// Token cache for performance optimization
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Periodic cleanup of expired tokens from cache
setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;
    
    tokenCache.forEach((value, key) => {
        if (value.expiresAt <= now) {
            tokenCache.delete(key);
            expiredCount++;
        }
    });
    
    if (expiredCount > 0) {
        logger.debug(`Cleaned up ${expiredCount} expired tokens from cache`, {
            cacheSize: tokenCache.size,
            category: 'cache_maintenance'
        });
    }
}, 60 * 1000); // Run every minute

// Validate required Cognito configuration
if (!cognitoConfig.userPoolId) {
    logger.error('Missing required environment variable: COGNITO_USER_POOL_ID', {
        category: 'configuration_error'
    });
}

if (!cognitoConfig.clientId) {
    logger.error('Missing required environment variable: COGNITO_CLIENT_ID', {
        category: 'configuration_error'
    });
}

// Initialize JWKS client for Cognito token verification
const jwksClientInstance = jwksClient({
    cache: true,
    cacheMaxEntries: 5, // Default value
    cacheMaxAge: 10 * 60 * 1000, // 10 minutes
    jwksUri: `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}/.well-known/jwks.json`,
    handleSigningKeyError: (err) => {
        logger.error('JWKS signing key error', err, {
            category: 'authentication_error'
        });
    }
});

// Promisify the getSigningKey function
const getSigningKey = promisify(jwksClientInstance.getSigningKey);

/**
 * MANDATORY: Service authentication middleware for internal endpoints
 * Validates X-Service-Token header for service-to-service communication
 */
async function verifyServiceAuth(req, res, next) {
    const token = req.headers['x-service-token'];
    
    if (!token) {
        logger.warn('Service token missing', {
            path: req.path,
            method: req.method,
            category: 'service_authentication'
        });
        
        return res.status(401).json({
            error: 'Service token required',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
    
    const decoded = await serviceAuth.verifyToken(token);
    if (!decoded) {
        logger.warn('Invalid service token', {
            path: req.path,
            method: req.method,
            category: 'service_authentication'
        });
        
        return res.status(403).json({
            error: 'Invalid service token',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
    
    // Add service context to request
    req.serviceContext = decoded;
    
    logger.debug('Service authentication successful', {
        callingService: decoded.service,
        path: req.path,
        method: req.method,
        category: 'service_authentication'
    });
    
    next();
}

/**
 * User authentication middleware (for external API calls)
 * Validates JWT tokens from AWS Cognito using JWKS
 */
async function verifyUserAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Authorization header required',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
        // Check if token is in cache
        if (tokenCache.has(token)) {
            const cachedData = tokenCache.get(token);
            // Check if cached token is still valid
            if (cachedData.expiresAt > Date.now()) {
                req.user = cachedData.user;
                process.env.USER_ID = req.user.id;
                
                logger.debug('User authenticated from cache', {
                    userId: req.user.id,
                    path: req.path,
                    category: 'user_authentication'
                });
                
                return next();
            } else {
                // Remove expired token from cache
                tokenCache.delete(token);
            }
        }
        
        // First decode without verification to get the key ID (kid)
        const decodedHeader = jwt.decode(token, { complete: true });
        if (!decodedHeader) {
            throw new Error('Invalid token format');
        }
        
        // Get the key ID from the token header
        const kid = decodedHeader.header.kid;
        if (!kid) {
            throw new Error('Token missing key ID (kid)');
        }
        
        // Get the signing key from JWKS
        const signingKey = await getSigningKey(kid);
        const publicKey = signingKey.getPublicKey();
        
        // Verify the token with the public key
        const verifyOptions = {
            issuer: `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`,
            audience: cognitoConfig.clientId,
            algorithms: ['RS256']
        };
        
        const decoded = jwt.verify(token, publicKey, verifyOptions);
        
        // Check token expiration
        const currentTime = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < currentTime) {
            throw new Error('Token expired');
        }
        
        // Check token is not used before it was issued
        if (decoded.iat && decoded.iat > currentTime) {
            throw new Error('Token used before issued');
        }
        
        // Create user object from token claims
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            username: decoded['cognito:username'],
            roles: decoded['cognito:groups'] || [],
            scope: decoded.scope?.split(' ') || []
        };
        
        // Set user ID in process environment for logging
        process.env.USER_ID = req.user.id;
        
        // Cache the verified token
        const tokenExpiry = decoded.exp * 1000; // Convert to milliseconds
        const cacheExpiry = Math.min(
            tokenExpiry, 
            Date.now() + TOKEN_CACHE_TTL
        );
        
        tokenCache.set(token, {
            user: req.user,
            expiresAt: cacheExpiry
        });
        
        logger.info('User authentication successful', {
            userId: req.user.id,
            username: req.user.username,
            path: req.path,
            method: req.method,
            category: 'user_authentication'
        });
        
        next();
    } catch (error) {
        logger.warn('User token verification failed', {
            error: error.message,
            path: req.path,
            method: req.method,
            category: 'user_authentication'
        });
        
        // Return appropriate error based on the failure reason
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }
        
        return res.status(403).json({
            error: 'Invalid authorization token',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = {
    ServiceAuth,
    serviceAuth,
    verifyServiceAuth,
    verifyUserAuth
};