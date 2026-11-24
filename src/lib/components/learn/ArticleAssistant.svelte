<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { getContextualModeDefaults } from '#lib/ai/assistantHelpers.js';

	let { articleSlug, articleTitle = '' } = $props();
	const assistantContext = getAssistantContext();
	/** @type {HTMLButtonElement | null} */
	let openBtnEl = $state(null);

	const suggestions = getContextualModeDefaults('learn-article').starterPrompts;

	$effect(() => {
		return assistantContext.register(() => ({
			mode: 'learn-article',
			articleSlug,
			articleTitle
		}));
	});

	/**
	 * @param {string} [prompt]
	 * @param {HTMLElement | null} [triggerEl]
	 */
	function openArticleAssistant(prompt = '', triggerEl = openBtnEl) {
		assistantContext.open({
			mode: 'page',
			prompt,
			submit: Boolean(prompt),
			triggerEl
		});
	}
</script>

<section
	class="border-surface-800 bg-surface-950 text-surface-50 flex flex-col gap-3.5 border-2 p-5"
	aria-labelledby="article-assistant-title"
>
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-4">
			<div
				class="bg-primary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center text-xl font-black"
				aria-hidden="true"
			>
				✳
			</div>
			<div class="min-w-0">
				<p class="text-primary-500 m-0 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
					Reading companion
				</p>
				<h2
					id="article-assistant-title"
					class="text-surface-50! m-0 text-lg font-black tracking-tight uppercase"
				>
					Ask about this article
				</h2>
				<p class="text-surface-300 m-0 mt-0.5 text-xs leading-relaxed">
					Answers stay grounded in this article inside the 3FP Assistant.
				</p>
			</div>
		</div>
		<button
			bind:this={openBtnEl}
			type="button"
			class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
			onclick={() => openArticleAssistant('', openBtnEl)}
		>
			<span>Ask</span>
			<IconArrowRight class="h-3.5 w-3.5" />
		</button>
	</div>

	<div class="flex flex-wrap gap-2" aria-label="Suggested questions">
		{#each suggestions as suggestion}
			<button
				type="button"
				class="border-surface-500 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
				onclick={(event) => openArticleAssistant(suggestion, event.currentTarget)}
			>
				{suggestion}
			</button>
		{/each}
	</div>
</section>
