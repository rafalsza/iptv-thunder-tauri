// =========================
// 🎬 EXO PLAYER (Android TV Only)
// =========================

import React from 'react';
import { platform } from '@tauri-apps/plugin-os';
import { createLogger } from '@/lib/logger';
import { usePlaybackStore } from '@/store/playback.store';

const logger = createLogger('ExoPlayer');

// Helper to check if running on Android
const isAndroid = () => {
  try {
    return platform() === 'android';
  } catch {
    return false;
  }
};

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
  onEnded?: () => void;
}

export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  url,
  name = 'Unknown Channel',
  channelId,
  isVod,
  onClose
}) => {
  React.useEffect(() => {
    if (!isAndroid()) {
      logger.warn('ExoPlayer is only available on Android. Use MpvPlayer on desktop.');
      onClose();
      return;
    }

    // Call native method to open NativePlayerActivity
    const openNativePlayer = () => {
      const exoPlayer = (globalThis.window as any).ExoPlayer;
      if (exoPlayer && typeof exoPlayer.open_compose_player === 'function') {

        // Get credentials and episode data from playback store (set by usePlaybackManager)
        const player = usePlaybackStore.getState().current;
        const portalUrl = player?.portalUrl || '';
        const mac = player?.mac || '';
        const token = player?.token || '';
        const episodes = player?.episodes || [];
        const currentEpisodeIndex = player?.currentEpisodeIndex || 0;
        const autoPlayEpisodes = player?.autoPlayEpisodes ?? true;

        // Create PlayerParams object
        const params = {
          channelId: channelId?.toString() || '',
          portalUrl,
          mac,
          token,
          isVod: isVod || false,
          episodesJson: JSON.stringify(episodes),
          currentEpisodeIndex,
          autoPlayEpisodes,
        };

        try {
          exoPlayer.open_compose_player(url, name, params);
        } catch (error) {
          console.error('[ExoPlayer] Error calling open_compose_player:', error);
          logger.error(`Error calling open_compose_player: ${error}`);
        }
      } else {
        logger.error('ExoPlayer.open_compose_player method not available');
        onClose();
      }
    };

    openNativePlayer();

    // Close immediately since native activity handles everything
    onClose();
  }, [url, name, channelId, isVod, onClose]);

  return null;
};
