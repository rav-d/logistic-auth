# Optimized DynamoDB Schema for TIR Auth Service

## Table 1: `tir-auth-main` (Primary Data)

### Table Configuration
```json
{
  "TableName": "tir-auth-main",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "PK", "AttributeType": "S" },
    { "AttributeName": "SK", "AttributeType": "S" },
    { "AttributeName": "GSI1PK", "AttributeType": "S" },
    { "AttributeName": "GSI1SK", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "PK", "KeyType": "HASH" },
    { "AttributeName": "SK", "KeyType": "RANGE" }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "GSI1",
      "KeySchema": [
        { "AttributeName": "GSI1PK", "KeyType": "HASH" },
        { "AttributeName": "GSI1SK", "KeyType": "RANGE" }
      ],
      "Projection": { "ProjectionType": "ALL" }
    }
  ]
}
```

### Data Patterns

#### Driver User Profile
```json
{
  "PK": "USER#usr_123456789",
  "SK": "PROFILE#main",
  "GSI1PK": "COGNITO#cognito-uuid",
  "GSI1SK": "USER#usr_123456789",
  "user_type": "DRIVER",
  "cognito_sub": "cognito-uuid",
  "status": "ACTIVE",
  "country": "AZ",
  "profile_data": {
    "driver_id": "D-AZ-240115-X7Y8Z9",
    "full_name": "John Doe",
    "phone": "+994501234567",
    "license_number": "DL123456",
    "company_id": "comp_789" // Optional
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

#### Provider User Profile
```json
{
  "PK": "USER#usr_987654321",
  "SK": "PROFILE#main",
  "GSI1PK": "COGNITO#cognito-uuid-2",
  "GSI1SK": "USER#usr_987654321",
  "user_type": "PROVIDER",
  "cognito_sub": "cognito-uuid-2",
  "status": "ACTIVE",
  "country": "TR",
  "profile_data": {
    "provider_id": "P-TR-240115-M2N5P8",
    "full_name": "Jane Smith",
    "phone": "+90501234568",
    "company_id": "comp_456", // Optional - for legal entity
    "business_verification": "VERIFIED"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

#### Internal User Profile
```json
{
  "PK": "USER#usr_111222333",
  "SK": "PROFILE#main",
  "GSI1PK": "COGNITO#cognito-uuid-3",
  "GSI1SK": "USER#usr_111222333",
  "user_type": "INTERNAL",
  "cognito_sub": "cognito-uuid-3",
  "status": "ACTIVE",
  "profile_data": {
    "full_name": "Admin User",
    "department": "Operations",
    "employee_id": "EMP001",
    "access_level": "ADMIN"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

#### User Role Assignment
```json
{
  "PK": "USER#usr_123456789",
  "SK": "ROLE#driver",
  "role_name": "driver",
  "assigned_at": "2024-01-15T10:30:00Z",
  "assigned_by": "usr_admin123"
}
```

#### Shipping Company Profile
```json
{
  "PK": "COMPANY#comp_789",
  "SK": "PROFILE#main",
  "company_type": "SHIPPING",
  "company_name": "ABC Logistics",
  "license_number": "LOG123456",
  "address": "123 Main St, City",
  "contact_info": {
    "email": "contact@abclogistics.com",
    "phone": "+994501234567"
  }
}
```

#### Provider Company Profile
```json
{
  "PK": "COMPANY#comp_456",
  "SK": "PROFILE#main",
  "company_type": "PROVIDER",
  "company_name": "Global Trade Corp",
  "tax_id": "TAX789012",
  "address": "456 Business Ave, City",
  "certifications": ["ISO9001", "TIR_CERTIFIED"],
  "contact_info": {
    "email": "info@globaltrade.com",
    "phone": "+994501234569"
  }
}
```

#### Driver Employment
```json
{
  "PK": "COMPANY#comp_789",
  "SK": "DRIVER#drv_456789123",
  "driver_id": "drv_456789123",
  "employment_type": "FULL_TIME",
  "start_date": "2024-01-01",
  "status": "ACTIVE"
}
```

#### Role Definition
```json
{
  "PK": "ROLE#driver",
  "SK": "DEFINITION#main",
  "role_name": "driver",
  "description": "TIR driver with route access",
  "permissions": ["route:read", "shipment:accept", "profile:update"]
}
```

## Single Table Design

With Cognito handling authentication and logs going to files, only one DynamoDB table is needed for business data.



## Query Patterns

### Get User with Profile
```javascript
const params = {
  TableName: 'tir-auth-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'USER#usr_123456789',
    ':sk': 'PROFILE'
  }
};
```

### Find User by Cognito Sub
```javascript
const params = {
  TableName: 'tir-auth-main',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :cognito_sub',
  ExpressionAttributeValues: {
    ':cognito_sub': 'COGNITO#cognito-uuid'
  }
};
```

### Query Drivers by Country
```javascript
const params = {
  TableName: 'tir-auth-main',
  FilterExpression: 'user_type = :type AND country = :country',
  ExpressionAttributeValues: {
    ':type': 'DRIVER',
    ':country': 'AZ'
  }
};
```

### Get User Roles
```javascript
const params = {
  TableName: 'tir-auth-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'USER#usr_123456789',
    ':sk': 'ROLE#'
  }
};
```

### Get Company Drivers
```javascript
const params = {
  TableName: 'tir-auth-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'COMPANY#comp_789',
    ':sk': 'DRIVER#'
  }
};
```

## Implementation Notes

- Use composite keys (PK/SK) for hierarchical data
- Store related data together for single-query access
- Country as top-level attribute for efficient filtering
- GSI for Cognito sub lookup
- JSON attributes for flexible schema evolution