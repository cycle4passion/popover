import { composeTransitions } from '$lib/transitions/composeTransitions';
import { fly, scale, slide } from 'svelte/transition';
import { flyfrom } from '$lib/components/Popover/flyfrom';
import { slidefrom } from '$lib/components/Popover/slidefrom';
import type { TransitionConfig } from 'svelte/transition';
import type { ArrowSize } from './types';

type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
type Side = 'top' | 'right' | 'bottom' | 'left';

export const arrowSizePx = { sm: 10, md: 14, lg: 16 } satisfies Record<ArrowSize, number>;

export const placements = [
	'top',
	'bottom',
	'left',
	'right',
	'top-start',
	'top-end',
	'bottom-start',
	'bottom-end',
	'left-start',
	'left-end',
	'right-start',
	'right-end'
] as const;

export function normalizeTransition(fn: TransitionFn | undefined, side: Side): TransitionFn {
	if (fn === slide) {
		return (node, params = {}) => {
			const { delay = 0, duration = 400, easing, tick } = params as Record<string, unknown>;

			return slidefrom(
				side,
				delay as number,
				duration as number,
				easing as (t: number) => number,
				tick as (t: number, u: number) => void
			)(node);
		};
	}

	if (fn === fly) {
		return (node, params = {}) => {
			const {
				by = 16,
				delay = 0,
				duration = 200,
				easing,
				tick
			} = params as Record<string, unknown>;

			return flyfrom(
				side,
				by as number,
				delay as number,
				duration as number,
				easing as (t: number) => number,
				tick as (t: number, u: number) => void
			)(node);
		};
	}

	return fn ?? composeTransitions([slidefrom(side), scale]);
}
