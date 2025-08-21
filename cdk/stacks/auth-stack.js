"use strict";
// TIR Browser Platform - auth Service CDK Stack
// AWS CDK stack for deploying auth service to Fargate
Object.defineProperty(exports, "__esModule", { value: true });
exports.TirBrowserAuthStack = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecs_patterns = require("aws-cdk-lib/aws-ecs-patterns");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const cognito = require("aws-cdk-lib/aws-cognito");
class TirBrowserAuthStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    createTaskRole(tableArn, userPoolArn) {
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
    createExecutionRole() {
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
exports.TirBrowserAuthStack = TirBrowserAuthStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLGdEQUFnRDtBQUNoRCxzREFBc0Q7OztBQUV0RCxtQ0FBbUM7QUFDbkMsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyw2REFBNkQ7QUFDN0QsMkNBQTJDO0FBQzNDLDZDQUE2QztBQUM3QyxtREFBbUQ7QUFHbkQsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHFEQUFxRDtRQUNyRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFN0QsMEJBQTBCO1FBQzFCLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQzFDLE1BQU0sRUFBRSxDQUFDO1lBQ1QsV0FBVyxFQUFFLENBQUM7U0FDZixDQUFDLENBQUM7UUFFSCxvQkFBb0I7UUFDcEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUM3RCxZQUFZLEVBQUUsd0JBQXdCO1lBQ3RDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxrQkFBa0IsRUFBRTtnQkFDbEIsS0FBSyxFQUFFO29CQUNMLFFBQVEsRUFBRSxJQUFJO29CQUNkLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFNBQVMsRUFBRTtv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QUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQTNQRCxrREEyUEMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUSVIgQnJvd3NlciBQbGF0Zm9ybSAtIGF1dGggU2VydmljZSBDREsgU3RhY2tcclxuLy8gQVdTIENESyBzdGFjayBmb3IgZGVwbG95aW5nIGF1dGggc2VydmljZSB0byBGYXJnYXRlXHJcblxyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcclxuaW1wb3J0ICogYXMgZWNzX3BhdHRlcm5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MtcGF0dGVybnMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgY2xhc3MgVGlyQnJvd3NlckF1dGhTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gSW1wb3J0IHRoZSBEeW5hbW9EQiB0YWJsZSBmcm9tIHRoZSByZXNvdXJjZXMgc3RhY2tcclxuICAgIGNvbnN0IGR5bmFtb1RhYmxlID0gY2RrLkZuLmltcG9ydFZhbHVlKCdUaXJBdXRoVGFibGVOYW1lJyk7XHJcbiAgICBjb25zdCBkeW5hbW9UYWJsZUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnVGlyQXV0aFRhYmxlQXJuJyk7XHJcblxyXG4gICAgLy8gVlBDIGZvciB0aGUgRUNTIHNlcnZpY2VcclxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdUaXJBdXRoVlBDJywge1xyXG4gICAgICBtYXhBenM6IDIsXHJcbiAgICAgIG5hdEdhdGV3YXlzOiAxLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2xcclxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1RpckF1dGhVc2VyUG9vbCcsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiAndGlyLWJyb3dzZXItYXV0aC11c2VycycsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xyXG4gICAgICAgIGVtYWlsOiB7XHJcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcclxuICAgICAgICAgIG11dGFibGU6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBnaXZlbk5hbWU6IHtcclxuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxyXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGZhbWlseU5hbWU6IHtcclxuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxyXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgdXNlclR5cGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXHJcbiAgICAgICAgY291bnRyeTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgICBjb21wYW55SWQ6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXHJcbiAgICAgICAgZHJpdmVySWQ6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXHJcbiAgICAgICAgcHJvdmlkZXJJZDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgICBidXNpbmVzc1ZlcmlmaWNhdGlvbjogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgICBsaWNlbnNlTnVtYmVyOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxyXG4gICAgICAgIGVtcGxveWVlSWQ6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXHJcbiAgICAgICAgZGVwYXJ0bWVudDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgICBhY2Nlc3NMZXZlbDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGVtYWlsOiBjb2duaXRvLlVzZXJQb29sRW1haWwud2l0aENvZ25pdG8oJ25vcmVwbHlAdGlyLWJyb3dzZXIuY29tJyksXHJcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcclxuICAgICAgICBlbWFpbFN0eWxlOiBjb2duaXRvLlZlcmlmaWNhdGlvbkVtYWlsU3R5bGUuQ09ERSxcclxuICAgICAgfSxcclxuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PUFRJT05BTCxcclxuICAgICAgbWZhU2Vjb25kRmFjdG9yOiB7XHJcbiAgICAgICAgc21zOiB0cnVlLFxyXG4gICAgICAgIG90cDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgLy8gTm90ZTogQWR2YW5jZWQgU2VjdXJpdHkgTW9kZSBpcyBkZXByZWNhdGVkLCB1c2luZyBzdGFuZGFyZCB0aHJlYXQgcHJvdGVjdGlvblxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcclxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ1RpckF1dGhDbGllbnQnLCB7XHJcbiAgICAgIHVzZXJQb29sLFxyXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICd0aXItYnJvd3Nlci1hdXRoLWNsaWVudCcsXHJcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcclxuICAgICAgYXV0aEZsb3dzOiB7XHJcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxyXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIG9BdXRoOiB7XHJcbiAgICAgICAgZmxvd3M6IHtcclxuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXHJcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNjb3BlczogW1xyXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxyXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcclxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9jYWxsYmFjayddLFxyXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwL2xvZ291dCddLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRUNTIENsdXN0ZXJcclxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcywgJ1RpckF1dGhDbHVzdGVyJywge1xyXG4gICAgICB2cGMsXHJcbiAgICAgIGNsdXN0ZXJOYW1lOiAndGlyLWJyb3dzZXItYXV0aC1jbHVzdGVyJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhc2sgRGVmaW5pdGlvblxyXG4gICAgY29uc3QgdGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGlyQXV0aFRhc2snLCB7XHJcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiA1MTIsXHJcbiAgICAgIGNwdTogMjU2LFxyXG4gICAgICB0YXNrUm9sZTogdGhpcy5jcmVhdGVUYXNrUm9sZShkeW5hbW9UYWJsZUFybiwgdXNlclBvb2wudXNlclBvb2xBcm4pLFxyXG4gICAgICBleGVjdXRpb25Sb2xlOiB0aGlzLmNyZWF0ZUV4ZWN1dGlvblJvbGUoKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBjb250YWluZXIgdG8gdGFzayBkZWZpbml0aW9uXHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ1RpckF1dGhDb250YWluZXInLCB7XHJcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KCd0aXItYnJvd3Nlci1hdXRoOmxhdGVzdCcpLFxyXG4gICAgICBjb250YWluZXJOYW1lOiAndGlyLWJyb3dzZXItYXV0aCcsXHJcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xyXG4gICAgICAgIHN0cmVhbVByZWZpeDogJ3Rpci1icm93c2VyLWF1dGgnLFxyXG4gICAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICB9KSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLFxyXG4gICAgICAgIERZTkFNT19UQUJMRV9OQU1FOiBkeW5hbW9UYWJsZSxcclxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgICBDT0dOSVRPX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcclxuICAgICAgICBMT0dfTEVWRUw6ICdpbmZvJyxcclxuICAgICAgICBTRVJWSUNFX1ZFUlNJT046ICcxLjAuMCcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHBvcnRNYXBwaW5nczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDMwMDAsXHJcbiAgICAgICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUCxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlciB3aXRoIEVDUyBTZXJ2aWNlXHJcbiAgICBjb25zdCBsb2FkQmFsYW5jZWRGYXJnYXRlU2VydmljZSA9IG5ldyBlY3NfcGF0dGVybnMuQXBwbGljYXRpb25Mb2FkQmFsYW5jZWRGYXJnYXRlU2VydmljZSh0aGlzLCAnVGlyQXV0aFNlcnZpY2UnLCB7XHJcbiAgICAgIGNsdXN0ZXIsXHJcbiAgICAgIHRhc2tEZWZpbml0aW9uLFxyXG4gICAgICBzZXJ2aWNlTmFtZTogJ3Rpci1icm93c2VyLWF1dGgtc2VydmljZScsXHJcbiAgICAgIGRlc2lyZWRDb3VudDogMixcclxuICAgICAgcHVibGljTG9hZEJhbGFuY2VyOiB0cnVlLFxyXG4gICAgICBsaXN0ZW5lclBvcnQ6IDgwLFxyXG5cclxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQXV0byBTY2FsaW5nXHJcbiAgICBjb25zdCBzY2FsaW5nID0gbG9hZEJhbGFuY2VkRmFyZ2F0ZVNlcnZpY2Uuc2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xyXG4gICAgICBtYXhDYXBhY2l0eTogMTAsXHJcbiAgICAgIG1pbkNhcGFjaXR5OiAyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgc2NhbGluZy5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ0NwdVNjYWxpbmcnLCB7XHJcbiAgICAgIHRhcmdldFV0aWxpemF0aW9uUGVyY2VudDogNzAsXHJcbiAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICB9KTtcclxuXHJcbiAgICBzY2FsaW5nLnNjYWxlT25NZW1vcnlVdGlsaXphdGlvbignTWVtb3J5U2NhbGluZycsIHtcclxuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA3MCxcclxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6ICdUaXJBdXRoVXNlclBvb2xJZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcclxuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcclxuICAgICAgZXhwb3J0TmFtZTogJ1RpckF1dGhVc2VyUG9vbENsaWVudElkJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZXJ2aWNlVVJMJywge1xyXG4gICAgICB2YWx1ZTogYGh0dHA6Ly8ke2xvYWRCYWxhbmNlZEZhcmdhdGVTZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfWAsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIG9mIHRoZSBUSVIgQnJvd3NlciBBdXRoIFNlcnZpY2UnLFxyXG4gICAgICBleHBvcnROYW1lOiAnVGlyQXV0aFNlcnZpY2VVUkwnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZVRhc2tSb2xlKHRhYmxlQXJuOiBzdHJpbmcsIHVzZXJQb29sQXJuOiBzdHJpbmcpOiBpYW0uUm9sZSB7XHJcbiAgICBjb25zdCByb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUaXJBdXRoVGFza1JvbGUnLCB7XHJcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxyXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcclxuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpLFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnNcclxuICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxyXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcclxuICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcclxuICAgICAgICAnZHluYW1vZGI6U2NhbicsXHJcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoR2V0SXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbdGFibGVBcm4sIGAke3RhYmxlQXJufS9pbmRleC8qYF0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gQ29nbml0byBwZXJtaXNzaW9uc1xyXG4gICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkdldFVzZXInLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkNyZWF0ZVVzZXInLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pblVwZGF0ZVVzZXJBdHRyaWJ1dGVzJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5EZWxldGVVc2VyJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5TZXRVc2VyUGFzc3dvcmQnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkNvbmZpcm1TaWduVXAnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkluaXRpYXRlQXV0aCcsXHJcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluUmVzcG9uZFRvQXV0aENoYWxsZW5nZScsXHJcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluR2V0RGV2aWNlJyxcclxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5MaXN0VXNlcnMnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnLFxyXG4gICAgICAgICdjb2duaXRvLWlkcDpEZXNjcmliZVVzZXJQb29sJyxcclxuICAgICAgICAnY29nbml0by1pZHA6RGVzY3JpYmVVc2VyUG9vbENsaWVudCcsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogW3VzZXJQb29sQXJuXSxcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gcm9sZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY3JlYXRlRXhlY3V0aW9uUm9sZSgpOiBpYW0uUm9sZSB7XHJcbiAgICBjb25zdCByb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdUaXJBdXRoRXhlY3V0aW9uUm9sZScsIHtcclxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXHJcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xyXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JyksXHJcbiAgICAgIF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcclxuICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXHJcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcclxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxyXG4gICAgICAgICdsb2dzOkRlc2NyaWJlTG9nU3RyZWFtcycsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogWycqJ10sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIHJvbGU7XHJcbiAgfVxyXG59Il19