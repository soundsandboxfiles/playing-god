// loop.js — the per-listen engine (§6.0, §7.2b). One listen = one evaluation =
// one archive update (§7.2b), which is what makes the whole thing fit a single-key
// interface.
//
// The engine is split into two calls so it serves BOTH the headless plumbing gate
// (synthetic dwell) and the browser app (real dwell) from one code path:
//   nextCandidate()  — select parent, breed, render, find target cell, hand back
//                       the Creature to PLAY.
//   recordListen()   — given the measured dwell, compute fitness, insert into the
//                       archive, update the servo, and log (§14).
//
// A gene may NOT touch the fitness function (§2.5): everything the engine uses to
// MEASURE (dwell, descriptors, servo L, lineage depth) is global here, never read
// from the genome. Genes influence VARIATION only.

import { randomGenome } from './priors.js';
import { breed, mutateGenome } from './variation.js';
import { renderNormalized } from './render.js';
import { computeDescriptors, cellOf } from './descriptors.js';
import { Archive } from './archive.js';
import { Servo } from './servo.js';
import { Cooldown, REGEN_TRIES } from './cooldown.js';
import { GenomeStore, RESYNC_EVERY } from './logging.js';
import { computeContrib, ownDwellMean, lineageFitness, UNATTENDED_WEIGHT } from './fitness.js';
import {
  WAVE_SLOTS, GENES_PER_WAVE, GLOBAL_SCHEMA, GLOBAL_INDEX, inverseMap, complexity,
} from './genome.js';
import { distance } from './distance.js';

export const SEED_BATCH = 32;   // §5 / Appendix
export const SEED_SIGMA = 0.2;  // §5
export const MIN_DWELL_S = 0.35; // §8.3
export const CROSSOVER_RATE = 0.50; // §6.4 / Appendix

export class Engine {
  // opts:
  //   rng           — seeded RNG (required)
  //   calibration   — { dev:{min,max}, harm:{min,max} } axis ranges (from Gate 2b)
  //   switchRates   — { switchName: p_class } from Gate 2a (optional)
  //   logger        — a Logger (logging.js) (optional but expected)
  //   renderOpts    — { sampleRate, lengthOverride } — lengthOverride short-circuits
  //                   the servo's L for fast plumbing runs (labelled SYNTHETIC).
  //   synthetic     — true to tag the run SYNTHETIC in logs (BUILD-ORDER).
  constructor(opts) {
    this.rng = opts.rng;
    this.cal = opts.calibration;
    this.switchRates = opts.switchRates || null;
    this.logger = opts.logger || null;
    this.renderSampleRate = (opts.renderOpts && opts.renderOpts.sampleRate) || 22050;
    this.lengthOverride = opts.renderOpts && opts.renderOpts.lengthOverride;
    this.captureVisEnv = !!(opts.renderOpts && opts.renderOpts.captureVisEnv); // §11 fast channel
    this.synthetic = !!opts.synthetic;

    this.archive = new Archive();
    // Reproducible eviction for headless runs (§7.4 note): fitness-blind uniform.
    this.archive.setEvictionRng(() => this.rng.next());
    this.servo = new Servo();
    this.cooldown = new Cooldown();
    this.genomeStore = new GenomeStore();

    // Provenance/fitness registry: id → { genome, observations, ownDwellMean,
    // directParents:{id:frac} }. Kept for evicted genomes too — they remain
    // ancestors and Predictor training data (§12).
    this.registry = new Map();

    // F2: the owner's Gate 1a picks, as an array of Genome seed-parents (optional).
    // When present the archive is seeded from them; otherwise the v1 fallback
    // (one random draw + mutants) is used, so gates that do not care about the
    // picks still run.
    this.seedGenomes = opts.seedGenomes || null;

    this.listenId = 0;
    this.seedQueue = [];
    this._initSeeds();
  }

