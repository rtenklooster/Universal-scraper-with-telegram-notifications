import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import config from '../infrastructure/config';
import logger from '../infrastructure/logger';

// Lijst van user-agents die we kunnen gebruiken
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36'
];

export class HttpClient {
  private client: AxiosInstance;
  private useRotatingProxy: boolean;
  private useRandomUserAgent: boolean;

  constructor(useRotatingProxy = false, useRandomUserAgent = false) {
    this.useRotatingProxy = useRotatingProxy;
    this.useRandomUserAgent = useRandomUserAgent;
    
    this.client = axios.create({
      timeout: 30000 // 30 seconds
    });
  }

  private getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * USER_AGENTS.length);
    return USER_AGENTS[index];
  }

  private getRequestConfig(): AxiosRequestConfig {
    const requestConfig: AxiosRequestConfig = {};
    
    // Voeg user agent toe als dat nodig is
    if (this.useRandomUserAgent) {
      requestConfig.headers = {
        'User-Agent': this.getRandomUserAgent()
      };
    }
    
    // Voeg proxy configuratie toe als dat nodig is
    if (this.useRotatingProxy && config.proxy.url) {
      requestConfig.proxy = {
        host: new URL(config.proxy.url).hostname,
        port: parseInt(new URL(config.proxy.url).port, 10) || 80,
        protocol: new URL(config.proxy.url).protocol.replace(':', '')
      };
    }
    
    return requestConfig;
  }

  async get(url: string, customHeaders?: Record<string, string>): Promise<string> {
    try {
      const config = this.getRequestConfig();
      if (customHeaders) {
        config.headers = { ...config.headers, ...customHeaders };
      }
      
      // Add Accept header for JSON
      config.headers = {
        ...config.headers,
        'Accept': 'application/mindshift.search+json;version=2',
        'accept-language': 'nl,en;q=0.9,en-GB;q=0.8,en-US;q=0.7'
      };
      
      // Log request details in debug mode
      logger.debug(`Making GET request to ${url}`);
      
      const response = await this.client.get(url, config);
      
      // Validate response
      if (!response.data) {
        throw new Error('Empty response received');
      }
      
      // If response is already a string, return it
      if (typeof response.data === 'string') {
        return response.data;
      }
      
      // If response is an object, stringify it
      if (typeof response.data === 'object') {
        return JSON.stringify(response.data);
      }
      
      throw new Error(`Unexpected response type: ${typeof response.data}`);
    } catch (error: any) {
      // Enhanced error logging
      if (error.response) {
        logger.error(`HTTP GET error for URL ${url}: Status ${error.response.status}`);
        logger.debug('Response headers:', error.response.headers);
        logger.debug('Response data:', error.response.data);
      } else if (error.request) {
        logger.error(`HTTP GET error for URL ${url}: No response received`);
        logger.debug('Request details:', error.request);
      } else {
        logger.error(`HTTP GET error for URL ${url}: ${error.message}`);
      }
      throw error;
    }
  }

  async post(url: string, data: any, customHeaders?: Record<string, string>): Promise<any> {
    try {
      const config = this.getRequestConfig();
      if (customHeaders) {
        config.headers = { ...config.headers, ...customHeaders };
      }
      
      // Log request details in debug mode
      logger.debug(`Making POST request to ${url}`);
      
      const response = await this.client.post(url, data, config);
      return response.data;
    } catch (error: any) {
      // Enhanced error logging
      if (error.response) {
        logger.error(`HTTP POST error for URL ${url}: Status ${error.response.status}`);
        logger.debug('Response data:', error.response.data);
      } else if (error.request) {
        logger.error(`HTTP POST error for URL ${url}: No response received`);
      } else {
        logger.error(`HTTP POST error for URL ${url}: ${error.message}`);
      }
      throw error;
    }
  }
}