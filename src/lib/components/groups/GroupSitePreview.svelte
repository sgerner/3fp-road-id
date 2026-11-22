<script>
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconGlobe from '@lucide/svelte/icons/globe-2';
	import IconList from '@lucide/svelte/icons/layout-list';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconRefresh from '@lucide/svelte/icons/refresh-cw';
	import IconSmartphone from '@lucide/svelte/icons/smartphone';
	import IconTablet from '@lucide/svelte/icons/tablet';

	let {
		mode = $bindable('directory'),
		directorySrc = '/',
		directoryLiveUrl = '/',
		websiteSrc = '/',
		websiteLiveUrl = '/',
		src = '',
		liveUrl = '',
		title = 'Public presence preview',
		dirty = false
	} = $props();

	let device = $state('desktop');
	let zoom = $state(0.8);
	let nonce = $state(0);
	let loading = $state(true);

	const activeSrc = $derived(
		mode === 'directory' ? directorySrc || src || '/' : websiteSrc || src || '/'
	);
	const activeLiveUrl = $derived(
		mode === 'directory' ? directoryLiveUrl || liveUrl || '/' : websiteLiveUrl || liveUrl || '/'
	);
	const activeLabel = $derived(mode === 'directory' ? 'Directory listing' : 'Custom website');

	const frameWidth = $derived(
		device === 'mobile' ? '390px' : device === 'tablet' ? '768px' : '1280px'
	);
	const previewSrc = $derived(`${activeSrc}${activeSrc.includes('?') ? '&' : '?'}preview=${nonce}`);

	function switchMode(nextMode) {
		if (mode === nextMode) return;
		loading = true;
		mode = nextMode;
	}
</script>

<div
	class="border-surface-700 bg-surface-900 border-t-primary-500 overflow-hidden border border-t-4"
>
	<div
		class="border-surface-800 bg-surface-950 flex flex-wrap items-center justify-between gap-3 border-b p-3"
	>
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<p class="text-surface-50 text-sm font-bold tracking-wide uppercase">
					Published preview · {activeLabel}
				</p>
				{#if dirty}
					<span class="badge preset-filled-warning-500 text-surface-950 text-[0.68rem] font-bold">
						Publish to refresh live frame
					</span>
				{/if}
			</div>
			<p class="text-surface-300 mt-0.5 truncate text-xs">
				{mode === 'directory'
					? '3 Feet Please directory listing inside the community app shell.'
					: 'Standalone custom website outside the directory chrome.'}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-1.5">
			<div
				class="border-surface-700 bg-surface-900 flex border p-0.5"
				role="group"
				aria-label="Preview surface"
			>
				<button
					class="btn btn-sm {mode === 'directory'
						? 'preset-filled-primary-500 text-surface-950 font-bold'
						: 'text-surface-200 hover:bg-surface-800'}"
					type="button"
					onclick={() => switchMode('directory')}
					aria-pressed={mode === 'directory'}
				>
					<IconList class="h-4 w-4" />
					<span>Directory</span>
				</button>
				<button
					class="btn btn-sm {mode === 'website'
						? 'preset-filled-primary-500 text-surface-950 font-bold'
						: 'text-surface-200 hover:bg-surface-800'}"
					type="button"
					onclick={() => switchMode('website')}
					aria-pressed={mode === 'website'}
				>
					<IconGlobe class="h-4 w-4" />
					<span>Website</span>
				</button>
			</div>

			<div class="flex gap-1" role="group" aria-label="Preview device">
				<button
					class="btn btn-sm {device === 'desktop'
						? 'preset-filled-secondary-500 text-surface-50'
						: 'border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800 border'}"
					type="button"
					onclick={() => (device = 'desktop')}
					aria-pressed={device === 'desktop'}
					aria-label="Desktop preview"
				>
					<IconMonitor class="h-4 w-4" /><span class="hidden sm:inline">Desktop</span>
				</button>
				<button
					class="btn btn-sm {device === 'tablet'
						? 'preset-filled-secondary-500 text-surface-50'
						: 'border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800 border'}"
					type="button"
					onclick={() => (device = 'tablet')}
					aria-pressed={device === 'tablet'}
					aria-label="Tablet preview"
				>
					<IconTablet class="h-4 w-4" /><span class="hidden sm:inline">Tablet</span>
				</button>
				<button
					class="btn btn-sm {device === 'mobile'
						? 'preset-filled-secondary-500 text-surface-50'
						: 'border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800 border'}"
					type="button"
					onclick={() => (device = 'mobile')}
					aria-pressed={device === 'mobile'}
					aria-label="Mobile preview"
				>
					<IconSmartphone class="h-4 w-4" /><span class="hidden sm:inline">Mobile</span>
				</button>
			</div>

			<select
				class="select border-surface-700 bg-surface-900 text-surface-50 w-24 border text-sm"
				bind:value={zoom}
				aria-label="Preview zoom"
			>
				<option value={0.65}>65%</option>
				<option value={0.8}>80%</option>
				<option value={1}>100%</option>
			</select>
			<button
				class="btn btn-sm border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800 border"
				type="button"
				onclick={() => {
					loading = true;
					nonce += 1;
				}}
				aria-label="Refresh preview"
			>
				<IconRefresh class="h-4 w-4" />
			</button>
			<a
				class="btn btn-sm preset-outlined-primary-500 hover:preset-filled-primary-500"
				href={activeLiveUrl}
				target="_blank"
				rel="noreferrer"
			>
				<IconExternalLink class="h-4 w-4" /><span class="hidden sm:inline">Open</span>
			</a>
		</div>
	</div>

	<div class="bg-surface-950 relative min-h-[34rem] overflow-auto p-3 sm:p-5">
		{#if loading}
			<div
				class="border-surface-700 bg-surface-900 text-surface-100 absolute inset-x-4 top-4 z-10 border p-3 text-center text-sm"
			>
				Loading {activeLabel.toLowerCase()} preview…
			</div>
		{/if}
		<div
			class="border-surface-700 mx-auto overflow-hidden border shadow-2xl"
			style:width={`min(100%, ${frameWidth})`}
			style:height={`${52 * zoom}rem`}
		>
			<iframe
				title={`${title} (${activeLabel})`}
				src={previewSrc}
				class="block origin-top-left bg-white"
				style:width={`${100 / zoom}%`}
				style:height={`${52 / zoom}rem`}
				style:transform={`scale(${zoom})`}
				onload={() => (loading = false)}
			></iframe>
		</div>
	</div>
</div>
