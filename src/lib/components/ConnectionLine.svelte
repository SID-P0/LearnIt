<script>
  /**
   * ConnectionLine — Draws a straight-line path from parent box to child box
   * Lines match the draw.io style: straight segments with right angles
   */

  /** @type {{ fromNode: any, toNode: any, nodeHeaderHeight: number, nodeMinHeight: number }} */
  let { fromNode, toNode, nodeHeaderHeight = 42, nodeMinHeight = 140 } = $props();

  // Calculate connection points
  // From: right-center of parent box
  // To: left-center of child box
  let fromX = $derived(fromNode.x + fromNode.width);
  let fromY = $derived(fromNode.y + (fromNode.collapsed ? nodeHeaderHeight / 2 : nodeMinHeight / 2));
  let toX = $derived(toNode.x);
  let toY = $derived(toNode.y + (toNode.collapsed ? nodeHeaderHeight / 2 : nodeMinHeight / 2));

  // Midpoint for the right-angle path
  let midX = $derived((fromX + toX) / 2);

  // SVG path: straight line from parent right → mid horizontal → turn → child left
  let pathD = $derived(
    `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
  );
</script>

<g class="connection-line">
  <!-- Arrowhead marker definition -->
  <defs>
    <marker
      id="arrowhead-{fromNode.id}-{toNode.id}"
      markerWidth="12"
      markerHeight="10"
      refX="11"
      refY="5"
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path d="M 0 0 L 12 5 L 0 10 L 3 5 Z" fill="rgba(255,255,255,0.5)" />
    </marker>
  </defs>

  <!-- Shadow line for depth -->
  <path
    d={pathD}
    fill="none"
    stroke="rgba(0,0,0,0.3)"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <!-- Main line with arrow -->
  <path
    d={pathD}
    fill="none"
    stroke="rgba(255,255,255,0.18)"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    marker-end="url(#arrowhead-{fromNode.id}-{toNode.id})"
  />
  <!-- Animated dot traveling along the path on creation -->
  <circle r="3" fill="var(--accent)" opacity="0.6">
    <animateMotion
      dur="0.8s"
      repeatCount="1"
      fill="freeze"
      path={pathD}
    />
    <animate
      attributeName="opacity"
      from="0.8"
      to="0"
      dur="0.8s"
      fill="freeze"
    />
  </circle>
</g>

<style>
  .connection-line {
    pointer-events: none;
  }
</style>
