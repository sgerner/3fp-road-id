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
	<div class="border-secondary-500/30 bg-secondary-500/5 rounded-2xl border p-4 text-sm">
		<ul class="space-y-2">
			{#each selectedShifts as item (item.id)}
				<li
					transition:slide
					class="bg-surface-900/60 flex items-center justify-between gap-3 rounded-xl px-3 py-2"
				>
					<div>
						<p class="font-semibold">
							{opportunity.title || 'Untitled role'}
						</p>
						<span class="text-surface-100">{item.label}</span>
					</div>
					<button
						type="button"
						class="chip preset-filled-danger-500 flex items-center gap-1"
						onclick={() => onRemoveShift(item.id)}
					>
						<IconTrash class="h-4 w-4" />
						<span>Remove</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{:else if requiresSelection}
	<p
		class="border-warning-500/30 bg-warning-500/10 text-warning-100 rounded-2xl border px-3 py-2 text-xs"
	>
		{requireSelectionMessage}
	</p>
{:else}
	<p class="text-surface-400 text-xs">{optionalSelectionMessage}</p>
{/if}
