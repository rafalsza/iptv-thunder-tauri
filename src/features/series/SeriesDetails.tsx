import React, { useState, useMemo, useEffect } from 'react';
import { StalkerVOD } from '@/types';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { useFavorites } from '@/hooks/useFavorites';
import { useResumeStore } from '@/store/resume.store';
import { usePortalsStore } from '@/store/portals.store';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();
  const accountId = usePortalsStore((s) =>
    s.portals.find((p) => p.id === s.activePortalId)?.id ?? 'default'
  );

  const { favorites, toggleItemFavorite } = useFavorites(accountId);
  const { getPosition, clearPosition } = useResumeStore();

  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [selectedEpisode, setSelectedEpisode] = useState<StalkerVOD | null>(null);
  const [resumePosition, setResumePosition] = useState(0);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  const { data: seriesInfo, isLoading: episodesLoading } = useSeriesInfo(
    client,
    String(series.id)
  );

  // Merge: seriesInfo from API + favorites data (favorites takes priority for metadata)
  const apiSeries = seriesInfo?.series;
  const fullSeries = apiSeries?.id
    ? {
        ...apiSeries,
        ...series,
        // Explicitly preserve metadata from favorites if API returns empty values
        genres_str: series.genres_str || apiSeries.genres_str,
        genre: series.genre || apiSeries.genre,
        director: series.director || apiSeries.director,
        actors: series.actors || apiSeries.actors,
        description: series.description || apiSeries.description,
        year: series.year || apiSeries.year,
        rating_imdb: series.rating_imdb || apiSeries.rating_imdb,
        rating_kinopoisk: series.rating_kinopoisk || apiSeries.rating_kinopoisk,
        country: series.country || apiSeries.country,
      }
    : series;
  const episodes = seriesInfo?.episodes || [];
  const seasons = seriesInfo?.seasons || [];

  // Set first available season after loading data
  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const isFavorite = favorites.some(
    (f) => f.type === 'series' && String(f.item_id) === String(series.id)
  );

  // Group episodes by season
  const episodesBySeason = useMemo(() => {
    const grouped: Record<string, StalkerVOD[]> = {};

    episodes.forEach((ep: StalkerVOD) => {
      const season = String(ep.season || '1');
      if (!grouped[season]) grouped[season] = [];
      grouped[season].push(ep);
    });

    // Sort episodes within season
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
    const posterUrl = fullSeries.poster || fullSeries.logo || '';
    const seriesId = String(fullSeries.id);
    console.log('💙 Toggling favorite for series:', seriesId, 'Current isFavorite:', isFavorite);
    toggleItemFavorite('series', seriesId, {
      name: fullSeries.name,
      poster: posterUrl,
      cmd: fullSeries.cmd,
      extra: {
        description: fullSeries.description,
        rating_imdb: fullSeries.rating_imdb,
        rating_kinopoisk: fullSeries.rating_kinopoisk,
        director: fullSeries.director,
        actors: fullSeries.actors,
        year: fullSeries.year,
        genres_str: fullSeries.genres_str,
        country: fullSeries.country,
      },
    });
  };

  // Parse actors and directors
  const actorsList = fullSeries.actors
    ? fullSeries.actors.split(',').map((a: string) => a.trim()).filter(Boolean)
    : [];

  const directorsList = fullSeries.director
    ? fullSeries.director.split(',').map((d: string) => d.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header z przyciskiem wstecz po prawej */}
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-4xl font-bold text-white pr-8">{fullSeries.name}</h1>
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 bg-slate-800/80 hover:bg-slate-700/80 rounded-full text-white transition-all backdrop-blur-sm flex-shrink-0"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Netflix Style Layout - Poster left, info right */}
        <div className="flex gap-6 mb-10">
          {/* Poster with Play Button */}
          <div className="flex-shrink-0 w-[280px]">
            <div className="relative rounded-lg overflow-hidden group cursor-pointer"
                 onClick={() => {
                   const firstSeason = seasons.length > 0 ? seasons[0] : '1';
                   const firstSeasonEpisodes = episodesBySeason[firstSeason] || [];
                   if (firstSeasonEpisodes.length > 0) {
                     handleEpisodePlay(firstSeasonEpisodes[0]);
                   }
                 }}>
              {fullSeries.poster ? (
                <img
                  src={fullSeries.poster}
                  alt={fullSeries.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-slate-800 flex items-center justify-center">
                  <span className="text-6xl">📺</span>
                </div>
              )}
              {/* Play Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                  <Play className="w-8 h-8 text-black fill-black ml-1" />
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="flex-1">
            {/* Meta info */}
            <div className="flex items-center gap-3 mb-4 text-sm flex-wrap">
              {fullSeries.year && <span className="text-slate-300">{fullSeries.year}</span>}
              {(fullSeries.genres_str || seriesInfo?.series?.genres_str) && (
                <span className="text-slate-400">{fullSeries.genres_str || seriesInfo?.series?.genres_str}</span>
              )}
              {seasons.length > 0 && (
                <span className="text-slate-400">{seasons.length} {seasons.length === 1 ? t('season') : t('seasons')}</span>
              )}
              {episodes.length > 0 && (
                <span className="text-slate-400">{episodes.length} {t('episode').toLowerCase()}.</span>
              )}
              {(fullSeries.rating_imdb || seriesInfo?.series?.rating_imdb) && (
                <span className="px-2 py-0.5 bg-yellow-600/80 rounded text-white text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {fullSeries.rating_imdb || seriesInfo?.series?.rating_imdb}
                </span>
              )}
            </div>

            {/* Description */}
            {(fullSeries.description || seriesInfo?.series?.description) && (
              <p className="text-slate-300 mb-6 leading-relaxed">
                {fullSeries.description || seriesInfo?.series?.description}
              </p>
            )}

            {/* Directors */}
            {(directorsList.length > 0 || series.director || seriesInfo?.series?.director) && (
              <div className="mb-3">
                <span className="text-slate-400 text-sm">{t('director')}: </span>
                <span className="text-slate-300 text-sm">
                  {directorsList.length > 0
                    ? directorsList.join(', ')
                    : series.director || seriesInfo?.series?.director}
                </span>
              </div>
            )}

            {/* Cast */}
            {(actorsList.length > 0 || series.actors || seriesInfo?.series?.actors) && (
              <div className="mb-4">
                <span className="text-slate-400 text-sm">{t('cast')}: </span>
                <span className="text-slate-300 text-sm">
                  {actorsList.length > 0
                    ? actorsList.join(', ')
                    : series.actors || seriesInfo?.series?.actors}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-4 mt-6">
              {episodes.length > 0 && (
                <button
                  onClick={() => {
                    const firstSeason = seasons.length > 0 ? seasons[0] : '1';
                    const firstSeasonEpisodes = episodesBySeason[firstSeason] || [];
                    if (firstSeasonEpisodes.length > 0) {
                      handleEpisodePlay(firstSeasonEpisodes[0]);
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-100 rounded-lg text-slate-900 font-semibold transition-colors"
                >
                  <Play className="w-5 h-5 fill-current" />
                  {t('playFirstEpisode')}
                </button>
              )}
              <button
                onClick={handleToggleFavorite}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                <Heart className={isFavorite ? 'fill-red-500 text-red-500 w-5 h-5' : 'w-5 h-5'} />
                {isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
              </button>
            </div>
          </div>
        </div>

        {/* Episodes Section */}
        <div>
        {/* Header with season selector */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">{t('episodes')}</h2>
          {seasons.length > 1 && (
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700"
            >
              {seasons.map((season: string) => (
                <option key={season} value={season}>
                  {t('season')} {season} ({episodesBySeason[season]?.length || 0} {t('episode').toLowerCase()}.)
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
                const displayName = episode.episodeName || episode.name || `${t('episode')} ${epNum}`;

                return (
                  <div
                    key={`${selectedSeason}-${episode.episode || index}-${episode.id}`}
                    onClick={() => handleEpisodePlay(episode)}
                    className="group flex items-start gap-6 py-6 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Episode number */}
                    <span className="text-2xl font-light text-slate-500 w-8 text-center pt-8">
                      {epNum}
                    </span>

                    {/* Thumbnail */}
                    <div className="relative w-40 aspect-video bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                      {episode.logo || fullSeries.poster ? (
                        <img
                          src={episode.logo || fullSeries.poster}
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

                    {/* Info */}
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
                              {t('resume')}
                            </span>
                          )}
                          {episode.length && (
                            <span className="text-sm text-slate-400">
                              {Math.floor(episode.length / 60)} {t('minutes')}
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
              {t('noEpisodes')}
            </div>
          )}
        </div>
      </div>

      {/* Resume dialog */}
      {showResumeDialog && selectedEpisode && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl font-semibold text-white mb-2">{t('resumeWatching')}</h3>
            <p className="text-slate-400 mb-8">
              <span className="text-slate-300">{t('watchedEpisodeTo')} <span className="text-white font-medium">{formatTime(resumePosition)}</span></span>
            </p>

            <div className="flex gap-4">
              <Button variant="secondary" onClick={handlePlayFromStart} className="flex-1">
                {t('playFromStart')}
              </Button>
              <Button onClick={handleResume} className="flex-1">
                {t('resumePlayback')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};