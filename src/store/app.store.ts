// =========================
// 🧠 MODERN GLOBAL STORE (Zustand v5 + Immer)
// =========================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppState {
  isHydrated: boolean;
  isFullscreen: boolean;

  // Actions
  setHydrated: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set) => ({
      isHydrated: false,
      isFullscreen: false,

      setHydrated: (value: boolean) => {
        set((state) => {
          state.isHydrated = value;
        });
      },

      setFullscreen: (value: boolean) => {
        set((state) => {
          state.isFullscreen = value;
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
      partialize: () => ({}),
    }
  )
);

