import { mount, unmount, type ComponentProps } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import Tooltip from './Tooltip.svelte';

/**
 * Props accepted by the {@link tooltip} attachment — every prop `Tooltip.svelte`
 * takes except the ones the attachment owns: `text` is the first argument,
 * `anchorEl` is wired to the attached node, and `children` (the trigger) is the
 * node itself.
 */
export type TooltipOptions = Omit<ComponentProps<typeof Tooltip>, 'text' | 'anchorEl' | 'children'>;

let counter = 0;

/**
 * Attach a tooltip to any element. Mounts `Tooltip.svelte` (which drives a
 * `Popover`) and anchors it to the element the attachment is placed on, so you
 * don't need to wrap the trigger in markup.
 *
 * The attachment re-runs whenever the reactive values you pass to it change, so
 * a `$state`-backed `text` updates the tooltip automatically.
 *
 * @example
 * <button {@attach tooltip('Save changes')}>Save</button>
 *
 * @example
 * <span {@attach tooltip(label, { placement: 'right', triggerBy: 'click' })}>
 *   ?
 * </span>
 */
export function tooltip(text: string, options: TooltipOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		// Popover anchors by element id (falling back to previousElementSibling, which
		// we don't have here). Give the node a stable id only if it lacks one, and
		// remove just the one we generated on cleanup.
		const generatedId = !node.id;
		if (generatedId) node.id = `tooltip-anchor-${counter++}`;

		// Mount into <body>: anchoring is by id + CSS anchor positioning, so the
		// popover element's position in the DOM tree is irrelevant.
		const instance = mount(Tooltip, {
			target: document.body,
			props: { text, anchorEl: node.id, ...options }
		});

		return () => {
			unmount(instance);
			if (generatedId) node.removeAttribute('id');
		};
	};
}
