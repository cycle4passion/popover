<script lang="ts">
	import Popover from '$lib/components/Popover/Popover.svelte';
	import type {
		Placement,
		ArrowSize,
		TriggerBy,
		TransitionFn
	} from '$lib/components/Popover/Popover.svelte';
	import type { TransitionInput } from '$lib/transitions/composeTransitions';
	import type { PortalOptions } from '$lib/attachments/portal';
	import type { Snippet } from 'svelte';

	type Props = {
		/** Tooltip text rendered inside the popover box. */
		text?: string;
		/** Classes for the tooltip box. The arrow inherits bg/border from here. */
		class?: string;
		/** The trigger element the tooltip is attached to. */
		children?: Snippet;

		/** ID of the anchor element. Defaults to the trigger (previous sibling). */
		anchorEl?: string;
		/** Whether the tooltip is visible. */
		open?: boolean;
		/** Preferred placement relative to the trigger. @default 'top' */
		placement?: Placement;
		/** Use the CSS Anchor positioning API. @default true */
		autoPlacement?: boolean;
		/** Show a directional arrow. `true` = 'md', or pass 'sm' | 'md' | 'lg'. @default true */
		arrow?: boolean | ArrowSize;
		/** Gap in pixels between the tooltip and its trigger. @default 0 */
		offset?: number;
		/** Tooltips sharing a group name open and close together. */
		group?: string;
		/** What interaction opens the tooltip. @default ['hover', 'focus'] */
		triggerBy?: TriggerBy | TriggerBy[];
		/** Sizing mode, or a viewport-fraction cap. @default 'none' */
		sizing?: 'none' | 'match' | 'expand' | `${number}%`;
		/** Minimum margin in pixels between the tooltip and the viewport edge. @default 8 */
		viewportMargin?: number;
		/** Portal the tooltip out to another element. */
		portal?: PortalOptions | boolean;
		/** Classes for the popover root/box. */
		classes?: { root?: string; box?: string };
		/** Svelte transition for open/close. */
		transition?: TransitionFn | TransitionInput;
		/** Play the transition on close as well as open. @default false */
		transitionOut?: boolean;
	};

	let {
		text,
		class: classname = 'px-4 py-2 text-white bg-black border-2 border-red-500 rounded-full',
		children,
		classes,
		triggerBy = ['hover', 'focus'],
		autoPlacement = true,
		sizing = '30%',
		arrow = true,
		placement = 'top',
		group = '',
		...rest
	}: Props = $props();
</script>

{@render children?.()}
<Popover
	{triggerBy}
	{autoPlacement}
	{arrow}
	{sizing}
	{placement}
	{group}
	classes={{ box: classname, ...classes }}
	{...rest}
>
	{text}
</Popover>
