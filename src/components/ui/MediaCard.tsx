// =========================
// 🎬 MEDIA CARD COMPONENT - Universal Card for ForYou, Movies, Series, TV
// =========================
import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Tv, Film, Star } from 'lucide-react';

export type MediaCardType = 'live' | 'vod' | 'series';

interface MediaCardProps {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Poster/logo URL */
  poster?: string;
  /** Content type */
  type: MediaCardType;
  /** Click handler */
  onSelect: () => void;
  /** Time display text (e.g. "2 min temu") */
  timeAgo?: string;
  /** Season number (for series) */
  season?: number;
  /** Episode number (for series) */
  episode?: number;
  /** Progress percentage 0-100 (for vod with resume) */
  progressPercentage?: number;
  /** Type label text (e.g. "TV", "Film", "Serial") */
  typeLabel?: string;
  /** Index for animation stagger and TV navigation */
  index?: number;
  /** TV navigation group name */
  tvGroup?: string;
  /** Is this the initially focused element */
  tvInitial?: boolean;
}

const getTypeIcon = (type: MediaCardType) => {
  switch (type) {
    case 'live': return <Tv className="w-3 h-3 text-blue-500" />;
    case 'vod': return <Film className="w-3 h-3 text-purple-500" />;
    case 'series': return <Film className="w-3 h-3 text-orange-500" />;
    default: return <Star className="w-3 h-3 text-green-500" />;
  }
};

export const MediaCard: React.FC<MediaCardProps> = ({
  id,
  name,
  poster,
  type,
  onSelect,
  timeAgo,
  season,
  episode,
  progressPercentage = 0,
  typeLabel,
  index = 0,
  tvGroup = 'media-cards',
  tvInitial = false,
}) => {
  const hasProgress = progressPercentage > 0 && type === 'vod';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
      e.preventDefault();
      onSelect();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    // Special case: reset for-you-live carousel to beginning when first element gets focus
    if (index === 0 && tvGroup === 'for-you-live') {
      const carouselContainer = e.currentTarget.closest('.overflow-x-auto') as HTMLElement | null;
      if (carouselContainer) {
        // Reset first, then scrollIntoView will handle the element
        carouselContainer.scrollTo({ left: 0, behavior: 'auto' });
      }
    } else {
      // Auto-scroll focused card into view (MUST HAVE for TV)
      e.currentTarget.scrollIntoView({
        inline: 'center',
        block: 'nearest',
      });
    }
  };

  return (
    <motion.div
      key={`${type}-${id}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      whileHover={{ scale: 1.05, y: -4 }}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      data-tv-focusable
      data-tv-group={tvGroup}
      data-tv-index={index}
      data-tv-initial={tvInitial || undefined}
      data-media-card
      tabIndex={0}
      className="relative group/card cursor-pointer flex-shrink-0 w-[150px] sm:w-[170px] md:w-[190px] rounded-lg m-1 focus:outline-none focus:shadow-[inset_0_0_0_3px_rgba(34,197,94,0.9)] snap-start"
    >
      {/* Card container */}
      <div className="dark:bg-slate-800/50 bg-gray-100/50 rounded-lg overflow-hidden backdrop-blur-sm border dark:border-slate-700/50 border-gray-200/50 hover:shadow-glow transition-all">
        {/* Poster area - different aspect ratio for live channels */}
        <div className={`relative bg-slate-700 overflow-hidden ${type === 'live' ? 'aspect-video' : 'aspect-[3/4]'}`}>
          {poster ? (
            <img
              src={poster}
              alt={name}
              className={`w-full h-full group-hover/card:scale-105 transition-transform duration-300 ${type === 'live' ? 'object-contain p-2' : 'object-contain bg-slate-800'}`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center dark:bg-slate-700 bg-gray-300">
              {type === 'live' && <Tv className="w-8 h-8 text-blue-400" />}
              {type === 'vod' && <Film className="w-8 h-8 text-purple-400" />}
              {type === 'series' && <Film className="w-8 h-8 text-orange-400" />}
            </div>
          )}

          {/* Type badge */}
          {typeLabel && (
            <div className="absolute top-1.5 left-1.5 dark:bg-black/70 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
              {getTypeIcon(type)}
              <span className="text-[10px] font-medium dark:text-white text-slate-900">
                {typeLabel}
              </span>
            </div>
          )}

          {/* Progress indicator for movies */}
          {hasProgress && (
            <>
              <div className="absolute top-1.5 right-1.5 dark:bg-green-700/90 bg-green-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
                <Play className="w-2.5 h-2.5 text-white" />
                <span className="text-[10px] font-medium text-white">
                  {progressPercentage}%
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 dark:bg-slate-700 bg-gray-300">
                <div
                  className="h-full bg-green-600 transition-all"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </>
          )}

          {/* Play button on hover */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 dark:bg-white/90 bg-white/90 rounded-full flex items-center justify-center">
              <Play className="w-5 h-5 text-black fill-current ml-1" />
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="p-2">
          <h3 className="font-medium text-xs dark:text-white text-slate-900 truncate mb-1">
            {name}
          </h3>
          {timeAgo && (
            <div className="flex items-center justify-between text-[10px] dark:text-slate-400 text-slate-600">
              <span className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo}
              </span>
              {season && episode && (
                <span>
                  S{season} E{episode}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
