<script>
  /**
   * SubjectTabs — Bookmark-style subject navigation tabs on the left edge.
   * Each tab is shaped like a ribbon bookmark (flat left, pointed right).
   */

  /** @type {{ subjects: any[], activeSubjectId: string, onswitch: Function }} */
  let { subjects, activeSubjectId, onswitch } = $props();
</script>

<nav class="subject-tabs" aria-label="Subject navigation" id="subject-tabs">
  {#each subjects as subject (subject.id)}
    <button
      class="subject-tab"
      class:active={activeSubjectId === subject.id}
      onclick={() => onswitch?.(subject.id)}
      aria-current={activeSubjectId === subject.id ? 'page' : undefined}
      id="subject-tab-{subject.id}"
      style="--tab-color: {subject.color};"
    >
      <!-- Bookmark SVG shape -->
      <svg class="tab-shape" viewBox="0 0 140 44" fill="none" preserveAspectRatio="none">
        <path
          d="M0 4 C0 1.8 1.8 0 4 0 L118 0 C120 0 122 1 123.5 2.5 L138 22 L123.5 41.5 C122 43 120 44 118 44 L4 44 C1.8 44 0 42.2 0 40 Z"
          fill={subject.color}
          stroke={subject.color}
          stroke-width="1"
        />
      </svg>
      <span class="tab-label">{subject.name}</span>
    </button>
  {/each}
</nav>

<style>
  .subject-tabs {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 24px 0;
    width: 140px;
    z-index: 20;
    pointer-events: auto;
  }

  .subject-tab {
    position: relative;
    display: flex;
    align-items: center;
    width: 130px;
    height: 40px;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
    transform-origin: left center;
    left: 0;
    transform: translateX(-110px);
  }

  .subject-tab:hover {
    transform: translateX(0);
  }

  .subject-tab.active {
    transform: translateX(10px);
    width: 140px;
  }

  .tab-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .tab-label {
    position: relative;
    z-index: 1;
    padding-left: 16px;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: color var(--transition-fast);
  }

  .subject-tab.active .tab-label {
    color: white;
    font-weight: 600;
  }

  .subject-tab:hover .tab-label {
    color: var(--text-primary);
  }

  /* Active indicator dot */
  .subject-tab.active::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: white;
    z-index: 2;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; transform: translateY(-50%) scale(1); }
    50% { opacity: 1; transform: translateY(-50%) scale(1.3); }
  }

  /* Mobile: move to top, horizontal scroll */
  @media (max-width: 768px) {
    .subject-tabs {
      top: 0;
      left: 0;
      right: 0;
      bottom: auto;
      transform: none;
      flex-direction: row;
      overflow-x: auto;
      padding: 8px 12px;
      gap: 8px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .subject-tabs::-webkit-scrollbar {
      display: none;
    }

    .subject-tab {
      left: 0;
      width: auto;
      min-width: 90px;
      height: 34px;
      flex-shrink: 0;
    }

    .subject-tab:hover,
    .subject-tab.active {
      transform: none;
      width: auto;
    }
  }
</style>
