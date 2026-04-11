// =========================
// 📺 TV LIST (UI)
// =========================
import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { useLazyChannels, usePrefetchStream } from './tv.hooks';
import { useFavorites, useFavoriteCategories } from '@/hooks/useFavorites';
import { useTranslation } from '@/hooks/useTranslation';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel, StalkerGenre } from '@/types';
import { ChannelLogo } from './ChannelLogo';

interface TVListProps {
  client: StalkerClient;
  accountId: string;
  search: string;
  onChannelSelect: (channel: StalkerChannel) => void;
  selectedCategory?: StalkerGenre | null;
}

export const TVList: React.FC<TVListProps> = ({
  client,
  accountId,
  search,
  onChannelSelect,
  selectedCategory
}) => {
  const { t } = useTranslation();
  const {
    channels: allChannels = [],
    isLoading,
    hasMore,
    loadMore,
    error
  } = useLazyChannels(client, selectedCategory?.id);
  const preload = usePrefetchStream(client);
  const { isItemFavorite, toggleItemFavorite } = useFavorites(accountId);
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'live');

  // Debounce refs
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPreloadedRef = useRef<string | null>(null);
  const prefetchCountRef = useRef(0);
  const MAX_PREFETCHES = 10;
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: '100px' }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, loadMore]);

  // Debounced prefetch - waits 300ms and limits total prefetches
  const debouncedPreload = useCallback((channel: StalkerChannel) => {
    const channelId = String(channel.id);
    
    // Skip if already preloaded this channel
    if (lastPreloadedRef.current === channelId) return;
    
    // Skip if reached max prefetches (prevents spamming server)
    if (prefetchCountRef.current >= MAX_PREFETCHES) return;

    // Clear previous timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Set new timeout (300ms debounce)
    timeoutRef.current = setTimeout(() => {
      preload(channel);
      lastPreloadedRef.current = channelId;
      prefetchCountRef.current++;
    }, 300);
  }, [preload]);

  const filtered = useMemo(() =>
    allChannels.filter((c: StalkerChannel) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
  [allChannels, search]);

  if (isLoading && allChannels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg dark:text-white text-slate-900">{t('loading')}</div>
      </div>
    );
  }

  if (error && allChannels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg text-red-500">{t('error')}: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Category Header - Unified Style */}
      {selectedCategory && (
        <div className="border-b dark:border-slate-700 border-gray-300 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center text-xl">
              {selectedCategory.id === '*' ? '🌍' : '📺'}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold dark:text-white text-slate-900">{selectedCategory.title}</h2>
              <p className="text-sm dark:text-slate-400 text-slate-600">
                {allChannels.length} {t('channels').toLowerCase()}
              </p>
            </div>
            {/* Favorite Category Button */}
            <button
              data-tv-focusable
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedCategory) {
                  toggleCategory(String(selectedCategory.id), selectedCategory.title);
                }
              }}
              className="text-xl hover:scale-110 transition-transform p-2 rounded-full dark:hover:bg-slate-700 dark:focus:bg-slate-700 hover:bg-gray-200 focus:bg-gray-200"
              title={isCategoryFavorite(String(selectedCategory.id)) ? t('removeFromFavorites') : t('addToFavorites')}
            >
              {isCategoryFavorite(String(selectedCategory.id)) ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      )}

      {/* Channels Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((channel: StalkerChannel, index: number) => (
          <div
            key={channel.id}
            data-tv-focusable
            tabIndex={0}
            ref={index === filtered.length - 1 && hasMore ? (el) => {
              if (el && observerRef.current) observerRef.current.observe(el);
            } : undefined}
            onMouseEnter={() => debouncedPreload(channel)}
            onClick={() => onChannelSelect(channel)}
            className="p-3 dark:border border-slate-700 border-gray-300 rounded-lg cursor-pointer dark:hover:bg-slate-700 hover:bg-gray-200 dark:hover:border-green-700 hover:border-green-700 transition-all dark:focus:bg-slate-700 focus:bg-gray-200 dark:focus:border-green-700 focus:border-green-700"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm dark:text-white text-slate-900 truncate">
                  {channel.name}
                </h3>
                {!!channel.number && (
                  <p className="text-xs dark:text-slate-400 text-slate-600">#{channel.number}</p>
                )}
              </div>
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemFavorite('live', String(channel.id), {
                    name: channel.name,
                    poster: channel.logo,
                    cmd: channel.cmd,
                  });
                }}
                className="ml-2 text-lg hover:scale-110 transition-transform focus:scale-110"
              >
                {isItemFavorite('live', String(channel.id)) ? '❤️' : '🤍'}
              </button>
            </div>
            {!!channel.logo && <ChannelLogo logo={channel.logo} name={channel.name} />}
          </div>
        ))}
        </div>
        
        {/* Infinite scroll trigger and loading state */}
        {isLoading && (
          <div className="flex justify-center py-4">
            <div className="dark:text-white text-slate-900">{t('loading')}...</div>
          </div>
        )}
        
        {error && (
          <div className="flex justify-center py-4">
            <div className="text-red-400 text-sm">{error.message}</div>
          </div>
        )}

        {/* No search results */}
        {!isLoading && search && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 dark:text-slate-400 text-slate-600">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-lg dark:text-white text-slate-900">Nie znaleziono kanałów</p>
            <p className="text-sm dark:text-slate-500 text-slate-500">Brak wyników dla "{search}"</p>
          </div>
        )}

        {!isLoading && !hasMore && filtered.length > 0 && (
          <div className="text-center py-4 dark:text-slate-500 text-slate-500">
            {filtered.length} z {allChannels.length} {t('channels').toLowerCase()}
          </div>
        )}
      </div>
    </div>
  );
};
