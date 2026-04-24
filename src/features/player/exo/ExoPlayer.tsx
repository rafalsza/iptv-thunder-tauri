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
      const exoPlayer = (window as any).ExoPlayer;
      console.log('[ExoPlayer] window.ExoPlayer:', exoPlayer);
      console.log('[ExoPlayer] window.ExoPlayer.open_compose_player:', exoPlayer?.open_compose_player);
      if (exoPlayer && typeof exoPlayer.open_compose_player === 'function') {
        logger.info(`Opening native player: ${name}`);

        // Get credentials from playback store (set by usePlaybackManager)
        const player = usePlaybackStore.getState().current;
        const portalUrl = player?.portalUrl || '';
        const mac = player?.mac || '';
        const token = player?.token || '';

        logger.info(`Credentials from store - portalUrl: ${portalUrl ? portalUrl : 'EMPTY'}, mac: ${mac ? mac : 'EMPTY'}, token: ${token ? 'SET' : 'EMPTY'}`);
        console.log(`[ExoPlayer] Calling native with: url=${url}, name=${name}, channelId=${channelId}, portalUrl=${portalUrl}, mac=${mac}, token=${token ? 'SET' : 'EMPTY'}, isVod=${isVod}`);

        try {
          exoPlayer.open_compose_player(url, name, channelId?.toString() || '', portalUrl, mac, token, isVod || false);
          console.log('[ExoPlayer] open_compose_player call succeeded');
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
