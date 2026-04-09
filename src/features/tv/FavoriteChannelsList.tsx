// =========================
// ❤️ FAVORITE CHANNELS LIST
// =========================
import React, { useMemo } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';

interface FavoriteChannelsListProps {
  client?: StalkerClient;
  accountId: string;
  search: string;
  onChannelSelect: (channel: StalkerChannel) => void;
}

export const FavoriteChannelsList: React.FC<FavoriteChannelsListProps> = ({
  accountId,
  search,
  onChannelSelect,
}) => {
  // Use SQLite for favorites - contains all metadata (name, poster/logo, cmd)
  const { favorites: dbFavorites, isLoading, toggleItemFavorite } = useFavorites(accountId);

  // Convert favorites to StalkerChannel format using stored metadata
  const favoriteChannels = useMemo((): StalkerChannel[] => {
    return dbFavorites
      .filter(f => f.type === 'live')
      .map(f => ({
        id: f.item_id,
        name: f.name || 'Unknown Channel',
        cmd: f.cmd || '',
        logo: f.poster,
        tv_genre_id: undefined,
        number: 0,
        censored: false,
      }));
  }, [dbFavorites]);

  // Apply search filter
  const filtered = useMemo(() =>
    favoriteChannels.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteChannels, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
        {/* Skeleton Header */}
        <div className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="h-6 w-48 bg-slate-700 rounded animate-pulse mb-2"></div>
          <div className="h-4 w-32 bg-slate-700 rounded animate-pulse"></div>
        </div>
        {/* Skeleton Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="h-4 w-20 bg-slate-700 rounded animate-pulse"></div>
                  <div className="w-5 h-5 bg-slate-700 rounded-full animate-pulse"></div>
                </div>
                <div className="h-16 bg-slate-700 rounded animate-pulse mt-2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && favoriteChannels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❤️</div>
          <h2 className="text-2xl font-bold mb-2">Brak ulubionych kanałów</h2>
          <p className="text-slate-400 mb-4">
            Dodaj kanały do ulubionych klikając ❤️ przy kanale
          </p>
          <p className="text-sm text-slate-500">
            Kanały pojawią się tutaj po ich dodaniu
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
          <h2 className="text-lg font-bold text-white">Ulubione kanały</h2>
          <p className="text-sm text-slate-400">
            {filtered.length} z {favoriteChannels.length} kanałów
          </p>
        </div>
      </div>

      {/* Channels Grid - same layout as TVList */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((channel: StalkerChannel) => (
            <div
              key={channel.id}
              onClick={() => onChannelSelect(channel)}
              className="p-3 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-all bg-slate-800"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-white truncate">
                    {channel.name}
                  </h3>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemFavorite('live', String(channel.id), {
                      name: channel.name,
                      poster: channel.logo,
                      cmd: channel.cmd,
                    });
                  }}
                  className="ml-2 text-lg hover:scale-110 transition-transform"
                >
                  ❤️
                </button>
              </div>
              {channel.logo && (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-full h-16 object-contain mt-2"
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
