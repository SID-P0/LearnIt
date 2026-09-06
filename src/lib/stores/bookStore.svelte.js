/**
 * Book Store — Chandra OCR-powered PDF reader.
 *
 * Pipeline:
 *   1. Load PDF with pdfjs
 *   2. Extract text from first ~30 pages via getTextContent() → detect chapters
 *   3. Render chapter pages as images via canvas → display in reader
 *   4. Send each page image to Chandra OCR (background) → cache text for Q&A
 *   5. Support incremental scanning (user can add more pages later)
 */

/** @type {any} */
let pdfDoc = null;

// ── REACTIVE STATE ──────────────────────────────────────
let totalPages = $state(0);
let isLoading = $state(false);
let isPdfLoaded = $state(false);

// Scan state
let scanStatus = $state('idle'); // 'idle' | 'scanning' | 'done' | 'error'
let scanMessage = $state('');
let scanProgress = $state(0);    // 0-30 during TOC scan
let bookTitle = $state('');
let chapters = $state([]);       // [{ number, name, startPage, endPage }]

// Chapter reading state
let currentChapterIndex = $state(-1);
let chapterLoadStatus = $state('idle'); // 'idle' | 'loading' | 'done'

// Page-level state for current chapter
let pageImages = $state([]);      // [{ pageNum, image (base64) }]
let pageOcrTexts = $state([]);    // [{ pageNum, text, blocks }]
let currentPageIndex = $state(0); // which page within current chapter is viewed
let ocrProgress = $state(0);     // how many pages have been OCR'd

// Caches
let pageImageCache = $state({});          // pageNum → base64
let ocrCache = $state({});                // pageNum → { text, blocks }

// ── PDF PAGE RENDERING ──────────────────────────────────

/**
 * Render a single PDF page to a base64 image via canvas.
 */
async function renderPageImage(pageNum) {
  if (pageImageCache[pageNum]) {
    console.log(`[BookStore] Page ${pageNum} image cache hit`);
    return pageImageCache[pageNum];
  }

  console.log(`[BookStore] Rendering page ${pageNum} via pdfjs canvas (scale 2.0)...`);
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Fill white background to prevent transparent-to-black issues in jpeg conversion
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const base64Image = canvas.toDataURL('image/jpeg', 0.85);
  pageImageCache[pageNum] = base64Image;
  console.log(`[BookStore] Page ${pageNum} rendered — canvas ${canvas.width}x${canvas.height}, base64 size: ${(base64Image.length / 1024).toFixed(0)}KB`);
  return base64Image;
}

/**
 * Extract raw text from a single PDF page using pdfjs getTextContent().
 * This is fast, client-side, no OCR needed (uses embedded text in the PDF).
 */
async function extractPageText(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  return textContent.items.map(item => item.str).join(' ');
}

// ── TOC DETECTION ───────────────────────────────────────

/**
 * Scan pages one-by-one to detect book structure using embedded text.
 * Processes sequentially and updates UI after each page.
 */
async function scanBookStructure() {
  scanStatus = 'scanning';
  scanMessage = 'Detecting book structure...';

  const pageTexts = [];
  const maxScanPages = Math.min(30, totalPages);

  console.log(`[BookStore] Scanning first ${maxScanPages} pages for TOC...`);

  // Extract text from pages one at a time
  for (let i = 1; i <= maxScanPages; i++) {
    scanProgress = i;
    scanMessage = `Scanning page ${i} of ${maxScanPages}...`;

    try {
      const text = await extractPageText(i);
      const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      console.log(`[BookStore] Page ${i} text extracted — ${wordCount} words`);
      pageTexts.push({ pageNum: i, text });
    } catch (err) {
      console.warn(`[BookStore] Failed to extract text from page ${i}:`, err);
      pageTexts.push({ pageNum: i, text: '' });
    }
  }

  // Parse chapters from extracted text
  const detectedChapters = parseChaptersFromText(pageTexts);

  if (detectedChapters.length > 0) {
    // Prevent skipping pages 1 to N if Chapter 1 starts late
    if (detectedChapters[0].startPage > 1) {
      detectedChapters.unshift({
        number: 0,
        name: 'Front Matter',
        startPage: 1,
        endPage: detectedChapters[0].startPage - 1
      });
    }
    
    bookTitle = detectBookTitle(pageTexts) || 'Untitled Book';
    chapters = detectedChapters;
    scanStatus = 'done';
    scanMessage = '';

    console.log(`[BookStore] Book scanned: "${bookTitle}" — ${chapters.length} chapters found`);
    console.log('[BookStore] Chapters:', JSON.parse(JSON.stringify(chapters)));
  } else {
    // Fallback: treat entire book as one chapter
    bookTitle = detectBookTitle(pageTexts) || 'Untitled Book';
    chapters = [{ number: 1, name: 'Full Book', startPage: 1, endPage: totalPages }];
    scanStatus = 'done';
    scanMessage = '';
    console.log(`[BookStore] No chapters detected — fallback to single chapter covering pages 1–${totalPages}`);
  }
}

