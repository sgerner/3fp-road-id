<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';

	let { data } = $props();
	let openSlug = $state('');

	$effect(() => {
		if (openSlug) return;
		openSlug = data.initialOpenSlug || '';
	});

	const config = $derived(data.site.siteConfig);

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

	function togglePost(post) {
		openSlug = openSlug === post.slug ? '' : post.slug;
		if (typeof window === 'undefined') return;
		const nextUrl = new URL(window.location.href);
		if (openSlug) nextUrl.searchParams.set('open', openSlug);
		else nextUrl.searchParams.delete('open');
		window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
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
				</p>
			</div>
		</div>
	</section>

	<!-- Updates List -->
	<section class="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		{#if data.posts.length}
			<div class="space-y-4">
				{#each data.posts as post}
					<article class="glass-card border-surface-500/15 card-interactive rounded-xl border p-5">
						<button
							type="button"
							class="flex w-full flex-col gap-4 text-left md:flex-row md:items-start md:justify-between"
							onclick={() => togglePost(post)}
						>
							<div class="min-w-0 flex-1">
								<div
									class="text-surface-600-400 flex flex-wrap items-center gap-3 text-[10px] font-semibold tracking-[0.15em] uppercase"
								>
									<span>{formatDate(post.published_at || post.created_at)}</span>
									<span
										class="bg-surface-500/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
									>
										<IconClock3 class="h-3 w-3" />
										{estimateReadTime(post.body_markdown)} min read
									</span>
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
								{#if openSlug === post.slug}
									Close
									<IconChevronUp class="h-4 w-4" />
								{:else}
									Read
									<IconArrowRight class="h-4 w-4" />
								{/if}
							</div>
						</button>
						{#if openSlug === post.slug}
							<div class="border-surface-500/10 mt-5 border-t pt-5">
								<div class="prose prose-surface max-w-none">
									{@html post.bodyHtml}
								</div>
							</div>
						{/if}
					</article>
				{/each}
			</div>
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

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.text-surface-950-50) {
		color: rgb(248 250 252 / 0.98) !important;
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.text-surface-700-300),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.text-surface-600-400),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.text-surface-800-200) {
		color: rgb(226 232 240 / 0.76) !important;
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.text-secondary-700-300) {
		color: color-mix(in oklab, var(--color-secondary-300) 76%, white 24%) !important;
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.btn.preset-tonal-primary) {
		color: rgb(248 250 252 / 0.98);
		background: color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface {
		color: rgb(226 232 240 / 0.94) !important;
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(p),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(li) {
		color: rgb(226 232 240 / 0.94);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h1),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h2),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h3),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h4),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h5),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(h6) {
		color: rgb(248 250 252 / 0.99);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(strong),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(b),
	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(.font-semibold) {
		color: rgb(248 250 252 / 0.98);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page .prose-surface :global(a) {
		color: color-mix(in oklab, var(--color-primary-300) 72%, white 28%);
	}

	:global(.microsite-shell[data-color-mode='dark']) .microsite-updates-page :global(.bg-surface-500\/10) {
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

	/* Section fade-in animation */
	.microsite-updates-page > section {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
		transform: translateY(20px);
	}

	.microsite-updates-page > section:nth-child(1) {
		animation-delay: 0.1s;
	}

	.microsite-updates-page > section:nth-child(2) {
		animation-delay: 0.2s;
	}

	@keyframes fade-in-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
