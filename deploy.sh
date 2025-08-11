#!/bin/bash
# TIR Browser auth Service Deployment
# Deploys auth service independently

set -e

# Source .env file if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

export NODE_ENV=${NODE_ENV:-development}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Deploying auth Service..."
echo "📁 Service: $SCRIPT_DIR"

# Step 1: Build and push Docker image with version
echo "📋 Step 1: Building Docker image..."
cd "$SCRIPT_DIR"

# Get service version from package.json
SERVICE_VERSION=$(node -p "require('./package.json').version")
echo "📦 Service version: $SERVICE_VERSION"

# Build image with version tag
docker build -t tir-browser-auth:$SERVICE_VERSION .

# Create ECR repository if it doesn't exist
echo "🔍 Checking ECR repository..."
aws ecr describe-repositories --repository-names tir-browser-auth 2>/dev/null || {
    echo "📦 Creating ECR repository..."
    aws ecr create-repository --repository-name tir-browser-auth
}

# Tag and push to ECR with version and latest
echo "🏷️  Tagging and pushing to ECR..."
ECR_REPO="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(aws configure get region).amazonaws.com/tir-browser-auth"
docker tag tir-browser-auth:$SERVICE_VERSION $ECR_REPO:$SERVICE_VERSION
docker tag tir-browser-auth:$SERVICE_VERSION $ECR_REPO:latest

aws ecr get-login-password --region $(aws configure get region) | docker login --username AWS --password-stdin $ECR_REPO
docker push $ECR_REPO:$SERVICE_VERSION
docker push $ECR_REPO:latest

# Step 2: Deploy service stack with version
echo "📋 Step 2: Deploying auth stack with version $SERVICE_VERSION..."
cd "$SCRIPT_DIR/cdk"
npm install
SERVICE_VERSION=$SERVICE_VERSION npx cdk deploy --require-approval never

echo "✅ auth Service deployed successfully!"
echo "🔗 Access via: http://$(aws cloudformation describe-stacks --stack-name TirBrowserSharedDevAlbStack --query 'Stacks[0].Outputs[?OutputKey==`SharedALBDns`].OutputValue' --output text)/auth/"