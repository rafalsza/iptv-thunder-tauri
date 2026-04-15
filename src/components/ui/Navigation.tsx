// =========================
// 🧭 NAVIGATION COMPONENT
// =========================
import React, { useState } from 'react';
import { ChevronDown, Power } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { exit } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

export type NavigationItem = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  subItems?: Array<{
    id: string;
    label: string;
    onClick: () => void;
  }>;
};

interface NavigationProps {
  items: NavigationItem[];
}

export const Navigation: React.FC<NavigationProps> = ({ items }) => {
  const { t } = useTranslation();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggleSubmenu = (itemId: string) => {
    setExpandedItem(expandedItem === itemId ? null : itemId);
  };

  const handleCloseApp = async () => {
    try {
      // Try desktop exit first
      await exit(0);
    } catch {
      try {
        // Try Android exit via invoke
        await invoke('exit_app');
      } catch {
        // Final fallback
        window.close();
      }
    }
  };

  return (
    <div
      id="navigation"
      data-tv-container="navigation"
      className="flex flex-col h-full w-56 dark:bg-slate-900/40 bg-white/40 backdrop-blur-md border-r dark:border-slate-700/30 border-gray-200/30"
    >
      {/* Header */}
      <div className="p-6 border-b dark:border-slate-700/30 border-gray-200/30">
        <div className="flex items-center justify-center">
          <img src="/logo.svg" alt="IPTV Thunder" className="h-10 w-auto max-w-full" />
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
        {items.map((item, index) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedItem === item.id;
          const baseIndex = index * 10;

          return (
            <div key={item.id} className="relative group">
              <motion.button
                data-tv-focusable
                data-tv-index={baseIndex}
                data-tv-group="navbar"
                data-tv-initial={item.id === items[0]?.id}
                data-tv-active={item.active || undefined}
                tabIndex={0}
                onClick={() => {
                  if (hasSubItems) {
                    toggleSubmenu(item.id);
                  } else if (item.onClick) {
                    item.onClick();
                  }
                }}
                disabled={item.disabled}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full text-left px-4 py-4 rounded-2xl flex items-center gap-4 transition-all duration-200 relative overflow-hidden group ${
                  item.active && !hasSubItems
                    ? 'bg-green-700/90 text-white'
                    : item.disabled
                    ? 'dark:bg-slate-700/20 bg-gray-200/30 dark:text-slate-500 text-slate-500 cursor-not-allowed'
                    : 'dark:bg-slate-800/30 bg-gray-100/30 dark:text-slate-300 text-slate-600 dark:hover:bg-slate-700/50 hover:bg-gray-200/50 hover:text-white'
                }`}
              >
                {/* Active state gradient overlay */}
                {item.active && !hasSubItems && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-10"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  />
                )}
                
                <span className={`text-xl relative z-10 flex-shrink-0 ${item.active && !hasSubItems ? 'animate-pulse' : ''}`}>
                  {item.icon}
                </span>
                
                <span className="font-medium relative z-10 flex-1 dark:text-white text-slate-900">
                  {item.label}
                </span>
                
                {hasSubItems && (
                  <motion.div
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: isExpanded ? 180 : 0 }}
                    exit={{ opacity: 0, rotate: -90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-4 h-4 relative z-10 dark:text-white text-slate-900" />
                  </motion.div>
                )}
                
                {item.disabled && (
                  <span className="ml-auto text-xs dark:bg-slate-600 bg-gray-400 px-2 py-1 rounded-full">
                    🔒
                  </span>
                )}
                
                {/* Active indicator */}
                {item.active && !hasSubItems && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
              </motion.button>


              {/* Submenu */}
              <AnimatePresence>
                {hasSubItems && isExpanded && item.subItems && (
                  <motion.div
                    data-tv-group={item.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-6 ml-5 space-y-3 overflow-visible p-2"
                  >
                    {item.subItems.map((subItem, subIndex) => (
                      <motion.button
                        key={subItem.id}
                        data-tv-focusable
                        data-tv-index={baseIndex + subIndex + 1}
                        data-tv-initial={subIndex === 0}
                        tabIndex={0}
                        onClick={subItem.onClick}
                        whileHover={{ scale: 1.02, x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full text-left px-5 py-4 rounded-xl flex items-center gap-3 transition-all duration-200 text-sm dark:bg-slate-800/20 bg-gray-100/20 dark:text-slate-300 text-slate-600 dark:hover:bg-slate-700/40 hover:bg-gray-200/40 hover:text-white"
                      >
                        <span className="text-sm dark:text-white text-slate-900">▸</span>
                        <span className="dark:text-white text-slate-900">{subItem.label}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t dark:border-slate-700/30 border-gray-200/30 space-y-4">
        {/* Close App Button - subtle style */}
        <motion.button
          data-tv-focusable
          data-tv-index={60}
          tabIndex={0}
          onClick={handleCloseApp}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full px-5 py-3 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 dark:bg-slate-800/30 bg-gray-100/30 dark:text-slate-400 text-slate-600 dark:hover:bg-red-500/10 hover:bg-red-500/10 dark:hover:text-red-400 hover:text-red-400"
        >
          <Power className="w-4 h-4" />
          <span className="text-sm font-medium dark:text-white text-slate-900">{t('exit') || 'Wyjdź'}</span>
        </motion.button>

        <div className="text-center py-3">
          <p className="text-xs dark:text-slate-500 text-slate-400">v1.0.0</p>
        </div>
      </div>
    </div>
  );
};
