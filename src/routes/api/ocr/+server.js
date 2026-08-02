import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Surya OCR Proxy
 * Forwards a single base64 page image to the local Surya server
 * and returns the structured OCR results (blocks, text, layout).
 */
export async function POST({ request }) {
  try {
    const { image } = await request.json();

    if (!image) {
      return json({ error: 'No image provided' }, { status: 400 });
    }

    const suryaUrl = env.SURYA_SERVER_URL || 'http://localhost:8010';

    console.log('[OCR Proxy] Forwarding page image to Surya server...');

    const response = await fetch(`${suryaUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR Proxy] Surya server error:', errText);
      return json({ error: 'Surya OCR server error', details: errText }, { status: 502 });
    }

    const data = await response.json();
    console.log(`[OCR Proxy] Done: ${data.blocks?.length || 0} blocks, ${data.processing_time_ms}ms`);

    return json(data);
  } catch (err) {
    console.error('[OCR Proxy] Error:', err);
    return json({ 
      error: 'OCR proxy error — is the Surya server running on localhost:8010?',
      details: err.message 
    }, { status: 500 });
  }
}
