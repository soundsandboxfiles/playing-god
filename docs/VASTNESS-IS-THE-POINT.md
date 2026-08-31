# Vastness is the point — the governing value

The belief every design decision on this project checks against. Curated
export of the owner's notes; quotes are verbatim.

---
# Vastness is the point

## Summary

When building a generative system whose purpose is discovery, the size of the search space is an **asset, not a cost**. Constraining a generator so that it cannot produce bad output also prevents it from producing the thing you could not have specified in advance — which, in a discovery system, is the entire point. Stated forcefully by Jon 2026-08-30 in response to a suggestion that Playing God needed an encoding that could not produce a wrong note.

## Jon's statement, verbatim

> "Ew, no, this 'right note only' thinking is the antithesis of this project. This is the opposite of Sound Sandbox with hand tuned parameters, programmed synths etc. This project has humility, it says I do not know what the right answer is, I am searching for something I did not know and could not have told you I wanted to hear. Vastness of phase space is the point."

## Key facts

- The belief is framed around **humility about the target**: the designer does not know the answer and could not have specified it. Any constraint that encodes the designer's taste has smuggled a specification back in.
- **The operative design rule:** priors shape the sampling distribution; they never truncate the space. A prior is legitimate if it makes a region *unlikely*; it is a defect if it makes a region *unreachable*.
- Declared ranges are not priors — they define the space. Bias belongs in sampling, not in what exists.
- The rule is checkable, which is why it works as an engineering invariant rather than a mood: for each design decision, ask whether it removes reachability or only probability.
- **The consequence Jon accepts:** most output will be bad. That is the price of the space containing something he could not have asked for.
- Corollary developed with the Playing God spec: vastness and tractability are reconciled by separating **declared** space from **expressed** space. A genome can declare an enormous space while expressing a tiny fraction of it, with the unexpressed remainder mutating at zero fitness cost. Complexity is then unmuted by selection rather than granted by the designer — which honours the humility without paying the search cost up front.

## The failure mode this belief exists to catch

Named 2026-08-30 after it occurred three times in one project. It takes **two distinct forms**, and both passed review in playing-god as reasonable-sounding engineering.

**Form A — a prediction about what will score well, written into neutral machinery.** The subtler form, and the one that does not look like a constraint at all:

1. A behaviour-space axis justified as "the descriptor most aligned with what dwell time measures" — i.e. a claim that sounds which change over time will win.
2. A diagnostic declaring a particular shape of engagement distribution the signature of a healthy population — i.e. a claim about what success looks like.

**Form B — a truncation of what can be reached.** The literal reading of the belief, and still easy to miss when it appears as an engineering convenience:

3. Recombination gated on a hard similarity threshold with a fallback when nothing qualified, making every more-distant pairing *unreachable* rather than merely unlikely. Caught when Jon stated the requirement directly: *"I think I'd like close relatives to be more likely to combine but for all creatures to always be candidates with non zero probabilities"* — this belief applied to pairings rather than to genes.

None of it was known. Jon caught all three, and restated the principle with emphasis: *"we do not know what will score high. We can only discover that by maximising phase space and exploring it."*

**Both checks are needed, and they catch different things.** *Does this claim to know what will score well?* and *does this make anything unreachable rather than merely unlikely?* The second is the belief as stated; the first is the one that keeps slipping through.

**Operative distinction, which is the usable form of this belief:** *priors may be biased; instruments may not.* A prior is an admitted, deliberate bias about where to look first, and is unavoidable — sampling has to come from some distribution. The instruments — the fitness function, the descriptors, the archive geometry, the control loops, the diagnostics — measure and organise, and must carry no assumption about what will score. An instrument that encodes a prediction will find that prediction, and the system will have confirmed the designer's taste while appearing to discover something.

Check for any design decision: *does this claim to know what will score well?* If yes, either the decision needs a different reason or the decision is wrong.

## Sharpening: reachable means actually reachable — and its scope

Added 2026-08-30, then immediately corrected by Jon, which is why the scoping half matters more than the sharpening half.

**The sharpening.** Jon, on the partner-selection kernel: *"rare but genuinely reachable (so vanishingly rare doesn't qualify) is important in this case."* Non-zero probability is necessary but not sufficient. A design leaving an option formally reachable at one chance in 10⁷ has satisfied the letter of the belief and defeated its purpose, because the event will not occur within any realistic budget.

**The correction, and it is essential.** Jon: *"in a phase space this big any given creature is in itself vanishingly rare so we cannot apply the no vanishingly rare outcomes invariant to things like this."* Exactly right. Every particular genome in a large space is astronomically improbable — that is what a large space *is* — so applying the test at the level of individual outcomes would condemn the whole project on its first line.

**Scoping rule.** The test governs **operators, mechanisms and regions**. It never governs **points**.

| Level | In scope | Example |
|---|---|---|
| Operator / mechanism — a *kind of move* the system can make | yes | crossing with a genome at twice the median distance; unmuting a wave; a three-partner recombination |
| Region — a coarse structural or behavioural class | yes | genomes with 20+ active waves; genomes containing feedback loops; a behaviour-space cell |
| Point — one specific outcome | **no** | any particular 6,102-parameter Creature |

**Operational form.** Take the rate, multiply by the number of attempts the system will make over its lifetime, ask whether the expected count is at least of order 1. The question is *"would this system, run to its budget, ever do this at all?"* — never *"would this system ever produce this exact thing?"*, which is the wrong question with a known answer.

Worked instance: on playing-god this moved the partner kernel's selectivity from 0.18 to 0.25, turning a distant pairing from "260× less likely" (perhaps once across the whole project) into "55× less likely" (tens of times). The mechanism is in scope; the particular pairing it produces is not.

## The contrast with Sound Sandbox

Jon named Sound Sandbox as the deliberate opposite, and the two projects should be read as a matched pair.

| | Sound Sandbox | Playing God |
|---|---|---|
| Target | known — musical, immediate, predictable response | unknown by design |
| Method | hand-tuned parameters, authored Instruments and Scores, programmed synths | evolved genomes, no authored content |
| Wrong notes | designed out by construction — the point is that every interaction is guaranteed musical | reachable, expected, and necessary |
| Designer's taste | encoded throughout, deliberately | excluded as far as possible |
| Failure mode | boring, over-constrained | mostly noise |

Neither is the correct approach in general. The distinction is what the project is *for*: Sound Sandbox serves a student who needs their action to land well every time; Playing God serves a search.

Worth noting the tension this creates with default-to-affordance, which is about tools *creative people* use, and with the constraint-based instinct in design-out-the-wrong-move — that belief says the right structure makes wrong moves unavailable, which is precisely what this belief refuses in a discovery context. The two cohere only if "the wrong move" is understood as a property of the *use case*, not of the domain.

## Applications

- playing-god — invariant 1 of the design brief, and the stated reason for rejecting CPPN indirect encoding for v1 (indirect encodings buy compression by making some patterns cheap and therefore others expensive, which is a designed aesthetic bias).
- Likely transfers to any future generative or discovery-shaped tool.
