<script module lang="ts">
	import type { TransitionFn, Placement, TriggerBy, Side } from './types';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { portal as attachPortal, type PortalOptions } from '$lib/attachments/portal';
	import { cls } from '@layerstack/tailwind';

	import Arrow, { arrowSizePx, type ArrowSize } from '$lib/components/Popover/Arrow.svelte';
	import { normalizeTransition } from './popover';

	type Props = {
		/** Whether the popover is visible. Bindable. */
		open?: boolean;
		/** Show a directional arrow connecting the popover to its anchor. Pass `true` for default 'md' size, or 'sm' | 'md' | 'lg'. CSS vars --arrow-size (px), --arrow-bg, --arrow-border-color, --arrow-border-width control appearance. @default false */
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
		/** Constrains the popover to available viewport space. 'width', 'height', or true for both. @default false */
		resize?: boolean | 'width' | 'height';
		/** Additional inline styles applied to the popover element. */
		portal?: PortalOptions | boolean;
		/** Svelte transition for open/close. @default logicalSlideFade */
		style?: string;
		/** Additional CSS classes applied to the popover element. */
		class?: string;
		/** Whether the popover is rendered in a portal. @default false */
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
		resize = false as boolean | 'width' | 'height',
		portal = false,
		style = '',
		class: className = '',
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

	let liveArrowSize = $state<ArrowSize | null>(null);
	$effect.pre(() => {
		if (open) liveArrowSize = arrowSize;
	});

	// Gates the transitioning inner div until effectiveSide has been measured
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
			if (matchSize) {
				if (effectiveSide === 'top' || effectiveSide === 'bottom') {
					el.style.width = `${target.offsetWidth}px`;
					el.style.removeProperty('height');
				} else {
					el.style.height = `${target.offsetHeight}px`;
					el.style.removeProperty('width');
				}
			} else {
				el.style.removeProperty('width');
				el.style.removeProperty('height');
			}
		});

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
	data-effective-side={showArrow ? effectiveSide : undefined}
	popover="manual"
	class={cls(
		autoPlacement && 'anchorPositioned',
		'Popover bg-transparent',
		`placement-${placement}`,
		(resize === true || resize === 'width') && 'resize-width',
		(resize === true || resize === 'height') && 'resize-height',
		className
	)}
	style={cls(
		`position-anchor: ${anchorName}; --popover-offset: ${offset}px;`,
		arrowSize && `--arrow-size:${arrowSizePx[arrowSize]}px;`,
		open && !measured && 'visibility:hidden;',
		style
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
				style={liveArrowSize ? 'position:relative;' : ''}
				transition:transition
				onoutroend={() => {
					liveArrowSize = null;
					popoverEl?.hidePopover();
					measured = false;
				}}
			>
				{@render children?.()}
				{#if liveArrowSize}
					<Arrow
						side={effectiveSide}
						size={liveArrowSize}
						{popoverEl}
						popoverClass={className}
						popoverStyle={style}
					/>
				{/if}
			</div>
		{:else}
			<!--  sizer: gives popover dimensions so position-area can resolve and we can measure;
						parent popover has visibility:hidden so this is not painted -->
			<div aria-hidden="true">
				{@render children?.()}
			</div>
		{/if}
	{/if}
</div>

<style>
	[data-popover] {
		inset: auto;
		margin: 0;
		outline: hidden;
		overflow: clip;
		--_popover-margin: var(--popover-offset, 0px);
	}

	[data-popover][data-arrow] {
		overflow: visible;
		--_popover-margin: calc(var(--popover-offset, 0px) + var(--arrow-size, 8px));
	}

	/* width resize: pin inline edge to viewport; overflow on inner div to avoid transition scrollbars */
	:is(.placement-right, .placement-right-start, .placement-right-end).resize-width {
		inset-inline-end: 8px;
	}
	:is(.placement-left, .placement-left-start, .placement-left-end).resize-width {
		inset-inline-start: 8px;
	}
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

	/* height resize: pin block edge to viewport */
	:is(.placement-bottom, .placement-bottom-start, .placement-bottom-end).resize-height {
		inset-block-end: 8px;
	}
	:is(.placement-top, .placement-top-start, .placement-top-end).resize-height {
		inset-block-start: 8px;
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

	/* scroll on the inner div — popover keeps overflow:clip so transitions don't create scrollbars */
	.resize-width > div {
		width: 100%;
		overflow-x: auto;
	}
	.resize-height > div {
		height: 100%;
		overflow-y: auto;
	}

	.anchorPositioned.placement-top {
		position-area: top;
		position-try-fallbacks: flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-bottom {
		position-area: bottom;
		position-try-fallbacks: flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.anchorPositioned.placement-left {
		position-area: left;
		position-try-fallbacks: flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-right {
		position-area: right;
		position-try-fallbacks: flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
	.anchorPositioned.placement-top-start {
		position-area: top span-right;
		justify-self: start;
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-inline flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-top-end {
		position-area: top span-left;
		justify-self: end;
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-inline flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-bottom-start {
		position-area: bottom span-right;
		justify-self: start;
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-inline flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.anchorPositioned.placement-bottom-end {
		position-area: bottom span-left;
		justify-self: end;
		position-try-fallbacks:
			flip-inline,
			flip-block,
			flip-inline flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.anchorPositioned.placement-left-start {
		position-area: left span-bottom;
		align-self: start;
		position-try-fallbacks:
			flip-block,
			flip-inline,
			flip-block flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-left-end {
		position-area: left span-top;
		align-self: end;
		position-try-fallbacks:
			flip-block,
			flip-inline,
			flip-block flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.anchorPositioned.placement-right-start {
		position-area: right span-bottom;
		align-self: start;
		position-try-fallbacks:
			flip-block,
			flip-inline,
			flip-block flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
	.anchorPositioned.placement-right-end {
		position-area: right span-top;
		align-self: end;
		position-try-fallbacks:
			flip-block,
			flip-inline,
			flip-block flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
</style>
