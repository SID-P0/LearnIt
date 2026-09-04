import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Chandra OCR Proxy
 * Forwards a single base64 page image to the local Chandra server
 * and returns the structured OCR results (blocks, text, layout).
 */
export async function POST({ request }) {
  try {
    const { image } = await request.json();

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

    return json(data);
  } catch (err) {
    console.error('[OCR Proxy] Error:', err);
    return json({ 
      error: 'OCR proxy error — is the Chandra server running on localhost:8010?',
      details: err.message 
    }, { status: 500 });
  }
}
