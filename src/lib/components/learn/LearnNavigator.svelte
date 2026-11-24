<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { getContextualModeDefaults } from '#lib/ai/assistantHelpers.js';

	let { categoryName = '' } = $props();
	const assistantContext = getAssistantContext();
	let openBtnEl = $state(null);

	const modeDefaults = $derived(getContextualModeDefaults('learn-library', { categoryName }));

	$effect(() => {
		return assistantContext.register(() => ({
			mode: 'learn-library',
			categoryName
		}));
	});

	function openGuide(prompt = '', triggerEl = openBtnEl) {
		assistantContext.open({
			mode: 'page',
			prompt,
			submit: Boolean(prompt),
			triggerEl
		});
	}
</script>

<section
	class="border-surface-800 bg-surface-950 text-surface-50 flex flex-col gap-4 border-2 p-5 sm:p-6"
	aria-labelledby="learn-navigator-title"
>
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex min-w-0 items-center gap-3.5">
			<span
				class="bg-tertiary-500 text-surface-950 flex h-9 w-9 shrink-0 items-center justify-center"
				aria-hidden="true"
			>
				<IconSparkles class="h-4 w-4" />
			</span>
			<div class="min-w-0">
				<p class="text-primary-500 m-0 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
					AI library guide
				</p>
				<h2
					id="learn-navigator-title"
					class="text-surface-50! m-0 text-base font-black tracking-tight uppercase sm:text-lg"
				>
					Not sure where to start? Ask the library
				</h2>
			</div>
		</div>
		<button
			bind:this={openBtnEl}
			type="button"
			class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex shrink-0 items-center gap-2 px-5 py-3 text-xs font-black tracking-[0.18em] uppercase transition"
			onclick={() => openGuide('', openBtnEl)}
		>
			<span>Ask the library</span>
			<IconArrowRight class="h-4 w-4" />
		</button>
	</div>

	<div class="flex flex-wrap gap-2" aria-label="Starter library questions">
		{#each modeDefaults.starterPrompts as example}
			<button
				type="button"
				class="border-surface-500 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition pointer-coarse:min-h-11"
				onclick={(event) => openGuide(example, event.currentTarget)}
			>
				{example}
			</button>
		{/each}
	</div>
</section>
