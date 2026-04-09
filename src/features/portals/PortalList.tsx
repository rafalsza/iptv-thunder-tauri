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
    if (portal.id === activePortalId) return 'bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-400 shadow-lg shadow-green-500/25';
    return 'bg-slate-700 bg-opacity-50 hover:bg-slate-600 border-slate-600 text-slate-200';
  };

  const getStatusIcon = (portal: PortalAccount) => {
    if (portal.id === activePortalId) return '✅';
    return '⚪';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('managePortals')}</h1>
          <p className="text-slate-400">
            {t('portalDescription')}
          </p>
        </div>
        <button
          data-tv-focusable
          tabIndex={0}
          onClick={() => setShowForm(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 flex items-center gap-2 shadow-lg"
        >
          <span className="text-xl">➕</span>
          {t('addPortal')}
        </button>
      </div>

      {/* Portals Grid */}
      <div className="grid grid-cols-1 gap-4 mb-8 max-w-3xl">
        {portals.map((portal) => (
          <div
            key={portal.id}
            className={`border-2 rounded-xl p-6 transition-all duration-200 hover:shadow-xl hover:scale-105 ${getStatusColor(portal)}`}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getStatusIcon(portal)}</span>
                <div>
                  <h3 className="font-bold text-lg text-white">{portal.name}</h3>
                  {portal.description && (
                    <p className="text-sm text-slate-300 mt-1">{portal.description}</p>
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
                    className="p-2 text-green-400 hover:bg-green-400 hover:bg-opacity-20 rounded-lg transition-colors"
                    title={t('setActive')}
                  >
                    🎯
                  </button>
                )}
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => setTestingPortal(portal.id)}
                  className="p-2 text-blue-400 hover:bg-blue-400 hover:bg-opacity-20 rounded-lg transition-colors"
                  title={t('testConnection')}
                >
                  🔄
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => handleEdit(portal)}
                  className="p-2 text-yellow-400 hover:bg-yellow-400 hover:bg-opacity-20 rounded-lg transition-colors"
                  title={t('edit')}
                >
                  ✏️
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  onClick={() => handleDelete(portal)}
                  className="p-2 text-red-400 hover:bg-red-400 hover:bg-opacity-20 rounded-lg transition-colors"
                  title={t('delete')}
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* Portal Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-400 flex-shrink-0">🌐</span>
                <span className="text-sm font-mono bg-slate-800 bg-opacity-50 px-2 py-1 rounded text-slate-300 break-all">
                  {portal.portalUrl}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-slate-400">👤</span>
                <span className="text-sm text-slate-300">{portal.login}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-slate-400">🖥️</span>
                <span className="text-sm font-mono text-slate-300">{portal.mac}</span>
              </div>

              {/* Tags */}
              {portal.tags && portal.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {portal.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-500 bg-opacity-20 text-blue-400 text-xs rounded-full border border-blue-400 border-opacity-30"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Active Badge */}
              {portal.id === activePortalId && (
                <div className="mt-4">
                  <span className="px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm rounded-full font-medium shadow-lg">
                    {t('active')}
                  </span>
                </div>
              )}
            </div>

            {/* Last Updated */}
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-xs text-slate-500">
                Ostatnia aktualizacja: {portal.updatedAt.toLocaleString('pl-PL')}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {portals.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🌐</div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {t('noResults')}
          </h3>
          <p className="text-slate-400 mb-6">
            {t('portalDescription')}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
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
  );
};
