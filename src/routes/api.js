// TIR Browser Platform - Sample API Endpoints
// Demonstrates business logic with proper TIR Browser logging standards

const express = require('express');
const router = express.Router();
const logger = require('../services/logger')('auth:api-endpoints');
const { logBusinessEvent, logDatabaseOperation } = require('../middleware/logging');
const { verifyUserAuth, verifyServiceAuth } = require('../middleware/auth');
const { serviceClients } = require('../services/service-client');
const metricsService = require('../services/metrics');

// Sample data storage (in real service, this would be DynamoDB/PostgreSQL)
let orders = [];
let drivers = [];
let orderIdCounter = 1;
let driverIdCounter = 1;

/**
 * Sample Order Management Endpoints
 * Demonstrates TIR Browser business event logging
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create new order
 *     description: Creates a new transportation order
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerId
 *               - cargoType
 *               - pickupLocation
 *               - destinationLocation
 *             properties:
 *               providerId:
 *                 type: string
 *                 example: provider-123
 *               cargoType:
 *                 type: string
 *                 example: electronics
 *               pickupLocation:
 *                 type: string
 *                 example: Baku, Azerbaijan
 *               destinationLocation:
 *                 type: string
 *                 example: Tehran, Iran
 *               estimatedPrice:
 *                 type: number
 *                 example: 750
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/orders', verifyUserAuth, async (req, res) => {
    const { providerId, cargoType, pickupLocation, destinationLocation, estimatedPrice } = req.body;
    
    logBusinessEvent('ORDER_CREATION_STARTED', 'Order creation process initiated', {
        providerId,
        cargoType,
        userId: req.user.id
    });
    
    try {
        // Simulate order validation
        if (!providerId || !cargoType || !pickupLocation || !destinationLocation) {
            const error = new Error('Missing required order fields');
            error.statusCode = 400;
            throw error;
        }
        
        // Simulate database operation
        const order = await logDatabaseOperation(
            'INSERT',
            'orders',
            async () => {
                const newOrder = {
                    id: `ORD-${String(orderIdCounter++).padStart(6, '0')}`,
                    providerId,
                    cargoType,
                    pickupLocation,
                    destinationLocation,
                    estimatedPrice: estimatedPrice || 0,
                    status: 'ORDER_CREATED',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                orders.push(newOrder);
                return newOrder;
            },
            { providerId, cargoType }
        );
        
        // Simulate service-to-service call to pricing service
        try {
            const pricingResponse = await serviceClients.pricingService.post('/internal/calculate', {
                pickupLocation,
                destinationLocation,
                cargoType
            });
            
            order.recommendedPrice = pricingResponse.data.recommendedPrice;
            order.pricingFactors = pricingResponse.data.factors;
        } catch (error) {
            logger.warn('Pricing service unavailable, using estimated price', {
                orderId: order.id,
                error: error.message,
                category: 'service_communication'
            });
        }
        
        logBusinessEvent('ORDER_CREATED', 'Order created successfully', {
            orderId: order.id,
            providerId: order.providerId,
            estimatedPrice: order.estimatedPrice,
            recommendedPrice: order.recommendedPrice
        });
        
        // Record business metrics
        metricsService.recordBusinessEvent('ORDER_CREATED', 'success');
        metricsService.recordDatabaseOperation('INSERT', 'orders', 'success');
        
        res.status(201).json({
            success: true,
            data: order,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logBusinessEvent('ORDER_CREATION_FAILED', 'Order creation failed', {
            providerId,
            error: error.message
        });
        
        // Record failure metrics
        metricsService.recordBusinessEvent('ORDER_CREATED', 'failure');
        
        logger.error('Order creation failed', error, {
            providerId,
            userId: req.user.id,
            category: 'business_event'
        });
        
        res.status(error.statusCode || 500).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get orders
 *     description: Retrieves orders for authenticated user
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/orders', verifyUserAuth, async (req, res) => {
    try {
        const userOrders = await logDatabaseOperation(
            'SELECT',
            'orders',
            async () => {
                // In real service, filter by user permissions
                return orders.filter(order => 
                    req.user.roles.includes('admin') || order.providerId === req.user.id
                );
            },
            { userId: req.user.id }
        );
        
        res.status(200).json({
            success: true,
            data: userOrders,
            count: userOrders.length,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Failed to retrieve orders', error, {
            userId: req.user.id,
            category: 'database_operation'
        });
        
        res.status(500).json({
            error: 'Failed to retrieve orders',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /api/orders/{orderId}/status:
 *   put:
 *     summary: Update order status
 *     description: Updates the status of an existing order
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-000001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ORDER_CREATED, IN_TRANSIT, DELIVERED, CANCELLED]
 *                 example: IN_TRANSIT
 *               notes:
 *                 type: string
 *                 example: Driver en route to pickup location
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/orders/:orderId/status', verifyUserAuth, async (req, res) => {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    
    try {
        const updatedOrder = await logDatabaseOperation(
            'UPDATE',
            'orders',
            async () => {
                const orderIndex = orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    const error = new Error('Order not found');
                    error.statusCode = 404;
                    throw error;
                }
                
                const previousStatus = orders[orderIndex].status;
                orders[orderIndex].status = status;
                orders[orderIndex].updatedAt = new Date().toISOString();
                
                if (notes) {
                    orders[orderIndex].notes = notes;
                }
                
                return { order: orders[orderIndex], previousStatus };
            },
            { orderId, newStatus: status }
        );
        
        logBusinessEvent('ORDER_STATUS_UPDATED', 'Order status updated', {
            orderId,
            previousStatus: updatedOrder.previousStatus,
            newStatus: status,
            userId: req.user.id
        });
        
        res.status(200).json({
            success: true,
            data: updatedOrder.order,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Order status update failed', error, {
            orderId,
            status,
            userId: req.user.id,
            category: 'business_event'
        });
        
        res.status(error.statusCode || 500).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Sample Driver Management Endpoints
 * Demonstrates driver prioritization and CRUD operations
 */

