"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TirBrowserAuthResourcesStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
class TirBrowserAuthResourcesStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // DynamoDB Table for TIR Browser Auth
        const tirAuthTable = new dynamodb.Table(this, 'TirAuthMainTable', {
            tableName: 'tir-auth-main',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'PK',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'SK',
                type: dynamodb.AttributeType.STRING,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete table on stack deletion
            timeToLiveAttribute: 'ttl',
        });
        // Tag table for permissions (Service: auth)
        cdk.Tags.of(tirAuthTable).add('Service', 'auth');
        // Optional: tag the whole stack as well
        cdk.Tags.of(this).add('Service', 'auth');
        // Global Secondary Index for Cognito sub lookup
        tirAuthTable.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: {
                name: 'GSI1PK',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI1SK',
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Output the table name for reference
        new cdk.CfnOutput(this, 'TirAuthTableName', {
            value: tirAuthTable.tableName,
            description: 'Name of the TIR Auth DynamoDB table',
            exportName: 'TirAuthTableName',
        });
        // Output the table ARN for reference
        new cdk.CfnOutput(this, 'TirAuthTableArn', {
            value: tirAuthTable.tableArn,
            description: 'ARN of the TIR Auth DynamoDB table',
            exportName: 'TirAuthTableArn',
        });
    }
}
exports.TirBrowserAuthResourcesStack = TirBrowserAuthResourcesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2VzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmVzb3VyY2VzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyxxREFBcUQ7QUFHckQsTUFBYSw0QkFBNkIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUN6RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHNDQUFzQztRQUN0QyxNQUFNLFlBQVksR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ2hFLFNBQVMsRUFBRSxlQUFlO1lBQzFCLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSx1Q0FBdUM7WUFDaEYsbUJBQW1CLEVBQUUsS0FBSztTQUMzQixDQUFDLENBQUM7UUFFSCw0Q0FBNEM7UUFDNUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqRCx3Q0FBd0M7UUFDeEMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUV6QyxnREFBZ0Q7UUFDaEQsWUFBWSxDQUFDLHVCQUF1QixDQUFDO1lBQ25DLFNBQVMsRUFBRSxNQUFNO1lBQ2pCLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsUUFBUTtnQkFDZCxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQ3BDO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLElBQUksRUFBRSxRQUFRO2dCQUNkLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxjQUFjLEVBQUUsUUFBUSxDQUFDLGNBQWMsQ0FBQyxHQUFHO1NBQzVDLENBQUMsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxZQUFZLENBQUMsU0FBUztZQUM3QixXQUFXLEVBQUUscUNBQXFDO1lBQ2xELFVBQVUsRUFBRSxrQkFBa0I7U0FDL0IsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLFlBQVksQ0FBQyxRQUFRO1lBQzVCLFdBQVcsRUFBRSxvQ0FBb0M7WUFDakQsVUFBVSxFQUFFLGlCQUFpQjtTQUM5QixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyREQsb0VBcURDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgY2xhc3MgVGlyQnJvd3NlckF1dGhSZXNvdXJjZXNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgVGFibGUgZm9yIFRJUiBCcm93c2VyIEF1dGhcclxuICAgIGNvbnN0IHRpckF1dGhUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVGlyQXV0aE1haW5UYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiAndGlyLWF1dGgtbWFpbicsXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdQSycsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnU0snLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sIC8vIERvbid0IGRlbGV0ZSB0YWJsZSBvbiBzdGFjayBkZWxldGlvblxyXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhZyB0YWJsZSBmb3IgcGVybWlzc2lvbnMgKFNlcnZpY2U6IGF1dGgpXHJcbiAgICBjZGsuVGFncy5vZih0aXJBdXRoVGFibGUpLmFkZCgnU2VydmljZScsICdhdXRoJyk7XHJcbiAgICAvLyBPcHRpb25hbDogdGFnIHRoZSB3aG9sZSBzdGFjayBhcyB3ZWxsXHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1NlcnZpY2UnLCAnYXV0aCcpO1xyXG5cclxuICAgIC8vIEdsb2JhbCBTZWNvbmRhcnkgSW5kZXggZm9yIENvZ25pdG8gc3ViIGxvb2t1cFxyXG4gICAgdGlyQXV0aFRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnR1NJMScsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kxUEsnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ0dTSTFTSycsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXQgdGhlIHRhYmxlIG5hbWUgZm9yIHJlZmVyZW5jZVxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RpckF1dGhUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aXJBdXRoVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFRJUiBBdXRoIER5bmFtb0RCIHRhYmxlJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1RpckF1dGhUYWJsZU5hbWUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IHRoZSB0YWJsZSBBUk4gZm9yIHJlZmVyZW5jZVxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RpckF1dGhUYWJsZUFybicsIHtcclxuICAgICAgdmFsdWU6IHRpckF1dGhUYWJsZS50YWJsZUFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIFRJUiBBdXRoIER5bmFtb0RCIHRhYmxlJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1RpckF1dGhUYWJsZUFybicsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19