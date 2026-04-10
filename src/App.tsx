// =========================
// 🧠 COMPLETE APP WITH ALL FEATURES
// =========================
import React, { useState, useRef, Suspense, lazy } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel, StalkerVOD, StalkerGenre } from '@/types';
import { usePlayer } from '@/features/player/player.hooks';
import { Navigation } from '@/components/ui/Navigation';
import { usePortalsStore } from '@/store/portals.store';
import { useTranslation, useTVNavigation } from '@/hooks';
import { Settings } from '@/features/settings/Settings';

// Lazy load components
const TVList = lazy(() => import('@/features/tv/TVList').then(module => ({ default: module.TVList })));
const MovieList = lazy(() => import('@/features/movies/MovieList').then(module => ({ default: module.MovieList })));
const MovieDetails = lazy(() => import('@/features/movies/MovieDetails').then(module => ({ default: module.MovieDetails })));
const SeriesList = lazy(() => import('@/features/series/SeriesList').then(module => ({ default: module.SeriesList })));
const SeriesDetails = lazy(() => import('@/features/series/SeriesDetails').then(module => ({ default: module.SeriesDetails })));
const Player = lazy(() => import('@/features/player/Player').then(module => ({ default: module.Player })));
const PortalsPage = lazy(() => import('@/features/portals/PortalsPage').then(module => ({ default: module.PortalsPage })));
const ChannelCategoriesList = lazy(() => import('@/features/tv/ChannelCategoriesList').then(module => ({ default: module.ChannelCategoriesList })));
const FavoriteCategoriesList = lazy(() => import('@/features/tv/FavoriteCategoriesList').then(module => ({ default: module.FavoriteCategoriesList })));
const MovieCategoriesList = lazy(() => import('@/features/movies/MovieCategoriesList').then(module => ({ default: module.MovieCategoriesList })));
const FavoriteChannelsList = lazy(() => import('@/features/tv/FavoriteChannelsList').then(module => ({ default: module.FavoriteChannelsList })));
const FavoriteMovieCategoriesList = lazy(() => import('@/features/movies/FavoriteMovieCategoriesList').then(module => ({ default: module.FavoriteMovieCategoriesList })));
const FavoriteMoviesList = lazy(() => import('@/features/movies/FavoriteMoviesList').then(module => ({ default: module.FavoriteMoviesList })));
const SeriesCategoriesList = lazy(() => import('@/features/series/SeriesCategoriesList').then(module => ({ default: module.SeriesCategoriesList })));
const FavoriteSeriesCategoriesList = lazy(() => import('@/features/series/FavoriteSeriesCategoriesList').then(module => ({ default: module.FavoriteSeriesCategoriesList })));
const FavoriteSeriesList = lazy(() => import('@/features/series/FavoriteSeriesList').then(module => ({ default: module.FavoriteSeriesList })));

// Create a client with persistent cache
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

// Configure persistent storage (localStorage)
const persister = createAsyncStoragePersister({
  storage: globalThis.localStorage,
});

type ActiveView = 'tv' | 'movies' | 'series' | 'portals' | 'categories' | 'favorite-categories' | 'favorite-channels' | 'movie-categories' | 'favorite-movie-categories' | 'favorite-movies' | 'movie-details' | 'series-details' | 'series-categories' | 'favorite-series-categories' | 'favorite-series';

interface AppProps {
  // Remove activeAccount prop - we'll get it from store
}

