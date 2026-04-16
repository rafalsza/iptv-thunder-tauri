// =========================
// 🎯 FOR YOU SECTION - Netflix Style Horizontal Carousels
// =========================
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { usePortalsStore } from '@/store/portals.store';
import { useRecentViewed, type RecentItem } from '@/hooks/useRecentItems';
import { useResumeStore } from '@/store/resume.store';
import { motion } from 'framer-motion';
import { Star, Tv, Film, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaCard } from '@/components/ui/MediaCard';
import { StalkerChannel, StalkerVOD } from '@/types';

interface ForYouSectionProps {
  onChannelSelect?: (channel: StalkerChannel) => void;
  onSeriesSelect?: (series: StalkerVOD) => void;
  onMoviePlay?: (movie: StalkerVOD, resumePosition?: number) => void;
}

// =========================
// 📺 HORIZONTAL CAROUSEL ROW COMPONENT
// =========================
interface CarouselRowProps {
  title: string;
  icon: React.ReactNode;
  items: RecentItem[];
  onItemClick: (item: RecentItem) => void;
  getProgressPercentage: (item: RecentItem) => number;
  formatTimeAgo: (timestamp: number, isLive?: boolean) => string;
  tvGroup: string;
}

// Virtualization constants - tune for TV performance
const BUFFER_CARDS = 3; // Extra cards to render outside viewport
const CARD_WIDTH_SM = 162; // 150px + 12px gap
const CARD_WIDTH_MD = 182; // 170px + 12px gap  
const CARD_WIDTH_LG = 202; // 190px + 12px gap

const getCardWidth = () => {
  if (globalThis.window === undefined) return CARD_WIDTH_MD;
  const w = window.innerWidth;
  if (w < 640) return CARD_WIDTH_SM;
  if (w < 768) return CARD_WIDTH_MD;
  return CARD_WIDTH_LG;
};

