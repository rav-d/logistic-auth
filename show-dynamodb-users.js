const { DynamoDBClient, ScanCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
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

async function showAllUsers() {
    console.log('🔍 Querying all users in DynamoDB table...');
    console.log('Table name:', tableName);
    console.log('Region:', process.env.AWS_REGION);
    console.log('='.repeat(80));

    try {
        // Scan all users
        const scanParams = {
            TableName: tableName,
            FilterExpression: 'begins_with(PK, :pk)',
            ExpressionAttributeValues: marshall({
                ':pk': 'USER#'
            })
        };

        const scanResult = await client.send(new ScanCommand(scanParams));
        
        if (!scanResult.Items || scanResult.Items.length === 0) {
            console.log('❌ No users found in the table');
            return;
        }

        console.log(`✅ Found ${scanResult.Items.length} users in the table:\n`);

        // Process each user
        for (let i = 0; i < scanResult.Items.length; i++) {
            const user = unmarshall(scanResult.Items[i]);
            
            console.log(`👤 User ${i + 1}:`);
            console.log(`   User ID: ${user.PK.replace('USER#', '')}`);
            console.log(`   Type: ${user.user_type}`);
            console.log(`   Status: ${user.status}`);
            console.log(`   Country: ${user.country || 'N/A'}`);
            console.log(`   Cognito Sub: ${user.cognito_sub}`);
            console.log(`   Created: ${user.created_at}`);
            console.log(`   Updated: ${user.updated_at}`);
            
            if (user.profile_data) {
                console.log(`   Profile Data:`);
                Object.entries(user.profile_data).forEach(([key, value]) => {
                    console.log(`     ${key}: ${value}`);
                });
            }
            
            console.log('');
        }

        // Show summary by user type
        const userTypes = {};
        scanResult.Items.forEach(item => {
            const user = unmarshall(item);
            const type = user.user_type;
            userTypes[type] = (userTypes[type] || 0) + 1;
        });

        console.log('📊 Summary by User Type:');
        Object.entries(userTypes).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} user(s)`);
        });

        console.log('\n🎉 DynamoDB table query completed successfully!');

    } catch (error) {
        console.error('❌ Failed to query DynamoDB table:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
}

showAllUsers();
