import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Serves the bundled PDF book file.
 * In future this could be extended to serve user-uploaded books.
 */
export function GET() {
  const pdfPath = resolve('report.pdf');

  try {
    const data = readFileSync(pdfPath);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    console.error('Failed to read PDF:', err);
    return new Response('Book not found', { status: 404 });
  }
}
