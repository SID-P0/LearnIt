<script>
  /** @type {{ store: any, bookStore: any }} */
  let { store, bookStore } = $props();

  let uploadInput = $state(null);
  let uploadStatus = $state('');
  let uploadProgress = $state(0);

  async function handleUpload(e) {
    const input = e.target;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    uploadStatus = `Uploading ${files.length} image(s)...`;
    uploadProgress = 0;

    const formData = new FormData();
    for (const file of files) {
      formData.append('images', file);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      uploadProgress = data.count;
      uploadStatus = `Adding ${data.count} page(s) to book...`;

      await bookStore.addPageImages(data.pages);

      uploadStatus = `Done — ${data.count} page(s) added`;
      setTimeout(() => {
        uploadStatus = '';
        uploadProgress = 0;
      }, 3000);
    } catch (err) {
      console.error('Upload error:', err);
      uploadStatus = 'Upload failed';
      setTimeout(() => { uploadStatus = ''; }, 3000);
    }

    input.value = '';
  }
</script>

<!-- Index / Notes (Middle Right) -->
<div class="right-tabs notes-tabs" class:always-visible={store.nodes.length > 0}>
  <div class="notes-wrapper">
    <div class="notes-panel">
      <div class="index-header">Notes & Queries</div>
      <div class="index-content">
        <div class="subject-title">{store.subjects.find(s => s.id === store.activeSubjectId)?.name || 'Chapter name'}</div>
        <!-- The main tree container, acting as the children of the Subject -->
        <ul class="tree-children" style="margin-top: 0;">
          {#each store.rootNodes as root (root.id)}
            {@const children = store.nodes.filter(n => n.parentId === root.id)}
            <li class="tree-child">
              <button class="index-btn root-btn" onclick={() => store.panToNode(root.id)}>
                {root.summaryTitle || root.question || 'Topic'}
              </button>
              
              <!-- Render immediate children of this root node -->
              {#if children.length > 0}
                <ul class="tree-children">
                  {#each children as child (child.id)}
                    <li class="tree-child">
                      <button class="index-btn child-btn" onclick={() => store.panToNode(child.id)}>
                        {child.summaryTitle || child.question}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</div>

<!-- Tools (Bottom Right) -->
<div class="right-tabs tool-tabs">
  <button class="right-tab" style="--tab-color: #3498db;">
    <svg class="tab-shape" viewBox="0 0 140 44" fill="none" preserveAspectRatio="none">
      <path
        d="M0 4 C0 1.8 1.8 0 4 0 L118 0 C120 0 122 1 123.5 2.5 L138 22 L123.5 41.5 C122 43 120 44 118 44 L4 44 C1.8 44 0 42.2 0 40 Z"
        fill="#3498db" stroke="#3498db" stroke-width="1"
      />
    </svg>
    <span class="tab-label">🤖 Agent</span>
  </button>

  <button class="right-tab" style="--tab-color: #9b59b6;">
    <svg class="tab-shape" viewBox="0 0 140 44" fill="none" preserveAspectRatio="none">
      <path
        d="M0 4 C0 1.8 1.8 0 4 0 L118 0 C120 0 122 1 123.5 2.5 L138 22 L123.5 41.5 C122 43 120 44 118 44 L4 44 C1.8 44 0 42.2 0 40 Z"
        fill="#9b59b6" stroke="#9b59b6" stroke-width="1"
      />
    </svg>
    <span class="tab-label">📤 Upload</span>
  </button>
</div>

<!-- Upload Panel -->
{#if uploadStatus}
  <div class="upload-panel">
    <p class="upload-status">{uploadStatus}</p>
    {#if uploadProgress > 0}
      <div class="upload-progress-bar">
        <div class="upload-progress-fill" style="width: {(uploadProgress / Math.max(uploadProgress, 1)) * 100}%"></div>
      </div>
    {/if}
  </div>
{/if}

<!-- Hidden file input -->
<input
  bind:this={uploadInput}
  type="file"
  accept="image/*"
  multiple
  onchange={handleUpload}
  style="display: none;"
/>

<style>
  .right-tabs {
    position: absolute;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 20;
    pointer-events: auto;
  }

  .notes-tabs {
    bottom: 160px; /* Positioned just above the tool tabs */
  }

  .notes-wrapper {
    display: flex;
    align-items: center;
    transform: translateX(100%); /* hidden off-screen by default */
    transition: transform var(--transition-slow);
  }
  
  .notes-tabs:hover .notes-wrapper,
  .notes-tabs.always-visible .notes-wrapper {
    transform: translateX(0); /* slide in */
  }

  /* The actual tab shape for Notes doesn't need to translate itself anymore because the wrapper does */
  .notes-tab {
    transform: none !important;
    right: -110px; /* pull it out so it peeks even when wrapper is at 100% */
  }

  .notes-tabs:hover .notes-tab,
  .notes-tabs.always-visible .notes-tab {
    right: 0;
  }

  .notes-panel {
    width: 240px;
    background: var(--surface-1);
    border: 1px solid var(--box-border);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    padding: 16px;
    backdrop-filter: blur(10px);
    max-height: 50vh;
    overflow-y: auto;
  }

  .index-header {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--box-border);
    margin-bottom: 12px;
  }

  .index-content {
    flex: 1;
    overflow-y: auto;
  }

  .subject-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
    padding-left: 4px;
  }

  /* Tree children styling with connecting lines */
  .tree-children {
    list-style: none;
    margin: 4px 0 0 8px;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--box-border);
  }

  .tree-child {
    position: relative;
    margin-bottom: 4px;
  }

  /* The horizontal line pointing to the child */
  .tree-child::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 14px; /* Align with middle of the button text */
    width: 8px;
    height: 1px;
    background: var(--box-border);
  }

  .index-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .index-btn:hover {
    color: var(--text-primary);
    background: var(--surface-2);
  }

  .root-btn {
    font-weight: 500;
    color: var(--text-primary);
  }

  .child-btn {
    font-size: 12px;
    color: var(--text-muted);
  }

  .tool-tabs {
    bottom: 32px;
  }

  .right-tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 130px;
    height: 40px;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
    transform-origin: right center;
    right: 0;
    transform: translateX(110px);
  }

  .right-tab:hover {
    transform: translateX(0);
  }

  .tab-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: scaleX(-1);
  }

  .tab-label {
    position: relative;
    z-index: 1;
    padding-right: 16px;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: color var(--transition-fast);
  }

  .right-tab:hover .tab-label {
    color: white;
    font-weight: 600;
  }

  /* Upload Panel */
  .upload-panel {
    position: fixed;
    bottom: 80px;
    right: 24px;
    width: 280px;
    background: var(--surface-1);
    border: 1px solid var(--box-border);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    z-index: 50;
    backdrop-filter: blur(10px);
  }

  .upload-status {
    font-size: 12px;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }

  .upload-progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .upload-progress-fill {
    height: 100%;
    background: var(--accent, #6c63ff);
    border-radius: 2px;
    transition: width 0.3s ease;
  }
</style>
