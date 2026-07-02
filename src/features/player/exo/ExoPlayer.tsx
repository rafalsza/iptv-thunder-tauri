// =========================
// 🎬 EXO PLAYER (Android TV Only)
// =========================

import React, { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { createLogger } from '@/lib/logger';
import { usePlaybackStore } from '@/store/playback.store';
import { usePortalsStore } from '@/store/portals.store';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { getChannelEPG, getCurrentProgram, getNextProgram } from '@/features/epg/epg.api';
import { useChannels } from '@/features/tv/tv.hooks';
import { useRecentViewed } from '@/hooks/useRecentItems';

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
const fetchEPGData = async (channelId: number, isVod: boolean, channelName?: string) => {
  if (isVod || !channelId) {
    return {};
  }

  try {
    const activePortal = usePortalsStore.getState().getActivePortal();
    if (!activePortal) {
      return {};
    }

    const effectiveEpgUrl = usePortalsStore.getState().getEffectiveEpgUrl();
    logger.info('[ExoPlayer] fetchEPGData: channelId=' + channelId + ', channelName=' + channelName + ', effectiveEpgUrl=' + effectiveEpgUrl);

    let epg;
    if (effectiveEpgUrl && channelName) {
      logger.info('[ExoPlayer] Using external EPG: ' + effectiveEpgUrl);
      // Always use Rust-side parsing - it caches XML and returns only matching programs
      const programs = await invoke('fetch_epg_for_channel', {
        url: effectiveEpgUrl,
        channelName: channelName,
      }) as Array<{ title: string; start: string; stop: string; desc: string; category: string }>;

      // Convert XMLTV time format (e.g. "20260126180000 +0100") to unix timestamp seconds
      const parseXmltvTime = (t: string): number => {
        // Format: YYYYMMDDHHmmss [timezone offset like +0100 or -0500]
        const m = t.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
        if (!m) return 0;
        const [, y, mo, d, h, mi, s, tz] = m;
        // Build ISO string with timezone if present, otherwise use local time
        if (tz) {
          const tzSign = tz[0];
          const tzH = tz.slice(1, 3);
          const tzM = tz.slice(3, 5);
          const isoTz = `${tzSign}${tzH}:${tzM}`;
          return Math.floor(new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${isoTz}`).getTime() / 1000);
        }
        // No timezone in XMLTV - treat as UTC
        return Math.floor(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) / 1000);
      };

      epg = programs.map((p) => ({
        id: 0,
        name: p.title,
        start_time: String(parseXmltvTime(p.start)),
        end_time: String(parseXmltvTime(p.stop)),
        description: p.desc,
        category: p.category,
        channel_id: channelId,
      }));
    } else {
      logger.info('[ExoPlayer] Using internal EPG (portal API)');
      const client = StalkerClient.getOrCreate(activePortal as any);
      epg = await getChannelEPG(client, channelId);
    }

    if (!epg || epg.length === 0) {
      logger.warn('[ExoPlayer] No EPG data returned for channelId=' + channelId);
      return {};
    }

    const currentProgram = getCurrentProgram(epg);
    const nextProgram = getNextProgram(epg);

    const result: any = {};
    if (currentProgram) {
      result.epgTitle = currentProgram.name || '';
      result.epgStart = currentProgram.start_time || '';
      result.epgEnd = currentProgram.end_time || '';
      result.epgCategory = currentProgram.category || '';
      result.epgDesc = currentProgram.description || '';
      logger.info('[ExoPlayer] Current program:', result.epgTitle, result.epgStart, '-', result.epgEnd, result.epgCategory);
    }

    if (nextProgram) {
      result.epgNextTitle = nextProgram.name || '';
      result.epgNextStart = nextProgram.start_time || '';
      result.epgNextEnd = nextProgram.end_time || '';
      result.epgNextCategory = nextProgram.category || '';
      logger.info('[ExoPlayer] Next program:', result.epgNextTitle, result.epgNextStart, result.epgNextCategory);
    }

    // Include full program list for Android auto-refresh
    result.epgProgramsJson = JSON.stringify(epg.map(p => ({
      title: p.name || '',
      start: p.start_time || '',
      end: p.end_time || '',
      category: p.category || '',
      desc: p.description || '',
    })));

    return result;
  } catch (error) {
    logger.error('[ExoPlayer] Failed to fetch EPG data, continuing without EPG:', error);
    return {};
  }
};

// Helper to validate player params
const validatePlayerParams = (params: any) => {
  if (!params?.url) {
    logger.error('[ExoPlayer] Invalid params: missing url');
    return false;
  }
  return true;
};

// Helper to refresh EPG data periodically
const refreshEpgData = async (channelId: number, channelName?: string) => {
  try {
    const epgData = await fetchEPGData(channelId, false, channelName);
    if (!epgData || Object.keys(epgData).length === 0) {
      return;
    }

    const exoPlayer = (globalThis.window as any).ExoPlayer;
    if (!exoPlayer || typeof exoPlayer.update_epg !== 'function') {
      return;
    }

    exoPlayer.update_epg(
      epgData.epgTitle || '',
      epgData.epgStart || '',
      epgData.epgEnd || '',
      epgData.epgNextTitle || '',
      epgData.epgNextStart || '',
      epgData.epgNextEnd || '',
      epgData.epgCategory || '',
      epgData.epgNextCategory || '',
      epgData.epgDesc || ''
    );
    logger.info('[ExoPlayer] EPG data refreshed and sent to Android player');
  } catch (e) {
    logger.warn('[ExoPlayer] Periodic EPG refresh failed:', e);
  }
};

export interface ExoPlayerProps {
  url: string;
  name?: string;
  channelId?: number;
  client?: any;
  isVod?: boolean;
  movieId?: string;
  resumePosition?: number;
  setPosition: (id: string, pos: number, duration?: number) => void;
  genreId?: string;
  onClose: () => void;
  onEnded?: () => void;
}

export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  url,
  name = 'Unknown Channel',
  channelId,
  isVod,
  movieId,
  resumePosition = 0,
  genreId,
  client,
  setPosition,
  onClose,
  onEnded: _onEnded
}) => {
  // Fetch channels from the same category/genre for carousel (only for TV channels, not VOD/movies)
  // Only enable when we have a valid genreId
  const { data: categoryChannels } = useChannels(
    client!,
    isVod ? undefined : genreId,
    false, // Disable EPG prefetching when playing from for-you/recent-channels
    !isVod && !!genreId // Only enabled for TV when we have a valid genreId
  );
  
  logger.info('[ExoPlayer] categoryChannels:', categoryChannels?.length || 0, 'genreId:', genreId);

  // Fetch recent channels for quick switching
  const activePortalId = usePortalsStore(s => s.activePortalId);
  const { recentItems: recentLiveItems } = useRecentViewed(activePortalId || '', 'live', 20);

  // Convert recent items to channel format for player
  const recentChannels = useMemo(() => {
    return recentLiveItems
      .filter(item => item.type === 'live' && item.cmd)
      .map(item => ({
        id: Number(item.item_id) || 0,
        name: item.name,
        cmd: item.cmd || '',
        logo: item.poster,
        number: 0,
        censored: false,
        tv_genre_id: item.genre_id ? Number.parseInt(item.genre_id) : undefined,
      }));
  }, [recentLiveItems]);

  // Use refs to avoid triggering useEffect when channel data changes
  const categoryChannelsRef = React.useRef(categoryChannels);
  const recentChannelsRef = React.useRef(recentChannels);

  React.useEffect(() => {
    categoryChannelsRef.current = categoryChannels;
  }, [categoryChannels]);

  React.useEffect(() => {
    recentChannelsRef.current = recentChannels;
  }, [recentChannels]);

  const hasOpenedRef = React.useRef(false);
  const lastChannelIdRef = React.useRef<number | undefined>(undefined);
  const [playerOpened, setPlayerOpened] = React.useState(false);
  const lastSavedMovieIdRef = React.useRef<string | null>(null);
  const epgIntervalRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register onChannelChange bridge for Android player - resolves URL when user switches channel
  React.useEffect(() => {
    if (!isAndroid()) return;

    if ((globalThis.window as any).onChannelChange) return;

    (globalThis.window as any).onChannelChange = async (channelId: number, cmd: string, name: string, genreId: string): Promise<string> => {
      try {
        logger.info('[ExoPlayer] onChannelChange called for channel:', channelId, name);

        if (!client) {
          logger.error('[ExoPlayer] No client for onChannelChange');
          return cmd;
        }

        // Resolve URL using create_link (this triggers the single create_link request)
        let streamUrl = cmd;
        if (cmd && (cmd.startsWith('ffmpeg ') || cmd.startsWith('vlc ') || cmd.startsWith('ffplay '))) {
          try {
            streamUrl = await client.getStreamUrl(cmd, { genreId });
            logger.info('[ExoPlayer] URL resolved for channel:', channelId, name);
          } catch (e) {
            logger.warn('[ExoPlayer] Failed to resolve URL for channel:', channelId, e);
            streamUrl = '';
          }
        }

        // Do NOT call React onChannelChange here on Android.
        // It triggers handleChannelSelect → play() → getStreamUrl() → duplicate create_link → HTTP 429.
        // Android native player handles channel switching entirely via set_resolved_url.

        // EPG is fetched via onPlayerReady callback from Android after channel change.
        // Do NOT await EPG here - it blocks the URL return and prevents channel switching.

        // Update periodic EPG refresh to use the new channelId
        if (epgIntervalRef.current) {
          clearInterval(epgIntervalRef.current);
        }
        epgIntervalRef.current = setInterval(() => refreshEpgData(channelId, name), 30000);

        return streamUrl;
      } catch (e) {
        logger.error('[ExoPlayer] onChannelChange failed:', e);
        return cmd;
      }
    };

    logger.info('[ExoPlayer] onChannelChange bridge registered globally');
  }, [client]);

  // Register onEpgRequest bridge - called by Android when player is ready
  // Android calls this via evaluateJavascript, which wakes up JS even when WebView is paused
  React.useEffect(() => {
    if (!isAndroid()) return;

    if ((globalThis.window as any).onEpgRequest) return;

    let epgRequestToken = 0;
    (globalThis.window as any).onEpgRequest = async (channelId: number, channelName: string): Promise<void> => {
      const myToken = ++epgRequestToken;
      const sendEpg = (epgData: any) => {
        if (myToken !== epgRequestToken) {
          logger.info('[ExoPlayer] onEpgRequest: stale request, ignoring for channel:', channelName);
          return false;
        }
        const exoPlayer = (globalThis.window as any).ExoPlayer;
        if (!exoPlayer || !epgData) return false;
        let sent = false;
        if (epgData.epgProgramsJson) {
          exoPlayer.update_epg_list(epgData.epgProgramsJson);
          logger.info('[ExoPlayer] onEpgRequest: sent EPG list');
          sent = true;
        }
        if (epgData.epgTitle) {
          exoPlayer.update_epg(
            epgData.epgTitle || '',
            epgData.epgStart || '',
            epgData.epgEnd || '',
            epgData.epgNextTitle || '',
            epgData.epgNextStart || '',
            epgData.epgNextEnd || '',
            epgData.epgCategory || '',
            epgData.epgNextCategory || '',
            epgData.epgDesc || ''
          );
          logger.info('[ExoPlayer] onEpgRequest: sent current/next EPG:', epgData.epgTitle);
          sent = true;
        }
        return sent;
      };

      // Retry up to 5 times with 3s delay — XMLTV prefetch may still be downloading
      for (let attempt = 1; attempt <= 5; attempt++) {
        if (myToken !== epgRequestToken) {
          logger.info('[ExoPlayer] onEpgRequest: aborted stale request for channel:', channelName);
          return;
        }
        try {
          logger.info('[ExoPlayer] onEpgRequest attempt ' + attempt + ' for channel:', channelId, channelName);
          const epgData = await fetchEPGData(channelId, false, channelName);
          if (myToken !== epgRequestToken) {
            logger.info('[ExoPlayer] onEpgRequest: aborted stale request after fetch for channel:', channelName);
            return;
          }
          if (sendEpg(epgData)) {
            return; // Success
          }
          logger.warn('[ExoPlayer] onEpgRequest: no EPG data on attempt ' + attempt);
        } catch (e) {
          logger.error('[ExoPlayer] onEpgRequest attempt ' + attempt + ' failed:', e);
        }
        if (attempt < 5) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      logger.warn('[ExoPlayer] onEpgRequest: gave up after 5 attempts for channel:', channelName);
    };

    logger.info('[ExoPlayer] onEpgRequest bridge registered globally');
  }, []);

  // Register onSavePosition bridge for Android player - saves position when player closes
  React.useEffect(() => {
    if (!isAndroid()) return;

    if ((globalThis.window as any).onSavePosition) return;

    (globalThis.window as any).onSavePosition = (movieId: string, time: number, duration: number) => {
      try {
        logger.info('[ExoPlayer] onSavePosition called:', { movieId, time, duration });

        // Prevent saving the same movieId twice (e.g., when autoplay changes episode)
        if (lastSavedMovieIdRef.current === movieId) {
          logger.info('[ExoPlayer] Skipping save - already saved for:', movieId);
          return;
        }

        // Only save if watched more than 30 seconds
        if (time > 30 && movieId && setPosition) {
          setPosition(movieId, time, duration);
          lastSavedMovieIdRef.current = movieId;
          logger.info('[ExoPlayer] Position saved for:', movieId);
        }
      } catch (e) {
        logger.error('[ExoPlayer] onSavePosition failed:', e);
      }
    };

    logger.info('[ExoPlayer] onSavePosition bridge registered globally');
  }, [setPosition]);

  // Register onPlayerClosed bridge - called by Android when native player is destroyed (back button)
  React.useEffect(() => {
    if (!isAndroid()) return;

    (globalThis.window as any).onPlayerClosed = () => {
      logger.info('[ExoPlayer] onPlayerClosed called from native');
      onClose();
    };

    logger.info('[ExoPlayer] onPlayerClosed bridge registered globally');
  }, [onClose]);

  // Open native player first
  React.useEffect(() => {
    // Skip when URL is empty - player is waiting for create_link to resolve URL
    if (!url) return;

    // Prevent multiple calls
    if (hasOpenedRef.current) {
      return;
    }
    hasOpenedRef.current = true;

    // Reset tracking on new player open
    lastChannelIdRef.current = undefined;
    lastSavedMovieIdRef.current = null; // Reset saved movieId for new session

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

      const episodes = player?.episodes || [];
      const currentEpisodeIndex = player?.currentEpisodeIndex || 0;
      const autoPlayEpisodes = player?.autoPlayEpisodes ?? true;

      // Get volume from persisted store
      const volume = Math.round((usePlaybackStore.getState().settings.volume) * 100) || 80;

      const exoPlayer = (globalThis.window as any).ExoPlayer;
      if (!exoPlayer || typeof exoPlayer.open_compose_player !== 'function') {
        logger.error('ExoPlayer.open_compose_player method not available');
        onClose();
        return;
      }

      // Open player immediately - no EPG wait.
      // onEpgRequest (called from Android's onPlayerReady) will fetch EPG with retries.
      const params = {
        url,
        channelName: name,
        channelId: channelId?.toString() || '',
        portalUrl,
        mac,
        token,
        isVod: isVod || false,
        movieId: movieId || '',
        resumePosition: resumePosition || 0,
        episodesJson: JSON.stringify(episodes),
        currentEpisodeIndex,
        autoPlayEpisodes,
        channelsJson: '[]',
        recentChannelsJson: '[]',
        volume,
        epgTitle: '',
        epgStart: '',
        epgEnd: '',
        epgCategory: '',
        epgNextTitle: '',
        epgNextStart: '',
        epgNextEnd: '',
        epgNextCategory: '',
        epgDesc: '',
        epgProgramsJson: ''
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
        return;
      }

      // Player is now open - set flag so channel sending useEffect can proceed
      setPlayerOpened(true);

      if (!isVod && channelId) {
        epgIntervalRef.current = setInterval(() => refreshEpgData(channelId, name), 30000);
      }
    };

    // Open player immediately
    openNativePlayer();
  }, [url, name, channelId, isVod, genreId, client]);

  // Send channels to Android after player is opened (non-blocking)
  React.useEffect(() => {
    logger.info('[ExoPlayer] Channel sending useEffect triggered: isVod=' + isVod + ', genreId=' + genreId + ', client=' + !!client + ', categoryChannels=' + (categoryChannels?.length || 0) + ', playerOpened=' + playerOpened);
    
    if (isVod || !client) {
      logger.warn('[ExoPlayer] Skipping channel send: isVod or no client');
      // Don't close - wait for onPlayerClosed from native player
      return;
    }
    
    // Wait for player to be opened and channels to be loaded
    if (!playerOpened) {
      logger.warn('[ExoPlayer] Player not opened yet, waiting...');
      return;
    }
    
    // Wait for category channels to be loaded (if we have genreId)
    if (genreId && (!categoryChannels || categoryChannels.length === 0)) {
      logger.warn('[ExoPlayer] Category channels not loaded yet, waiting...');
      return;
    }
    
    // Send channels immediately without delay - player is already open
    const exoPlayer = (globalThis.window as any).ExoPlayer;
    if (!exoPlayer || typeof (exoPlayer as any).update_channels !== 'function') {
      logger.warn('[ExoPlayer] ExoPlayer.update_channels not available yet, skipping channel send');
      return;
    }
    
    // Send channels WITHOUT resolving URLs - Android player will handle URL resolution via get_order_list
    (async () => {
      try {
        // Wait a bit for NativePlayerActivity to be created (reduced from 500ms to 100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let categoryChannelsToSend: any[] = [];
        
        // Only send category channels if we have genreId and categoryChannels
        if (genreId && categoryChannels && categoryChannels.length > 0) {
          categoryChannelsToSend = categoryChannels
            .filter((ch: any) => !ch.name.startsWith('#####'))
            .map((channel: any) => ({
              ...channel,
              stream_url: channel.cmd // Send raw cmd, let Android resolve via get_order_list
            }));
        }
        
        const recentChannelsToSend = recentChannels
          .filter((ch: any) => !ch.name.startsWith('#####') && ch.id !== channelId)
          .map((channel: any) => ({
            ...channel,
            stream_url: channel.cmd // Send raw cmd, let Android resolve via get_order_list
          })) || [];
        
        logger.info('[ExoPlayer] Sending channels via useEffect: category=' + categoryChannelsToSend.length + ', recent=' + recentChannelsToSend.length);
        
        (exoPlayer as any).update_channels(JSON.stringify(categoryChannelsToSend), JSON.stringify(recentChannelsToSend));
        
        // Don't close - wait for onPlayerClosed from native player
      } catch (e) {
        logger.warn('[ExoPlayer] Failed to send channels via useEffect:', e);
      }
    })();
  }, [categoryChannels, recentChannels, genreId, isVod, client, channelId, playerOpened]);

  // Cleanup EPG interval on unmount
  React.useEffect(() => {
    return () => {
      if (epgIntervalRef.current) {
        clearInterval(epgIntervalRef.current);
        epgIntervalRef.current = null;
        logger.info('[ExoPlayer] EPG refresh interval cleared');
      }
    };
  }, []);

  return null;
};
