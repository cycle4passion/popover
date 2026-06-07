import type { Attachment } from 'svelte/attachments';

export type PortalOptions =
	| {
			target?: HTMLElement | string;
			enabled?: boolean;
	  }
	| boolean;

// Preserved across re-runs because cleanup detaches node before the next run executes
const nodeData = new WeakMap<
	HTMLElement,
	{ originalParent: HTMLElement | null; fallbackTarget: Element | null }
>();

/**
 * Render element outside its current DOM hierarchy
 */
export function portal(options?: PortalOptions): Attachment<HTMLElement> {
	return (node) => {
		if (!nodeData.has(node)) {
			nodeData.set(node, {
				originalParent: node.parentElement,
				fallbackTarget: node.closest('.PortalTarget') ?? document.querySelector('.PortalTarget')
			});
		}
		const { originalParent, fallbackTarget } = nodeData.get(node)!;
		const enabled = typeof options === 'boolean' ? options : (options?.enabled ?? true);

		if (enabled === false) {
			if (node.parentElement !== originalParent) {
				originalParent?.appendChild(node);
			}
			return;
		}

		const target = getTarget(options, fallbackTarget);
		target?.appendChild(node);

		return () => {
			if (target && node.parentElement === target) {
				target.removeChild(node);
			}
		};
	};
}

function getTarget(options: PortalOptions = {}, fallbackTarget: Element | null): Element | null {
	const target = typeof options === 'object' ? options.target : undefined;
	if (target instanceof HTMLElement) {
		return target;
	} else if (typeof target === 'string') {
		return document.querySelector(target);
	} else {
		return fallbackTarget ?? document.body;
	}
}
