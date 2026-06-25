import { useState, useRef, useCallback, useEffect } from 'react';
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
export const getRouteType = (route: Route): Route['type'] => route.type;

// Check if route matches a specific type
export const isRouteType = (route: Route, type: Route['type']): boolean => route.type === type;

// Navbar routes (top-level navigation items)
const NAVBAR_ROUTES = new Set<Route['type']>(['portals', 'for-you', 'tv', 'movies', 'series']);
const isNavbarRoute = (type: Route['type']): boolean => NAVBAR_ROUTES.has(type);

// =========================
// 🎮 ROUTER HOOK
// =========================

export const useTypedRouter = () => {
  const [route, setRoute] = useState<Route>({ type: 'portals' });
  const [selectedCategory, setSelectedCategory] = useState<StalkerGenre | null>(null);

  // Track previous route for back navigation
  const previousRouteRef = useRef<Route>({ type: 'portals' });

  // Navigate to a simple route
  const navigate = useCallback((newRoute: SimpleRoute) => {
    setRoute(currentRoute => {
      previousRouteRef.current = currentRoute;
      return newRoute;
    });
  }, []);

  // Navigate to movie details (with data)
  const navigateToMovie = useCallback((movie: StalkerVOD) => {
    setRoute(currentRoute => {
      previousRouteRef.current = currentRoute;
      return { type: 'movie-details', movie };
    });
  }, []);

  // Navigate to series details (with data)
  const navigateToSeries = useCallback((series: StalkerVOD) => {
    setRoute(currentRoute => {
      previousRouteRef.current = currentRoute;
      return { type: 'series-details', series };
    });
  }, []);

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
  }, []);

  // Focus management - save/restore focus on route changes
  const lastFocusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const currentRouteType = route.type;
    const previousRouteType = previousRouteRef.current.type;

    if (previousRouteType && currentRouteType !== previousRouteType) {
      // Save focus for previous route
      const focusedElement = document.activeElement as HTMLElement;
      const focusedGroup = focusedElement?.dataset.tvGroup;

      // Don't save navbar element as focus for main content routes
      const isPreviousNavbarRoute = isNavbarRoute(previousRouteType);
      const isNavbarElement = focusedGroup === 'navbar';

      // Only save focus if:
      // 1. Previous route is NOT a navbar route, OR
      // 2. The focused element is NOT a navbar element
      // 3. Current route is NOT a navbar route (don't save navbar focus when going to main content)
      const isCurrentNavbarRoute = isNavbarRoute(currentRouteType);

      if ((!isPreviousNavbarRoute || !isNavbarElement) && !isCurrentNavbarRoute && focusedElement?.dataset.tvFocusable) {
        lastFocusRef.current[previousRouteType] = focusedElement.id || focusedElement.dataset.tvId || '';
      }

      // Restore focus for current route
      const savedFocusId = lastFocusRef.current[currentRouteType];
      const currentIsNavbarRoute = isNavbarRoute(currentRouteType);

      if (savedFocusId) {
        requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const savedElement = document.getElementById(savedFocusId) || document.querySelector(`[data-tv-id="${savedFocusId}"]`);
          const isSubmenuItem = savedElement?.dataset?.tvGroup &&
                               savedElement.dataset.tvGroup !== 'navbar' &&
                               savedElement.dataset.tvGroup !== 'portals-content';
          const isSavedNavbarElement = savedElement?.dataset?.tvGroup === 'navbar';

          if (currentIsNavbarRoute && isSubmenuItem) {
            const navbarElement = document.querySelector(`[data-tv-id="${currentRouteType}"]`) as HTMLElement;
            if (navbarElement) {
              navbarElement.focus();
            }
            return;
          }

          if (!currentIsNavbarRoute && (isSavedNavbarElement || isSubmenuItem)) {
            return;
          }

          if (savedElement && 'focus' in savedElement) {
            savedElement.focus();
          }
        });
        });
      } else if (currentIsNavbarRoute) {
        requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Don't focus if user already has focus in sidebar
          const activeElement = document.activeElement as HTMLElement;
          const isInSidebar = activeElement?.closest('[data-tv-container="navigation"]') !== null;
          if (isInSidebar) {
            return;
          }
          const navbarElement = document.querySelector(`[data-tv-id="${currentRouteType}"]`) as HTMLElement;
          if (navbarElement) {
            navbarElement.focus();
          }
        });
        });
      }
    }
  }, [route]);

  // Handle category selection with context-aware navigation
  const navigateToCategory = useCallback((category: StalkerGenre) => {
    setRoute(currentRoute => {
      switch (currentRoute.type) {
        case 'movie-categories':
        case 'favorite-movie-categories':
          previousRouteRef.current = currentRoute;
          setSelectedCategory(category);
          return { type: 'movies' };
        case 'series-categories':
        case 'favorite-series-categories':
          previousRouteRef.current = currentRoute;
          setSelectedCategory(category);
          return { type: 'series' };
        case 'categories':
        case 'favorite-categories':
          previousRouteRef.current = currentRoute;
          setSelectedCategory(category);
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
