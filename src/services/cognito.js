const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} = require('@aws-sdk/client-cognito-identity-provider');

// Local Cognito configuration from environment variables
const cognitoConfig = {
    region: process.env.COGNITO_REGION || 'eu-central-1',
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID
};

const client = new CognitoIdentityProviderClient({ region: cognitoConfig.region });

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
        return true;
    },
};
