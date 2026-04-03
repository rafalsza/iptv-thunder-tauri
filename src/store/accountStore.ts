import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { StalkerAccount, AppSettings } from '@/types';

interface AccountStore {
  accounts: StalkerAccount[];
  activeAccount: StalkerAccount | null;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;
  
  // Account actions
  addAccount: (account: Omit<StalkerAccount, 'id' | 'lastUsed'>) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<StalkerAccount>) => void;
  setActiveAccount: (id: string) => void;
  clearAccounts: () => void;
  
  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  
  // UI state
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHydrated: (value: boolean) => void;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  language: 'en',
  autoConnect: false,
  bufferTime: 5000,
};

export const useAccountStore = create<AccountStore>()(
  persist(
    immer((set) => ({
      accounts: [],
      activeAccount: null,
      isLoading: false,
      error: null,
      isHydrated: false,
      settings: defaultSettings,

      addAccount: (accountData) => {
        set((state) => {
          const newAccount: StalkerAccount = {
            ...accountData,
            id: crypto.randomUUID(),
            lastUsed: new Date(),
            isActive: false,
          };
          state.accounts.push(newAccount);
          
          // If this is the first account, make it active
          if (state.accounts.length === 1) {
            state.activeAccount = newAccount;
          }
        });
      },

      removeAccount: (id) => {
        set((state) => {
          const index = state.accounts.findIndex(acc => acc.id === id);
          if (index > -1) {
            state.accounts.splice(index, 1);
          }
          if (state.activeAccount?.id === id) {
            state.activeAccount = null;
          }
        });
      },

      updateAccount: (id, updates) => {
        set((state) => {
          const account = state.accounts.find(acc => acc.id === id);
          if (account) {
            Object.assign(account, updates);
          }
          if (state.activeAccount?.id === id) {
            Object.assign(state.activeAccount, updates);
          }
        });
      },

      setActiveAccount: (id) => {
        set((state) => {
          const account = state.accounts.find(acc => acc.id === id);
          if (!account) return;

          state.accounts.forEach(acc => {
            acc.isActive = acc.id === id;
            if (acc.id === id) {
              acc.lastUsed = new Date();
            }
          });

          state.activeAccount = account;
        });
      },

      clearAccounts: () => {
        set((state) => {
          state.accounts = [];
          state.activeAccount = null;
        });
      },

      updateSettings: (newSettings) => {
        set((state) => {
          Object.assign(state.settings, newSettings);
        });
      },

      setIsLoading: (loading) => {
        set((state) => {
          state.isLoading = loading;
        });
      },
      
      setError: (error) => {
        set((state) => {
          state.error = error;
        });
      },
      
      setHydrated: (value) => {
        set((state) => {
          state.isHydrated = value;
        });
      },
    })),
    {
      name: 'iptv-thunder-store-v2',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccount: state.activeAccount,
        settings: state.settings,
      }),
    }
  )
);
