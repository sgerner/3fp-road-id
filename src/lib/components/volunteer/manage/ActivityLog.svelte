<script>
	import { slide } from 'svelte/transition';
	const { entries = [] } = $props();
	let showActivityLog = $state(false);
</script>

<section class="border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-6 shadow-xl">
	<h2 class="text-surface-950-50 !text-left text-xl font-semibold">Activity Log</h2>
	<p class="text-surface-700-300 text-sm">
		Review recent roster updates and communication actions.
	</p>
	<button class="chip preset-tonal-primary" onclick={() => (showActivityLog = !showActivityLog)}>
		{showActivityLog ? 'Hide' : 'Show'} Activity Log
	</button>
	{#if showActivityLog}
		<ul class="text-surface-800-200 mt-4 space-y-2 text-sm" transition:slide>
			{#if entries.length}
				{#each entries as entry, index (index)}
					<li
						class="border-surface-300-700/60 bg-surface-50-950/40 rounded-lg border px-4 py-2"
						transition:slide
					>
						<span class="text-surface-500 font-mono text-xs">#{entries.length - index}</span>
						<span class="ml-2">{entry}</span>
					</li>
				{/each}
			{:else}
				<li class="text-surface-600-400" transition:slide>
					Actions will appear here as you manage the event.
				</li>
			{/if}
		</ul>
	{/if}
</section>
