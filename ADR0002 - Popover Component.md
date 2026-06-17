# Popover: single persistent box, CSS Anchor Positioning, and manual WAAPI transitions

The `Popover` component positions a floating box relative to an anchor element using the
native **CSS Anchor Positioning API** and the native **Popover API** (`popover="manual"`),
while driving open/close motion through **manually-played Web Animations (WAAPI)** rather
than Svelte `transition:` directives. It owns a side-aware arrow, four sizing modes,
group coordination, hover/click triggering, focus management, and flip handling. This ADR
documents why the implementation looks the way it does — most of its apparent complexity
exists to defeat a single class of bug: **sub-pixel lag between the main thread and the
compositor during scrolling**, plus the ordering hazards of measuring a box that the
browser may re-place underneath us.

## Context

A popover must:

1. Stay glued to its anchor as the page scrolls or resizes.
2. Flip to the opposite side when it would overflow the viewport.
3. Animate in (and optionally out) **from the side it actually renders on**, not the side
   that was requested — these differ whenever the browser flips it.
4. Draw an arrow that points at the anchor and tracks the rendered side.
5. Not re-create its children mid-open (which would reset form state, scroll position, etc).

The naive implementations of each of these fight each other. CSS Anchor Positioning solves
(1) and (2) for free — the browser keeps the box attached and runs `position-try-fallbacks`
to flip on overflow — but it does so on the **compositor**, so JS measurements of where the
box ended up lag by a frame or more during a scroll burst. Svelte's `transition:` directive
solves animation but re-evaluates the side at the wrong moment and re-mounts the node, which
conflicts with (5) and with reading the rendered side for (3) and (4).

## Decision

### Positioning is CSS, not JS

Placement is expressed entirely through `position-area` / `inset-area` rules
(`.placement-*` classes) plus anchor-relative margins. Both the Chrome 125–128 spelling
(`inset-area`, `position-try-options`) and the Chrome 129+ spelling (`position-area`,
`position-try-fallbacks`) are emitted so the rules work across versions. The popover is a
real `popover="manual"` element, placed in the top layer by `showPopover()`, so it escapes
ancestor `overflow: clip` and stacking contexts.

We **do not** compute `top`/`left` in JS. JS only *reads* the rendered geometry to decide
two discrete things — which side the box landed on, and where to put the arrow — and to drive
the size-mode flip. This keeps positioning on the fast path and means scroll never requires a
JS write to stay attached.

### A single persistent box, hidden until measured

There is exactly one inner `[data-popover-box]` per open. It mounts (`present = true`) but is
held invisible via `visibility:hidden` on the root (`present && !measured`) until the side has
been measured from the real rendered rect. Only then is it revealed and animated. Two reasons:

- **Children render exactly once per open.** Re-mounting on flip or on transition would reset
  any stateful content (focus, inputs, scroll). The box is therefore created once and never
  swapped.
- **The intro must start from the correct side.** If we revealed and animated before measuring,
  the first frame of the intro would play from `declaredSide`, then jump to the flipped side —
  a visible one-frame glitch. `measured` gates this: the synchronous first measurement in the
  attach effect runs `measureFlip()` / `measureSide()` / `positionArrow()`, sets `measured`,
  and only then fires the intro (`introPlayed` guard ensures exactly once).

### Transitions are played manually with WAAPI, not via `transition:`

`play()` in [popover.ts](src/lib/components/Popover/popover.ts) samples the transition's
`css(t, u)` output at 30 steps into a `Keyframe[]` and runs it with `node.animate()`. We use
this instead of a Svelte `transition:` directive because:

- Svelte transitions are tied to **mount/unmount**. We deliberately keep the box mounted across
  measure→reveal and across a fast close→reopen, so there is no mount event to hang a directive on
  at the moment we actually want to animate.
- We need to **start the intro after an async measurement step**, from JS, at a time of our
  choosing — not when Svelte happens to insert the node.
- We need **interruptibility**: reopening during an outro must cancel the outro and play an intro
  on the same live node (`playState.currentAnim?.cancel()`), which a directive can't express
  cleanly.

