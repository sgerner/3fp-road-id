<script>
	import { tick } from 'svelte';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconX from '@lucide/svelte/icons/x';
	import ArtworkStyleFields from '#lib/components/ai/ArtworkStyleFields.svelte';
	import { COVER_MOOD_OPTIONS, getImageTonePreset } from '#lib/ai/imageTones';
	import {
		BIKE_VIBE_OPTIONS,
		IMAGE_STYLE_PRESETS,
		US_STATE_OPTIONS,
		buildArtworkStyleOptions,
		resolveDefaultBikeVibeId,
		resolveDefaultStateCode,
		styleRequiresBikeVibeSelection,
		styleRequiresStateSelection,
		validateArtworkStyleSelection
	} from '#lib/ai/artworkStudio';

	let {
		open = $bindable(false),
		target = 'group',
		storageBucket = '',
		heading = 'Create cover art',
		description = 'Generate textless cover artwork from the details on this page, compare candidates, and apply the one you want.',
		helperText = '',
		aspectRatio = '16:9',
		articleId = null,
		currentImageUrl = '',
		defaultStyleId = 'comic_house',
		candidates = $bindable([]),
		returnFocusEl = null,
		stacked = false,
		buildContext = () => ({}),
		onApply = () => {},
		onClose = () => {}
	} = $props();

	const uid = $props.id();
	const titleId = `${uid}-studio-title`;
	const descId = `${uid}-studio-desc`;

	let dialogEl = $state(null);
	let quickGenerateBtnEl = $state(null);
	let viewMode = $state('quick'); // 'quick' | 'advanced'
	let styleId = $state('');
	let moodId = $state('');
	let userPrompt = $state('');
	let selectedStateCode = $state('');
	let selectedBikeVibeId = $state('');
	let generating = $state(false);
	let applying = $state(false);
	let error = $state('');
	let selectedCandidateId = $state('');

	const selectedStyle = $derived(
		IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? IMAGE_STYLE_PRESETS[0] ?? null
	);
	const selectedMood = $derived(getImageTonePreset(moodId));
	const requiresState = $derived(styleRequiresStateSelection(styleId));
	const requiresBikeVibe = $derived(styleRequiresBikeVibeSelection(styleId));

	const selectedCandidate = $derived.by(() => {
		if (!candidates.length) return null;
		return candidates.find((entry) => entry.id === selectedCandidateId) ?? candidates[0] ?? null;
	});

	const stageAspectClass = $derived.by(() => {
		if (aspectRatio === '1:1') return 'aspect-square';
		if (aspectRatio === '4:5') return 'aspect-[4/5]';
		if (aspectRatio === '9:16') return 'aspect-[9/16]';
		if (aspectRatio === '4:3') return 'aspect-[4/3]';
		if (aspectRatio === '3:4') return 'aspect-[3/4]';
		return 'aspect-[16/9]';
	});

	$effect(() => {
		if (!styleId) {
			styleId = defaultStyleId || IMAGE_STYLE_PRESETS[0]?.id || 'comic_house';
		}
	});

	$effect(() => {
		if (candidates.length && !candidates.some((entry) => entry.id === selectedCandidateId)) {
			selectedCandidateId = candidates[0].id;
		}
	});

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			error = '';
			dialogEl.showModal();
			void tick().then(() => {
				quickGenerateBtnEl?.focus?.();
			});
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	async function restoreTriggerFocus() {
		await tick();
		if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
			returnFocusEl.focus();
		}
	}

	function dismissModal() {
		error = '';
		if (dialogEl?.open) {
			dialogEl.close();
		}
		if (open) {
			open = false;
		}
		onClose?.();
		void restoreTriggerFocus();
	}

	function handleDialogClose() {
		if (open) {
			open = false;
		}
		onClose?.();
		void restoreTriggerFocus();
	}

	function handleDialogKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismissModal();
			return;
		}
		if (event.key !== 'Tab' || !dialogEl) return;

		const focusable = Array.from(
			dialogEl.querySelectorAll(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => el instanceof HTMLElement && el.offsetParent !== null);

		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && (active === first || !dialogEl.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function generateCandidate() {
		error = '';
		generating = true;

		try {
			const context = (await buildContext?.()) ?? {};
			if (requiresState && !selectedStateCode) {
				selectedStateCode = await resolveDefaultStateCode({
					currentStateCode: selectedStateCode,
					context
				});
			}
			if (requiresBikeVibe && !selectedBikeVibeId) {
				selectedBikeVibeId = resolveDefaultBikeVibeId({
					currentBikeVibeId: selectedBikeVibeId,
					context
				});
			}

			const validationError = validateArtworkStyleSelection({
				styleId,
				stateCode: selectedStateCode,
				bikeVibeId: selectedBikeVibeId
			});
			if (validationError) {
				error = validationError;
				viewMode = 'advanced';
				return;
			}

			const styleOptions = buildArtworkStyleOptions({
				styleId,
				stateCode: selectedStateCode,
				bikeVibeId: selectedBikeVibeId
			});

			const response = await fetch('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target,
					...(storageBucket ? { storageBucket } : {}),
					aspectRatio,
					styleId,
					toneId: moodId,
					prompt: userPrompt.trim() || null,
					styleOptions,
					context,
					articleId
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.error || 'Unable to generate artwork.');
			}
			if (!result?.url) {
				throw new Error('Image generation returned no image URL.');
			}

			const candidateEntry = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				url: result.url,
				styleId,
				styleLabel: selectedStyle?.label || 'Artwork',
				moodId: moodId || '',
				moodLabel: selectedMood?.label || 'Match style',
				prompt: userPrompt.trim(),
				createdAt: new Date().toISOString(),
				result
			};

			candidates = [
				candidateEntry,
				...candidates.filter((existing) => existing.url !== candidateEntry.url)
			];
			selectedCandidateId = candidateEntry.id;
		} catch (generationError) {
			error = generationError?.message || 'Unable to generate artwork.';
		} finally {
			generating = false;
		}
	}

	async function confirmSelectedCandidate() {
		if (!selectedCandidate?.result || applying || generating) return;
		error = '';
		applying = true;
		try {
			await onApply?.(selectedCandidate.result);
			dismissModal();
		} catch (applyError) {
			error = applyError?.message || 'Unable to apply selected artwork.';
		} finally {
			applying = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="artwork-studio-dialog"
	class:artwork-studio-dialog--stacked={stacked}
	aria-labelledby={titleId}
	aria-describedby={descId}
	onclose={handleDialogClose}
	oncancel={(event) => {
		event.preventDefault();
		dismissModal();
	}}
	onclick={(event) => {
		if (event.target === dialogEl && !generating && !applying) {
			dismissModal();
		}
	}}
	onkeydown={handleDialogKeydown}
>
	<div class="artwork-studio-panel">
		<header class="artwork-studio-header">
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="artwork-studio-badge">
						<IconSparkles class="h-3.5 w-3.5" />
						<span>Artwork studio</span>
					</span>
					<span class="chip preset-tonal-surface text-xs">{aspectRatio}</span>
				</div>
				<h2 id={titleId} class="text-lg font-bold tracking-tight sm:text-xl">{heading}</h2>
				<p id={descId} class="text-xs leading-relaxed opacity-75 sm:text-sm">{description}</p>
			</div>
			<button
				type="button"
				class="btn-icon preset-tonal-surface shrink-0"
				onclick={dismissModal}
				disabled={applying}
				aria-label="Close artwork studio"
			>
				<IconX class="h-4 w-4" />
			</button>
		</header>

		<div class="artwork-studio-body">
			<div class="artwork-studio-controls">
				<div class="artwork-mode-tabs" role="tablist" aria-label="Studio controls mode">
					<button
						type="button"
						role="tab"
						aria-selected={viewMode === 'quick'}
						class="artwork-mode-tab"
						class:artwork-mode-tab--active={viewMode === 'quick'}
						onclick={() => (viewMode = 'quick')}
					>
						Quick generate
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={viewMode === 'advanced'}
						class="artwork-mode-tab"
						class:artwork-mode-tab--active={viewMode === 'advanced'}
						onclick={() => (viewMode = 'advanced')}
					>
						<IconSlidersHorizontal class="h-3.5 w-3.5" />
						<span>Style, mood & prompt</span>
					</button>
				</div>

				{#if viewMode === 'quick'}
					<div class="border-surface-700/70 bg-surface-950/70 space-y-4 rounded-xl border p-4">
						<div class="space-y-1.5">
							<p class="text-sm font-semibold">One-click illustration</p>
							<p class="text-xs leading-relaxed opacity-75">
								Uses the details already entered on the form with
								<strong>{selectedStyle?.label || '3FP House Style'}</strong>
								{#if selectedMood}
									and <strong>{selectedMood.label}</strong> visual mood
								{/if}. Nothing updates your live or draft cover until you click
								<strong>Apply artwork</strong>.
							</p>
						</div>

						{#if requiresState && !selectedStateCode}
							<label class="block" for={`${uid}-quick-state`}>
								<span class="label mb-1">State or territory</span>
								<select
									id={`${uid}-quick-state`}
									class="select"
									bind:value={selectedStateCode}
									disabled={generating}
								>
									<option value="">Select a state</option>
									{#each US_STATE_OPTIONS as option (option.code)}
										<option value={option.code}>{option.name} ({option.code})</option>
									{/each}
								</select>
							</label>
						{/if}

						{#if requiresBikeVibe && !selectedBikeVibeId}
							<label class="block" for={`${uid}-quick-bike`}>
								<span class="label mb-1">Bike type or vibe</span>
								<select
									id={`${uid}-quick-bike`}
									class="select"
									bind:value={selectedBikeVibeId}
									disabled={generating}
								>
									<option value="">Select a bike vibe</option>
									{#each BIKE_VIBE_OPTIONS as option (option.id)}
										<option value={option.id}>{option.label}</option>
									{/each}
								</select>
							</label>
						{/if}

						<div class="flex flex-wrap items-center gap-2.5">
							<button
								bind:this={quickGenerateBtnEl}
								type="button"
								class="btn preset-filled-primary-500 gap-2"
								disabled={generating || applying}
								onclick={generateCandidate}
							>
								{#if generating}
									<IconLoader class="h-4 w-4 animate-spin" />
									<span>Generating…</span>
								{:else}
									<IconSparkles class="h-4 w-4" />
									<span>{candidates.length ? 'Generate another' : 'Generate candidate'}</span>
								{/if}
							</button>
							<button
								type="button"
								class="btn preset-tonal-surface gap-1.5 text-xs"
								onclick={() => (viewMode = 'advanced')}
							>
								<IconSlidersHorizontal class="h-3.5 w-3.5" />
								<span>Customize options</span>
							</button>
						</div>
					</div>
				{:else}
					<div class="space-y-4">
						<ArtworkStyleFields
							bind:styleId
							bind:stateCode={selectedStateCode}
							bind:bikeVibeId={selectedBikeVibeId}
							disabled={generating || applying}
							idPrefix={`${uid}-adv`}
							{buildContext}
						/>

						<div class="space-y-1.5">
							<label class="block" for={`${uid}-mood`}>
								<span class="label mb-1">Visual mood</span>
								<select
									id={`${uid}-mood`}
									class="select"
									bind:value={moodId}
									disabled={generating || applying}
								>
									<option value="">Match the style</option>
									{#each COVER_MOOD_OPTIONS as mood (mood.id)}
										<option value={mood.id}>{mood.label}</option>
									{/each}
								</select>
							</label>
							{#if selectedMood?.description}
								<p class="text-xs leading-relaxed opacity-70">{selectedMood.description}</p>
							{/if}
						</div>

						<label class="block" for={`${uid}-prompt`}>
							<span class="label mb-1">Optional steering prompt</span>
							<textarea
								id={`${uid}-prompt`}
								class="textarea min-h-24"
								bind:value={userPrompt}
								disabled={generating || applying}
								placeholder="Add landmarks, rider details, lighting, props, or scene ideas."
							></textarea>
						</label>

						{#if helperText}
							<p class="text-xs opacity-65">{helperText}</p>
						{/if}

						<button
							type="button"
							class="btn preset-filled-primary-500 gap-2"
							disabled={generating || applying}
							onclick={generateCandidate}
						>
							{#if generating}
								<IconLoader class="h-4 w-4 animate-spin" />
								<span>Generating…</span>
							{:else}
								<IconSparkles class="h-4 w-4" />
								<span>{candidates.length ? 'Generate another' : 'Generate candidate'}</span>
							{/if}
						</button>
					</div>
				{/if}

				{#if error}
					<div class="card preset-tonal-warning p-3 text-sm" role="alert">{error}</div>
				{/if}
			</div>

			<div class="artwork-studio-stage">
				<div class="flex items-center justify-between gap-2">
					<span class="label">
						{#if selectedCandidate}
							Selected candidate
						{:else if currentImageUrl}
							Current cover (unchanged)
						{:else}
							Preview
						{/if}
					</span>
					{#if selectedCandidate}
						<span class="text-xs opacity-70">
							{selectedCandidate.styleLabel}
							{#if selectedCandidate.moodId}
								· {selectedCandidate.moodLabel}
							{/if}
						</span>
					{/if}
				</div>

				{#if selectedCandidate}
					<div class="border-surface-600/40 bg-surface-950 overflow-hidden rounded-xl border">
						<img
							src={selectedCandidate.url}
							alt={`Generated ${selectedCandidate.styleLabel} candidate`}
							class={`${stageAspectClass} w-full object-cover`}
						/>
					</div>
				{:else if currentImageUrl}
					<div
						class="border-surface-600/40 bg-surface-950 relative overflow-hidden rounded-xl border"
					>
						<img
							src={currentImageUrl}
							alt="Current cover preview"
							class={`${stageAspectClass} w-full object-cover opacity-80`}
						/>
						<div class="bg-surface-950/80 absolute bottom-2 left-2 rounded px-2.5 py-1 text-xs">
							Current cover — generate a candidate to compare
						</div>
					</div>
				{:else}
					<div
						class={`border-surface-600/40 bg-surface-950/60 flex ${stageAspectClass} items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm opacity-65`}
					>
						Generated candidates will appear here so you can compare them before applying.
					</div>
				{/if}

				{#if candidates.length > 0}
					<div class="space-y-2">
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs font-semibold tracking-wider uppercase opacity-70">
								Session candidates ({candidates.length})
							</span>
							<span class="text-xs opacity-60">Click a thumbnail to compare</span>
						</div>
						<div class="artwork-candidate-grid">
							{#each candidates as candidate, index (candidate.id)}
								{@const isSelected = selectedCandidate?.id === candidate.id}
								<button
									type="button"
									class="artwork-candidate-thumb"
									class:artwork-candidate-thumb--selected={isSelected}
									aria-pressed={isSelected}
									aria-label={`Select candidate ${index + 1}: ${candidate.styleLabel}`}
									onclick={() => (selectedCandidateId = candidate.id)}
								>
									<img src={candidate.url} alt="" class="aspect-[16/9] w-full object-cover" />
									<span class="artwork-candidate-caption">
										<span class="truncate">{candidate.styleLabel}</span>
										{#if isSelected}
											<IconCheck class="text-primary-400 h-3.5 w-3.5 shrink-0" />
										{/if}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<footer class="artwork-studio-footer">
			<p class="text-xs opacity-65">
				{#if selectedCandidate}
					Ready to apply the selected candidate to your form.
				{:else}
					Canceling leaves your current cover image unchanged.
				{/if}
			</p>
			<div class="flex flex-wrap items-center justify-end gap-2.5">
				<button
					type="button"
					class="btn preset-tonal-surface"
					onclick={dismissModal}
					disabled={applying}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn preset-filled-primary-500 gap-2"
					disabled={!selectedCandidate || generating || applying}
					onclick={confirmSelectedCandidate}
				>
					{#if applying}
						<IconLoader class="h-4 w-4 animate-spin" />
						<span>Applying…</span>
					{:else}
						<IconCheck class="h-4 w-4" />
						<span>Apply artwork</span>
					{/if}
				</button>
			</div>
		</footer>
	</div>
</dialog>

<style>
	.artwork-studio-dialog {
		position: fixed;
		inset: auto 0 env(safe-area-inset-bottom);
		margin: 0 auto;
		width: 100%;
		max-width: 62rem;
		max-height: 94dvh;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--color-surface-50);
	}

	.artwork-studio-dialog::backdrop {
		background: rgb(0 0 0 / 82%);
	}

	@media (min-width: 640px) {
		.artwork-studio-dialog {
			inset: 0;
			margin: auto;
			width: calc(100% - 2rem);
			max-height: 90dvh;
		}
	}

	.artwork-studio-panel {
		display: flex;
		flex-direction: column;
		max-height: 94dvh;
		background: var(--color-surface-900);
		border: 1px solid var(--color-surface-700);
		border-radius: 1rem 1rem 0 0;
		overflow: hidden;
		box-shadow: 0 24px 60px rgb(0 0 0 / 60%);
	}

	@media (min-width: 640px) {
		.artwork-studio-panel {
			max-height: 90dvh;
			border-radius: 1rem;
		}
	}

	.artwork-studio-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-700) 65%, transparent);
		flex-shrink: 0;
	}

	.artwork-studio-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-primary-400);
	}

	.artwork-studio-body {
		display: grid;
		gap: 1.25rem;
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1 1 auto;
	}

	@media (min-width: 900px) {
		.artwork-studio-body {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
			align-items: start;
		}
	}

	.artwork-studio-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.artwork-studio-stage {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.artwork-mode-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: 0.75rem;
		background: var(--color-surface-950);
		border: 1px solid color-mix(in oklab, var(--color-surface-700) 70%, transparent);
	}

	.artwork-mode-tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.45rem 0.65rem;
		border-radius: 0.5rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-surface-300);
		background: transparent;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.artwork-mode-tab--active {
		background: color-mix(in oklab, var(--color-primary-500) 20%, var(--color-surface-800));
		color: var(--color-surface-50);
	}

	.artwork-candidate-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.25rem, 1fr));
		gap: 0.6rem;
	}

	.artwork-candidate-thumb {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-radius: 0.65rem;
		border: 2px solid color-mix(in oklab, var(--color-surface-600) 45%, transparent);
		background: var(--color-surface-950);
		text-align: left;
		transition:
			border-color 150ms ease,
			transform 150ms ease;
	}

	.artwork-candidate-thumb:hover {
		border-color: var(--color-surface-400);
	}

	.artwork-candidate-thumb--selected {
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary-500) 45%, transparent);
	}

	.artwork-candidate-caption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		padding: 0.3rem 0.45rem;
		font-size: 0.68rem;
		color: var(--color-surface-200);
	}

	.artwork-studio-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 65%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 75%, var(--color-surface-900));
		flex-shrink: 0;
	}
</style>
