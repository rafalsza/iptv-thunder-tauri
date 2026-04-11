// =========================
// 🎬 EXO PLAYER (Android TV Only)
// =========================

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useChannelEPG } from '@/features/epg/epg.hooks';
import { getCurrentProgram } from '@/features/epg/epg.api';
import { useResumeStore } from '@/store/resume.store';
import { useTVNavigation } from '@/hooks/useTVNavigation';
import { StalkerEPG } from '@/types';

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES_PER_URL = 3;
const DEAD_TIMEOUT_MS = 12_000;
const LOCK_TIMEOUT = 15000;
const RENDER_THROTTLE = 250;
const STALL_TIMEOUT = 15000;

// ─── Helper Functions ───────────────────────────────────────────────────────────

function formatEPGTime(timestamp: string): string {
  const date = new Date(Number.parseInt(timestamp) * 1000);
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDurationTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StreamState = 'connecting' | 'playing' | 'stalled' | 'retrying' | 'dead';

export interface ExoPlayerProps {
  url: string;
  fallbackUrls?: string[];
  name?: string;
  channelId?: number;
  client?: any;
  buffering?: boolean;
  isVod?: boolean;
  movieId?: string;
  resumePosition?: number;
  setPosition: (id: string, pos: number, duration?: number) => void;
  onClose: () => void;
}

// ─── Hook: useExoPlayer ───────────────────────────────────────────────────────

interface UseExoPlayerReturn {
  streamState: StreamState;
  setStreamState: (state: StreamState) => void;
  currentUrlIdx: number;
  totalRetries: number;
  statusMsg: string;
  setStatusMsg: (msg: string) => void;
  errorMsg: string | null;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  isLoading: boolean;
  currentAudioId: string | null;
  currentSubId: string | null;
  handleManualRetry: (preserveIndex?: boolean) => void;
  loadUrl: (urlIdx: number, retry: number) => Promise<void>;
  cleanup: () => Promise<void>;
  setAudioTrack: (id: string) => Promise<void>;
  setSubTrack: (id: string) => Promise<void>;
}

function useExoPlayer(
  url: string,
  fallbackUrls: string[],
  isVod: boolean,
  movieId: string | undefined,
  resumePosition: number,
  setPosition: (id: string, pos: number, duration?: number) => void
): UseExoPlayerReturn {
  const isMountedRef = useRef(true);
  const currentIdxRef = useRef(0);
  const retryCountRef = useRef(0);
  const allUrlsRef = useRef<string[]>([url, ...fallbackUrls]);
  const connTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef<Promise<void> | null>(null);
  const currentTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(Date.now());
  const lastRenderRef = useRef(Date.now());
  const durationRef = useRef(0);
  const requestIdRef = useRef(0);
  const lastRetryRef = useRef(0);
  const lastManualRetryRef = useRef(0);
  const positionUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventListenersRef = useRef<(() => void)[]>([]);
  const isStoppingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const isActiveRef = useRef(true);
  const isPausedRef = useRef(false);

  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [currentUrlIdx, setCurrentUrlIdx] = useState(0);
  const [totalRetries, setTotalRetries] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Connecting…');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);
  const [currentSubId, setCurrentSubId] = useState<string | null>(null);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Update allUrlsRef when props change
  useEffect(() => {
    allUrlsRef.current = [url, ...fallbackUrls];
  }, [url, fallbackUrls]);

  // Keep isPausedRef in sync with isPaused state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (connTimeoutRef.current) { clearTimeout(connTimeoutRef.current); connTimeoutRef.current = null; }
    if (positionUpdateIntervalRef.current) { clearInterval(positionUpdateIntervalRef.current); positionUpdateIntervalRef.current = null; }
    // Clear event listeners
    eventListenersRef.current.forEach(unlisten => unlisten());
    eventListenersRef.current = [];
  }, []);

  const cleanup = useCallback(async () => {
    // Set stopping flag to prevent new play operations
    isStoppingRef.current = true;
    // Set inactive flag to prevent event listeners from being added after cleanup
    isActiveRef.current = false;

    if (isVod && movieId && currentTimeRef.current > 30) {
      setPosition(movieId, currentTimeRef.current, durationRef.current);
    }
    clearAllTimers();
    // Release lock if held
    lockRef.current = null;

    try {
      await invoke('exoplayer_stop');
    } catch (e) {
      console.error('ExoPlayer stop failed:', e);
    } finally {
      // Clear stopping flag after cleanup completes
      isStoppingRef.current = false;
    }
  }, [isVod, movieId, setPosition, clearAllTimers]);

  const streamStateRef = useRef(streamState);
  useEffect(() => { streamStateRef.current = streamState; }, [streamState]);

  const loadUrl = useCallback(async (urlIdx: number, retry: number) => {
    const requestId = ++requestIdRef.current;

    // Prevent new play operations during cleanup
    if (isStoppingRef.current) {
      console.log('⏭️ loadUrl skipped - player is stopping');
      return;
    }

    // Return existing promise if loading is in progress, with timeout watchdog
    if (lockRef.current) {
      console.log('⏭️ loadUrl skipped - waiting for existing promise with timeout watchdog');
      try {
        await Promise.race([
          lockRef.current,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Lock timeout')), LOCK_TIMEOUT)
          )
        ]);
      } catch (err) {
        console.warn('⚠️ Lock timeout - forcing unlock:', err);
        lockRef.current = null;
      }

      // If lock still exists after timeout, return it (might have been released)
      if (lockRef.current) {
        console.log('⏭️ loadUrl skipped - returning existing promise after timeout check');
        return lockRef.current;
      }
    }

    if (!isMountedRef.current) {
      return;
    }

    const localRequestId = requestId;

    // Create and store the loading promise
    lockRef.current = (async () => {
      try {
        clearAllTimers();

        // Check before destroy - newer request may have started
        if (localRequestId !== requestIdRef.current) {
          return;
        }

        setStreamState('connecting');
        const fallbackSuffix = urlIdx > 0 ? ` (fallback ${urlIdx})` : '';
        setStatusMsg(
          retry > 0
            ? `Retry ${retry}/${MAX_RETRIES_PER_URL}${fallbackSuffix}…`
            : urlIdx > 0 ? `Fallback ${urlIdx}…`
            : 'Connecting…'
        );
        setErrorMsg(null);

        // Loop-based retry logic to prevent parallel execution
        let success = false;
        let lastError: Error | null = null;

        for (let urlIdxLoop = urlIdx; urlIdxLoop < allUrlsRef.current.length; urlIdxLoop++) {
          for (let retryLoop = (urlIdxLoop === urlIdx ? retry : 0); retryLoop < MAX_RETRIES_PER_URL; retryLoop++) {
            // Check if component is still mounted and request is still valid
            if (!isMountedRef.current || requestId !== requestIdRef.current) {
              return;
            }

            // Update UI for this attempt
            const currentFallbackSuffix = urlIdxLoop > 0 ? ` (fallback ${urlIdxLoop})` : '';
            setStatusMsg(
              retryLoop > 0
                ? `Retry ${retryLoop}/${MAX_RETRIES_PER_URL}${currentFallbackSuffix}…`
                : urlIdxLoop > 0 ? `Fallback ${urlIdxLoop}…`
                : 'Connecting…'
            );

            if (urlIdxLoop !== currentIdxRef.current) {
              currentIdxRef.current = urlIdxLoop;
              setCurrentUrlIdx(urlIdxLoop);
            }

            retryCountRef.current = retryLoop;
            setTotalRetries(retryLoop);

            try {
              // Initialize ExoPlayer only once (singleton init)
              if (!isInitializedRef.current) {
                try {
                  await invoke('exoplayer_init');
                  isInitializedRef.current = true;
                } catch (e) {
                  console.log('ExoPlayer init failed:', e);
                }
              }

              // Check again after init
              if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return;
              }

              // Flag to prevent timeout after successful play
              let resolved = false;

              // Set timeout for this specific attempt
              const timeoutPromise = new Promise<never>((_, reject) => {
                connTimeoutRef.current = setTimeout(() => {
                  if (resolved) return;
                  reject(new Error('Connection timeout'));
                }, DEAD_TIMEOUT_MS);
              });

              // Play the stream with timeout
              await Promise.race([
                invoke('exoplayer_play', {
                  url: allUrlsRef.current[urlIdxLoop],
                  resumePosition: isVod ? resumePosition : 0,
                }),
                timeoutPromise,
              ]);

              // Mark as resolved and clear timeout
              resolved = true;
              if (connTimeoutRef.current) {
                clearTimeout(connTimeoutRef.current);
                connTimeoutRef.current = null;
              }

              // Check again after play
              if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return;
              }

              // Clear any existing position update interval before setting new one
              if (positionUpdateIntervalRef.current) {
                clearInterval(positionUpdateIntervalRef.current);
                positionUpdateIntervalRef.current = null;
              }

              // Clear any existing event listeners
              eventListenersRef.current.forEach(unlisten => unlisten());
              eventListenersRef.current = [];

              // Set up event listeners for position updates (much more efficient than polling)
              const unlistenPosition = await listen<{ position: number; duration: number; isPlaying: boolean }>(
                'exoplayer:time_update',
                (event) => {
                  if (!isMountedRef.current) return;
                  const { position, duration: dur, isPlaying } = event.payload;

                  // Always update refs for accurate tracking
                  currentTimeRef.current = position;
                  durationRef.current = dur;
                  lastTimeUpdateRef.current = Date.now();

                  // Throttle UI updates to prevent render storms (max once per RENDER_THROTTLE)
                  if (Date.now() - lastRenderRef.current > RENDER_THROTTLE) {
                    lastRenderRef.current = Date.now();
                    setCurrentTime(position);
                    setDuration(dur);
                  }
                  setIsPaused(!isPlaying);
                }
              );
              // Check if component is still active before adding listener
              if (!isActiveRef.current) {
                unlistenPosition();
                return;
              }
              eventListenersRef.current.push(unlistenPosition);

              const unlistenPlaybackState = await listen<{ state: string }>(
                'exoplayer:playback_state',
                (event) => {
                  if (!isMountedRef.current) return;
                  const { state } = event.payload;
                  console.log('Playback state changed:', state);
                  if (state === 'playing') {
                    setStreamState('playing');
                    setStatusMsg('');
                  } else if (state === 'paused') {
                    setIsPaused(true);
                  }
                }
              );
              if (!isActiveRef.current) {
                unlistenPlaybackState();
                return;
              }
              eventListenersRef.current.push(unlistenPlaybackState);

              const unlistenError = await listen<{ errorCode: number; errorMessage: string }>(
                'exoplayer:error',
                (event) => {
                  if (!isMountedRef.current) return;
                  const { errorMessage } = event.payload;
                  console.error('ExoPlayer error event:', errorMessage);
                  setStreamState('dead');
                  setErrorMsg(errorMessage);
                }
              );
              if (!isActiveRef.current) {
                unlistenError();
                return;
              }
              eventListenersRef.current.push(unlistenError);

              retryCountRef.current = 0;
              setStreamState('playing');
              setStatusMsg('');
              success = true;
              break;

            } catch (err) {
              console.error(`❌ Attempt ${retryLoop + 1} for URL ${urlIdxLoop} failed:`, err);
              lastError = err as Error;

              // Clear timeout on error
              if (connTimeoutRef.current) {
                clearTimeout(connTimeoutRef.current);
                connTimeoutRef.current = null;
              }

              // Hard stop to prevent zombie invoke after timeout
              try {
                await invoke('exoplayer_stop');
              } catch (stopErr) {
                console.error('Failed to stop player after timeout:', stopErr);
              }

              // If this was a timeout and we have retries left, continue to next retry
              if (retryLoop < MAX_RETRIES_PER_URL - 1) {
                setStreamState('retrying');
                // Small delay before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
            }

            // If we got here, this URL failed all retries
            break;
          }

          // If we succeeded, break the outer loop
          if (success) {
            break;
          }
        }

        // If we exhausted all URLs without success
        if (!success && isMountedRef.current && requestId === requestIdRef.current) {
          console.log('💀 All URLs exhausted');
          setStreamState('dead');
          setErrorMsg(lastError?.message || 'All streams failed');
        }
      } finally {
        // Always release the lock
        lockRef.current = null;
      }
    })();

    return lockRef.current;
  }, [clearAllTimers]);

  const handleManualRetry = useCallback((preserveIndex = false) => {
    if (Date.now() - lastManualRetryRef.current < 2000) return;
    lastManualRetryRef.current = Date.now();

    if (!preserveIndex) {
      currentIdxRef.current = 0;
      retryCountRef.current = 0;
      setCurrentUrlIdx(0);
    }

    setTotalRetries(0);
    loadUrl(currentIdxRef.current, 0);
  }, [loadUrl]);

  const isLoading = streamState === 'connecting' || streamState === 'retrying' || streamState === 'stalled';

  // Stall detection watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      if (streamStateRef.current !== 'playing') return;
      if (isPausedRef.current) return; // Don't trigger stall when paused

      const now = Date.now();
      if (now - lastTimeUpdateRef.current > STALL_TIMEOUT) {
        if (now - lastRetryRef.current < 10000) return;
        lastRetryRef.current = now;

        console.warn(`⚠️ Stream stalled - no time update for ${STALL_TIMEOUT / 1000}s`);
        setStreamState('stalled');
        handleManualRetry(true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [handleManualRetry]);

  const setAudioTrack = useCallback(async (id: string) => {
    try {
      await invoke('exoplayer_set_track', { trackId: Number.parseInt(id), trackType: 'audio' });
      setCurrentAudioId(id);
    } catch (e) { console.error('Set audio track failed:', e); }
  }, []);

  const setSubTrack = useCallback(async (id: string) => {
    try {
      await invoke('exoplayer_set_track', { trackId: id === 'no' ? -1 : Number.parseInt(id), trackType: 'text' });
      setCurrentSubId(id === 'no' ? null : id);
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
    currentTime,
    duration,
    isPaused,
    isLoading,
    currentAudioId,
    currentSubId,
    handleManualRetry,
    loadUrl,
    cleanup,
    setAudioTrack,
    setSubTrack,
  };
}

// ─── Hook: useExoPlayerControls ───────────────────────────────────────────────

interface UseExoPlayerControlsReturn {
  volume: number;
  isFullscreen: boolean;
  showUi: boolean;
  handleMouseMove: () => void;
  handlePlayPause: () => Promise<void>;
  handleStop: (onClose: () => void) => Promise<void>;
  handleFullscreen: () => Promise<void>;
  handleClose: (onClose: () => void) => Promise<void>;
  handleVolumeChange: (newVol: number) => Promise<void>;
  handleSeek: (seconds: number) => Promise<void>;
  seekTo: (targetTime: number, duration: number) => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

function useExoPlayerControls(): UseExoPlayerControlsReturn {
  const [volume, setVolume] = useState(80);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
      // For Android TV, fullscreen is handled by the system
      setIsFullscreen(!isFullscreen);
      setShowUi(!isFullscreen);
    } catch (e) { console.error('Fullscreen failed:', e); }
  }, [isFullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (!isFullscreen) return;
    try {
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
      // Toggle play/pause via ExoPlayer
      const isPlayingResult = await invoke('exoplayer_is_playing') as any;
      if (isPlayingResult?.isPlaying) {
        await invoke('exoplayer_pause');
      } else {
        await invoke('exoplayer_resume');
      }
    } catch (e) { console.error('Play/Pause failed:', e); }
  }, []);

  const handleStop = useCallback(async (onClose: () => void) => {
    try {
      await invoke('exoplayer_stop');
      await exitFullscreen();
      onClose();
    } catch (e) { console.error('Stop failed:', e); }
  }, [exitFullscreen]);

  const handleVolumeChange = useCallback(async (newVol: number) => {
    try {
      await invoke('exoplayer_set_volume', { volume: newVol / 100 });
      setVolume(newVol);
    } catch (e) { console.error('Volume failed:', e); }
  }, []);

  const handleSeek = useCallback(async (seconds: number) => {
    try {
      await invoke('exoplayer_seek', { position: seconds });
    } catch (e) { console.error('Seek failed:', e); }
  }, []);

  const seekTo = useCallback(async (targetTime: number, duration: number) => {
    if (!duration) return;
    try {
      await invoke('exoplayer_seek', { position: targetTime });
    } catch (e) { console.error('SeekTo failed:', e); }
  }, []);

  return {
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
  totalRetries: number;
  currentUrlIdx: number;
  urlCount: number;
  currentProgram: Pick<StalkerEPG, 'name' | 'description' | 'start_time' | 'end_time' | 'year' | 'rating'> | null;
  isVod: boolean;
  isLoading: boolean;
  statusMsg: string;
  isFullscreen: boolean;
  showUi: boolean;
  onClose: () => void;
}

const STATE_COLOR: Record<StreamState, string> = {
  connecting: '#888780', playing: '#1D9E75', stalled: '#BA7517', retrying: '#D85A30', dead: '#A32D2D',
};
const STATE_LABEL: Record<StreamState, string> = {
  connecting: 'Connecting', playing: 'Live', stalled: 'Stalled', retrying: 'Retrying', dead: 'Dead',
};

const PlayerHeader: React.FC<PlayerHeaderProps> = ({
  name, streamState, totalRetries, currentUrlIdx, urlCount,
  currentProgram, isVod, isLoading, statusMsg, isFullscreen, showUi, onClose
}) => {
  if (isFullscreen && !showUi) return null;

  return (
    <div className="flex-shrink-0 px-4 py-3 z-10"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
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
          }}>{STATE_LABEL[streamState]}</span>
          <span className="text-sm px-3 py-1 rounded-full flex-shrink-0"
            style={{ background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
            ExoPlayer
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {totalRetries > 0 && (
            <span className="text-xs text-gray-500">{totalRetries} retry{totalRetries !== 1 ? 's' : ''}</span>
          )}
          {currentUrlIdx > 0 && (
            <span className="text-xs text-yellow-500">fallback {currentUrlIdx}/{urlCount - 1}</span>
          )}
          {!isFullscreen && (
            <button onClick={onClose} aria-label="Close" data-tv-focusable tabIndex={0}
              className="text-gray-400 hover:text-white transition-colors text-xl leading-none">✕</button>
          )}
        </div>
      </div>

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

      {currentProgram && !isVod && (
        <div className="flex items-center gap-2 mt-1 ml-[22px]">
          <span className="text-xs text-gray-500">
            {formatEPGTime(currentProgram.start_time)} - {formatEPGTime(currentProgram.end_time)}
          </span>
          <EPGProgress startTime={Number.parseInt(currentProgram.start_time)} endTime={Number.parseInt(currentProgram.end_time)} />
        </div>
      )}

      {isLoading && statusMsg && (
        <p className="mt-1.5 text-gray-400 text-xs ml-[22px]">{statusMsg}</p>
      )}
    </div>
  );
};

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
}

