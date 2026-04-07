import React, { useState, useMemo, useEffect } from 'react';
import { StalkerVOD } from '@/types';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { useFavorites } from '@/hooks/useFavorites';
import { useResumeStore } from '@/store/resume.store';
import { usePortalsStore } from '@/store/portals.store';
import { useSeriesInfo } from './series.hooks';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Heart, ArrowLeft } from 'lucide-react';

interface SeriesDetailsProps {
  series: StalkerVOD;
  client: StalkerClient;
  onPlay: (episode: StalkerVOD, resumePosition?: number) => void;
  onBack: () => void;
}

export const SeriesDetails: React.FC<SeriesDetailsProps> = ({
  series,
  client,
  onPlay,
  onBack,
}) => {
  const accountId = usePortalsStore((s) =>
    s.portals.find((p) => p.id === s.activePortalId)?.id ?? 'default'
  );

  const { favorites, toggleItemFavorite } = useFavorites(accountId);
  const { getPosition, clearPosition } = useResumeStore();

  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [selectedEpisode, setSelectedEpisode] = useState<StalkerVOD | null>(null);
  const [resumePosition, setResumePosition] = useState(0);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  // Pobieranie informacji o serialu + odcinkach
  const { data: seriesInfo, isLoading: episodesLoading } = useSeriesInfo(
    client,
    String(series.id)
  );

  const episodes = seriesInfo?.episodes || [];
  const seasons = seriesInfo?.seasons || [];

  // Ustaw pierwszy dostępny sezon po załadowaniu danych
  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const isFavorite = favorites.some(
    (f) => f.type === 'series' && String(f.item_id) === String(series.id)
  );

  // Dodaj useEffect do śledzenia zmian w ulubionych
  useEffect(() => {
    console.log('💙 Favorites updated:', favorites.length, 'items');
    const found = favorites.find(f => f.type === 'series' && String(f.item_id) === String(series.id));
    if (found) {
      console.log('💙 Series is favorite:', found);
    }
  }, [favorites, series.id]);

  // Grupowanie odcinków według sezonu
  const episodesBySeason = useMemo(() => {
    const grouped: Record<string, StalkerVOD[]> = {};

    episodes.forEach((ep: StalkerVOD) => {
      const season = String(ep.season || '1');
      if (!grouped[season]) grouped[season] = [];
      grouped[season].push(ep);
    });

    // Sortowanie odcinków w sezonie
    Object.keys(grouped).forEach((season) => {
      grouped[season].sort((a, b) => {
        const epA = Number.parseInt(String(a.episode) || '0');
        const epB = Number.parseInt(String(b.episode) || '0');
        return epA - epB;
      });
    });

    return grouped;
  }, [episodes]);

  const currentEpisodes = episodesBySeason[selectedSeason] || [];

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleEpisodePlay = (episode: StalkerVOD) => {
    const savedPos = getPosition(String(episode.id));
    if (savedPos > 30) {
      setSelectedEpisode(episode);
      setResumePosition(savedPos);
      setShowResumeDialog(true);
    } else {
      onPlay(episode, 0);
    }
  };

  const handlePlayFromStart = () => {
    if (selectedEpisode) {
      clearPosition(String(selectedEpisode.id));
      setShowResumeDialog(false);
      onPlay(selectedEpisode, 0);
    }
  };

  const handleResume = () => {
    if (selectedEpisode) {
      setShowResumeDialog(false);
      onPlay(selectedEpisode, resumePosition);
    }
  };

  const handleToggleFavorite = () => {
    const posterUrl = series.poster || series.logo || '';
    const seriesId = String(series.id);
    console.log('💙 Toggling favorite for series:', seriesId, 'Current isFavorite:', isFavorite);
    toggleItemFavorite('series', seriesId, {
      name: series.name,
      poster: posterUrl,
      cmd: series.cmd,
    });
  };

  // Parsowanie aktorów i reżyserów
  const actorsList = series.actors
    ? series.actors.split(',').map((a) => a.trim()).filter(Boolean)
    : [];

  const directorsList = series.director
    ? series.director.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex gap-8">
          {/* Plakat */}
          <div className="flex-shrink-0 w-[280px]">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              {series.poster ? (
                <img
                  src={series.poster}
                  alt={series.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-slate-800 flex items-center justify-center">
                  <span className="text-7xl">📺</span>
                </div>
              )}
            </div>
          </div>

          {/* Informacje o serialu */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-6">
              <h1 className="text-4xl font-bold text-white pr-8">{series.name}</h1>
              <button
                onClick={onBack}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            </div>

            {/* Tagi */}
            <div className="flex flex-wrap gap-3 mb-6">
              {series.year && <span className="px-4 py-1 bg-slate-700 rounded-lg text-sm text-white">{series.year}</span>}
              {(series.genre || seriesInfo?.series?.genre) && (
                <span className="px-4 py-1 bg-slate-700 rounded-lg text-sm text-white">
                  {series.genre || seriesInfo?.series?.genre}
                </span>
              )}
              {seasons.length > 0 && (
                <span className="px-4 py-1 bg-blue-600/80 rounded-lg text-sm text-white">
                  {seasons.length} {seasons.length === 1 ? 'Sezon' : 'Sezony'}
                </span>
              )}
              {episodes.length > 0 && (
                <span className="px-4 py-1 bg-slate-700 rounded-lg text-sm text-white">
                  {episodes.length} odcinków
                </span>
              )}
            </div>

            {/* Opis */}
            {(series.description || series.genres_str || seriesInfo?.series?.genres_str) && (
              <div className="mb-8">
                {(series.genres_str || seriesInfo?.series?.genres_str) && (
                  <p className="text-slate-400 text-sm mb-2">
                    <span className="text-slate-300 font-medium">Gatunek:</span> {series.genres_str || seriesInfo?.series?.genres_str}
                  </p>
                )}
                {(series.description || seriesInfo?.series?.description) && (
                  <p className="text-slate-300 leading-relaxed">{series.description || seriesInfo?.series?.description}</p>
                )}
              </div>
            )}

            {/* Aktorzy i Reżyser */}
            {(actorsList.length > 0 || seriesInfo?.series?.actors) && (
              <div className="mb-6">
                <p className="text-slate-400 text-sm mb-1">Obsada</p>
                <p className="text-slate-200">
                  {actorsList.length > 0 ? actorsList.join(', ') : seriesInfo?.series?.actors}
                </p>
              </div>
            )}

            {(directorsList.length > 0 || seriesInfo?.series?.director) && (
              <div className="mb-8">
                <p className="text-slate-400 text-sm mb-1">Reżyseria</p>
                <p className="text-slate-200">
                  {directorsList.length > 0 ? directorsList.join(', ') : seriesInfo?.series?.director}
                </p>
              </div>
            )}

            {/* Przyciski akcji */}
            <div className="flex gap-4">
              {episodes.length > 0 && (
                <button onClick={() => {
                  // Find first season and its first episode
                  const firstSeason = seasons.length > 0 ? seasons[0] : '1';
                  const firstSeasonEpisodes = episodesBySeason[firstSeason] || [];
                  if (firstSeasonEpisodes.length > 0) {
                    handleEpisodePlay(firstSeasonEpisodes[0]);
                  }
                }} className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors">
                  <Play className="w-5 h-5" />
                  Odtwórz pierwszy odcinek
                </button>
              )}

              <button
                onClick={handleToggleFavorite}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                <Heart className={isFavorite ? 'fill-red-500 text-red-500' : 'text-white'} />
                {isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
              </button>
            </div>
          </div>
        </div>

        {/* Sekcja odcinków - styl Netflix lista */}
        <div className="mt-16">
          {/* Nagłówek z selektorem sezonu */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-white">Odcinki</h2>
            {seasons.length > 1 && (
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700"
              >
                {seasons.map((season: string) => (
                  <option key={season} value={season}>
                    Sezon {season} ({episodesBySeason[season]?.length || 0} odc.)
                  </option>
                ))}
              </select>
            )}
          </div>

          {episodesLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
            </div>
          ) : currentEpisodes.length > 0 ? (
            <div className="space-y-0 divide-y divide-slate-800">
              {currentEpisodes.map((episode, index) => {
                const resumePos = getPosition(String(episode.id));
                const hasResume = resumePos > 30;
                const epNum = index + 1;
                const displayName = episode.episodeName || episode.name || `Odcinek ${epNum}`;

                return (
                  <div
                    key={`${selectedSeason}-${episode.episode || index}-${episode.id}`}
                    onClick={() => handleEpisodePlay(episode)}
                    className="group flex items-start gap-6 py-6 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Numer odcinka */}
                    <span className="text-2xl font-light text-slate-500 w-8 text-center pt-8">
                      {epNum}
                    </span>

                    {/* Miniaturka */}
                    <div className="relative w-40 aspect-video bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                      {episode.logo ? (
                        <img
                          src={episode.logo}
                          alt={episode.name || ''}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-slate-600">
                          {epNum}
                        </div>
                      )}
                      
                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" />
                      </div>
                    </div>

                    {/* Informacje */}
                    <div className="flex-1 min-w-0 py-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">
                            {displayName}
                          </h3>
                          {episode.description && (
                            <p className="text-sm text-slate-400 line-clamp-2 mb-2">
                              {episode.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {hasResume && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                              Wznów
                            </span>
                          )}
                          {episode.length && (
                            <span className="text-sm text-slate-400">
                              {Math.floor(episode.length / 60)} min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400">
              Brak odcinków w wybranym sezonie
            </div>
          )}
        </div>
      </div>

      {/* Dialog wznowienia */}
      {showResumeDialog && selectedEpisode && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl font-semibold mb-2">Kontynuować odtwarzanie?</h3>
            <p className="text-slate-400 mb-8">
              Oglądałeś ten odcinek do <span className="text-white font-medium">{formatTime(resumePosition)}</span>
            </p>

            <div className="flex gap-4">
              <Button variant="secondary" onClick={handlePlayFromStart} className="flex-1">
                Odtwórz od początku
              </Button>
              <Button onClick={handleResume} className="flex-1">
                Wznów odtwarzanie
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};