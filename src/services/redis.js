const { createClient } = require('redis');
const logger = require('./logger')('auth:redis');

class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxRetries = 5;
        
        // Redis configuration
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || null,
            db: parseInt(process.env.REDIS_DB) || 0,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: 3,
            retryDelayOnClusterDown: 300,
            enableOfflineQueue: false,
            connectTimeout: 10000,
            commandTimeout: 5000
        };
    }

    /**
     * Initialize Redis connection
     */
    async connect() {
        try {
            this.client = createClient({
                socket: {
                    host: this.config.host,
                    port: this.config.port,
                    connectTimeout: this.config.connectTimeout,
                    commandTimeout: this.config.commandTimeout
                },
                password: this.config.password,
                database: this.config.db,
                retryDelayOnFailover: this.config.retryDelayOnFailover,
                enableReadyCheck: this.config.enableReadyCheck,
                maxRetriesPerRequest: this.config.maxRetriesPerRequest,
                retryDelayOnClusterDown: this.config.retryDelayOnClusterDown,
                enableOfflineQueue: this.config.enableOfflineQueue
            });

            // Event handlers
            this.client.on('connect', () => {
                logger.info('Redis connecting...', {
                    host: this.config.host,
                    port: this.config.port,
                    category: 'redis_connection'
                });
            });

            this.client.on('ready', () => {
                this.isConnected = true;
                this.connectionRetries = 0;
                logger.info('Redis connected and ready', {
                    host: this.config.host,
                    port: this.config.port,
                    category: 'redis_connection'
                });
            });

            this.client.on('error', (error) => {
                this.isConnected = false;
                logger.error('Redis connection error', error, {
                    host: this.config.host,
                    port: this.config.port,
                    category: 'redis_connection'
                });
            });

            this.client.on('end', () => {
                this.isConnected = false;
                logger.warn('Redis connection ended', {
                    host: this.config.host,
                    port: this.config.port,
                    category: 'redis_connection'
                });
            });

            this.client.on('reconnecting', () => {
                this.connectionRetries++;
                logger.info('Redis reconnecting...', {
                    host: this.config.host,
                    port: this.config.port,
                    retryCount: this.connectionRetries,
                    category: 'redis_connection'
                });
            });

            // Connect to Redis
            await this.client.connect();
            
            // Test connection
            await this.client.ping();
            
            logger.info('Redis service initialized successfully', {
                host: this.config.host,
                port: this.config.port,
                category: 'redis_connection'
            });

        } catch (error) {
            logger.error('Failed to connect to Redis', error, {
                host: this.config.host,
                port: this.config.port,
                category: 'redis_connection'
            });
            
            // If Redis is not available, we'll continue without it
            // Rate limiting will fall back to in-memory storage
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Disconnect from Redis
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            try {
                await this.client.quit();
                this.isConnected = false;
                logger.info('Redis disconnected', {
                    category: 'redis_connection'
                });
            } catch (error) {
                logger.error('Error disconnecting from Redis', error, {
                    category: 'redis_connection'
                });
            }
        }
    }

    /**
     * Check if Redis is connected
     */
    isReady() {
        return this.isConnected && this.client;
    }

    /**
     * Get value from Redis
     */
    async get(key) {
        if (!this.isReady()) {
            return null;
        }

        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error('Redis GET error', error, {
                key,
                category: 'redis_operation'
            });
            return null;
        }
    }

    /**
     * Set value in Redis with optional expiration
     */
    async set(key, value, expirationSeconds = null) {
        if (!this.isReady()) {
            return false;
        }

        try {
            const serializedValue = JSON.stringify(value);
            if (expirationSeconds) {
                await this.client.setEx(key, expirationSeconds, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
            return true;
        } catch (error) {
            logger.error('Redis SET error', error, {
                key,
                expirationSeconds,
                category: 'redis_operation'
            });
            return false;
        }
    }

    /**
     * Delete key from Redis
     */
    async del(key) {
        if (!this.isReady()) {
            return false;
        }

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis DEL error', error, {
                key,
                category: 'redis_operation'
            });
            return false;
        }
    }

    /**
     * Increment counter with optional expiration
     */
    async incr(key, expirationSeconds = null) {
        if (!this.isReady()) {
            return null;
        }

        try {
            const result = await this.client.incr(key);
            
            // Set expiration if provided and key was just created
            if (expirationSeconds && result === 1) {
                await this.client.expire(key, expirationSeconds);
            }
            
            return result;
        } catch (error) {
            logger.error('Redis INCR error', error, {
                key,
                expirationSeconds,
                category: 'redis_operation'
            });
            return null;
        }
    }

    /**
     * Get time to live for a key
     */
    async ttl(key) {
        if (!this.isReady()) {
            return -1;
        }

        try {
            return await this.client.ttl(key);
        } catch (error) {
            logger.error('Redis TTL error', error, {
                key,
                category: 'redis_operation'
            });
            return -1;
        }
    }

    /**
     * Health check for Redis
     */
    async healthCheck() {
        if (!this.isReady()) {
            return false;
        }

        try {
            await this.client.ping();
            return true;
        } catch (error) {
            logger.error('Redis health check failed', error, {
                category: 'health_check'
            });
            return false;
        }
    }

    /**
     * Get Redis info
     */
    async getInfo() {
        if (!this.isReady()) {
            return null;
        }

        try {
            return await this.client.info();
        } catch (error) {
            logger.error('Redis INFO error', error, {
                category: 'redis_operation'
            });
            return null;
        }
    }
}

// Singleton instance
const redisService = new RedisService();

module.exports = redisService;