  // §5 seeded initial batch, F2-amended. If seed-parent picks are supplied, the
  // batch is the picks plus σ=0.2 mutants of them to fill SEED_BATCH (32); else the
  // v1 behaviour (one random genome + 31 mutations of it at σ=0.2). Either way the
  // batch is held in a pending queue and played in sequence, inserted only after it
  // has been heard (§5, §7.5 ordering — unchanged).
  _initSeeds() {
    if (this.seedGenomes && this.seedGenomes.length > 0) {
      // F2: seed parents = the owner's picks. Add each pick as a root, then fill to
      // 32 with σ=0.2 mutants, cycling through the picks so each contributes mutants.
      const picks = this.seedGenomes;
      for (const p of picks) {
        p.src = new Int8Array(WAVE_SLOTS); // roots for provenance (§8.2)
        this.seedQueue.push(p);
      }
      let i = 0;
      while (this.seedQueue.length < SEED_BATCH) {
        const parent = picks[i % picks.length];
        const m = parent.clone();
        forceSigma(m, SEED_SIGMA); // σ=0.2 seed mutation scale (§5)
        mutateGenome(m, this.rng, { switchRates: this.switchRates });
        m.id = m.hash();
        m.src = new Int8Array(WAVE_SLOTS);
        this.seedQueue.push(m);
        i++;
      }
      return;
    }
    // v1 fallback: one random genome + 31 mutations of it at σ = 0.2.
    const base = randomGenome(this.rng);
    this.seedQueue.push(base);
    for (let i = 0; i < SEED_BATCH - 1; i++) {
      const m = base.clone();
      // Force the step-size genes to σ=0.2 so the mutation lands at that scale.
      forceSigma(m, SEED_SIGMA);
      mutateGenome(m, this.rng, { switchRates: this.switchRates });
      m.id = m.hash();
      m.src = new Int8Array(WAVE_SLOTS); // seeds treated as roots for provenance
      this.seedQueue.push(m);
    }
  }

  _register(genome) {
    if (!this.registry.has(genome.id)) {
      this.registry.set(genome.id, { genome, observations: [], ownDwellMean: 0, directParents: {} });
    }
    return this.registry.get(genome.id);
  }

  get renderLength() { return this.lengthOverride || this.servo.L; }

  // SPACE — the steady-state loop (§6.0/§7.2b): select the prime parent FROM THE
  // ARCHIVE (§7.3), breed, render, play. Returns a `candidate`.
  nextCandidate() {
    this.listenId++;

    // Play the WHOLE seeded batch in sequence before any breeding (§5: "held in a
    // pending queue and played in sequence; each is inserted after it has been
    // heard"). v1 drained the queue only while zero cells were occupied, so after
    // the first seed was inserted it began breeding and the other 31 seeds were
    // never heard — which made the F2 seed-from-picks change meaningless (only one
    // of seven picks would ever have played). Draining the full queue honours §5's
    // "played in sequence" and does not touch the heard-before-insert rule (§7.5):
    // seeds still go play → record → insert, one at a time. Flagged in V2 report.
    if (this.seedQueue.length > 0) {
      const genome = this.seedQueue.shift();
      const provenance = { prime_parent_id: null, partner_ids: [], k_partners: 0, crossover_fired: false, src: Array.from(genome.src || new Int8Array(WAVE_SLOTS)), duplication_fired: false, duplication_targets: [], duplication_hit_active_slot: false, variation: null, from_seed: true };
      return this._finishCandidate(genome, provenance, null, null, 0, false);
    }
    // Select prime parent (§7.3). Until two cells are occupied, crossover is 0
    // (§7.3a-edge): the partner draw excludes the prime, so it cannot return one.
    let cell = this.archive.selectCell(this.rng);
    if (!cell) {
      // Defensive: the queue drained but nothing was inserted (e.g. every seed was a
      // discarded double-tap in a degenerate run). Emergency-reseed one random genome
      // rather than dereference a null cell. Should not occur in real or synthetic use.
      const genome = randomGenome(this.rng);
      genome.src = new Int8Array(WAVE_SLOTS);
      const provenance = { prime_parent_id: null, partner_ids: [], k_partners: 0, crossover_fired: false, src: Array.from(genome.src), duplication_fired: false, duplication_targets: [], duplication_hit_active_slot: false, variation: null, from_seed: true };
      return this._finishCandidate(genome, provenance, null, null, 0, false);
    }
    const resident = this.archive.selectResident(cell, this.rng);
    return this._breedFrom(resident.genome, { x: cell.x, y: cell.y });
  }

