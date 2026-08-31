// render.js — the one place GENOME becomes a normalised SAMPLES buffer.
//
// WHY a single helper: §4.7 requires that "everything downstream reads the
// normalised buffer" — descriptors, perceptual distance, the visualiser's cached
// envelopes and mix RMS. If two call sites rendered-and-normalised differently,
// the archive axes and the locality gates would silently disagree. So both the
// gates (node) and the app (browser) go through this. It keeps synthesis.js free
// of any loudness dependency (clean layering) while guaranteeing one pipeline.

import { render } from './synthesis.js';
import { normalizeLoudness } from './loudness.js';

// Render a genome and apply §4.7 loudness normalisation in place.
// Returns the synthesis meta merged with the loudness log fields (§14.1) and the
// normalised `samples`. Descriptors are NOT computed here — the caller does that
// on `samples`, because gates want to control when the (cheaper) descriptor pass
// runs.
export function renderNormalized(gn, opts = {}) {
  const r = render(gn, opts);
  // If synthesis failed, do not attempt to normalise noise; surface the error.
  if (r.renderError) {
    return { ...r, loudness: null };
  }
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
