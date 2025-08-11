// TIR Browser Platform - Logger Service
// Implements mandatory logging standards with Promtail file-based logging

const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { getConfigService, onConfigChange } = require('./config');

class TIRBrowserLogger {
    constructor(serviceComponent) {
        this.serviceComponent = serviceComponent;
        
        // Extract service and component from format "auth:api-endpoints"
        const [service, component] = serviceComponent.split(':');
        this.service = service;
        this.component = component || 'main';
        
        // Ensure log directory exists
        const logDir = process.env.LOG_BASE_PATH || '/var/log/tir';
        console.log(`Logger: Checking log directory: ${logDir}`);
        if (!fs.existsSync(logDir)) {
            console.log(`Logger: Creating log directory: ${logDir}`);
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `${service}-${this.component}.log`);
        console.log(`Logger: Log file will be: ${logFile}`);
        
        // Test write to ensure file is created
        try {
            fs.writeFileSync(logFile, `Logger initialized for ${serviceComponent}\n`, { flag: 'a' });
            console.log(`Logger: Successfully wrote test line to ${logFile}`);
        } catch (error) {
            console.error(`Logger: Failed to write to ${logFile}:`, error.message);
        }
        
        // Component-specific file transport for Promtail
        const fileTransport = new winston.transports.File({
            filename: path.join(logDir, `${service}-${this.component}.log`),
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 5,
            tailable: true
        });
        
        // Console transport for development
        const consoleTransport = new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        });
        
        // Create transports array (file + console only)
        const transports = [consoleTransport, fileTransport];
        
        this.winston = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: {
                service: this.service,
                component: this.component,
                environment: process.env.NODE_ENV || 'development',
                serviceVersion: process.env.SERVICE_VERSION || '1.0.0'
            },
            transports,
            exitOnError: false
        });
        
        // Register for LOG_LEVEL config changes and update initial level
        onConfigChange('LOG_LEVEL', () => {
            this.updateLogLevel().catch(err => 
                console.error('Failed to update log level from config:', err.message)
            );
        });
        this.updateLogLevel().catch(err => 
            console.error('Failed to update log level from config:', err.message)
        );
    }
    
    info(message, meta = {}) {
        this.winston.info(message, {
            ...meta,
            correlationId: this.getCorrelationId(),
            userId: this.getUserId(),
            timestamp: new Date().toISOString()
        });
    }
    
    error(message, error = null, meta = {}) {
        this.winston.error(message, {
            ...meta,
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code
            } : null,
            correlationId: this.getCorrelationId(),
            userId: this.getUserId(),
            timestamp: new Date().toISOString()
        });
    }
    
    warn(message, meta = {}) {
        this.winston.warn(message, {
            ...meta,
            correlationId: this.getCorrelationId(),
            userId: this.getUserId(),
            timestamp: new Date().toISOString()
        });
    }
    
    debug(message, meta = {}) {
        this.winston.debug(message, {
            ...meta,
            correlationId: this.getCorrelationId(),
            userId: this.getUserId(),
            timestamp: new Date().toISOString()
        });
    }
    
    // MANDATORY: Get correlation ID from process environment
    getCorrelationId() {
        return process.env.CORRELATION_ID || 'unknown';
    }
    
    // Get user ID if available
    getUserId() {
        return process.env.USER_ID || null;
    }
    
    // Get log level from config service with fallback
    async getLogLevel() {
        try {
            const configService = getConfigService();
            return await configService.get('LOG_LEVEL', 'info');
        } catch (error) {
            return process.env.LOG_LEVEL || 'info';
        }
    }
    
    // Update log level dynamically
    async updateLogLevel() {
        const newLevel = await this.getLogLevel();
        this.winston.level = newLevel;
    }
}

module.exports = (serviceName) => new TIRBrowserLogger(serviceName);