// =========================
// 🌐 PORTAL LIST COMPONENT
// =========================
import React, { useState, useEffect, useRef } from 'react';
import { usePortalsStore } from '@/store/portals.store';
import { useTranslation } from '@/hooks/useTranslation';
import { PortalAccount } from './portals.types';
import { PortalForm } from './PortalForm';
import { PortalTest } from './PortalTest';

export const PortalList: React.FC = () => {
  const { t } = useTranslation();
  const [editingPortal, setEditingPortal] = useState<PortalAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testingPortal, setTestingPortal] = useState<string | null>(null);
  const [activeMenuPortal, setActiveMenuPortal] = useState<string | null>(null);
  const [deletingPortal, setDeletingPortal] = useState<PortalAccount | null>(null);

  const {
    portals,
    activePortalId,
    deletePortal,
    setActivePortal,
  } = usePortalsStore();

  const testingPortalData = usePortalsStore(s =>
    testingPortal ? s.portals.find(p => p.id === testingPortal) : undefined
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const lastPortalRef = useRef<string | null>(null);

  // Auto-focus first menu button when menu opens, restore focus when closes
  useEffect(() => {
    if (activeMenuPortal) {
      // Menu is opening - save the portal ID
      lastPortalRef.current = activeMenuPortal;

      // Delay to ensure DOM and navigation state are fully updated
      const timeout = setTimeout(() => {
        const firstButton = menuRef.current?.querySelector('[data-tv-initial]') as HTMLElement;
        if (firstButton) {
          firstButton.focus();
        }
      }, 200);

      return () => clearTimeout(timeout);
    } else if (lastPortalRef.current) {
      // Menu is closing - restore focus to the portal card
      const timeout = setTimeout(() => {
        // Don't restore focus if a modal is open (e.g., PortalTest, PortalForm)
        const openModal = document.querySelector('[data-tv-container]:not([data-tv-container="main"]):not([data-tv-container="navigation"])');
        if (openModal) {
          return;
        }

        const portalCard = document.querySelector(`[data-portal-id="${lastPortalRef.current}"]`) as HTMLElement;
        if (portalCard) {
          portalCard.focus();
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [activeMenuPortal]);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!activeMenuPortal) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking on the portal card (data-portal-id)
      // or inside the menu itself
      const isPortalCard = target.closest('[data-portal-id]') !== null;
      const isInsideMenu = menuRef.current?.contains(target) ?? false;

      if (!isPortalCard && !isInsideMenu) {
        setActiveMenuPortal(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuPortal(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenuPortal]);

  const handleEdit = (portal: PortalAccount) => {
    setEditingPortal(portal);
    setShowForm(true);
  };

  const handleDelete = (portal: PortalAccount) => {
    setDeletingPortal(portal);
  };

  const confirmDelete = () => {
    if (deletingPortal) {
      deletePortal(deletingPortal.id);
      setDeletingPortal(null);
      
      // Restore focus after delete modal closes
      setTimeout(() => {
        // If there are still portals, focus the first one
        if (portals.length > 1) {
          const firstPortal = portals.find(p => p.id !== deletingPortal.id);
          if (firstPortal) {
            const portalCard = document.querySelector(`[data-portal-id="${firstPortal.id}"]`) as HTMLElement;
            if (portalCard) {
              portalCard.focus();
            }
          }
        } else {
          // No portals left, focus the "Add Portal" button
          const addButton = document.querySelector('[data-tv-group="portals-content"][data-tv-initial]') as HTMLElement;
          if (addButton) {
            addButton.focus();
          }
        }
      }, 100);
    }
  };

  const cancelDelete = () => {
    setDeletingPortal(null);
    
    // Restore focus to the portal card after canceling delete
    if (deletingPortal) {
      setTimeout(() => {
        const portalCard = document.querySelector(`[data-portal-id="${deletingPortal.id}"]`) as HTMLElement;
        if (portalCard) {
          portalCard.focus();
        }
      }, 100);
    }
  };

  const handleSetActive = (portal: PortalAccount) => {
    setActivePortal(portal.id);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingPortal(null);
  };

  const getStatusColor = (portal: PortalAccount) => {
    if (portal.id === activePortalId) return 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-400/30 shadow-xl shadow-emerald-500/20';
    return 'dark:bg-slate-800/50 bg-white/50 hover:dark:bg-slate-700/60 hover:bg-gray-200/60 dark:border-slate-700/50 border-gray-300/50 hover:dark:border-slate-600/50 hover:border-gray-400/50';
  };

  const getStatusIcon = (portal: PortalAccount) => {
    if (portal.id === activePortalId) return '✅';
    return '⚪';
  };

  return (
    <div data-tv-container="main" className="p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 md:mb-12">
        <div className="flex flex-wrap justify-between items-start gap-4 md:gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-slate-400 from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-transparent">
              {t('managePortals')}
            </h1>
            <p className="dark:text-slate-400 text-slate-600 text-sm md:text-base lg:text-lg max-w-xl">
              {t('portalDescription')}
            </p>
          </div>
          <button
            data-tv-focusable
            data-tv-index={100}
            data-tv-group="portals-content"
            data-tv-initial
            tabIndex={0}
            onClick={() => setShowForm(true)}
            className="group relative px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl md:rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 flex items-center gap-2 md:gap-3 overflow-hidden text-sm md:text-base"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative text-xl md:text-2xl group-hover:rotate-90 transition-transform duration-300">➕</span>
            <span className="relative">{t('addPortal')}</span>
          </button>
        </div>
      </div>

      {/* Portals Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {portals.map((portal, portalIndex) => (
            <div
              key={portal.id}
              data-portal-id={portal.id}
              data-tv-focusable
              data-tv-index={portalIndex}
              data-tv-group="portals-content"
              data-tv-disabled={activeMenuPortal === portal.id ? true : undefined}
              tabIndex={activeMenuPortal === portal.id ? -1 : 0}
              onKeyDown={(e) => {
                // TV remote: Enter opens action menu, Escape closes it
                if (e.key === 'Enter' || e.key === 'OK' || e.key === 'Select') {
                  e.preventDefault();
                  setActiveMenuPortal(portal.id);
                } else if (e.key === 'Escape' || e.key === 'Back') {
                  e.preventDefault();
                  setActiveMenuPortal(null);
                }
              }}
              onClick={() => setActiveMenuPortal(portal.id)}
              className={`group relative backdrop-blur-xl rounded-2xl md:rounded-3xl p-4 md:p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer ${getStatusColor(portal)} dark:border border-white/10 border-gray-300/20`}
              style={{ pointerEvents: activeMenuPortal === portal.id ? 'none' : undefined }}
            >
            {/* Header */}
            <div className="flex justify-between items-start mb-4 md:mb-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-xl md:text-2xl backdrop-blur-sm border border-emerald-400/20 flex-shrink-0">
                  {getStatusIcon(portal)}
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="font-bold text-base md:text-lg lg:text-xl dark:text-white text-slate-900 tracking-tight truncate">{portal.name}</h3>
                  {portal.description && (
                    <p className="text-xs md:text-sm dark:text-slate-400 text-slate-600 truncate">{portal.description}</p>
                  )}
                </div>
              </div>

              {/* Action Menu Overlay */}
              {activeMenuPortal === portal.id && (
                <div
                  ref={menuRef}
                  className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-2 md:gap-3 p-3 md:p-4 pointer-events-auto"
                  data-tv-container="portal-actions"
                  style={{ pointerEvents: 'auto' }}
                >
                  <p className="text-white font-semibold mb-1 md:mb-2 text-sm md:text-base truncate px-2">{portal.name}</p>
                  <div className="flex flex-col gap-2 w-full max-w-[180px] md:max-w-[200px]">
                    {portal.id !== activePortalId && (
                      <button
                        data-tv-focusable
                        data-tv-group="portal-actions"
                        data-tv-index={0}
                        data-tv-initial
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleSetActive(portal); setActiveMenuPortal(null); }}
                        className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg md:rounded-xl transition-all text-sm md:text-base"
                      >
                        <span className="text-lg md:text-xl">🎯</span>
                        <span className="whitespace-nowrap">{t('setActive')}</span>
                      </button>
                    )}
                    <button
                      data-tv-focusable
                      data-tv-group="portal-actions"
                      data-tv-index={1}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setTestingPortal(portal.id); setActiveMenuPortal(null); }}
                      className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg md:rounded-xl transition-all text-sm md:text-base"
                    >
                      <span className="text-lg md:text-xl">🔄</span>
                      <span className="whitespace-nowrap">{t('testConnection')}</span>
                    </button>
                    <button
                      data-tv-focusable
                      data-tv-group="portal-actions"
                      data-tv-index={2}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleEdit(portal); setActiveMenuPortal(null); }}
                      className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg md:rounded-xl transition-all text-sm md:text-base"
                    >
                      <span className="text-lg md:text-xl">✏️</span>
                      <span className="whitespace-nowrap">{t('edit')}</span>
                    </button>
                    <button
                      data-tv-focusable
                      data-tv-group="portal-actions"
                      data-tv-index={3}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDelete(portal); setActiveMenuPortal(null); }}
                      className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg md:rounded-xl transition-all text-sm md:text-base"
                    >
                      <span className="text-lg md:text-xl">🗑️</span>
                      <span className="whitespace-nowrap">{t('delete')}</span>
                    </button>
                    <button
                      type="button"
                      data-tv-focusable
                      data-tv-group="portal-actions"
                      data-tv-index={4}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setActiveMenuPortal(null); }}
                      className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg md:rounded-xl transition-all mt-1 md:mt-2 text-sm md:text-base"
                    >
                      <span className="text-lg md:text-xl">✕</span>
                      <span className="whitespace-nowrap">{t('cancel')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Portal Info */}
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <span className="dark:text-slate-400 text-slate-600 flex-shrink-0 text-base md:text-lg">🌐</span>
                <span className="text-xs md:text-sm font-mono dark:bg-slate-900/50 bg-gray-100/50 px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl dark:text-slate-300 text-slate-700 break-all dark:border border-slate-700/50 border-gray-300/50">
                  {portal.portalUrl}
                </span>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <span className="dark:text-slate-400 text-slate-600 text-base md:text-lg">👤</span>
                <span className="text-xs md:text-sm dark:text-slate-300 text-slate-700 font-medium truncate">{portal.login}</span>
              </div>

              <div className="flex items-center gap-2 md:gap-3">
                <span className="dark:text-slate-400 text-slate-600 text-base md:text-lg">🖥️</span>
                <span className="text-xs md:text-sm font-mono dark:text-slate-300 text-slate-700 dark:bg-slate-900/50 bg-gray-100/50 px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl dark:border border-slate-700/50 border-gray-300/50 break-all">{portal.mac}</span>
              </div>

              {/* Tags */}
              {portal.tags && portal.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 md:gap-2 pt-2">
                  {portal.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-2 md:px-3 py-1 md:py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full border border-emerald-400/20 backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Active Badge */}
              {portal.id === activePortalId && (
                <div className="mt-3 md:mt-4">
                  <span className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs md:text-sm font-semibold rounded-full shadow-lg shadow-emerald-500/25">
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white rounded-full animate-pulse"></span>
                    <span className="whitespace-nowrap">{t('active')}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Last Updated */}
            <div className="mt-4 md:mt-6 pt-3 md:pt-4 dark:border-t border-slate-700/50 border-t-gray-300/50">
              <p className="text-[10px] md:text-xs dark:text-slate-500 text-slate-500 font-medium">
                {t('lastUpdated')}: {portal.updatedAt.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Help text */}
      {portals.length > 0 && (
        <div className="max-w-7xl mx-auto mt-8 text-center text-sm dark:text-slate-500 text-slate-500">
          {t('clickPortalForActions')}
        </div>
      )}

      {/* Empty State */}
      {portals.length === 0 && (
        <div className="max-w-2xl mx-auto text-center py-12 md:py-20">
          <div className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 rounded-2xl md:rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-4xl md:text-5xl backdrop-blur-sm border border-emerald-400/20 shadow-xl shadow-emerald-500/10">
            🌐
          </div>
          <h3 className="text-xl md:text-2xl font-bold dark:text-white text-slate-900 mb-2 md:mb-3">
            {t('noResults')}
          </h3>
          <p className="dark:text-slate-400 text-slate-600 text-sm md:text-lg mb-6 md:mb-8 max-w-md mx-auto px-4">
            {t('portalDescription')}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl md:rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 text-sm md:text-base"
          >
            {t('addPortal')}
          </button>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <PortalForm
          portal={editingPortal}
          onClose={handleFormClose}
        />
      )}

      {/* Test Modal */}
      {testingPortal && (
        <PortalTest
          portal={testingPortalData}
          onClose={() => setTestingPortal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingPortal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            data-tv-container="modal"
            className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-[95vw] md:max-w-md border border-slate-700/50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-700/50 bg-gradient-to-r from-red-500/10 to-orange-500/10">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-red-500/20 flex items-center justify-center text-xl md:text-2xl backdrop-blur-sm border border-red-400/20 flex-shrink-0">
                  🗑️
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-bold text-white">
                    {t('deletePortal')}
                  </h2>
                  <p className="text-xs md:text-sm text-slate-400">{t('areYouSure')}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 md:p-6">
              <p className="text-sm md:text-base text-slate-300 mb-2">
                {t('deletePortalConfirm')} <span className="font-semibold text-white break-words">"{deletingPortal.name}"</span>?
              </p>
              <p className="text-xs md:text-sm text-slate-500">
                {t('thisActionCannotBeUndone')}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 p-4 md:p-6 pt-2 border-t border-slate-700/50">
              <button
                type="button"
                data-tv-focusable
                data-tv-group="delete-confirm"
                data-tv-index={0}
                tabIndex={0}
                onClick={cancelDelete}
                className="w-full sm:w-auto px-4 md:px-5 py-2 md:py-2.5 border border-slate-600 text-slate-300 rounded-lg md:rounded-xl hover:bg-slate-700/50 hover:text-white transition-all duration-200 hover:scale-105 text-sm md:text-base"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                data-tv-focusable
                data-tv-group="delete-confirm"
                data-tv-index={1}
                data-tv-initial
                tabIndex={0}
                onClick={confirmDelete}
                className="w-full sm:w-auto px-4 md:px-6 py-2 md:py-2.5 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg md:rounded-xl font-semibold hover:from-red-600 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25 text-sm md:text-base"
              >
                <span>🗑️</span>
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
