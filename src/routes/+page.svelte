<script lang="ts">
	import { onMount } from 'svelte';
	import Popover, { type Placement, type TriggerBy } from '$lib/components/Popover.svelte';
	import type { ArrowSize } from '$lib/components/Arrow.svelte';
	import { fade, fly, slide, scale } from 'svelte/transition';
	import type { TransitionConfig } from 'svelte/transition';
	import { Button } from 'svelte-ux';
	import { Popover as PopoverOld } from 'svelte-ux';
	import { Toggle } from 'svelte-ux';

	/* 	let open = $state(false); */

	type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;

	const colors = ['bg-red-500', 'bg-blue-500'];

	const gridCells: {
		placement: Placement;
		align: string;
		col: 1 | 2 | 3 | 4 | 5;
		row: 1 | 2 | 3 | 4 | 5;
	}[] = [
		{ placement: 'top-start' as Placement, align: 'justify-start', col: 2, row: 1 },
		{ placement: 'top' as Placement, align: 'justify-center', col: 3, row: 1 },
		{ placement: 'top-end' as Placement, align: 'justify-end', col: 4, row: 1 },
		{ placement: 'left-start' as Placement, align: 'justify-start', col: 1, row: 2 },
		{ placement: 'right-start' as Placement, align: 'justify-end', col: 5, row: 2 },
		{ placement: 'left' as Placement, align: 'justify-start', col: 1, row: 3 },
		{ placement: 'right' as Placement, align: 'justify-end', col: 5, row: 3 },
		{ placement: 'left-end' as Placement, align: 'justify-start', col: 1, row: 4 },
		{ placement: 'right-end' as Placement, align: 'justify-end', col: 5, row: 4 },
		{ placement: 'bottom-start' as Placement, align: 'justify-start', col: 2, row: 5 },
		{ placement: 'bottom' as Placement, align: 'justify-center', col: 3, row: 5 },
		{ placement: 'bottom-end' as Placement, align: 'justify-end', col: 4, row: 5 }
	];

	const placementList = gridCells.map((c) => c.placement);

	const openStates = $state(
		Object.fromEntries(placementList.map((p) => [p, false])) as Record<Placement, boolean>
	);

	let ringOpen = $state(false);
	let triggerBy = $state<TriggerBy>('click');
	let offset = $state(0);
	let grouped = $state(false);
	let matchWidth = $state(false);
	let portal = $state(false);
	let arrow = $state(true);
	let arrowSize = $state<ArrowSize>('md');
	let resize = $state<boolean | 'width' | 'height'>(false);
	let transitionKey = $state<'default' | 'fade' | 'fly' | 'slide' | 'scale' | 'none'>('default');

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
		for (const p of placementList) openStates[p] = false;
	}

	function setGrouped(v: boolean) {
		grouped = v;
		if (!v) for (const p of placementList) openStates[p] = false;
	}

	onMount(() => {
		window.scrollTo({
			left: (document.documentElement.scrollWidth - window.innerWidth) / 2,
			top: (document.documentElement.scrollHeight - window.innerHeight) / 2
		});
	});
</script>