  // M — a DIRECTED mutation: breed a child of the CURRENTLY playing Creature
  // (§1: "play a mutated child of it"), overriding archive selection. Used by the
  // app's M key. `parentCell` is the current Creature's cell (for offspring yield).
  mutateFrom(primeGenome, parentCell) {
    this.listenId++;
    return this._breedFrom(primeGenome, parentCell || null);
  }

  // Shared: breed from a given prime parent (honouring crossover rate + cooldown),
  // then render and package a candidate.
  _breedFrom(primeParent, parentCell) {
    const occupied = this.archive.occupiedCount();
    const crossoverRate = occupied >= 2 ? CROSSOVER_RATE : 0;
    const partnerCandidates = crossoverRate > 0 ? this.archive.allResidentGenomes() : [];
    const dMed = this.archive.dMed;

    // Breed, honouring the repeat cooldown (§8.5): regenerate on collision up to 5
    // times, then accept regardless (§8.5). B is exempt and is a separate app path.
    let bred, cooldownCollisions = 0, acceptedDespiteCollision = false;
    for (let attempt = 0; attempt <= REGEN_TRIES; attempt++) {
      bred = breed(primeParent, this.rng, { crossoverRate, partnerCandidates, dMed, switchRates: this.switchRates });
      if (!this.cooldown.contains(bred.child.id)) break;
      cooldownCollisions++;
      if (attempt === REGEN_TRIES) acceptedDespiteCollision = true;
    }
    // Record accepted partner distances for the §6.6 diagnostic.
    if (bred.provenance.crossover_fired) {
      for (const pid of bred.provenance.partner_ids) {
        const pg = this.registry.get(pid);
        if (pg) this.archive.noteAcceptedPartnerDistance(distance(primeParent, pg.genome));
      }
    }
    return this._finishCandidate(bred.child, bred.provenance, primeParent, parentCell, cooldownCollisions, acceptedDespiteCollision);
  }

  // Render + normalise (§4.7), compute descriptors on the normalised buffer, find
  // the target cell, and package the candidate.
  _finishCandidate(genome, provenance, primeParent, parentCell, cooldownCollisions, acceptedDespiteCollision) {
    // F9: time the render so render_wall_ms is recorded, not null. The v1 app logged
    // null, so the owner's 5–10 s stalls at L=300 (the F8 servo runaway) could not be
    // confirmed from the log. performance.now() is present in node ≥16 and browsers;
    // Date.now() is the fallback. Measured here so it covers both the headless gates
    // and the app, which share this render path.
    const _clk = (typeof performance !== 'undefined' && performance.now) ? performance : Date;
    const _t0 = _clk.now();
    const r = renderNormalized(genome, { sampleRate: this.renderSampleRate, lengthS: this.renderLength, captureVisEnv: this.captureVisEnv });
    r.render_wall_ms = Math.round((_clk.now() - _t0) * 1000) / 1000;
    let descriptors = { development_raw: 0, harmonicity_raw: 0 };
    let cell = { cell_x: 0, cell_y: 0, clamped_to_edge: true };
    if (!r.renderError) {
      descriptors = computeDescriptors(r.samples, this.renderSampleRate);
      cell = cellOf(descriptors.development_raw, descriptors.harmonicity_raw, this.cal);
    } else if (this.logger) {
      this.logger.anomaly('render_error', { listen_id: this.listenId, genome_id: genome.id, error: r.renderError });
    }
    if (r.hadNonFinite && this.logger) this.logger.anomaly('non_finite_samples', { listen_id: this.listenId, genome_id: genome.id });

    return {
      listen_id: this.listenId,
      genome, provenance, primeParent, parentCell,
      cooldownCollisions, acceptedDespiteCollision,
      render: r, descriptors, cell,
      L_at_listen: this.renderLength,
      // F4/P4: the actual audible duration after the leading-silence trim. The app
      // censors dwell and fires `completed` at THIS length, not nominal L, so a
      // listener who hears the whole trimmed render is flagged completed correctly.
      played_length_s: r.played_length_s != null ? r.played_length_s : this.renderLength,
      leading_trim_s: r.leading_trim_s || 0,
    };
  }

