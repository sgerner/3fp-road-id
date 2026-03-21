<script>
	import { onMount } from 'svelte';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import {
		BIKE_VIBE_STYLE_ID,
		IMAGE_STYLE_PRESETS,
		STATE_MASCOT_STYLE_ID
	} from '$lib/ai/imageStyles';
	import { BIKE_VIBE_OPTIONS, getBikeVibeById, normalizeBikeVibeId } from '$lib/ai/bikeVibes';
	import { getUsStateName, normalizeUsStateCode, US_STATE_OPTIONS } from '$lib/geo/usStates';

	let {
		target = 'ride',
		heading = 'Generate image',
		description = '',
		helperText = '',
		aspectRatio = '16:9',
		articleId = null,
		currentImageUrl = '',
		defaultStyleId = IMAGE_STYLE_PRESETS[0]?.id ?? 'comic_house',
		buildContext = () => ({}),
		onApply = () => {}
	} = $props();

	let styleId = $state('');
	let userPrompt = $state('');
	let generating = $state(false);
	let error = $state('');
	let lastGeneratedUrl = $state('');
	let selectedStateCode = $state('');
	let selectedBikeVibeId = $state('');
	let resolvingState = $state(false);

	const selectedStyle = $derived.by(
		() => IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? null
	);
	const requiresStateSelection = $derived(styleId === STATE_MASCOT_STYLE_ID);
	const requiresBikeVibeSelection = $derived(styleId === BIKE_VIBE_STYLE_ID);

	const previewUrl = $derived(currentImageUrl || lastGeneratedUrl || '');

	function inferStateCodeFromContext(context = {}) {
		if (!context || typeof context !== 'object') return '';
		const directCandidates = [
			context.state,
			context.stateCode,
			context.state_region,
			context.geoState,
			context.geo_state,
			context.hostGroupState,
			context.groupState
		];
		for (const value of directCandidates) {
			const normalized = normalizeUsStateCode(value);
			if (normalized) return normalized;
		}

		const locationCandidates = [
			context.location,
			context.startLocation,
			context.endLocation,
			context.serviceArea,
			context.hostGroupLocation,
			context.groupLocation
		];
		for (const value of locationCandidates) {
			const text = String(value ?? '').trim();
			if (!text) continue;
			const parts = text.split(/[,\u00b7|/]+/g).map((part) => part.trim());
			for (const part of parts.reverse()) {
				const normalized = normalizeUsStateCode(part);
				if (normalized) return normalized;
			}
		}

		return '';
	}

	function inferBikeVibeIdFromContext(context = {}) {
		if (!context || typeof context !== 'object') return '';
		const textBlob = [
			context.disciplines,
			context.ridingDisciplines,
			context.summary,
			context.description,
			context.title,
			context.prompt
		]
			.flat()
			.filter(Boolean)
			.map((value) => String(value).toLowerCase())
			.join(' ');

		if (/\b(gravel)\b/.test(textBlob)) return 'gravel_adventure';
		if (/\b(e[-\s]?bike|electric)\b/.test(textBlob)) return 'ebike_commuter';
		if (/\b(mountain|mtb|trail)\b/.test(textBlob)) return 'mountain_trail';
		if (/\b(fixie|fixed gear|track)\b/.test(textBlob)) return 'fixie_minimal';
		if (/\b(kid|kids|youth|child)\b/.test(textBlob)) return 'kids_playbike';
		if (/\b(road|race|criterium|crit)\b/.test(textBlob)) return 'road_race';
		return '';
	}

	async function resolveDefaultStateSelection() {
		if (selectedStateCode || !requiresStateSelection || resolvingState) return;
		resolvingState = true;
		try {
			const context = (await buildContext?.()) ?? {};
			const fromContext = inferStateCodeFromContext(context);
			if (fromContext) {
				selectedStateCode = fromContext;
				return;
			}

			const response = await fetch('/api/location/region');
			const payload = await response.json().catch(() => ({}));
			const fromIp = normalizeUsStateCode(payload?.stateCode);
			if (response.ok && fromIp) {
				selectedStateCode = fromIp;
			}
		} catch {
			// Best effort only.
		} finally {
			resolvingState = false;
		}
	}

	async function resolveDefaultBikeVibeSelection() {
		if (selectedBikeVibeId || !requiresBikeVibeSelection) return;
		const context = (await buildContext?.()) ?? {};
		const inferred = normalizeBikeVibeId(inferBikeVibeIdFromContext(context));
		if (inferred) selectedBikeVibeId = inferred;
	}

	$effect(() => {
		if (!styleId) {
			styleId = defaultStyleId;
		}
	});

	$effect(() => {
		if (requiresStateSelection) {
			void resolveDefaultStateSelection();
		}
	});

	$effect(() => {
		if (requiresBikeVibeSelection) {
			void resolveDefaultBikeVibeSelection();
		}
	});

	onMount(() => {
		if (requiresStateSelection) {
			void resolveDefaultStateSelection();
		}
		if (requiresBikeVibeSelection) {
			void resolveDefaultBikeVibeSelection();
		}
	});

	async function generateImage() {
		error = '';
		if (requiresStateSelection && !selectedStateCode) {
			error = 'Select a state or territory for this style.';
			return;
		}
		if (requiresBikeVibeSelection && !selectedBikeVibeId) {
			error = 'Select a bike type or vibe for this style.';
			return;
		}
		generating = true;

		try {
			const context = (await buildContext?.()) ?? {};
			const styleOptions = {
				...(requiresStateSelection
					? {
							stateCode: selectedStateCode,
							stateName: getUsStateName(selectedStateCode)
						}
					: {}),
				...(requiresBikeVibeSelection
					? {
							bikeVibeId: selectedBikeVibeId,
							bikeVibeLabel: getBikeVibeById(selectedBikeVibeId)?.label || '',
							bikeVibePrompt: getBikeVibeById(selectedBikeVibeId)?.promptCue || ''
						}
					: {})
			};
			const response = await fetch('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target,
					aspectRatio,
					styleId,
					prompt: userPrompt.trim() || null,
					styleOptions,
					context,
					articleId
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.error || 'Unable to generate image.');
			}

			lastGeneratedUrl = result?.url || '';
			if (lastGeneratedUrl) {
				await onApply?.(result);
			}
		} catch (generationError) {
			error = generationError.message || 'Unable to generate image.';
		} finally {
			generating = false;
		}
	}
