// =========================
// ❤️ FAVORITE MOVIES LIST - Using SQLite Metadata
// =========================
import React, { useMemo } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { StalkerVOD } from '@/types';

interface FavoriteMoviesListProps {
  accountId: string;
  search: string;
  onMovieSelect: (movie: StalkerVOD) => void;
}

export const FavoriteMoviesList: React.FC<FavoriteMoviesListProps> = ({
  accountId,
  search,
  onMovieSelect,
}) => {
  // Use SQLite for favorites with full metadata
  const { favorites: dbFavorites, toggleItemFavorite, isLoading } = useFavorites(accountId);
  
  // Convert favorites to StalkerVOD format - NO API CALLS NEEDED!
  const favoriteMovies = useMemo(() =>
    dbFavorites
      .filter(f => f.type === 'vod')
      .map(f => ({
        id: Number.parseInt(f.item_id) || 0,
        name: f.name || `Film ${f.item_id}`,
        logo: f.poster,
        poster: f.poster,
        cmd: f.cmd,
        series: '', // Movies don't have series
        description: '',
        added: '',
        censored: false,
      } as StalkerVOD))
      .filter((m, index, self) => // deduplicate by id
        index === self.findIndex(t => t.id === m.id)
      ),
  [dbFavorites]);

  // Apply search filter
  const filtered = useMemo(() =>
    favoriteMovies.filter((m: StalkerVOD) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteMovies, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🎬</div>
          <h2 className="text-2xl font-bold mb-2">Ładowanie filmów...</h2>
        </div>
      </div>
    );
  }

  if (favoriteMovies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❤️</div>
          <h2 className="text-2xl font-bold mb-2">Brak ulubionych filmów</h2>
          <p className="text-slate-400 mb-4">
            Dodaj filmy do ulubionych klikając ❤️ przy filmie
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
          <h2 className="text-lg font-bold text-white">Ulubione filmy</h2>
          <p className="text-sm text-slate-400">
            {filtered.length} z {favoriteMovies.length} filmów
          </p>
        </div>
      </div>

      {/* Movies Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((movie: StalkerVOD) => (
            <div
              key={movie.id}
              onClick={() => onMovieSelect(movie)}
              className="p-3 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-all bg-slate-800"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-white truncate">
                    {movie.name}
                  </h3>
                  {movie.length && (
                    <p className="text-xs text-slate-400">{movie.length} min</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemFavorite('vod', String(movie.id), {
                      name: movie.name,
                      poster: movie.poster,
                      cmd: movie.cmd
                    });
                  }}
                  className="ml-2 text-lg hover:scale-110 transition-transform"
                  title="Usuń z ulubionych"
                >
                  ❤️
                </button>
              </div>
              {(movie.logo || movie.poster) && (
                <img
                  src={movie.logo || movie.poster}
                  alt={movie.name}
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
