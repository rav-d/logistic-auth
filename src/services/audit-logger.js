const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const logger = require('./logger')('auth:audit-logger');

class AuditLogger {
    constructor() {
        this.client = new DynamoDBClient({ 
            region: process.env.AWS_REGION || 'eu-central-1' 
        });
        this.tableName = process.env.DYNAMO_TABLE_NAME || 'tir-auth-main';
    }

    /**
     * Log an audit event
     * @param {Object} eventData - Event data to log
     * @param {string} eventData.eventType - Type of event (e.g., USER_REGISTERED, LOGIN_ATTEMPT)
     * @param {string} eventData.userId - User ID (if applicable)
     * @param {string} eventData.userType - Type of user
     * @param {string} eventData.action - Action performed
     * @param {Object} eventData.details - Additional event details
     * @param {string} eventData.ip - IP address
     * @param {string} eventData.userAgent - User agent string
     * @param {string} eventData.correlationId - Correlation ID
     * @param {string} eventData.status - Event status (SUCCESS, FAILURE, WARNING)
     */
    async logEvent(eventData) {
        const {
            eventType,
            userId,
            userType,
            action,
            details = {},
            ip,
            userAgent,
            correlationId,
            status = 'SUCCESS'
        } = eventData;

        const timestamp = new Date().toISOString();
        const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const auditRecord = {
            PK: `AUDIT#${auditId}`,
            SK: `EVENT#${eventType}`,
            GSI1PK: userId ? `USER#${userId}` : 'ANONYMOUS',
            GSI1SK: `AUDIT#${timestamp}`,
            audit_id: auditId,
            event_type: eventType,
            user_id: userId || null,
            user_type: userType || null,
            action: action,
            details: details,
            ip_address: ip,
            user_agent: userAgent,
            correlation_id: correlationId,
            status: status,
            timestamp: timestamp,
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
        };

        try {
            const params = {
                TableName: this.tableName,
                Item: marshall(auditRecord)
            };

            await this.client.send(new PutItemCommand(params));

            // Also log to application logs
            logger.info('Audit event logged', {
                auditId,
                eventType,
                userId,
                userType,
                action,
                status,
                correlationId,
                category: 'audit_logging'
            });

        } catch (error) {
            logger.error('Failed to log audit event', error, {
                auditId,
                eventType,
                userId,
                correlationId,
                category: 'audit_logging'
            });
            
            // Don't throw error to avoid breaking the main flow
            // Just log the failure
        }
    }

    /**
     * Get audit events for a user
     * @param {string} userId - User ID to get events for
     * @param {number} limit - Maximum number of events to return
     * @param {string} startTime - Start time for filtering (ISO string)
     * @param {string} endTime - End time for filtering (ISO string)
     */
    async getUserAuditEvents(userId, limit = 50, startTime = null, endTime = null) {
        try {
            const params = {
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :userId AND begins_with(GSI1SK, :auditPrefix)',
                ExpressionAttributeValues: marshall({
                    ':userId': `USER#${userId}`,
                    ':auditPrefix': 'AUDIT#'
                }),
                ScanIndexForward: false, // Most recent first
                Limit: limit
            };

            // Add time filtering if provided
            if (startTime || endTime) {
                let filterExpression = '';
                const filterValues = {};

                if (startTime) {
                    filterExpression += 'timestamp >= :startTime';
                    filterValues[':startTime'] = startTime;
                }

                if (endTime) {
                    if (filterExpression) filterExpression += ' AND ';
                    filterExpression += 'timestamp <= :endTime';
                    filterValues[':endTime'] = endTime;
                }

                if (filterExpression) {
                    params.FilterExpression = filterExpression;
                    params.ExpressionAttributeValues = {
                        ...params.ExpressionAttributeValues,
                        ...marshall(filterValues)
                    };
                }
            }

            const result = await this.client.send(new QueryCommand(params));
            
            return result.Items ? result.Items.map(item => unmarshall(item)) : [];

        } catch (error) {
            logger.error('Failed to get user audit events', error, {
                userId,
                category: 'audit_logging'
            });
            throw error;
        }
    }

    /**
     * Get audit events by type
     * @param {string} eventType - Event type to filter by
     * @param {number} limit - Maximum number of events to return
     */
    async getAuditEventsByType(eventType, limit = 50) {
        try {
            const params = {
                TableName: this.tableName,
                KeyConditionExpression: 'SK = :eventType',
                ExpressionAttributeValues: marshall({
                    ':eventType': `EVENT#${eventType}`
                }),
                ScanIndexForward: false, // Most recent first
                Limit: limit
            };

            const result = await this.client.send(new QueryCommand(params));
            
            return result.Items ? result.Items.map(item => unmarshall(item)) : [];

        } catch (error) {
            logger.error('Failed to get audit events by type', error, {
                eventType,
                category: 'audit_logging'
            });
            throw error;
        }
    }

    // Convenience methods for common audit events
    async logUserRegistration(userId, userType, details, ip, userAgent, correlationId, status = 'SUCCESS') {
        await this.logEvent({
            eventType: 'USER_REGISTERED',
            userId,
            userType,
            action: 'User registration',
            details,
            ip,
            userAgent,
            correlationId,
            status
        });
    }

    async logLoginAttempt(userId, userType, details, ip, userAgent, correlationId, status = 'SUCCESS') {
        await this.logEvent({
            eventType: 'LOGIN_ATTEMPT',
            userId,
            userType,
            action: 'User login',
            details,
            ip,
            userAgent,
            correlationId,
            status
        });
    }

    async logPasswordReset(userId, userType, details, ip, userAgent, correlationId, status = 'SUCCESS') {
        await this.logEvent({
            eventType: 'PASSWORD_RESET',
            userId,
            userType,
            action: 'Password reset',
            details,
            ip,
            userAgent,
            correlationId,
            status
        });
    }

    async logRoleAssignment(userId, userType, details, ip, userAgent, correlationId, status = 'SUCCESS') {
        await this.logEvent({
            eventType: 'ROLE_ASSIGNMENT',
            userId,
            userType,
            action: 'Role assignment',
            details,
            ip,
            userAgent,
            correlationId,
            status
        });
    }

    async logAccountSuspension(userId, userType, details, ip, userAgent, correlationId, status = 'SUCCESS') {
        await this.logEvent({
            eventType: 'ACCOUNT_SUSPENSION',
            userId,
            userType,
            action: 'Account suspension',
            details,
            ip,
            userAgent,
            correlationId,
            status
        });
    }
}

// Singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;
