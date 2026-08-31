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

export class Servo {
  constructor(lInit = L_INIT_S) {
    this.L = lInit;
    this.window = []; // FIFO of { dwell_s, completed }
  }

  // Record one listen's dwell outcome.
  record(dwell_s, completed) {
    this.window.push({ dwell_s, completed });
    while (this.window.length > SERVO_WINDOW_X) this.window.shift();
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
    this.L = newL;
    base.new_L = newL;
    return base;
  }
}
