#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TirBrowserAuthStack } from './stacks/auth-stack';

/**
 * TIR Browser auth Service Infrastructure
 * Deploys auth service to development or production environment
 */
class AuthInfrastructureApp {
  private readonly app: cdk.App;
  private readonly environmentConfig: EnvironmentConfig;

  constructor() {
    this.app = new cdk.App();
    this.environmentConfig = this.validateAndGetEnvironmentConfig();
    this.deployAuthStack();
  }

  private validateAndGetEnvironmentConfig(): EnvironmentConfig {
    const requiredEnvVars = ['CDK_DEFAULT_ACCOUNT', 'CDK_DEFAULT_REGION'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    return {
      account: process.env.CDK_DEFAULT_ACCOUNT!,
      region: process.env.CDK_DEFAULT_REGION!,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  private deployAuthStack(): void {
    const authStack = new TirBrowserAuthStack(
      this.app,
      'TirBrowserAuthStack',
      {
        environment: this.environmentConfig.environment,
        env: this.environmentConfig,
        description: 'TIR Browser auth service',
      }
    );

    // Tags
    cdk.Tags.of(authStack).add('Project', 'TIR-Browser');
    cdk.Tags.of(authStack).add('Environment', this.environmentConfig.environment);
    cdk.Tags.of(authStack).add('Service', 'auth');
    cdk.Tags.of(authStack).add('ManagedBy', 'CDK');
  }
}

interface EnvironmentConfig {
  account: string;
  region: string;
  environment: string;
}

// Initialize and deploy auth service infrastructure
new AuthInfrastructureApp();