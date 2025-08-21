const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ListUsersCommand,
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
    async registerUser({ userType, email, password, phoneNumber, profile, givenName, familyName, given_name, family_name, country }) {
        const logger = require('./logger')('auth:cognito-service');
        
        // Validate required fields
        if (!userType || !email || !password || !country) {
            const error = new Error('Missing required fields: userType, email, password, country');
            error.statusCode = 400;
            throw error;
        }

        // Validate country format (2-letter ISO code)
        if (!/^[A-Z]{2}$/.test(country)) {
            const error = new Error('Country must be a 2-letter ISO code (e.g., TR, AZ, US)');
            error.statusCode = 400;
            throw error;
        }

        // Derive optional name attributes if provided
        const resolvedGivenName = givenName || given_name || profile?.givenName || profile?.firstName || profile?.given_name || (profile?.fullName ? String(profile.fullName).split(' ')[0] : undefined);
        const resolvedFamilyName = familyName || family_name || profile?.familyName || profile?.lastName || profile?.family_name || (profile?.fullName ? String(profile.fullName).slice(1).join(' ') : undefined);

        const userAttributes = [
            { Name: 'email', Value: email },
            { Name: 'custom:userType', Value: userType.toUpperCase() },
            { Name: 'custom:country', Value: country },
            ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : []),
            ...(resolvedGivenName ? [{ Name: 'given_name', Value: String(resolvedGivenName) }] : []),
            ...(resolvedFamilyName ? [{ Name: 'family_name', Value: String(resolvedFamilyName) }] : []),
        ];

        // Add additional custom attributes based on user type
        if (userType === 'DRIVER') {
            if (profile?.licenseNumber) {
                userAttributes.push({ Name: 'custom:licenseNumber', Value: profile.licenseNumber });
            }
            if (profile?.companyId) {
                userAttributes.push({ Name: 'custom:companyId', Value: profile.companyId });
            }
        } else if (userType === 'PROVIDER') {
            if (profile?.companyId) {
                userAttributes.push({ Name: 'custom:companyId', Value: profile.companyId });
            }
            userAttributes.push({ Name: 'custom:businessVerification', Value: 'PENDING' });
        } else if (userType === 'INTERNAL') {
            if (profile?.department) {
                userAttributes.push({ Name: 'custom:department', Value: profile.department });
            }
            if (profile?.employeeId) {
                userAttributes.push({ Name: 'custom:employeeId', Value: profile.employeeId });
            }
            if (profile?.accessLevel) {
                userAttributes.push({ Name: 'custom:accessLevel', Value: profile.accessLevel });
            }
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
            
            // Record successful registration metrics
            const metricsService = require('./metrics');
            metricsService.recordUserRegistration(userType.toUpperCase(), 'success', country);
            metricsService.recordCognitoOperation('SIGN_UP', 'success', userType.toUpperCase());
            
            logger.info('User registered successfully in Cognito', {
                email,
                userType,
                country,
                cognitoSub: signUpResponse.UserSub,
                category: 'user_registration'
            });

        } catch (error) {
            // Record failed registration metrics
            const metricsService = require('./metrics');
            metricsService.recordUserRegistration(userType.toUpperCase(), 'failure', country);
            metricsService.recordCognitoOperation('SIGN_UP', 'failure', userType.toUpperCase());
            
            // Map Cognito schema validation errors to 400 Bad Request
            if (typeof error?.message === 'string' && /Attributes did not conform to the schema|required/i.test(error.message)) {
                error.statusCode = 400;
            }
            
            logger.error('User registration failed in Cognito', error, {
                email,
                userType,
                country,
                category: 'user_registration'
            });
            
            throw error;
        }

        // Create profile record in DynamoDB
        try {
            const dynamoDBService = require('./dynamodb');
            const profileResult = await dynamoDBService.createUserProfile({
                cognitoSub: signUpResponse.UserSub,
                userType: userType.toUpperCase(),
                email,
                country,
                profile: {
                    fullName: resolvedGivenName && resolvedFamilyName ? `${resolvedGivenName} ${resolvedFamilyName}` : undefined,
                    givenName: resolvedGivenName,
                    familyName: resolvedFamilyName,
                    phoneNumber,
                    licenseNumber: profile?.licenseNumber,
                    companyId: profile?.companyId,
                    department: profile?.department,
                    employeeId: profile?.employeeId,
                    accessLevel: profile?.accessLevel
                }
            });

            logger.info('User profile created in DynamoDB', {
                userId: profileResult.userId,
                cognitoSub: signUpResponse.UserSub,
                userType,
                country,
                category: 'profile_creation'
            });

        } catch (err) {
            logger.error('Profile creation failed in DynamoDB', err, {
                email,
                userType,
                country,
                cognitoSub: signUpResponse.UserSub,
                category: 'profile_creation'
            });
            
            return {
                userId: signUpResponse.UserSub,
                userType: userType.toUpperCase(),
                country,
                codeDelivery: signUpResponse?.CodeDeliveryDetails,
                status: 'PENDING_VERIFICATION'
            };
        }

        // Send welcome email (soft-fail)
        try {
            const emailService = require('./email').getEmailService();
            const language = profile?.language || this.getLanguageFromCountry(country);
            
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

            // Record email notification metrics
            const metricsService = require('./metrics');
            metricsService.recordEmailNotification('welcome', 'success', language);

        } catch (emailError) {
            logger.warn('Welcome email sending failed', {
                error: emailError?.message,
                email: email,
                category: 'email_notification'
            });
            
            // Record failed email metrics
            const metricsService = require('./metrics');
            metricsService.recordEmailNotification('welcome', 'failure', 'en');
        }

        return {
            userId: signUpResponse.UserSub,
            userType: userType.toUpperCase(),
            country,
            codeDelivery: signUpResponse?.CodeDeliveryDetails,
            status: 'PENDING_VERIFICATION'
        };
    },

    async loginUser({ email, password }) {
        const logger = require('./logger')('auth:cognito-service');
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

        try {
            let response;
            if (useAdmin) {
                const params = {
                    UserPoolId: cognitoConfig.userPoolId,
                    ClientId: cognitoConfig.clientId,
                    AuthFlow: 'ADMIN_NO_SRP_AUTH',
                    AuthParameters: authParameters
                };
                response = await client.send(new AdminInitiateAuthCommand(params));
            } else {
                const params = {
                    AuthFlow: 'USER_PASSWORD_AUTH',
                    ClientId: cognitoConfig.clientId,
                    AuthParameters: authParameters
                };
                response = await client.send(new InitiateAuthCommand(params));
            }

            // Get user profile to record metrics
            let userType = 'unknown';
            let country = 'unknown';
            try {
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
                if (userProfile) {
                    userType = userProfile.userType;
                    country = userProfile.country;
                }
            } catch (profileError) {
                logger.warn('Failed to get user profile for metrics', {
                    error: profileError?.message,
                    email,
                    category: 'metrics_collection'
                });
            }

            // Record successful login metrics
            const metricsService = require('./metrics');
            metricsService.recordLoginAttempt(userType, 'success', country);
            metricsService.recordAuthenticationAttempt('login', 'success', userType);
            metricsService.recordCognitoOperation('LOGIN', 'success', userType);

            logger.info('User login successful', {
                email,
                userType,
                country,
                category: 'user_authentication'
            });

            return { 
                userId: email, 
                token: response.AuthenticationResult?.IdToken,
                userType,
                country
            };

        } catch (error) {
            // Get user profile to record metrics
            let userType = 'unknown';
            let country = 'unknown';
            try {
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
                if (userProfile) {
                    userType = userProfile.userType;
                    country = userProfile.country;
                }
            } catch (profileError) {
                
            }

            // Record failed login metrics
            const metricsService = require('./metrics');
            metricsService.recordLoginAttempt(userType, 'failure', country);
            metricsService.recordAuthenticationAttempt('login', 'failure', userType);
            metricsService.recordCognitoOperation('LOGIN', 'failure', userType);

            logger.error('User login failed', error, {
                email,
                userType,
                country,
                category: 'user_authentication'
            });

            throw error;
        }
    },

    async verifyEmail({ email, code }) {
        const logger = require('./logger')('auth:cognito-service');
        
        try {
            // Confirm user sign up with code
            const params = {
                ClientId: cognitoConfig.clientId,
                Username: email,
                ConfirmationCode: code
            };
            await client.send(new ConfirmSignUpCommand(params));

            // Update user status in DynamoDB
            try {
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
                if (userProfile) {
                    await dynamoDBService.updateUserProfile(userProfile.userId, {
                        status: 'ACTIVE'
                    });

                    // Record successful verification metrics
                    const metricsService = require('./metrics');
                    metricsService.recordBusinessEvent('EMAIL_VERIFIED', 'success', userProfile.userType);
                    metricsService.recordCognitoOperation('EMAIL_VERIFICATION', 'success', userProfile.userType);

                    logger.info('User email verified and profile activated', {
                        email,
                        userId: userProfile.userId,
                        userType: userProfile.userType,
                        category: 'email_verification'
                    });
                }
            } catch (profileError) {
                logger.warn('Failed to update user profile after email verification', {
                    error: profileError?.message,
                    email,
                    category: 'profile_update'
                });
            }

            return true;

        } catch (error) {
            // Record failed verification metrics
            const metricsService = require('./metrics');
            metricsService.recordBusinessEvent('EMAIL_VERIFIED', 'failure', 'unknown');
            metricsService.recordCognitoOperation('EMAIL_VERIFICATION', 'failure', 'unknown');

            logger.error('Email verification failed', error, {
                email,
                category: 'email_verification'
            });

            throw error;
        }
    },

    async resendVerification({ email }) {
        const logger = require('./logger')('auth:cognito-service');
        
        try {
            const params = {
                ClientId: cognitoConfig.clientId,
                Username: email
            };
            const response = await client.send(new ResendConfirmationCodeCommand(params));

            // Send verification email (soft-fail)
            try {
                const emailService = require('./email').getEmailService();
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
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

                // Record email notification metrics
                const metricsService = require('./metrics');
                metricsService.recordEmailNotification('verification', 'success', language);

            } catch (emailError) {
                logger.warn('Verification email sending failed', {
                    error: emailError?.message,
                    email: email,
                    category: 'email_notification'
                });
                
                // Record failed email metrics
                const metricsService = require('./metrics');
                metricsService.recordEmailNotification('verification', 'failure', 'en');
            }

            return {
                codeDelivery: response?.CodeDeliveryDetails || null
            };

        } catch (error) {
            logger.error('Resend verification failed', error, {
                email,
                category: 'email_verification'
            });

            throw error;
        }
    },

    async forgotPassword({ email }) {
        const logger = require('./logger')('auth:cognito-service');
        
        try {
            const params = {
                ClientId: cognitoConfig.clientId,
                Username: email
            };
            await client.send(new ForgotPasswordCommand(params));

            // Send password reset email (soft-fail)
            try {
                const emailService = require('./email').getEmailService();
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
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

                // Record email notification metrics
                const metricsService = require('./metrics');
                metricsService.recordPasswordReset(userProfile?.userType || 'unknown', 'success');
                metricsService.recordEmailNotification('password-reset', 'success', language);

            } catch (emailError) {
                logger.warn('Password reset email sending failed', {
                    error: emailError?.message,
                    email: email,
                    category: 'email_notification'
                });
                
                // Record failed email metrics
                const metricsService = require('./metrics');
                metricsService.recordEmailNotification('password-reset', 'failure', 'en');
            }
            
            return true;

        } catch (error) {
            logger.error('Password reset request failed', error, {
                email,
                category: 'password_reset'
            });

            throw error;
        }
    },

    async resetPassword({ email, code, newPassword }) {
        const logger = require('./logger')('auth:cognito-service');
        
        try {
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
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(email);
                const language = userProfile?.profile?.language || 'en';
                
                await emailService.sendAuthEmail({
                    to: email,
                    templateType: 'password-changed',
                    templateData: {
                        firstName: userProfile?.profile?.firstName || userProfile?.profile?.givenName || 'User'
                    },
                    language: language
                });

                // Record email notification metrics
                const metricsService = require('./metrics');
                metricsService.recordPasswordReset(userProfile?.userType || 'unknown', 'success');
                metricsService.recordEmailNotification('password-changed', 'success', language);

            } catch (emailError) {
                logger.warn('Password changed email sending failed', {
                    error: emailError?.message,
                    email: email,
                    category: 'email_notification'
                });
                
                // Record failed email metrics
                const metricsService = require('./metrics');
                metricsService.recordEmailNotification('password-changed', 'failure', 'en');
            }

            return true;

        } catch (error) {
            logger.error('Password reset failed', error, {
                email,
                category: 'password_reset'
            });

            throw error;
        }
    },

    async sendOTP({ phoneNumber }) {
        const logger = require('./logger')('auth:cognito-service');
        let username;

        // Normalize phone number format (remove + if present, ensure E.164 format)
        const normalizedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        
        // Step 1: Check if user exists with this phone number
        const listUsersParams = {
            UserPoolId: cognitoConfig.userPoolId,
            Filter: `phone_number = "${normalizedPhoneNumber}"`
        };

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
            
            // Get user profile for metrics
            let userType = 'unknown';
            let country = 'unknown';
            try {
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(username);
                if (userProfile) {
                    userType = userProfile.userType;
                    country = userProfile.country;
                }
            } catch (profileError) {
                
            }

            // Record successful SMS metrics
            const metricsService = require('./metrics');
            metricsService.recordSMSNotification('otp', 'success', country);
            
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
            // Get user profile for metrics
            let userType = 'unknown';
            let country = 'unknown';
            try {
                const dynamoDBService = require('./dynamodb');
                const userProfile = await dynamoDBService.getUserProfileByCognitoSub(username);
                if (userProfile) {
                    userType = userProfile.userType;
                    country = userProfile.country;
                }
            } catch (profileError) {
                
            }

            // Record failed SMS metrics
            const metricsService = require('./metrics');
            metricsService.recordSMSNotification('otp', 'failure', country);
            
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

    /**
     * Helper function to determine language from country
     */
    getLanguageFromCountry(country) {
        const countryLanguageMap = {
            'TR': 'tr',
            'AZ': 'az',
            'US': 'en',
            'GB': 'en',
            'CA': 'en',
            'DE': 'de',
            'FR': 'fr',
            'ES': 'es',
            'IT': 'it',
            'NL': 'nl',
            'PL': 'pl',
            'RU': 'ru',
            'CN': 'zh',
            'JP': 'ja',
            'KR': 'ko'
        };
        return countryLanguageMap[country] || 'en';
    }
};
