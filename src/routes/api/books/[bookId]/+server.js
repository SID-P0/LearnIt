import { json } from '@sveltejs/kit';
import { db } from '$lib/db/client.js';
import { pages } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

// GET /api/books/[bookId]
export async function GET({ params }) {
  const { bookId } = params;
  
  try {
    const bookPages = await db.select({
      pageNum: pages.pageNum,
      imageUrl: pages.imageUrl,
      width: pages.width,
      height: pages.height,
      hasText: pages.pageText
    }).from(pages)
      .where(eq(pages.bookId, bookId))
      .orderBy(pages.pageNum);
      
    return json({ pages: bookPages });
    
  } catch (err) {
    console.error('Error fetching book from DB:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
