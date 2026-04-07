// =========================
// 🪝 MODERN TV HOOKS with Cache
// =========================
import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';
import { usePortalCacheStore } from '@/store/portalCache.store';
import { saveChannels } from '@/hooks/useDatabase';
import { getChannelEPG, getEPGTimeRange } from '@/features/epg/epg.api';

// Pobierz wszystkie kanały z kategorii (z SQLite DB lub API)
export const useChannels = (client: StalkerClient, genreId?: string) => {
  const accountId = client?.['account']?.id || 'default';
  const prevLengthRef = useRef<number>(0);
  const prevFirstIdRef = useRef<string | number>('');
  
  const query = useQuery({
    queryKey: ['channels', accountId, genreId],
    queryFn: async ({ signal }) => {
      if (!genreId || genreId === '*') {
        return await client.getAllChannels();
      }
      
      // Fetch page 1 first to determine total count
      const firstPage = await client.getChannelsWithPagination(genreId, 1, signal);
      if (signal?.aborted) return [];
      
      const allChannels: StalkerChannel[] = [...firstPage.channels];
      
      if (!firstPage.hasMore || firstPage.totalItems <= firstPage.channels.length) {
        // Deduplicate even for single page (safety check)
        const uniqueChannels = new Map<string, StalkerChannel>();
        for (const ch of allChannels) {
          uniqueChannels.set(String(ch.id), ch);
        }
        return Array.from(uniqueChannels.values());
      }
      
      // Calculate remaining pages based on total count
      const itemsPerPage = firstPage.channels.length || 50;
      const totalPages = Math.min(Math.ceil(firstPage.totalItems / itemsPerPage), 50);
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      
      // Fetch remaining pages in batches with throttling to avoid overwhelming the portal
      const BATCH = 5;
      for (let i = 0; i < remainingPages.length; i += BATCH) {
        if (signal?.aborted) break;
        
        const batch = remainingPages.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(page => client.getChannelsWithPagination(genreId, page, signal))
        );
        
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            allChannels.push(...result.value.channels);
          }
        });
        
        // Throttle between batches (abortable)
        if (i + BATCH < remainingPages.length && !signal?.aborted) {
          await Promise.race([
            new Promise(r => setTimeout(r, 100)),
            new Promise((_, reject) => {
              if (!signal) return;
              const onAbort = () => reject(new Error('aborted'));
              signal.addEventListener('abort', onAbort, { once: true });
            })
          ]).catch(() => { /* aborted */ });
        }
      }

      // Deduplicate channels by ID (Stalker API often returns duplicates across pages)
      const uniqueChannels = new Map<string, StalkerChannel>();
      for (const ch of allChannels) {
        uniqueChannels.set(String(ch.id), ch);
      }

      return Array.from(uniqueChannels.values());
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!client && !!genreId,
  });
  
  // Save channels to SQLite when data changes (replaces onSuccess callback)
  useEffect(() => {
    const data = query.data;
    if (!data || data.length === 0) return;

    // Cheap check: length + first ID (avoids O(n) JSON.stringify)
    const firstId = data[0]?.id;
    if (data.length === prevLengthRef.current && firstId === prevFirstIdRef.current) return;
    prevLengthRef.current = data.length;
    prevFirstIdRef.current = firstId ?? '';
    
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
  const hasValidEPG = usePortalCacheStore(s => s.hasValidEPG);
  const setChannelEPG = usePortalCacheStore(s => s.setChannelEPG);
  const prefetchedEPG = useRef<Map<number, number>>(new Map());
  const EPG_TTL = 10 * 60 * 1000; // 10 minutes
  
  useEffect(() => {
    const channels = query.data;
    if (!channels || channels.length === 0 || !client) return;

    const { from, to } = getEPGTimeRange(4);

    // Pre-fetch EPG for first 20 channels
    const channelsToPrefetch = channels.slice(0, 20);

    if (channelsToPrefetch.length === 0) return;

    // Fetch in small parallel batches to avoid overwhelming the API
    let cancelled = false;
    const BATCH = 3;
    
    const prefetchBatch = async () => {
      for (let i = 0; i < channelsToPrefetch.length; i += BATCH) {
        if (cancelled) break;
        
        const batch = channelsToPrefetch.slice(i, i + BATCH);
        
        await Promise.allSettled(
          batch.map(async ch => {
            const channelId: number = Number(ch.id);
            const now = Date.now();
            
            // Skip if already prefetched within TTL (session-level cache)
            const lastPrefetch = prefetchedEPG.current.get(channelId);
            if (lastPrefetch && now - lastPrefetch < EPG_TTL) return;
            
            // Skip if already cached in store with same TTL (avoids mismatch)
            if (hasValidEPG(accountId, channelId, EPG_TTL)) return;
            
            try {
              const epg = await getChannelEPG(client, channelId, from, to);
              if (!cancelled) {
                setChannelEPG(accountId, channelId, epg);
                prefetchedEPG.current.set(channelId, now);
                
                // Cleanup: keep only last 100 entries to prevent memory leak
                if (prefetchedEPG.current.size > 200) {
                  const entries = Array.from(prefetchedEPG.current.entries())
                    .sort((a, b) => a[1] - b[1])
                    .slice(-100);
                  prefetchedEPG.current = new Map(entries);
                }
              }
            } catch (err) {
              console.warn('Failed to prefetch EPG for channel', ch.id, err);
            }
          })
        );
        
        // Small delay between batches (skip if cancelled)
        if (i + BATCH < channelsToPrefetch.length && !cancelled) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
    };

    prefetchBatch();
    return () => { cancelled = true; };
  }, [query.data, client, accountId, hasValidEPG, setChannelEPG]);
  
  return {
    ...query,
    data: query.data || [],
    isLoading: query.isLoading,
  };
};

// Pobierz kategorie kanałów (tylko w TanStack Query, bez Zustand cache)
export const useChannelCategories = (client: StalkerClient) => {
  const accountId = client?.['account']?.id || 'default';
  
  const query = useQuery({
    queryKey: ['channel-categories', accountId],
    queryFn: async () => {
      const result = await client.getGenres();
      return result;
    },
    staleTime: 60 * 60 * 1000, // 1 hour - categories rarely change
    gcTime: 7 * 24 * 60 * 60 * 1000,
    enabled: !!client,
  });
  
  return {
    ...query,
    data: query.data || [],
    isLoading: query.isLoading,
  };
};

// Prefetch stream URL
export const usePrefetchStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Map<string, number>>(new Map());
  const accountId = client?.['account']?.id || 'default';
  const TTL = 5 * 60 * 1000; // 5 minutes
  
  return useCallback((channel: StalkerChannel) => {
    if (!channel.cmd) return;
    
    const channelId = String(channel.id);
    const queryKey = ['stream', channel.id, accountId];
    const now = Date.now();
    
    // Check if prefetched within TTL
    const lastPrefetch = prefetchedRef.current.get(channelId);
    if (lastPrefetch && now - lastPrefetch < TTL) {
      return;
    }
    
    // Check if already cached in queryClient
    const cached = queryClient.getQueryData(queryKey);
    if (cached && !lastPrefetch) {
      // First time seeing cached data, mark as prefetched
      prefetchedRef.current.set(channelId, now);
      return;
    }
    
    prefetchedRef.current.set(channelId, now);
    
    // Cleanup: keep only last 200 entries to prevent memory leak
    if (prefetchedRef.current.size > 500) {
      const entries = Array.from(prefetchedRef.current.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(-200);
      prefetchedRef.current = new Map(entries);
    }
    
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => client.getStreamUrl(channel.cmd),
      retry: 2,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    });
  }, [client, accountId, queryClient]);
};
