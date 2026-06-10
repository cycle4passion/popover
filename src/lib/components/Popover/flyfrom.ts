import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { fly } from 'svelte/transition';

// Start offset points back toward the anchor so the box animates from the
// anchor outward to its final position.
const directionVectors: Record<string, { x: number; y: number }> = {
	top: { x: 0, y: 1 },
	bottom: { x: 0, y: -1 },
	left: { x: 1, y: 0 },
	right: { x: -1, y: 0 }
};

export function flyfrom(
	direction: 'top' | 'bottom' | 'left' | 'right',
	by: number = 16,
	delay: number = 0,
	duration: number = 200,
	easing: (t: number) => number = cubicOut,
	tick: (t: number, u: number) => void = () => {}
): (node: Element) => TransitionConfig {
	const { x: dx, y: dy } = directionVectors[direction];
	return (node: Element) => ({
		...fly(node as HTMLElement, { x: dx * by, y: dy * by, delay, duration, easing }),
		tick
	});
}