  // Record the measured dwell for a played candidate. `outcome` fields (§8.3,
  // §8.6, §8.7): dwell_s, completed, unattended, discarded_short, annotated,
  // n_notes, n_suspensions, total_suspended_ms, suspension_reasons, idle_triggered.
  recordListen(candidate, outcome) {
    const { genome, provenance, primeParent, parentCell } = candidate;
    const listenId = candidate.listen_id;

    // Double-tap: dwell below 0.35 s is discarded — the record is still WRITTEN
    // (§14.1 "including discarded double-taps") but does not enter fitness or the
    // archive (§8.3).
    const discarded = outcome.discarded_short || outcome.dwell_s < MIN_DWELL_S;

    // A B-replay (§8.5) is a listen whose dwell is averaged into the genome's own
    // observations (§8.2), but it must NOT create a second cell resident or be
    // counted again as offspring yield — the genome is already in the archive from
    // its first hearing. So a replay updates the observation and logs, and skips
    // insertion/yield.
    const isReplay = !!outcome.is_replay;

    let lineageF = 0, ownMean = 0, ownN = 0, ancestorsUsed = [], archiveAction = null;
    if (!discarded) {
      // Register this genome's own observation (§8.2). unattended enters at 0.25.
      const reg = this._register(genome);
      reg.observations.push({ dwell_s: outcome.dwell_s, unattended: !!outcome.unattended });
      reg.ownDwellMean = ownDwellMean(reg.observations);
      ownMean = reg.ownDwellMean; ownN = reg.observations.length;

      // Provenance directParents from src (§8.2), and the depth-1/2 ancestor list.
      reg.directParents = directParentsFromSrc(provenance.src, genome.parentIds || (primeParent ? [primeParent.id] : []));
      const ancestors = this._buildAncestors(reg.directParents);
      const fit = lineageFitness({ dwell: ownMean }, ancestors);
      lineageF = fit.F; ancestorsUsed = fit.used;

      if (!isReplay) {
        // Insert into the target cell (§7.4). Every genome has its own dwell
        // measured before insertion (§7.5) — it just was, above.
        archiveAction = this.archive.insert(genome, lineageF, ownMean, ownN, candidate.cell.cell_x, candidate.cell.cell_y, listenId);
        // Offspring yield against the PARENT'S cell (§7.6), never the child's.
        if (parentCell) this.archive.recordOffspring(parentCell.x, parentCell.y, outcome.dwell_s);
      }
    }

    // Cooldown window slides on every accepted listen (§8.5).
    this.cooldown.record(genome.id);

    // Servo (§9): shrinking computed, extending triggered. Only real dwell drives
    // it; discarded double-taps do not (they carry no length information).
    let servoEvent = null;
    if (!discarded) {
      this.servo.record(outcome.dwell_s, !!outcome.completed);
      servoEvent = this.servo.evaluate();
      if (this.logger) this.logger.append('servo', { listen_id: listenId, ...servoEvent });
    }

    // Genome delta/resync storage (§14).
    this.genomeStore.put(genome, primeParent);

    // Periodic archive snapshot + D_med refresh (§14.2, §6.6).
    if (!discarded && listenId % 100 === 0) {
      this.archive.refreshDMed(this.rng);
      if (this.logger) this.logger.append('snapshots', { ...this.archive.snapshot(listenId), population: this._populationStats() });
    }

    // The per-listen record (§14.1).
    if (this.logger) this.logger.append('listens', this._listenRecord(candidate, outcome, {
      discarded, lineageF, ownMean, ownN, ancestorsUsed, archiveAction, servoEvent,
    }));

    return { discarded, lineageF, cell: candidate.cell, archiveAction };
  }

