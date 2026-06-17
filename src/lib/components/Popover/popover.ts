import { fly, scale, slide } from 'svelte/transition';
import { flyfrom } from '$lib/transitions/flyfrom';
import { slidefrom } from '$lib/transitions/slidefrom';
import {
	composeTransitions,
	normaliseEntries,
	type TransitionInput,
	type WithParams
} from '$lib/transitions/composeTransitions';
import type { FlyParams, SlideParams, TransitionConfig } from 'svelte/transition';

export type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
export type Tick = (t: number, u: number) => void;
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type PlayState = {
	currentAnim: Animation | null;
	animDir: 'in' | 'out' | null;
};

export function uid(): string {
	try {
		return crypto.randomUUID().slice(0, 8);
	} catch {
		return Math.random().toString(36).slice(2, 10);
	}
}

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

export function camel(prop: string): string {
	return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function declToKeyframe(decl: string, offset: number): Keyframe {
	const kf: Record<string, string | number> = { offset };
	for (const part of decl.split(';')) {
		const i = part.indexOf(':');
		if (i === -1) continue;
		const prop = part.slice(0, i).trim();
		const val = part.slice(i + 1).trim();
		if (prop && val) kf[camel(prop)] = val;
	}
	return kf as Keyframe;
}

export function boxShadowToFilter(boxShadow: string): string {
	if (!boxShadow || boxShadow === 'none') return '';
	return boxShadow
		.split(/,(?![^(]*\))/)
		.map((s) => {
			s = s.trim();
			const colorMatch = s.match(/[a-z]+\([^)]*\)|#[\da-fA-F]{3,8}/i);
			if (!colorMatch) return '';
			const color = colorMatch[0];
			const lengths = s.replace(color, '').trim().split(/\s+/).filter(Boolean);
			if (lengths.length < 2) return '';
			const [x, y, blur = '0'] = lengths;
			return `drop-shadow(${x} ${y} ${blur} ${color})`;
		})
		.filter(Boolean)
		.join(' ');
}

export function play(
	node: HTMLElement,
	dir: 'in' | 'out',
	transition: TransitionFn,
	state: PlayState,
	onDone?: () => void
): void {
	state.currentAnim?.cancel();
	state.animDir = dir;
	const cfg = transition(node, {});
	if (!cfg.css) {
		state.currentAnim = null;
		state.animDir = null;
		onDone?.();
		return;
	}
	const ease = cfg.easing ?? ((t: number) => t);
	const steps = 30;
	const frames: Keyframe[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = ease(i / steps);
		frames.push(declToKeyframe(cfg.css(t, 1 - t), i / steps));
	}
	const anim = node.animate(frames, {
		duration: Math.max(1, cfg.duration ?? 400),
		delay: cfg.delay ?? 0,
		easing: 'linear',
		direction: dir === 'out' ? 'reverse' : 'normal',
		fill: 'both'
	});
	state.currentAnim = anim;
	anim.onfinish = () => {
		if (state.currentAnim === anim) {
			state.currentAnim = null;
			state.animDir = null;
		}
		anim.cancel();
		onDone?.();
	};
}

/**
 * Upgrades svelte's `slide`/`fly` to their side-aware variants so the motion
 * always originates from the anchor side. Other transitions pass through
 * untouched.
 *
 * Param mapping for the upgraded variants:
 *   - `slide`: `axis` is ignored — the axis is derived from `side`.
 *   - `fly`: `x`/`y` collapse to a single distance applied along the side's
 *     direction vector (first non-undefined of |x|, |y|; default 16).
 */
function sideAware(fn: TransitionFn, side: Side): TransitionFn {
	if (isSame(fn, slide)) {
		return (node, params = {}) => {
			const { delay, duration, easing, tick } = params as SlideParams & { tick?: Tick };
			return slidefrom(side, delay, duration, easing, tick)(node);
		};
	}

	if (isSame(fn, fly)) {
		return (node, params = {}) => {
			const { x, y, delay, duration, easing, tick } = params as FlyParams & { tick?: Tick };
			const by = toDistance(x) ?? toDistance(y) ?? 16;
			return flyfrom(side, by, delay, duration, easing, tick)(node);
		};
	}

	return fn;
}

/**
 * Resolves the Popover `transition` prop into a single transition function.
 *
 * Accepted shapes:
 *   - `undefined`           — the default: fly from the anchor side + scale.
 *   - a single function     — used as-is, with native Svelte semantics;
 *                             `slide`/`fly` are upgraded to side-aware variants
 *                             (see {@link sideAware}).
 *   - a `[fn, params]` tuple — fn with options, e.g. `[fade, { duration: 150 }]`.
 *   - an array of either    — composed via composeTransitions to run in
 *                             parallel, e.g. `[fly, [scale, { start: 0.9 }]]`.
 *
 * `side` is the effective (rendered) side of the popover, so side-aware motion
 * follows CSS anchor-position flips rather than the declared placement.
 */
export function normalizeTransition(
	input: TransitionFn | TransitionInput | undefined,
	side: Side
): TransitionFn {
	// Array form — flatten to [fn, params?] tuples so each entry's fn gets the
	// side-aware upgrade (with its params intact), then compose them to run in
	// parallel.
	if (Array.isArray(input)) {
		const entries = normaliseEntries(input).map(
			([fn, params]) =>
				(params === undefined ? [sideAware(fn, side)] : [sideAware(fn, side), params]) as WithParams
		);
		return composeTransitions(entries);
	}

	if (input) return sideAware(input, side);

	// Default: fly in from the anchor side while scaling/fading in. scale gets
	// opacity: 1 so fly owns the fade alone — two fades would multiply, leaving
	// the popover transparent through most of the (cubicOut-front-loaded) motion.
	return composeTransitions([
		[flyfrom(side, 16, 0, 250)],
		[scale, { duration: 250, start: 0.75, opacity: 1 }]
	]);
}
