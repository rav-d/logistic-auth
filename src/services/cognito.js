const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminGetUserCommand,
  ListUsersCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Local Cognito configuration from environment variables
const cognitoConfig = {
    region: process.env.COGNITO_REGION || 'eu-central-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID
};

const client = new CognitoIdentityProviderClient({ region: cognitoConfig.region });
const snsClient = new SNSClient({ region: cognitoConfig.region });

module.exports = {
    async registerUser({ userType, email, password, phoneNumber, profile, givenName, familyName, given_name, family_name }) {
        // Sign up user in Cognito
        const includeUserType = (process.env.COGNITO_INCLUDE_CUSTOM_USER_TYPE || 'false') === 'true';
        const userTypeAttrName = process.env.COGNITO_CUSTOM_USER_TYPE_ATTR || 'custom:userType';

        // Derive optional name attributes if provided
        const resolvedGivenName = givenName || given_name || profile?.givenName || profile?.firstName || profile?.given_name || (profile?.fullName ? String(profile.fullName).split(' ')[0] : undefined);
        const resolvedFamilyName = familyName || family_name || profile?.familyName || profile?.lastName || profile?.family_name || (profile?.fullName ? String(profile.fullName).split(' ').slice(1).join(' ') : undefined);

        const userAttributes = [
            { Name: 'email', Value: email },
            ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : []),
            ...(resolvedGivenName ? [{ Name: 'given_name', Value: String(resolvedGivenName) }] : []),
            ...(resolvedFamilyName ? [{ Name: 'family_name', Value: String(resolvedFamilyName) }] : []),
        ];

        if (includeUserType && userType) {
            userAttributes.push({ Name: userTypeAttrName, Value: String(userType) });
        }

        const params = {
            ClientId: cognitoConfig.clientId,
            Username: email,
            Password: password,
            UserAttributes: userAttributes
        };
        let signUpResponse;
        try {
            signUpResponse = await client.send(new SignUpCommand(params));
        } catch (error) {
            // Map Cognito schema validation errors to 400 Bad Request
            if (typeof error?.message === 'string' && /Attributes did not conform to the schema|required/i.test(error.message)) {
                error.statusCode = 400;
            }
            throw error;
        }
        // Create profile record in DynamoDB (soft-fail unless PROFILE_CREATE_STRICT=true)
        try {
            await require('./profile').createProfile({ userId: email, userType, profile });
        } catch (err) {
            const logger = require('./logger')('auth:cognito-service');
            logger.warn('Profile creation failed', {
                error: err?.message,
                code: err?.code || err?.name,
                category: 'profile_persistence'
            });
            if ((process.env.PROFILE_CREATE_STRICT || 'false') === 'true') {
                throw err;
            }
        }

        // Send welcome email (soft-fail)
        try {
            const emailService = require('./email').getEmailService();
            const userProfile = await require('./profile').getProfile(email);
            const language = userProfile?.profile?.language || 'en';
            
            await emailService.sendAuthEmail({
                to: email,
                templateType: 'welcome',
                templateData: {
                    firstName: resolvedGivenName || 'User',
                    email: email,
                    userType: userType,
                    company: profile?.company,
                    verificationUrl: `${process.env.FRONTEND_URL || 'https://tirbrowser.com'}/verify?email=${encodeURIComponent(email)}`,
                    expiryHours: 24
                },
                language: language
            });
        } catch (emailError) {
            const logger = require('./logger')('auth:cognito-service');
            logger.warn('Welcome email sending failed', {
                error: emailError?.message,
                email: email,
                category: 'email_notification'
            });
        }
        return {
            userId: email,
            userType,
            codeDelivery: signUpResponse?.CodeDeliveryDetails
        };
    },

    async loginUser({ email, password }) {
        const useAdmin = (process.env.COGNITO_USE_ADMIN_AUTH || 'false') === 'true';
        const clientSecret = process.env.COGNITO_CLIENT_SECRET;
        
        // Compute SECRET_HASH if client secret is configured
        let authParameters = { USERNAME: email, PASSWORD: password };
        if (clientSecret) {
            const crypto = require('crypto');
            const secretHash = crypto
                .createHmac('SHA256', clientSecret)
                .update(email + cognitoConfig.clientId)
                .digest('base64');
            authParameters.SECRET_HASH = secretHash;
        }

        if (useAdmin) {
            const params = {
                UserPoolId: cognitoConfig.userPoolId,
                ClientId: cognitoConfig.clientId,
                AuthFlow: 'ADMIN_NO_SRP_AUTH',
                AuthParameters: authParameters
            };
            const response = await client.send(new AdminInitiateAuthCommand(params));
            return { userId: email, token: response.AuthenticationResult?.IdToken };
        } else {
            const params = {
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: cognitoConfig.clientId,
                AuthParameters: authParameters
            };
            const response = await client.send(new InitiateAuthCommand(params));
            return { userId: email, token: response.AuthenticationResult?.IdToken };
        }
    },

    async verifyEmail({ email, code }) {
        // Confirm user sign up with code
        const params = {
            ClientId: cognitoConfig.clientId,
            Username: email,
            ConfirmationCode: code
        };
        await client.send(new ConfirmSignUpCommand(params));
        return true;
    },

    async resendVerification({ email }) {
        const params = {
            ClientId: cognitoConfig.clientId,
            Username: email
        };
        const response = await client.send(new ResendConfirmationCodeCommand(params));

        // Send verification email (soft-fail)
        try {
            const emailService = require('./email').getEmailService();
            const userProfile = await require('./profile').getProfile(email);
            const language = userProfile?.profile?.language || 'en';
            
            await emailService.sendAuthEmail({
                to: email,
                templateType: 'verification',
                templateData: {
                    firstName: userProfile?.profile?.firstName || userProfile?.profile?.givenName || 'User',
                    verificationUrl: `${process.env.FRONTEND_URL || 'https://tirbrowser.com'}/verify?email=${encodeURIComponent(email)}`,
                    verificationCode: response?.CodeDeliveryDetails?.Destination || 'Check your email',
                    expiryHours: 24
                },
                language: language
            });
        } catch (emailError) {
            const logger = require('./logger')('auth:cognito-service');
            logger.warn('Verification email sending failed', {
                error: emailError?.message,
                email: email,
                category: 'email_notification'
            });
        }

        return {
            codeDelivery: response?.CodeDeliveryDetails || null
        };
    },

    async forgotPassword({ email }) {
        const params = {
            ClientId: cognitoConfig.clientId,
            Username: email
        };
        await client.send(new ForgotPasswordCommand(params));

        // Send password reset email (soft-fail)
        try {
            const emailService = require('./email').getEmailService();
            const userProfile = await require('./profile').getProfile(email);
            const language = userProfile?.profile?.language || 'en';
            
            await emailService.sendAuthEmail({
                to: email,
                templateType: 'password-reset',
                templateData: {
                    firstName: userProfile?.profile?.firstName || userProfile?.profile?.givenName || 'User',
                    resetUrl: `${process.env.FRONTEND_URL || 'https://tirbrowser.com'}/reset-password?email=${encodeURIComponent(email)}`,
                    expiryHours: 24
                },
                language: language
            });
        } catch (emailError) {
            const logger = require('./logger')('auth:cognito-service');
            logger.warn('Password reset email sending failed', {
                error: emailError?.message,
                email: email,
                category: 'email_notification'
            });
        }
        
        return true;
    },

    async resetPassword({ email, code, newPassword }) {
        const params = {
            ClientId: cognitoConfig.clientId,
            Username: email,
            ConfirmationCode: code,
            Password: newPassword
        };
        await client.send(new ConfirmForgotPasswordCommand(params));

        // Send password changed confirmation email (soft-fail)
        try {
            const emailService = require('./email').getEmailService();
            const userProfile = await require('./profile').getProfile(email);
            const language = userProfile?.profile?.language || 'en';
            
            await emailService.sendAuthEmail({
                to: email,
                templateType: 'password-changed',
                templateData: {
                    firstName: userProfile?.profile?.firstName || userProfile?.profile?.givenName || 'User'
                },
                language: language
            });
        } catch (emailError) {
            const logger = require('./logger')('auth:cognito-service');
            logger.warn('Password changed email sending failed', {
                error: emailError?.message,
                email: email,
                category: 'email_notification'
            });
        }

        return true;
    },

    async sendOTP({ phoneNumber }) {
        let username;

        // Normalize phone number format (remove + if present, ensure E.164 format)
        const normalizedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        
        // Step 1: Check if user exists with this phone number
        // We need to list users and filter by phone number since Cognito doesn't support direct lookup by phone number
        const listUsersParams = {
            UserPoolId: cognitoConfig.userPoolId,
            Filter: `phone_number = "${normalizedPhoneNumber}"`
        };

        // Add some debugging
        const logger = require('./logger')('auth:cognito-service');
        logger.info('Searching for user by phone number', {
            originalPhoneNumber: phoneNumber,
            normalizedPhoneNumber: normalizedPhoneNumber,
            filter: listUsersParams.Filter,
            category: 'sms_notification'
        });

        try {
            // Use ListUsers to find user by phone number
            const listResponse = await client.send(new ListUsersCommand(listUsersParams));
            
            logger.info('ListUsers response', {
                userCount: listResponse.Users?.length || 0,
                category: 'sms_notification'
            });
            
            if (!listResponse.Users || listResponse.Users.length === 0) {
                // User not found, return appropriate error
                logger.warn('OTP request for non-existent user', {
                    phoneNumber: phoneNumber,
                    category: 'sms_notification'
                });
                
                const error = new Error('User not found with this phone number');
                error.name = 'UserNotFoundException';
                error.statusCode = 404;
                throw error;
            }

            // Get the first user found (should be unique)
            const user = listResponse.Users[0];
            username = user.Username;
            
            logger.info('Found user for OTP', {
                username: username,
                phoneNumber: normalizedPhoneNumber,
                category: 'sms_notification'
            });
        } catch (error) {
            logger.error('Error searching for user by phone number', {
                error: error?.message,
                phoneNumber: normalizedPhoneNumber,
                category: 'sms_notification'
            });
            
            if (error.name === 'UserNotFoundException') {
                error.statusCode = 404;
                error.message = 'User not found with this phone number';
                throw error;
            }
            throw error;
        }

        // Step 2: User exists, now send OTP via SMS
        try {
            // Generate 6-digit OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Prepare SMS message
            const message = `Your TIR Browser verification code is: ${otpCode}. Valid for 10 minutes.`;
            
            // Send SMS via AWS SNS
            const snsParams = {
                Message: message,
                PhoneNumber: normalizedPhoneNumber,
                MessageAttributes: {
                    'AWS.SNS.SMS.SMSType': {
                        DataType: 'String',
                        StringValue: 'Transactional'
                    },
                    'AWS.SNS.SMS.SenderID': {
                        DataType: 'String',
                        StringValue: 'TIRBrowser'
                    }
                }
            };
            
            const snsResponse = await snsClient.send(new PublishCommand(snsParams));
            
            logger.info('SMS OTP sent successfully', {
                phoneNumber: normalizedPhoneNumber,
                username: username,
                messageId: snsResponse.MessageId,
                category: 'sms_notification'
            });

            return {
                success: true,
                message: 'OTP sent successfully',
                messageId: snsResponse.MessageId,
                session: `session_${Date.now()}`,
                challengeName: 'SMS_MFA'
            };
        } catch (error) {
            logger.error('SMS OTP sending failed', {
                error: error?.message,
                phoneNumber: normalizedPhoneNumber,
                username: username,
                category: 'sms_notification'
            });
            
            // Map SNS errors to appropriate HTTP status codes
            if (error.name === 'InvalidParameterException') {
                error.statusCode = 400;
                error.message = 'Invalid phone number format';
            } else if (error.name === 'ThrottlingException') {
                error.statusCode = 429;
                error.message = 'Too many SMS requests. Please try again later.';
            } else if (error.name === 'AuthorizationErrorException') {
                error.statusCode = 403;
                error.message = 'SMS sending not authorized';
            } else if (error.name === 'OptOutException') {
                error.statusCode = 400;
                error.message = 'Phone number has opted out of SMS';
            } else {
                error.statusCode = 500;
                error.message = 'Failed to send SMS OTP';
            }
            
            throw error;
        }
    },
};
