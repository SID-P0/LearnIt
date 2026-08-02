<script>
  import '../app.css';
  import { fade } from 'svelte/transition';
  import Canvas from '$lib/components/Canvas.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import SubjectTabs from '$lib/components/SubjectTabs.svelte';
  import RightSidebar from '$lib/components/RightSidebar.svelte';
  import BookReader from '$lib/components/BookReader.svelte';
  import { getCanvasStore } from '$lib/stores/canvasStore.svelte.js';
  import { getBookStore } from '$lib/stores/bookStore.svelte.js';
  import { askAgent, summarizeQuestion } from '$lib/services/agent.js';

  const store = getCanvasStore();
  const bookStore = getBookStore();

  let isLoading = $state(false);

  async function handleQuestion(question) {
    isLoading = true;

    // Capture active subject before async call
    const subjectAtAsk = store.activeSubjectId;

    try {
      // Get context from selected node if any
      const parentId = store.selectedNodeId;
      const parentNode = parentId ? store.getNode(parentId) : null;
      const context = parentNode ? `Q: ${parentNode.question}\nA: ${parentNode.answer}` : null;

      // Ask the agent and optionally summarize if it's a root node
      const bookContext = store.showBook && bookStore.isPdfLoaded ? bookStore.getCurrentChapterText() : null;
      
      const [answer, summaryTitle] = await Promise.all([
        askAgent(question, context, bookContext),
        !parentId ? summarizeQuestion(question) : Promise.resolve(null)
      ]);

      // Only create box + pan if user is still on the same subject
      if (store.activeSubjectId !== subjectAtAsk) return;

      // Create the new box
      const newNodeId = store.addNode(question, answer, parentId, summaryTitle);

      // Deselect so the next question creates a new root box by default
      store.deselectAll();

      // Give Svelte time to render the new box in the DOM, measure its exact 
      // massive text height via bind:clientHeight, update the store, and THEN pan!
      setTimeout(() => {
        store.panToNode(newNodeId);
      }, 50);
    } catch (err) {
      console.error('Failed to get answer:', err);
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>LearnIt — Knowledge Canvas</title>
</svelte:head>

<main id="app-main">
  <!-- Top placeholder for Future Top Nav -->
  <header class="top-bar">
    <div class="nav-links">
      <button>Grade (with ages)</button>
      <button>Homework</button>
      <button>Fundamentals</button>
      <button>Mock Practice</button>
      <button>Previously asked Q</button>
      <button>Exam Calender</button>
    </div>
    <div class="nav-actions">
      <button class="icon-btn">G</button>
      <button class="icon-btn">Flag</button>
    </div>
  </header>

  <div class="dashboard-content">
    <SubjectTabs 
      subjects={store.subjects}
      activeSubjectId={store.activeSubjectId}
      onswitch={(id) => store.switchSubject(id)}
    />
    
    <div class="canvas-wrapper">
      <Canvas {store} />
      
      {#if store.showBook}
        <div class="book-overlay" transition:fade={{ duration: 200 }}>
          <BookReader {bookStore} />
        </div>
      {/if}
    </div>

    <RightSidebar {store} {bookStore} />

    <div class="chat-overlay">
      <ChatInput
        onsubmit={handleQuestion}
        selectedNodeId={store.selectedNodeId}
        {isLoading}
      />
    </div>

    <!-- Book Toggle Button aligned to the right of the Chat Input -->
    <button class="book-toggle-btn" onclick={() => store.toggleBook()}>
      {store.showBook ? '📖 Hide Book' : '📖 Show Book'}
    </button>
  </div>
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-deep);
  }

  /* Top Bar Placeholder */
  .top-bar {
    height: 60px;
    border-bottom: 1px solid var(--grid-line-major);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    flex-shrink: 0;
    position: relative;
    z-index: 30;
    background: var(--bg-deep);
  }

  .nav-links {
    display: flex;
    gap: 8px;
    border: 1px solid var(--box-border);
    border-radius: var(--radius-sm);
    padding: 4px;
  }

  .nav-links button {
    background: transparent;
    border: none;
    color: var(--text-primary);
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  
  .nav-links button:hover {
    background: var(--surface-1);
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .circle-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--box-border);
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .flag-btn {
    border: 1px solid var(--box-border);
    background: transparent;
    color: var(--text-primary);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .dashboard-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .book-overlay {
    position: absolute;
    top: 0;
    left: 5%;
    right: 5%;
    height: 50%;
    z-index: 10;
    pointer-events: auto;
  }

  .chat-overlay {
    pointer-events: none;
    z-index: 20;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  :global(.chat-overlay > *) {
    pointer-events: auto;
  }

  .book-toggle-btn {
    position: absolute;
    bottom: 24px;
    left: calc(50vw + 316px); /* Aligns with the right edge of the 600px wide chat bar */
    height: 48px; /* Matches standard chat bar height */
    padding: 0 16px;
    background: var(--surface-2);
    border: 1px solid var(--box-border);
    border-radius: 50px;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    z-index: 100;
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    box-shadow: var(--box-shadow-sm);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .book-toggle-btn:hover {
    background: var(--surface-3);
    border-color: var(--box-border-hover);
  }

  @media (max-width: 900px) {
    .book-toggle-btn {
      left: auto;
      right: 24px;
    }
  }
</style>
