// =========================
// ❤️ FAVORITES HOOK - SQLite Storage (Optimized) v5
// Cache-bust: 2024-04-01-005-no-migration
// =========================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { getDB } from './db';
import { createLogger } from '../lib/logger';

interface FavoriteItem {
  id: number;
  account_id: string;
  kind: 'item' | 'category';
  type: 'live' | 'vod' | 'series';
  item_id: string;
  parent_id?: string;
  name: string;
  poster?: string;
  cmd?: string;
  season?: number;
  episode?: number;
  extra?: string;
  created_at: number;
}

// Singleton state
let isInitializing = false;
let initPromise: Promise<void> | null = null;
let isTableReady = false;

const logger = createLogger('Favorites');

// Note: getDB is imported from ./db - unified singleton

// Initialize favorites table
export async function initFavoritesTable(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (isInitializing && initPromise) {
    return initPromise;
  }

  // Skip if already initialized
  if (isTableReady) {
    return;
  }

  isInitializing = true;
  logger.info('Initializing table...');

  initPromise = (async () => {
    try {
      const db = await getDB();

      // Check if old table exists without account_id column
      try {
        const tableInfo = await db.select<{name: string}[]>(`PRAGMA table_info(favorites)`);
        const hasAccountId = tableInfo.some(col => col.name === 'account_id');
        const hasKind = tableInfo.some(col => col.name === 'kind');
        
        if (tableInfo.length > 0 && (!hasAccountId || !hasKind)) {
          logger.info('Old favorites table detected, dropping...');
          await db.execute(`DROP TABLE IF EXISTS favorites`);
        }
      } catch (e) {
        // Table doesn't exist, continue
      }

      // Create unified favorites table with kind field
      await db.execute(`
        CREATE TABLE IF NOT EXISTS favorites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          poster TEXT,
          cmd TEXT,
          season INTEGER,
          episode INTEGER,
          extra JSON,
          created_at INTEGER NOT NULL,
          UNIQUE(account_id, kind, type, item_id)
        )
      `);

      await db.execute(`CREATE INDEX IF NOT EXISTS idx_fav_account ON favorites(account_id)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_fav_kind ON favorites(kind)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_fav_type ON favorites(type)`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_fav_parent ON favorites(parent_id)`);

      // Drop old tables if exist
      await db.execute(`DROP TABLE IF EXISTS favorite_categories`);

      logger.info('Table initialized successfully');
      isTableReady = true;
    } catch (error) {
      logger.error('Error initializing table:', error);
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

// Load favorites (items only, not categories)
export async function loadFavorites(accountId: string): Promise<FavoriteItem[]> {
  try {
    const db = await getDB();
    const result = await db.select<FavoriteItem[]>(
      "SELECT * FROM favorites WHERE account_id = ? AND kind = 'item' ORDER BY created_at DESC",
      [accountId]
    );
    return result || [];
  } catch (error) {
    logger.error('Error loading favorites:', error);
    return [];
  }
}

// Add/update favorite item (UPSERT)
export async function addFavorite(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  itemId: string,
  metadata?: { name?: string; poster?: string; cmd?: string; parent_id?: string; season?: number; episode?: number; extra?: any }
): Promise<void> {
  logger.info('Upserting:', { accountId, type, itemId, metadata });
  try {
    const db = await getDB();
    const now = Date.now();
    const extraJson = metadata?.extra ? JSON.stringify(metadata.extra) : null;
    await db.execute(
      `INSERT INTO favorites (account_id, kind, type, item_id, parent_id, name, poster, cmd, season, episode, extra, created_at) 
       VALUES (?, 'item', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, kind, type, item_id)
       DO UPDATE SET
         parent_id=excluded.parent_id,
         name=excluded.name,
         poster=excluded.poster,
         cmd=excluded.cmd,
         season=excluded.season,
         episode=excluded.episode,
         extra=excluded.extra`,
      [accountId, type, itemId, metadata?.parent_id || null, metadata?.name || 'Unknown', metadata?.poster || null, metadata?.cmd || null, metadata?.season || null, metadata?.episode || null, extraJson, now]
    );
    logger.info('Upserted successfully');
  } catch (error) {
    logger.error('Error upserting favorite:', error);
    throw error;
  }
}

// Remove item from favorites
export async function removeFavorite(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  itemId: string
): Promise<void> {
  try {
    const db = await getDB();
    await db.execute(
      "DELETE FROM favorites WHERE account_id = ? AND kind = 'item' AND type = ? AND item_id = ?",
      [accountId, type, itemId]
    );
  } catch (error) {
    logger.error('Error removing favorite:', error);
    throw error;
  }
}

// Toggle favorite item status
export async function toggleFavorite(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  itemId: string,
  isFavorite: boolean,
  metadata?: { name?: string; poster?: string; cmd?: string; parent_id?: string; season?: number; episode?: number; extra?: any }
): Promise<void> {
  if (isFavorite) {
    await addFavorite(accountId, type, itemId, metadata);
  } else {
    await removeFavorite(accountId, type, itemId);
  }
}

// Check if item is favorite
export async function isFavorite(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  itemId: string
): Promise<boolean> {
  try {
    const db = await getDB();
    const result = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM favorites WHERE account_id = ? AND kind = 'item' AND type = ? AND item_id = ?",
      [accountId, type, itemId]
    );
    return result && result.length > 0 && result[0].count > 0;
  } catch (error) {
    logger.error('Error checking favorite:', error);
    return false;
  }
}

// =========================
// FAVORITE CATEGORIES - Unified with favorites table using kind='category'
// =========================

// Load favorite categories
export async function loadFavoriteCategories(
  accountId: string,
  type: 'live' | 'vod' | 'series'
): Promise<string[]> {
  try {
    const db = await getDB();
    const result = await db.select<FavoriteItem[]>(
      "SELECT item_id FROM favorites WHERE account_id = ? AND kind = 'category' AND type = ?",
      [accountId, type]
    );
    return result.map(r => r.item_id);
  } catch (error) {
    logger.error('Error loading favorite categories:', error);
    return [];
  }
}

// Load all favorite categories for account (all types)
export async function loadAllFavoriteCategories(accountId: string): Promise<Record<string, string[]>> {
  try {
    const db = await getDB();
    const result = await db.select<FavoriteItem[]>(
      "SELECT type, item_id FROM favorites WHERE account_id = ? AND kind = 'category'",
      [accountId]
    );
    const grouped: Record<string, string[]> = { live: [], vod: [], series: [] };
    result.forEach(r => {
      if (grouped[r.type]) grouped[r.type].push(r.item_id);
    });
    return grouped;
  } catch (error) {
    logger.error('Error loading all favorite categories:', error);
    return { live: [], vod: [], series: [] };
  }
}

// Add favorite category
export async function addFavoriteCategory(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  categoryId: string,
  name?: string
): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    await db.execute(
      `INSERT INTO favorites (account_id, kind, type, item_id, name, created_at) 
       VALUES (?, 'category', ?, ?, ?, ?)
       ON CONFLICT(account_id, kind, type, item_id)
       DO UPDATE SET name=excluded.name`,
      [accountId, type, categoryId, name || 'Unknown', now]
    );
    logger.info('Added favorite category:', { accountId, type, categoryId });
  } catch (error) {
    logger.error('Error adding favorite category:', error);
    throw error;
  }
}

// Remove favorite category
export async function removeFavoriteCategory(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  categoryId: string
): Promise<void> {
  try {
    const db = await getDB();
    await db.execute(
      "DELETE FROM favorites WHERE account_id = ? AND kind = 'category' AND type = ? AND item_id = ?",
      [accountId, type, categoryId]
    );
    logger.info('Removed favorite category:', { accountId, type, categoryId });
  } catch (error) {
    logger.error('Error removing favorite category:', error);
    throw error;
  }
}

// Toggle favorite category
export async function toggleFavoriteCategory(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  categoryId: string,
  name?: string
): Promise<boolean> {
  const isFav = await isFavoriteCategory(accountId, type, categoryId);
  if (isFav) {
    await removeFavoriteCategory(accountId, type, categoryId);
    return false;
  } else {
    await addFavoriteCategory(accountId, type, categoryId, name);
    return true;
  }
}

// Check if category is favorite
export async function isFavoriteCategory(
  accountId: string,
  type: 'live' | 'vod' | 'series',
  categoryId: string
): Promise<boolean> {
  try {
    const db = await getDB();
    const result = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM favorites WHERE account_id = ? AND kind = 'category' AND type = ? AND item_id = ?",
      [accountId, type, categoryId]
    );
    return result && result.length > 0 && result[0].count > 0;
  } catch (error) {
    logger.error('Error checking favorite category:', error);
    return false;
  }
}

// React Query hook
export function useFavorites(accountId: string) {
  const queryClient = useQueryClient();
  const [tableReady, setTableReady] = useState(isTableReady);

  useEffect(() => {
    initFavoritesTable()
      .then(() => setTableReady(true))
      .catch(err => logger.error('Error initializing table:', err));
  }, []);

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', accountId],
    queryFn: () => loadFavorites(accountId),
    enabled: !!accountId && tableReady,
    staleTime: 0,
  });

  // O(1) lookup Set (items only - kind='item')
  const favoriteSet = useMemo(() => {
    return new Set(
      favorites
        .filter(f => f.kind === 'item')
        .map(f => `${f.type}:${f.item_id}`)
    );
  }, [favorites]);

  const isItemFavorite = (type: 'live' | 'vod' | 'series', itemId: string): boolean => {
    return favoriteSet.has(`${type}:${itemId}`);
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ type, itemId, isFavorite, metadata }: { 
      type: 'live' | 'vod' | 'series'; 
      itemId: string; 
      isFavorite: boolean; 
      metadata?: { name?: string; poster?: string; cmd?: string; parent_id?: string; season?: number; episode?: number; extra?: any };
    }) => {
      // Ensure itemId is string
      await toggleFavorite(accountId, type, String(itemId), isFavorite, metadata);
    },
    // Optimistic update
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', accountId] });
      const prev = queryClient.getQueryData<FavoriteItem[]>(['favorites', accountId]);
      
      queryClient.setQueryData(['favorites', accountId], (old: FavoriteItem[] = []) => {
        const itemIdStr = String(vars.itemId);
        if (vars.isFavorite) {
          return [...old, {
            id: Date.now(), // temp id
            account_id: accountId,
            kind: 'item',
            type: vars.type,
            item_id: itemIdStr,
            parent_id: vars.metadata?.parent_id,
            name: vars.metadata?.name || 'Unknown',
            poster: vars.metadata?.poster,
            cmd: vars.metadata?.cmd,
            season: vars.metadata?.season,
            episode: vars.metadata?.episode,
            extra: vars.metadata?.extra ? JSON.stringify(vars.metadata.extra) : undefined,
            created_at: Date.now(),
          }];
        } else {
          return old.filter(f => !(f.type === vars.type && String(f.item_id) === itemIdStr));
        }
      });
      
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['favorites', accountId], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', accountId] });
    },
  });

  const toggleItemFavorite = (type: 'live' | 'vod' | 'series', itemId: string, metadata?: { name?: string; poster?: string; cmd?: string; parent_id?: string; season?: number; episode?: number; extra?: any }) => {
    const currentlyFavorite = isItemFavorite(type, itemId);
    toggleMutation.mutate({ type, itemId, isFavorite: !currentlyFavorite, metadata });
  };

  return {
    favorites: favorites.filter(f => f.kind === 'item'), // exclude categories
    isLoading,
    isItemFavorite,
    toggleItemFavorite,
    isPending: toggleMutation.isPending,
  };
}

// Get favorite IDs as array of strings (for compatibility)
export function useFavoriteIds(accountId: string, type: 'live' | 'vod' | 'series') {
  const { favorites, isLoading } = useFavorites(accountId);
  
  const ids = favorites
    .filter(f => f.type === type)
    .map(f => f.item_id);

  return { ids, isLoading };
}

// =========================
// USE FAVORITE CATEGORIES HOOK
// =========================

export function useFavoriteCategories(accountId: string, type: 'live' | 'vod' | 'series') {
  const queryClient = useQueryClient();
  const [tableReady, setTableReady] = useState(isTableReady);

  useEffect(() => {
    initFavoritesTable()
      .then(() => setTableReady(true))
      .catch(err => logger.error('Error initializing table:', err));
  }, []);

  const { data: categoryIds = [], isLoading } = useQuery({
    queryKey: ['favorite-categories', accountId, type],
    queryFn: () => loadFavoriteCategories(accountId, type),
    enabled: !!accountId && tableReady,
    staleTime: 0,
  });

  const toggleCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, name }: { categoryId: string; name?: string }) => {
      return toggleFavoriteCategory(accountId, type, categoryId, name);
    },
    onMutate: async ({ categoryId }) => {
      await queryClient.cancelQueries({ queryKey: ['favorite-categories', accountId, type] });
      const prev = queryClient.getQueryData<string[]>(['favorite-categories', accountId, type]);

      queryClient.setQueryData(['favorite-categories', accountId, type], (old: string[] = []) => {
        if (old.includes(categoryId)) {
          return old.filter(id => id !== categoryId);
        } else {
          return [...old, categoryId];
        }
      });

      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['favorite-categories', accountId, type], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-categories', accountId, type] });
    },
  });

  const toggleCategory = (categoryId: string, name?: string) => {
    toggleCategoryMutation.mutate({ categoryId, name });
  };

  const isCategoryFavorite = (categoryId: string): boolean => {
    return categoryIds.includes(categoryId);
  };

  return {
    categoryIds,
    isLoading,
    isCategoryFavorite,
    toggleCategory,
    isPending: toggleCategoryMutation.isPending,
  };
}
