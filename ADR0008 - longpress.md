# longpress: a pointer-based long-press action

`longpress` is a Svelte action that fires an `onlongpress` callback when the user presses and
holds an element for a configurable duration. It is implemented with pointer events and a
single timer. This ADR records the small but deliberate choices: pointer (not mouse/touch)
events, the cancel-on-up/cancel semantics, and `svelte/events`-based listener registration.

## Context

A long-press gesture is "press down, hold for N ms without releasing, then fire." The
implementation must work across mouse, touch, and pen without writing three code paths, must
cancel cleanly if the user releases early or the gesture is interrupted, and must tear down its
listeners and any pending timer when the element is removed.

## Decision

`longpress(node, { duration = 500, onlongpress })` registers three listeners and arms a timer:

- **`pointerdown`** starts a `setTimeout(onlongpress, duration)`. Using `pointerdown` (rather than
  separate `mousedown`/`touchstart`) gives unified mouse + touch + pen handling from one event.
- **`pointerup`** clears the timer — a release before the duration elapses means no long-press.
- **`pointercancel`** clears the timer too. The browser fires `pointercancel` when it takes over
  the pointer (scrolling, gesture recognition, the pointer leaving a captured surface), so honoring
  it prevents a long-press from firing after the gesture was effectively abandoned.

Listeners are registered with `on` from `svelte/events` rather than raw `addEventListener`.
`svelte/events` participates in Svelte's event delegation/ordering model and returns an unlisten
function, which makes teardown a uniform "call each returned cleanup."

The teardown returned by the action clears the pending timer (so a press in flight at unmount
never fires after the node is gone) and calls each listener's cleanup.

The file is named `.svelte.ts` to mark it as part of the Svelte module graph (rune/attachment
ecosystem), keeping it consistent with the other attachment/action modules even though this one
holds no reactive `$state`.

## Considered options

- **Separate mouse and touch handlers.** Rejected: pointer events unify all input types in one
  path and report `pointercancel`, which is exactly the interruption signal a long-press needs.
- **Tracking movement to cancel on drag.** Not implemented: cancellation relies on the browser's
  own `pointercancel` (fired on scroll/gesture takeover). A movement threshold could be added if a
  stricter "must stay still" gesture is needed.
- **Raw `addEventListener`.** Rejected in favor of `svelte/events` `on` for consistent registration
  and uniform cleanup.

## Consequences

- **Works for mouse, touch, and pen uniformly** with no per-modality branching.
- **No movement threshold.** A small drag that does *not* trigger `pointercancel` will still fire
  the long-press; if a stricter gesture is required, add a `pointermove` distance check.
- **The timer is always cleared on teardown**, so unmounting mid-press cannot fire a stale
  callback.
- **`onlongpress` is optional** (`onlongpress?.()`), so the action is safe to attach before a
  handler is wired up.
