// @ts-nocheck
// =========================
// 🎬 MEDIA CARD COMPONENT
// =========================
import React from 'react';
import { StalkerVOD, StalkerChannel } from '@/types';

interface MediaCardProps {
  item: StalkerVOD | StalkerChannel;
  type: 'movie' | 'series' | 'channel';
  onSelect: (item: StalkerVOD | StalkerChannel) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onHover?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  type,
  onSelect,
  isFavorite,
  onToggleFavorite,
  onHover,
}) => {
  const isVOD = type === 'movie' || type === 'series';
  const isChannel = type === 'channel';
  const vodItem = isVOD ? item as StalkerVOD : null;
  const channelItem = isChannel ? item as StalkerChannel : null;

  const getPoster = () => {
    if (isVOD && vodItem?.poster) return vodItem.poster;
    if (isChannel && channelItem?.logo) return channelItem.logo;
    return null;
  };

  const getTitle = () => {
    if (isVOD) return vodItem?.name || 'Unknown';
    return channelItem?.name || 'Unknown';
  };

  const getSubtitle = () => {
    if (isVOD && vodItem?.year) return vodItem.year.toString();
    if (isChannel && channelItem?.number) return `#${channelItem.number}`;
    return null;
  };

  const getGenre = () => {
    if (isVOD && vodItem?.genre) return vodItem.genre;
    return null;
  };

  const getIcon = () => {
    switch (type) {
      case 'movie': return '🎬';
      case 'series': return '📺';
      case 'channel': return '📡';
      default: return '🎭';
    }
  };

  return (
    <div
      className="cursor-pointer group"
      onClick={() => onSelect(item)}
      onMouseEnter={onHover}
    >
      <div className="relative overflow-hidden rounded-lg border hover:shadow-lg transition-shadow">
        {/* Poster/Logo */}
        <div className={`${type === 'channel' ? 'aspect-video' : 'aspect-[2/3]'} bg-gray-200 relative`}>
          {getPoster() ? (
            <img 
              src={getPoster()} 
              alt={getTitle()}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <span className="text-4xl">{getIcon()}</span>
            </div>
          )}
          
          {/* Favorite Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item.id);
            }}
            className="absolute top-2 right-2 text-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md"
          >
            {isFavorite ? '❤️' : '🤍'}
          </button>

          {/* Type Badge */}
          <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
            {type}
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="font-medium text-sm line-clamp-2 mb-1">
            {getTitle()}
          </h3>
          {getSubtitle() && (
            <p className="text-xs text-gray-500 mb-1">{getSubtitle()}</p>
          )}
          {getGenre() && (
            <p className="text-xs text-gray-600 line-clamp-1">{getGenre()}</p>
          )}
        </div>
      </div>
    </div>
  );
};
