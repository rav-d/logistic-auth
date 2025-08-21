const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const logger = require('./logger')('auth:dynamodb-service');
const metricsService = require('./metrics');

class DynamoDBService {
    constructor() {
        this.client = new DynamoDBClient({ 
            region: process.env.AWS_REGION || 'eu-central-1' 
        });
        this.tableName = process.env.DYNAMO_TABLE_NAME || 'tir-auth-main-development';
        
        logger.info('DynamoDB service initialized', {
            tableName: this.tableName,
            region: process.env.AWS_REGION || 'eu-central-1',
            category: 'service_initialization'
        });
    }

    /**
     * Generate unique user ID with timestamp and random component
     */
    generateUserId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `U-${timestamp}-${random}`;
    }

    /**
     * Generate driver ID with country and date
     */
    generateDriverId(country) {
        const date = new Date().toISOString().slice(2,10).replace(/-/g,''); // YYMMDD
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();
        return `D-${country}-${date}-${random}`;
    }

    /**
     * Generate provider ID with country and date
     */
    generateProviderId(country) {
        const date = new Date().toISOString().slice(2,10).replace(/-/g,''); // YYMMDD
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();
        return `P-${country}-${date}-${random}`;
    }

    /**
     * Create user profile in DynamoDB
     */
    async createUserProfile(userData) {
        const startTime = Date.now();
        const { cognitoSub, userType, email, country, profile } = userData;
        
        try {
            // Generate appropriate ID based on user type
            let userId, profileData;
            
            if (userType === 'DRIVER') {
                userId = this.generateDriverId(country);
                profileData = {
                    driver_id: userId,
                    full_name: profile.fullName || profile.givenName + ' ' + profile.familyName,
                    phone: profile.phoneNumber,
                    license_number: profile.licenseNumber,
                    company_id: profile.companyId || null
                };
            } else if (userType === 'PROVIDER') {
                userId = this.generateProviderId(country);
                profileData = {
                    provider_id: userId,
                    full_name: profile.fullName || profile.givenName + ' ' + profile.familyName,
                    phone: profile.phoneNumber,
                    company_id: profile.companyId || null,
                    business_verification: 'PENDING'
                };
            } else if (userType === 'INTERNAL') {
                userId = this.generateUserId();
                profileData = {
                    full_name: profile.fullName || profile.givenName + ' ' + profile.familyName,
                    department: profile.department,
                    employee_id: profile.employeeId,
                    access_level: profile.accessLevel || 'USER'
                };
            } else {
                throw new Error(`Invalid user type: ${userType}`);
            }

            const item = {
                PK: `USER#${userId}`,
                SK: 'PROFILE#main',
                GSI1PK: `COGNITO#${cognitoSub}`,
                GSI1SK: `USER#${userId}`,
                user_type: userType,
                cognito_sub: cognitoSub,
                status: 'PENDING_VERIFICATION',
                country: country || 'UNKNOWN',
                profile_data: profileData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
            };

            const params = {
                TableName: this.tableName,
                Item: marshall(item),
                ConditionExpression: 'attribute_not_exists(PK)',
                ReturnValues: 'ALL_OLD'
            };

            const result = await this.client.send(new PutItemCommand(params));
            
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('PUT', this.tableName, duration);
            metricsService.recordDatabaseOperation('INSERT', this.tableName, 'success');
            
            logger.info('User profile created successfully', {
                userId,
                userType,
                country,
                cognitoSub,
                duration,
                category: 'database_operation'
            });

            return {
                userId,
                userType,
                country,
                profileData,
                status: 'PENDING_VERIFICATION'
            };

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('PUT', this.tableName, duration);
            metricsService.recordDatabaseOperation('INSERT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'createUserProfile', userType || 'unknown');
            
            logger.error('Failed to create user profile', error, {
                userType,
                country,
                cognitoSub,
                duration,
                category: 'database_operation'
            });

            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('User already exists');
            }
            
            throw error;
        }
    }

    /**
     * Get user profile by Cognito sub
     */
    async getUserProfileByCognitoSub(cognitoSub) {
        const startTime = Date.now();
        
        try {
            const params = {
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :cognito_sub',
                ExpressionAttributeValues: marshall({
                    ':cognito_sub': `COGNITO#${cognitoSub}`
                })
            };

            const result = await this.client.send(new QueryCommand(params));
            
            if (!result.Items || result.Items.length === 0) {
                return null;
            }

            const userItem = unmarshall(result.Items[0]);
            const duration = (Date.now() - startTime) / 1000;
            
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'success');
            
            logger.debug('User profile retrieved by Cognito sub', {
                cognitoSub,
                userId: userItem.PK.replace('USER#', ''),
                duration,
                category: 'database_operation'
            });

            return {
                userId: userItem.PK.replace('USER#', ''),
                userType: userItem.user_type,
                status: userItem.status,
                country: userItem.country,
                profile: userItem.profile_data,
                createdAt: userItem.created_at,
                updatedAt: userItem.updated_at
            };

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'getUserProfileByCognitoSub', 'unknown');
            
            logger.error('Failed to get user profile by Cognito sub', error, {
                cognitoSub,
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Get user profile by user ID
     */
    async getUserProfile(userId) {
        const startTime = Date.now();
        
        try {
            const params = {
                TableName: this.tableName,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: marshall({
                    ':pk': `USER#${userId}`,
                    ':sk': 'PROFILE'
                })
            };

            const result = await this.client.send(new QueryCommand(params));
            
            if (!result.Items || result.Items.length === 0) {
                return null;
            }

            const userItem = unmarshall(result.Items[0]);
            const duration = (Date.now() - startTime) / 1000;
            
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'success');
            
            logger.debug('User profile retrieved by user ID', {
                userId,
                duration,
                category: 'database_operation'
            });

            return {
                userId: userItem.PK.replace('USER#', ''),
                userType: userItem.user_type,
                status: userItem.status,
                country: userItem.country,
                profile: userItem.profile_data,
                createdAt: userItem.created_at,
                updatedAt: userItem.updated_at
            };

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'getUserProfile', 'unknown');
            
            logger.error('Failed to get user profile by user ID', error, {
                userId,
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Update user profile
     */
    async updateUserProfile(userId, updates) {
        const startTime = Date.now();
        
        try {
            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            let counter = 1;

            // Build dynamic update expression
            Object.entries(updates).forEach(([key, value]) => {
                if (key === 'profile_data' && typeof value === 'object') {
                    // Handle nested profile updates
                    Object.entries(value).forEach(([profileKey, profileValue]) => {
                        const nameKey = `#profile${counter}`;
                        const valueKey = `:profile${counter}`;
                        expressionAttributeNames[nameKey] = `profile_data.${profileKey}`;
                        expressionAttributeValues[valueKey] = profileValue;
                        updateExpressions.push(`${nameKey} = ${valueKey}`);
                        counter++;
                    });
                } else {
                    const nameKey = `#attr${counter}`;
                    const valueKey = `:attr${counter}`;
                    expressionAttributeNames[nameKey] = key;
                    expressionAttributeValues[valueKey] = value;
                    updateExpressions.push(`${nameKey} = ${valueKey}`);
                    counter++;
                }
            });

            // Always update the updated_at timestamp
            const nameKey = `#attr${counter}`;
            const valueKey = `:attr${counter}`;
            expressionAttributeNames[nameKey] = 'updated_at';
            expressionAttributeValues[valueKey] = new Date().toISOString();
            updateExpressions.push(`${nameKey} = ${valueKey}`);

            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `USER#${userId}`,
                    SK: 'PROFILE#main'
                }),
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: marshall(expressionAttributeValues),
                ReturnValues: 'ALL_NEW'
            };

            const result = await this.client.send(new UpdateItemCommand(params));
            const duration = (Date.now() - startTime) / 1000;
            
            metricsService.recordDynamoDBLatency('UPDATE', this.tableName, duration);
            metricsService.recordDatabaseOperation('UPDATE', this.tableName, 'success');
            
            logger.info('User profile updated successfully', {
                userId,
                updates: Object.keys(updates),
                duration,
                category: 'database_operation'
            });

            return unmarshall(result.Attributes);

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('UPDATE', this.tableName, duration);
            metricsService.recordDatabaseOperation('UPDATE', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'updateUserProfile', 'unknown');
            
            logger.error('Failed to update user profile', error, {
                userId,
                updates: Object.keys(updates),
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Create company profile
     */
    async createCompanyProfile(companyData) {
        const startTime = Date.now();
        const { companyId, companyType, companyName, country, profile } = companyData;
        
        try {
            const item = {
                PK: `COMPANY#${companyId}`,
                SK: 'PROFILE#main',
                company_type: companyType,
                company_name: companyName,
                country: country,
                ...profile,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
            };

            const params = {
                TableName: this.tableName,
                Item: marshall(item),
                ConditionExpression: 'attribute_not_exists(PK)',
                ReturnValues: 'ALL_OLD'
            };

            const result = await this.client.send(new PutItemCommand(params));
            
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('PUT', this.tableName, duration);
            metricsService.recordDatabaseOperation('INSERT', this.tableName, 'success');
            
            logger.info('Company profile created successfully', {
                companyId,
                companyType,
                companyName,
                country,
                duration,
                category: 'database_operation'
            });

            return unmarshall(result.Attributes);

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('PUT', this.tableName, duration);
            metricsService.recordDatabaseOperation('INSERT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'createCompanyProfile', 'unknown');
            
            logger.error('Failed to create company profile', error, {
                companyId,
                companyType,
                companyName,
                country,
                duration,
                category: 'database_operation'
            });

            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('Company already exists');
            }
            
            throw error;
        }
    }

    /**
     * Get company profile
     */
    async getCompanyProfile(companyId) {
        const startTime = Date.now();
        
        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `COMPANY#${companyId}`,
                    SK: 'PROFILE#main'
                })
            };

            const result = await this.client.send(new GetItemCommand(params));
            
            if (!result.Item) {
                return null;
            }

            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('GET', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'success');
            
            logger.debug('Company profile retrieved', {
                companyId,
                duration,
                category: 'database_operation'
            });

            return unmarshall(result.Item);

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('GET', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'getCompanyProfile', 'unknown');
            
            logger.error('Failed to get company profile', error, {
                companyId,
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Query users by country and type
     */
    async queryUsersByCountryAndType(country, userType) {
        const startTime = Date.now();
        
        try {
            const params = {
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :pk',
                FilterExpression: 'country = :country AND user_type = :user_type',
                ExpressionAttributeValues: marshall({
                    ':pk': 'COGNITO#',
                    ':country': country,
                    ':user_type': userType
                })
            };

            const result = await this.client.send(new QueryCommand(params));
            
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'success');
            
            logger.debug('Users queried by country and type', {
                country,
                userType,
                count: result.Items?.length || 0,
                duration,
                category: 'database_operation'
            });

            return result.Items?.map(item => unmarshall(item)) || [];

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('QUERY', this.tableName, duration);
            metricsService.recordDatabaseOperation('SELECT', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'queryUsersByCountryAndType', 'unknown');
            
            logger.error('Failed to query users by country and type', error, {
                country,
                userType,
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Delete user profile (soft delete by setting status to DELETED)
     */
    async deleteUserProfile(userId) {
        const startTime = Date.now();
        
        try {
            const params = {
                TableName: this.tableName,
                Key: marshall({
                    PK: `USER#${userId}`,
                    SK: 'PROFILE#main'
                }),
                UpdateExpression: 'SET #status = :status, #deleted_at = :deleted_at, #updated_at = :updated_at',
                ExpressionAttributeNames: {
                    '#status': 'status',
                    '#deleted_at': 'deleted_at',
                    '#updated_at': 'updated_at'
                },
                ExpressionAttributeValues: marshall({
                    ':status': 'DELETED',
                    ':deleted_at': new Date().toISOString(),
                    ':updated_at': new Date().toISOString()
                }),
                ReturnValues: 'ALL_NEW'
            };

            const result = await this.client.send(new UpdateItemCommand(params));
            const duration = (Date.now() - startTime) / 1000;
            
            metricsService.recordDynamoDBLatency('UPDATE', this.tableName, duration);
            metricsService.recordDatabaseOperation('UPDATE', this.tableName, 'success');
            
            logger.info('User profile soft deleted successfully', {
                userId,
                duration,
                category: 'database_operation'
            });

            return unmarshall(result.Attributes);

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            metricsService.recordDynamoDBLatency('UPDATE', this.tableName, duration);
            metricsService.recordDatabaseOperation('UPDATE', this.tableName, 'failure');
            metricsService.recordError('DYNAMODB_ERROR', 'deleteUserProfile', 'unknown');
            
            logger.error('Failed to delete user profile', error, {
                userId,
                duration,
                category: 'database_operation'
            });
            
            throw error;
        }
    }

    /**
     * Health check for DynamoDB connection
     */
    async healthCheck() {
        try {
            const params = {
                TableName: this.tableName,
                Limit: 1
            };

            await this.client.send(new ScanCommand(params));
            return true;
        } catch (error) {
            logger.error('DynamoDB health check failed', error, {
                tableName: this.tableName,
                category: 'health_check'
            });
            return false;
        }
    }
}

// Export singleton instance
module.exports = new DynamoDBService();
