// =========================
// 🪝 MOVIES HOOKS — load all at once
// =========================
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD } from '@/types';
import { saveVod } from '@/hooks/useDatabase';
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
  return Array.from(map.values());
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export const useMoviesAll = (client: StalkerClient, categoryId?: string) => {
  const accountId = client?.getAccount()?.id ?? 'default';

  const query = useQuery({
    queryKey: ['movies-all', accountId, categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      console.log('🎬 Fetching all movies for category:', categoryId);
      const items = await fetchAllMovies(client, categoryId);
      console.log('🎬 Total movies loaded:', items.length);

      return items;
    },
    enabled: !!categoryId && !!accountId && accountId !== 'default',
    staleTime: 10 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Persist to SQLite when data successfully loads
  React.useEffect(() => {
    if (query.data && categoryId) {
      saveVod(
        query.data.map(vod => ({
          id: vod.id?.toString() || '',
          name: vod.name || '',
          description: vod.description || '',
          posterUrl: vod.logo || vod.poster || '',
          streamUrl: vod.cmd || '',
          year: vod.year,
          rating: vod.rating_imdb || vod.rating_kinopoisk,
          duration: vod.length,
          genre: categoryId,
          director: vod.director,
          actors: vod.actors,
          added: vod.added ? new Date(vod.added).getTime() : undefined,
        })),
        accountId,
      ).catch(err => console.error('[DB] Failed to save VOD:', err));
    }
  }, [query.data, categoryId, accountId]);

  return {
    ...query,
    movies: query.data ?? [],
  };
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const useMovieCategories = (client: StalkerClient) => {
  const portalId = client?.getAccount()?.id || 'default';

  const { categories, isLoading, refresh, isRefreshing } = useCategories(
    'vod',
    portalId,
    async () => {
      console.log('🎬 Fetching VOD categories from API…');
      const result = await client.getVODCategories();
      console.log('🎬 Got', result.length, 'VOD categories');
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