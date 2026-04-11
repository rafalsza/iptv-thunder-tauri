import React, { useState } from 'react';
import { StalkerVOD } from '@/types';
import { useFavorites } from '@/hooks/useFavorites';
import { usePortalsStore } from '@/store/portals.store';
import { useResumeStore } from '@/store/resume.store';
import { useTranslation } from '@/hooks/useTranslation';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { openUrl } from '@tauri-apps/plugin-opener';

interface MovieDetailsProps {
  movie: StalkerVOD;
  client: StalkerClient;
  onPlay: (movie: StalkerVOD, resumePosition?: number) => void;
  onBack: () => void;
}

export const MovieDetails: React.FC<MovieDetailsProps> = ({
  movie,
  client,
  onPlay,
  onBack,
}) => {
  const { t } = useTranslation();
  const accountId = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId)?.id ?? 'default'
  );
  const { isItemFavorite, toggleItemFavorite } = useFavorites(accountId);
  const { getPosition, clearPosition, getProgress } = useResumeStore();
  const [isHovered, setIsHovered] = useState(false);

  const progress = getProgress(String(movie.id));
  const isWatched = progress?.status === 'watched';
  const isInProgress = progress?.status === 'in_progress';

  // Recalculate percentage using the same source as display time for consistency
  const getDisplayPercentage = () => {
    if (!progress) return 0;
    if (movie.length && movie.length > 0) {
      // Use movie.length from API for both percentage and time display
      const totalSeconds = movie.length * 60;
      return totalSeconds > 0 ? Math.round((progress.position / totalSeconds) * 100) : 0;
    } else if (progress.duration > 0) {
      // Use progress.duration from player
      return Math.round((progress.position / progress.duration) * 100);
    }
    return progress.percentage;
  };

  const displayPercentage = getDisplayPercentage();
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlayFromStart = () => {
    clearPosition(String(movie.id));
    setShowResumeDialog(false);
    onPlay(movie, 0);
  };

  const handleResume = () => {
    setShowResumeDialog(false);
    onPlay(movie, resumePosition);
  };

  const handlePlay = () => {
    const savedPos = getPosition(String(movie.id));
    if (savedPos > 30) {
      setResumePosition(savedPos);
      setShowResumeDialog(true);
    } else {
      onPlay(movie, 0);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!client || !movie.cmd) return;
    
    setIsDownloading(true);
    try {
      const streamUrl = await client.getStreamUrl(movie.cmd);
      await openUrl(streamUrl);
    } catch (error) {
      console.error('Failed to open download URL:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const isFavorite = isItemFavorite('vod', String(movie.id));

  // Parse actors string into array
  const actorsList = movie.actors
    ? movie.actors.split(',').map((a) => a.trim()).filter(Boolean)
    : [];

  // Parse directors string into array
  const directorsList = movie.director
    ? movie.director.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex-1  overflow-y-auto">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-[300px]">
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {movie.poster ? (
                <img
                  src={movie.poster}
                  alt={movie.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gradient-to-br from-slate-700 to-slate-800 flex flex-col items-center justify-center">
                  <span className="text-6xl">🎬</span>
                </div>
              )}

              {/* Watch Status Badge */}
              {isWatched && (
                <div className="absolute top-3 left-3 bg-green-600/90 text-white text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  Obejrzane
                </div>
              )}

              {/* Progress Bar on Poster */}
              {isInProgress && progress && displayPercentage > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-green-700 h-2 rounded-full transition-all"
                        style={{ width: `${displayPercentage}%` }}
                      />
                    </div>
                    <span className="text-white text-xs font-medium">{displayPercentage}%</span>
                  </div>
                  <p className="text-slate-300 text-xs text-center">
                    {movie.length && movie.length > 0
                      ? `Obejrzano ${formatTime(progress.position)} z ${formatTime(movie.length * 60)}`
                      : progress.duration > 0
                        ? `Obejrzano ${formatTime(progress.position)} z ${formatTime(progress.duration)}`
                        : `Obejrzano ${formatTime(progress.position)}`}
                  </p>
                </div>
              )}

              {/* Hover Overlay with Play Button */}
              {isHovered && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-all">
                  <button
                    data-tv-focusable
                    tabIndex={0}
                    onClick={handlePlay}
                    className="w-20 h-20 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
                  >
                    <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Movie Info */}
          <div className="flex-1 text-white">
            {/* Title with X button */}
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-4xl font-bold flex-1 pr-4">{movie.name}</h1>
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={onBack}
                className="flex items-center justify-center w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 rounded-full text-white transition-all backdrop-blur-sm flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              {movie.year && (
                <span className="px-3 py-1 bg-slate-700/80 rounded-md text-sm">
                  {movie.year}
                </span>
              )}
              {movie.genres_str?.trim() && (
                <span className="px-3 py-1 bg-slate-700/80 rounded-md text-sm">
                  {movie.genres_str}
                </span>
              )}
              {movie.rating_imdb && (
                <span className="px-3 py-1 bg-yellow-600/80 rounded-md text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {movie.rating_imdb}
                </span>
              )}
              {movie.rating_kinopoisk && (
                <span className="px-3 py-1 bg-green-700/80 rounded-md text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  {movie.rating_kinopoisk}
                </span>
              )}
              {isWatched && (
                <span className="px-3 py-1 bg-green-600/80 rounded-md text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  Obejrzane
                </span>
              )}
              {isInProgress && progress && (
                <span className="px-3 py-1 bg-green-700/80 rounded-md text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                  {displayPercentage}%
                </span>
              )}
            </div>

            {/* Plot Description */}
            {movie.description && (
              <div className="mb-6">
                <p className="text-slate-300 leading-relaxed">{movie.description}</p>
              </div>
            )}

            {/* Cast */}
            {actorsList.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm text-slate-400 mb-2">{t('cast')}</h3>
                <p className="text-sm text-slate-300">{actorsList.join(', ')}</p>
              </div>
            )}

            {/* Directors */}
            {directorsList.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm text-slate-400 mb-2">
                  {t('director')}
                </h3>
                <p className="text-sm text-slate-300">{directorsList.join(', ')}</p>
              </div>
            )}

            {/* Additional Info */}
            <div className="flex items-center gap-6 mb-8 text-sm text-slate-400">
              {movie.country && (
                <div>
                  <span className="text-slate-500">{t('country')}: </span>
                  {movie.country}
                </div>
              )}
              {movie.length && (
                <div>
                  <span className="text-slate-500">{t('duration')}: </span>
                  {Math.floor(movie.length / 60)}h {movie.length % 60}m
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={handlePlay}
                className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-lg font-semibold hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Odtwórz
              </button>

              <button
                data-tv-focusable
                tabIndex={0}
                onClick={() => toggleItemFavorite('vod', String(movie.id), {
                  name: movie.name,
                  poster: movie.poster,
                  cmd: movie.cmd,
                  extra: {
                    description: movie.description,
                    year: movie.year,
                    genre: movie.genres_str,
                    actors: movie.actors,
                    director: movie.director,
                    country: movie.country,
                    length: movie.length,
                    rating_imdb: movie.rating_imdb,
                    rating_kinopoisk: movie.rating_kinopoisk,
                  },
                })}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-colors"
              >
                {isFavorite ? (
                  <>
                    <span>❤️</span> Usuń z ulubionych
                  </>
                ) : (
                  <>
                    <span>🤍</span> Dodaj do ulubionych
                  </>
                )}
              </button>

              <button
                data-tv-focusable
                tabIndex={0}
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-6 py-3 bg-green-700 text-white rounded-lg font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isDownloading ? 'Opening...' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resume Dialog */}
      {showResumeDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-2">{t('resumeWatching')}</h3>
            <p className="text-slate-300 mb-6">
              {t('watchedTo')} <span className="text-white font-semibold">{formatTime(resumePosition)}</span>
            </p>
            <div className="flex gap-3">
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={handlePlayFromStart}
                className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition-colors"
              >
                {t('fromStart')}
              </button>
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={handleResume}
                className="flex-1 px-4 py-3 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors"
              >
                {t('resume')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
