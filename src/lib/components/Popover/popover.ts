import { composeTransitions } from '$lib/transitions/composeTransitions';
import { fly, scale, slide } from 'svelte/transition';
import { flyfrom } from '$lib/components/Popover/flyfrom';
import { slidefrom } from '$lib/components/Popover/slidefrom';
import type { FlyParams, SlideParams, TransitionConfig } from 'svelte/transition';

type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
type Side = 'top' | 'right' | 'bottom' | 'left';
type Tick = (t: number, u: number) => void;

// Compare by source as well as reference so duplicated module instances
// (e.g. across HMR boundaries) still match.
function isSame(fn: TransitionFn, target: typeof fly | typeof slide): boolean {
	return (fn as unknown) === target || fn.toString() === target.toString();
}

function toDistance(v: number | string | undefined): number | undefined {
	if (v === undefined) return undefined;
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return Number.isNaN(n) ? undefined : Math.abs(n);
}

export function normalizeTransition(fn: TransitionFn | undefined, side: Side): TransitionFn {
	if (fn && isSame(fn, slide)) {
		return (node, params = {}) => {
			const { delay, duration, easing, tick } = params as SlideParams & { tick?: Tick };
			return slidefrom(side, delay, duration, easing, tick)(node);
		};
	}

	if (fn && isSame(fn, fly)) {
		return (node, params = {}) => {
			const { x, y, delay, duration, easing, tick } = params as FlyParams & { tick?: Tick };
			const by = toDistance(x) ?? toDistance(y) ?? 16;
			return flyfrom(side, by, delay, duration, easing, tick)(node);
		};
	}

	return fn ?? composeTransitions([flyfrom(side), scale]);
}
