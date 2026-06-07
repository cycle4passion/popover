<script module lang="ts">
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

	export type Side = 'top' | 'bottom' | 'left' | 'right';
	export type Placement = Side | `${Side}-${'start' | 'end'}`;
	export type TriggerBy = 'click' | 'hover';
</script>

<script lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import { portal as attachPortal, type PortalOptions } from '$lib/attachments/portal';
	import { cls } from '@layerstack/tailwind';
	import { composeTransitions } from '$lib/transitions/composeTransitions';
	import { scale } from 'svelte/transition';
	import { slidefrom } from '$lib/transitions/slidefrom';
	import { arrow as arrowSnippet, arrowSizePx, type ArrowSize } from '$lib/components/Arrow.svelte';

	type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;

	type Props = {
		/** Whether the popover is visible. Bindable. */
		open?: boolean;
		/** Show a directional arrow connecting the popover to its anchor. Pass `true` for default 'md' size, or 'sm' | 'md' | 'lg'. CSS vars --arrow-size (px), --arrow-bg, --arrow-border-color, --arrow-border-width control appearance. @default false */
		arrow?: boolean | ArrowSize;
		/** Preferred placement relative to the anchor. May be flipped by the browser when space is constrained; the arrow follows the actual rendered side. @default 'top' */
		placement?: Placement;
		/** Gap in pixels between the popover and its anchor. @default 0 */
		offset?: number;
		/** Popovers sharing the same group name open and close together. */
		group?: string;
		/** ID of the anchor element. Defaults to the previous sibling. */
		anchorEl?: string;
		/** What interaction opens the popover. @default 'click' */
		triggerBy?: TriggerBy;
		/** When true, the popover width matches its anchor's width. @default false */
		matchWidth?: boolean;
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

	let popoverEl: HTMLElement | null = null;
	const anchorName = `--popover-anchor-${crypto.randomUUID().slice(0, 8)}`;

	let {
		open = $bindable(false),
		placement = 'top' as Placement,
		offset = 0,
		group,
		anchorEl,
		triggerBy = 'click',
		matchWidth = false,
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
	const transition = $derived(transitionProp ?? composeTransitions([slidefrom('top'), scale]));

	const arrowSize: ArrowSize | null = $derived(
		arrow === false ? null : arrow === true ? 'md' : arrow
	);
	const showArrow = $derived(arrowSize !== null);

	let liveArrowSize = $state<ArrowSize | null>(null);
	$effect.pre(() => {
		if (open) liveArrowSize = arrowSize;
	});

	const declaredSide = $derived(placement.split('-')[0] as Side);
	let effectiveSide = $derived<Side>(declaredSide);
	$effect(() => {
		effectiveSide = declaredSide;
	});

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
			if (matchWidth) {
				el.style.width = `${target.offsetWidth}px`;
			} else {
				el.style.removeProperty('width');
			}
		});

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			return popoverEvents(target, el);
		});

		$effect(() => openEvents());

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			if (!open || !showArrow) return;
			let rafId = 0;
			const tick = () => {
				const a = target.getBoundingClientRect();
				const p = el.getBoundingClientRect();
				let next: Side = declaredSide;
				if (p.bottom <= a.top) next = 'top';
				else if (p.top >= a.bottom) next = 'bottom';
				else if (p.right <= a.left) next = 'left';
				else if (p.left >= a.right) next = 'right';
				if (next !== effectiveSide) effectiveSide = next;
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
			className.split(/\s+/).filter(Boolean),
			isDark
		);

		if (!style.includes('--arrow-ring')) {
			if (ringColor !== undefined) {
				popoverEl.style.setProperty('--arrow-ring-color', ringColor);
				popoverEl.style.setProperty('--arrow-ring-width', ringWidth ?? '2px');
			} else {
				popoverEl.style.removeProperty('--arrow-ring-color');
				popoverEl.style.removeProperty('--arrow-ring-width');
			}
		}

		if (!style.includes('--arrow-shadow')) {
			if (dropShadow !== undefined) {
				popoverEl.style.setProperty('--arrow-shadow', dropShadow);
			} else {
				popoverEl.style.removeProperty('--arrow-shadow');
			}
		}
	});
</script>

