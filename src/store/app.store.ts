// =========================
// 🧠 MODERN GLOBAL STORE (Zustand v5 + Immer)
// =========================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppState {
  favorites: string[]; // deprecated - do not use for new code
  recentChannels: string[];
  recentMovies: string[];
  isHydrated: boolean;
  
  // Actions
  addRecentChannel: (id: string) => void;
  addRecentMovie: (id: string) => void;
  setHydrated: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set) => ({
      favorites: [],
      recentChannels: [],
      recentMovies: [],
      isHydrated: false,
      
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
      name: 'iptv-app-store-v3',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Mark as hydrated when loaded
        state?.setHydrated(true);
      },
      partialize: (state) => ({
        favorites: state.favorites,
        recentChannels: state.recentChannels,
        recentMovies: state.recentMovies,
      }),
    }
  )
);

