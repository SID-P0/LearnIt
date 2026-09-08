import { json } from '@sveltejs/kit';
import { db } from '$lib/db/client.js';
import { pages, contentBlocks } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

// GET /api/pages/[bookId]/[pageNum]
export async function GET({ params }) {
  const { bookId, pageNum } = params;
  
  try {
    const pageNumInt = parseInt(pageNum);
    
    // Fetch page metadata
    const pageData = await db.select().from(pages)
      .where(and(eq(pages.bookId, bookId), eq(pages.pageNum, pageNumInt)))
      .limit(1);
      
    if (pageData.length === 0) {
      return json({ error: 'Page not found in cache' }, { status: 404 });
    }
    
    // Fetch content blocks for this page
    const blocksData = await db.select().from(contentBlocks)
      .where(and(eq(contentBlocks.bookId, bookId), eq(contentBlocks.pageNum, pageNumInt)))
      .orderBy(contentBlocks.blockIndex);
      
    // Format to match Chandra OCR output structure
    return json({
      blocks: blocksData.map(b => ({
        type: b.blockType,
        text: b.text,
        bbox: b.bbox,
        confidence: b.confidence
      })),
      text: pageData[0].pageText,
      imageUrl: pageData[0].imageUrl,
      width: pageData[0].width,
      height: pageData[0].height
    });
    
  } catch (err) {
    console.error('Error fetching page from DB:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/pages/[bookId]/[pageNum]
export async function POST({ request, params }) {
  const { bookId, pageNum } = params;
  
  try {
    const pageNumInt = parseInt(pageNum);
    const data = await request.json();
    
    // Upsert page metadata
    await db.insert(pages).values({
      bookId,
      pageNum: pageNumInt,
      imageUrl: data.imageUrl || null,
      pageText: data.text || '',
      width: data.width || null,
      height: data.height || null
    }).onConflictDoUpdate({
      target: [pages.bookId, pages.pageNum],
      set: {
        imageUrl: data.imageUrl || null,
        pageText: data.text || '',
        width: data.width || null,
        height: data.height || null
      }
    });
    
    // Delete existing blocks for this page (to replace them cleanly)
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
    
    return json({ success: true }, { status: 201 });
    
  } catch (err) {
    console.error('Error saving page to DB:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
