<script>
	import { onMount } from 'svelte';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconX from '@lucide/svelte/icons/x';

	/** @type {Record<string, any>} */
	let { images = [], startIndex = 0, onClose = () => {} } = $props();
	let dialog;
	let closeButton;
	let imageIndex = $state(0);

	onMount(() => {
		imageIndex = Math.max(0, Math.min(startIndex, images.length - 1));
		dialog?.showModal();
		closeButton?.focus();
	});

	function closeLightbox() {
		if (dialog?.open) dialog.close();
	}

	function previousImage() {
		if (images.length < 2) return;
		imageIndex = imageIndex <= 0 ? images.length - 1 : imageIndex - 1;
	}

	function nextImage() {
		if (images.length < 2) return;
		imageIndex = imageIndex >= images.length - 1 ? 0 : imageIndex + 1;
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			previousImage();
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			nextImage();
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="lightbox-dialog"
	aria-label={images[imageIndex]?.title || 'Photo viewer'}
	onclose={onClose}
	onkeydown={handleKeydown}
	onclick={(event) => {
		if (event.target === dialog) closeLightbox();
	}}
>
	<div class="lightbox-panel">
		<div class="lightbox-toolbar">
			<div class="lightbox-counter">
				{imageIndex + 1} <span>/</span>
				{images.length}
			</div>
			<button
				type="button"
				class="lightbox-close"
				onclick={closeLightbox}
				aria-label="Close lightbox"
				bind:this={closeButton}
			>
				<IconX class="h-5 w-5" />
			</button>
		</div>
		<div class="lightbox-stage">
			<img
				src={images[imageIndex]?.href}
				alt={images[imageIndex]?.title || ''}
				class="lightbox-image"
			/>
			{#if images.length > 1}
				<button
					type="button"
					class="lightbox-nav lightbox-prev"
					onclick={previousImage}
					aria-label="Previous image"><IconChevronLeft class="h-5 w-5" /></button
				>
				<button
					type="button"
					class="lightbox-nav lightbox-next"
					onclick={nextImage}
					aria-label="Next image"><IconChevronRight class="h-5 w-5" /></button
				>
			{/if}
		</div>
		{#if images.length > 1}
			<div class="lightbox-thumbnails" role="group" aria-label="Choose a photo">
				{#each images as image, index}
					<button
						type="button"
						class="thumbnail {index === imageIndex ? 'active' : ''}"
						onclick={() => (imageIndex = index)}
						aria-label="View image {index + 1}"
						aria-current={index === imageIndex ? 'true' : undefined}
					>
						<img src={image.href} alt="" />
					</button>
				{/each}
			</div>
		{/if}
	</div>
</dialog>

<style>
	.lightbox-dialog {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100vw;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: auto;
		padding: 0.35rem;
		overflow: hidden;
		border: 0;
		background: transparent;
		color: inherit;
	}

	.lightbox-dialog:not([open]) {
		display: none;
	}

	.lightbox-dialog::backdrop {
		background: color-mix(in oklab, var(--color-surface-950) 95%, transparent);
		backdrop-filter: blur(8px);
	}

	.lightbox-panel {
		position: relative;
		width: min(98vw, 1800px);
		height: min(98dvh, 1200px);
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border-radius: 1rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.85rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}

	.lightbox-counter {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-100);
	}

	.lightbox-counter span {
		color: var(--color-surface-500);
	}

	.lightbox-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: var(--color-surface-100);
		transition: background-color 0.15s ease;
	}

	.lightbox-close:hover {
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}

	.lightbox-stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: 0.6rem;
	}

	.lightbox-image {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 0.5rem;
	}

	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
		color: var(--color-surface-100);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		opacity: 0.7;
	}

	.lightbox-nav:hover {
		opacity: 1;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}

	.lightbox-prev {
		left: 1rem;
	}

	.lightbox-next {
		right: 1rem;
	}

	.lightbox-thumbnails {
		display: flex;
		gap: 0.45rem;
		padding: 0.5rem 0.75rem;
		overflow-x: auto;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
	}

	.lightbox-thumbnails::-webkit-scrollbar {
		height: 4px;
	}

	.lightbox-thumbnails::-webkit-scrollbar-track {
		background: transparent;
	}

	.lightbox-thumbnails::-webkit-scrollbar-thumb {
		background: color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		border-radius: 2px;
	}

	.thumbnail {
		flex-shrink: 0;
		width: 3rem;
		height: 3rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 0.15s ease;
		opacity: 0.6;
	}

	.thumbnail:hover,
	.thumbnail.active {
		opacity: 1;
		border-color: var(--color-primary-500);
	}

	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	@media (prefers-reduced-motion: no-preference) {
		.lightbox-panel {
			animation: lightbox-enter 160ms ease-out both;
		}
	}

	@keyframes lightbox-enter {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
