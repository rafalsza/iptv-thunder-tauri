// =========================
// 🎬 MOVIES LIST (UI)
// =========================
import React, {
  useMemo, useRef, useState, useEffect, useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMoviesAll, usePrefetchMovieStream } from './movies.hooks';
import { useFavorites, useFavoriteCategories } from '@/hooks/useFavorites';
import { useTranslation } from '@/hooks/useTranslation';
import { usePortalsStore } from '@/store/portals.store';
import { useResumeStore, type WatchStatus } from '@/store/resume.store';
import { getImageUrl } from '@/hooks/useImageCache';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD, StalkerGenre } from '@/types';
import { ContinueWatching } from './ContinueWatching';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT  = 320; // px — single source of truth, used in virtualizer + row style
const IMAGE_CACHE_LIMIT = 500;

// ─── Image cache (module-level, survives re-renders, bounded size) ─────────────

const imageCache = new Map<string, string>();

function setCachedImage(key: string, value: string) {
  if (imageCache.size >= IMAGE_CACHE_LIMIT) {
    // Evict oldest entry (Map preserves insertion order)
    imageCache.delete(imageCache.keys().next().value as string);
  }
  imageCache.set(key, value);
}

// ─── MovieCard ────────────────────────────────────────────────────────────────

interface MovieCardProps {
  movie: StalkerVOD;
  posterUrl: string;
  onSelect: (movie: StalkerVOD) => void;
  onPrefetch: (movie: StalkerVOD) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (e: React.MouseEvent, movie: StalkerVOD) => void;
  watchStatus?: WatchStatus;
  progressPercentage?: number;
}

