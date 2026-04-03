// =========================
// 🧠 MODERN GLOBAL STORE (Zustand v5 + Immer)
// =========================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppState {
  // Per-portal favorites (portalId -> categoryIds[])
  portalFavoriteCategories: Record<string, string[]>;
  favorites: string[];
  recentChannels: string[];
  recentMovies: string[];
  isHydrated: boolean;
  
  // Actions
  toggleFavorite: (id: string) => void;
  toggleFavoriteCategory: (portalId: string, categoryId: string) => void;
  isFavoriteCategory: (portalId: string, categoryId: string) => boolean;
  getFavoriteCategories: (portalId: string) => string[];
  clearPortalFavorites: (portalId: string) => void;
  addRecentChannel: (id: string) => void;
  addRecentMovie: (id: string) => void;
  setHydrated: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set, get) => ({
      portalFavoriteCategories: {},
      favorites: [],
      recentChannels: [],
      recentMovies: [],
      isHydrated: false,
      
      toggleFavorite: (id: string) => {
        set((state) => {
          const index = state.favorites.indexOf(id);
          if (index > -1) {
            state.favorites.splice(index, 1);
          } else {
            state.favorites.push(id);
          }
        });
      },
      
      toggleFavoriteCategory: (portalId: string, categoryId: string) => {
        set((state) => {
          if (!state.portalFavoriteCategories[portalId]) {
            state.portalFavoriteCategories[portalId] = [];
          }
          const categories = state.portalFavoriteCategories[portalId];
          const index = categories.indexOf(categoryId);
          if (index > -1) {
            categories.splice(index, 1);
          } else {
            categories.push(categoryId);
          }
        });
      },
      
      isFavoriteCategory: (portalId: string, categoryId: string) => {
        const categories = get().portalFavoriteCategories[portalId] || [];
        return categories.includes(categoryId);
      },
      
      getFavoriteCategories: (portalId: string) => {
        return get().portalFavoriteCategories[portalId] || [];
      },
      
      clearPortalFavorites: (portalId: string) => {
        set((state) => {
          delete state.portalFavoriteCategories[portalId];
        });
      },
      
      addRecentChannel: (id: string) => {
        set((state) => {
          // Remove if exists
          const index = state.recentChannels.indexOf(id);
          if (index > -1) {
            state.recentChannels.splice(index, 1);
          }
          // Add to front
          state.recentChannels.unshift(id);
          // Keep only last 20
          if (state.recentChannels.length > 20) {
            state.recentChannels.pop();
          }
        });
      },
      
      addRecentMovie: (id: string) => {
        set((state) => {
          const index = state.recentMovies.indexOf(id);
          if (index > -1) {
            state.recentMovies.splice(index, 1);
          }
          state.recentMovies.unshift(id);
          if (state.recentMovies.length > 20) {
            state.recentMovies.pop();
          }
        });
      },
      
      setHydrated: (value: boolean) => {
        set((state) => {
          state.isHydrated = value;
        });
      },
    })),
    {
      name: 'iptv-app-store-v2',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Mark as hydrated when loaded
        state?.setHydrated(true);
      },
      partialize: (state) => ({
        favorites: state.favorites,
        portalFavoriteCategories: state.portalFavoriteCategories,
        recentChannels: state.recentChannels,
        recentMovies: state.recentMovies,
      }),
    }
  )
);

