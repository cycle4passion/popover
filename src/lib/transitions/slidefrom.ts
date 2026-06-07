import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { slide } from 'svelte/transition';

export function slidefrom(
	direction: 'top' | 'bottom' | 'left' | 'right',
	delay: number = 0,
	duration: number = 400,
	easing: (t: number) => number = cubicOut,
	tick: (t: number, u: number) => void = () => {}
): (node: Element) => TransitionConfig {
	const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
	return (node: Element) => ({
		...slide(node as HTMLElement, { delay, duration, easing, axis }),
		tick
	});
}