  // Build the depth-1 and depth-2 ancestor list for lineage fitness (§8.2).
  _buildAncestors(directParents) {
    const ancestors = [];
    const seen = new Set();
    for (const [pid, frac] of Object.entries(directParents)) {
      const reg = this.registry.get(pid);
      if (!reg) continue; // ancestor unknown (e.g. a seed root never registered)
      ancestors.push({ id: pid, depth: 1, contrib: frac, dwell: reg.ownDwellMean });
      seen.add(pid);
      // depth-2: this parent's own direct parents, composed by fraction.
      for (const [gpid, gfrac] of Object.entries(reg.directParents || {})) {
        const greg = this.registry.get(gpid);
        if (!greg) continue;
        ancestors.push({ id: gpid, depth: 2, contrib: frac * gfrac, dwell: greg.ownDwellMean });
      }
    }
    return ancestors;
  }

  _populationStats() {
    // Mean of each global gene over all current residents — n_partners and
    // partner_influence especially (§14.2, §6.4): their drift is the readout on
    // whether recombination helps.
    const genomes = this.archive.allResidentGenomes();
    if (genomes.length === 0) return {};
    const GBASE = WAVE_SLOTS * GENES_PER_WAVE;
    const names = ['n_partners', 'partner_influence', 'sigma_global', 'mutation_fraction', 'p_duplicate'];
    const out = {};
    for (const name of names) {
      let s = 0; for (const g of genomes) s += g.getGlobal(name);
      out[name + '_mean'] = s / genomes.length;
    }
    let cSum = 0, aSum = 0;
    for (const g of genomes) { cSum += complexity(g); aSum += activeCount(g); }
    out.complexity_mean = cSum / genomes.length;
    out.active_wave_count_mean = aSum / genomes.length;
    return out;
  }

  _listenRecord(candidate, outcome, computed) {
    const { genome, provenance, render: r, descriptors, cell } = candidate;
    const v = provenance.variation || {};
    return {
      run_synthetic: this.synthetic || undefined,
      listen_id: candidate.listen_id,
      listener_id: outcome.listener_id || 'headless',
      genome_id: genome.id,
      // genome storage is a delta in genomeStore; here we record identity + shape.
      expressed_parameter_count: expressedCount(genome),
      complexity: complexity(genome),
      active_wave_count: activeCount(genome),
      modulation_edge_count: modEdgeCount(genome),
      has_feedback_cycle: r.hasFeedbackCycle,
      // provenance (§14.1)
      prime_parent_id: provenance.prime_parent_id,
      partner_ids: provenance.partner_ids,
      k_partners: provenance.k_partners,
      crossover_fired: provenance.crossover_fired,
      src: provenance.src,
      duplication_fired: provenance.duplication_fired,
      duplication_targets: provenance.duplication_targets,
      duplication_hit_active_slot: provenance.duplication_hit_active_slot,
      // P2 copy-at-ratio (§14)
      copy_ratio_fired: provenance.copy_ratio_fired,
      copy_ratio_kind: provenance.copy_ratio_kind,
      copy_ratio_r: provenance.copy_ratio_r,
      copy_ratio_up: provenance.copy_ratio_up,
      copy_ratio_source: provenance.copy_ratio_source,
      copy_ratio_target: provenance.copy_ratio_target,
      // variation actually applied (§14.1)
      n_continuous_genes_mutated: v.n_continuous_genes_mutated,
      sigma_mean: v.sigma_mean, sigma_min: v.sigma_min, sigma_max: v.sigma_max,
      n_switch_flips: v.n_switch_flips, switch_flip_classes: v.switch_flip_classes,
      n_reroutes: v.n_reroutes, n_node_count_changes: v.n_node_count_changes,
      n_ratio_jumps: v.n_ratio_jumps, // P1

      // partner selection (§14.1)
      D_med_at_selection: this.archive.dMed,
      n_cells_occupied_at_selection: this.archive.occupiedCount(),
      // parent selection (§14.1)
      parent_cell: candidate.parentCell ? [candidate.parentCell.x, candidate.parentCell.y] : null,
      // cooldown (§14.1)
      cooldown_collisions: candidate.cooldownCollisions,
      accepted_despite_collision: candidate.acceptedDespiteCollision,
      // descriptors (§14.1)
      development_raw: descriptors.development_raw,
      harmonicity_raw: descriptors.harmonicity_raw,
      cell_x: cell.cell_x, cell_y: cell.cell_y, clamped_to_edge: cell.clamped_to_edge,
      // render (§14.1)
      L_at_listen: candidate.L_at_listen,
      leading_trim_s: candidate.leading_trim_s,      // F4/P4
      played_length_s: candidate.played_length_s,    // F4/P4 (nominal L minus trim)
      render_wall_ms: r.render_wall_ms != null ? r.render_wall_ms : null, // F9
      sample_peak: r.samplePeak,
      clipped: r.clipped,
      render_error: r.renderError,
      // loudness (§4.7, §14.1)
      ...(r.loudness || {}),
      // dwell (§14.1)
      dwell_s: outcome.dwell_s,
      completed: !!outcome.completed,
      unattended: !!outcome.unattended,
      discarded_short: computed.discarded,
      annotated: !!outcome.annotated,
      n_notes: outcome.n_notes || 0,
      n_suspensions: outcome.n_suspensions || 0,
      total_suspended_ms: outcome.total_suspended_ms || 0,
      suspension_reasons: outcome.suspension_reasons || [],
      idle_triggered: !!outcome.idle_triggered,
      // fitness (§14.1)
      own_dwell_mean: computed.ownMean,
      own_n_observations: computed.ownN,
      lineage_F: computed.lineageF,
      lineage_ancestors: computed.ancestorsUsed,
      // archive action (§14.1)
      ...(computed.archiveAction || {}),
    };
  }
}

