// smoke-modes.js — quick sanity that BOTH archive modes drive the Engine end-to-end
// under the synthetic dwell model, at their intended geometry. Not a gate; a guardrail
// so the app never ships a mode that crashes. Run: node gates/smoke-modes.js
import { RNG } from '../src/rng.js';
import { Engine } from '../src/loop.js';
import { makeTaste } from './_synthetic-dwell.js';

const CAL = { dev: { min: 7.545, max: 304.0 }, harm: { min: 1.15e-3, max: 5.11e-2 } };

function run(mode, geom, nListens) {
  const rng = new RNG(0x5A1D);
  const noise = new RNG(0xB0B);
  const taste = makeTaste(12345);
  const eng = new Engine({ rng, calibration: CAL, archiveMode: mode, geometry: geom, renderOpts: { sampleRate: 22050, lengthOverride: 2 }, synthetic: true });
  let relistens = 0;
  for (let i = 0; i < nListens; i++) {
    const cand = eng.nextCandidate();
    if (cand.relisten) relistens++;
    const L = cand.L_at_listen;
    const s = taste.sample(cand.genome, noise, L);
    eng.recordListen(cand, { dwell_s: s.dwell_s, completed: s.completed, listener_id: 'synthetic', is_replay: false });
  }
  const snap = eng.archive.snapshot(nListens);
  return { mode, geom, occupied: snap.cells_occupied, coverage: +snap.coverage.toFixed(3), relistens, extra: snap.relisten_tax != null ? { tax: +snap.relisten_tax.toFixed(3), meanN: +(snap.mean_elite_samples||0).toFixed(2) } : { qd: +snap.qd_score_sum_mean_fitness.toFixed(1) } };
}

console.log('deep@8x8   ', JSON.stringify(run('deep', { nx: 8, ny: 8 }, 800)));
console.log('deep@16x16 ', JSON.stringify(run('deep', { nx: 16, ny: 16 }, 800)));
console.log('adaptive@16', JSON.stringify(run('adaptive', { nx: 16, ny: 16 }, 800)));
console.log('OK');
