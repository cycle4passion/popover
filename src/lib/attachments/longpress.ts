import { on } from 'svelte/events';

interface LongpressOptions {
	/** How long (ms) the pointer must stay down before firing. @default 500 */
	duration?: number;
	/** Called once the press has been held for `duration`. */
	onlongpress?: () => void;
}

/**
 * Fires `onlongpress` when the pointer is pressed and held on `node` for
 * `duration` ms. The timer is cancelled if the pointer is released
 * (`pointerup`) or interrupted (`pointercancel`) before then. Works for mouse,
 * touch, and pen via Pointer Events.
 *
 * Note: it does NOT call `preventDefault()`, so on touch the OS text-selection
 * callout / context menu may still appear during the hold — suppress that on
 * the trigger with CSS (`touch-action`, `user-select: none`) if needed.
 *
 * @param node  The element to watch for the press-and-hold gesture.
 * @param options  `duration` (default 500ms) and the `onlongpress` callback.
 * @returns A cleanup function that clears the pending timer and removes the
 *          listeners. Call it when the element/effect is destroyed.
 *
 * @example
 * // Direct use — keep the returned cleanup and call it on teardown:
 * const stop = longpress(buttonEl, {
 *   duration: 800,
 *   onlongpress: () => console.log('held for 800ms')
 * });
 * // later…
 * stop();
 *
 * @example
 * // As a Svelte attachment (it already has the `(node) => cleanup` shape):
 * <button {@attach (node) => longpress(node, { onlongpress: () => (open = true) })}>
 *   Press and hold
 * </button>
 *
 * @example
 * // Inside an $effect, so it re-runs and re-cleans when deps change:
 * $effect(() => longpress(anchor, { duration, onlongpress: () => (open = true) }));
 */
export function longpress(
	node: HTMLElement,
	{ duration = 500, onlongpress }: LongpressOptions = {}
) {
	let timer: ReturnType<typeof setTimeout>;

	const cleanup = [
		on(node, 'pointerdown', () => {
			timer = setTimeout(() => {
				onlongpress?.();
			}, duration);
		}),
		on(node, 'pointerup', () => clearTimeout(timer)),
		on(node, 'pointercancel', () => clearTimeout(timer))
	];

	return () => {
		clearTimeout(timer);
		cleanup.forEach((fn) => fn());
	};
}
