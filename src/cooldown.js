// cooldown.js — the repeat cooldown (§8.5).
//
// Listens are the scarce resource (§2.3b). Hearing the same Creature several
// times in short succession measures the listener's novelty exhaustion, not the
// sound. So no genome may be played twice within a rolling window of W = 30
// listens; a candidate colliding with the window is regenerated, up to 5 attempts,
// then accepted regardless.
//
// This is SOFT, not a rule about what may exist (§8.5, §2.1): nothing is made
// unreachable, only rescheduled. The `B` key is exempt (a listener returning to a
// parent is an explicit request, not a system-imposed repeat).

export const REPEAT_COOLDOWN_W = 30; // §8.5 / Appendix
export const REGEN_TRIES = 5;        // §8.5 / Appendix

export class Cooldown {
  constructor(w = REPEAT_COOLDOWN_W) {
    this.w = w;
    this.recent = []; // FIFO of the last w genome hashes
  }

  // Is this genome hash currently in the cooldown window?
  contains(hash) {
    return this.recent.includes(hash);
  }

  // Record a genome as played (call once per accepted listen, including B replays
  // — B is exempt from the CHECK, but its hash still slides the window so an
  // unrelated later collision is measured correctly).
  record(hash) {
    this.recent.push(hash);
    while (this.recent.length > this.w) this.recent.shift();
  }
}
