# Popover

A Svelte 5 popover component built on the native popover API and CSS Anchor Positioning, with an optional directional arrow.

## Language

**Popover**:
The floating element that opens above/beside an **Anchor**. Rendered with `popover="manual"` and positioned via CSS Anchor Positioning.
_Avoid_: tooltip, dropdown, menu

**Anchor**:
The element the **Popover** attaches to. Defaults to the **Popover**'s previous DOM sibling, or specified by `anchorEl` id.
_Avoid_: trigger, target, reference

**Trigger**:
The user interaction that opens the **Popover**. Either `'click'` or `'hover'`. The **Anchor** is what the trigger interacts with.
_Avoid_: event, action

**Arrow**:
The directional indicator extending from the **Popover** toward the **Anchor**. Rendered as a CSS `::after` pseudo-element on the **Popover Box** so it inherits visual styling via CSS.

**Placement**:
The user's declared position of the **Popover** relative to the **Anchor**. One of `top`, `bottom`, `left`, `right`, optionally suffixed with `-start` or `-end` for alignment along the edge.

**Side**:
One of `top`, `bottom`, `left`, `right`. The face of the **Anchor** the **Popover** sits against.

**Main Axis**:
For a given **Side**, the axis perpendicular to the **Anchor** edge — the direction the **Popover** extends away from the **Anchor**. Top/Bottom → vertical (height); Left/Right → horizontal (width).

**Cross Axis**:
The axis parallel to the **Anchor** edge. Top/Bottom → horizontal (width); Left/Right → vertical (height).

**Match Size**:
A **Sizing Mode** (`sizing: 'match'`) for dropdown/select-style **Popovers**: the **Popover** matches the **Anchor**'s **Cross Axis** size exactly, and is clamped on the **Main Axis** to the space between the **Anchor** and the viewport edge (less `viewportMargin`).

**Expand**:
A **Sizing Mode** (`sizing: 'expand'`) that, instead of matching the **Anchor**, fills the **Cross Axis** from the **Anchor**'s near edge to the far viewport edge (less `viewportMargin`); the **Main Axis** is clamped exactly as **Match Size**. The fill is anchored to the trigger and grows toward the far edge (not symmetric across the viewport): `-start`/centered grow toward the end edge, `-end` grows toward the start edge.

**Sizing Mode**:
A mode that constrains the **Popover** to available space — either **Match Size** or **Expand**. Setting one pins the **Side** (see Relationships).

**Declared Side**:
The **Side** the user requested via `placement`. Authoritative until measurement.

**Effective Side**:
The **Side** the **Popover** actually renders on after the browser may have flipped it (via `position-try-fallbacks`) to fit available space. Measured each frame while open.

**Popover Box**:
The visible, styled wrapper inside the **Popover**. Carries the user's `class` (bg, border, drop-shadow) and the `::after` **Arrow**. Distinct from the outer positioning element, which is invisible.

**Group**:
A named set of **Popovers** that open and close together. Anchors and members share a `data-popover-group="{name}"` attribute.

## Relationships

- A **Popover** has exactly one **Anchor**.
- A **Popover** may render exactly one **Arrow**.
- An **Arrow** points from its **Popover** toward the **Anchor**, on the **Effective Side**.
- A **Popover** may belong to zero or one **Group**.
- A **Sizing Mode** (**Match Size** or **Expand**) requires a fixed **Side**: setting one pins the **Effective Side** to the **Declared Side**, since fitting the **Popover** to available space is incompatible with autoplacement flipping (which only triggers on overflow).
- Under either **Sizing Mode** the **Popover** constrains its own size only; scrolling overflowing content is the consumer's responsibility (the consumer sets `overflow` on their content).

## Flagged ambiguities

- "trigger" historically meant both the **Anchor** element and the interaction style — resolved: **Anchor** is the element, **Trigger** is the interaction (`triggerBy` prop name).
- "arrow" used to refer to a separate `Arrow.svelte` SVG component — resolved: the **Arrow** is a CSS pseudo-element on the **Popover Box**; there is no separate component.
