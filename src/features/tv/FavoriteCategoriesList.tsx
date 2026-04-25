// =========================
// ⭐ FAVORITE CATEGORIES LIST COMPONENT
// =========================
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { getGenres } from './tv.api';
import { useTVKeyboard } from '@/hooks/useTVKeyboard';

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

  // TV keyboard with MENU key support
  useTVKeyboard({
    onMenu: () => {
      if (selectedCategory) {
        handleLongPress(selectedCategory);
      }
    },
  });

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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center dark:text-white text-slate-900">
          <div className="animate-spin w-8 h-8 border-2 border-green-700 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Ładowanie ulubionych kategorii...</p>
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
            Nie udało się pobrać ulubionych kategorii. Spróbuj ponownie.
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

  if (favoriteCategories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center dark:text-white text-slate-900">
          <div className="text-6xl mb-4">⭐</div>
          <h3 className="text-xl font-semibold mb-2">Brak ulubionych kategorii</h3>
          <p className="dark:text-slate-400 text-slate-600 mb-4">
            Nie masz jeszcze żadnych ulubionych kategorii. Dodaj je klikając serce ❤️ w widoku kategorii.
          </p>
          <div className="mt-6 p-4 dark:bg-slate-800 dark:bg-opacity-50 bg-white bg-opacity-50 rounded-lg">
            <p className="text-sm dark:text-slate-400 text-slate-600">
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
        <div className="text-center dark:text-white text-slate-900">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold mb-2">Nie znaleziono kategorii</h3>
          <p className="dark:text-slate-400 text-slate-600">
            Nie znaleziono ulubionych kategorii pasujących do "{search}"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header - Unified Style */}
      <div className="border-b dark:border-slate-700 border-gray-300 p-4">
        <h1 className="text-lg font-bold dark:text-white text-slate-900">Ulubione kategorie</h1>
        <p className="text-sm dark:text-slate-400 text-slate-600">
          Twoje ulubione kategorie kanałów ({favoriteCategories.length})
        </p>
        {search && (
          <p className="text-green-700 text-sm mt-2">
            Wyniki wyszukiwania dla: "{search}"
          </p>
        )}
      </div>

      {/* Favorite Categories Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCategories.map((category, categoryIndex) => (
            <div
              key={category.id}
              data-tv-focusable
              data-tv-group="favorite-categories"
              data-tv-index={categoryIndex}
              data-tv-initial={categoryIndex === 0}
              tabIndex={0}
              onClick={() => handleCategoryClick(category)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleLongPress(category);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
                  e.preventDefault();
                  handleCategoryClick(category);
                }
              }}
              className={`
                relative dark:bg-slate-800 dark:bg-opacity-50 bg-white bg-opacity-50 backdrop-blur-sm dark:border border-slate-600 border-gray-300 rounded-xl p-6
                cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl
                ${selectedCategory?.id === category.id
                  ? 'border-green-700 bg-green-700 bg-opacity-10 shadow-lg shadow-green-700/25'
                  : 'dark:border-slate-600 border-gray-300 hover:border-green-700'
                }
              `}
            >
              {/* Category Icon/Number */}
              <div className="flex items-center justify-between mb-4">
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center text-2xl font-bold
                  ${selectedCategory?.id === category.id 
                    ? 'bg-green-700 text-white' 
                    : 'dark:bg-slate-700 bg-gray-200 dark:text-slate-300 text-slate-600'
                  }
                `}>
                  {category.id === '*' ? '🌍' : '📺'}
                </div>
                <div className="flex items-center gap-2">
                  {selectedCategory?.id === category.id && (
                    <div className="w-2 h-2 bg-green-700 rounded-full animate-pulse"></div>
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
                ${selectedCategory?.id === category.id ? 'text-green-700' : 'dark:text-white text-slate-900'}
              `}>
                {category.title}
              </h3>

              {/* Category Description */}
              <p className="dark:text-slate-400 text-slate-600 text-sm mb-4">
                {category.id === '*' 
                  ? 'Wszystkie dostępne kanały' 
                  : `Kategoria kanałów #${category.id}`
                }
              </p>

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
          <div className="mt-8 p-6 dark:bg-slate-800 dark:bg-opacity-50 bg-white bg-opacity-50 backdrop-blur-sm dark:border border-slate-600 border-gray-300 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-green-700 bg-opacity-20 rounded-xl flex items-center justify-center text-3xl">
                {selectedCategory.id === '*' ? '🌍' : '📺'}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold dark:text-white text-slate-900 mb-1">
                  {selectedCategory.title}
                </h3>
                <p className="dark:text-slate-400 text-slate-600">
                  {selectedCategory.id === '*' 
                    ? 'Wybrano wszystkie kanały' 
                    : `Wybrano kategorię kanałów #${selectedCategory.id}`
                  }
                </p>
              </div>
              <button
                onClick={() => onCategorySelect(selectedCategory)}
                className="px-6 py-3 bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors flex items-center gap-2"
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
