# portal: a relocating attachment with original-parent restoration

`portal` is a Svelte **attachment** that moves its host element out of its current DOM
position into a target container (defaulting to a `.PortalTarget` or `<body>`), and moves it
back when disabled or torn down. It is applied to the Popover root via `{@attach attachPortal(portal)}`.
This ADR records why it is an attachment rather than an action, how it survives re-runs
without losing the original location, and the enable/disable toggle semantics.

## Context

Even though the Popover lives in the top layer when open, some consumers still need the
element to be physically re-parented — e.g. to escape a transformed ancestor (which breaks
`position: fixed`/anchor containing blocks), to land inside a specific portal root, or to sit
under `<body>` for stacking reasons. A portal must:

1. Remember where the element came from so it can be restored.
2. Re-run when its options change (Svelte attachments re-run reactively) **without** forgetting
   the original parent — by the time a re-run executes, the previous run's cleanup has already
   detached the node, so `node.parentElement` is no longer the truth.
3. Support being toggled off (`enabled: false`) at runtime, returning the node home.

## Decision

`portal(options?)` returns an `Attachment<HTMLElement>`. Attachments (not actions) are used
because they integrate with Svelte 5 reactivity — the function re-runs when the reactive
`options` it reads change, and its returned teardown runs before each re-run — which is exactly
the lifecycle a movable portal needs.

### Original location is cached in a module-level WeakMap

On first run for a node, the **original parent** and a **fallback target** (the nearest
`.PortalTarget` ancestor, else the first `.PortalTarget` in the document) are recorded in a
module-scoped `WeakMap` keyed by the node. This is the crux of the re-run correctness:

- The cleanup of run *N* detaches the node (moves it back or removes it) **before** run *N+1*
  executes. If we re-read `node.parentElement` on each run we would capture the *portal target*
  (or `null`) as the "original" parent and could never restore it.
- Caching on first run only, in a WeakMap, pins the true origin for the node's lifetime and lets
  the entry be garbage-collected with the node (no leak, no manual cleanup needed).

### Enable/disable and target resolution

`enabled` is derived from the options: a boolean `options` *is* the enabled flag; an object uses
`options.enabled ?? true`. When disabled, if the node has been moved, it is appended back to its
`originalParent` and the attachment returns with no teardown — a clean "portal off" that restores
the original location.

When enabled, `getTarget` resolves the destination: an explicit `HTMLElement` target is used
directly; a string is treated as a `querySelector`; otherwise the cached fallback target is used,
finally falling back to `document.body`. The node is appended there, and the teardown removes it
from that target **only if it is still parented there** (guarding against a concurrent move).

## Considered options

- **A Svelte action instead of an attachment.** Rejected: attachments re-run on reactive option
  changes with proper teardown ordering, which the enable/disable-at-runtime requirement needs.
- **Reading `node.parentElement` on every run to find the origin.** Rejected: by re-run time the
  node has already been detached by the prior cleanup, so this captures the wrong parent. The
  WeakMap caches the origin from the first run only.
- **A per-instance variable for the original parent.** Rejected: the attachment closure is
  re-created per run; a module-level WeakMap keyed by node is the stable, leak-free place to
  persist it across runs.

## Consequences

- **The original parent is whatever the node had on first attach.** If the markup around the node
  changes between disable/enable, restoration goes to the *first-seen* parent, not the current
  one — correct for the intended "send it out and bring it back" use, but worth knowing.
- **`.PortalTarget` is a convention.** With no explicit target, the node lands in the nearest or
  first `.PortalTarget`, else `<body>`. Consumers wanting a specific root either add that class or
  pass `target`.
- **WeakMap keying means no manual cleanup of the cache** — entries die with their nodes.
- **Teardown is guarded.** Removal only happens if the node is still under the target, so a move
  that races with teardown won't throw or rip the node out of its new home.
