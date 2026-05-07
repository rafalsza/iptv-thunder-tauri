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
        
        // 🔥 CRITICAL: Validate player data exists
        if (!player) {
          logger.error('[ExoPlayer] No player data in playback store, cannot open native player');
          onClose();
          return;
        }

        const portalUrl = player?.portalUrl || '';
        const mac = player?.mac || '';
        const token = player?.token || '';
        const episodes = player?.episodes || [];
        const currentEpisodeIndex = player?.currentEpisodeIndex || 0;
        const autoPlayEpisodes = player?.autoPlayEpisodes ?? true;

        // 🔥 CRITICAL: Validate required fields
        if (!portalUrl || !mac || !token) {
          logger.error('[ExoPlayer] Missing required player data: portalUrl, mac, or token');
          onClose();
          return;
        }

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

        // 🔥 CRITICAL: Final validation of params object
        if (!params?.channelId || !params?.portalUrl || !params?.mac || !params?.token) {
          logger.error('[ExoPlayer] Invalid params object:', {
            hasParams: !!params,
            channelId: params?.channelId,
            portalUrl: params?.portalUrl,
            mac: params?.mac,
            token: params?.token
          });
          onClose();
          return;
        }

        try {
          // Pass individual parameters instead of object (Kotlin JavaScriptInterface doesn't deserialize objects to data classes)
          exoPlayer.open_compose_player(
            url,
            name,
            params.channelId,
            params.portalUrl,
            params.mac,
            params.token,
            params.isVod,
            params.episodesJson,
            params.currentEpisodeIndex,
            params.autoPlayEpisodes
          );
        } catch (error) {
          console.error('[ExoPlayer] Error calling open_compose_player:', error);
          logger.error(`Error calling open_compose_player: ${error}`);
          onClose();
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
