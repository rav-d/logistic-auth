const express = require('express');
const router = express.Router();
const logger = require('../services/logger')('auth:auth-routes');
const { logBusinessEvent } = require('../middleware/logging');
const { verifyUserAuth, verifyServiceAuth } = require('../middleware/auth');
const metricsService = require('../services/metrics');
const cognitoService = require('../services/cognito');
const dynamoDBService = require('../services/dynamodb');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user (Provider/Driver/Internal)
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
 *               - country
 *             properties:
 *               userType:
 *                 type: string
 *                 enum: [provider, driver, internal]
 *                 description: Type of user to register
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: User's password (min 8 chars)
 *               country:
 *                 type: string
 *                 pattern: '^[A-Z]{2}$'
 *                 description: 2-letter ISO country code (e.g., TR, AZ, US)
 *               phoneNumber:
 *                 type: string
 *                 description: User's phone number (optional)
 *               profile:
 *                 type: object
 *                 description: Additional profile information
 *               givenName:
 *                 type: string
 *                 description: User's first name
 *               familyName:
 *                 type: string
 *                 description: User's last name
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     userType:
 *                       type: string
 *                     country:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       409:
 *         description: User already exists
 *       500:
 *         description: Internal server error
 */
router.post('/register', async (req, res) => {
    const { userType, email, password, phoneNumber, profile, givenName, familyName, country } = req.body;
    
    logBusinessEvent('USER_REGISTRATION_STARTED', 'User registration initiated', {
        email,
        userType,
        country
    });
    
    try {
        // Validate required fields
        if (!userType || !email || !password || !country) {
            return res.status(400).json({
                error: 'Missing required fields: userType, email, password, country',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        // Validate user type
        const validUserTypes = ['provider', 'driver', 'internal'];
        if (!validUserTypes.includes(userType.toLowerCase())) {
            return res.status(400).json({
                error: `Invalid user type. Must be one of: ${validUserTypes.join(', ')}`,
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        // Validate country format
        if (!/^[A-Z]{2}$/.test(country)) {
            return res.status(400).json({
                error: 'Country must be a 2-letter ISO code (e.g., TR, AZ, US)',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        const result = await cognitoService.registerUser({
            userType: userType.toLowerCase(),
            email,
            password,
            phoneNumber,
            profile,
            givenName,
            familyName,
            country
        });

        logBusinessEvent('USER_REGISTERED', 'User registered successfully', {
            userId: result.userId,
            userType: result.userType,
            country: result.country
        });

        res.status(201).json({
            success: true,
            data: result,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logBusinessEvent('USER_REGISTRATION_FAILED', 'User registration failed', {
            email,
            userType,
            country,
            error: error.message
        });

        logger.error('User registration failed', error, {
            email,
            userType,
            country,
            category: 'user_registration'
        });

        // Map specific errors to appropriate HTTP status codes
        let statusCode = 500;
        if (error.statusCode) {
            statusCode = error.statusCode;
        } else if (error.message.includes('already exists')) {
            statusCode = 409;
        } else if (error.message.includes('Invalid') || error.message.includes('Missing')) {
            statusCode = 400;
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/login:
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
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     token:
 *                       type: string
 *                     userType:
 *                       type: string
 *                     country:
 *                       type: string
 *       400:
 *         description: Invalid credentials
 *       401:
 *         description: Authentication failed
 *       500:
 *         description: Internal server error
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    logBusinessEvent('USER_LOGIN_ATTEMPT', 'Login attempt initiated', { email });
    
    try {
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        const result = await cognitoService.loginUser({ email, password });
        
        logBusinessEvent('USER_LOGGED_IN', 'User logged in successfully', {
            userId: result.userId,
            userType: result.userType,
            country: result.country
        });

        res.status(200).json({
            success: true,
            data: result,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logBusinessEvent('USER_LOGIN_FAILED', 'Login failed', {
            email,
            error: error.message
        });

        logger.error('Login failed', error, {
            email,
            category: 'user_authentication'
        });

        // Map Cognito errors to appropriate HTTP status codes
        let statusCode = 500;
        if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
            statusCode = 401;
        } else if (error.name === 'UserNotConfirmedException') {
            statusCode = 400;
            error.message = 'Please verify your email before logging in';
        } else if (error.name === 'TooManyRequestsException') {
            statusCode = 429;
            error.message = 'Too many login attempts. Please try again later.';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', verifyUserAuth, async (req, res) => {
    logBusinessEvent('USER_LOGOUT', 'User logged out', {
        userId: req.user.id,
        userType: req.user.userType
    });
    
    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
    });
});

/**
 * @swagger
 * /auth/verify-email:
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
 *                 format: email
 *               code:
 *                 type: string
 *                 description: Verification code sent to email
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid verification code
 *       500:
 *         description: Internal server error
 */
router.post('/verify-email', async (req, res) => {
    const { email, code } = req.body;
    
    try {
        if (!email || !code) {
            return res.status(400).json({
                error: 'Email and verification code are required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        await cognitoService.verifyEmail({ email, code });
        
        logBusinessEvent('EMAIL_VERIFIED', 'Email verified successfully', { email });

        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Email verification failed', error, {
            email,
            category: 'email_verification'
        });

        let statusCode = 500;
        if (error.name === 'CodeMismatchException') {
            statusCode = 400;
            error.message = 'Invalid verification code';
        } else if (error.name === 'ExpiredCodeException') {
            statusCode = 400;
            error.message = 'Verification code has expired';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/resend-verification:
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
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification code resent
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    try {
        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        const result = await cognitoService.resendVerification({ email });
        
        logBusinessEvent('VERIFICATION_RESENT', 'Verification code resent', { email });

        res.status(200).json({
            success: true,
            data: result,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Resend verification failed', error, {
            email,
            category: 'email_verification'
        });

        let statusCode = 500;
        if (error.name === 'UserNotFoundException') {
            statusCode = 404;
            error.message = 'User not found';
        } else if (error.name === 'InvalidParameterException') {
            statusCode = 400;
            error.message = 'Invalid email address';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/forgot-password:
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
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset requested
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        await cognitoService.forgotPassword({ email });
        
        logBusinessEvent('PASSWORD_RESET_REQUESTED', 'Password reset requested', { email });

        res.status(200).json({
            success: true,
            message: 'Password reset email sent',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Password reset request failed', error, {
            email,
            category: 'password_reset'
        });

        let statusCode = 500;
        if (error.name === 'UserNotFoundException') {
            statusCode = 404;
            error.message = 'User not found';
        } else if (error.name === 'InvalidParameterException') {
            statusCode = 400;
            error.message = 'Invalid email address';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with verification code
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
 *                 format: email
 *               code:
 *                 type: string
 *                 description: Verification code sent to email
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: New password (min 8 chars)
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    
    try {
        if (!email || !code || !newPassword) {
            return res.status(400).json({
                error: 'Email, verification code, and new password are required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters long',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        await cognitoService.resetPassword({ email, code, newPassword });
        
        logBusinessEvent('PASSWORD_RESET_COMPLETED', 'Password reset completed', { email });

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Password reset failed', error, {
            email,
            category: 'password_reset'
        });

        let statusCode = 500;
        if (error.name === 'CodeMismatchException') {
            statusCode = 400;
            error.message = 'Invalid verification code';
        } else if (error.name === 'ExpiredCodeException') {
            statusCode = 400;
            error.message = 'Verification code has expired';
        } else if (error.name === 'InvalidPasswordException') {
            statusCode = 400;
            error.message = 'Password does not meet requirements';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/send-otp:
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
 *                 description: User's phone number
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/send-otp', async (req, res) => {
    const { phoneNumber } = req.body;
    
    try {
        if (!phoneNumber) {
            return res.status(400).json({
                error: 'Phone number is required',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        const result = await cognitoService.sendOTP({ phoneNumber });
        
        logBusinessEvent('OTP_SENT', 'OTP sent to user', { phoneNumber });

        res.status(200).json({
            success: true,
            data: result,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('OTP send failed', error, {
            phoneNumber,
            category: 'sms_notification'
        });

        let statusCode = 500;
        if (error.name === 'UserNotFoundException') {
            statusCode = 404;
            error.message = 'User not found with this phone number';
        } else if (error.name === 'InvalidParameterException') {
            statusCode = 400;
            error.message = 'Invalid phone number format';
        } else if (error.name === 'ThrottlingException') {
            statusCode = 429;
            error.message = 'Too many SMS requests. Please try again later.';
        }

        res.status(statusCode).json({
            error: error.message,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/refresh', verifyUserAuth, async (req, res) => {
    try {
        // validate the token
        const isValid = await cognitoService.validateToken({ token: req.user.token });
        if (!isValid) {
            return res.status(401).json({
                error: 'Invalid token',
                correlationId: req.correlationId,
                timestamp: new Date().toISOString()
            });
        }

        logBusinessEvent('TOKEN_REFRESH', 'Token refresh requested', {
            userId: req.user.id,
            userType: req.user.userType
        });

        const result = await cognitoService.refreshToken({ token: req.user.token });

        logBusinessEvent('TOKEN_REFRESHED', 'Token refreshed successfully', {
            userId: req.user.id,
            userType: req.user.userType
        });

        res.status(200).json({
            success: true,
            data: result,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Token refresh failed', error, {
            userId: req.user?.id,
            category: 'token_management'
        });

        res.status(500).json({
            error: 'Token refresh failed',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
