# Tooltip: a thin, opinionated wrapper over Popover

`Tooltip` is a small presentational component that configures `Popover` with
tooltip-appropriate defaults and a single text slot. It owns almost no logic of its own;
its entire job is to pick sensible defaults and forward everything else to `Popover`. This
ADR records what those defaults are, why the wrapper exists at all, and the one piece of
prop plumbing that is easy to get wrong.

## Context

`Popover` is general-purpose: it defaults to click-to-open, no arrow, natural sizing, and a
visible box you style yourself. A *tooltip* is a narrower idea — it appears on hover, points
at its trigger with an arrow, sits above the trigger by default, and carries a short string.
Rather than make consumers re-specify those five or six props every time, `Tooltip` bakes
them in.

## Decision

`Tooltip` re-exports `Popover`'s public types (`Placement`, `ArrowSize`, `TriggerBy`,
`TransitionFn`) and a `Props` shape that mirrors `Popover`'s, then sets tooltip defaults in
the `$props()` destructure:

- `triggerBy = 'hover'` — tooltips appear on hover, not click.
- `placement = 'top'` — the conventional tooltip position.
- `arrow = true` — tooltips point at their trigger; `true` resolves to the `'md'` arrow.
- `autoPlacement = true` — flip to stay on-screen.
- `sizing = '30%'` — cap the tooltip at 30% of the viewport so long text wraps rather than
  spanning the screen.
- `group = ''` — no group by default.
- A default `class` of `px-4 py-2 text-white bg-black border-2 border-red-500 rounded-full`
  styling the **box** (and therefore the inherited arrow — see
  [ADR 0001](ADR0001%20-%20Arrow%20as%20CSS%20Pseudo-Element.md)).

The trigger is rendered via `{@render children?.()}` immediately before the `<Popover>`, so
the child element is the popover's previous sibling — which is exactly what `Popover`'s
`attachAnchor` uses as the default anchor when no `anchorEl` is given. The tooltip text is
passed as the Popover's default slot content (`{text}`).

### The `class` vs `classes` merge

The wrapper exposes both a single `class` (the box styling, defaulted above) and the
pass-through `classes: { root?, box? }`. It merges them as
`classes={{ box: classname, ...classes }}` so that an explicit `classes.box` overrides the
convenience `class`, while a `classes.root` still flows through. This gives a simple
"just give me a class" path without losing access to the root element.

### Forwarding: the `sizing` plumbing footgun

Everything not explicitly destructured is forwarded with `{...rest}`. But any prop that *is*
destructured for its default (e.g. `sizing`, `arrow`, `placement`) is **removed** from `rest`
and must be forwarded by name. The original code destructured `sizing` (to default it to
`'30%'`) but then tried to forward `{size}` — a variable that does not exist — which is a
compile-time error in Svelte (`No value exists in scope for the shorthand property 'size'`).
The fix is to forward the real variable, `{sizing}`.

The lesson is general: **in this wrapper pattern, a prop you destructure must be re-forwarded
by its exact name**, because pulling it out of `rest` is precisely what lets you default it —
and that same act drops it from the spread.

## Considered options

- **No wrapper; document the defaults.** Rejected: every tooltip usage would repeat six props,
  and the hover/arrow/30%-cap combination is the entire value of the abstraction.
- **A fully independent tooltip implementation.** Rejected: it would duplicate all of
  `Popover`'s anchor positioning, flip, arrow, and transition machinery (see
  [ADR 0002](ADR0002%20-%20Popover%20Component.md)). The wrapper reuses every bit of it.

## Consequences

- **Tooltip inherits all of Popover's behavior and constraints**, including the side-aware
  transition interception and the Chrome-family requirement.
- **The default red-bordered black pill is a deliberate, opinionated style** meant to be
  overridden via `class` or `classes.box`; it is not a neutral baseline.
- **Adding a new defaulted prop requires forwarding it by name.** This is the recurring trap
  the `sizing`/`size` bug exposed; new defaults must be wired into the `<Popover>` tag, not
  left to `{...rest}`.
