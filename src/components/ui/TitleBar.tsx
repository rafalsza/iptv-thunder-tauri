// =========================
// 🪟 CUSTOM TITLEBAR COMPONENT
// =========================
import React, { useState, useEffect } from 'react';
import { Minus, X, Maximize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    checkMaximized();
  }, []);

  const checkMaximized = async () => {
    try {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    } catch (error) {
      console.error('Failed to check maximized state:', error);
    }
  };

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      setIsMaximized(!isMaximized);
    } catch (error) {
      console.error('Failed to toggle maximize:', error);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <motion.div
      data-tauri-drag-region
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-10 dark:bg-slate-900/90 bg-white/90 backdrop-blur-xl border-b dark:border-slate-700/50 border-gray-200/50 flex items-center justify-between px-4 select-none"
      style={{ webkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Window Title */}
      <div className="flex items-center gap-2">
        <motion.img
          src="/logo.svg"
          alt="IPTV Thunder"
          className="h-6 w-auto"
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.2 }}
        />
        <span className="text-sm font-medium dark:text-white text-slate-900 opacity-80">IPTV Thunder</span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center gap-1" style={{ webkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <motion.button
          onClick={handleMinimize}
          whileHover={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
          whileTap={{ scale: 0.9 }}
          className="p-2 rounded-lg dark:hover:bg-green-500/10 hover:bg-green-500/10 dark:text-slate-400 text-slate-600 dark:hover:text-green-400 hover:text-green-400 transition-all duration-200"
        >
          <Minus className="w-4 h-4" />
        </motion.button>

        <motion.button
          onClick={handleMaximize}
          whileHover={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
          whileTap={{ scale: 0.9 }}
          className="p-2 rounded-lg dark:hover:bg-green-500/10 hover:bg-green-500/10 dark:text-slate-400 text-slate-600 dark:hover:text-green-400 hover:text-green-400 transition-all duration-200"
        >
          {isMaximized ? (
            <div className="w-4 h-4 border-2 dark:border-green-400 border-green-500 rounded-sm" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </motion.button>

        <motion.button
          onClick={handleClose}
          whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
          whileTap={{ scale: 0.9 }}
          className="p-2 rounded-lg dark:hover:bg-red-500/10 hover:bg-red-500/10 dark:text-slate-400 text-slate-600 dark:hover:text-red-400 hover:text-red-400 transition-all duration-200"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  );
};
