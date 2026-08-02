/**
 * Canvas Store — Svelte 5 rune-based reactive state for the knowledge canvas.
 * 
 * Layout strategy:
 * - New root questions → placed vertically below existing roots
 * - Follow-up questions on a tapped box → placed horizontally (right) as siblings
 * 
 * This creates a grid: vertical = new topics, horizontal = drill-down/follow-ups
 */

const NODE_WIDTH = 320;
const NODE_HEADER_HEIGHT = 42;
const NODE_MIN_HEIGHT = 140;
const H_GAP = 60;   // horizontal gap between sibling follow-ups
const V_GAP = 160;   // vertical gap between root nodes

// ---- SUBJECTS ----
let subjects = $state([
  { id: 'maths', name: 'Maths', color: '#6c63ff' },
  { id: 'science', name: 'Science', color: '#4ecdc4' },
  { id: 'english', name: 'English', color: '#ff6b6b' },
  { id: 'history', name: 'History', color: '#ffd93d' },
  { id: 'physics', name: 'Physics', color: '#a8e6cf' },
]);
let activeSubjectId = $state('maths');

// Per-subject canvas data storage
let subjectCanvasData = $state({});

// ---- CANVAS STATE ----
let nodes = $state([]);
let edges = $state([]);
let selectedNodeId = $state(null);
let transform = $state({ x: 0, y: 0, zoom: 1 });
let isAnimatingPan = $state(false);
let showBook = $state(true);

/**
 * Generate a unique ID
 */
function generateId() {
  return 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get the starting position for the first root node.
 * This must be a fixed world coordinate so the graph doesn't jump during relayouts.
 */
function getStartPosition() {
  if (typeof window !== 'undefined') {
    return {
      x: Math.round(window.innerWidth / 2 - NODE_WIDTH / 2),
      y: 100 // Fixed world coordinate
    };
  }
  return { x: 400, y: 100 };
}

/**
 * Calculate the height a subtree needs.
 */
function getSubtreeHeight(nodeId) {
  const node = nodes.find(n => n.id === nodeId);
  const h = node?.height || NODE_MIN_HEIGHT;
  const children = nodes.filter(n => n.parentId === nodeId);
  if (children.length === 0) return h;

  let total = 0;
  for (let i = 0; i < children.length; i++) {
    total += getSubtreeHeight(children[i].id);
    if (i < children.length - 1) total += V_GAP;
  }
  return Math.max(h, total);
}

/**
 * Recursively position a node and its children.
 */
function layoutSubtree(nodeId, x, yStart, positions) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return 0;
  
  const h = node.height || NODE_MIN_HEIGHT;
  const w = node.width || 400; // Use actual node width instead of constant

  const children = nodes.filter(n => n.parentId === nodeId);

  if (children.length === 0) {
    positions.set(nodeId, { x, y: yStart });
    return h;
  }

  let childY = yStart;
  let totalChildrenHeight = 0;

  for (let i = 0; i < children.length; i++) {
    // Child x is offset by ACTUAL parent width + gap
    const childH = layoutSubtree(children[i].id, x + w + H_GAP, childY, positions);
    totalChildrenHeight += childH;
    childY += childH;
    if (i < children.length - 1) {
      childY += V_GAP;
      totalChildrenHeight += V_GAP;
    }
  }

  const subtreeHeight = Math.max(h, totalChildrenHeight);

  // Center vertically
  positions.set(nodeId, { x, y: yStart + (subtreeHeight - h) / 2 });

  return subtreeHeight;
}

/**
 * Recalculate ALL node positions from scratch.
 * Root nodes stack vertically; each root's vertical space = its subtree height.
 * This prevents overlaps when subtrees grow.
 */
function relayout() {
  const positions = new Map();
  const roots = nodes.filter(n => !n.parentId);
  const startPos = getStartPosition();
  let y = startPos.y;

  for (const root of roots) {
    const height = layoutSubtree(root.id, startPos.x, y, positions);
    y += height + V_GAP;
  }

  // Apply new positions (creates new object refs for reactivity)
  nodes = nodes.map(n => {
    const pos = positions.get(n.id);
    if (pos) return { ...n, x: pos.x, y: pos.y };
    return n;
  });
}

/**
 * Add a new node to the canvas
 */
function addNode(question, answer, parentId = null, summaryTitle = null) {
  const id = generateId();
  const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
  const initialX = typeof window !== 'undefined' ? window.innerWidth / 2 - 200 : 400;
  const yRatio = showBook ? 0.70 : 0.50;
  const initialY = typeof window !== 'undefined' ? window.innerHeight * yRatio - 100 : 400;

  const newNode = {
    id,
    question,
    answer,
    summaryTitle,
    x: parentNode ? parentNode.x + (parentNode.width || 400) + H_GAP : initialX,
    y: parentNode ? parentNode.y : initialY,
    parentId,
    collapsed: false,
    width: 400,
    height: 200,
    isAnimatingIn: true
  };

  nodes = [...nodes, newNode];

  if (parentId) {
    const edgeId = 'edge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    edges = [...edges, { id: edgeId, fromId: parentId, toId: id }];
  }

  // Recalculate ALL positions to prevent overlaps
  relayout();

  // Remove animation flag after animation completes
  setTimeout(() => {
    nodes = nodes.map(n => n.id === id ? { ...n, isAnimatingIn: false } : n);
  }, 500);

  return id;
}

/**
 * Update an existing node
 */
function updateNode(id, updates) {
  nodes = nodes.map(n => n.id === id ? { ...n, ...updates } : n);
  
  // If dimensions changed, we MUST recalculate the layout to prevent overlapping!
  if (updates.height !== undefined || updates.width !== undefined) {
    relayout();
  }
}

