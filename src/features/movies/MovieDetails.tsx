import React, { useState } from 'react';
import { StalkerVOD } from '@/types';
import { useAppStore } from '@/store/app.store';
import { useResumeStore } from '@/store/resume.store';

interface MovieDetailsProps {
  movie: StalkerVOD;
  onPlay: (movie: StalkerVOD, resumePosition?: number) => void;
  onBack: () => void;
}

export const MovieDetails: React.FC<MovieDetailsProps> = ({
  movie,
  onPlay,
  onBack,
}) => {
  const { favorites, toggleFavorite } = useAppStore();
  const { getPosition, clearPosition } = useResumeStore();
  const [isHovered, setIsHovered] = useState(false);
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

  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Download movie:', movie.name);
  };

  const isFavorite = favorites.includes(String(movie.id));

  // Parse actors string into array
  const actorsList = movie.actors
    ? movie.actors.split(',').map((a) => a.trim()).filter(Boolean)
    : [];

  // Parse directors string into array
  const directorsList = movie.director
    ? movie.director.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
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

              {/* Hover Overlay with Play Button */}
              {isHovered && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-all">
                  <button
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
              {movie.genre && (
                <span className="px-3 py-1 bg-slate-700/80 rounded-md text-sm">
                  {movie.genre}
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
                <span className="px-3 py-1 bg-blue-600/80 rounded-md text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  {movie.rating_kinopoisk}
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
                <h3 className="text-sm text-slate-400 mb-2">Actors</h3>
                <p className="text-sm text-slate-300">{actorsList.join(', ')}</p>
              </div>
            )}

            {/* Directors */}
            {directorsList.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm text-slate-400 mb-2">
                  {directorsList.length > 1 ? 'Directors' : 'Director'}
                </h3>
                <p className="text-sm text-slate-300">{directorsList.join(', ')}</p>
              </div>
            )}

            {/* Additional Info */}
            <div className="flex items-center gap-6 mb-8 text-sm text-slate-400">
              {movie.country && (
                <div>
                  <span className="text-slate-500">Country: </span>
                  {movie.country}
                </div>
              )}
              {movie.length && (
                <div>
                  <span className="text-slate-500">Duration: </span>
                  {Math.floor(movie.length / 60)}h {movie.length % 60}m
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlay}
                className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-lg font-semibold hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Odtwórz
              </button>

              <button
                onClick={() => toggleFavorite(String(movie.id))}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 transition-colors"
              >
                {isFavorite ? (
                  <>
                    <span>❤️</span> Dodaj do ulubionych
                  </>
                ) : (
                  <>
                    <span>🤍</span> Dodaj do ulubionych
                  </>
                )}
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resume Dialog */}
      {showResumeDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-2">Kontynuuj oglądanie?</h3>
            <p className="text-slate-300 mb-6">
              Oglądałeś ten film do <span className="text-white font-semibold">{formatTime(resumePosition)}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handlePlayFromStart}
                className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition-colors"
              >
                Od początku
              </button>
              <button
                onClick={handleResume}
                className="flex-1 px-4 py-3 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors"
              >
                Wznów
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
