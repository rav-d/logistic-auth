const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

class ConfigService {
  constructor(serviceName = process.env.SERVICE_NAME || 'auth') {
    this.serviceName = serviceName;
    this.dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
    this.tableName = process.env.CONFIG_TABLE_NAME || 'tir-browser-config';
    this.cache = new Map();
    this.lastRefresh = 0;
    this.refreshInterval = 30000; // 30 seconds
    
    // Start background refresh
    this.startBackgroundRefresh();
  }

  async get(key, defaultValue = null) {
    await this.ensureFresh();
    
    // Try service-specific first, then global from DynamoDB
    const serviceKey = `${this.serviceName}:${key}`;
    const globalKey = `global:${key}`;
    
    const dynamoValue = this.cache.get(serviceKey) || this.cache.get(globalKey);
    
    // Fallback chain: DynamoDB -> Environment Variable -> Default
    return dynamoValue || process.env[key] || defaultValue;
  }

  async ensureFresh() {
    if (Date.now() - this.lastRefresh > this.refreshInterval) {
      await this.refresh();
    }
  }

  async refresh() {
    try {
      // Query service-specific configs
      const serviceConfigs = await this.queryConfigs(this.serviceName);
      
      // Query global configs
      const globalConfigs = await this.queryConfigs('global');
      
      // Update cache
      this.updateCache(serviceConfigs, this.serviceName);
      this.updateCache(globalConfigs, 'global');
      
      this.lastRefresh = Date.now();
      
    } catch (error) {
      console.error('Failed to refresh configs:', error);
      // Keep using cached values on error
    }
  }

  async queryConfigs(service) {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression: 'service = :service',
      ExpressionAttributeValues: marshall({ ':service': service })
    };

    const result = await this.dynamodb.send(new QueryCommand(params));
    return result.Items?.map(item => unmarshall(item)) || [];
  }

  updateCache(configs, service) {
    configs.forEach(config => {
      const cacheKey = `${service}:${config.config_key}`;
      this.cache.set(cacheKey, config.value);
    });
  }

  startBackgroundRefresh() {
    // Initial load
    this.refresh();
    
    // Background refresh every 30 seconds
    setInterval(() => {
      this.refresh();
      this.notifyListeners();
    }, this.refreshInterval);
  }
  
  // Notify all listeners about config changes
  notifyListeners() {
    // Notify for all possible config keys that might have changed
    const commonKeys = ['LOG_LEVEL', 'FEATURE_ENHANCED_LOGGING', 'API_TIMEOUT_MS'];
    commonKeys.forEach(key => notifyConfigListeners(key));
  }

  // Helper methods for common configs
  async getLogLevel() {
    return await this.get('LOG_LEVEL', 'info');
  }

  async getFeatureFlag(flagName) {
    return (await this.get(`FEATURE_${flagName}`, 'false')) === 'true';
  }

  async getTimeout(timeoutName) {
    return parseInt(await this.get(`${timeoutName}_TIMEOUT_MS`, '5000'));
  }
}

// Singleton instance
let configService = null;
const configListeners = new Map(); // key -> Set of listeners

function getConfigService() {
  if (!configService) {
    configService = new ConfigService();
  }
  return configService;
}

// Generic config listener registration
function onConfigChange(configKey, callback) {
  if (!configListeners.has(configKey)) {
    configListeners.set(configKey, new Set());
  }
  configListeners.get(configKey).add(callback);
}

// Remove config listener
function offConfigChange(configKey, callback) {
  if (configListeners.has(configKey)) {
    configListeners.get(configKey).delete(callback);
  }
}

// Notify all listeners for a config key
function notifyConfigListeners(configKey) {
  if (configListeners.has(configKey)) {
    configListeners.get(configKey).forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error(`Config listener error for ${configKey}:`, error.message);
      }
    });
  }
}

module.exports = {
  ConfigService,
  getConfigService,
  onConfigChange,
  offConfigChange
};