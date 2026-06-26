// =========================
// 📂 CHANNEL CATEGORIES LIST COMPONENT
// =========================
import React, { useState, useMemo, useEffect } from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { useChannelCategories } from './tv.hooks';
import { useTranslation } from '@/hooks/useTranslation';
import { CategoryCard as UICategoryCard } from '@/components/ui/CategoryCard';
import { getSetting, isAdultCategory } from '@/hooks/useSettings';

interface ChannelCategoriesListProps {
  client: StalkerClient;
  onCategorySelect: (category: StalkerGenre) => void;
  search?: string;
}

export const ChannelCategoriesList: React.FC<ChannelCategoriesListProps> = ({
  client,
  onCategorySelect,
  search = ''
}) => {
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);
  const accountId = client?.getAccount?.()?.id || 'default';
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'live');
  const { t } = useTranslation();

  // Load settings for adult filter
  const [settings, setSettings] = useState<{ hideAdultCategories?: boolean } | null>(null);
  useEffect(() => {
    getSetting('hideAdultCategories').then(v => {
      setSettings({ hideAdultCategories: v });
    });
  }, []);

  // Pobieranie kategorii kanałów
  const {
    data: categories = [],
    isLoading,
    error,
    refetch
  } = useChannelCategories(client);

  // Filter out adult categories if setting is enabled
  const filteredByAdult = useMemo(() => {
    const hideAdult = settings?.hideAdultCategories;
    if (!hideAdult) return categories;
    return categories.filter(cat => !isAdultCategory(cat.title));
  }, [categories, settings?.hideAdultCategories]);

  // Filtrowanie kategorii na podstawie wyszukiwania
  const filteredCategories = useMemo(() =>
    filteredByAdult.filter(category =>
      category.title.toLowerCase().includes(search.toLowerCase())
    ),
  [filteredByAdult, search]);

  const handleCategoryClick = (category: StalkerGenre) => {
    setSelectedCategory(category);
    onCategorySelect(category);
  };

  const handleToggleFavorite = (e: React.MouseEvent, categoryId: string, categoryName?: string) => {
    e.stopPropagation();
    e.preventDefault();
    toggleCategory(categoryId, categoryName);
  };

  const handleLongPress = (category: StalkerGenre) => {
    const categoryId = String(category.id);
    toggleCategory(categoryId, category.title);
    // Haptic feedback if supported
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="h-7 w-56 dark:bg-slate-700 bg-gray-200 rounded-lg animate-pulse mb-2"></div>
          <div className="h-4 w-72 dark:bg-slate-700 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="dark:bg-slate-800/40 bg-white/40 backdrop-blur-md border dark:border-slate-700/60 border-gray-200/60 rounded-2xl p-4 min-h-[110px] sm:min-h-[130px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 dark:bg-slate-700 bg-gray-200 rounded-xl animate-pulse"></div>
                  <div className="w-5 h-5 dark:bg-slate-700 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
                <div className="h-4 w-3/4 dark:bg-slate-700 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center dark:text-white text-slate-900 max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl">⚠️</div>
          <h3 className="text-xl font-semibold mb-2">{t('errorLoadingChannelCategories')}</h3>
          <p className="dark:text-slate-400 text-slate-600 mb-4">
            {t('errorLoadingChannelCategoriesDesc')}
          </p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-white rounded-xl transition-all font-medium shadow-lg shadow-green-600/20"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (filteredCategories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center dark:text-white text-slate-900">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-3xl">📂</div>
          <h3 className="text-xl font-semibold mb-2">
            {search ? t('noCategoriesFound') : t('noCategoriesAvailable')}
          </h3>
          <p className="dark:text-slate-400 text-slate-600">
            {search 
              ? t('noCategoriesSearchDesc', { search })
              : t('noCategoriesDesc')
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-green-600/20">
            <span className="text-lg">📺</span>
          </div>
          <div>
            <h1 className="text-[calc(1.25rem*var(--ui-scale))] font-bold dark:text-white text-slate-900">{t('channelCategories')}</h1>
            <p className="text-sm dark:text-slate-400 text-slate-600">
              {t('selectChannelCategory')} · <span className="dark:text-green-400 text-green-700 font-medium">{filteredCategories.length}</span>
            </p>
          </div>
        </div>
        {search && (
          <p className="text-green-600 dark:text-green-400 text-sm mt-2 font-medium">
            {t('searchResultsFor')} "{search}"
          </p>
        )}
      </div>

      {/* Categories Grid */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
          {filteredCategories.map((category, categoryIndex) => (
            <UICategoryCard
              key={category.id}
              category={category}
              categoryIndex={categoryIndex}
              selectedCategory={selectedCategory}
              isCategoryFavorite={isCategoryFavorite}
              onSelect={handleCategoryClick}
              onToggleFavorite={handleToggleFavorite}
              onLongPress={handleLongPress}
              groupId="categories"
            />
          ))}
        </div>

        {selectedCategory && (
          <div className="mt-6 p-4 bg-gradient-to-r from-green-900/20 via-slate-800/40 to-slate-900/20 backdrop-blur-md border border-green-600/30 rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-2xl shadow-lg shadow-green-600/30">
                {selectedCategory.id === '*' ? '🌍' : '📺'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold dark:text-white text-slate-900 mb-1">
                  {selectedCategory.title}
                </h3>
                <p className="dark:text-slate-400 text-slate-600">
                  {selectedCategory.id === '*' 
                    ? t('allChannelsSelected') 
                    : t('categoryChannelsSelected', { id: selectedCategory.id })
                  }
                </p>
              </div>
              <button
                onClick={() => onCategorySelect(selectedCategory)}
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-white rounded-xl transition-all font-medium shadow-lg shadow-green-600/20 flex items-center gap-2"
              >
                <span>📺</span>
                {t('showChannels')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
