# Playing God — design history and reasoning

This is the project's why-ledger: the reasoning behind every constant, the
decisions taken against first instincts (in both directions) with the reasons
recorded, the standing cautions, and the running history of builds, gates and
owner rulings. It is a curated export of Jon's working notes (2026-05 →
2026-08-31, lightly redacted of non-project material). The spec says WHAT;
this says WHY. If you (or your Claude) want to know "why is such-and-such the
way it is," start here. A change that contradicts either document needs both
updated.

---
# Playing God

Procedural sound generator in which sounds are **evolved rather than designed**. Fitness is measured listening time and nothing else — stated preference explicitly rejected, and the recommender-system / doom-scroll parallel explicitly intended by Jon. Collaborator: Josh Smith. Jon currently prefers the working title **Primordial Jam**; not decided.

**Governing value: vastness-is-the-point.** Read that before making any design decision on this project.

> **STANDING CAUTION — designer assumptions.** The recurring failure mode on this project is Claude writing an assumption the system exists to avoid into machinery that is supposed to be neutral. **Three instances, all caught by Jon on review — this is a pattern, not a slip**, and it takes two distinct forms.
>
> *As a claim about what will score well:* (1) the temporal-development archive axis justified as "the descriptor most aligned with what dwell time measures"; (2) a bimodal dwell distribution declared the signature of a healthy population.
>
> *As a limit on what can be reached:* (3) crossover gated on a hard compatibility threshold `D < 0.25` with a single-parent fallback, making every more-distant pairing **unreachable** rather than merely unlikely. Caught 2026-08-30 when Jon stated the requirement "I think I'd like close relatives to be more likely to combine but for all creatures to always be candidates with non zero probabilities" — which is invariant 1 restated, applied to pairings rather than to genes. Replaced by a soft decaying kernel.
>
> Two checks required on any new decision: *does this claim to know what will score well?* and *does this make anything unreachable rather than merely unlikely?* None of it is known. Jon, 2026-08-30, emphatic: *"I am not saying that change over time is what will keep people listening. It might do because the variety keeps it engaging or it might be disgustingly chaotic and skipped quickly. Similarly a drone might be boring and skipped quickly, or it might be transcendent and beautiful and really good. I cannot stress enough the key idea here — we do not know what will score high. We can only discover that by maximising phase space and exploring it."*
>
> Operative distinction now in the brief as invariant 2.2: **priors may be biased, instruments may not.** A prior is an admitted bias about where to look first, and is legitimate. The fitness function, behaviour descriptors, archive geometry, render servo and diagnostics are instruments; they must carry no assumption about what will score. An instrument encoding a prediction will find that prediction. Check every justification against: *does this claim to know what will score well?*

**Deliverable:** **`playing-god-spec.md`** + `.pdf` (v9, 36pp, 2026-08-30). **One canonical filename in both locations** — `<Claude folder>/playing-god-spec.md` and `code/playing-god/playing-god-spec.md`. Renamed from `playing-god-design-brief.*` on 2026-08-30: the in-repo copy had been called `SPEC.md`, and two names for one document is the same silent-drift risk that got the separate code brief rejected. Tombstone files left at the old names; safe to delete. Register is an implementer-facing build document — every value a decision, no timebox, no session framing, written so a model can generate the code or component sub-briefs. Claude folder currently `~/Desktop/Claude`.

**No timebox.** Jon removed all calendar framing 2026-08-30 ("this is just a thing that is to be made"). Order of operations and acceptance gates are in the brief; dates are not.

## Provenance

The design is Jon's, dictated across 2026-08-30 in three passes. The engineering analysis, literature grounding, parameter values and the sections marked below are Claude-generated and pending Jon's endorsement. Where Claude overruled a stated instinct, Jon's original position and the reason for overruling are both recorded, because the originals may be right.

## Architecture — current state of the spec

### Invariants (the five rules everything checks against)

