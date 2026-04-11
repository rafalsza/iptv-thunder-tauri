// =========================
// 🌐 PORTAL LIST COMPONENT
// =========================
import React, { useState } from 'react';
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

  const {
    portals,
    activePortalId,
    deletePortal,
    setActivePortal,
  } = usePortalsStore();

  const testingPortalData = usePortalsStore(s =>
    testingPortal ? s.portals.find(p => p.id === testingPortal) : undefined
  );

  const handleEdit = (portal: PortalAccount) => {
    setEditingPortal(portal);
    setShowForm(true);
  };

  const handleDelete = (portal: PortalAccount) => {
    if (globalThis.confirm(`${t('delete')} portal "${portal.name}"?`)) {
      deletePortal(portal.id);
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
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="flex flex-wrap justify-between items-start gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r dark:from-white dark:via-slate-200 dark:to-slate-400 from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-transparent">
              {t('managePortals')}
            </h1>
            <p className="dark:text-slate-400 text-slate-600 text-lg max-w-xl">
              {t('portalDescription')}
            </p>
          </div>
          <button
            data-tv-focusable
            tabIndex={0}
            onClick={() => setShowForm(true)}
            className="group relative px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 flex items-center gap-3 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative text-2xl group-hover:rotate-90 transition-transform duration-300">➕</span>
            <span className="relative">{t('addPortal')}</span>
          </button>
        </div>
      </div>

      {/* Portals Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portals.map((portal) => (
            <div
              key={portal.id}
              className={`group relative backdrop-blur-xl rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${getStatusColor(portal)} dark:border border-white/10 border-gray-300/20`}
            >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-2xl backdrop-blur-sm border border-emerald-400/20">
                  {getStatusIcon(portal)}
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xl dark:text-white text-slate-900 tracking-tight">{portal.name}</h3>
                  {portal.description && (
                    <p className="text-sm dark:text-slate-400 text-slate-600">{portal.description}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {portal.id !== activePortalId && (
                  <button
                    data-tv-focusable
                    tabIndex={0}
                    onClick={() => handleSetActive(portal)}
                    className="p-2.5 dark:bg-slate-700/50 bg-gray-200/50 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all duration-200 hover:scale-110 dark:border border-slate-600/50 border-gray-300/50 hover:border-emerald-400/30"
                    title={t('setActive')}
                  >
                    🎯
                  </button>
                )}
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => setTestingPortal(portal.id)}
                  className="p-2.5 bg-slate-700/50 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-all duration-200 hover:scale-110 border border-slate-600/50 hover:border-blue-400/30"
                  title={t('testConnection')}
                >
                  🔄
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => handleEdit(portal)}
                  className="p-2.5 bg-slate-700/50 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-all duration-200 hover:scale-110 border border-slate-600/50 hover:border-amber-400/30"
                  title={t('edit')}
                >
                  ✏️
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => handleDelete(portal)}
                  className="p-2.5 bg-slate-700/50 hover:bg-red-500/20 text-red-400 rounded-xl transition-all duration-200 hover:scale-110 border border-slate-600/50 hover:border-red-400/30"
                  title={t('delete')}
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* Portal Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="dark:text-slate-400 text-slate-600 flex-shrink-0 text-lg">🌐</span>
                <span className="text-sm font-mono dark:bg-slate-900/50 bg-gray-100/50 px-3 py-2 rounded-xl dark:text-slate-300 text-slate-700 break-all dark:border border-slate-700/50 border-gray-300/50">
                  {portal.portalUrl}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="dark:text-slate-400 text-slate-600 text-lg">👤</span>
                <span className="text-sm dark:text-slate-300 text-slate-700 font-medium">{portal.login}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="dark:text-slate-400 text-slate-600 text-lg">🖥️</span>
                <span className="text-sm font-mono dark:text-slate-300 text-slate-700 dark:bg-slate-900/50 bg-gray-100/50 px-3 py-2 rounded-xl dark:border border-slate-700/50 border-gray-300/50">{portal.mac}</span>
              </div>

              {/* Tags */}
              {portal.tags && portal.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {portal.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full border border-emerald-400/20 backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Active Badge */}
              {portal.id === activePortalId && (
                <div className="mt-4">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-emerald-500/25">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    {t('active')}
                  </span>
                </div>
              )}
            </div>

            {/* Last Updated */}
            <div className="mt-6 pt-4 dark:border-t border-slate-700/50 border-t-gray-300/50">
              <p className="text-xs dark:text-slate-500 text-slate-500 font-medium">
                {t('lastUpdated')}: {portal.updatedAt.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {portals.length === 0 && (
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-5xl backdrop-blur-sm border border-emerald-400/20 shadow-xl shadow-emerald-500/10">
            🌐
          </div>
          <h3 className="text-2xl font-bold dark:text-white text-slate-900 mb-3">
            {t('noResults')}
          </h3>
          <p className="dark:text-slate-400 text-slate-600 text-lg mb-8 max-w-md mx-auto">
            {t('portalDescription')}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-semibold shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1"
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
      </div>
    </div>
  );
};
