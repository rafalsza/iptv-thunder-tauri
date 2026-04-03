import { invoke } from '@tauri-apps/api/core';
import { createLogger } from './logger';

const logger = createLogger('TauriHttp');

export class TauriHttpClient {
  private readonly baseURL: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(baseURL: string, defaultHeaders: Record<string, string> = {}) {
    this.baseURL = baseURL;
    this.defaultHeaders = defaultHeaders;
  }

  setHeader(key: string, value: string) {
    this.defaultHeaders[key] = value;
  }

  async get(url: string, params?: Record<string, string>): Promise<any> {
    const fullUrl = new URL(url, this.baseURL);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        fullUrl.searchParams.append(key, value);
      });
    }

    const headers = Object.entries(this.defaultHeaders).map(
      ([key, value]) => `${key}: ${value}`
    );

    try {
      const response = await invoke<string>('stalker_request', {
        url: fullUrl.toString(),
        method: 'GET',
        headers,
        body: null,
      });

      if (!response || response.trim() === '') {
        return {};
      }

      if (response.trim().startsWith('<')) {
        throw new Error('Access denied (403) - token may be expired');
      }

      try {
        const parsed = JSON.parse(response);
        return parsed;
      } catch (parseError) {
        logger.error('JSON parse error:', parseError);
        logger.debug('Response that failed to parse:', response.substring(0, 500));
        throw new Error(`JSON parse error: ${(parseError as Error).message}`);
      }
    } catch (error) {
      logger.error('Tauri HTTP request failed:', error);
      throw error;
    }
  }

  async post(url: string, data?: any): Promise<any> {
    const fullUrl = new URL(url, this.baseURL);
    
    const headers = Object.entries(this.defaultHeaders).map(
      ([key, value]) => `${key}: ${value}`
    );

    if (data) {
      headers.push('Content-Type: application/json');
    }

    try {
      const response = await invoke<string>('stalker_request', {
        url: fullUrl.toString(),
        method: 'POST',
        headers,
        body: data ? JSON.stringify(data) : null,
      });

      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      logger.error('Tauri HTTP request failed:', error);
      throw error;
    }
  }
}
