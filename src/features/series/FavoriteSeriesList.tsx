// =========================
// ❤️ FAVORITE SERIES LIST - Using SQLite Metadata
// =========================
import React, { useMemo } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD } from '@/types';

interface FavoriteSeriesListProps {
  client: StalkerClient;
  accountId: string;
  search: string;
  onSeriesSelect: (series: StalkerVOD) => void;
}

export const FavoriteSeriesList: React.FC<FavoriteSeriesListProps> = ({
  accountId,
  search,
  onSeriesSelect,
}) => {
  // Use SQLite for favorites with full metadata
  const { favorites: dbFavorites, isItemFavorite, toggleItemFavorite, isLoading } = useFavorites(accountId);
  
  // Convert favorites to StalkerVOD format - NO API CALLS NEEDED!
  const favoriteSeries = useMemo(() => {
    const series = dbFavorites
      .filter(f => f.type === 'series')
      .map(f => ({
        id: f.item_id,
        name: f.name || `Serial ${f.item_id}`,
        logo: f.poster,
        poster: f.poster,
        cmd: f.cmd,
        series: f.name || '',
      } as StalkerVOD));
    console.log('[FavoriteSeries] Loaded from SQLite:', series.length, 'series');
    return series;
  }, [dbFavorites]);

  // Apply search filter
  const filtered = useMemo(() =>
    favoriteSeries.filter((s: StalkerVOD) =>
      s.name.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteSeries, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📺</div>
          <h2 className="text-2xl font-bold mb-2">Ładowanie seriali...</h2>
        </div>
      </div>
    );
  }

  if (favoriteSeries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❤️</div>
          <h2 className="text-2xl font-bold mb-2">Brak ulubionych seriali</h2>
          <p className="text-slate-400 mb-4">
            Dodaj seriale do ulubionych klikając ❤️ przy serialu
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div>
          <h2 className="text-lg font-bold text-white">Ulubione seriale</h2>
          <p className="text-sm text-slate-400">
            {filtered.length} z {favoriteSeries.length} seriali
          </p>
        </div>
      </div>

      {/* Series Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((series: StalkerVOD) => (
            <div
              key={series.id}
              onClick={() => onSeriesSelect(series)}
              className="p-3 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-all bg-slate-800"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-white truncate">
                    {series.name}
                  </h3>
                  {series.series && (
                    <p className="text-xs text-slate-400">{series.series}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemFavorite('series', series.id, {
                      name: series.name,
                      poster: series.poster,
                      cmd: series.cmd
                    });
                  }}
                  className="ml-2 text-lg hover:scale-110 transition-transform"
                >
                  {isItemFavorite('series', series.id) ? '❤️' : '🤍'}
                </button>
              </div>
              {(series.logo || series.poster) && (
                <img
                  src={series.logo || series.poster}
                  alt={series.name}
                  className="w-full h-32 object-cover mt-2 rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