/**
 * @swagger
 * /api/drivers:
 *   post:
 *     summary: Register new driver
 *     description: Registers a new driver in the system
 *     tags: [Drivers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - phoneNumber
 *               - vehicleDetails
 *               - licenseInfo
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               phoneNumber:
 *                 type: string
 *                 example: +994501234567
 *               vehicleDetails:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     example: truck
 *                   capacity:
 *                     type: string
 *                     example: 20 tons
 *                   licensePlate:
 *                     type: string
 *                     example: 10-BB-123
 *               licenseInfo:
 *                 type: object
 *                 properties:
 *                   number:
 *                     type: string
 *                     example: DL123456
 *                   expiryDate:
 *                     type: string
 *                     format: date
 *                     example: 2025-12-31
 *     responses:
 *       201:
 *         description: Driver registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/drivers', verifyUserAuth, async (req, res) => {
    const { fullName, phoneNumber, vehicleDetails, licenseInfo } = req.body;
    
    logBusinessEvent('DRIVER_REGISTRATION_STARTED', 'Driver registration initiated', {
        phoneNumber,
        userId: req.user.id
    });
    
    try {
        const driver = await logDatabaseOperation(
            'INSERT',
            'drivers',
            async () => {
                const newDriver = {
                    id: `DRV-${String(driverIdCounter++).padStart(6, '0')}`,
                    fullName,
                    phoneNumber,
                    vehicleDetails,
                    licenseInfo,
                    status: 'REGISTRATION_PENDING',
                    rating: 5.0,
                    completionRate: 100,
                    priceAcceptanceRate: 85,
                    lastDeliveryDate: null,
                    currentLocation: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                drivers.push(newDriver);
                return newDriver;
            },
            { phoneNumber, fullName }
        );
        
        logBusinessEvent('DRIVER_REGISTRATION_COMPLETED', 'Driver registration completed', {
            driverId: driver.id,
            phoneNumber: driver.phoneNumber,
            status: driver.status
        });
        
        // Record business metrics
        metricsService.recordBusinessEvent('DRIVER_REGISTERED', 'success');
        metricsService.recordDatabaseOperation('INSERT', 'drivers', 'success');
        
        res.status(201).json({
            success: true,
            data: driver,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logBusinessEvent('DRIVER_REGISTRATION_FAILED', 'Driver registration failed', {
            phoneNumber,
            error: error.message
        });
        
        logger.error('Driver registration failed', error, {
            phoneNumber,
            userId: req.user.id,
            category: 'business_event'
        });
        
        res.status(error.statusCode || 500).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /api/drivers/prioritization/{orderId}:
 *   get:
 *     summary: Get driver prioritization
 *     description: Calculates driver prioritization for specific order (service-to-service)
 *     tags: [Drivers]
 *     security:
 *       - ServiceAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         example: ORD-000001
 *     responses:
 *       200:
 *         description: Driver prioritization calculated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         orderId:
 *                           type: string
 *                         eligibleDrivers:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               priorityScore:
 *                                 type: number
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/drivers/prioritization/:orderId', verifyServiceAuth, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            return res.status(404).json({
                error: 'Order not found',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }
        
        // Simulate driver prioritization algorithm
        const eligibleDrivers = await logDatabaseOperation(
            'SELECT',
            'drivers',
            async () => {
                return drivers
                    .filter(d => d.status === 'ACTIVE')
                    .map(driver => ({
                        ...driver,
                        priorityScore: calculateDriverPriority(driver, order)
                    }))
                    .sort((a, b) => b.priorityScore - a.priorityScore);
            },
            { orderId, orderLocation: order.pickupLocation }
        );
        
        logger.debug('Driver prioritization calculated', {
            orderId,
            eligibleDriversCount: eligibleDrivers.length,
            topDriverId: eligibleDrivers[0]?.id,
            category: 'business_event',
            eventType: 'DRIVER_PRIORITIZATION_CALCULATED'
        });
        
        res.status(200).json({
            success: true,
            data: {
                orderId,
                eligibleDrivers: eligibleDrivers.slice(0, 10), // Top 10 drivers
                calculatedAt: new Date().toISOString()
            },
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Driver prioritization failed', error, {
            orderId,
            category: 'business_event'
        });
        
        res.status(500).json({
            error: 'Failed to calculate driver prioritization',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /api/test-logging:
 *   post:
 *     summary: Test logging patterns
 *     description: Generate test logs for TIR Browser
 *     tags: [Testing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testType:
 *                 type: string
 *                 enum: [business_event, error, warning, debug]
 *                 example: business_event
 *     responses:
 *       200:
 *         description: Test log generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/test-logging', (req, res) => {
    const { testType } = req.body;
    
    logger.info('Test logging endpoint called', {
        testType,
        category: 'test_logging'
    });
    
    switch (testType) {
        case 'business_event':
            logBusinessEvent('TEST_EVENT', 'Test business event logged', {
                testData: 'sample data',
                testNumber: 123
            });
            break;
            
        case 'error':
            const testError = new Error('Test error for logging demonstration');
            testError.code = 'TEST_ERROR';
            logger.error('Test error logged', testError, {
                category: 'test_logging'
            });
            break;
            
        case 'warning':
            logger.warn('Test warning logged', {
                warningType: 'demonstration',
                category: 'test_logging'
            });
            break;
            
        default:
            logger.debug('Default test log entry', {
                category: 'test_logging'
            });
    }
    
    res.status(200).json({
        success: true,
        message: `Test logging completed for type: ${testType}`,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
    });
});

/**
 * Driver priority calculation algorithm
 * Demonstrates TIR Browser driver prioritization logic
 */
