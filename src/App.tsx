// =========================
// 🧠 COMPLETE APP WITH ALL FEATURES
// =========================
import React, { useRef, useEffect, useMemo } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { usePortalsStore } from '@/store/portals.store';
import { useAppStore } from '@/store/app.store';
import { useTVNavigation } from '@/hooks';
import { ToastProvider } from '@/components/ui/Toast';
import { useTypedRouter, isMovieDetails, isSeriesDetails } from '@/hooks/useTypedRouter';
import { usePlaybackManager } from '@/hooks/usePlaybackManager';
import { useNavigationMenu } from '@/hooks/useNavigationMenu';
import { AppLayout } from '@/components/AppLayout';
import { AppContent } from '@/components/AppContent';

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

interface AppProps {
  // Remove activeAccount prop - we'll get it from store
}

function AppInner({ }: AppProps) {
  const [search, setSearch] = React.useState('');
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const activePortal = usePortalsStore(s =>
    s.portals.find(p => p.id === s.activePortalId) ?? null
  );

  const isFullscreen = useAppStore(s => s.isFullscreen);

  // Hide system titlebar on startup (only in Tauri environment)
  useEffect(() => {
    const hideDecorations = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        await window.setDecorations(false);
      } catch (err) {
        // Not running in Tauri environment or API not available
        console.debug('Not hiding decorations (not in Tauri):', err);
      }
    };
    hideDecorations();
  }, []);

  // Routing logic
  const {
    route,
    navigate,
    navigateToMovie,
    navigateToSeries,
    navigateToCategory,
    goBack,
    selectedCategory,
    selectedMovie,
    selectedSeries,
    activeView,
  } = useTypedRouter();

  // Track last focused element per route for Smart TV navigation
  const lastFocusRef = useRef<Record<string, string>>({});
  const previousRouteRef = useRef<string>('');

  // Save current focus when route changes
  useEffect(() => {
    const currentRouteType = route.type;
    const previousRouteType = previousRouteRef.current;

    if (previousRouteType && currentRouteType !== previousRouteType) {
      // Save the current focused element for the previous route
      const focusedElement = document.activeElement as HTMLElement;
      if (focusedElement?.dataset.tvFocusable) {
        lastFocusRef.current[previousRouteType] = focusedElement.id || focusedElement.dataset.tvId || '';
      }

      // Restore focus for the current route if we have a saved element
      const savedFocusId = lastFocusRef.current[currentRouteType];
      if (savedFocusId) {
        setTimeout(() => {
          const savedElement = document.getElementById(savedFocusId) || document.querySelector(`[data-tv-id="${savedFocusId}"]`);
          if (savedElement && 'focus' in savedElement) {
            savedElement.focus();
          }
        }, 50);
      }
    }

    previousRouteRef.current = currentRouteType;
  }, [route.type]);

  // Create client only when we have an active portal (memoized to avoid recreation on every render)
  const client = useMemo(() => 
    activePortal ? new StalkerClient(activePortal as any) : null,
    [activePortal]
  );

  // Playback manager
  const {
    player,
    handleChannelSelect,
    handleMoviePlay,
    handleEpisodeSelect,
    handleEpisodeEnded,
    close: closePlayer,
  } = usePlaybackManager({
    client,
    activePortal,
    selectedSeries,
    queryClient,
  });

  // Navigation menu
  const navigationItems = useNavigationMenu({
    activeView,
    activePortal,
    navigate,
    setIsSettingsOpen,
  });

  // TV Navigation (D-pad support for Android TV)
  useTVNavigation({
    selector: '[data-tv-focusable]',
    onBack: () => {
      if ((isMovieDetails(route) && selectedMovie) || (isSeriesDetails(route) && selectedSeries)) {
        goBack();
      }
    },
    onEnter: (_element) => {
      // Element click is handled by the hook, this is for additional logic if needed
    },
  });

  // Set active container based on current view
  // Note: We don't set active container for main layout to allow free navigation
  // between sidebar and main content. Container system is only for modals/popups.
  const wasSettingsOpenRef = useRef(false);
  useEffect(() => {
    // Restore focus when Settings closes (but not on initial load)
    if (!isSettingsOpen && wasSettingsOpenRef.current) {
      wasSettingsOpenRef.current = false;
      setTimeout(() => {
        (document.activeElement as HTMLElement)?.blur();
        setTimeout(() => {
          const settingsButton = document.querySelector('[data-tv-index="40"]') as HTMLElement;
          if (settingsButton) {
            settingsButton.focus();
          }
        }, 50);
      }, 50);
    } else if (isSettingsOpen) {
      wasSettingsOpenRef.current = true;
    }
  }, [isSettingsOpen]);

  return (
    <AppLayout
      activeView={activeView}
      activePortal={activePortal}
      client={client}
      search={search}
      isSettingsOpen={isSettingsOpen}
      isFullscreen={isFullscreen}
      player={player}
      closePlayer={closePlayer}
      navigationItems={navigationItems}
      setIsSettingsOpen={setIsSettingsOpen}
      setSearch={setSearch}
      handleEpisodeEnded={handleEpisodeEnded}
    >
      <AppContent
        route={route}
        activePortal={activePortal}
        client={client}
        search={search}
        selectedCategory={selectedCategory}
        handleChannelSelect={handleChannelSelect}
        navigateToMovie={navigateToMovie}
        navigateToSeries={navigateToSeries}
        navigateToCategory={navigateToCategory}
        goBack={goBack}
        handleMoviePlay={handleMoviePlay}
        handleEpisodeSelect={handleEpisodeSelect}
      />
    </AppLayout>
  );
}

export const App: React.FC<AppProps> = ({ }) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'iptv-v1' }}
    >
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </PersistQueryClientProvider>
  );
};
