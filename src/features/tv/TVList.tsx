// =========================
// 📺 TV LIST (UI)
// =========================
import React, { useMemo } from 'react';
import { useChannels, usePrefetchStream } from './tv.hooks';
import { useFavorites } from '@/hooks/useFavorites';
import { useAppStore } from '@/store/app.store';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel, StalkerGenre } from '@/types';

interface TVListProps {
  client: StalkerClient;
  accountId: string;
  search: string;
  onChannelSelect: (channel: StalkerChannel) => void;
  selectedCategory?: StalkerGenre | null;
}

export const TVList: React.FC<TVListProps> = ({ 
  client, 
  accountId,
  search, 
  onChannelSelect,
  selectedCategory 
}) => {
  const { 
    data: allChannels = [],
    isLoading,
    error 
  } = useChannels(client, selectedCategory?.id);
  const preload = usePrefetchStream(client);
  const { isItemFavorite, toggleItemFavorite } = useFavorites(accountId);
  const { isFavoriteCategory, toggleFavoriteCategory } = useAppStore();

  const filtered = useMemo(() =>
    allChannels.filter((c: StalkerChannel) => 
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
  [allChannels, search]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg text-white">Loading channels...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg text-red-500">Error loading channels</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Category Header - Unified Style */}
      {selectedCategory && (
        <div className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-xl">
              {selectedCategory.id === '*' ? '🌍' : '📺'}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">{selectedCategory.title}</h2>
              <p className="text-sm text-slate-400">
                {allChannels.length} kanałów
              </p>
            </div>
            {/* Favorite Category Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedCategory) {
                  toggleFavoriteCategory(accountId, String(selectedCategory.id));
                }
              }}
              className="text-xl hover:scale-110 transition-transform p-2 rounded-full hover:bg-slate-700"
              title={isFavoriteCategory(accountId, String(selectedCategory.id)) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            >
              {isFavoriteCategory(accountId, String(selectedCategory.id)) ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      )}

      {/* Channels Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((channel: StalkerChannel) => (
          <div
            key={channel.id}
            onMouseEnter={() => preload(channel)}
            onClick={() => onChannelSelect(channel)}
            className="p-3 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-all"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-white truncate">
                  {channel.name}
                </h3>
                {!!channel.number && (
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
            {!!channel.logo && (
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
