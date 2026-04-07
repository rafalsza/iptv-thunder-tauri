// =========================
// 🪝 MODERN TV HOOKS with Cache
// =========================
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';
import { usePortalCacheStore } from '@/store/portalCache.store';
import { saveChannels } from '@/hooks/useDatabase';
import { getChannelEPG, getEPGTimeRange } from '@/features/epg/epg.api';

// Pobierz wszystkie kanały z kategorii (z SQLite DB lub API)
export const useChannels = (client: StalkerClient, genreId?: string) => {
  const accountId = client?.['account']?.id || 'default';
  
  const query = useQuery({
    queryKey: ['channels', accountId, genreId],
    queryFn: async () => {
      if (!genreId || genreId === '*') {
        return await client.getAllChannels();
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

      return allChannels;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!client && !!genreId,
  });
  
  // Save channels to SQLite when data changes (replaces onSuccess callback)
  useEffect(() => {
    const data = query.data;
    if (!data || data.length === 0) return;
    
    saveChannels(data.map(ch => ({
      id: ch.id?.toString() || '',
      name: ch.name || '',
      streamUrl: ch.cmd || '',
      iconUrl: ch.logo_url || ch.logo || '',
      genreId: genreId || ch.tv_genre_id?.toString(),
      orderNum: ch.number || 0,
    })), accountId).catch(err => console.error('[DB] Failed to save channels:', err));
  }, [query.data, accountId, genreId]);
  
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
  
  const enabled = !!client && (!isCacheReady || !cachedData || cachedData.length === 0);
  
  const query = useQuery({
    queryKey: ['channel-categories', accountId],
    queryFn: async () => {
      const result = await client.getGenres();
      cacheStore.setChannelCategories(accountId, result);
      return result;
    },
    staleTime: 0, // Always fetch if no cache
    gcTime: 7 * 24 * 60 * 60 * 1000,
    enabled: enabled,
    placeholderData: cachedData, // Use as placeholder, not initial
  });
  
  return {
    ...query,
    data: cachedData || query.data || [],
    isLoading: query.isLoading && (!cachedData || cachedData.length === 0),
  };
};

// Prefetch stream URL
export const usePrefetchStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<string>>(new Set());
  const accountId = client?.['account']?.id || 'default';
  
  return (channel: StalkerChannel) => {
    if (!channel.cmd) return;
    
    const channelId = String(channel.id);
    const queryKey = ['stream', channel.id, accountId];
    
    // Skip if already prefetched this channel
    if (prefetchedRef.current.has(channelId)) {
      return;
    }
    
    // Check if already cached in queryClient
    const cached = queryClient.getQueryData(queryKey);
    if (cached) {
      prefetchedRef.current.add(channelId);
      return;
    }
    
    console.log('📥 Prefetching stream for:', channel.name);
    prefetchedRef.current.add(channelId);
    
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => client.getStreamUrl(channel.cmd),
    });
  };
};
