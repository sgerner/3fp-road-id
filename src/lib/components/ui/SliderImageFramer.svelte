<script>
	import IconImageUp from '@lucide/svelte/icons/image-up';
	import IconMinus from '@lucide/svelte/icons/minus';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import {
		clampNumber,
		computeBoundedImageFrame,
		getImageOutputDimensions,
		IMAGE_FRAME_PRESETS
	} from '#lib/ui/formControlHelpers';

	/** @type {Record<string, any>} */
	let {
		src = '',
		target = 'logo',
		alt = 'Image framing preview',
		zoom = $bindable(1),
		panX = $bindable(0),
		panY = $bindable(0),
		ready = $bindable(false),
		minZoom = 1,
		maxZoom = 3,
		compact = false
	} = $props();

	const uid = $props.id();
	const PAN_STEP = 10;
	const ZOOM_STEP = 0.1;

	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let loadError = $state(false);
	let lastSrc = $state('');
	let announcement = $state('');
	/** @type {HTMLImageElement | null} */
	let previewImgEl = $state(null);

	const outputDims = $derived(getImageOutputDimensions(target));
	const frame = $derived(
		computeBoundedImageFrame({
			naturalWidth,
			naturalHeight,
			frameWidth: outputDims.width,
			frameHeight: outputDims.height,
			zoom,
			panX,
			panY,
			minZoom,
			maxZoom
		})
	);

	const controlsDisabled = $derived(!src || loadError);

	$effect(() => {
		if (src === lastSrc) return;
		lastSrc = src;
		naturalWidth = 0;
		naturalHeight = 0;
		loadError = false;
		ready = false;
		zoom = minZoom;
		panX = 0;
		panY = 0;
		announcement = '';
	});

	function handleImageLoad(event) {
		const img = event.currentTarget;
		naturalWidth = img?.naturalWidth || 0;
		naturalHeight = img?.naturalHeight || 0;
		loadError = false;
		ready = naturalWidth > 0 && naturalHeight > 0;
	}

	function handleImageError() {
		naturalWidth = 0;
		naturalHeight = 0;
		loadError = true;
		ready = false;
	}

	function formatSignedPercent(value) {
		const rounded = Math.round(Number(value) || 0);
		return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
	}

	function stepHorizontal(delta) {
		if (controlsDisabled) return;
		const next = clampNumber(Math.round(Number(panX) || 0) + delta, -100, 100);
		panX = next;
		announcement = `Horizontal framing ${formatSignedPercent(next)}.`;
	}

	function stepVertical(delta) {
		if (controlsDisabled) return;
		const next = clampNumber(Math.round(Number(panY) || 0) + delta, -100, 100);
		panY = next;
		announcement = `Vertical framing ${formatSignedPercent(next)}.`;
	}

	function stepZoom(delta) {
		if (controlsDisabled) return;
		const nextRaw = Math.round((Number(zoom) + delta) * 100) / 100;
		const next = clampNumber(nextRaw, minZoom, maxZoom);
		zoom = next;
		announcement = `Zoom ${Math.round(next * 100)}%.`;
	}

	function applyPreset(preset) {
		if (controlsDisabled) return;
		panX = preset.panX;
		panY = preset.panY;
		announcement = `Alignment preset set to ${preset.label}.`;
	}

	function resetFraming() {
		if (controlsDisabled) return;
		zoom = minZoom;
		panX = 0;
		panY = 0;
		announcement = `Framing reset to centered ${Math.round(minZoom * 100)}% zoom.`;
	}

	function isPresetSelected(preset) {
		return (
			Math.round(Number(panX) || 0) === preset.panX && Math.round(Number(panY) || 0) === preset.panY
		);
	}

	/**
	 * @param {string} imageUrl
	 * @returns {Promise<HTMLImageElement>}
	 */
	function loadExportableImage(imageUrl) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			if (/^https?:\/\//i.test(imageUrl)) {
				img.crossOrigin = 'anonymous';
			}
			img.onload = () => resolve(img);
			img.onerror = (err) => reject(err);
			img.src = imageUrl;
		});
	}

	export async function exportCroppedImage({ quality = 0.9 } = {}) {
		if (!src || loadError) return null;
		let img = null;
		try {
			img = await loadExportableImage(src);
		} catch {
			if (previewImgEl?.complete && previewImgEl.naturalWidth > 0) {
				img = previewImgEl;
			} else {
				return null;
			}
		}

		const imgW = img.naturalWidth || img.width;
		const imgH = img.naturalHeight || img.height;
		if (!imgW || !imgH) return null;

		const { width: outW, height: outH } = getImageOutputDimensions(target);
		const exportFrame = computeBoundedImageFrame({
			naturalWidth: imgW,
			naturalHeight: imgH,
			frameWidth: outW,
			frameHeight: outH,
			zoom,
			panX,
			panY,
			minZoom,
			maxZoom
		});

		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, outW, outH);
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(
			img,
			exportFrame.drawX,
			exportFrame.drawY,
			exportFrame.drawWidth,
			exportFrame.drawHeight
		);

		try {
			const dataUrl = canvas.toDataURL('image/jpeg', quality);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
			return {
				blob,
				dataUrl,
				width: outW,
				height: outH
			};
		} catch {
			return null;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Preview stage -->
	<div class="bg-surface-900 border-surface-800 border-2 p-3">
		<div
			class="bg-surface-950 border-surface-500 relative mx-auto w-full overflow-hidden border-2 {target ===
			'logo'
				? compact
					? 'max-w-48'
					: 'max-w-80'
				: compact
					? 'max-w-full'
					: 'max-w-2xl'}"
			style={`aspect-ratio: ${outputDims.aspectCss};`}
			role="region"
			aria-label={`${target === 'logo' ? 'Logo' : 'Cover'} crop preview (${outputDims.label})`}
		>
			{#if src && !loadError}
				<img
					bind:this={previewImgEl}
					{src}
					{alt}
					draggable="false"
					onload={handleImageLoad}
					onerror={handleImageError}
					class="pointer-events-none absolute max-h-none max-w-none select-none {ready
						? ''
						: 'opacity-0'}"
					style={`left: ${frame.leftPercent}%; top: ${frame.topPercent}%; width: ${frame.widthPercent}%; height: ${frame.heightPercent}%;`}
				/>
				{#if !ready}
					<div
						class="text-surface-300 absolute inset-0 flex items-center justify-center text-xs font-bold tracking-wider uppercase"
					>
						Loading preview…
					</div>
				{/if}
				<div class="pointer-events-none absolute inset-0" aria-hidden="true">
					<div class="bg-surface-50/35 absolute top-0 bottom-0 left-[33.333%] w-px"></div>
					<div class="bg-surface-50/35 absolute top-0 bottom-0 left-[66.666%] w-px"></div>
					<div class="bg-surface-50/35 absolute top-[33.333%] right-0 left-0 h-px"></div>
					<div class="bg-surface-50/35 absolute top-[66.666%] right-0 left-0 h-px"></div>
				</div>
			{:else if loadError}
				<div
					class="text-surface-300 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
				>
					<IconImageUp class="h-8 w-8" aria-hidden="true" />
					<span class="text-xs font-bold uppercase">Unable to load image preview</span>
				</div>
			{:else}
				<div
					class="text-surface-300 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
				>
					<IconImageUp class="h-8 w-8" aria-hidden="true" />
					<span class="text-xs font-bold uppercase">Add an image to start</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Alignment presets + Reset -->
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<span
				id={`${uid}-presets-label`}
				class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
			>
				Alignment presets
			</span>
			<button
				type="button"
				class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 min-w-9 items-center justify-center gap-1.5 border-2 px-3 text-xs font-black tracking-wide uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				disabled={controlsDisabled}
				onclick={resetFraming}
			>
				<IconRotateCcw class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span>Reset</span>
			</button>
		</div>
		<div class="grid grid-cols-3 gap-1.5" role="group" aria-labelledby={`${uid}-presets-label`}>
			{#each IMAGE_FRAME_PRESETS as preset (preset.id)}
				{@const active = !controlsDisabled && isPresetSelected(preset)}
				<button
					type="button"
					aria-pressed={active}
					disabled={controlsDisabled}
					onclick={() => applyPreset(preset)}
					class="focus-visible:outline-primary-500 inline-flex h-9 min-h-9 min-w-9 items-center justify-center border-2 px-2 text-xs font-black tracking-wide uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40 {active
						? 'border-primary-500 bg-primary-500 text-surface-950'
						: 'border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950'}"
				>
					{preset.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Bounded Horizontal, Vertical, and Zoom sliders paired with - / + step buttons -->
	<div class="grid gap-3">
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<label
					for={`${uid}-pan-x`}
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
				>
					Horizontal
				</label>
				<span class="text-surface-300 text-xs font-bold tabular-nums">
					{formatSignedPercent(panX)}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					aria-label="Decrease horizontal framing (shift left)"
					disabled={controlsDisabled || panX <= -100}
					onclick={() => stepHorizontal(-PAN_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconMinus class="h-4 w-4" aria-hidden="true" />
				</button>
				<input
					id={`${uid}-pan-x`}
					type="range"
					min="-100"
					max="100"
					step="1"
					disabled={controlsDisabled}
					bind:value={panX}
					class="accent-primary-500 focus-visible:outline-primary-500 h-9 min-h-9 w-full flex-1 cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
				/>
				<button
					type="button"
					aria-label="Increase horizontal framing (shift right)"
					disabled={controlsDisabled || panX >= 100}
					onclick={() => stepHorizontal(PAN_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconPlus class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<label
					for={`${uid}-pan-y`}
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
				>
					Vertical
				</label>
				<span class="text-surface-300 text-xs font-bold tabular-nums">
					{formatSignedPercent(panY)}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					aria-label="Decrease vertical framing (shift up)"
					disabled={controlsDisabled || panY <= -100}
					onclick={() => stepVertical(-PAN_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconMinus class="h-4 w-4" aria-hidden="true" />
				</button>
				<input
					id={`${uid}-pan-y`}
					type="range"
					min="-100"
					max="100"
					step="1"
					disabled={controlsDisabled}
					bind:value={panY}
					class="accent-primary-500 focus-visible:outline-primary-500 h-9 min-h-9 w-full flex-1 cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
				/>
				<button
					type="button"
					aria-label="Increase vertical framing (shift down)"
					disabled={controlsDisabled || panY >= 100}
					onclick={() => stepVertical(PAN_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconPlus class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<label
					for={`${uid}-zoom`}
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
				>
					Zoom
				</label>
				<span class="text-surface-300 text-xs font-bold tabular-nums">
					{Math.round(Number(zoom) * 100)}%
				</span>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					aria-label="Zoom out"
					disabled={controlsDisabled || zoom <= minZoom}
					onclick={() => stepZoom(-ZOOM_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconMinus class="h-4 w-4" aria-hidden="true" />
				</button>
				<input
					id={`${uid}-zoom`}
					type="range"
					min={minZoom}
					max={maxZoom}
					step="0.01"
					disabled={controlsDisabled}
					bind:value={zoom}
					class="accent-primary-500 focus-visible:outline-primary-500 h-9 min-h-9 w-full flex-1 cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
				/>
				<button
					type="button"
					aria-label="Zoom in"
					disabled={controlsDisabled || zoom >= maxZoom}
					onclick={() => stepZoom(ZOOM_STEP)}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
				>
					<IconPlus class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	</div>

	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
</div>