// ── small genome readouts (kept here to avoid widening genome.js' surface) ────
function activeCount(g) {
  let n = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) if (g.getWave(w, 'active') >= 0.5) n++;
  return n;
}

// Expressed parameter count — a TREND readout (§14.7 q6: "Is the encoding's
// expressed complexity growing?"), not an exact 162 accounting. Counts, per
// active wave, the genes that actually reach the output: pitch, both gains, the
// enabled shape weights, the timing trio, and each active envelope's nodes.
function expressedCount(g) {
  let n = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (g.getWave(w, 'active') < 0.5) continue;
    n += 4; // pitch_master, gain_out, gain_mod, phase
    n += 3; // period, duty, pre_prop (v2 timing trio, P3)
    for (const s of ['shape_sine_on', 'shape_triangle_on', 'shape_saw_on', 'shape_square_on']) if (g.isOn(w, s)) n++;
    if (g.isOn(w, 'amp_env_on')) n += 4 * g.getWave(w, 'amp_env_n_nodes');
    if (g.isOn(w, 'pitch_env_on')) n += 4 * g.getWave(w, 'pitch_env_n_nodes');
    if (g.isOn(w, 'pm_on')) n += 2;
    if (g.isOn(w, 'am_on')) n += 2;
  }
  return n;
}

function modEdgeCount(g) {
  let n = 0;
  for (let w = 0; w < WAVE_SLOTS; w++) {
    if (g.getWave(w, 'active') < 0.5) continue;
    if (g.isOn(w, 'pm_on')) n++;
    if (g.isOn(w, 'am_on')) n++;
  }
  return n;
}

function directParentsFromSrc(src, parentIds) {
  const out = {};
  if (!src || !parentIds || parentIds.length === 0) return out;
  for (let i = 0; i < src.length; i++) {
    const p = src[i] | 0;
    const id = parentIds[p] !== undefined ? parentIds[p] : parentIds[0];
    out[id] = (out[id] || 0) + 1 / src.length;
  }
  return out;
}

function forceSigma(g, sigma) {
  // Set sigma_wave (per wave) and sigma_global to the given value via inverse map,
  // so the σ=0.2 seed mutations (§5) land at that scale.
  const sw = { map: { type: 'linear', lo: 0.002, hi: 0.5 }, kind: 'sigma' };
  const stored = inverseMap(sw, sigma);
  for (let w = 0; w < WAVE_SLOTS; w++) g.setWaveStored(w, 'sigma_wave', stored);
  g.setGlobalStored('sigma_global', stored);
}
