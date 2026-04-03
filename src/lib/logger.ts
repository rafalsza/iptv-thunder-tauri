// ======================
// logger.ts - Poprawiona wersja
// ======================

const isDebugMode = import.meta.env.DEV; // Najlepsza praktyka w Vite

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Tworzy logger z prefixem i kolorami (tylko w trybie dev)
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;

  // Style dla różnych poziomów
  const styles = {
    debug: 'color: #888888; font-size: 12px;',
    info:  'color: #4ade80; font-weight: 500;',
    warn:  'color: #fbbf24; font-weight: 500;',
    error: 'color: #ef4444; font-weight: 600;',
  };

  return {
    debug: (...args: unknown[]) => {
      if (import.meta.env.DEV) {
        console.debug(`%c${prefix}`, styles.debug, ...args);
      }
    },

    info: (...args: unknown[]) => {
      if (import.meta.env.DEV) {
        console.info(`%c${prefix}`, styles.info, ...args);
      }
    },

    warn: (...args: unknown[]) => {
      console.warn(`%c${prefix}`, styles.warn, ...args);
    },

    error: (...args: unknown[]) => {
      console.error(`%c${prefix}`, styles.error, ...args);
    },
  };
}

// ======================
// Request Debug System
// ======================

let requestSequence = 0;

function createRequestId(): string {
  requestSequence += 1;
  return `${Date.now().toString(36)}-${requestSequence.toString().padStart(3, '0')}`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export interface RequestDebugContext {
  requestId: string;
  operation: string;
  request: unknown;
  startedAt: number;
  startedAtIso: string;
}

export function createDebugRequestContext(operation: string, request: unknown): RequestDebugContext {
  return {
    requestId: createRequestId(),
    operation,
    request,
    startedAt: performance.now(),
    startedAtIso: new Date().toISOString(),
  };
}

export interface DebugEvent {
  requestId: string;
  operation: string;
  request: unknown;
  response?: unknown;
  error?: unknown;
  durationMs: number;
  status: 'success' | 'error';
}

export function logDebugRequest(context: RequestDebugContext): void {
  if (!isDebugMode) return;

  console.groupCollapsed(`%c[REQ] ${context.operation} ${context.requestId}`, 'color: #60a5fa; font-weight: 500');
  console.debug('meta', {
    requestId: context.requestId,
    operation: context.operation,
    started: context.startedAtIso,
  });
  console.debug('request', context.request);
  console.groupEnd();
}

export function logDebugSuccess(context: RequestDebugContext, response: unknown): void {
  if (!isDebugMode) return;

  const duration = performance.now() - context.startedAt;

  console.groupCollapsed(`%c[SUCCESS] ${context.operation} ${context.requestId} ${formatDuration(duration)}`, 'color: #4ade80');
  console.debug('meta', { requestId: context.requestId, duration: formatDuration(duration) });
  console.debug('request', context.request);
  console.debug('response', response);
  console.groupEnd();
}

export function logDebugError(context: RequestDebugContext, error: unknown): void {
  if (!isDebugMode) return;

  const duration = performance.now() - context.startedAt;

  console.groupCollapsed(`%c[ERROR] ${context.operation} ${context.requestId} ${formatDuration(duration)}`, 'color: #ef4444');
  console.debug('meta', { requestId: context.requestId, duration: formatDuration(duration) });
  console.debug('request', context.request);
  console.error('error', error);
  console.groupEnd();
}