import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.js';
import { env } from '$env/dynamic/private';

// In a real production setup you might use connection string from env var
const pool = new Pool({
  connectionString: env.DATABASE_URL || 'postgres://learnit:learnitpassword@localhost:5432/learnit'
});

export const db = drizzle(pool, { schema });
