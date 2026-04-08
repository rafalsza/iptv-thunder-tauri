// =========================
// 📺 SERIES LIST (UI)
// =========================
import React, {
  useMemo, useRef, useState, useEffect, useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSeriesAll, usePrefetchSeriesStream } from './series.hooks';
import { useFavorites, useFavoriteCategories } from '@/hooks/useFavorites';
import { usePortalsStore } from '@/store/portals.store';
import { getImageUrl } from '@/hooks/useImageCache';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD, StalkerGenre } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 320;
const IMAGE_CACHE_LIMIT = 500;

// ─── Image cache (module-level, survives re-renders, bounded size) ─────────────

const imageCache = new Map<string, string>();

function setCachedImage(key: string, value: string) {
  if (imageCache.size >= IMAGE_CACHE_LIMIT) {
    imageCache.delete(imageCache.keys().next().value as string);
  }
  imageCache.set(key, value);
}

// ─── SeriesCard ────────────────────────────────────────────────────────────────

interface SeriesCardProps {
  series: StalkerVOD;
  isSelected: boolean;
  onSelect: (seriesName: string) => void;
  onPrefetch: (series: StalkerVOD) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (e: React.MouseEvent, series: StalkerVOD) => void;
}

const SeriesCard = React.memo<SeriesCardProps>(({
  series, isSelected, onSelect, onPrefetch, favoriteIds, onToggleFavorite,
}) => {
  const posterUrl = useMemo(
    () => series.poster || series.logo || '',
    [series.poster, series.logo]
  );
  const [imgSrc, setImgSrc] = useState<string | null>(() => imageCache.get(posterUrl) ?? null);
  const [imgError, setImgError] = useState(false);
  const isFavorite = favoriteIds.has(String(series.id));
  const seriesName = String(series.series || series.name || '');

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
      onMouseEnter={() => onPrefetch(series)}
      onClick={() => onSelect(String(series.id))}
      className={`cursor-pointer group h-full ${isSelected ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg border border-slate-700 hover:border-blue-500 hover:shadow-lg transition-all bg-slate-800 h-full flex flex-col">

        {/* Poster */}
        <div className="flex-1 bg-slate-700 relative overflow-hidden">
          {imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={series.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span style={{ fontSize: 48 }}>📺</span>
            </div>
          )}

          {/* Favorite button */}
          <button
            onClick={e => onToggleFavorite(e, series)}
            className="absolute top-2 right-2 text-xl bg-slate-900/50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900/80"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>
        </div>

        {/* Info */}
        <div className="p-2 bg-slate-800 flex-shrink-0 min-h-[60px] flex items-center">
          <h3 className="font-medium text-sm text-white line-clamp-2 leading-tight">
            {seriesName || series.name || 'Unknown'}
          </h3>
        </div>
      </div>
    </div>
  );
});

SeriesCard.displayName = 'SeriesCard';

interface SeriesListProps {
  client: StalkerClient;
  onSeriesSelect: (series: StalkerVOD) => void;
  selectedCategory?: StalkerGenre | null;
  search: string;
}

export const SeriesList: React.FC<SeriesListProps> = ({
  client, onSeriesSelect, selectedCategory, search,
}) => {
  // ── Data ──────────────────────────────────────────────────────────────────────
  const { series: seriesData, isLoading, error } = useSeriesAll(client, selectedCategory?.id);
  const prefetchStream = usePrefetchSeriesStream(client);

  // ── Favorites ─────────────────────────────────────────────────────────────────
  const accountId = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId)?.id ?? 'default'
  );
  const { favorites, toggleItemFavorite } = useFavorites(accountId);
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'series');

  const favoriteIds = useMemo(
    () => new Set(favorites.filter(f => f.type === 'series').map(f => String(f.item_id))),
    [favorites]
  );

  // ── Search (debounced) ────────────────────────────────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const filteredSeries = useMemo(() => {
    if (!seriesData) return [];
    if (!debouncedSearch) return seriesData;
    const lower = debouncedSearch.toLowerCase();
    return seriesData.filter((s: StalkerVOD) =>
      ((s.name || s.series || '') as string).toLowerCase().includes(lower)
    );
  }, [seriesData, debouncedSearch]);

  // ── Layout ────────────────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 5;
    const availableWidth = window.innerWidth - 256 - 32;
    return Math.max(2, Math.floor(availableWidth / 180));
  });

  // Responsive column count
  useEffect(() => {
    const calc = () => {
      if (!parentRef.current) return;
      setColumnCount(Math.max(2, Math.floor(parentRef.current.offsetWidth / 180)));
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
  const rowCount = Math.ceil(filteredSeries.length / columnCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // ── Prefetch guard ────────────────────────────────────────────────────────────
  const prefetchedRef = useRef(new Set<string>());

  const handlePrefetch = useCallback((series: StalkerVOD) => {
    const id = String(series.id);
    if (prefetchedRef.current.has(id)) return;
    if (prefetchedRef.current.size > 1000) prefetchedRef.current.clear();
    prefetchedRef.current.add(id);
    prefetchStream(series);
  }, [prefetchStream]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent, series: StalkerVOD) => {
    e.stopPropagation();
    const posterUrl = series.poster || series.logo || '';
    const name = series.name || series.series || '';
    toggleItemFavorite('series', String(series.id), {
      name: name as string,
      poster: posterUrl,
      cmd: series.cmd,
      extra: {
        description: series.description,
        rating_imdb: series.rating_imdb,
        rating_kinopoisk: series.rating_kinopoisk,
        director: series.director,
        actors: series.actors,
        year: series.year,
        genres_str: series.genres_str,
        country: series.country,
      },
    });
  }, [toggleItemFavorite]);


  const handleToggleCategoryFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedCategory) {
      toggleCategory(String(selectedCategory.id), selectedCategory.title);
    }
  }, [selectedCategory, toggleCategory]);

  const handleSeriesSelect = (seriesId: string) => {
    const series = seriesData?.find(s => String(s.id) === seriesId);
    if (series) {
      onSeriesSelect(series);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <svg className="animate-spin" style={{ width: 32, height: 32 }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="2" />
          <path d="M12 2 A10 10 0 0 1 22 12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-slate-400 text-sm">Loading series…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400">Error loading series</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-900">
      {/* Series Grid - Full Width */}
      <div className="w-full flex flex-col overflow-hidden">
        {/* Category header */}
        {selectedCategory && (
          <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center text-lg">
                📺
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">{selectedCategory.title}</h2>
                <p className="text-xs text-slate-400">
                  {filteredSeries.length} series
                  {debouncedSearch && seriesData && seriesData.length !== filteredSeries.length
                    ? ` (z ${seriesData.length})`
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
              height: rowVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(vRow => (
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
                  style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
                >
                  {(() => {
                    const startIndex = vRow.index * columnCount;
                    const endIndex = Math.min(startIndex + columnCount, filteredSeries.length);
                    const items = filteredSeries.slice(startIndex, endIndex);
                    return items.map((series: StalkerVOD) => {
                      const seriesId = String(series.id);
                      return (
                        <SeriesCard
                          key={seriesId}
                          series={series}
                          isSelected={false}
                          onSelect={handleSeriesSelect}
                          onPrefetch={handlePrefetch}
                          favoriteIds={favoriteIds}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      );
                    });
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
