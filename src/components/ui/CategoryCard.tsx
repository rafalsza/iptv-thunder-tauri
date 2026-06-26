import React from 'react';
import { motion } from 'framer-motion';
import { StalkerGenre } from '@/types';
import { useLongPress } from '@/hooks/useLongPress';
import { useTranslation } from '@/hooks/useTranslation';
import { Film, List, Heart, Check } from 'lucide-react';

interface CategoryCardProps {
  category: StalkerGenre;
  categoryIndex: number;
  selectedCategory: StalkerGenre | null;
  isCategoryFavorite?: (id: string) => boolean;
  onSelect: (category: StalkerGenre) => void;
  onToggleFavorite?: (e: React.MouseEvent, categoryId: string, categoryName?: string) => void;
  onLongPress: (category: StalkerGenre) => void;
  groupId?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  categoryIndex,
  selectedCategory,
  isCategoryFavorite,
  onSelect,
  onToggleFavorite,
  onLongPress,
  groupId = 'category-cards',
}) => {
  const { isLongPress, ref, isLongPressRef, ...longPressHandlers } = useLongPress({
    onLongPress: () => onLongPress(category),
    delay: 500,
  });

  const { t } = useTranslation();
  const isFavorite = isCategoryFavorite?.(String(category.id));
  const rawName = category.name || category.title || '';
  const categoryName = category.id === '*' ? t('all') : rawName;
  const categoryId = String(category.id);
  const isSelected = selectedCategory?.id === category.id;
  const isAll = category.id === '*';

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPress) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelect(category);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(category);
    }
  };

  return (
    <motion.div
      ref={ref}
      data-tv-focusable
      data-tv-id={`category-${category.id}`}
      data-tv-group={groupId}
      data-tv-index={categoryIndex}
      data-tv-initial={categoryIndex === 0}
      {...longPressHandlers}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress(category);
      }}
      role="button"
      tabIndex={0}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`
        group relative overflow-hidden rounded-2xl
        h-full min-h-[90px] sm:min-h-[110px] md:min-h-[130px]
        cursor-pointer
        transition-colors duration-300
        ${isSelected
          ? 'bg-gradient-to-br from-green-900/40 via-slate-800/60 to-slate-900/80 border-2 border-green-600 shadow-lg shadow-green-600/20'
          : 'dark:bg-slate-800/40 dark:border dark:border-slate-700/60 bg-white/40 border border-gray-200/60 hover:border-green-600/50 hover:dark:border-green-600/40'
        }
        backdrop-blur-md
      `}
    >
      {/* Subtle gradient glow on hover */}
      <div className={`
        absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none
        ${isSelected
          ? 'bg-gradient-to-br from-green-600/10 via-transparent to-emerald-600/5'
          : 'bg-gradient-to-br from-green-500/8 via-transparent to-transparent'
        }
      `} />

      {/* Top section: icon + favorite */}
      <div className="relative flex items-start justify-between p-3 sm:p-3.5 md:p-4">
        <div className={`
          flex items-center justify-center rounded-xl
          w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12
          transition-all duration-300
          ${isSelected
            ? 'bg-gradient-to-br from-green-500 to-emerald-700 text-white shadow-md shadow-green-500/30'
            : 'dark:bg-slate-700/60 bg-gray-100/80 dark:text-slate-300 text-slate-500 group-hover:from-green-600/20 group-hover:to-emerald-700/20 group-hover:text-green-500'
          }
        `}>
          {isAll
            ? <Film className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
            : <List className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
          }
        </div>

        <div className="flex items-center gap-1.5">
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
            />
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(e, categoryId, categoryName);
              }}
              className="hover:scale-125 active:scale-90 transition-transform cursor-pointer bg-transparent border-0 p-0.5 rounded-full hover:bg-black/20"
              title={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
              aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
              aria-pressed={isFavorite}
            >
              <Heart className={`${
                isFavorite
                  ? 'fill-red-500 text-red-500 w-5 h-5 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]'
                  : 'w-5 h-5 dark:text-slate-400 text-slate-500 group-hover:text-red-400'
              }`} />
            </button>
          )}
        </div>
      </div>

      {/* Category name */}
      <div className="relative px-3 sm:px-3.5 md:px-4 pb-3 sm:pb-3.5 md:pb-4">
        <h3 className={`
          font-semibold text-sm sm:text-base leading-tight line-clamp-2
          transition-colors duration-200
          ${isSelected
            ? 'text-green-400'
            : 'dark:text-slate-100 text-slate-800 group-hover:dark:text-green-300 group-hover:text-green-700'
          }
        `}>
          {categoryName}
        </h3>
      </div>

      {/* Selected checkmark badge */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          className="absolute top-2 right-2 z-10"
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40">
            <Check className="w-3 h-3 sm:w-4 sm:h-4 text-white" strokeWidth={3} />
          </div>
        </motion.div>
      )}

      {/* Bottom accent line */}
      <div className={`
        absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-300
        ${isSelected
          ? 'bg-gradient-to-r from-green-500 via-emerald-500 to-green-500 opacity-100'
          : 'bg-gradient-to-r from-green-500 to-emerald-500 opacity-0 group-hover:opacity-40'
        }
      `} />
    </motion.div>
  );
};
