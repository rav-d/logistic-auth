import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export declare class TirBrowserAuthStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
    private createTaskRole;
    private createExecutionRole;
}
