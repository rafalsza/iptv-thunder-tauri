// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Tv, WifiOff, Loader2, Film, Clapperboard, MonitorPlay, Search, Heart, Play } from 'lucide-react';
import { StalkerAccount, StalkerChannel, StalkerVOD, StalkerClient } from '@/lib/stalkerAPI_new';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Player } from './Player';
import { useAppStore } from '@/store/app.store';

interface ChannelListProps {
  activeAccount: StalkerAccount;
}

type ContentType = 'tv' | 'movies' | 'series';

export const ChannelList: React.FC<ChannelListProps> = ({ activeAccount }) => {
  const [selectedGenre, setSelectedGenre] = useState<string>('*');
  const [selectedVodGenre, setSelectedVodGenre] = useState<string>('*');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ContentType>('tv');
  const [currentStream, setCurrentStream] = useState<{url: string, name: string} | null>(null);

  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [channelsPage, setChannelsPage] = useState(1);
  const [allChannels, setAllChannels] = useState<StalkerChannel[]>([]);
  const [hasMoreChannels, setHasMoreChannels] = useState(false);

  // Ulubione - używamy globalnego store (zsynchronizowane z TVList i FavoriteChannelsList)
  const { favorites, toggleFavorite, portalFavoriteCategories, toggleFavoriteCategory } = useAppStore();
  
  // Konwertuj favorites na odpowiednie formaty
  const favoriteMovies = useMemo(() => favorites.map(id => parseInt(id)).filter(id => !isNaN(id)), [favorites]);
  const favoriteSeries = favoriteMovies;
  const favoriteChannels = favorites;
  const favoriteGenres = portalFavoriteCategories[activeAccount.id] || [];

  // Funkcje do zarządzania ulubionymi - używają globalnego store
  const toggleFavoriteGenre = useCallback((genreId: string) => {
    toggleFavoriteCategory(activeAccount.id, genreId);
  }, [toggleFavoriteCategory, activeAccount.id]);

  const toggleFavoriteChannel = useCallback((channelId: string) => {
    toggleFavorite(channelId);
  }, [toggleFavorite]);

  const toggleFavoriteMovie = useCallback((movieId: number) => {
    toggleFavorite(String(movieId));
  }, [toggleFavorite]);

  const toggleFavoriteSeries = useCallback((seriesId: number) => {
    toggleFavorite(String(seriesId));
  }, [toggleFavorite]);

  // Stworzenie instancji klienta
  const client = React.useMemo(() => new StalkerClient(activeAccount), [activeAccount]);

  // Pobieranie kategorii
  const { data: genres = [], isLoading: genresLoading } = useQuery({
    queryKey: ['genres', activeAccount.id],
    queryFn: () => client.getGenres(),
    enabled: !!activeAccount.token,
  });

  // Reset channels when genre changes
  useEffect(() => {
    setChannelsPage(1);
    setAllChannels([]);
    setHasMoreChannels(false);
  }, [selectedGenre, activeAccount.id]);

  // Pobieranie kanałów - używamy getAllChannels dla WSZYSTKICH kategorii
  const { data: allChannelsData = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['channels', activeAccount.id, selectedGenre],
    queryFn: () => client.getAllChannels(),
    enabled: !!activeAccount.token && activeTab === 'tv',
    staleTime: 5 * 60 * 1000, // 5 minut
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Pobieranie kategorii VOD
  const { data: vodGenres = [] } = useQuery({
    queryKey: ['vod-genres', activeAccount.id],
    queryFn: () => client.getVODCategories(),
    enabled: !!activeAccount.token,
  });

  // Pobieranie VOD - filmy (pierwsza strona)
  const [moviesPage, setMoviesPage] = useState(1);
  const [hasMoreMovies, setHasMoreMovies] = useState(true);
  const [allMovies, setAllMovies] = useState<StalkerVOD[]>([]);

  const { data: moviesPageData = {items: [], hasMore: false, totalItems: 0}, isLoading: moviesLoading } = useQuery({
    queryKey: ['movies', activeAccount.id, selectedVodGenre, moviesPage],
    queryFn: () => client.getVODListWithPagination(selectedVodGenre === '*' ? '' : selectedVodGenre, moviesPage),
    enabled: !!activeAccount.token && activeTab === 'movies',
    staleTime: 5 * 60 * 1000, // 5 minut
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Pobieranie VOD - seriale (pierwsza strona)
  const [seriesPage, setSeriesPage] = useState(1);
  const [hasMoreSeries, setHasMoreSeries] = useState(true);
  const [allSeries, setAllSeries] = useState<StalkerVOD[]>([]);

  const { data: seriesPageData = {items: [], hasMore: false, totalItems: 0}, isLoading: seriesLoading } = useQuery({
    queryKey: ['series', activeAccount.id, selectedVodGenre, seriesPage],
    queryFn: () => client.getVODListWithPagination(selectedVodGenre === '*' ? '' : selectedVodGenre, seriesPage),
    enabled: !!activeAccount.token && activeTab === 'series',
    staleTime: 5 * 60 * 1000, // 5 minut
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Infinite Scroll refs
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver>(null);

  // Infinite Scroll observer
  useEffect(() => {
    if (!loadMoreTriggerRef.current || activeTab !== 'movies') return;
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMoreMovies && !moviesLoading) {
          setMoviesPage(prev => prev + 1);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '200px', // zaczyna ładować zanim dojdzie do końca
      }
    );
    
    observerRef.current.observe(loadMoreTriggerRef.current);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMoreMovies, moviesLoading, activeTab]);

  // Infinite Scroll for series
  const seriesLoadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const seriesObserverRef = useRef<IntersectionObserver>(null);

  useEffect(() => {
    if (!seriesLoadMoreTriggerRef.current || activeTab !== 'series') return;
    
    seriesObserverRef.current = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMoreSeries && !seriesLoading) {
          setSeriesPage(prev => prev + 1);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '200px',
      }
    );
    
    seriesObserverRef.current.observe(seriesLoadMoreTriggerRef.current);
    
    return () => {
      if (seriesObserverRef.current) {
        seriesObserverRef.current.disconnect();
      }
    };
  }, [hasMoreSeries, seriesLoading, activeTab]);

  // Resetowanie stron przy zmianie kategorii VOD
  useEffect(() => {
    setMoviesPage(1);
    setAllMovies([]);
    setHasMoreMovies(true);
    setSeriesPage(1);
    setAllSeries([]);
    setHasMoreSeries(true);
  }, [selectedVodGenre, activeAccount.id]);

  // Use refs to track items and avoid infinite loops
  const moviesItemsRef = useRef(moviesPageData.items);
  const seriesItemsRef = useRef(seriesPageData.items);
  
  // Update refs when data changes
  useEffect(() => {
    moviesItemsRef.current = moviesPageData.items;
  }, [moviesPageData.items]);
  
  useEffect(() => {
    seriesItemsRef.current = seriesPageData.items;
  }, [seriesPageData.items]);

  // Append new data when page loads - use stable references
  const moviesItemsLength = moviesPageData.items?.length || 0;
  const moviesHasMore = moviesPageData.hasMore || false;
  
  useEffect(() => {
    if (moviesItemsLength > 0) {
      setAllMovies(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newMovies = moviesItemsRef.current.filter(m => !existingIds.has(m.id));
        return [...prev, ...newMovies];
      });
      setHasMoreMovies(moviesHasMore);
    } else if (moviesItemsLength === 0 && moviesPage === 1) {
      // Handle empty response for first page
      setAllMovies([]);
      setHasMoreMovies(false);
    }
  }, [moviesItemsLength, moviesHasMore, moviesPage]);

  const seriesItemsLength = seriesPageData.items?.length || 0;
  const seriesHasMore = seriesPageData.hasMore || false;

  useEffect(() => {
    if (seriesItemsLength > 0) {
      setAllSeries(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const newSeries = seriesItemsRef.current.filter(s => !existingIds.has(s.id));
        return [...prev, ...newSeries];
      });
      setHasMoreSeries(seriesHasMore);
    } else if (seriesItemsLength === 0 && seriesPage === 1) {
      // Handle empty response for first page
      setAllSeries([]);
      setHasMoreSeries(false);
    }
  }, [seriesItemsLength, seriesHasMore, seriesPage]);

  // Resetowanie isLoadingMore po załadowaniu danych
  useEffect(() => {
    if (isLoadingMore && !channelsLoading) {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, channelsLoading]);

  // Odtwarzanie kanału
  const handleChannelClick = async (channel: StalkerChannel) => {
    if (isPlaying) return;

    try {
      setIsPlaying(channel.id);
      const streamUrl = await client.getStreamUrl(channel.cmd);
      
      // Otwórz wbudowany player
      setCurrentStream({ url: streamUrl, name: channel.name });
      
      console.log('Started playing:', channel.name);
    } catch (error) {
      console.error('Error playing channel:', error);
    } finally {
      setIsPlaying(null);
    }
  };

  // Odtwarzanie VOD
  const handleVodClick = async (vod: StalkerVOD) => {
    if (isPlaying) return;

    try {
      setIsPlaying(vod.id.toString());
      const streamUrl = await client.getVODUrl(vod.cmd);
      
      // Otwórz wbudowany player
      setCurrentStream({ url: streamUrl, name: vod.name });
      
      console.log('Started playing VOD:', vod.name);
    } catch (error) {
      console.error('Error playing VOD:', error);
    } finally {
      setIsPlaying(null);
    }
  };

  // Filtrowanie gatunków (kategorii) na podstawie wyszukiwania i ulubionych
  const allGenres = activeTab === 'tv' ? genres : vodGenres;
  const filteredGenres = allGenres.filter(genre => {
    const matchesSearch = genre.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = !showFavoritesOnly || favoriteGenres.includes(genre.id);
    return matchesSearch && matchesFavorites;
  });

  // Filtrowanie kanałów - uwzględnij tryb ulubionych
  const filteredChannels = useMemo(() => {
    // W trybie ulubionych: pokazuj wszystkie ulubione kanały ze wszystkich kategorii
    if (showFavoritesOnly) {
      return allChannelsData.filter(channel => {
        const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isFavoriteChannel = favoriteChannels.includes(channel.id);
        const isInFavoriteGenre = favoriteGenres.includes(channel.tv_genre_id);
        return matchesSearch && (isFavoriteChannel || isInFavoriteGenre);
      });
    }
    // Normalny tryb: filtrowanie według wybranej kategorii
    return allChannelsData.filter(channel => {
      const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGenre = selectedGenre === '*' || channel.tv_genre_id === selectedGenre;
      return matchesSearch && matchesGenre;
    });
  }, [allChannelsData, searchQuery, showFavoritesOnly, selectedGenre, favoriteChannels, favoriteGenres]);
  
  const filteredMovies = useMemo(() => {
    // W trybie ulubionych: pokazuj wszystkie ulubione filmy ze wszystkich kategorii
    if (showFavoritesOnly) {
      return allMovies.filter(m => {
        const matchesSearch = (!m.series || m.series.length === 0) && m.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isFavoriteMovie = favoriteMovies.includes(m.id);
        const isInFavoriteGenre = favoriteGenres.includes(m.category_id || '');
        return matchesSearch && (isFavoriteMovie || isInFavoriteGenre);
      });
    }
    // Normalny tryb: pokazuj filmy z wybranej kategorii
    return allMovies.filter(m => {
      const matchesSearch = (!m.series || m.series.length === 0) && m.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedVodGenre === '*' || m.category_id === selectedVodGenre;
      return matchesSearch && matchesCategory;
    });
  }, [allMovies, searchQuery, showFavoritesOnly, selectedVodGenre, favoriteMovies, favoriteGenres]);
  
  const filteredSeries = useMemo(() => {
    // W trybie ulubionych: pokazuj wszystkie ulubione seriale ze wszystkich kategorii
    if (showFavoritesOnly) {
      return allSeries.filter(s => {
        const matchesSearch = s.series && s.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isFavoriteSeries = favoriteSeries.includes(s.id);
        const isInFavoriteGenre = favoriteGenres.includes(s.category_id || '');
        return matchesSearch && (isFavoriteSeries || isInFavoriteGenre);
      });
    }
    // Normalny tryb: pokazuj seriale z wybranej kategorii
    return allSeries.filter(s => {
      const matchesSearch = s.series && s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedVodGenre === '*' || s.category_id === selectedVodGenre;
      return matchesSearch && matchesCategory;
    });
  }, [allSeries, searchQuery, showFavoritesOnly, selectedVodGenre, favoriteSeries, favoriteGenres]);

  if (genresLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading categories...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar z kategoriami - pokazujemy dla TV, filmy/seriale mają osobne*/}
      <div className="w-72 border-r border-border bg-background overflow-y-auto">
        <div className="p-4 bg-background min-h-full">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Tv className="w-5 h-5" />
            Categories
          </h2>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Szukaj kategorii..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1">
            {filteredGenres.map((genre) => (
              <div key={genre.id} className="flex items-center gap-1">
                <Button
                  variant={
                    (activeTab === 'tv' && selectedGenre === genre.id) ||
                    ((activeTab === 'movies' || activeTab === 'series') && selectedVodGenre === genre.id)
                      ? 'default'
                      : 'ghost'
                  }
                  className="flex-1 justify-start"
                  onClick={() => {
                    if (activeTab === 'tv') {
                      setSelectedGenre(genre.id);
                    } else {
                      setSelectedVodGenre(genre.id);
                    }
                  }}
                >
                  {genre.title}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteGenre(genre.id);
                  }}
                >
                  <Heart className={`w-4 h-4 ${favoriteGenres.includes(genre.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Główna zawartość z zakładkami */}
      <div className="flex-1 overflow-auto">
        <div className="h-full flex flex-col">
          {/* Nagłówek z zakładkami */}
          <div className="px-6 pt-6 pb-2">
            <div className="flex gap-2 max-w-lg">
              <Button
                variant={activeTab === 'tv' ? 'default' : 'outline'}
                className="flex-1 flex items-center gap-2"
                onClick={() => setActiveTab('tv')}
              >
                <MonitorPlay className="w-4 h-4" />
                Kanały TV
              </Button>
              <Button
                variant={activeTab === 'movies' ? 'default' : 'outline'}
                className="flex-1 flex items-center gap-2"
                onClick={() => setActiveTab('movies')}
              >
                <Film className="w-4 h-4" />
                Filmy
              </Button>
              <Button
                variant={activeTab === 'series' ? 'default' : 'outline'}
                className="flex-1 flex items-center gap-2"
                onClick={() => setActiveTab('series')}
              >
                <Clapperboard className="w-4 h-4" />
                Seriale
              </Button>
              <Button
                variant={showFavoritesOnly ? 'default' : 'outline'}
                className="flex items-center gap-2 px-3"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Zawartość - Kanały TV */}
          {activeTab === 'tv' && (
            <div className="flex-1 overflow-auto">
              <div className="p-6">
                <div className="mb-6">
                  <h1 className="text-2xl font-bold">
                    {showFavoritesOnly ? 'Ulubione kanały' : (genres.find(g => g.id === selectedGenre)?.title || 'All Channels')}
                  </h1>
                  <p className="text-muted-foreground">
                    {filteredChannels.length} channels available
                  </p>
                </div>

                {(() => {
                  if (channelsLoading) {
                    return (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="ml-2">Loading channels...</span>
                      </div>
                    );
                  }
                  if (filteredChannels.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <WifiOff className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No channels found</h3>
                        <p className="text-muted-foreground">
                          Try selecting a different category or check your connection.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                      {filteredChannels.map((channel) => (
                        <motion.div
                          key={channel.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="cursor-pointer"
                          onClick={() => handleChannelClick(channel)}
                        >
                          <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                            <div className="aspect-video bg-muted flex items-center justify-center p-2">
                              {channel.logo ? (
                                <img
                                  src={channel.logo}
                                  alt={channel.name}
                                  className="w-full h-full max-w-[120px] max-h-[60px] object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Tv className="w-8 h-8 text-muted-foreground" />
                              )}
                            </div>
                            <CardContent className="p-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium truncate">
                                    {channel.name}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavoriteChannel(channel.id);
                                      }}
                                      className="p-1 hover:bg-muted rounded"
                                    >
                                      <Heart className={`w-3 h-3 ${favoriteChannels.includes(channel.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                                    </button>
                                  </div>
                                </div>
                                {isPlaying === channel.id && (
                                  <div className="flex items-center gap-2 text-green-500">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="text-xs">Playing...</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Zawartość - Filmy */}
        {activeTab === 'movies' && (
          <div className="flex-1 overflow-auto">
            <div className="p-6">
              <div className="mb-6">
                <h1 className="text-2xl font-bold">
                  {showFavoritesOnly
                    ? 'Ulubione filmy'
                    : (vodGenres.find(g => g.id === selectedVodGenre)?.title || 'Wszystkie filmy')}
                </h1>
                <p className="text-muted-foreground">
                  {filteredMovies.length} filmów
                </p>
              </div>

              {moviesLoading && allMovies.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin mr-3" />
                  <span>Ładowanie filmów...</span>
                </div>
              ) : filteredMovies.length === 0 ? (
                <div className="text-center py-12">
                  <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Brak filmów</h3>
                  <p className="text-muted-foreground">Spróbuj wybrać inną kategorię</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                    {filteredMovies.map((movie) => (
                      <motion.div
                        key={movie.id}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        className="cursor-pointer"
                        onClick={() => handleVodClick(movie)}
                      >
                        <Card className="overflow-hidden hover:shadow-xl transition-all">
                          <div className="aspect-[16/9] bg-zinc-800 relative">
                            {movie.logo || movie.poster ? (
                              <>
                                <img
                                  src={movie.logo || movie.poster}
                                  alt={movie.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { 
                                    const img = e.target as HTMLImageElement;
                                    img.style.display = 'none';
                                    const parent = img.parentElement;
                                    if (parent) {
                                      const placeholder = document.createElement('div');
                                      placeholder.className = 'flex items-center justify-center h-full absolute inset-0 bg-zinc-800';
                                      placeholder.innerHTML = '<svg class="w-12 h-12 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4"></path></svg>';
                                      parent.appendChild(placeholder);
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                                  <Play className="w-8 h-8 text-white" />
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <Film className="w-12 h-12 text-zinc-600" />
                              </div>
                            )}
                          </div>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <p className="font-medium line-clamp-2 flex-1">{movie.name}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavoriteMovie(movie.id);
                                }}
                                className="p-1 hover:bg-muted rounded ml-2"
                              >
                                <Heart className={`w-4 h-4 ${favoriteMovies.includes(movie.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                              </button>
                            </div>
                            {movie.time && <p className="text-xs text-muted-foreground mt-1">{movie.time}</p>}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>

                  {/* Infinite Scroll Trigger - POPRAWIONY */}
                  {hasMoreMovies && (
                    <div
                      ref={loadMoreTriggerRef}
                      className="flex justify-center mt-10 py-6"
                    >
                      {moviesLoading && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Ładowanie kolejnych filmów...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!hasMoreMovies && allMovies.length > 0 && (
                    <div className="text-center mt-8 text-muted-foreground">
                      Koniec listy filmów w tej kategorii
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

          {/* Zawartość - Seriale */}
            {activeTab === 'series' && (
              <div className="flex-1 overflow-auto">
                <div className="p-6">
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold">
                      {showFavoritesOnly
                        ? 'Ulubione seriale'
                        : (vodGenres.find(g => g.id === selectedVodGenre)?.title || 'Wszystkie seriale')}
                    </h1>
                    <p className="text-muted-foreground">
                      {filteredSeries.length} seriali
                    </p>
                  </div>

                  {seriesLoading && allSeries.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="w-8 h-8 animate-spin mr-3" />
                      <span>Ładowanie seriali...</span>
                    </div>
                  ) : filteredSeries.length === 0 ? (
                    <div className="text-center py-12">
                      <Clapperboard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">Brak seriali</h3>
                      <p className="text-muted-foreground">Spróbuj wybrać inną kategorię</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6">
                        {filteredSeries.map((seriesItem) => (
                          <motion.div
                            key={seriesItem.id}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.97 }}
                            className="cursor-pointer"
                            onClick={() => handleVodClick(seriesItem)}
                          >
                            <Card className="overflow-hidden hover:shadow-xl transition-all">
                              <div className="aspect-[16/9] bg-zinc-800 relative">
                                {seriesItem.logo || seriesItem.poster ? (
                                  <>
                                    <img
                                      src={seriesItem.logo || seriesItem.poster}
                                      alt={seriesItem.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { 
                                        const img = e.target as HTMLImageElement;
                                        img.style.display = 'none';
                                        const parent = img.parentElement;
                                        if (parent) {
                                          const placeholder = document.createElement('div');
                                          placeholder.className = 'flex items-center justify-center h-full absolute inset-0 bg-zinc-800';
                                          placeholder.innerHTML = '<svg class="w-12 h-12 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4"></path></svg>';
                                          parent.appendChild(placeholder);
                                        }
                                      }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity bg-black/50">
                                      <Play className="w-8 h-8 text-white" />
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center justify-center h-full">
                                    <Clapperboard className="w-12 h-12 text-zinc-600" />
                                  </div>
                                )}
                              </div>
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium line-clamp-2 flex-1">{seriesItem.name}</p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoriteSeries(seriesItem.id);
                                    }}
                                    className="p-1 hover:bg-muted rounded ml-2"
                                  >
                                    <Heart className={`w-4 h-4 ${favoriteSeries.includes(seriesItem.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                                  </button>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>

                      {/* Infinite Scroll Trigger dla Seriali */}
                      {hasMoreSeries && (
                        <div
                          ref={seriesLoadMoreTriggerRef}
                          className="flex justify-center mt-10 py-6"
                        >
                          {seriesLoading && (
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Ładowanie kolejnych seriali...</span>
                            </div>
                          )}
                        </div>
                      )}

                      {!hasMoreSeries && allSeries.length > 0 && (
                        <div className="text-center mt-8 text-muted-foreground">
                          Koniec listy seriali w tej kategorii
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

      {/* Wbudowany player */}
      {currentStream && (
        <Player
          streamUrl={currentStream.url}
          channelName={currentStream.name}
          onClose={() => setCurrentStream(null)}
        />
      )}
    </div>
    </div>
    </div>
  );
};
