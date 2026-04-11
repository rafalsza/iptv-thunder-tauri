import { readFile, writeFile, mkdir, remove, readDir, rename, stat } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useCallback } from 'react';

// Cache configuration
const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200MB
const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 2;

let cacheDir: string | null = null;
let lruInitialized = false;
let isClearing = false; // Atomic flag to prevent writes during cache clearing

// In-flight request deduplication with cleanup and abort support
const pendingRequests = new Map<string, { promise: Promise<Uint8Array>; timeout: number; abortController: AbortController }>();

// Track logged errors to prevent spam
const loggedErrors = new Set<string>();
const LOG_ERROR_LIMIT = 50; // Limit unique errors to prevent memory bloat

/**
 * Check if an error is a "not found" type error (expected, shouldn't be logged)
 */
function isExpectedError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // 404 / Not found errors
    if (msg.includes('404') || msg.includes('not_found')) return true;
    // Network errors that indicate the resource doesn't exist
    if (msg.includes('error sending request')) return true;
    // DNS resolution failures
    if (msg.includes('dns error') || msg.includes('failed to lookup address')) return true;
    // Connection refused/reset
    if (msg.includes('connection refused') || msg.includes('connection reset')) return true;
    // Timeout errors (often mean the resource doesn't exist)
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    // HTTP error status codes that indicate missing resources
    if (msg.includes('403') || msg.includes('410') || msg.includes('451')) return true;
  }
  return false;
}

/**
 * Log error with deduplication to prevent console spam
 */
function logError(url: string, error: unknown): void {
  // Don't log expected errors (404s, network failures for missing images)
  if (isExpectedError(error)) return;
  
  // Deduplication: only log unique errors
  const errorKey = `${url}:${error instanceof Error ? error.message : String(error)}`;
  if (loggedErrors.has(errorKey)) return;
  
  // Limit set size with FIFO eviction to prevent memory leak
  if (loggedErrors.size >= LOG_ERROR_LIMIT) {
    // Remove oldest half instead of clearing all to preserve recent deduplication
    const toDelete = Math.floor(LOG_ERROR_LIMIT / 2);
    let count = 0;
    for (const key of loggedErrors) {
      if (count >= toDelete) break;
      loggedErrors.delete(key);
      count++;
    }
  }
  loggedErrors.add(errorKey);
  
  console.error('[getImageUrl] Error:', error);
}

// LRU cache for tracking usage + size tracking
const lruCache = new Map<string, { lastUsed: number; size: number }>();

/**
 * Fetch image using Tauri HTTP backend (bypasses CORS)
 */
