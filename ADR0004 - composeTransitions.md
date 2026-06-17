# composeTransitions: running several Svelte transitions in parallel as one directive

`composeTransitions` takes one or more Svelte transitions and returns a single transition
function that runs them all in parallel — correctly merging the CSS they emit instead of
letting the last writer of each property silently win. It is the mechanism behind the
Popover default (`flyfrom` + `scale`) and any array-form `transition` prop. This ADR
explains why a naive concatenation fails, how the per-property merge works, and how each
entry keeps its own timeline.

## Context

Svelte allows exactly **one** `transition:` directive per element. But a popover commonly
wants two effects at once — fly *and* scale, or slide *and* fade. The obvious approaches both
break:

- **Concatenating two transitions' `css` output** produces a string like
  `transform: translate(...); transform: scale(...)`. CSS resolves duplicate declarations by
  last-wins, so the translate is silently discarded — you get scale only.
- **Nesting two elements, one per transition,** adds DOM, changes layout/stacking, and still
  can't share a transform origin or compose cleanly.

A correct composition has to sample each transition independently and *merge* the declarations
property-by-property: transforms must concatenate (so `translate` and `scale` coexist),
opacities must multiply (parallel compositing of two fades), and everything else is genuinely
last-wins.

## Decision

`composeTransitions(input)` accepts three input shapes, disambiguated by `normaliseEntries`:

- a bare function — `composeTransitions(fade)`
- a `[fn, params]` tuple — `composeTransitions([slide, { axis: 'y' }])`
- an array of either — `composeTransitions([[slide, { axis: 'y' }], fade])`

The tuple-vs-array ambiguity (`[fn, params]` looks like a two-element array of entries) is
resolved by inspecting the second element: a **plain object** second element means params (the
tuple form); a function or array second element means the list form.

### Bare function short-circuit

A single bare function is **returned untouched**. This is deliberate: it preserves native
Svelte semantics, including directive params (`transition:t={{...}}`) and Svelte's own
easing/reversal handling. Only the multi-entry case needs the custom machinery, so only it pays
for it. (Note that directive params are *ignored* for tuple/array inputs — there, params live in
the tuples, configured at compose time.)

### The returned transition

For multi-entry inputs, the returned function:

1. Instantiates each entry's config once (`fn(node, params)`).
2. Captures the node's **pre-existing transform** via `getComputedStyle`. Svelte's built-in
   transforming transitions (`fly`, `scale`, …) each prefix this base transform onto their own
   output, so without deduping it the base would be repeated once per transition. `mergeCss`
   strips it from each entry and re-applies it exactly once.
3. Computes a **composed duration** = `max(delay + duration)` across entries, so the whole thing
   runs as long as the longest entry; entries that finish early hold their final state.
4. Reports `easing: linear` and applies each entry's own easing itself, via `localT`.

### Per-entry timeline mapping (`localT`)

The composed transition advances a single linear `t`. Each entry, however, has its own delay,
duration, and easing. `localT(config, t)` maps the composed `t` onto one entry's local timeline:

- Convert `t` to elapsed milliseconds along the composed duration (for the outro, `t` runs 1→0,
  so elapsed is measured as `(1 - t) * composedDuration`).
- Subtract the entry's delay, divide by its duration, clamp to `[0, 1]` — so an entry that has
  finished stays pinned at its endpoint while longer entries keep going.
- Apply the entry's easing (reversed for the outro), returning the `[t, u]` pair the entry's
  `css`/`tick` expects.

This is what lets a 150 ms fade and a 250 ms fly, each with different easing, share one
composed clock and still look right.

### The per-property merge (`mergeCss`)

For each rendered frame, every entry's `css(lt, lu)` is sampled, the strings are split into
declarations, and merged by property:

- **`transform`** — values are collected into a list, the shared base transform is stripped from
  each, and the result is emitted as `base + concatenated transforms`. So `translate(...)` from
  fly and `scale(...)` from scale compose into one transform list instead of overwriting.
- **`opacity`** — values are **multiplied**. Two transitions that each fade to 0.5 compose to
  0.25, which is the correct parallel-compositing result. (This multiply is also why the Popover
  default forces `scale`'s `opacity: 1` — two real fades would multiply to near-transparency
  through the front-loaded motion; see [ADR 0002](ADR0002%20-%20Popover%20Component.md).)
- **everything else** — last declaration wins, matching CSS's own resolution.

`tick` callbacks are not merged — they all run, each on its own `localT` timeline.

## Considered options

- **String concatenation of css.** Rejected: last-wins on duplicate properties silently drops all
  but one transform/opacity.
- **One wrapper element per transition.** Rejected: extra DOM, layout/stacking interference, no
  shared transform origin.
- **A fixed fly+scale baked into Popover.** Rejected: the component supports arbitrary
  user-supplied transition arrays, so the composition has to be general.

## Consequences

- **Transforms compose and opacities multiply automatically**, which is correct for parallel
  motion but means stacking two fades darkens faster than either alone — callers wanting one fade
  must suppress the others' opacity (the Popover default does this).
- **The base-transform dedupe depends on Svelte's built-ins prefixing `getComputedStyle`
  transform.** A custom transition that does *not* follow this convention could double-apply or
  drop the base; the contract is "behave like Svelte's transforming built-ins."
- **Directive params only work for the bare-function passthrough.** Tuple/array forms configure
  params at compose time and ignore directive params — a deliberate trade for the parallel merge.
- **Composed duration is the max, with early-finishers held.** There is no notion of sequencing;
  everything is parallel by design. Sequential chaining would need a different primitive.
