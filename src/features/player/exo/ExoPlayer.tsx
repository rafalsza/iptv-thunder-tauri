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
import { useChannels } from '@/features/tv/tv.hooks';

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
  genreId?: string;
  onChannelChange?: (channel: any) => void;
  onClose: () => void;
  onEnded?: () => void;
}

export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  url,
  name = 'Unknown Channel',
  channelId,
  isVod,
  genreId,
  client,
  onClose,
  onEnded: _onEnded
}) => {
  // Fetch channels from the same category/genre for carousel (only for TV channels, not VOD/movies)
  const { data: categoryChannels, isLoading: channelsLoading } = useChannels(
    client!,
    isVod ? undefined : genreId,
    false // Disable EPG prefetching when playing from for-you/recent-channels
  );

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

      // Filter channels for carousel (exclude hidden channels starting with #####)
      const filteredChannels = categoryChannels?.filter((channel: any) => !channel.name.startsWith('#####')) || [];

      // Resolve stream URLs for channels (convert ffmpeg commands to actual URLs)
      const channelsWithUrls = await Promise.all(
        filteredChannels.map(async (channel: any) => {
          let streamUrl = channel.cmd;
          // If cmd is a ffmpeg/vlc command, try to resolve it
          if (streamUrl && (streamUrl.startsWith('ffmpeg ') || streamUrl.startsWith('vlc ') || streamUrl.startsWith('ffplay '))) {
            try {
              streamUrl = await client.getStreamUrl(streamUrl, {
                genreId: channel.tv_genre_id?.toString() || channel.genreId?.toString()
              });
            } catch (e) {
              logger.warn('[ExoPlayer] Failed to resolve stream URL for channel:', channel.name, e);
              streamUrl = ''; // Mark as unavailable
            }
          }
          return {
            ...channel,
            stream_url: streamUrl
          };
        })
      );

      // Filter out channels that couldn't be resolved
      const resolvedChannels = channelsWithUrls.filter((ch: any) => ch.stream_url && ch.stream_url.length > 0);

      logger.info('[ExoPlayer] Channel data: isVod=' + isVod + ', genreId=' + genreId + ', channelsLoading=' + channelsLoading + ', categoryChannels count=' + (categoryChannels?.length || 0) + ', filtered count=' + filteredChannels.length + ', resolved count=' + resolvedChannels.length);

      const exoPlayer = (globalThis.window as any).ExoPlayer;
      if (!exoPlayer || typeof exoPlayer.open_compose_player !== 'function') {
        logger.error('ExoPlayer.open_compose_player method not available');
        onClose();
        return;
      }

      const params = {
        url,
        channelName: name,
        channelId: channelId?.toString() || '',
        portalUrl,
        mac,
        token,
        isVod: isVod || false,
        episodesJson: JSON.stringify(episodes),
        currentEpisodeIndex,
        autoPlayEpisodes,
        channelsJson: JSON.stringify(resolvedChannels),
        ...epgData
      };

      if (!validatePlayerParams(params)) {
        onClose();
        return;
      }

      try {
        exoPlayer.open_compose_player(JSON.stringify(params));
      } catch (error) {
        console.error('[ExoPlayer] Error calling open_compose_player:', error);
        logger.error(`Error calling open_compose_player: ${error}`);
        onClose();
      }
    };

    // Wait for channels to load before opening player
    if (!channelsLoading) {
      openNativePlayer();
      onClose();
    }
  }, [url, name, channelId, isVod, genreId, client, categoryChannels, channelsLoading, onClose]);

  return null;
};