The transition config itself still comes from the same `normalizeTransition()` pipeline a
`transition:` directive would use — see [ADR 0004](ADR0004%20-%20composeTransitions.md). `play()` reads
`cfg.css`, `cfg.easing`, `cfg.duration`, `cfg.delay`; samples the eased curve into keyframes;
runs them `linear` (easing already baked into the samples) with `direction: reverse` for the
outro and `fill: both` so the end state sticks. If a transition has no `css` (tick-only), we skip
animating and call `onDone` immediately.

The lifecycle `$effect` ties it together: opening sets `present`; if reopening mid-outro it plays
an `in`; closing either plays the outro (only when `transitionOut && measured`) then `closeNow()`,
or closes immediately. `closeNow()` cancels any in-flight animation, resets `measured` /
`introPlayed`, and calls `hidePopover()`.

### Why `normalizeTransition` swaps `slide`/`fly` for side-aware variants

The single most important integration point: the Popover's default and its handling of the
common `slide`/`fly` transitions are **side-aware**. A popover that renders above its anchor
should fly *up* into place; one that renders below should fly *down*. Svelte's stock `fly`/`slide`
have no concept of "the anchor side," so `normalizeTransition(input, effectiveSide)` rewrites them:

- A bare `fly` or `slide` (matched by reference *or* by `fn.toString()`, so duplicated module
  instances across HMR still match) is replaced with [`flyfrom`](ADR0006%20-%20flyfrom.md) /
  [`slidefrom`](ADR0005%20-%20slidefrom.md) bound to the **effective** (rendered) side. `fly`'s `x`/`y`
  collapse to a single distance along the side vector; `slide`'s `axis` is ignored (derived from
  the side).
- Array inputs are flattened to `[fn, params]` tuples, each upgraded, then handed to
  [`composeTransitions`](ADR0004%20-%20composeTransitions.md) to run in parallel.
- The default (no `transition` prop) is `flyfrom(side, 16, 0, 250)` composed with `scale`
  (`start: 0.75, opacity: 1`) — fly owns the fade; scale's `opacity: 1` prevents two fades from
  multiplying into near-transparency through the front-loaded `cubicOut` motion.

Crucially `side` is `effectiveSide`, a `$derived` value, so the transition is recomputed whenever
the rendered side changes — the motion always tracks reality, including after a flip.

## The scroll/resize loop — why rAF, and why it does so little

`onScrollResize` is a `requestAnimationFrame`-throttled handler bound to `scroll` (capture +
passive, so any ancestor scroll container is caught) and `resize`. It is **not** a per-frame
animation loop — it coalesces a scroll burst into one rAF and then idles. An idle popover does
zero work.

The hard-won detail is **what it recomputes and what it doesn't**:

- It calls `measureFlip()` (size-mode flip decision) and `measureSide()` (which rendered side are
  we on) every coalesced frame, because the anchor can move relative to the viewport on scroll.
- It calls `positionArrow()` **only when `measureSide()` reports the side actually changed.**

That last point is the crux. The arrow's offset (`--arrow-x` / `--arrow-y`) is the anchor center
projected onto the box edge. Because the box is rigidly anchored to the anchor by CSS, that offset
is **invariant under scroll** — the anchor and box move together. An earlier implementation
recomputed it every frame, which made the arrow *jitter*: during a scroll burst the box's
main-thread `getBoundingClientRect()` lags its compositor-painted position, so the measured
anchor−box delta oscillates by a pixel or two each frame even though nothing visually moved.
Reading discrete state (the side) is immune to that lag; reading a continuous pixel delta is not.
So we recompute the continuous value only on the discrete event (a real flip) that can actually
change it.

`measureSide()` carries the same defensive logic: it defaults to the **last** measured side, not
the declared side, so that on the odd lagged frame where the box appears to overlap the anchor and
none of the clean `p.bottom <= a.top` / `p.top >= a.bottom` / … tests match, the arrow holds its
settled side instead of snapping back to the declared one.

A `ResizeObserver` on both anchor and box covers the cases scroll/resize don't: `match`-size
content changes, sizing-mode fit re-checks, dynamic content. It runs the full
`measureFlip` / `measureSide` / `positionArrow` triple because a size change *can* legitimately
move the arrow offset.

## Sizing modes and the JS flip (MIN_SIZE)

`sizing` is `'none' | 'match' | 'expand' | '<n>%'`.

