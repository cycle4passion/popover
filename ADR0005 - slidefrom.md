# slidefrom: a side-aware slide that scales from the anchor edge instead of clipping

`slidefrom` is the side-aware replacement for Svelte's built-in `slide`, used whenever a
Popover is given `slide` as its transition. Instead of animating `height`/`width` with a
`clip-path`-style reveal, it animates `scaleX`/`scaleY` from a transform-origin pinned to the
**anchor side**. This ADR explains why the scale approach is used rather than a clip, and how
the direction maps to axis and origin.

## Context

Svelte's `slide` reveals an element by animating its block size, which reads as a wipe. For a
popover we want the same "grows out from the anchor" feel, but two problems make the literal
approach unsuitable:

1. **Direction.** `slide` has an `axis` but no notion of *which end* it grows from relative to
   the anchor. A popover above its anchor should grow upward (origin at the bottom edge); one
   below should grow downward (origin at the top edge). The motion must originate from the
   anchor side.
2. **The arrow clips.** The Popover's arrow is a `::after` that protrudes past the box's
   border-box (see [ADR 0001](ADR0001%20-%20Arrow%20as%20CSS%20Pseudo-Element.md)). A `clip-path` reveal
   **cannot** show that ink-overflow: Chrome clamps the effective paint boundary to the
   border-box edge (`y = 0`) regardless of negative polygon coordinates, so the arrow tip would
   flash in abruptly at the end instead of emerging smoothly.

## Decision

`slidefrom(direction, delay?, duration?, easing?, tick?)` returns a transition whose `css(t)`
is simply:

```
transform: <scaleFn>(t); transform-origin: <origin>;
```

where the axis and origin come from a fixed table keyed by direction:

| direction | scaleFn  | transform-origin |
|-----------|----------|------------------|
| `bottom`  | `scaleY` | `top center`     |
| `top`     | `scaleY` | `bottom center`  |
| `right`   | `scaleX` | `center left`    |
| `left`    | `scaleX` | `center right`   |

The origin is always the edge **touching the anchor**, so the box (and its `::after` arrow,
which scales with it) appears to grow out of the anchor edge. Scaling the box scales the arrow
along with it, so the tip rises smoothly from the edge — no clip boundary, no flash. Defaults:
`duration = 400`, `easing = cubicOut`.

`direction` here is the popover's **effective (rendered) side**, supplied by
`normalizeTransition` (see [ADR 0002](ADR0002%20-%20Popover%20Component.md)). `slide`'s own `axis` param is
intentionally discarded — the axis is fully determined by the side, so honoring `axis` would let
a caller produce a slide perpendicular to the anchor, which is never what's wanted here.

## Considered options

- **Native `slide` (animate height/width).** Rejected: no anchor-side direction, and reflows on
  every frame. Scaling is compositor-friendly and origin-aware.
- **`clip-path` inset reveal.** Rejected: cannot reveal the `::after` arrow's ink-overflow
  (Chrome clamps paint to the border-box), so the arrow flashes in. This is the specific bug the
  comment at the top of the file records.
- **Honoring `slide`'s `axis` param.** Rejected: the axis is implied by the side; respecting an
  arbitrary axis would decouple the motion from the anchor.

## Consequences

- **The box visibly scales, not wipes.** Content inside scales with it during the transition,
  which is the intended popover feel but differs from `slide`'s constant-size wipe.
- **`axis` is ignored** when `slide` is passed to a Popover — the side wins. This is part of the
  documented side-aware upgrade and can surprise someone expecting literal Svelte `slide`.
- **The arrow animates correctly for free**, because it is a child-scaling `::after` rather than a
  separately-positioned element.
