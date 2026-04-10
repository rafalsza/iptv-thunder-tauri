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
    <div className="w-64 bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
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
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                    : item.disabled
                    ? 'bg-slate-700 bg-opacity-30 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-700 bg-opacity-50 text-slate-300 hover:bg-slate-600 hover:text-white hover:shadow-md hover:translate-x-1'
                }`}
              >
                {/* Active state gradient overlay */}
                {item.active && !hasSubItems && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-10 animate-pulse"></div>
                )}
                
                {/* Hover effect background */}
                {!item.disabled && !item.active && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-10 transition-opacity duration-200"></div>
                )}
                
                <span className={`text-xl relative z-10 ${item.active && !hasSubItems ? 'animate-pulse' : ''}`}>
                  {item.icon}
                </span>
                <span className="font-medium relative z-10 flex-1">{item.label}</span>
                
                {/* Dropdown arrow for items with sub-items */}
                {hasSubItems && (
                  <ChevronDown 
                    className={`w-4 h-4 relative z-10 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                )}
                
                {/* Disabled indicator */}
                {item.disabled && (
                  <span className="ml-auto text-xs bg-slate-600 px-2 py-1 rounded-full">🔒</span>
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
                      className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 text-sm bg-slate-700 bg-opacity-30 text-slate-300 hover:bg-slate-600 hover:text-white hover:translate-x-1"
                    >
                      <span className="text-sm">▸</span>
                      <span>{subItem.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 space-y-3">
        {/* Close App Button - subtle style */}
        <button
          data-tv-focusable
          tabIndex={0}
          onClick={handleCloseApp}
          className="w-full px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-400 border border-slate-700 hover:border-red-500/30"
        >
          <Power className="w-4 h-4" />
          <span className="text-sm font-medium">{t('exit') || 'Wyjdź'}</span>
        </button>

        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-3 text-center">
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
