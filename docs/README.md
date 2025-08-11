# TIR Browser Sample App Documentation

This folder contains comprehensive documentation for the TIR Browser Sample Application.

## Documentation Index

### 📚 Core Documentation

- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference with OpenAPI/Swagger specifications
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Detailed implementation guide and architecture overview
- **[VPN Docker Setup](VPN_DOCKER_SETUP.md)** - VPN connectivity setup for accessing development services

### 🏗️ Architecture & Standards

The sample application demonstrates:

- ✅ **Correlation ID Management** - Exact TIR Browser format implementation
- ✅ **Structured Logging** - JSON format with Loki integration and file fallback
- ✅ **Service Authentication** - JWT-based service-to-service communication
- ✅ **Health Checks** - ALB-compatible endpoints for container orchestration
- ✅ **Configuration Management** - .env as single source of truth
- ✅ **Docker Optimization** - Multi-stage builds for AWS Fargate
- ✅ **CDK Infrastructure** - Complete AWS deployment automation

### 🚀 Quick Navigation

| Topic | Document | Description |
|-------|----------|-------------|
| **API Endpoints** | [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | Interactive Swagger UI, endpoint specifications |
| **Implementation Details** | [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | Complete feature list, file structure, standards compliance |
| **VPN Setup** | [VPN_DOCKER_SETUP.md](VPN_DOCKER_SETUP.md) | Docker VPN configuration for development services |

### 📋 Usage

Each document is self-contained and includes:
- Step-by-step instructions
- Code examples
- Troubleshooting guides
- Best practices

### 🔗 Related Files

- **[../README.md](../README.md)** - Main project README with quick start guide
- **[../.env.example](../.env.example)** - Environment configuration template
- **[../package.json](../package.json)** - Project dependencies and scripts

---

**Note**: This documentation serves as the reference for all TIR Browser Platform microservices development.