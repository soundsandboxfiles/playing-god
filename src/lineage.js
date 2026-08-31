// lineage.js — the SPACE / M / B lineage stack (§1 keyboard table).
//
// The keyboard verbs form a tree walk over Creatures:
//   SPACE — a NEW, unrelated Creature. It starts a fresh lineage: the ancestry
//           stack is cleared, because a new draw has no parent to return to.
//   M     — a MUTATED CHILD of the current Creature. The current Creature is
//           pushed as the child's parent, and the child becomes current.
//   B     — BACK to the parent and replay: pop the ancestry stack.
//
// Gate 1b-mech tests exactly this: "B returns reliably to the previous state at
// arbitrary depth." This module is deliberately pure state-management with no
// synthesis or DOM, so the gate can drive it under plain node (README).
//
// The child genome handed to `mutateChild` is produced by the variation pipeline
// (variation.js) — the stack does not create genomes, it only tracks the path so
// that B is exact.

export class Lineage {
  constructor(root) {
    this.current = root;      // the Creature currently sounding
    this.stack = [];          // ancestors of `current`, oldest at index 0
  }

  // SPACE — replace with a fresh, unrelated Creature; reset the lineage.
  newRoot(genome) {
    this.current = genome;
    this.stack = [];
    return this.current;
  }

  // M — descend: `child` (a mutated/bred descendant of current) becomes current;
  // the old current is remembered as its parent.
  mutateChild(child) {
    this.stack.push(this.current);
    this.current = child;
    return this.current;
  }

  // B — ascend: return to the parent. At the root this is a no-op (a new Creature
  // has no parent), and B simply replays the current Creature.
  back() {
    if (this.stack.length > 0) this.current = this.stack.pop();
    return this.current;
  }

  // Depth of the current Creature below its lineage root.
  depth() {
    return this.stack.length;
  }
}