/**
 * Detect the book title from first few pages.
 */
function detectBookTitle(pageTexts) {
  for (const { text } of pageTexts.slice(0, 5)) {
    if (!text || text.trim().length < 5) continue;

    // Look for title-like patterns (long capitalized text, or first substantial text)
    const lines = text.split(/\s{3,}/).filter(l => l.trim().length > 3);
    for (const line of lines) {
      const cleaned = line.trim();
      // Skip common non-title content
      if (/^(copyright|isbn|published|all rights|library of|printed)/i.test(cleaned)) continue;
      if (/^\d+$/.test(cleaned)) continue;
      if (cleaned.length > 10 && cleaned.length < 200) {
        return cleaned;
      }
    }
  }
  return null;
}

/**
 * Parse chapter structure from extracted page texts.
 * Looks for common patterns like "Chapter 1", "CHAPTER ONE", "1. Introduction", etc.
 */
function parseChaptersFromText(pageTexts) {
  const chapterPatterns = [
    // "Chapter 1: Title" or "CHAPTER 1 Title"
    /(?:chapter|ch\.?)\s+(\d+)\s*[:\-—]?\s*(.+)/i,
    // "Part 1: Title"
    /(?:part)\s+(\d+)\s*[:\-—]?\s*(.+)/i,
    // "1. Title" at start of substantial text
    /^(\d{1,2})\.\s+([A-Z][a-z].{5,})/m,
  ];

  // Also look for TOC-style entries: "Chapter Name ... 23" or "Chapter Name 23"
  const tocPattern = /(?:chapter|ch\.?)\s+(\d+)\s+(.+?)\s+(\d{1,4})\s*$/gim;

  const detected = [];
  const seenChapters = new Set();

  // First pass: look for a Table of Contents page
  for (const { pageNum, text } of pageTexts) {
    if (!text) continue;

    // Check if this looks like a TOC page
    const isToc = /table\s+of\s+contents|contents/i.test(text) ||
                  (text.match(/chapter/gi) || []).length >= 3;

    if (isToc) {
      // Extract TOC entries
      const tocMatches = [...text.matchAll(tocPattern)];
      for (const match of tocMatches) {
        const num = parseInt(match[1]);
        const name = match[2].trim().replace(/\.{2,}/g, '').trim();
        const startPage = parseInt(match[3]);

        if (!seenChapters.has(num) && name.length > 2 && startPage > 0) {
          detected.push({ number: num, name, startPage, endPage: 0 });
          seenChapters.add(num);
        }
      }
    }
  }

  // If TOC parsing found chapters, compute endPages and return
  if (detected.length >= 2) {
    detected.sort((a, b) => a.startPage - b.startPage);
    for (let i = 0; i < detected.length; i++) {
      if (i < detected.length - 1) {
        detected[i].endPage = detected[i + 1].startPage - 1;
      } else {
        detected[i].endPage = totalPages;
      }
    }
    return detected;
  }

  // Second pass: look for chapter headings in the actual pages
  for (const { pageNum, text } of pageTexts) {
    if (!text) continue;
    for (const pattern of chapterPatterns) {
      const match = text.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        const name = match[2].trim().substring(0, 100);

        if (!seenChapters.has(num) && name.length > 2) {
          detected.push({ number: num, name, startPage: pageNum, endPage: 0 });
          seenChapters.add(num);
        }
      }
    }
  }

  if (detected.length > 0) {
    detected.sort((a, b) => a.startPage - b.startPage);
    for (let i = 0; i < detected.length; i++) {
      if (i < detected.length - 1) {
        detected[i].endPage = detected[i + 1].startPage - 1;
      } else {
        detected[i].endPage = totalPages;
      }
    }
  }

  return detected;
}

// ── PDF LOADING ─────────────────────────────────────────

/**
 * Load PDF and kick off the scanning pipeline.
 */
