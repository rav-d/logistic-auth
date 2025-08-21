import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class TirBrowserAuthResourcesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