function calculateDriverPriority(driver, order) {
    // Simulate waiting time factor (30% weight)
    const daysSinceLastDelivery = driver.lastDeliveryDate 
        ? (Date.now() - new Date(driver.lastDeliveryDate).getTime()) / (1000 * 60 * 60 * 24)
        : 30; // Default to 30 days if no previous delivery
    const waitingScore = Math.min(daysSinceLastDelivery / 7, 10) * 10; // Max 10 points
    
    // Simulate proximity factor (25% weight)
    const proximityScore = Math.random() * 10; // Random for demo
    
    // Rating factor (20% weight)
    const ratingScore = driver.rating * 2; // Convert 5-star to 10-point scale
    
    // Price acceptance factor (15% weight)
    const priceAcceptanceScore = driver.priceAcceptanceRate / 10;
    
    // Completion rate factor (10% weight)
    const completionScore = driver.completionRate / 10;
    
    const priorityScore = (
        waitingScore * 0.30 +
        proximityScore * 0.25 +
        ratingScore * 0.20 +
        priceAcceptanceScore * 0.15 +
        completionScore * 0.10
    );
    
    return Math.round(priorityScore * 100) / 100; // Round to 2 decimal places
}

/**
 * @swagger
 * /api/register:
 *   post:
 *     summary: Register a new user (Provider/Driver/Admin)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userType
 *               - email
 *               - password
 *             properties:
 *               userType:
 *                 type: string
 *                 enum: [provider, driver, admin]
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               profile:
 *                 type: object
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid request
 */
