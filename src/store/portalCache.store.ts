// =========================
// 📦 PORTAL DATA CACHE STORE
// =========================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { StalkerChannel, StalkerVOD, StalkerGenre, StalkerEPG } from '@/types';

interface PortalData {
  channelsByGenre: Record<string, StalkerChannel[]>; // kanały per kategoria
  allChannels: StalkerChannel[]; // wszystkie kanałe
  channelCategories: StalkerGenre[];
  vod: StalkerVOD[];
  vodByCategory: Record<string, StalkerVOD[]>; // VOD per kategoria
  vodCategories: StalkerGenre[];
  epgCache: Record<number, { programs: StalkerEPG[]; timestamp: number }>; // EPG per channel
  lastUpdated: number;
}

interface PortalCacheState {
  portalsData: Record<string, PortalData>;
  isHydrated: boolean;
  
  // Actions
  setChannels: (portalId: string, genreId: string, channels: StalkerChannel[]) => void;
  setAllChannels: (portalId: string, channels: StalkerChannel[]) => void;
  setChannelCategories: (portalId: string, categories: StalkerGenre[]) => void;
  setVOD: (portalId: string, vod: StalkerVOD[]) => void;
  setVODForCategory: (portalId: string, categoryId: string, vod: StalkerVOD[]) => void;
  appendVODPage: (portalId: string, categoryId: string, page: number, items: StalkerVOD[]) => void;
  clearVODForCategory: (portalId: string, categoryId: string) => void;
  setVODCategories: (portalId: string, categories: StalkerGenre[]) => void;
  setChannelEPG: (portalId: string, channelId: number, programs: StalkerEPG[]) => void;
  getChannelEPG: (portalId: string, channelId: number) => StalkerEPG[] | null;
  hasValidEPG: (portalId: string, channelId: number, maxAgeMs?: number) => boolean;
  getPortalData: (portalId: string) => PortalData | null;
  hasPortalData: (portalId: string) => boolean;
  clearPortalData: (portalId: string) => void;
  clearAllCache: () => void;
  setHydrated: (value: boolean) => void;
}

const initialPortalData: PortalData = {
  channelsByGenre: {},
  allChannels: [],
  channelCategories: [],
  vod: [],
  vodByCategory: {},
  vodCategories: [],
  epgCache: {},
  lastUpdated: 0,
};

export const usePortalCacheStore = create<PortalCacheState>()(
  immer((set, get) => ({
      portalsData: {},
      isHydrated: false,
      
      setChannels: (portalId, genreId, channels) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          if (!state.portalsData[portalId].channelsByGenre) {
            state.portalsData[portalId].channelsByGenre = {};
          }
          state.portalsData[portalId].channelsByGenre[genreId] = channels;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },
      
      setAllChannels: (portalId, channels) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          state.portalsData[portalId].allChannels = channels;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },
      
      setChannelCategories: (portalId, categories) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          state.portalsData[portalId].channelCategories = categories;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },
      
      setVOD: (portalId, vod) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          state.portalsData[portalId].vod = vod;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },
      
      setVODForCategory: (portalId, categoryId, vod) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          if (!state.portalsData[portalId].vodByCategory) {
            state.portalsData[portalId].vodByCategory = {};
          }
          state.portalsData[portalId].vodByCategory[categoryId] = vod;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },
      
      appendVODPage: (portalId, categoryId, page, items) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          if (!state.portalsData[portalId].vodByCategory) {
            state.portalsData[portalId].vodByCategory = {};
          }
          const existing = state.portalsData[portalId].vodByCategory[categoryId] || [];
          // Only add items that don't already exist (by id) and keep sorted by added date desc
          const existingIds = new Set(existing.map(v => v.id));
          const newItems = items.filter(v => !existingIds.has(v.id));
          // Merge and sort by added date descending (newest first)
          const merged = [...existing, ...newItems].sort((a, b) => {
            const dateA = Number(a.added) || 0;
            const dateB = Number(b.added) || 0;
            return dateB - dateA;
          });
          state.portalsData[portalId].vodByCategory[categoryId] = merged;
          state.portalsData[portalId].lastUpdated = Date.now();
          console.log('[PortalCache] Appended', newItems.length, 'items (page', page, ') for', categoryId, '- total:', merged.length);
        });
      },
      
      clearVODForCategory: (portalId, categoryId) => {
        set((state) => {
          if (state.portalsData[portalId]?.vodByCategory?.[categoryId]) {
            delete state.portalsData[portalId].vodByCategory[categoryId];
            state.portalsData[portalId].lastUpdated = Date.now();
            console.log('[PortalCache] Cleared VOD cache for category:', categoryId);
          }
        });
      },
      
      setVODCategories: (portalId, categories) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          state.portalsData[portalId].vodCategories = categories;
          state.portalsData[portalId].lastUpdated = Date.now();
        });
      },

      setChannelEPG: (portalId, channelId, programs) => {
        set((state) => {
          if (!state.portalsData[portalId]) {
            state.portalsData[portalId] = { ...initialPortalData };
          }
          if (!state.portalsData[portalId].epgCache) {
            state.portalsData[portalId].epgCache = {};
          }
          state.portalsData[portalId].epgCache[channelId] = {
            programs,
            timestamp: Date.now(),
          };
        });
        // Catch quota errors silently - they don't break functionality
        try {
          // Force persist by triggering a state update
          set((state) => ({ ...state }));
        } catch (e: any) {
          if (e?.name === 'QuotaExceededError') {
            console.warn('[PortalCache] localStorage quota exceeded - data in memory only');
            // Clear old EPG data to make room
            set((state) => {
              if (state.portalsData[portalId]?.epgCache) {
                const keys = Object.keys(state.portalsData[portalId].epgCache!);
                // Remove oldest 50% of cached EPG entries
                const toRemove = keys.slice(0, Math.floor(keys.length / 2));
                for (const key of toRemove) {
                  delete state.portalsData[portalId].epgCache![Number(key)];
                }
              }
            });
          }
        }
      },

      getChannelEPG: (portalId, channelId) => {
        const data = get().portalsData[portalId];
        if (!data || !data.epgCache) return null;
        return data.epgCache[channelId]?.programs || null;
      },

      hasValidEPG: (portalId, channelId, maxAgeMs = 30 * 60 * 1000) => {
        const data = get().portalsData[portalId];
        if (!data || !data.epgCache) return false;
        const cached = data.epgCache[channelId];
        if (!cached) return false;
        return Date.now() - cached.timestamp < maxAgeMs;
      },

      getPortalData: (portalId) => {
        return get().portalsData[portalId] || null;
      },
      
      hasPortalData: (portalId) => {
        const data = get().portalsData[portalId];
        return !!data && (data.allChannels.length > 0 || Object.keys(data.channelsByGenre).length > 0);
      },
      
      clearPortalData: (portalId) => {
        set((state) => {
          delete state.portalsData[portalId];
        });
      },
      
      clearAllCache: () => {
        set((state) => {
          state.portalsData = {};
        });
      },
      
      setHydrated: (value) => {
        set((state) => {
          state.isHydrated = value;
        });
      },
    }))
);

// Clear old localStorage cache on load (migration cleanup)
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('portal-data-cache');
    console.log('[PortalCache] Cleared old localStorage cache');
  } catch {}
}
