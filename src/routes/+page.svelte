<script lang="ts">
	import { onMount } from 'svelte';
	import { type Placement, type TriggerBy } from '$lib/components/Popover/types';
	import Popover from '$lib/components/Popover/Popover.svelte';
	import type { ArrowSize } from '$lib/components/Popover/Arrow.svelte';
	import { fade, fly, slide, scale } from 'svelte/transition';
	import type { TransitionConfig } from 'svelte/transition';
	import { Button } from 'svelte-ux';
	import { Popover as PopoverOld } from 'svelte-ux';
	import { Toggle } from 'svelte-ux';
	import Controls, { type TransitionKey } from './Controls.svelte';

	/* 	let open = $state(false); */

	type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;

	type GridCellData = {
		id: string;
		placement: Placement;
		align: string;
		col: 1 | 2 | 3 | 4 | 5;
		row: 1 | 2 | 3 | 4 | 5;
		buttonText: string;
		content: string;
		classname: string;
		popoverClass?: string;
		popoverStyle?: string;
		group?: string;
	};

	const gridCells: GridCellData[] = [
		{
			id: 'top-start',
			placement: 'top-start',
			align: 'justify-start',
			col: 2,
			row: 1,
			buttonText: 'top-start',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'top',
			placement: 'top',
			align: 'justify-center',
			col: 3,
			row: 1,
			buttonText: 'top',
			content: 'Content',
			classname: 'bg-blue-500 px-6 py-6'
		},
		{
			id: 'top-end',
			placement: 'top-end',
			align: 'justify-end',
			col: 4,
			row: 1,
			buttonText: 'top-end',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'left-start',
			placement: 'left-start',
			align: 'justify-start',
			col: 1,
			row: 2,
			buttonText: 'left-start',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'right-start',
			placement: 'right-start',
			align: 'justify-end',
			col: 5,
			row: 2,
			buttonText: 'right-start',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'left',
			placement: 'left',
			align: 'justify-start',
			col: 1,
			row: 3,
			buttonText: 'left',
			content: 'Content',
			classname: 'bg-blue-500 px-6 py-6'
		},
		{
			id: 'shadow-lg',
			placement: 'top',
			align: 'justify-center',
			col: 2,
			row: 3,
			buttonText: 'shadow-lg',
			content: 'shadow-lg',
			classname: 'bg-emerald-500 px-6 py-6',
			popoverClass: 'rounded-lg shadow-lg'
		},
		{
			id: 'ringed-2',
			placement: 'top',
			align: 'justify-center',
			col: 3,
			row: 3,
			buttonText: 'ringed-2',
			content: 'ring-2 ring-indigo-500',
			classname: 'bg-indigo-500 px-6 py-6',
			popoverClass: 'rounded-lg ring-2 ring-indigo-500'
		},
		{
			id: 'shadow-ring',
			placement: 'top',
			align: 'justify-center',
			col: 4,
			row: 3,
			buttonText: 'shadow+ring',
			content: 'shadow ring-1 ring-amber-400',
			classname: 'bg-amber-500 shadow-2xl px-6 py-6',
			popoverClass: 'rounded-lg shadow-2xl ring-1 ring-amber-400'
		},
		{
			id: 'right',
			placement: 'right',
			align: 'justify-end',
			col: 5,
			row: 3,
			buttonText: 'right',
			content: 'Content',
			classname: 'bg-blue-500 px-6 py-6'
		},
		{
			id: 'left-end',
			placement: 'left-end',
			align: 'justify-start',
			col: 1,
			row: 4,
			buttonText: 'left-end',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'right-end',
			placement: 'right-end',
			align: 'justify-end',
			col: 5,
			row: 4,
			buttonText: 'right-end',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'bottom-start',
			placement: 'bottom-start',
			align: 'justify-start',
			col: 2,
			row: 5,
			buttonText: 'bottom-start',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		},
		{
			id: 'bottom',
			placement: 'bottom',
			align: 'justify-center',
			col: 3,
			row: 5,
			buttonText: 'bottom',
			content: 'Content',
			classname: 'bg-blue-500 px-6 py-6'
		},
		{
			id: 'bottom-end',
			placement: 'bottom-end',
			align: 'justify-end',
			col: 4,
			row: 5,
			buttonText: 'bottom-end',
			content: 'Content',
			classname: 'bg-red-500 px-6 py-6'
		}
	];

	const openStateKeys = gridCells.map((c) => c.id);

	const openStates = $state(
		Object.fromEntries(openStateKeys.map((id) => [id, false])) as Record<string, boolean>
	);

	let triggerBy = $state<TriggerBy>('click');
	let autoPlacement = $state(true);
	let offset = $state(0);
	let grouped = $state(false);
	let matchSize = $state(false);
	let portal = $state(false);
	let arrow = $state(true);
	let arrowSize = $state<ArrowSize>('md');
	let resize = $state<boolean | 'width' | 'height'>(false);
	let transitionKey = $state<TransitionKey>('default');

	const noop = (): TransitionConfig => ({ duration: 0 });
	const transitions: Record<string, TransitionFn | undefined> = {
		default: undefined,
		fade,
		fly: (node) => fly(node as HTMLElement, { y: -8, duration: 200 }),
		slide,
		scale,
		none: noop
	};

	const transition = fade; //$derived(transitions[transitionKey]);

	function setTrigger(t: TriggerBy) {
		triggerBy = t;
		for (const id of openStateKeys) openStates[id] = false;
	}

	function setGrouped(v: boolean) {
		grouped = v;
		if (!v) for (const id of openStateKeys) openStates[id] = false;
	}

	onMount(() => {
		// Center the grid in the viewport so the user can scroll equally in every direction.
		const x = (document.documentElement.scrollWidth - window.innerWidth) / 2;
		const y = (document.documentElement.scrollHeight - window.innerHeight) / 2;
		window.scrollTo({ left: x, top: y });
	});
