<script module lang="ts">
	import type { Side } from '$lib/components/Popover/types';
	export type ArrowSize = 'sm' | 'md' | 'lg';
	export const arrowSizePx = { sm: 4, md: 6, lg: 8 } satisfies Record<ArrowSize, number>;
</script>

<script lang="ts">
	import { cls } from '@layerstack/tailwind';

	// Arrow smartly adjusts to effective placement so arrow always points
	// to anchor, even when the popover is flipped or shifted. It also smartly
	// mirrors Popover's tailwind classes for `bg-[color]`, `border-[width]`,
	// `border-[color]`, `ring-[size]`, `ring-[color]` `shadow-[size]` and
	// applies them to the arrow for consitency. Darkmode adjustments are also
	// automatically handled.

	type Props = {
		side: Side;
		size?: ArrowSize;
		/** Popover element — receives derived CSS vars for ring/shadow. */
		popoverEl: HTMLElement | null;
		/** Popover className parsed for ring/shadow mirroring. */
		popoverClass?: string;
		/** Popover style string; values containing `--arrow-ring` or `--arrow-shadow` opt out of class mirroring. */
		popoverStyle?: string;
	};

	let {
		side,
		size = 'md',
		popoverEl,
		popoverClass = '',
		popoverStyle = ''
	}: Props = $props();

	const sizePx = $derived(arrowSizePx[size]);
	const isVert = $derived(side === 'left' || side === 'right');
	const rot = $derived(side === 'top' ? 0 : side === 'right' ? 90 : side === 'bottom' ? 180 : -90);
	const dir = $derived(side === 'top' || side === 'left' ? -1 : 1);
	const edge = $derived(
		side === 'top'
			? 'top:100%;'
			: side === 'bottom'
				? 'bottom:100%;'
				: side === 'left'
					? 'left:100%;'
					: 'right:100%;'
	);
	const perp = $derived(
		isVert
			? `calc(${dir} * (var(--arrow-border-width, 1px) / 2 + var(--arrow-size, 8px) / 2))`
			: `calc(${dir} * var(--arrow-border-width, 1px) / 2)`
	);
	const parallel = $derived(
		isVert
			? 'top:calc(50% - var(--arrow-size, 8px) / 2);'
			: 'left:calc(50% - var(--arrow-size, 8px));'
	);
	const tx = $derived(isVert ? perp : '0px');
	const ty = $derived(isVert ? '0px' : perp);

	let isDark = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const update = () =>
			(isDark = mq.matches || document.documentElement.classList.contains('dark'));
		update();
		mq.addEventListener('change', update);
		const obs = new MutationObserver(update);
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => {
			mq.removeEventListener('change', update);
			obs.disconnect();
		};
	});

	function arrowStylesFromClasses(classes: string[], dark: boolean) {
		let ringColor: string | undefined;
		let ringWidth: string | undefined;
		let dropShadow: string | undefined;

		// Resolve dark: variants: include base classes always, overlay dark: classes when dark mode is active
		const active = classes.flatMap((c) => {
			if (c.startsWith('dark:')) return dark ? [c.slice(5)] : [];
			return [c];
		});

		for (const c of active) {
			// ring-0, ring-1, ring-2, ring-4, ring-8
			const numericRing = c.match(/^ring-(\d+)$/);
			if (numericRing) {
				ringWidth = `${numericRing[1]}px`;
				continue;
			}
			// bare `ring` → Tailwind v4 default (1px)
			if (c === 'ring') {
				ringWidth = '1px';
				continue;
			}
			// ring-[Xpx] arbitrary width or ring-[color]
			const arbitraryRing = c.match(/^ring-\[(.+?)\](?:\/(\d+))?$/);
			if (arbitraryRing) {
				const val = arbitraryRing[1];
				if (/^[\d.]/.test(val)) {
					ringWidth = /[a-z%]/.test(val) ? val : `${val}px`;
				} else {
					ringColor = arbitraryRing[2]
						? `color-mix(in oklab, ${val} ${arbitraryRing[2]}%, transparent)`
						: val;
				}
				continue;
			}
			// ring-{color}: ring-indigo-500, ring-black/10, ring-current, etc.
			// Exclude: ring-offset-*, ring-inset, numeric widths (already handled above)
			const ringColorMatch = c.match(/^ring-(?!offset-|inset\b)([a-zA-Z].+?)(?:\/(\d+))?$/);
			if (ringColorMatch) {
				const color = ringColorMatch[1];
				const alpha = ringColorMatch[2];
				ringColor =
					color === 'current'
						? 'currentColor'
						: color === 'inherit'
							? 'inherit'
							: color === 'transparent'
								? 'transparent'
								: alpha
									? `color-mix(in oklab, var(--color-${color}) ${alpha}%, transparent)`
									: `var(--color-${color})`;
				continue;
			}
			// shadow-none, shadow, shadow-sm, shadow-md, shadow-lg, shadow-xl, shadow-2xl, shadow-xs, shadow-2xs
			const shadowMatch = c.match(/^shadow(-[\w-]+)?$/);
			if (shadowMatch) {
				if (c === 'shadow-none') {
					dropShadow = undefined;
					continue;
				}
				const name = shadowMatch[1]?.slice(1);
				dropShadow = name
					? `drop-shadow(var(--drop-shadow-${name}))`
					: `drop-shadow(var(--drop-shadow))`;
			}
		}

		return { ringColor, ringWidth, dropShadow };
	}

	$effect(() => {
		if (!popoverEl) return;

		const { ringColor, ringWidth, dropShadow } = arrowStylesFromClasses(
			popoverClass.split(/\s+/).filter(Boolean),
			isDark
		);

		if (!popoverStyle.includes('--arrow-ring')) {
			if (ringColor !== undefined) {
				popoverEl.style.setProperty('--arrow-ring-color', ringColor);
				popoverEl.style.setProperty('--arrow-ring-width', ringWidth ?? '2px');
			} else {
				popoverEl.style.removeProperty('--arrow-ring-color');
				popoverEl.style.removeProperty('--arrow-ring-width');
			}
		}

		if (!popoverStyle.includes('--arrow-shadow')) {
			if (dropShadow !== undefined) {
				popoverEl.style.setProperty('--arrow-shadow', dropShadow);
			} else {
				popoverEl.style.removeProperty('--arrow-shadow');
			}
		}
	});
