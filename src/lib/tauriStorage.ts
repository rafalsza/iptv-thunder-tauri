import { Store } from '@tauri-apps/plugin-store';
import { PersistStorage, StorageValue } from 'zustand/middleware';

// Singleton store instance
let store: Store | null = null;

async function getStore(): Promise<Store> {
  store ??= await Store.load('stalker-portals');
  return store;
}

export async function clearTauriStore(): Promise<void> {
  try {
    const s = await getStore();
    await s.clear();
    await s.save();
    store = null;
  } catch (error) {
    console.error('[TauriStorage] clear error:', error);
  }
}

export const tauriStorage: PersistStorage<unknown> = {
  getItem: async (name: string): Promise<StorageValue<unknown> | null> => {
    try {
      const s = await getStore();
      const value = await s.get<StorageValue<unknown>>(name);
      console.log('[TauriStorage] getItem:', name, value ? 'found' : 'not found');
      return value ?? null;
    } catch (error) {
      console.error('[TauriStorage] getItem error:', error);
      return null;
    }
  },

  setItem: async (name: string, value: StorageValue<unknown>): Promise<void> => {
    try {
      const s = await getStore();
      await s.set(name, value);
      await s.save();
    } catch (error) {
      console.error('[TauriStorage] setItem error:', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      const s = await getStore();
      await s.delete(name);
      await s.save();
      console.log('[TauriStorage] removeItem:', name);
    } catch (error) {
      console.error('[TauriStorage] removeItem error:', error);
    }
  },
};
