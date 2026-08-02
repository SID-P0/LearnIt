import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('images');

    if (!files || files.length === 0) {
      return json({ error: 'No images provided' }, { status: 400 });
    }

    const pages = [];

    for (const file of files) {
      if (!(file instanceof Blob)) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = file.type || 'image/png';
      const dataUri = `data:${mimeType};base64,${base64}`;

      pages.push({
        image: dataUri,
        fileName: file.name || `page-${pages.length + 1}`,
      });
    }

    return json({ pages, count: pages.length });
  } catch (err) {
    console.error('Upload error:', err);
    return json({ error: 'Upload failed' }, { status: 500 });
  }
}