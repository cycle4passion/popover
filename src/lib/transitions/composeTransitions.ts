/**
 * composeTransitions — run multiple Svelte transitions on one element in
 * parallel, as a single `transition:` directive.
 *
 * Svelte only allows one transition per element, and naively concatenating
 * css output doesn't work: when two transitions write the same property
 * (e.g. fly and scale both write `transform`), the last declaration silently
 * wins. This module samples every entry on its own delay/duration/easing
 * timeline and merges the css per property so the effects actually combine.
 */
import { linear } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransitionFn = (node: Element, params?: any) => TransitionConfig;
type TransitionParams = Record<string, unknown>;

/** A transition with optional params: `[fade]` or `[fade, { duration: 200 }]`. */
export type WithParams = [fn: TransitionFn] | [fn: TransitionFn, params: TransitionParams];

/**
 * A single transition entry:
 *   - `fade`                          — no options
 *   - `[fade, { duration: 200 }]`     — with options
 */
type TransitionEntry = TransitionFn | WithParams;

/**
 * What composeTransitions accepts:
 *   - a single transition:  `composeTransitions(fade)`
 *   - a [fn, params] tuple: `composeTransitions([fade, { duration: 200 }])`
 *   - an array of either:   `composeTransitions([fade, [slide, { axis: 'y' }]])`
 */
export type TransitionInput = TransitionEntry | Array<TransitionFn | WithParams>;

/**
 * Resolves the input shapes of composeTransitions into a flat list of
 * `[fn, params?]` tuples, disambiguating the `[fn, params]` tuple form
 * from the list form.
 */
export function normaliseEntries(input: TransitionInput): WithParams[] {
	if (typeof input === 'function') {
		return [[input]];
	}

	if (Array.isArray(input) && input.length > 0) {
		const first = input[0];

		if (typeof first === 'function') {
			const second = input[1];
			// [fn] or [fn, paramsObject] — treat as a single entry. Params must be a
			// plain object: a function or array second element means the list form
			// (e.g. [fade, [slide, { axis: 'y' }]]).
			const isParams =
				second !== null && typeof second === 'object' && !Array.isArray(second);
			if (input.length === 1 || (input.length === 2 && isParams)) {
				return [input as WithParams];
			}
			// [fn1, fn2, ...] — treat as an array of entries
		}

		// Array of entries — each element is fn or [fn, params]
		return (input as Array<TransitionFn | WithParams>).map((entry) =>
			typeof entry === 'function' ? [entry] : entry
		);
	}

	return [];
}

/**
 * Merges css declaration strings from multiple transitions into one block.
 * Same-property collisions are resolved per property:
 *   - `transform`: values are concatenated so they compose (e.g. translate + scale).
 *     Each transition prefixes its output with the node's pre-existing transform,
 *     so that shared prefix is stripped and re-applied once.
 *   - `opacity`: values are multiplied (parallel compositing).
 *   - anything else: the last one listed wins.
 */
function mergeCss(parts: string[], baseTransform: string): string {
	const decls = new Map<string, string>();
	const transforms: string[] = [];

	for (const part of parts) {
		for (const decl of part.split(';')) {
			const colon = decl.indexOf(':');
			if (colon === -1) continue;
			const prop = decl.slice(0, colon).trim();
			let value = decl.slice(colon + 1).trim();
			if (!prop || !value) continue;

			if (prop === 'transform') {
				if (baseTransform && value.startsWith(baseTransform)) {
					value = value.slice(baseTransform.length).trim();
				}
				if (value && value !== 'none') transforms.push(value);
			} else if (prop === 'opacity') {
				const prev = decls.get(prop);
				const a = prev === undefined ? NaN : parseFloat(prev);
				const b = parseFloat(value);
				decls.set(prop, Number.isNaN(a) || Number.isNaN(b) ? value : String(a * b));
			} else {
				decls.set(prop, value);
			}
		}
	}

	if (transforms.length) {
		decls.set('transform', [baseTransform, ...transforms].filter(Boolean).join(' '));
	}

	return Array.from(decls, ([prop, value]) => `${prop}: ${value}`).join('; ');
}

