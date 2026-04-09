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

// ─── Non-progressive fetch (for background refresh when cache exists) ───────
async function fetchAllSeriesSilent(
  client: StalkerClient,
  categoryId: string,
  signal?: AbortSignal,
): Promise<StalkerVOD[]> {
  const first = await getSeriesWithPagination(client, categoryId, 1, signal);

  if (!first.hasMore || first.items.length === 0) {
    return first.items;
  }

  const allItems = [...first.items];
  const totalPages = Math.ceil(first.totalItems / first.maxPageItems) || 1;

  for (let p = 2; p <= totalPages; p++) {
    if (signal?.aborted) break;

    const result = await getSeriesWithPagination(client, categoryId, p, signal);
    if (result.items.length === 0) break;

    allItems.push(...result.items);
    if (!result.hasMore) break;

    const delay = p < 5 ? 50 : 100;
    await new Promise(r => setTimeout(r, delay));
  }

  return sortAndDedupe(allItems);
}
async function fetchAllSeriesProgressive(
  client: StalkerClient,
  categoryId: string,
  accountId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  signal?: AbortSignal,
): Promise<StalkerVOD[]> {
  const first = await getSeriesWithPagination(client, categoryId, 1, signal);
  const queryKey = ['series-all', accountId, categoryId];

  if (!first.hasMore || first.items.length === 0) {
    return first.items;
  }

  // 🔥 Emit first page IMMEDIATELY (fast initial load)
  const allItems = [...first.items];
  queryClient.setQueryData(queryKey, sortAndDedupe(allItems));

  const totalPages = Math.ceil(first.totalItems / first.maxPageItems) || 1;

  // Fetch remaining pages in background
  for (let p = 2; p <= totalPages; p++) {
    if (signal?.aborted) break;

    const result = await getSeriesWithPagination(client, categoryId, p, signal);
    if (result.items.length === 0) break;

    allItems.push(...result.items);

    // 🛡️ Guard: only update if query still active (race condition protection)
    if (signal?.aborted) break;
    const currentData = queryClient.getQueryData(queryKey);
    if (!currentData) break;

    // 🔥 Update cache progressively (UI updates as new pages arrive)
    queryClient.setQueryData(queryKey, sortAndDedupe(allItems));

    if (!result.hasMore) break;

    const delay = p < 5 ? 50 : 100;
    await new Promise(r => setTimeout(r, delay));
  }

  return sortAndDedupe(allItems);
}

// Helper to sort and deduplicate
function sortAndDedupe(items: StalkerVOD[]): StalkerVOD[] {
  const map = new Map<string, StalkerVOD>();
  for (const item of items) {
    map.set(String(item.id), item);
  }
  const uniqueItems = Array.from(map.values());
  return uniqueItems.sort((a, b) => {
    const dateA = a.added ? new Date(a.added).getTime() : 0;
    const dateB = b.added ? new Date(b.added).getTime() : 0;
    return dateB - dateA;
  });
}

// ─── Main hook: useSeriesAll (SQLite first, then API refresh with progressive loading) ─────────────────
export const useSeriesAll = (client: StalkerClient, categoryId?: string) => {
  const accountId = client?.getAccount()?.id ?? 'default';
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const query = useQuery({
    queryKey: ['series-all', accountId, categoryId],
    queryFn: async ({ signal }) => {
      if (!categoryId) return [];

      // 1. First, try to load from SQLite (fast, offline-friendly) - LIMIT 1000 for performance
      const cachedItems = await getSeries(accountId, categoryId, 1000);
      const hasCache = cachedItems.length > 0;

      if (hasCache) {
        // 🔥 Background refresh (SWR) - silent, no progressive UI updates
        // Only run once per day (24 hours)
        const needsRefresh = shouldBackgroundRefresh(accountId, categoryId);
        const queryKey = ['series-all', accountId, categoryId];

        if (needsRefresh) {
          setIsRefreshing(true);
          fetchAllSeriesSilent(client, categoryId, signal)
            .then(items => {
              // 🛡️ Guard: don't update if user switched category (race condition)
              if (signal?.aborted) return;
              const currentData = queryClient.getQueryData(queryKey);
              if (!currentData) return;
              saveSeriesToDb(items, categoryId, accountId);
              queryClient.setQueryData(queryKey, items);
              setLastFetchTime(accountId, categoryId);
            })
            .catch(() => {})
            .finally(() => setIsRefreshing(false));
        }
        
        // Return cached data mapped to StalkerVOD format
        const sortedItems = [...cachedItems].sort((a, b) => (b.added || 0) - (a.added || 0));
        return sortedItems.map(s => ({
          id: Number.parseInt(s.id, 10) || 0,
          name: s.name,
          cmd: '', // ❗ Never use cached cmd - always fetch fresh (session-based)
          description: s.description || '',
          logo: s.posterUrl,
          poster: s.posterUrl,
          year: s.year,
          rating_imdb: s.rating,
          genre: s.genre,
          added: s.added || '',
          censored: false,
        })) as StalkerVOD[];
      }

      // 2. No cache - fetch with PROGRESSIVE loading (first page shows immediately)
      const items = await fetchAllSeriesProgressive(client, categoryId, accountId, queryClient, signal);
      saveSeriesToDb(items, categoryId, accountId);
      setLastFetchTime(accountId, categoryId);
      return items;
    },
    enabled: !!categoryId && !!accountId && accountId !== 'default',
    staleTime: 0,
    gcTime:    30 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    ...query,
    series: query.data ?? [],
    isRefreshing,
  };
};

// Throttling map for DB saves
const lastSaveTime = new Map<string, number>();
const SAVE_THROTTLE_MS = 30 * 1000; // 30 seconds

// Background refresh - once per day (24 hours)
const LAST_FETCH_KEY = 'series_last_fetch';
const BACKGROUND_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getLastFetchTime(accountId: string, categoryId: string): number {
  try {
    const key = `${LAST_FETCH_KEY}:${accountId}:${categoryId}`;
    const stored = localStorage.getItem(key);
    return stored ? Number.parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

function setLastFetchTime(accountId: string, categoryId: string): void {
  try {
    const key = `${LAST_FETCH_KEY}:${accountId}:${categoryId}`;
    localStorage.setItem(key, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

function shouldBackgroundRefresh(accountId: string, categoryId: string): boolean {
  const lastFetch = getLastFetchTime(accountId, categoryId);
  const timeSinceLastFetch = Date.now() - lastFetch;
  return timeSinceLastFetch >= BACKGROUND_REFRESH_INTERVAL_MS;
}

// Helper to save series to SQLite (throttled)
function saveSeriesToDb(items: StalkerVOD[], categoryId: string, accountId: string) {
  const key = `${accountId}:${categoryId}`;
  const now = Date.now();
  const lastSave = lastSaveTime.get(key) || 0;
  
  if (now - lastSave < SAVE_THROTTLE_MS) return;

  lastSaveTime.set(key, now);
  
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
      cmd: undefined, // ❗ Don't save cmd to DB - it's session-based
    })),
    accountId,
    categoryId,
  ).catch(() => {});
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
    queryFn: async () => {
      if (!seriesId) return null;
      const result = await getSeriesDetails(client, seriesId);
      // Ensure we always return a value (not undefined) to avoid React Query warnings
      return result ?? null;
    },
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
      const queryKey = ['series-stream', episode.id];
      const state = queryClient.getQueryState(queryKey);
      if (state?.fetchStatus === 'fetching') return;
      queryClient.prefetchQuery({
        queryKey,
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
