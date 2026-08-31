<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const openSlug = $derived(data.initialOpenSlug || '');
	let pendingSlug = $state('');

	const config = $derived(data.site.siteConfig);
	const isTbagSite = $derived(config?.site_variant === 'tbag');
	const posts = $derived(data.posts || []);
	const openPost = $derived(data.openPost || null);
	const totalPages = $derived(
		Math.max(1, Math.ceil((data.totalCount || 0) / (data.pageSize || 24)))
	);
	const visiblePosts = $derived.by(() => {
		const items = [...posts];
		if (openPost && !items.some((post) => post.slug === openPost.slug)) items.unshift(openPost);
		return items;
	});

	function formatDate(value) {
		if (!value) return 'Recently';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function estimateReadTime(body) {
		if (!body) return 1;
		return Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
	}

	function archiveHref(pageNumber) {
		const params = new URLSearchParams();
		if (data.search) params.set('q', data.search);
		if (pageNumber > 1) params.set('page', String(pageNumber));
		const query = params.toString();
		return query ? `?${query}` : '?';
	}

	async function togglePost(post) {
		const nextSlug = openSlug === post.slug ? '' : post.slug;
		pendingSlug = post.slug;
		const params = new URLSearchParams();
		if (data.search) params.set('q', data.search);
		if (data.page > 1) params.set('page', String(data.page));
		if (nextSlug) params.set('open', nextSlug);
		const query = params.toString();
		try {
			await goto(query ? `?${query}` : '?', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		} finally {
			pendingSlug = '';
		}
	}
</script>

<svelte:head>
	<title>{config.site_title} — Updates</title>
</svelte:head>

<div class="microsite-updates-page pb-16">
	<!-- Hero -->
	<section class="relative mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		<div
			class="glass-card border-primary-500/20 from-primary-500/5 to-secondary-500/5 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 md:p-8"
		>
			<div
				class="from-primary-500/10 via-secondary-500/5 to-tertiary-500/10 pointer-events-none absolute inset-0 bg-gradient-to-br"
			></div>
			<div class="relative">
				<div class="flex items-center gap-3">
					<div
						class="from-secondary-500 to-tertiary-500 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconNewspaper class="h-5 w-5 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							Updates archive
						</p>
						<h1 class="text-surface-950-50 text-xl font-bold tracking-tight md:text-2xl">
							News from {config.site_title}
						</h1>
					</div>
				</div>
				<p class="text-surface-600-400 mt-3 max-w-2xl text-sm">
					Announcements, route changes, volunteer asks, recaps, and public notes.
					<span class="text-surface-700-300 mt-2 block font-semibold">
						{data.totalCount || 0} archived updates{data.search ? ` matching “${data.search}”` : ''}
					</span>
				</p>
				<form class="mt-5 flex flex-col gap-2 sm:flex-row" method="GET">
					<label class="min-w-0 flex-1">
						<span class="sr-only">Search the updates archive</span>
						<input
							class="input input-sm w-full"
							name="q"
							value={data.search || ''}
							placeholder="Search the archive"
							autocomplete="off"
						/>
					</label>
					<button type="submit" class="btn btn-sm preset-filled-primary-500">Search</button>
					{#if data.search}
						<a href="?" class="btn btn-sm preset-tonal-surface">Clear</a>
					{/if}
				</form>
			</div>
		</div>
	</section>

	<!-- Updates List -->
	<section class="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		{#if visiblePosts.length}
			<div class="space-y-4">
				{#each visiblePosts as post}
					{@const isOpen = openSlug === post.slug}
					{@const detail = isOpen && openPost?.slug === post.slug ? openPost : null}
					<article
						class="glass-card border-surface-500/15 card-interactive rounded-xl border p-5"
						data-scroll-reveal="stagger"
					>
						<button
							type="button"
							class="flex w-full flex-col gap-4 text-left md:flex-row md:items-start md:justify-between"
							onclick={() => togglePost(post)}
							disabled={pendingSlug === post.slug}
							aria-expanded={isOpen}
							aria-controls={detail ? `post-${post.id}` : undefined}
						>
							<div class="min-w-0 flex-1">
								<div
									class="text-surface-600-400 flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-[0.15em] uppercase"
								>
									<span>{formatDate(post.published_at || post.created_at)}</span>
									{#if post.source_url}
										<span class="archive-source-badge">Imported archive</span>
									{/if}
									{#if detail}
										<span
											class="bg-surface-500/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
										>
											<IconClock3 class="h-3 w-3" />
											{estimateReadTime(detail.body_markdown)} min read
										</span>
									{/if}
								</div>
								<h2 class="text-surface-950-50 mt-2 text-lg font-bold tracking-tight">
									{post.title}
								</h2>
								<AutoLinkText
									text={post.preview_text}
									className="block text-surface-700-300 mt-2 text-sm leading-relaxed"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							</div>
							<div class="btn btn-sm preset-tonal-primary pointer-events-none flex-shrink-0 gap-1">
								{#if pendingSlug === post.slug}
									Opening…
								{:else if isOpen}
									Close
									<IconChevronUp class="h-4 w-4" />
								{:else}
									Read
									<IconArrowRight class="h-4 w-4" />
								{/if}
							</div>
						</button>
						{#if detail}
							<div id={`post-${post.id}`} class="border-surface-500/10 mt-5 border-t pt-5">
								{#if detail.cover_image_url}
									<img
										src={detail.cover_image_url}
										alt={detail.title}
										loading="lazy"
										class="mb-5 max-h-80 w-full rounded-xl object-cover"
									/>
								{/if}
								<div
									class="archive-source-row mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
								>
									<span>{detail.source_name || 'Published by ' + config.site_title}</span>
									{#if detail.source_published_at}
										<span>Originally published {formatDate(detail.source_published_at)}</span>
									{/if}
									{#if detail.source_url && !isTbagSite}
										<a
											href={detail.source_url}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold underline underline-offset-2">View original</a
										>
									{/if}
								</div>
								<div class="prose prose-surface max-w-none">
									{@html detail.bodyHtml}
								</div>
							</div>
						{/if}
					</article>
				{/each}
			</div>
			{#if totalPages > 1}
				<nav
					class="border-surface-500/15 mt-8 flex items-center justify-between gap-4 border-t pt-5"
					aria-label="Updates archive pages"
				>
					{#if data.page > 1}
						<a href={archiveHref(data.page - 1)} class="btn btn-sm preset-tonal-surface">Previous</a
						>
					{:else}
						<span></span>
					{/if}
					<p class="text-surface-600-400 text-center text-xs font-semibold">
						Page {data.page} of {totalPages}
					</p>
					{#if data.page < totalPages}
						<a href={archiveHref(data.page + 1)} class="btn btn-sm preset-tonal-surface"
							>Older updates</a
						>
					{:else}
						<span></span>
					{/if}
				</nav>
			{/if}
		{:else}
			<div class="glass-card border-surface-500/15 rounded-xl border p-8 text-center">
				<div
					class="bg-surface-500/10 mx-auto flex h-14 w-14 items-center justify-center rounded-full"
				>
					<IconNewspaper class="text-surface-600-400 h-6 w-6" />
				</div>
				<h2 class="text-surface-950-50 mt-4 text-lg font-bold tracking-tight">No updates yet</h2>
				<p class="text-surface-600-400 mt-2 text-sm">
					This archive fills in automatically when we publish updates.
				</p>
			</div>
		{/if}
	</section>
</div>

<style>
	/* Glass card uses the global class from +page.svelte */
	:global(.glass-card) {
		background: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) :global(.glass-card) {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}

	/* Interactive card effect */
	.card-interactive {
		background: color-mix(in oklab, var(--color-surface-50) 50%, transparent);
		backdrop-filter: blur(10px);
	}

	:global([data-color-mode='dark']) .card-interactive {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-950-50) {
		color: rgb(248 250 252 / 0.98) !important;
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-700-300),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-600-400),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-800-200) {
		color: rgb(226 232 240 / 0.76) !important;
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-secondary-700-300) {
		color: color-mix(in oklab, var(--color-secondary-300) 76%, white 24%) !important;
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.btn.preset-tonal-primary) {
		color: rgb(248 250 252 / 0.98);
		background: color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface {
		color: rgb(226 232 240 / 0.94) !important;
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(p),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(li) {
		color: rgb(226 232 240 / 0.94);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h1),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h2),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h3),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h4),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h5),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(h6) {
		color: rgb(248 250 252 / 0.99);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(strong),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(b),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(.font-semibold) {
		color: rgb(248 250 252 / 0.98);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		.prose-surface
		:global(a) {
		color: color-mix(in oklab, var(--color-primary-300) 72%, white 28%);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-updates-page
		:global(.bg-surface-500\/10) {
		background: color-mix(in oklab, white 10%, transparent) !important;
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.glass-card) {
		border-color: color-mix(in oklab, var(--color-surface-50) 12%, transparent);
	}

	/* Prose styles for content */
	.prose-surface {
		color: var(--color-surface-950-50);
	}

	.prose-surface :global(p) {
		color: var(--color-surface-950-50);
		line-height: 1.75;
		margin-bottom: 1rem;
	}

	.prose-surface :global(p:last-child) {
		margin-bottom: 0;
	}

	.prose-surface :global(a) {
		color: var(--color-primary-700-300);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.prose-surface :global(ul) {
		list-style-type: disc;
		padding-left: 1.25rem;
		margin-bottom: 1rem;
	}

	.prose-surface :global(li) {
		color: var(--color-surface-950-50);
		margin-bottom: 0.5rem;
	}

	.prose-surface :global(h2),
	.prose-surface :global(h3),
	.prose-surface :global(h4),
	.prose-surface :global(h5),
	.prose-surface :global(h6) {
		color: var(--color-surface-950-50);
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.prose-surface :global(h2) {
		font-size: 1.25rem;
	}

	.prose-surface :global(h3) {
		font-size: 1.125rem;
	}

	.archive-source-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 0.125rem 0.5rem;
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-700-300);
	}

	.archive-source-row {
		color: var(--color-surface-600-400);
	}

	.archive-source-row a {
		color: var(--color-primary-700-300);
	}

	:global(.microsite-shell.site-tbag[data-color-mode='light'])
		.microsite-updates-page
		:global(.text-surface-950-50) {
		color: #153b4d !important;
	}

	:global(.microsite-shell.site-tbag[data-color-mode='light'])
		.microsite-updates-page
		:global(.text-surface-700-300),
	:global(.microsite-shell.site-tbag[data-color-mode='light'])
		.microsite-updates-page
		:global(.text-surface-600-400) {
		color: #4a6470 !important;
	}

	:global(.microsite-shell.site-tbag[data-color-mode='light']) .microsite-updates-page input {
		color: #153b4d;
	}

	:global(.microsite-shell.site-tbag[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-950-50) {
		color: #f4f7f5 !important;
	}

	:global(.microsite-shell.site-tbag[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-700-300),
	:global(.microsite-shell.site-tbag[data-color-mode='dark'])
		.microsite-updates-page
		:global(.text-surface-600-400) {
		color: #c4d5d8 !important;
	}
</style>
