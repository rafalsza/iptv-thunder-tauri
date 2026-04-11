// =========================
// 🧭 NAVIGATION COMPONENT
// =========================
import React, { useState } from 'react';
import { ChevronDown, Power } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { exit } from '@tauri-apps/plugin-process';

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
      // Use Tauri exit to close entire application
      await exit(0);
    } catch (error) {
      console.error('Failed to exit app:', error);
      // Fallback for web/browser mode
      window.close();
    }
  };

  return (
    <div className="w-64 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b dark:border-slate-700 border-gray-300">
        <div className="flex items-center justify-center mb-4">
          <img src="/logo.svg" alt="IPTV Thunder" className="h-10 w-auto max-w-full" />
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {items.map((item) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedItem === item.id;

          return (
            <div key={item.id}>
              <button
                data-tv-focusable
                tabIndex={0}
                onClick={() => {
                  if (hasSubItems) {
                    toggleSubmenu(item.id);
                  } else if (item.onClick) {
                    item.onClick();
                  }
                }}
                disabled={item.disabled}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 relative overflow-hidden group ${
                  item.active && !hasSubItems
                    ? 'bg-gradient-to-r from-green-700 to-green-800 text-white shadow-lg shadow-green-500/25'
                    : item.disabled
                    ? 'dark:bg-slate-700 dark:bg-opacity-30 bg-gray-200 dark:text-slate-500 text-slate-500 cursor-not-allowed'
                    : 'dark:bg-slate-700 dark:bg-opacity-50 bg-gray-200 dark:text-slate-300 text-slate-600 dark:hover:bg-slate-600 hover:bg-gray-300 hover:text-white hover:shadow-md hover:translate-x-1'
                }`}
              >
                {/* Active state gradient overlay */}
                {item.active && !hasSubItems && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-10 animate-pulse"></div>
                )}
                
                {/* Hover effect background */}
                {!item.disabled && !item.active && (
                  <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-green-700 opacity-0 group-hover:opacity-10 transition-opacity duration-200"></div>
                )}
                
                <span className={`text-xl relative z-10 ${item.active && !hasSubItems ? 'animate-pulse' : ''}`}>
                  {item.icon}
                </span>
                <span className="font-medium relative z-10 flex-1 dark:text-white text-slate-900">{item.label}</span>
                
                {/* Dropdown arrow for items with sub-items */}
                {hasSubItems && (
                  <ChevronDown 
                    className={`w-4 h-4 relative z-10 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
                
                {/* Disabled indicator */}
                {item.disabled && (
                  <span className="ml-auto text-xs dark:bg-slate-600 bg-gray-400 px-2 py-1 rounded-full">🔒</span>
                )}
                
                {/* Active indicator */}
                {item.active && !hasSubItems && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full animate-pulse"></div>
                )}
              </button>

              {/* Submenu */}
              {hasSubItems && isExpanded && item.subItems && (
                <div className="mt-1 ml-4 space-y-1">
                  {item.subItems.map((subItem) => (
                    <button
                      data-tv-focusable
                      tabIndex={0}
                      key={subItem.id}
                      onClick={subItem.onClick}
                      className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 text-sm dark:bg-slate-700 dark:bg-opacity-30 bg-gray-200 dark:text-slate-300 text-slate-600 dark:hover:bg-slate-600 hover:bg-gray-300 hover:text-white hover:translate-x-1"
                    >
                      <span className="text-sm dark:text-white text-slate-900">▸</span>
                      <span className="dark:text-white text-slate-900">{subItem.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t dark:border-slate-700 border-gray-300 space-y-3">
        {/* Close App Button - subtle style */}
        <button
          data-tv-focusable
          tabIndex={0}
          onClick={handleCloseApp}
          className="w-full px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 dark:bg-slate-800 bg-gray-100 dark:text-slate-400 text-slate-600 dark:hover:bg-red-500/10 hover:bg-red-500/10 dark:hover:text-red-400 hover:text-red-400 dark:border-slate-700 border-gray-300 dark:hover:border-red-500/30 hover:border-red-500/30"
        >
          <Power className="w-4 h-4" />
          <span className="text-sm font-medium dark:text-white text-slate-900">{t('exit') || 'Wyjdź'}</span>
        </button>

        <div className="bg-gradient-to-r from-green-700 to-green-800 rounded-lg p-3 text-center">
          <p className="text-xs text-white opacity-80">v1.0.0</p>
          <div className="flex justify-center gap-1 mt-2">
            <div className="w-1 h-1 bg-white rounded-full opacity-60"></div>
            <div className="w-1 h-1 bg-white rounded-full opacity-80"></div>
            <div className="w-1 h-1 bg-white rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