</script>

<div class="border-surface-500/20 bg-surface-900/45 space-y-4 rounded-2xl border p-4">
	<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2 font-medium">
				<IconSparkles class="h-4 w-4" />
				<span>{heading}</span>
			</div>
			{#if description}
				<p class="text-sm opacity-75">{description}</p>
			{/if}
		</div>
		<div class="chip preset-tonal-surface text-xs">{aspectRatio} comic artwork</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
		<div class="space-y-4">
			<label class="block">
				<span class="label mb-1">Style</span>
				<select class="select" bind:value={styleId}>
					{#each IMAGE_STYLE_PRESETS as preset}
						<option value={preset.id}>{preset.label}</option>
					{/each}
				</select>
			</label>

			{#if selectedStyle?.description}
				<p class="text-xs opacity-65">
					{selectedStyle.description}
				</p>
			{/if}

			{#if requiresStateSelection}
				<label class="block">
					<span class="label mb-1">State or territory</span>
					<select class="select" bind:value={selectedStateCode}>
						<option value="">Select a state</option>
						{#each US_STATE_OPTIONS as option}
							<option value={option.code}>{option.name} ({option.code})</option>
						{/each}
					</select>
					{#if resolvingState}
						<p class="mt-1 text-xs opacity-60">Detecting a default from available location data…</p>
					{/if}
				</label>
			{/if}

			{#if requiresBikeVibeSelection}
				<label class="block">
					<span class="label mb-1">Bike type or vibe</span>
					<select class="select" bind:value={selectedBikeVibeId}>
						<option value="">Select a bike vibe</option>
						{#each BIKE_VIBE_OPTIONS as option}
							<option value={option.id}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			<label class="block">
				<span class="label mb-1">Optional steering prompt</span>
				<textarea
					class="textarea min-h-28"
					bind:value={userPrompt}
					placeholder="Add landmarks, rider details, mood, props, or scene ideas."
				></textarea>
			</label>

			{#if helperText}
				<p class="text-xs opacity-65">{helperText}</p>
			{/if}

			{#if error}
				<div class="card preset-tonal-warning p-3 text-sm">{error}</div>
			{/if}

			<button
				type="button"
				class="btn preset-filled-primary-500 gap-2"
				disabled={generating}
				onclick={generateImage}
			>
				{#if generating}
					<IconLoader class="h-4 w-4 animate-spin" />
					<span>Generating…</span>
				{:else}
					<IconSparkles class="h-4 w-4" />
					<span>Generate image</span>
				{/if}
			</button>
		</div>

		<div class="space-y-2">
			<div class="label">Preview</div>
			{#if previewUrl}
				<div class="border-surface-500/20 overflow-hidden rounded-2xl border">
					<img src={previewUrl} alt="Generated preview" class="aspect-[16/9] w-full object-cover" />
				</div>
			{:else}
				<div
					class="border-surface-500/25 flex aspect-[16/9] items-center justify-center rounded-2xl border border-dashed p-4 text-center text-sm opacity-60"
				>
					Generated artwork will appear here.
				</div>
			{/if}
		</div>
	</div>
</div>