<div class="flex flex-col bg-gray-50" data-popover-ignore>
	<div
		class="fixed top-0 right-0 left-0 z-10 flex flex-wrap items-center justify-center gap-3 bg-gray-50/90 p-4 backdrop-blur"
		data-popover-ignore
	>
		<!-- Trigger -->
		<div class="flex gap-1 rounded-xl bg-white p-1 shadow ring-1 ring-black/10">
			{#each ['click', 'hover'] as t (t)}
				<button
					onclick={() => setTrigger(t as TriggerBy)}
					class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {triggerBy === t
						? 'bg-indigo-500 text-white shadow-sm'
						: 'text-gray-600 hover:bg-gray-100'}"
				>
					{t}
				</button>
			{/each}
		</div>

		<!-- Offset -->
		<div class="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
			<label for="offset-slider" class="text-sm font-medium text-gray-600">Offset</label>
			<input
				id="offset-slider"
				type="range"
				min="0"
				max="40"
				bind:value={offset}
				class="w-24 accent-indigo-500"
			/>
			<span class="w-8 text-right text-sm text-gray-600 tabular-nums">{offset}px</span>
		</div>

		<!-- Transition -->
		<div class="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
			<label for="transition-select" class="text-sm font-medium text-gray-600">Transition</label>
			<select
				id="transition-select"
				bind:value={transitionKey}
				class="rounded-md border-0 bg-gray-100 px-2 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500"
			>
				{#each Object.keys(transitions) as t (t)}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>

		<!-- Resize -->
		<div class="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
			<label for="resize-select" class="text-sm font-medium text-gray-600">Resize</label>
			<select
				id="resize-select"
				value={String(resize)}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					resize = v === 'true' ? true : v === 'false' ? false : (v as 'width' | 'height');
				}}
				class="rounded-md border-0 bg-gray-100 px-2 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500"
			>
				<option value="false">off</option>
				<option value="width">width</option>
				<option value="height">height</option>
				<option value="true">both</option>
			</select>
		</div>

		<!-- Toggles -->
		<div class="flex items-center gap-4 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
			<label class="flex cursor-pointer items-center gap-1.5">
				<input type="checkbox" bind:checked={matchWidth} class="accent-red-500" />
				<span class="text-sm font-medium text-gray-600">Match width</span>
			</label>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input type="checkbox" bind:checked={portal} class="accent-emerald-500" />
				<span class="text-sm font-medium text-gray-600">Portal</span>
			</label>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input
					type="checkbox"
					checked={grouped}
					onchange={(e) => setGrouped((e.target as HTMLInputElement).checked)}
					class="accent-blue-500"
				/>
				<span class="text-sm font-medium text-gray-600">Group</span>
			</label>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input type="checkbox" bind:checked={arrow} class="accent-amber-500" />
				<span class="text-sm font-medium text-gray-600">Arrow</span>
			</label>
			<select
				bind:value={arrowSize}
				disabled={!arrow}
				aria-label="Arrow size"
				class="rounded-md border-0 bg-gray-100 px-2 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
			>
				<option value="sm">sm</option>
				<option value="md">md</option>
				<option value="lg">lg</option>
			</select>
		</div>
	</div>

	<div class="h-20"></div>
	<div class="flex h-750 w-1500 items-center justify-center">
		<div class="grid w-220 grid-cols-5 gap-6">
			{#each gridCells as cell (cell.placement)}
				{@const color = colors[cell.placement.includes('-') ? 0 : 1]}
				{@const group = grouped && !cell.placement.includes('-') ? 'demo' : undefined}
				<div
					class="flex {cell.align}"
					style="grid-column-start: {cell.col}; grid-row-start: {cell.row}"
				>
					<button
						onclick={triggerBy === 'click'
							? () => (openStates[cell.placement] = !openStates[cell.placement])
							: undefined}
						class="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 {color}"
					>
						{cell.placement}
					</button>
					<Popover
						bind:open={openStates[cell.placement]}
						placement={cell.placement}
						{offset}
						{triggerBy}
						{group}
						{matchWidth}
						{resize}
						{portal}
						{transition}
						arrow={arrow && arrowSize}
						style="--arrow-bg:black;--arrow-border-color:#ef4444;--arrow-border-width:2px;"
					>
						<div
							class="w-max-[400px] rounded-lg border-2 border-red-500 bg-black px-3 py-2 text-sm text-white"
						>
							<!-- sit amet consectetur, adipisicing elit. Id numquam cumque et cupiditate eveniet odit
							magni velit, suscipit voluptate magnam quisquam voluptatem? Ducimus voluptate dolorem
							in consectetur fugit, aperiam ut. Nihil, quae reprehenderit impedit eum cumque,
							praesentium possimus sunt doloribus ipsum similique unde maiores dolore illo? Laborum
							aliquam suscipit tempora, aspernatur officia architecto enim excepturi ipsa et ullam
							culpa. Harum? Minus mollitia similique error optio at. Dolore ad nulla facilis
							accusamus, aperiam architecto! Minima magnam voluptas sunt eaque, alias recusandae
							possimus praesentium, reprehenderit itaque similique architecto doloribus expedita
							neque vel? Earum error nisi impedit quo nihil, non quibusdam porro doloribus. Neque
							totam aliquid dicta consectetur distinctio doloribus nulla nihil deserunt labore quam
							aliquam maiores iure enim, iusto incidunt quos numquam. Corrupti quae, dolores soluta
							maxime maiores tempore error ab. Obcaecati sed possimus, voluptatem impedit quae
							repudiandae magni nulla aliquam deserunt laudantium alias error dolore itaque. Commodi
							voluptas nisi quis tenetur. Pariatur distinctio ex sapiente. Modi, quos. Tempora
							deserunt voluptates distinctio pariatur minima dolorum minus rem earum exercitationem
							excepturi nulla deleniti, a consequuntur tempore sapiente. Aspernatur eveniet nulla
							sapiente distinctio vero. Doloremque, praesentium minus voluptate architecto velit
							blanditiis reiciendis repellat commodi quis quo ullam autem nihil fugiat expedita!
							Reprehenderit ab consectetur possimus cupiditate. Voluptates, provident
							exercitationem. In ipsum illo consequuntur labore? Iste -->
							Content
						</div>
					</Popover>
				</div>
			{/each}

			<!-- center cell: tests ring + shadow auto-sync to arrow -->
			<div
				class="flex justify-center items-center"
				style="grid-column-start: 3; grid-row-start: 3"
			>
				<button
					onclick={triggerBy === 'click' ? () => (ringOpen = !ringOpen) : undefined}
					class="rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 transition-colors hover:opacity-90"
				>
					ringed-2
				</button>
				<Popover
					bind:open={ringOpen}
					placement="top"
					{offset}
					{triggerBy}
					{portal}
					{transition}
					arrow={arrow && arrowSize}
					class="ring-2 ring-indigo-500 shadow-md rounded-lg"
					style="--arrow-bg: white;"
				>
					<div class="rounded-lg bg-white px-3 py-2 text-sm text-gray-800">
						ring-2 ring-indigo-500 shadow-md
					</div>
				</Popover>
			</div>

			<div>
				<Toggle let:on={open} let:toggle>
					<PopoverOld {open}>
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
					<Button variant="fill" on:click={toggle}>Click me</Button>
				</Toggle>
			</div>
		</div>
	</div>
</div>
