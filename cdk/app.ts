#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TirBrowserAuthResourcesStack } from './stacks/resources-stack';
import { TirBrowserAuthStack } from './stacks/auth-stack';

const app = new cdk.App();

// Create the resources stack first (DynamoDB table)
const resourcesStack = new TirBrowserAuthResourcesStack(app, 'TirBrowserAuthResourcesStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-central-1',
  },
  description: 'TIR Browser Auth Resources Stack - DynamoDB Table',
});

// Create the simplified auth stack (Cognito only, no ECS)
const authStack = new TirBrowserAuthStack(app, 'TirBrowserAuthStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-central-1',
  },
  description: 'TIR Browser Auth Stack - Cognito User Pool',
});

// Make auth stack depend on resources stack
authStack.addDependency(resourcesStack);