// TIR Browser Platform - Swagger/OpenAPI Configuration
// Code-first API documentation generation

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TIR Browser auth Service API',
      version: '1.0.0',
      description: 'TIR Browser Platform auth service API',
      contact: {
        name: 'TIR Browser Platform Team',
        email: 'tirbrowser.dev@gmail.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.tirbrowser.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'AWS Cognito JWT token'
        },
        ServiceAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Service-Token',
          description: 'Service-to-service JWT token'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            correlationId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            correlationId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/**/*.js', './src/app.js']
};

module.exports = swaggerJsdoc(options);