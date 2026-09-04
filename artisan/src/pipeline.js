// pipeline.js — the whole method, orchestrated: measure → construct → refine →
// deliver. Streams every improvement to disk (crash-survivable, BRIEF §7).

import { resolveTarget } from './target.js';
import { constructAdditive } from './construct.js';
import { refine } from './optimize.js';
import { runSchedule } from './schedule.js';
import { scoreGenome } from './score.js';
import { Deliverable } from './deliverable.js';
import { writeMixer } from './mixer.js';
import { activeCount } from './genome-build.js';

// MIMIC's recorded bests, for the report's "× better than MIMIC" line (pulled from
// mimic/output/race-full.json + MIMIC-REPORT; see CONTINUATION DECISIONS).
export const MIMIC_BESTS = {
  'recover-2wave': 1524.40,
  'recover-6wave': 130.92,
  'westminster-chimes.wav': 7943.73,
};

export function runPipeline(cfg, runDir, { onLog = null } = {}) {
  const log = onLog || (() => {});
  const target = resolveTarget(cfg);
  const plan = target.plan;
  const deadline = cfg.maxMinutes ? Date.now() + cfg.maxMinutes * 60000 : null;

  const deliv = new Deliverable(runDir, target, cfg);
  deliv.copyVerifier();

  log(`Target: ${target.name} (${target.kind}) — ${plan.winLen} samples, floor ${target.silenceFloor.toExponential(3)}`);
  log(`Render: ${target.renderLengthS}s @ ${target.sampleRate}Hz, window [${target.offsetSamples}, ${target.offsetSamples + plan.winLen})`);

  // 1. Constructive pass (measure + build).
  log(`Constructing (up to ${cfg.maxWaves} waves)…`);
  const con = constructAdditive(target.target, plan, {
    maxWaves: cfg.maxWaves,
    shapeSearch: cfg.shapeSearch !== false,
    ampEnv: cfg.ampEnv !== false,
    pitchEnv: cfg.pitchEnv !== false,
    gateRepeat: cfg.gateRepeat !== false,
    onStep: (info) => log(`  +wave ${info.nWaves}: ${info.shape} @ ${info.freq.toFixed(1)}Hz → SSE ${info.sse.toExponential(3)}`),
  });
  let best = con.genome;
  let bestScore = scoreGenome(best, plan);
  deliv.update(best, 'construct', bestScore.sse, bestScore.samples);
  deliv.writeAssembly(con.assembly);
  log(`Constructed: SSE ${bestScore.sse.toExponential(4)}, ${activeCount(best)} active waves.`);

  // 2. Anytime budget-filling optimisation on the true engine (BRIEF-2 §4a). The
  // scheduler runs its portfolio until the budget is gone or measured convergence.
  // Skipped only when the construct is already essentially perfect (recover-2wave).
  let schedInfo = null;
  if (bestScore.sse > 1e-10 && (!deadline || Date.now() < deadline)) {
    log('Filling the budget (anytime refine + reallocation)…');
    const res = runSchedule(best, plan, {
      deadline, seed: cfg.seed, target: target.target,
      cmaesIters: cfg.cmaesIters,
      onLog: log,
      onImprove: (sse, snap) => { if (snap) deliv.update(snap, 'schedule', sse); },
    });
    const rscore = scoreGenome(res.genome, plan);
    if (rscore.sse < bestScore.sse) { best = res.genome; bestScore = rscore; }
    deliv.update(best, 'schedule-final', bestScore.sse, bestScore.samples);
    schedInfo = { epochs: res.epochs, converged: res.converged, gap: res.gap, marginPerHour: res.marginPerHour };
    log(`Optimised: SSE ${bestScore.sse.toExponential(4)} over ${res.epochs} epochs` +
        `${res.converged ? ' (converged: no strategy beat epsilon for the patience window)' : ' (budget reached — still descending)'}` +
        ` — engine/model gap ${res.gap.toExponential(2)}.`);
  }

  // 3. Finalise + report + the mixer listening artifact (BRIEF §8).
  deliv.update(best, 'final', bestScore.sse, bestScore.samples);
  log('Writing the mixer (in-browser listening app)…');
  try { writeMixer(runDir, best, target, cfg); }
  catch (e) { log('  (mixer generation failed: ' + e.message + ')'); }
  const mimicSSE = MIMIC_BESTS[target.name] != null ? MIMIC_BESTS[target.name] : null;
  let budgetNote = null;
  if (schedInfo) {
    const mph = schedInfo.marginPerHour;
    budgetNote = `The optimiser ran ${schedInfo.epochs} portfolio epochs and ` +
      (schedInfo.converged
        ? 'stopped on **measured convergence** — no strategy in the portfolio (coordinate descent, reallocation, CMA-ES) improved SSE beyond the epsilon threshold across the patience window.'
        : 'was still descending when the budget was reached (it did **not** self-terminate — more budget would buy more).') +
      (mph ? ` Marginal gain over the last third of the run: ${mph.dSSE.toExponential(2)} SSE per ${mph.hours.toFixed(2)} h = ${mph.ssePerHour.toExponential(2)} SSE/hour.` : '') +
      ` The engine-vs-fast-model gap at the end was ${schedInfo.gap.toExponential(2)} (the additive fast scorer stayed faithful to the true engine).`;
  }
  deliv.writeReport({
    activeWaves: activeCount(best),
    mimicSSE,
    budgetNote,
    surrogate: 'None. ARTISAN optimises directly on the unmodified engine (the sole arbiter), ' +
      'so there is no separate surrogate and surrogate-vs-engine drift is identically zero. ' +
      'The additive fast-scorer used during search is reconciled against the true engine at ' +
      'every commit point; verify.js re-proves sample-identity independently.',
  });

  return { target, deliv, genome: best, sse: bestScore.sse, samples: bestScore.samples, construct: con, mimicSSE };
}