async function loadPdf(url = '/api/book') {
  if (isPdfLoaded || isLoading) {
    console.log('[BookStore] PDF already loaded or loading — skipping');
    return;
  }
  isLoading = true;
  scanStatus = 'scanning';
  scanMessage = 'Loading PDF...';

  console.log(`[BookStore] Loading PDF from ${url}...`);

  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const loadingTask = pdfjsLib.getDocument({ url });
    const loadingTaskPromise = loadingTask.promise;

    // Listen for progress
    loadingTask.onProgress = (progs) => {
      if (progs.total > 0) {
        const pct = Math.round((progs.loaded / progs.total) * 100);
        console.log(`[BookStore] PDF loading progress: ${pct}% (${progs.loaded}/${progs.total} bytes)`);
      }
    };

    pdfDoc = await loadingTaskPromise;

    totalPages = pdfDoc.numPages;
    console.log(`[BookStore] PDF loaded successfully — ${totalPages} total pages`);

    isPdfLoaded = true;

    // Scan for TOC (extracts text from first 30 pages for chapter detection)
    await scanBookStructure();

    // Navigate to the first chapter (renders page image + triggers OCR)
    await goToChapter(0);
  } catch (err) {
    console.error('[BookStore] Failed to load PDF:', err);
    scanStatus = 'error';
    scanMessage = 'Failed to load PDF';
  } finally {
    isLoading = false;
    scanStatus = 'done';
    scanMessage = '';
    console.log('[BookStore] PDF load pipeline complete');
  }
}

// ── CHAPTER NAVIGATION ──────────────────────────────────

/**
 * Navigate to a chapter. Renders page images one-by-one and shows them
 * progressively. OCR runs in background for each page.
 */
async function goToChapter(index) {
  if (index < 0 || index >= chapters.length) return;

  currentChapterIndex = index;
  const chapter = chapters[index];

  chapterLoadStatus = 'loading';
  pageImages = [];
  pageOcrTexts = [];
  currentPageIndex = 0;
  ocrProgress = 0;

  const start = chapter.startPage;
  const end = Math.min(chapter.endPage, totalPages);
  const totalChapterPages = end - start + 1;

  console.log(`[BookStore] Loading chapter: ${chapter.name} — pages ${start}–${end}`);

  // Render pages one-by-one and display progressively
  for (let p = start; p <= end; p++) {
    try {
      console.log(`[BookStore] Rendering page ${p} as image...`);
      const image = await renderPageImage(p);
      pageImages = [...pageImages, { pageNum: p, image }];

      // If it's the first page, mark as loaded so the UI shows immediately
      if (p === start) {
        chapterLoadStatus = 'done';
      }
    } catch (err) {
      console.warn(`[BookStore] Failed to render page ${p}:`, err);
    }
  }

  // Kick off OCR
  if (pageImages.length > 0) {
    // 1. Process the very first page immediately so the user can start reading!
    ocrSinglePage(pageImages[0].pageNum);
    
    // 2. Batch the remaining pages in chunks of 4
    const remainingPages = pageImages.slice(1);
    const BATCH_SIZE = 4;
    
    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
        const chunk = remainingPages.slice(i, i + BATCH_SIZE);
        // Fire and forget (async background processing)
        ocrBatchPages(chunk.map(p => p.pageNum));
    }
  }

  chapterLoadStatus = 'done';
  console.log(`[BookStore] Chapter loaded — ${pageImages.length} page image(s)`);
}

/**
 * Trigger OCR scanning for just a single page if it hasn't been scanned yet.
 */
async function ocrSinglePage(pageNum) {
  if (!pageNum || ocrCache[pageNum]) {
    console.log(`[BookStore] OCR page ${pageNum} — already cached, skipping`);
    return;
  }

  const pageImageData = pageImages.find(p => p.pageNum === pageNum)?.image;
  if (!pageImageData) {
    console.warn(`[BookStore] OCR page ${pageNum} — no image data found in pageImages`);
    return;
  }

  console.log(`[BookStore] Sending page ${pageNum} to Chandra OCR server...`);

  try {
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: pageImageData })
    });

    if (res.ok) {
      const data = await res.json();
      const ocrResult = {
        pageNum,
        text: data.full_text || '',
        blocks: data.blocks || [],
        width: data.page_width || 1,
        height: data.page_height || 1
      };
      ocrCache[pageNum] = ocrResult;
      pageOcrTexts = [...pageOcrTexts, ocrResult];
      ocrProgress++;
      console.log(`[BookStore] OCR page ${pageNum} complete — ${data.blocks?.length || 0} blocks, ${ocrResult.text.length} chars of text`);
    } else {
      const errText = await res.text();
      console.warn(`[BookStore] OCR page ${pageNum} failed — HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[BookStore] OCR page ${pageNum} error:`, err);
  }
}

