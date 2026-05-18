// =========================
// 🎬 PLAYER — MPV Only
// =========================

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChannelEPG } from '@/features/epg/epg.hooks';
import { getCurrentProgram } from '@/features/epg/epg.api';
import { useResumeStore } from '@/store/resume.store';
import { PlayerProps } from './mpv.types';
import { useMpvPlayer } from './useMpvPlayer';
import { usePlayerControls } from './usePlayerControls';
import { PlayerHeader } from './components/PlayerHeader';
import { PlayerControls } from './components/PlayerControls';
import { DeadState } from './components/DeadState';
import { EPGDetailsModal } from './components/EPGDetailsModal';
import { useChannels } from '@/features/tv/tv.hooks';
import { StalkerChannel } from '@/types';

// ─── Main Component ───────────────────────────────────────────────────────────
export const MpvPlayer: React.FC<PlayerProps> = ({
  url, fallbackUrls = [], name, channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, genreId, onClose, onEnded, onChannelChange,
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

  // Fetch channels from the same category/genre (only for TV channels, not VOD/movies)
  const { data: categoryChannels } = useChannels(
    client!,
    isVod ? undefined : genreId,
    false, // Disable EPG prefetching when playing from for-you/recent-channels
    !isVod // Only enabled for TV (not VOD/movies)
  );
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

  const handleShowEPG = useCallback(() => {
    setShowEPGModal(true);
  }, []);

  const handleCloseEPGModal = useCallback(() => {
    setShowEPGModal(false);
  }, []);

  const handleChannelSelect = useCallback((channel: StalkerChannel) => {
    if (onChannelChange) {
      onChannelChange(channel);
    }
  }, [onChannelChange]);

  const handleClosePlayer = useCallback(() => {
    void controls.handleClose(onClose);
  }, [controls.handleClose, onClose]);

  const handlePlayPause = useCallback(() => void controls.handlePlayPause(), [controls.handlePlayPause]);
  const handleVolumeChange = useCallback((v: number) => void controls.handleVolumeChange(v), [controls.handleVolumeChange]);
  const handleSetAudioTrack = useCallback((id: string) => void mpv.setAudioTrack(id), [mpv.setAudioTrack]);
  const handleSetSubTrack = useCallback((id: string) => void mpv.setSubTrack(id), [mpv.setSubTrack]);
  const handleFullscreen = useCallback(() => void controls.handleFullscreen(), [controls.handleFullscreen]);
  const handlePip = useCallback(() => void controls.handlePip(), [controls.handlePip]);
  const handleSeekToBeginning = useCallback(() => void controls.seekTo(0, mpv.duration), [controls.seekTo, mpv.duration]);

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
        {!controls.isPip ? (
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
        ) : (
          <button
            onClick={handlePip}
            className="absolute bottom-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
            title="Exit PiP"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
            </svg>
          </button>
        )}

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

        {!controls.isPip && (
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
            onFullscreen={handleFullscreen}
            onPip={handlePip}
            onClose={handleClosePlayer}
            onVolumeChange={handleVolumeChange}
            onProgressClick={handleProgressClick}
            onShowEPG={handleShowEPG}
            onSetAudioTrack={handleSetAudioTrack}
            onSetSubTrack={handleSetSubTrack}
            onSeekToBeginning={handleSeekToBeginning}
            categoryChannels={!isVod && genreId ? categoryChannels : undefined}
            currentChannelId={channelId}
            onChannelSelect={handleChannelSelect}
          />
        )}

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
