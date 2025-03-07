<script>
	import '../app.css';
	let { children } = $props();
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
</script>

<svelte:head>
	<title>SafeSpokes | 3 Feet Please</title>
</svelte:head>

<div class="from-surface-950 to-surface-700 h-full min-h-screen bg-linear-to-br">
	<AppBar background="bg-primary-500" classes="text-surface-950">
		{#snippet lead()}
			<img src="/3fp.png" alt="3 Feet Please" class="h-6 w-6" />
			<span class="font-bold">SafeSpokes</span>
		{/snippet}
		{#snippet trail()}
			<span class="text-surface-500 text-sm">3 Feet Please</span>
		{/snippet}
	</AppBar>

	<main class="flex w-full flex-col items-center gap-4 p-4">
		{@render children()}
	</main>
</div>
