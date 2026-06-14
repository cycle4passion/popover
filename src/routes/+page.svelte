<script lang="ts">
	import { onMount } from 'svelte';
	import {
		type Placement,
		type TriggerBy,
		type ArrowSize
	} from '$lib/components/Popover/Popover.svelte';
	import Popover from '$lib/components/Popover/Popover.svelte';
	import { fade, fly, slide, scale } from 'svelte/transition';
	import type { TransitionConfig } from 'svelte/transition';
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
			classname: 'flex justidy-center bg-red-500 px-6 py-6'
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
			id: 'shadow',
			placement: 'top',
			align: 'justify-center',
			col: 3,
			row: 3,
			buttonText: 'shadow',
			content: 'shadow-2xl also on Popover/Arrow',
			classname: 'bg-green-500 shadow-2xl shadow-black px-6 py-6'
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
	let viewportMargin = $state(28);
	let grouped = $state(false);
	let sizing = $state<'none' | '75%' | '50%' | 'match' | 'expand'>('none');
	let portal = $state(false);
	let arrow = $state(true);
	let arrowSize = $state<ArrowSize>('md');
	let longContent = $state(false);

	/* 	const content = $derived(
		longContent
			? 'Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptas. Quisquam'
			: 'Content'
	); */
	let transitionKey = $state<TransitionKey>('default');
	let transitionOut = $state(false);

	const noop = (): TransitionConfig => ({ duration: 0 });
	const transitions: Record<string, TransitionFn | undefined> = {
		default: undefined,
		fade,
		fly,
		slide,
		scale,
		none: noop
	};

	const transition = $derived(transitions[transitionKey]);

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
		{grouped}
		bind:autoPlacement
		bind:offset
		bind:viewportMargin
		bind:sizing
		bind:portal
		bind:arrow
		bind:arrowSize
		bind:longContent
		bind:transitionKey
		bind:transitionOut
		transitionKeys={Object.keys(transitions) as TransitionKey[]}
		onTriggerChange={setTrigger}
		onGroupedChange={setGrouped}
	/>

	<div class="h-20"></div>
	<!-- 	Scroll surface: 3× viewport in each direction so the grid can be scrolled to
				any viewport edge, which triggers position-try-fallbacks on the popovers. -->
	<div class="flex min-h-[300vh] min-w-[300vw] items-center justify-center bg-gray-50">
		<div class="grid grid-cols-5 gap-12">
			{#each gridCells as cell (cell.id)}
				<div
					class={`flex ${cell.align}`}
					style={`grid-column-start: ${cell.col}; grid-row-start: ${cell.row}`}
				>
					<!-- triggerBy="click"/"hover" are now wired inside Popover; the anchor
						 needs no manual open handling. -->
					<button
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
						{viewportMargin}
						{triggerBy}
						{sizing}
						{portal}
						{transition}
						{transitionOut}
						arrow={arrow ? arrowSize : false}
						classes={{
							box: `rounded-lg border-2 border-red-500 bg-black px-3 py-2 text-sm text-white ${cell.popoverClass ?? ''}`
						}}
					>
						<!-- 	Sizing contract: the popover only constrains its box; the consumer owns
									scrolling. With sizing match/expand, set overflow on your content. -->
						<div
							class="overflow-y-auto"
							style="scrollbar-color: white black; scrollbar-gutter: stable both-edges;"
						>
							{longContent
								? 'Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Quisquam, voluptas. Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, voluptas. Quisquam'
								: cell.content}
						</div>
					</Popover>
				</div>
			{/each}
		</div>
	</div>
</div>
