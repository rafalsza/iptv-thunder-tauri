// =========================
// ❤️ FAVORITES HOOK - SQLite Storage (Optimized) v5
// Cache-bust: 2024-04-01-005-no-migration
// =========================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import Database from '@tauri-apps/plugin-sql';
import { createLogger } from '../lib/logger';

interface FavoriteItem {
  id: number;
  portal_id: string;
  type: 'live' | 'vod' | 'series';
  item_id: number | string;
  name?: string;
  poster?: string;
  poster_local?: string;
  cmd?: string;
  created_at: number;
  updated_at: number;
}

// Singleton DB instance
let dbInstance: Database | null = null;

const logger = createLogger('Favorites');

async function getDB(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:iptv_data.db');
  }
  return dbInstance;
}

// Initialize favorites table
export async function initFavoritesTable(): Promise<void> {
  logger.info('Initializing table...');
  try {
    const db = await getDB();
    
    // Create table with all columns
    await db.execute(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portal_id TEXT NOT NULL,
        type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        name TEXT,
        poster TEXT,
        poster_local TEXT,
        cmd TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(portal_id, type, item_id)
      )
    `);
    
    // Indexes
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_fav_lookup 
      ON favorites(portal_id, type, item_id)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_fav_portal 
      ON favorites(portal_id)
    `);
    
    logger.info('Table initialized successfully');
  } catch (error) {
    logger.error('Error initializing table:', error);
    throw error;
  }
}

// Load favorites
export async function loadFavorites(portalId: string): Promise<FavoriteItem[]> {
  try {
    const db = await getDB();
    const result = await db.select<FavoriteItem[]>(
      'SELECT * FROM favorites WHERE portal_id = ? ORDER BY updated_at DESC',
      [portalId]
    );
    return result || [];
  } catch (error) {
    logger.error('Error loading favorites:', error);
    return [];
  }
}

// Add/update favorite with metadata (UPSERT)
export async function addFavorite(
  portalId: string,
  type: 'live' | 'vod' | 'series',
  itemId: number | string,
  metadata?: { name?: string; poster?: string; cmd?: string }
): Promise<void> {
  logger.info('Upserting:', { portalId, type, itemId, metadata });
  try {
    const db = await getDB();
    const now = Date.now();
    await db.execute(
      `INSERT INTO favorites (portal_id, type, item_id, name, poster, cmd, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(portal_id, type, item_id)
       DO UPDATE SET
         name=excluded.name,
         poster=excluded.poster,
         cmd=excluded.cmd,
         updated_at=excluded.updated_at`,
      [portalId, type, itemId, metadata?.name || null, metadata?.poster || null, metadata?.cmd || null, now, now]
    );
    logger.info('Upserted successfully');
  } catch (error) {
    logger.error('Error upserting favorite:', error);
    throw error;
  }
}

// Remove item from favorites
export async function removeFavorite(
  portalId: string,
  type: 'live' | 'vod' | 'series',
  itemId: number | string
): Promise<void> {
  try {
    const db = await getDB();
    await db.execute(
      'DELETE FROM favorites WHERE portal_id = ? AND type = ? AND item_id = ?',
      [portalId, type, itemId]
    );
  } catch (error) {
    logger.error('Error removing favorite:', error);
    throw error;
  }
}

// Toggle favorite status with metadata
export async function toggleFavorite(
  portalId: string,
  type: 'live' | 'vod' | 'series',
  itemId: number | string,
  isFavorite: boolean,
  metadata?: { name?: string; poster?: string; cmd?: string }
): Promise<void> {
  if (isFavorite) {
    await addFavorite(portalId, type, itemId, metadata);
  } else {
    await removeFavorite(portalId, type, itemId);
  }
}

// Check if item is favorite
export async function isFavorite(
  portalId: string,
  type: 'live' | 'vod' | 'series',
  itemId: number | string
): Promise<boolean> {
  try {
    const db = await getDB();
    const result = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM favorites WHERE portal_id = ? AND type = ? AND item_id = ?',
      [portalId, type, itemId]
    );
    return result && result.length > 0 && result[0].count > 0;
  } catch (error) {
    logger.error('Error checking favorite:', error);
    return false;
  }
}

// React Query hook
export function useFavorites(portalId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    initFavoritesTable().catch(err => logger.error('Error initializing table:', err));
  }, []);

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', portalId],
    queryFn: () => loadFavorites(portalId),
    enabled: !!portalId,
    staleTime: 0,
  });

  // O(1) lookup Set
  const favoriteSet = useMemo(() => {
    return new Set(favorites.map(f => `${f.type}:${f.item_id}`));
  }, [favorites]);

  const isItemFavorite = (type: 'live' | 'vod' | 'series', itemId: number | string): boolean => {
    return favoriteSet.has(`${type}:${itemId}`);
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ type, itemId, isFavorite, metadata }: { 
      type: 'live' | 'vod' | 'series'; 
      itemId: number | string; 
      isFavorite: boolean; 
      metadata?: { name?: string; poster?: string; cmd?: string };
    }) => {
      await toggleFavorite(portalId, type, itemId, isFavorite, metadata);
    },
    // Optimistic update
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', portalId] });
      const prev = queryClient.getQueryData<FavoriteItem[]>(['favorites', portalId]);
      
      queryClient.setQueryData(['favorites', portalId], (old: FavoriteItem[] = []) => {
        if (vars.isFavorite) {
          return [...old, {
            id: Date.now(), // temp id
            portal_id: portalId,
            type: vars.type,
            item_id: vars.itemId,
            name: vars.metadata?.name,
            poster: vars.metadata?.poster,
            cmd: vars.metadata?.cmd,
            created_at: Date.now(),
            updated_at: Date.now(),
          }];
        } else {
          return old.filter(f => !(f.type === vars.type && f.item_id === vars.itemId));
        }
      });
      
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['favorites', portalId], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', portalId] });
    },
  });

  const toggleItemFavorite = (type: 'live' | 'vod' | 'series', itemId: number | string, metadata?: { name?: string; poster?: string; cmd?: string }) => {
    const currentlyFavorite = isItemFavorite(type, itemId);
    toggleMutation.mutate({ type, itemId, isFavorite: !currentlyFavorite, metadata });
  };

  return {
    favorites,
    isLoading,
    isItemFavorite,
    toggleItemFavorite,
    isPending: toggleMutation.isPending,
  };
}

// Get favorite IDs as array of strings (for compatibility)
export function useFavoriteIds(portalId: string, type: 'live' | 'vod' | 'series') {
  const { favorites, isLoading } = useFavorites(portalId);
  
  const ids = favorites
    .filter(f => f.type === type)
    .map(f => f.item_id.toString());

  return { ids, isLoading };
}
