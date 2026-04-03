import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Accounts table - stores Stalker portal accounts
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  portalUrl: text('portal_url').notNull(),
  mac: text('mac').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  lastUsed: integer('last_used', { mode: 'timestamp' }).default(new Date()),
  token: text('token'),
  expiry: integer('expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
});

// Channels table - cached channel data for each account
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  streamUrl: text('stream_url').notNull(),
  categoryId: integer('category_id').notNull(),
  categoryName: text('category_name').notNull(),
  tvArchive: integer('tv_archive', { mode: 'boolean' }).default(false),
  protected: integer('protected', { mode: 'boolean' }).default(false),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(new Date()),
});

// Genres table - channel categories
export const genres = sqliteTable('genres', {
  id: integer('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(new Date()),
});

// VOD table - video on demand content
export const vod = sqliteTable('vod', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  streamUrl: text('stream_url').notNull(),
  categoryId: integer('category_id').notNull(),
  categoryName: text('category_name').notNull(),
  year: integer('year'),
  rating: real('rating'),
  duration: integer('duration'), // in seconds
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(new Date()),
});

// Favorites table - user's favorite channels (global across accounts)
export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull(),
  channelName: text('channel_name').notNull(),
  addedAt: integer('added_at', { mode: 'timestamp' }).default(new Date()),
});

// Watch history table - global watch history across accounts
export const watchHistory = sqliteTable('watch_history', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull(),
  channelName: text('channel_name').notNull(),
  watchedAt: integer('watched_at', { mode: 'timestamp' }).default(new Date()),
  duration: integer('duration'), // watch duration in seconds
});

// Settings table - application settings
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
});

// Relations
export const accountsRelations = relations(accounts, ({ many }) => ({
  channels: many(channels),
  genres: many(genres),
  vod: many(vod),
  favorites: many(favorites),
  watchHistory: many(watchHistory),
}));

export const channelsRelations = relations(channels, ({ one }) => ({
  account: one(accounts, {
    fields: [channels.accountId],
    references: [accounts.id],
  }),
}));

export const genresRelations = relations(genres, ({ one }) => ({
  account: one(accounts, {
    fields: [genres.accountId],
    references: [accounts.id],
  }),
}));

export const vodRelations = relations(vod, ({ one }) => ({
  account: one(accounts, {
    fields: [vod.accountId],
    references: [accounts.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  account: one(accounts, {
    fields: [favorites.accountId],
    references: [accounts.id],
  }),
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
  account: one(accounts, {
    fields: [watchHistory.accountId],
    references: [accounts.id],
  }),
}));