</script>

<div class="flex flex-col bg-gray-50" data-popover-ignore>
	<Controls
		{triggerBy}
		bind:autoPlacement
		bind:offset
		{grouped}
		bind:matchSize
		bind:portal
		bind:arrow
		bind:arrowSize
		bind:resize
		bind:transitionKey
		transitionKeys={Object.keys(transitions) as TransitionKey[]}
		onTriggerChange={setTrigger}
		onGroupedChange={setGrouped}
	/>

	<div class="h-20"></div>
	<!-- Scroll surface: 3× viewport in each direction so the grid can be scrolled to
	     any viewport edge, which triggers position-try-fallbacks on the popovers. -->
	<div class="flex min-h-[300vh] min-w-[300vw] items-center justify-center bg-gray-50">
		<div class="grid grid-cols-5 gap-12">
			{#each gridCells as cell (cell.id)}
				<div
					class={`flex ${cell.align}`}
					style={`grid-column-start: ${cell.col}; grid-row-start: ${cell.row}`}
				>
					<button
						onclick={() => {
							if (triggerBy === 'click') openStates[cell.id] = !openStates[cell.id];
						}}
						class={`rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 ${cell.classname}`}
					>
						{cell.buttonText}
					</button>

					<Popover
						bind:open={openStates[cell.id]}
						group={grouped && !cell.placement.includes('-') ? 'demo' : undefined}
						placement={cell.placement}
						{autoPlacement}
						{offset}
						{triggerBy}
						{matchSize}
						{resize}
						{portal}
						{transition}
						arrow={arrow ? arrowSize : false}
						class={cell.popoverClass ?? ''}
						style={cell.popoverStyle ?? '--arrow-bg: black'}
					>
						<div
							class="w-max-[400px] rounded-lg border-2 border-red-500 bg-black px-3 py-2 text-sm text-white"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html cell.content}
						</div>
					</Popover>
				</div>
			{/each}

			<div>
				<Toggle let:on={open} let:toggle>
					<PopoverOld {open} {resize}>
						<div class="overflow-scroll border bg-surface-100 p-2 shadow-sm">
							Lorem ipsum dolor <!-- sit amet consectetur, adipisicing elit. Id numquam cumque et
							cupiditate eveniet odit magni velit, suscipit voluptate magnam quisquam voluptatem?
							Ducimus voluptate dolorem in consectetur fugit, aperiam ut. Nihil, quae reprehenderit
							impedit eum cumque, praesentium possimus sunt doloribus ipsum similique unde maiores
							dolore illo? Laborum aliquam suscipit tempora, aspernatur officia architecto enim
							excepturi ipsa et ullam culpa. Harum? Minus mollitia similique error optio at. Dolore
							ad nulla facilis accusamus, aperiam architecto! Minima magnam voluptas sunt eaque,
							alias recusandae possimus praesentium, reprehenderit itaque similique architecto
							doloribus expedita neque vel? Earum error nisi impedit quo nihil, non quibusdam porro
							doloribus. Neque totam aliquid dicta consectetur distinctio doloribus nulla nihil
							deserunt labore quam aliquam maiores iure enim, iusto incidunt quos numquam. Corrupti
							quae, dolores soluta maxime maiores tempore error ab. Obcaecati sed possimus,
							voluptatem impedit quae repudiandae magni nulla aliquam deserunt laudantium alias
							error dolore itaque. Commodi voluptas nisi quis tenetur. Pariatur distinctio ex
							sapiente. Modi, quos. Tempora deserunt voluptates distinctio pariatur minima dolorum
							minus rem earum exercitationem excepturi nulla deleniti, a consequuntur tempore
							sapiente. Aspernatur eveniet nulla sapiente distinctio vero. Doloremque, praesentium
							minus voluptate architecto velit blanditiis reiciendis repellat commodi quis quo ullam
							autem nihil fugiat expedita! Reprehenderit ab consectetur possimus cupiditate.
							Voluptates, provident exercitationem. In ipsum illo consequuntur labore? Iste
							molestiae natus neque asperiores beatae! Deleniti tempore quaerat excepturi, obcaecati -->
						</div>
					</PopoverOld>
					<Button variant="fill" on:click={toggle}>SvelteUX-2</Button>
				</Toggle>
			</div>
		</div>
	</div>
</div>
