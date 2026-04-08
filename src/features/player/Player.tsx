// =========================
// 🎬 PLAYER — MPV Only (Refactored)
// =========================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStreamStore } from '@/store/stream.store';
import { rankUrls } from './ranking';
import { useCurrentProgram, useChannelEPG } from '@/features/epg/epg.hooks';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { useResumeStore } from '@/store/resume.store';
import {
  MpvObservableProperty,
  init, observeProperties, command, setProperty, destroy,
} from 'tauri-plugin-libmpv-api';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES_PER_URL = 3;
const DEAD_TIMEOUT_MS = 25_000;

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['video-params', 'node', 'none'],
] as const satisfies MpvObservableProperty[];

// ─── Types ────────────────────────────────────────────────────────────────────

interface StalkerEPG {
  id: number;
  name: string;
  description?: string;
  start_time: string;
  end_time: string;
  channel_id?: number;
}

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

// ─── Hook: useMpvPlayer ─────────────────────────────────────────────────────────

interface UseMpvPlayerReturn {
  streamState: StreamState;
  currentUrlIdx: number;
  totalRetries: number;
  statusMsg: string;
  errorMsg: string | null;
  usingMpv: boolean;
  videoParams: { width?: number; height?: number; fps?: number } | null;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  handleManualRetry: () => void;
  loadUrl: (streamUrl: string, urlIdx: number, retry: number) => Promise<void>;
  cleanup: () => void;
}

function useMpvPlayer(
  url: string,
  fallbackUrls: string[],
  isVod: boolean,
  movieId: string | undefined,
  setPosition: (id: string, pos: number) => void
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

  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [currentUrlIdx, setCurrentUrlIdx] = useState(0);
  const [totalRetries, setTotalRetries] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Connecting…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usingMpv, setUsingMpv] = useState(false);
  const [videoParams, setVideoParams] = useState<{ width?: number; height?: number; fps?: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const getRankedUrls = useCallback(() => {
    const store = useStreamStore.getState();
    return rankUrls([url, ...fallbackUrls], store.streams);
  }, [url, fallbackUrls]);

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

  const cleanup = useCallback(() => {
    isMountedRef.current = false;
    if (isVod && movieId && currentTimeRef.current > 30) {
      setPosition(movieId, currentTimeRef.current);
    }
    clearAllTimers();
    if (mpvRunningRef.current) {
      destroy().catch(() => {});
      mpvRunningRef.current = false;
    }
  }, [isVod, movieId, setPosition, clearAllTimers]);


  const streamStateRef = useRef(streamState);
  useEffect(() => { streamStateRef.current = streamState; }, [streamState]);

  const loadUrl = useCallback(async (streamUrl: string, urlIdx: number, retry: number) => {
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
      retry > 0
        ? `Retry ${retry}/${MAX_RETRIES_PER_URL}${urlIdx > 0 ? ` (fallback ${urlIdx})` : ''}…`
        : urlIdx > 0 ? `Fallback ${urlIdx}…`
        : 'Connecting…'
    );
    setErrorMsg(null);

    connTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      console.warn('⏱ Connection timeout');
    }, DEAD_TIMEOUT_MS);

    const onSuccess = () => {
      if (!isMountedRef.current) return;
      clearTimeout(connTimeoutRef.current!);
      connTimeoutRef.current = null;
      useStreamStore.getState().success(streamUrl);
      retryCountRef.current = 0;
      setStreamState('playing');
      setStatusMsg('');
    };

    setUsingMpv(true);
    console.log('🎬 init() starting…');

    try {
      const mpvConfig = {
        initialOptions: {
          'vo': 'gpu-next',
          'hwdec': 'auto-safe',
          'keep-open': 'yes',
          'cache': 'yes',
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
          if (data > 0 && streamStateRef.current === 'connecting') {
            if (isMountedRef.current) onSuccess();
          }
        }
        if (name === 'duration' && typeof data === 'number') {
          setDuration(data);
        }
        if (name === 'video-params' && data && typeof data === 'object') {
          const params = data as { w?: number; h?: number; fps?: number };
          setVideoParams({ width: params.w, height: params.h, fps: params.fps });
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
  }, [clearAllTimers, safeDestroyMpv]);

  const handleManualRetry = useCallback(() => {
    allUrlsRef.current = getRankedUrls();
    currentIdxRef.current = 0;
    retryCountRef.current = 0;
    setCurrentUrlIdx(0);
    setTotalRetries(0);
    loadUrl(allUrlsRef.current[0], 0, 0);
  }, [getRankedUrls, loadUrl]);

  const isLoading = streamState === 'connecting' || streamState === 'retrying' || streamState === 'stalled';

  return {
    streamState,
    currentUrlIdx,
    totalRetries,
    statusMsg,
    errorMsg,
    usingMpv,
    videoParams,
    currentTime,
    duration,
    isLoading,
    handleManualRetry,
    loadUrl,
    cleanup,
  };
}