async function fetchWithTauriHttp(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use Tauri command to bypass CORS
    const response = await invoke<{
      status: number;
      headers: Record<string, string>;
      body: number[];
      error?: string;
    }>('fetch_image', {
      url,
      timeout: timeoutMs,
    });

    clearTimeout(timeout);

    // Handle network/request errors (status 0 means error occurred)
    if (response.status === 0 && response.error) {
      throw new Error(response.error);
    }

    // Convert number array to Uint8Array
    const data = new Uint8Array(response.body);

    // Create a Response-like object
    return new Response(data, {
      status: response.status,
      headers: new Headers(response.headers),
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function getCacheDir(): Promise<string> {
  if (!cacheDir) {
    const appDir = await appDataDir();
    cacheDir = await join(appDir, 'image_cache');
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }
  // Rebuild LRU on first access if not already done
  if (!lruInitialized) {
    lruInitialized = true; // Set BEFORE calling rebuildLruFromFs to prevent infinite recursion
    await rebuildLruFromFs();
  }
  return cacheDir;
}

/**
 * Generate SHA-1 hash for cache key - zero collision risk
 */
async function getCacheKey(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get file path for URL — ALWAYS uses .img extension
 * Content type is NOT part of the key to avoid duplicate files
 */
async function getFilePath(url: string): Promise<string> {
  const dir = await getCacheDir();
  const hash = await getCacheKey(url);
  // Always use .img — extension is cosmetic, hash is the key
  return join(dir, hash + '.img');
}

/**
 * Rebuild LRU cache from filesystem on startup
 * Uses file modification time as last_used
 */
export async function rebuildLruFromFs(): Promise<void> {
  const dir = await getCacheDir();
  
  try {
    const files = await readDir(dir);
    
    for (const file of files) {
      if (!file.name || file.name.endsWith('.tmp') || file.name.endsWith('.json')) continue;
      
      const filePath = await join(dir, file.name);
      // Use modification time for LRU ordering
      let lastUsed = Date.now();
      let size = 0;
      try {
        const fileStat = await stat(filePath);
        size = fileStat.size || 0;
        lastUsed = fileStat.mtime ? new Date(fileStat.mtime).getTime() : Date.now();
      } catch {
        // File may not exist
      }
      
      lruCache.set(filePath, { lastUsed, size });
    }
  } catch {
    // Cache may be empty
  }
}

/**
 * Update LRU timestamp for a cached file
 */
function updateLru(filePath: string, size?: number): void {
  const existing = lruCache.get(filePath);
  lruCache.set(filePath, { 
    lastUsed: Date.now(), 
    size: size ?? existing?.size ?? 0 
  });
}

/**
 * Enforce cache size limit using LRU eviction
 * FAST: uses tracked sizes, no file reading
 */
async function enforceCacheLimit(): Promise<void> {
  // Always calculate from lruCache directly (reliable even when cache is empty)
  let currentSize = 0;
  for (const [, meta] of lruCache) {
    currentSize += meta.size;
  }
  
  if (currentSize <= MAX_CACHE_SIZE) {
    return;
  }
  
  // Sort by last used time (oldest first)
  const sortedEntries = Array.from(lruCache.entries())
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  
  const target = MAX_CACHE_SIZE * 0.8; // Free up to 80% of limit
  
  for (const [filePath, meta] of sortedEntries) {
    if (currentSize <= target) break;
    
    try {
      await remove(filePath);
      // Also remove metadata JSON
      try { await remove(filePath + '.json'); } catch { /* ignore */ }
      currentSize -= meta.size;
      lruCache.delete(filePath);
    } catch {
      // File may not exist
      lruCache.delete(filePath);
    }
  }
}

/**
 * Cache an image from URL with atomic write
 * Returns the file path for direct use with convertFileSrc
 */
export async function cacheImage(url: string, data: Uint8Array, contentType?: string | null): Promise<string> {
  // Prevent writes during cache clearing
  if (isClearing) {
    throw new Error('Cache is being cleared');
  }

  const filePath = await getFilePath(url);
  const tempPath = filePath + '.tmp';
  
  // Check if file already exists (skip writing) - use stat instead of readFile
  try {
    await stat(filePath);
    // File exists, just update metadata if needed
    try {
      const metadata = { mimeType: contentType || 'image/jpeg', timestamp: Date.now() };
      await writeFile(filePath + '.json', new TextEncoder().encode(JSON.stringify(metadata)));
    } catch { /* ignore metadata write errors */ }
    updateLru(filePath, data.length);
    return filePath;
  } catch {
    // File doesn't exist, proceed with atomic write
  }
  
  try {
    // Write temp file
    await writeFile(tempPath, data);
    
    // Atomic rename (Windows-compatible)
    try {
      await rename(tempPath, filePath);
    } catch (renameErr) {
      // If rename fails, try to remove target and retry
      try {
        await remove(filePath);
        await rename(tempPath, filePath);
      } catch {
        // If still fails, throw original error
        throw renameErr;
      }
    }
    
    // Store MIME type metadata alongside the image
    try {
      const metadata = { mimeType: contentType || 'image/jpeg', timestamp: Date.now() };
      await writeFile(filePath + '.json', new TextEncoder().encode(JSON.stringify(metadata)));
    } catch { /* ignore metadata write errors */ }
    
    // Update LRU with size
    updateLru(filePath, data.length);
    
    // Check if we need to evict (currentSize already includes the new file)
    const currentSize = await getCacheSize();
    if (currentSize > MAX_CACHE_SIZE) {
      await enforceCacheLimit();
    }
    
    return filePath;
  } catch (error) {
    // Cleanup temp file on error
    try {
      await remove(tempPath);
    } catch {
      // Temp file may not exist
    }
    throw error;
  }
}

/**
 * Get cached image by URL - returns data URL for direct use in <img>
 * Uses base64 data URL (reliable, no memory leak)
 */
export async function getCachedImage(url: string): Promise<string | null> {
  try {
    const filePath = await getFilePath(url);
    await stat(filePath); // Verify file exists (stat is faster than readFile)
    updateLru(filePath);
    return await fileToAssetUrl(filePath);
  } catch {
    return null;
  }
}

/**
 * Get raw cached image data (for internal use)
 */
export async function getCachedImageData(url: string): Promise<Uint8Array | null> {
  try {
    const filePath = await getFilePath(url);
    const data = await readFile(filePath);
    updateLru(filePath, data.length);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch with timeout, retry, proper error handling, and external cancellation support
 * Uses Tauri HTTP to bypass CORS restrictions
 */
async function fetchWithRetry(url: string, timeoutMs: number = FETCH_TIMEOUT_MS, retries: number = MAX_RETRIES, externalSignal?: AbortSignal): Promise<Response> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use Tauri HTTP to bypass CORS
      return await fetchWithTauriHttp(url, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if aborted by external signal
      if (externalSignal?.aborted) {
        throw new Error('Aborted');
      }
      
      // Don't retry on last attempt
      if (attempt < retries) {
        // Exponential backoff: 100ms, 200ms
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error(`Failed to fetch after ${retries + 1} attempts: ${url}`);
}

/**
 * Fetch and cache image with deduplication, retry, and cancellation support
 */
export async function fetchAndCacheImage(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  // Check for abortion before starting
  if (signal?.aborted) {
    throw new Error('Aborted');
  }

  // Check in-flight deduplication with cleanup timeout
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url)!.promise;
  }

  // Create deferred promise and register synchronously to prevent race
  let resolvePromise!: (value: Uint8Array) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const abortController = new AbortController();

  // Set cleanup timeout to prevent memory leak if promise never resolves
  const cleanupTimeout = globalThis.window.setTimeout(() => {
    pendingRequests.delete(url);
    rejectPromise(new Error('Timeout'));
  }, FETCH_TIMEOUT_MS + 5000);

  // Register immediately (synchronously) to prevent race condition
  pendingRequests.set(url, { promise, timeout: cleanupTimeout, abortController });

  // Execute async logic
  await (async () => {
    try {
      // Check for abortion
      if (signal?.aborted || abortController.signal.aborted) {
        throw new Error('Aborted');
      }

      // Try cache first (without content type check)
      const cachedData = await getCachedImageData(url);
      if (cachedData) {
        resolvePromise(cachedData);
        return;
      }

      // Check for abortion before network request
      if (signal?.aborted || abortController.signal.aborted) {
        throw new Error('Aborted');
      }

      // Fetch with retry
      const response = await fetchWithRetry(url, FETCH_TIMEOUT_MS, MAX_RETRIES, signal);

      if (!response.ok) {
        // Don't throw for 404s - they're expected when images don't exist
        if (response.status === 404) {
          throw new Error('NOT_FOUND');
        }
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Check for abortion before writing to cache
      if (abortController.signal.aborted) {
        throw new Error('Aborted');
      }

      // Save to cache with atomic write
      await cacheImage(url, data, contentType);

      resolvePromise(data);
    } catch (error) {
      rejectPromise(error);
    }
  })();

  try {
    return await promise;
  } finally {
    const entry = pendingRequests.get(url);
    if (entry) {
      globalThis.clearTimeout(entry.timeout);
      pendingRequests.delete(url);
    }
  }
}

/**
 * Convert file path to asset URL for use in <img> src
 * Uses Tauri's convertFileSrc - avoids 33% base64 memory inflation
 * Falls back to base64 data URL if convertFileSrc fails (Tauri v2 compatibility)
 */
async function fileToAssetUrl(filePath: string): Promise<string> {
  try {
    return convertFileSrc(filePath);
  } catch {
    // Fallback: read file and convert to base64 data URL
    const data = await readFile(filePath);
    const base64 = Array.from(data)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `data:image/jpeg;base64,${base64}`;
  }
}

/**
 * Get image URL for use in <img> src
 * Returns base64 data URL (reliable, no memory leak)
 * Returns fallback on error
 */
export async function getImageUrl(url: string, fallbackUrl: string = '/fallback/poster.png', signal?: AbortSignal): Promise<string> {
  try {
    if (signal?.aborted) throw new Error('Aborted');

    const cachedPath = await getFilePath(url);

    try {
      await stat(cachedPath); // Use stat instead of readFile for existence check
      updateLru(cachedPath);
      return await fileToAssetUrl(cachedPath);
    } catch {
      if (signal?.aborted) throw new Error('Aborted');

      await fetchAndCacheImage(url, signal);
      return await fileToAssetUrl(await getFilePath(url));
    }
  } catch (e) {
    // Log with deduplication - expected errors (404s, network failures) are silently ignored
    logError(url, e);
    return fallbackUrl;
  }
}

/**
 * Preload image into cache
 */
export async function preloadImage(url: string): Promise<boolean> {
  try {
    await fetchAndCacheImage(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear image cache
 */
export async function clearImageCache(): Promise<void> {
  // Set atomic flag to prevent new writes immediately
  isClearing = true;

  const dir = await getCacheDir();
  try {
    // Collect pending promises to wait for them to settle
    const pendingPromises: Promise<Uint8Array>[] = [];

    // Abort all pending requests
    for (const [, entry] of pendingRequests) {
      globalThis.clearTimeout(entry.timeout);
      entry.abortController.abort();
      pendingPromises.push(entry.promise);
    }

    // Wait for all pending operations to complete (or fail)
    // This prevents ongoing file writes from completing after directory removal
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    pendingRequests.clear();

    await remove(dir, { recursive: true });
    cacheDir = null;
    lruCache.clear();
    lruInitialized = false;
  } catch {
    // Directory may not exist
  } finally {
    // Reset flag to allow normal operation
    isClearing = false;
  }
}

/**
 * Calculate cache size from filesystem (slower, first run fallback)
 */
async function calculateCacheSizeFromFs(): Promise<number> {
  const dir = await getCacheDir();
  
  try {
    const files = await readDir(dir);
    let total = 0;
    
    for (const file of files) {
      if (file.name?.endsWith('.tmp') || file.name?.endsWith('.json')) {
        continue;
      }
      
      try {
        const fileStat = await stat(await join(dir, file.name));
        if (fileStat.size && fileStat.size > 0) {
          total += fileStat.size;
        }
      } catch {
        // File may not exist
      }
    }
    
    return total;
  } catch {
    return 0;
  }
}

/**
 * Get cache size in bytes
 * Uses tracked sizes from LRU cache (fast, no file reading)
 */
export async function getCacheSize(): Promise<number> {
  if (lruCache.size === 0) {
    return calculateCacheSizeFromFs();
  }
  
  let total = 0;
  for (const [path, meta] of lruCache) {
    if (path.endsWith('.img')) {
      total += meta.size;
    }
  }
  return total;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  size: number;
  sizeFormatted: string;
  fileCount: number;
  maxSize: number;
  maxSizeFormatted: string;
  usage: number;
}> {
  const dir = await getCacheDir();
  const size = await getCacheSize();
  
  let fileCount = 0;
  try {
    const files = await readDir(dir);
    fileCount = files.filter(f => !f.name?.endsWith('.tmp') && !f.name?.endsWith('.json')).length;
  } catch {
    // Directory may be empty
  }
  
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  return {
    size,
    sizeFormatted: formatSize(size),
    fileCount,
    maxSize: MAX_CACHE_SIZE,
    maxSizeFormatted: formatSize(MAX_CACHE_SIZE),
    usage: Math.round((size / MAX_CACHE_SIZE) * 100),
  };
}

/**
 * @deprecated Use getCachedImage which returns the cached file path or null
 */
export async function isImageCached(url: string): Promise<boolean> {
  console.warn('isImageCached is deprecated - use getCachedImage instead');
  const result = await getCachedImage(url);
  return result !== null;
}

// React hook - returns stable function references (safe for useEffect deps)
export function useImageCache() {
  return {
    cacheImage: useCallback(cacheImage, []),
    getCachedImage: useCallback(getCachedImage, []),
    getCachedImageData: useCallback(getCachedImageData, []),
    fetchAndCacheImage: useCallback(fetchAndCacheImage, []),
    getImageUrl: useCallback(getImageUrl, []),
    preloadImage: useCallback(preloadImage, []),
    clearImageCache: useCallback(clearImageCache, []),
    getCacheSize: useCallback(getCacheSize, []),
    getCacheStats: useCallback(getCacheStats, []),
    // Utility
    rebuildLruFromFs: useCallback(rebuildLruFromFs, []),
    isImageCached: useCallback(isImageCached, []),
  };
}
