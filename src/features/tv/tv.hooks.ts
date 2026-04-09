// =========================
// 🪝 MODERN TV HOOKS with Cache
// =========================
import React, { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';
import { usePortalCacheStore } from '@/store/portalCache.store';
import { saveChannels, getChannels as getChannelsFromDB } from '@/hooks/useDatabase';
import { getChannelEPG, getEPGTimeRange } from '@/features/epg/epg.api';
import { getGenres, getChannels } from './tv.api';

// Pobierz wszystkie kanały z kategorii (z SQLite DB lub API)
export const useChannels = (client: StalkerClient, genreId?: string) => {
  const accountId = client?.['account']?.id || 'default';
  const prevSignatureRef = useRef<string>('');
  
  const query = useQuery({
    queryKey: ['channels', accountId, genreId],
    queryFn: async ({ signal }) => {
      // Always use paginated fetching - get_all_channels endpoint is deprecated
      const targetGenreId = genreId || '*';
      
      // Fetch page 1 first to determine total count
      const firstPage = await getChannels(client, {
        genre: targetGenreId,
        page: 1,
        sortby: 'number',
        signal
      });
      
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
      const itemsPerPage = firstPage.channels.length || 14;
      // Safety limit: max ~1000 channels for EPG (prevents UI freeze with 80k channels)
      const MAX_CHANNELS = 1000;
      const maxPages = Math.ceil(MAX_CHANNELS / itemsPerPage);
      const totalPages = Math.min(Math.ceil(firstPage.totalItems / itemsPerPage), maxPages);
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      
      // Fetch remaining pages in batches with throttling to avoid overwhelming the portal
      const BATCH = 5;
      for (let i = 0; i < remainingPages.length; i += BATCH) {
        if (signal?.aborted) break;
        
        const batch = remainingPages.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(page => getChannels(client, {
            genre: targetGenreId,
            page,
            sortby: 'number',
            signal
          }))
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
    enabled: !!client,
  });
  
  // Save channels to SQLite when data changes (replaces onSuccess callback)
  useEffect(() => {
    const data = query.data;
    if (!data || data.length === 0) return;

    // Lightweight signature: count + first ID + last ID (detects add/remove/reorder)
    const signature = `${data.length}-${data[0]?.id}-${data[data.length - 1]?.id}`;
    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;

    // Check if we already saved this exact data (prevents re-save after player close)
    const savedSignatureKey = `iptv-channels-saved-${accountId}-${genreId || '*'}`;
    const alreadySaved = localStorage.getItem(savedSignatureKey);
    if (alreadySaved === signature) {
      return;
    }

    saveChannels(data.map(ch => ({
      id: ch.id?.toString() || '',
      name: ch.name || '',
      streamUrl: ch.cmd || '',
      iconUrl: ch.logo_url || ch.logo || '',
      genreId: genreId || ch.tv_genre_id?.toString(),
      orderNum: ch.number || 0,
    })), accountId).then(() => {
      // Mark as saved
      localStorage.setItem(savedSignatureKey, signature);
    }).catch(err => console.error('[DB] Failed to save channels:', err));
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

            // Mark as prefetched BEFORE fetch to prevent race conditions
            prefetchedEPG.current.set(channelId, now);

            try {
              const epg = await getChannelEPG(client, channelId, from, to);
              if (!cancelled) {
                setChannelEPG(accountId, channelId, epg);
                
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
              // Allow retry on failure - remove from prefetched cache
              prefetchedEPG.current.delete(channelId);
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
      return await getGenres(client);
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

// Lazy loading hook - fetches pages on demand for infinite scroll
export const useLazyChannels = (client: StalkerClient, genreId?: string) => {
  const accountId = client?.['account']?.id || 'default';
  const [allChannels, setAllChannels] = React.useState<StalkerChannel[]>([]);
  const [hasMore, setHasMore] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const loadedPagesRef = React.useRef<Set<number>>(new Set());
  const loadingRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const generationRef = React.useRef(0);
  const prevSignatureRef = useRef<string>('');
  const initialLoadDoneRef = React.useRef(false);
  const pageRef = React.useRef(1);
  const hasMoreRef = React.useRef(true);
  const autoLoadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const totalExpectedRef = React.useRef<number | null>(null);

  const loadMore = React.useCallback(async () => {
    if (!client || !hasMoreRef.current || loadingRef.current) return;

    const pageToLoad = pageRef.current;
    if (loadedPagesRef.current.has(pageToLoad)) return;

    const currentGen = generationRef.current;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Always fetch from API (SQLite is only for initial load)
      const result = await getChannels(client, {
        genre: genreId || '*',
        page: pageToLoad,
        sortby: 'number'
      });

      // Skip if component unmounted or generation changed (stale request)
      if (!mountedRef.current || generationRef.current !== currentGen) return;

      // Track total expected items from API (for cache completeness check)
      // Store in localStorage on every API call since we may start from calculated page
      if (result.totalItems > 0) {
        totalExpectedRef.current = result.totalItems;
        const cacheKey = `iptv-channels-total-${accountId}-${genreId || '*'}`;
        localStorage.setItem(cacheKey, String(result.totalItems));
      }

      loadedPagesRef.current.add(pageToLoad);
      pageRef.current = pageToLoad + 1; // Update ref immediately

      setAllChannels(prev => {
        const newChannels = [...prev, ...result.channels];
        // Deduplicate by ID
        const unique = new Map<string, StalkerChannel>();
        newChannels.forEach(ch => unique.set(String(ch.id), ch));
        return Array.from(unique.values());
      });

      hasMoreRef.current = result.hasMore;
      setHasMore(result.hasMore);

      // If we just finished loading all data from API, clear saved signature
      // so the new data will be saved to database
      if (!result.hasMore) {
        const savedSignatureKey = `iptv-channels-saved-${accountId}-${genreId || '*'}`;
        localStorage.removeItem(savedSignatureKey);
      }

      // Auto-continue loading if there are more pages
      if (result.hasMore && mountedRef.current) {
        // Clear any existing timeout to prevent duplicates
        if (autoLoadTimeoutRef.current) {
          clearTimeout(autoLoadTimeoutRef.current);
        }
        autoLoadTimeoutRef.current = setTimeout(() => {
          if (!loadingRef.current && mountedRef.current && hasMoreRef.current) {
            loadMore();
          }
        }, 100);
      }
    } catch (err) {
      // Skip if generation changed - stale error
      if (!mountedRef.current || generationRef.current !== currentGen) return;
      console.error('[useLazyChannels] Failed to load page', pageToLoad, err);
      setError(err instanceof Error ? err : new Error('Failed to load channels'));
    } finally {
      // Only reset loading if this is still the current generation
      if (generationRef.current === currentGen) {
        loadingRef.current = false;
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    }
  }, [client, genreId]);

  // Cleanup on unmount
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoLoadTimeoutRef.current) {
        clearTimeout(autoLoadTimeoutRef.current);
      }
    };
  }, []);

  // Reset when genre changes - load from SQLite first
  React.useEffect(() => {
    generationRef.current += 1; // Invalidate any in-flight requests
    setAllChannels([]);
    setHasMore(true);
    loadedPagesRef.current.clear();
    loadingRef.current = false;
    prevSignatureRef.current = '';
    initialLoadDoneRef.current = false;
    pageRef.current = 1;
    hasMoreRef.current = true;
    totalExpectedRef.current = null;
    // Clear any pending auto-load timeout
    if (autoLoadTimeoutRef.current) {
      clearTimeout(autoLoadTimeoutRef.current);
      autoLoadTimeoutRef.current = null;
    }
    // Try to load from SQLite first
    const loadFromCache = async () => {
      // Prevent double load
      if (initialLoadDoneRef.current) return;

      try {
        const cached = await getChannelsFromDB(accountId, genreId || undefined);
        if (cached && cached.length > 0) {
          // Convert DB format to StalkerChannel
          const channels: StalkerChannel[] = cached.map(ch => ({
            id: ch.id,
            name: ch.name,
            cmd: ch.streamUrl ?? '',
            logo: ch.iconUrl,
            tv_genre_id: ch.genreId ? parseInt(ch.genreId) : undefined,
            number: ch.orderNum ?? 0,
            censored: false,
          }));
          setAllChannels(channels);
          initialLoadDoneRef.current = true;

          // Check if we have complete data from previous API session (use localStorage for persistence)
          const cacheKey = `iptv-channels-total-${accountId}-${genreId || '*'}`;
          const totalExpected = localStorage.getItem(cacheKey);
          const expectedCount = totalExpected ? parseInt(totalExpected, 10) : 0;

          // If we have complete data (cached >= expected), skip API call
          if (expectedCount > 0 && channels.length >= expectedCount) {
            hasMoreRef.current = false;
            setHasMore(false);
            return;
          }

          // Otherwise, continue loading from API to get remaining channels
          setHasMore(true);
          // Calculate which page to load next based on cached channels count
          // Portal returns ~14 channels per page
          pageRef.current = Math.ceil(channels.length / 14) + 1;
          setTimeout(async () => {
            if (!loadingRef.current && mountedRef.current) {
              await loadMore();
            }
          }, 100);
        } else {
          // No cached data - load from API
          if (client && !loadingRef.current && !initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true;
            await loadMore();
          }
        }
      } catch (err) {
        // On error, load from API
        if (client && !loadingRef.current && !initialLoadDoneRef.current) {
          initialLoadDoneRef.current = true;
          await loadMore();
        }
      }
    };

    loadFromCache();
  }, [genreId, accountId, client]);

  // Save channels to SQLite only when fully loaded (avoid spamming DB during pagination)
  useEffect(() => {
    if (!allChannels || allChannels.length === 0) return;
    // Only save when we have all channels (hasMore is false)
    // This prevents saving on every page during background loading
    if (hasMoreRef.current) return;

    // Lightweight signature: count + first ID + last ID
    const signature = `${allChannels.length}-${allChannels[0]?.id}-${allChannels[allChannels.length - 1]?.id}`;
    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;

    // Check if we already saved this exact data (prevents re-save after player close)
    const savedSignatureKey = `iptv-channels-saved-${accountId}-${genreId || '*'}`;
    const alreadySaved = localStorage.getItem(savedSignatureKey);
    if (alreadySaved === signature) {
      return;
    }

    saveChannels(allChannels.map(ch => ({
      id: ch.id?.toString() || '',
      name: ch.name || '',
      streamUrl: ch.cmd || '',
      iconUrl: ch.logo_url || ch.logo || '',
      genreId: genreId || ch.tv_genre_id?.toString(),
      orderNum: ch.number || 0,
    })), accountId).then(() => {
      // Mark as saved
      localStorage.setItem(savedSignatureKey, signature);
    }).catch(err => console.error('[DB] Failed to save channels:', err));
  }, [allChannels, accountId, genreId]);

  return {
    channels: allChannels,
    isLoading,
    hasMore,
    loadMore,
    error,
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

    // Skip if already fetching
    const state = queryClient.getQueryState(queryKey);
    if (state?.fetchStatus === 'fetching') return;

    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => client.getStreamUrl(channel.cmd),
      retry: 2,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    });
  }, [client, accountId, queryClient]);
};
