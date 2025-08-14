const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const Handlebars = require('handlebars');
const { getConfigService } = require('./config');
const logger = require('./logger');

class EmailService {
    constructor() {
        this.sesClient = new SESClient({ region: process.env.AWS_REGION || 'eu-central-1' });
        this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
        this.configService = getConfigService();
        this.templateCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    async getTemplate(templatePath) {
        const cacheKey = templatePath;
        const cached = this.templateCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.template;
        }

        try {
            const bucketName = await this.configService.get('NOTIFICATION_TEMPLATES_BUCKET', 'tir-browser-notification-templates-140729424382');
            
            const params = {
                Bucket: bucketName,
                Key: templatePath
            };

            const response = await this.s3Client.send(new GetObjectCommand(params));
            const templateContent = await response.Body.transformToString();
            
            const template = Handlebars.compile(templateContent);
            
            // Cache the template
            this.templateCache.set(cacheKey, {
                template,
                timestamp: Date.now()
            });

            logger.info(`Template loaded and cached: ${templatePath}`);
            return template;

        } catch (error) {
            logger.error(`Failed to load template ${templatePath}:`, error);
            throw new Error(`Template not found: ${templatePath}`);
        }
    }

    async sendEmail({ to, subject, templatePath, templateData, from = null }) {
        try {
            // Get the template
            const template = await this.getTemplate(templatePath);
            
            // Compile the template with data
            const htmlBody = template(templateData);
            
            // Get configuration
            const configurationSetName = await this.configService.get('SES_CONFIGURATION_SET_NAME', 'tirgpt-com-email-config');
            const defaultFrom = await this.configService.get('SES_FROM_EMAIL', 'noreply@tirgpt.com');
            
            const emailParams = {
                Source: from || defaultFrom,
                Destination: {
                    ToAddresses: Array.isArray(to) ? to : [to]
                },
                Message: {
                    Subject: {
                        Data: subject,
                        Charset: 'UTF-8'
                    },
                    Body: {
                        Html: {
                            Data: htmlBody,
                            Charset: 'UTF-8'
                        }
                    }
                },
                ConfigurationSetName: configurationSetName
            };

            const command = new SendEmailCommand(emailParams);
            const result = await this.sesClient.send(command);

            logger.info(`Email sent successfully to ${to}`, {
                messageId: result.MessageId,
                templatePath,
                subject
            });

            return {
                messageId: result.MessageId,
                success: true
            };

        } catch (error) {
            logger.error(`Failed to send email to ${to}:`, error);
            throw error;
        }
    }

    async sendAuthEmail({ to, templateType, templateData, language = 'en' }) {
        const templatePath = `auth/email/${language}/${templateType}.hbs`;
        
        const emailConfigs = {
            'welcome': {
                subject: 'Welcome to TIR Browser Platform',
                templatePath
            },
            'verification': {
                subject: 'Verify Your Email Address',
                templatePath
            },
            'password-reset': {
                subject: 'Password Reset Request',
                templatePath
            },
            'password-changed': {
                subject: 'Your Password Has Been Changed',
                templatePath
            }
        };

        const config = emailConfigs[templateType];
        if (!config) {
            throw new Error(`Unknown email template type: ${templateType}`);
        }

        return await this.sendEmail({
            to,
            subject: config.subject,
            templatePath: config.templatePath,
            templateData
        });
    }

    // Helper method to get template path based on user language preference
    getTemplatePath(templateType, language = 'en') {
        return `auth/email/${language}/${templateType}.hbs`;
    }

    // Clear template cache (useful for testing or when templates are updated)
    clearCache() {
        this.templateCache.clear();
        logger.info('Email template cache cleared');
    }
}

// Singleton instance
let emailService = null;

function getEmailService() {
    if (!emailService) {
        emailService = new EmailService();
    }
    return emailService;
}

module.exports = {
    EmailService,
    getEmailService
};
