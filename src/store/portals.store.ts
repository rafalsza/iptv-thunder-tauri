// =========================
// 💾 MODERN PORTALS STORE (Zustand v5 + Immer)
// Cache-bust: 2024-04-01-001
// =========================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { PortalAccount } from '@/features/portals/portals.types';
import { clearAllDataForPortal } from '@/hooks/useDatabase';
import { clearAllCategoriesCache } from '@/hooks/useCategories';
import { tauriStorage } from '@/lib/tauriStorage';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Portals');

interface PortalsState {
  portals: PortalAccount[];
  activePortalId: string | null;
  
  // Actions
  addPortal: (portal: Omit<PortalAccount, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePortal: (id: string, updates: Partial<PortalAccount>) => void;
  deletePortal: (id: string) => Promise<void>;
  setActivePortal: (id: string | null) => void;
  getActivePortal: () => PortalAccount | null;
  getPortalById: (id: string) => PortalAccount | undefined;
}

export const usePortalsStore = create<PortalsState>()(
  persist(
    immer((set, get) => ({
      portals: [],
      activePortalId: null,

      addPortal: (portalData) => {
        set((state) => {
          const newPortal: PortalAccount = {
            ...portalData,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          state.portals.push(newPortal);
        });
      },

      updatePortal: (id, updates) => {
        set((state) => {
          const portal = state.portals.find((p) => p.id === id);
          if (portal) {
            Object.assign(portal, updates, { updatedAt: new Date() });
          }
        });
      },

      deletePortal: async (id) => {
        // Check if portal exists before starting
        const portalExists = get().portals.some((p) => p.id === id);
        if (!portalExists) {
          logger.debug('Portal already deleted or does not exist:', id);
          return;
        }

        // Clear all database data for this portal first
        try {
          await clearAllDataForPortal(id);
          // Also clear categories cache to prevent stale data
          await clearAllCategoriesCache();
          // Clear React Query persisted cache from localStorage
          localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
          logger.debug('Database, categories cache, and React Query cache cleared for portal:', id);
        } catch (error: any) {
          // Ignore if database has old schema (missing portal_id column)
          if (error?.message?.includes('no such column') || error?.message?.includes('no such table')) {
            logger.debug('Database has old schema, skipping cleanup');
          } else {
            logger.error('Error clearing database for portal:', id, error);
          }
        }
        
        // Check again before set - portal might have been deleted during await
        const stillExists = get().portals.some((p) => p.id === id);
        if (!stillExists) {
          logger.debug('Portal was removed during cleanup, skipping set');
          return;
        }
        
        set((state) => {
          const index = state.portals.findIndex((p) => p.id === id);
          if (index > -1) {
            state.portals.splice(index, 1);
          }
          if (state.activePortalId === id) {
            state.activePortalId = null;
          }
        });
      },

      setActivePortal: (id) => {
        set((state) => {
          state.activePortalId = id;
        });
      },

      getActivePortal: () => {
        const { portals, activePortalId } = get();
        return portals.find((portal) => portal.id === activePortalId) || null;
      },

      getPortalById: (id) => {
        return get().portals.find((portal) => portal.id === id);
      },
    })),
    {
      name: 'portals-storage-v2',
      storage: tauriStorage,
    }
  )
);

// Hook to check if persist has hydrated - avoids re-renders on all subscribers
export const usePortalsHydrated = () =>
  usePortalsStore.persist.hasHydrated();

