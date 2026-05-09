import { useState, useRef, useCallback } from 'react';
import { StalkerGenre, StalkerVOD } from '@/types';

// =========================
// 🎯 TYPED ROUTER - Discriminated Union Pattern
// =========================

// Base routes without parameters
type SimpleRoute =
  | { type: 'portals' }
  | { type: 'for-you' }
  | { type: 'tv' }
  | { type: 'movies' }
  | { type: 'series' }
  | { type: 'categories' }
  | { type: 'favorite-categories' }
  | { type: 'favorite-channels' }
  | { type: 'movie-categories' }
  | { type: 'favorite-movie-categories' }
  | { type: 'favorite-movies' }
  | { type: 'series-categories' }
  | { type: 'favorite-series-categories' }
  | { type: 'favorite-series' };

// Routes with parameters
type ParamRoute =
  | { type: 'movie-details'; movie: StalkerVOD }
  | { type: 'series-details'; series: StalkerVOD };

// All routes combined
export type Route = SimpleRoute | ParamRoute;

// Type guards
export const isMovieDetails = (route: Route): route is { type: 'movie-details'; movie: StalkerVOD } =>
  route.type === 'movie-details';

export const isSeriesDetails = (route: Route): route is { type: 'series-details'; series: StalkerVOD } =>
  route.type === 'series-details';

// Get simple route type string (for comparisons)
export const getRouteType = (route: Route): string => route.type;

// Check if route matches a specific type
export const isRouteType = (route: Route, type: Route['type']): boolean => route.type === type;

// =========================
// 🎮 ROUTER HOOK
// =========================

export const useTypedRouter = () => {
  const [route, setRoute] = useState<Route>({ type: 'portals' });
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);

  // Track previous route for back navigation
  const previousRouteRef = useRef<Route>({ type: 'movies' });

  // Navigate to a simple route
  const navigate = useCallback((newRoute: SimpleRoute) => {
    setRoute(currentRoute => {
      previousRouteRef.current = currentRoute;
      return newRoute;
    });
  }, []);

  // Navigate to movie details (with data)
  const navigateToMovie = useCallback((movie: StalkerVOD) => {
    previousRouteRef.current = route;
    setRoute({ type: 'movie-details', movie });
  }, [route]);

  // Navigate to series details (with data)
  const navigateToSeries = useCallback((series: StalkerVOD) => {
    previousRouteRef.current = route;
    setRoute({ type: 'series-details', series });
  }, [route]);

  // Go back from details view
  const goBack = useCallback(() => {
    const targetRoute = previousRouteRef.current;
    // Clear selected category when going back to category views
    if (targetRoute.type === 'movie-categories' ||
        targetRoute.type === 'favorite-movie-categories' ||
        targetRoute.type === 'series-categories' ||
        targetRoute.type === 'favorite-series-categories' ||
        targetRoute.type === 'categories' ||
        targetRoute.type === 'favorite-categories') {
      setSelectedCategory(null);
    }
    setRoute(targetRoute);
  }, [route]);

  // Handle category selection with context-aware navigation
  const navigateToCategory = useCallback((category: StalkerGenre) => {
    setSelectedCategory(category);

    setRoute(currentRoute => {
      previousRouteRef.current = currentRoute;
      switch (currentRoute.type) {
        case 'movie-categories':
        case 'favorite-movie-categories':
          previousRouteRef.current = currentRoute;
          return { type: 'movies' };
        case 'series-categories':
        case 'favorite-series-categories':
          previousRouteRef.current = currentRoute;
          return { type: 'series' };
        case 'categories':
        case 'favorite-categories':
          previousRouteRef.current = currentRoute;
          return { type: 'tv' };
        case 'movies':
        case 'series':
        case 'tv':
        case 'portals':
        case 'for-you':
        case 'favorite-channels':
        case 'favorite-movies':
        case 'favorite-series':
        case 'movie-details':
        case 'series-details':
          // Already in the correct content view or not applicable
          return currentRoute;
      }
    });
  }, []);

  // Derived values for backwards compatibility
  const selectedMovie = isMovieDetails(route) ? route.movie : null;
  const selectedSeries = isSeriesDetails(route) ? route.series : null;

  return {
    // Core routing
    route,
    setRoute,
    navigate,

    // Typed navigation helpers
    navigateToMovie,
    navigateToSeries,
    navigateToCategory,
    goBack,

    // Data
    selectedCategory,
    setSelectedCategory,
    selectedMovie,
    selectedSeries,

    // For components still using string-based checks
    activeView: route.type,
  };
};

// Type export for external usage
export type { SimpleRoute, ParamRoute };
