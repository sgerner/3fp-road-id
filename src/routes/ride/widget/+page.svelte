<script>
	import { page } from '$app/stores';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconLink from '@lucide/svelte/icons/link';
	import IconRefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import IconLayout from '@lucide/svelte/icons/layout-template';
	import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import IconCode from '@lucide/svelte/icons/code-2';
	import IconBike from '@lucide/svelte/icons/bike';
	import { slide } from 'svelte/transition';
	import {
		buildRideWidgetSearchParams,
		normalizeRideWidgetConfig,
		parseRideWidgetConfigFromSearchParams
	} from '$lib/rides/widgetConfig';

	const { data } = $props();
	const initialConfig = normalizeRideWidgetConfig(
		parseRideWidgetConfigFromSearchParams($page.url.searchParams)
	);

	let organizationSlug = $state(initialConfig.organizationSlug);
	let city = $state(initialConfig.city);
	let stateRegion = $state(initialConfig.state);
	let near = $state(initialConfig.near);
	let radiusMiles = $state(initialConfig.radiusMiles ?? '');
	let latitude = $state(initialConfig.latitude ?? '');
	let longitude = $state(initialConfig.longitude ?? '');
	let defaultTab = $state(initialConfig.defaultTab);
	let theme = $state(initialConfig.theme);
	let density = $state(initialConfig.density);
	let showUserFilters = $state(initialConfig.showUserFilters);
	let showAddButton = $state(initialConfig.showAddButton);
	let prefixCity = $state(initialConfig.prefixCity);
	let difficultyColors = $state(initialConfig.difficultyColors);
	let excludeRideSlugs = $state(initialConfig.excludeRideSlugs.join(', '));
	let iframeHeight = $state(880);

	let showDirections = $state(false);
	let copyUrlState = $state(false);
	let copyCodeState = $state(false);
	let saveError = $state('');
	let saveSuccess = $state('');
	let saving = $state(false);
	let savedWidgetId = $state('');
	let lastSavedSignature = $state('');

	const normalizedConfig = $derived(
		normalizeRideWidgetConfig({
			organizationSlug,
			city,
			state: stateRegion,
			near,
			radiusMiles,
			latitude,
			longitude,
			defaultTab,
			theme,
			density,
			showUserFilters,
			showAddButton,
			prefixCity,
			difficultyColors,
			excludeRideSlugs
		})
	);
	const configSignature = $derived(JSON.stringify(normalizedConfig));
	const hasMatchingSavedConfig = $derived(
		Boolean(savedWidgetId) && configSignature === lastSavedSignature
	);
	const queryString = $derived(buildRideWidgetSearchParams(normalizedConfig).toString());
	const previewPath = $derived.by(() =>
		queryString ? `/ride/widget/frame?${queryString}` : '/ride/widget/frame'
	);
	const fullPreviewUrl = $derived.by(() => `${data.origin}${previewPath}`);
	const shortPreviewUrl = $derived.by(() =>
		hasMatchingSavedConfig ? `${data.origin}/ride/widget/frame?wid=${savedWidgetId}` : ''
	);
	const shareUrl = $derived(hasMatchingSavedConfig ? shortPreviewUrl : fullPreviewUrl);
	const embedCode = $derived.by(
		() =>
			`<iframe\n  src="${shareUrl}"\n  title="3FP Ride Listings"\n  loading="lazy"\n  width="100%"\n  height="${iframeHeight}"\n  style="border:0; width:100%; max-width:100%;"\n></iframe>`
	);

	async function copyText(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			if (key === 'url') {
				copyUrlState = true;
				setTimeout(() => (copyUrlState = false), 1200);
			}
			if (key === 'code') {
				copyCodeState = true;
				setTimeout(() => (copyCodeState = false), 1200);
			}
		} catch (error) {
			console.error('Clipboard copy failed', error);
		}
	}

	function resetAll() {
		const defaults = normalizeRideWidgetConfig({});
		organizationSlug = defaults.organizationSlug;
		city = defaults.city;
		stateRegion = defaults.state;
		near = defaults.near;
		radiusMiles = defaults.radiusMiles ?? '';
		latitude = defaults.latitude ?? '';
		longitude = defaults.longitude ?? '';
		defaultTab = defaults.defaultTab;
		theme = defaults.theme;
		density = defaults.density;
		showUserFilters = defaults.showUserFilters;
		showAddButton = defaults.showAddButton;
		prefixCity = defaults.prefixCity;
		difficultyColors = defaults.difficultyColors;
		excludeRideSlugs = defaults.excludeRideSlugs.join(', ');
		saveError = '';
		saveSuccess = '';
	}

	async function saveAsShortWidget() {
		saveError = '';
		saveSuccess = '';
		saving = true;
		try {
			const response = await fetch('/api/ride-widgets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ config: normalizedConfig })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) throw new Error(payload?.error || 'Unable to save widget config.');
			savedWidgetId = payload?.data?.id ?? '';
			lastSavedSignature = configSignature;
			saveSuccess = 'Saved. You can now share the short widget URL.';
		} catch (error) {
			saveError = error.message || 'Unable to save widget config.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Ride Widget Builder · 3 Feet Please</title>
	<meta
		name="description"
		content="Create an embeddable 3FP ride directory widget with list, calendar, and map views."
	/>
</svelte:head>

<div class="widget-builder mx-auto flex w-full max-w-7xl flex-col gap-8">
	<!-- ══════════════════════ HERO ══════════════════════ -->
	<section class="builder-hero relative overflow-hidden rounded-3xl">
		<!-- Animated orbs -->
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div class="relative z-10 flex flex-wrap items-center justify-between gap-6 p-7 lg:p-10">
			<!-- Left: identity -->
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconBike class="h-3.5 w-3.5" />
						Embeddable Directory
					</span>
					<span class="chip preset-tonal-secondary text-xs">iFrame Widget</span>
					<span class="chip preset-tonal-tertiary text-xs">Live Preview</span>
				</div>
				<div>
					<h1
						class="builder-headline text-4xl font-extrabold tracking-tight text-balance lg:text-5xl"
					>
						Ride Widget Builder
					</h1>
					<p class="mt-2 max-w-xl text-base leading-relaxed opacity-70">
						Configure filters and styles, then copy the iFrame code to embed a live ride directory
						on any site.
					</p>
				</div>
			</div>

			<!-- Right: CTAs -->
			<div class="flex flex-wrap items-center gap-3">
				<a class="btn preset-filled-primary-500 gap-2 shadow-lg" href={previewPath} target="_blank">
					Open preview
					<IconExternalLink class="h-4 w-4" />
				</a>
				<button class="btn preset-tonal-surface gap-2" onclick={resetAll}>
					<IconRefreshCcw class="h-4 w-4" />
					Reset
				</button>
			</div>
		</div>
	</section>

	<!-- ══════════════════════ CONFIG FORM ══════════════════════ -->
	<section class="card preset-tonal-surface space-y-6 p-6">
		<!-- ── Geography ── -->
		<div class="config-section">
			<div class="config-section-label">
				<IconSlidersHorizontal class="h-3.5 w-3.5" />
				Geography & Filtering
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label class="flex flex-col gap-1.5">
					<span class="label">Organization</span>
					<select class="select" bind:value={organizationSlug}>
						<option value="">All organizations</option>
						{#each data.organizations as org}
							<option value={org.slug}>{org.name}</option>
						{/each}
					</select>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">City</span>
					<input class="input" bind:value={city} placeholder="Phoenix" />
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">State</span>
					<input class="input" bind:value={stateRegion} placeholder="AZ" />
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Exclude ride slugs (comma separated)</span>
					<input
						class="input"
						bind:value={excludeRideSlugs}
						placeholder="sunset-social, friday-commute"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Radius center (zip/address)</span>
					<input class="input" bind:value={near} placeholder="85004 or Tempe, AZ" />
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Radius (miles)</span>
					<input
						class="input"
						bind:value={radiusMiles}
						type="number"
						min="1"
						max="500"
						step="0.5"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Latitude (optional override)</span>
					<input class="input" bind:value={latitude} type="number" step="0.0001" />
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Longitude (optional override)</span>
					<input class="input" bind:value={longitude} type="number" step="0.0001" />
				</label>
			</div>
		</div>

		<div class="border-surface-500/15 border-t"></div>

		<!-- ── Appearance ── -->
		<div class="config-section">
			<div class="config-section-label">
				<IconLayout class="h-3.5 w-3.5" />
				Appearance
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label class="flex flex-col gap-1.5">
					<span class="label">Default tab</span>
					<select class="select" bind:value={defaultTab}>
						<option value="list">List</option>
						<option value="calendar">Calendar</option>
						<option value="map">Map</option>
					</select>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Theme</span>
					<select class="select" bind:value={theme}>
						<option value="auto">Auto</option>
						<option value="light">Light</option>
						<option value="dark">Dark</option>
					</select>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">Density</span>
					<select class="select" bind:value={density}>
						<option value="comfortable">Comfortable</option>
						<option value="compact">Compact</option>
					</select>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="label">iFrame height (px)</span>
					<input
						class="input"
						bind:value={iframeHeight}
						type="number"
						min="520"
						max="1800"
						step="20"
					/>
				</label>
			</div>
		</div>

		<div class="border-surface-500/15 border-t"></div>

		<!-- ── Features ── -->
		<div class="config-section">
			<div class="config-section-label">
				<IconCode class="h-3.5 w-3.5" />
				Feature Flags
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label class="feature-flag-card">
					<button
						type="button"
						class={`toggle-switch ${showUserFilters ? 'is-on' : ''}`}
						role="switch"
						aria-label="Toggle end-user filters"
						aria-checked={showUserFilters}
						onclick={() => (showUserFilters = !showUserFilters)}
					>
						<span></span>
					</button>
					<span>Allow end-user filters</span>
				</label>

				<label class="feature-flag-card">
					<button
						type="button"
						class={`toggle-switch ${showAddButton ? 'is-on' : ''}`}
						role="switch"
						aria-label="Toggle add event button"
						aria-checked={showAddButton}
						onclick={() => (showAddButton = !showAddButton)}
					>
						<span></span>
					</button>
					<span>Show Add event button</span>
				</label>

				<label class="feature-flag-card">
					<button
						type="button"
						class={`toggle-switch ${difficultyColors ? 'is-on' : ''}`}
						role="switch"
						aria-label="Toggle difficulty color coding"
						aria-checked={difficultyColors}
						onclick={() => (difficultyColors = !difficultyColors)}
					>
						<span></span>
					</button>
					<span>Color code by difficulty + legend</span>
				</label>

				<label class="feature-flag-card">
					<button
						type="button"
						class={`toggle-switch ${prefixCity ? 'is-on' : ''}`}
						role="switch"
						aria-label="Toggle city prefix"
						aria-checked={prefixCity}
						onclick={() => (prefixCity = !prefixCity)}
					>
						<span></span>
					</button>
					<span>Prefix ride titles with city name</span>
				</label>
			</div>
		</div>
	</section>

	<!-- ══════════════════ PREVIEW + SHARE ══════════════════ -->
	<section class="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]">
		<!-- Live Preview -->
		<div class="card preset-tonal-surface overflow-hidden p-4">
			<div class="mb-3 flex items-center justify-between gap-2 px-1">
				<div>
					<p class="label opacity-55">Live Preview</p>
					<h2 class="text-xl font-bold">Widget preview</h2>
				</div>
				<p class="text-xs opacity-60">Updates as you change settings</p>
			</div>
			<iframe
				title="Ride widget preview"
				src={previewPath}
				style={`height:${iframeHeight}px;`}
				class="border-surface-500/20 bg-surface-50-950 w-full rounded-2xl border"
			></iframe>
		</div>

		<!-- Share + Embed -->
		<div class="card preset-tonal-surface flex flex-col gap-5 p-5">
			<!-- Share URL -->
			<div class="share-block">
				<p class="share-block-label">Share URL</p>
				<div class="code-display">
					{shareUrl}
				</div>
				<div class="mt-2.5 flex flex-wrap gap-2">
					<button
						class="btn btn-sm preset-filled-primary-500 gap-1.5"
						onclick={() => copyText(shareUrl, 'url')}
					>
						{#if copyUrlState}
							<IconCheck class="h-4 w-4" />
							Copied!
						{:else}
							<IconCopy class="h-4 w-4" />
							Copy URL
						{/if}
					</button>
					<button
						class="btn btn-sm preset-tonal-secondary gap-1.5"
						onclick={saveAsShortWidget}
						disabled={saving}
					>
						<IconLink class="h-4 w-4" />
						{saving ? 'Saving…' : 'Save short URL'}
					</button>
				</div>
				{#if saveError}
					<p class="text-error-500 mt-2 text-sm">{saveError}</p>
				{/if}
				{#if saveSuccess}
					<p class="text-success-500 mt-2 text-sm">{saveSuccess}</p>
				{/if}
				{#if fullPreviewUrl.length > 280}
					<p class="mt-2 text-xs opacity-55">
						💡 This URL is long. Use "Save short URL" to generate a compact <code>wid</code> parameter.
					</p>
				{/if}
			</div>

			<div class="border-surface-500/15 border-t"></div>

			<!-- iFrame Embed Code -->
			<div class="share-block">
				<p class="share-block-label">iFrame embed code</p>
				<pre class="code-display"><code>{embedCode}</code></pre>
				<button
					class="btn btn-sm preset-filled-secondary-500 mt-2.5 gap-1.5"
					onclick={() => copyText(embedCode, 'code')}
				>
					{#if copyCodeState}
						<IconCheck class="h-4 w-4" />
						Copied!
					{:else}
						<IconCopy class="h-4 w-4" />
						Copy code
					{/if}
				</button>
			</div>

			<div class="border-surface-500/15 border-t"></div>

			<!-- Directions -->
			<div>
				<button
					class="btn btn-sm preset-outlined-surface-950-50 gap-1.5"
					onclick={() => (showDirections = !showDirections)}
				>
					<IconInfo class="h-4 w-4" />
					{showDirections ? 'Hide directions' : 'How to embed'}
				</button>
				{#if showDirections}
					<div
						class="border-surface-500/20 bg-surface-50-950/30 mt-3 space-y-2 rounded-xl border p-4 text-sm"
						transition:slide={{ duration: 180 }}
					>
						<p class="font-semibold">Embedding in 3 easy steps:</p>
						<ol class="list-decimal space-y-1.5 pl-5 opacity-80">
							<li>Copy the iFrame code above.</li>
							<li>Paste it into your site page where the ride directory should appear.</li>
							<li>Adjust the <code>height</code> value if needed, then publish.</li>
						</ol>
						<p class="mt-2 text-xs opacity-60">
							The widget includes List, Calendar, and Map views. The "Add event" button links to
							<code>/ride/new</code>.
						</p>
					</div>
				{/if}
			</div>
		</div>
	</section>
</div>

<style>
	/* ── Hero ── */
	.builder-hero {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.builder-headline {
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-300) 90%, white),
			color-mix(in oklab, var(--color-secondary-300) 80%, white)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(70px);
		pointer-events: none;
		animation: orb-drift 14s ease-in-out infinite alternate;
	}
	.hero-orb-1 {
		width: 50%;
		height: 200%;
		top: -60%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation-duration: 18s;
	}
	.hero-orb-2 {
		width: 35%;
		height: 180%;
		top: -40%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation-duration: 22s;
		animation-direction: alternate-reverse;
	}
	.hero-orb-3 {
		width: 25%;
		height: 100%;
		bottom: -20%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 14%, transparent);
		animation-duration: 26s;
	}

	@keyframes orb-drift {
		from {
			transform: translate(0, 0) scale(1);
		}
		to {
			transform: translate(3%, 6%) scale(1.05);
		}
	}

	/* ── Config Sections ── */
	.config-section {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.config-section-label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		opacity: 0.5;
		padding-left: 0.1rem;
	}

	/* ── Feature flag cards ── */
	.feature-flag-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.875rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 6%, transparent);
		cursor: pointer;
		transition:
			border-color 180ms ease,
			background 180ms ease;
		font-size: 0.875rem;
	}
	.feature-flag-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 5%, transparent);
	}

	/* ── Toggle switch ── */
	.toggle-switch {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		width: 2.75rem;
		height: 1.5rem;
		padding: 0.16rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		transition:
			background-color 200ms ease,
			border-color 200ms ease;
		cursor: pointer;
	}
	.toggle-switch span {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: var(--color-surface-50);
		transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
	}
	.toggle-switch.is-on {
		background: color-mix(in oklab, var(--color-primary-500) 60%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 75%, transparent);
	}
	.toggle-switch.is-on span {
		transform: translateX(1.2rem);
	}

	/* ── Share blocks ── */
	.share-block {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.share-block-label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.5;
		margin-bottom: 0.5rem;
	}

	.code-display {
		background: color-mix(in oklab, var(--color-surface-950) 30%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.6rem;
		padding: 0.65rem 0.8rem;
		font-size: 0.73rem;
		font-family: 'JetBrains Mono', 'Fira Mono', ui-monospace, monospace;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-all;
		line-height: 1.6;
		color: inherit;
	}
</style>