1. **Priors bias sampling; they never truncate the space.** From vastness-is-the-point. Every prior is a bias on initial sampling and mutation recentring only; no gene may be made unreachable. Implementer check: does this make a region *unreachable* or merely *unlikely*? Unreachable is a defect. **Scoped 2026-08-30 at Jon's correction:** the rule governs **operators, mechanisms and regions**, never **points**. In a space this size every particular genome is astronomically improbable — that is what a large space is — so applying a rarity test to individual Creatures would condemn the project on its first line. Operational form: rate × attempts-over-the-project ≥ order 1. Ask *"would this system, run to its budget, ever do this at all?"*, never *"would it ever produce this exact Creature?"*.
2. **Representation discipline** (Jon's idea, formalised). Three tiers — GENOME (search, Predictor, visualiser slow channel), SAMPLES (descriptors, perceptual distance, visualiser fast channel), AUDIO (playback only). GENOME→SAMPLES is deterministic and many-to-one, not invertible. Predictor reads genomes only and carries a second head predicting the behaviour descriptor, so autonomous operation renders nothing.
3. **No gene may touch the fitness function.** Genes may influence variation; they may not influence how fitness is measured or accumulated. Forces lineage depth, render length, archive axes, dwell caps and attention gating to be global. Sub-rule: a gene weighting *its own carrier's* contribution to offspring is forbidden (segregation distortion / meiotic drive).
4. **Listens are the scarce resource.** A listen is the only way fitness enters the system; everything else is free. Every mechanism is assessed by what it costs in listens. Corollary that recurs: the cost of a bad decision inside the search is usually a *wasted listen*, not damage to the population.
5. **Declared space vast, expressed space small.** ~6,100 declared parameters; ~162 expressed at initialisation. The gap is neutral material — muted waves, unused envelope nodes — mutating at zero fitness cost and available for reactivation. This is what reconciles invariant 1 with tractability: search cost scales with expressed parameters, so complexity is unmuted by selection rather than granted.

### Genome

64 wave slots × 95 genes + 21 global = **6,101 parameters**. All genes stored as floats in [0,1], mapped to declared range on read, reflected at bounds.

Per wave: 3 structural switches (`active`, `gain_out_on`, `gain_mod_on`), 8 shape (4 blended weights + 4 switches), 5 timing (`pre_wait`, `duration`, `mid_wait`, `mid_wait_on`, `phase`), 2 gains (`gain_out` dB, `gain_mod`), 34 amplitude envelope (switch + node count + 8 nodes × {level, time, curve, tension}), 35 pitch (same + `pitch_master` in cents above 0.01 Hz), 6 modulation (`pm_source`/`pm_depth`/`pm_on`, `am_source`/`am_depth`/`am_on`), 2 per-wave meta (`sigma_wave`, `p_mutate_wave`).

Global: `fundamental_cents`, `tempo_bpm`, `sigma_global`, `p_duplicate`, `p_switch_flip_scale`, **`n_partners`**, `partner_influence`, `mutation_fraction`, + 14 visualiser genes.

768 kill switches total (12 per wave).

### Synthesis

Phase modulation, not frequency modulation — under true FM a depth mutation drifts perceived pitch, moving two perceptual axes from one gene; PM moves one. Locality requirement, not taste.

Routing encoded as two source slots per wave (integer index + depth + switch), not adjacency matrices — 6 genes/wave against 8,192 for two 64×64 matrices, and a routing mutation is one discrete jump rather than a smear across a row. Cycles permitted including self-modulation (DX7 feedback operator); back-edges get a one-sample delay after compile-time DFS, forward edges evaluated in topological order.

**Depth attenuation on reroute:** any change to `pm_source`/`am_source` multiplies the corresponding depth by 0.05. Without it, rerouting is the most destructive operation in the system. Jon accepted this 2026-08-30 noting it is "more designed than he'd ideally like" and taking continuity over brittleness.

Envelopes and modulation coexist, each under its own switch — a toggle would disconnect regions mutation should walk between.

### Search — Deep-Grid MAP-Elites

**Cells hold D = 8 residents, not one elite** (adopted 2026-08-30). **Jon re-derived Deep-Grid MAP-Elites** (Flageat & Cully, ALIFE 2020) from first principles, spotting the bias himself: *"I'm worried that an incumbent might have multiple listens with which to denoise its fitness score, but a challenger will only have one. Is that right?"* Yes — comparing an n-sample incumbent to a 1-sample challenger systematically favours incumbents that got lucky early, and no later challenger can dislodge them because they are competing against a lucky number rather than a true one.

His proposed fix — *"keep every creature which belongs in that cell present and available… until such a time as a single resident is needed… at which point all the residents fight silently in the background and the winner steps into the breach"* — is the published method's core idea. One difference worth telling him: DG resolves the cell **stochastically at each selection** rather than by a one-off silent fight. That is better, because a deferred winner-takes-all fight would reinstate exactly the lucky-winner lock-in he is trying to remove.

Mechanics: every offspring enters its target cell; if the cell is full it **evicts a uniformly random resident**, ignoring fitness and age (this is the debiasing mechanism — residents are continually re-questioned, so a slot is only held by genotypes that keep producing offspring landing in the same cell; lucky one-shots wash out). Cell selection is rank-based on **mean resident fitness**; in-cell selection is rank-based with lexicographic parsimony breaking 5% ties — which is where parsimony now lives, since the insertion contest no longer exists.

**Load-bearing assumption Jon identified 2026-08-30, now made explicit and gated.** His words: *"it seems to rely on neighbouring cells holding near identical creatures. Given the vast space of our possible creations, I worry that neighbouring cells might hold very different creatures, or indeed the same cell might hold very different creatures, at which point the eviction of creatures being done randomly rather than stochastically based on their fitness could be genuinely damaging."* **He is right and the dependency was implicit.** Two descriptors over 256 cells is an extremely coarse partition of a 6,102-parameter space, so the genome→cell map is massively many-to-one.

The concern decomposes into two things that must be held apart. **Within-cell heterogeneity** (cell-mates may sound unalike) is inherent to any coarse descriptor, true of plain MAP-Elites too, and not fatal — a cell is a niche, not a claim about resemblance. **Behavioural locality of variation** (do offspring land in or near the parent's cell?) is what the deep grid actually depends on: if it holds, a cell fills over time with one dominant family regardless of what it *could* hold; if it fails, residents are mutually unrelated and random eviction destroys good genotypes at random rather than re-questioning a lineage.

**Now Gate 2b**: 200 genomes × 20 offspring through the real pipeline, measure `p_same` (offspring in parent's cell) and `p_near` (parent's cell or its 8 neighbours), plus `H_cell` (within-cell MFCC heterogeneity as a fraction of `U`) as the diagnostic that says which fix applies. **Pass: `p_same ≥ 0.35`, `p_near ≥ 0.70`** on the mutation-only run. Below ~0.20 the cell is mostly strangers. Fixes if it fails, in order of preference: descriptors chosen for mutational stability (free, most principled); coarser 8×8 grid (also cheaper to fill — 512 listens vs 2,048); finer grid if `H_cell ≈ U`; more descriptor dimensions (likely unaffordable); or fall back to **adaptive-sampling MAP-Elites** (Justesen et al. 2019), which spends listens on explicit re-evaluation but **assumes no locality at all**. Clean trade, to be settled by the gate rather than by argument.

**Newcomer protection added** — a resident cannot be evicted until 2 further offspring have entered its cell, max half a cell protected. A newly-arrived genotype earns its slot by being selected and producing same-cell offspring, and cannot do that if evicted first. Keyed on arrival order and **blind to fitness**, so it does not reintroduce the bias fitness-based eviction would.
  - *Rejected variant, and worth recording because the reasoning generalises:* protecting residents by **observation count** would break the mechanism outright. Almost every resident here has exactly one observation — genomes are heard once, replay is removed, the cooldown suppresses repeats — so the rule would protect nearly everyone and freeze the cell. The sampling in DG is implicit and lives *across* residents, not within them: a cell's sample size is its resident count, not any resident's listen count.

**Consequences:** (a) **the replay branch is removed**, `P_REPLAY` 0.15 → 0. Deep cells give implicit averaging free, so those listens are better spent generating (see *listens are the scarce resource* below). (b) **Cost stated plainly:** depth multiplies the listens needed to resolve a cell — filling 256 cells to depth 8 is 2,048 listens, ~31% of the ~6,500 budget. D = 8 chosen against that budget; the paper uses 50, which at 256 cells would exceed the entire budget.

### Archive geometry

Adopted from v1; no generational GA is built first. 16×16 = 256-cell archive. Steady state: one listen = one evaluation = one archive update, which is what makes it fit a single-key interface.

**Axes** (both from SAMPLES, both global constants):
- Axis 1 — **temporal development**: render split into 8 segments, 13-coefficient MFCC mean vector per segment, descriptor = mean pairwise distance between segments. Static drone ↔ sound that goes somewhere.
- Axis 2 — **harmonicity**: spectral flatness (Wiener entropy). Pitched ↔ noisy.

Four criteria for any future axis: computed from SAMPLES; audible along its length; something variety is actually wanted along; approximately independent of fitness. Brightness fails the third (Jon: "I don't know that super bright is important"); event density largely duplicates axis 1. **Axes describe, they do not predict** — the temporal-development axis is justified by the four criteria only, never by a claim that developing sounds will win (see standing caution above; the original justification was exactly that claim and was struck 2026-08-30).

**Jon's recorded misgiving about MAP-Elites** (2026-08-30, verbatim): *"we're hard coding the range that creatures will exist within, not in a limiting way, more in a sustaining way — there'll always be creatures of maximum and minimum density in the herd, and I'll hear from them as frequently as everyone else. Maybe it's fine. The worry is that the herd couldn't converge towards something wonderful as it's forced to stay so spread out."* He asked to run with it and have the misgiving recorded. It is a real and known property of plain MAP-Elites, not a misreading: uniform cell selection spends search effort evenly across behaviour space regardless of quality.

**His proposed compromise, adopted:** bias prime-parent selection by fitness raised to a power. Standard in the quality-diversity literature as biased elite selection, and it does not damage illumination — the archive keeps its diversity, the bias only decides where effort goes. Implemented **rank-based** rather than proportional to raw fitness, since dwell is an unnormalised duration and any raw-fitness scheme inherits the roulette defects barred elsewhere: for the cell at rank *j* of *N*, `r = 1 − (j−1)/N`, `P ∝ r^α`, **α = 2.0** (top decile gets ~3.6× the median decile's probability; α=1 mild, α≥4 approaches greedy and defeats the archive).

**Two distributions separated, because Jon was running them together.** (a) *which elite becomes a parent* — rank-biased as above. (b) *which Creature the listener actually hears* — his "I'll hear from them as frequently as everyone else" is about this one. On generate steps (a) already governs it, since the listener hears the new candidate. The remaining case is the **replay branch** (p = 0.15): replaying an existing incumbent to firm up a noisy single-observation fitness estimate. Replay is selected by **uncertainty — fewest recorded listens — never by fitness.** Fitness-biased replay would starve low-fitness cells of the listens their own estimates depend on, so their estimates would stay noisy, so they would keep being skipped: a self-confirming loop making the archive's low-fitness regions permanently *unmeasured* rather than genuinely poor. Net: 85% of listening time goes to offspring of rank-biased parents, 15% to refreshing the least-measured incumbents.

**What this does not resolve, stated honestly:** the archive still retains one elite per occupied cell indefinitely, which is the behaviour Jon called "sustaining". Biased selection redirects effort, it does not remove extremes from the herd. If shedding cells is later wanted, that means culling incumbents below a global fitness floor — trades illumination for convergence, a different algorithm. Recorded as the available lever, not adopted.

**Insertion uses lexicographic parsimony** (Luke & Panait, GECCO 2002): challenger wins on fitness above a 5% margin; within a ±5% effective tie the lower-complexity genome wins; complexity can never override fitness. Complexity = count of not-kill switches. Replaces the multiplicative fitness penalty Jon proposed — those are notoriously hard to tune and the safe window moves with fitness scale.

Fitness-proportionate/roulette selection is barred everywhere in the system.

### Variation

Standard pipeline **select → recombine → duplicate → mutate**; mutation applies to the whole child genome after recombination. (Jon asked whether inherited genes are exempt from mutation — they are not.)

**Documentation defect found 2026-08-30 and repaired.** Jon read the spec and formed a materially wrong model of reproduction; the doc permitted every misreading, so this is recorded as a doc failure rather than a comprehension one. Four faults: (1) the per-listen loop was never stated as an ordered sequence, so the 15/51/34 split read as tags applied to a child *after* judgement rather than branches decided *before* generating it; (2) `CROSSOVER_RATE` and `partner_influence` were not visibly distinguished, so 0.40 read as "40% of genes come from parent two" — it is ~6% of slots averaged across breeding events; (3) the conditionality that makes crossover an *attempt* (compatible partner within the distance threshold, else single-parent fallback) sat in the compatibility section, far from the 0.40; (4) an over-correction — "asexual reproduction" had been introduced as a term, implying single-parent events are something other than mutation-only. They are mutation-only. The only distinction is **event versus system policy**: most events are mutation-only, the system is not. Fixes: new §6.0 stating the nine-step loop before any parameter values, a two-dial table with the worked ~10-of-64-slots consequence, the attempt-conditionality moved to the rate, and the terminology simplified back.

**Lesson for future spec work on this project:** state the loop before the parameters. Jon reasons from the sequence, and a specification that lists tunable values before establishing the order in which they act will be misread the same way again.

Continuous genes: self-adaptive ES, τ' = 0.0091, τ = 0.0801 for n = 6,102, σ init 0.05, floor 0.002, ceiling 0.5.

Switch flip rates calibrated per class from the locality test, base 0.004, targeting ~1.0 flip per reproduction.

**Crossover rate 0.50** (raised again 2026-08-30, see linkage reframe below). **Three orthogonal dials, repeatedly conflated:** `CROSSOVER_RATE` = how often any partner is involved (0.50); `n_partners` = **how many** (gene, 1–8, init 1.4 — 60% one partner, 40% two); `partner_influence` = **how much** comes from partners in total (gene, 0–0.5, init 0.15). Raising the partner count does not increase foreign material, it divides the same share more ways. Multi-partner operator: per slot, prime parent with probability `1 − partner_influence`, else one of the k partners uniformly; slot index preserved throughout; `src[i]` and `contrib` already generalise. `n_partners` range deliberately uncapped-in-spirit at 8 — high counts are self-limiting, since a child assembled from five sources is near a shuffle and rarely survives its cell.

**`n_partners` was silently lost** when `partner_influence` was introduced (they answer different questions) and was restored 2026-08-30 when Jon spotted the omission: *"is it always one additional parent? We've done away with the meta gene for number of additional parents?"* It was in his original genome description under META GENES as "preferred number of partners to mate with".

**Original 0.15 rate, distance-restricted —** Raised from 0.15 on Jon's objection 2026-08-30 ("'mutation only' feels boring. Let's avoid it as long as we can make a strong case for doing so") — and he was right that the low rate was inconsistent with our own design. The whole operator (wave-intact, slot-preserving, distance-restricted, with the routing repair pass) is engineered specifically against linkage disruption, so justifying a low rate by generic disruption fear contradicts having built it. Effective recombination is `rate × partner_influence`, and with influence init 0.15 a typical event exchanges ~10 of 64 slots, so 0.40 is less aggressive than it reads. **The system decides this itself:** `partner_influence` is self-adaptive, so it will drift to zero if recombination hurts in this encoding and upward if it helps. Log the population mean each 100 listens — that trace is the genuine experimental readout on linkage, and the rate should be revised in the direction the gene moves rather than by argument.

**Partner selection — soft kernel, no threshold, NO FAILURE CASE.** The kernel never reaches zero, so a partner is always returned: no threshold, no retry loop, no fallback to a single parent, and the realised crossover rate equals `CROSSOVER_RATE` exactly. (Jon asked directly whether partner search can still fail. It cannot.) (rewritten 2026-08-30; the hard threshold was the third invariant violation, see standing caution).

Compatibility distance `D = 0.4·d_switch + 0.4·d_active + 0.2·d_global`, each term in [0,1]. `d_switch` = normalised Hamming over the 768 binary switches (structural difference); `d_active` = Jaccard distance over the active-slot sets (slot correspondence — separate from `d_switch` because slot-preserving inheritance depends specifically on slot-*i* occupancy, and with ~3 of 64 slots active the `active` bits would be swamped among 768); `d_global` = mean absolute difference over the 22 global genes (tuning). Continuous per-wave genes deliberately excluded — two genomes with the same waves in the same slots at slightly different tunings are the pair crossover handles best. Expected values: parent–child ~0.005, parent–child where the flip hit `active` ~0.105, siblings ~0.01–0.2, unrelated elites ~0.55. To be confirmed at Gate 2.

Partner drawn from **all** occupied cells with probability ∝ `exp(−D / (λ·D_med)) · (1 + γ·R)`, **λ = 0.25**, where `D_med` is the running median distance between random archive pairs. Exponential not Gaussian — constant factor per unit distance makes λ interpretable, and the heavier tail keeps distant pairings rare rather than numerically impossible (a Gaussian at comparable selectivity puts 2·D_med below 1 in 10⁷, which is the same defect in a different costume). At λ = 0.25 a partner at `D_med` is 1/55 as likely as an identical genome, and **a partner at 2·D_med is 55× less likely than one at D_med**. Realised: roughly two crossovers in three draw a close relative, the third reaches across the archive — against 100%/0% under the old threshold. **Widened from 0.18 to 0.25 on Jon's stated preference** (2026-08-30): *"rare but genuinely reachable (so vanishingly rare doesn't qualify) is important in this case."* At 0.18 a partner at twice the median was 260× less likely — rare to the point of being effectively unreachable within a realistic listen budget. This is a sharpening of vastness-is-the-point that should govern future decisions: non-zero probability is not sufficient; the probability must be large enough that the event actually occurs.

**Jaccard property worth knowing** (Jon asked whether the maths handles a fourth voice being a bigger change than a tenth): adding one wave to a genome with *k* active gives `d_active = 1/(k+1)` exactly. 3→4 scores 0.25, 9→10 scores 0.10. Diminishing structural significance falls out of the metric with no special-casing.

Sampling is proportional to the kernel over the whole archive, replacing the sample-20-and-give-up loop: no failure case, no fallback, and the realised crossover rate equals 0.40 exactly. ≤255 distance computations per crossover event — negligible. Diagnostic: log mean `D` of accepted partners against `D_med`; convergence of the two means the prime parent has no close relatives left and λ needs revisiting.

Similarity-weighted mating is NEAT's speciation softened so no pairing is forbidden; Jon re-derived the underlying instinct as "nature only breeds similar species."

**Genotypic, not genealogical — settled 2026-08-30.** Jon: *"genotypic similarity is absolutely the way to go."* On the genealogical bonus he was indifferent (*"we can have ancestry too if you're very excited about it but I'm more than happy to lose it"*); **cut**. The argument for it was real — slot-preserving inheritance assumes the parents' slot-*i* waves are *homologous* (descended from a common ancestral wave), and genotypic similarity is evidence of homology rather than proof, since two genomes could hold similar slot-3 waves by convergence. But it is empirically irrelevant at this dimensionality: in a 6,102-parameter space, convergence is not a realistic route to similarity, so genotypic closeness already implies common descent. The bonus bought nothing while adding a kernel term, a constant, and a coupling between the recombination machinery and the fitness-provenance machinery. **Revisit trigger recorded:** the argument turns entirely on dimensionality, so if an indirect encoding (CPPN) is ever adopted the genome shrinks to a few dozen genes, convergence becomes real, and the term should be reinstated. `contrib` is maintained for Hamilton weighting regardless, so it stays free to add.

**Waves inherited intact, slot-preserving.** The crossover unit is the whole 95-gene wave. Per slot, take the primary parent's wave with probability 1 − `partner_influence`, else a secondary parent's. Slot-preserving inheritance keeps routing indices meaningful because distance-restricted parents have homologous slot-*i* waves. **Repair pass:** any routing index landing on a slot whose occupant came from a different parent with differing `active`/`gain_mod_on` state keeps the index but takes depth × 0.05 — reuses the reroute rule.

Jon's "fractional parent counts (1.05 parents)" idea is exactly low-probability uniform crossover, implemented as `partner_influence` at wave granularity. Jon's "make generation one near-identical" idea is implemented as a **seeded initial batch**: 32 genomes, one random and 31 mutations of it at σ = 0.2.

**Duplication (Ohno 1970) — Jon's original "copy into/overwrite other genes of the same class, so a whole wave gets propagated into multiple wave slots of the child".** Spot-checked 2026-08-30 at Jon's request and found under-specified; repaired. It is a **variation operator, not part of crossover**, applied after recombination and before the per-gene mutation pass, so slot-preserving inheritance (which governs recombination only) does not constrain it — the two were suspected to be in conflict and are not, but the pipeline position now says so explicitly. p = 0.08 per reproduction; source drawn uniformly from active waves; `n_targets` 1/2/3 with probability 0.75/0.20/0.05 (Jon asked for *multiple* slots, so the multi-copy move must be reachable); targets any of the other 63 slots, **muted or active** — restricting to muted would make overwriting a working wave unreachable, which invariant 1 forbids. Copy arrives `active`, mutated at 3σ. If the target was already active, the copy's `gain_out` and any inbound routing depths are multiplied by 0.05 — same principle as the reroute rule, decomposing a compound change (voice destroyed + different voice at full strength) into one clean deletion plus a quiet arrival that can grow. Modulation indices in the copy are kept unchanged except self-modulation, which is remapped to the copy's own slot. What it buys: the only operator reaching a chorus, a detuned pair or a rhythmic echo of an existing voice in one step — point mutation would have to build the second voice from scratch through a long stretch of unrelated intermediates.

### Fitness and measurement integrity

Dwell seconds. Nothing else — the system is agnostic as to *why* a listener kept listening.

**Relatedness-weighted lineage averaging** (Jon's suggestion 2026-08-30, adopted; it fixes a real flaw). Under multi-parent breeding a flat depth weighting let an ancestor contributing 5% of the genome count as much as one contributing 60%. Each ancestor's dwell is now weighted by the fraction of the current genome actually inherited from it — relatedness weighting in **Hamilton's** sense. Cheap to compute because waves are inherited intact and slot-preserving: record `src[0..63]` at assembly, then `direct(p) = |{i : src[i]==p}| / 64` and compose transitively, truncated to depth 3 and the 8 largest contributors. Global genes ignored (22 of 6,102). Under mutation-only reproduction `direct = 1.0`, so this reduces exactly to the old 0.5/0.3/0.2 — a strict generalisation, active only where recombination has mixed lineages.

```
w0 = 0.5;  w(a) = depth_weight(a) · contrib(a)   [0.3 at depth 1, 0.2 at depth 2]
F(g) = [ w0·dwell(g) + Σ w(a)·dwell(a) ] / [ w0 + Σ w(a) ]
```

Lineage depth remains a global constant.

**Repeated listens to one genome** (via replay or `B`): `dwell(g)` is the **plain arithmetic mean of that genome's own attended observations**. Relatedness weighting operates strictly *between* individuals, never within one — each term in the formula above is itself a plain mean. This was underspecified until 2026-08-30; the formula's singular `dwell(g)` implied one observation per genome and the replay branch said only "update the estimate". Now stated explicitly.

**Offspring yield — retaining discarded children's measurements** (added 2026-08-30 from Jon's question). Most generated children lose their cell contest and are discarded; their dwell was a real measurement doing nothing for the search. Now: each incumbent carries `n_offspring` and `mean_offspring_dwell` (reset when the incumbent is replaced, since the statistic describes one genome's neighbourhood), shrunk toward the archive mean with prior strength m = 5. Used **only** in parent selection, which becomes `score = 0.7·r_fitness + 0.3·r_yield`, `P ∝ score^α`. Firewalled: never enters `F`, never a cell contest, never the Predictor's target, never a diagnostic.
  - *Rejected alternative:* feeding a child's dwell into its parent's fitness. It would change what parent fitness means — from "how long people listened to this Creature" to "…and things near it" — and make an elite's stored fitness partly a function of how many children it happened to have, i.e. selection history rather than sound. Fitness is an instrument and stays clean.
  - *Why the adopted version isn't a smuggled prediction:* parent selection is not an instrument — it changes where effort goes, not what is measured, and is already fitness-biased by explicit decision. The assumption ("a parent whose children scored well is worth exploring further") is a claim about the *structure of the search*, not about which sounds win, and it is the same assumption the locality criterion already makes and explicitly tests at Gate 2.
  - Discarded children's records were already persisted and already Predictor training data; Jon's assumption that they were thrown away entirely was wrong on storage but right that they fed nothing in the search.

**Repeat cooldown — the reframed "never the same sound twice" rule.** Jon 2026-08-30: it was never meant as a hard rule; the operative formulation is *"listens are a resource, spend them wisely"* and *"boredom from repetition is a thing, having someone listen to the same sample six times in a row will be of limited use"*. Derived constraint: no genome may be played twice within a rolling window of **W = 30 listens** (~8 minutes at 15 s mean dwell — the horizon over which a repeat measures boredom rather than the sound). FIFO of the last 30 genome hashes; regenerate on collision, up to 5 attempts, then accept. Soft, not a rule about what may exist — nothing is made unreachable, only rescheduled. **`B` is exempt**: a listener choosing to return to a parent is an explicit request, not a system-imposed repeat.

**Attention gating is mandatory** — Page Visibility API and window blur pause the dwell clock; 90 s input-idle marks a listen `unattended` (enters at weight 0.25, not discarded); listens below 0.35 s discarded as double-taps. **Dwell is censored at exactly L**: when the render ends, dwell records at L with a `completed` flag and the clock stops; post-render time does not accrue. The old absolute 180 s cap is gone — the clean censoring point at L is what the servo depends on. Dwell ∈ [0.35, L].

Every genome must have its own dwell measured at least once before archive insertion; lineage average may never be the sole basis.

**Diagnostics detect faults in the instrument only** — the inattention confound, whether the servo is tracking, how much signal is being censored. Never a verdict on population quality. The "bimodal dwell distribution = healthy population" claim was struck 2026-08-30 as a smuggled prediction; Jon: *"I would dispute that lots of early skips and one long listen is healthy. I want a system that is agnostic as to why you listened and only cares that you listened. For that we just want how long, no?"* Correct.

### Render length servo — Jon's algorithm

**Render length is a global parameter, not a gene** (invariant 3). Jon restated the controller precisely 2026-08-30 after the first version was mis-specified; his algorithm is implemented as given.

The design turns on a **censoring asymmetry** that an implementer must understand. Dwell recorded at length L is right-censored at L. So for any `L' < L`, every recorded listen either ended before `L'` (dwell is exactly what it would have been) or reached `L'` (would have maxed out) — meaning the maxing-out proportion at *any shorter* length is computable exactly from data already held. No observation carries information about behaviour *beyond* L. Hence: **shrinking is computed, extending is triggered.**

```
after every listen, over the trailing X listens:
  p = proportion flagged `completed`
  if p > T:   L ← min(L · 1.5, L_CEILING)        // blind above L: step and re-measure
  else:       k  = floor(T · X)
              L' = (k+1)-th largest dwell in the window   // shortest L with p(L') ≤ T
              L  ← max((L' + L) / 2, L_FLOOR)             // halfway
```

`L'` is an order statistic: set just above the (k+1)-th largest dwell, exactly k listens sit at or above it. The halfway move damps the computed shrink against window noise.

X = 100 (with T = 0.10, k = 10, so L' reads the 11th-largest of 100 — a stably estimated quantile, and responsive within roughly a session's data). T = 0.10 (ceiling rarely binding but still informative; lower and L chases rare long listens without bound, higher and the top of the fitness signal is routinely censored). L init 60 s, floor 15 s (below which the pre-wait/duration/mid-wait structure can't be expressed), ceiling 300 s (engineering limit — 53 MB in one `AudioBuffer`; raising it needs chunked synthesis). Guards: window must be full; apply only if the change exceeds 5%.

**The >70% early-skips diagnostic special case is dropped.** Jon: *"why would lots of early skips be a diagnostic fault? It could just mean we've bad lucked our way into a bunch of unappealing creatures."* Right — it demonstrates nothing about the priors, and treating it as a fault was itself a claim about what ought to score. The servo handles the case with no special-casing: many early skips means few maxing out, so the shrink branch computes a shorter L. That it needs no special case is a point in the design's favour.

No looping and no auto-advance: looping makes repeated material indistinguishable from developing material; auto-advance destroys the skip signal.

### The Predictor

Ensemble of 5 MLPs (3×256), two heads (log dwell; behaviour descriptor). Minimum 2,000 attended listens before first use. 1,000 autonomous iterations per checkpoint; autonomous fitness = `mean − 1.0×std` (Lower Confidence Bound); behaviour-space trust region; 60 re-grounding listens per checkpoint (30 highest-predicted, 30 highest-uncertainty); health metric Spearman ρ, with ρ<0.40 halving iterations and ρ<0.20 disabling autonomy. Return when healthy ≈ 17× on listener time.

Failure mode specified rather than caveated: surrogate-assisted EAs are vulnerable to **false optima**, and with hundreds of thousands of free evaluations the search will find and occupy the model's blind spots.

### Visualiser — two channels (Jon's correction, accepted)

- **Slow channel, GENOME:** one field per active wave, hue from `pitch_master`, position from slot, modulation edges as arcs; 14 visualiser genes set palette and motion. Delivers family resemblance — siblings share waves so siblings look alike.
- **Fast channel, SAMPLES:** a 60 Hz per-wave amplitude envelope cached during synthesis (free at render time) drives each field's individual pulse; short-window RMS drives global luminance; short-window spectral centroid drives a global hue offset; onsets trigger ripples. Delivers ms-to-ms linkage and within-render timbral change, which Jon correctly judged not derivable from the genome alone.

Explicitly **not** a general FFT visualiser over the mixed output — per-wave attribution is the point and an FFT of the mix cannot recover it.

## CPPN for v1 — decision analysis (requested by Jon 2026-08-30)

Replacing explicit per-wave genes with a small network mapping *(slot index, normalised time) → (amplitude, pitch, …)*.

**Recommendation: no for v1.** Conditions to revisit are at the end.

### For

- **Gene reduction.** A CPPN of ~12 nodes and ~40 connections is roughly **80 genes** against the direct encoding's 6,102 declared. At the ~40n heuristic that is ~3,200 listens against ~6,500 — **roughly half the budget**.
  - **But the honest version:** the comparison that matters is against *expressed* parameters, not declared, and the direct encoding already expresses only ~163 at initialisation thanks to mute-based complexification. So the real advantage is about **2×, not 30×**. The order-of-magnitude win was already taken by the 500→64-slot cut and the mute initialiser. This is the strongest argument for CPPN and it is weaker than it first appears.
  - **The advantage does compound.** As complexity is unmuted, the direct encoding's expressed count climbs toward 6,102 while a CPPN's stays ~80 with phenotype detail growing unboundedly. The gap widens over the project's life rather than staying at 2×.
- **Regularity and "rhyming".** Waves derived from one function of slot index relate to each other by construction — harmonic series, formant-like clusters, related rhythmic subdivisions. This is the difference between a sound that is *composed* and one that is *assembled*, and it is the argument Jon is actually drawn to.
- **Unbounded phenotype detail.** Envelopes become continuous functions of time rather than ≤8 nodes. Free arbitrary detail — and this connects directly to the sine-wave-speech finding, since complexity of sound lives in time-varying envelopes.
- **Predictor gets much easier.** Input dimension drops from 6,102 to ~80.

### Against

- **House-style bias.** The activation set determines which regularities are cheap — sine gives repetition, Gaussian gives symmetry — and Picbreeder outputs carry a recognisable look for exactly this reason; the literature says outright that an architect biases the output by choosing the function set. Jon made this the deciding argument. Stated fairly: it is a *bias*, not a literal truncation — a CPPN can represent anything given enough nodes. But under the scoping rule now in vastness-is-the-point, some regions become expensive enough to be unreachable within budget, which is the same defect in effect.
- **Worse locality — researched, not assumed.** Generative encodings have **low locality through pleiotropy**: one gene affects many phenotype elements, so a single change produces several qualitative changes at once. HyperNEAT specifically: "a change in the indirect encoding will cause changes across the entire weight pattern, when a change to a single weight is needed." This is directly hostile to the `M`-key sibling behaviour, to Gate 1b, and to the §13.2 locality criterion — the properties the whole variation design is built around.
- **Indirect encodings struggle with irregularity.** They excel on regular problems and that advantage becomes a liability where real structure is irregular. Whether music is "regular" in the relevant sense is precisely what this project does not know.
- **It discards most of the variation layer just designed.** Not previously stated to Jon and it is a large hidden cost.

| Component | Fate under CPPN |
|---|---|
| Wave-intact **slot-preserving inheritance** | **Gone.** No per-wave gene blocks to inherit. Replaced by NEAT crossover aligning genes by historical marking |
| **Duplication operator** | **Gone.** No wave to copy. NEAT's add-node / add-connection are structural mutations but not the same thing — you lose the chorus / detuned-pair / rhythmic-echo-in-one-step property |
| **Per-wave kill switches** (`active`, `gain_out_on`, `gain_mod_on`) | **Gone as genes.** Would become thresholded CPPN outputs — much less crisp, and reintroduces the measure-zero problem the switches solved |
| **Compatibility distance** (`d_switch`, `d_active`, `d_global`) | **Gone.** All three terms reference per-wave structure. Replaced by NEAT genetic distance |
| `n_partners` / `partner_influence` at wave granularity | **Gone.** No slots to apportion; needs re-derivation |
| Reroute and duplication **attenuation rules** | Gone or heavily reworked |
| Declared-vast / expressed-small (invariant 5) | Survives in spirit; dies in implementation — complexification becomes add-node/add-connection |
| MAP-Elites, deep cells, descriptors, selection, offspring yield | **Survives** |
| Parsimony | **Survives, and improves** — complexity becomes node/connection count, which NEAT already does naturally |
| Fitness, lineage weighting, gating, servo, cooldown | **Survives** |
| Synthesis engine, PM, modulation matrix | Survives if routing stays direct |
| Locality test, visualiser, Predictor | **Survives** |

Roughly: §7–§11 survive intact; §3's switch architecture and §6.3, §6.5, §6.6, §6.8 are rewritten. That is the entire variation layer.

- **Debuggability, and this one is Jon-specific.** With the direct encoding the legibility display shows one lane per wave with its own genes — a visible answer to "what changed". A CPPN genome is a network whose relationship to the sound is not inspectable by eye. Jon judges by output and cannot read code, so losing the legible genome→sound correspondence costs him more than it would cost most builders.

### Recommendation and revisit conditions

**No for v1.** The parameter-count argument is real but roughly 2×, not decisive; the locality cost is directly hostile to the design's core assumption; and the machinery loss is most of the variation layer.

Revisit if any of these hold:

1. Gate 2 passes comfortably for the direct encoding, but Gate 3 shows expressed complexity climbing past ~600 parameters and listens becoming the binding constraint. The compounding argument then bites for real.
2. The direct encoding's output is judged structurally incoherent — waves that do not relate to one another — and **regularity** rather than parameter count becomes the reason to switch.
3. Either way, the published path is **HybrID** (Clune et al.): evolve with the indirect encoding first to capture regularity, then switch to the direct encoding to handle irregularity. Strictly better than choosing between them at the outset, and it means this decision is deferrable rather than binding.

## Deleted gene: global `master_gain` (2026-08-30, Jon's instruction)

**What was checked first.** Several things are gain-shaped and only one is dead. Per-wave `gain_out` sets a wave's level *relative to its siblings*, so it changes the mix's balance and spectrum; normalisation applies a single scalar to the whole render, so relative balance survives untouched. Per-wave `gain_mod` sets modulation depth and has nothing to do with output level. Amplitude envelope levels shape a wave through time. **All three do real work and stay.** Only the *global* whole-render scalar is cancelled by LUFS normalisation.

**The principle this establishes, which is the durable part.** The earlier reasoning — retain it, because neutral material is the substrate of the search (invariant 5) — was nearly applied wrongly. **Neutral material is genetic content that is currently unexpressed but *potentially expressible*:** a muted wave becomes audible the instant its switch flips. A gene whose effect is mathematically cancelled downstream can never become expressible under any mutation. That is not neutral material, it is dead weight, and it should be deleted rather than retained. Jon called this and was right.

**A defect found while verifying, which strengthens the case.** `master_gain` was not *quite* inert: on the near-silence path (§4.7) the render is played unnormalised, so the gene was live there — and could push a Creature across the −60 LUFS threshold, flipping it between "left silent" and "boosted to −20 LUFS". A gene that does nothing except at a threshold, where it does something dramatic and arbitrary, is worse than one that does nothing at all. With it gone, the near-silence test measures the raw sum of waves — a real structural property.

**Consequences swept through the spec:** globals 22 → 21; total 6,102 → **6,101**; expressed at init 163 → **162**; cardinality 10^14,695 → **10^14,693** at 8 bits (10^18,366 at 10 bits, 10^12,121 at ~6.6); expressed subspace 10^393 → 10^390; `d_global` now over 21 genes; τ (local) 0.0801 → **0.0800** (τ′ unchanged at 0.0091 to four places); Predictor input vector 6,101; genome storage figures; §5.1's list of unspecified global initialisations. Also newly stated: everything downstream — the visualiser's cached envelopes and mix RMS, and the SAMPLES tier for descriptors and perceptual distance — reads the **normalised** buffer.

## Late decisions (2026-08-30, final pre-handover pass)

**Output normalisation — loudness, not peak (§4.7).** Jon asked whether waves are peak-normalised before becoming audio. They were, and that is the wrong instrument. **Why normalisation matters at all:** without it dwell partly measures loudness, loudness is trivially evolvable, and the search would find "louder holds attention" within a few generations and let it swamp structural discovery. It is a measurement safeguard, not cosmetics. **Why peak fails here:** a Creature that is 99% silence with one transient gets scaled by that transient and is perceptually inaudible, while a dense Creature at the same peak is very loud — easily 30 dB apart. This design deliberately produces wide density variation, so peak normalisation would guarantee wildly varying perceived loudness across the herd, reintroducing the confound. **Now: integrated loudness to −20 LUFS (ITU-R BS.1770 / EBU R128), true-peak ceiling −1 dBTP.** BS.1770's gating is what makes it work for sparse material — the absolute (−70 LUFS) and relative (−10 LU) gates exclude silent blocks, so it measures how loud it is *when making sound*. **Peak overshoot handled by static gain reduction, not a limiter:** limiting is nonlinear and would alter timbre *selectively on high-crest material*, i.e. systematically on one region of the space — a structural bias, which is the thing this project guards hardest against. Static gain is transparent; the residual loudness spread on the highest-crest Creatures is honest and logged. **Integrated over the whole render, never short-term** — short-term normalisation would compress loudness over time and destroy internal dynamics, a direct attack on archive axis 1. **Near-silence (< −60 LUFS): do not normalise**, flag `near_silent`, let it score badly on its merits rather than be amplified into hiss. **Invariant check: passes.** Normalisation does not narrow what can be *produced*, it standardises how it is *presented*; absolute level is a property of the playback chain, not of a sound's structure, and the listener's volume knob governs it anyway. **Consequence: the global `master_gain` gene is deleted** (Jon's call, 2026-08-30) — see below.

**Annotation field now pauses audio as well as the dwell clock (§8.6)** — Jon overruled the keep-playing decision; the argument for continuing has been removed. Because the render clock stops too, a listen cannot reach `completed` while a note is being written.

**Pause key `P` (§8.7).** Jon's request, flagged by him as a development-phase affordance he expects to reconsider. Pauses audio, dwell clock, render clock and visuals together via `AudioContext.suspend()`, which preserves position exactly. No better idea was on offer — a pause is a pause. The one genuine improvement made: **all three suspension triggers** (visibility/blur, annotation focus, pause key) now share **one code path** — `suspendAttention(reason)` / `resumeAttention()` — because three independent places to start and stop the dwell clock is three places for it to leak. That also makes removing the pause key later a matter of deleting a key binding rather than unpicking logic. Suspended-by-`paused`/`annotating` listens carry full lineage weight (clocks stopped, dwell honest); `unattended` stays at 0.25 (nothing was stopped, the listener just left).

**Universal timestamps (§14).** Jon assumed every record carried one. Listens and notes did; snapshots, servo events, gate artefacts and anomalies did not. Now a stated rule: **every record in every store carries `timestamp_ms` and `session_id`**, no exceptions.

**Visualiser (§11.1) reframed from open questions into a brief.** Jon: pitch him your best shot given the named aims and your own judgement. So the section now instructs the implementer to propose, with the three jobs non-negotiable, the genome/samples two-channel requirement kept, ranges and priors for all 14 genes to be proposed, and a plain fallback shipped first so the harness works meanwhile. Accessibility constraints stay hard requirements (`prefers-reduced-motion` at 0.1×, no >3 Hz high-contrast alternation over >25% of screen).

**One canonical spec filename.** Jon asked why the document had two names. It should not have: `SPEC.md` in-repo against `playing-god-design-brief.md` in the Claude folder is the same silent-drift risk that got the separate code brief rejected. Now **`playing-god-spec.md` / `.pdf` in both locations**, with every reference in the repo docs, handover prompt, export instructions and this entity updated. Tombstones left at the old names.

## Readiness audit (2026-08-30, Jon asked whether he was skipping steps)

Honest answer: the machinery is over-specified relative to the inputs. Three areas are genuinely thin.

**1. The priors (§5) — the biggest gap, and the highest-leverage.** They decide whether generation zero is listenable, which is the gate that decides whether the project works; everything else in the spec is machinery for searching. New **§5.1** names nine things absent rather than deliberately open: `fundamental_cents` has no distribution or range at all *and 65% of pitch draws are expressed relative to it*; **envelope node priors do not exist**, so levels/times/curves default to uniform in stored space (average amplitude node ≈ −28 dB with enormous variance) — the worst of the nine, given the sine-wave-speech argument puts complexity in envelopes; shape weights and switch probabilities unspecified (all four enabled at p=0.5 with uniform weights makes most waves a mush that averages toward sine-ish, a much narrower palette than it looks); `gain_out` mapping lacks dB conversion, normalisation, k=1 behaviour and sort direction; `tempo_bpm` draw missing; `duration`/`mid_wait`/`pre_wait` drawn independently with no acknowledgement that 5 ms + 30 s mid-wait is one click per half-minute; `phase`; four global inits; all 14 visualiser genes. **An implementer must not silently default these.** New **§5.2** adds an automated prior sanity check — 1,000 renders, distributions of peak/RMS/silence-fraction/onsets/centroid, reported raw with no verdict — so a listening session is never spent discovering most renders are silent.

**2. The visualiser (§11) — thin, disclosed rather than papered over.** New **§11.1** states plainly that an agent would have to invent most of it, lists the five decisions that belong to Jon (what a "field" is geometrically; layout of 64 slots on a canvas; the 14 genes' ranges/mappings/defaults; between-Creature behaviour; onset-detection method), and gives a deliberately plain minimum-viable fallback so the harness works meanwhile. Not on the critical path — every automated gate is audio-only. House conventions carried over as non-negotiable: `prefers-reduced-motion` at 0.1×, no >3 Hz high-contrast alternation over >25% of screen (from sound-sandbox-visualisers).

**3. Multi-user — explicitly deferred, with a reason.** Mission statement says "a user or users"; pooling, deployment, hosting and what `listener_id` does were never designed. Deferred because the signal is already high-variance from one listener and pooling adds a between-listener term needing a random-effects model that cannot be fitted without data that does not exist. Forward-compatible move already in place at zero cost: `listener_id` is on every listen and note, so pooling can be done retrospectively.

Also newly surfaced by Claude in the same pass: the **Predictor's feature representation** (a raw 6,102-vector mostly inert is a poor MLP input; needs pooling or attention over active slots — not needed until Stage 4); **seed-batch ordering** (§7.5 forbids insertion before a genome is heard, so the 32 seeds are a pending queue, now specified); and an **empty-archive contradiction** — §6.6 guarantees partner selection always returns a partner, which is false with one occupied cell since the prime parent is excluded. Now specified: `CROSSOVER_RATE` treated as 0 until two cells are occupied.

**Gate 1a should be run audio-only first, then again with visuals.** The gate asks whether the *generator* is producing anything worth hearing, and a compelling visual could carry mediocre audio. The delta between the two verdicts is itself informative. Harness defaults to audio-only with visuals as a toggle.

**Related and newly stated in §11: the visualiser is part of the fitness instrument.** Dwell is measured with visuals present, so the system optimises *attending* time, not listening time strictly, and the 14 visualiser genes are under selection through their effect on dwell. A consequence of the design rather than a flaw — Jon put them in the genome deliberately — but it means a Creature can be held onto for how it looks, and that should be explicit.

## Build-everything decision (2026-08-30)

Jon's instinct — give him the listening test first but build the whole rest of it, accepting possibly-wasted code over a return trip to a coding agent, because his time is the premium. **Right, and safer than he framed it.**

The only gate that can invalidate the *architecture* is Gate 2b (behavioural locality), and it is fully automatable — so the machine settles it overnight before committing to the archive layer. A **Gate 1a** failure is a different shape: it says generation zero is not worth hearing, and the fix is in the priors (§5, §5.1), leaving archive, selection, fitness, servo, logging and annotations all still correct. That work is *premature, not wasted*. So the overnight run now builds through to completion once 2b passes rather than stopping for a human verdict. `docs/BUILD-ORDER.md` and `docs/HANDOVER-PROMPT.md` updated.

## The annotation field (§8.6, added 2026-08-30)

Jon's request: a text field for feedback as it occurs; on submit, clears and writes to a timestamped log for later review. Specified, with three things he had not raised.

**It records what was playing.** Each note carries `listen_id`, `genome_id`, `cell_x/y`, `dwell_at_note_s`, `render_position_s`, `L_at_note`, `time_composing_ms`, `session_id`, `listener_id`, `text`. A remark detached from what prompted it is close to useless.

**It never feeds the search — this is Jon's own invariant biting his own feature.** The mission statement rejects stated preference and takes measured engagement only; free text is stated preference in its purest form. Notes are firewalled from `F(g)`, descriptors, the Predictor's inputs and target, selection, container maintenance, the servo and every gate threshold, and live in their own `notes` store with no join path into the fitness pipeline. Stated as a hard rule *next to the feature* because it is exactly what a well-meaning agent would later wire in as a helpful signal. The evaluator may read notes as context and may not derive a steer from them.

**Typing contaminates dwell twice over, and both are resolved by one mechanism.** While composing, the Creature keeps playing and accrues dwell it has not earned (the inattention confound through the front door); and `SPACE` types a space rather than skipping. Resolution: `F` or click focuses the field and **pauses the dwell clock** by the same mechanism as visibility/blur (§8.3); audio continues, deliberately, since stopping it would mean writing about something no longer audible; transport keys type rather than transport while focused (fighting the browser here would be worse); `Enter` submits, clears, returns focus and resumes the clock; `Shift+Enter` newline; `Escape` discards. The listen is flagged `annotated` with `n_notes` and enters the lineage average at **full weight** — unlike `unattended` at 0.25 — because the clock was paused so the dwell is honest. The flag exists so an evaluator can check whether annotated listens differ; if they do, the pause is broken. Added as question 8 in §14.7.

**Log retrieval** written up at `code/playing-god/docs/EXPORTING-LOGS.md`: where the IndexedDB stores live, the `E` export producing timestamped JSONL, a completeness checklist, and the paste-ready prompt for a fresh evaluating session.

## Build and handover (set up 2026-08-30)

**Code root: `~/Desktop/Claude/code/playing-god/`** — matching the sound-sandbox-development-process convention of one project root per project under `code/`. Local git repo initialised; scaffold committed (`0a1c149`). Contains `SPEC.md`/`SPEC.pdf` (spec copied in-tree so the build agent needs nothing outside the project root), `README.md`, `docs/BUILD-ORDER.md`, `docs/HANDOVER-PROMPT.md` (paste-ready), and empty `src/ app/ gates/ output/`.

**Sandbox reuse — settled.** The existing harness at `sound-sandbox-env/` is **not Sound-Sandbox-specific**: `config.sh` sets `SANDBOX_SOURCE_DIR=$HOME/Desktop/Claude/`, so it snapshots the *whole* Claude folder including `Cowork/CONTEXT/` and every project under `code/`. So **reuse the harness, separate the project root and repo.** No filing confusion arises from sharing the sandbox; it would arise from sharing a project directory. Keeping the roots separate also keeps sound-sandbox's hand-tuned assumptions from leaking into a project that is its deliberate philosophical opposite (vastness-is-the-point).

**Container path is `/sandbox/code/playing-god/`.** `.git/` is excluded from the snapshot, so the container has no history — the build agent runs its own `git init` for in-session rollback, and host-side commits/pushes happen after `sync-back.sh`. The container cannot push.

**Two environment facts that shaped the architecture** (Dockerfile inspected): Node 20, git and python3 are present; **there is no browser and no audio device**. Hence the `src/` (DOM-free ES modules) vs `app/` (thin HTML shell) split, so Gates 2a and 2b run headless under plain `node`. Reinforced by the Chromium crash recorded in sound-sandbox-visualisers during the 2026-05-23 bake-off. MFCC to be hand-rolled rather than adding a dependency, keeping the container hermetic.

**Remote backup: not yet created.** `gh` availability on the host could not be verified from a Cowork session (Cowork's shell is a Linux workspace, not the Mac). sound-sandbox-development-process records `gh` as installed and authenticated for the `soundsandboxfiles` account. Jon to run the create-and-push himself; command supplied.

### Gate autonomy — which of the overnight run's steps need Jon

| Gate | Autonomous |
|---|---|
| 1b-mech (lineage stack) | yes |
| **2a genotypic locality** | **yes, fully** |
| **2b behavioural locality** | **yes, fully** |
| 3-plumbing (synthetic dwell) | yes |
| **1a generation-zero listenability** | **no — needs ears, by construction** |
| 1b-perc (sibling resemblance) | no, but objectively subsumed by 2a |
| 3-real, 4 | no — need 1,000 / 2,000 real listens |

**Gate 1a is unautomatable on principle, not by accident.** Any proxy metric standing in for "is anything here worth hearing" would be a claim about what sounds are good written into the machinery that decides whether to proceed — the exact failure mode of the standing caution. Invariant 1 is the reason that gate needs a human, which turns an inconvenience into a principled boundary and should be stated that way.

**Gate 2b is the overnight branch point, not 1a.** A 1a failure is fixed in the priors (§5) and leaves the archive, servo and logging correct — premature, not wasted. A 2b failure may change the archive design itself (coarser grid, different descriptors, or adaptive-sampling MAP-Elites), which *would* waste that work. So the overnight run builds through 2b, then branches: pass → build Stage 3 + plumbing test; fail → stop and report which §13.3 fix the numbers indicate.

**Synthetic dwell is for plumbing only** and every such run must be labelled `SYNTHETIC` in the logs, so no later reader mistakes it for evidence about the search.

## Development process (settled 2026-08-30)

Jon proposed: Claude writes a code brief from the spec → Claude Code builds → check it functions → after a few hours of use, hand comprehensive logs back to Claude and evaluate against the stated aims → iterate. Broadly right in shape; four changes, now in the brief as §13–§15.

1. **Build to the gates, not to completion.** The weak point was "build its thing, make sure that functions". Three gates test assumptions the downstream design depends on — genotypic locality, behavioural locality, and generation-zero listenability — and if one fails, everything built after it is wasted. Stage instructions are one at a time; a coding agent handed the whole spec will build the whole system.
2. **Logging designed before the build, not requested after** (§14). The largest process risk: hand back "comprehensive logs" that were never specified and you get hours of use whose logs cannot answer the gate questions, and the run has to be repeated. §14 derives instrumentation from the gates, diagnostics and invariants, and ends with seven questions the logs must be able to answer without access to the running system. Includes a storage correction — IndexedDB, not localStorage; a full genome is ~24 KB and a run would exceed the localStorage quota within a few hundred listens. Genomes stored as deltas against parent with every 100th in full.
3. **A fresh session evaluates, never the builder** (§15.1). An agent assessing its own output reads logs for confirmation and explains away what does not fit. The cold evaluator receives the spec, this entity, the logs and the gate artefacts — deliberately *not* the build session's account of what it did. This is the main practical reason the vault entities have to be good: they are the cold reader's only route to the reasoning behind the constants.
4. **The evaluation prompt carries the same guard as the design** (§15.2). "Evaluate against the stated aims" is exactly where a designer assumption re-enters. The aims are structural — does the generator make anything worth hearing, is variation local, does the archive fill, is the fitness signal usable. They are **not** "is the music good". A finding that one region of behaviour space scores higher is *data, not a recommendation*; turning it into a proposal to steer the search there is the known failure mode in an evidence costume. Skeleton prompt written into §15.3.

**On a separate code brief: no.** One spec plus thin per-stage build orders. A second parallel description creates two documents that must agree, they drift, and the failure is silent — the agent follows the brief, the brief has dropped an invariant, nobody notices. The spec is already implementer-facing. What is useful is sequencing, not re-description: *build §X–§Y plus its logging, stop, run Gate Z, report the artefact.*

## Key numbers

- **Dimensionality vs cardinality** (Jon asked 2026-08-30 whether 6,102 was the number of possible Creatures — it is not). Dimensionality is **6,102 parameters**; cardinality at a reference 8 bits per parameter is `2^48,808` ≈ **10^14,693** distinct genomes, against ~10^80 atoms in the observable universe. Quote the quantisation whenever quoting the figure: ~10^18,366 at 10 bits, ~10^12,121 at ~6.6 bits. Even the *expressed* subspace at initialisation (~162 parameters) is ~10^390. This is the concrete content of vastness-is-the-point: nothing here will ever be enumerated, so the only question is what the search is steered toward and away from — a constraint that removes a region cannot make the space tractable, it can only guarantee that whatever was in that region is never found.
- **Intelligible speech needs three time-varying sinusoids** (Remez, Rubin, Pisoni & Carrell, *Science* 1981, tracking F1–F3; four when a fricative needs it; Dudley's vocoder ~10 channels). Complexity of sound lives in time-varying envelopes and modulation, not oscillator count. This is the argument that took the design from 500 waves to a handful expressed.
- Expressed parameters at initialisation ≈ **163**; declared ≈ **6,102**.
- Listens for meaningful progress at the initial expressed complexity, ~40n heuristic: **~6,500**. The original 47,000-parameter design needed ~1.9 M listens (~2.4 years of continuous listening). Reducing expressed parameters helps roughly linearly.
- Self-adaptive ES constants for n = 6,102: τ' = 0.0091, τ = 0.0801.
- DarwinTunes for scale comparison: 2,513 generations under 6,931 consumers — but on *ratings*, i.e. stated preference, which this project rejects.

## Decisions taken against Jon's stated instinct

Recorded because the originals may be right.

| Jon's position | Decision | Reason |
|---|---|---|
| Unlock wave count by generation or fitness (disliked the loss of purity) | Wave count evolvable via the `active` kill switch; init mute probability 0.97, floor 1 | Same gradual build-up, no external gate, complexity earned not granted. Random-topology NEAT measured 7× slower than minimal-start. Jon accepted; now expressed as D1. |
| Lineage depth as a meta gene | Global constant | Invariant 3. Shallow averaging means more variance means more fluke high scores, so it would evolve to maximise its own measurement noise. |
| Blend-and-kill for envelope curves as well as wave shapes | Refused; one continuous curve parameter | Convex→linear→concave is an ordering, so one parameter covers it with better locality. 2 genes vs 8 per node. Blend-and-kill retained for wave shapes, where alternatives are categorical and the redundancy is a useful neutral network. |
| Slight fitness multiplier inverse to not-kill switch count | Lexicographic parsimony instead | Multiplicative parsimony penalties are hard to tune and the safe window moves with fitness scale; lexicographic form needs no tuning and cannot steer the search. |
| Hash the genome to pick archive cell | Refused | Destroys locality in behaviour space, which is where the archive's power comes from — neighbouring cells are stepping stones and improvements propagate. Hashing yields 256 independent random-restart hill climbers, strictly worse than one population. Underlying objection (bad axes) accepted and fixed with better axes. |
| CPPN indirect encoding for v1, conditional on assurance that wave-rhyming does not prejudice toward a sound type | Refused for v1 | The assurance cannot honestly be given, and that is itself the reason. CPPN activation sets determine which regularities are cheap — sine gives repetition, Gaussian gives symmetry — and Picbreeder outputs carry a recognisable house style for exactly this reason. Any indirect encoding buys compression by making some patterns cheap and others expensive. Direct conflict with vastness-is-the-point. Deferred with the bias named. |

## Jon's positions upheld against Claude

- **Ambient sludge is not the global optimum of dwell time.** Jon: "I think you underestimate boredom as a reason to skip. Or desire for something more interesting." Correct — boredom is a real skip driver. **But Claude then over-read this into a prediction that development-over-time is what wins, and Jon corrected that in turn 2026-08-30** (see standing caution at the top of this file). The surviving conclusions are only these: the real threat to dwell as a signal is **inattention**, not sludge, and it is cheap to defend against (hence the gating above); and no claim about which sounds score well may enter the fitness function, the descriptors, or the diagnostics. The temporal-development axis survives on the four neutral axis criteria alone.
- **Two kill switches per wave** (one for audio-out, one for use as a modulation source). More than a convenience: it is the DX7 carrier/modulator distinction, and without it every modulator is also a drone and low-frequency modulation is unusable. Extended in the spec to separate continuous `gain_out` and `gain_mod` values, each with its own switch.
- **Visualiser needs both genome and audio channels.** See above.
- **The render-length servo, restated.** Jon's algorithm replaced Claude's wholesale 2026-08-30. See above. The censoring asymmetry is the reason his shape is right and Claude's was not.
- **Relatedness weighting of lineage fitness.** Jon's proposal, adopted. See above.
- **Crossover rate.** Jon objected that mutation-only "feels boring" and asked for a strong case before defaulting there. The case existed and had not been made; rate raised 0.15 → 0.40 and handed to a self-adaptive gene.
- **Bimodal-is-healthy and the early-skip diagnostic.** Both struck at Jon's objection. Both were quality judgements dressed as measurement.
- **Self-refutation of parent-weighting meta genes.** Jon proposed meta genes weighting a parent's contribution and immediately noted they would evolve to max for everyone. Correct — that is segregation distortion, a reproduction-channel exploit rather than a fitness gain, and it is now the named sub-rule of invariant 3.

## Gate 1a called (2026-08-31)

Jon auditioned the overnight batch (100 creatures, 30 s renders, audio-only harness) the morning after the v1 build. **Called PASS early, at 38/100: 13 held, 25 skipped.** Owner amendment mid-audition: threshold 10 s → **5 s** ("at absolute random 10 seemed like too steep an ask"). Standouts in Jon's words: 016 "a beast" (held them the full render), 034 "magnificent", 040 "a lot of promise", 045/046/049 "good" — intended seed parents once seed-from-picks lands. Observation during audition, now proposal P4: opening silence collects free dwell (indistinguishable from loading); Jon explicitly declined the purist let-a-disruptor-strain-win answer — "I want to be blunter, at least at this early stage" — mandating a leading-silence trim with a code comment marking it a non-purist compromise. Creature 074 added to the picks post-call. **First real app session, same day: ~213 listens, Jon: "definitely heard the evolution in practice."** Session data in the browser store on localhost:8766 (canonical port, F6). Verdict artefact: `code/playing-god/output/gate-artefacts/gate1a-verdict.md`; fix queue F1–F6 in `docs/V2-PROPOSALS.md`. Same day, v2 build (fixes + P1 extended to all pitch/time genes incl. envelopes + P2, P3 with migration gate and revert licence, P4) dispatched to an unattended sandbox run. Session log analysis (same day): logged dwell caps correctly at L, but the render-length servo fires consecutively on an unchanged window — 60→15 in 3 listens, then 15→300 in 8 — a measurement-integrity bug (F8) that also caused the end-of-session slowness; near-silent deletion instinct logged as P5, explicitly flagged as colliding with the §2.1 invariant, undecided; population mean wave count evolved 2→8.75 in 200 listens, selection independently confirming Jon's more-waves instinct. First-session export filed at code/playing-god/output/logs/session-2026-08-31-first/.

## F3 audition + v2 shipped (2026-08-31 evening)

v2 built in a second unattended sandbox run (18 commits, all gates; 2b PASS at every swept p_ratio_jump, default 0.3; P3 migration sample-exact; harm-axis degeneracy flagged as the run's real find, fix pending). Jon auditioned the three p_active batches: engagement 4/21 → 6/21 → 8/23 across 0.03/0.06/0.10. **Owner ruling F10: gen-zero wave count becomes a 1–10 range** (explicit count draw, init-only). f3-pactive-006 #001 "might be the best thing I've heard". Favourites library created — jons-favourite-creatures + `code/playing-god/output/favourites/favourites.json` (9 entries). Drift control corrected an earlier overclaim: wave-count rise in the first real session is partly operator drift (duplication/crossover push it up under random fitness too), not pure selection signal. Wishlist: high-wave exploration batch (up to 64); in-app add-to-favourites key. Pending owner decisions: P5 near-silent handling; harm-axis fix (micro-run planned).

## Fulcrum check, predictor-in-shadow, and the v2.2 two-lane run (2026-08-31 late)

Jon asked whether the deep-grid rescue (coarser geometry) was pivoting on an unexamined rule, offering "never listen twice" → "listens are expensive, spend wisely" + "eight listens to the same sound are not eight independent polls (boredom is real)". Resolution recorded in V2-PROPOSALS: never-listen-twice is derived, not invariant; the boredom point is the strongest pro-deep-grid argument (kin-averaging polls one idea eight times without repetition; adaptive sampling's re-listens carry the familiarity confound). v2.2 races both architectures under synthetic dwell and Jon chooses on numbers. **Jon's interleaved-autonomy idea, filed at his request: rather than the Predictor running 10,000-assignation blocks, between each human listen it performs [some function of its current accuracy] silent assignations — autonomy scaling continuously with demonstrated skill, permanently on the re-grounding leash. Candidate replacement for §10.2's checkpoint structure.** Also Jon's design catch: a predictor fed "last 10 dwells" is good at next-dwell and bad at its job (creature evaluation without session context) → two-model split (creature model gates autonomy; session model for display; their accuracy gap measures how much of dwell is context vs creature). Shadow predictor ships in v2.2 — both models, both UI-accessible. **Owner override 2026-08-31: §10.2's autonomy gate (2,000 attended listens, ρ≥0.40) demoted from rule to wisdom** — either predictor can run at any moment, with on-screen text stating worthwhile results aren't expected below ρ 0.40. PREDICTED labelling, no self-training, no self-grading stay hard rules. Session aim confirmed: v2.2 delivers a fully usable app, archive mode as a setting.

## v3 considerations (parked for the next full version)

- **Deep think requested by Jon (2026-08-31): how shortform video "evolves" the most attention-grabbing and attention-retaining videos and delivers them to the correct user at the correct time.** The industrial-scale version of this project's fitness function (dwell/retention as sole signal, recommender as selection engine, per-user + per-moment conditioning) — what it gets right, what it optimises into (the failure modes Playing God should design against: engagement pathology, homogenisation, exploitation of reflexes rather than musicality), and which of its mechanisms (per-user conditioning, time-of-day context, cold-start handling, exploration bonuses) have legitimate analogues here. Relates to the P6 session-model finding (how much of dwell is context vs creature).

## Open questions

- **"There are other interactions that will make more sense once the rest is described"** — Jon said this 2026-08-30 and never described them. The brief's keyboard handler is specified table-driven to absorb them.
- **Does the piece end?** Infinite = screensaver; finite = piece. Unresolved.
- **Name.** *Primordial Jam* currently preferred over *Playing God*. Not decided; alias recorded.
- **Is there a granularity at which combining two engaging sounds gives a third?** Jon's question, flagged by him as not-a-speed-bump. Working answer: combination works only at boundaries where the parts are not contextually co-adapted — song stems fail because they share key, tempo and arrangement with their siblings. Here the separable unit is a wave plus its modulation subgraph, which is why crossover is wave-intact, slot-preserving and distance-restricted. The question converges with the wave-intact-inheritance question.

- **v2 direction opened (2026-08-31, during the first Gate 1a audition):** ratio-jump mutation for pitch and timing (simple fractions, regular and top-heavy), copy-at-ratio inheritance of whole pitch/timing blocks between waves, and a period + duty-cycle reparameterisation of wave timing. Jon's physics argument: pitch and rhythm are periods at different timescales, and multiplying a period by a simple fraction is the short move; the cents/log encodings make it a constant addition in stored space, so the feared representation work dissolves. Full proposals with invariant analysis in `code/playing-god/docs/V2-PROPOSALS.md`. Proposals, not decisions; any kernel change re-runs Gates 2a/2b.

## Watch items

- Full interview on vastness-is-the-point — currently built from a single forceful statement.
- **Amend default-to-affordance** with *search cost* as a fifth consideration. This project is that belief applied to a genome, and its first guardrail (*cheap*) reads as computational cost only. Every affordance here is computationally free and adds a dimension a listener must search at seconds per evaluation. Watch item added to the belief file 2026-08-30.
- sound-sandbox-visualisers holds 15 built browser visualisers on a symbolic non-FFT contract. The two-channel genome+samples visualiser here is a different animal; flagged so any port is a decision rather than drift.
- Complexity as a third archive axis — documented alternative, rejected only on cell-fill cost. Revisit if the archive is expanded.
