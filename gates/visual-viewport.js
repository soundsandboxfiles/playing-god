// visual-viewport.js — fast Node guardrail for background pan/zoom arithmetic.
// Run: node gates/visual-viewport.js

import assert from 'node:assert/strict';
import { VisualViewport } from '../src/visual-viewport.js';

const view = new VisualViewport();
assert.deepEqual(view.screenPoint(10, 20, 100, 100), { x: 110, y: 120 });

view.panBy(15, -5);
assert.deepEqual(view.screenPoint(10, 20, 100, 100), { x: 125, y: 115 });

const anchor = { x: 180, y: 140 };
const worldAtAnchor = {
  x: (anchor.x - 100 - view.panX) / view.zoom,
  y: (anchor.y - 100 - view.panY) / view.zoom,
};
view.zoomAt(2, anchor.x, anchor.y, 100, 100);
assert.deepEqual(view.screenPoint(worldAtAnchor.x, worldAtAnchor.y, 100, 100), anchor);

view.zoomAt(1e6, anchor.x, anchor.y, 100, 100);
assert.equal(view.zoom, view.maxZoom, 'zoom is capped at the configured maximum');
view.zoomAt(1e-12, anchor.x, anchor.y, 100, 100);
assert.equal(view.zoom, view.minZoom, 'zoom is capped at the configured minimum');

view.reset();
assert.deepEqual(
  { zoom: view.zoom, panX: view.panX, panY: view.panY },
  { zoom: 1, panX: 0, panY: 0 },
);

console.log('visual viewport OK');
