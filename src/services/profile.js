const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

// Local DynamoDB configuration from environment variables
const dynamoConfig = {
    region: process.env.AWS_REGION || 'eu-central-1',
    userProfileTable: process.env.DYNAMO_USER_PROFILE_TABLE || 'tir-browser-user-profiles'
};

const client = new DynamoDBClient({ region: dynamoConfig.region });
const TABLE_NAME = dynamoConfig.userProfileTable;

module.exports = {
    async createProfile({ userId, userType, profile }) {
        // Set default language preference based on country if not provided
        if (!profile.language && profile.country) {
            const countryLanguageMap = {
                'TR': 'tr',
                'AZ': 'az',
                'US': 'en',
                'GB': 'en',
                'CA': 'en'
            };
            profile.language = countryLanguageMap[profile.country] || 'en';
        }
        
        // Default to English if no language is set
        if (!profile.language) {
            profile.language = 'en';
        }

        const params = {
            TableName: TABLE_NAME,
            Item: {
                userId: { S: userId },
                userType: { S: userType },
                profile: { S: JSON.stringify(profile) },
                createdAt: { S: new Date().toISOString() }
            }
        };
        await client.send(new PutItemCommand(params));
        return { userId, userType, profile };
    },

    async getProfile(userId) {
        const params = {
            TableName: TABLE_NAME,
            Key: { userId: { S: userId } }
        };
        const result = await client.send(new GetItemCommand(params));
        if (!result.Item) return null;
        return {
            userId: result.Item.userId.S,
            userType: result.Item.userType.S,
            profile: JSON.parse(result.Item.profile.S),
            createdAt: result.Item.createdAt.S
        };
    },

    async updateProfile(userId, profile) {
        const params = {
            TableName: TABLE_NAME,
            Key: { userId: { S: userId } },
            UpdateExpression: 'SET profile = :profile',
            ExpressionAttributeValues: {
                ':profile': { S: JSON.stringify(profile) }
            }
        };
        await client.send(new UpdateItemCommand(params));
        return { userId, profile };
    },

    async updateLanguagePreference(userId, language) {
        const currentProfile = await this.getProfile(userId);
        if (!currentProfile) {
            throw new Error('Profile not found');
        }

        const updatedProfile = {
            ...currentProfile.profile,
            language: language
        };

        return await this.updateProfile(userId, updatedProfile);
    }
};
