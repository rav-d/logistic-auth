# Dynamic Configuration Guide

## Overview

The TIR Browser Platform uses a **hybrid configuration approach** combining static `.env` files with dynamic DynamoDB-based configuration for runtime behavior control.

## Configuration Hierarchy

### 1. Static Configuration (.env)
- **Service identity**: SERVICE_NAME, SERVICE_VERSION
- **Infrastructure endpoints**: Database URLs, service URLs
- **Security credentials**: Secret ARNs, API keys
- **Deployment settings**: Environment, region

### 2. Dynamic Configuration (DynamoDB)
- **Runtime behavior**: Log levels, timeouts, retry counts
- **Feature flags**: Enable/disable features without deployment
- **Performance tuning**: Connection pool sizes, cache TTL
- **Operational controls**: Debug modes, maintenance flags

## DynamoDB Table Structure

```
Table: tir-browser-config
Partition Key: service (String)     # "auth" or "global"
Sort Key: config_key (String)       # "LOG_LEVEL", "FEATURE_ENHANCED_LOGGING"
Attributes:
- value (String)                    # "debug", "true", "5000"
- updated_at (String)               # ISO timestamp
- updated_by (String)               # "admin" or service name
```

## Configuration Fallback Chain

```
1. DynamoDB (service-specific) → auth:LOG_LEVEL
2. DynamoDB (global)          → global:LOG_LEVEL  
3. Environment Variable       → process.env.LOG_LEVEL
4. Default Value             → 'info'
```

## Usage Examples

### Basic Configuration Access

```javascript
const { getConfigService } = require('./services/config');

const config = getConfigService();

// Get log level with fallback chain
const logLevel = await config.get('LOG_LEVEL', 'info');

// Get feature flag
const enhancedLogging = await config.getFeatureFlag('ENHANCED_LOGGING');

// Get timeout value
const apiTimeout = await config.getTimeout('API'); // Gets API_TIMEOUT_MS
```

### Listening for Configuration Changes

```javascript
const { onConfigChange } = require('./services/config');

// Logger updates automatically when LOG_LEVEL changes
onConfigChange('LOG_LEVEL', () => {
    logger.updateLogLevel();
});

// API client updates timeout
onConfigChange('API_TIMEOUT_MS', () => {
    httpClient.updateTimeout();
});

// Feature manager refreshes flags
onConfigChange('FEATURE_ENHANCED_LOGGING', () => {
    featureManager.refreshFlags();
});
```

## DynamoDB Configuration Examples

### Service-Specific Configuration

```json
{
  "service": "auth",
  "config_key": "LOG_LEVEL",
  "value": "debug",
  "updated_at": "2024-01-15T10:30:00Z",
  "updated_by": "admin"
}
```

### Global Configuration (Fallback)

```json
{
  "service": "global",
  "config_key": "LOG_LEVEL", 
  "value": "info",
  "updated_at": "2024-01-15T10:30:00Z",
  "updated_by": "platform-team"
}
```

### Feature Flag

```json
{
  "service": "auth",
  "config_key": "FEATURE_ENHANCED_LOGGING",
  "value": "true",
  "updated_at": "2024-01-15T10:30:00Z",
  "updated_by": "admin"
}
```

## Managing Configuration

### AWS CLI Commands

```bash
# Set log level for auth
aws dynamodb put-item \
  --table-name tir-browser-config \
  --item '{
    "service": {"S": "auth"},
    "config_key": {"S": "LOG_LEVEL"},
    "value": {"S": "debug"},
    "updated_at": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "updated_by": {"S": "admin"}
  }'

# Set global default
aws dynamodb put-item \
  --table-name tir-browser-config \
  --item '{
    "service": {"S": "global"},
    "config_key": {"S": "LOG_LEVEL"},
    "value": {"S": "info"},
    "updated_at": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "updated_by": {"S": "platform-team"}
  }'

# Get current configuration
aws dynamodb query \
  --table-name tir-browser-config \
  --key-condition-expression "service = :service" \
  --expression-attribute-values '{":service": {"S": "auth"}}'
```

### Developer Access

Developers have read/write access to the configuration table via IAM policy:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:Query",
    "dynamodb:GetItem", 
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem"
  ],
  "Resource": "arn:aws:dynamodb:region:account:table/tir-browser-config"
}
```

## Refresh Behavior

- **Refresh Interval**: 30 seconds
- **Change Detection**: Automatic notification to registered listeners
- **Update Propagation**: 0-30 seconds for all service instances
- **Error Handling**: Continues using cached values on DynamoDB failures

## Common Configuration Keys

### Logging
- `LOG_LEVEL`: debug, info, warn, error
- `FEATURE_ENHANCED_LOGGING`: true/false

### Performance
- `API_TIMEOUT_MS`: Milliseconds for API calls
- `DB_POOL_SIZE`: Database connection pool size
- `CACHE_TTL_SECONDS`: Cache time-to-live

### Feature Flags
- `FEATURE_NEW_UI`: Enable new user interface
- `FEATURE_BETA_ENDPOINTS`: Enable beta API endpoints
- `FEATURE_ENHANCED_METRICS`: Enable detailed metrics

### Operational
- `MAINTENANCE_MODE`: true/false
- `DEBUG_MODE`: true/false
- `MAX_RETRY_ATTEMPTS`: Number of retry attempts

## Best Practices

### Configuration Design
- ✅ **Use descriptive keys**: `API_TIMEOUT_MS` not `TIMEOUT`
- ✅ **Include units**: `_MS`, `_SECONDS`, `_COUNT` suffixes
- ✅ **Boolean strings**: Use "true"/"false" strings
- ✅ **Consistent naming**: Follow UPPER_SNAKE_CASE

### Operational
- ✅ **Test changes**: Verify in development first
- ✅ **Document changes**: Include reason in `updated_by`
- ✅ **Monitor impact**: Watch logs after configuration changes
- ✅ **Rollback plan**: Keep previous values for quick revert

### Development
- ✅ **Graceful degradation**: Always provide sensible defaults
- ✅ **Type validation**: Parse and validate configuration values
- ✅ **Error handling**: Handle DynamoDB failures gracefully
- ✅ **Local development**: Use `.env` for local overrides

## Troubleshooting

### Configuration Not Updating

```bash
# Check DynamoDB table
aws dynamodb scan --table-name tir-browser-config

# Check service logs
docker logs tir-auth | grep "config"

# Verify permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::account:role/task-role \
  --action-names dynamodb:Query \
  --resource-arns arn:aws:dynamodb:region:account:table/tir-browser-config
```

### Service Not Responding to Changes

```bash
# Check config service initialization
grep "ConfigService" /var/log/tir/auth-main.log

# Verify listener registration
grep "onConfigChange" /var/log/tir/auth-main.log

# Check refresh interval
grep "refresh" /var/log/tir/auth-main.log
```

---

This dynamic configuration system provides operational flexibility while maintaining the simplicity of `.env` files for static configuration.