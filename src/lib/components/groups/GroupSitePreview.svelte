<script>
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconRefresh from '@lucide/svelte/icons/refresh-cw';
	import IconSmartphone from '@lucide/svelte/icons/smartphone';
	import IconTablet from '@lucide/svelte/icons/tablet';

	let { src = '/', liveUrl = '/', title = 'Website preview' } = $props();
	let device = $state('desktop');
	let zoom = $state(0.8);
	let nonce = $state(0);
	let loading = $state(true);

	const frameWidth = $derived(
		device === 'mobile' ? '390px' : device === 'tablet' ? '768px' : '1280px'
	);
	const previewSrc = $derived(`${src}${src.includes('?') ? '&' : '?'}preview=${nonce}`);
</script>

<div class="card preset-outlined-surface-200-800 overflow-hidden">
	<div
		class="preset-tonal-surface preset-divider-bottom flex flex-wrap items-center justify-between gap-2 p-3"
	>
		<div>
			<p class="font-semibold">Published preview</p>
			<p class="text-xs opacity-60">Saved site content with your current address.</p>
		</div>
		<div class="flex flex-wrap items-center gap-1">
			<div class="flex gap-1" aria-label="Preview device">
				<button
					class="btn btn-sm {device === 'desktop'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					onclick={() => (device = 'desktop')}
					aria-pressed={device === 'desktop'}
					aria-label="Desktop preview"
					><IconMonitor class="h-4 w-4" /><span class="hidden sm:inline">Desktop</span></button
				>
				<button
					class="btn btn-sm {device === 'tablet'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					onclick={() => (device = 'tablet')}
					aria-pressed={device === 'tablet'}
					aria-label="Tablet preview"
					><IconTablet class="h-4 w-4" /><span class="hidden sm:inline">Tablet</span></button
				>
				<button
					class="btn btn-sm {device === 'mobile'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					onclick={() => (device = 'mobile')}
					aria-pressed={device === 'mobile'}
					aria-label="Mobile preview"
					><IconSmartphone class="h-4 w-4" /><span class="hidden sm:inline">Mobile</span></button
				>
			</div>
			<select class="select w-24 text-sm" bind:value={zoom} aria-label="Preview zoom"
				><option value={0.65}>65%</option><option value={0.8}>80%</option><option value={1}
					>100%</option
				></select
			>
			<button
				class="btn btn-sm preset-tonal-surface"
				type="button"
				onclick={() => {
					loading = true;
					nonce += 1;
				}}
				aria-label="Refresh preview"><IconRefresh class="h-4 w-4" /></button
			>
			<a class="btn btn-sm preset-tonal-surface" href={liveUrl} target="_blank" rel="noreferrer"
				><IconExternalLink class="h-4 w-4" /><span class="hidden sm:inline">Open</span></a
			>
		</div>
	</div>
	<div class="preset-tonal-tertiary relative min-h-[34rem] overflow-auto p-3 sm:p-5">
		{#if loading}<div
				class="preset-tonal-surface absolute inset-x-4 top-4 z-10 p-3 text-center text-sm"
			>
				Loading preview…
			</div>{/if}
		<div
			class="mx-auto overflow-hidden shadow-xl"
			style:width={`min(100%, ${frameWidth})`}
			style:height={`${52 * zoom}rem`}
		>
			<iframe
				{title}
				src={previewSrc}
				class="block origin-top-left"
				style:width={`${100 / zoom}%`}
				style:height={`${52 / zoom}rem`}
				style:transform={`scale(${zoom})`}
				onload={() => (loading = false)}
			></iframe>
		</div>
	</div>
</div>
