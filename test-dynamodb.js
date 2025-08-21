const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Set environment variables
process.env.AWS_ACCESS_KEY_ID = '';
process.env.AWS_SECRET_ACCESS_KEY = '';
process.env.AWS_REGION = 'eu-central-1';
process.env.DYNAMO_TABLE_NAME = 'tir-auth-main';

const client = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'eu-central-1' 
});

const tableName = process.env.DYNAMO_TABLE_NAME || 'tir-auth-main';

async function testDynamoDB() {
    console.log('Testing DynamoDB connection...');
    console.log('Table name:', tableName);
    console.log('Region:', process.env.AWS_REGION);

    try {
        // Test 1: Create a Provider user
        const providerUser = {
            PK: 'USER#P-TR-240115-TEST01',
            SK: 'PROFILE#main',
            GSI1PK: 'COGNITO#test-provider-cognito-sub',
            GSI1SK: 'USER#P-TR-240115-TEST01',
            user_type: 'PROVIDER',
            cognito_sub: 'test-provider-cognito-sub',
            status: 'ACTIVE',
            country: 'TR',
            profile_data: {
                provider_id: 'P-TR-240115-TEST01',
                full_name: 'Test Provider User',
                phone: '+90501234567',
                company_id: null,
                business_verification: 'VERIFIED'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
        };

        console.log('\n1. Creating Provider user...');
        const providerParams = {
            TableName: tableName,
            Item: marshall(providerUser)
        };

        await client.send(new PutItemCommand(providerParams));
        console.log('✅ Provider user created successfully');

        // Test 2: Create a Driver user
        const driverUser = {
            PK: 'USER#D-AZ-240115-TEST02',
            SK: 'PROFILE#main',
            GSI1PK: 'COGNITO#test-driver-cognito-sub',
            GSI1SK: 'USER#D-AZ-240115-TEST02',
            user_type: 'DRIVER',
            cognito_sub: 'test-driver-cognito-sub',
            status: 'ACTIVE',
            country: 'AZ',
            profile_data: {
                driver_id: 'D-AZ-240115-TEST02',
                full_name: 'Test Driver User',
                phone: '+994501234567',
                license_number: 'DL123456',
                company_id: null
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
        };

        console.log('\n2. Creating Driver user...');
        const driverParams = {
            TableName: tableName,
            Item: marshall(driverUser)
        };

        await client.send(new PutItemCommand(driverParams));
        console.log('✅ Driver user created successfully');

        // Test 3: Create an Internal user
        const internalUser = {
            PK: 'USER#U-1705312200-TEST03',
            SK: 'PROFILE#main',
            GSI1PK: 'COGNITO#test-internal-cognito-sub',
            GSI1SK: 'USER#U-1705312200-TEST03',
            user_type: 'INTERNAL',
            cognito_sub: 'test-internal-cognito-sub',
            status: 'ACTIVE',
            profile_data: {
                full_name: 'Test Internal User',
                department: 'Operations',
                employee_id: 'EMP001',
                access_level: 'ADMIN'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
        };

        console.log('\n3. Creating Internal user...');
        const internalParams = {
            TableName: tableName,
            Item: marshall(internalUser)
        };

        await client.send(new PutItemCommand(internalParams));
        console.log('✅ Internal user created successfully');

        // Test 4: Query users by Cognito sub
        console.log('\n4. Querying users by Cognito sub...');
        const queryParams = {
            TableName: tableName,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :cognito_sub',
            ExpressionAttributeValues: marshall({
                ':cognito_sub': 'COGNITO#test-provider-cognito-sub'
            })
        };

        const queryResult = await client.send(new QueryCommand(queryParams));
        console.log('✅ Query successful, found users:', queryResult.Items?.length || 0);

        if (queryResult.Items && queryResult.Items.length > 0) {
            const user = unmarshall(queryResult.Items[0]);
            console.log('User details:', {
                userId: user.PK.replace('USER#', ''),
                userType: user.user_type,
                status: user.status,
                country: user.country,
                profile: user.profile_data
            });
        }

        console.log('\n🎉 All DynamoDB tests passed successfully!');
        console.log('The table is working correctly and users have been created.');

    } catch (error) {
        console.error('❌ DynamoDB test failed:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
}

testDynamoDB();
