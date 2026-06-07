import { linear } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransitionFn = (node: Element, params?: any) => TransitionConfig;
type TransitionParams = Record<string, unknown>;
type WithParams = [fn: TransitionFn] | [fn: TransitionFn, params: TransitionParams];

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
type TransitionInput = TransitionEntry | Array<TransitionFn | WithParams>;

function normalise(input: TransitionInput): WithParams[] {
	if (typeof input === 'function') {
		return [[input]];
	}

	if (Array.isArray(input) && input.length > 0) {
		const first = input[0];

		if (typeof first === 'function') {
			const second = input[1];
			// [fn] or [fn, paramsObject] — treat as a single entry
			if (input.length <= 2 && (second === undefined || typeof second !== 'function')) {
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
 * Combines multiple Svelte transitions into one, running them in parallel.
 * Each transition keeps its own easing, delay, and duration — the composed
 * duration stretches to fit the longest one.
 *
 * @example
 * // Single transition (no options)
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
	return (
		node: Element,
		_params?: unknown,
		options?: { direction: 'in' | 'out' | 'both' }
	): TransitionConfig => {
		const isOut = options?.direction === 'out';
		const pairs = normalise(input);
		const configs = pairs.map(([fn, params]) => fn(node, params));

		const composedDuration = Math.max(
			1,
			...configs.map((c) => (c.delay ?? 0) + (c.duration ?? 300))
		);

		const hasCss = configs.some((c) => c.css != null);
		const hasTick = configs.some((c) => c.tick != null);

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
			// CSS declarations are joined in order, so when multiple transitions set the same
			// property (e.g. both fly and fade set opacity), the last one listed wins.
			css: hasCss
				? (t) =>
						configs
							.map((config) => {
								if (!config.css) return '';
								const [lt, lu] = localT(config, t);
								return config.css!(lt, lu);
							})
							.filter(Boolean)
							.join('; ')
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