const PlayerControls = React.memo<PlayerControlsProps>(({
  isVod, streamState, isFullscreen, showUi, isPaused, volume,
  currentTime, duration, onPlayPause, onStop, onFullscreen, onClose,
  onVolumeChange, onProgressClick
}) => {
  if (streamState !== 'playing' || (isFullscreen && !showUi)) return null;

  return (
    <div className="flex-shrink-0 z-20"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
        padding: '16px 20px 20px',
      }}>
      <div className="flex items-center justify-between">
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
        </div>

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

        <div className="flex items-center gap-2 max-w-[140px] mr-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <input type="range" min="0" max="100" value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'white' }} />
        </div>

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

// ─── Main Component ───────────────────────────────────────────────────────────
export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  url, fallbackUrls = [], name = 'Stream', channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, onClose,
}) => {
  const { setPosition } = useResumeStore();
  const exo = useExoPlayer(url, fallbackUrls, isVod, movieId, resumePosition, setPosition);
  const controls = useExoPlayerControls();
  const controlsRef = useRef(controls);
  useEffect(() => { controlsRef.current = controls; }, [controls]);

  // Android TV navigation with DPAD focus management and BACK button handling
  useTVNavigation({
    selector: '[data-tv-focusable]',
    onBack: () => {
      if (controls.isFullscreen) {
        void controls.handleFullscreen();
      } else {
        void controls.handleClose(onClose);
      }
    }
  });

  // EPG query for live TV
  const { data: channelEPG } = useChannelEPG(
    client, channelId ?? 0, name, 24, !isVod && !!channelId && !!client
  );

  const currentProgram = useMemo(() => channelEPG ? getCurrentProgram(channelEPG) : null, [channelEPG]);
  const hasResumedRef = useRef(false);

  const handleBeforeUnload = useCallback(() => {
    void exo.cleanup();
  }, [exo.cleanup]);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void exo.cleanup();
    };
  }, [handleBeforeUnload]);

  useEffect(() => {
    const { cleanup, loadUrl } = exo;
    hasResumedRef.current = false;

    let cancelled = false;

    void cleanup().then(() => {
      if (cancelled) return;

      exo.setStreamState('connecting');
      exo.setStatusMsg('Connecting…');
      void loadUrl(0, 0);
    });

    return () => {
      cancelled = true;
    };
  }, [url, fallbackUrls, resumePosition]);

  const { seekTo } = controls;
  useEffect(() => {
    if (isVod && resumePosition > 0 && exo.streamState === 'playing' && exo.duration > 0 && !hasResumedRef.current) {
      console.log('▶️ Resume seeking to:', resumePosition, 'duration:', exo.duration);
      hasResumedRef.current = true;
      const timer = setTimeout(() => {
        void seekTo(resumePosition, exo.duration);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isVod, resumePosition, exo.streamState, exo.duration, seekTo]);

  const allUrls = useMemo(() => [url, ...fallbackUrls], [url, fallbackUrls]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (controlsRef.current.isFullscreen) {
        void controlsRef.current.handleFullscreen();
      } else {
        void controlsRef.current.handleClose(onClose);
      }
    }
    if (e.key === 'f' || e.key === 'F') {
      void controlsRef.current.handleFullscreen();
    }
    if (e.key === 'ArrowLeft' && isVod) {
      e.preventDefault();
      void controlsRef.current.handleSeek(-10);
    }
    if (e.key === 'ArrowRight' && isVod) {
      e.preventDefault();
      void controlsRef.current.handleSeek(10);
    }
  }, [isVod, onClose]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVod || !exo.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * exo.duration;
    void controls.seekTo(targetTime, exo.duration);
  }, [isVod, exo.duration, controls.seekTo]);

  const handleStop = useCallback(() => {
    void controlsRef.current.handleStop(onClose);
  }, [onClose]);

  const handleClosePlayer = useCallback(() => {
    void controlsRef.current.handleClose(onClose);
  }, [onClose]);

  const handlePlayPause = useCallback(() => void controlsRef.current.handlePlayPause(), []);
  const handleVolumeChange = useCallback((v: number) => void controlsRef.current.handleVolumeChange(v), []);
  const handleFullscreen = useCallback(() => void controlsRef.current.handleFullscreen(), []);

  return (
    <main
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      role="dialog"
      onKeyDown={handleKeyDown}
      aria-modal="true"
      aria-labelledby="player-title"
      tabIndex={0}
    >
      <div
        className="relative w-full h-full flex flex-col"
        style={{ cursor: controls.isFullscreen && !controls.showUi ? 'none' : 'auto' }}
        onMouseMove={controls.handleMouseMove}
      >
        <PlayerHeader
          name={name}
          streamState={exo.streamState}
          totalRetries={exo.totalRetries}
          currentUrlIdx={exo.currentUrlIdx}
          urlCount={allUrls.length}
          currentProgram={currentProgram}
          isVod={isVod}
          isLoading={exo.isLoading || buffering}
          statusMsg={exo.statusMsg}
          isFullscreen={controls.isFullscreen}
          showUi={controls.showUi}
          onClose={handleClosePlayer}
        />

        <div className="flex-1 relative overflow-hidden bg-black">
          {(exo.isLoading || buffering) && exo.streamState !== 'playing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <svg className="animate-spin" style={{ width: 36, height: 36 }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#333" strokeWidth="2" />
                <path d="M12 2 A10 10 0 0 1 22 12" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="text-gray-300 text-sm">{exo.statusMsg}</p>
            </div>
          )}

          {exo.streamState === 'dead' && (
            <DeadState
              errorMsg={exo.errorMsg}
              onRetry={exo.handleManualRetry}
              onClose={handleClosePlayer}
            />
          )}
        </div>

        <PlayerControls
          isVod={isVod}
          streamState={exo.streamState}
          isFullscreen={controls.isFullscreen}
          showUi={controls.showUi}
          isPaused={exo.isPaused}
          volume={controls.volume}
          currentTime={exo.currentTime}
          duration={exo.duration}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onFullscreen={handleFullscreen}
          onClose={handleClosePlayer}
          onVolumeChange={handleVolumeChange}
          onProgressClick={handleProgressClick}
        />
      </div>
    </main>
  );
};
