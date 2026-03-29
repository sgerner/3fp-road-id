<script>
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconLink from '@lucide/svelte/icons/link';
	import IconSearch from '@lucide/svelte/icons/search';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { fade } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const pageStyleClass = $derived(
		`hero-mode-${site.siteConfig?.hero_style || 'immersive'} panel-${site.siteConfig?.panel_style || 'glass'} tone-${site.siteConfig?.panel_tone || 'surface'}`
	);

	let searchQuery = $state('');

	const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp)$/i;

	function getAssetName(asset) {
		return (asset?.file_name || asset?.title || asset?.href || '').toLowerCase();
	}

	function isImageAsset(asset) {
		const mime = String(asset?.mime_type || '').toLowerCase();
		if (mime.startsWith('image/')) return true;
		return IMAGE_EXTENSIONS.test(getAssetName(asset));
	}

	function normalizeAssets(buckets) {
		const links = [];
		const files = [];

		for (const bucket of buckets || []) {
			for (const asset of bucket?.link_assets || []) {
				links.push({ ...asset, bucketName: bucket?.name || 'Links' });
			}

			for (const asset of bucket?.file_assets || []) {
				if (!isImageAsset(asset)) {
					files.push({ ...asset, bucketName: bucket?.name || 'Files' });
				}
			}
		}

		const sortByTitle = (a, b) => String(a?.title || '').localeCompare(String(b?.title || ''));
		links.sort(sortByTitle);
		files.sort(sortByTitle);

		return { links, files };
	}

	function filterAssets(assets, query) {
		if (!query.trim()) return assets;
		const q = query.toLowerCase().trim();
		return assets.filter((asset) => {
			const text = [asset.title, asset.description, asset.file_name, asset.bucketName, asset.href]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return text.includes(q);
		});
	}

	const normalized = $derived(normalizeAssets(site.assetBuckets));
	const filteredLinks = $derived(filterAssets(normalized.links, searchQuery));
	const filteredFiles = $derived(filterAssets(normalized.files, searchQuery));
	const totalCount = $derived(normalized.links.length + normalized.files.length);
</script>

