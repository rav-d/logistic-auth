# TIR Browser Authentication Service

## 🚀 Boilerplate Status
**This is a template microservice** with complete infrastructure already implemented:
- ✅ **Logging**: Winston with structured JSON, correlation IDs, Loki integration
- ✅ **Metrics**: Prometheus metrics (technical + business), `/metrics` endpoint
- ✅ **Documentation**: Swagger/OpenAPI 3.0 at `/api-docs`
- ✅ **Authentication**: Service-to-service JWT auth, user auth middleware
- ✅ **Health Checks**: `/health`, `/ready`, `/status`, `/live` endpoints
- ✅ **Infrastructure**: Docker, CDK deployment, auto-scaling, ALB integration
- ✅ **Local Stack**: Docker Compose with Promtail, Loki, Grafana, VPN connectivity testing

**Your task**: Implement authentication business logic using the existing infrastructure patterns.

## 🔐 AWS Cognito Integration
**Leverage existing Cognito setup for core authentication, implement custom business logic:**

**✅ Cognito Handles:**
- User registration (email/password) with validation
- Email verification and token management
- Password security (hashing, complexity, reset flows)
- JWT token lifecycle (generation, validation, refresh)
- Session management and token expiration
- Account security (lockouts, suspicious activity)
- OAuth integration (if needed)

**🔧 Custom Implementation Required:**
- Polymorphic user profiles (Provider/Driver/Internal types)
- RBAC system (roles, permissions, resource access)
- Company-driver relationships and business associations
- User management APIs (admin CRUD operations)
- Audit logging for business events and compliance
- Custom user attributes (licenses, company data, internal roles)

---

Core authentication and authorization microservice for the TIR Browser logistics platform. Handles user management for three distinct user types: Providers (goods owners), Drivers (TIR drivers), and Internal Admin users with comprehensive RBAC system.



## ⚠️ Critical Design Requirements

### Stateless Architecture
**The service MUST be completely stateless** - multiple instances run in parallel with auto-scaling. All state must be stored externally:

- **Primary Storage**: DynamoDB for all user data, authentication, and authorization
- **PostgreSQL**: Only if specific requirements cannot be justified with DynamoDB (complex transactions, advanced querying needs)
- **No Shared In-Memory State**: No session storage, user data, or cross-request state in memory
- **Local Memory OK**: Configuration cache, connection pools, static data that doesn't vary between requests
- **Idempotent Operations**: All endpoints must handle duplicate requests safely

#### What's Allowed in Memory:
✅ **Safe to cache locally:**
- Configuration values (loaded once at startup)
- Database connection pools
- JWT public keys for validation
- Static templates or lookup data
- Request-scoped variables (cleared after response)

❌ **Never store in memory:**
- User session data
- Notification status or history
- Rate limiting counters
- Any data that affects other service instances

#### Idempotent Operations Explained:
**Idempotent** = Same request can be called multiple times with same result

**Example:** Sending notification with ID `notif-123`
- ✅ **Idempotent**: Check if `notif-123` already sent → if yes, return success without resending
- ❌ **Not Idempotent**: Always send notification → duplicate messages if request retried

**Implementation:** Use unique request IDs, check DynamoDB before processing, store results

### Comprehensive Logging & Monitoring
**Structured logging is mandatory at every stage:**

#### Logging Requirements:
- **Debug Level**: Request/response payloads, database queries, external API calls, token validation steps
- **Info Level**: User actions (login, registration, role changes), authentication events, permission checks
- **Warn Level**: Failed login attempts, rate limit hits, suspicious activities
- **Error Level**: Authentication failures, database errors, system exceptions
- **Correlation ID**: Must be present in every log entry for request tracing

#### Prometheus Metrics (Required):
**Technical Metrics:**
- `auth_requests_total{method, endpoint, status}` - HTTP request counters
- `auth_request_duration_seconds{method, endpoint}` - Request latency histogram
- `auth_database_operations_total{operation, table, status}` - DynamoDB operation counters
- `auth_jwt_operations_total{operation, status}` - JWT generation/validation counters
- `auth_active_sessions_gauge` - Current active user sessions

