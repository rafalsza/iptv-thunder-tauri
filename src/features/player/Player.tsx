// =========================
// 🎬 PLAYER — Platform-Aware Wrapper
// =========================

import React from 'react';
import { MpvPlayer } from './mpv/MpvPlayer';
import { ExoPlayer } from './exo/ExoPlayer';
import { useResumeStore } from '@/store/resume.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerProps {
  url: string;
  fallbackUrls?: string[];
  name: string;
  channelId?: number;
  client?: any;
  buffering?: boolean;
  isVod?: boolean;
  movieId?: string;
  resumePosition?: number;
  onClose: () => void;
  onEnded?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const Player: React.FC<PlayerProps> = ({
  url, fallbackUrls = [], name, channelId, client, buffering = false, isVod = false, movieId, resumePosition = 0, onClose, onEnded,
}) => {
  const { setPosition } = useResumeStore();

  // Detect platform - use ExoPlayer for Android TV, MPV for desktop
  const platform = globalThis.__TAURI__?.__currentWindow?.label?.includes('android') ? 'android' : 'desktop';

  if (platform === 'android') {
    return (
      <ExoPlayer
        url={url}
        fallbackUrls={fallbackUrls}
        isVod={isVod}
        movieId={movieId}
        resumePosition={resumePosition}
        setPosition={setPosition}
        onClose={onClose}
        onEnded={onEnded}
      />
    );
  }

  return (
    <MpvPlayer
      url={url}
      fallbackUrls={fallbackUrls}
      name={name}
      channelId={channelId}
      client={client}
      buffering={buffering}
      isVod={isVod}
      movieId={movieId}
      resumePosition={resumePosition}
      onClose={onClose}
      onEnded={onEnded}
    />
  );
};
