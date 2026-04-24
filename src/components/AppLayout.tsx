import React, { Suspense, useEffect, useState } from 'react';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { TitleBar } from '@/components/ui/TitleBar';
import { Navigation } from '@/components/ui/Navigation';
import { Settings } from '@/features/settings/Settings';
import { Player } from '@/features/player/Player';
import { platform } from '@tauri-apps/plugin-os';

interface AppLayoutProps {
  activeView: string;
  activePortal: any;
  client: StalkerClient | null;
  search: string;
  isSettingsOpen: boolean;
  isFullscreen: boolean;
  player: any;
  closePlayer: () => void;
  navigationItems: any[];
  children: React.ReactNode;
  setIsSettingsOpen: (open: boolean) => void;
  setSearch: (search: string) => void;
  handleEpisodeEnded: () => void;
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
}) => {
  const [currentPlatform, setCurrentPlatform] = useState<string>('desktop');

  // Detect platform using OS plugin
  useEffect(() => {
    const detectPlatform = () => {
      try {
        const osPlatform = platform(); // 'android' | 'ios' | 'windows' | 'macOS' | 'linux'
        setCurrentPlatform(osPlatform);
      } catch {
        // Plugin not available - assume desktop
        setCurrentPlatform('desktop');
      }
    };
    detectPlatform();
  }, []);

  const isMobile = currentPlatform === 'android' || currentPlatform === 'ios';

  return (
    <div className={`flex flex-col h-full ${player.current ? 'bg-transparent' : 'dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 bg-gradient-to-br from-white via-gray-100 to-white'}`}>
      {/* Custom TitleBar - hidden on mobile (Android/iOS) and when fullscreen */}
      {!isFullscreen && !isMobile && <TitleBar />}

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
          <div id="main" data-tv-container="main" className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {/* Search Bar - only show for list views */}
            {activeView !== 'portals' && activeView !== 'movie-details' && activeView !== 'series-details' && activePortal && (
              <div className="p-4 dark:border-b border-slate-700/50 border-b-gray-300/50">
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-tv-focusable
                  data-tv-search
                  tabIndex={0}
                  className="w-full px-4 py-3 dark:bg-slate-800/50 bg-gray-200/50 dark:bg-opacity-50 bg-opacity-50 dark:border border-slate-600/50 border-gray-300/50 rounded-lg dark:text-white text-slate-900 dark:placeholder-slate-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-green-700 backdrop-blur-sm shadow-sm transition-all duration-200"
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
              client={client || undefined}
              buffering={player.buffering}
              isVod={player.current.isVod}
              movieId={player.current.movieId}
              resumePosition={player.current.resumePosition}
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