**Business Metrics:**
- `auth_user_registrations_total{user_type}` - New user registrations by type
- `auth_login_attempts_total{user_type, status}` - Login attempts (success/failure)
- `auth_password_resets_total{user_type}` - Password reset requests
- `auth_role_assignments_total{role}` - Role assignment operations
- `auth_failed_permissions_total{resource, action}` - Permission denial counters

#### API Documentation:
- **Swagger/OpenAPI 3.0**: Complete API documentation with examples
- **Authentication flows**: Detailed documentation for each user type
- **Error responses**: Standardized error codes and messages
- **Rate limiting**: Document limits and headers
- **RBAC examples**: Permission matrix and role definitions

### Version Management & Deployment
**Critical for CDK redeployment** - update BOTH files when releasing:

1. **`package.json`**: Update `version` field
2. **`.env`**: Update `SERVICE_VERSION` variable

**Versioning Rules (Semantic Versioning):**
- **Start with**: `1.0.0`
- **Patch** (1.0.1): Bug fixes, small changes
- **Minor** (1.1.0): New features, backward compatible
- **Major** (2.0.0): Breaking changes, API changes

**Example increment:**
```bash
# Bug fix
npm version patch  # 1.0.0 → 1.0.1

# New feature
npm version minor  # 1.0.1 → 1.1.0

# Breaking change
npm version major  # 1.1.0 → 2.0.0
```

Using `npm version` functionality is preferred because it automatically creates a git commit and a git tag. Otherwise you must do it manually.

The version is used in ECR image path - without version change, CDK won't redeploy containers.



## Quick Start


1. **Install dependencies:**
   ```bash
   npm install
   cd cdk && npm install
   ```

2. **Local development**
```bash
# Local development
npm run dev

# Run tests
npm test

# Build Docker image
docker build -t tir-browser-auth .

# Local Docker Compose
docker-compose up
```


3. **Deploy to AWS:**
   ```bash
   ./deploy.sh
   ```

## Technical Functional Requirements

### Core Authentication System
- **Email-Based Authentication**: Email/password for all user types (Providers, Drivers, Admin)
- **JWT Token Management**: Secure token generation, validation, refresh, and revocation
- **Password Management**: Secure hashing (bcrypt), reset flows, complexity validation
- **Email Verification**: Automated verification flows with secure token generation
- **Session Management**: Stateless JWT-based sessions with configurable expiration

### Polymorphic User Profiles
**Three distinct user types with different data models:**

#### 1. Providers (Goods Owners)
- Company profile management (name, address, tax ID, certifications)
- Multiple user accounts per company
- Email-based registration and OAuth integration
- Business verification status
- Shipping preferences and default routes

#### 2. Drivers (TIR Drivers)
- Personal profile (name, email, phone, license details)
- Email as primary identifier
- Email-based authentication
- Company association (multiple drivers per company)
- Driver license validation and expiration tracking
- Vehicle information and certifications
- Availability status

#### 3. Internal Users (Admin/Staff)
- Role-based access levels (Admin, Support, Operations)
- Internal email domain validation (no email verification required)
- Advanced permissions for platform management
- Audit trail access and user management capabilities

### Role-Based Access Control (RBAC)
**Hierarchical permission system:**

#### Permission Levels:
- **Super Admin**: Full platform access, user management, system configuration
- **Admin**: User management, content moderation, reporting
- **Support**: User assistance, limited data access, ticket management
- **Provider Manager**: Company account management, user creation within organization
- **Provider User**: Standard provider functionality, shipment management
- **Driver**: Route access, shipment acceptance, profile management
- **Guest**: Limited read-only access for public information

#### Resource-Based Permissions:
- **Users**: Create, read, update, delete, suspend, verify
- **Companies**: Manage profiles, verify business status, assign users
- **Routes**: View, create, modify, assign drivers
- **Shipments**: Create, track, modify, cancel, complete
- **Reports**: Generate, view, export different data sets
- **System**: Configuration, monitoring, audit logs

