<script>
  /** @type {{ onsubmit: Function, selectedNodeId: string|null, isLoading: boolean }} */
  let { onsubmit, selectedNodeId = null, isLoading = false } = $props();

  let inputValue = $state('');
  let inputEl = $state(null);

  function handleSubmit(e) {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    onsubmit?.(trimmed);
    inputValue = '';
    inputEl?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  $effect(() => {
    // When a node is selected, focus the chat input automatically
    if (selectedNodeId && inputEl) {
      setTimeout(() => inputEl.focus(), 0);
    }
  });
</script>

<form class="chat-input-container" onsubmit={handleSubmit} id="chat-input-form">
  <div class="chat-input-wrapper">
    {#if selectedNodeId}
      <div class="context-badge">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L11 6L6 11L1 6L6 1Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        <span>Follow-up</span>
      </div>
    {/if}

    <input
      bind:this={inputEl}
      bind:value={inputValue}
      onkeydown={handleKeyDown}
      type="text"
      class="chat-input"
      placeholder={selectedNodeId ? 'Ask a follow-up question on this box...' : 'Ask a question to create a new knowledge box...'}
      disabled={isLoading}
      id="chat-text-input"
      autocomplete="off"
    />

    <button
      type="submit"
      class="send-btn"
      disabled={!inputValue.trim() || isLoading}
      aria-label="Send question"
      id="chat-send-btn"
    >
      {#if isLoading}
        <div class="spinner"></div>
      {:else}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 9H15M15 9L10 4M15 9L10 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </button>
  </div>
</form>

<style>
  .chat-input-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    width: min(600px, calc(100vw - 48px));
  }

  .chat-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 20px;
    background: var(--chat-bg);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    border: 1px solid var(--chat-border);
    border-radius: 50px;
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.4),
      0 1px 0 0 rgba(255, 255, 255, 0.05) inset;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .chat-input-wrapper:focus-within {
    border-color: var(--box-border-selected);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.4),
      0 1px 0 0 rgba(108, 99, 255, 0.15) inset,
      0 0 40px var(--accent-glow);
  }

  .context-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--accent-soft);
    border: 1px solid rgba(108, 99, 255, 0.2);
    border-radius: 20px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .chat-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-family: var(--font-family);
    font-size: 14px;
    font-weight: 400;
    padding: 8px 0;
    min-width: 0;
  }

  .chat-input::placeholder {
    color: var(--text-muted);
  }

  .chat-input:disabled {
    opacity: 0.5;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: #7b73ff;
    transform: scale(1.05);
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Spinner */
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile adjustments */
  @media (max-width: 480px) {
    .chat-input-container {
      bottom: 12px;
      width: calc(100vw - 24px);
    }

    .context-badge {
      display: none;
    }
  }
</style>
