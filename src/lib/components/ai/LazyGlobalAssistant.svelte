<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';

	/** @type {Record<string, any>} */
	let { userId = null, pathname = '/' } = $props();
	/** @type {any} */
	let assistantComponent = $state(null);
	let loading = $state(false);

	async function openAssistant() {
		if (assistantComponent || loading) return;
		loading = true;
		try {
			assistantComponent = (await import('#lib/components/ai/GlobalAssistant.svelte')).default;
		} finally {
			loading = false;
		}
	}
</script>

{#if assistantComponent}
	{@const Assistant = assistantComponent}
	<Assistant {userId} {pathname} initialOpen={true} />
{:else}
	<div class="md:fixed md:right-0 md:bottom-0 md:z-[80]">
		<button
			type="button"
			class="group border-primary-500 bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-none border-2 px-3 py-2 font-black tracking-wider uppercase shadow-none transition-colors"
			onclick={openAssistant}
			disabled={loading}
			aria-label="Open AI assistant"
		>
			<IconSparkles class="text-primary-500 group-hover:text-surface-950 h-3.5 w-3.5" />
			<span class="text-xs font-black tracking-wider uppercase">AI</span>
		</button>
	</div>
{/if}
