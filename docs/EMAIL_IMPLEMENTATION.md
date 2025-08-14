# Email Implementation with SES and Handlebars Templates

This document describes the email implementation for the TIR Browser Platform using AWS SES (Simple Email Service) and Handlebars templates stored in S3.

## Overview

The email system supports:
- **Multiple languages**: English (en), Turkish (tr), Azerbaijani (az)
- **Template-based emails**: Welcome, verification, password reset, password changed
- **S3 template storage**: Templates are stored in S3 and cached locally
- **SES integration**: Direct email sending via AWS SES
- **User language preferences**: Automatic language selection based on user profile

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Request   │───▶│  Email Service  │───▶│   AWS SES       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   S3 Templates  │
                       └─────────────────┘
```

## Configuration

### Environment Variables

```bash
# S3 Configuration
NOTIFICATION_TEMPLATES_BUCKET=tir-browser-notification-templates-140729424382

# SES Configuration
SES_CONFIGURATION_SET_NAME=tirgpt-com-email-config
SES_FROM_EMAIL=noreply@tirgpt.com

# AWS Configuration
AWS_REGION=eu-central-1
```

### S3 Bucket Structure

```
tir-browser-notification-templates-140729424382/
├── auth/
│   ├── email/
│   │   ├── en/
│   │   │   ├── welcome.hbs
│   │   │   ├── verification.hbs
│   │   │   ├── password-reset.hbs
│   │   │   └── password-changed.hbs
│   │   ├── tr/
│   │   │   ├── welcome.hbs
│   │   │   ├── verification.hbs
│   │   │   ├── password-reset.hbs
│   │   │   └── password-changed.hbs
│   │   └── az/
│   │       ├── welcome.hbs
│   │       ├── verification.hbs
│   │       ├── password-reset.hbs
│   │       └── password-changed.hbs
│   └── sms/
│       ├── tr/
│       └── az/
```

## API Endpoints

### Automatic Email Integration

The email service is automatically integrated into the following auth flows:

#### 1. User Registration (`POST /api/register`)
- **Trigger**: When a new user registers
- **Email Type**: Welcome email
- **Language**: Based on user's country/language preference
- **Template Data**: firstName, email, userType, company, verificationUrl

#### 2. Password Reset Request (`POST /api/forgot-password`)
- **Trigger**: When user requests password reset
- **Email Type**: Password reset email
- **Language**: Based on user's language preference
- **Template Data**: firstName, resetUrl, expiryHours

#### 3. Resend Verification (`POST /api/resend-verification`)
- **Trigger**: When user requests verification code resend
- **Email Type**: Verification email
- **Language**: Based on user's language preference
- **Template Data**: firstName, verificationUrl, verificationCode, expiryHours

#### 4. Password Reset Completion (`POST /api/reset-password`)
- **Trigger**: When user successfully resets password
- **Email Type**: Password changed confirmation email
- **Language**: Based on user's language preference
- **Template Data**: firstName

### Update Language Preference

**PUT** `/api/profile/language`

Update user's language preference for email notifications.

**Request Body:**
```json
{
  "language": "tr"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "profile": {
      "firstName": "John",
      "language": "tr",
      "country": "TR"
    }
  },
  "correlationId": "corr-123",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Template Types

### 1. Welcome Email (`welcome`)
- **Purpose**: Sent when a user first registers
- **Required Data**: `firstName`, `email`, `userType`, `verificationUrl`, `expiryHours`
- **Optional Data**: `company`

### 2. Verification Email (`verification`)
- **Purpose**: Email address verification
- **Required Data**: `firstName`, `verificationUrl`, `verificationCode`, `expiryHours`
- **Optional Data**: None

### 3. Password Reset Email (`password-reset`)
- **Purpose**: Password reset request
- **Required Data**: `firstName`, `resetUrl`, `expiryHours`
- **Optional Data**: None

### 4. Password Changed Email (`password-changed`)
- **Purpose**: Confirmation of password change
- **Required Data**: `firstName`
- **Optional Data**: None

## Template Variables

### Common Variables
- `{{firstName}}` - User's first name
- `{{email}}` - User's email address
- `{{userType}}` - Type of user (shipper, carrier, etc.)
- `{{company}}` - Company name (optional)