function AppInner({ }: AppProps) {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<ActiveView>('portals');
  const [search, setSearch] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<StalkerVOD | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<StalkerVOD | null>(null);

  // Track previous view for back navigation
  const previousViewRef = useRef<ActiveView>('movies');

  const activePortal = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId) ?? null
  );
  
  // Create client only when we have an active portal
  const client = activePortal ? new StalkerClient(activePortal as any) : null;

  // Player hooks for different content types
  const tvPlayer = usePlayer(client!);
  const moviePlayer = usePlayer(client!);
  const seriesPlayer = usePlayer(client!);

  const handleChannelSelect = (channel: StalkerChannel) => {
    if (client) tvPlayer.play(channel, queryClient, false);
  };

  const handleMovieSelect = (movie: StalkerVOD) => {
    previousViewRef.current = activeView;
    setSelectedMovie(movie);
    setActiveView('movie-details');
  };

  const handleMoviePlay = (movie: StalkerVOD, resumePosition?: number) => {
    if (client) moviePlayer.play(movie as any, queryClient, true, resumePosition || 0, String(movie.id));
  };

  const handleMovieBack = () => {
    setSelectedMovie(null);
    setActiveView(previousViewRef.current);
  };

  const handleSeriesSelect = (series: StalkerVOD) => {
    previousViewRef.current = activeView;
    setSelectedSeries(series);
    setActiveView('series-details');
  };

  const handleSeriesBack = () => {
    setSelectedSeries(null);
    setActiveView(previousViewRef.current);
  };

  // TV Navigation (D-pad support for Android TV)
  useTVNavigation({
    selector: '[data-tv-focusable]',
    onBack: () => {
      if (activeView === 'movie-details' && selectedMovie) {
        handleMovieBack();
      } else if (activeView === 'series-details' && selectedSeries) {
        handleSeriesBack();
      }
    },
  });

  const handleEpisodeSelect = async (episode: StalkerVOD, resumePosition?: number) => {
    if (!client) return;
    
    try {
      const url = await queryClient.fetchQuery({
        queryKey: ['series', episode.cmd, episode.episode],
        queryFn: async () => {
          const response = await client._makeRequest({
            action: 'create_link',
            cmd: episode.cmd,
            type: 'vod',
            series: String(episode.episode || '1'),
            disable_ad: '0',
            download: '0',
            mac: client.getAccount().mac,
            JsHttpRequest: '1-xml',
          });
          const streamUrl = response?.js?.cmd || response.data?.js?.cmd;
          if (!streamUrl) throw new Error('No stream URL in response');
          return streamUrl.replace(/^ffmpeg\s+/, '');
        },
        staleTime: 0,
      });
      
      if (url?.includes('stream=.')) {
        console.error('❌ Invalid stream URL');
        throw new Error('Invalid stream URL from server');
      }
      
      // Build full episode name: "Gra o Tron - Season 7 - Odcinek 3"
      const seriesName = selectedSeries?.name || '';
      const episodeName = episode.episodeName || episode.name || `Odcinek ${episode.episode}`;
      const fullName = seriesName ? `${seriesName} - ${episodeName}` : episodeName;
      
      seriesPlayer.setMedia({
        url,
        name: fullName,
        channelId: Number.parseInt(String(episode.id)),
        isVod: true,
        movieId: String(episode.id),
        resumePosition: resumePosition || 0
      });
    } catch (error) {
      console.error('❌ Failed to play episode:', error);
      alert('Nie można odtworzyć odcinka.');
    }
  };

  const handleCategorySelect = (category: StalkerGenre) => {
    
    setSelectedCategory(category);
    setSearch(''); // Reset search when changing category

    // Use functional update to get current activeView value
    setActiveView(currentView => {
      
      // Navigate to appropriate view based on current context
      if (currentView === 'movie-categories' || currentView === 'favorite-movie-categories') {
        return 'movies';
      } else if (currentView === 'series-categories' || currentView === 'favorite-series-categories') {
        return 'series';
      } else {
        return 'tv';
      }
    });

  };

  const navigationItems = [
    {
      id: 'portals',
      label: t('managePortals'),
      icon: '🌐',
      active: activeView === 'portals',
      onClick: () => setActiveView('portals'),
    },
    {
      id: 'tv',
      label: t('channels'),
      icon: '📡',
      active: activeView === 'tv' || activeView === 'categories' || activeView === 'favorite-categories' || activeView === 'favorite-channels',
      disabled: !activePortal,
      subItems: [
        {
          id: 'categories',
          label: t('categories'),
          onClick: () => setActiveView('categories'),
        },
        {
          id: 'favorite-categories',
          label: t('favoriteCategories'),
          onClick: () => setActiveView('favorite-categories'),
        },
        {
          id: 'favorite-channels',
          label: t('favoriteChannels'),
          onClick: () => setActiveView('favorite-channels'),
        },
      ],
    },
    {
      id: 'movies',
      label: t('movies'),
      icon: '🎬',
      active: activeView === 'movies' || activeView === 'movie-categories' || activeView === 'favorite-movie-categories' || activeView === 'favorite-movies' || activeView === 'movie-details',
      disabled: !activePortal,
      subItems: [
        {
          id: 'movie-categories',
          label: t('categories'),
          onClick: () => setActiveView('movie-categories'),
        },
        {
          id: 'favorite-movie-categories',
          label: t('favoriteCategories'),
          onClick: () => setActiveView('favorite-movie-categories'),
        },
        {
          id: 'favorite-movies',
          label: t('favorites'),
          onClick: () => setActiveView('favorite-movies'),
        },
      ],
    },
    {
      id: 'series',
      label: t('series'),
      icon: '📺',
      active: activeView === 'series' || activeView === 'series-categories' || activeView === 'favorite-series-categories' || activeView === 'favorite-series' || activeView === 'series-details',
      disabled: !activePortal,
      subItems: [
        {
          id: 'series-categories',
          label: t('categories'),
          onClick: () => setActiveView('series-categories'),
        },
        {
          id: 'favorite-series-categories',
          label: t('favoriteCategories'),
          onClick: () => setActiveView('favorite-series-categories'),
        },
        {
          id: 'favorite-series',
          label: t('favorites'),
          onClick: () => setActiveView('favorite-series'),
        },
      ],
    },
    {
      id: 'settings',
      label: t('settings'),
      icon: '⚙️',
      active: false,
      onClick: () => setIsSettingsOpen(true),
    },
  ];

  const renderActiveView = () => {
    // Show portals page if no active portal
    if (!activePortal || activeView === 'portals') {
      return (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Portals...</div>}>
          <PortalsPage />
        </Suspense>
      );
    }

    switch (activeView) {
      case 'tv':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading TV...</div>}>
            <TVList
              client={client!}
              accountId={activePortal.id}
              search={search}
              selectedCategory={selectedCategory}
              onChannelSelect={handleChannelSelect}
            />
          </Suspense>
        );
      
      case 'categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Categories...</div>}>
            <ChannelCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'favorite-categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Categories...</div>}>
            <FavoriteCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'favorite-channels':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Channels...</div>}>
            <FavoriteChannelsList
              client={client!}
              accountId={activePortal.id}
              search={search}
              onChannelSelect={handleChannelSelect}
            />
          </Suspense>
        );
      
      case 'movies':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Movies...</div>}>
            <MovieList
              client={client!}
              selectedCategory={selectedCategory}
              onMovieSelect={handleMovieSelect}
              search={search}
            />
          </Suspense>
        );
      
      case 'movie-categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Movie Categories...</div>}>
            <MovieCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'favorite-movie-categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Movie Categories...</div>}>
            <FavoriteMovieCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'movie-details':
        return selectedMovie && client ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Movie Details...</div>}>
            <MovieDetails
              movie={selectedMovie}
              client={client}
              onPlay={handleMoviePlay}
              onBack={handleMovieBack}
            />
          </Suspense>
        ) : null;
      
      case 'favorite-movies':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Movies...</div>}>
            <FavoriteMoviesList
              accountId={activePortal.id}
              search={search}
              onMovieSelect={handleMovieSelect}
            />
          </Suspense>
        );
      
      case 'series':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Series...</div>}>
            <SeriesList
              client={client!}
              onSeriesSelect={handleSeriesSelect}
              selectedCategory={selectedCategory}
              search={search}
            />
          </Suspense>
        );
      
      case 'series-details':
        return selectedSeries ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Series Details...</div>}>
            <SeriesDetails
              series={selectedSeries}
              client={client!}
              onPlay={handleEpisodeSelect}
              onBack={handleSeriesBack}
            />
          </Suspense>
        ) : null;
      
      case 'series-categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Series Categories...</div>}>
            <SeriesCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'favorite-series-categories':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Series Categories...</div>}>
            <FavoriteSeriesCategoriesList
              client={client!}
              search={search}
              onCategorySelect={handleCategorySelect}
            />
          </Suspense>
        );
      
      case 'favorite-series':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Favorite Series...</div>}>
            <FavoriteSeriesList
              accountId={activePortal.id}
              search={search}
              onSeriesSelect={handleSeriesSelect}
            />
          </Suspense>
        );
      
      default:
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading Portals...</div>}>
            <PortalsPage />
          </Suspense>
        );
    }
  };

  const getCurrentPlayer = () => {
    switch (activeView) {
      case 'tv':
        return tvPlayer;
      case 'movies':
        return moviePlayer;
      case 'movie-details':
        return moviePlayer;
      case 'series':
      case 'series-details':
        return seriesPlayer;
      default:
        return tvPlayer;
    }
  };

  const currentPlayer = getCurrentPlayer();

  return (
    <div className={`flex h-full ${currentPlayer.current ? 'bg-transparent' : 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'}`}>
      {/* Navigation - hidden when player active */}
      {!currentPlayer.current && (
        <Navigation 
          items={navigationItems}
          accountInfo={activePortal ? {
            name: activePortal.name,
            portalUrl: activePortal.portalUrl,
          } : undefined}
        />
      )}

      {/* Main Content - hidden when player active */}
      {!currentPlayer.current && (
        <div className="flex-1 flex flex-col">
          {/* Search Bar - only show for list views */}
          {activeView !== 'portals' && activeView !== 'movie-details' && activeView !== 'series-details' && activePortal && (
            <div className="p-4 border-b border-slate-700 bg-slate-800 bg-opacity-50 backdrop-blur-sm">
              <input
                type="text"
                placeholder={`${t('search')}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 bg-opacity-50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Active View */}
          {renderActiveView()}
        </div>
      )}

      {/* Player */}
      <Suspense fallback={<div className="fixed inset-0 bg-black z-50 flex items-center justify-center"><div className="text-white">Loading player...</div></div>}>
        {currentPlayer.current && (
          <Player
            url={currentPlayer.current.url}
            name={currentPlayer.current.name}
            channelId={currentPlayer.current.channelId}
            client={client || undefined}
            buffering={currentPlayer.buffering}
            isVod={currentPlayer.current.isVod}
            movieId={currentPlayer.current.movieId}
            resumePosition={currentPlayer.current.resumePosition}
            onClose={currentPlayer.close}
          />
        )}
      </Suspense>

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export const App: React.FC<AppProps> = ({ }) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'iptv-v1' }}
    >
      <AppInner />
    </PersistQueryClientProvider>
  );
};
