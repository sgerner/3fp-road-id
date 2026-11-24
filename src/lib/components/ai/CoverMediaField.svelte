<script>
	import IconImage from '@lucide/svelte/icons/image';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash2 from '@lucide/svelte/icons/trash';
	import IconUpload from '@lucide/svelte/icons/upload';
	import { LEARN_ALT_TEXT_MAX_LENGTH, sanitizeAltText } from '#lib/learn/altText';

	let {
		label = 'Cover photo',
		description = 'Upload a cover photo directly, or open the artwork studio to generate an illustration.',
		helperNote = 'PNG, JPG, WebP, or GIF · 16:9 recommended',
		accept = 'image/jpeg,image/png,image/webp,image/gif',
		multiple = false,
		aspectRatio = '16:9',
		imageUrl = '',
		imageAlt = $bindable(''),
		showAltField = false,
		uploading = false,
		error = '',
		disabled = false,
		studioDisabled = false,
		uploadButtonLabel = 'Upload photo',
		replaceButtonLabel = 'Replace photo',
		studioButtonLabel = 'Create cover art',
		removeButtonLabel = 'Remove cover',
		studioHeading = 'Create cover art',
		studioDescription = 'Generate textless cover artwork from your form details, compare candidates, and apply the one you want.',
		studioHelperText = '',
		target = 'group',
		storageBucket = '',
		articleId = null,
		defaultStyleId = 'comic_house',
		stacked = false,
		buildContext = () => ({}),
		onSelectFiles = null,
		onRemove = null,
		onAltChange = null,
		onApplyArtwork = () => {},
		onStudioOpenChange = null
	} = $props();

	const inputId = $props.id();
	const altInputId = `${inputId}-alt`;

	let fileInputEl = $state(null);
	let studioTriggerEl = $state(null);
	let StudioModalComponent = $state(null);
	let loadingStudio = $state(false);
	let studioOpen = $state(false);
	let studioLoadError = $state('');
	let dragActive = $state(false);
	let sessionCandidates = $state([]);

	const previewAspectClass = $derived.by(() => {
		if (aspectRatio === '1:1') return 'aspect-square';
		if (aspectRatio === '4:5') return 'aspect-[4/5]';
		if (aspectRatio === '4:3') return 'aspect-[4/3]';
		return 'aspect-[16/9]';
	});

	const displayError = $derived(error || studioLoadError);
	const effectivePreviewAlt = $derived(imageAlt?.trim() || `${label} preview`);

	function handleAltBlur() {
		const sanitized = sanitizeAltText(imageAlt || '', { imageUrl });
		if (sanitized !== (imageAlt || '')) {
			imageAlt = sanitized;
		}
		onAltChange?.(sanitized);
	}

	async function handleStudioApply(result) {
		const nextAlt = result?.alt_text || result?.altText || '';
		if (nextAlt) {
			imageAlt = nextAlt;
		}
		await onApplyArtwork?.(result);
	}

	async function handleFiles(fileList) {
		const files = Array.from(fileList ?? []).filter(Boolean);
		if (!files.length || disabled || uploading) return;
		await onSelectFiles?.(files);
	}

	function onInputChange(event) {
		const files = event.currentTarget?.files;
		void handleFiles(files);
		if (event.currentTarget) {
			event.currentTarget.value = '';
		}
	}

	function handleDragOver(event) {
		if (disabled || uploading) return;
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function handleDrop(event) {
		event.preventDefault();
		dragActive = false;
		if (disabled || uploading) return;
		const files = event.dataTransfer?.files;
		if (files?.length) {
			void handleFiles(multiple ? files : [files[0]]);
		}
	}

	async function openStudio() {
		if (loadingStudio || studioDisabled) return;
		studioLoadError = '';
		if (!StudioModalComponent) {
			loadingStudio = true;
			try {
				const mod = await import('#lib/components/ai/ArtworkStudioModal.svelte');
				StudioModalComponent = mod.default;
			} catch (loadErr) {
				studioLoadError = loadErr?.message || 'Unable to load artwork studio.';
				return;
			} finally {
				loadingStudio = false;
			}
		}
		studioOpen = true;
		onStudioOpenChange?.(true);
	}

	function handleStudioClose() {
		studioOpen = false;
		onStudioOpenChange?.(false);
	}

	export function closeStudio() {
		if (studioOpen) {
			studioOpen = false;
			onStudioOpenChange?.(false);
		}
	}
</script>

<div class="cover-media-field">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<span class="label m-0">{label}</span>
				<span class="text-xs opacity-60">({aspectRatio})</span>
			</div>
			{#if description}
				<p class="text-sm opacity-75">{description}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<input
				bind:this={fileInputEl}
				id={inputId}
				type="file"
				class="sr-only"
				{accept}
				{multiple}
				disabled={disabled || uploading}
				onchange={onInputChange}
			/>
			<button
				type="button"
				class="btn preset-filled-primary-500 gap-2"
				disabled={disabled || uploading}
				onclick={() => fileInputEl?.click()}
			>
				{#if uploading}
					<IconLoader class="h-4 w-4 animate-spin" />
					<span>Uploading…</span>
				{:else}
					<IconUpload class="h-4 w-4" />
					<span>{imageUrl ? replaceButtonLabel : uploadButtonLabel}</span>
				{/if}
			</button>

			<button
				bind:this={studioTriggerEl}
				type="button"
				class="btn preset-tonal-surface gap-2"
				disabled={studioDisabled || loadingStudio}
				onclick={openStudio}
			>
				{#if loadingStudio}
					<IconLoader class="h-4 w-4 animate-spin" />
					<span>Opening studio…</span>
				{:else}
					<IconSparkles class="h-4 w-4" />
					<span>{studioButtonLabel}</span>
				{/if}
			</button>
		</div>
	</div>

	{#if displayError}
		<div class="card preset-tonal-warning p-3 text-sm" role="alert">{displayError}</div>
	{/if}

	{#if imageUrl}
		<div
			class="cover-media-preview-frame"
			class:cover-media-preview-frame--drag={dragActive}
			role="region"
			aria-label={`${label} preview`}
			ondragover={handleDragOver}
			ondragenter={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			<img
				src={imageUrl}
				alt={effectivePreviewAlt}
				class={`${previewAspectClass} w-full object-cover`}
			/>
			{#if onRemove}
				<div class="cover-media-preview-actions">
					<button
						type="button"
						class="btn btn-sm bg-surface-950/85 text-surface-50 hover:bg-error-500/90 gap-1.5 border border-white/15"
						onclick={onRemove}
						disabled={uploading}
					>
						<IconTrash2 class="h-3.5 w-3.5" />
						<span>{removeButtonLabel}</span>
					</button>
				</div>
			{/if}
		</div>
		{#if showAltField}
			<div class="space-y-1">
				<div class="flex items-center justify-between gap-2">
					<label class="label m-0 text-xs" for={altInputId}>Cover image alt text</label>
					<span class="text-xs opacity-60">
						{(imageAlt || '').length}/{LEARN_ALT_TEXT_MAX_LENGTH}
					</span>
				</div>
				<input
					id={altInputId}
					type="text"
					class="input text-sm"
					maxlength={LEARN_ALT_TEXT_MAX_LENGTH}
					placeholder="Describe the key visual subject for screen-reader users"
					bind:value={imageAlt}
					disabled={disabled || uploading}
					onblur={handleAltBlur}
				/>
			</div>
		{/if}
	{:else}
		<div
			class={`cover-media-dropzone ${previewAspectClass}`}
			class:cover-media-dropzone--drag={dragActive}
			role="button"
			tabindex={disabled || uploading ? -1 : 0}
			aria-label={`${uploadButtonLabel} — drag and drop or press Enter`}
			onclick={() => !disabled && !uploading && fileInputEl?.click()}
			onkeydown={(event) => {
				if ((event.key === 'Enter' || event.key === ' ') && !disabled && !uploading) {
					event.preventDefault();
					fileInputEl?.click();
				}
			}}
			ondragover={handleDragOver}
			ondragenter={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			<IconImage class="h-7 w-7 opacity-45" />
			<p class="text-sm font-medium">Drop a cover image here or browse a local file</p>
			{#if helperNote}
				<p class="text-xs opacity-60">{helperNote}</p>
			{/if}
		</div>
	{/if}
</div>

{#if StudioModalComponent}
	{@const StudioModal = StudioModalComponent}
	<StudioModal
		bind:open={studioOpen}
		bind:candidates={sessionCandidates}
		{target}
		{storageBucket}
		heading={studioHeading}
		description={studioDescription}
		helperText={studioHelperText}
		{aspectRatio}
		{articleId}
		currentImageUrl={imageUrl}
		currentImageAlt={imageAlt}
		{defaultStyleId}
		returnFocusEl={studioTriggerEl}
		{stacked}
		{buildContext}
		onApply={handleStudioApply}
		onClose={handleStudioClose}
	/>
{/if}

<style>
	.cover-media-field {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 1rem;
		border-radius: 0.875rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 35%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 65%, var(--color-surface-950));
	}

	.cover-media-preview-frame {
		position: relative;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 45%, transparent);
		background: var(--color-surface-950);
	}

	.cover-media-preview-frame--drag {
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.cover-media-preview-actions {
		position: absolute;
		top: 0.625rem;
		right: 0.625rem;
		display: flex;
		gap: 0.5rem;
	}

	.cover-media-dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		max-height: 15rem;
		padding: 1.5rem;
		border-radius: 0.75rem;
		border: 2px dashed color-mix(in oklab, var(--color-surface-500) 35%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
		text-align: center;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background 160ms ease;
	}

	.cover-media-dropzone:hover,
	.cover-media-dropzone--drag {
		border-color: var(--color-primary-500);
		background: color-mix(in oklab, var(--color-surface-800) 55%, var(--color-surface-950));
	}
</style>