<svelte:window onkeydown={onKeydown} />
<div
	bind:this={popoverEl}
	data-popover
	data-popover-group={group || undefined}
	data-resize={resize || undefined}
	data-arrow={showArrow || undefined}
	data-effective-side={showArrow ? effectiveSide : undefined}
	popover="manual"
	class={cls('Popover', `placement-${placement}`, className)}
	style={cls(`position-anchor: ${anchorName}; --popover-offset: ${offset}px;`, arrowSize && `--arrow-size:${arrowSizePx[arrowSize]}px;`, style)}
	ontoggle={(e) => (open = e.newState === 'open')}
	{@attach attachAnchor}
	{@attach attachPortal(portal)}
	{...restProps}
>
	{#if open}
		<!-- do not hide until outro transition finishes -->
		<div
			style={liveArrowSize ? 'position:relative;' : ''}
			transition:transition
			onoutroend={() => {
				liveArrowSize = null;
				popoverEl?.hidePopover();
			}}
		>
			{@render children?.()}
			{#if liveArrowSize}{@render arrowSnippet(effectiveSide, liveArrowSize)}{/if}
		</div>
	{/if}
</div>

<style>
	[data-popover] {
		/* inset: auto; */
		/* 		margin: 0;
		outline: hidden;
		overflow: clip; */
		--_popover-margin: var(--popover-offset, 0px);
	}

	[data-popover][data-arrow] {
		overflow: visible;
		--_popover-margin: calc(var(--popover-offset, 0px) + var(--arrow-size, 8px));
	}

	/* width resize: pin inline edge to viewport; overflow on inner div to avoid transition scrollbars */
	:is(.placement-right, .placement-right-start, .placement-right-end):is(
		[data-resize='true'],
		[data-resize='width']
	) {
		inset-inline-end: 8px;
	}
	:is(.placement-left, .placement-left-start, .placement-left-end):is(
		[data-resize='true'],
		[data-resize='width']
	) {
		inset-inline-start: 8px;
	}
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	):is([data-resize='true'], [data-resize='width']) {
		inset-inline: 8px;
	}

	/* height resize: pin block edge to viewport */
	:is(.placement-bottom, .placement-bottom-start, .placement-bottom-end):is(
		[data-resize='true'],
		[data-resize='height']
	) {
		inset-block-end: 8px;
	}
	:is(.placement-top, .placement-top-start, .placement-top-end):is(
		[data-resize='true'],
		[data-resize='height']
	) {
		inset-block-start: 8px;
	}
	:is(
		.placement-left,
		.placement-left-start,
		.placement-left-end,
		.placement-right,
		.placement-right-start,
		.placement-right-end
	):is([data-resize='true'], [data-resize='height']) {
		inset-block: 8px;
	}

	/* scroll on the inner div — popover keeps overflow:clip so transitions don't create scrollbars */
	[data-resize='true'] > div,
	[data-resize='width'] > div {
		width: 100%;
		overflow-x: auto;
	}
	[data-resize='true'] > div,
	[data-resize='height'] > div {
		height: 100%;
		overflow-y: auto;
	}

	.placement-top {
		position-area: top;
		position-try-fallbacks: flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.placement-bottom {
		position-area: bottom;
		position-try-fallbacks: flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.placement-left {
		position-area: left;
		position-try-fallbacks: flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.placement-right {
		position-area: right;
		position-try-fallbacks: flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
	.placement-top-start {
		position-area: top span-right;
		justify-self: start;
		position-try-fallbacks: flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.placement-top-end {
		position-area: top span-left;
		justify-self: end;
		position-try-fallbacks: flip-block;
		margin-block-end: var(--_popover-margin);
	}
	.placement-bottom-start {
		position-area: bottom span-right;
		justify-self: start;
		position-try-fallbacks: flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.placement-bottom-end {
		position-area: bottom span-left;
		justify-self: end;
		position-try-fallbacks: flip-block;
		margin-block-start: var(--_popover-margin);
	}
	.placement-left-start {
		position-area: left span-bottom;
		align-self: start;
		position-try-fallbacks: flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.placement-left-end {
		position-area: left span-top;
		align-self: end;
		position-try-fallbacks: flip-inline;
		margin-inline-end: var(--_popover-margin);
	}
	.placement-right-start {
		position-area: right span-bottom;
		align-self: start;
		position-try-fallbacks: flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
	.placement-right-end {
		position-area: right span-top;
		align-self: end;
		position-try-fallbacks: flip-inline;
		margin-inline-start: var(--_popover-margin);
	}
</style>
