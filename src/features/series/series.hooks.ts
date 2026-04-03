// =========================
// 🪝 SERIES HOOKS — load all at once (based on movies.hooks.ts)
// =========================
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD } from '@/types';
import { saveSeries, getSeries } from '@/hooks/useDatabase';
import { useCategories } from '@/hooks/useCategories';
import { 
  getSeries as getSeriesFromApi, 
  getSeriesWithPagination, 
  getSeriesDetails, 
  getSeriesInfo,
  getSeriesStream,
  getSeriesCategories
} from './series.api';

// ─── Fetch all pages sequentially with delay ───────────────────────────────
async function fetchAllSeries(
  client: StalkerClient,
  categoryId: string,
  signal?: AbortSignal,
): Promise<StalkerVOD[]> {
  const first = await getSeriesWithPagination(client, categoryId, 1, signal);

  if (!first.hasMore || first.items.length === 0) {
    return first.items;
  }

  const allItems = [...first.items];
  const maxPages = 100; // safety limit

  for (let p = 2; p <= maxPages; p++) {
    // Check if aborted before each request
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const result = await getSeriesWithPagination(client, categoryId, p, signal);

    if (result.items.length === 0) break;

    allItems.push(...result.items);

    if (!result.hasMore) break;

    // 🔥 small delay to avoid Stalker rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  // Deduplicate by id
  const map = new Map<string, StalkerVOD>();
  for (const item of allItems) {
    map.set(String(item.id), item);
  }
  return Array.from(map.values());
}

// ─── Main hook: useSeriesAll (SQLite first, then API refresh) ─────────────────
export const useSeriesAll = (client: StalkerClient, categoryId?: string) => {
  const accountId = client?.getAccount()?.id ?? 'default';

  const query = useQuery({
    queryKey: ['series-all', accountId, categoryId],
    queryFn: async ({ signal }) => {
      if (!categoryId) return [];

      // 1. First, try to load from SQLite (fast, offline-friendly)
      const cachedItems = await getSeries(accountId, categoryId);
      const hasCache = cachedItems.length > 0;

      if (hasCache) {
        console.log('✅ Using SQLite cache:', cachedItems.length, 'series for category', categoryId);
        // Background refresh disabled - only load from SQLite cache
        
        // Return cached data mapped to StalkerVOD format
        // Sort by added DESC as fallback (in case DB sort had NULLs)
        const sortedItems = [...cachedItems].sort((a, b) => (b.added || 0) - (a.added || 0));
        return sortedItems.map(s => ({
          id: Number.parseInt(s.id, 10) || 0,
          name: s.name,
          cmd: '', // Cached items don't have stream command - will be fetched when needed
          description: s.description || '',
          logo: s.posterUrl,
          poster: s.posterUrl,
          year: s.year,
          rating_imdb: s.rating,
          genre: s.genre,
          added: s.added || '', // Now available from cache
          censored: false, // Default value
        })) as StalkerVOD[];
      }

      // 2. No cache - fetch from API (blocking)
      return await fetchAllSeriesAndSave(client, categoryId, accountId, signal);
    },
    enabled: !!categoryId && !!accountId && accountId !== 'default',
    staleTime: 0,   // Always check SQLite cache on mount
    gcTime:    30 * 60 * 1000,  // keep in memory 30 min after last use
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    ...query,
    series: query.data ?? [],
  };
};

// Fetch all series from API and save to DB
async function fetchAllSeriesAndSave(
  client: StalkerClient,
  categoryId: string,
  accountId: string,
  signal?: AbortSignal
): Promise<StalkerVOD[]> {
  const items = await fetchAllSeries(client, categoryId, signal);
  
  // Save to SQLite non-blocking
  saveSeriesToDb(items, categoryId, accountId);
  
  return items;
}

// Helper to save series to SQLite
function saveSeriesToDb(items: StalkerVOD[], categoryId: string, accountId: string) {
  saveSeries(
    items.map(s => ({
      id: s.id?.toString() || '',
      name: s.name || '',
      description: s.description || '',
      posterUrl: s.logo || s.poster || '',
      year: s.year,
      rating: s.rating_imdb || s.rating_kinopoisk,
      genre: s.genre,
      categoryId: categoryId,
      added: s.added ? new Date(s.added).getTime() : undefined,
    })),
    accountId,
    categoryId,
  ).catch(err => console.error('[DB] Failed to save series:', err));
}

// ─── Categories ───────────────────────────────────────────────────────────────
export const useSeriesCategories = (client: StalkerClient) => {
  const portalId = client?.getAccount()?.id || 'default';

  const { categories, isLoading, refresh, isRefreshing } = useCategories(
    'series',
    portalId,
    async () => await getSeriesCategories(client),
  );

  return {
    data: categories,
    isLoading,
    refetch: refresh,
    isRefetching: isRefreshing,
    error: null,
  };
};

// ─── Legacy hooks (kept for compatibility) ───────────────────────────────────
export const useSeries = (client: StalkerClient, categoryId: string = '', page: number = 1) => {
  return useQuery({
    queryKey: ['series', categoryId, page],
    queryFn: () => getSeriesFromApi(client, categoryId, page),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useSeriesWithPagination = (client: StalkerClient, categoryId: string = '', page: number = 1) => {
  return useQuery({
    queryKey: ['series', 'paginated', categoryId, page],
    queryFn: () => getSeriesWithPagination(client, categoryId, page),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// ─── Series info with episodes ──────────────────────────────────────────────
export const useSeriesInfo = (client: StalkerClient, seriesId: string) => {
  return useQuery({
    queryKey: ['series-info', seriesId],
    queryFn: async () => {
      if (!seriesId) {
        console.log('📺 No seriesId provided, returning empty data');
        return { series: null as any, seasons: [], episodes: [] };
      }
      return await getSeriesInfo(client, seriesId);
    },
    enabled: !!seriesId,
    staleTime: 15 * 60 * 1000,
  });
};

// ─── Series details ───────────────────────────────────────────────────────────
export const useSeriesDetails = (client: StalkerClient, seriesId: string) => {
  return useQuery({
    queryKey: ['series-details', seriesId],
    queryFn: () => getSeriesDetails(client, seriesId),
    enabled: !!seriesId,
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
};

// ─── Prefetch stream URL ──────────────────────────────────────────────────────
export const usePrefetchSeriesStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();

  return React.useCallback(
    (episode: StalkerVOD) => {
      if (!episode.cmd) return;
      queryClient.prefetchQuery({
        queryKey: ['series-stream', episode.id],
        queryFn: () => getSeriesStream(client, episode.cmd),
        staleTime: 5 * 60 * 1000,
      });
    },
    [client, queryClient],
  );
};

// ─── Series stream ───────────────────────────────────────────────────────────
export const useSeriesStream = (client: StalkerClient, episodeId: string, cmd: string) => {
  return useQuery({
    queryKey: ['series-stream', episodeId],
    queryFn: () => getSeriesStream(client, cmd),
    enabled: !!episodeId && !!cmd,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
