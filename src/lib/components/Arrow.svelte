<script module lang="ts">
	import type { Side } from '$lib/components/Popover.svelte';
	export type ArrowSize = 'sm' | 'md' | 'lg';
	export const arrowSizePx = { sm: 4, md: 6, lg: 8 } satisfies Record<ArrowSize, number>;
	export { arrow };
</script>

<script lang="ts">
	import { cls } from '@layerstack/tailwind';

	// Arrow smartly adjusts to effective placement so arrow always points
	// to anchor, even when the popover is flipped or shifted. It also smartly
	// mirrors Popover's tailwind classes for `bg-[color]`, `border-[width]`,
	// `border-[color]`, `ring-[size]`, `ring-[color]` and `shadow-[size]` and
	// applies them to the arrow for consitency. Darkmode adjustments are also
	// automatically handled.
</script>

{#snippet arrow(side: Side, size: ArrowSize = 'md')}
	{@const sizePx = arrowSizePx[size]}
	{@const isVert = side === 'left' || side === 'right'}
	{@const rot = side === 'top' ? 0 : side === 'right' ? 90 : side === 'bottom' ? 180 : -90}
	{@const dir = side === 'top' || side === 'left' ? -1 : 1}
	{@const edge =
		side === 'top'
			? 'top:100%;'
			: side === 'bottom'
				? 'bottom:100%;'
				: side === 'left'
					? 'left:100%;'
					: 'right:100%;'}
	{@const perp = isVert
		? `calc(${dir} * (var(--arrow-border-width, 1px) / 2 + var(--arrow-size, 8px) / 2))`
		: `calc(${dir} * var(--arrow-border-width, 1px) / 2)`}
	{@const parallel = isVert
		? 'top:calc(50% - var(--arrow-size, 8px) / 2);'
		: 'left:calc(50% - var(--arrow-size, 8px));'}
	{@const tx = isVert ? perp : '0px'}
	{@const ty = isVert ? '0px' : perp}
	<svg
		viewBox="0 0 2 1"
		preserveAspectRatio="none"
		aria-hidden="true"
		style={cls(
			`--arrow-size:${sizePx}px;`,
			'position:absolute; overflow:visible; pointer-events:none;',
			edge,
			parallel,
			'width:calc(2 * var(--arrow-size, 8px));',
			'height:var(--arrow-size, 8px);',
			`transform:translate(${tx},${ty}) rotate(${rot}deg);`,
			'filter:var(--arrow-shadow, none);'
		)}
	>
		<!-- Full-width rect covering the popover border at the arrow junction (rendered first, below stroke) -->
		<rect
			x="0"
			y={-0.5 / sizePx}
			width="2"
			height={0.6 / sizePx}
			fill="var(--arrow-bg, white)"
			style={`y:calc(${-0.5 / sizePx} * var(--arrow-border-width, 1px) - var(--arrow-ring-width, 0px) / ${sizePx}); height:calc(${0.6 / sizePx} * var(--arrow-border-width, 1px) + var(--arrow-ring-width, 0px) / ${sizePx});`}
		/>
		<!-- Ring stroke — rendered below fill so the polygon covers the inward half, leaving only the outward ring visible -->
		<polyline
			points="0,0 1,1 2,0"
			fill="none"
			stroke="var(--arrow-ring-color, transparent)"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
			style="stroke-width:calc(var(--arrow-border-width, 1px) + 2 * var(--arrow-ring-width, 2px));"
		/>
		<!-- Arrow fill — renders after ring so it covers the ring's inward half -->
		<polygon points="0,0 2,0 1,1" fill="var(--arrow-bg, white)" />
		<!-- Border stroke on slant edges only — no base stroke to bleed into the popover -->
		<polyline
			points="0,0 1,1 2,0"
			fill="none"
			stroke="var(--arrow-border-color, currentColor)"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
			style="stroke-width:var(--arrow-border-width, 1px);"
		/>
	</svg>
{/snippet}