- `none` (default) — natural content size; the browser owns flipping via `position-try-fallbacks`
  on `.anchorPositioned`. The rendered side is therefore **unknown to us until measured**, which is
  why `effectiveSide` falls back to `measuredSide` here.
- `match` / `expand` — the box is **pinned** (the flip fallbacks are withheld in the class list)
  and sized purely in CSS via `stretch` / `anchor-size` against the position-area region. Because
  the browser no longer flips, *we* own the flip in JS (`sizeFlip` → `effectivePlacement`), and the
  rendered side is exactly `effectivePlacement`'s side — derived directly so the box position and
  the arrow side update in the *same* reactive flush (no transient wrong-side arrow on flip).
- `<n>%` — an inline `max-width/height: n vw/vh` cap, behaving like `none` otherwise. The
  percentage path deliberately emits *nothing* for `match`/`expand` because an inline cap would
  override the CSS `stretch` clamp and let the box overshoot the anchor→edge gap.

`MIN_SIZE = 144` is the flip hysteresis for the sizing modes. We flip the main-axis side only when
the declared side is *cramped* (`< 144px` of usable gap) **and** the opposite side is roomier
**and** the content doesn't already fit. The threshold earns its keep three ways, all forms of
flicker/churn damping: it keeps us on the requested side until truly tight, prevents "biggest side
wins" oscillation, and buffers near-equal gaps so sub-pixel scroll changes can't toggle the flip.
The `expand` mode additionally rewrites `position-area` to a `span-*` region so a centered placement
fills *from the anchor* toward the far edge rather than detaching to the far viewport edge — that
was the failure mode of naive alignment-`stretch`, documented inline in the stylesheet.

## Other implementation notes

- **Arrow drop-shadow.** The popover mirrors the anchor's computed `box-shadow` into a
  `filter: drop-shadow()` list (`boxShadowToFilter`) so the arrow participates in the shadow
  silhouette — see [ADR 0001](ADR0001%20-%20Arrow%20as%20CSS%20Pseudo-Element.md) for why the arrow is a `::after`
  and why `box-shadow` alone wouldn't shadow it.
- **Group coordination.** `data-popover-group` / `data-popover-anchor-group` let members open and
  close together; `syncPopoverOpenState()` and the `pointerdown` outside-close handler both special
  case group members so clicking a sibling doesn't close the group.
- **Focus.** Only click-triggered popovers pull focus (into the first enabled input); moving focus
  on a hover tooltip would be disruptive.
- **Hover timing.** A 100 ms close timer bridges the gap between leaving the anchor and entering the
  box (and vice versa) so the popover doesn't flicker shut while the pointer crosses the offset.

## Considered options

- **JS positioning (Floating UI / Popper-style).** Rejected: requires a per-frame JS write to keep
  the box attached during scroll, which is exactly the main-thread/compositor lag source we are
  trying to avoid. CSS Anchor Positioning keeps attachment on the compositor for free.
- **Svelte `transition:` directives.** Rejected for the box motion because they bind to
  mount/unmount and can't be started post-measurement, interrupted on reopen, or run on a
  deliberately-persistent node. We keep the *config* format compatible and play it ourselves.
- **Re-mounting the box on flip.** Rejected: resets stateful children and causes the
  start-from-wrong-side intro glitch.
- **Per-frame arrow repositioning.** Rejected: jitters under scroll due to rect lag; the offset is
  scroll-invariant, so we only recompute it on a real side flip.

## Consequences

- **Chrome-family only, recent versions.** CSS Anchor Positioning is required; the dual
  `inset-area`/`position-area` spellings cover 125+ but there is no fallback for non-supporting
  browsers.
- **Two flip authorities.** `sizing: none` lets the browser flip and we *measure* the result;
  `match`/`expand` make *us* flip and the browser pins. The `effectiveSide` derivation branches on
  this, which is necessary but is the subtlest part of the component to reason about.
- **The transition contract is "give me a Svelte transition config."** Anything expressible as
  `css(t,u)` works and is sampled into WAAPI; tick-only transitions are effectively no-ops for the
  box animation (they short-circuit in `play()`).
- **`slide`/`fly` are intercepted.** Passing stock `slide`/`fly` does **not** give stock behavior —
  it gives the side-aware variant. This is intentional and documented on the `transition` prop, but
  it is a surprise if you expected Svelte's literal `fly`.
