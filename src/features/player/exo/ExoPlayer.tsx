// =========================
// 🎬 EXO PLAYER (Android TV Only)
// =========================

import React from 'react';
import { platform } from '@tauri-apps/plugin-os';
import { createLogger } from '@/lib/logger';
import { usePlaybackStore } from '@/store/playback.store';
import { usePortalsStore } from '@/store/portals.store';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { getChannelEPG, getCurrentProgram, getNextProgram, formatEPGTime } from '@/features/epg/epg.api';

const logger = createLogger('ExoPlayer');

// Helper to check if running on Android
const isAndroid = () => {
  try {
    return platform() === 'android';
  } catch {
    return false;
  }
};

// Helper to fetch EPG data for a channel
const fetchEPGData = async (channelId: number, isVod: boolean) => {
  if (isVod || !channelId) {
    return {};
  }

  try {
    const activePortal = usePortalsStore.getState().getActivePortal();
    if (!activePortal) {
      return {};
    }

    const client = new StalkerClient(activePortal as any);
    logger.info('[ExoPlayer] Fetching EPG data for channel:', channelId);
    const epg = await getChannelEPG(client, channelId);

    if (!epg || epg.length === 0) {
      return {};
    }

    const currentProgram = getCurrentProgram(epg);
    const nextProgram = getNextProgram(epg);

    const result: any = {};
    if (currentProgram) {
      result.epgTitle = currentProgram.name || '';
      result.epgStart = formatEPGTime(currentProgram.start_time);
      result.epgEnd = formatEPGTime(currentProgram.end_time);
      logger.info('[ExoPlayer] Current program:', result.epgTitle, result.epgStart, '-', result.epgEnd);
    }

    if (nextProgram) {
      result.epgNextTitle = nextProgram.name || '';
      result.epgNextStart = formatEPGTime(nextProgram.start_time);
      result.epgNextEnd = formatEPGTime(nextProgram.end_time);
      logger.info('[ExoPlayer] Next program:', result.epgNextTitle, result.epgNextStart);
    }

    return result;
  } catch (error) {
    logger.error('[ExoPlayer] Failed to fetch EPG data, continuing without EPG:', error);
    return {};
  }
};

// Helper to validate player params
const validatePlayerParams = (params: any) => {
  if (!params?.channelId || !params?.portalUrl || !params?.mac || !params?.token) {
    logger.error('[ExoPlayer] Invalid params object:', {
      hasParams: !!params,
      channelId: params?.channelId,
      portalUrl: params?.portalUrl,
      mac: params?.mac,
      token: params?.token
    });
    return false;
  }
  return true;
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
}

export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  url,
  name = 'Unknown Channel',
  channelId,
  isVod,
  onClose
}) => {
  React.useEffect(() => {
    const openNativePlayer = async () => {
      if (!isAndroid()) {
        logger.warn('ExoPlayer is only available on Android. Use MpvPlayer on desktop.');
        onClose();
        return;
      }

      const player = usePlaybackStore.getState().current;
      if (!player) {
        logger.error('[ExoPlayer] No player data in playback store, cannot open native player');
        onClose();
        return;
      }

      const portalUrl = player?.portalUrl || '';
      const mac = player?.mac || '';
      const token = player?.token || '';

      if (!portalUrl || !mac || !token) {
        logger.error('[ExoPlayer] Missing required player data: portalUrl, mac, or token');
        onClose();
        return;
      }

      const episodes = player?.episodes || [];
      const currentEpisodeIndex = player?.currentEpisodeIndex || 0;
      const autoPlayEpisodes = player?.autoPlayEpisodes ?? true;

      const epgData = await fetchEPGData(channelId || 0, isVod || false);

      const exoPlayer = (globalThis.window as any).ExoPlayer;
      if (!exoPlayer || typeof exoPlayer.open_compose_player !== 'function') {
        logger.error('ExoPlayer.open_compose_player method not available');
        onClose();
        return;
      }

      const params = {
        channelId: channelId?.toString() || '',
        portalUrl,
        mac,
        token,
        isVod: isVod || false,
        episodesJson: JSON.stringify(episodes),
        currentEpisodeIndex,
        autoPlayEpisodes,
        ...epgData
      };

      if (!validatePlayerParams(params)) {
        onClose();
        return;
      }

      try {
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
          params.autoPlayEpisodes,
          params.epgTitle || '',
          params.epgStart || '',
          params.epgEnd || '',
          params.epgNextTitle || '',
          params.epgNextStart || '',
          params.epgNextEnd || ''
        );
      } catch (error) {
        console.error('[ExoPlayer] Error calling open_compose_player:', error);
        logger.error(`Error calling open_compose_player: ${error}`);
        onClose();
      }
    };

    openNativePlayer();

    // Close immediately since native activity handles everything
    onClose();
  }, [url, name, channelId, isVod, onClose]);

  return null;
};