// ─── Hook: usePlayerControls ──────────────────────────────────────────────────

interface UsePlayerControlsReturn {
  isPaused: boolean;
  volume: number;
  isFullscreen: boolean;
  showUi: boolean;
  handleMouseMove: () => void;
  handlePlayPause: () => Promise<void>;
  handleStop: (onClose: () => void, isVod: boolean, movieId: string | undefined, currentTime: number) => Promise<void>;
  handleFullscreen: () => Promise<void>;
  handleClose: (onClose: () => void) => Promise<void>;
  handleVolumeChange: (newVol: number) => Promise<void>;
  handleSeek: (seconds: number) => Promise<void>;
  seekTo: (targetTime: number, duration: number) => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

function usePlayerControls(): UsePlayerControlsReturn {
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const uiHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;
    setShowUi(true);
    if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current);
    uiHideTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setShowUi(false);
    }, 3000);
  }, [isFullscreen]);

  const handleFullscreen = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      const newState = !isFullscreen;
      await window.setFullscreen(newState);
      setIsFullscreen(newState);
      setShowUi(!newState);
    } catch (e) { console.error('Fullscreen failed:', e); }
  }, [isFullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (!isFullscreen) return;
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(false);
      setIsFullscreen(false);
      setShowUi(true);
    } catch (e) { console.error('Exit fullscreen failed:', e); }
  }, [isFullscreen]);

  const handleClose = useCallback(async (onClose: () => void) => {
    await exitFullscreen();
    onClose();
  }, [exitFullscreen]);

  const handlePlayPause = useCallback(async () => {
    try {
      await command('cycle', ['pause']);
      setIsPaused(p => !p);
    } catch (e) { console.error('Play/Pause failed:', e); }
  }, []);

  const handleStop = useCallback(async (
    onClose: () => void,
    isVod: boolean,
    movieId: string | undefined,
    currentTime: number
  ) => {
    try {
      await command('stop', []);
      if (isVod && movieId && currentTime > 30) {
        const { setPosition } = useResumeStore.getState();
        setPosition(movieId, currentTime);
      }
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
    isPaused,
    volume,
    isFullscreen,
    showUi,
    handleMouseMove,
    handlePlayPause,
    handleStop,
    handleFullscreen,
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
  currentProgram: {
    name: string;
    description?: string;
    start_time: string;
    end_time: string;
    year?: string;
    rating?: number;
  } | null;
  isVod: boolean;
  isLoading: boolean;
  statusMsg: string;
  isFullscreen: boolean;
  showUi: boolean;
  onClose: () => void;
}

// Helper to get resolution label from video params
const getResolutionLabel = (width: number, height: number): string => {
  if (height >= 4320) return '8K';
  if (height >= 2160) return '4K';
  if (height >= 1440) return 'QHD';
  if (height >= 1080) return 'FHD';
  if (height >= 720) return 'HD';
  return `${width}x${height}`;
};

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
  const formatEPGTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (!currentProgram || isVod) return null;
  return (
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
  );
};

const PlayerHeader: React.FC<PlayerHeaderProps> = ({
  name, streamState, usingMpv, videoParams, totalRetries, currentUrlIdx, urlCount,
  currentProgram, isVod, isLoading, statusMsg, isFullscreen, showUi, onClose
}) => {
  const stateColor: Record<StreamState, string> = {
    connecting: '#888780', playing: '#1D9E75', stalled: '#BA7517', retrying: '#D85A30', dead: '#A32D2D',
  };
  const stateLabel: Record<StreamState, string> = {
    connecting: 'Connecting', playing: 'Live', stalled: 'Stalled', retrying: 'Retrying', dead: 'Dead',
  };

  if (isFullscreen && !showUi) return null;

  return (
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
          <VideoParamsBadge videoParams={videoParams} />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {totalRetries > 0 && (
            <span className="text-xs text-gray-500">{totalRetries} retry{totalRetries !== 1 ? 's' : ''}</span>
          )}
          {currentUrlIdx > 0 && (
            <span className="text-xs text-yellow-500">fallback {currentUrlIdx}/{urlCount - 1}</span>
          )}
          {!isFullscreen && (
            <button onClick={onClose} aria-label="Close"
              className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
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
  showUi: boolean;
  isPaused: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onStop: () => void;
  onFullscreen: () => void;
  onClose: () => void;
  onVolumeChange: (v: number) => void;
  onProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onShowEPG: () => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  isVod, streamState, isFullscreen, showUi, isPaused, volume,
  currentTime, duration, onPlayPause, onStop, onFullscreen, onClose,
  onVolumeChange, onProgressClick, onShowEPG
}) => {
  const formatTime = (seconds: number) => {
    if (!seconds || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
            onClick={onStop}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            title="Stop"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12"/></svg>
          </button>

          {/* EPG Button - Live TV only */}
          {!isVod && (
            <button
              onClick={onShowEPG}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              title="Program TV (EPG)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3h2v2h-2V6zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zM7 6h2v2H7V6zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm10 4h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V6h2v2z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Center: Progress Bar (VOD only) */}
        {isVod ? (
          <div className="flex-1 mx-4">
            <div className="flex justify-between text-white text-xs mb-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
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

        {/* Right: Fullscreen & Close */}
        <div className="flex items-center gap-3">
          <button onClick={onFullscreen}
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
          <button onClick={onClose}
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
};

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
      <button onClick={onRetry}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
        Try again
      </button>
      <button onClick={onClose}
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

const EPGDetailsModal: React.FC<EPGDetailsModalProps> = ({ isOpen, onClose, epgData, channelName, isLoading }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const formatTime = (timestamp: string): string => {
    const date = new Date(Number.parseInt(timestamp) * 1000);
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(Number.parseInt(timestamp) * 1000);
    return date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const isNow = (start: string, end: string): boolean => {
    const now = Math.floor(Date.now() / 1000);
    const startTime = Number.parseInt(start);
    const endTime = Number.parseInt(end);
    return startTime <= now && endTime > now;
  };

  if (!isOpen) return null;

  // Group programs by date
  const groupedPrograms = epgData?.reduce((acc, program) => {
    const date = formatDate(program.start_time);
    if (!acc[date]) acc[date] = [];
    acc[date].push(program);
    return acc;
  }, {} as Record<string, StalkerEPG[]>);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div ref={modalRef} className="bg-zinc-900 rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div>
            <h3 className="text-lg font-semibold text-white">📺 {channelName}</h3>
            <p className="text-sm text-gray-400">Program TV - EPG</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
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
              <p className="text-gray-500">Brak danych EPG dla tego kanału</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPrograms || {}).map(([date, programs]) => (
                <div key={date}>
                  <h4 className="text-sm font-medium text-blue-400 mb-2 sticky top-0 bg-zinc-900 py-1">{date}</h4>
                  <div className="space-y-2">
                    {programs.map((program) => {
                      const nowPlaying = isNow(program.start_time, program.end_time);
                      return (
                        <div
                          key={program.id}
                          className={`p-3 rounded-lg transition-colors ${
                            nowPlaying ? 'bg-blue-600/20 border border-blue-500/50' : 'bg-zinc-800/50 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 text-xs text-gray-400 font-mono pt-0.5">
                              {formatTime(program.start_time)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-sm ${nowPlaying ? 'text-blue-300' : 'text-gray-200'}`}>
                                  {program.name}
                                </span>
                                {nowPlaying && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white animate-pulse">
                                    TERAZ
                                  </span>
                                )}
                              </div>
                              {program.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{program.description}</p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-xs text-gray-500 font-mono">
                              {formatTime(program.end_time)}
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
          <button onClick={onClose} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const Player: React.FC<PlayerProps> = ({
  url, fallbackUrls = [], name, channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, onClose,
}) => {
  const { setPosition } = useResumeStore();
  const mpv = useMpvPlayer(url, fallbackUrls, isVod, movieId, setPosition);
  const controls = usePlayerControls();

  const placeholderClient = useRef(new StalkerClient({
    id: 'placeholder', name: 'placeholder', portalUrl: 'http://localhost',
    mac: '', token: '', lastUsed: new Date(), isActive: false,
  }));

  const { data: currentProgram } = useCurrentProgram(
    client ?? placeholderClient.current, channelId ?? 0, name, !isVod
  );

  const [showEPGModal, setShowEPGModal] = useState(false);

  const { data: channelEPG, isLoading: epgLoading } = useChannelEPG(
    client ?? placeholderClient.current, channelId ?? 0, name, 24, !isVod && !!channelId
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => { mpv.cleanup(); };
  }, [mpv.cleanup]);

  // Initial load on URL change
  useEffect(() => {
    const ranked = [url, ...fallbackUrls];
    setTimeout(() => { void mpv.loadUrl(ranked[0], 0, 0); }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Seek to resume position when playing
  useEffect(() => {
    if (isVod && resumePosition > 0 && mpv.streamState === 'playing') {
      void controls.seekTo(resumePosition, mpv.duration);
    }
  }, [isVod, resumePosition, mpv.streamState, mpv.duration, controls]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    if (e.key === 'ArrowLeft' && isVod) {
      e.preventDefault();
      void controls.handleSeek(-10);
    }
    if (e.key === 'ArrowRight' && isVod) {
      e.preventDefault();
      void controls.handleSeek(10);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVod || !mpv.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * mpv.duration;
    void controls.seekTo(targetTime, mpv.duration);
  };

  const handleStop = () => {
    void controls.handleStop(onClose, isVod, movieId, mpv.currentTime);
  };

  const handleShowEPG = () => {
    setShowEPGModal(true);
  };

  return (
    <main
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'transparent' }}
      onKeyDown={handleKeyDown}
      aria-modal="true"
      aria-labelledby="player-title"
      tabIndex={0}
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
          urlCount={[url, ...fallbackUrls].length}
          currentProgram={currentProgram as unknown as { name: string; description?: string; start_time: string; end_time: string; year?: string; rating?: number; } | null}
          isVod={isVod}
          isLoading={mpv.isLoading || buffering}
          statusMsg={mpv.statusMsg}
          isFullscreen={controls.isFullscreen}
          showUi={controls.showUi}
          onClose={() => void controls.handleClose(onClose)}
        />

        <div className="flex-1 relative overflow-hidden" style={{ background: 'transparent' }}>
          {(mpv.isLoading || buffering) && (
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
              onClose={() => void controls.handleClose(onClose)}
            />
          )}
        </div>

        <PlayerControls
          isVod={isVod}
          streamState={mpv.streamState}
          isFullscreen={controls.isFullscreen}
          showUi={controls.showUi}
          isPaused={controls.isPaused}
          volume={controls.volume}
          currentTime={mpv.currentTime}
          duration={mpv.duration}
          onPlayPause={() => void controls.handlePlayPause()}
          onStop={handleStop}
          onFullscreen={() => void controls.handleFullscreen()}
          onClose={() => void controls.handleClose(onClose)}
          onVolumeChange={(v) => void controls.handleVolumeChange(v)}
          onProgressClick={handleProgressClick}
          onShowEPG={handleShowEPG}
        />

        <EPGDetailsModal
          isOpen={showEPGModal}
          onClose={() => setShowEPGModal(false)}
          epgData={channelEPG}
          channelName={name}
          isLoading={epgLoading}
        />
      </div>
    </main>
  );
};
