import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// Native Svelte `slide` reveals the element by animating its height while clipping
// the overflow, and we can't use that here because the popover's ::after arrow is
// painted OUTSIDE the border-box (ink overflow) — any clip (overflow:hidden / clip-path)
// clamps the paint boundary to the box edge, so the arrow gets cut off and flashes in.
// Instead we mimick slide implementation using scale (scaleY/scaleX) from the anchor-side
// origin: nothing is clipped, and the ::after scales with the box so the arrow tip grows
// smoothly out of the edge.
export function slidefrom(
	direction: 'top' | 'bottom' | 'left' | 'right',
	delay: number = 0,
	duration: number = 400,
	easing: (t: number) => number = cubicOut,
	tick?: (t: number, u: number) => void
): (node: Element) => TransitionConfig {
	const axes = {
		bottom: ['scaleY', 'top center'],
		top: ['scaleY', 'bottom center'],
		right: ['scaleX', 'center left'],
		left: ['scaleX', 'center right']
	} as const;
	const [scaleFn, origin] = axes[direction];

	return (): TransitionConfig => ({
		delay,
		duration,
		easing,
		css: (t) => `transform: ${scaleFn}(${t}); transform-origin: ${origin};`,
		tick
	});
}
