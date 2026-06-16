<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import type { TransitionInput } from '$lib/transitions/composeTransitions';

	export type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
	export type Side = 'top' | 'bottom' | 'left' | 'right';
	export type Placement = Side | `${Side}-${'start' | 'end'}`;
	export type TriggerBy = 'click' | 'hover';
	export type ArrowSize = 'sm' | 'md' | 'lg';

	type Props = {
		/** ID of the anchor element. Defaults to the previous sibling. */
		anchorEl?: string;
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
		 *   • a percentage (`'50%'`) — caps the box to that fraction of the viewport
		 *     in both dimensions (behaves like `'none'` otherwise).
		 *   • `'none'` (default) — natural content size; no viewport cap.
		 * @default 'none'
		 */
		sizing?: 'none' | 'match' | 'expand' | `${number}%`;
		/** Minimum margin in pixels between the popover and the viewport edge. Used by autoPlacement and by the `match`/`expand` sizing clamps. @default 8 */
		viewportMargin?: number;
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
		 * @example transition={[fly, scale]}
		 * @example transition={[fly, [scale, { start: 0.9 }]]}
		 * @default fly + scale — flies in from the anchor side while scaling/fading in
		 */
		transition?: TransitionFn | TransitionInput;
		/**
		 * Play the `transition` on close as well as open. When `false` the popover
		 * closes immediately (no outro). The intro still plays either way.
		 * @default false
		 */
		transitionOut?: boolean;
		children?: Snippet;
	} & Record<string, unknown>;

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

	export const flipSide: Record<Side, Side> = {
		top: 'bottom',
		bottom: 'top',
		left: 'right',
		right: 'left'
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { portal as attachPortal, type PortalOptions } from '$lib/attachments/portal';
	import { normalizeTransition, uid, boxShadowToFilter, play, type PlayState } from './popover';
	import { cls } from '@layerstack/tailwind';

	let {
		anchorEl,
		open = $bindable(false),
		placement = 'bottom' as Placement,
		autoPlacement = true,
		arrow = false,
		offset = 0,
		group,
		triggerBy = 'click',
		sizing = 'none' as 'none' | 'match' | 'expand' | `${number}%`,
		viewportMargin = 8,
		portal = false,
		classes = {} as { root?: string; box?: string },
		transition: transitionProp = undefined,
		transitionOut = false,
		children,
		...restProps
	}: Props = $props();

	let popoverEl = $state<HTMLElement | null>(null);
	const uidStr = uid();
	const anchorName = `--popover-anchor-${uidStr}`;
	const popoverId = `popover-${uidStr}`;
	const declaredSide = $derived(placement.split('-')[0] as Side);
	// MIN_SIZE is the minimum usable main-axis space (px) on the declared side before
	// we even consider flipping. It's the threshold in the `cramped` test and earns
	// its keep three ways (match/expand only — none/percent don't run this flip):
	//   1. Declared-side preference: we stay on the requested side while it has ≥144px,
	//      flipping only when truly tight — not just because the other side is bigger.
	//   2. Predictable placement: prevents "biggest side wins" churn, so a side with
	//      ample room isn't abandoned the instant the opposite side edges ahead.
	//   3. Flicker damping: acts as a buffer near equal gaps (anchor ~centered while
	//      scrolling/resizing) so sub-pixel changes can't oscillate the flip.
	// The flip still only fires when the opposite side is actually roomier (never into
	// a smaller side).
	const MIN_SIZE = 144;
	const sizingMode = $derived.by(() =>
		sizing === 'none' || sizing === 'match' || sizing === 'expand' ? sizing : 'none'
	);
	let sizeFlip = $state(false);
	const effectivePlacement = $derived<Placement>(
		autoPlacement && sizingMode !== 'none' && sizeFlip
			? ((flipSide[declaredSide] +
					(placement.includes('-') ? placement.slice(placement.indexOf('-')) : '')) as Placement)
			: placement
	);
	// measured gates the transitioning Popover Box until the side has been measured from the
	// actually-rendered popover position. Without this, the intro transition plays from
	// declaredSide for one frame after a CSS flip.
	let measured = $state(false);
	// In a sizing mode WE own the flip (no CSS position-try), so the rendered side is
	// exactly effectivePlacement's side — derive it directly so the arrow's side moves
	// in the same reactive flush as the box's position (no transient wrong-side arrow on
	// flip). For sizing:none the browser flips, so fall back to the measured side.
	let measuredSide = $state<Side>('bottom');
	const effectiveSide = $derived<Side>(
		sizingMode !== 'none'
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
	const viewportConstraint = $derived.by(() => {
		// Only an explicit percent sizing caps the box. `none` leaves it
		// natural-content-sized (no inline cap); `match`/`expand` cap via the CSS
		// `stretch` clamps (main axis → anchor→viewport-edge gap) — an inline vh/vw
		// cap here would OVERRIDE that stretch (inline beats the stylesheet) and let
		// the box overshoot the gap, so emit nothing and let the CSS own the sizing.
		if (!sizing.endsWith('%')) return '';
		const parsed = parseFloat(sizing);
		if (!Number.isFinite(parsed)) return '';
		const pct = Math.max(0, Math.min(100, parsed));
		// Apply both constraints so popovers on any side cannot exceed the
		// specified viewport fraction in either dimension. This prevents left/right
		// popovers from growing too wide when a percent sizing is used.
		return `max-width: ${pct}vw; max-height: ${pct}vh;`;
	});

	let dropShadow = $state('');

	// Single persistent box + manual WAAPI transitions. The box mounts once per
	// open (hidden until the side is measured, then revealed and animated), so the
	// rendered children are never re-created mid-open. The intro/outro are played
	// with node.animate() from the same normalizeTransition() configs Svelte would
	// otherwise drive via a `transition:` directive — see play() below.
	let boxEl = $state<HTMLElement | null>(null);
	let present = $state(false); // box is in the DOM (open OR an outro still playing)
	let introPlayed = false;
	let playState: PlayState = { currentAnim: null, animDir: null };

	// Focus management (click trigger only — moving focus on a hover tooltip would
	// be disruptive). On open, focus the first input in the box so click-opened
	// forms are immediately typeable. Boxes without an input are left untouched.
	function focusIntoBox() {
		if (triggerBy !== 'click' || !boxEl) return;
		boxEl.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
	}

	// Unmount + hide immediately, cancelling any in-flight animation.
	function closeNow() {
		playState.currentAnim?.cancel();
		playState.currentAnim = null;
		playState.animDir = null;
		present = false;
		measured = false;
		introPlayed = false;
		popoverEl?.hidePopover();
	}

	// Mount/unmount lifecycle. Opening mounts the box (the intro fires from the
	// measure effect, once the side is known); closing plays the outro (only when
	// `transitionOut`) then unmounts + hides the popover. Reopening mid-outro
	// interrupts it with an intro so a fast close→open can't leave the box hidden.
	$effect(() => {
		if (open) {
			if (!present) present = true;
			else if (playState.animDir === 'out' && boxEl) play(boxEl, 'in', transition, playState);
		} else if (present) {
			// transitionOut plays the outro before unmounting; otherwise (and when there's
			// nothing measured to animate yet) close immediately.
			if (transitionOut && measured && boxEl) {
				play(boxEl, 'out', transition, playState, closeNow);
			} else {
				closeNow();
			}
		}
	});

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

		/* 	Click: toggle on anchor click. The window pointerdown handler that closes on
				outside clicks early-returns for clicks on the anchor (target.contains), so
				the open-toggle here and the outside-close don't fight
		*/
		if (triggerBy === 'click') {
			const onAnchorClick = () => (open = !open);
			anchor.addEventListener('click', onAnchorClick);
			return () => anchor.removeEventListener('click', onAnchorClick);
		}
	}

	// Converts a computed box-shadow value to a CSS filter: drop-shadow() list.
	// drop-shadow() takes "x y blur color" with no spread radius.

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

		$effect(() => syncPopoverOpenState());

		$effect(() => {
			if (!(target instanceof HTMLElement) || triggerBy !== 'click') return;
			target.setAttribute('aria-controls', popoverId);
			target.setAttribute('aria-expanded', open ? 'true' : 'false');
			return () => {
				target.removeAttribute('aria-controls');
				target.removeAttribute('aria-expanded');
			};
		});

		$effect(() => {
			if (!(target instanceof HTMLElement)) return;
			// Gate on `present` (box mounted), not `open`, so the measure loop also
			// runs during an outro. Hide/unmount is owned by the lifecycle effect.
			if (!present) {
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
				// Default to the LAST measured side (declaredSide only before the first
				// measurement). During continued scrolling the anchor's and popover's
				// main-thread rects lag each other on the compositor, so for the odd frame
				// the box appears to overlap the anchor and none of the clean side checks
				// match. Holding the last side there avoids snapping the arrow back to the
				// declared side for a frame after a settled flip.
				let next: Side = measured ? measuredSide : declaredSide;
				if (p.bottom <= a.top) next = 'top';
				else if (p.top >= a.bottom) next = 'bottom';
				else if (p.right <= a.left) next = 'left';
				else if (p.left >= a.right) next = 'right';
				if (!measured) measured = true;
				if (next === measuredSide) return false;
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
				if (!(autoPlacement && sizingMode !== 'none')) {
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
						default:
							return 0; // Side is exhaustive; guard against undefined poisoning comparisons
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
			// and the persistent box (hidden until measured) gives the popover dimensions.
			measureFlip();
			measureSide();
			positionArrow();

			// The side is measured now → start the intro exactly once, from the correct
			// (post-flip) side. The box is already mounted, so children are not re-created.
			if (measured && boxEl && !introPlayed) {
				introPlayed = true;
				play(boxEl, 'in', transition, playState);
				focusIntoBox();
			}

			// Re-check the side only when the anchor can actually move relative to the
			// viewport: on scroll (capture catches any ancestor scroll container) or
			// resize. The popover itself stays attached via CSS anchor positioning, so
			// this only updates our discrete side decision (browser flip / sizing-mode
			// flip) and the arrow. A scroll burst is throttled to one rAF — idle popovers
			// do no work. The arrow offset is
			// scroll-invariant, so reposition it only when the side actually flips
			// (per-frame writes jittered it as the popover's rect lagged the scroll).
			let rafId = 0;
			const onScrollResize = () => {
				if (rafId) return;
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					measureFlip();
					if (measureSide()) positionArrow();
				});
			};
			window.addEventListener('scroll', onScrollResize, { capture: true, passive: true });
			window.addEventListener('resize', onScrollResize);

			// Reposition when the anchor or popover changes size (match-size, content
			// changes, sizing-mode fit re-check) — not captured by scroll/resize above.
			const ro = new ResizeObserver(() => {
				measureFlip();
				measureSide();
				positionArrow();
			});
			ro.observe(target);
			ro.observe(el);

			return () => {
				cancelAnimationFrame(rafId);
				window.removeEventListener('scroll', onScrollResize, { capture: true });
				window.removeEventListener('resize', onScrollResize);
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
				if (e.target.closest(`[data-popover-anchor-group="${CSS.escape(group)}"]`)) return;
				const members = document.querySelectorAll<HTMLElement>(
					`[data-popover][data-popover-group="${CSS.escape(group)}"]`
				);
				for (const member of members) {
					if (member !== el && member.contains(e.target)) return;
				}
			}
			open = false;
		}
		window.addEventListener('pointerdown', onPointerDown);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
			if (target instanceof HTMLElement) target.style.removeProperty('anchor-name');
		};
	}

	function syncPopoverOpenState() {
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
						.querySelectorAll<HTMLElement>(
							`[data-popover][data-popover-group="${CSS.escape(group)}"]`
						)
						.forEach((member) => {
							if (member !== popoverEl && !member.matches(':popover-open')) member.showPopover();
						});
				}
			}
		} else {
			if (popoverEl && group) {
				document
					.querySelectorAll<HTMLElement>(
						`[data-popover][data-popover-group="${CSS.escape(group)}"]`
					)
					.forEach((member) => {
						if (member !== popoverEl && member.matches(':popover-open')) member.hidePopover();
					});
			}
		}
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
	id={popoverId}
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
		autoPlacement && sizingMode === 'none' && 'anchorPositioned',
		`placement-${effectivePlacement}`,
		sizingMode === 'match' && 'match-size',
		sizingMode === 'expand' && 'expand',
		classes.root
	)}
	style={cls(
		`position-anchor: ${anchorName}; --popover-gap: ${offset}px; --viewport-margin: ${viewportMargin}px;`,
		arrowSize && `--arrow-size:${arrowSizePx[arrowSize]}px;`,
		dropShadow && `--popover-drop-shadow:${dropShadow};`,
		viewportConstraint,
		present && !measured && 'visibility:hidden;'
	)}
	ontoggle={(e) => (open = e.newState === 'open')}
	{@attach attachAnchor}
	{@attach attachPortal(portal)}
	{...restProps}
