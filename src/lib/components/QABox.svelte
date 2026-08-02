<script>
  import { getCanvasStore } from '$lib/stores/canvasStore.svelte.js';
  
  /** @type {{ node: any, selected: boolean, onselect: Function, ontoggle: Function }} */
  let { node, selected = false, onselect, ontoggle } = $props();

  const store = getCanvasStore();
  let clientHeight = $state(node.height);
  let clientWidth = $state(node.width);

  // A box is massive if it has more than ~60 words (approx 350 characters)
  let isMassive = $derived(node.answer && node.answer.length > 350);
  
  // A massive box is expanded ONLY when it is the currently selected node
  let isExpanded = $derived(isMassive && store.selectedNodeId === node.id);
  let wasExpanded = $state(false);

  $effect(() => {
    let updates = {};
    if (clientHeight && clientHeight !== node.height) updates.height = clientHeight;
    if (clientWidth && clientWidth !== node.width) updates.width = clientWidth;
    
    if (Object.keys(updates).length > 0) {
      store.updateNode(node.id, updates);
      
      // If the node just expanded its height because it was selected, pan to it so the user can read it!
      if (isExpanded && !wasExpanded) {
        // Auto-hide the book to give this massive answer maximum screen real estate
        if (store.showBook) {
          store.setBookVisibility(false);
        }
        
        // Wait a tick for the book UI to disappear before calculating camera bounds
        setTimeout(() => store.panToNode(node.id), 50);
      }
    }
    wasExpanded = isExpanded;
  });

  function handleClick(e) {
    e.stopPropagation();
    onselect?.(node.id);
  }

  function handleToggle(e) {
    e.stopPropagation();
    ontoggle?.(node.id);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  }
</script>

<div
  bind:clientHeight={clientHeight}
  bind:clientWidth={clientWidth}
  class="qa-box"
  class:selected
  class:collapsed={node.collapsed}
  class:animate-in={node.isAnimatingIn}
  class:massive={isMassive}
  style="left: {node.x}px; top: {node.y}px;"
  onclick={handleClick}
  onkeydown={handleKeyDown}
  role="button"
  tabindex="0"
  id="qa-box-{node.id}"
>
  <!-- Header -->
  <div class="qa-header">
    <button
      class="collapse-btn"
      onclick={handleToggle}
      aria-label={node.collapsed ? 'Expand answer' : 'Collapse answer'}
      title={node.collapsed ? 'Expand' : 'Collapse'}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {#if node.collapsed}
          <rect x="2" y="6" width="10" height="2" rx="1" fill="currentColor" />
          <rect x="6" y="2" width="2" height="10" rx="1" fill="currentColor" />
        {:else}
          <rect x="2" y="6" width="10" height="2" rx="1" fill="currentColor" />
        {/if}
      </svg>
    </button>
    <span class="qa-question">{node.question}</span>
  </div>

  <!-- Answer Body -->
  {#if !node.collapsed}
    <div class="qa-body" class:is-massive={isMassive && !isExpanded}>
      <p class="qa-answer">{node.answer}</p>
      {#if isMassive && !isExpanded}
        <div class="massive-fade"></div>
        <button class="read-more-btn" onclick={(e) => { e.stopPropagation(); store.selectNode(node.id); }}>
          Read Full Answer
        </button>
      {/if}
    </div>
  {/if}

  <!-- Selected indicator -->
  {#if selected}
    <div class="selected-indicator"></div>
  {/if}
</div>

<style>
  .qa-box {
    position: absolute;
    width: 400px; /* Default fixed width for standard boxes */
    background: var(--box-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--box-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    box-shadow: var(--box-shadow-sm);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    user-select: none;
    will-change: transform;
  }

  .qa-box.massive {
    width: max-content;
    min-width: 400px;
    max-width: 650px;
  }

  .qa-box:hover {
    border-color: var(--box-border-hover);
    box-shadow: var(--box-shadow);
  }

  .qa-box.selected {
    border-color: var(--box-border-selected);
    box-shadow:
      var(--box-shadow-hover),
      0 0 0 1px var(--box-border-selected),
      0 0 30px var(--accent-glow);
  }

  .qa-box.animate-in {
    animation: boxSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes boxSlideIn {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* --- Header --- */
  .qa-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--box-header-bg);
    border-bottom: 1px solid var(--box-border);
    min-height: 42px;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: var(--surface-2);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .collapse-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .qa-question {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.01em;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* --- Body --- */
  .qa-body {
    padding: 14px;
    min-height: 80px;
  }

  .qa-answer {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  /* --- Selected Indicator --- */
  .selected-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: pulseGlow 2s ease-in-out infinite;
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* --- Collapsed state --- */
  .qa-box.collapsed .qa-header {
    border-bottom: none;
  }

  .qa-body.is-massive {
    max-height: 250px;
    overflow: hidden;
    position: relative;
    padding-bottom: 50px; /* space for the button */
  }

  .massive-fade {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 140px;
    background: linear-gradient(to bottom, transparent, var(--box-bg) 85%);
    pointer-events: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }

  .read-more-btn {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--box-border-hover);
    border-radius: 50px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    z-index: 2;
    transition: all var(--transition-fast);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .read-more-btn:hover {
    background: var(--surface-3);
    border-color: var(--text-muted);
  }
</style>
