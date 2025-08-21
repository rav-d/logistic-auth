// TIR Browser Platform - Prometheus Metrics Service
// Implements standard Prometheus metrics for microservices

const client = require('prom-client');

class MetricsService {
    constructor() {
        // Create a Registry to register the metrics
        this.register = new client.Registry();
        
        // Add default metrics (CPU, memory, event loop, etc.)
        client.collectDefaultMetrics({
            register: this.register,
            prefix: 'auth_',
            labels: {
                service: 'auth',
                version: process.env.SERVICE_VERSION || '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            }
        });
        
        // Enhanced HTTP request metrics
        this.httpRequestsTotal = new client.Counter({
            name: 'auth_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'endpoint', 'status', 'user_type'],
            registers: [this.register]
        });
        
        this.httpRequestDuration = new client.Histogram({
            name: 'auth_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'endpoint', 'status'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
            registers: [this.register]
        });
        
        // Connection metrics
        this.activeConnections = new client.Gauge({
            name: 'auth_active_connections',
            help: 'Number of active connections',
            registers: [this.register]
        });
        
        this.activeSessions = new client.Gauge({
            name: 'auth_active_sessions_gauge',
            help: 'Current active user sessions',
            labelNames: ['user_type'],
            registers: [this.register]
        });
        
        // Business event metrics
        this.businessEventsTotal = new client.Counter({
            name: 'auth_business_events_total',
            help: 'Total number of business events',
            labelNames: ['event_type', 'status', 'user_type'],
            registers: [this.register]
        });
        
        // Database operation metrics
        this.databaseOperationsTotal = new client.Counter({
            name: 'auth_database_operations_total',
            help: 'Total number of database operations',
            labelNames: ['operation', 'table', 'status'],
            registers: [this.register]
        });
        
        // Authentication metrics
        this.authenticationAttemptsTotal = new client.Counter({
            name: 'auth_authentication_attempts_total',
            help: 'Total number of authentication attempts',
            labelNames: ['type', 'status', 'user_type'],
            registers: [this.register]
        });
        
        // JWT operation metrics
        this.jwtOperationsTotal = new client.Counter({
            name: 'auth_jwt_operations_total',
            help: 'Total number of JWT operations',
            labelNames: ['operation', 'status', 'user_type'],
            registers: [this.register]
        });
        
        // User management metrics
        this.userRegistrationsTotal = new client.Counter({
            name: 'auth_user_registrations_total',
            help: 'Total number of user registrations',
            labelNames: ['user_type', 'status', 'country'],
            registers: [this.register]
        });
        
        this.userLoginsTotal = new client.Counter({
            name: 'auth_login_attempts_total',
            help: 'Total number of login attempts',
            labelNames: ['user_type', 'status', 'country'],
            registers: [this.register]
        });
        
        this.passwordResetsTotal = new client.Counter({
            name: 'auth_password_resets_total',
            help: 'Total number of password reset requests',
            labelNames: ['user_type', 'status'],
            registers: [this.register]
        });
        
        // Role and permission metrics
        this.roleAssignmentsTotal = new client.Counter({
            name: 'auth_role_assignments_total',
            help: 'Total number of role assignment operations',
            labelNames: ['role', 'status'],
            registers: [this.register]
        });
        
        this.failedPermissionsTotal = new client.Counter({
            name: 'auth_failed_permissions_total',
            help: 'Total number of permission denials',
            labelNames: ['resource', 'action', 'user_type'],
            registers: [this.register]
        });
        
        // Rate limiting metrics
        this.rateLimitHitsTotal = new client.Counter({
            name: 'auth_rate_limit_hits_total',
            help: 'Total number of rate limit hits',
            labelNames: ['endpoint', 'user_type', 'limit_type'],
            registers: [this.register]
        });
        
        // Email and SMS metrics
        this.emailNotificationsTotal = new client.Counter({
            name: 'auth_email_notifications_total',
            help: 'Total number of email notifications sent',
            labelNames: ['template_type', 'status', 'language'],
            registers: [this.register]
        });
        
        this.smsNotificationsTotal = new client.Counter({
            name: 'auth_sms_notifications_total',
            help: 'Total number of SMS notifications sent',
            labelNames: ['template_type', 'status', 'country'],
            registers: [this.register]
        });
        
        // Cognito operation metrics
        this.cognitoOperationsTotal = new client.Counter({
            name: 'auth_cognito_operations_total',
            help: 'Total number of Cognito operations',
            labelNames: ['operation', 'status', 'user_type'],
            registers: [this.register]
        });
        
        // DynamoDB performance metrics
        this.dynamoDBLatency = new client.Histogram({
            name: 'auth_dynamodb_latency_seconds',
            help: 'DynamoDB operation latency in seconds',
            labelNames: ['operation', 'table'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
            registers: [this.register]
        });
        
        // Error metrics
        this.errorsTotal = new client.Counter({
            name: 'auth_errors_total',
            help: 'Total number of errors',
            labelNames: ['error_type', 'endpoint', 'user_type'],
            registers: [this.register]
        });
        
        // Security metrics
        this.securityEventsTotal = new client.Counter({
            name: 'auth_security_events_total',
            help: 'Total number of security events',
            labelNames: ['event_type', 'severity', 'user_type'],
            registers: [this.register]
        });
        
        // Account lockout metrics
        this.accountLockoutsTotal = new client.Counter({
            name: 'auth_account_lockouts_total',
            help: 'Total number of account lockouts',
            labelNames: ['reason', 'user_type', 'country'],
            registers: [this.register]
        });
        
        // Suspicious activity metrics
        this.suspiciousActivityTotal = new client.Counter({
            name: 'auth_suspicious_activity_total',
            help: 'Total number of suspicious activity events',
            labelNames: ['activity_type', 'severity', 'user_type'],
            registers: [this.register]
        });
    }
    
    // Record HTTP request metrics
    recordHttpRequest(method, endpoint, status, duration, userType = 'anonymous') {
        this.httpRequestsTotal.inc({
            method,
            endpoint,
            status,
            user_type: userType
        });
        
        this.httpRequestDuration.observe({
            method,
            endpoint,
            status
        }, duration);
    }
    
    // Record business event metrics
    recordBusinessEvent(eventType, status = 'success', userType = 'unknown') {
        this.businessEventsTotal.inc({
            event_type: eventType,
            status,
            user_type: userType
        });
    }
    
    // Record database operation metrics
    recordDatabaseOperation(operation, table, status = 'success') {
        this.databaseOperationsTotal.inc({
            operation,
            table,
            status
        });
    }
    
    // Record authentication attempt metrics
    recordAuthenticationAttempt(type, status, userType = 'unknown') {
        this.authenticationAttemptsTotal.inc({
            type,
            status,
            user_type: userType
        });
    }
    
    // Record JWT operation metrics
    recordJWTOperation(operation, status, userType = 'unknown') {
        this.jwtOperationsTotal.inc({
            operation,
            status,
            user_type: userType
        });
    }
    
    // Record user registration metrics
    recordUserRegistration(userType, status, country = 'unknown') {
        this.userRegistrationsTotal.inc({
            user_type: userType,
            status,
            country
        });
    }
    
    // Record login attempt metrics
    recordLoginAttempt(userType, status, country = 'unknown') {
        this.userLoginsTotal.inc({
            user_type: userType,
            status,
            country
        });
    }
    
    // Record password reset metrics
    recordPasswordReset(userType, status) {
        this.passwordResetsTotal.inc({
            user_type: userType,
            status
        });
    }
    
    // Record role assignment metrics
    recordRoleAssignment(role, status) {
        this.roleAssignmentsTotal.inc({
            role,
            status
        });
    }
    
    // Record failed permission metrics
    recordFailedPermission(resource, action, userType = 'unknown') {
        this.failedPermissionsTotal.inc({
            resource,
            action,
            user_type: userType
        });
    }
    
    // Record rate limit hit metrics
    recordRateLimitHit(endpoint, userType = 'unknown', limitType = 'default') {
        this.rateLimitHitsTotal.inc({
            endpoint,
            user_type: userType,
            limit_type: limitType
        });
    }
    
    // Record email notification metrics
    recordEmailNotification(templateType, status, language = 'en') {
        this.emailNotificationsTotal.inc({
            template_type: templateType,
            status,
            language
        });
    }
    
    // Record SMS notification metrics
    recordSMSNotification(templateType, status, country = 'unknown') {
        this.smsNotificationsTotal.inc({
            template_type: templateType,
            status,
            country
        });
    }
    
    // Record Cognito operation metrics
    recordCognitoOperation(operation, status, userType = 'unknown') {
        this.cognitoOperationsTotal.inc({
            operation,
            status,
            user_type: userType
        });
    }
    
    // Record DynamoDB latency metrics
    recordDynamoDBLatency(operation, table, duration) {
        this.dynamoDBLatency.observe({
            operation,
            table
        }, duration);
    }
    
    // Record error metrics
    recordError(errorType, endpoint, userType = 'unknown') {
        this.errorsTotal.inc({
            error_type: errorType,
            endpoint,
            user_type: userType
        });
    }
    
    // Record security event metrics
    recordSecurityEvent(eventType, severity, userType = 'unknown') {
        this.securityEventsTotal.inc({
            event_type: eventType,
            severity,
            user_type: userType
        });
    }
    
    // Record account lockout metrics
    recordAccountLockout(reason, userType = 'unknown', country = 'unknown') {
        this.accountLockoutsTotal.inc({
            reason,
            user_type: userType,
            country
        });
    }
    
    // Record suspicious activity metrics
    recordSuspiciousActivity(activityType, severity, userType = 'unknown') {
        this.suspiciousActivityTotal.inc({
            activity_type: activityType,
            severity,
            user_type: userType
        });
    }
    
    // Update active connections gauge
    setActiveConnections(count) {
        this.activeConnections.set(count);
    }
    
    // Update active sessions gauge
    setActiveSessions(count, userType = 'total') {
        this.activeSessions.set({ user_type: userType }, count);
    }
    
    // Get metrics in Prometheus format
    async getMetrics() {
        return await this.register.metrics();
    }
    
    // Get content type for metrics endpoint
    getContentType() {
        return this.register.contentType;
    }
}

// Export singleton instance
module.exports = new MetricsService();