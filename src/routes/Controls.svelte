<script module lang="ts">
	export type TransitionKey = 'default' | 'fade' | 'fly' | 'slide' | 'scale' | 'none';
</script>

<script lang="ts">
	import type { TriggerBy, ArrowSize } from '$lib/components/Popover/Popover.svelte';
	import { ThemeSwitch } from 'svelte-ux';

	type Props = {
		triggerBy: TriggerBy;
		autoPlacement?: boolean;
		offset?: number;
		viewportMargin?: number;
		grouped: boolean;
		sizing?: 'none' | number | string | 'match' | 'expand';
		portal?: boolean;
		arrow?: boolean;
		arrowSize?: ArrowSize;
		longContent?: boolean;
		transitionKey?: TransitionKey;
		transitionOut?: boolean;
		transitionKeys: readonly TransitionKey[];
		onTriggerChange: (t: TriggerBy) => void;
		onGroupedChange: (v: boolean) => void;
	};

	let {
		triggerBy,
		autoPlacement = $bindable(true),
		offset = $bindable(0),
		viewportMargin = $bindable(28),
		grouped,
		sizing = $bindable<'none' | '75%' | '50%' | 'match' | 'expand'>('none'),
		portal = $bindable(false),
		arrow = $bindable(true),
		arrowSize = $bindable<ArrowSize>('md'),
		longContent = $bindable(false),
		transitionKey = $bindable<TransitionKey>('default'),
		transitionOut = $bindable(false),
		transitionKeys,
		onTriggerChange,
		onGroupedChange
	}: Props = $props();
</script>

<div
	class="fixed top-0 right-0 left-0 z-10 flex flex-wrap items-center justify-center gap-3 bg-gray-50/90 p-4 backdrop-blur"
	data-popover-ignore
>
	<!-- Trigger -->
	<div class="flex gap-1 rounded-xl bg-white p-1 shadow ring-1 ring-black/10">
		{#each ['click', 'hover'] as t (t)}
			<button
				onclick={() => onTriggerChange(t as TriggerBy)}
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

	<!-- Viewport margin -->
	<div class="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
		<label for="viewport-margin-slider" class="text-sm font-medium text-gray-600"
			>Viewport margin</label
		>
		<input
			id="viewport-margin-slider"
			type="range"
			min="0"
			max="100"
			bind:value={viewportMargin}
			class="w-24 accent-indigo-500"
		/>
		<span class="w-10 text-right text-sm text-gray-600 tabular-nums">{viewportMargin}px</span>
	</div>

	<!-- Transition -->
	<div class="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
		<label for="transition-select" class="text-sm font-medium text-gray-600">Transition</label>
		<select
			id="transition-select"
			bind:value={transitionKey}
			class="rounded-md border-0 bg-gray-100 px-2 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500"
		>
			{#each transitionKeys as t (t)}
				<option value={t}>{t}</option>
			{/each}
		</select>
		<label class="flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" bind:checked={transitionOut} class="accent-indigo-500" />
			<span class="text-sm font-medium text-gray-600">Out</span>
		</label>
	</div>

	<ThemeSwitch />
	<!-- Toggles -->
	<div class="flex items-center gap-4 rounded-xl bg-white px-4 py-2 shadow ring-1 ring-black/10">
		<label class="flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" bind:checked={autoPlacement} class="accent-indigo-500" />
			<span class="text-sm font-medium text-gray-600">Auto placement</span>
		</label>
		<label class="flex cursor-pointer items-center gap-1.5">
			<span class="text-sm font-medium text-gray-600">Sizing</span>
			<select
				bind:value={sizing}
				aria-label="Sizing mode"
				class="rounded-md border-0 bg-gray-100 px-2 py-1 text-sm text-gray-700 focus:ring-2 focus:ring-red-500"
			>
				<option value="none">none</option>
				<option value="75%">75%</option>
				<option value="50%">50%</option>
				<option value="match">match</option>
				<option value="expand">expand</option>
			</select>
		</label>

		<label class="flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" bind:checked={portal} class="accent-emerald-500" />
			<span class="text-sm font-medium text-gray-600">Portal</span>
		</label>
		<label class="flex cursor-pointer items-center gap-1.5">
			<input
				type="checkbox"
				checked={grouped}
				onchange={(e) => onGroupedChange((e.target as HTMLInputElement).checked)}
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
		<label class="flex cursor-pointer items-center gap-1.5">
			<input type="checkbox" bind:checked={longContent} class="accent-fuchsia-500" />
			<span class="text-sm font-medium text-gray-600">Long content</span>
		</label>
	</div>
</div>