>
	{#if present}
		<!-- One persistent box. Mounted (hidden, via the parent's visibility:hidden)
					before measurement so position-area can resolve and we can read the
					rendered side; revealed and animated via WAAPI once measured (see play()).
					Children render exactly once per open. -->
		<div
			bind:this={boxEl}
			data-popover-box
			data-arrow={showArrow || undefined}
			data-effective-side={showArrow && measured ? effectiveSide : undefined}
			aria-hidden={!measured ? 'true' : undefined}
			tabindex="-1"
			class={classes.box}
			style={viewportConstraint}
		>
			{@render children?.()}
		</div>
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
	/* The viewport-fraction cap (both dimensions) is applied inline via
	   viewportConstraint() on the root and the box — see the `sizing` ratio. */
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
			BOTH axes use the `stretch` SIZE keyword, not `*-self: stretch` ALIGNMENT —
			alignment-stretch does not reliably fill a position-area region: it left short
			content collapsed to content size, and on span-left/span-top regions it parked
			the box at the FAR viewport edge, detached from the anchor (broke top-end/
			bottom-end). So park the box at the region start and size it with the keyword:
				• top/bottom (cross = inline) → justify-self: start; width: stretch
				• left/right  (cross = block)  → align-self: start;  height: stretch
	   	(The flex-bound rule below then fills the Box within the sized root.) */
	:is(
		.placement-top,
		.placement-top-start,
		.placement-top-end,
		.placement-bottom,
		.placement-bottom-start,
		.placement-bottom-end
	).expand {
		justify-self: start; /* cross: park at region start so width:stretch can fill it */
		width: stretch; /* cross: fill the inline region (alignment-stretch is unreliable) */
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
			the far edge — it is not symmetric across the viewport.
	*/
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
			scroll container is inside it
	*/
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
