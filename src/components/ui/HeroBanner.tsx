// =========================
// 🎬 HERO BANNER COMPONENT
// =========================
import React from 'react';
import { Play, Info } from 'lucide-react';
import { StalkerVOD, StalkerChannel } from '@/types';

interface HeroBannerProps {
  item?: StalkerVOD | StalkerChannel | null;
  type?: 'movie' | 'series' | 'channel';
  onPlay?: () => void;
  onMoreInfo?: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  item,
  type = 'movie',
  onPlay,
  onMoreInfo,
}) => {
  if (!item) {
    return (
      <div className="relative w-full h-[60vh] bg-gradient-to-b from-slate-800 to-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">IPTV Thunder</h1>
          <p className="text-slate-400">Wybierz portal, aby rozpocząć</p>
        </div>
      </div>
    );
  }

  const getPoster = () => {
    if (type === 'channel') {
      return (item as StalkerChannel).logo;
    }
    return (item as StalkerVOD).poster || (item as StalkerVOD).logo;
  };

  const getTitle = () => item.name;

  const getDescription = () => {
    if (type === 'channel') return null;
    const vodItem = item as StalkerVOD;
    return vodItem.description;
  };

  const getYear = () => {
    if (type === 'channel') return null;
    return (item as StalkerVOD).year;
  };

  const getGenre = () => {
    if (type === 'channel') return null;
    const vodItem = item as StalkerVOD;
    return vodItem.genre || vodItem.genres_str;
  };

  const poster = getPoster();
  const title = getTitle();
  const description = getDescription();
  const year = getYear();
  const genre = getGenre();

  return (
    <div className="relative w-full min-h-[70vh] bg-gradient-to-br from-slate-800 via-slate-900 to-black overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
      </div>

      {/* Content - Netflix Style Layout */}
      <div className="relative h-full flex flex-col md:flex-row items-center px-4 md:px-16 py-12 md:py-20 gap-8 md:gap-12">
        {/* Poster Image - Left Side, Contained */}
        {poster && (
          <div className="flex-shrink-0 w-[200px] md:w-[280px] lg:w-[320px]">
            <img
              src={poster}
              alt={title}
              className="w-full h-auto rounded-lg shadow-2xl object-contain"
              style={{ aspectRatio: '2/3' }}
            />
          </div>
        )}

        {/* Content - Right Side */}
        <div className="flex-1 max-w-2xl text-center md:text-left">
          {/* Netflix-style Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 drop-shadow-lg tracking-tight">
            {title}
          </h1>

          {/* Metadata */}
          {(year || genre) && (
            <div className="flex items-center justify-center md:justify-start gap-4 mb-4 text-white">
              {year && (
                <span className="text-lg font-semibold text-green-500">{year}</span>
              )}
              {genre && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="text-lg">{genre}</span>
                </>
              )}
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="text-lg md:text-xl text-white/90 mb-8 line-clamp-3 drop-shadow-md leading-relaxed">
              {description}
            </p>
          )}

          {/* Action Buttons - Netflix style */}
          <div className="flex gap-3">
            <button
              onClick={onPlay}
              className="flex items-center gap-2 px-8 py-3 bg-white text-black rounded font-bold hover:bg-slate-200 transition-colors text-lg"
            >
              <Play className="w-6 h-6 fill-current" />
              Odtwórz
            </button>
            <button
              onClick={onMoreInfo}
              className="flex items-center gap-2 px-8 py-3 bg-[#2d2d2d]/80 text-white rounded font-semibold hover:bg-[#404040]/80 transition-colors backdrop-blur-sm text-lg"
            >
              <Info className="w-6 h-6" />
              Więcej informacji
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Fade - Netflix style */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#141414] to-transparent" />
    </div>
  );
};
