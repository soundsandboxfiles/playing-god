# Getting the logs back to Claude

## Where the logs live

Everything is in **IndexedDB**, in the browser profile that ran the app, under
database `playing-god`. Object stores:

| Store | Contents |
|---|---|
| `listens` | one record per listen — playing-god-spec.md §14.1 |
| `genomes` | genome deltas plus every-100th full resync — §14 |
| `snapshots` | archive state every 100 listens — §14.2 |
| `servo` | every render-length servo evaluation — §14.3 |
| `notes` | annotations from the feedback field — §8.6 |
| `anomalies` | render failures, guard trips, quota events — §14.6 |
| `favourites` | creatures the owner starred with `K` — full genome + listen context (F11) |

IndexedDB is per-browser and per-profile. Logs do not survive clearing site
data, and do not follow you to another browser or machine.

## Exporting

Press **`E`** in the app, or use the *Export session* control. This writes a
timestamped folder of `.jsonl` files to the browser's download location:

```
playing-god-export-YYYYMMDDTHHMMSSZ/
  manifest.json      run metadata, spec version, counts per store, date range
  listens.jsonl
  genomes.jsonl
  snapshots.jsonl
  servo.jsonl
  notes.jsonl
  anomalies.jsonl
  favourites.jsonl
```

Move the folder to `code/playing-god/output/logs/`. It is gitignored, so it
will not be committed — that is intentional, the files are large and
regenerable.

## Favourites (F11) — the star key and how it merges back

Pressing **`K`** in the app stars the current creature. Each star is written to
the `favourites` store as one record holding the **full genome** (so it is
exactly reconstructible), its `genome_id`, the `added_at` timestamp, and a
`listen_context` block (listen id, cell, dwell, L, dev/harm, near-silent flag,
active-wave count). This is stated preference, like notes — it is **firewalled
from the search** (§8.6): nothing in the engine reads the favourites store into
fitness, descriptors, the Predictor or selection. It is a personal library, not a
signal.

**Seeding at startup.** When the app boots it reads
`output/favourites/favourites.json` (the host-curated master list) and copies any
entries not already in the browser store into it, keyed by a dedupe id
(`v1_id` for the curated picks, `genome_id` for live stars). This is
**non-clobbering and idempotent**: existing store entries are never overwritten,
and re-seeding on a later launch adds nothing already present. So the owner's
curated favourites show up in-session, and live stars accumulate alongside them.

**Merging an export back into the master file.** After pressing `E`, the export
folder contains `favourites.jsonl` (one JSON object per line — the live stars from
that session). To fold them into `output/favourites/favourites.json`:

1. Open `output/favourites/favourites.json`; its `entries` array is the master
   list, and `count` is its length.
2. For each line in `favourites.jsonl`, check whether an entry with the same
   `genome_id` (or `dedupe_id`) is already in `entries`. If not, append it.
   Entries seeded *from* the file (they carry `seeded_from_file: true`) are
   skipped — they are already in the master list.
3. Optionally fill in `jon_words` on a newly-appended entry (the live records
   leave it `null`) — the owner's note on why the creature earned a star.
4. Update `count` to the new length of `entries`.

The master file is the machine-readable side of the vault entity
`Cowork/CONTEXT/projects/jons-favourite-creatures.md`; keep the two in step.
This merge is a human/desktop-session step (the app cannot write host files) —
walk the owner through it file-in-hand, the same way as the sync-back report.

## A complete export — checklist

Before handing logs over, check `manifest.json` shows:

- [ ] `listens` count matches roughly what you'd expect from time spent
- [ ] `genomes` present, and the number of full resync entries ≈ listens ÷ 100
- [ ] `snapshots` ≈ listens ÷ 100
- [ ] `servo` non-empty if the run exceeded 100 listens
- [ ] `anomalies` present, even if empty — an absent store means logging broke
- [ ] `favourites` present if the owner starred anything with `K` (F11)
- [ ] `spec_version` matches the `playing-god-spec.md` you want it evaluated against
- [ ] any run driven by synthetic dwell is labelled `SYNTHETIC`

Also copy across `output/gate-artefacts/` — the gate results are evidence and
an evaluator needs them beside the logs.

## Handing them to a fresh session

Use a **new** session, not the one that produced the build. An agent assessing
its own work reads logs for confirmation and explains away what does not fit
(playing-god-spec.md §15.1).

Paste this:

---

You are evaluating a build of Playing God against its specification. You did
not write this build and should not assume it matches the spec.

Read, in this order:
1. `code/playing-god/playing-god-spec.md`
2. `Cowork/CONTEXT/projects/playing-god.md` — especially the standing caution
   and the invariants, and the decisions already taken against the designer's
   instinct with their reasons
3. `code/playing-god/output/gate-artefacts/`
4. `code/playing-god/output/logs/<export folder>/`

Report, in this order:
1. Which gates passed, with measured numbers against stated thresholds.
2. Which mechanisms fired at rates materially different from the specification
   — crossover, duplication, switch flips, reroutes, distant pairings,
   evictions, protection trips — with figures.
3. Any invariant violated in implementation.
4. Any constant the log evidence suggests is mis-set, with the evidence.
5. Open questions the logs cannot answer, and what instrumentation would
   answer them.

The annotations in `notes.jsonl` are context for interpreting the logs. They
are stated preference and are firewalled from the search by playing-god-spec.md §8.6. You may
quote them. You may not derive from them, or from anything else, a
recommendation to steer the search.

Do not assess whether the output is good, whether any type of sound is
performing better than another, or whether the search should be biased toward
anything. If you find yourself proposing a constraint that would improve the
output by narrowing what can be produced, stop — that is the project's known
failure mode and the proposal is wrong by construction.

---

## Note on annotations

`notes.jsonl` is the only place in the system where stated preference exists.
It is deliberately quarantined. If a future change proposes feeding it into
fitness, descriptors, the Predictor or selection, that change is wrong — see
playing-god-spec.md §8.6 and the mission statement's "absolutely no interest in stated
preference".
