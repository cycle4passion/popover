import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// clip-path cannot reveal ::after ink-overflow painted above the border-box — Chrome
// clamps the effective paint boundary to y=0 regardless of negative polygon coordinates.
// scaleY/scaleX from the anchor-side origin avoids clipping entirely: the ::after scales
// with the box so the arrow tip rises smoothly from the edge instead of flashing in.
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
		left: ['scaleX', 'center right'],
	} as const;
	const [scaleFn, origin] = axes[direction];

	return (): TransitionConfig => ({
		delay,
		duration,
		easing,
		css: (t) => `transform: ${scaleFn}(${t}); transform-origin: ${origin};`,
		tick,
	});
}
