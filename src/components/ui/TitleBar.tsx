// =========================
// 🎨 CUSTOM TITLE BAR
// =========================
import React, { useState } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow();
      if (isMaximized) {
        await window.unmaximize();
        setIsMaximized(false);
      } else {
        await window.maximize();
        setIsMaximized(true);
      }
    } catch (error) {
      console.error('Failed to toggle maximize:', error);
    }
  };

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between px-4 py-2 dark:bg-slate-900/80 bg-white/80 backdrop-blur-md border-b dark:border-slate-700/30 border-gray-200/30 select-none relative z-60"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="IPTV Thunder" className="h-6 w-auto" />
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-10 h-8 flex items-center justify-center rounded hover:bg-slate-700/30 dark:hover:bg-slate-700/50 transition-colors group"
          title="Minimalizuj"
        >
          <Minimize2 className="w-4 h-4 dark:text-slate-400 text-slate-600 group-hover:dark:text-white group-hover:text-slate-900 transition-colors" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-8 flex items-center justify-center rounded hover:bg-slate-700/30 dark:hover:bg-slate-700/50 transition-colors group"
          title={isMaximized ? "Przywróć" : "Maksymalizuj"}
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4 dark:text-slate-400 text-slate-600 group-hover:dark:text-white group-hover:text-slate-900 transition-colors" />
          ) : (
            <Maximize2 className="w-4 h-4 dark:text-slate-400 text-slate-600 group-hover:dark:text-white group-hover:text-slate-900 transition-colors" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-8 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors group"
          title="Zamknij"
        >
          <X className="w-4 h-4 dark:text-slate-400 text-slate-600 group-hover:dark:text-red-400 group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  );
};
