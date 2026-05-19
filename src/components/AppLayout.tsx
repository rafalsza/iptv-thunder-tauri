import React, { Suspense, useEffect, useState, useMemo } from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { TitleBar } from '@/components/ui/TitleBar';
import { Navigation } from '@/components/ui/Navigation';
import { Settings } from '@/features/settings/Settings';
import { Player } from '@/features/player/Player';
import { platform } from '@tauri-apps/plugin-os';
import { useAppStore } from '@/store/app.store';
import { useTranslation } from '@/hooks/useTranslation';
import { PortalAccount } from '@/features/portals/portals.types';
import { StalkerChannel } from '@/types';
import type { PlaybackState } from '@/store/playback.store';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  subItems?: Array<{
    id: string;
    label: string;
    onClick: () => void;
    active: boolean;
  }>;
}

interface AppLayoutProps {
  activeView: string;
  activePortal: PortalAccount | null;
  client: StalkerClient | null;
  search: string;
  isSettingsOpen: boolean;
  isFullscreen: boolean;
  player: PlaybackState;
  closePlayer: () => void;
  navigationItems: NavigationItem[];
  children: React.ReactNode;
  setIsSettingsOpen: (open: boolean) => void;
  setSearch: (search: string) => void;
  handleEpisodeEnded: () => void;
  handleChannelSelect: (channel: StalkerChannel) => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeView,
  activePortal,
  client,
  search,
  isSettingsOpen,
  isFullscreen,
  player,
  closePlayer,
  navigationItems,
  children,
  setIsSettingsOpen,
  setSearch,
  handleEpisodeEnded,
  handleChannelSelect,
}) => {
  const [currentPlatform, setCurrentPlatform] = useState<string>('desktop');
  const isPip = useAppStore(state => state.isPip);
  const { t } = useTranslation();

  // Detect platform using OS plugin
  useEffect(() => {
    const detectPlatform = () => {
      try {
        const osPlatform = platform(); // 'android' | 'ios' | 'windows' | 'macOS' | 'linux'
        setCurrentPlatform(osPlatform);
      } catch (error) {
        // Plugin not available - assume desktop
        console.warn('[AppLayout] Platform detection failed, assuming desktop:', error);
        setCurrentPlatform('desktop');
      }
    };
    detectPlatform();
  }, []);

  const isMobile = currentPlatform === 'android' || currentPlatform === 'ios';

  // Show keyboard when input is focused on Android TV
  const showKeyboard = () => {
    if ((globalThis as any).AndroidTV?.showKeyboard) {
      (globalThis as any).AndroidTV.showKeyboard();
    }
  };

  // Extract complex className logic
  const containerClassName = useMemo(() => {
    const baseClasses = 'flex flex-col h-full min-h-screen';
    if (player.current) {
      return `${baseClasses} bg-transparent`;
    }
    return `${baseClasses} dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 bg-gradient-to-br from-white via-gray-100 to-white`;
  }, [player.current]);

  return (
    <div className={containerClassName}>
      {/* Custom TitleBar - hidden on mobile (Android/iOS), when fullscreen, or when PiP is active */}
      {!isFullscreen && !isMobile && !isPip && <TitleBar />}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation - hidden when player active */}
        {!player.current && (
          <Navigation
            items={navigationItems}
          />
        )}

        {/* Main Content - hidden when player active */}
        {!player.current && (
          <div id="main" data-tv-container="main" className="flex-1 flex flex-col min-w-0 overflow-x-hidden overflow-y-auto">
            {/* Search Bar - only show for list views */}
            {activeView !== 'portals' && activeView !== 'movie-details' && activeView !== 'series-details' && activePortal && (
              <div className="px-4 pt-4 pb-0">
                <input
                  type="text"
                  placeholder={t('search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={showKeyboard}
                  data-tv-focusable
                  data-tv-search
                  tabIndex={0}
                  className="w-full px-4 py-3 dark:bg-slate-800/50 bg-gray-200/50 dark:bg-opacity-50 bg-opacity-50 rounded-lg dark:text-white text-slate-900 dark:placeholder-slate-400 placeholder-slate-500 backdrop-blur-sm shadow-sm transition-all duration-200"
                />
              </div>
            )}

            {/* Active View */}
            {children}
          </div>
        )}

        {/* Player */}
        <Suspense fallback={<div className="fixed inset-0 bg-black z-50 flex items-center justify-center"><div className="text-white">Loading player...</div></div>}>
          {player.current && (
            <Player
              url={player.current.url}
              name={player.current.name}
              channelId={player.current.channelId}
              client={client ?? undefined}
              buffering={player.buffering}
              isVod={player.current.isVod}
              movieId={player.current.movieId}
              resumePosition={player.current.resumePosition}
              genreId={player.current.genreId}
              onChannelChange={handleChannelSelect}
              onClose={closePlayer}
              onEnded={handleEpisodeEnded}
            />
          )}
        </Suspense>
      </div>

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