</script>

<svg
	viewBox="0 0 2 1"
	preserveAspectRatio="none"
	aria-hidden="true"
	style={cls(
		'position:absolute; overflow:visible; pointer-events:none; filter:var(--arrow-shadow, none);',
		edge,
		parallel,
		`--arrow-size:${sizePx}px;`,
		'width:calc(2 * var(--arrow-size, 8px));',
		'height:var(--arrow-size, 8px);',
		`transform:translate(${tx},${ty}) rotate(${rot}deg);`
	)}
>
	<!-- Full-width rect covering the popover border at the arrow junction (rendered first, below stroke) -->
	<rect
		x="0"
		y={-0.5 / sizePx}
		width="2"
		height={0.6 / sizePx}
		fill="var(--arrow-bg, white)"
		style={`y:calc(${-0.5 / sizePx} * var(--arrow-border-width, 1px)); height:calc(${0.6 / sizePx} * var(--arrow-border-width, 1px));`}
	/>
	<defs>
		<!--
			Clips the ring stroke to x∈[0,2], y≥0. With both axes clipped, the endpoint
			cap geometry at each base corner reduces to a single point (zero area), eliminating
			corner artifacts without complex coordinate math.
			Static ID is intentional — all arrow clip paths are identical in user-unit space,
			so sharing the first occurrence in the document is correct.
		-->
		<clipPath id="arrow-ring-clip">
			<rect x="0" y="0" width="2" height="2" />
		</clipPath>
	</defs>
	<!-- Ring stroke — clipped to arrow area so corner caps and y<0 bleed are eliminated -->
	<polyline
		points="0,0 1,1 2,0"
		fill="none"
		stroke="var(--arrow-ring-color, transparent)"
		stroke-linejoin="round"
		vector-effect="non-scaling-stroke"
		clip-path="url(#arrow-ring-clip)"
		style="stroke-width:calc(var(--arrow-border-width, 1px) + 2 * var(--arrow-ring-width, 2px));"
	/>
	<!-- Arrow fill — renders after ring so it covers the ring's inward half -->
	<polygon points="0,0 2,0 1,1" fill="var(--arrow-bg, white)" />
	<!-- Border stroke — clipped so upward bleed at base corners is eliminated -->
	<polyline
		points="0,0 1,1 2,0"
		fill="none"
		stroke="var(--arrow-border-color, transparent)"
		stroke-linejoin="round"
		vector-effect="non-scaling-stroke"
		clip-path="url(#arrow-ring-clip)"
		style="stroke-width:var(--arrow-border-width, 1px);"
	/>
</svg>
