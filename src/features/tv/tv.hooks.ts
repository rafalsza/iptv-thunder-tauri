// =========================
// 🪝 MODERN TV HOOKS with Cache
// =========================
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';
import { usePortalCacheStore } from '@/store/portalCache.store';
import { saveChannels } from '@/hooks/useDatabase';
import { getChannelEPG, getEPGTimeRange } from '@/features/epg/epg.api';

// Pobierz wszystkie kanały z kategorii (z SQLite DB lub API)
export const useChannels = (client: StalkerClient, genreId?: string) => {
  const accountId = client?.['account']?.id || 'default';
  
  const isEnabled = !!client && !!genreId;
  console.log('📺 useChannels - genreId:', genreId, 'client exists:', !!client, 'isEnabled:', isEnabled);
  
  const query = useQuery({
    queryKey: ['channels', accountId, genreId],
    queryFn: async () => {
      console.log('📺 Fetching channels for genre:', genreId);
      if (!genreId || genreId === '*') {
        const result = await client.getAllChannels();
        console.log('📺 Got all channels:', result.length);
        // Save to SQLite database with portal_id
        await saveChannels(result.map(ch => ({
          id: ch.id?.toString() || '',
          name: ch.name || '',
          streamUrl: ch.cmd || '',
          iconUrl: ch.logo_url || ch.logo || '',
          genreId: genreId || ch.tv_genre_id?.toString(),
          orderNum: ch.number || 0,
        })), accountId);
        return result;
      }
      
      const allChannels: StalkerChannel[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore && page <= 50) {
        const result = await client.getChannelsWithPagination(genreId, page);
        console.log('📺 Page', page, '- fetched:', result.channels.length, 'channels, hasMore:', result.hasMore);
        allChannels.push(...result.channels);
        hasMore = result.hasMore;
        page++;
      }
      
      console.log('📺 Total channels fetched:', allChannels.length);
      
      // Save to SQLite database with portal_id
      await saveChannels(allChannels.map(ch => ({
        id: ch.id?.toString() || '',
        name: ch.name || '',
        streamUrl: ch.cmd || '',
        iconUrl: ch.logo_url || ch.logo || '',
        genreId: genreId || ch.tv_genre_id?.toString(),
        orderNum: ch.number || 0,
      })), accountId);
      
      return allChannels;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
    enabled: !!client && !!genreId,
  });
  
  // Pre-fetch EPG for channels (only for first 20 visible channels)
  const cacheStore = usePortalCacheStore();
  useEffect(() => {
    const channels = query.data;
    if (!channels || channels.length === 0 || !client) return;

    const { from, to } = getEPGTimeRange(4);

    // Pre-fetch EPG for first 20 channels
    const channelsToPrefetch = channels.slice(0, 20);

    if (channelsToPrefetch.length === 0) return;

    console.log('📺 Pre-fetching EPG for', channelsToPrefetch.length, 'channels');

    // Fetch in small batches with delay to avoid overwhelming the API
    const prefetchBatch = async () => {
      for (const ch of channelsToPrefetch.slice(0, 5)) {
        try {
          const channelId = Number(ch.id);
          // Skip if already cached
          if (cacheStore.hasValidEPG(accountId, channelId)) continue;
          
          const epg = await getChannelEPG(client, channelId, from, to);
          cacheStore.setChannelEPG(accountId, channelId, epg);
          
          // Small delay between requests
          await new Promise(r => setTimeout(r, 50));
        } catch (err) {
          console.warn('Failed to prefetch EPG for channel', ch.id, err);
        }
      }
    };

    prefetchBatch();
  }, [query.data, client, accountId, cacheStore]);

  console.log('📺 useChannels - query.data:', query.data?.length, 'isLoading:', query.isLoading);
  
  return {
    ...query,
    data: query.data || [],
    isLoading: query.isLoading,
  };
};

// Pobierz kategorie kanałów (z cache lub API)
export const useChannelCategories = (client: StalkerClient) => {
  const accountId = client?.['account']?.id || 'default';
  const cacheStore = usePortalCacheStore();
  const cachedData = cacheStore.getPortalData(accountId)?.channelCategories;
  const isCacheReady = cacheStore.isHydrated;
  
  console.log('📺 useChannelCategories - client:', !!client, 'accountId:', accountId, 'cachedData:', cachedData?.length, 'isCacheReady:', isCacheReady);
  
  const enabled = !!client && (!isCacheReady || !cachedData || cachedData.length === 0);
  console.log('📺 useChannelCategories - enabled:', enabled);
  
  const query = useQuery({
    queryKey: ['channel-categories', accountId],
    queryFn: async () => {
      console.log('📺 useChannelCategories - fetching from API...');
      const result = await client.getGenres();
      console.log('📺 useChannelCategories - got:', result.length, 'categories');
      cacheStore.setChannelCategories(accountId, result);
      return result;
    },
    staleTime: 0, // Always fetch if no cache
    gcTime: 7 * 24 * 60 * 60 * 1000,
    enabled: enabled,
    placeholderData: cachedData, // Use as placeholder, not initial
  });
  
  console.log('📺 useChannelCategories - query.data:', query.data?.length, 'query.isLoading:', query.isLoading, 'query.error:', query.error);
  
  return {
    ...query,
    data: cachedData || query.data || [],
    isLoading: query.isLoading && (!cachedData || cachedData.length === 0),
  };
};

// Prefetch stream URL
export const usePrefetchStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();
  
  return (channel: StalkerChannel) => {
    if (channel.cmd) {
      queryClient.prefetchQuery({
        queryKey: ['stream', channel.id],
        queryFn: () => client.getStreamUrl(channel.cmd),
      });
    }
  };
};
