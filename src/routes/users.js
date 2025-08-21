const express = require('express');
const router = express.Router();
const logger = require('../services/logger')('auth:user-routes');
const { logBusinessEvent } = require('../middleware/logging');
const { verifyUserAuth, verifyServiceAuth } = require('../middleware/auth');
const metricsService = require('../services/metrics');
const dynamoDBService = require('../services/dynamodb');
const { hasPermission } = require('../services/rbac');

// Middleware to check permissions
function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.user, permission)) {
            metricsService.recordFailedPermission('users', permission, req.user.userType);
            return res.status(403).json({ 
                error: 'Insufficient permissions', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }
        next();
    };
}

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 *       500:
 *         description: Internal server error
 */
router.get('/profile', verifyUserAuth, async (req, res) => {
    try {
        const profile = await dynamoDBService.getUserProfile(req.user.id);
        
        if (!profile) {
            return res.status(404).json({ 
                error: 'Profile not found', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        logBusinessEvent('PROFILE_RETRIEVED', 'User profile retrieved', {
            userId: req.user.id,
            userType: req.user.userType
        });

        res.status(200).json({ 
            success: true, 
            data: profile, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('Profile retrieval failed', error, { 
            userId: req.user.id,
            category: 'profile_management'
        });

        metricsService.recordError('PROFILE_RETRIEVAL_ERROR', 'getProfile', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to retrieve profile', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/profile:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Users]
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
 *                 description: Profile data to update
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/profile', verifyUserAuth, async (req, res) => {
    try {
        const { profile: profileUpdates } = req.body;
        
        if (!profileUpdates || typeof profileUpdates !== 'object') {
            return res.status(400).json({ 
                error: 'Profile data is required and must be an object', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        // Validate profile updates based on user type
        const currentProfile = await dynamoDBService.getUserProfile(req.user.id);
        if (!currentProfile) {
            return res.status(404).json({ 
                error: 'Profile not found', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        // Only allow updating certain fields based on user type
        const allowedUpdates = {};
        if (currentProfile.userType === 'DRIVER') {
            if (profileUpdates.fullName) allowedUpdates.fullName = profileUpdates.fullName;
            if (profileUpdates.phone) allowedUpdates.phone = profileUpdates.phone;
            if (profileUpdates.licenseNumber) allowedUpdates.licenseNumber = profileUpdates.licenseNumber;
        } else if (currentProfile.userType === 'PROVIDER') {
            if (profileUpdates.fullName) allowedUpdates.fullName = profileUpdates.fullName;
            if (profileUpdates.phone) allowedUpdates.phone = profileUpdates.phone;
        } else if (currentProfile.userType === 'INTERNAL') {
            if (profileUpdates.fullName) allowedUpdates.fullName = profileUpdates.fullName;
            if (profileUpdates.department) allowedUpdates.department = profileUpdates.department;
        }

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({ 
                error: 'No valid profile fields to update', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        const updated = await dynamoDBService.updateUserProfile(req.user.id, {
            profile_data: allowedUpdates
        });

        logBusinessEvent('PROFILE_UPDATED', 'User profile updated', {
            userId: req.user.id,
            userType: req.user.userType,
            updatedFields: Object.keys(allowedUpdates)
        });

        res.status(200).json({ 
            success: true, 
            data: updated, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('Profile update failed', error, { 
            userId: req.user.id,
            category: 'profile_management'
        });

        metricsService.recordError('PROFILE_UPDATE_ERROR', 'updateProfile', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to update profile', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/profile/language:
 *   put:
 *     summary: Update user's language preference
 *     tags: [Users]
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
 *                 description: Language preference
 *     responses:
 *       200:
 *         description: Language preference updated
 *       400:
 *         description: Invalid language
 *       500:
 *         description: Internal server error
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

        const updated = await dynamoDBService.updateUserProfile(req.user.id, {
            profile_data: { language }
        });

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
        logger.error('Language preference update failed', error, { 
            userId: req.user.id,
            category: 'profile_management'
        });

        metricsService.recordError('LANGUAGE_UPDATE_ERROR', 'updateLanguage', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to update language preference', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     summary: Get user details (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to retrieve
 *     responses:
 *       200:
 *         description: User details retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get('/:userId', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await dynamoDBService.getUserProfile(userId);
        
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        logBusinessEvent('USER_DETAILS_RETRIEVED', 'User details retrieved by admin', {
            adminUserId: req.user.id,
            targetUserId: userId,
            userType: user.userType
        });

        res.status(200).json({ 
            success: true, 
            data: user, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('User details retrieval failed', error, { 
            adminUserId: req.user.id,
            targetUserId: req.params.userId,
            category: 'user_management'
        });

        metricsService.recordError('USER_DETAILS_ERROR', 'getUserDetails', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to retrieve user details', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/{userId}:
 *   put:
 *     summary: Update user (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, SUSPENDED, PENDING_VERIFICATION]
 *               profile_data:
 *                 type: object
 *                 description: Profile data to update
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.put('/:userId', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, profile_data } = req.body;
        
        const updates = {};
        if (status) {
            const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ 
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 
                    correlationId: req.correlationId, 
                    timestamp: new Date().toISOString() 
                });
            }
            updates.status = status;
        }
        
        if (profile_data && typeof profile_data === 'object') {
            updates.profile_data = profile_data;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ 
                error: 'No valid fields to update', 
                correlationId: req.correlationId, 
                timestamp: new Date().toISOString() 
            });
        }

        const updated = await dynamoDBService.updateUserProfile(userId, updates);

        logBusinessEvent('USER_UPDATED', 'User updated by admin', {
            adminUserId: req.user.id,
            targetUserId: userId,
            updates: Object.keys(updates)
        });

        res.status(200).json({ 
            success: true, 
            data: updated, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('User update failed', error, { 
            adminUserId: req.user.id,
            targetUserId: req.params.userId,
            category: 'user_management'
        });

        metricsService.recordError('USER_UPDATE_ERROR', 'updateUser', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to update user', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/{userId}/suspend:
 *   post:
 *     summary: Suspend user account (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to suspend
 *     responses:
 *       200:
 *         description: User suspended successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/:userId/suspend', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { userId } = req.params;
        
        const updated = await dynamoDBService.updateUserProfile(userId, {
            status: 'SUSPENDED'
        });

        logBusinessEvent('USER_SUSPENDED', 'User account suspended by admin', {
            adminUserId: req.user.id,
            targetUserId: userId
        });

        metricsService.recordSecurityEvent('ACCOUNT_SUSPENDED', 'medium', req.user.userType);

        res.status(200).json({ 
            success: true, 
            data: updated, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('User suspension failed', error, { 
            adminUserId: req.user.id,
            targetUserId: req.params.userId,
            category: 'user_management'
        });

        metricsService.recordError('USER_SUSPENSION_ERROR', 'suspendUser', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to suspend user', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/{userId}/activate:
 *   post:
 *     summary: Activate user account (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to activate
 *     responses:
 *       200:
 *         description: User activated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/:userId/activate', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { userId } = req.params;
        
        const updated = await dynamoDBService.updateUserProfile(userId, {
            status: 'ACTIVE'
        });

        logBusinessEvent('USER_ACTIVATED', 'User account activated by admin', {
            adminUserId: req.user.id,
            targetUserId: userId
        });

        res.status(200).json({ 
            success: true, 
            data: updated, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('User activation failed', error, { 
            adminUserId: req.user.id,
            targetUserId: req.params.userId,
            category: 'user_management'
        });

        metricsService.recordError('USER_ACTIVATION_ERROR', 'activateUser', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to activate user', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

/**
 * @swagger
 * /users/{userId}:
 *   delete:
 *     summary: Soft delete user (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:userId', verifyUserAuth, requirePermission('manage:users'), async (req, res) => {
    try {
        const { userId } = req.params;
        
        const deleted = await dynamoDBService.deleteUserProfile(userId);

        logBusinessEvent('USER_DELETED', 'User account soft deleted by admin', {
            adminUserId: req.user.id,
            targetUserId: userId
        });

        metricsService.recordSecurityEvent('ACCOUNT_DELETED', 'medium', req.user.userType);

        res.status(200).json({ 
            success: true, 
            data: deleted, 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        logger.error('User deletion failed', error, { 
            adminUserId: req.user.id,
            targetUserId: req.params.userId,
            category: 'user_management'
        });

        metricsService.recordError('USER_DELETION_ERROR', 'deleteUser', req.user.userType);

        res.status(500).json({ 
            error: 'Failed to delete user', 
            correlationId: req.correlationId, 
            timestamp: new Date().toISOString() 
        });
    }
});

module.exports = router;
