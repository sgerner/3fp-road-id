<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';

	let { userId = null, pathname = '/' } = $props();
	let assistantComponent = $state(null);
	let loading = $state(false);

	async function openAssistant() {
		if (assistantComponent || loading) return;
		loading = true;
		try {
			assistantComponent = (await import('$lib/components/ai/GlobalAssistant.svelte')).default;
		} finally {
			loading = false;
		}
	}
</script>

{#if assistantComponent}
	{@const Assistant = assistantComponent}
	<Assistant {userId} {pathname} initialOpen={true} />
{:else}
	<div class="fixed right-0 bottom-0 z-[80]">
		<button
			type="button"
			class="btn btn-sm preset-tonal-secondary inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 py-2 font-bold shadow-xl"
			onclick={openAssistant}
			disabled={loading}
			aria-label="Open AI assistant"
		>
			<IconSparkles class="h-3.5 w-3.5" />
			<span class="text-xs font-semibold tracking-wide uppercase">AI</span>
		</button>
	</div>
{/if}
