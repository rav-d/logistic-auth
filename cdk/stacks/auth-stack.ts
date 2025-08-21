// TIR Browser Platform - auth Service CDK Stack
// AWS CDK stack for deploying auth service to Fargate

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class TirBrowserAuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import the DynamoDB table from the resources stack
    const dynamoTable = cdk.Fn.importValue('TirAuthTableName');
    const dynamoTableArn = cdk.Fn.importValue('TirAuthTableArn');

    // VPC for the ECS service
    const vpc = new ec2.Vpc(this, 'TirAuthVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'TirAuthUserPool', {
      userPoolName: 'tir-browser-auth-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        userType: new cognito.StringAttribute({ mutable: true }),
        country: new cognito.StringAttribute({ mutable: true }),
        companyId: new cognito.StringAttribute({ mutable: true }),
        driverId: new cognito.StringAttribute({ mutable: true }),
        providerId: new cognito.StringAttribute({ mutable: true }),
        businessVerification: new cognito.StringAttribute({ mutable: true }),
        licenseNumber: new cognito.StringAttribute({ mutable: true }),
        employeeId: new cognito.StringAttribute({ mutable: true }),
        department: new cognito.StringAttribute({ mutable: true }),
        accessLevel: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      email: cognito.UserPoolEmail.withCognito('noreply@tir-browser.com'),
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      // Note: Advanced Security Mode is deprecated, using standard threat protection
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // Cognito User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'TirAuthClient', {
      userPool,
      userPoolClientName: 'tir-browser-auth-client',
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['http://localhost:3000/callback'],
        logoutUrls: ['http://localhost:3000/logout'],
      },
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'TirAuthCluster', {
      vpc,
      clusterName: 'tir-browser-auth-cluster',
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TirAuthTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole: this.createTaskRole(dynamoTableArn, userPool.userPoolArn),
      executionRole: this.createExecutionRole(),
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('TirAuthContainer', {
      image: ecs.ContainerImage.fromRegistry('tir-browser-auth:latest'),
      containerName: 'tir-browser-auth',
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'tir-browser-auth',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        NODE_ENV: 'production',
        DYNAMO_TABLE_NAME: dynamoTable,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        AWS_REGION: this.region,
        LOG_LEVEL: 'info',
        SERVICE_VERSION: '1.0.0',
      },
      portMappings: [
        {
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // Application Load Balancer with ECS Service
    const loadBalancedFargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'TirAuthService', {
      cluster,
      taskDefinition,
      serviceName: 'tir-browser-auth-service',
      desiredCount: 2,
      publicLoadBalancer: true,
      listenerPort: 80,

      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Auto Scaling
    const scaling = loadBalancedFargateService.service.autoScaleTaskCount({
      maxCapacity: 10,
      minCapacity: 2,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'TirAuthUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'TirAuthUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'ServiceURL', {
      value: `http://${loadBalancedFargateService.loadBalancer.loadBalancerDnsName}`,
      description: 'URL of the TIR Browser Auth Service',
      exportName: 'TirAuthServiceURL',
    });
  }

  private createTaskRole(tableArn: string, userPoolArn: string): iam.Role {
    const role = new iam.Role(this, 'TirAuthTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // DynamoDB permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
      ],
      resources: [tableArn, `${tableArn}/index/*`],
    }));

    // Cognito permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminConfirmSignUp',
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:AdminRespondToAuthChallenge',
        'cognito-idp:AdminGetDevice',
        'cognito-idp:AdminListUsers',
        'cognito-idp:ListUsers',
        'cognito-idp:DescribeUserPool',
        'cognito-idp:DescribeUserPoolClient',
      ],
      resources: [userPoolArn],
    }));

    return role;
  }

  private createExecutionRole(): iam.Role {
    const role = new iam.Role(this, 'TirAuthExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // CloudWatch Logs permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
      ],
      resources: ['*'],
    }));

    return role;
  }
}