import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db/client.js';
import { pages, contentBlocks } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Chandra OCR Batch Proxy
 * Forwards an array of base64 page images to the local Chandra server
 * and returns the batched OCR results.
 */
export async function POST({ request }) {
  try {
    const { images, bookId, pageNums } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return json({ error: 'No images provided' }, { status: 400 });
    }

    const chandraUrl = env.CHANDRA_SERVER_URL || 'http://localhost:8010';

    console.log(`[OCR Batch Proxy] Forwarding ${images.length} images to Chandra server...`);

    const response = await fetch(`${chandraUrl}/ocr-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR Batch Proxy] Chandra server error:', errText);
      return json({ error: 'Chandra OCR server error', details: errText }, { status: 502 });
    }

    const data = await response.json();
    console.log(`[OCR Batch Proxy] Done: Processed ${data.responses?.length || 0} pages in ${data.total_processing_time_ms}ms`);

    // Persist to DB if bookId and pageNums are provided
    if (bookId && pageNums && Array.isArray(pageNums) && data.responses) {
      for (let i = 0; i < data.responses.length; i++) {
        const pageResponse = data.responses[i];
        if (pageResponse.error) continue;
        
        const pageNumInt = parseInt(pageNums[i]);
        
        // Upsert page metadata
        await db.insert(pages).values({
          bookId,
          pageNum: pageNumInt,
          imageUrl: null,
          pageText: pageResponse.text || '',
          width: null,
          height: null
        }).onConflictDoUpdate({
          target: [pages.bookId, pages.pageNum],
          set: { pageText: pageResponse.text || '' }
        });
        
        // Delete existing blocks
        await db.delete(contentBlocks)
          .where(and(eq(contentBlocks.bookId, bookId), eq(contentBlocks.pageNum, pageNumInt)));
          
        // Insert new blocks
        if (pageResponse.blocks && pageResponse.blocks.length > 0) {
          const blocksToInsert = pageResponse.blocks.map((b, idx) => ({
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
    }

    return json(data);
  } catch (err) {
    console.error('[OCR Batch Proxy] Error:', err);
    return json({ 
      error: 'OCR batch proxy error — is the Chandra server running on localhost:8010?',
      details: err.message 
    }, { status: 500 });
  }
}
