// visual-viewport.js — DOM-free pan/zoom state for the background visualiser.
// Keeping the transform arithmetic here makes the browser interaction testable
// under plain Node, like the rest of src/ (README: src/ has no DOM dependency).

export const MIN_VISUAL_ZOOM = 0.35;
export const MAX_VISUAL_ZOOM = 8;

export class VisualViewport {
  constructor(opts = {}) {
    this.minZoom = opts.minZoom || MIN_VISUAL_ZOOM;
    this.maxZoom = opts.maxZoom || MAX_VISUAL_ZOOM;
    this.reset();
  }

  reset() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
  }

  // Zoom around a screen-space pointer. The world point beneath the pointer
  // remains fixed, so scrolling feels like inspecting the visual rather than
  // pulling it toward the centre of the canvas.
  zoomAt(factor, pointerX, pointerY, centreX, centreY) {
    const previous = this.zoom;
    const next = Math.min(this.maxZoom, Math.max(this.minZoom, previous * factor));
    if (next === previous) return;
    const worldX = (pointerX - centreX - this.panX) / previous;
    const worldY = (pointerY - centreY - this.panY) / previous;
    this.zoom = next;
    this.panX = pointerX - centreX - worldX * next;
    this.panY = pointerY - centreY - worldY * next;
  }

  screenPoint(worldX, worldY, centreX, centreY) {
    return {
      x: centreX + this.panX + worldX * this.zoom,
      y: centreY + this.panY + worldY * this.zoom,
    };
  }
}
