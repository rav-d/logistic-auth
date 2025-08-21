// Test environment setup
process.env.NODE_ENV = 'test';
process.env.DYNAMO_TABLE_NAME = 'tir-auth-test';
process.env.AWS_REGION = 'eu-central-1';
process.env.SERVICE_SECRET_ARN = 'arn:aws:secretsmanager:eu-central-1:140729424382:secret:JwtSecretB8834B39-YC8ExTMWWCWg-SE89rH';
process.env.COGNITO_USER_POOL_ID = 'eu-central-1_testpool';
process.env.COGNITO_CLIENT_ID = 'testclientid';
process.env.LOG_BASE_PATH = './test-logs';

// Mock AWS services for testing
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({ Items: [] })
    }))
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({})
    }))
}));

// Mock Redis
jest.mock('../src/services/redis', () => ({
    isReady: jest.fn().mockReturnValue(false),
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    incr: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(900),
    healthCheck: jest.fn().mockResolvedValue(false),
    getInfo: jest.fn().mockResolvedValue(null)
}));

// Global test timeout
jest.setTimeout(10000);