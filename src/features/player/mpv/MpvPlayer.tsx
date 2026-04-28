// =========================
// 🎬 PLAYER — MPV Only
// =========================

import React, { useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStreamStore } from '@/store/stream.store';
import { useChannelEPG } from '@/features/epg/epg.hooks';
import { getCurrentProgram } from '@/features/epg/epg.api';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerEPG } from '@/types';
import { useResumeStore } from '@/store/resume.store';
import { useAppStore } from '@/store/app.store';
import { useTranslation } from '@/hooks/useTranslation';
import { getSetting } from '@/hooks/useSettings';
import {
  MpvObservableProperty,
  init, observeProperties, command, setProperty, destroy,
} from 'tauri-plugin-libmpv-api';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES_PER_URL = 3;
const DEAD_TIMEOUT_MS = 12_000;

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['video-params', 'node', 'none'],
  ['track-list', 'node', 'none'],
  ['aid', 'string', 'none'],
  ['sid', 'string', 'none'],
  ['cache-buffering-state', 'double', 'none'],
  ['video-bitrate', 'double', 'none'],
  ['volume', 'double', 'none'],
  ['end-file', 'node', 'none'],
] as const satisfies MpvObservableProperty[];

// ─── Helper Functions ───────────────────────────────────────────────────────────

// External store for currentTime to avoid unnecessary re-renders
const currentTimeStore = {
  value: 0,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    currentTimeStore.listeners.add(listener);
    return () => currentTimeStore.listeners.delete(listener);
  },
  getSnapshot() {
    return currentTimeStore.value;
  },
  setValue(newValue: number) {
    currentTimeStore.value = newValue;
    currentTimeStore.listeners.forEach(listener => listener());
  },
};

const timeCache = new Map<string, string>();
const dateCache = new Map<string, string>();

function formatEPGTime(timestamp: string): string {
  if (timeCache.has(timestamp)) {
    return timeCache.get(timestamp)!;
  }
  const date = new Date(Number.parseInt(timestamp) * 1000);
  const formatted = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  timeCache.set(timestamp, formatted);
  return formatted;
}

function formatEPGDate(timestamp: string): string {
  if (dateCache.has(timestamp)) {
    return dateCache.get(timestamp)!;
  }
  const date = new Date(Number.parseInt(timestamp) * 1000);
  const formatted = date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
  dateCache.set(timestamp, formatted);
  return formatted;
}

function isProgramNow(start: string, end: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const startTime = Number.parseInt(start);
  const endTime = Number.parseInt(end);
  return startTime <= now && endTime > now;
}

function formatDurationTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getResolutionLabel(width: number, height: number): string {
  if (height >= 4320) return '8K';
  if (height >= 2160) return '4K';
  if (height >= 1440) return 'QHD';
  if (height >= 1080) return 'FHD';
  if (height >= 720) return 'HD';
  if (height >= 360) return 'SD';
  return `${width}x${height}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StreamState = 'connecting' | 'playing' | 'stalled' | 'retrying' | 'dead';

interface Track {
  id: string;
  type: 'audio' | 'sub' | 'video';
  title?: string;
  lang?: string;
  selected?: boolean;
}

interface PlayerProps {
  url: string;
  fallbackUrls?: string[];
  name: string;
  channelId?: number;
  client?: StalkerClient;
  buffering?: boolean;
  isVod?: boolean;
  movieId?: string;
  resumePosition?: number;
  onClose: () => void;
  onEnded?: () => void;
}

// ─── Hook: useMpvPlayer ─────────────────────────────────────────────────────────

interface UseMpvPlayerReturn {
  streamState: StreamState;
  setStreamState: (state: StreamState) => void;
  currentUrlIdx: number;
  totalRetries: number;
  statusMsg: string;
  setStatusMsg: (msg: string) => void;
  errorMsg: string | null;
  usingMpv: boolean;
  videoParams: { width?: number; height?: number; fps?: number } | null;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  isLoading: boolean;
  tracks: Track[];
  currentAudioId: string | null;
  currentSubId: string | null;
  handleManualRetry: (preserveIndex?: boolean) => void;
  loadUrl: (streamUrl: string, urlIdx: number, retry: number) => Promise<void>;
  cleanup: () => Promise<void>;
  getRankedUrls: () => string[];
  setAudioTrack: (id: string) => Promise<void>;
  setSubTrack: (id: string) => Promise<void>;
}

function useMpvPlayer(
  url: string,
  fallbackUrls: string[],
  isVod: boolean,
  movieId: string | undefined,
  setPosition: (id: string, pos: number, duration?: number) => void,
  onEnded?: () => void,
  markAsWatched?: (movieId: string, duration: number) => void
): UseMpvPlayerReturn {
  const isMountedRef = useRef(true);
  const mpvRunningRef = useRef(false);
  const currentIdxRef = useRef(0);
  const retryCountRef = useRef(0);
  const allUrlsRef = useRef<string[]>([url, ...fallbackUrls]);
  const connTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(Date.now());
  const durationRef = useRef(0);
  const unobserveRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef(0);
  const lastRetryRef = useRef(0);
  const lastManualRetryRef = useRef(0);
  const handleManualRetryRef = useRef<((preserveIndex?: boolean) => void) | null>(null);
  const lastBufferingRef = useRef(0);
  const videoParamsReceivedRef = useRef(false);
  const firstTimePosRef = useRef(0);
  const currentCacheSecsRef = useRef(10);
  const isEndedRef = useRef(false);
  const volumeRef = useRef(0.8);
  const hwAccelEnabledRef = useRef(true);

  // Smart retry metrics per URL
  interface UrlMetrics {
    latency: number;      // avg latency in ms
    lastSuccess: number;  // timestamp of last success
    errorCount: number;   // consecutive errors
    successCount: number; // total successes
    lastUsed: number;     // last attempt timestamp
    bufferingCount: number; // number of buffering events
    avgBitrate: number;   // average bitrate in kbps
    bitrateSampleCount: number; // number of bitrate samples
  }
  const urlMetricsRef = useRef<Map<string, UrlMetrics>>(new Map());
  const urlStartTimeRef = useRef<Map<string, number>>(new Map());

  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [currentUrlIdx, setCurrentUrlIdx] = useState(0);
  const [totalRetries, setTotalRetries] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Connecting…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usingMpv, setUsingMpv] = useState(false);
  const [videoParams, setVideoParams] = useState<{ width?: number; height?: number; fps?: number } | null>(null);
  const currentTime = useSyncExternalStore(currentTimeStore.subscribe, currentTimeStore.getSnapshot);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);
  const [currentSubId, setCurrentSubId] = useState<string | null>(null);

  // Track mount state to prevent state updates on unmounted component
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Update allUrlsRef when props change
  useEffect(() => {
    allUrlsRef.current = [url, ...fallbackUrls];
  }, [url, fallbackUrls]);

  // Read settings once at hook initialization to avoid repeated API calls on retries
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const volume = await getSetting('volume');
        const hwAccelEnabled = await getSetting('hardwareAcceleration');
        volumeRef.current = volume;
        hwAccelEnabledRef.current = hwAccelEnabled;
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    };
    void loadSettings();
  }, []);

  // Smart URL ranking based on metrics + stream store
  const getRankedUrls = useCallback(() => {
    const urls = [url, ...fallbackUrls];
    const now = Date.now();

    // Calculate score for each URL (lower = better)
    const scored = urls.map(u => {
      const metrics = urlMetricsRef.current.get(u);
      if (!metrics) {
        // New URL - random exploration to allow fallback discovery
        return { url: u, score: Math.random() * 100 };
      }

      // Factors (lower score = better priority)
      const latencyScore = Math.min(metrics.latency / 100, 500); // 0-500ms
      // Logarithmic decay - less aggressive than linear, more natural
      const recencyPenalty = Math.log1p((now - metrics.lastSuccess) / 60000);
      const errorPenalty = metrics.errorCount * 50; // 50 points per consecutive error
      const bufferingPenalty = metrics.bufferingCount * 20; // 20 points per buffering event
      const bitrateBonus = metrics.avgBitrate > 0 ? Math.max(0, 100 - metrics.avgBitrate / 100) : 0; // lower bitrate penalty
      const successBonus = metrics.successCount > 0 ? -20 : 0; // bonus for proven URLs

      const score = latencyScore + recencyPenalty + errorPenalty + bufferingPenalty + bitrateBonus + successBonus;
      return { url: u, score };
    });

    // Sort by score (ascending)
    scored.sort((a, b) => a.score - b.score);
    return scored.map(s => s.url);
  }, [url, fallbackUrls]);

  // Update metrics on URL attempt start
  const recordUrlStart = useCallback((streamUrl: string) => {
    urlStartTimeRef.current.set(streamUrl, Date.now());
  }, []);

  // Update metrics on success
  const recordUrlSuccess = useCallback((streamUrl: string) => {
    const startTime = urlStartTimeRef.current.get(streamUrl);
    const latency = startTime ? Date.now() - startTime : 0;

    const existing = urlMetricsRef.current.get(streamUrl);
    if (existing) {
      // Exponential moving average for latency
      const newLatency = existing.latency * 0.7 + latency * 0.3;
      urlMetricsRef.current.set(streamUrl, {
        latency: newLatency,
        lastSuccess: Date.now(),
        errorCount: 0,
        successCount: existing.successCount + 1,
        lastUsed: Date.now(),
        bufferingCount: existing.bufferingCount,
        avgBitrate: existing.avgBitrate,
        bitrateSampleCount: existing.bitrateSampleCount,
      });
    } else {
      urlMetricsRef.current.set(streamUrl, {
        latency,
        lastSuccess: Date.now(),
        errorCount: 0,
        successCount: 1,
        lastUsed: Date.now(),
        bufferingCount: 0,
        avgBitrate: 0,
        bitrateSampleCount: 0,
      });
    }
  }, []);

  // Update metrics on failure
  const recordUrlFailure = useCallback((streamUrl: string) => {
    const existing = urlMetricsRef.current.get(streamUrl);
    if (existing) {
      urlMetricsRef.current.set(streamUrl, {
        ...existing,
        errorCount: existing.errorCount + 1,
        lastUsed: Date.now(),
      });
    } else {
      urlMetricsRef.current.set(streamUrl, {
        latency: 5000, // assume high latency
        lastSuccess: 0,
        errorCount: 1,
        successCount: 0,
        lastUsed: Date.now(),
        bufferingCount: 0,
        avgBitrate: 0,
        bitrateSampleCount: 0,
      });
    }
  }, []);

  // Update metrics on buffering event
  const recordBufferingEvent = useCallback((streamUrl: string) => {
    const existing = urlMetricsRef.current.get(streamUrl);
    if (existing) {
      const newBufferingCount = existing.bufferingCount + 1;
      urlMetricsRef.current.set(streamUrl, {
        ...existing,
        bufferingCount: newBufferingCount,
        lastUsed: Date.now(),
      });

      // Adaptive buffering: increase cache-secs based on buffering events
      // Base: 10s, increase by 2s per buffering event, max 60s
      const newCacheSecs = Math.min(10 + newBufferingCount * 2, 60);
      if (newCacheSecs !== currentCacheSecsRef.current) {
        currentCacheSecsRef.current = newCacheSecs;
        void setProperty('cache-secs', newCacheSecs.toString());
        console.log(`📈 Adaptive buffering: cache-secs increased to ${newCacheSecs}s (${newBufferingCount} buffering events)`);
      }
    }
  }, []);

  // Update metrics on bitrate change
  const recordBitrate = useCallback((streamUrl: string, bitrate: number) => {
    const existing = urlMetricsRef.current.get(streamUrl);
    if (existing) {
      // Weighted average based on sample count to handle irregular events
      const sampleCount = existing.bitrateSampleCount;
      const newBitrate = sampleCount === 0
        ? bitrate
        : (existing.avgBitrate * sampleCount + bitrate) / (sampleCount + 1);
      urlMetricsRef.current.set(streamUrl, {
        ...existing,
        avgBitrate: newBitrate,
        bitrateSampleCount: sampleCount + 1,
        lastUsed: Date.now(),
      });
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (connTimeoutRef.current) { clearTimeout(connTimeoutRef.current); connTimeoutRef.current = null; }
  }, []);

  const safeDestroyMpv = useCallback(async () => {
    if (!mpvRunningRef.current) return;
    mpvRunningRef.current = false;
    try { await destroy(); } catch { /* already dead */ }
    console.log('🛑 MPV destroyed');
  }, []);

  const cleanup = useCallback(async () => {
    // Save position BEFORE resetting refs
    if (isVod && movieId && currentTimeRef.current > 30) {
      setPosition(movieId, currentTimeRef.current, durationRef.current);
    }
    // Reset refs after setPosition to prevent old values being used for next stream
    currentTimeRef.current = 0;
    durationRef.current = 0;
    lastTimeUpdateRef.current = Date.now();
    if (unobserveRef.current) {
      unobserveRef.current();
      unobserveRef.current = null;
    }
    clearAllTimers();
    isLoadingRef.current = false;
    await safeDestroyMpv();
  }, [isVod, movieId, setPosition, clearAllTimers, safeDestroyMpv]);

  // Success callback - defined outside loadUrl to avoid closure staleness
  const onSuccessRef = useRef<(() => void) | null>(null);
  const currentStreamUrlRef = useRef<string>('');
  const successCalledRef = useRef(false);


  const streamStateRef = useRef(streamState);
  useEffect(() => { streamStateRef.current = streamState; }, [streamState]);

  // Note: recordUrlStart, recordUrlSuccess, recordUrlFailure are intentionally
  // excluded from deps - they are memoized via useCallback([]) with stable refs.
  // clearAllTimers and safeDestroyMpv also use refs internally, making them safe.
  const loadUrl = useCallback(async (streamUrl: string, urlIdx: number, retry: number) => {
    const requestId = ++requestIdRef.current;
    currentStreamUrlRef.current = streamUrl;
    successCalledRef.current = false;

    // Reset refs for new stream
    currentTimeRef.current = 0;
    durationRef.current = 0;
    lastTimeUpdateRef.current = Date.now();

    if (isLoadingRef.current) {
      console.log('⏭️ loadUrl skipped - already loading');
      return;
    }
    isLoadingRef.current = true;

    // Guard against double/unordered resets
    const finishLoading = () => {
      if (!isLoadingRef.current) return false;
      isLoadingRef.current = false;
      return true;
    };

    if (!isMountedRef.current) {
      finishLoading();
      return;
    }

    // Capture requestId before async operations
    const localRequestId = requestId;

    clearAllTimers();
    if (unobserveRef.current) {
      unobserveRef.current();
      unobserveRef.current = null;
    }

    // Check before destroy - newer request may have started
    if (localRequestId !== requestIdRef.current) {
      finishLoading();
      return;
    }

    await safeDestroyMpv();

    // Check after destroy - newer request may have started MPV
    if (localRequestId !== requestIdRef.current) {
      finishLoading();
      return;
    }

    setStreamState('connecting');
    setStatusMsg(
      retry > 0
        ? `Retry ${retry}/${MAX_RETRIES_PER_URL}${urlIdx > 0 ? ` (fallback ${urlIdx})` : ''}…`
        : urlIdx > 0 ? `Fallback ${urlIdx}…`
        : 'Connecting…'
    );
    setErrorMsg(null);

    // Reset video params tracking for new load
    videoParamsReceivedRef.current = false;
    firstTimePosRef.current = 0;
    currentCacheSecsRef.current = 10; // Reset cache-secs to default
    isEndedRef.current = false; // Reset ended flag for new playback

    recordUrlStart(streamUrl);

    connTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      if (requestId !== requestIdRef.current) return;

      console.warn('⏱ Connection timeout');
      recordUrlFailure(streamUrl);

      finishLoading();
      retryCountRef.current++;
      setTotalRetries(prev => prev + 1);

      if (retryCountRef.current < MAX_RETRIES_PER_URL) {
        console.log('🔄 Retrying same URL, attempt:', retryCountRef.current);
        setStreamState('retrying');
        retryTimerRef.current = setTimeout(() => {
          loadUrl(streamUrl, urlIdx, retryCountRef.current);
        }, 0);
      } else {
        currentIdxRef.current++;

        if (currentIdxRef.current < allUrlsRef.current.length) {
          setStatusMsg(`Switching to fallback ${currentIdxRef.current}…`);
          retryCountRef.current = 0;
          setCurrentUrlIdx(currentIdxRef.current);

          retryTimerRef.current = setTimeout(() => {
            loadUrl(
              allUrlsRef.current[currentIdxRef.current],
              currentIdxRef.current,
              0
            );
          }, 0);
        } else {
          finishLoading();
          setStreamState('dead');
          setErrorMsg('All streams failed');
        }
      }
    }, DEAD_TIMEOUT_MS);

    // Set onSuccess callback for this request using refs to avoid closure staleness
    onSuccessRef.current = () => {
      if (!isMountedRef.current) {
        return;
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (successCalledRef.current) {
        return; // already succeeded
      }
      successCalledRef.current = true;

      if (connTimeoutRef.current) {
        clearTimeout(connTimeoutRef.current);
        connTimeoutRef.current = null;
      }

      // Update state first - this must happen regardless of store errors
      retryCountRef.current = 0;
      setStreamState('playing');
      setStatusMsg('');

      // Reset loading state
      finishLoading();

      // Store operations are non-critical - wrap in try-catch to prevent blocking
      try {
        useStreamStore.getState().success(currentStreamUrlRef.current);
        recordUrlSuccess(currentStreamUrlRef.current);
      } catch (err) {
        // Store operations are non-critical - log but don't block
        console.error('Store operation failed:', err);
      }
    };

    setUsingMpv(true);

    try {
      // Use cached settings from refs (loaded once at hook initialization)
      const volume = volumeRef.current;
      const hwAccelEnabled = hwAccelEnabledRef.current;
      const hwdecValue = hwAccelEnabled ? 'auto-safe' : 'no';

      const mpvConfig = {
        initialOptions: {
          // 'vo': 'gpu-next',
          'hwdec': hwdecValue,
          'keep-open': 'yes',
          'cache': 'yes',
          'cache-secs': '10',
          'demuxer-readahead-secs': '2',
          'demuxer-max-bytes': '50MiB',
          'demuxer-max-back-bytes': '20MiB',
          'network-timeout': '30',
          'stream-buffer-size': '4M',
          'aid': 'auto',
          'sid': 'no',
          'sub-auto': 'no',
          'stream-lavf-o': [
            'reconnect=1',
            'reconnect_streamed=1',
            'reconnect_on_network_error=1',
            'reconnect_on_http_error=4xx,5xx',
            'reconnect_delay_max=10',
            'timeout=10000000',
          ].join(','),
        },
        observedProperties: OBSERVED_PROPERTIES,
      };

      await init(mpvConfig);

      // Guard: new request may have started during init - check before marking as running
      if (localRequestId !== requestIdRef.current) {
        await safeDestroyMpv();
        finishLoading();
        return;
      }

      mpvRunningRef.current = true;

      let unobserve: (() => void) | null = null;

      try {
        unobserve = await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
          if (!isMountedRef.current) return;

          if (name === 'time-pos' && typeof data === 'number') {
            currentTimeRef.current = data;
            currentTimeStore.setValue(data);
            lastTimeUpdateRef.current = Date.now();
            // Track first time-pos for fallback success detection
            if (firstTimePosRef.current === 0 && data > 0) {
              firstTimePosRef.current = Date.now();
            }
            // Fallback: if video-params never received, trigger success after 2s of playback
            if (onSuccessRef.current && data > 0 && !videoParamsReceivedRef.current && firstTimePosRef.current > 0) {
              const now = Date.now();
              if (now - firstTimePosRef.current > 2000) {
                onSuccessRef.current();
              }
            }
          }
          if (name === 'duration' && typeof data === 'number') {
            setDuration(data);
            durationRef.current = data;
          }
          if (name === 'video-params' && data && typeof data === 'object') {
            const params = data as { w?: number; h?: number; fps?: number };
            setVideoParams(prev => {
              if (prev?.width === params.w && prev?.height === params.h && prev?.fps === params.fps) return prev;
              return { width: params.w, height: params.h, fps: Math.round(params.fps ?? 0) };
            });
            // Mark that we received video params (primary success indicator)
            videoParamsReceivedRef.current = true;
            // Video actually started rendering - success!
            if (onSuccessRef.current) {
              onSuccessRef.current();
            }
          }
          if (name === 'pause' && typeof data === 'boolean') {
            setIsPaused(data);
          }
          if (name === 'track-list' && Array.isArray(data)) {
            const parsedTracks: Track[] = data.map((t: any) => ({
              id: String(t.id),
              type: t.type,
              title: t.title,
              lang: t.lang,
              selected: t.selected,
            }));
            setTracks(parsedTracks);
          }
          if (name === 'aid') {
            setCurrentAudioId(data ? String(data) : null);
          }
          if (name === 'sid') {
            setCurrentSubId(data ? String(data) : null);
          }
          if (name === 'cache-buffering-state' && typeof data === 'number') {
            // Track buffering events - state > 0 means buffering (debounced to 2s)
            if (data > 0) {
              const now = Date.now();
              if (now - lastBufferingRef.current > 2000) {
                lastBufferingRef.current = now;
                recordBufferingEvent(currentStreamUrlRef.current);
              }
            }
          }
          if (name === 'video-bitrate' && typeof data === 'number') {
            // Track bitrate (in bits per second, convert to kbps)
            recordBitrate(currentStreamUrlRef.current, data / 1000);
          }
          if (name === 'end-file' && data && typeof data === 'object') {
            const endData = data as { reason: number };
            // reason 0 = EOF (normal end), 3 = quit, etc.
            // Only trigger onEnded for normal end (reason 0)
            if (endData.reason === 0) {
              isEndedRef.current = true;
              if (onEnded) {
                onEnded();
              }
            }
          }
        });
        unobserveRef.current = unobserve;
      } catch (e) {
        try { unobserve?.(); } catch {}
        unobserveRef.current = null;
        mpvRunningRef.current = false;
        console.error('❌ observeProperties failed:', e);
      }

      // Guard: new request may have started during observeProperties - check before loadfile
      if (localRequestId !== requestIdRef.current) {
        await safeDestroyMpv();
        finishLoading();
        return;
      }

      await command('loadfile', [streamUrl]);
      await setProperty('volume', Math.round(volume * 100));
      console.log('✅ MPV loadfile sent');

    } catch (err) {
      console.error('❌ MPV failed:', err);
      if (requestId !== requestIdRef.current) return;
      recordUrlFailure(streamUrl);
      mpvRunningRef.current = false;
      setUsingMpv(false);
      setStreamState('dead');
      setErrorMsg('MPV initialization failed. Native player required.');
      finishLoading();
    }
  }, [clearAllTimers, safeDestroyMpv]);

  const handleManualRetry = useCallback((preserveIndex = false) => {
    // Throttle manual retries to prevent chaos
    if (Date.now() - lastManualRetryRef.current < 2000) return;
    lastManualRetryRef.current = Date.now();

    allUrlsRef.current = getRankedUrls();

    if (!preserveIndex) {
      currentIdxRef.current = 0;
      retryCountRef.current = 0;
      setCurrentUrlIdx(0);
    }

    setTotalRetries(0);
    loadUrl(allUrlsRef.current[currentIdxRef.current], currentIdxRef.current, 0);
  }, [getRankedUrls, loadUrl]);

  // Keep handleManualRetryRef updated
  useEffect(() => {
    handleManualRetryRef.current = handleManualRetry;
  }, [handleManualRetry]);

  const isLoading = streamState === 'connecting' || streamState === 'retrying' || streamState === 'stalled';

  // Stall detection watchdog + End detection for VOD
  useEffect(() => {
    const interval = setInterval(() => {
      if (streamStateRef.current !== 'playing') return;
      if (isLoadingRef.current) return; // still loading, don't trigger stall
      if (!mpvRunningRef.current) return; // MPV not initialized yet
      if (retryCountRef.current > 0) return; // don't retry during retry
      if (isEndedRef.current) return; // playback ended, don't trigger stall

      const now = Date.now();
      const timeSinceLastUpdate = now - lastTimeUpdateRef.current;

      // For VOD: detect end by checking if time stopped updating and we're near the end
      if (isVod) {
        const isNearEnd = durationRef.current > 0 && currentTimeRef.current > durationRef.current * 0.98;
        if (isNearEnd && timeSinceLastUpdate > 5000 && !isEndedRef.current) {
          isEndedRef.current = true;
          // Mark as watched when VOD ends
          if (movieId && markAsWatched && durationRef.current > 0) {
            markAsWatched(movieId, durationRef.current);
          }
          if (onEnded) {
            onEnded();
          }
          return;
        }
        // For VOD: use longer timeout and disable stall detection when near end
        const isApproachingEnd = durationRef.current > 0 && currentTimeRef.current > durationRef.current * 0.95;
        if (isApproachingEnd) return; // Don't trigger stall detection near end
      }

      // Stall detection
      const stallTimeout = isVod ? 15000 : 8000; // 15s for VOD, 8s for live

      if (timeSinceLastUpdate > stallTimeout) {
        // Debounce: prevent spam retry loop (min 10s between stall retries)
        if (now - lastRetryRef.current < 10000) return;
        lastRetryRef.current = now;

        console.warn(`⚠️ Stream stalled - no time update for ${stallTimeout / 1000}s`);
        setStreamState('stalled');

        // Smart stall recovery: try seek first to unblock without reconnect
        void command('seek', [0, 'relative']).then(() => {
          console.log('✅ Seek recovery successful');
          setStreamState('playing');
        }).catch(() => {
          console.warn('⏱ Seek recovery failed, falling back to retry');
          handleManualRetryRef.current?.(true); // soft retry - preserve current URL index
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isVod]);

  const setAudioTrack = useCallback(async (id: string) => {
    try {
      await setProperty('aid', id);
    } catch (e) { console.error('Set audio track failed:', e); }
  }, []);

  const setSubTrack = useCallback(async (id: string) => {
    try {
      await setProperty('sid', id);
    } catch (e) { console.error('Set sub track failed:', e); }
  }, []);

  return {
    streamState,
    setStreamState,
    currentUrlIdx,
    totalRetries,
    statusMsg,
    setStatusMsg,
    errorMsg,
    usingMpv,
    videoParams,
    currentTime,
    duration,
    isPaused,
    isLoading,
    tracks,
    currentAudioId,
    currentSubId,
    handleManualRetry,
    loadUrl,
    cleanup,
    getRankedUrls,
    setAudioTrack,
    setSubTrack,
  };
}

// ─── Hook: usePlayerControls ──────────────────────────────────────────────────

interface UsePlayerControlsReturn {
  volume: number;
  isFullscreen: boolean;
  isPip: boolean;
  showUi: boolean;
  handleMouseMove: () => void;
  handlePlayPause: () => Promise<void>;
  handleStop: (onClose: () => void) => Promise<void>;
  handleFullscreen: () => Promise<void>;
  handlePip: () => Promise<void>;
  handleClose: (onClose: () => void) => Promise<void>;
  handleVolumeChange: (newVol: number) => Promise<void>;
  handleSeek: (seconds: number) => Promise<void>;
  seekTo: (targetTime: number, duration: number) => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

function usePlayerControls(): UsePlayerControlsReturn {
  const [volume, setVolume] = useState(80);
  const setFullscreen = useAppStore(state => state.setFullscreen);
  const isFullscreen = useAppStore(state => state.isFullscreen);
  const [isPip, setIsPip] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastMoveRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleMouseMove = useCallback(() => {
    const now = Date.now();
    if (now - lastMoveRef.current < 100) return;
    lastMoveRef.current = now;

    setShowUi(true);
    if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current);
    uiHideTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setShowUi(false);
    }, 3000);
  }, []);

  const handleFullscreen = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      const newState = !isFullscreen;

      if (newState) {
        // Entering fullscreen: enable decorations for proper Windows behavior
        await window.setDecorations(true);
        await window.setFullscreen(true);
      } else {
        // Exiting fullscreen: disable decorations and exit fullscreen
        await window.setFullscreen(false);
        await window.setDecorations(false);
      }

      setFullscreen(newState);
      setShowUi(!newState);
    } catch (e) { console.error('Fullscreen failed:', e); }
  }, [isFullscreen, setFullscreen]);

  const handlePip = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      const newState = !isPip;

      if (newState) {
        // Enter PiP mode
        await window.setAlwaysOnTop(true);
        await window.setSize(new LogicalSize(640, 360));
        await window.setPosition(new LogicalPosition(50, 50));
        await window.setDecorations(true);
        if (isFullscreen) {
          await window.setFullscreen(false);
          setFullscreen(false);
        }
      } else {
        // Exit PiP mode
        await window.setAlwaysOnTop(false);
        await window.setSize(new LogicalSize(1280, 720));
        await window.setPosition(new LogicalPosition(0, 0));
        await window.setDecorations(false);
      }

      setIsPip(newState);
    } catch (e) { console.error('PiP failed:', e); }
  }, [isPip, isFullscreen, setFullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (!isFullscreen) return;
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
      await window.setDecorations(false);
      setFullscreen(false);
      setShowUi(true);
    } catch (e) { console.error('Exit fullscreen failed:', e); }
  }, [isFullscreen, setFullscreen]);

  const handleClose = useCallback(async (onClose: () => void) => {
    await exitFullscreen();
    onClose();
  }, [exitFullscreen]);

  const handlePlayPause = useCallback(async () => {
    try {
      await command('cycle', ['pause']);
    } catch (e) { console.error('Play/Pause failed:', e); }
  }, []);

  const handleStop = useCallback(async (
    onClose: () => void
  ) => {
    try {
      await command('stop', []);
      await exitFullscreen();
      onClose();
    } catch (e) { console.error('Stop failed:', e); }
  }, [exitFullscreen]);

  const handleVolumeChange = useCallback(async (newVol: number) => {
    try {
      await setProperty('volume', newVol);
      setVolume(newVol);
    } catch (e) { console.error('Volume failed:', e); }
  }, []);

  const handleSeek = useCallback(async (seconds: number) => {
    try {
      await command('seek', [seconds, 'relative']);
    } catch (e) { console.error('Seek failed:', e); }
  }, []);

  const seekTo = useCallback(async (targetTime: number, duration: number) => {
    if (!duration) return;
    try {
      await command('seek', [targetTime, 'absolute']);
    } catch (e) { console.error('SeekTo failed:', e); }
  }, []);

  return {
    volume,
    isFullscreen,
    isPip,
    showUi,
    handleMouseMove,
    handlePlayPause,
    handleStop,
    handleFullscreen,
    handlePip,
    handleClose,
    handleVolumeChange,
    handleSeek,
    seekTo,
    exitFullscreen,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

interface EPGProgressProps {
  startTime: number;
  endTime: number;
}

const EPGProgress: React.FC<EPGProgressProps> = ({ startTime, endTime }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const now = Math.floor(Date.now() / 1000);
      const total = endTime - startTime;
      const current = Math.max(0, Math.min(now - startTime, total));
      setProgress(total > 0 ? (current / total) * 100 : 0);
    };
    updateProgress();
    const interval = setInterval(updateProgress, 30000);
    return () => clearInterval(interval);
  }, [startTime, endTime]);

  return (
    <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden flex-shrink-0" title={`${Math.round(progress)}%`}>
      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
    </div>
  );
};

interface PlayerHeaderProps {
  name: string;
  streamState: StreamState;
  usingMpv: boolean;
  videoParams: { width?: number; height?: number; fps?: number } | null;
  totalRetries: number;
  currentUrlIdx: number;
  urlCount: number;
  currentProgram: Pick<StalkerEPG, 'name' | 'description' | 'start_time' | 'end_time' | 'year' | 'rating'> | null;
  isVod: boolean;
  isLoading: boolean;
  statusMsg: string;
  isFullscreen: boolean;
  showUi: boolean;
}

// Extracted Video Params Badge component
const VideoParamsBadge: React.FC<{ videoParams: { width?: number; height?: number } | null }> = ({ videoParams }) => {
  if (!videoParams?.width || !videoParams?.height) return null;
  return (
    <span className="text-sm px-3 py-1 rounded-full flex-shrink-0"
      style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644' }}>
      {getResolutionLabel(videoParams.width, videoParams.height)}
    </span>
  );
};

// Extracted EPG Info Row component
const EPGInfoRow: React.FC<{
  currentProgram: PlayerHeaderProps['currentProgram'];
  isVod: boolean;
}> = ({ currentProgram, isVod }) => {
  if (!currentProgram || isVod) return null;
  return (
    <div className="flex items-center gap-2 mt-1 ml-[22px]">
      <span className="text-xs text-gray-500">
        {formatEPGTime(currentProgram.start_time)} - {formatEPGTime(currentProgram.end_time)}
      </span>
      <EPGProgress startTime={Number.parseInt(currentProgram.start_time)} endTime={Number.parseInt(currentProgram.end_time)} />
      {currentProgram.year && (
        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{currentProgram.year}</span>
      )}
      {currentProgram.rating && currentProgram.rating > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-400">★ {currentProgram.rating}</span>
      )}
      {currentProgram.description && (
        <span className="text-xs text-gray-400 truncate max-w-md italic" title={currentProgram.description}>
          • {currentProgram.description}
        </span>
      )}
    </div>
  );
};

// Constants defined outside component to avoid re-creation on every render
const STATE_COLOR: Record<StreamState, string> = {
  connecting: '#888780', playing: '#1D9E75', stalled: '#BA7517', retrying: '#D85A30', dead: '#A32D2D',
};
const STATE_LABEL: Record<StreamState, string> = {
  connecting: 'Connecting', playing: 'Live', stalled: 'Stalled', retrying: 'Retrying', dead: 'Dead',
};

const PlayerHeader: React.FC<PlayerHeaderProps> = ({
  name, streamState, usingMpv, videoParams, totalRetries, currentUrlIdx, urlCount,
  currentProgram, isVod, isLoading, statusMsg, isFullscreen, showUi
}) => {

  if (isFullscreen && !showUi) return null;

  return (
    <div className="flex-shrink-0 px-4 py-3 z-10"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
      {/* Row 1: Channel name and status badges */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: STATE_COLOR[streamState],
            boxShadow: streamState === 'playing' ? `0 0 0 4px ${STATE_COLOR.playing}44` : 'none',
            transition: 'background 0.3s',
          }} />
          <h2 id="player-title" className="text-white text-xl font-semibold truncate">{name}</h2>
          <span className="text-sm px-3 py-1 rounded-full flex-shrink-0" style={{
            background: `${STATE_COLOR[streamState]}22`, color: STATE_COLOR[streamState],
            border: `1px solid ${STATE_COLOR[streamState]}55`,
          }}>{isVod && streamState === 'playing' ? 'Playing' : STATE_LABEL[streamState]}</span>
          {usingMpv && (
            <span className="text-sm px-3 py-1 rounded-full flex-shrink-0"
              style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
              MPV
            </span>
          )}
          <VideoParamsBadge videoParams={videoParams} />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {totalRetries > 0 && (
            <span className="text-xs text-gray-500">{totalRetries} retry{totalRetries === 1 ? '' : 's'}</span>
          )}
          {currentUrlIdx > 0 && (
            <span className="text-xs text-yellow-500">fallback {currentUrlIdx}/{urlCount - 1}</span>
          )}
        </div>
      </div>

      {/* Row 2: Current Program Name (Live TV only) */}
      {currentProgram && !isVod && (
        <div className="mt-1 ml-[22px]" style={{ display: 'block' }}>
          <span 
            className="text-base font-medium" 
            style={{ color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px' }}
            title={currentProgram.description || currentProgram.name}
          >
            📺 {currentProgram.name}
          </span>
        </div>
      )}
      {!currentProgram && !isVod && (
        <div className="mt-1 ml-[22px]">
          <span className="text-sm text-gray-600 italic">Brak EPG</span>
        </div>
      )}

      {/* Row 3: Detailed EPG info (Live TV only) */}
      <EPGInfoRow currentProgram={currentProgram} isVod={isVod} />

      {(isLoading) && statusMsg && (
        <p className="mt-1.5 text-gray-400 text-xs ml-[22px]">{statusMsg}</p>
      )}
    </div>
  );
};

// ─── Player Controls Sub-component ────────────────────────────────────────────

interface PlayerControlsProps {
  isVod: boolean;
  streamState: StreamState;
  isFullscreen: boolean;
  isPip: boolean;
  showUi: boolean;
  isPaused: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  tracks: Track[];
  currentAudioId: string | null;
  currentSubId: string | null;
  onPlayPause: () => void;
  onStop: () => void;
  onFullscreen: () => void;
  onPip: () => void;
  onClose: () => void;
  onVolumeChange: (v: number) => void;
  onProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onShowEPG: () => void;
  onSetAudioTrack: (id: string) => void;
  onSetSubTrack: (id: string) => void;
}

const PlayerControls = React.memo<PlayerControlsProps>(({
  isVod, streamState, isFullscreen, isPip, showUi, isPaused, volume,
  currentTime, duration, tracks, currentAudioId, currentSubId,
  onPlayPause, onStop, onFullscreen, onPip, onClose,
  onVolumeChange, onProgressClick, onShowEPG, onSetAudioTrack, onSetSubTrack
}) => {
  const { t } = useTranslation();
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const audioTracks = tracks.filter(t => t.type === 'audio');
  const subTracks = tracks.filter(t => t.type === 'sub');
  const hasTracks = audioTracks.length > 1 || subTracks.length > 0;

  if (streamState !== 'playing' || (isFullscreen && !showUi)) return null;

  return (
    <div className="flex-shrink-0 z-20"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
        padding: '16px 20px 20px',
      }}>
      <div className="flex items-center justify-between">
        {/* Left: Play/Pause & Stop */}
        <div className="flex items-center gap-3">
          <button
            data-tv-focusable
            tabIndex={0}
            onClick={onPlayPause}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            title={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            )}
          </button>
          <button
            data-tv-focusable
            tabIndex={0}
            onClick={onStop}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            title="Stop"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12"/></svg>
          </button>

          {/* EPG Button - Live TV only */}
          {!isVod && (
            <button
              data-tv-focusable
              tabIndex={0}
              onClick={onShowEPG}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              title="Program TV (EPG)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3h2v2h-2V6zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zM7 6h2v2H7V6zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm10 4h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V6h2v2z"/>
              </svg>
            </button>
          )}

          {/* Track Selection Button */}
          {hasTracks && (
            <div className="relative">
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={() => setShowTrackMenu(!showTrackMenu)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                title={t('trackSelection')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
                </svg>
              </button>

              {showTrackMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl p-3 z-50">
                  {/* Audio Tracks */}
                  {audioTracks.length > 1 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-400 uppercase mb-1">Audio</p>
                      {audioTracks.map(track => (
                        <button
                          key={track.id}
                          onClick={() => { onSetAudioTrack(track.id); setShowTrackMenu(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                            currentAudioId === track.id
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-slate-800'
                          }`}
                        >
                          {track.lang || track.title || `${t('audioTrack')} ${track.id}`}
                          {currentAudioId === track.id && ' ✓'}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Subtitle Tracks */}
                  {subTracks.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">{t('subtitles')}</p>
                      <button
                        onClick={() => { onSetSubTrack('no'); setShowTrackMenu(false); }}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                          currentSubId === 'no' || !currentSubId
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-slate-800'
                        }`}
                      >
                        {t('disabled')}
                        {(currentSubId === 'no' || !currentSubId) && ' ✓'}
                      </button>
                      {subTracks.map(track => (
                        <button
                          key={track.id}
                          onClick={() => { onSetSubTrack(track.id); setShowTrackMenu(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                            currentSubId === track.id
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-slate-800'
                          }`}
                        >
                          {track.lang || track.title || `${t('subtitleTrack')} ${track.id}`}
                          {currentSubId === track.id && ' ✓'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: Progress Bar (VOD only) */}
        {isVod ? (
          <div className="flex-1 mx-4">
            <div className="flex justify-between text-white text-xs mb-1">
              <span>{formatDurationTime(currentTime)}</span>
              <span>{formatDurationTime(duration)}</span>
            </div>
            <div className="h-1 bg-gray-600 rounded cursor-pointer relative group" onClick={onProgressClick}>
              <div className="h-full bg-red-600 rounded transition-all duration-100"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              <div className="absolute top-1/2 w-4 h-4 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }} />
            </div>
          </div>
        ) : <div className="flex-1" />}

        {/* Volume */}
        <div className="flex items-center gap-2 max-w-[140px] mr-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <input type="range" min="0" max="100" value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'white' }} />
        </div>

        {/* Right: Fullscreen, PiP & Close */}
        <div className="flex items-center gap-3">
          <button onClick={onFullscreen} data-tv-focusable tabIndex={0}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>
          <button onClick={onPip} data-tv-focusable tabIndex={0}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isPip ? 'bg-blue-500/80 hover:bg-blue-500' : 'bg-white/20 hover:bg-white/30'}`}
            title={t('pip')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>
            </svg>
          </button>
          <button onClick={onClose} data-tv-focusable tabIndex={0}
            className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
            title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
PlayerControls.displayName = 'PlayerControls';

interface DeadStateProps {
  errorMsg: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const DeadState: React.FC<DeadStateProps> = ({ errorMsg, onRetry, onClose }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-8 text-center gap-4"
    style={{ background: 'rgba(0,0,0,0.9)' }}>
    <span className="text-red-400" style={{ fontSize: 40 }}>⊘</span>
    <p className="text-white text-lg font-medium">Stream unavailable</p>
    {errorMsg && <p className="text-gray-400 text-sm max-w-sm">{errorMsg}</p>}
    <div className="flex gap-3 mt-2">
      <button onClick={onRetry} data-tv-focusable tabIndex={0}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
        Try again
      </button>
      <button onClick={onClose} data-tv-focusable tabIndex={0}
        className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors">
        Close
      </button>
    </div>
  </div>
);

// ─── EPG Details Modal ──────────────────────────────────────────────────────

interface EPGDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  epgData: StalkerEPG[] | undefined;
  channelName: string;
  isLoading: boolean;
}

const EPGDetailsModal = React.memo<EPGDetailsModalProps>(({ isOpen, onClose, epgData, channelName, isLoading }) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClickOutside]);

  // Track expanded descriptions by program ID
  const [expandedPrograms, setExpandedPrograms] = useState<Set<number>>(new Set());

  // Toggle expanded state for program description
  const toggleExpanded = useCallback((programId: number) => {
    setExpandedPrograms(prev => {
      const next = new Set(prev);
      if (next.has(programId)) {
        next.delete(programId);
      } else {
        next.add(programId);
      }
      return next;
    });
  }, []);

  // Group programs by date - memoized to avoid recalculation on every render
  const groupedPrograms = useMemo(() =>
    epgData?.reduce((acc, program) => {
      const date = formatEPGDate(program.start_time);
      if (!acc[date]) acc[date] = [];
      acc[date].push(program);
      return acc;
    }, {} as Record<string, StalkerEPG[]>),
  [epgData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div ref={modalRef} className="bg-zinc-900 rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div>
            <h3 className="text-lg font-semibold text-white">📺 {channelName}</h3>
            <p className="text-sm text-gray-400">Program TV - EPG</p>
          </div>
          <button onClick={onClose} data-tv-focusable tabIndex={0} className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
            <span className="text-gray-400 text-lg">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : !epgData || epgData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">{t('noEpgData')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPrograms || {}).map(([date, programs]) => (
                <div key={date}>
                  <h4 className="text-sm font-medium text-blue-400 mb-2 sticky top-0 bg-zinc-900 py-1">{date}</h4>
                  <div className="space-y-2">
                    {programs.map((program) => {
                      const nowPlaying = isProgramNow(program.start_time, program.end_time);
                      const isExpanded = expandedPrograms.has(program.id);
                      return (
                        <div
                          key={program.id}
                          className={`p-3 rounded-lg transition-colors ${
                            nowPlaying ? 'bg-blue-600/20 border border-blue-500/50' : 'bg-zinc-800/50 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 text-xs text-gray-400 font-mono pt-0.5">
                              {formatEPGTime(program.start_time)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${nowPlaying ? 'text-blue-300' : 'text-gray-200'}`}>
                                  {program.name}
                                </span>
                                {nowPlaying && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white animate-pulse">
                                    {t('nowPlayingLabel')}
                                  </span>
                                )}
                              </div>
                              {program.description && (
                                <p
                                  className={`text-xs text-gray-500 mt-1 cursor-pointer ${isExpanded ? '' : 'line-clamp-2'}`}
                                  onClick={() => toggleExpanded(program.id)}
                                >
                                  {program.description}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-xs text-gray-500 font-mono">
                              {formatEPGTime(program.end_time)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-700 text-center">
          <button onClick={onClose} data-tv-focusable tabIndex={0} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors">
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
});
EPGDetailsModal.displayName = 'EPGDetailsModal';

// ─── Main Component ───────────────────────────────────────────────────────────
export const MpvPlayer: React.FC<PlayerProps> = ({
  url, fallbackUrls = [], name, channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, onClose, onEnded,
}) => {
  const { setPosition, markAsWatched } = useResumeStore();
  const mpv = useMpvPlayer(url, fallbackUrls, isVod, movieId, setPosition, onEnded, markAsWatched);
  const controls = usePlayerControls();

  // Single EPG query for 24 hours - used by both current program and EPG modal
  // Only fetch when we have a valid client
  const { data: channelEPG, isLoading: epgLoading } = useChannelEPG(
    client, channelId ?? 0, name, 24, !isVod && !!channelId && !!client
  );

  // Derive current program from channelEPG data instead of making separate query
  const currentProgram = channelEPG ? getCurrentProgram(channelEPG) : null;

  const [showEPGModal, setShowEPGModal] = useState(false);
  const hasResumedRef = useRef(false);
  const urlChangeIdRef = useRef(0);

  // Memoized cleanup handler for beforeunload event
  const handleBeforeUnload = useCallback(() => {
    void mpv.cleanup();
  }, [mpv.cleanup]);

  // Cleanup on unmount and before page unload
  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void mpv.cleanup();
    };
  }, [handleBeforeUnload]);

  // Initial load on URL change
  useEffect(() => {
    const { cleanup, loadUrl, getRankedUrls, setStreamState, setStatusMsg } = mpv;
    hasResumedRef.current = false;

    const requestId = ++urlChangeIdRef.current;

    // Cleanup old MPV before loading new URL
    void cleanup().then(() => {
      // Guard: newer URL change may have started during cleanup
      if (requestId !== urlChangeIdRef.current) return;

      // Reset state for new stream
      setStreamState('connecting');
      setStatusMsg('Connecting…');
      // Use ranked URLs for smart priority ordering
      const ranked = getRankedUrls ? getRankedUrls() : [url, ...fallbackUrls];
      void loadUrl(ranked[0], 0, 0);
    });

    return () => {
      // Increment requestId to cancel pending load
      urlChangeIdRef.current++;
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seek to resume position when playing and duration is available
  const { seekTo } = controls;
  useEffect(() => {
    if (isVod && resumePosition > 0 && mpv.streamState === 'playing' && mpv.duration > 0 && !hasResumedRef.current) {
      console.log('▶️ Resume seeking to:', resumePosition, 'duration:', mpv.duration);
      hasResumedRef.current = true;
      // Small delay to ensure MPV is fully ready
      const timer = setTimeout(() => {
        void seekTo(resumePosition, mpv.duration);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isVod, resumePosition, mpv.streamState, mpv.duration, seekTo]);

  // Memoized URL list to avoid re-calculation on every render
  const allUrls = useMemo(() => [url, ...fallbackUrls], [url, fallbackUrls]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (controls.isFullscreen) {
        void controls.handleFullscreen();
      } else {
        void controls.handleClose(onClose);
      }
    }
    if (e.key === 'f' || e.key === 'F') {
      void controls.handleFullscreen();
    }
    if (e.key === ' ') {
      e.preventDefault();
      void controls.handlePlayPause();
    }
    if (e.key === 'ArrowLeft' && isVod) {
      e.preventDefault();
      void controls.handleSeek(-10);
    }
    if (e.key === 'ArrowRight' && isVod) {
      e.preventDefault();
      void controls.handleSeek(10);
    }
  }, [controls.isFullscreen, controls.handleFullscreen, controls.handleClose, controls.handlePlayPause, controls.handleSeek, isVod, onClose]);

  // Global keyboard handling
  useEffect(() => {
    globalThis.window.addEventListener('keydown', handleKeyDown);
    return () => globalThis.window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVod || !mpv.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * mpv.duration;
    void controls.seekTo(targetTime, mpv.duration);
  }, [isVod, mpv.duration, controls.seekTo]);

  const handleStop = useCallback(() => {
    void controls.handleStop(onClose);
  }, [controls.handleStop, onClose]);

  const handleShowEPG = useCallback(() => {
    setShowEPGModal(true);
  }, []);

  const handleCloseEPGModal = useCallback(() => {
    setShowEPGModal(false);
  }, []);

  const handleClosePlayer = useCallback(() => {
    void controls.handleClose(onClose);
  }, [controls.handleClose, onClose]);

  const handlePlayPause = useCallback(() => void controls.handlePlayPause(), [controls.handlePlayPause]);
  const handleVolumeChange = useCallback((v: number) => void controls.handleVolumeChange(v), [controls.handleVolumeChange]);
  const handleSetAudioTrack = useCallback((id: string) => void mpv.setAudioTrack(id), [mpv.setAudioTrack]);
  const handleSetSubTrack = useCallback((id: string) => void mpv.setSubTrack(id), [mpv.setSubTrack]);
  const handleFullscreen = useCallback(() => void controls.handleFullscreen(), [controls.handleFullscreen]);
  const handlePip = useCallback(() => void controls.handlePip(), [controls.handlePip]);

  return (
    <main
      className={`fixed z-50 flex items-center justify-center ${controls.isFullscreen ? 'inset-0' : 'left-0 right-0 bottom-0'}`}
      style={{ background: 'transparent', top: controls.isFullscreen ? 0 : 40 }}
      aria-labelledby="player-title"
      role="application"
    >
      <div
        className="relative w-full h-full flex flex-col"
        style={{ background: 'transparent', cursor: controls.isFullscreen && !controls.showUi ? 'none' : 'auto' }}
        onMouseMove={controls.handleMouseMove}
      >
        <PlayerHeader
          name={name}
          streamState={mpv.streamState}
          usingMpv={mpv.usingMpv}
          videoParams={mpv.videoParams}
          totalRetries={mpv.totalRetries}
          currentUrlIdx={mpv.currentUrlIdx}
          urlCount={allUrls.length}
          currentProgram={currentProgram}
          isVod={isVod}
          isLoading={mpv.isLoading || buffering}
          statusMsg={mpv.statusMsg}
          isFullscreen={controls.isFullscreen}
          showUi={controls.showUi}
        />

        <div className="flex-1 relative overflow-hidden" style={{ background: 'transparent' }}>
          {mpv.isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg className="animate-spin" style={{ width: 36, height: 36 }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="2" />
                <path d="M12 2 A10 10 0 0 1 22 12" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="text-gray-300 text-sm">{mpv.statusMsg}</p>
            </div>
          )}

          {mpv.streamState === 'dead' && (
            <DeadState
              errorMsg={mpv.errorMsg}
              onRetry={mpv.handleManualRetry}
              onClose={handleClosePlayer}
            />
          )}
        </div>

        <PlayerControls
          isVod={isVod}
          streamState={mpv.streamState}
          isFullscreen={controls.isFullscreen}
          isPip={controls.isPip}
          showUi={controls.showUi}
          isPaused={mpv.isPaused}
          volume={controls.volume}
          currentTime={mpv.currentTime}
          duration={mpv.duration}
          tracks={mpv.tracks}
          currentAudioId={mpv.currentAudioId}
          currentSubId={mpv.currentSubId}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onFullscreen={handleFullscreen}
          onPip={handlePip}
          onClose={handleClosePlayer}
          onVolumeChange={handleVolumeChange}
          onProgressClick={handleProgressClick}
          onShowEPG={handleShowEPG}
          onSetAudioTrack={handleSetAudioTrack}
          onSetSubTrack={handleSetSubTrack}
        />

        <EPGDetailsModal
          isOpen={showEPGModal}
          onClose={handleCloseEPGModal}
          epgData={channelEPG}
          channelName={name}
          isLoading={epgLoading}
        />
      </div>
    </main>
  );
};
