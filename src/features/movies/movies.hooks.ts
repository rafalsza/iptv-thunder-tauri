// =========================
// 🪝 MOVIES HOOKS — load all at once
// =========================
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD } from '@/types';
import { saveVod, getVod } from '@/hooks/useDatabase';
import { useCategories } from '@/hooks/useCategories';

async function fetchAllMovies(
  client: StalkerClient,
  categoryId: string,
): Promise<StalkerVOD[]> {
  const first = await client.getVODListWithPagination(categoryId, 1);

  if (!first.hasMore || first.items.length === 0) {
    return first.items;
  }

  // Determine total pages from totalItems and maxPageItems
  const totalPages = first.totalItems > 0 && first.maxPageItems > 0
    ? Math.ceil(first.totalItems / first.maxPageItems)
    : undefined;

  let allItems: StalkerVOD[];

  if (totalPages) {
    // Fast path — parallel fetch of known page range
    const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const rest = await Promise.all(
      pageNums.map(p =>
        client
          .getVODListWithPagination(categoryId, p)
          .then(r => r.items)
          .catch(() => [] as StalkerVOD[]),
      ),
    );
    allItems = [...first.items, ...rest.flat()];
  } else {
    allItems = first.items;
  }

  // Deduplicate by id (pages can overlap on some servers)
  const map = new Map<string, StalkerVOD>();
  for (const item of allItems) {
    map.set(String(item.id), item);
  }
  const uniqueItems = Array.from(map.values());

  // Sort by added date - newest first
  uniqueItems.sort((a, b) => {
    const dateA = a.added ? new Date(a.added).getTime() : 0;
    const dateB = b.added ? new Date(b.added).getTime() : 0;
    return dateB - dateA;
  });

  return uniqueItems;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export const useMoviesAll = (client: StalkerClient, categoryId?: string) => {
  const accountId = client?.getAccount()?.id ?? 'default';
  const queryClient = useQueryClient();
  const enabled = !!categoryId && !!accountId && accountId !== 'default';
  // Clear stale cache on category change
  React.useEffect(() => {
    if (categoryId && accountId) {
      const key = ['movies-all', accountId, categoryId];
      const cached = queryClient.getQueryData(key);
      if (cached !== undefined) {
        queryClient.removeQueries({ queryKey: key, exact: true });
      }
    }
  }, [categoryId, accountId, queryClient]);

  const query = useQuery({
    queryKey: ['movies-all', accountId, categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      // Try SQLite cache first
      const cached = await getVod(accountId, categoryId);

      if (cached.length > 0) {
        // Return cached data immediately, sorted by added date
        return cached
          .map(v => ({
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
          } as StalkerVOD))
          .sort((a, b) => {
            const dateA = a.added ? new Date(a.added).getTime() : 0;
            const dateB = b.added ? new Date(b.added).getTime() : 0;
            return dateB - dateA;
          });
      }

      // No cache - fetch from API
      const items = await fetchAllMovies(client, categoryId);

      // Save to SQLite for future use
      if (items.length > 0) {
        saveVod(
          items.map(vod => ({
            id: vod.id?.toString() || '',
            name: vod.name || '',
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
        ).catch(err => console.error('[DB] Failed to save VOD:', err));
      }

      return items;
    },
    enabled,
    staleTime: 30 * 60 * 1000, // 30 min - cache considered fresh
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true, // Background refresh on mount if stale
  });

  return {
    ...query,
    movies: query.data || [],
  };
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const useMovieCategories = (client: StalkerClient) => {
  const portalId = client?.getAccount()?.id || 'default';

  const { categories, isLoading, refresh, isRefreshing } = useCategories(
    'vod',
    portalId,
    async () => {
      const result = await client.getVODCategories();
      return result;
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

export const useMovieDetails = (client: StalkerClient, movieId?: string) => {
  return useQuery({
    queryKey: ['movie-details', movieId],
    queryFn: () => client.getVODDetails(movieId!),
    enabled: !!movieId,
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
};

// ─── Prefetch stream URL ──────────────────────────────────────────────────────

export const usePrefetchMovieStream = (client: StalkerClient) => {
  const queryClient = useQueryClient();

  return React.useCallback(
    (movie: StalkerVOD) => {
      if (!movie.cmd) return;
      queryClient.prefetchQuery({
        queryKey: ['movie-stream', movie.id],
        queryFn: () => client.getVODUrl(movie.cmd),
        staleTime: 5 * 60 * 1000,
      });
    },
    [client, queryClient],
  );
};