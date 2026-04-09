// =========================
// ⭐ FAVORITE CATEGORIES LIST COMPONENT
// =========================
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { getGenres } from './tv.api';

interface FavoriteCategoriesListProps {
  client: StalkerClient;
  onCategorySelect: (category: StalkerGenre) => void;
  search?: string;
}

export const FavoriteCategoriesList: React.FC<FavoriteCategoriesListProps> = ({ 
  client, 
  onCategorySelect, 
  search = '' 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);
  const accountId = client?.getAccount?.()?.id || 'default';
  const { categoryIds: favoriteCategories, toggleCategory } = useFavoriteCategories(accountId, 'live');

  // Pobieranie wszystkich kategorii kanałów z cache
  const {
    data: categories = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['channel-genres', client.getAccount().id],
    queryFn: () => getGenres(client),
    staleTime: 30 * 60 * 1000, // 30 minutes cache
    retry: 2,
  });

  const favoriteCategoriesList = useMemo(() =>
    categories.filter(category => favoriteCategories.includes(String(category.id))),
  [categories, favoriteCategories]);

  const filteredCategories = useMemo(() =>
    favoriteCategoriesList.filter(category =>
      category.title.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteCategoriesList, search]);

  const handleCategoryClick = (category: StalkerGenre) => {
    setSelectedCategory(category);
    onCategorySelect(category);
  };

  const handleToggleFavorite = (e: React.MouseEvent, categoryId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const category = categories.find(c => String(c.id) === categoryId);
    toggleCategory(categoryId, category?.title);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Ładowanie ulubionych kategorii...</p>
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
            Nie udało się pobrać ulubionych kategorii. Spróbuj ponownie.
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

  if (favoriteCategories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">⭐</div>
          <h3 className="text-xl font-semibold mb-2">Brak ulubionych kategorii</h3>
          <p className="text-slate-400 mb-4">
            Nie masz jeszcze żadnych ulubionych kategorii. Dodaj je klikając serce ❤️ w widoku kategorii.
          </p>
          <div className="mt-6 p-4 bg-slate-800 bg-opacity-50 rounded-lg">
            <p className="text-sm text-slate-400">
              💡 <strong>Wskazówka:</strong> Przejdź do <strong>Live TV → Kategorie</strong> i kliknij serce przy kategoriach, które chcesz dodać do ulubionych.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (filteredCategories.length === 0 && search) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold mb-2">Nie znaleziono kategorii</h3>
          <p className="text-slate-400">
            Nie znaleziono ulubionych kategorii pasujących do "{search}"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Header - Unified Style */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <h1 className="text-lg font-bold text-white">Ulubione kategorie</h1>
        <p className="text-sm text-slate-400">
          Twoje ulubione kategorie kanałów ({favoriteCategories.length})
        </p>
        {search && (
          <p className="text-blue-400 text-sm mt-2">
            Wyniki wyszukiwania dla: "{search}"
          </p>
        )}
      </div>

      {/* Favorite Categories Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCategories.map((category) => (
            <div
              key={category.id}
              onClick={() => handleCategoryClick(category)}
              className={`
                relative bg-slate-800 bg-opacity-50 backdrop-blur-sm border rounded-xl p-6 
                cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl
                ${selectedCategory?.id === category.id 
                  ? 'border-blue-500 bg-blue-500 bg-opacity-10 shadow-lg shadow-blue-500/25' 
                  : 'border-slate-600 hover:border-blue-400'
                }
              `}
            >
              {/* Category Icon/Number */}
              <div className="flex items-center justify-between mb-4">
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center text-2xl font-bold
                  ${selectedCategory?.id === category.id 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-slate-700 text-slate-300'
                  }
                `}>
                  {category.id === '*' ? '🌍' : '📺'}
                </div>
                <div className="flex items-center gap-2">
                  {selectedCategory?.id === category.id && (
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  )}
                  {/* Favorite Button - Always filled for favorites */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const categoryId = String(category.id);
                      handleToggleFavorite(e, categoryId);
                    }}
                    className="text-xl hover:scale-110 transition-transform bg-transparent border-0 p-0"
                    title="Usuń z ulubionych"
                  >
                    ❤️
                  </button>
                </div>
              </div>

              {/* Category Title */}
              <h3 className={`
                font-semibold text-lg mb-2 line-clamp-2
                ${selectedCategory?.id === category.id ? 'text-blue-400' : 'text-white'}
              `}>
                {category.title}
              </h3>

              {/* Category Description */}
              <p className="text-slate-400 text-sm mb-4">
                {category.id === '*' 
                  ? 'Wszystkie dostępne kanały' 
                  : `Kategoria kanałów #${category.id}`
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
          <div className="mt-8 p-6 bg-slate-800 bg-opacity-50 backdrop-blur-sm border border-slate-600 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-500 bg-opacity-20 rounded-xl flex items-center justify-center text-3xl">
                {selectedCategory.id === '*' ? '🌍' : '📺'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-1">
                  {selectedCategory.title}
                </h3>
                <p className="text-slate-400">
                  {selectedCategory.id === '*' 
                    ? 'Wybrano wszystkie kanały' 
                    : `Wybrano kategorię kanałów #${selectedCategory.id}`
                  }
                </p>
              </div>
              <button
                onClick={() => onCategorySelect(selectedCategory)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <span>📺</span>
                Pokaż kanały
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
