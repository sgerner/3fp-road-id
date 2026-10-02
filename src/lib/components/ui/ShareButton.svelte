<script>
	import { onMount } from 'svelte';
	import Share2 from '@lucide/svelte/icons/share-2';
	import X from '@lucide/svelte/icons/x';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import { siFacebook, siX, siWhatsapp, siBluesky } from 'simple-icons';

	let { title, text = '', url, kind = 'page' } = $props();
	const id = $props.id();
	let dialog = $state();
	let nativeAvailable = $state(false);
	let status = $state('');
	let copied = $state(false);
	let busy = $state(false);
	// Share the public permalink, never login tokens, revision selectors, or tracking parameters.
	const permalink = $derived.by(() => {
		const link = new URL(url);
		link.search = '';
		link.hash = '';
		return link.href;
	});
	const message = $derived(`${title}\n${permalink}`);
	const destinations = $derived([
		{
			name: 'Facebook',
			icon: siFacebook,
			href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(permalink)}`
		},
		{
			name: 'X',
			icon: siX,
			href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(permalink)}`
		},
		{
			name: 'WhatsApp',
			icon: siWhatsapp,
			href: `https://wa.me/?text=${encodeURIComponent(message)}`
		},
		{
			name: 'Bluesky',
			icon: siBluesky,
			href: `https://bsky.app/intent/compose?text=${encodeURIComponent(message)}`
		},
		{
			name: 'LinkedIn',
			icon: null,
			href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(permalink)}`
		}
	]);
	onMount(() => {
		nativeAvailable = typeof navigator.share === 'function';
	});
	function open() {
		status = '';
		copied = false;
		dialog.showModal();
	}
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(permalink);
			copied = true;
			status = 'Link copied. Ready to paste anywhere.';
		} catch {
			copied = false;
			status = 'Select and copy the link below.';
			dialog.querySelector('input')?.select();
		}
	}
	async function shareWithDevice() {
		busy = true;
		status = '';
		try {
			await navigator.share({ title, text, url: permalink });
			dialog.close();
		} catch (error) {
			if (error?.name !== 'AbortError')
				status = 'Device sharing is unavailable. Choose an app or copy the link.';
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	class="btn preset-tonal-primary gap-2"
	onclick={open}
	aria-haspopup="dialog"
	aria-label={`Share this ${kind}`}
>
	<Share2 size={16} /> Share
</button>

<dialog
	bind:this={dialog}
	aria-labelledby={`${id}-title`}
	aria-describedby={`${id}-description`}
	class="share-dialog bg-surface-50-950 text-surface-950-50"
>
	<div class="share-body">
		<div class="flex items-start justify-between gap-4">
			<div>
				<div
					class="preset-tonal-primary mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"
				>
					<Share2 size={21} />
				</div>
				<h2 id={`${id}-title`} class="text-2xl font-bold tracking-tight">Share this {kind}</h2>
				<p id={`${id}-description`} class="mt-2 text-sm opacity-65">
					{kind === 'article'
						? 'Good ideas travel. Pass this one along.'
						: 'Better together. Invite your community.'}
				</p>
			</div>
			<button
				type="button"
				class="btn-icon preset-tonal-surface"
				aria-label="Close sharing"
				onclick={() => dialog.close()}><X size={18} /></button
			>
		</div>
		<div class="border-surface-500/20 bg-surface-500/5 my-6 rounded-2xl border p-4">
			<p class="text-xs font-semibold tracking-widest uppercase opacity-50">3 Feet Please</p>
			<p class="mt-2 line-clamp-3 leading-snug font-semibold">{title}</p>
		</div>
		<div class="grid grid-cols-3 gap-2">
			{#each destinations as destination}
				<a
					class="share-destination"
					href={destination.href}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`Share on ${destination.name} (opens in a new tab)`}
				>
					<span
						class="preset-tonal-surface flex h-10 w-10 items-center justify-center rounded-full"
					>
						{#if destination.icon}<svg
								width="19"
								height="19"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"><path d={destination.icon.path} /></svg
							>{:else}<span class="text-xl font-bold" aria-hidden="true">in</span>{/if}
					</span>
					<span class="text-xs font-medium">{destination.name}</span>
				</a>
			{/each}
			<button type="button" class="share-destination" onclick={copyLink}
				><span class="preset-tonal-primary flex h-10 w-10 items-center justify-center rounded-full"
					>{#if copied}<Check size={19} />{:else}<Copy size={19} />{/if}</span
				><span class="text-xs font-medium">{copied ? 'Copied!' : 'Copy link'}</span></button
			>
		</div>
		{#if nativeAvailable}<button
				type="button"
				class="btn preset-filled-primary-500 mt-5 w-full gap-2"
				onclick={shareWithDevice}
				disabled={busy}
				><Share2 size={16} />{busy ? 'Opening…' : 'More apps & device sharing'}</button
			>{/if}
		<label for={`${id}-link`} class="mt-6 block text-xs font-medium opacity-60">Direct link</label>
		<input
			id={`${id}-link`}
			class="input mt-2 w-full text-sm"
			readonly
			value={permalink}
			onclick={(event) => event.currentTarget.select()}
		/>
		<p role="status" class="mt-3 min-h-5 text-xs opacity-75">{status}</p>
	</div>
</dialog>

<style>
	.share-dialog {
		width: min(440px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		margin: auto;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent);
		border-radius: 24px;
		box-shadow: 0 24px 100px #0005;
	}
	.share-dialog::backdrop {
		background: #10182799;
		backdrop-filter: blur(6px);
	}
	.share-body {
		padding: 28px;
	}
	.share-destination {
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 9px;
		padding: 12px 4px;
		border-radius: 16px;
		transition:
			background 150ms,
			transform 150ms;
		cursor: pointer;
	}
	.share-destination:hover {
		background: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
		transform: translateY(-2px);
	}
	.share-destination:focus-visible {
		outline: 2px solid var(--color-primary-500);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.share-destination {
			transition: none;
		}
		.share-destination:hover {
			transform: none;
		}
	}
	@media (max-width: 400px) {
		.share-body {
			padding: 20px;
		}
	}
</style>
