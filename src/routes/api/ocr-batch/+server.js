import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Chandra OCR Batch Proxy
 * Forwards an array of base64 page images to the local Chandra server
 * and returns the batched OCR results.
 */
export async function POST({ request }) {
  try {
    const { images } = await request.json();

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

    return json(data);
  } catch (err) {
    console.error('[OCR Batch Proxy] Error:', err);
    return json({ 
      error: 'OCR batch proxy error — is the Chandra server running on localhost:8010?',
      details: err.message 
    }, { status: 500 });
  }
}
