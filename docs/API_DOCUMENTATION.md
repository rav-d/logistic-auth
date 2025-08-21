# TIR Browser Sample API Documentation

## Overview

This API implements OpenAPI/Swagger 3.0 specification with code-first generation for the TIR Browser Platform reference implementation.

## Access Documentation

### Interactive Documentation
- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/api-docs.json

### Authentication

#### User Authentication (External APIs)
```bash
Authorization: Bearer <jwt-token>
```
- Uses AWS Cognito JWT tokens
- Required for all `/api/*` endpoints

#### Service Authentication (Internal APIs)
```bash
X-Service-Token: <service-jwt-token>
```
- Uses internal JWT tokens for service-to-service communication
- Required for internal endpoints like driver prioritization

## API Endpoints

### Health Endpoints
- `GET /health` - Basic health check
- `GET /ready` - Readiness check for ALB
- `GET /status` - Detailed status information
- `GET /vpn-test` - VPN connectivity test

### Business Endpoints

#### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get user orders
- `PUT /api/orders/{orderId}/status` - Update order status

#### Drivers
- `POST /api/drivers` - Register new driver
- `GET /api/drivers/prioritization/{orderId}` - Get driver prioritization (service-only)

## Code-First Documentation

### Adding New Endpoints

1. **Add JSDoc annotations** to route handlers:
```javascript
/**
 * @swagger
 * /api/new-endpoint:
 *   post:
 *     summary: Brief description
 *     tags: [TagName]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
```

2. **Documentation auto-updates** when server restarts

### Schema Definitions

Common schemas are defined in `src/config/swagger.js`:
- `Error` - Standard error response
- `SuccessResponse` - Standard success response

## Development Workflow

### Generate Static Documentation
```bash
npm run docs:generate
```

### View Documentation
```bash
# Start development server
npm run dev

# Open browser
open http://localhost:3000/api-docs
```

### Validate API Changes
The Swagger UI provides:
- Interactive testing interface
- Request/response validation
- Schema validation
- Authentication testing


## Best Practices

1. **Keep annotations close to code** - Documentation stays in sync
2. **Use consistent tags** - Groups related endpoints
3. **Define reusable schemas** - Reduces duplication
4. **Include examples** - Helps API consumers
5. **Document error responses** - Complete API contract

## Integration with TIR Browser Standards

- **Correlation ID**: All responses include `correlationId`
- **Timestamps**: ISO 8601 format timestamps
- **Error Format**: Consistent error response structure
- **Authentication**: Supports both user and service authentication
- **Logging**: All API calls logged with business events