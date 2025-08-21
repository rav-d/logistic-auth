const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const logger = require('./logger')('auth:security');

class SecurityService {
    constructor() {
        this.client = new DynamoDBClient({ 
            region: process.env.AWS_REGION || 'eu-central-1' 
        });
        this.tableName = process.env.DYNAMO_TABLE_NAME || 'tir-auth-main';
        
        // Security configuration
        this.config = {
            maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS) || 5,
            lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MS) || 15 * 60 * 1000, // 15 minutes
            suspiciousActivityThreshold: parseInt(process.env.SUSPICIOUS_ACTIVITY_THRESHOLD) || 10,
            sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS) || 24 * 60 * 60 * 1000 // 24 hours
        };
    }

    /**
     * Track failed login attempt
     * @param {string} identifier - Email or IP address
     * @param {string} type - 'email' or 'ip'
     * @param {Object} details - Additional details
     */
    async trackFailedAttempt(identifier, type = 'email', details = {}) {
        const key = `${type}:${identifier}`;
        const now = Date.now();
        
        try {
            // Get current failed attempts
            const getParams = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SECURITY#${key}`,
                    SK: 'FAILED_ATTEMPTS'
                })
            };

            const result = await this.client.send(new GetItemCommand(getParams));
            let failedAttempts = result.Item ? unmarshall(result.Item) : null;

            if (!failedAttempts) {
                // First failed attempt
                failedAttempts = {
                    PK: `SECURITY#${key}`,
                    SK: 'FAILED_ATTEMPTS',
                    identifier: identifier,
                    type: type,
                    count: 1,
                    first_attempt: now,
                    last_attempt: now,
                    attempts: [{
                        timestamp: now,
                        details: details
                    }],
                    locked_until: null,
                    ttl: Math.floor(now / 1000) + (24 * 60 * 60) // 24 hours TTL
                };
            } else {
                // Increment failed attempts
                failedAttempts.count += 1;
                failedAttempts.last_attempt = now;
                failedAttempts.attempts.push({
                    timestamp: now,
                    details: details
                });

                // Keep only last 10 attempts
                if (failedAttempts.attempts.length > 10) {
                    failedAttempts.attempts = failedAttempts.attempts.slice(-10);
                }

                // Check if should be locked
                if (failedAttempts.count >= this.config.maxFailedAttempts) {
                    failedAttempts.locked_until = now + this.config.lockoutDuration;
                    
                    logger.warn('Account locked due to failed attempts', {
                        identifier,
                        type,
                        count: failedAttempts.count,
                        lockedUntil: new Date(failedAttempts.locked_until).toISOString(),
                        category: 'security'
                    });
                }
            }

            // Save to DynamoDB
            const putParams = {
                TableName: this.tableName,
                Item: marshall(failedAttempts)
            };

            await this.client.send(new PutItemCommand(putParams));

            return {
                isLocked: failedAttempts.locked_until && now < failedAttempts.locked_until,
                lockedUntil: failedAttempts.locked_until,
                remainingAttempts: Math.max(0, this.config.maxFailedAttempts - failedAttempts.count),
                count: failedAttempts.count
            };

        } catch (error) {
            logger.error('Failed to track failed attempt', error, {
                identifier,
                type,
                category: 'security'
            });
            throw error;
        }
    }

    /**
     * Check if identifier is locked
     * @param {string} identifier - Email or IP address
     * @param {string} type - 'email' or 'ip'
     */
    async isLocked(identifier, type = 'email') {
        const key = `${type}:${identifier}`;
        const now = Date.now();

        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SECURITY#${key}`,
                    SK: 'FAILED_ATTEMPTS'
                })
            };

            const result = await this.client.send(new GetItemCommand(params));
            
            if (!result.Item) {
                return { isLocked: false, remainingAttempts: this.config.maxFailedAttempts };
            }

            const failedAttempts = unmarshall(result.Item);
            const isLocked = failedAttempts.locked_until && now < failedAttempts.locked_until;
            const remainingAttempts = Math.max(0, this.config.maxFailedAttempts - failedAttempts.count);

            return {
                isLocked,
                lockedUntil: failedAttempts.locked_until,
                remainingAttempts,
                count: failedAttempts.count
            };

        } catch (error) {
            logger.error('Failed to check lock status', error, {
                identifier,
                type,
                category: 'security'
            });
            throw error;
        }
    }

    /**
     * Reset failed attempts (on successful login)
     * @param {string} identifier - Email or IP address
     * @param {string} type - 'email' or 'ip'
     */
    async resetFailedAttempts(identifier, type = 'email') {
        const key = `${type}:${identifier}`;

        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SECURITY#${key}`,
                    SK: 'FAILED_ATTEMPTS'
                })
            };

            await this.client.send(new GetItemCommand(params));

            logger.info('Failed attempts reset', {
                identifier,
                type,
                category: 'security'
            });

        } catch (error) {
            logger.error('Failed to reset failed attempts', error, {
                identifier,
                type,
                category: 'security'
            });
            // Don't throw error to avoid breaking login flow
        }
    }

    /**
     * Detect suspicious activity
     * @param {string} identifier - Email or IP address
     * @param {string} type - 'email' or 'ip'
     * @param {Object} activity - Activity details
     */
    async detectSuspiciousActivity(identifier, type = 'email', activity = {}) {
        const key = `${type}:${identifier}`;
        const now = Date.now();

        try {
            // Get recent activity
            const getParams = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SECURITY#${key}`,
                    SK: 'ACTIVITY_LOG'
                })
            };

            const result = await this.client.send(new GetItemCommand(getParams));
            let activityLog = result.Item ? unmarshall(result.Item) : null;

            if (!activityLog) {
                activityLog = {
                    PK: `SECURITY#${key}`,
                    SK: 'ACTIVITY_LOG',
                    identifier: identifier,
                    type: type,
                    activities: [],
                    suspicious_flags: [],
                    ttl: Math.floor(now / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
                };
            }

            // Add new activity
            activityLog.activities.push({
                timestamp: now,
                activity: activity
            });

            // Keep only last 100 activities
            if (activityLog.activities.length > 100) {
                activityLog.activities = activityLog.activities.slice(-100);
            }

            // Check for suspicious patterns
            const recentActivities = activityLog.activities.filter(
                a => now - a.timestamp < 60 * 60 * 1000 // Last hour
            );

            let suspiciousFlags = [];

            // Too many activities in short time
            if (recentActivities.length > this.config.suspiciousActivityThreshold) {
                suspiciousFlags.push({
                    type: 'HIGH_ACTIVITY',
                    timestamp: now,
                    details: `Too many activities: ${recentActivities.length} in last hour`
                });
            }

            // Multiple failed logins from different IPs
            const failedLogins = recentActivities.filter(a => 
                a.activity.type === 'LOGIN_ATTEMPT' && a.activity.status === 'FAILURE'
            );

            const uniqueIPs = new Set(failedLogins.map(a => a.activity.ip));
            if (uniqueIPs.size > 3) {
                suspiciousFlags.push({
                    type: 'MULTIPLE_IPS',
                    timestamp: now,
                    details: `Failed logins from ${uniqueIPs.size} different IPs`
                });
            }

            // Add new flags
            if (suspiciousFlags.length > 0) {
                activityLog.suspicious_flags.push(...suspiciousFlags);
                
                logger.warn('Suspicious activity detected', {
                    identifier,
                    type,
                    flags: suspiciousFlags,
                    category: 'security'
                });
            }

            // Save to DynamoDB
            const putParams = {
                TableName: this.tableName,
                Item: marshall(activityLog)
            };

            await this.client.send(new PutItemCommand(putParams));

            return {
                isSuspicious: suspiciousFlags.length > 0,
                flags: suspiciousFlags,
                recentActivityCount: recentActivities.length
            };

        } catch (error) {
            logger.error('Failed to detect suspicious activity', error, {
                identifier,
                type,
                category: 'security'
            });
            throw error;
        }
    }

    /**
     * Validate session token
     * @param {string} token - Session token
     * @param {string} userId - User ID
     */
    async validateSession(token, userId) {
        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SESSION#${token}`,
                    SK: 'TOKEN'
                })
            };

            const result = await this.client.send(new GetItemCommand(params));
            
            if (!result.Item) {
                return { isValid: false, reason: 'Token not found' };
            }

            const session = unmarshall(result.Item);
            const now = Date.now();

            // Check if session is expired
            if (session.expires_at < now) {
                return { isValid: false, reason: 'Session expired' };
            }

            // Check if session belongs to user
            if (session.user_id !== userId) {
                return { isValid: false, reason: 'Token mismatch' };
            }

            return { isValid: true, session };

        } catch (error) {
            logger.error('Failed to validate session', error, {
                userId,
                category: 'security'
            });
            return { isValid: false, reason: 'Validation error' };
        }
    }

    /**
     * Revoke session token
     * @param {string} token - Session token to revoke
     */
    async revokeSession(token) {
        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `SESSION#${token}`,
                    SK: 'TOKEN'
                })
            };

            await this.client.send(new GetItemCommand(params));

            logger.info('Session revoked', {
                token,
                category: 'security'
            });

        } catch (error) {
            logger.error('Failed to revoke session', error, {
                token,
                category: 'security'
            });
            throw error;
        }
    }
}

// Singleton instance
const securityService = new SecurityService();

module.exports = securityService;