const MovieCard = React.memo<MovieCardProps>(({
  movie, posterUrl, onSelect, onPrefetch, favoriteIds, onToggleFavorite,
  watchStatus, progressPercentage = 0,
}) => {
  const [imgSrc,  setImgSrc]  = useState<string | null>(() => imageCache.get(posterUrl) ?? null);
  const [imgError, setImgError] = useState(false);
  const isFavorite = favoriteIds.has(String(movie.id));
  const isWatched = watchStatus === 'watched';
  const isInProgress = watchStatus === 'in_progress';

  // Get progress data to recalculate percentage using movie.length for consistency
  const { getProgress } = useResumeStore();
  const progress = getProgress(String(movie.id));

  // Recalculate percentage using movie.length from API if available
  const displayPercentage = React.useMemo(() => {
    if (!progress || !isInProgress) return progressPercentage;
    if (movie.length && movie.length > 0) {
      const totalSeconds = movie.length * 60;
      return totalSeconds > 0 ? Math.round((progress.position / totalSeconds) * 100) : progressPercentage;
    }
    return progressPercentage;
  }, [progress, movie.length, isInProgress, progressPercentage]);

  useEffect(() => {
    if (!posterUrl || imageCache.has(posterUrl)) {
      // Already cached — state is set in initializer, nothing to do
      return;
    }

    let cancelled = false;
    getImageUrl(posterUrl)
      .then(url => {
        if (cancelled) return;
        setCachedImage(posterUrl, url);
        setImgSrc(url);
      })
      .catch(() => {
        if (cancelled) return;
        setCachedImage(posterUrl, '/fallback/poster.png');
        setImgSrc('/fallback/poster.png');
      });

    return () => { cancelled = true; };
  }, [posterUrl]);

  return (
    <div
      onMouseEnter={() => onPrefetch(movie)}
      onClick={() => onSelect(movie)}
      className="cursor-pointer group h-full"
    >
      <div className="relative overflow-hidden rounded-lg border border-slate-700 hover:border-blue-500 hover:shadow-lg transition-all bg-slate-800 h-full flex flex-col">

        {/* Poster */}
        <div className="flex-1 bg-slate-700 relative overflow-hidden">
          {imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={movie.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span style={{ fontSize: 48 }}>🎬</span>
            </div>
          )}

          {/* Favorite button */}
          <button
            onClick={e => onToggleFavorite(e, movie)}
            className="absolute top-2 right-2 text-xl bg-slate-900/50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900/80"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>

          {/* Watch Status Badge */}
          {isWatched && (
            <div className="absolute top-2 left-2 bg-green-600/90 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              Obejrzane
            </div>
          )}

          {/* Progress Bar */}
          {isInProgress && displayPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
              <div className="w-full bg-slate-600 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all"
                  style={{ width: `${displayPercentage}%` }}
                />
              </div>
              <div className="text-white text-xs mt-1 text-center">
                {displayPercentage}%
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 bg-slate-800 flex-shrink-0 min-h-[60px] flex items-center">
          <h3 className="font-medium text-sm text-white line-clamp-2 leading-tight">
            {movie.name}
          </h3>
        </div>
      </div>
    </div>
  );
});

MovieCard.displayName = 'MovieCard';

// ─── MovieList ────────────────────────────────────────────────────────────────

interface MovieListProps {
  client: StalkerClient;
  onMovieSelect: (movie: StalkerVOD) => void;
  selectedCategory?: StalkerGenre | null;
  search: string;
}

export const MovieList: React.FC<MovieListProps> = ({
  client, onMovieSelect, selectedCategory, search,
}) => {
  const { t } = useTranslation();
  // ── Data ──────────────────────────────────────────────────────────────────────
  const { movies, isLoading, error } = useMoviesAll(client, selectedCategory?.id);
  const prefetchStream = usePrefetchMovieStream(client);

  // ── Favorites ─────────────────────────────────────────────────────────────────
  const accountId = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId)?.id ?? 'default'
  );
  const { favorites, toggleItemFavorite } = useFavorites(accountId);
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'vod');

  const favoriteIds = useMemo(
    () => new Set(favorites.filter(f => f.type === 'vod').map(f => String(f.item_id))),
    [favorites],
  );

  // ── Search (debounced) ────────────────────────────────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return movies;
    const lower = debouncedSearch.toLowerCase();
    return movies.filter((m: StalkerVOD) => m.name.toLowerCase().includes(lower));
  }, [movies, debouncedSearch]);

  // ── Layout ────────────────────────────────────────────────────────────────────
  const parentRef    = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(() => {
    if (globalThis.window === undefined) return 5;
    // Subtract sidebar (~256px) and padding (~32px)
    const availableWidth = window.innerWidth - 256 - 32;
    return Math.max(2, Math.floor(availableWidth / 180));
  });

  // Responsive column count based on container width
  useEffect(() => {
    const calc = () => {
      if (!parentRef.current) return;
      setCols(Math.max(2, Math.floor(parentRef.current.offsetWidth / 180)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (parentRef.current) ro.observe(parentRef.current);
    return () => ro.disconnect();
  }, []);

  // Reset scroll when category changes
  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [selectedCategory?.id]);

  // ── Virtualizer ───────────────────────────────────────────────────────────────
  const rowCount = Math.ceil(filtered.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Stable row getter — avoids pre-building a rows array for large datasets
  const getRow = useCallback(
    (rowIndex: number): StalkerVOD[] =>
      filtered.slice(rowIndex * cols, rowIndex * cols + cols),
    [filtered, cols],
  );

  // ── Prefetch guard (prevent duplicate requests) ───────────────────────────────
  const prefetchedRef = useRef(new Set<string>());

  const handlePrefetch = useCallback((movie: StalkerVOD) => {
    const id = String(movie.id);
    if (prefetchedRef.current.has(id)) return;
    if (prefetchedRef.current.size > 1000) prefetchedRef.current.clear();
    prefetchedRef.current.add(id);
    prefetchStream(movie);
  }, [prefetchStream]);

  const handleToggleCategoryFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedCategory) {
      toggleCategory(String(selectedCategory.id), selectedCategory.title);
    }
  }, [selectedCategory, toggleCategory]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent, movie: StalkerVOD) => {
    e.stopPropagation();
    const posterUrl = movie.poster || movie.logo || '';
    toggleItemFavorite('vod', String(movie.id), {
      name: movie.name,
      poster: posterUrl,
      cmd: movie.cmd,
      extra: {
        description: movie.description,
        year: movie.year,
        genre: movie.genres_str,
        actors: movie.actors,
        director: movie.director,
        country: movie.country,
        length: movie.length,
        rating_imdb: movie.rating_imdb,
        rating_kinopoisk: movie.rating_kinopoisk,
      },
    });
  }, [toggleItemFavorite]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <svg className="animate-spin" style={{ width: 32, height: 32 }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="2" />
          <path d="M12 2 A10 10 0 0 1 22 12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-slate-400 text-sm">{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400">{t('error')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Continue Watching Section - Show when no category selected (all movies) */}
      {!selectedCategory && (
        <ContinueWatching onMovieSelect={onMovieSelect} />
      )}

      {/* Category header */}
      {selectedCategory && (
        <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center text-lg">
              🎬
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-white">{selectedCategory.title}</h2>
              <p className="text-xs text-slate-400">
                {filtered.length} film{filtered.length !== 1 ? 'ów' : ''}
                {debouncedSearch && movies.length !== filtered.length
                  ? ` (z ${movies.length})`
                  : ''}
              </p>
            </div>
            {/* Favorite Category Button */}
            <button
              onClick={handleToggleCategoryFavorite}
              className="text-xl hover:scale-110 transition-transform p-2 rounded-full hover:bg-slate-700"
              title={isCategoryFavorite(String(selectedCategory.id)) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            >
              {isCategoryFavorite(String(selectedCategory.id)) ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      )}

      {/* Virtualized grid */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-4">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map(vRow => (
            <div
              key={vRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4 h-full"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {getRow(vRow.index).map(movie => {
                  const movieId = String(movie.id);
                  const progress = useResumeStore.getState().getProgress(movieId);
                  return (
                    <MovieCard
                      key={movieId}
                      movie={movie}
                      posterUrl={movie.poster || movie.logo || ''}
                      onSelect={onMovieSelect}
                      onPrefetch={handlePrefetch}
                      favoriteIds={favoriteIds}
                      onToggleFavorite={handleToggleFavorite}
                      watchStatus={progress?.status}
                      progressPercentage={progress?.percentage}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};