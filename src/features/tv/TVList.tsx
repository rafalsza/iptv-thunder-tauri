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
import { motion, AnimatePresence } from 'framer-motion';

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
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
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

  // Reset prefetch count when category changes
  useEffect(() => {
    prefetchCountRef.current = 0;
    lastPreloadedRef.current = null;
    // Clear all pending timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
  }, [selectedCategory?.id]);

  // Focus first channel after category change
  useEffect(() => {
    if (allChannels.length > 0) {
      setTimeout(() => {
        const firstChannel = document.querySelector('[data-tv-group="tv-channels"][data-tv-initial]') as HTMLElement;
        if (firstChannel) {
          firstChannel.focus();
        }
      }, 100);
    }
  }, [selectedCategory?.id]);

  // Debounced prefetch - waits 300ms and limits total prefetches
  const debouncedPreload = useCallback((channel: StalkerChannel) => {
    const channelId = String(channel.id);

    // Skip if already preloaded this channel
    if (lastPreloadedRef.current === channelId) return;

    // Skip if reached max prefetches (prevents spamming server)
    if (prefetchCountRef.current >= MAX_PREFETCHES) return;

    // Clear previous timeout for this specific channel
    const existingTimeout = timeoutsRef.current.get(channelId);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Set new timeout for this channel (300ms debounce)
    timeoutsRef.current.set(channelId, setTimeout(() => {
      preload(channel);
      lastPreloadedRef.current = channelId;
      prefetchCountRef.current++;
    }, 300));
  }, [preload]);

  const filtered = useMemo(() =>
    allChannels.filter((c: StalkerChannel) => {
      // Filter out separator channels (names starting with ####)
      if (c.name.startsWith('####')) return false;
      return c.name.toLowerCase().includes(search.toLowerCase());
    }),
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
      <AnimatePresence>
        {selectedCategory && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="border-b dark:border-slate-700/50 border-gray-200/50 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <motion.div
                className="w-10 h-10 bg-gradient-to-br from-green-600 to-green-800 rounded-lg flex items-center justify-center text-xl shadow-glow"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                {selectedCategory.id === '*' ? '🌍' : '📺'}
              </motion.div>
              <div className="flex-1">
                <h2 className="text-lg font-bold dark:text-white text-slate-900">{selectedCategory.title}</h2>
                <p className="text-sm dark:text-slate-400 text-slate-600">
                  {allChannels.length} {t('channels').toLowerCase()}
                </p>
              </div>
              {/* Favorite Category Button */}
              <motion.button
                data-tv-focusable
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedCategory) {
                    toggleCategory(String(selectedCategory.id), selectedCategory.title);
                  }
                }}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className="text-xl p-2 rounded-full dark:hover:bg-slate-700/50 dark:focus:bg-slate-700/50 hover:bg-gray-200/50 focus:bg-gray-200/50 transition-all"
                title={isCategoryFavorite(String(selectedCategory.id)) ? t('removeFromFavorites') : t('addToFavorites')}
              >
                <motion.span
                  animate={isCategoryFavorite(String(selectedCategory.id)) ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isCategoryFavorite(String(selectedCategory.id)) ? '❤️' : '🤍'}
                </motion.span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channels Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {filtered.map((channel: StalkerChannel, index: number) => (
          <motion.div
            key={channel.id}
            data-tv-focusable
            data-tv-group="tv-channels"
            data-tv-index={index}
            data-tv-initial={index === 0}
            tabIndex={0}
            ref={index === filtered.length - 1 && hasMore ? (el) => {
              if (el && observerRef.current) observerRef.current.observe(el);
            } : undefined}
            onMouseEnter={() => debouncedPreload(channel)}
            onFocus={() => debouncedPreload(channel)}
            onClick={() => onChannelSelect(channel)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            whileHover={{ scale: 1.05, y: -4, boxShadow: '0 10px 40px rgba(34, 197, 94, 0.2)' }}
            whileTap={{ scale: 0.98 }}
            className="p-3 dark:border border-slate-700/50 border-gray-300/50 rounded-xl cursor-pointer dark:bg-slate-800/30 bg-gray-100/30 dark:hover:bg-slate-700/50 hover:bg-gray-200/50 dark:hover:border-green-700 hover:border-green-700 transition-all dark:focus:bg-slate-700/50 focus:bg-gray-200/50 dark:focus:border-green-700 focus:border-green-700 backdrop-blur-sm"
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
              <motion.button
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItemFavorite('live', String(channel.id), {
                    name: channel.name,
                    poster: channel.logo,
                    cmd: channel.cmd,
                  });
                }}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className="ml-2 text-lg"
              >
                <motion.span
                  animate={isItemFavorite('live', String(channel.id)) ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isItemFavorite('live', String(channel.id)) ? '❤️' : '🤍'}
                </motion.span>
              </motion.button>
            </div>
            {!!channel.logo && <ChannelLogo logo={channel.logo} name={channel.name} />}
          </motion.div>
        ))}
        </motion.div>
        
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