/**
 * Trigger OCR scanning for a batch of pages.
 */
async function ocrBatchPages(pageNums) {
  const pagesToProcess = pageNums.filter(num => !ocrCache[num]);
  if (pagesToProcess.length === 0) return;

  const images = pagesToProcess.map(num => pageImages.find(p => p.pageNum === num)?.image).filter(Boolean);
  if (images.length === 0) return;

  console.log(`[BookStore] Sending batch of ${images.length} pages to Chandra OCR server...`);

  try {
    const res = await fetch('/api/ocr-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });

    if (res.ok) {
      const data = await res.json();
      data.responses.forEach((resp, index) => {
        const pageNum = pagesToProcess[index];
        const ocrResult = {
          pageNum,
          text: resp.full_text || '',
          blocks: resp.blocks || [],
          width: resp.page_width || 1,
          height: resp.page_height || 1
        };
        ocrCache[pageNum] = ocrResult;
        pageOcrTexts = [...pageOcrTexts, ocrResult];
        ocrProgress++;
        console.log(`[BookStore] OCR page ${pageNum} (from batch) complete — ${resp.blocks?.length || 0} blocks, ${ocrResult.text.length} chars`);
      });
    } else {
      const errText = await res.text();
      console.warn(`[BookStore] OCR batch failed — HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[BookStore] OCR batch error:`, err);
  }
}

// ── PAGE NAVIGATION ─────────────────────────────────────

function nextPage() {
  if (currentPageIndex < pageImages.length - 1) {
    currentPageIndex++;
    ocrSinglePage(pageImages[currentPageIndex].pageNum);
  }
}

function prevPage() {
  if (currentPageIndex > 0) {
    currentPageIndex--;
    ocrSinglePage(pageImages[currentPageIndex].pageNum);
  }
}

function goToPage(index) {
  if (index >= 0 && index < pageImages.length) {
    currentPageIndex = index;
  }
}

// ── CHAPTER NAVIGATION ──────────────────────────────────

function nextChapter() {
  if (currentChapterIndex < chapters.length - 1) {
    goToChapter(currentChapterIndex + 1);
  }
}

function prevChapter() {
  if (currentChapterIndex > 0) {
    goToChapter(currentChapterIndex - 1);
  }
}

// ── TEXT ACCESS (for Q&A / TTS) ─────────────────────────

/**
 * Get the current chapter's full OCR text for AI context.
 */
function getCurrentChapterText() {
  return pageOcrTexts.map(p => p.text).join('\n\n');
}

/**
 * Get OCR text for the currently visible page.
 */
function getCurrentPageText() {
  const currentPage = pageImages[currentPageIndex];
  if (!currentPage) return '';
  const ocr = ocrCache[currentPage.pageNum];
  return ocr?.text || '';
}

/**
 * Get the full OCR data (blocks, dimensions) for the currently visible page.
 */
function getCurrentPageOcr() {
  const currentPage = pageImages[currentPageIndex];
  if (!currentPage) return null;
  return ocrCache[currentPage.pageNum] || null;
}

// ── EXPORTS ─────────────────────────────────────────────

export function getBookStore() {
  return {
    // PDF state
    get totalPages() { return totalPages; },
    get isLoading() { return isLoading; },
    get isPdfLoaded() { return isPdfLoaded; },

    // Scan state
    get scanStatus() { return scanStatus; },
    get scanMessage() { return scanMessage; },
    get scanProgress() { return scanProgress; },
    get bookTitle() { return bookTitle; },
    get chapters() { return chapters; },

    // Chapter state
    get currentChapterIndex() { return currentChapterIndex; },
    get chapterLoadStatus() { return chapterLoadStatus; },

    // Page state
    get pageImages() { return pageImages; },
    get pageOcrTexts() { return pageOcrTexts; },
    get currentPageIndex() { return currentPageIndex; },
    get ocrProgress() { return ocrProgress; },

    // Derived
    get currentChapter() {
      return chapters[currentChapterIndex] || null;
    },
    get currentPageImage() {
      return pageImages[currentPageIndex] || null;
    },
    get totalChapterPages() {
      return pageImages.length;
    },

    // Actions
    loadPdf,
    goToChapter,
    nextChapter,
    prevChapter,
    nextPage,
    prevPage,
    goToPage,
    getCurrentChapterText,
    getCurrentPageText,
    getCurrentPageOcr,
  };
}