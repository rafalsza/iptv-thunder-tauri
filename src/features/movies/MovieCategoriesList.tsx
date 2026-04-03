// =========================
// 🎬 MOVIE CATEGORIES LIST COMPONENT
// =========================
import React, { useState, useMemo } from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { usePortalCacheStore } from '@/store/portalCache.store';
import { useMovieCategories } from './movies.hooks';
import { useQueryClient } from '@tanstack/react-query';

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
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);
  const accountId = client?.getAccount?.()?.id || 'default';
  const { isCategoryFavorite, toggleCategory } = useFavoriteCategories(accountId, 'vod');
  const cacheStore = usePortalCacheStore();
  const queryClient = useQueryClient();

  // Pobieranie kategorii filmów z cache
  const { 
    data: categories = [], 
    isLoading, 
    error, 
    refetch 
  } = useMovieCategories(client);

  const handleClearCache = () => {
    console.log('🧹 Clearing all cache...');
    cacheStore.clearAllCache();
    queryClient.clear();
    localStorage.removeItem('portal-data-cache');
    window.location.reload();
  };

  // Filtrowanie kategorii na podstawie wyszukiwania
  const filteredCategories = useMemo(() =>
    categories.filter(category =>
      category.title.toLowerCase().includes(search.toLowerCase())
    ),
  [categories, search]);

  // Debug: log categories count
  console.log('🎬 Categories total:', categories.length, 'filtered:', filteredCategories.length, 'search:', search);

  const handleCategoryClick = (category: StalkerGenre) => {
    console.log('🎬 MovieCategoriesList - handleCategoryClick called!');
    console.log('🎬 Selected category:', category);
    console.log('🎬 About to call onCategorySelect');
    
    setSelectedCategory(category);
    onCategorySelect(category);
    
    console.log('🎬 Called onCategorySelect with:', category);
  };

  const handleToggleFavorite = (e: React.MouseEvent, categoryId: string, categoryName?: string) => {
    e.stopPropagation();
    e.preventDefault();
    toggleCategory(categoryId, categoryName);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Ładowanie kategorii filmów...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold mb-2">Błąd ładowania kategorii</h3>
          <p className="text-slate-400 mb-4">
            Nie udało się pobrać kategorii filmów z portalu. Spróbuj ponownie.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
        <div className="text-center text-white">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold mb-2">
            {search ? 'Nie znaleziono kategorii' : 'Brak kategorii'}
          </h3>
          <p className="text-slate-400">
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
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Header - Unified Style */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Kategorie filmów</h1>
          <button
            onClick={handleClearCache}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
            title="Wyczyść cache i odśwież"
          >
            🧹 Wyczyść cache
          </button>
        </div>
        <p className="text-sm text-slate-400">
          Wybierz kategorię, aby zobaczyć dostępne filmy ({filteredCategories.length} kategorii)
        </p>
        {search && (
          <p className="text-blue-400 text-sm mt-2">
            Wyniki wyszukiwania dla: "{search}"
          </p>
        )}
      </div>

      {/* Movie Categories Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filteredCategories.map((category, index) => (
            <div
              key={category.id}
              onClick={() => handleCategoryClick(category)}
              className={`
                relative bg-slate-800 bg-opacity-50 backdrop-blur-sm border rounded-lg p-4
                cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl
                ${selectedCategory?.id === category.id 
                  ? 'border-blue-500 bg-blue-500 bg-opacity-10 shadow-lg shadow-blue-500/25' 
                  : 'border-slate-600 hover:border-blue-400'
                }
              `}
            >
              {/* Index number for debugging */}
              <div className="absolute top-1 left-1 text-xs text-slate-600">#{index + 1}</div>
              {/* Category Icon/Number */}
              <div className="flex items-center justify-between mb-3">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold
                  ${selectedCategory?.id === category.id 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-slate-700 text-slate-300'
                  }
                `}>
                  {category.id === '*' ? '🎬' : '🎭'}
                </div>
                <div className="flex items-center gap-2">
                  {selectedCategory?.id === category.id && (
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
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
                ${selectedCategory?.id === category.id ? 'text-blue-400' : 'text-white'}
              `}>
                {category.title}
              </h3>

              {/* Category Description */}
              <p className="text-slate-400 text-sm mb-2">
                {category.id === '*' 
                  ? 'Wszystkie dostępne filmy' 
                  : `Kategoria filmów #${category.id}`
                }
              </p>

              {/* Selection Indicator */}
              {selectedCategory?.id === category.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Hover Effect Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 hover:opacity-5 transition-opacity duration-200 rounded-xl pointer-events-none" />
            </div>
          ))}
        </div>

        {/* Selected Category Info */}
        {selectedCategory && (
          <div className="mt-6 p-4 bg-slate-800 bg-opacity-50 backdrop-blur-sm border border-slate-600 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center text-2xl">
                {selectedCategory.id === '*' ? '🎬' : '🎭'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-1">
                  {selectedCategory.title}
                </h3>
                <p className="text-slate-400">
                  {selectedCategory.id === '*' 
                    ? 'Wybrano wszystkie filmy' 
                    : `Wybrano kategorię filmów #${selectedCategory.id}`
                  }
                </p>
              </div>
              <button
                onClick={() => onCategorySelect(selectedCategory)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
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
