<script module lang="ts">
	import type { TransitionFn, Placement, TriggerBy, Side, ArrowSize } from './types';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { portal as attachPortal, type PortalOptions } from '$lib/attachments/portal';
	import { cls } from '@layerstack/tailwind';

	import { arrowSizePx, normalizeTransition } from './popover';

	type Props = {
		/** Whether the popover is visible. Bindable. */
		open?: boolean;
		/** Show a directional arrow connecting the popover to its anchor. Pass `true` for default 'md' size, or 'sm' | 'md' | 'lg'. The arrow inherits bg/border/drop-shadow from the Popover Box via CSS; override its size with the `--arrow-size` CSS var. @default false */
		arrow?: boolean | ArrowSize;
		/** Preferred placement relative to the anchor. May be flipped by the browser when space is constrained; the arrow follows the actual rendered side. @default 'top' */
		placement?: Placement;
		/** Whether to use Anchor positioning API. @default true */
		autoPlacement?: boolean;
		/** Gap in pixels between the popover and its anchor. @default 0 */
		offset?: number;
		/** Popovers sharing the same group name open and close together. */
		group?: string;
		/** ID of the anchor element. Defaults to the previous sibling. */
		anchorEl?: string;
		/** What interaction opens the popover. @default 'click' */
		triggerBy?: TriggerBy;
		/** When true, the popover matches its anchor size along the placement axis. Top/bottom uses width; left/right uses height. @default false */
		matchSize?: boolean;
		/** Minimum margin in pixels between the popover and the viewport edge when autoPlacement is enabled. @default 8 */
		viewportMargin?: number;
		/** Constrains the popover to available viewport space. 'width', 'height', or true for both. @default false */
		resize?: boolean | 'width' | 'height';
		portal?: PortalOptions | boolean;
		/** Whether the popover is rendered in a portal. @default false */
		style?: string;
		/** Additional inline styles applied to the Popover Box. */
		/** Additional CSS classes applied to the Popover Box (the visible styled wrapper). The arrow inherits bg/border/drop-shadow from here. */
		class?: string;
		/** Additional CSS classes applied to the outer positioning element. Rarely needed. */
		containerClass?: string;
		/** Svelte transition for open/close. @default logicalSlideFade */
		transition?: TransitionFn;
		children?: Snippet;
	} & Record<string, unknown>;

	let popoverEl = $state<HTMLElement | null>(null);
	const anchorName = `--popover-anchor-${crypto.randomUUID().slice(0, 8)}`;

	let {
		open = $bindable(false),
		placement = 'top' as Placement,
		autoPlacement = true,
		offset = 0,
		group,
		anchorEl,
		triggerBy = 'click',
		matchSize = false,
		viewportMargin = 28,
		resize = false as boolean | 'width' | 'height',
		portal = false,
		style = '',
		class: className = '',
		containerClass = '',
		transition: transitionProp = undefined,
		arrow = false,
		children,
		...restProps
	}: Props = $props();

	// const transition = $derived(transitionProp ?? logicalSlideFade(placement));
	const declaredSide = $derived(placement.split('-')[0] as Side);
	let effectiveSide = $derived<Side>(declaredSide);
	const transition: TransitionFn = $derived(normalizeTransition(transitionProp, effectiveSide));
	const arrowSize: ArrowSize | null = $derived(
		arrow === false ? null : arrow === true ? 'md' : arrow
	);
	const showArrow = $derived(arrowSize !== null);

	// Gates the transitioning Popover Box until effectiveSide has been measured
	// from the actually-rendered popover position. Without this, the intro
	// transition plays from declaredSide for one frame after a CSS flip.
	let measured = $state(false);

	function popoverEvents(anchor: HTMLElement, el: HTMLElement) {
		if (triggerBy === 'hover') {
			let closeTimer: ReturnType<typeof setTimeout> | undefined;

			function onAnchorEnter() {
				clearTimeout(closeTimer);
				open = true;
			}

			function onAnchorLeave(e: MouseEvent) {
				if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
				closeTimer = setTimeout(() => {
					open = false;
				}, 100);
			}

			function onPopoverEnter() {
				clearTimeout(closeTimer);
			}

			function onPopoverLeave(e: MouseEvent) {
				if (e.relatedTarget instanceof Node && anchor.contains(e.relatedTarget)) return;
				open = false;
			}

			anchor.addEventListener('mouseenter', onAnchorEnter);
			anchor.addEventListener('mouseleave', onAnchorLeave);
			el.addEventListener('mouseenter', onPopoverEnter);
			el.addEventListener('mouseleave', onPopoverLeave);

			return () => {
				clearTimeout(closeTimer);
				anchor.removeEventListener('mouseenter', onAnchorEnter);
				anchor.removeEventListener('mouseleave', onAnchorLeave);
				el.removeEventListener('mouseenter', onPopoverEnter);
				el.removeEventListener('mouseleave', onPopoverLeave);
			};
		}
	}

	function attachAnchor(el: HTMLElement) {
		const target = anchorEl ? document.getElementById(anchorEl) : el.previousElementSibling;
		if (target instanceof HTMLElement) {
			target.style.setProperty('anchor-name', anchorName);
		}

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			return popoverEvents(target, el);
		});

		$effect(() => openEvents());

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			if (!open) {
				// Closed before first measurement: no outro will fire, so hide directly.
				if (!measured && popoverEl?.matches(':popover-open')) popoverEl.hidePopover();
				measured = false;
				return;
			}
			const measure = () => {
				const a = target.getBoundingClientRect();
				const p = el.getBoundingClientRect();
				if (p.width === 0 && p.height === 0) return;
				let next: Side = declaredSide;
				if (p.bottom <= a.top) next = 'top';
				else if (p.top >= a.bottom) next = 'bottom';
				else if (p.right <= a.left) next = 'left';
				else if (p.left >= a.right) next = 'right';
				if (next !== effectiveSide) effectiveSide = next;
				if (!measured) measured = true;
			};
			// Synchronous first measurement — openEvents effect already ran showPopover,
			// and the !measured branch has rendered a sizer so the popover has dimensions.
			measure();
			let rafId = 0;
			const tick = () => {
				measure();
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
			return () => cancelAnimationFrame(rafId);
		});

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			if (group) {
				target.setAttribute('data-popover-anchor-group', group);
				return () => target.removeAttribute('data-popover-anchor-group');
			} else {
				target.removeAttribute('data-popover-anchor-group');
			}
		});

		function onPointerDown(e: PointerEvent) {
			if (!(e.target instanceof Node)) return;
			if (el.contains(e.target)) return;
			if (target instanceof Node && target.contains(e.target)) return;
			if (e.target instanceof Element && e.target.closest('[data-popover-ignore]')) return;
			// Don't close if click is on a sibling group member's anchor or inside their popover
			if (group && e.target instanceof Element) {
				if (e.target.closest(`[data-popover-anchor-group="${group}"]`)) return;
				const members = document.querySelectorAll<HTMLElement>(
					`[data-popover][data-popover-group="${group}"]`
				);
				for (const member of members) {
					if (member !== el && member.contains(e.target)) return;
				}
			}
			open = false;
		}
		window.addEventListener('pointerdown', onPointerDown);
		return () => window.removeEventListener('pointerdown', onPointerDown);
	}

	function openEvents() {
		if (open) {
			if (!popoverEl) return;
			if (!popoverEl.matches(':popover-open')) {
				if (!group) {
					document
						.querySelectorAll<HTMLElement>('[data-popover]:not([data-popover-group])')
						.forEach((other) => {
							if (other !== popoverEl && other.matches(':popover-open')) other.hidePopover();
						});
				}

				popoverEl.showPopover();

				if (group) {
					document
						.querySelectorAll<HTMLElement>(`[data-popover][data-popover-group="${group}"]`)
						.forEach((member) => {
							if (member !== popoverEl && !member.matches(':popover-open')) member.showPopover();
						});
				}
			}
		} else {
			if (popoverEl && group) {
				document
					.querySelectorAll<HTMLElement>(`[data-popover][data-popover-group="${group}"]`)
					.forEach((member) => {
						if (member !== popoverEl && member.matches(':popover-open')) member.hidePopover();
					});
			}
		}

		return () => {
			if (popoverEl instanceof HTMLElement) {
				popoverEl.style.removeProperty('anchor-name');
			}
		};
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />
<div
	bind:this={popoverEl}
	data-popover
	data-popover-group={group || undefined}
	data-arrow={showArrow || undefined}
	popover="manual"
	class={cls(
		'Popover bg-transparent',
		autoPlacement && 'anchorPositioned',
		`placement-${placement}`,
		matchSize && 'match-size',
		(resize === true || resize === 'width') && 'resize-width',
		(resize === true || resize === 'height') && 'resize-height',
		containerClass
	)}
	style={cls(
		`position-anchor: ${anchorName}; --popover-gap: ${offset}px; --viewport-margin: ${viewportMargin}px;`,
		arrowSize && `--arrow-size:${arrowSizePx[arrowSize]}px;`,
		open && !measured && 'visibility:hidden;'
	)}
	ontoggle={(e) => (open = e.newState === 'open')}
	{@attach attachAnchor}
	{@attach attachPortal(portal)}
	{...restProps}
>
	{#if open}
		{#if measured}
			<!-- do not hide until outro transition finishes -->
			<div
				data-popover-box
				data-arrow={showArrow || undefined}
				data-effective-side={showArrow ? effectiveSide : undefined}
				class={className}
				{style}
				transition:transition
				onoutroend={() => {
					popoverEl?.hidePopover();
					measured = false;
				}}
			>
				{@render children?.()}
			</div>
		{:else}
			<!--  sizer: gives popover dimensions so position-area can resolve and we can measure;
						parent popover has visibility:hidden so this is not painted -->
			<div data-popover-box class={className} aria-hidden="true">
				{@render children?.()}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* ── Base popover reset ─────────────────────────────────────────────────── */
	[data-popover] {
		inset: auto;
		margin: 0;
		outline: hidden;
		overflow: clip;
		/* combines user gap + arrow clearance. arrow is a 45° rotated square of side
		   --arrow-size centered on the box edge, so it protrudes by half its diagonal
		   ≈ 0.707 × --arrow-size. */
		--popover-offset: calc(var(--popover-gap, 0px) + var(--arrow-size, 0px) * 0.707);

		&[data-arrow] {
			overflow: visible;
		}
	}

	/* ── Popover Box (inner styled wrapper) + ::after arrow ─────────────────── */
	[data-popover-box] {
		position: relative;
	}

	[data-popover-box][data-arrow]::after {
		content: '';
		position: absolute;
		width: var(--arrow-size, 8px);
		height: var(--arrow-size, 8px);
		background-color: inherit;
		border: inherit;
	}

	[data-popover-box][data-arrow][data-effective-side='top']::after {
		bottom: calc(-1 * var(--arrow-size, 8px) / 2);
		left: 50%;
		transform: translate(-50%, 0) rotate(45deg);
		border-top-color: transparent;
		border-left-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='bottom']::after {
		top: calc(-1 * var(--arrow-size, 8px) / 2);
		left: 50%;
		transform: translate(-50%, 0) rotate(45deg);
		border-bottom-color: transparent;
		border-right-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='left']::after {
		right: calc(-1 * var(--arrow-size, 8px) / 2);
		top: 50%;
		transform: translate(0, -50%) rotate(45deg);
		border-bottom-color: transparent;
		border-left-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='right']::after {
		left: calc(-1 * var(--arrow-size, 8px) / 2);
		top: 50%;
		transform: translate(0, -50%) rotate(45deg);
		border-top-color: transparent;
		border-right-color: transparent;
	}

	/* ── Placement (CSS Anchor Positioning) ─────────────────────────────────── */
	/*
	 * inset-area is the Chrome 125–128 name; position-area is Chrome 129+.
	 * position-try-options is the Chrome 125–128 name; position-try-fallbacks is 129+.
	 * Both are listed so the rules work across all supporting versions.
	 *
	 * Base rules position the popover at the declared side. .anchorPositioned
	 * adds fallbacks so the browser can flip when the popover would overflow.
	 */

	.placement-top {
		inset-area: top; /* <-- for Chrome 125–128 */
		position-area: top; /* <-- for Chrome 129+ */
		margin-block-start: var(--viewport-margin, 0px);
		margin-block-end: var(--popover-offset);
		&:is(.anchorPositioned) {
			position-try-options: flip-block; /* <-- for Chrome 125–128 */
			position-try-fallbacks: flip-block; /* <-- for Chrome 129+ */
		}
	}
	.placement-bottom {
		inset-area: bottom;
		position-area: bottom;
		margin-block-start: var(--popover-offset);
		margin-block-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options: flip-block;
			position-try-fallbacks: flip-block;
		}
	}

	.placement-left {
		inset-area: left;
		position-area: left;
		margin-inline-start: var(--viewport-margin, 0px);
		margin-inline-end: var(--popover-offset);
		&:is(.anchorPositioned) {
			position-try-options: flip-inline;
			position-try-fallbacks: flip-inline;
		}
	}
	.placement-right {
		inset-area: right;
		position-area: right;
		margin-inline-start: var(--popover-offset);
		margin-inline-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options: flip-inline;
			position-try-fallbacks: flip-inline;
		}
	}

	.placement-top-start {
		inset-area: top span-right;
		position-area: top span-right;
		justify-self: start;
		margin-block-start: var(--viewport-margin, 0px);
		margin-block-end: var(--popover-offset);
		margin-inline-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-inline,
				flip-block,
				flip-inline flip-block;
			position-try-fallbacks:
				flip-inline,
				flip-block,
				flip-inline flip-block;
		}
	}
	.placement-top-end {
		inset-area: top span-left;
		position-area: top span-left;
		justify-self: end;
		margin-block-start: var(--viewport-margin, 0px);
		margin-block-end: var(--popover-offset);
		margin-inline-start: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-inline,
				flip-block,
				flip-inline flip-block;
			position-try-fallbacks:
				flip-inline,
				flip-block,
				flip-inline flip-block;
		}
	}

	.placement-bottom-start {
		inset-area: bottom span-right;
		position-area: bottom span-right;
		justify-self: start;
		margin-block-start: var(--popover-offset);
		margin-block-end: var(--viewport-margin, 0px);
		margin-inline-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-inline,
				flip-block,
				flip-inline flip-block;
			position-try-fallbacks:
				flip-inline,
				flip-block,
				flip-inline flip-block;
		}
	}
	.placement-bottom-end {
		inset-area: bottom span-left;
		position-area: bottom span-left;
		justify-self: end;
		margin-block-start: var(--popover-offset);
		margin-block-end: var(--viewport-margin, 0px);
		margin-inline-start: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-inline,
				flip-block,
				flip-inline flip-block;
			position-try-fallbacks:
				flip-inline,
				flip-block,
				flip-inline flip-block;
		}
	}

	.placement-left-start {
		inset-area: left span-bottom;
		position-area: left span-bottom;
		align-self: start;
		margin-inline-start: var(--viewport-margin, 0px);
		margin-inline-end: var(--popover-offset);
		margin-block-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-block,
				flip-inline,
				flip-block flip-inline;
			position-try-fallbacks:
				flip-block,
				flip-inline,
				flip-block flip-inline;
		}
	}
	.placement-left-end {
		inset-area: left span-top;
		position-area: left span-top;
		align-self: end;
		margin-inline-start: var(--viewport-margin, 0px);
		margin-inline-end: var(--popover-offset);
		margin-block-start: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-block,
				flip-inline,
				flip-block flip-inline;
			position-try-fallbacks:
				flip-block,
				flip-inline,
				flip-block flip-inline;
		}
	}

	.placement-right-start {
		inset-area: right span-bottom;
		position-area: right span-bottom;
		align-self: start;
		margin-inline-start: var(--popover-offset);
		margin-inline-end: var(--viewport-margin, 0px);
		margin-block-end: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-block,
				flip-inline,
				flip-block flip-inline;
			position-try-fallbacks:
				flip-block,
				flip-inline,
				flip-block flip-inline;
		}
	}
	.placement-right-end {
		inset-area: right span-top;
		position-area: right span-top;
		align-self: end;
		margin-inline-start: var(--popover-offset);
		margin-inline-end: var(--viewport-margin, 0px);
		margin-block-start: var(--viewport-margin, 0px);
		&:is(.anchorPositioned) {
			position-try-options:
				flip-block,
				flip-inline,
				flip-block flip-inline;
			position-try-fallbacks:
				flip-block,
				flip-inline,
				flip-block flip-inline;
		}
	}

	/* ── Match anchor size ──────────────────────────────────────────────────── */
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	).match-size {
		width: anchor-size(width);
	}

	:is(
		.placement-left,
		.placement-left-start,
		.placement-left-end,
		.placement-right,
		.placement-right-start,
		.placement-right-end
	).match-size {
		height: anchor-size(height);

		& > [data-popover-box] {
			height: 100%;
		}
	}

	/* ── Resize constraints ─────────────────────────────────────────────────── */
	/*
	 * Pin the far viewport edge so the popover can't overflow, then let the
	 * inner div scroll. overflow:clip on the popover itself keeps transitions
	 * from creating unwanted scrollbars.
	 */

	/* 	/§ width: pin the inline far-edge §/
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	).resize-width {
		inset-inline: 8px;
	}
	:is(.placement-left, .placement-left-start, .placement-left-end).resize-width {
		inset-inline-start: 8px;
	}
	:is(.placement-right, .placement-right-start, .placement-right-end).resize-width {
		inset-inline-end: 8px;
	}

	/§ height: pin the block far-edge §/
	:is(.placement-top, .placement-top-start, .placement-top-end).resize-height {
		inset-block-start: 8px;
	}
	:is(.placement-bottom, .placement-bottom-start, .placement-bottom-end).resize-height {
		inset-block-end: 8px;
	}
	:is(
		.placement-left,
		.placement-left-start,
		.placement-left-end,
		.placement-right,
		.placement-right-start,
		.placement-right-end
	).resize-height {
		inset-block: 8px;
	}

	/§ scroll on the inner div §/
	.resize-width > div {
		width: 100%;
		overflow-x: auto;
	}
	.resize-height > div {
		height: 100%;
		overflow-y: auto;
	} */
</style>
