import Database from '@tauri-apps/plugin-sql';
import { clearTauriStore } from '@/lib/tauriStorage';

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

const DB_PATH = 'sqlite:iptv_data.db';
const BATCH_SIZE = 100;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  
  // Prevent concurrent initialization
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    const db = await Database.load(DB_PATH);
    await initSchema(db);
    dbInstance = db;
    return db;
  })();
  
  return initPromise;
}

async function initSchema(db: Database): Promise<void> {
  // Check if any table exists but missing portal_id column - if so, drop them all
  try {
    console.log('[Database] Checking schema...');
    
    // Check all main tables
    const tablesToCheck = ['channels', 'vod', 'series', 'series_seasons', 'series_episodes', 'epg'];
    let hasOldSchema = false;
    
    for (const table of tablesToCheck) {
      try {
        const tableInfo = await db.select<{name: string, type: string}[]>(`PRAGMA table_info(${table})`);
        if (tableInfo.length > 0) {
          const hasPortalId = tableInfo.some(col => col.name === 'portal_id');
          console.log(`[Database] ${table} columns:`, tableInfo.map(c => c.name).join(', '), '- has portal_id:', hasPortalId);
          if (!hasPortalId) {
            hasOldSchema = true;
            console.log(`[Database] ${table} missing portal_id!`);
          }
        }
      } catch (e) {
        console.log(`[Database] ${table} check error:`, e);
      }
    }
    
    if (hasOldSchema) {
      console.log('[Database] Old schema detected - dropping all tables to recreate with portal_id');
      // Drop child tables first (with FKs) to avoid constraint errors
      await db.execute('DROP TABLE IF EXISTS series_episodes');
      await db.execute('DROP TABLE IF EXISTS series_seasons');
      await db.execute('DROP TABLE IF EXISTS epg');
      await db.execute('DROP TABLE IF EXISTS series');
      await db.execute('DROP TABLE IF EXISTS vod');
      await db.execute('DROP TABLE IF EXISTS channels');
      console.log('[Database] Tables dropped');
      
      // Continue to CREATE TABLE statements below (don't reset)
      console.log('[Database] Recreating tables with new schema...');
    } else {
      console.log('[Database] Schema OK');
    }
  } catch (e) {
    console.log('[Database] Schema check error:', e);
  }

  // Migration: Add added column to series table if missing
  try {
    const seriesInfo = await db.select<{name: string, type: string}[]>(`PRAGMA table_info(series)`);
    if (seriesInfo.length > 0) {
      const hasAdded = seriesInfo.some(col => col.name === 'added');
      if (!hasAdded) {
        console.log('[Database] Migration: Adding added column to series table');
        await db.execute('ALTER TABLE series ADD COLUMN added INTEGER');
        console.log('[Database] Migration: added column added');
      }
    }
  } catch (e) {
    console.log('[Database] Migration error (added column):', e);
  }

  // Migration: Add category_id to series table if missing
  try {
    const seriesInfo = await db.select<{name: string, type: string}[]>(`PRAGMA table_info(series)`);
    if (seriesInfo.length > 0) {
      const hasCategoryId = seriesInfo.some(col => col.name === 'category_id');
      if (!hasCategoryId) {
        console.log('[Database] Migration: Adding category_id column to series table');
        await db.execute('ALTER TABLE series ADD COLUMN category_id TEXT');
        console.log('[Database] Migration: category_id column added');
      }
    }
  } catch (e) {
    console.log('[Database] Migration error:', e);
  }

  // Channels table with portal_id and composite PK
  await db.execute(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER,
      portal_id TEXT NOT NULL,
      name TEXT NOT NULL,
      stream_url TEXT,
      icon_url TEXT,
      genre_id TEXT,
      genre_name TEXT,
      epg_channel_id TEXT,
      order_num INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (id, portal_id)
    )
  `);

  // VOD/Movies table with portal_id and composite PK
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vod (
      id INTEGER,
      portal_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      poster_url TEXT,
      poster_local TEXT,
      stream_url TEXT,
      year INTEGER,
      rating REAL,
      duration INTEGER,
      genre TEXT,
      director TEXT,
      actors TEXT,
      added INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (id, portal_id)
    )
  `);

  // Series table with portal_id and composite PK
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER,
      portal_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      poster_url TEXT,
      poster_local TEXT,
      year INTEGER,
      rating REAL,
      genre TEXT,
      category_id TEXT,
      added INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (id, portal_id)
    )
  `);

  // Series seasons with portal_id
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_seasons (
      id INTEGER,
      series_id INTEGER NOT NULL,
      portal_id TEXT NOT NULL,
      season_number INTEGER NOT NULL,
      name TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (id, portal_id),
      FOREIGN KEY (series_id, portal_id) REFERENCES series(id, portal_id) ON DELETE CASCADE
    )
  `);

  // Series episodes with portal_id
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_episodes (
      id INTEGER,
      series_id INTEGER NOT NULL,
      season_id INTEGER NOT NULL,
      portal_id TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      name TEXT,
      stream_url TEXT,
      duration INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (id, series_id, portal_id),
      FOREIGN KEY (series_id, portal_id) REFERENCES series(id, portal_id) ON DELETE CASCADE,
      FOREIGN KEY (season_id, portal_id) REFERENCES series_seasons(id, portal_id) ON DELETE CASCADE
    )
  `);

  // EPG data table with portal_id and INTEGER timestamps
  await db.execute(`
    CREATE TABLE IF NOT EXISTS epg (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      portal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Create optimized indexes
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_channels_portal ON channels(portal_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_channels_genre ON channels(portal_id, genre_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_channels_updated ON channels(portal_id, updated_at)`);
  
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vod_portal ON vod(portal_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vod_genre ON vod(portal_id, genre)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vod_updated ON vod(portal_id, updated_at)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vod_name ON vod(name COLLATE NOCASE)`);
  
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_series_portal ON series(portal_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_series_category ON series(portal_id, category_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_series_updated ON series(portal_id, updated_at)`);
  
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_seasons_portal ON series_seasons(portal_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_episodes_portal ON series_episodes(portal_id)`);
  
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_epg_portal_time ON epg(portal_id, channel_id, start_time)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_epg_channel_time ON epg(channel_id, portal_id, start_time, end_time)`);
}

// Channels API
export async function saveChannels(channels: Channel[], portalId: string): Promise<void> {
  console.log('[Database] saveChannels called with', channels.length, 'channels for portal', portalId);
  const db = await getDb();
  const now = Date.now();

  // Remove old channels for this portal
  await db.execute('DELETE FROM channels WHERE portal_id = ?', [portalId]);

  if (channels.length === 0) return;

  // Batch insert with UPSERT
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const chunk = channels.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');

    const query = `
      INSERT INTO channels
        (id, portal_id, name, stream_url, icon_url, genre_id, genre_name, epg_channel_id, order_num, updated_at)
      VALUES ${placeholders}
      ON CONFLICT(id, portal_id) DO UPDATE SET
        name = excluded.name,
        stream_url = excluded.stream_url,
        icon_url = excluded.icon_url,
        genre_id = excluded.genre_id,
        genre_name = excluded.genre_name,
        epg_channel_id = excluded.epg_channel_id,
        order_num = excluded.order_num,
        updated_at = excluded.updated_at
    `;

    const params = chunk.flatMap(ch => [
      Number(ch.id) || 0,
      portalId,
      ch.name,
      ch.streamUrl || null,
      ch.iconUrl || null,
      ch.genreId || null,
      ch.genreName || null,
      ch.epgChannelId || null,
      ch.orderNum || 0,
      now
    ]);

    await db.execute(query, params);
  }

  console.log('[Database] Saved', channels.length, 'channels for portal', portalId);
}

export async function getChannels(portalId: string, genreId?: string, limit?: number, offset?: number): Promise<Channel[]> {
  const db = await getDb();
  
  let query = 'SELECT * FROM channels WHERE portal_id = ?';
  const params: (string | number)[] = [portalId];
  
  if (genreId) {
    query += ' AND genre_id = ?';
    params.push(genreId);
  }
  
  query += ' ORDER BY order_num, name COLLATE NOCASE';
  
  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }
  
  const rows = await db.select<DbChannel[]>(query, params);
  return rows.map(row => ({
    id: row.id.toString(),
    name: row.name,
    streamUrl: row.stream_url,
    iconUrl: row.icon_url,
    genreId: row.genre_id,
    genreName: row.genre_name,
    epgChannelId: row.epg_channel_id,
    orderNum: row.order_num,
  }));
}

export async function getChannelCount(portalId: string, genreId?: string): Promise<number> {
  const db = await getDb();
  let query = 'SELECT COUNT(*) as count FROM channels WHERE portal_id = ?';
  const params: (string)[] = [portalId];
  
  if (genreId) {
    query += ' AND genre_id = ?';
    params.push(genreId);
  }
  
  const result = await db.select<{count: number}[]>(query, params);
  return result[0]?.count || 0;
}

// VOD API
export async function saveVod(vodList: Vod[], portalId: string): Promise<void> {
  console.log('[Database] saveVod called with', vodList.length, 'items for portal', portalId);
  const db = await getDb();
  const now = Date.now();

  if (vodList.length === 0) return;

  // Batch insert with UPSERT - do not delete, append/update only
  for (let i = 0; i < vodList.length; i += BATCH_SIZE) {
    const chunk = vodList.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');

    const query = `
      INSERT INTO vod
        (id, portal_id, name, description, poster_url, poster_local, stream_url, year, rating, duration, genre, director, actors, added, updated_at)
      VALUES ${placeholders}
      ON CONFLICT(id, portal_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        poster_url = excluded.poster_url,
        poster_local = excluded.poster_local,
        stream_url = excluded.stream_url,
        year = excluded.year,
        rating = excluded.rating,
        duration = excluded.duration,
        genre = excluded.genre,
        director = excluded.director,
        actors = excluded.actors,
        added = excluded.added,
        updated_at = excluded.updated_at
    `;

    const params = chunk.flatMap(vod => [
      Number(vod.id) || 0,
      portalId,
      vod.name,
      vod.description || null,
      vod.posterUrl || null,
      vod.posterLocal || null,
      vod.streamUrl || null,
      vod.year || null,
      vod.rating || null,
      vod.duration || null,
      vod.genre || null,
      vod.director || null,
      vod.actors || null,
      vod.added ? new Date(vod.added).getTime() : null,
      now
    ]);

    await db.execute(query, params);
  }

  console.log('[Database] Saved', vodList.length, 'VOD items for portal', portalId);
}

export async function getVod(portalId: string, genre?: string, limit?: number, offset?: number): Promise<Vod[]> {
  const db = await getDb();
  
  let query = 'SELECT * FROM vod WHERE portal_id = ?';
  const params: (string | number)[] = [portalId];
  
  if (genre) {
    query += ' AND genre = ?';
    params.push(genre);
  }
  
  query += ' ORDER BY name COLLATE NOCASE';
  
  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }
  
  const rows = await db.select<DbVod[]>(query, params);
  return rows.map(row => ({
    id: row.id.toString(),
    name: row.name,
    description: row.description,
    posterUrl: row.poster_url,
    posterLocal: row.poster_local,
    streamUrl: row.stream_url,
    year: row.year,
    rating: row.rating,
    duration: row.duration,
    genre: row.genre,
    director: row.director,
    actors: row.actors,
    added: row.added,
  }));
}

export async function getVodCount(portalId: string, genre?: string): Promise<number> {
  const db = await getDb();
  let query = 'SELECT COUNT(*) as count FROM vod WHERE portal_id = ?';
  const params: (string)[] = [portalId];
  
  if (genre) {
    query += ' AND genre = ?';
    params.push(genre);
  }
  
  const result = await db.select<{count: number}[]>(query, params);
  return result[0]?.count || 0;
}

// Series API
export async function saveSeries(seriesList: Series[], portalId: string, categoryId?: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  if (seriesList.length === 0) return;

  // Batch insert with UPSERT
  for (let i = 0; i < seriesList.length; i += BATCH_SIZE) {
    const chunk = seriesList.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');

    const query = `
      INSERT INTO series
        (id, portal_id, name, description, poster_url, year, rating, genre, category_id, added, updated_at)
      VALUES ${placeholders}
      ON CONFLICT(id, portal_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        poster_url = excluded.poster_url,
        year = excluded.year,
        rating = excluded.rating,
        genre = excluded.genre,
        category_id = excluded.category_id,
        added = excluded.added,
        updated_at = excluded.updated_at
    `;

    const params = chunk.flatMap(s => {
      // Handle ID format "41873:41873" - take first part before colon
      const idStr = s.id?.toString() || '';
      const cleanId = idStr.split(':')[0];
      const id = Number(cleanId) || 0;
      
      return [
        id,
        portalId,
        s.name,
        s.description || null,
        s.posterUrl || null,
        s.year || null,
        s.rating || null,
        s.genre || null,
        categoryId || s.categoryId || null,
        s.added ? Number(s.added) : null,
        now
      ];
    });

    await db.execute(query, params);
  }
}

export async function getSeries(portalId: string, categoryId?: string, limit?: number, offset?: number): Promise<Series[]> {
  const db = await getDb();
  
  let query = 'SELECT * FROM series WHERE portal_id = ?';
  const params: (string | number)[] = [portalId];
  
  if (categoryId) {
    query += ' AND category_id = ?';
    params.push(categoryId);
  }
  
  query += ' ORDER BY added DESC, name COLLATE NOCASE';
  
  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }
  
  const rows = await db.select<DbSeries[]>(query, params);
  return rows.map(row => ({
    id: row.id.toString(),
    name: row.name,
    description: row.description,
    posterUrl: row.poster_url,
    year: row.year,
    rating: row.rating,
    genre: row.genre,
    categoryId: row.category_id,
    added: row.added,
  }));
}
export async function saveEpg(epgData: EpgEntry[], portalId: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();

  // Remove old expired EPG for this portal using INTEGER timestamps (milliseconds)
  const cutoff = now - 24 * 60 * 60 * 1000; // 24 hours ago
  await db.execute('DELETE FROM epg WHERE portal_id = ? AND end_time < ?', [portalId, cutoff]);

  if (epgData.length === 0) return;

  // Batch insert with UPSERT
  for (let i = 0; i < epgData.length; i += BATCH_SIZE) {
    const chunk = epgData.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');

    const query = `
      INSERT INTO epg
        (channel_id, portal_id, title, description, start_time, end_time)
      VALUES ${placeholders}
      ON CONFLICT DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        start_time = excluded.start_time,
        end_time = excluded.end_time
    `;

    const params = chunk.flatMap(entry => [
      Number(entry.channelId) || 0,
      portalId,
      entry.title,
      entry.description || null,
      Number(entry.startTime) || 0,
      Number(entry.endTime) || 0
    ]);

    await db.execute(query, params);
  }

  console.log('[Database] Saved', epgData.length, 'EPG entries for portal', portalId);
}

export async function getEpgForChannel(channelId: string, portalId: string, from: number, to: number): Promise<EpgEntry[]> {
  const db = await getDb();
  
  // Use overlap query: programs that overlap with the given time range
  // start_time < to AND end_time > from
  const rows = await db.select<DbEpg[]>(
    `SELECT * FROM epg 
     WHERE channel_id = ? AND portal_id = ? 
     AND start_time < ? AND end_time > ?
     ORDER BY start_time`,
    [Number(channelId), portalId, to, from]
  );

  return rows.map(row => ({
    id: row.id,
    channelId: row.channel_id.toString(),
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export async function getCurrentEpgForChannel(channelId: string, portalId: string, timestamp?: number): Promise<EpgEntry | null> {
  const db = await getDb();
  const now = timestamp || Date.now();
  
  const rows = await db.select<DbEpg[]>(
    `SELECT * FROM epg 
     WHERE channel_id = ? AND portal_id = ? 
     AND start_time <= ? AND end_time > ?
     ORDER BY start_time DESC
     LIMIT 1`,
    [Number(channelId), portalId, now, now]
  );

  if (rows.length === 0) return null;
  
  return {
    id: rows[0].id,
    channelId: rows[0].channel_id.toString(),
    title: rows[0].title,
    description: rows[0].description,
    startTime: rows[0].start_time,
    endTime: rows[0].end_time,
  };
}

// Search
export async function searchChannels(query: string, portalId: string, limit: number = 50): Promise<Channel[]> {
  const db = await getDb();
  const rows = await db.select<DbChannel[]>(
    `SELECT * FROM channels 
     WHERE portal_id = ? AND name LIKE ? 
     ORDER BY name COLLATE NOCASE 
     LIMIT ?`,
    [portalId, `%${query}%`, limit]
  );
  return rows.map(row => ({
    id: row.id.toString(),
    name: row.name,
    streamUrl: row.stream_url,
    iconUrl: row.icon_url,
    genreId: row.genre_id,
    genreName: row.genre_name,
    epgChannelId: row.epg_channel_id,
    orderNum: row.order_num,
  }));
}

export async function searchVod(query: string, portalId: string, limit: number = 50): Promise<Vod[]> {
  const db = await getDb();
  const rows = await db.select<DbVod[]>(
    `SELECT * FROM vod 
     WHERE portal_id = ? AND (name LIKE ? OR description LIKE ?) 
     ORDER BY name COLLATE NOCASE 
     LIMIT ?`,
    [portalId, `%${query}%`, `%${query}%`, limit]
  );
  return rows.map(row => ({
    id: row.id.toString(),
    name: row.name,
    description: row.description,
    posterUrl: row.poster_url,
    posterLocal: row.poster_local,
    streamUrl: row.stream_url,
    year: row.year,
    rating: row.rating,
    duration: row.duration,
    genre: row.genre,
    director: row.director,
    actors: row.actors,
    added: row.added,
  }));
}

export async function resetDatabase(): Promise<void> {
  console.log('[Database] Resetting database - closing and clearing instance...');
  
  // Close existing connection if any
  if (dbInstance) {
    try {
      await dbInstance.close();
    } catch (e) {
      // Ignore close errors
    }
    dbInstance = null;
    initPromise = null;
  }
  
  // Re-initialize fresh
  await getDb();
  console.log('[Database] Database reset complete - fresh connection established');
}

export async function dropAllTables(): Promise<void> {
  const db = await getDb();
  console.log('[Database] Dropping all tables...');
  
  try {
    await db.execute('DROP TABLE IF EXISTS epg');
    await db.execute('DROP TABLE IF EXISTS series_episodes');
    await db.execute('DROP TABLE IF EXISTS series_seasons');
    await db.execute('DROP TABLE IF EXISTS series');
    await db.execute('DROP TABLE IF EXISTS vod');
    await db.execute('DROP TABLE IF EXISTS channels');
    await db.execute('DROP TABLE IF EXISTS categories');
    await db.execute('DROP TABLE IF EXISTS favorites');
    
    console.log('[Database] All tables dropped successfully');
  } catch (error) {
    console.error('[Database] Error dropping tables:', error);
    throw error;
  }
  
  // Reset connection to recreate tables on next use
  await resetDatabase();
}

// Cleanup
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.execute('BEGIN TRANSACTION');
  try {
    await db.execute('DELETE FROM channels');
    await db.execute('DELETE FROM vod');
    await db.execute('DELETE FROM epg');
    await db.execute('DELETE FROM series_episodes');
    await db.execute('DELETE FROM series_seasons');
    await db.execute('DELETE FROM series');
    await db.execute('COMMIT');
    console.log('[Database] All data cleared');
  } catch (error) {
    await db.execute('ROLLBACK');
    throw error;
  }
}

export async function clearAllDataForPortal(portalId: string): Promise<void> {
  try {
    const db = await getDb();
    
    // Count before delete
    const counts = await db.select<{name: string, count: number}[]>(`
      SELECT 'channels' as name, COUNT(*) as count FROM channels WHERE portal_id = ?
      UNION ALL
      SELECT 'vod', COUNT(*) FROM vod WHERE portal_id = ?
      UNION ALL
      SELECT 'series', COUNT(*) FROM series WHERE portal_id = ?
      UNION ALL
      SELECT 'series_seasons', COUNT(*) FROM series_seasons WHERE portal_id = ?
      UNION ALL
      SELECT 'series_episodes', COUNT(*) FROM series_episodes WHERE portal_id = ?
      UNION ALL
      SELECT 'epg', COUNT(*) FROM epg WHERE portal_id = ?
      UNION ALL
      SELECT 'categories', COUNT(*) FROM categories WHERE portal_id = ?
      UNION ALL
      SELECT 'favorites', COUNT(*) FROM favorites WHERE portal_id = ?
    `, [portalId, portalId, portalId, portalId, portalId, portalId, portalId, portalId]);
    
    await db.execute('BEGIN TRANSACTION');
    try {
      await db.execute('DELETE FROM channels WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM vod WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM series WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM series_seasons WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM series_episodes WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM epg WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM categories WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM favorites WHERE portal_id = ?', [portalId]);
      await db.execute('COMMIT');
      
      const totalDeleted = counts.reduce((sum, c) => sum + c.count, 0);
      console.log(`[Database] Cleared ${totalDeleted} total rows for portal ${portalId}:`, 
        counts.filter(c => c.count > 0).map(c => `${c.name}: ${c.count}`).join(', ') || 'no data'
      );
    } catch (error: any) {
      const errorMsg = error?.message?.toLowerCase() || '';
      const isTransactionClosedError = errorMsg.includes('cannot rollback') || errorMsg.includes('no transaction is active');
      
      if (!isTransactionClosedError) {
        try {
          await db.execute('ROLLBACK');
        } catch (rollbackError) {
          // Ignore - transaction already closed
        }
      }
      throw error;
    }
  } catch (error: any) {
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('no such column') || errMsg.includes('no such table')) {
      console.log('[Database] Some tables missing portal_id, skipping cleanup');
      return;
    }
    throw error;
  }
}

export async function clearChannelsForPortal(portalId: string): Promise<void> {
  try {
    const db = await getDb();
    // Count before delete
    const countBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM channels WHERE portal_id = ?', 
      [portalId]
    );
    const epgCountBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM epg WHERE portal_id = ?', 
      [portalId]
    );
    
    await db.execute('BEGIN TRANSACTION');
    try {
      await db.execute('DELETE FROM channels WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM epg WHERE portal_id = ?', [portalId]);
      await db.execute('COMMIT');
      console.log(`[Database] Cleared ${countBefore[0]?.count || 0} channels and ${epgCountBefore[0]?.count || 0} EPG entries for portal ${portalId}`);
    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('no such column') || errMsg.includes('no such table')) {
      console.log('[Database] Table missing portal_id column or table, skipping cleanup');
      return;
    }
    throw error;
  }
}

export async function clearVodForPortal(portalId: string): Promise<void> {
  try {
    const db = await getDb();
    // Count before delete
    const countBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM vod WHERE portal_id = ?', 
      [portalId]
    );
    
    await db.execute('DELETE FROM vod WHERE portal_id = ?', [portalId]);
    console.log(`[Database] Cleared ${countBefore[0]?.count || 0} VOD items for portal ${portalId}`);
  } catch (error: any) {
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('no such column') || errMsg.includes('no such table')) {
      console.log('[Database] VOD table missing portal_id, skipping');
      return;
    }
    throw error;
  }
}

export async function clearSeriesForPortal(portalId: string): Promise<void> {
  try {
    const db = await getDb();
    // Count before delete
    const seriesBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM series WHERE portal_id = ?', [portalId]
    );
    const seasonsBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM series_seasons WHERE portal_id = ?', [portalId]
    );
    const episodesBefore = await db.select<{count: number}[]>(
      'SELECT COUNT(*) as count FROM series_episodes WHERE portal_id = ?', [portalId]
    );
    
    await db.execute('BEGIN TRANSACTION');
    try {
      await db.execute('DELETE FROM series_episodes WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM series_seasons WHERE portal_id = ?', [portalId]);
      await db.execute('DELETE FROM series WHERE portal_id = ?', [portalId]);
      await db.execute('COMMIT');
      console.log(`[Database] Cleared ${seriesBefore[0]?.count || 0} series, ${seasonsBefore[0]?.count || 0} seasons, ${episodesBefore[0]?.count || 0} episodes for portal ${portalId}`);
    } catch (error: any) {
      const errorMsg = error?.message?.toLowerCase() || '';
      const isTransactionClosedError = errorMsg.includes('cannot rollback') || errorMsg.includes('no transaction is active');
      
      if (!isTransactionClosedError) {
        try {
          await db.execute('ROLLBACK');
        } catch (rollbackError) {
          // Ignore - transaction already closed
        }
      }
      throw error;
    }
  } catch (error: any) {
    const errMsg = String(error?.message || error || '');
    if (errMsg.includes('no such column') || errMsg.includes('no such table')) {
      console.log('[Database] Series tables missing portal_id, skipping');
      return;
    }
    throw error;
  }
}

// Types
interface DbChannel {
  id: number;
  portal_id: string;
  name: string;
  stream_url: string;
  icon_url: string;
  genre_id: string;
  genre_name: string;
  epg_channel_id: string;
  order_num: number;
  updated_at: number;
}

export interface Channel {
  id: string;
  name: string;
  streamUrl?: string;
  iconUrl?: string;
  genreId?: string;
  genreName?: string;
  epgChannelId?: string;
  orderNum?: number;
}

interface DbVod {
  id: number;
  portal_id: string;
  name: string;
  description: string;
  poster_url: string;
  poster_local: string;
  stream_url: string;
  year: number;
  rating: number;
  duration: number;
  genre: string;
  director: string;
  actors: string;
  added: number;
  updated_at: number;
}

export interface Vod {
  id: string;
  name: string;
  description?: string;
  posterUrl?: string;
  posterLocal?: string;
  streamUrl?: string;
  year?: number;
  rating?: number;
  duration?: number;
  genre?: string;
  director?: string;
  actors?: string;
  added?: number;
}

interface DbEpg {
  id: number;
  channel_id: number;
  portal_id: string;
  title: string;
  description: string;
  start_time: number;
  end_time: number;
}

export interface EpgEntry {
  id: number;
  channelId: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
}

export interface Series {
  id: string;
  name: string;
  description?: string;
  posterUrl?: string;
  year?: number;
  rating?: number;
  genre?: string;
  categoryId?: string;
  added?: number;
}

interface DbSeries {
  id: number;
  portal_id: string;
  name: string;
  description: string;
  poster_url: string;
  year: number;
  rating: number;
  genre: string;
  category_id: string;
  added: number;
  updated_at: number;
}

export async function clearAllStorage(): Promise<void> {
  console.log('[Database] Clearing all storage...');
  
  // Clear SQLite database (ignore errors - old schema issues)
  try {
    await dropAllTables();
  } catch (error) {
    console.log('[Database] SQLite clear error (ignoring):', error);
  }
  
  // Clear Tauri store (where accounts are stored)
  try {
    await clearTauriStore();
  } catch (error) {
    console.log('[Database] Tauri store clear error (ignoring):', error);
  }
  
  // Clear localStorage as backup
  localStorage.clear();
  console.log('[Database] localStorage cleared');
  
  // Clear sessionStorage too
  sessionStorage.clear();
  console.log('[Database] sessionStorage cleared');
  
  console.log('[Database] All storage cleared - please refresh the page');
}

// React hook
export function useDatabase() {
  return {
    // Channels
    saveChannels,
    getChannels,
    getChannelCount,
    searchChannels,
    // VOD
    saveVod,
    getVod,
    getVodCount,
    searchVod,
    // Series
    saveSeries,
    getSeries,
    // EPG
    saveEpg,
    getEpgForChannel,
    getCurrentEpgForChannel,
    // Cleanup
    clearAllData,
    clearAllDataForPortal,
    clearChannelsForPortal,
    clearVodForPortal,
    clearSeriesForPortal,
    // Reset
    resetDatabase,
    dropAllTables,
    clearAllStorage,
  };
}