### Security Implementation
- **Input Validation**: Comprehensive sanitization and validation for all endpoints
- **Rate Limiting**: Configurable limits per user type and endpoint
- **Audit Logging**: Complete audit trail for all authentication and authorization events
- **Password Security**: Bcrypt hashing, complexity requirements, breach detection
- **Account Security**: Lockout policies, suspicious activity detection, device tracking

### ID Generation Strategy
**Human-readable IDs for documents and business operations:**

**ID Formats:**
- **`user_id`**: `U-{timestamp}-{random}` (e.g., `U-1705312200-k2j8h9x3q`)
- **`driver_id`**: `D-{country}-{YYMMDD}-{random}` (e.g., `D-AZ-240115-X7Y8Z9`)
- **`provider_id`**: `P-{country}-{YYMMDD}-{random}` (e.g., `P-TR-240115-M2N5P8`)

**Generation Logic:**
```javascript
function generateUserId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `U-${timestamp}-${random}`;
}

function generateDriverId(country) {
    const date = new Date().toISOString().slice(2,10).replace(/-/g,''); // YYMMDD
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `D-${country}-${date}-${random}`;
}

function generateProviderId(country) {
    const date = new Date().toISOString().slice(2,10).replace(/-/g,''); // YYMMDD
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `P-${country}-${date}-${random}`;
}
```

**Benefits:**
- **Collision-safe** across multiple service instances
- **Human-readable** for documents and customer support
- **Country-aware** for TIR compliance and regional operations
- **Date-sortable** for chronological ordering and reporting
- **Distributed-safe** for auto-scaling environments

### Database Schema Requirements
**Primary Storage: DynamoDB** - Optimized single-table design for cost efficiency and performance.

**Single-Table DynamoDB Design:**
- **`tir-auth-main`** - Primary table containing all business data:
  - User profiles (all types: Provider, Driver, Internal)
  - Role assignments and permissions
  - Company information (Provider companies, Shipping companies)
  - Driver employment relationships
  - Role and permission definitions

**Key Benefits:**
- **90% cost reduction** compared to multi-table approach
- **Single-query access** patterns for related data
- **Efficient GSI usage** for essential lookups (Cognito sub)
- **Country-based filtering** for TIR compliance

**Detailed Schema:** See [dynamodb-schema.md](./dynamodb-schema.md) for complete table structure, data patterns, and query examples.

**Integration with AWS Cognito:**
- Cognito handles: Authentication, JWT tokens, password management, email verification
- DynamoDB stores: Business profiles, roles, permissions, company relationships
- Audit logs: Structured logging to files (not stored in DynamoDB)


### API Requirements
**Authentication Endpoints:**
- `POST /auth/register` - Multi-type user registration
- `POST /auth/login` - Unified login with type detection
- `POST /auth/logout` - Session termination
- `POST /auth/refresh` - JWT token refresh
- `POST /auth/forgot-password` - Password reset initiation
- `POST /auth/reset-password` - Password reset completion
- `POST /auth/verify-email` - Email verification


**User Management Endpoints:**
- `GET /users/profile` - Get current user profile
- `PUT /users/profile` - Update user profile
- `GET /users/:id` - Get user details (admin)
- `PUT /users/:id` - Update user (admin)
- `DELETE /users/:id` - Soft delete user (admin)
- `POST /users/:id/suspend` - Suspend user account
- `POST /users/:id/activate` - Activate user account

**Role Management Endpoints:**
- `GET /roles` - List available roles
- `POST /users/:id/roles` - Assign role to user
- `DELETE /users/:id/roles/:roleId` - Remove role from user
- `GET /permissions` - List all permissions
- `GET /users/:id/permissions` - Get effective user permissions

## Features

