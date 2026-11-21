<script>
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';

	// Flat solid status block. Every field uses dark text (AA on error, warning, and success).
	let { tone = 'error', title, children } = $props();

	const TONES = {
		error: { icon: IconAlertCircle, field: 'bg-error-500', role: 'alert' },
		warning: { icon: IconTriangleAlert, field: 'bg-warning-500', role: 'status' },
		success: { icon: IconCheck, field: 'bg-success-500', role: 'status' }
	};

	const current = $derived(TONES[tone] ?? TONES.error);
	const Icon = $derived(current.icon);
</script>

<div role={current.role} class="{current.field} text-surface-950 flex items-start gap-3 px-5 py-4">
	<Icon class="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
	<div class="min-w-0 text-sm leading-snug font-medium">
		{#if title}
			<p class="m-0 font-black tracking-wide uppercase">{title}</p>
		{/if}
		{#if children}
			<div class="m-0">{@render children()}</div>
		{/if}
	</div>
</div>