const CarouselRow: React.FC<CarouselRowProps> = ({
  title,
  icon,
  items,
  onItemClick,
  getProgressPercentage,
  formatTimeAgo,
  tvGroup,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);
  const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: 10 });

  // Stable checkScroll with useCallback
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(
      el.scrollLeft < el.scrollWidth - el.clientWidth - 10
    );
  }, []);

  // Throttled version for performance (important on TV)
  const throttledCheckScroll = useMemo(() => {
    let lastTime = 0;
    const throttleMs = 100;
    return () => {
      const now = Date.now();
      if (now - lastTime >= throttleMs) {
        lastTime = now;
        checkScroll();
      }
    };
  }, [checkScroll]);

  // Virtualization - update visible range on scroll
  const updateVisibleRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const cardWidth = getCardWidth();
    const containerWidth = el.clientWidth;
    const scrollLeft = el.scrollLeft;
    
    // Calculate visible indices
    const startIndex = Math.max(0, Math.floor(scrollLeft / cardWidth) - BUFFER_CARDS);
    const visibleCount = Math.ceil(containerWidth / cardWidth) + BUFFER_CARDS * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    
    setVisibleRange({ start: startIndex, end: endIndex });
  }, [items.length]);

  // Throttled version for scroll
  const throttledUpdateRange = useMemo(() => {
    let lastTime = 0;
    const throttleMs = 50; // Faster than checkScroll for smoother virtualization
    return () => {
      const now = Date.now();
      if (now - lastTime >= throttleMs) {
        lastTime = now;
        updateVisibleRange();
      }
    };
  }, [updateVisibleRange]);

  React.useEffect(() => {
    const ref = scrollRef.current;
    if (!ref) return;

    // Initial check
    checkScroll();
    updateVisibleRange();

    // Combined scroll listener
    const handleScroll = () => {
      throttledCheckScroll();
      throttledUpdateRange();
    };
    
    ref.addEventListener('scroll', handleScroll);
    
    // Update on resize
    const handleResize = () => {
      checkScroll();
      updateVisibleRange();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      ref.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [items, checkScroll, throttledCheckScroll, updateVisibleRange, throttledUpdateRange]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      // Responsive scroll amount based on card width + gap
      const cardWidth = window.innerWidth < 640 ? 150 : window.innerWidth < 768 ? 170 : 190;
      const scrollAmount = cardWidth * 3 + 36; // 3 cards + gaps
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Title */}
      <div className="flex items-center gap-2 mb-4 px-6">
        {icon}
        <h2 className="text-xl font-bold dark:text-white text-slate-900">{title}</h2>
      </div>

      {/* Carousel Container */}
      <div className="relative group">
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r dark:from-slate-950/90 dark:to-transparent from-white/90 to-transparent hover:dark:from-slate-950 hover:from-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-8 h-8 dark:text-white text-slate-900 drop-shadow-lg" />
          </button>
        )}

        {/* Scrollable Content */}
        <div
          ref={scrollRef}
          className="flex gap-0 overflow-x-auto px-6 pb-2 scroll-smooth snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            scrollPaddingLeft: '1.5rem',
            scrollPaddingRight: '1.5rem',
          }}
        >
          {/* Left placeholder for virtualization */}
          {visibleRange.start > 0 && (
            <div 
              className="flex-shrink-0 snap-start"
              style={{ 
                width: `${visibleRange.start * getCardWidth()}px`,
                minWidth: `${visibleRange.start * getCardWidth()}px`,
              }}
              aria-hidden="true"
            />
          )}
          
          {/* Visible items only */}
          {items.slice(visibleRange.start, visibleRange.end).map((item, idx) => {
            const index = visibleRange.start + idx;
            return (
              <MediaCard
                key={`${item.type}-${item.item_id}`}
                id={item.item_id}
                name={item.name}
                poster={item.poster}
                type={item.type}
                onSelect={() => onItemClick(item)}
                timeAgo={formatTimeAgo(item.viewed_at, item.type === 'live')}
                season={item.season}
                episode={item.episode}
                progressPercentage={getProgressPercentage(item)}
                index={index}
                tvGroup={tvGroup}
                tvInitial={index === 0}
              />
            );
          })}
          
          {/* Right placeholder for virtualization */}
          {visibleRange.end < items.length && (
            <div 
              className="flex-shrink-0"
              style={{ 
                width: `${(items.length - visibleRange.end) * getCardWidth()}px`,
                minWidth: `${(items.length - visibleRange.end) * getCardWidth()}px`,
              }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l dark:from-slate-950/90 dark:to-transparent from-white/90 to-transparent hover:dark:from-slate-950 hover:from-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-8 h-8 dark:text-white text-slate-900 drop-shadow-lg" />
          </button>
        )}
      </div>
    </div>
  );
};

