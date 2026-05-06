import { useState, useCallback, useRef, useEffect } from 'react';
import { getSetting } from '@/hooks/useSettings';
import { QueryClient } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel, StalkerVOD } from '@/types';
import { usePlaybackStore } from '@/store/playback.store';
import { addRecentViewed } from '@/hooks/useRecentItems';
import { getSeriesInfo } from '@/features/series/series.api';
import { useTranslation } from '@/hooks/useTranslation';

interface UsePlaybackManagerProps {
  client: StalkerClient | null;
  activePortal: any;
  selectedSeries: StalkerVOD | null;
  queryClient: QueryClient;
}

export const usePlaybackManager = ({
  client,
  activePortal,
  selectedSeries,
  queryClient,
}: UsePlaybackManagerProps) => {
  const { t } = useTranslation();
  const [episodesList, setEpisodesList] = useState<StalkerVOD[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  // Keep ref in sync with state
  useEffect(() => {
    currentEpisodeIndexRef.current = currentEpisodeIndex;
  }, [currentEpisodeIndex]);

  // Single player manager (store)
  const player = usePlaybackStore();
  const abortRef = useRef<AbortController | null>(null);

  const play = async (channel: StalkerChannel, queryClient: QueryClient, vodFlag: boolean = false, resumePos: number = 0, movieId?: string) => {
    if (!client) return;

    // Cancel any previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    player.setBuffering(true);

    try {
      // Ensure authentication before getting stream URL
      await client.ensureAuthenticated();

      // Invalidate stream cache to get fresh URL with correct MAC
      const accountId = client?.['account']?.id || 'default';
      const lastAccount = sessionStorage.getItem('playerLastAccountId');
      if (lastAccount && lastAccount !== accountId) {
        console.log('🎬 Portal changed, clearing stream cache');
        queryClient.removeQueries({ queryKey: ['stream'], exact: false });
      }
      sessionStorage.setItem('playerLastAccountId', accountId);

      const url = await queryClient.fetchQuery({
        queryKey: ['stream', channel.id, accountId],
        queryFn: () => client.getStreamUrl(channel.cmd),
        staleTime: 2 * 60 * 1000, // Use cache for 2 minutes (allows prefetch to work)
      });

      console.log('[usePlaybackManager] client.token:', client.token, 'client.account.token:', client.getAccount()?.token);

      // Clean portalUrl - extract valid URL and ignore trailing garbage
      const rawPortalUrl = client.getAccount()?.portalUrl || '';
      let cleanPortalUrl = rawPortalUrl;

      // Extract valid URL by matching http:// or https:// followed by domain and first path segment, then remove trailing garbage
      const urlRegex = /(https?:\/\/[^\/]+\/[^\/]+)/;
      const urlMatch = urlRegex.exec(cleanPortalUrl);
      if (urlMatch) {
        cleanPortalUrl = urlMatch[1] + '/';
      } else {
        // Fallback: remove any trailing characters that are not URL-safe
        cleanPortalUrl = cleanPortalUrl.replace(/[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/, '');
        // Ensure it ends with /
        if (!cleanPortalUrl.endsWith('/')) {
          cleanPortalUrl += '/';
        }
      }

      console.log('[usePlaybackManager] rawPortalUrl:', rawPortalUrl, 'cleanPortalUrl:', cleanPortalUrl);

      player.setMedia({
        url,
        name: channel.name,
        channelId: Number.parseInt(String(channel.id)),
        isVod: vodFlag,
        movieId,
        resumePosition: resumePos,
        portalUrl: cleanPortalUrl,
        mac: client.getAccount()?.mac || '',
        token: client.token || ''
      });
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to play channel:', error);
      }
    } finally {
      player.setBuffering(false);
    }
  };

  const handleChannelSelect = useCallback((channel: StalkerChannel) => {
    if (client) {
      player.setContentType('tv');
      play(channel, queryClient, false);
      addRecentViewed(activePortal!.id, 'live', String(channel.id), {
        name: channel.name,
        poster: client.resolveLogoUrl(channel.logo),
        cmd: channel.cmd,
      });
      // Invalidate recent viewed queries to update ForYouSection
      queryClient.invalidateQueries({ queryKey: ['recent-viewed'] });
    }
  }, [client, queryClient, activePortal]);

  const handleMoviePlay = useCallback((movie: StalkerVOD, resumePosition?: number) => {
    if (client) {
      player.setContentType('movies');
      play(movie as any, queryClient, true, resumePosition || 0, String(movie.id));
      addRecentViewed(activePortal!.id, 'vod', String(movie.id), {
        name: movie.name,
        poster: client.resolvePosterUrl(movie),
        cmd: movie.cmd,
      });
      // Invalidate recent viewed queries to update ForYouSection
      queryClient.invalidateQueries({ queryKey: ['recent-viewed'] });
    }
  }, [client, queryClient, activePortal]);

  const deduplicateEpisodes = (episodes: StalkerVOD[]): StalkerVOD[] => {
    return episodes.filter((ep: StalkerVOD, index: number, self: StalkerVOD[]) =>
      index === self.findIndex((e: StalkerVOD) => String(e.id) === String(ep.id))
    );
  };

  const findEpisodeIndex = (episodes: StalkerVOD[], episode: StalkerVOD): number => {
    return episodes.findIndex((ep: StalkerVOD) => String(ep.id) === String(episode.id));
  };

  const fetchSeriesData = async (seriesId: string): Promise<any> => {
    return await queryClient.fetchQuery({
      queryKey: ['series', seriesId, 'info'],
      queryFn: async () => {
        return await getSeriesInfo(client!, seriesId);
      },
    });
  };

  const fetchStreamUrl = async (episode: StalkerVOD): Promise<string> => {
    const response = await client!._makeRequest({
      action: 'create_link',
      cmd: episode.cmd,
      type: 'vod',
      series: String(episode.episode || '1'),
      disable_ad: '0',
      download: '0',
      mac: client!.getAccount().mac,
      JsHttpRequest: '1-xml',
    });
    
    const streamUrl = response?.js?.cmd || response.data?.js?.cmd;
    if (!streamUrl) throw new Error('No stream URL in response');
    
    const cleanedUrl = streamUrl.replace(/^ffmpeg\s+/, '');
    if (cleanedUrl?.includes('stream=.')) {
      throw new Error('Invalid stream URL from server');
    }
    
    return cleanedUrl;
  };

  const buildEpisodeName = (episode: StalkerVOD): string => {
    const seriesName = selectedSeries?.name || '';
    const episodeName = `${t('season')} ${episode.season || 1} - ${t('episode')} ${episode.episode || 1}`;
    return seriesName ? `${seriesName} - ${episodeName}` : episodeName;
  };

  const prepareEpisodesData = (episodes: StalkerVOD[]) => {
    return episodes.map((ep) => ({
      id: String(ep.id),
      url: '',
      name: `${t('season')} ${ep.season || 1} - ${t('episode')} ${ep.episode || 1}`,
      season: String(ep.season || '1'),
      episode: String(ep.episode || '1'),
      cmd: ep.cmd,
    }));
  };

  const updateEpisodesList = async (episode: StalkerVOD, explicitIndex?: number): Promise<void> => {
    if (!selectedSeries?.id) return;

    try {
      const seriesData = await fetchSeriesData(String(selectedSeries.id));
      if (!seriesData?.episodes) return;

      const uniqueEpisodes = deduplicateEpisodes(seriesData.episodes);
      const episodeIndex = explicitIndex ?? findEpisodeIndex(uniqueEpisodes, episode);
      
      if (episodeIndex !== -1) {
        setEpisodesList(uniqueEpisodes);
        setCurrentEpisodeIndex(episodeIndex);
        currentEpisodeIndexRef.current = episodeIndex;
      }
    } catch (e) {
      console.error('Failed to fetch series episodes for auto-play:', e);
    }
  };

  const handleEpisodeSelect = useCallback(async (episode: StalkerVOD, resumePosition?: number, explicitIndex?: number) => {
    if (!client) return;

    await updateEpisodesList(episode, explicitIndex);

    try {
      const url = await queryClient.fetchQuery({
        queryKey: ['series', episode.cmd, episode.episode],
        queryFn: () => fetchStreamUrl(episode),
        staleTime: 0,
      });
      
      const fullName = buildEpisodeName(episode);
      const autoPlayEpisodes = await getSetting('autoPlayEpisodes');
      const episodesData = prepareEpisodesData(episodesList);

      player.setContentType('series');
      player.setMedia({
        url,
        name: fullName,
        channelId: Number.parseInt(String(episode.id)),
        isVod: true,
        movieId: String(episode.id),
        resumePosition: resumePosition || 0,
        episodes: episodesData,
        currentEpisodeIndex: explicitIndex ?? currentEpisodeIndexRef.current,
        autoPlayEpisodes,
      });

      const seriesInfo = selectedSeries;
      if (seriesInfo) {
        addRecentViewed(activePortal!.id, 'series', String(seriesInfo.id), {
          name: seriesInfo.name,
          poster: client.resolvePosterUrl(seriesInfo),
          cmd: seriesInfo.cmd,
          season: episode.season !== undefined ? Number(episode.season) : undefined,
          episode: episode.episode !== undefined ? Number(episode.episode) : undefined,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['recent-viewed'] });
    } catch (error) {
      console.error('❌ Failed to play episode:', error);
    }
  }, [client, queryClient, selectedSeries, activePortal, t]);

  const handleEpisodeEnded = useCallback(async () => {
    const { getSetting } = await import('@/hooks/useSettings');
    const autoPlayEpisodes = await getSetting('autoPlayEpisodes');

    if (!autoPlayEpisodes || !selectedSeries || episodesList.length === 0) {
      return;
    }

    // Use ref to get latest index (avoids stale closure)
    const currentIdx = currentEpisodeIndexRef.current;
    const nextIndex = currentIdx + 1;

    if (nextIndex >= episodesList.length) {
      return;
    }

    const nextEpisode = episodesList[nextIndex];
    if (!nextEpisode) {
      console.error('Next episode not found at index', nextIndex);
      return;
    }

    // Update ref immediately to ensure consistency
    currentEpisodeIndexRef.current = nextIndex;

    try {
      setCurrentEpisodeIndex(nextIndex);
      await handleEpisodeSelect(nextEpisode, 0, nextIndex); // Pass explicit index
    } catch (error) {
      console.error('Failed to autoplay next episode:', error);
      // Revert ref on error
      currentEpisodeIndexRef.current = currentIdx;
    }
  }, [episodesList, selectedSeries, handleEpisodeSelect]);

  const close = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    player.close();
  };

  return {
    player,
    handleChannelSelect,
    handleMoviePlay,
    handleEpisodeSelect,
    handleEpisodeEnded,
    close,
  };
};
