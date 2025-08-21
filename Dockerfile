# TIR Browser Platform - auth Service Dockerfile
# Multi-stage build optimized for AWS Fargate deployment

# Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:22-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Create log directory with proper permissions
RUN mkdir -p /var/log/tir && mkdir -p /app/logs && chown -R nodejs:nodejs /var/log/tir && chown -R nodejs:nodejs /app/logs

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs package*.json ./

# Set environment variables
ENV SERVICE_NAME=auth
ENV SERVICE_VERSION=1.0.0
ENV PORT=3000
ENV NODE_ENV=development
ENV LOG_LEVEL=debug

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/ready', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "src/app.js"]