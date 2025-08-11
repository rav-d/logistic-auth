// TIR Browser Platform - auth Service CDK Stack
// AWS CDK stack for deploying auth service to Fargate

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface TirBrowserAuthStackProps extends cdk.StackProps {
  environment: string;
}

export class TirBrowserAuthStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: TirBrowserAuthStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const isDevelopment = environment === 'development';

    // Read variables from .env file only
    const envFilePath = path.join(__dirname, '../../.env');
    const envVars: Record<string, string> = {};
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            envVars[key] = valueParts.join('=');
          }
        }
      });
    }

    // Import VPC and cluster from shared infrastructure using CDK imports
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: cdk.Fn.importValue('TirBrowserVpcId'),
      availabilityZones: cdk.Fn.split(',', cdk.Fn.importValue('TirBrowserVpcAzs')),
      privateSubnetIds: cdk.Fn.split(',', cdk.Fn.importValue('TirBrowserPrivateSubnetIds')),
      publicSubnetIds: cdk.Fn.split(',', cdk.Fn.importValue('TirBrowserPublicSubnetIds'))
    });
    
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
      clusterName: isDevelopment 
        ? cdk.Fn.importValue('TirBrowserLokiClusterName')
        : 'tir-browser-production-cluster',
      vpc
    });
    
    // Create security group for ECS tasks
    const taskSecurityGroup = new ec2.SecurityGroup(this, 'AuthTaskSecurityGroup', {
      vpc,
      description: 'Security group for auth ECS tasks',
      allowAllOutbound: true
    });
    
    // Allow ALB to access auth tasks for health checks
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      cdk.Fn.importValue('TirBrowserDevAlbSecurityGroupId')
    );
    
    taskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow ALB to access auth for health checks'
    );
    
    // VPC endpoints are shared - tasks can access existing endpoints via task security group
    
    // Note: VPC endpoints are shared across the VPC
    // Main infrastructure should create all common VPC endpoints:
    // - Secrets Manager (already in Loki stack)
    // - S3 Gateway (already in Loki stack) 
    // - ECR + ECR Docker (needed by all microservices)
    // - CloudWatch Logs (needed by all microservices)

    // Import shared service secret from .env or stack exports
    const serviceSecretArn = envVars.SERVICE_SECRET_ARN || cdk.Fn.importValue('TirBrowserServiceSecretArn');
    const serviceSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'ServiceSecret',
      serviceSecretArn
    );

    // Create CloudWatch log group with minimal retention (3 hours)
    const logGroup = new logs.LogGroup(this, 'AuthLogGroup', {
      logGroupName: `/tir-browser/${environment}/auth`,
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create task definition with shared volume for logs
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'AuthTaskDef', {
      memoryLimitMiB: environment === 'production' ? 1024 : 512,
      cpu: environment === 'production' ? 512 : 256,
      family: `tir-browser-auth-${environment}`,
      volumes: [{
        name: 'log-volume',
        host: {} // Empty host volume for log sharing
      }]
    });

    // Add main application container
    const serviceVersion = envVars.SERVICE_VERSION || 'latest';
    const appContainer = this.taskDefinition.addContainer('app', {
      image: ecs.ContainerImage.fromRegistry(
        `${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com/tir-browser-auth:${serviceVersion}`
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'auth',
        logGroup: logGroup
      }),
      environment: {
        // Always set these core variables
        SERVICE_NAME: 'auth',
        // Pass all environment variables from .env file only, filtering out sensitive ones
        ...Object.fromEntries(
          Object.entries(envVars)
            .filter(([key]) => !key.includes('SECRET') && !key.includes('PASSWORD') && !key.includes('KEY'))
            .filter(([, value]) => value !== undefined)
        ),
        // Override with computed values if needed
        NODE_ENV: envVars.NODE_ENV || environment,
        SERVICE_VERSION: envVars.SERVICE_VERSION || serviceVersion,
        // Add SERVICE_SECRET_ARN for auth middleware
        SERVICE_SECRET_ARN: serviceSecretArn
      },
      secrets: {
        SERVICE_SECRET: ecs.Secret.fromSecretsManager(serviceSecret)
      },
      healthCheck: {
        command: ['CMD-SHELL', 'node -e "require(\'http\').get(\'http://localhost:3000/ready\', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on(\'error\', () => process.exit(1))"'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30)
      }
    });

    // Add mount point to app container
    appContainer.addMountPoints({
      sourceVolume: 'log-volume',
      containerPath: '/var/log/tir',
      readOnly: false
    });

    // Add init container to fix volume permissions
    const initContainer = this.taskDefinition.addContainer('init-permissions', {
      image: ecs.ContainerImage.fromRegistry('alpine:latest'),
      essential: false,
      command: ['sh', '-c', 'chown -R 1001:1001 /var/log/tir && chmod -R 755 /var/log/tir']
    });

    // Add mount point to init container
    initContainer.addMountPoints({
      sourceVolume: 'log-volume',
      containerPath: '/var/log/tir',
      readOnly: false
    });

    // App container depends on init container
    appContainer.addContainerDependencies({
      container: initContainer,
      condition: ecs.ContainerDependencyCondition.SUCCESS
    });

    // Add Promtail sidecar container with embedded config
    const promtailConfigContent = fs.readFileSync(path.join(__dirname, '../../promtail/config.yml'), 'utf8');
    const promtailContainer = this.taskDefinition.addContainer('promtail', {
      image: ecs.ContainerImage.fromRegistry('grafana/promtail:3.2.0'),
      essential: false, // Non-essential - won't stop task if it fails
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'promtail',
        logGroup: logGroup
      }),
      environment: {
        PROMTAIL_CONFIG: Buffer.from(promtailConfigContent).toString('base64')
      },
      entryPoint: ['sh', '-c'],
      command: ['echo "$PROMTAIL_CONFIG" | base64 -d > /etc/promtail/config.yml && /usr/bin/promtail -config.file=/etc/promtail/config.yml'],
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q --spider http://localhost:9080/ready || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30)
      }
    });

    // Add mount point to Promtail container
    promtailContainer.addMountPoints({
      sourceVolume: 'log-volume',
      containerPath: '/var/log/tir',
      readOnly: true
    });

    // Add port mapping to app container
    appContainer.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP
    });

    // Container dependency - Promtail starts after app
    promtailContainer.addContainerDependencies({
      container: appContainer,
      condition: ecs.ContainerDependencyCondition.START
    });

    // Create Fargate service
    this.service = new ecs.FargateService(this, 'AuthService', {
      cluster,
      taskDefinition: this.taskDefinition,
      serviceName: `tir-browser-auth-${environment}`,
      desiredCount: environment === 'production' ? 2 : 1,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      securityGroups: [taskSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      minHealthyPercent: 50,
      maxHealthyPercent: 200
    });

    // Register with shared ALB in development or create individual ALB in production
    if (isDevelopment) {
      // Import shared ALB target group
      const targetGroupArn = cdk.Fn.importValue('TirBrowserDevAuthTargetGroupArn');
      const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'SharedTargetGroup', {
        targetGroupArn,
        loadBalancerArns: cdk.Fn.importValue('TirBrowserSharedDevAlbArn')
      });
      
      // Register service with shared ALB target group
      this.service.attachToApplicationTargetGroup(targetGroup);
    } else {
      // Create individual ALB for production
      const albService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'AuthALB', {
        cluster,
        taskDefinition: this.taskDefinition,
        serviceName: `tir-browser-auth-${environment}-alb`,
        publicLoadBalancer: true,
        listenerPort: 80
      });
      
      // Update service reference
      this.service = albService.service;
    }

    // Configure auto scaling
    const scalableTarget = this.service.autoScaleTaskCount({
      minCapacity: environment === 'production' ? 2 : 1,
      maxCapacity: environment === 'production' ? 10 : 3
    });

    // Scale based on CPU utilization
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2)
    });

    // Grant permissions (following Loki pattern)
    
    // Grant execution role permissions for ECR and container startup
    this.taskDefinition.executionRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );
    
    // Grant Secrets Manager access to execution role for container secrets
    (this.taskDefinition.executionRole as iam.Role).addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: [serviceSecretArn]
    }));
    
    // Grant task role permissions for CloudWatch Logs (3 hour retention)
    (this.taskDefinition.taskRole as iam.Role).addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
        'logs:DescribeLogGroups'
      ],
      resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/tir-browser/${environment}/auth*`]
    }));
    
    // Grant Cognito permissions for user authentication
    (this.taskDefinition.taskRole as iam.Role).addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:GetUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers'
      ],
      resources: [`arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`]
    }));
    
    // Grant task role access to secrets for runtime
    (this.taskDefinition.taskRole as iam.Role).addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: [serviceSecretArn]
    }));

    // Outputs
    if (isDevelopment) {
      new cdk.CfnOutput(this, 'SharedALBEndpoint', {
        value: `http://${cdk.Fn.importValue('TirBrowserSharedDevAlbDns')}/auth`,
        description: 'auth service endpoint on shared ALB',
      });
      
      new cdk.CfnOutput(this, 'HealthCheckUrl', {
        value: `http://${cdk.Fn.importValue('TirBrowserSharedDevAlbDns')}/auth/ready`,
        description: 'Health check URL on shared ALB'
      });
    }

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'Name of the ECS service'
    });

    // Tags
    cdk.Tags.of(this).add('Project', 'TIR-Browser');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Service', 'auth');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}