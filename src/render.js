// render.js — the one place GENOME becomes a normalised SAMPLES buffer.
//
// WHY a single helper: §4.7 requires that "everything downstream reads the
// normalised buffer" — descriptors, perceptual distance, the visualiser's cached
// envelopes and mix RMS. If two call sites rendered-and-normalised differently,
// the archive axes and the locality gates would silently disagree. So both the
// gates (node) and the app (browser) go through this. It keeps synthesis.js free
// of any loudness dependency (clean layering) while guaranteeing one pipeline.
//
// v2 adds a LEADING-SILENCE TRIM (F4/P4) between synthesis and normalisation, so
// loudness, descriptors and the visualiser all see exactly what the listener hears.

import { render } from './synthesis.js';
import { normalizeLoudness } from './loudness.js';

// ─────────────────────────────────────────────────────────────────────────────
// F4 / P4 — LEADING-SILENCE TRIM.
//
// *** THIS IS A DELIBERATELY NON-PURIST COMPROMISE. OWNER-MANDATED, REVISITABLE. ***
//
// It is the ONE place the system reaches into what is heard for a fitness-hygiene
// reason, and it is therefore the single deliberate exception to the invariant
// that instruments carry no opinion about the sound (§2.2, vastness-is-the-point).
// Recorded so no future reader mistakes it for a general licence to trim, score or
// filter — it is not; nothing else in this codebase may narrow the space (§2.1).
//
// WHY (Jon, 2026-08-31, first audition; V2-PROPOSALS P4): a Creature that opens
// with silence collects dwell for free — its opening is indistinguishable from
// "loading the next sound", so the listener waits. Left alone, every lineage feels
// the pressure toward a ~1.5 s opening silence and the herd gets boring. The purist
// fix (let silence-openers win, then let a starts-immediately disruptor win on the
// relief) was considered by Jon and explicitly declined: "no, I want to be blunter,
// at least at this early stage."
//
// SCOPE LIMIT, so the compromise stays small (P4): only the OPENING is trimmed.
// Mid-piece silence — the pause before a phrase, the gap in a rhythm — is untouched
// and stays fully expressible and scoreable. We strip only the run of leading
// sub-audible samples before the first audible sound. In practice that run is the
// exact zeros produced while every wave's pre_wait gate is still shut (§4.2), so
// this precisely targets the opening silence and nothing else.
//
// CONSEQUENCES (P4): leading pre_wait becomes phenotypically near-neutral — neutral
// drift along it is fine and expected; §4.7 loudness and the descriptors read the
// trimmed buffer (below); the servo's dwell semantics are unchanged (dwell still
// censors at the render's end, which is now the trimmed buffer's end).
// ─────────────────────────────────────────────────────────────────────────────

// "First audible sound" is defined relative to the render's own peak, because
// loudness normalisation (§4.7) is a single scalar and so this ratio is invariant
// to it. −60 dB below peak matches the near-silence convention used elsewhere
// (§4.7). PROVISIONAL threshold, recorded in the v2 report.
const TRIM_REL_TO_PEAK = 1e-3;   // −60 dB below the render's peak
const TRIM_ABS_FLOOR = 1e-6;     // never treat literal denormal noise as "audible"

// Find the first index at or after which the signal is audible. Returns 0 if the
// buffer starts audible, or N if it is silent throughout (caller then does NOT
// trim — a fully near-silent render is left whole for the §4.7 near-silence path).
function firstAudibleIndex(samples) {
  const N = samples.length;
  let peak = 0;
  for (let n = 0; n < N; n++) { const a = Math.abs(samples[n]); if (a > peak) peak = a; }
  if (peak <= TRIM_ABS_FLOOR) return N; // whole buffer sub-audible → do not trim
  const thresh = Math.max(TRIM_ABS_FLOOR, peak * TRIM_REL_TO_PEAK);
  for (let n = 0; n < N; n++) if (Math.abs(samples[n]) >= thresh) return n;
  return N;
}

// Render a genome and apply §4.7 loudness normalisation in place.
// Returns the synthesis meta merged with the loudness log fields (§14.1) and the
// normalised `samples`. Descriptors are NOT computed here — the caller does that
// on `samples`, because gates want to control when the (cheaper) descriptor pass
// runs.
//
// opts.trimLeadingSilence — default TRUE (F4/P4). Pass false only to measure the
// untrimmed render (e.g. the P3 migration gate compares v1 vs v2 timing decode and
// must not let the trim mask a difference).
export function renderNormalized(gn, opts = {}) {
  const r = render(gn, opts);
  // If synthesis failed, do not attempt to normalise noise; surface the error.
  if (r.renderError) {
    return { ...r, loudness: null, leading_trim_s: 0, played_length_s: r.lengthS };
  }

  // ── F4/P4 leading-silence trim (before loudness + descriptors read the buffer) ──
  const doTrim = opts.trimLeadingSilence !== false;
  let trimSamples = 0;
  if (doTrim) {
    const cut = firstAudibleIndex(r.samples);
    // Only trim a genuine leading run, and never trim the whole buffer away (a
    // fully near-silent render returns cut === N and is left intact above).
    if (cut > 0 && cut < r.samples.length) {
      trimSamples = cut;
      r.samples = r.samples.subarray(cut); // view; cheap, no copy
      r.N = r.samples.length;
      // Keep the visualiser's cached 60 Hz per-wave envelope aligned with the
      // trimmed audio (§11 fast channel) by dropping the same leading frames.
      if (r.visEnv) {
        const dropFrames = Math.floor(cut / Math.max(1, Math.round(r.sampleRate / (r.visEnvHz || 60))));
        if (dropFrames > 0) {
          for (const k of Object.keys(r.visEnv)) r.visEnv[k] = r.visEnv[k].subarray(dropFrames);
          r.visFrames = Math.max(0, (r.visFrames || 0) - dropFrames);
        }
      }
    }
  }
  r.leading_trim_s = trimSamples / r.sampleRate;
  // The actual audible duration the listener hears (nominal L minus the trim). The
  // app censors dwell / fires `completed` at THIS length, not the nominal L, so a
  // listener who hears the whole trimmed render is correctly flagged completed.
  r.played_length_s = r.samples.length / r.sampleRate;

  const loud = normalizeLoudness(r.samples, r.sampleRate);
  // normalizeLoudness mutates r.samples in place and returns the same reference.
  r.samples = loud.samples;
  r.loudness = {
    lufs_before: loud.lufs_before,
    lufs_after: loud.lufs_after,
    true_peak_dbtp: loud.true_peak_dbtp,
    gain_applied_db: loud.gain_applied_db,
    static_reduction_db: loud.static_reduction_db,
    loudness_range_lu: loud.loudness_range_lu,
    near_silent: loud.near_silent,
  };
  return r;
}
