OCR Caching Plan — DB-First, Chandra Fallback
Objective
Persist Chandra OCR results to Postgres (page-wise) so that on subsequent page loads, the client fetches cached blocks from the DB instead of re-sending images to Chandra.

Data Model
Table: content_blocks
Column	Type	Notes
id	uuid (PK)	auto-generated
book_id	text	unique ID for the uploaded/scanned book
page_num	integer	1-indexed page number
block_index	integer	order of block within the page
block_type	text	e.g. "Paragraph", "SectionHeader", "Picture"
text	text	OCR-extracted text (may be empty for images)
bbox	integer[4]	[x0, y0, x1, y1] bounding box in image px
confidence	real	0.0–1.0 Chandra confidence score
created_at	timestamp	defaults to now()
Index: UNIQUE(book_id, page_num, block_index) — one write per block, upsert on conflict.

Aggregate text: stored as page_text on a companion pages table for TTS.

Table: pages
Column	Type	Notes
book_id	text	FK-like reference
page_num	integer	1-indexed
image_url	text	path to the rendered page image (PNG)
page_text	text	full concatenated text for TTS
width	integer	page image width in px
height	integer	page image height in px
created_at	timestamp	defaults to now()
Index: UNIQUE(book_id, page_num)

Flow
First Load (cache miss)

Apply
BookReader.onMount()
  → bookStore.loadPdf()
    → render pages via pdf.js → /api/render-page (server returns base64 PNGs)
    → for each page:
        → check DB: GET /api/pages/{bookId}/{pageNum}
           ├─ HIT  → return cached { blocks, text, imageUrl }
           └─ MISS → POST /api/ocr { image } → Chandra → persist to DB → return
    → bookStore.ocrCache[pageNum] = { blocks, text }
Subsequent Load (cache hit)

Apply
BookReader.onMount()
  → bookStore.loadPdf()
    → render pages (or fetch cached image URLs from /api/pages)
    → for each page:
        → GET /api/pages/{bookId}/{pageNum}
           → HIT → return cached blocks directly (no Chandra call)
API Endpoints
GET /api/pages/:bookId/:pageNum
Query content_blocks WHERE book_id AND page_num, ORDER BY block_index
Query pages for image_url, page_text
Return: { blocks: [...], text, imageUrl, width, height } or 404 if not found
POST /api/pages/:bookId/:pageNum
Body: { blocks: [...], text, imageUrl, width, height }
Upsert into pages + content_blocks
Return 201 on success
GET /api/books/:bookId
Return all page metadata: [{ pageNum, imageUrl, width, height, hasText }]
Used by bookStore to reconstruct chapter structure without re-rendering PDF
Client Changes (bookStore.svelte.js)
loadPdf() — after getting rendered pages, call GET /api/pages/:bookId/:pageNum for each page. Only call POST /api/ocr for pages where the DB returns 404.

addPageImages(pages) — after upload flow renders pages, same DB-first check.

bookId — generated once on first load (crypto.randomUUID()), stored in bookStore state, passed to all API calls.

Server Changes (+server.js)
POST /api/ocr — after Chandra returns, call persistPage() to write blocks to DB. Accept optional bookId + pageNum in the request body for tagging.

GET /api/pages/:bookId/:pageNum — new route, reads from Postgres.

POST /api/pages/:bookId/:pageNum — new route, upserts blocks.

GET /api/books/:bookId — new route, returns page list.

DB Connection
Use postgres (npm) or pg + drizzle-orm for typed queries. Connection string from process.env.DATABASE_URL.

Migration
Create tables via a one-time migration script or Drizzle Kit:


Apply
CREATE TABLE IF NOT EXISTS pages (
  book_id    TEXT NOT NULL,
  page_num   INTEGER NOT NULL,
  image_url  TEXT,
  page_text  TEXT,
  width      INTEGER,
  height     INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (book_id, page_num)
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id     TEXT NOT NULL,
  page_num    INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  block_type  TEXT,
  text        TEXT,
  bbox        INTEGER[],
  confidence  REAL,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (book_id, page_num, block_index)
);

CREATE INDEX IF NOT EXISTS idx_blocks_page ON content_blocks (book_id, page_num);
Implementation Order
Add drizzle-orm + pg dependencies, create src/lib/db/client.ts
Define schema in src/lib/db/schema.ts
Add migration SQL / run drizzle-kit migrate
Add GET /api/pages/:bookId/:pageNum route
Add POST /api/pages/:bookId/:pageNum route
Modify POST /api/ocr to accept + persist bookId/pageNum
Modify bookStore.loadPdf() to generate bookId, check DB first, fallback to Chandra
Modify bookStore.addPageImages() similarly
Test: scan a book → refresh → verify no Chandra calls on second load