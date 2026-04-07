// =========================
// 🎬 PLAYER — MPV Only
// =========================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStreamStore } from '@/store/stream.store';
import { rankUrls } from './ranking';
import { useCurrentProgram } from '@/features/epg/epg.hooks';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { useResumeStore } from '@/store/resume.store';
import {
  MpvObservableProperty, MpvConfig,
  init, observeProperties, command, setProperty, destroy,
} from 'tauri-plugin-libmpv-api';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES_PER_URL  = 3;
const DEAD_TIMEOUT_MS      = 25_000;
const BACKOFF_BASE_MS      = 2_000;

// EPG Progress Component
const EPGProgress: React.FC<{ startTime: number; endTime: number }> = ({ startTime, endTime }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const now = Math.floor(Date.now() / 1000);
      const total = endTime - startTime;
      const current = Math.max(0, Math.min(now - startTime, total));
      setProgress(total > 0 ? (current / total) * 100 : 0);
    };
    updateProgress();
    const interval = setInterval(updateProgress, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [startTime, endTime]);

  return (
    <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden flex-shrink-0" title={`${Math.round(progress)}%`}>
      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
    </div>
  );
};

const OBSERVED_PROPERTIES = [
  ['pause',    'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['video-params', 'node', 'none'],
] as const satisfies MpvObservableProperty[];

// ─── Types ────────────────────────────────────────────────────────────────────

type StreamState = 'connecting' | 'playing' | 'stalled' | 'retrying' | 'dead';

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
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Player: React.FC<PlayerProps> = ({
  url, fallbackUrls = [], name, channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, onClose,
}) => {

  // ── Stable refs (never cause re-renders, safe in closures) ───────────────────
  const isMountedRef      = useRef(true);
  const mpvAvailableRef   = useRef(false);
  const mpvRunningRef     = useRef(false);
  const currentIdxRef     = useRef(0);
  const retryCountRef     = useRef(0);
  const allUrlsRef        = useRef<string[]>([url, ...fallbackUrls]);
  const connTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef      = useRef(false); // Guard against concurrent loadUrl calls

  // Forward refs — allow timer callbacks to call latest function versions
  // without those functions being in any dep array.
  const loadUrlRef             = useRef<(u: string, idx: number, retry: number) => Promise<void>>(undefined);
  const triggerRetryRef        = useRef<(reason: string) => void>(() => {});
  const triggerNextFallbackRef = useRef<(reason: string) => void>(() => {});

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [streamState,   setStreamState]   = useState<StreamState>('connecting');
  const [currentUrlIdx, setCurrentUrlIdx] = useState(0);
  const [totalRetries,  setTotalRetries]  = useState(0);
  const [statusMsg,     setStatusMsg]     = useState('Connecting…');
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null);
  const [usingMpv,      setUsingMpv]      = useState(false);
  const [videoParams,   setVideoParams]   = useState<{width?: number, height?: number, fps?: number} | null>(null);
  const [currentTime,   setCurrentTime]   = useState<number>(0);
  const [duration,      setDuration]      = useState<number>(0);

  // Ref to track latest currentTime for cleanup
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // ── EPG ───────────────────────────────────────────────────────────────────────
  const placeholderClient = useRef(new StalkerClient({
    id: 'placeholder', name: 'placeholder', portalUrl: 'http://localhost',
    mac: '', token: '', lastUsed: new Date(), isActive: false,
  }));
  const { data: currentProgram } = useCurrentProgram(
    client ?? placeholderClient.current, channelId ?? 0, name, !isVod // Disabled for VOD/series
  );

  // ── Ranked URLs ───────────────────────────────────────────────────────────────
  const getRankedUrls = useCallback(() => {
    const store = useStreamStore.getState();
    return rankUrls([url, ...fallbackUrls], store.streams);
  }, [url, fallbackUrls]);

  // ── Check MPV once at mount ───────────────────────────────────────────────────
  useEffect(() => {
    invoke<boolean>('check_mpv_available')
      .then(ok => {
        mpvAvailableRef.current = ok;
        console.log('📺 MPV available:', ok);
      })
      .catch(() => { mpvAvailableRef.current = false; });
  }, []);

  // ── Resume Store ──────────────────────────────────────────────────────────────
  const { setPosition } = useResumeStore();

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Save position on close for VOD - use ref to get latest value
      if (isVod && movieId && currentTimeRef.current > 30) {
        setPosition(movieId, currentTimeRef.current);
      }
      clearAllTimers();
      if (mpvRunningRef.current) {
        destroy().catch(() => {});
        mpvRunningRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seek to resume position when video starts ─────────────────────────────────
  useEffect(() => {
    if (isVod && resumePosition > 0 && streamState === 'playing' && mpvRunningRef.current) {
      void seekTo(resumePosition);
    }
  }, [streamState, resumePosition, isVod]);

  // ── Timer helpers ─────────────────────────────────────────────────────────────
  function clearAllTimers() {
    if (retryTimerRef.current)  { clearTimeout(retryTimerRef.current);  retryTimerRef.current  = null; }
    if (connTimeoutRef.current) { clearTimeout(connTimeoutRef.current); connTimeoutRef.current = null; }
  }

  // ── Safe MPV destroy (only when actually running) ─────────────────────────────
  async function safeDestroyMpv() {
    if (!mpvRunningRef.current) return;
    mpvRunningRef.current = false;
    try { await destroy(); } catch { /* already dead */ }
    console.log('🛑 MPV destroyed');
  }

  // ── Core load function ────────────────────────────────────────────────────────
  const loadUrl = useCallback(async (streamUrl: string, urlIdx: number, retry: number) => {
    // Guard against concurrent calls
    if (isLoadingRef.current) {
      console.log('⏭️ loadUrl skipped - already loading');
      return;
    }
    isLoadingRef.current = true;

    if (!isMountedRef.current) {
      isLoadingRef.current = false;
      return;
    }

    clearAllTimers();
    await safeDestroyMpv();

    setStreamState('connecting');
    setStatusMsg(
      retry > 0 ? `Retry ${retry}/${MAX_RETRIES_PER_URL}${urlIdx > 0 ? ` (fallback ${urlIdx})` : ''}…`
      : urlIdx > 0 ? `Fallback ${urlIdx}…`
      : 'Connecting…'
    );
    setErrorMsg(null);

    // Connection timeout guard
    connTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      console.warn('⏱ Connection timeout');
      triggerRetryRef.current('Connection timeout');
    }, DEAD_TIMEOUT_MS);

    const onSuccess = () => {
      if (!isMountedRef.current) return;
      clearTimeout(connTimeoutRef.current!); connTimeoutRef.current = null;
      useStreamStore.getState().success(streamUrl);
      retryCountRef.current = 0;
      setStreamState('playing');
      setStatusMsg('');
    };

    // ── MPV path ──────────────────────────────────────────────────────────────
    setUsingMpv(true);
    setStatusMsg('Initializing MPV…');
    console.log('🎬 init() starting…');

    try {
      const mpvConfig: MpvConfig = {
        initialOptions: {
          'vo': 'gpu-next',
          'hwdec': 'auto-safe',
          'keep-open': 'yes',
          'cache':'yes',
          'cache-secs': '10',
          'demuxer-readahead-secs': '2',
          'demuxer-max-bytes': '50MiB',
          'demuxer-max-back-bytes': '20MiB',
          'stream-lavf-o': [
            'reconnect=1',
            'reconnect_streamed=1',
            'reconnect_on_http_error=4xx,5xx',
            'reconnect_delay_max=10',
            'timeout=10000000',
          ].join(','),
        },
        observedProperties: OBSERVED_PROPERTIES,
      };

      await init(mpvConfig);
      mpvRunningRef.current = true;
      console.log('✅ MPV init done');

      await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
        if (name === 'time-pos' && typeof data === 'number') {
          setCurrentTime(data);
          if (data > 0 && streamState === 'connecting') {
            if (isMountedRef.current) onSuccess();
          }
        }
        if (name === 'duration' && typeof data === 'number') {
          setDuration(data);
        }
        if (name === 'video-params' && data && typeof data === 'object') {
          const params = data as { w?: number; h?: number; fps?: number };
          setVideoParams({
            width: params.w,
            height: params.h,
            fps: params.fps,
          });
        }
      });

      await command('loadfile', [streamUrl]);
      await setProperty('volume', 80);
      console.log('✅ MPV loadfile sent');

    } catch (err) {
      console.error('❌ MPV failed:', err);
      mpvRunningRef.current = false;
      setUsingMpv(false);
      setStreamState('dead');
      setErrorMsg('MPV initialization failed. Native player required.');
    } finally {
      isLoadingRef.current = false;
    }

  }, []); // ← intentionally empty — uses only refs, never stale

  // ── triggerRetry ──────────────────────────────────────────────────────────────
  const triggerRetry = useCallback((reason: string) => {
    if (!isMountedRef.current) return;
    clearAllTimers();

    const next = retryCountRef.current + 1;
    retryCountRef.current = next;
    setTotalRetries(t => t + 1);

    if (next > MAX_RETRIES_PER_URL) { triggerNextFallbackRef.current(reason); return; }

    const delay = BACKOFF_BASE_MS * Math.pow(2, next - 1);
    setStreamState('retrying');
    setStatusMsg(`Retrying in ${delay / 1000}s… (${next}/${MAX_RETRIES_PER_URL})`);

    retryTimerRef.current = setTimeout(() => {
      loadUrlRef.current?.(allUrlsRef.current[currentIdxRef.current], currentIdxRef.current, next);
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── triggerNextFallback ───────────────────────────────────────────────────────
  const triggerNextFallback = useCallback((reason: string) => {
    if (!isMountedRef.current) return;
    clearAllTimers();

    allUrlsRef.current = getRankedUrls();
    const nextIdx = currentIdxRef.current + 1;

    if (nextIdx >= allUrlsRef.current.length) {
      setStreamState('dead'); setStatusMsg(''); setErrorMsg(`All streams exhausted. ${reason}`);
      return;
    }

    currentIdxRef.current = nextIdx;
    retryCountRef.current = 0;
    setCurrentUrlIdx(nextIdx);
    setTotalRetries(t => t + 1);
    loadUrlRef.current?.(allUrlsRef.current[nextIdx], nextIdx, 0);
  }, [getRankedUrls]);

  // ── Wire forward refs ─────────────────────────────────────────────────────────
  useEffect(() => { loadUrlRef.current = loadUrl; },                         [loadUrl]);
  useEffect(() => { triggerRetryRef.current = triggerRetry; },               [triggerRetry]);
  useEffect(() => { triggerNextFallbackRef.current = triggerNextFallback; }, [triggerNextFallback]);

  // ── Initial load — fires ONCE per url change ──────────────────────────────────
  // loadUrl is called via ref so it's not a dependency.
  useEffect(() => {
    // Skip if already loading (prevents duplicate calls from StrictMode or rapid url changes)
    if (isLoadingRef.current) {
      console.log('⏭️ Initial load skipped - already loading');
      return;
    }
    
    allUrlsRef.current = getRankedUrls();
    currentIdxRef.current = 0;
    retryCountRef.current = 0;
    setCurrentUrlIdx(0);
    setTotalRetries(0);
    setTimeout(() => {
      loadUrlRef.current?.(allUrlsRef.current[0], 0, 0);
    }, 50);
    
    // Cleanup: reset loading flag when URL changes (unmount or new url)
    return () => {
      isLoadingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ── Manual retry ──────────────────────────────────────────────────────────────
  const handleManualRetry = () => {
    allUrlsRef.current = getRankedUrls();
    currentIdxRef.current = 0; retryCountRef.current = 0;
    setCurrentUrlIdx(0); setTotalRetries(0);
    loadUrlRef.current?.(allUrlsRef.current[0], 0, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isFullscreen) {
        void handleFullscreen();
      } else {
        void handleClose();
      }
    }
    if (e.key === 'f' || e.key === 'F') {
      void handleFullscreen();
    }
    if (e.key === 'ArrowLeft' && isVod) {
      e.preventDefault();
      handleSeek(-10);
    }
    if (e.key === 'ArrowRight' && isVod) {
      e.preventDefault();
      handleSeek(10);
    }
  };
  const isLoading = streamState === 'connecting' || streamState === 'retrying' || streamState === 'stalled';

  // ── Player controls ─────────────────────────────────────────────────────────
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show UI on mouse move in fullscreen
  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;
    setShowUi(true);
    // Auto-hide after 3 seconds of no mouse movement
    if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current);
    uiHideTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setShowUi(false);
    }, 3000);
  }, [isFullscreen]);

  const handlePlayPause = async () => {
    if (!mpvRunningRef.current) return;
    try {
      await command('cycle', ['pause']);
      setIsPaused(!isPaused);
    } catch (e) { console.error('Play/Pause failed:', e); }
  };

  const handleStop = async () => {
    if (!mpvRunningRef.current) return;
    try {
      await command('stop', []);
      // Save position before closing - use ref to get latest value
      if (isVod && movieId && currentTimeRef.current > 30) {
        setPosition(movieId, currentTimeRef.current);
      }
      // Exit fullscreen before closing
      await exitFullscreen();
      onClose();
    } catch (e) { console.error('Stop failed:', e); }
  };

  const handleFullscreen = async () => {
    try {
      const window = getCurrentWindow();
      const newState = !isFullscreen;
      await window.setFullscreen(newState);
      setIsFullscreen(newState);
      setShowUi(!newState); // Show UI when exiting fullscreen, hide when entering
    } catch (e) { console.error('Fullscreen failed:', e); }
  };

  const exitFullscreen = async () => {
    if (isFullscreen) {
      try {
        const window = getCurrentWindow();
        await window.setFullscreen(false);
        setIsFullscreen(false);
        setShowUi(true);
      } catch (e) { console.error('Exit fullscreen failed:', e); }
    }
  };

  const handleClose = async () => {
    await exitFullscreen();
    onClose();
  };

  const handleVolumeChange = async (newVol: number) => {
    if (!mpvRunningRef.current) return;
    try {
      await setProperty('volume', newVol);
      setVolume(newVol);
    } catch (e) { console.error('Volume failed:', e); }
  };

  const handleSeek = async (seconds: number) => {
    if (!mpvRunningRef.current) return;
    try {
      await command('seek', [seconds, 'relative']);
    } catch (e) { console.error('Seek failed:', e); }
  };

  const seekTo = async (targetTime: number) => {
    if (!mpvRunningRef.current || !duration) return;
    try {
      await command('seek', [targetTime, 'absolute']);
    } catch (e) { console.error('SeekTo failed:', e); }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVod || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * duration;
    void seekTo(targetTime);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatEPGTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const stateColor: Record<StreamState, string> = {
    connecting: '#888780', playing: '#1D9E75', stalled: '#BA7517', retrying: '#D85A30', dead: '#A32D2D',
  };
  const stateLabel: Record<StreamState, string> = {
    connecting: 'Connecting', playing: 'Live', stalled: 'Stalled', retrying: 'Retrying', dead: 'Dead',
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <main
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'transparent' }}
      onKeyDown={handleKeyDown}
      aria-modal="true"
      aria-labelledby="player-title"
      tabIndex={0}
    >
      {/*
        IMPORTANT: This outer div must be transparent when MPV is running.
        MPV renders as a native child window *behind* the WebView.
        Any opaque element here will cover it.
      */}
      <div
        className="relative w-full h-full flex flex-col"
        style={{ background: 'transparent' }}
        onMouseMove={handleMouseMove}
      >
        {/* ── Header (visible when not fullscreen or when mouse moved in fullscreen) ── */}
        {(!isFullscreen || showUi) && (
        <div className="flex-shrink-0 px-4 py-3 z-10"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
          {/* Row 1: Channel name and status badges */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 min-w-0">
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: stateColor[streamState],
                boxShadow: streamState === 'playing' ? `0 0 0 4px ${stateColor.playing}44` : 'none',
                transition: 'background 0.3s',
              }} />
              <h2 id="player-title" className="text-white text-xl font-semibold truncate">{name}</h2>
              <span className="text-sm px-3 py-1 rounded-full flex-shrink-0" style={{
                background: `${stateColor[streamState]}22`, color: stateColor[streamState],
                border: `1px solid ${stateColor[streamState]}55`,
              }}>{stateLabel[streamState]}</span>
              {usingMpv && (
                <span className="text-sm px-3 py-1 rounded-full flex-shrink-0"
                  style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                  MPV
                </span>
              )}
              {videoParams?.width && videoParams?.height && (
                <span className="text-sm px-3 py-1 rounded-full flex-shrink-0"
                  style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644' }}>
                  {videoParams.height >= 4320 ? '8K' :
                    videoParams.height >= 2160 ? '4K' :
                    videoParams.height >= 1440 ? 'QHD' :
                    videoParams.height >= 1080 ? 'FHD' :
                    videoParams.height >= 720 ? 'HD' :
                    `${videoParams.width}x${videoParams.height}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {totalRetries > 0 && (
                <span className="text-xs text-gray-500">{totalRetries} retry{totalRetries !== 1 ? 's' : ''}</span>
              )}
              {currentUrlIdx > 0 && (
                <span className="text-xs text-yellow-500">fallback {currentUrlIdx}/{allUrlsRef.current.length - 1}</span>
              )}
              {!isFullscreen && (
                <button onClick={() => void handleClose()} aria-label="Close"
                  className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
              )}
            </div>
          </div>

          {/* Row 2: Current Program Name (Live TV only) */}
          {currentProgram && !isVod && (
            <div className="mt-1 ml-[22px]">
              <span className="text-base text-gray-300 font-medium" title={currentProgram.description || currentProgram.name}>
                {currentProgram.name}
              </span>
            </div>
          )}
          {!currentProgram && !isVod && (
            <div className="mt-1 ml-[22px]">
              <span className="text-sm text-gray-600 italic">Brak EPG</span>
            </div>
          )}

          {/* Row 3: Detailed EPG info (Live TV only) */}
          {currentProgram && !isVod && (
            <div className="flex items-center gap-2 mt-1 ml-[22px]">
              <span className="text-xs text-gray-500">
                {formatEPGTime(Number.parseInt(currentProgram.start_time))} - {formatEPGTime(Number.parseInt(currentProgram.end_time))}
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
          )}

          {(buffering || isLoading) && statusMsg && (
            <p className="mt-1.5 text-gray-400 text-xs ml-[22px]">{statusMsg}</p>
          )}
        </div>
        )}

        {/* ── Content area ── */}
        <div className="flex-1 relative overflow-hidden"
          style={{ background: 'transparent' }}>

          {/* Loading spinner */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg className="animate-spin" style={{ width: 36, height: 36 }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="2" />
                <path d="M12 2 A10 10 0 0 1 22 12" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="text-gray-300 text-sm">{statusMsg}</p>
            </div>
          )}

          {/* Dead state */}
          {streamState === 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-8 text-center gap-4"
              style={{ background: 'rgba(0,0,0,0.9)' }}>
              <span className="text-red-400" style={{ fontSize: 40 }}>⊘</span>
              <p className="text-white text-lg font-medium">Stream unavailable</p>
              {errorMsg && <p className="text-gray-400 text-sm max-w-sm">{errorMsg}</p>}
              <div className="flex gap-3 mt-2">
                <button onClick={handleManualRetry}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
                  Try again
                </button>
                <button onClick={() => void handleClose()}
                  className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}

          {/* MPV renders as a native child window behind the WebView layer */}
        </div>

        {/* ── Control Bar (visible when playing and (not fullscreen or mouse moved)) ── */}
        {streamState === 'playing' && (!isFullscreen || showUi) && (
          <div className="flex-shrink-0 z-20"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
              padding: '16px 20px 20px',
            }}>
            <div className="flex items-center justify-between">
              {/* Left: Play/Pause & Stop */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayPause}
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
                  onClick={handleStop}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  title="Stop"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12"/></svg>
                </button>
              </div>

              {/* Center: Netflix-style Progress Bar (VOD only) */}
              {isVod ? (
                <div className="flex-1 mx-4">
                  {/* Time display */}
                  <div className="flex justify-between text-white text-xs mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  {/* Progress bar */}
                  <div
                    className="h-1 bg-gray-600 rounded cursor-pointer relative group"
                    onClick={handleProgressClick}
                  >
                    {/* Progress fill */}
                    <div
                      className="h-full bg-red-600 rounded transition-all duration-100"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                    {/* Hover thumb */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
                    />
                  </div>
                </div>
              ) : (
                /* Live TV - no seeking */
                <div className="flex-1" />
              )}

              {/* Volume */}
              <div className="flex items-center gap-2 max-w-[140px] mr-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'white' }}
                />
              </div>

              {/* Right: Fullscreen & Close */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void handleFullscreen()}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
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
                <button
                  onClick={() => void handleClose()}
                  className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
                  title="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
