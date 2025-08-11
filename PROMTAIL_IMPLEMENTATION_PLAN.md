# Promtail Sidecar Implementation Plan

## Overview
Switch from direct winston-loki transport to Promtail sidecar container with component-specific log files for each service component (main, auth-middleware, api-endpoints, etc.).

## Implementation Checklist

### 📁 Core Application Files

#### Logger Service
- [x] **`src/services/logger.js`** - Remove winston-loki transport, implement component-specific file logging
  - Remove LokiTransport dependency
  - Update file transport to use component-specific filenames: `/var/log/tir/auth-${component}.log`
  - Keep JSON format for Promtail parsing
  - Maintain correlation ID and structured logging

#### Dependencies
- [x] **`package.json`** - Remove winston-loki dependency
  - Remove `"winston-loki": "^6.1.3"` from dependencies
  - Update package-lock.json accordingly

#### Environment Configuration
- [x] **`.env`** - Remove Loki-specific variables, add log path config
  - Remove `LOKI_HOST` and `LOKI_REMOTE_URL` variables
  - Add `LOG_BASE_PATH=/var/log/tir` if needed

- [x] **`.env.example`** - Update example environment file
  - Remove Loki configuration examples
  - Add log path configuration examples

### 🐳 Docker Configuration

#### Application Container
- [x] **`Dockerfile`** - Update for sidecar pattern
  - Remove Loki-related environment variables
  - Ensure log directory creation and permissions
  - Remove direct Loki connectivity requirements

#### Local Development
- [x] **`docker-compose.yml`** - Add Promtail sidecar service
  - Add Promtail service definition
  - Configure shared volume for log files
  - Set up service dependencies
  - Update existing auth service for volume mounting

### ☁️ AWS CDK Infrastructure

#### Task Definition
- [x] **`cdk/stacks/auth-stack.ts`** - Implement sidecar pattern
  - Add shared volume for log files
  - Add Promtail container definition
  - Configure container dependencies
  - Update memory/CPU allocation for both containers
  - Remove direct Loki environment variables from app container

#### CDK Dependencies
- [x] **`cdk/package.json`** - Ensure CDK version supports multi-container tasks
  - Verify aws-cdk-lib version compatibility (aws-cdk-lib: ^2.206.0 supports multi-container)

### 📋 Configuration Files

#### Promtail Configuration
- [x] **`promtail/config.yml`** - Create Promtail configuration
  - Configure scrape_configs for component-specific files
  - Set up proper labeling (service, component, environment)
  - Configure Loki client connection
  - Set up file discovery patterns
  - Use standard grafana/promtail:3.2.0 image with mounted config

### 🧪 Testing Files

#### Unit Tests
- [x] **`tests/unit/correlation.test.js`** - Update tests for file-based logging
  - Remove Loki transport tests
  - Add file logging tests
  - Verify component-specific file creation

#### Integration Tests
- [x] **`tests/integration/health.test.js`** - Update integration tests
  - Remove Loki connectivity tests
  - Add log file verification tests

#### Test Configuration
- [x] **`tests/setup.js`** - Update test setup
  - Configure test log paths
  - Mock file system operations if needed

- [x] **`jest.config.js`** - Update Jest configuration if needed
  - Add test patterns for new files
  - Configure test environment variables

### 📚 Documentation

#### Main Documentation
- [x] **`README.md`** - Update for Promtail approach
  - Remove direct Loki configuration instructions
  - Add Promtail sidecar explanation
  - Update local development setup
  - Update deployment instructions

#### API Documentation
- [x] **`docs/API_DOCUMENTATION.md`** - Update logging references
  - Update logging approach description
  - Remove Loki-specific examples (No Loki-specific content found)

#### Implementation Summary
- [x] **`docs/IMPLEMENTATION_SUMMARY.md`** - Update architecture description
  - Update logging architecture section
  - Add Promtail sidecar pattern explanation
  - Update file structure documentation (Covered in PROMTAIL_SETUP.md)

#### VPN Documentation
- [x] **`docs/VPN_DOCKER_SETUP.md`** - Update for new docker-compose
  - Update service definitions
  - Add Promtail service information (Covered in PROMTAIL_SETUP.md)

### 🔧 Build and Deployment

#### Deployment Script
- [x] **`deploy.sh`** - Update deployment process
  - Remove Loki connectivity checks
  - Update health check validations
  - Ensure proper volume mounting in deployment

#### Docker Ignore
- [x] **`.dockerignore`** - Update ignore patterns
  - Add promtail configuration files to context
  - Exclude unnecessary log files

#### Git Ignore
- [x] **`.gitignore`** - Update ignore patterns
  - Ensure log files are ignored
  - Add promtail-specific temporary files

### 📁 New Files to Create

#### Promtail Configuration
- [x] **`promtail/config.yml`** - Main Promtail configuration

#### Log Directory Structure
- [x] **`logs/.gitkeep`** - Ensure logs directory exists in repository

#### Documentation
- [x] **`docs/PROMTAIL_SETUP.md`** - Promtail-specific documentation
  - Configuration explanation
  - Troubleshooting guide
  - Query examples for Grafana

### 🧹 Files to Remove/Clean

#### Cleanup Tasks
- [x] Remove winston-loki references from all source files
- [x] Clean up Loki-specific environment variables
- [x] Remove direct Loki transport configuration
- [x] Update all logging examples in documentation

### ✅ Validation Tasks

#### Testing Checklist
- [ ] **Local Development** - Verify docker-compose works with Promtail
- [ ] **Log File Creation** - Confirm component-specific files are created
- [ ] **Promtail Ingestion** - Verify logs reach Loki via Promtail
- [ ] **Grafana Queries** - Test log queries with new label structure
- [ ] **CDK Deployment** - Deploy and verify sidecar pattern works
- [ ] **Health Checks** - Ensure application health checks still work
- [ ] **Performance** - Verify no performance degradation

#### Rollback Plan
- [ ] **Backup Current Implementation** - Save current winston-loki setup
- [ ] **Feature Flag** - Consider feature flag for gradual rollout
- [ ] **Monitoring** - Set up alerts for logging pipeline health

## Implementation Order

1. **Phase 1: Core Changes** - Update logger.js and remove winston-loki
2. **Phase 2: Configuration** - Create Promtail config and update docker-compose
3. **Phase 3: CDK Updates** - Implement sidecar pattern in infrastructure
4. **Phase 4: Testing** - Update tests and validate functionality
5. **Phase 5: Documentation** - Update all documentation
6. **Phase 6: Deployment** - Deploy and validate in development environment

## Success Criteria

- ✅ All logs written to component-specific files
- ✅ Promtail successfully ingests logs to Loki
- ✅ Grafana queries work with new label structure
- ✅ No application performance impact
- ✅ Sidecar pattern works in both local and AWS environments
- ✅ All tests pass
- ✅ Documentation is complete and accurate

## Estimated Timeline

- **Core Implementation**: 1-2 days
- **Testing and Validation**: 1 day  
- **Documentation Updates**: 0.5 days
- **Total**: 2.5-3.5 days

---

**Note**: This plan maintains the existing structured logging format and correlation ID tracking while switching the transport mechanism from direct HTTP to file-based with Promtail sidecar.