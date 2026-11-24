<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';

	let { userId = null, pathname = '/' } = $props();
	const assistantContext = getAssistantContext();
	/** @type {import('svelte').Component<any> | null} */
	let assistantComponent = $state(null);
	let loading = $state(false);
	/** @type {HTMLButtonElement | null} */
	let triggerBtnEl = $state(null);

	const buttonBadge = $derived(assistantContext.activeModeMeta?.buttonBadge || 'AI');

	async function ensureAssistantLoaded() {
		if (assistantComponent || loading) return;
		loading = true;
		try {
			assistantComponent = (await import('#lib/components/ai/GlobalAssistant.svelte')).default;
		} finally {
			loading = false;
		}
	}

	function handleTriggerClick() {
		assistantContext.open({
			mode: assistantContext.hasPageMode ? 'page' : 'discover',
			triggerEl: triggerBtnEl
		});
		void ensureAssistantLoaded();
	}

	$effect(() => {
		if (assistantContext.requestedOpen && !assistantComponent && !loading) {
			void ensureAssistantLoaded();
		}
	});
</script>

{#if assistantComponent}
	{@const Assistant = assistantComponent}
	<Assistant {userId} {pathname} initialOpen={true} />
{:else}
	<div class="assistant-lane-root md:fixed md:right-4 md:bottom-4 md:z-[80]">
		<button
			bind:this={triggerBtnEl}
			type="button"
			class="group border-primary-500 bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-none border-2 px-3 py-2 font-black tracking-[0.16em] uppercase shadow-none transition-colors disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
			onclick={handleTriggerClick}
			disabled={loading}
			aria-label={`Open 3FP assistant (${assistantContext.activeModeMeta?.tabLabel || 'AI'})`}
		>
			<IconSparkles class="text-primary-500 group-hover:text-surface-950 h-3.5 w-3.5 shrink-0" />
			<span class="text-xs font-black tracking-[0.16em] uppercase">{buttonBadge}</span>
		</button>
	</div>
{/if}
