<script>
	import {
		BIKE_VIBE_OPTIONS,
		IMAGE_STYLE_GROUPS,
		IMAGE_STYLE_PRESETS,
		US_STATE_OPTIONS,
		resolveDefaultBikeVibeId,
		resolveDefaultStateCode,
		styleRequiresBikeVibeSelection,
		styleRequiresStateSelection
	} from '#lib/ai/artworkStudio';

	let {
		styleId = $bindable('comic_house'),
		stateCode = $bindable(''),
		bikeVibeId = $bindable(''),
		disabled = false,
		compact = false,
		showStyleDescription = true,
		idPrefix = 'artwork-style',
		buildContext = () => ({})
	} = $props();

	let resolvingState = $state(false);

	const selectedStyle = $derived(
		IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? null
	);
	const requiresState = $derived(styleRequiresStateSelection(styleId));
	const requiresBikeVibe = $derived(styleRequiresBikeVibeSelection(styleId));

	async function ensureDefaultState() {
		if (stateCode || !requiresState || resolvingState) return;
		resolvingState = true;
		try {
			const context = (await buildContext?.()) ?? {};
			const resolved = await resolveDefaultStateCode({
				currentStateCode: stateCode,
				context
			});
			if (resolved && !stateCode) {
				stateCode = resolved;
			}
		} finally {
			resolvingState = false;
		}
	}

	async function ensureDefaultBikeVibe() {
		if (bikeVibeId || !requiresBikeVibe) return;
		const context = (await buildContext?.()) ?? {};
		const resolved = resolveDefaultBikeVibeId({
			currentBikeVibeId: bikeVibeId,
			context
		});
		if (resolved && !bikeVibeId) {
			bikeVibeId = resolved;
		}
	}

	$effect(() => {
		if (requiresState) {
			void ensureDefaultState();
		}
	});

	$effect(() => {
		if (requiresBikeVibe) {
			void ensureDefaultBikeVibe();
		}
	});
</script>

{#if compact}
	<div class="artwork-compact-style">
		<label class="artwork-compact-field" for={`${idPrefix}-select`}>
			<span class="artwork-compact-label">Style</span>
			<select
				id={`${idPrefix}-select`}
				class="artwork-compact-select"
				bind:value={styleId}
				{disabled}
			>
				{#each IMAGE_STYLE_GROUPS as styleGroup (styleGroup.label)}
					<optgroup label={styleGroup.label}>
						{#each styleGroup.presets as preset (preset.id)}
							<option value={preset.id}>{preset.label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</label>

		{#if requiresState}
			<label class="artwork-compact-field" for={`${idPrefix}-state`}>
				<span class="artwork-compact-label">State</span>
				<select
					id={`${idPrefix}-state`}
					class="artwork-compact-select"
					bind:value={stateCode}
					{disabled}
				>
					<option value="">Select…</option>
					{#each US_STATE_OPTIONS as option (option.code)}
						<option value={option.code}>{option.name} ({option.code})</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if requiresBikeVibe}
			<label class="artwork-compact-field" for={`${idPrefix}-bike`}>
				<span class="artwork-compact-label">Bike theme</span>
				<select
					id={`${idPrefix}-bike`}
					class="artwork-compact-select"
					bind:value={bikeVibeId}
					{disabled}
				>
					<option value="">Select…</option>
					{#each BIKE_VIBE_OPTIONS as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	{#if showStyleDescription && selectedStyle?.description}
		<p class="artwork-compact-description">{selectedStyle.description}</p>
	{/if}
{:else}
	<div class="space-y-4">
		<label class="block" for={`${idPrefix}-select`}>
			<span class="label mb-1">Style</span>
			<select id={`${idPrefix}-select`} class="select" bind:value={styleId} {disabled}>
				{#each IMAGE_STYLE_GROUPS as styleGroup (styleGroup.label)}
					<optgroup label={styleGroup.label}>
						{#each styleGroup.presets as preset (preset.id)}
							<option value={preset.id}>{preset.label}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</label>

		{#if showStyleDescription && selectedStyle?.description}
			<p class="text-xs leading-relaxed opacity-70">{selectedStyle.description}</p>
		{/if}

		{#if requiresState}
			<label class="block" for={`${idPrefix}-state`}>
				<span class="label mb-1">State or territory</span>
				<select id={`${idPrefix}-state`} class="select" bind:value={stateCode} {disabled}>
					<option value="">Select a state</option>
					{#each US_STATE_OPTIONS as option (option.code)}
						<option value={option.code}>{option.name} ({option.code})</option>
					{/each}
				</select>
				{#if resolvingState}
					<p class="mt-1 text-xs opacity-60">Detecting a default from available location data…</p>
				{/if}
			</label>
		{/if}

		{#if requiresBikeVibe}
			<label class="block" for={`${idPrefix}-bike`}>
				<span class="label mb-1">Bike type or vibe</span>
				<select id={`${idPrefix}-bike`} class="select" bind:value={bikeVibeId} {disabled}>
					<option value="">Select a bike vibe</option>
					{#each BIKE_VIBE_OPTIONS as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>
{/if}

<style>
	.artwork-compact-style {
		display: contents;
	}

	.artwork-compact-field {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		min-width: 0;
		flex: 0 0 auto;
	}

	.artwork-compact-label {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--color-surface-400);
	}

	.artwork-compact-select {
		width: max-content;
		max-width: 13rem;
		min-width: 0;
		padding: 0.3rem 1.35rem 0.3rem 0.5rem;
		font-size: 0.7rem;
		line-height: 1.2;
		color: var(--color-surface-100);
		background-color: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.5rem;
		cursor: pointer;
		outline: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' /%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.35rem center;
		background-size: 0.85rem;
	}

	.artwork-compact-select:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.artwork-compact-select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.artwork-compact-description {
		font-size: 0.66rem;
		line-height: 1.3;
		color: color-mix(in oklab, var(--color-surface-400) 90%, white 10%);
		margin-top: 0.25rem;
		padding-left: 0.4rem;
		border-left: 1px solid color-mix(in oklab, var(--color-secondary-500) 16%, transparent);
	}
</style>
