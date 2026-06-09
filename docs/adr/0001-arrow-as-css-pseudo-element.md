# Arrow as CSS `::after` on the Popover Box

The arrow is rendered as a CSS `::after` pseudo-element on the **Popover Box** (the inner styled wrapper inside the Popover), not as a separate SVG component. Properties that should match the Popover Box — `background-color`, `border-color`, `border-width`, and `filter` — are mirrored via the CSS `inherit` keyword, with no JavaScript class parsing or computed-style reading.

## Considered options

- **SVG arrow with Tailwind class parser (previous implementation).** Worked, but required ~70 lines of regex to parse Tailwind class syntax (arbitrary values, `dark:` variants, opacity slashes), a MutationObserver for dark mode, and was tied to Tailwind's class shape. Did not work for vanilla CSS / inline styles / non-Tailwind users.
- **SVG arrow + `getComputedStyle` reader.** Equivalent to `inherit` for the properties we care about but more code, more reactivity surface, no benefit.
- **Rotated div arrow.** Same shape problems as `::after` plus extra DOM and no real advantage.
- **`clip-path` triangle (single or stacked).** Stacked layers give ring support but add DOM; single layer loses border on slope edges.
- **`feMorphology` SVG filter.** Most powerful but a custom-filter maintenance burden for marginal gain.

## Consequences

- **Ring support is dropped.** `::after` is a single element and can't carry an outer outline layer that follows the triangle silhouette. A user wanting a ring would need a renderer that draws stacked outlines (the rejected stacked-`clip-path` route).
- **Drop shadow inheritance requires `filter: drop-shadow` on the Popover Box, not `box-shadow`.** Tailwind users should use `drop-shadow-*` classes (or set a `--popover-shadow` var) if they want the arrow to be part of the shadow silhouette. With `box-shadow`/`shadow-*`, the shadow stops at the Popover Box's border-box and the arrow protrudes unshadowed. This is a documented API rule, not a parser.
- **The `class` prop semantic shifts.** It now styles the Popover Box (visible wrapper), not the outer positioning element. Visual styling (bg, border, drop-shadow, rounded) goes on the Popover Box.
- **No JavaScript runs to mirror styles.** Dark mode, media queries, animated values, and any non-Tailwind CSS source all work automatically because `inherit` resolves through the cascade.
