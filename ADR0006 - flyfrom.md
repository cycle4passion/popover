# flyfrom: a side-aware fly that originates from the anchor

`flyfrom` is the side-aware replacement for Svelte's built-in `fly`, used whenever a Popover
is given `fly` as its transition and as half of the Popover default. It wraps Svelte's `fly`
but fixes the offset direction so the box always flies *out from the anchor* toward its final
position, regardless of which side it renders on. This ADR records the direction-vector mapping
and why it delegates to `fly` rather than reimplementing it.

## Context

Svelte's `fly` takes raw `x`/`y` offsets. A popover's correct fly direction depends on the side
it renders on: a popover above its anchor should fly **up** into place (start offset below, i.e.
`+y`); one below should fly **down** (start offset above, `-y`); left/right analogously on `x`.
Asking callers to compute the right signed offset per side — and to recompute it whenever the
browser flips the popover — is exactly the friction the side-aware variants exist to remove.

## Decision

`flyfrom(direction, by?, delay?, duration?, easing?, tick?)` maps the rendered side to a unit
**direction vector** that points the start offset *back toward the anchor*, so the box animates
from the anchor outward:

| direction | vector (x, y) |
|-----------|---------------|
| `top`     | `(0, +1)`     |
| `bottom`  | `(0, −1)`     |
| `left`    | `(+1, 0)`     |
| `right`   | `(−1, 0)`     |

It then delegates to Svelte's `fly` with `x: dx * by`, `y: dy * by` and the supplied
timing/easing, spreading `fly`'s returned config and attaching the caller's `tick`. Defaults:
`by = 16`, `duration = 200`, `easing = cubicOut`.

Delegating to `fly` rather than reimplementing it means we inherit Svelte's exact fade+translate
math and any future fixes — `flyfrom` only owns the *direction decision*. The `direction` is the
popover's **effective (rendered) side**, supplied by `normalizeTransition` (see
[ADR 0002](ADR0002%20-%20Popover%20Component.md)), so the fly tracks CSS anchor-position flips.

When `fly` is passed to a Popover, `normalizeTransition` collapses the caller's `x`/`y` into a
single magnitude (`|x|` or `|y|`, default 16) applied along the side vector — the *distance* is
honored, the *direction* is taken over by the side.

## Considered options

- **Native `fly` with caller-supplied x/y.** Rejected: the caller would have to know the rendered
  side (which the browser may flip) and sign the offset accordingly. The whole point is to make
  fly side-aware automatically.
- **Reimplementing fly's translate+fade.** Rejected: pointless duplication; delegating to `fly`
  keeps one source of truth for the actual motion and fade.
- **Keeping separate x and y inputs.** Rejected for the Popover path: a single side has a single
  natural direction, so x/y collapse to one magnitude along the side vector.

## Consequences

- **Direction is owned by the side, magnitude by the caller.** Passing `fly` with `{ x: 40 }`
  flies 40px along the anchor axis; the sign and axis are ignored in favor of the rendered side.
- **It composes with other transitions** (notably `scale` in the Popover default) via
  [`composeTransitions`](ADR0004%20-%20composeTransitions.md); the default suppresses `scale`'s opacity so
  `flyfrom` owns the single fade.
- **Behavior tracks flips for free**, because the bound `direction` is the reactive
  `effectiveSide` — a browser flip re-derives the transition with the new side.
