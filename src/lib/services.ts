import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { favorites, watchHistory } from '@/lib/schema';
import { StalkerChannel, FavoriteChannel, WatchHistory } from '@/types';

export class FavoritesService {
  private static instance: FavoritesService;

  private constructor() {}

  static getInstance(): FavoritesService {
    if (!FavoritesService.instance) {
      FavoritesService.instance = new FavoritesService();
    }
    return FavoritesService.instance;
  }

  async addToFavorites(accountId: string, channel: StalkerChannel): Promise<void> {
    try {
      // Check if already in favorites
      const existing = await db.select()
        .from(favorites)
        .where(and(
          eq(favorites.channelId, String(channel.id))
        ))
        .limit(1);

      if (existing.length > 0) {
        return; // Already in favorites
      }

      await db.insert(favorites).values({
        id: crypto.randomUUID(),
        accountId,
        channelId: String(channel.id),
        channelName: channel.name,
        addedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to add to favorites:', error);
      throw new Error('Failed to add channel to favorites');
    }
  }

  async removeFromFavorites(accountId: string, channelId: string): Promise<void> {
    try {
      await db.delete(favorites)
        .where(and(
          eq(favorites.accountId, accountId),
          eq(favorites.channelId, channelId)
        ));
    } catch (error) {
      console.error('Failed to remove from favorites:', error);
      throw new Error('Failed to remove channel from favorites');
    }
  }

  async getFavorites(accountId: string): Promise<FavoriteChannel[]> {
    try {
      const results = await db.select()
        .from(favorites)
        .where(eq(favorites.accountId, accountId))
        .orderBy(desc(favorites.addedAt));

      return results.map(row => ({
        id: row.id,
        accountId: row.accountId,
        channelId: Number.parseInt(row.channelId) || 0,
        channelName: row.channelName,
        channelNumber: Number.parseInt(row.channelId) || 0,
        addedAt: row.addedAt ? new Date(row.addedAt) : new Date(),
      }));
    } catch (error) {
      console.error('Failed to get favorites:', error);
      return [];
    }
  }

  async isFavorite(accountId: string, channelId: string): Promise<boolean> {
    try {
      const result = await db.select()
        .from(favorites)
        .where(and(
          eq(favorites.accountId, accountId),
          eq(favorites.channelId, channelId)
        ))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error('Failed to check favorite status:', error);
      return false;
    }
  }

  async toggleFavorite(accountId: string, channel: StalkerChannel): Promise<boolean> {
    const isFavorite = await this.isFavorite(accountId, String(channel.id));
    
    if (isFavorite) {
      await this.removeFromFavorites(accountId, String(channel.id));
      return false;
    } else {
      await this.addToFavorites(accountId, channel);
      return true;
    }
  }
}

export class HistoryService {
  private static instance: HistoryService;

  private constructor() {}

  static getInstance(): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService();
    }
    return HistoryService.instance;
  }

  async addToHistory(accountId: string, channel: StalkerChannel, watchDuration?: number): Promise<void> {
    try {
      await db.insert(watchHistory).values({
        id: crypto.randomUUID(),
        accountId,
        channelId: String(channel.id),
        channelName: channel.name,
        watchedAt: new Date(),
        duration: watchDuration,
      });
    } catch (error) {
      console.error('Failed to add to history:', error);
      throw new Error('Failed to add channel to history');
    }
  }

  async getHistory(accountId: string, limit: number = 50): Promise<WatchHistory[]> {
    try {
      const results = await db.select()
        .from(watchHistory)
        .where(eq(watchHistory.accountId, accountId))
        .orderBy(desc(watchHistory.watchedAt))
        .limit(limit);

      return results.map(row => ({
        id: row.id,
        accountId: row.accountId,
        channelId: Number.parseInt(row.channelId) || 0,
        channelName: row.channelName,
        watchedAt: new Date(row.watchedAt || new Date()),
        duration: row.duration || 0,
      }));
    } catch (error) {
      console.error('Failed to get history:', error);
      return [];
    }
  }

  async clearHistory(accountId: string): Promise<void> {
    try {
      await db.delete(watchHistory)
        .where(eq(watchHistory.accountId, accountId));
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw new Error('Failed to clear watch history');
    }
  }

  async removeFromHistory(accountId: string, historyId: string): Promise<void> {
    try {
      await db.delete(watchHistory)
        .where(and(
          eq(watchHistory.accountId, accountId),
          eq(watchHistory.id, historyId)
        ));
    } catch (error) {
      console.error('Failed to remove from history:', error);
      throw new Error('Failed to remove item from history');
    }
  }

  async getRecentlyWatched(accountId: string, limit: number = 10): Promise<WatchHistory[]> {
    return this.getHistory(accountId, limit);
  }

  async getMostWatchedChannels(accountId: string, limit: number = 10): Promise<{ channelId: string; channelName: string; count: number }[]> {
    try {
      const results = await db.select({
        channelId: watchHistory.channelId,
        channelName: watchHistory.channelName,
        count: count(watchHistory.id),
      })
        .from(watchHistory)
        .where(eq(watchHistory.accountId, accountId))
        .groupBy(watchHistory.channelId, watchHistory.channelName)
        .orderBy(desc(count(watchHistory.id)))
        .limit(limit);

      return results.map(row => ({
        channelId: row.channelId,
        channelName: row.channelName,
        count: Number(row.count),
      }));
    } catch (error) {
      console.error('Failed to get most watched channels:', error);
      return [];
    }
  }
}

export const favoritesService = FavoritesService.getInstance();
export const historyService = HistoryService.getInstance();