/**
 * Combines multiple Svelte transitions into one, running them in parallel.
 * Each transition keeps its own easing, delay, and duration — the composed
 * duration stretches to fit the longest one, and entries that finish early
 * hold their final state. Same-property css collisions are merged per
 * property (see {@link mergeCss}); `tick` callbacks all run, each on its own
 * timeline. Outros replay each entry in reverse.
 *
 * A single bare function is returned untouched, so it behaves exactly like a
 * native Svelte transition — including directive params (`transition:t={{…}}`).
 * Tuple and array inputs are configured at compose time instead: params live
 * in the tuples, and directive params are ignored.
 *
 * @example
 * // Single transition — native behavior, directive params still work
 * const composed = composeTransitions(fade);
 *
 * // Single transition with options
 * const composed = composeTransitions([slide, { axis: 'y', duration: 200 }]);
 *
 * // Multiple transitions
 * const composed = composeTransitions([[slide, { axis: 'y', duration: 200 }], fade]);
 *
 * // <div transition:composed>
 */
export function composeTransitions(
	input: TransitionInput
): (node: Element, params?: unknown, options?: { direction: 'in' | 'out' | 'both' }) => TransitionConfig {
	// Single bare transition — no composing needed; delegating keeps native
	// semantics (directive params, Svelte's own easing/reversal handling).
	if (typeof input === 'function') {
		return input;
	}

	return (
		node: Element,
		_params?: unknown,
		options?: { direction: 'in' | 'out' | 'both' }
	): TransitionConfig => {
		const isOut = options?.direction === 'out';
		const pairs = normaliseEntries(input);
		const configs = pairs.map(([fn, params]) => fn(node, params));

		// Pre-existing transform that Svelte's built-in transitions (fly, scale, …)
		// each prefix onto their own output — captured here so mergeCss can dedupe it.
		const computedTransform = getComputedStyle(node).transform;
		const baseTransform = computedTransform === 'none' ? '' : computedTransform;

		const composedDuration = Math.max(
			1,
			...configs.map((c) => (c.delay ?? 0) + (c.duration ?? 300))
		);

		const hasCss = configs.some((c) => c.css != null);
		const hasTick = configs.some((c) => c.tick != null);

		// Maps the composed (linear) t onto one entry's own timeline: offset by its
		// delay, scaled to its duration, clamped once finished, then eased. Returns
		// the [t, u] pair the entry's css/tick expects.
		function localT(config: TransitionConfig, t: number): [t: number, u: number] {
			const delay = config.delay ?? 0;
			const duration = config.duration ?? 300;
			const ease = config.easing ?? linear;

			// For 'out', t runs 1→0; we measure elapsed from the start of the phase.
			const elapsed = isOut ? (1 - t) * composedDuration : t * composedDuration;
			const progress = Math.min(1, Math.max(0, (elapsed - delay) / duration));
			const lt = isOut ? 1 - ease(progress) : ease(progress);
			return [lt, 1 - lt];
		}

		return {
			delay: 0,
			duration: composedDuration,
			easing: linear, // keep t raw so we can apply per-transition easings ourselves
			// Same-property collisions across transitions are merged per property by
			// mergeCss — transforms compose, opacities multiply, the rest last-wins.
			css: hasCss
				? (t) =>
						mergeCss(
							configs
								.map((config) => {
									if (!config.css) return '';
									const [lt, lu] = localT(config, t);
									return config.css!(lt, lu);
								})
								.filter(Boolean),
							baseTransform
						)
				: undefined,
			tick: hasTick
				? (t) => {
						for (const config of configs) {
							if (!config.tick) continue;
							const [lt, lu] = localT(config, t);
							config.tick!(lt, lu);
						}
					}
				: undefined
		};
	};
}
