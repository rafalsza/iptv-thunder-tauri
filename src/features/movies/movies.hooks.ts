// =========================
// 🪝 MOVIES HOOKS — load all at once
// =========================
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD } from '@/types';
import { saveVod, getVod } from '@/hooks/useDatabase';
import { useCategories } from '@/hooks/useCategories';

// Write queue to prevent race conditions in DB writes
const writeQueue = new Map<string, Promise<void>>();

async function queuedSaveVod(vodList: any[], accountId: string, categoryId: string): Promise<void> {
  const queueKey = `${accountId}:${categoryId}`;

  // If there's already a write in progress for this category, wait for it
  const existingWrite = writeQueue.get(queueKey);
  if (existingWrite) {
    await existingWrite;
  }

  // Create new write promise
  const writePromise = saveVod(vodList, accountId).finally(() => {
    // Remove from queue when done
    writeQueue.delete(queueKey);
  });

  writeQueue.set(queueKey, writePromise);
  return writePromise;
}

async function fetchAllMovies(
  client: StalkerClient,
  categoryId: string,
  signal?: AbortSignal,
  queryClient?: ReturnType<typeof useQueryClient>,
): Promise<StalkerVOD[]> {
  // Check if aborted before starting
  if (signal?.aborted) {
    throw new Error('Request cancelled');
  }

  const first = await client.getVODListWithPagination(categoryId, 1, { signal });

  if (!first.hasMore || first.items.length === 0) {
    return first.items;
  }

  // Process first page immediately for progressive hydration
  const processItems = (items: StalkerVOD[]) => {
    const map = new Map<string, StalkerVOD>();
    for (const item of items) {
      // Clone object to avoid mutating API response
      const cloned = {
        ...item,
        name: item.o_name && item.o_name !== item.name ? item.o_name : item.name,
      };
      map.set(String(item.id), cloned);
    }
    const uniqueItems = Array.from(map.values());
    const withTimestamps = uniqueItems.map(item => ({
      ...item,
      _ts: item.added ? new Date(item.added).getTime() : 0,
    }));
    withTimestamps.sort((a, b) => b._ts - a._ts);
    return withTimestamps;
  };

  // Return first page immediately for progressive hydration
  const firstPageProcessed = processItems(first.items);

  // Fetch remaining pages in background
  const totalPages = first.totalItems > 0 && first.maxPageItems > 0
    ? Math.ceil(first.totalItems / first.maxPageItems)
    : undefined;

  if (totalPages) {
    // Progressive fetch: load pages sequentially in background
    const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    let allItems = [...first.items];

    // Update query data as each page loads
    const updateQueryData = (newItems: StalkerVOD[]) => {
      // Check if aborted before updating UI
      if (signal?.aborted) return;
      if (queryClient) {
        queryClient.setQueryData(['movies-all', client?.getAccount()?.id ?? 'default', categoryId], () => processItems(newItems));
      }
    };

    // Fetch pages progressively
    for (const page of pageNums) {
      if (signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      try {
        const pageData = await client.getVODListWithPagination(categoryId, page, { signal });
        allItems = [...allItems, ...pageData.items];
        updateQueryData(allItems);
      } catch (e) {
        // Continue on error for individual pages
        console.error(`Failed to fetch page ${page}:`, e);
      }
    }

    return processItems(allItems);
  }

  return firstPageProcessed;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export const useMoviesAll = (client: StalkerClient, categoryId?: string) => {
  const account = client?.getAccount();
  const accountId = account?.id ?? 'default';
  const enabled = !!categoryId && !!accountId;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['movies-all', accountId, categoryId],
    queryFn: async ({ signal }) => {
      if (!categoryId) return [];

      // Try SQLite cache first
      const cached = await getVod(accountId, categoryId);

      if (cached.length > 0) {
        // Return raw cached data - transformation happens in useMemo
        return cached;
      }

      // No cache - fetch from API with abort signal and progressive hydration
      const items = await fetchAllMovies(client, categoryId, signal, queryClient);

      // Save to SQLite for future use (queued to prevent race conditions)
      if (items.length > 0) {
        queuedSaveVod(
          items.map(vod => ({
            id: vod.id?.toString() || '',
            name: vod.o_name || vod.name || '',
            description: vod.description || '',
            posterUrl: vod.logo || vod.poster || '',
            streamUrl: vod.cmd || '',
            year: vod.year,
            rating: vod.rating_imdb || vod.rating_kinopoisk,
            duration: vod.length,
            genre: vod.genres_str || '',
            director: vod.director,
            actors: vod.actors,
            added: vod.added ? new Date(vod.added).getTime() : undefined,
          })),
          accountId,
          categoryId,
        ).catch(err => console.error('[DB] Failed to save VOD:', err));
      }

      return items;
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 min cache - prevents refetch on scroll/remount
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Transform cached data in useMemo to prevent GC spikes on mount
  const movies = React.useMemo(() => {
    const data = query.data;
    if (!data || data.length === 0) return [];

    // Type guard to check if data is from DB (has streamUrl property)
    const isDbVod = (x: any): x is { streamUrl: string; posterUrl: string } => {
      return typeof x.streamUrl === 'string' && typeof x.posterUrl === 'string';
    };

    const isRawDbData = data.length > 0 && isDbVod(data[0]);

    if (isRawDbData) {
      // Transform DB format to StalkerVOD and precompute timestamps
      const transformed = (data as any[]).map(v => ({
        id: Number(v.id),
        name: v.name,
        description: v.description,
        logo: v.posterUrl,
        poster: v.posterUrl,
        cmd: v.streamUrl,
        year: v.year,
        rating_imdb: v.rating,
        rating_kinopoisk: undefined,
        length: v.duration,
        genre: v.genre,
        director: v.director,
        actors: v.actors,
        added: v.added ? new Date(v.added).toISOString() : undefined,
        censored: false,
        _ts: v.added ? new Date(v.added).getTime() : 0,
      } as StalkerVOD & { _ts: number }));

      // Sort by precomputed timestamp - newest first
      transformed.sort((a, b) => b._ts - a._ts);

      return transformed;
    }

    // Data is already in StalkerVOD format (from API)
    return data as StalkerVOD[];
  }, [query.data]);

  return {
    ...query,
    movies,
  };
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const useMovieCategories = (client: StalkerClient) => {
  const portalId = client?.getAccount()?.id || 'default';

  const { categories, isLoading, refresh, isRefreshing } = useCategories(
    'vod',
    portalId,
    async () => {
      return await client.getVODCategories();
    },
  );

  return {
    data: categories,
    isLoading,
    refetch: refresh,
    isRefetching: isRefreshing,
    error: null,
  };
};

// ─── Movie details ────────────────────────────────────────────────────────────

export const useMovieDetails = (client: StalkerClient, movieId?: string, cmd?: string) => {
  return useQuery({
    queryKey: ['movie-details', movieId, cmd],
    queryFn: async () => {
      // Try to get details by ID first
      if (movieId && movieId !== '0' && movieId !== 'NaN') {
        const result = await client.getVODDetails(movieId);
        // Ensure we never return undefined
        return result ?? null;
      }
      // Return null as fallback (React Query doesn't allow undefined)
      return null;
    },
    enabled: !!movieId,
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
};

// ─── Prefetch stream URL ──────────────────────────────────────────────────────

export const usePrefetchMovieStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();
  const lastPrefetch = React.useRef(new Map<string, number>());
  const PREFETCH_DEBOUNCE_MS = 1000; // 1 second debounce per movie
  const PREFETCH_STALE_MS = 5 * 60 * 1000; // 5 minutes stale time
  const TTL_MS = 10 * 60 * 1000; // 10 minutes TTL for cleanup

  return React.useCallback(
    (movie: StalkerVOD) => {
      if (!movie.cmd) return;
      const movieId = String(movie.id);
      const queryKey = ['movie-stream', movieId];
      const now = Date.now();

      // Cleanup old entries (TTL) to prevent memory leaks
      for (const [id, time] of lastPrefetch.current.entries()) {
        if (now - time > TTL_MS) {
          lastPrefetch.current.delete(id);
        }
      }

      // Check if already fetching
      const state = queryClient.getQueryState(queryKey);
      if (state?.fetchStatus === 'fetching') return;

      // Per-movie debounce: check if we prefetched recently
      const lastPrefetchTime = lastPrefetch.current.get(movieId);
      if (lastPrefetchTime && now - lastPrefetchTime < PREFETCH_DEBOUNCE_MS) {
        return; // Skip prefetch if we recently prefetched this movie
      }

      // Stale avoidance: check if data is still fresh
      if (state?.dataUpdatedAt && now - state.dataUpdatedAt < PREFETCH_STALE_MS) {
        return; // Skip prefetch if data is still fresh
      }

      // Update last prefetch time
      lastPrefetch.current.set(movieId, now);

      // Prefetch the stream URL
      queryClient.prefetchQuery({
        queryKey,
        queryFn: () => client.getVODUrl(movie.cmd),
        staleTime: PREFETCH_STALE_MS,
      });
    },
    [client, queryClient],
  );
};