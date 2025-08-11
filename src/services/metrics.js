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
        
        // Custom business metrics
        this.httpRequestsTotal = new client.Counter({
            name: 'auth_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'],
            registers: [this.register]
        });
        
        this.httpRequestDuration = new client.Histogram({
            name: 'auth_http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
            registers: [this.register]
        });
        
        this.activeConnections = new client.Gauge({
            name: 'auth_active_connections',
            help: 'Number of active connections',
            registers: [this.register]
        });
        
        this.businessEventsTotal = new client.Counter({
            name: 'auth_business_events_total',
            help: 'Total number of business events',
            labelNames: ['event_type', 'status'],
            registers: [this.register]
        });
        
        this.databaseOperationsTotal = new client.Counter({
            name: 'auth_database_operations_total',
            help: 'Total number of database operations',
            labelNames: ['operation', 'table', 'status'],
            registers: [this.register]
        });
        
        this.authenticationAttemptsTotal = new client.Counter({
            name: 'auth_authentication_attempts_total',
            help: 'Total number of authentication attempts',
            labelNames: ['type', 'status'],
            registers: [this.register]
        });
    }
    
    // Record HTTP request metrics
    recordHttpRequest(method, route, statusCode, duration) {
        this.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode
        });
        
        this.httpRequestDuration.observe({
            method,
            route,
            status_code: statusCode
        }, duration);
    }
    
    // Record business event metrics
    recordBusinessEvent(eventType, status = 'success') {
        this.businessEventsTotal.inc({
            event_type: eventType,
            status
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
    recordAuthenticationAttempt(type, status) {
        this.authenticationAttemptsTotal.inc({
            type,
            status
        });
    }
    
    // Update active connections gauge
    setActiveConnections(count) {
        this.activeConnections.set(count);
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