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
import { useTranslation } from '@/hooks/useTranslation';
import { getImageUrl } from '@/hooks/useImageCache';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD, StalkerGenre } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// Responsive row height based on screen size (calculated dynamically)
const getRowHeight = () => {
  if (typeof window === 'undefined') return 240;
  const width = window.innerWidth;
  if (width > 3000) return 280;
  if (width > 2000) return 240;
  return 200;
};
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
  onSelect: (seriesName: string) => void;
  onPrefetch: (series: StalkerVOD) => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (e: React.MouseEvent, series: StalkerVOD) => void;
  seriesIndex: number;
}

const SeriesCard = React.memo<SeriesCardProps>(({
  series, onSelect, onPrefetch, favoriteIds, onToggleFavorite, seriesIndex,
}) => {
  const posterUrl = useMemo(
    () => series.poster || series.logo || '',
    [series.poster, series.logo]
  );
  const [imgSrc, setImgSrc] = useState<string | null>(() => imageCache.get(posterUrl) ?? null);
  const [imgError, setImgError] = useState(false);
  const isFavorite = favoriteIds.has(String(series.id));
  const seriesName = String(series.series || series.name || '');

  // Reset state when posterUrl changes (fix for virtualization reuse)
  useEffect(() => {
    setImgSrc(imageCache.get(posterUrl) ?? null);
    setImgError(false);
  }, [posterUrl]);

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
      data-tv-focusable
      data-tv-group="series"
      data-tv-index={seriesIndex}
      data-tv-initial={seriesIndex === 0}
      tabIndex={0}
      onMouseEnter={() => onPrefetch(series)}
      onFocus={() => onPrefetch(series)}
      onClick={() => onSelect(String(series.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
          e.preventDefault();
          onSelect(String(series.id));
        }
      }}
      className="cursor-pointer group h-[calc(100%-8px)] rounded-lg relative mb-1 focus:outline-none focus:shadow-[inset_0_0_0_3px_rgba(34,197,94,0.9)]"
    >
      <div className="relative overflow-hidden rounded-lg dark:border border-slate-700 border-gray-300 hover:border-green-700 hover:shadow-lg transition-all dark:bg-slate-800 bg-white h-full flex flex-col">

        {/* Poster */}
        <div className="flex-1 dark:bg-slate-700 bg-gray-200 relative overflow-hidden">
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
            className="absolute top-2 right-2 text-xl dark:bg-slate-900/50 bg-black/20 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity dark:hover:bg-slate-900/80 hover:bg-black/30"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>
        </div>

        {/* Info */}
        <div className="p-2 dark:bg-slate-800 bg-white flex-shrink-0 min-h-[60px] flex items-center">
          <h3 className="font-medium text-sm dark:text-white text-slate-900 line-clamp-2 leading-tight">
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
  const { t } = useTranslation();
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
    // Responsive card width: larger screens get larger cards
    const cardWidth = availableWidth > 3000 ? 160 : availableWidth > 2000 ? 140 : 120;
    return Math.max(2, Math.floor(availableWidth / cardWidth));
  });

  // Responsive column count
  useEffect(() => {
    const calc = () => {
      if (!parentRef.current) return;
      const availableWidth = parentRef.current.offsetWidth;
      // Responsive card width based on screen size
      const cardWidth = availableWidth > 3000 ? 160 : availableWidth > 2000 ? 140 : 120;
      setColumnCount(Math.max(2, Math.floor(availableWidth / cardWidth)));
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
    estimateSize: () => getRowHeight(),
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
        <p className="dark:text-slate-400 text-slate-600 text-sm">{t('loadingSeries')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400">{t('errorLoadingSeries')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Series Grid - Full Width */}
      <div className="w-full flex flex-col overflow-hidden">
        {/* Category header */}
        {selectedCategory && (
          <div className="flex-shrink-0 border-b dark:border-slate-700 border-gray-300 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-700 rounded-lg flex items-center justify-center text-lg">
                📺
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold dark:text-white text-slate-900">{selectedCategory.title}</h2>
                <p className="text-xs dark:text-slate-400 text-slate-600">
                  {filteredSeries.length} {(() => {
                    const count = filteredSeries.length;
                    if (count === 1) return t('seriesCount_1');
                    if (count >= 2 && count <= 4) return t('seriesCount_2_4');
                    return t('seriesCount_5_plus');
                  })()}
                  {debouncedSearch && seriesData && seriesData.length !== filteredSeries.length
                    ? ` (z ${seriesData.length})`
                    : ''}
                </p>
              </div>
              {/* Favorite Category Button */}
              <button
                onClick={handleToggleCategoryFavorite}
                className="text-xl hover:scale-110 transition-transform p-2 rounded-full dark:hover:bg-slate-700 hover:bg-gray-200"
                title={isCategoryFavorite(String(selectedCategory.id)) ? t('removeFromFavorites') : t('addToFavorites')}
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
                  height: getRowHeight(),
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
                    return items.map((series: StalkerVOD, idx) => {
                      const seriesId = String(series.id);
                      const seriesIndex = startIndex + idx;
                      return (
                        <SeriesCard
                          key={seriesId}
                          series={series}
                          onSelect={handleSeriesSelect}
                          onPrefetch={handlePrefetch}
                          favoriteIds={favoriteIds}
                          onToggleFavorite={handleToggleFavorite}
                          seriesIndex={seriesIndex}
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