export const ForYouSection: React.FC<ForYouSectionProps> = ({
  onChannelSelect,
  onSeriesSelect,
  onMoviePlay,
}) => {
  const { t } = useTranslation();
  const activePortal = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId) ?? null
  );
  const { recentItems, isLoading } = useRecentViewed(activePortal?.id || '', undefined, 50) as { 
    recentItems: RecentItem[], 
    isLoading: boolean
  };
  const { getInProgressMovies } = useResumeStore();

  if (!activePortal) {
    return null;
  }

  // Get in-progress movie IDs for progress indicators
  const inProgressMovies = getInProgressMovies();
  const inProgressMap = new Map(inProgressMovies.map(m => [m.movieId, m.progress]));

  // Group items by type
  const liveItems = recentItems.filter(item => item.type === 'live');
  const vodItems = recentItems.filter(item => item.type === 'vod');
  const seriesItems = recentItems.filter(item => item.type === 'series');

  // Type-safe mappers from RecentItem to domain types
  const mapToChannel = (item: RecentItem): StalkerChannel => ({
    id: item.item_id,
    name: item.name,
    cmd: item.cmd ?? '',
    logo: item.poster,
    number: 0,
    censored: false,
  });

  const mapToVOD = (item: RecentItem): StalkerVOD => ({
    id: Number(item.item_id) || 0,
    name: item.name,
    cmd: item.cmd ?? '',
    description: '',
    added: new Date().toISOString(),
    censored: false,
  });

  const handleItemClick = (item: RecentItem) => {
    switch (item.type) {
      case 'live':
        onChannelSelect?.(mapToChannel(item));
        break;
      case 'vod': {
        const progress = inProgressMap.get(item.item_id);
        onMoviePlay?.(mapToVOD(item), progress?.position);
        break;
      }
      case 'series':
        onSeriesSelect?.(mapToVOD(item));
        break;
    }
  };

  const formatTimeAgo = (timestamp: number, isLive?: boolean) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 30) return isLive ? t('now') : t('justNow');
    if (seconds < 60) return t('justNow');
    if (seconds < 3600) return t('minutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('hoursAgo', { count: Math.floor(seconds / 3600) });
    if (seconds < 604800) return t('daysAgo', { count: Math.floor(seconds / 86400) });
    return t('longTimeAgo');
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-green-500" />
          <h2 className="text-xl font-bold dark:text-white text-slate-900">{t('forYou')}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 dark:bg-slate-800/50 bg-gray-100/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (recentItems.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-green-500" />
          <h2 className="text-xl font-bold dark:text-white text-slate-900">{t('forYou') || 'Dla Ciebie'}</h2>
        </div>
        <div className="dark:bg-slate-800/30 bg-gray-100/30 rounded-xl p-8 text-center backdrop-blur-sm border dark:border-slate-700/50 border-gray-200/50">
          <Clock className="w-12 h-12 mx-auto mb-3 dark:text-slate-500 text-slate-400" />
          <p className="text-sm dark:text-slate-400 text-slate-600">
            {t('noWatchHistory') || 'Rozpocznij oglądanie, aby zobaczyć rekomendacje'}
          </p>
        </div>
      </motion.div>
    );
  }

  const getProgressPercentage = (item: RecentItem) => {
    if (item.type !== 'vod') return 0;
    const progress = inProgressMap.get(item.item_id);
    return progress?.percentage || 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 min-w-0 overflow-x-hidden"
    >
      {/* Header with title and actions */}
      <div className="flex items-center justify-between mb-6 px-6">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Star className="w-6 h-6 text-green-500" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold dark:text-white text-slate-900">{t('forYou') || 'Dla Ciebie'}</h2>
            <p className="text-sm dark:text-slate-400 text-slate-600">
              {recentItems.length} {t('recentlyViewed') || 'ostatnio oglądanych'}
            </p>
          </div>
        </div>
      </div>

      {/* Netflix-style horizontal carousels */}
      <div className="space-y-6">
        {/* Live Channels Row */}
        <CarouselRow
          title={t('recentChannels')}
          icon={<Tv className="w-5 h-5 text-blue-500" />}
          items={liveItems}
          onItemClick={handleItemClick}
          getProgressPercentage={getProgressPercentage}
          formatTimeAgo={formatTimeAgo}
          tvGroup="for-you-live"
        />

        {/* Movies Row */}
        <CarouselRow
          title={t('recentMovies')}
          icon={<Film className="w-5 h-5 text-purple-500" />}
          items={vodItems}
          onItemClick={handleItemClick}
          getProgressPercentage={getProgressPercentage}
          formatTimeAgo={formatTimeAgo}
          tvGroup="for-you-movies"
        />

        {/* Series Row */}
        <CarouselRow
          title={t('recentSeries')}
          icon={<Film className="w-5 h-5 text-orange-500" />}
          items={seriesItems}
          onItemClick={handleItemClick}
          getProgressPercentage={getProgressPercentage}
          formatTimeAgo={formatTimeAgo}
          tvGroup="for-you-series"
        />
      </div>
    </motion.div>
  );
};
