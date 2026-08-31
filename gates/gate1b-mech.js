// gate1b-mech.js — Gate 1b (mechanical half): the lineage stack (§13.1).
//
// AUTONOMOUS (BUILD-ORDER: "1b-mech ... Yes"). Tests the one thing the B key must
// do: "B returns reliably to the previous state at arbitrary depth." The
// perceptual half of 1b (are M's children recognisably related) is subsumed by
// the objective Gate 2a (BUILD-ORDER), so it is not judged here.
//
// This gate also exercises the §14 genome delta/resync store and proves exact
// reconstruction, since a lineage that cannot be reconstructed from the log has
// failed §14.
//
// Run: node gates/gate1b-mech.js

import { RNG } from '../src/rng.js';
import { randomGenome } from '../src/priors.js';
import { breed } from '../src/variation.js';
import { Lineage } from '../src/lineage.js';
import { GenomeStore } from '../src/logging.js';
import { writeArtefact } from './_util.js';

const DEPTH = 40; // "arbitrary depth" — deep enough to catch off-by-one stack bugs

function testStraightReturn(rng) {
  // Build a straight chain of DEPTH M-presses, then B all the way back.
  const store = new GenomeStore();
  const root = randomGenome(rng);
  store.put(root, null);
  const lin = new Lineage(root);
  const path = [root.id];
  let cur = root;
  for (let i = 0; i < DEPTH; i++) {
    const { child } = breed(cur, rng, { crossoverRate: 0 });
    store.put(child, cur);
    lin.mutateChild(child);
    path.push(child.id);
    cur = child;
  }
  // B back through the whole chain; each return must match the recorded path.
  let exact = true;
  const returns = [];
  for (let i = path.length - 2; i >= 0; i--) {
    const g = lin.back();
    returns.push(g.id);
    if (g.id !== path[i]) exact = false;
  }
  // One extra B at the root must be a no-op.
  const rootStays = lin.back().id === path[0];
  return { name: 'straight_return', depth: DEPTH, exact_return: exact, root_noop: rootStays };
}

function testInterleaved(rng) {
  // Drive a random script of M / B / SPACE against a reference model and check
  // that the lineage's current id matches the model at every step.
  const store = new GenomeStore();
  let root = randomGenome(rng);
  store.put(root, null);
  const lin = new Lineage(root);
  // Reference model: current + explicit ancestor stack of ids.
  let refCur = root.id;
  let refStack = [];
  let mismatches = 0, steps = 0;
  const genomeById = new Map([[root.id, root]]);

  for (let s = 0; s < 400; s++) {
    const r = rng.next();
    if (r < 0.55) {
      // M
      const curGenome = genomeById.get(lin.current.id);
      const { child } = breed(curGenome, rng, { crossoverRate: 0 });
      store.put(child, curGenome);
      genomeById.set(child.id, child);
      lin.mutateChild(child);
      refStack.push(refCur); refCur = child.id;
    } else if (r < 0.85) {
      // B
      lin.back();
      if (refStack.length > 0) refCur = refStack.pop();
    } else {
      // SPACE — new root, reset lineage
      const g = randomGenome(rng);
      store.put(g, null);
      genomeById.set(g.id, g);
      lin.newRoot(g);
      refStack = []; refCur = g.id;
    }
    steps++;
    if (lin.current.id !== refCur) mismatches++;
  }
  return { name: 'interleaved', steps, mismatches, exact: mismatches === 0 };
}

function testReconstruction(rng) {
  // Every genome in a chain must reconstruct bit-exactly from the delta/resync
  // store alone (§14). This is the log-integrity half of the gate.
  const store = new GenomeStore();
  const genomes = [];
  let cur = randomGenome(rng);
  store.put(cur, null);
  genomes.push(cur);
  for (let i = 0; i < 250; i++) { // > 2 resync points (every 100)
    const { child } = breed(cur, rng, { crossoverRate: 0 });
    store.put(child, cur);
    genomes.push(child);
    cur = child;
  }
  let allExact = true, checked = 0;
  for (const g of genomes) {
    const arr = store.reconstruct(g.id);
    if (!arr) { allExact = false; break; }
    for (let i = 0; i < g.data.length; i++) if (arr[i] !== g.data[i]) { allExact = false; break; }
    checked++;
  }
  return { name: 'reconstruction', genomes: genomes.length, checked, exact: allExact };
}

function main() {
  const rng = new RNG(0xB1EC); // fixed seed → reproducible gate
  const results = [
    testStraightReturn(rng),
    testInterleaved(rng),
    testReconstruction(rng),
  ];
  const pass =
    results[0].exact_return && results[0].root_noop &&
    results[1].exact && results[2].exact;

  const path = writeArtefact('gate1b-mech.json', {
    gate: '1b-mech',
    description: 'Lineage stack: B returns to previous state at arbitrary depth; genome reconstruction from log.',
    pass,
    results,
  });

  console.log('── Gate 1b-mech (lineage stack) ──');
  for (const r of results) console.log(' ', JSON.stringify(r));
  console.log('  PASS:', pass);
  console.log('  artefact:', path);
  process.exit(pass ? 0 : 1);
}

main();