<div class="microsite-page mx-auto max-w-7xl {pageStyleClass} pb-14">
	<section class="mx-auto w-full max-w-5xl px-4 pt-6 md:px-6" in:fade={{ duration: 220 }}>
		<div class="resource-hero rounded-2xl p-5 sm:p-6">
			<div class="flex items-start gap-4">
				{#if group?.logo_url}
					<img
						src={group.logo_url}
						alt="{group.name} logo"
						class="ring-surface-50/10 h-14 w-14 flex-shrink-0 rounded-xl object-cover shadow-lg ring-2"
					/>
				{:else}
					<div
						class="hero-logo-placeholder flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl"
					>
						<IconFolderOpen class="text-surface-50/80 h-7 w-7" />
					</div>
				{/if}

				<div class="min-w-0">
					<div class="mb-1.5 flex flex-wrap items-center gap-2">
						<span
							class="chip preset-filled-secondary-500 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
							>Resources</span
						>
						<span class="hero-meta">{totalCount} items</span>
					</div>
					<h1 class="hero-title">Useful links and files</h1>
					<p class="hero-copy">
						Find official links and downloadable files shared by {site.siteConfig.site_title ||
							group.name}.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">
		<div class="glass-card border-surface-500/20 rounded-2xl border p-4">
			<div class="relative">
				<IconSearch class="search-icon absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
				<input
					type="search"
					placeholder="Search links and files..."
					bind:value={searchQuery}
					class="search-input w-full rounded-xl border py-3 pr-4 pl-10 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>
		</div>
	</section>

	<section class="mx-auto w-full max-w-5xl space-y-5 px-4 pb-8 md:px-6">
		{#if filteredLinks.length}
			<div class="glass-card border-surface-500/20 rounded-2xl border p-4 sm:p-5">
				<div class="section-head">
					<div class="section-title-wrap">
						<div class="icon-badge link-badge"><IconLink class="h-4.5 w-4.5" /></div>
						<h2 class="section-title">Links</h2>
					</div>
					<span class="section-count">{filteredLinks.length}</span>
				</div>
				<div class="mt-3 space-y-2.5">
					{#each filteredLinks as asset}
						<a
							href={asset.href}
							target="_blank"
							rel="noopener noreferrer"
							class="resource-row link-row"
						>
							<div class="min-w-0 flex-1">
								<h3 class="resource-title">{asset.title}</h3>
								{#if asset.description}
									<AutoLinkText
										text={asset.description}
										className="resource-subtext block line-clamp-2 text-sm"
										linkClass="text-primary-700-300 underline underline-offset-2"
									/>
								{/if}
							</div>
							<IconExternalLink class="resource-action h-4 w-4" />
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if filteredFiles.length}
			<div class="glass-card border-surface-500/20 rounded-2xl border p-4 sm:p-5">
				<div class="section-head">
					<div class="section-title-wrap">
						<div class="icon-badge file-badge"><IconFileText class="h-4.5 w-4.5" /></div>
						<h2 class="section-title">Files</h2>
					</div>
					<span class="section-count">{filteredFiles.length}</span>
				</div>
				<div class="mt-3 space-y-2.5">
					{#each filteredFiles as asset}
						<a
							href={asset.href}
							target="_blank"
							rel="noopener noreferrer"
							class="resource-row file-row"
						>
							<div class="min-w-0 flex-1">
								<h3 class="resource-title">{asset.title}</h3>
								<p class="resource-subtext mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
									{#if asset.file_name}
										<span>{asset.file_name}</span>
									{/if}
									{#if asset.sizeLabel}
										<span>{asset.sizeLabel}</span>
									{/if}
									{#if asset.createdLabel}
										<span>{asset.createdLabel}</span>
									{/if}
									{#if asset.bucketName}
										<span>{asset.bucketName}</span>
									{/if}
								</p>
							</div>
							<IconExternalLink class="resource-action h-4 w-4" />
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if !filteredLinks.length && !filteredFiles.length}
			<div class="glass-card border-surface-500/20 rounded-2xl border p-12 text-center">
				<div
					class="bg-surface-500/12 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
				>
					<IconFolderOpen class="text-surface-700-200 h-7 w-7" />
				</div>
				<h2 class="text-surface-950-50 mt-4 text-xl font-bold">
					{searchQuery ? 'No matching resources' : 'No resources yet'}
				</h2>
				<p class="text-surface-700-300 mt-2 text-sm">
					{searchQuery
						? 'Try a different search term.'
						: 'Links and files will appear here once they are added.'}
				</p>
			</div>
		{/if}
	</section>
</div>

<style>
	.resource-hero {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-50) 92%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	:global([data-color-mode='dark']) .resource-hero {
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-950) 86%);
		border-color: color-mix(in oklab, var(--color-primary-400) 26%, transparent);
	}

	.hero-logo-placeholder {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
	}

	.hero-title {
		color: color-mix(in oklab, var(--color-surface-950) 92%, transparent);
		font-size: clamp(1.35rem, 2.2vw, 1.8rem);
		font-weight: 800;
		line-height: 1.2;
	}

	.hero-copy {
		margin-top: 0.35rem;
		color: color-mix(in oklab, var(--color-surface-950) 68%, transparent);
		font-size: 0.95rem;
	}

	.hero-meta {
		color: color-mix(in oklab, var(--color-surface-950) 64%, transparent);
		font-size: 0.77rem;
		font-weight: 600;
	}

	:global([data-color-mode='dark']) .hero-title {
		color: color-mix(in oklab, var(--color-surface-50) 95%, transparent);
	}

	:global([data-color-mode='dark']) .hero-copy,
	:global([data-color-mode='dark']) .hero-meta {
		color: color-mix(in oklab, var(--color-surface-50) 72%, transparent);
	}

	.glass-card {
		background: color-mix(in oklab, var(--color-surface-50) 80%, transparent);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
	}

	:global([data-color-mode='dark']) .glass-card {
		background: color-mix(in oklab, var(--color-surface-950) 84%, transparent);
	}

	.search-input {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 24%, transparent);
		background: color-mix(in oklab, var(--color-surface-50) 86%, transparent);
		color: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}

	.search-input::placeholder {
		color: color-mix(in oklab, var(--color-surface-950) 45%, transparent);
	}

	.search-input:focus {
		border-color: var(--color-primary-500);
	}

	.search-icon {
		color: color-mix(in oklab, var(--color-surface-950) 45%, transparent);
	}

	:global([data-color-mode='dark']) .search-input {
		background: color-mix(in oklab, var(--color-surface-900) 88%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-200) 22%, transparent);
		color: color-mix(in oklab, var(--color-surface-50) 92%, transparent);
	}

	:global([data-color-mode='dark']) .search-input::placeholder,
	:global([data-color-mode='dark']) .search-icon {
		color: color-mix(in oklab, var(--color-surface-50) 50%, transparent);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.section-title-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}

	.section-count {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		color: color-mix(in oklab, var(--color-surface-950) 72%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 14%, transparent);
	}

	:global([data-color-mode='dark']) .section-title {
		color: color-mix(in oklab, var(--color-surface-50) 92%, transparent);
	}

	:global([data-color-mode='dark']) .section-count {
		color: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		background: color-mix(in oklab, var(--color-surface-50) 12%, transparent);
	}

	.icon-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.55rem;
	}

	.link-badge {
		background: color-mix(in oklab, var(--color-secondary-500) 26%, transparent);
		color: var(--color-secondary-800);
	}

	.file-badge {
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		color: var(--color-primary-800);
	}

	:global([data-color-mode='dark']) .link-badge {
		color: var(--color-secondary-200);
	}

	:global([data-color-mode='dark']) .file-badge {
		color: var(--color-primary-200);
	}

	.resource-row {
		display: flex;
		align-items: flex-start;
		gap: 0.8rem;
		padding: 0.85rem 0.95rem;
		border-radius: 0.85rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		transition:
			border-color 160ms ease,
			transform 160ms ease,
			background-color 160ms ease;
	}

	.resource-row:hover {
		transform: translateY(-1px);
	}

	.link-row {
		background: color-mix(in oklab, var(--color-secondary-500) 7%, var(--color-surface-50));
	}

	.file-row {
		background: color-mix(in oklab, var(--color-primary-500) 5%, var(--color-surface-50));
	}

	:global([data-color-mode='dark']) .link-row {
		background: color-mix(in oklab, var(--color-secondary-500) 10%, var(--color-surface-900));
	}

	:global([data-color-mode='dark']) .file-row {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-900));
	}

	.resource-row:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	.resource-title {
		color: color-mix(in oklab, var(--color-surface-950) 92%, transparent);
		font-size: 0.975rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.resource-subtext {
		color: color-mix(in oklab, var(--color-surface-950) 62%, transparent);
	}

	.resource-action {
		margin-top: 0.12rem;
		flex-shrink: 0;
		color: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
	}

	:global([data-color-mode='dark']) .resource-title {
		color: color-mix(in oklab, var(--color-surface-50) 92%, transparent);
	}

	:global([data-color-mode='dark']) .resource-subtext,
	:global([data-color-mode='dark']) .resource-action {
		color: color-mix(in oklab, var(--color-surface-50) 68%, transparent);
	}
</style>
