<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import { IMAGE_STYLE_PRESETS } from '$lib/ai/imageStyles';

	let {
		target = 'ride',
		heading = 'Generate image',
		description = '',
		helperText = '',
		aspectRatio = '16:9',
		articleId = null,
		currentImageUrl = '',
		buildContext = () => ({}),
		onApply = () => {}
	} = $props();

	let styleId = $state(IMAGE_STYLE_PRESETS[0]?.id ?? 'comic_house');
	let userPrompt = $state('');
	let generating = $state(false);
	let error = $state('');
	let lastGeneratedUrl = $state('');

	const previewUrl = $derived(currentImageUrl || lastGeneratedUrl || '');

	async function generateImage() {
		error = '';
		generating = true;

		try {
			const context = (await buildContext?.()) ?? {};
			const response = await fetch('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target,
					aspectRatio,
					styleId,
					prompt: userPrompt.trim() || null,
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

			{#if IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId)?.description}
				<p class="text-xs opacity-65">
					{IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId)?.description}
				</p>
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
