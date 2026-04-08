// =========================
// ❤️ FAVORITE MOVIES LIST - Using SQLite Metadata
// =========================
import React, {
  useMemo, useRef, useState, useEffect, useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFavorites } from '@/hooks/useFavorites';
import { getImageUrl } from '@/hooks/useImageCache';
import { StalkerVOD } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 320; // px — single source of truth
const IMAGE_CACHE_LIMIT = 500;

// ─── Image cache (module-level, survives re-renders, bounded size) ─────────────

const imageCache = new Map<string, string>();

function setCachedImage(key: string, value: string) {
  if (imageCache.size >= IMAGE_CACHE_LIMIT) {
    imageCache.delete(imageCache.keys().next().value as string);
  }
  imageCache.set(key, value);
}

// ─── MovieCard ────────────────────────────────────────────────────────────────

interface MovieCardProps {
  movie: StalkerVOD;
  posterUrl: string;
  onSelect: (movie: StalkerVOD) => void;
  onToggleFavorite: (e: React.MouseEvent, movie: StalkerVOD) => void;
}

const MovieCard = React.memo<MovieCardProps>(({
  movie, posterUrl, onSelect, onToggleFavorite,
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(() => imageCache.get(posterUrl) ?? null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!posterUrl || imageCache.has(posterUrl)) {
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
            aria-label="Remove from favorites"
          >
            ❤️
          </button>
        </div>

        {/* Info */}
        <div className="p-2 bg-slate-800 flex-shrink-0 min-h-[60px]">
          <h3 className="font-medium text-sm text-white line-clamp-2 leading-tight mb-1">
            {movie.name}
          </h3>
          {movie.genre && (
            <span className="text-xs text-slate-500 truncate block">{movie.genre}</span>
          )}
        </div>
      </div>
    </div>
  );
});

MovieCard.displayName = 'MovieCard';

// ─── FavoriteMoviesList ───────────────────────────────────────────────────────

interface FavoriteMoviesListProps {
  accountId: string;
  search: string;
  onMovieSelect: (movie: StalkerVOD) => void;
}

export const FavoriteMoviesList: React.FC<FavoriteMoviesListProps> = ({
  accountId,
  search,
  onMovieSelect,
}) => {
  // Use SQLite for favorites with full metadata
  const { favorites: dbFavorites, toggleItemFavorite, isLoading } = useFavorites(accountId);

  // Convert favorites to StalkerVOD format - NO API CALLS NEEDED!
  const favoriteMovies = useMemo(() =>
    dbFavorites
      .filter(f => f.type === 'vod')
      .map(f => {
        const extra = f.extra ? JSON.parse(f.extra) : {};
        return {
          id: Number.parseInt(f.item_id) || 0,
          name: f.name || `Film ${f.item_id}`,
          logo: f.poster,
          poster: f.poster,
          cmd: f.cmd,
          series: '',
          description: extra.description || '',
          year: extra.year,
          genres_str: extra.genre,
          actors: extra.actors,
          director: extra.director,
          country: extra.country,
          length: extra.length,
          rating_imdb: extra.rating_imdb,
          rating_kinopoisk: extra.rating_kinopoisk,
          added: '',
          censored: false,
        } as StalkerVOD;
      })
      .filter((m, index, self) =>
        index === self.findIndex(t => t.id === m.id)
      ),
  [dbFavorites]);

  // Apply search filter
  const filtered = useMemo(() =>
    favoriteMovies.filter((m: StalkerVOD) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteMovies, search]);

  // ── Layout ────────────────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(() => {
    if (globalThis.window === undefined) return 5;
    const availableWidth = window.innerWidth - 256 - 32;
    return Math.max(2, Math.floor(availableWidth / 180));
  });

  // Responsive column count
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

  // ── Virtualizer ───────────────────────────────────────────────────────────────
  const rowCount = Math.ceil(filtered.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const getRow = useCallback(
    (rowIndex: number): StalkerVOD[] =>
      filtered.slice(rowIndex * cols, rowIndex * cols + cols),
    [filtered, cols],
  );

  const handleToggleFavorite = useCallback((e: React.MouseEvent, movie: StalkerVOD) => {
    e.stopPropagation();
    const posterUrl = movie.poster || movie.logo || '';
    toggleItemFavorite('vod', String(movie.id), {
      name: movie.name,
      poster: posterUrl,
      cmd: movie.cmd,
    });
  }, [toggleItemFavorite]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <svg className="animate-spin" style={{ width: 32, height: 32 }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="2" />
          <path d="M12 2 A10 10 0 0 1 22 12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-slate-400 text-sm">Ładowanie ulubionych filmów…</p>
      </div>
    );
  }

  if (favoriteMovies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❤️</div>
          <h2 className="text-2xl font-bold mb-2">Brak ulubionych filmów</h2>
          <p className="text-slate-400 mb-4">
            Dodaj filmy do ulubionych klikając ❤️ przy filmie
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-white">Ulubione filmy</h2>
          <p className="text-xs text-slate-400">
            {filtered.length} z {favoriteMovies.length} filmów
          </p>
        </div>
      </div>

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
                {getRow(vRow.index).map(movie => (
                  <MovieCard
                    key={String(movie.id)}
                    movie={movie}
                    posterUrl={movie.poster || movie.logo || ''}
                    onSelect={onMovieSelect}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
