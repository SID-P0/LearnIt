<script>
  import { onMount } from 'svelte';

  /** @type {{ bookStore: any }} */
  let { bookStore } = $props();

  // Chapter selector dropdown
  let showChapterList = $state(false);

  // TTS state
  let isNarrating = $state(false);
  let isPaused = $state(false);
  let currentHighlightedSpan = null;

  onMount(() => {
    bookStore.loadPdf();
    return () => stopNarration();
  });

  // Reset narration when chapter changes
  $effect(() => {
    const _ = bookStore.currentChapterIndex;
    stopNarration();
  });

  // Log when page image or OCR data changes
  $effect(() => {
    const img = bookStore.currentPageImage;
    const ocr = bookStore.getCurrentPageOcr();
    if (img && ocr) {
      console.log(`[BookReader] Page ${img.pageNum} ready with OCR — ${ocr.blocks.length} blocks, ${ocr.text.length} chars`);
      console.log(`[BookReader] Scanned content: ${ocr.text.substring(0, 200)}...`);
    } else if (img && !ocr) {
      console.log(`[BookReader] Page ${img.pageNum} image loaded — waiting for OCR...`);
    }
  });

  function clearHighlight() {
    if (currentHighlightedSpan) {
      currentHighlightedSpan.classList.remove('highlighted');
      currentHighlightedSpan = null;
    }
  }

  function startNarration() {
    if (!window.speechSynthesis) return;

    if (isPaused) {
      isPaused = false;
      window.speechSynthesis.resume();
      return;
    }

    stopNarration();

    const text = bookStore.getCurrentPageText();
    if (!text) {
      console.warn('[BookReader] No OCR text available for TTS');
      return;
    }

    console.log('[BookReader] Starting TTS narration — text length:', text.length);

    // Build word-level span mapping for word-by-word highlighting
    // Use regex to find word positions in full_text, then match to DOM spans by order
    const wordSpans = Array.from(document.querySelectorAll('.readable-word'));
    const wordMap = [];
    const wordRegex = /\S+/g;
    let match;
    let spanIndex = 0;

    while ((match = wordRegex.exec(text)) !== null && spanIndex < wordSpans.length) {
      wordMap.push({
        charStart: match.index,
        charEnd: match.index + match[0].length,
        span: wordSpans[spanIndex]
      });
      spanIndex++;
    }

    console.log(`[BookReader] Word map built — ${wordMap.length} words mapped, ${wordSpans.length} word spans in DOM`);

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Samantha') ||
      v.name.includes('Google') ||
      v.lang.startsWith('en')
    );
    if (preferred) utt.voice = preferred;
    console.log('[BookReader] Using voice:', preferred ? preferred.name : 'default');

    // Word-by-word highlighting via boundary events (Chrome/Safari macOS)
    if ('onboundary' in SpeechSynthesisUtterance.prototype) {
      utt.onboundary = (event) => {
        if (event.name !== 'word') return;
        clearHighlight();
        const charIdx = event.charIndex;
        for (let i = wordMap.length - 1; i >= 0; i--) {
          if (charIdx >= wordMap[i].charStart && charIdx < wordMap[i].charEnd) {
            wordMap[i].span.classList.add('highlighted');
            currentHighlightedSpan = wordMap[i].span;
            break;
          }
        }
      };
    } else {
      // Fallback: word-by-word utterance queue
      const words = text.split(/(\s+)/);
      let wordIndex = 0;
      speakNextWord();

      function speakNextWord() {
        while (wordIndex < words.length && words[wordIndex].trim() === '') {
          wordIndex++;
        }
        if (wordIndex >= words.length) {
          stopNarration();
          return;
        }
        const wordUtt = new SpeechSynthesisUtterance(words[wordIndex]);
        wordUtt.rate = 0.9;
        wordUtt.pitch = 1;
        if (preferred) wordUtt.voice = preferred;

        clearHighlight();
        const span = wordSpans[wordIndex];
        if (span) {
          span.classList.add('highlighted');
          currentHighlightedSpan = span;
        }

        wordUtt.onend = () => {
          wordIndex++;
          speakNextWord();
        };
        wordUtt.onerror = () => stopNarration();

        window.speechSynthesis.speak(wordUtt);
      }
      isNarrating = true;
      isPaused = false;
      return;
    }

    utt.onend = () => {
      clearHighlight();
      stopNarration();
    };
    utt.onerror = (e) => {
      console.error('[BookReader] TTS error:', e);
      clearHighlight();
      stopNarration();
    };

    isNarrating = true;
    isPaused = false;
    window.speechSynthesis.speak(utt);
    console.log('[BookReader] TTS started');
  }

  function pauseNarration() {
    if (!window.speechSynthesis) return;
    if (isNarrating && !isPaused) {
      isPaused = true;
      window.speechSynthesis.pause();
    }
  }

  function stopNarration() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    clearHighlight();
    isNarrating = false;
    isPaused = false;
  }

  function handlePlayPause() {
    if (isNarrating && !isPaused) pauseNarration();
    else startNarration();
  }

  function selectChapter(idx) {
    showChapterList = false;
    stopNarration();
    bookStore.goToChapter(idx);
  }

  let currentChapter = $derived(bookStore.currentChapter);
