import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Create client for local SQLite database
const client = createClient({
  url: 'file:./iptv-thunder.db',
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
export * from './schema';
