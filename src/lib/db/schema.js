import { pgTable, text, integer, real, timestamp, uuid, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

export const pages = pgTable('pages', {
  bookId: text('book_id').notNull(),
  pageNum: integer('page_num').notNull(),
  imageUrl: text('image_url'),
  pageText: text('page_text'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return [
    primaryKey({ columns: [table.bookId, table.pageNum] }),
  ];
});

export const contentBlocks = pgTable('content_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookId: text('book_id').notNull(),
  pageNum: integer('page_num').notNull(),
  blockIndex: integer('block_index').notNull(),
  blockType: text('block_type'),
  text: text('text'),
  bbox: integer('bbox').array(),
  confidence: real('confidence'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return [
    uniqueIndex('idx_blocks_unique').on(table.bookId, table.pageNum, table.blockIndex),
    index('idx_blocks_page').on(table.bookId, table.pageNum),
  ];
});
