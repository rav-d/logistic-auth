# Promtail Setup Guide

## Overview

This guide explains the Promtail sidecar implementation for the TIR Browser auth Service. Promtail collects component-specific log files and ships them to Loki for centralized logging.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth App    │    │    Promtail     │    │      Loki       │
│                 │    │    Sidecar      │    │                 │
│ Writes to files │───▶│ Reads files     │───▶│ Stores logs     │
│ /var/log/tir/   │    │ Ships to Loki   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Component-Specific Log Files

The application creates separate log files for each component:

- `/var/log/tir/auth-main.log` - Main application logs
- `/var/log/tir/auth-auth-middleware.log` - Authentication middleware
- `/var/log/tir/auth-api-middleware.log` - API logging middleware  
- `/var/log/tir/auth-health-endpoints.log` - Health check endpoints
- `/var/log/tir/auth-api-endpoints.log` - Business API endpoints
- `/var/log/tir/auth-service-client.log` - Service communication

## Promtail Configuration

### File: `promtail/config.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://internal-tir-loki-dev-lb-491379303.eu-central-1.elb.amazonaws.com:3100/loki/api/v1/push

scrape_configs:
  - job_name: auth-components
    static_configs:
      - targets:
          - localhost
        labels:
          job: auth
          service: auth
          environment: development
          __path__: /var/log/tir/auth-*.log
    
    pipeline_stages:
      # Extract component from filename
      - regex:
          expression: '/var/log/tir/auth-(?P<component>[^.]+)\.log'
      
      # Add component as label
      - labels:
          component:
      
      # Parse JSON log content
      - json:
          expressions:
            timestamp: timestamp
            level: level
            message: message
            correlationId: correlationId
            userId: userId
            service: service
            serviceVersion: serviceVersion
      
      # Set timestamp from log content
      - timestamp:
          source: timestamp
          format: RFC3339
```

## Docker Compose Setup

### Sidecar Configuration

```yaml
services:
  auth:
    # ... app configuration
    volumes:
      - log-volume:/var/log/tir

  promtail:
    image: grafana/promtail:3.2.0
    container_name: tir-promtail
    volumes:
      - log-volume:/var/log/tir:ro
      - ./promtail/config.yml:/etc/promtail/config.yml:ro
    depends_on:
      - auth
      - loki
    command: -config.file=/etc/promtail/config.yml

volumes:
  log-volume:
    driver: local
```

## AWS ECS/Fargate Setup

### Task Definition

```typescript
// Shared volume for logs
volumes: [{
  name: 'log-volume',
  host: {}
}]

// App container
const appContainer = taskDefinition.addContainer('app', {
  // ... app config
  mountPoints: [{
    sourceVolume: 'log-volume',
    containerPath: '/var/log/tir',
    readOnly: false
  }]
});

// Promtail sidecar
const promtailContainer = taskDefinition.addContainer('promtail', {
  image: ecs.ContainerImage.fromRegistry('grafana/promtail:3.2.0'),
  essential: false,
  mountPoints: [{
    sourceVolume: 'log-volume',
    containerPath: '/var/log/tir',
    readOnly: true
  }],
  command: ['-config.file=/etc/promtail/config.yml']
});
```

## Grafana Queries

### Query by Service
```
{service="auth"}
```

### Query by Component
```
{service="auth", component="api-endpoints"}
```

### Query by Correlation ID
```
{service="auth"} |= "cid-1703123456789-k2j8h9x3q"
```

### Query Business Events
```
{service="auth", component="api-endpoints"} | json | eventType="ORDER_CREATED"
```

### Query Errors
```
{service="auth"} | json | level="error"
```

## Troubleshooting

### Check Promtail Status
```bash
# Docker Compose
docker logs tir-promtail

# ECS
aws ecs describe-tasks --cluster <cluster> --tasks <task-arn>
```

### Verify Log Files
```bash
# Check if log files are created
ls -la /var/log/tir/

# Check log content
tail -f /var/log/tir/auth-api-endpoints.log
```

### Test Promtail Configuration
```bash
# Validate config syntax
promtail -config.file=promtail/config.yml -dry-run
```

### Common Issues

#### 1. No Log Files Created
- Check application permissions: `chown nodejs:nodejs /var/log/tir`
- Verify LOG_BASE_PATH environment variable
- Check logger initialization in application

#### 2. Promtail Not Shipping Logs
- Verify Loki URL in promtail config
- Check network connectivity to Loki
- Review Promtail logs for errors

#### 3. Missing Labels in Grafana
- Verify regex pattern in pipeline_stages
- Check filename format matches pattern
- Ensure JSON parsing is working

#### 4. Performance Issues
- Monitor log file sizes and rotation
- Check Promtail memory usage
- Verify batch settings in config

## Best Practices

### Log File Management
- Use log rotation (100MB max, 5 files)
- Monitor disk space usage
- Clean up old log files regularly

### Promtail Configuration
- Use appropriate batch sizes
- Set proper retry policies
- Monitor Promtail metrics

### Security
- Use read-only mounts for Promtail
- Secure Loki endpoint access
- Rotate log files to prevent data exposure

### Monitoring
- Set up alerts for Promtail failures
- Monitor log ingestion rates
- Track log file growth

## Migration from Direct Loki

### Changes Made
1. Removed `winston-loki` dependency
2. Updated logger to write component-specific files
3. Added Promtail sidecar container
4. Updated CDK for multi-container task
5. Modified docker-compose for shared volumes

### Benefits
- Better performance (no HTTP overhead per log)
- Improved reliability (file-based buffering)
- Component separation (easier debugging)
- Standard logging pattern (industry best practice)

---

This setup provides robust, scalable logging for the TIR Browser Platform while maintaining all existing correlation ID and structured logging features.