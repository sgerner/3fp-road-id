<script>
	import IconTrash from '@lucide/svelte/icons/trash';
	import { slide } from 'svelte/transition';

	export let selectedShifts = [];
	export let opportunity = {};
	export let requiresSelection = false;
	export let onRemoveShift = () => {};
	export let requireSelectionMessage = 'Select at least one shift above to enable signup.';
	export let optionalSelectionMessage = 'Organizers will confirm exact timing when they reach out.';
</script>

{#if selectedShifts.length}
	<ul
		class="border-surface-950 divide-surface-800 bg-surface-950 text-surface-50 m-0 list-none divide-y border-[3px] p-0 text-sm"
	>
		{#each selectedShifts as item (item.id)}
			<li transition:slide class="flex items-center justify-between gap-3 px-4 py-3">
				<div class="flex flex-col gap-0.5">
					<p class="text-primary-500 m-0 text-xs font-black tracking-[0.16em] uppercase">
						{opportunity.title || 'Untitled role'}
					</p>
					<span class="text-surface-50 font-bold">{item.label}</span>
				</div>
				<button
					type="button"
					class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black tracking-wide uppercase transition"
					onclick={() => onRemoveShift(item.id)}
				>
					<IconTrash class="h-3.5 w-3.5" />
					<span>Remove</span>
				</button>
			</li>
		{/each}
	</ul>
{:else if requiresSelection}
	<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-3 text-xs font-black uppercase">
		{requireSelectionMessage}
	</p>
{:else}
	<p class="m-0 text-xs opacity-80">{optionalSelectionMessage}</p>
{/if}