/**
 * Select a node
 */
function selectNode(id) {
  selectedNodeId = id;
}

/**
 * Deselect all nodes
 */
function deselectAll() {
  selectedNodeId = null;
}

/**
 * Toggle node collapse state
 */
function toggleCollapse(id) {
  nodes = nodes.map(n => n.id === id ? { ...n, collapsed: !n.collapsed } : n);
}

/**
 * Get node by ID
 */
function getNode(id) {
  return nodes.find(n => n.id === id);
}

/**
 * Set canvas transform (pan/zoom)
 */
function setTransform(newTransform) {
  transform = { ...transform, ...newTransform };
}

/**
 * Pan the canvas by delta
 */
function panBy(dx, dy) {
  transform = { ...transform, x: transform.x + dx, y: transform.y + dy };
}

/**
 * Zoom the canvas toward a point
 */
function zoomAt(newZoom, clientX, clientY) {
  const clampedZoom = Math.max(0.15, Math.min(3, newZoom));
  const ratio = clampedZoom / transform.zoom;

  transform = {
    x: clientX - (clientX - transform.x) * ratio,
    y: clientY - (clientY - transform.y) * ratio,
    zoom: clampedZoom
  };
}

/**
 * Get the canvas bounds (min/max x/y of all nodes) — used for auto-expanding
 */
function getCanvasBounds() {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x + NODE_WIDTH > maxX) maxX = node.x + NODE_WIDTH;
    if (node.y + NODE_MIN_HEIGHT > maxY) maxY = node.y + NODE_MIN_HEIGHT;
  }

  return { 
    minX: minX - 100, 
    minY: minY - 100, 
    maxX: maxX + 100, 
    maxY: maxY + 100 
  };
}

/**
 * Smoothly pan the canvas to view a specific node.
 * If the node is massive, it clamps the zoom to keep text readable (0.85 min zoom),
 * and aligns the camera to the top of the node instead of the center.
 */
function panToNode(nodeId) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Available space for the node
  const usableH = showBook ? (viewportH * 0.45) : (viewportH - 140);
  const usableW = viewportW - 80;

  // Calculate required zoom to fit the node with padding
  const zoomH = usableH / (node.height + 60);
  const zoomW = usableW / (node.width + 60);
  
  // Enforce a minimum zoom of 0.55 so it zooms out enough to see the box, but not so far it becomes unreadable dots
  let targetZoom = Math.min(transform.zoom, zoomH, zoomW, 1.2);
  targetZoom = Math.max(0.55, targetZoom);

  const nodeCenterX = node.x + node.width / 2;
  const targetX = viewportW / 2 - nodeCenterX * targetZoom;

  let targetY;
  const scaledNodeHeight = node.height * targetZoom;

  if (scaledNodeHeight > usableH) {
    // Node is too massive to fit vertically. Align to the TOP of the node so user can start reading.
    const topMargin = showBook ? (viewportH * 0.55) : 100;
    targetY = topMargin - node.y * targetZoom;
  } else {
    // Fits comfortably, center it vertically in the usable space.
    const nodeCenterY = node.y + node.height / 2;
    const yRatio = showBook ? 0.70 : 0.50;
    targetY = viewportH * yRatio - nodeCenterY * targetZoom;
  }

  isAnimatingPan = true;
  transform = {
    x: targetX,
    y: targetY,
    zoom: targetZoom
  };

  setTimeout(() => { isAnimatingPan = false; }, 500);
}

/**
 * Switch to a different subject. Saves current canvas data and loads target subject.
 */
function switchSubject(subjectId) {
  if (subjectId === activeSubjectId) return;

  // Save current subject's data
  subjectCanvasData = {
    ...subjectCanvasData,
    [activeSubjectId]: { nodes: [...nodes], edges: [...edges] }
  };

  // Load target subject's data
  const data = subjectCanvasData[subjectId];
  if (data) {
    nodes = [...data.nodes];
    edges = [...data.edges];
  } else {
    nodes = [];
    edges = [];
  }

  activeSubjectId = subjectId;
  selectedNodeId = null;
  transform = { x: 0, y: 0, zoom: 1 };
  isAnimatingPan = false;
}

/**
 * Toggle book visibility and pan the camera to keep nodes visible
 */
function toggleBook() {
  showBook = !showBook;
  if (typeof window !== 'undefined') {
    const deltaY = window.innerHeight * 0.20;
    isAnimatingPan = true;
    if (showBook) {
      // Book appeared at top, push canvas down
      transform = { ...transform, y: transform.y + deltaY };
    } else {
      // Book hidden, pull canvas up
      transform = { ...transform, y: transform.y - deltaY };
    }
    setTimeout(() => { isAnimatingPan = false; }, 500);
  }
}

/**
 * Set book visibility directly
 */
function setBookVisibility(visible) {
  showBook = visible;
}

export function getCanvasStore() {
  return {
    get subjects() { return subjects; },
    get activeSubjectId() { return activeSubjectId; },
    get nodes() { return nodes; },
    get edges() { return edges; },
    get rootNodes() { return nodes.filter(n => !n.parentId); },
    get selectedNodeId() { return selectedNodeId; },
    get transform() { return transform; },
    get isAnimatingPan() { return isAnimatingPan; },
    get showBook() { return showBook; },
    switchSubject,
    addNode,
    updateNode,
    selectNode,
    deselectAll,
    toggleCollapse,
    getNode,
    setTransform,
    panBy,
    zoomAt,
    getCanvasBounds,
    panToNode,
    toggleBook,
    setBookVisibility,

    NODE_WIDTH,
    NODE_HEADER_HEIGHT,
    NODE_MIN_HEIGHT,
    H_GAP,
    V_GAP
  };
}
