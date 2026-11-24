<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { getContextualModeDefaults } from '#lib/ai/assistantHelpers.js';

	/** @type {{ canUndo?: boolean, undoConflictMessage?: string, onundo?: () => void }} */
	let { canUndo = false, undoConflictMessage = '', onundo = () => {} } = $props();

	const assistantContext = getAssistantContext();
	/** @type {HTMLButtonElement | null} */
	let openBtnEl = $state(null);
	const prompts = getContextualModeDefaults('group-site-write').starterPrompts;

	/**
	 * @param {string} [prompt]
	 * @param {HTMLElement | null} [triggerEl]
	 */
	function openSiteAssistant(prompt = '', triggerEl = openBtnEl) {
		assistantContext.open({
			mode: 'page',
			prompt,
			submit: Boolean(prompt),
			triggerEl
		});
	}
</script>

<section class="card preset-tonal-secondary grid gap-3 p-4 sm:p-5" aria-labelledby="site-ai-title">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-start gap-3">
			<span
				class="bg-primary-500 text-surface-950 flex h-9 w-9 shrink-0 items-center justify-center"
			>
				<IconSparkles class="h-4 w-4" />
			</span>
			<div class="min-w-0">
				<h2 id="site-ai-title" class="text-base font-black uppercase">
					Improve my website with AI
				</h2>
				<p class="text-xs opacity-75">
					Describe the feeling you want in the 3FP Assistant. Proposed copy, palette, and section
					updates preview before anything changes.
				</p>
			</div>
		</div>
		<button
			bind:this={openBtnEl}
			type="button"
			class="btn btn-sm preset-filled-primary-500 shrink-0 gap-1.5"
			onclick={() => openSiteAssistant('', openBtnEl)}
		>
			<span>Open Website AI</span>
			<IconArrowRight class="h-3.5 w-3.5" />
		</button>
	</div>

	<div class="flex flex-wrap gap-2" aria-label="Website AI starter prompts">
		{#each prompts as prompt}
			<button
				class="btn btn-sm preset-tonal-surface justify-start text-left whitespace-normal"
				type="button"
				onclick={(event) => openSiteAssistant(prompt, event.currentTarget)}
			>
				{prompt}
			</button>
		{/each}
	</div>

	{#if undoConflictMessage}
		<p class="text-xs opacity-80" role="status">{undoConflictMessage}</p>
	{:else if canUndo}
		<div>
			<button class="btn btn-sm preset-tonal-surface gap-1.5" type="button" onclick={onundo}>
				<IconUndo2 class="h-3.5 w-3.5" />
				Undo applied AI draft
			</button>
		</div>
	{/if}
</section>