</script>

<div class="book-reader">
  <!-- Scanning / Loading States -->
  {#if bookStore.scanStatus === 'scanning'}
    <div class="loading-state">
      <div class="scan-animation">
        <div class="scan-ring"></div>
        <div class="scan-icon">📖</div>
      </div>
      <p class="scan-status">{bookStore.scanMessage}</p>
      <div class="scan-progress-bar">
        <div class="scan-progress-fill" style="width: {(bookStore.scanProgress / 30) * 100}%"></div>
      </div>
      <p class="scan-hint">Detecting book structure...</p>
    </div>

  {:else if bookStore.scanStatus === 'error'}
    <div class="loading-state">
      <p class="scan-error">⚠ {bookStore.scanMessage}</p>
      <button class="retry-btn" onclick={() => bookStore.loadPdf()}>Retry</button>
    </div>

  {:else if bookStore.scanStatus === 'done'}
    <!-- Chapter Header -->
    <div class="chapter-header">
      <div class="chapter-selector">
        <button class="chapter-dropdown-btn" onclick={() => showChapterList = !showChapterList}>
          <span class="chapter-label">
            {#if currentChapter}
              Ch {currentChapter.number}: {currentChapter.name}
            {:else}
              Select Chapter
            {/if}
          </span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 5L6 8L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        {#if showChapterList}
          <div class="chapter-list">
            {#each bookStore.chapters as ch, idx}
              <button
                class="chapter-item"
                class:active={idx === bookStore.currentChapterIndex}
                onclick={() => selectChapter(idx)}
              >
                <span class="ch-num">Ch {ch.number}</span>
                <span class="ch-name">{ch.name}</span>
                <span class="ch-pages">p.{ch.startPage}–{ch.endPage}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- OCR status indicator -->
      {#if bookStore.ocrProgress > 0 && bookStore.ocrProgress < bookStore.totalChapterPages}
        <div class="ocr-status">
          <span class="ocr-dot"></span>
          OCR: {bookStore.ocrProgress}/{bookStore.totalChapterPages} pages
        </div>
      {/if}
    </div>

    <!-- Chapter Content: OCR Scanned Text -->
    <div class="chapter-body">
      {#if bookStore.chapterLoadStatus === 'loading' && bookStore.pageImages.length === 0}
        <div class="loading-state chapter-loading">
          <div class="loader"><div class="loader-ring"></div></div>
          <p class="loading-text">Rendering page...</p>
        </div>

      {:else if bookStore.pageImages.length > 0}
        <div class="readable-content">
          {#if bookStore.currentPageImage && bookStore.getCurrentPageOcr()}
            {@const ocrData = bookStore.getCurrentPageOcr()}

            <!-- Scan Log: shows what was detected -->
            <div class="scan-log">
              <div class="scan-log-header">
                <span class="scan-log-icon">🔍</span>
                <span>Scanned Page {bookStore.currentPageImage.pageNum} — {ocrData.blocks.length} blocks, {ocrData.text.length} chars of text</span>
              </div>
              {#each ocrData.blocks as block, i}
                <div class="scan-log-entry">
                  <span class="scan-block-type">{block.type}</span>
                  <span class="scan-confidence">conf: {Math.round(block.confidence * 100)}%</span>
                  <span class="scan-text-preview">{block.text.substring(0, 80)}{#if block.text.length > 80}...{/if}</span>
                </div>
              {/each}
            </div>

            <!-- Readable OCR Text: each word is a span for TTS highlighting -->
            <div class="readable-text">
              {#each ocrData.blocks as block (block.text + '_' + block.bbox.join(','))}
                {@const words = block.text.split(/\s+/).filter(w => w.length > 0)}
                <p class="text-line" class:header={block.type === 'SectionHeader'}>
                  {#each words as word, wi (word + '_' + wi)}
                    <span class="readable-word">{word} </span>
                  {/each}
                </p>
              {/each}
            </div>
          {:else if bookStore.currentPageImage}
            <div class="loading-state ocr-loading">
              <div class="loader"><div class="loader-ring"></div></div>
              <p class="loading-text">Extracting text via Chandra OCR...</p>
            </div>
          {/if}
        </div>

      {:else}
        <div class="loading-state">
          <p class="scan-hint">Select a chapter to start reading</p>
        </div>
      {/if}
    </div>

    <!-- Controls -->
    <div class="controls-bar">
      <!-- Prev Chapter -->
      <button class="control-btn nav-btn" onclick={() => { stopNarration(); bookStore.prevChapter(); }} disabled={bookStore.currentChapterIndex <= 0} aria-label="Previous chapter">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <!-- Prev Page -->
      <button class="control-btn page-btn" onclick={() => bookStore.prevPage()} disabled={bookStore.currentPageIndex <= 0} aria-label="Previous page">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7L9 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <!-- Play/Pause TTS -->
      <button class="control-btn play-btn" onclick={handlePlayPause} aria-label="Play/Pause narration">
        {#if isNarrating && !isPaused}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="3" width="3" height="12" rx="1" fill="currentColor"/><rect x="11" y="3" width="3" height="12" rx="1" fill="currentColor"/></svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 3.5V14.5L14.5 9L5 3.5Z" fill="currentColor"/></svg>
        {/if}
      </button>



      <!-- Page indicator -->
      <span class="page-info">
        {#if bookStore.totalChapterPages > 0}
          Page {bookStore.currentPageIndex + 1} / {bookStore.totalChapterPages}
        {/if}
      </span>

      <!-- Next Page -->
      <button class="control-btn page-btn" onclick={() => bookStore.nextPage()} disabled={bookStore.currentPageIndex >= bookStore.totalChapterPages - 1} aria-label="Next page">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <!-- Next Chapter -->
      <button class="control-btn nav-btn" onclick={() => { stopNarration(); bookStore.nextChapter(); }} disabled={bookStore.currentChapterIndex >= bookStore.chapters.length - 1} aria-label="Next chapter">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

  {:else}
    <div class="placeholder-content">
      <h3>Book Content Area</h3>
      <p>Please upload book/content/pdf</p>
    </div>
  {/if}
</div>

<style>
  .book-reader {
    width: 100%;
    height: 100%;
    background: #0a0a0f;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    color: #e0e0e0;
  }

  /* ── Scanning Animation ── */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 16px;
    padding: 40px;
  }

  .scan-animation {
    position: relative;
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scan-ring {
    position: absolute;
    inset: 0;
    border: 2px solid rgba(108, 99, 255, 0.15);
    border-top-color: var(--accent, #6c63ff);
    border-radius: 50%;
    animation: spin 1.2s linear infinite;
  }

  .scan-icon { font-size: 32px; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .scan-progress-bar {
    width: 200px;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .scan-progress-fill {
    height: 100%;
    background: var(--accent, #6c63ff);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .scan-status {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  }

  .scan-hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .scan-error {
    font-size: 14px;
    color: #ff6b6b;
  }

  .retry-btn {
    background: rgba(108, 99, 255, 0.2);
    border: 1px solid rgba(108, 99, 255, 0.4);
    color: var(--accent, #6c63ff);
    padding: 8px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
  }

  .loader {
    width: 40px;
    height: 40px;
  }

  .loader-ring {
    width: 100%;
    height: 100%;
    border: 2px solid rgba(108, 99, 255, 0.2);
    border-top-color: var(--accent, #6c63ff);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text { font-size: 13px; color: rgba(255,255,255,0.4); }

  /* ── Chapter Header ── */
  .chapter-header {
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .chapter-selector {
    position: relative;
    flex: 1;
  }

  .chapter-dropdown-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #e0e0e0;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: background 0.2s;
  }

  .chapter-dropdown-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .chapter-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .chapter-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 300px;
    overflow-y: auto;
    background: #141420;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    margin-top: 4px;
    z-index: 100;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  }

  .chapter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    transition: background 0.15s;
  }

  .chapter-item:hover { background: rgba(108, 99, 255, 0.1); color: #fff; }
  .chapter-item.active { background: rgba(108, 99, 255, 0.15); color: var(--accent, #6c63ff); }

  .ch-num {
    font-weight: 600;
    min-width: 40px;
    color: var(--accent, #6c63ff);
    font-size: 11px;
  }

  .ch-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch-pages { font-size: 10px; color: rgba(255,255,255,0.2); }

  /* ── OCR Status ── */
  .ocr-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ocr-dot {
    width: 6px;
    height: 6px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* ── Page Viewer ── */
  .chapter-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .chapter-loading {
    flex: 1;
  }

  .readable-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    max-width: 800px;
    margin: 0 auto;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .readable-content::-webkit-scrollbar { display: none; }

  /* Scan Log */
  .scan-log {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
    font-size: 12px;
  }

  .scan-log-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text-primary);
  }

  .scan-log-icon {
    font-size: 16px;
  }

  .scan-log-entry {
    display: flex;
    gap: 12px;
    padding: 4px 0;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  .scan-block-type {
    font-weight: 600;
    color: var(--accent, #6c63ff);
    min-width: 120px;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.03em;
  }

  .scan-confidence {
    color: rgba(255, 255, 255, 0.5);
    min-width: 80px;
    font-size: 11px;
  }

  .scan-text-preview {
    color: rgba(255, 255, 255, 0.7);
    flex: 1;
    font-family: monospace;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Readable OCR Text */
  .readable-text {
    line-height: 1.8;
  }

  .text-line {
    margin: 0 0 12px 0;
    color: var(--text-primary);
    font-size: 16px;
    font-family: Georgia, serif;
    font-weight: 400;
  }

  .text-line.header {
    font-size: 20px;
    font-weight: 700;
    margin: 24px 0 12px 0;
    color: var(--accent, #6c63ff);
  }

  .readable-word {
    cursor: default;
    transition: background-color 0.15s ease;
    color: var(--text-primary);
  }

  .readable-word.highlighted {
    background-color: rgba(255, 255, 0, 0.6);
    border-radius: 2px;
    color: #111;
    font-weight: bold;
  }

  .readable-word::selection {
    background: rgba(108, 99, 255, 0.3);
    color: #111;
  }

  .ocr-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 400px;
    gap: 12px;
  }

  /* ── Controls ── */
  .controls-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.03);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .control-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .control-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.08);
  }

  .control-btn:disabled { opacity: 0.2; cursor: not-allowed; }

  .play-btn {
    width: 34px;
    height: 34px;
    background: rgba(108, 99, 255, 0.15);
    color: var(--accent, #6c63ff);
  }
  .play-btn:hover { background: rgba(108, 99, 255, 0.3); }

  .page-btn {
    width: 26px;
    height: 26px;
  }

  .page-info {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
    min-width: 100px;
    text-align: center;
  }

  .placeholder-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: rgba(255, 255, 255, 0.2);
  }
</style>