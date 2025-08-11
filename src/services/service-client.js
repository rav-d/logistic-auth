// TIR Browser Platform - Service Client
// Handles service-to-service communication with proper authentication and logging

const { serviceAuth } = require('../middleware/auth');
const { logServiceCall } = require('../middleware/logging');
const logger = require('./logger')('auth:service-client');

/**
 * Service Client for TIR Browser service-to-service communication
 * MANDATORY: Use for all internal service calls
 */
class ServiceClient {
    constructor(serviceName, baseURL) {
        this.serviceName = serviceName;
        this.baseURL = baseURL;
        this.currentServiceName = process.env.SERVICE_NAME || 'auth';
    }
    
    /**
     * Make authenticated POST request to another service
     * @param {string} endpoint - API endpoint path
     * @param {object} data - Request payload
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response data
     */
    async post(endpoint, data, options = {}) {
        return this.makeRequest('POST', endpoint, data, options);
    }
    
    /**
     * Make authenticated GET request to another service
     * @param {string} endpoint - API endpoint path
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response data
     */
    async get(endpoint, options = {}) {
        return this.makeRequest('GET', endpoint, null, options);
    }
    
    /**
     * Make authenticated PUT request to another service
     * @param {string} endpoint - API endpoint path
     * @param {object} data - Request payload
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response data
     */
    async put(endpoint, data, options = {}) {
        return this.makeRequest('PUT', endpoint, data, options);
    }
    
    /**
     * Make authenticated DELETE request to another service
     * @param {string} endpoint - API endpoint path
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response data
     */
    async delete(endpoint, options = {}) {
        return this.makeRequest('DELETE', endpoint, null, options);
    }
    
    /**
     * Core method for making authenticated service requests
     * MANDATORY: Includes correlation ID and service authentication
     */
    async makeRequest(method, endpoint, data = null, options = {}) {
        const correlationId = process.env.CORRELATION_ID;
        const serviceToken = serviceAuth.generateToken(this.currentServiceName);
        
        const requestOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,  // MANDATORY
                'X-Service-Token': serviceToken,    // MANDATORY for internal calls
                ...options.headers
            }
        };
        
        if (data) {
            requestOptions.body = JSON.stringify(data);
        }
        
        // Use logging wrapper for service communication
        return logServiceCall(
            this.serviceName,
            endpoint,
            async () => {
                const response = await fetch(`${this.baseURL}${endpoint}`, requestOptions);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const error = new Error(`Service call failed: ${response.status} ${response.statusText}`);
                    error.statusCode = response.status;
                    error.responseData = errorData;
                    throw error;
                }
                
                return {
                    status: response.status,
                    data: await response.json(),
                    headers: Object.fromEntries(response.headers.entries())
                };
            },
            {
                method,
                correlationId,
                requestData: data ? Object.keys(data) : null
            }
        );
    }
    
    /**
     * Health check for target service
     * @returns {Promise<boolean>} - True if service is healthy
     */
    async healthCheck() {
        try {
            const response = await this.get('/health');
            return response.status === 200;
        } catch (error) {
            logger.warn('Service health check failed', {
                targetService: this.serviceName,
                error: error.message,
                category: 'service_health'
            });
            return false;
        }
    }
    
    /**
     * Test connectivity to target service with timeout
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<boolean>} - True if service is reachable
     */
    async testConnectivity(timeout = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'X-Correlation-ID': process.env.CORRELATION_ID,
                    'X-Service-Token': serviceAuth.generateToken(this.currentServiceName)
                }
            });
            
            clearTimeout(timeoutId);
            return response.ok;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                logger.warn('Service connectivity timeout', {
                    targetService: this.serviceName,
                    timeout,
                    category: 'service_health'
                });
            } else {
                logger.warn('Service connectivity failed', {
                    targetService: this.serviceName,
                    error: error.message,
                    category: 'service_health'
                });
            }
            
            return false;
        }
    }
}

/**
 * Factory function to create service clients
 * @param {string} serviceName - Name of the target service
 * @param {string} baseURL - Base URL of the target service
 * @returns {ServiceClient} - Configured service client
 */
function createServiceClient(serviceName, baseURL) {
    return new ServiceClient(serviceName, baseURL);
}

// Pre-configured clients for common TIR Browser services
/*
  const serviceClients = {
    orderService: createServiceClient('order-service', process.env.ORDER_SERVICE_URL || 'http://order-service:3000'),
    pricingService: createServiceClient('pricing-service', process.env.PRICING_SERVICE_URL || 'http://pricing-service:3000'),
    driverService: createServiceClient('driver-service', process.env.DRIVER_SERVICE_URL || 'http://driver-service:3000'),
    authService: createServiceClient('auth-service', process.env.AUTH_SERVICE_URL || 'http://auth-service:3000'),
    notificationService: createServiceClient('notification-service', process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000')
};
    */

// Dummy TIR Browser services
const serviceClients = {
    // Dummy order service points on localhost for testing
    orderService: createServiceClient('order-service', 'http://localhost:3000'),
};  

module.exports = {
    ServiceClient,
    createServiceClient,
    serviceClients
};