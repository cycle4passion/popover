<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import type { TransitionInput } from '$lib/transitions/composeTransitions';

	export type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
	export type Side = 'top' | 'bottom' | 'left' | 'right';
	export type Placement = Side | `${Side}-${'start' | 'end'}`;
	export type TriggerBy = 'click' | 'hover';
	export type ArrowSize = 'sm' | 'md' | 'lg';

	export const arrowSizePx = { sm: 10, md: 14, lg: 18 } satisfies Record<ArrowSize, number>;

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
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { portal as attachPortal, type PortalOptions } from '$lib/attachments/portal';
	import { cls } from '@layerstack/tailwind';

	import { normalizeTransition } from './popover';

	type Props = {
		/** Whether the popover is visible. Bindable. */
		open?: boolean;
		/** Preferred placement relative to the anchor. May be flipped by the browser when space is constrained; the arrow follows the actual rendered side. @default 'top' */
		placement?: Placement;
		/** Whether to use Anchor positioning API. @default true */
		autoPlacement?: boolean;
		/** Show a directional arrow connecting the popover to its anchor. Pass `true` for default 'md' size, or 'sm' | 'md' | 'lg'. The arrow inherits bg/border/drop-shadow from the Popover Box via CSS; override its size with the `--arrow-size` CSS var. @default false */
		arrow?: boolean | ArrowSize;
		/** Gap in pixels between the popover and its anchor. @default 0 */
		offset?: number;
		/** Popovers sharing the same group name open and close together. */
		group?: string;
		/** ID of the anchor element. Defaults to the previous sibling. */
		anchorEl?: string;
		/** What interaction opens the popover. @default 'click' */
		triggerBy?: TriggerBy;
		/**
		 * Sizing mode. Both `'match'` and `'expand'` pin the side (disable autoplacement
		 * flipping) and only CONSTRAIN the box — your content owns scrolling (set
		 * `overflow: auto` on it).
		 *   • `'match'`  — dropdown-style: the cross axis matches the anchor (top/bottom →
		 *     width; left/right → height); the main axis caps to the anchor→viewport gap.
		 *   • `'expand'` — the cross axis fills to the viewport edge (less `viewportMargin`)
		 *     instead of matching the anchor; the main axis caps the same as `'match'`.
		 * @default 'none'
		 */
		sizing?: 'none' | 'match' | 'expand' | `${number}%` | number;
		/** Minimum margin in pixels between the popover and the viewport edge. Used by autoPlacement and by the `match`/`expand` sizing clamps. @default 8 */
		viewportMargin?: number;
		/** Maximum viewport ratio for top/bottom width or left/right height. Accepts `0.75` or `'75%'`. @default 0.75 */
		viewportRatio?: `${number}%` | number;
		portal?: PortalOptions | boolean;
		/** Additional CSS classes. `root` targets the outer positioning element; `box` targets the popover box — bg/border set here are inherited by the `::after` arrow. */
		classes?: { root?: string; box?: string };
		/**
		 * Svelte transition for open/close. Accepts a single transition function,
		 * a `[fn, params]` tuple, or an array of either — multiple transitions are
		 * composed to run in parallel. `slide`/`fly` are upgraded to side-aware
		 * variants that animate from the anchor side.
		 * @example transition={fade}
		 * @example transition={[fade, { duration: 150 }]}
		 * @example transition={[fly, [scale, { start: 0.9 }]]}
		 * @default fly + scale — flies in from the anchor side while scaling/fading in
		 */
		transition?: TransitionFn | TransitionInput;
		children?: Snippet;
	} & Record<string, unknown>;

	let popoverEl = $state<HTMLElement | null>(null);
	const anchorName = `--popover-anchor-${crypto.randomUUID().slice(0, 8)}`;

	let {
		open = $bindable(false),
		placement = 'bottom' as Placement,
		autoPlacement = true,
		arrow = false,
		offset = 0,
		group,
		anchorEl,
		triggerBy = 'click',
		sizing = 'none' as 'none' | 'match' | 'expand' | `${number}%` | number,
		viewportMargin = 8,
		portal = false,
		viewportRatio = 0.75,
		classes = {} as { root?: string; box?: string },
		transition: transitionProp = undefined,
		children,
		...restProps
	}: Props = $props();

	const declaredSide = $derived(placement.split('-')[0] as Side);

	// Autoplacement under a sizing mode: the clamp stops the box from ever overflowing,
	// so the native overflow-flip never fires. Instead we flip the *side* in JS when the
	// declared side is genuinely cramped — declared-side preference, <select>-style.
	// MIN_SIZE is the minimum usable main-axis space (px) before we look to flip; the
	// flip only happens if the opposite side is actually roomier (never into a smaller
	// side). Flipping swaps the placement class, which reuses every per-placement rule
	// (position-area, margins, match/expand fill) for the opposite side — no extra CSS.
	const MIN_SIZE = 144;
	const DEFAULT_VIEWPORT_RATIO = 0.75;
	function toViewportRatio(value: `${number}%` | number | undefined): number {
		if (value === undefined || value === null) return DEFAULT_VIEWPORT_RATIO;
		if (typeof value === 'number') {
			if (!Number.isFinite(value)) return DEFAULT_VIEWPORT_RATIO;
			return value > 1 ? Math.min(value / 100, 1) : Math.max(Math.min(value, 1), 0);
		}
		const raw = value.trim();
		const isPercent = raw.endsWith('%');
		const parsed = parseFloat(isPercent ? raw.slice(0, -1) : raw);
		if (!Number.isFinite(parsed)) return DEFAULT_VIEWPORT_RATIO;
		const ratio = isPercent ? parsed / 100 : parsed;
		return ratio > 1 ? Math.min(ratio / 100, 1) : Math.max(Math.min(ratio, 1), 0);
	}
	// sizing may itself be a ratio (e.g. '75%' or 0.75). If so we treat the
	// explicit sizing modes ('match'/'expand'/'none') as unset and derive the
	// viewport ratio from the sizing value. `sizingMode` normalizes to the three
	// canonical modes for internal checks.
	const sizingMode = $derived(() =>
		typeof sizing === 'string' && (sizing === 'none' || sizing === 'match' || sizing === 'expand')
			? sizing
			: 'none'
	);

	const viewportRatioValue = $derived(() => {
		if (typeof sizing === 'number' || (typeof sizing === 'string' && sizing.trim().endsWith('%'))) {
			return toViewportRatio(sizing as `${number}%` | number | undefined);
		}
		return toViewportRatio(viewportRatio);
	});
	const flipSide: Record<Side, Side> = {
		top: 'bottom',
		bottom: 'top',
		left: 'right',
		right: 'left'
	};
	let sizeFlip = $state(false);
	const effectivePlacement = $derived<Placement>(
		autoPlacement && sizingMode() !== 'none' && sizeFlip
			? ((flipSide[declaredSide] +
					(placement.includes('-') ? placement.slice(placement.indexOf('-')) : '')) as Placement)
			: placement
	);

	// Gates the transitioning Popover Box until the side has been measured from the
	// actually-rendered popover position. Without this, the intro transition plays from
	// declaredSide for one frame after a CSS flip.
	let measured = $state(false);

	// In a sizing mode WE own the flip (no CSS position-try), so the rendered side is
	// exactly effectivePlacement's side — derive it directly so the arrow's side moves
	// in the same reactive flush as the box's position (no transient wrong-side arrow on
	// flip). For sizing:none the browser flips, so fall back to the measured side.
	let measuredSide = $state<Side>('bottom');
	const effectiveSide = $derived<Side>(
		sizingMode() !== 'none'
			? (effectivePlacement.split('-')[0] as Side)
			: measured
				? measuredSide
				: declaredSide
	);
	const transition: TransitionFn = $derived(normalizeTransition(transitionProp, effectiveSide));
	const arrowSize: ArrowSize | null = $derived(
		arrow === false ? null : arrow === true ? 'md' : arrow
	);
	const showArrow = $derived(arrowSize !== null);
	const viewportConstraint = $derived(() => {
		const pct = viewportRatioValue() * 100;
		// Apply both constraints so popovers on any side cannot exceed the
		// specified viewport fraction in either dimension. This prevents left/right
		// popovers from growing too wide when a percent sizing is used.
		return `max-width: ${pct}vw; max-height: ${pct}vh;`;
	});

	let dropShadow = $state('');

	function popoverEvents(anchor: HTMLElement, el: HTMLElement) {
		/* Hover Related Events */
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

	// Converts a computed box-shadow value to a CSS filter: drop-shadow() list.
	// drop-shadow() takes "x y blur color" with no spread radius.
	function boxShadowToFilter(boxShadow: string): string {
		if (!boxShadow || boxShadow === 'none') return '';
		return boxShadow
			.split(/,(?![^(]*\))/)
			.map((s) => {
				s = s.trim();
				// Extract color (function call or hex); remaining tokens are lengths
				const colorMatch = s.match(/[a-z]+\([^)]*\)|#[\da-fA-F]{3,8}/i);
				if (!colorMatch) return '';
				const color = colorMatch[0];
				const lengths = s.replace(color, '').trim().split(/\s+/).filter(Boolean);
				if (lengths.length < 2) return '';
				// lengths: [x, y, blur?, spread?] — spread (index 3) is intentionally ignored
				const [x, y, blur = '0'] = lengths;
				return `drop-shadow(${x} ${y} ${blur} ${color})`;
			})
			.filter(Boolean)
			.join(' ');
	}

	function attachAnchor(el: HTMLElement) {
		const target = anchorEl ? document.getElementById(anchorEl) : el.previousElementSibling;
		if (target instanceof HTMLElement) {
			target.style.setProperty('anchor-name', anchorName);
		}

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			dropShadow = boxShadowToFilter(getComputedStyle(target).boxShadow);
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
				el.style.removeProperty('--arrow-x');
				el.style.removeProperty('--arrow-y');
				return;
			}
			// Detect the actually-rendered side (the browser may flip it via
			// position-try-fallbacks). effectiveSide is discrete, so it is immune to
			// the sub-pixel scroll lag that affects the arrow below. Returns whether
			// the side changed this call.
			const measureSide = (): boolean => {
				const a = target.getBoundingClientRect();
				const p = el.getBoundingClientRect();
				if (p.width === 0 && p.height === 0) return false;
				let next: Side = declaredSide;
				if (p.bottom <= a.top) next = 'top';
				else if (p.top >= a.bottom) next = 'bottom';
				else if (p.right <= a.left) next = 'left';
				else if (p.left >= a.right) next = 'right';
				if (!measured) measured = true;
				if (next === measuredSide) return false;
				// TEMP DEBUG: capture geometry on every browser flip to diagnose oscillation
				console.log('FLIP_DBG', placement, `${measuredSide}->${next}`, {
					vh: window.innerHeight,
					aTop: Math.round(a.top),
					aBottom: Math.round(a.bottom),
					pTop: Math.round(p.top),
					pBottom: Math.round(p.bottom),
					pH: Math.round(p.height),
					roomAbove: Math.round(a.top),
					roomBelow: Math.round(window.innerHeight - a.bottom),
					overflowsTopSide: p.height > a.top,
					overflowsBottomSide: p.height > window.innerHeight - a.bottom
				});
				measuredSide = next;
				return true;
			};

			// Declared-side preference under a sizing mode (see sizeFlip / MIN_SIZE):
			// flip the main-axis side only when the declared side is cramped (< MIN_SIZE)
			// AND the opposite side is roomier — but NOT if the content already fits the
			// declared side (a short popover in a tight space needn't move). Gaps are pure
			// anchor geometry; the fit check reads the rendered box, which under the clamp
			// grows to the content size up to the gap, so boxMain < gap ⇒ it fit.
			const measureFlip = () => {
				if (!(autoPlacement && sizingMode() !== 'none')) {
					sizeFlip = false;
					return;
				}
				const a = target.getBoundingClientRect();
				// Usable content space on a side: anchor→viewport-edge gap, less the near
				// margin (offset + the arrow's diagonal inset) and the far viewport margin.
				const near = offset + (showArrow ? arrowSizePx[arrowSize!] * 0.707 : 0);
				const gap = (side: Side): number => {
					switch (side) {
						case 'top':
							return a.top - viewportMargin - near;
						case 'bottom':
							return window.innerHeight - a.bottom - viewportMargin - near;
						case 'left':
							return a.left - viewportMargin - near;
						case 'right':
							return window.innerWidth - a.right - viewportMargin - near;
					}
				};
				const here = gap(declaredSide);
				const cramped = here < MIN_SIZE && gap(flipSide[declaredSide]) > here;
				if (sizeFlip) {
					// Already flipped: hold it only while the declared side stays cramped.
					sizeFlip = cramped;
				} else {
					// On the declared side: skip the flip if the content already fits here.
					const p = el.getBoundingClientRect();
					const boxMain = declaredSide === 'top' || declaredSide === 'bottom' ? p.height : p.width;
					const fits = boxMain <= 0 || boxMain < here - 1;
					sizeFlip = !fits && cramped;
				}
			};

			// Center the arrow on the anchor, clamped to the popover's edges. The
			// popover is rigidly anchored to the anchor, so this offset is invariant
			// under scroll — we recompute it ONLY when the geometry actually changes
			// (open, flip, resize), never per frame. Per-frame writes were what made
			// the arrow jitter while scrolling: the popover's main-thread rect lags
			// its compositor-scrolled position, so the anchor−popover delta oscillated.
			const positionArrow = () => {
				if (!showArrow) return;
				const a = target.getBoundingClientRect();
				const p = el.getBoundingClientRect();
				if (p.width === 0 && p.height === 0) return;
				const edge = arrowSizePx[arrowSize!];
				el.style.setProperty(
					'--arrow-x',
					`${Math.round(Math.max(edge, Math.min(a.left + a.width / 2 - p.left, p.width - edge)))}px`
				);
				el.style.setProperty(
					'--arrow-y',
					`${Math.round(Math.max(edge, Math.min(a.top + a.height / 2 - p.top, p.height - edge)))}px`
				);
			};

			// Synchronous first measurement — openEvents effect already ran showPopover,
			// and the !measured branch has rendered a sizer so the popover has dimensions.
			measureFlip();
			measureSide();
			positionArrow();

			// Watch for flips each frame (cheap, lag-immune) and reposition the arrow
			// only when the side actually flips. measureFlip re-decides the sizing-mode
			// side from anchor geometry as the user scrolls.
			let rafId = 0;
			const tick = () => {
				measureFlip();
				if (measureSide()) positionArrow();
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);

			// Reposition when the anchor or popover changes size (match-size,
			// content changes) — these are not captured by the flip check above.
			const ro = new ResizeObserver(() => positionArrow());
			ro.observe(target);
			ro.observe(el);

			return () => {
				cancelAnimationFrame(rafId);
				ro.disconnect();
			};
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
		// Without a sizing mode, autoplacement flips on overflow (full flip chain via
		// .anchorPositioned). With a sizing mode the box never overflows (it clamps +
		// scrolls), so we flip the side in JS instead (see sizeFlip / effectivePlacement)
		// and render the flipped placement class. autoPlacement off keeps the side pinned.
		autoPlacement && sizingMode() === 'none' && 'anchorPositioned',
		`placement-${effectivePlacement}`,
		sizingMode() === 'match' && 'match-size',
		sizingMode() === 'expand' && 'expand',
		classes.root
	)}
	style={cls(
		`position-anchor: ${anchorName}; --popover-gap: ${offset}px; --viewport-margin: ${viewportMargin}px; --popover-max-width: ${DEFAULT_VIEWPORT_RATIO * 100}vw; --popover-max-height: ${DEFAULT_VIEWPORT_RATIO * 100}vh;`,
		arrowSize && `--arrow-size:${arrowSizePx[arrowSize]}px;`,
		dropShadow && `--popover-drop-shadow:${dropShadow};`,
		viewportConstraint(),
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
				class={classes.box}
				style={viewportConstraint()}
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
			<div data-popover-box class={classes.box} aria-hidden="true" style={viewportConstraint()}>
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
		filter: var(--popover-drop-shadow, none);
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

	:is(
			.placement-top,
			.placement-top-start,
			.placement-top-end,
			.placement-bottom,
			.placement-bottom-start,
			.placement-bottom-end
		)
		> [data-popover-box] {
		max-width: var(--popover-max-width);
	}

	:is(
			.placement-left,
			.placement-left-start,
			.placement-left-end,
			.placement-right,
			.placement-right-start,
			.placement-right-end
		)
		> [data-popover-box] {
		max-height: var(--popover-max-height);
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
		left: var(--arrow-x, 50%);
		transform: translate(-50%, 0) rotate(45deg);
		border-top-color: transparent;
		border-left-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='bottom']::after {
		top: calc(-1 * var(--arrow-size, 8px) / 2);
		left: var(--arrow-x, 50%);
		transform: translate(-50%, 0) rotate(45deg);
		border-bottom-color: transparent;
		border-right-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='left']::after {
		right: calc(-1 * var(--arrow-size, 8px) / 2);
		top: var(--arrow-y, 50%);
		transform: translate(0, -50%) rotate(45deg);
		border-bottom-color: transparent;
		border-left-color: transparent;
	}

	[data-popover-box][data-arrow][data-effective-side='right']::after {
		left: calc(-1 * var(--arrow-size, 8px) / 2);
		top: var(--arrow-y, 50%);
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

	/* ── Sizing modes (match-size / expand) ──────────────────────────────────────
	 *
	 * Both require a pinned side (the `.anchorPositioned` flip fallbacks are withheld
	 * when either is set, see the class list above), so `position-area` holds the
	 * popover on its declared side. Its containing block is then the position-area
	 * region — the space between the anchor and the viewport edge on the MAIN axis,
	 * and (by default) the anchor's extent on the CROSS axis. We size against that
	 * purely in CSS:
	 *   • Main axis  → `max-*: stretch` (caps the margin box to the anchor→edge gap).
	 *   • Cross axis → `match`:  `anchor-size`     (matches the anchor exactly).
	 *                  `expand`: `stretch` to fill from the anchor's near edge to the
	 *                            far viewport edge (centered placements borrow their
	 *                            -start variant's span so they grow from the anchor).
	 * The popover only CONSTRAINS its size; the consumer owns `overflow` on their
	 * content. The Box stays `overflow: visible` so the ::after arrow escapes the
	 * clamp (see the base [data-popover][data-arrow] rule).
	 */

	/* Lists reused below. */
	/* Match anchor size: cross axis exact, main axis clamped to the viewport gap. */
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	).match-size {
		width: anchor-size(width); /* cross */
		max-height: stretch; /* main */
	}

	:is(
		.placement-left,
		.placement-left-start,
		.placement-left-end,
		.placement-right,
		.placement-right-start,
		.placement-right-end
	).match-size {
		height: anchor-size(height); /* cross */
		max-width: stretch; /* main */
	}

	/* expand: cross axis fills to the viewport edge (instead of matching the anchor);
	   main axis caps to the anchor→edge gap, same as match-size.
	   NB the two axes need DIFFERENT fill mechanisms (verified in-browser):
	     • top/bottom (cross = inline): `justify-self: stretch` fills the region and the
	       Box, a block child, follows on the inline axis automatically.
	     • left/right (cross = block): inline `stretch` alignment does NOT carry to the
	       Box's height, so park it (`align-self: start`) and size it with the `height:
	       stretch` keyword instead. (The flex-bound rule below then fills the Box.) */
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	).expand {
		justify-self: stretch; /* cross: fill the inline region (block child fills width) */
		max-height: stretch; /* main: cap */
	}
	:is(
		.placement-left,
		.placement-left-start,
		.placement-left-end,
		.placement-right,
		.placement-right-start,
		.placement-right-end
	).expand {
		align-self: start; /* cross: park at region start so height:stretch can fill it */
		height: stretch; /* cross: fill the block region */
		max-width: stretch; /* main: cap */
	}

	/* The aligned (-start/-end) variants already span from the anchor's near edge to
	   a viewport edge, so they fill correctly from the `stretch` above. Centered
	   placements only span the anchor's cross extent, so widen them to the SAME span
	   as their -start variant (anchor near-edge → far viewport edge) and add the
	   matching far-edge margin. The fill is anchored to the trigger and grows toward
	   the far edge — it is not symmetric across the viewport. */
	.placement-left.expand,
	.placement-right.expand {
		inset-area: var(--expand-inset); /* Chrome 125–128 */
		position-area: var(--expand-inset); /* Chrome 129+ */
		margin-block-end: var(--viewport-margin, 0px); /* far (bottom) edge */
	}
	.placement-left.expand {
		--expand-inset: left span-bottom;
	}
	.placement-right.expand {
		--expand-inset: right span-bottom;
	}
	.placement-top.expand,
	.placement-bottom.expand {
		inset-area: var(--expand-inset);
		position-area: var(--expand-inset);
		margin-inline-end: var(--viewport-margin, 0px); /* far (right) edge */
	}
	.placement-top.expand {
		--expand-inset: top span-right;
	}
	.placement-bottom.expand {
		--expand-inset: bottom span-right;
	}

	/* match-size always gives the Box a bounded HEIGHT (top/bottom clamp it via
	   `stretch`; left/right pin it to the anchor); expand likewise bounds height
	   (top/bottom cap the main axis, left/right fill the cross axis). Flex-bound the
	   Box so consumer content with `overflow-y: auto` scrolls within the bound
	   instead of spilling. The Box stays visible so the arrow shows; the consumer's
	   scroll container is inside it. */
	:is(.match-size, .expand) {
		display: flex;
		flex-direction: column;

		& > [data-popover-box] {
			flex: 1 1 auto;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
	}
</style>
