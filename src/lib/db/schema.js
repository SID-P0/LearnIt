/**
 * Drizzle ORM Schema for PostgreSQL
 * 
 * Structure:
 * - books: Main book metadata
 * - pages: Individual pages with dimensions
 * - content_blocks: Parsed content (text, tables, images) with bbox and HTML
 */

import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const books = pgTable('books', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  author: text('author'),
  pdf_path: text('pdf_path').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

