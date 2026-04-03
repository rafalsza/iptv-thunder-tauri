// =========================
// ❤️ FAVORITE CHANNELS LIST
// =========================
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFavorites } from '@/hooks/useFavorites';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel } from '@/types';

interface FavoriteChannelsListProps {
  client: StalkerClient;
  accountId: string;
  search: string;
  onChannelSelect: (channel: StalkerChannel) => void;
}

export const FavoriteChannelsList: React.FC<FavoriteChannelsListProps> = ({
  client,
  accountId,
  search,
  onChannelSelect,
}) => {
  // Use SQLite for favorites
  const { favorites: dbFavorites, isItemFavorite, toggleItemFavorite } = useFavorites(accountId);
  
  // Get favorite channel IDs from SQLite
  const favoriteChannelIds = useMemo(() => {
    return dbFavorites
      .filter(f => f.type === 'live')
      .map(f => f.item_id);
  }, [dbFavorites]);
  
  // Fetch ALL channels from API (not from empty cache!)
  const { data: allChannels = [], isLoading } = useQuery({
    queryKey: ['all-channels-favorites', accountId],
    queryFn: () => client.getAllChannels(),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  // Filter to only favorite channels
  const favoriteChannels = useMemo(() =>
    allChannels.filter((c: StalkerChannel) =>
      favoriteChannelIds.includes(c.id)
    ),
  [allChannels, favoriteChannelIds]);

  // Apply search filter
  const filtered = useMemo(() =>
    favoriteChannels.filter((c: StalkerChannel) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
  [favoriteChannels, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📺</div>
          <h2 className="text-2xl font-bold mb-2">Ładowanie kanałów...</h2>
        </div>
      </div>
    );
  }

  if (favoriteChannels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">❤️</div>
          <h2 className="text-2xl font-bold mb-2">Brak ulubionych kanałów</h2>
          <p className="text-slate-400 mb-4">
            Dodaj kanały do ulubionych klikając ❤️ przy kanale
          </p>
          <p className="text-sm text-slate-500">
            Kanały pojawią się tutaj po ich dodaniu i odwiedzeniu w TV
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
                  {channel.number && (
                    <p className="text-xs text-slate-400">#{channel.number}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemFavorite('live', channel.id);
                  }}
                  className="ml-2 text-lg hover:scale-110 transition-transform"
                >
                  {isItemFavorite('live', channel.id) ? '❤️' : '🤍'}
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