- **TIR Browser Standards Compliance**: Implements mandatory logging and authentication patterns
- **Correlation ID Tracking**: Automatic correlation ID generation and propagation
- **Dynamic Configuration**: DynamoDB-based config with automatic refresh and fallback to environment variables
- **Service Authentication**: JWT-based service-to-service authentication
- **User Authentication**: AWS Cognito integration with custom user management
- **Structured Logging**: Winston with Loki integration
- **Health Checks**: Kubernetes-ready health endpoints
- **Auto Scaling**: CPU-based scaling configuration
- **Security**: Helmet, CORS, and security best practices

## Implementation Deliverables

### Phase 1: Core Authentication (Week 1-2)
- [ ] User registration system for all three user types
- [ ] Login/logout functionality with JWT tokens
- [ ] Password management (hashing, validation, reset)
- [ ] Email verification system
- [ ] Basic user profile management

### Phase 2: RBAC System (Week 2-3)
- [ ] Role and permission management system
- [ ] User-role assignment functionality
- [ ] Permission-based route protection
- [ ] Admin user management APIs
- [ ] Audit logging for all auth events

### Phase 3: Advanced Features (Week 3-4)
- [ ] Polymorphic user profile system
- [ ] Company management for providers
- [ ] Driver license validation
- [ ] Rate limiting and security hardening
- [ ] Account lockout and suspicious activity detection

### Phase 4: Integration & Testing (Week 4-6)
- [ ] Complete API documentation (Swagger/OpenAPI)
- [ ] Comprehensive unit and integration tests
- [ ] Database migrations and seed data
- [ ] Docker containerization
- [ ] AWS CDK deployment configuration
- [ ] Performance testing and optimization

## API Endpoints

### Public Endpoints
- `GET /` - Service information
- `GET /health` - Health check
- `GET /ready` - Readiness check
- `GET /status` - Detailed status
- `GET /metrics` - Prometheus metrics
- `GET /api-docs` - Swagger documentation

### Authentication Endpoints
- `POST /auth/register` - User registration (all types)
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Token refresh
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Password reset completion
- `POST /auth/verify-email` - Email verification


### User Management Endpoints (Protected)
- `GET /users/profile` - Current user profile
- `PUT /users/profile` - Update profile
- `GET /users/:id` - User details (admin only)
- `PUT /users/:id` - Update user (admin only)
- `DELETE /users/:id` - Delete user (admin only)
- `POST /users/:id/suspend` - Suspend account
- `POST /users/:id/activate` - Activate account

### Role Management Endpoints (Admin Only)
- `GET /roles` - List all roles
- `POST /roles` - Create new role
- `PUT /roles/:id` - Update role definition
- `DELETE /roles/:id` - Delete role
- `GET /permissions` - List all permissions
- `POST /roles/:id/permissions` - Assign permissions to role
- `DELETE /roles/:id/permissions/:permissionId` - Remove permission from role
- `POST /users/:id/roles` - Assign role to user
- `DELETE /users/:id/roles/:roleId` - Remove role from user
- `GET /users/:id/permissions` - Get effective user permissions


## Deployment

The service deploys to AWS Fargate with:
- Development: Shared ALB with path-based routing
- Production: Individual ALB per service
- Auto-scaling based on CPU utilization
- CloudWatch logging with 1-day retention

## Configuration

Key environment variables:
- `SERVICE_SECRET_ARN` - AWS Secrets Manager ARN for service authentication
- `COGNITO_USER_POOL_ID` - AWS Cognito User Pool ID
- `CONFIG_TABLE_NAME` - DynamoDB table for dynamic configuration
- `NODE_ENV` - Environment (development/production)

**Dynamic Configuration**: Runtime behavior can be controlled via DynamoDB table:
- **Static config** (.env): Service identity, endpoints, secrets
- **Dynamic config** (DynamoDB): Log levels, feature flags, timeouts
- **Automatic refresh**: Changes take effect within 30 seconds
- **Fallback chain**: DynamoDB → Environment Variable → Default Value

See `.env` and `docs/DYNAMIC_CONFIGURATION.md` for complete configuration options.