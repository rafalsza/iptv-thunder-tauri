// =========================
// 🎬 MOVIE CATEGORIES LIST COMPONENT
// =========================
import React, { useState, useMemo } from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { useMovieCategories } from './movies.hooks';
import { useTranslation } from '@/hooks/useTranslation';

interface MovieCategoriesListProps {
  client: StalkerClient;
  onCategorySelect: (category: StalkerGenre) => void;
  search?: string;
}

export const MovieCategoriesList: React.FC<MovieCategoriesListProps> = ({ 
  client, 
  onCategorySelect, 
  search = '' 
}) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);
  const accountId = client?.getAccount?.()?.id || 'default';
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'vod');

  const { 
    data: categories = [], 
    isLoading, 
    error, 
    refetch 
  } = useMovieCategories(client);

  const filteredCategories = useMemo(() =>
    categories.filter(category =>
      category.title.toLowerCase().includes(search.toLowerCase())
    ),
  [categories, search]);

  const handleCategoryClick = (category: StalkerGenre) => {
    setSelectedCategory(category);
    onCategorySelect(category);
  };

  const handleToggleFavorite = (e: React.MouseEvent, categoryId: string, categoryName?: string) => {
    e.stopPropagation();
    e.preventDefault();
    toggleCategory(categoryId, categoryName);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Skeleton Header */}
        <div className="border-b dark:border-slate-700 border-gray-300 p-4">
          <div className="h-6 w-48 dark:bg-slate-700 bg-gray-200 rounded animate-pulse mb-2"></div>
          <div className="h-4 w-64 dark:bg-slate-700 bg-gray-200 rounded animate-pulse"></div>
        </div>
        {/* Skeleton Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="dark:bg-slate-800 bg-white dark:border border-slate-700 border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 dark:bg-slate-700 bg-gray-200 rounded-lg animate-pulse"></div>
                  <div className="w-6 h-6 dark:bg-slate-700 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
                <div className="h-5 dark:bg-slate-700 bg-gray-200 rounded animate-pulse mb-2"></div>
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
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold mb-2">Błąd ładowania kategorii</h3>
          <p className="dark:text-slate-400 text-slate-600 mb-4">
            Nie udało się pobrać kategorii filmów z portalu. Spróbuj ponownie.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  if (filteredCategories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center dark:text-white text-slate-900">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold mb-2">
            {search ? 'Nie znaleziono kategorii' : 'Brak kategorii'}
          </h3>
          <p className="dark:text-slate-400 text-slate-600">
            {search 
              ? `Nie znaleziono kategorii filmów pasujących do "${search}"`
              : 'Ten portal nie ma zdefiniowanych kategorii filmów'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header - Unified Style */}
      <div className="border-b dark:border-slate-700 border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold dark:text-white text-slate-900">{t('movieCategories')}</h1>
        </div>
        <p className="text-sm dark:text-slate-400 text-slate-600">
          {t('selectMovieCategory')} ({filteredCategories.length} kategorii)
        </p>
        {search && (
          <p className="text-green-700 text-sm mt-2">
            Wyniki wyszukiwania dla: "{search}"
          </p>
        )}
      </div>

      {/* Movie Categories Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filteredCategories.map((category, categoryIndex) => (
            <div
              key={category.id}
              data-tv-focusable
              data-tv-group="movie-categories"
              data-tv-index={categoryIndex}
              data-tv-initial={categoryIndex === 0}
              tabIndex={0}
              onClick={() => handleCategoryClick(category)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
                  e.preventDefault();
                  handleCategoryClick(category);
                }
              }}
              className={`
                relative dark:bg-slate-800 dark:bg-opacity-50 bg-white bg-opacity-50 backdrop-blur-sm dark:border border-slate-600 border-gray-300 rounded-lg p-4
                cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl
                ${selectedCategory?.id === category.id
                  ? 'border-green-700 bg-green-700 bg-opacity-10 shadow-lg shadow-green-700/25'
                  : 'dark:border-slate-600 border-gray-300 hover:border-green-700'
                }
              `}
            >
              {/* Category Icon/Number */}
              <div className="flex items-center justify-between mb-3">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold
                  ${selectedCategory?.id === category.id 
                    ? 'bg-green-700 text-white' 
                    : 'dark:bg-slate-700 bg-gray-200 dark:text-slate-300 text-slate-600'
                  }
                `}>
                  {category.id === '*' ? '🎬' : '🎭'}
                </div>
                <div className="flex items-center gap-2">
                  {selectedCategory?.id === category.id && (
                    <div className="w-2 h-2 bg-green-700 rounded-full animate-pulse"></div>
                  )}
                  {/* Favorite Button */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const categoryId = String(category.id);
                      handleToggleFavorite(e, categoryId, category.title);
                    }}
                    className="text-xl hover:scale-110 transition-transform bg-transparent border-0 p-0"
                    title={isCategoryFavorite(String(category.id)) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                  >
                    {isCategoryFavorite(String(category.id)) ? '❤️' : '🤍'}
                  </button>
                </div>
              </div>

              {/* Category Title */}
              <h3 className={`
                font-semibold text-base mb-1 line-clamp-2
                ${selectedCategory?.id === category.id ? 'text-green-700' : 'dark:text-white text-slate-900'}
              `}>
                {category.title}
              </h3>

              {/* Selection Indicator */}
              {selectedCategory?.id === category.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-6 h-6 bg-green-700 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Hover Effect Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-700 to-transparent opacity-0 hover:opacity-5 transition-opacity duration-200 rounded-xl pointer-events-none" />
            </div>
          ))}
        </div>

        {/* Selected Category Info */}
        {selectedCategory && (
          <div className="mt-6 p-4 dark:bg-slate-800 dark:bg-opacity-50 bg-white bg-opacity-50 backdrop-blur-sm dark:border border-slate-600 border-gray-300 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-700 bg-opacity-20 rounded-lg flex items-center justify-center text-2xl">
                {selectedCategory.id === '*' ? '🎬' : '🎭'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold dark:text-white text-slate-900 mb-1">
                  {selectedCategory.title}
                </h3>
                <p className="dark:text-slate-400 text-slate-600">
                  {selectedCategory.id === '*' 
                    ? 'Wybrano wszystkie filmy' 
                    : `Wybrano kategorię filmów #${selectedCategory.id}`
                  }
                </p>
              </div>
              <button
                onClick={() => onCategorySelect(selectedCategory)}
                className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <span>🎬</span>
                Pokaż filmy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
