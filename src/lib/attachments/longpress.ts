// longpress.svelte.ts
import { on } from 'svelte/events';

interface LongpressOptions {
	duration?: number;
	onlongpress?: () => void;
}

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
