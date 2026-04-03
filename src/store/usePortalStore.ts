import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StalkerAccount } from '@/types';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { tauriStorage } from '@/lib/tauriStorage';
import { clearAllDataForPortal } from '@/hooks/useDatabase';

// Predefined EPG services
export interface EpgService {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export const PREDEFINED_EPG_SERVICES: EpgService[] = [
  { id: 'auto', name: 'Automatyczny (z serwera IPTV)', url: '', description: 'Używa EPG dostarczonego przez Twój serwer IPTV' },
  { id: 'epg_share', name: 'EPG Share (epg-share.com)', url: 'https://epgshare01.online/epg_ripper_US_LOCALS2.xml.gz', description: 'Darmowy EPG głównie dla kanałów USA' },
  { id: 'github_epg', name: 'IPTV Org EPG', url: 'https://epg.pw/xmltv.xml.gz', description: 'EPG z iptv-org.github.io - globalne kanały' },
  { id: 'custom', name: 'Własny URL', url: '', description: 'Wprowadź własny adres URL do pliku XMLTV' },
];

interface PortalStore {
  accounts: StalkerAccount[];

  // Aktualnie wybrane konto
  activeAccountId: string | null;
  activeAccount: StalkerAccount | null;
  currentPortalId: string | null;

  // Ustawienia
  externalEpgUrl: string | null;
  selectedEpgService: string | null; // ID of selected predefined service or 'custom'

  // Ładowanie
  isLoading: boolean;
  error: string | null;

  // Akcje
  addAccount: (account: Omit<StalkerAccount, 'id'>) => Promise<void>;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => Promise<void>;
  updateAccount: (id: string, updates: Partial<StalkerAccount>) => void;
  logoutAccount: (id: string) => void;
  setExternalEpgUrl: (url: string | null) => void;
  setSelectedEpgService: (serviceId: string | null) => void;

  // Pomocnicze gettery
  activeClient: StalkerClient | null;
  getEffectiveEpgUrl: () => string | null;
}

export const usePortalStore = create<PortalStore>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      activeAccount: null,
      currentPortalId: null,
      externalEpgUrl: null,
      selectedEpgService: 'auto', // Default to auto
      isLoading: false,
      error: null,

      // Dodawanie nowego konta - tylko zapis, bez aktywacji
      addAccount: async (newAccountData) => {
        set({ isLoading: true, error: null });

        try {
          const newAccount: StalkerAccount = {
            ...newAccountData,
            id: `acc_${Date.now()}`,
          };

          // Tylko zapis konta, bez logowania i aktywacji
          const currentAccounts = get().accounts;
          set(() => ({
            accounts: [...currentAccounts, newAccount],
            isLoading: false,
          }));
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || 'Nie udało się dodać konta',
          });
          throw err;
        }
      },

      // Usuwanie konta
      removeAccount: async (id) => {
        const state = get();
        const isActive = state.activeAccountId === id;

        // Clear all database data for this account first
        try {
          await clearAllDataForPortal(id);
          console.log('[PortalStore] Database cleared for account:', id);
        } catch (error: any) {
          if (error?.message?.includes('no such column') || error?.message?.includes('no such table')) {
            console.log('[PortalStore] Database has old schema, skipping cleanup');
          } else {
            console.error('[PortalStore] Error clearing database for account:', id, error);
          }
        }

        set(() => ({
          accounts: state.accounts.filter((acc) => acc.id !== id),
          activeAccountId: isActive ? null : state.activeAccountId,
          activeAccount: isActive ? null : state.activeAccount,
        }));
      },

      // Przełączanie aktywnego konta + automatyczne logowanie jeśli token wygasł
      setActiveAccount: async (id: string) => {
        const account = get().accounts.find((a) => a.id === id);
        if (!account) return;

        console.log('setActiveAccount called with:', { id, accountName: account.name });
        set({ isLoading: true, error: null });

        try {
          let client = new StalkerClient(account);

          // Jeśli token wygasł lub nie istnieje → ponowne logowanie
          if (!account.token || (account.expiresAt && new Date(account.expiresAt) < new Date())) {
            console.log('Token expired or missing, logging in...');
            const loggedAccount = await client.login();
            // Aktualizujemy konto w liście
            const currentAccounts = get().accounts;
            set(() => ({
              accounts: currentAccounts.map((acc) =>
                acc.id === id ? loggedAccount : acc
              ),
              activeAccountId: id,
              activeAccount: loggedAccount,
              isLoading: false,
            }));
          } else {
            console.log('Token valid, setting active account directly');
            // Token jest ważny, po prostu ustawiamy aktywne konto
            const activeAccount = get().accounts.find((a) => a.id === id) || null;
            set(() => ({
              activeAccountId: id,
              activeAccount: activeAccount, // Ustawiamy pole
              isLoading: false,
            }));
          }
        } catch (err: any) {
          console.error('setActiveAccount error:', err);
          set({
            isLoading: false,
            error: `Nie udało się aktywować konta: ${err.message}`,
          });
          throw err;
        }
      },

      updateAccount: (id, updates) => {
        const currentAccounts = get().accounts;
        set(() => ({
          accounts: currentAccounts.map((acc) =>
            acc.id === id ? { ...acc, ...updates } : acc
          ),
        }));
      },

      logoutAccount: (id) => {
        const currentAccounts = get().accounts;
        const currentActiveAccountId = get().activeAccountId;
        set(() => ({
          accounts: currentAccounts.map((acc) =>
            acc.id === id
              ? { ...acc, token: undefined, expiresAt: undefined, profile: undefined }
              : acc
          ),
          activeAccountId: currentActiveAccountId === id ? null : currentActiveAccountId,
          activeAccount: currentActiveAccountId === id ? null : get().activeAccount,
        }));
      },

      setExternalEpgUrl: (url) => {
        set({ externalEpgUrl: url });
      },

      setSelectedEpgService: (serviceId) => {
        const service = PREDEFINED_EPG_SERVICES.find(s => s.id === serviceId);
        if (service) {
          set({ 
            selectedEpgService: serviceId,
            // If not custom, also set the URL automatically
            externalEpgUrl: serviceId === 'custom' ? get().externalEpgUrl : (service.url || null)
          });
        }
      },

      // Pomocnicze getters
      get activeClient() {
        const acc = get().activeAccount;
        return acc ? new StalkerClient(acc) : null;
      },

      getEffectiveEpgUrl: () => {
        const state = get();
        const service = PREDEFINED_EPG_SERVICES.find(s => s.id === state.selectedEpgService);
        
        if (!service || service.id === 'auto') {
          return null; // Use server EPG
        }
        if (service.id === 'custom') {
          return state.externalEpgUrl; // Use custom URL
        }
        return service.url; // Use predefined service URL
      },
    }),

    {
      name: 'stalker-portals-storage',
      storage: tauriStorage as any,
      partialize: (state: PortalStore) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
        externalEpgUrl: state.externalEpgUrl,
        selectedEpgService: state.selectedEpgService,
      }) as any,
      onRehydrateStorage: () => (state: any) => {
        console.log('[TauriStorage] Rehydrated:', state);
        if (state) {
          // Przywróć activeAccount na podstawie activeAccountId
          const activeAccount = state.accounts.find((a: StalkerAccount) => a.id === state.activeAccountId) || null;
          state.activeAccount = activeAccount;
          console.log('[TauriStorage] Restored activeAccount:', activeAccount?.name || 'none');
        }
      },
    }
  )
);
