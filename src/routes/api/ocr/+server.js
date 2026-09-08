import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db/client.js';
import { pages, contentBlocks } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Chandra OCR Proxy
 * Forwards a single base64 page image to the local Chandra server
 * and returns the structured OCR results (blocks, text, layout).
 */
export async function POST({ request }) {
  try {
    const { image, bookId, pageNum } = await request.json();

    if (!image) {
      return json({ error: 'No image provided' }, { status: 400 });
    }

    const chandraUrl = env.CHANDRA_SERVER_URL || 'http://localhost:8010';

    console.log('[OCR Proxy] Forwarding page image to Chandra server...');

    const response = await fetch(`${chandraUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR Proxy] Chandra server error:', errText);
      return json({ error: 'Chandra OCR server error', details: errText }, { status: 502 });
    }

    const data = await response.json();
    console.log(`[OCR Proxy] Done: ${data.blocks?.length || 0} blocks, ${data.processing_time_ms}ms`);

    // Persist to DB if bookId and pageNum are provided
    if (bookId && pageNum !== undefined) {
      const pageNumInt = parseInt(pageNum);
      
      // Upsert page metadata
      await db.insert(pages).values({
        bookId,
        pageNum: pageNumInt,
        imageUrl: null, // Image URL can be updated separately if needed
        pageText: data.text || '',
        width: null,
        height: null
      }).onConflictDoUpdate({
        target: [pages.bookId, pages.pageNum],
        set: { pageText: data.text || '' }
      });
      
      // Delete existing blocks
      await db.delete(contentBlocks)
        .where(and(eq(contentBlocks.bookId, bookId), eq(contentBlocks.pageNum, pageNumInt)));
        
      // Insert new blocks
      if (data.blocks && data.blocks.length > 0) {
        const blocksToInsert = data.blocks.map((b, idx) => ({
          bookId,
          pageNum: pageNumInt,
          blockIndex: idx,
          blockType: b.type,
          text: b.text,
          bbox: b.bbox || null,
          confidence: b.confidence || null
        }));
        await db.insert(contentBlocks).values(blocksToInsert);
      }
    }

    return json(data);
  } catch (err) {
    console.error('[OCR Proxy] Error:', err);
    return json({ 
      error: 'OCR proxy error — is the Chandra server running on localhost:8010?',
      details: err.message 
    }, { status: 500 });
  }
}