### Welcome Template
- `{{verificationUrl}}` - Email verification link
- `{{expiryHours}}` - Hours until link expires

### Verification Template
- `{{verificationUrl}}` - Email verification link
- `{{verificationCode}}` - Verification code
- `{{expiryHours}}` - Hours until link expires

### Password Reset Template
- `{{resetUrl}}` - Password reset link
- `{{expiryHours}}` - Hours until link expires

## Language Support

### Supported Languages
- **en** - English (default)
- **tr** - Turkish
- **az** - Azerbaijani

### Language Selection Logic
1. **Explicit**: Language specified in API request
2. **User Preference**: Language from user profile
3. **Country-based**: Default language based on user's country
4. **Fallback**: English (en)

### Country-Language Mapping
```javascript
const countryLanguageMap = {
    'TR': 'tr',
    'AZ': 'az',
    'US': 'en',
    'GB': 'en',
    'CA': 'en'
};
```

## Implementation Details

### Email Service (`src/services/email.js`)

The email service provides:
- Template caching (5-minute cache)
- S3 template retrieval
- SES email sending
- Language-specific template selection
- Error handling and logging

### Profile Service Updates (`src/services/profile.js`)

Enhanced with:
- Language preference storage
- Country-based language defaults
- Language preference update functionality

### API Routes (`src/routes/api.js`)

Enhanced endpoints:
- `PUT /api/profile/language` - Update language preference

Email service is automatically integrated into existing auth endpoints:
- `POST /api/register` - Sends welcome email
- `POST /api/forgot-password` - Sends password reset email
- `POST /api/resend-verification` - Sends verification email
- `POST /api/reset-password` - Sends password changed confirmation email

## Setup Instructions

### 1. AWS SES Setup
```bash
# Verify sender email in SES
aws ses verify-email-identity --email-address noreply@tirgpt.com

# Create configuration set
aws ses create-configuration-set --configuration-set-name tirgpt-com-email-config
```

### 2. S3 Bucket Setup
```bash
# Create bucket (if not exists)
aws s3 mb s3://tir-browser-notification-templates-140729424382

# Upload templates
aws s3 sync templates/ s3://tir-browser-notification-templates-140729424382/
```

### 3. IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::tir-browser-notification-templates-140729424382/*"
    }
  ]
}
```

### 4. Environment Variables
```bash
export NOTIFICATION_TEMPLATES_BUCKET=tir-browser-notification-templates-140729424382
export SES_CONFIGURATION_SET_NAME=tirgpt-com-email-config
export SES_FROM_EMAIL=noreply@tirgpt.com
export AWS_REGION=eu-central-1
```

## Testing

### Run Test Script
```bash
node test-email.js
```

### Test API Endpoints
```bash
# Test user registration (triggers welcome email)
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userType": "shipper",
    "email": "test@example.com",
    "password": "TestPassword123!",
    "profile": {
      "firstName": "John",
      "country": "TR"
    }
  }'

# Test password reset request (triggers password reset email)
curl -X POST http://localhost:3000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Update language preference
curl -X PUT http://localhost:3000/api/profile/language \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"language": "tr"}'
```

## Error Handling

### Common Errors
- **Template not found**: Template file missing from S3
- **Invalid email format**: Malformed email address
- **SES sending failed**: AWS SES configuration issues
- **Profile not found**: User profile doesn't exist

### Error Response Format
```json
{
  "error": "Error description",
  "details": "Additional error details",
  "correlationId": "corr-123",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Monitoring and Logging

### Business Events
- `EMAIL_SENT` - Email sent successfully
- `LANGUAGE_PREFERENCE_UPDATED` - User language preference updated

### Log Fields
- `messageId` - SES message ID
- `templatePath` - S3 template path
- `language` - Email language
- `templateType` - Type of email template
- `userId` - User ID (if authenticated)

## Future Enhancements

1. **Template Versioning**: Support for template versions
2. **A/B Testing**: Template variant testing
3. **Email Analytics**: Open/click tracking
4. **Bulk Email**: Batch email sending
5. **Template Editor**: Web-based template editor
6. **Dynamic Content**: Real-time content injection
7. **Email Scheduling**: Delayed email sending
8. **Unsubscribe Management**: Email preference management
