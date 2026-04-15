// =========================
// 🎬 NETFLIX-STYLE MEDIA CARD COMPONENT
// =========================
import React, { useState } from 'react';
import { Play, Plus, ThumbsUp } from 'lucide-react';
import { StalkerVOD, StalkerChannel } from '@/types';
import { type WatchStatus } from '@/store/resume.store';

interface NetflixMediaCardProps {
  item: StalkerVOD | StalkerChannel;
  type: 'movie' | 'series' | 'channel';
  onSelect: (item: StalkerVOD | StalkerChannel) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  watchStatus?: WatchStatus;
  progressPercentage?: number;
}

export const NetflixMediaCard: React.FC<NetflixMediaCardProps> = ({
  item,
  type,
  onSelect,
  onToggleFavorite,
  watchStatus,
  progressPercentage = 0,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getPoster = () => {
    if (type === 'channel') {
      return (item as StalkerChannel).logo;
    }
    return (item as StalkerVOD).poster;
  };

  const getTitle = () => item.name;

  const getYear = () => {
    if (type === 'channel') return null;
    return (item as StalkerVOD).year;
  };

  const getGenre = () => {
    if (type === 'channel') return null;
    const vodItem = item as StalkerVOD;
    return vodItem.genre || vodItem.genres_str;
  };

  const getRating = () => {
    if (type === 'channel') return null;
    const vodItem = item as StalkerVOD;
    return vodItem.rating_imdb || vodItem.rating_kinopoisk;
  };

  const poster = getPoster();
  const title = getTitle();
  const year = getYear();
  const genre = getGenre();
  const rating = getRating();

  const aspectRatio = type === 'channel' ? 'aspect-video' : 'aspect-[2/3]';

  return (
    <div
      className={`relative flex-shrink-0 cursor-pointer ${isHovered ? 'z-50' : 'z-10'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(item)}
    >
      {/* Card Container - Netflix style hover expansion */}
      <div
        className={`relative bg-slate-800 rounded overflow-hidden transition-all duration-300 ease-out ${
          isHovered ? 'shadow-2xl shadow-black/80' : 'shadow-lg'
        }`}
        style={{
          width: type === 'channel' ? '320px' : '180px',
          height: isHovered ? 'auto' : undefined,
        }}
      >
        {/* Poster Image */}
        <div className={`relative ${aspectRatio} overflow-hidden`}>
          {poster ? (
            <img
              src={poster}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-700">
              <span className="text-4xl">{type === 'movie' ? '🎬' : type === 'series' ? '📺' : '📡'}</span>
            </div>
          )}

          {/* Progress Bar */}
          {!isHovered && watchStatus === 'in_progress' && progressPercentage > 0 && (
            <div className="absolute bottom-6 left-0 right-0 h-1 bg-slate-700">
              <div
                className="h-full bg-[#E50914] transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          )}

          {/* Duration Badge */}
          {!isHovered && (item as StalkerVOD).length && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs font-medium px-2 py-1 flex items-center justify-center">
              <span>{Math.floor((item as StalkerVOD).length! / 60)}h {(item as StalkerVOD).length! % 60}m</span>
            </div>
          )}
        </div>

        {/* Expanded Info - shown on hover */}
        {isHovered && (
          <div className="bg-[#181818] p-3">
            {/* Action Buttons */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item);
                }}
                className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <Play className="w-4 h-4 text-black fill-current ml-0.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(String(item.id));
                }}
                className="w-8 h-8 border-2 border-slate-500 rounded-full flex items-center justify-center hover:border-white transition-colors"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
              <button className="w-8 h-8 border-2 border-slate-500 rounded-full flex items-center justify-center hover:border-white transition-colors">
                <ThumbsUp className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-300 mb-2 flex-wrap">
              {rating && (
                <span className="text-green-500 font-bold">{rating}% Match</span>
              )}
              {year && <span className="font-medium">{year}</span>}
              {type === 'series' && (
                <span className="font-medium">2 Sezonów</span>
              )}
              <span className="border border-slate-500 px-1 rounded text-[10px]">HD</span>
            </div>

            {/* Genre Tags */}
            {genre && (
              <div className="flex flex-wrap gap-1.5">
                {genre.split(',').slice(0, 3).map((g, i) => (
                  <span key={i} className="text-[11px] text-slate-400">
                    {g.trim()}{i < 2 && <span className="mx-1">•</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title (when not hovered) */}
      {!isHovered && (
        <div className="mt-3">
          <h3 className="text-base text-white font-semibold leading-tight">{title}</h3>
          {year && (
            <p className="text-sm text-slate-400">{year}</p>
          )}
        </div>
      )}
    </div>
  );
};
