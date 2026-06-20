import type { Attachment } from 'svelte/attachments';

/**
 * Configures the {@link portal} attachment.
 *   • An object — fine-grained control via `target` / `enabled`.
 *   • A boolean — shorthand for `{ enabled }` with the default target
 *     (`true` portals to the fallback target, `false` leaves the node in place).
 */
export type PortalOptions =
	| {
			/**
			 * Where to move the node. An `HTMLElement`, a CSS selector string
			 * (resolved with `document.querySelector`), or omitted to use the
			 * nearest `.PortalTarget` ancestor, else the first `.PortalTarget` in the
			 * document, else `<body>`.
			 */
			target?: HTMLElement | string;
			/** Whether portaling is active. When `false` the node stays/returns to its original parent. @default true */
			enabled?: boolean;
	  }
	| boolean;

// Preserved across re-runs because cleanup detaches node before the next run executes
const nodeData = new WeakMap<
	HTMLElement,
	{ originalParent: HTMLElement | null; fallbackTarget: Element | null }
>();

/**
 * Svelte attachment that relocates the attached element elsewhere in the DOM
 * (e.g. to `<body>`), so it escapes parent `overflow`/`transform`/stacking
 * contexts while staying owned by the component that declared it.
 *
 * The element's original parent and a fallback `.PortalTarget` are captured on
 * first run (kept in a WeakMap so they survive re-runs). On cleanup — and when
 * `enabled` becomes `false` — the node is returned to its original parent, so
 * toggling the portal is non-destructive.
 *
 * @param options  A {@link PortalOptions} object, or a boolean shorthand for
 *                 `enabled`. Omit entirely to portal to the default target.
 * @returns A Svelte {@link Attachment} (`(node) => cleanup`).
 *
 * @example
 * // Default target (nearest .PortalTarget, else <body>):
 * <div {@attach portal()}>I render at the page root</div>
 *
 * @example
 * // Explicit target by selector or element:
 * <div {@attach portal({ target: '#overlay-root' })}>…</div>
 * <div {@attach portal({ target: someEl })}>…</div>
 *
 * @example
 * // Conditionally portal — `false` keeps the node in place (reactive):
 * <div {@attach portal(shouldPortal)}>…</div>
 * <div {@attach portal({ target: '#overlay', enabled: shouldPortal })}>…</div>
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

/**
 * Resolves the destination element from `options.target`: an `HTMLElement` is
 * used directly, a string is resolved via `document.querySelector`, and
 * anything else falls back to `fallbackTarget` (the captured `.PortalTarget`)
 * or `<body>`.
 */
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
