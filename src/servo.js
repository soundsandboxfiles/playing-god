// servo.js — the render-length servo (§9). Jon's algorithm, implemented as given.
//
// Render length L is a GLOBAL parameter, not a gene (§9, §2.5): a genome that
// rendered longer would have more dwell available to it, which would make length
// a gene that touches the fitness function.
//
// The design turns on a CENSORING ASYMMETRY (§9.1): dwell recorded at length L is
// right-censored at L, so for any L' < L the maxing-out proportion is computable
// EXACTLY from data in hand, while nothing is known about behaviour beyond L.
// Hence SHRINKING IS COMPUTED, EXTENDING IS TRIGGERED (§9.1).
//
// This is an INSTRUMENT (§2.2): it tracks how much of the dwell signal is being
// censored and adjusts the measurement window. It carries no assumption about
// what will score — a run of early skips is not treated as a fault (§9.4).

export const SERVO_WINDOW_X = 100;   // Appendix
export const SERVO_THRESHOLD_T = 0.10;
export const SERVO_EXTEND_STEP = 1.5;
export const SERVO_MIN_CHANGE = 0.05;
export const L_INIT_S = 60;
export const L_FLOOR = 15;
export const L_CEILING = 300;

// F8 (V2-PROPOSALS) — CONSECUTIVE-FIRE GUARD. After an applied change, the servo
// must not move again until the trailing window has SUBSTANTIALLY REFRESHED.
//
// The v1 bug (first real session, listens 101-103 and 204-211): the servo
// re-evaluates every listen against a window that slides by only ONE record per
// listen, so a single threshold crossing re-fires every listen and compounds
// geometrically — 3 consecutive shrinks 60→34→21→15, then 8 consecutive extends
// 15→300 (same window_n=100, same p_completed=0.11 on every one). That runaway is
// what produced the 300 s renders behind the owner's "massively slow" note.
//
// The fix (citing §9.2, which already gates on window composition — "do not run
// the servo until the window is full"): after a change is APPLIED, require at least
// SERVO_REFRESH_GUARD new records to enter the window before the next change may
// apply. At half the window (50 of 100), the majority of the completed-flags being
// judged were measured at the NEW L, so the servo re-decides on data that reflects
// the change rather than re-triggering on the same stale window. Extends and shrinks
// are still COMPUTED/LOGGED every listen (§14.3); only the APPLICATION is gated.
// PROVISIONAL value, recorded in docs/SPEC-DELTA-V2.md.
export const SERVO_REFRESH_GUARD = 50; // half of SERVO_WINDOW_X

export class Servo {
  constructor(lInit = L_INIT_S) {
    this.L = lInit;
    this.window = []; // FIFO of { dwell_s, completed }
    // Records that have entered the window since the last APPLIED change (F8). Large
    // at start-up (never reset) so the first legitimate change is not blocked once
    // the window fills.
    this._sinceChange = 0;
  }

  // Record one listen's dwell outcome.
  record(dwell_s, completed) {
    this.window.push({ dwell_s, completed });
    while (this.window.length > SERVO_WINDOW_X) this.window.shift();
    this._sinceChange++; // F8: count refresh progress toward the next allowed change
  }

  // Evaluate the servo after a listen. Returns an event record (§14.3) describing
  // what it did (or why it did nothing). Call `record` first.
  evaluate() {
    const X = SERVO_WINDOW_X, T = SERVO_THRESHOLD_T;
    const windowN = this.window.length;
    const base = {
      old_L: this.L, new_L: this.L, direction: 'no_change',
      window_n: windowN, p_completed: null, k: null, L_prime_computed: null,
      suppressed_by_5pct_guard: false,
      suppressed_by_refresh_guard: false, // F8
      records_since_change: this._sinceChange, // F8 diagnostic
      // The full sorted dwell vector matters: L' is an order statistic and a later
      // reader must be able to check the computation (§14.3).
      sorted_dwell: null,
    };
    // Guard: do not run until the window is full (§9.2).
    if (windowN < X) return base;

    const p = this.window.filter((w) => w.completed).length / windowN;
    base.p_completed = p;
    const sorted = this.window.map((w) => w.dwell_s).sort((a, b) => b - a); // descending
    base.sorted_dwell = sorted;

    let newL;
    if (p > T) {
      // Extend: blind above L, so step geometrically and re-measure (§9.2).
      newL = Math.min(this.L * SERVO_EXTEND_STEP, L_CEILING);
      base.direction = 'extend';
    } else {
      // Shrink: computed. L' = (k+1)-th largest dwell; move halfway (§9.2).
      const k = Math.floor(T * X);
      base.k = k;
      const Lprime = sorted[k]; // 0-based index k = the (k+1)-th largest
      base.L_prime_computed = Lprime;
      newL = Math.max((Lprime + this.L) / 2, L_FLOOR);
      base.direction = 'shrink';
    }

    // Guard: apply only if the change exceeds 5% (§9.2, anti-thrash).
    if (Math.abs(newL - this.L) / this.L <= SERVO_MIN_CHANGE) {
      base.suppressed_by_5pct_guard = true;
      base.direction = 'no_change';
      return base;
    }
    // F8 guard: after an applied change, wait for the window to substantially
    // refresh before applying another. The direction/L' are still COMPUTED and
    // LOGGED above (§14.3) — only the application is deferred, so a later reader
    // sees the servo "wanted" to move and was held, not that it went quiet.
    if (this._sinceChange < SERVO_REFRESH_GUARD) {
      base.suppressed_by_refresh_guard = true;
      base.direction = 'no_change';
      return base;
    }
    this.L = newL;
    base.new_L = newL;
    this._sinceChange = 0; // F8: restart the refresh count after applying
    return base;
  }
}
