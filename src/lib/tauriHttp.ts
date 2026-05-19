import { invoke } from '@tauri-apps/api/core';
import { createLogger } from './logger';

const logger = createLogger('TauriHttp');

export interface HttpRequestOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' | 'network' };

type RetryDecision = 'retry' | 'auth-retry' | 'fail';

export class TauriHttpClient {
  private readonly baseURL: string;
  private defaultHeaders: Record<string, string>;
  private readonly defaultOptions: HttpRequestOptions;
  private readonly onAuthError?: () => Promise<AuthResult>;
  private refreshPromise: Promise<AuthResult> | null = null;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    baseURL: string,
    defaultHeaders: Record<string, string> = {},
    defaultOptions: HttpRequestOptions = {},
    onAuthError?: () => Promise<AuthResult>
  ) {
    this.baseURL = baseURL;
    this.defaultHeaders = defaultHeaders;
    this.defaultOptions = {
      timeoutMs: 30000,
      retries: 2,
      ...defaultOptions,
    };
    this.onAuthError = onAuthError;
  }

  setHeader(key: string, value: string) {
    this.defaultHeaders = { ...this.defaultHeaders, [key]: value };
  }

  async get<T = unknown>(
    url: string,
    params?: Record<string, string>,
    options?: HttpRequestOptions
  ): Promise<T> {
    const fullUrl = this.buildUrl(url, params);
    const cacheKey = `${fullUrl.toString()}::${this.buildHeaders().join('|')}`;

    // Deduplicate in-flight requests only when no AbortSignal (signals are per-request)
    if (!options?.signal) {
      const inFlight = this.inFlight.get(cacheKey);
      if (inFlight) {
        return inFlight as Promise<T>;
      }
    }

    const promise = this.executeGet<T>(fullUrl, url, options).finally(() => {
      if (!options?.signal) {
        this.inFlight.delete(cacheKey);
      }
    });

    if (!options?.signal) {
      this.inFlight.set(cacheKey, promise);
    }
    return promise;
  }

  private async executeGet<T>(
    fullUrl: URL,
    url: string,
    options?: HttpRequestOptions
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? this.defaultOptions.timeoutMs ?? 30000;
    const retries = options?.retries ?? this.defaultOptions.retries ?? 2;
    const signal = options?.signal;

    let lastError: Error | undefined;
    let lastResponse: { status: number; headers: Record<string, string>; body: string } | undefined;
    let attempt = 0;
    let authRetryCount = 0;
    const MAX_AUTH_RETRIES = 1;

    while (attempt <= retries) {
      // Check for abort before each attempt
      if (signal?.aborted) {
        throw new Error('Request aborted');
      }

      await this.handleRetryDelay(attempt, retries, url);

      // Build headers per attempt to get fresh auth token after refresh
      const headers = this.buildHeaders();

      try {
        const response = await this.executeRequest(fullUrl, headers, timeoutMs, signal);
        lastResponse = response;
        return this.parseResponse<T>(response);
      } catch (error) {
        lastError = error as Error;
        const parsed = this.tryParse(lastResponse?.body ?? '');
        const isAuth = this.isAuthError(lastResponse?.status ?? 0, lastResponse?.body ?? '', parsed);
        if (isAuth && authRetryCount >= MAX_AUTH_RETRIES) {
          throw error;
        }
        const decision = await this.handleRequestError(
          error as Error,
          lastResponse,
          attempt,
          retries,
          isAuth
        );
        
        if (decision === 'fail') throw error;
        if (decision === 'auth-retry') {
          authRetryCount++;
          continue;
        }
        
        attempt++;
      }
    }

    throw lastError;
  }

  private buildUrl(url: string, params?: Record<string, string>): URL {
    const fullUrl = new URL(url, this.baseURL);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        fullUrl.searchParams.set(key, value);
      });
    }
    return fullUrl;
  }

  private buildHeaders(): string[] {
    return Object.entries(this.defaultHeaders).map(
      ([key, value]) => `${key}: ${value}`
    );
  }

  private async handleRetryDelay(attempt: number, retries: number, url: string): Promise<void> {
    if (attempt > 0) {
      logger.info(`Retry attempt ${attempt}/${retries} for ${url}`);
      const baseDelay = 500;
      const jitter = Math.random() * 300;
      const exponentialDelay = baseDelay * 2 ** attempt;
      await this.delay(Math.min(exponentialDelay + jitter, 5000));
    }
  }

  private async executeRequest(
    url: URL,
    headers: string[],
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const requestId = signal ? crypto.randomUUID() : undefined;

    const onAbort = () => {
      if (requestId) {
        invoke('cancel_request', { requestId }).catch((err) => {
          logger.debug('cancel_request not available or failed', err);
        });
      }
    };

    signal?.addEventListener('abort', onAbort);

    try {
      return await this.withTimeout(
        invoke<{ status: number; headers: Record<string, string>; body: string }>('stalker_request', {
          url: url.toString(),
          method: 'GET',
          headers,
          body: null,
          timeoutMs,
          requestId,
        }),
        timeoutMs + 1000
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private parseResponse<T>(response: { status: number; headers: Record<string, string>; body: string }): T {

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} - request failed`);
    }

    if (!response.body || response.body.trim() === '') {
      return {} as T;
    }

    this.validateResponseBody(response.body);

    return this.parseJsonBody<T>(response.body);
  }

  private validateResponseBody(body: string): void {
    const trimmed = body.trimStart().toLowerCase();
    if (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<body')
    ) {
      throw new Error('Access denied (403) - token may be expired');
    }
  }

  private parseJsonBody<T>(body: string): T {
    let parsed: T;
    try {
      parsed = JSON.parse(body) as T;
    } catch (parseError) {
      const errorMsg = (parseError as Error).message;
      
      logger.error('JSON parse error:', parseError);
      logger.error('Response length:', body.length);
      logger.error('Raw response (first 500 chars):', body.substring(0, 500));
      logger.error('Raw response (last 200 chars):', body.slice(-200));
      throw new Error(`JSON parse error: ${errorMsg}`);
    }

    if (this.isStalkerAuthError(parsed)) {
      throw new Error('Stalker auth error - token may be expired');
    }

    return parsed;
  }

  private tryParse<T>(body: string): T | null {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }

  private async handleRequestError(
    error: Error,
    lastResponse: { status: number; headers: Record<string, string>; body: string } | undefined,
    attempt: number,
    retries: number,
    isAuth: boolean
  ): Promise<RetryDecision> {
    if (isAuth && this.onAuthError) {
      const shouldContinue = await this.handleAuthError();
      if (shouldContinue) {
        return 'auth-retry';
      }
      return 'fail';
    }

    const isRetryable = this.isRetryableError(error, lastResponse?.status);
    if (!isRetryable || attempt >= retries) {
      return 'fail';
    }
    logger.warn(`Request failed, will retry: ${error.message}`);
    return 'retry';
  }

  private async handleAuthError(): Promise<boolean> {
    if (this.refreshPromise) {
      logger.info('Token refresh already in progress, waiting...');
      const result = await this.refreshPromise;
      return result.ok;
    }

    logger.info('Auth error detected, initiating token refresh...');
    this.refreshPromise = this.onAuthError!().finally(() => {
      this.refreshPromise = null;
    });

    const result = await this.refreshPromise;
    if (result.ok) {
      return true;
    }
    logger.warn(`Auth refresh failed: ${result.reason}`);
    return false;
  }

  private isRetryableError(error: Error, status?: number): boolean {
    // Status code based: 5xx are retryable
    if (status && status >= 500) {
      return true;
    }

    // Fallback: string-based for network errors (no response)
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('connection') || msg.includes('network') || msg.includes('econnrefused');
  }

  private isAuthError(status: number, body: string, parsed?: any): boolean {
    if (status === 401 || status === 403) return true;

    if (parsed !== undefined) {
      return this.isStalkerAuthError(parsed);
    }

    try {
      const json = JSON.parse(body);
      return this.isStalkerAuthError(json);
    } catch {
      return false;
    }
  }

  private isStalkerAuthError(json: any): boolean {
    return json?.js?.error === 'Not authorized' ||
           json?.js?.error === 'Authorization required' ||
           json?.js?.error === 'Token expired' ||
           json?.error === 'Not authorized';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout exceeded')), ms)
      ),
    ]);
  }

}