router.post('/register', async (req, res) => {
    const { userType, email, password, phoneNumber, profile, givenName, familyName, given_name, family_name } = req.body;
    logBusinessEvent('USER_REGISTRATION_STARTED', 'User registration initiated', { email, userType });
    try {
        const result = await require('../services/cognito').registerUser({ userType, email, password, phoneNumber, profile, givenName, familyName, given_name, family_name });
        logBusinessEvent('USER_REGISTERED', 'User registered', { userId: result.userId, userType });
        res.status(201).json({ success: true, data: result, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('User registration failed', error, { email, userType });
        res.status(error.statusCode || 500).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    logBusinessEvent('USER_LOGIN_ATTEMPT', 'Login attempt', { email });
    try {
        const result = await require('../services/cognito').loginUser({ email, password });
        logBusinessEvent('USER_LOGGED_IN', 'User logged in', { userId: result.userId });
        res.status(200).json({ success: true, data: result, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Login failed', error, { email });
        res.status(error.statusCode || 401).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', verifyUserAuth, async (req, res) => {
    logBusinessEvent('USER_LOGOUT', 'User logged out', { userId: req.user.id });
    res.status(200).json({ success: true, message: 'Logged out', correlationId: req.correlationId, timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /api/verify-email:
 *   post:
 *     summary: Verify user email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified
 */
router.post('/verify-email', async (req, res) => {
    const { email, code } = req.body;
    try {
        const result = await require('../services/cognito').verifyEmail({ email, code });
        logBusinessEvent('EMAIL_VERIFIED', 'Email verified', { email });
        res.status(200).json({ success: true, message: 'Email verified', correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Email verification failed', error, { email });
        res.status(error.statusCode || 400).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/resend-verification:
 *   post:
 *     summary: Resend verification email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification code resent
 */
router.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await require('../services/cognito').resendVerification({ email });
        logBusinessEvent('VERIFICATION_RESENT', 'Verification code resent', { email });
        res.status(200).json({ success: true, data: result, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Resend verification failed', error, { email });
        res.status(error.statusCode || 400).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset requested
 */
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        await require('../services/cognito').forgotPassword({ email });
        logBusinessEvent('PASSWORD_RESET_REQUESTED', 'Password reset requested', { email });
        res.status(200).json({ success: true, message: 'Password reset requested', correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Password reset request failed', error, { email });
        res.status(error.statusCode || 400).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 */
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    try {
        await require('../services/cognito').resetPassword({ email, code, newPassword });
        logBusinessEvent('PASSWORD_RESET_COMPLETED', 'Password reset completed', { email });
        res.status(200).json({ success: true, message: 'Password reset successful', correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Password reset failed', error, { email });
        res.status(error.statusCode || 400).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/send-otp:
 *   post:
 *     summary: Send SMS OTP to user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent
 */
router.post('/send-otp', async (req, res) => {
    const { phoneNumber } = req.body;
    try {
        await require('../services/cognito').sendOTP({ phoneNumber });
        logBusinessEvent('OTP_SENT', 'OTP sent to user', { phoneNumber });
        res.status(200).json({ success: true, message: 'OTP sent', correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('OTP send failed', error, { phoneNumber });
        res.status(error.statusCode || 400).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 */
router.get('/profile', verifyUserAuth, async (req, res) => {
    try {
        const profile = await require('../services/profile').getProfile(req.user.id);
        if (!profile) return res.status(404).json({ error: 'Profile not found', correlationId: req.correlationId, timestamp: new Date().toISOString() });
        res.status(200).json({ success: true, data: profile, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Profile retrieval failed', error, { userId: req.user.id });
        res.status(500).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profile:
 *                 type: object
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', verifyUserAuth, async (req, res) => {
    try {
        const updated = await require('../services/profile').updateProfile(req.user.id, req.body.profile);
        res.status(200).json({ success: true, data: updated, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Profile update failed', error, { userId: req.user.id });
        res.status(500).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

const { hasPermission } = require('../services/rbac');

function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({ error: 'Forbidden', correlationId: req.correlationId, timestamp: new Date().toISOString() });
        }
        next();
    };
}

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Users listed
 */
router.get('/admin/users', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
        const config = require('../services/config');
        const client = new DynamoDBClient({ region: config.dynamoRegion });
        const result = await client.send(new ScanCommand({ TableName: config.dynamoUserProfileTable }));
        const users = (result.Items || []).map(item => ({
            userId: item.userId.S,
            userType: item.userType.S,
            profile: JSON.parse(item.profile.S),
            createdAt: item.createdAt.S
        }));
        res.status(200).json({ success: true, data: users, count: users.length, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Admin user list failed', error, { userId: req.user.id });
        res.status(500).json({ error: error.message, correlationId: req.correlationId, timestamp: new Date().toISOString() });
    }
});

/**
 * @swagger
 * /api/admin/roles:
 *   get:
 *     summary: List all roles and permissions (admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Roles listed
 */
router.get('/admin/roles', verifyUserAuth, requirePermission('manage:roles'), (req, res) => {
    const { ROLES } = require('../services/rbac');
    res.status(200).json({ success: true, data: ROLES, correlationId: req.correlationId, timestamp: new Date().toISOString() });
});



/**
 * @swagger
 * /api/profile/language:
 *   put:
 *     summary: Update user's language preference
 *     description: Update the language preference for email notifications
 *     tags: [Profile]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *             properties:
 *               language:
 *                 type: string
 *                 enum: [en, tr, az]
 *                 example: tr
 *     responses:
 *       200:
 *         description: Language preference updated
 *       400:
 *         description: Invalid language
 *       404:
 *         description: Profile not found
 */
router.put('/profile/language', verifyUserAuth, async (req, res) => {
    try {
        const { language } = req.body;
        
        // Validate language
        const validLanguages = ['en', 'tr', 'az'];
        if (!validLanguages.includes(language)) {
            return res.status(400).json({ 
                error: `Invalid language. Must be one of: ${validLanguages.join(', ')}`, 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        const profileService = require('../services/profile');
        const updated = await profileService.updateLanguagePreference(req.user.id, language);

        logBusinessEvent('LANGUAGE_PREFERENCE_UPDATED', 'User language preference updated', {
            userId: req.user.id,
            language
        });

        res.status(200).json({ 
            success: true, 
            data: updated, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('Language preference update failed', error, { userId: req.user.id });
        
        if (error.message === 'Profile not found') {
            return res.status(404).json({ 
                error: 'Profile not found', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }
        
        res.status(500).json({ 
            error: error.message, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

module.exports = router;