<script>
  /**
   * Canvas — Infinite pannable/zoomable grid canvas
   * Handles mouse/touch interactions for pan and zoom
   * Renders Q&A boxes and connection lines
   */
  import QABox from './QABox.svelte';
  import ConnectionLine from './ConnectionLine.svelte';

  /** @type {{ store: any }} */
  let { store } = $props();

  let canvasEl = $state(null);
  let isPanning = $state(false);
  let lastPointer = $state({ x: 0, y: 0 });

  // Touch tracking for pinch zoom
  let lastTouchDist = $state(0);
  let lastTouchCenter = $state({ x: 0, y: 0 });

  // ---- MOUSE HANDLERS ----

  function handlePointerDown(e) {
    // Only pan on left click or middle click on the canvas background
    if (e.target !== canvasEl && !e.target.classList.contains('canvas-grid')) return;

    isPanning = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvasEl?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e) {
    if (!isPanning) return;

    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };

    store.panBy(dx, dy);
  }

  function handlePointerUp(e) {
    if (isPanning) {
      isPanning = false;
      canvasEl?.releasePointerCapture(e.pointerId);
    }
  }

  function handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = store.transform.zoom * delta;

    store.zoomAt(newZoom, e.clientX, e.clientY);
  }

  // ---- TOUCH HANDLERS ----

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastTouchDist = getTouchDist(e.touches);
      lastTouchCenter = getTouchCenter(e.touches);
    } else if (e.touches.length === 1) {
      // Check if the touch is on the canvas background
      if (e.target === canvasEl || e.target.classList.contains('canvas-grid')) {
        isPanning = true;
        lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const center = getTouchCenter(e.touches);

      // Pinch zoom
      const scale = dist / lastTouchDist;
      const newZoom = store.transform.zoom * scale;
      store.zoomAt(newZoom, center.x, center.y);

      // Pan
      const dx = center.x - lastTouchCenter.x;
      const dy = center.y - lastTouchCenter.y;
      store.panBy(dx, dy);

      lastTouchDist = dist;
      lastTouchCenter = center;
    } else if (isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastPointer.x;
      const dy = e.touches[0].clientY - lastPointer.y;
      lastPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      store.panBy(dx, dy);
    }
  }

  function handleTouchEnd() {
    isPanning = false;
    lastTouchDist = 0;
  }

  // ---- CANVAS CLICK (deselect) ----

  function handleCanvasClick(e) {
    if (e.target === canvasEl || e.target.classList.contains('canvas-grid')) {
      store.deselectAll();
    }
  }

  // ---- DERIVED ----

  let transformStyle = $derived(
    `translate(${store.transform.x}px, ${store.transform.y}px) scale(${store.transform.zoom})`
  );

  // Grid background sizing that scales with zoom
  let gridSmallSize = $derived(20 * store.transform.zoom);
  let gridLargeSize = $derived(100 * store.transform.zoom);
  let gridOffsetX = $derived(store.transform.x % gridLargeSize);
  let gridOffsetY = $derived(store.transform.y % gridLargeSize);
</script>

<div
  class="canvas-container"
  bind:this={canvasEl}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerUp}
  onwheel={handleWheel}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  onclick={handleCanvasClick}
  role="application"
  aria-label="Knowledge canvas"
  id="knowledge-canvas"
>
  <!-- Grid background -->
  <div
    class="canvas-grid"
    style="
      background-size: {gridSmallSize}px {gridSmallSize}px, {gridSmallSize}px {gridSmallSize}px, {gridLargeSize}px {gridLargeSize}px, {gridLargeSize}px {gridLargeSize}px;
      background-position: {gridOffsetX}px {gridOffsetY}px, {gridOffsetX}px {gridOffsetY}px, {gridOffsetX}px {gridOffsetY}px, {gridOffsetX}px {gridOffsetY}px;
    "
  ></div>

  <!-- Transform layer -->
  <div
    class="canvas-transform"
    class:animating-pan={store.isAnimatingPan}
    style="transform: {transformStyle}; transform-origin: 0 0;"
  >
    <!-- SVG layer for connection lines -->
    <svg class="connections-layer" xmlns="http://www.w3.org/2000/svg">
      {#each store.edges as edge (edge.id)}
        {@const fromNode = store.getNode(edge.fromId)}
        {@const toNode = store.getNode(edge.toId)}
        {#if fromNode && toNode}
          <ConnectionLine
            {fromNode}
            {toNode}
            nodeHeaderHeight={store.NODE_HEADER_HEIGHT}
            nodeMinHeight={store.NODE_MIN_HEIGHT}
          />
        {/if}
      {/each}
    </svg>

    <!-- Nodes layer -->
    {#each store.nodes as node (node.id)}
      {#if !node.parentId}
        <div 
          class="root-title"
          style="left: {node.x}px; top: {node.y - 35}px; width: {node.width}px;"
        >
          {node.summaryTitle || 'Topic'}
        </div>
      {/if}
      <QABox
        {node}
        selected={store.selectedNodeId === node.id}
        onselect={(id) => store.selectNode(id)}
        ontoggle={(id) => store.toggleCollapse(id)}
      />
    {/each}
  </div>

  <!-- Empty state -->
  {#if store.nodes.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
          <rect x="28" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
          <rect x="4" y="28" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
          <rect x="28" y="28" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.15"/>
          <line x1="20" y1="12" x2="28" y2="12" stroke="currentColor" stroke-width="1" opacity="0.3"/>
          <line x1="12" y1="20" x2="12" y2="28" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        </svg>
      </div>
      <h2 class="empty-title">Start your knowledge canvas</h2>
      <p class="empty-subtitle">Ask a question below to create your first knowledge box</p>
    </div>
  {/if}
</div>

<style>
  .canvas-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    background: var(--bg-deep);
  }

  .canvas-container:active {
    cursor: grabbing;
  }

  /* ---- Grid Pattern ---- */
  .canvas-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
      linear-gradient(var(--grid-line-major) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line-major) 1px, transparent 1px);
    z-index: 0;
  }

  /* ---- Transform Layer ---- */
  .canvas-transform {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 1;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* ---- Connections SVG ---- */
  .connections-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 0;
  }

  /* ---- Smooth pan transition ---- */
  .canvas-transform.animating-pan {
    transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .root-title {
    position: absolute;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: center;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Empty State ---- */
  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    z-index: 2;
    animation: fadeIn 0.6s ease-out;
  }

  .empty-icon {
    color: var(--text-muted);
    margin-bottom: 16px;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -45%); }
    to { opacity: 1; transform: translate(-50%, -50%); }
  }

  .empty-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }

  .empty-subtitle {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 400;
  }
</style>
