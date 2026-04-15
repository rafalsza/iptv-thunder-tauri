// =========================
// 🎯 FOR YOU SECTION - Personalized Recommendations
// =========================
import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { usePortalsStore } from '@/store/portals.store';
import { historyService } from '@/lib/services';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, Star } from 'lucide-react';

interface WatchedItem {
  channelId: string;
  channelName: string;
  count: number;
}

export const ForYouSection: React.FC = () => {
  const { t } = useTranslation();
  const activePortal = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId) ?? null
  );
  const [recentlyWatched, setRecentlyWatched] = useState<WatchedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!activePortal) return;
      
      try {
        setIsLoading(true);
        const history = await historyService.getMostWatchedChannels(activePortal.id, 10);
        setRecentlyWatched(history);
      } catch (error) {
        console.error('Failed to fetch watch history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecommendations();
  }, [activePortal]);

  if (!activePortal) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-green-500" />
          <h2 className="text-xl font-bold dark:text-white text-slate-900">{t('forYou') || 'Dla Ciebie'}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 dark:bg-slate-800/50 bg-gray-100/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (recentlyWatched.length === 0) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <Star className="w-5 h-5 text-green-500" />
        </motion.div>
        <h2 className="text-xl font-bold dark:text-white text-slate-900">{t('forYou') || 'Dla Ciebie'}</h2>
        <span className="text-xs dark:bg-green-700/20 bg-green-100 dark:text-green-400 text-green-700 px-2 py-1 rounded-full">
          {t('basedOnHistory') || 'Na podstawie historii'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {recentlyWatched.map((item, index) => (
          <motion.div
            key={item.channelId}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            whileHover={{ scale: 1.05, y: -4 }}
            className="dark:bg-slate-800/50 bg-gray-100/50 rounded-xl p-4 backdrop-blur-sm border dark:border-slate-700/50 border-gray-200/50 cursor-pointer hover:shadow-glow transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-xs dark:text-slate-400 text-slate-600">
                {item.count}x {t('watched') || 'oglądane'}
              </span>
            </div>
            <h3 className="font-medium text-sm dark:text-white text-slate-900 truncate">
              {item.channelName}
            </h3>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
