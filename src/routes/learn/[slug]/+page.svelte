<script>
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconMessageSquareText from '@lucide/svelte/icons/message-square-text';
	import IconListTree from '@lucide/svelte/icons/list-tree';
	import IconSparkle from '@lucide/svelte/icons/sparkle';

	const { data, form } = $props();
	let showVersionHistory = $state(false);

	// ── Reading progress bar ─────────────────────────────────────────────
	let scrollProgress = $state(0);
	let articleEl = $state(null);

	function onScroll() {
		if (!articleEl) return;
		const { top, height } = articleEl.getBoundingClientRect();
		const windowH = window.innerHeight;
		// progress: 0 when article top is at viewport bottom, 1 when article bottom is at viewport top
		const progress = Math.min(1, Math.max(0, (windowH - top) / (height + windowH)));
		scrollProgress = progress;
	}

	// ── TOC Scroll-spy ───────────────────────────────────────────────────
	let activeHeadingId = $state('');

	/** @type {IntersectionObserver | null} */
	let observer = null;

	function setupScrollSpy() {
		if (observer) observer.disconnect();
		const headingEls = Array.from(
			document.querySelectorAll(
				'.learn-article-body h1, .learn-article-body h2, .learn-article-body h3'
			)
		);
		if (!headingEls.length) return;

		const visible = new Set();
		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) visible.add(entry.target.id);
					else visible.delete(entry.target.id);
				});
				const active = headingEls.find((el) => visible.has(el.id));
				if (active) activeHeadingId = active.id;
			},
			{ rootMargin: '-10% 0px -75% 0px', threshold: 0 }
		);
		headingEls.forEach((el) => observer.observe(el));
	}

	// ── Fixed TOC positioning ─────────────────────────────────────────────
	// overflow-x:hidden on the root <main> breaks position:sticky for all
	// descendants. Instead we track the sidebar placeholder's screen rect
	// and drive a position:fixed panel to match it.
	let tocPlaceholderEl = $state(null);
	let tocFixed = $state({ left: 0, top: 0, width: 0, visible: false });

	function updateTocPosition() {
		if (!tocPlaceholderEl) return;
		const rect = tocPlaceholderEl.getBoundingClientRect();
		// Only show when the placeholder column is actually on screen (xl+)
		const isVisible = rect.width > 0 && window.innerWidth >= 1280;
		tocFixed = {
			left: rect.left,
			// Clamp top: start from the placeholder top but never above the nav (~130px)
			top: Math.max(130, rect.top),
			width: rect.width,
			visible: isVisible
		};
	}

	$effect(() => {
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('scroll', updateTocPosition, { passive: true });
		window.addEventListener('resize', updateTocPosition, { passive: true });
		onScroll();
		updateTocPosition();

		let ro;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(updateTocPosition);
			if (tocPlaceholderEl) ro.observe(tocPlaceholderEl);
		}

		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('scroll', updateTocPosition);
			window.removeEventListener('resize', updateTocPosition);
			ro?.disconnect();
		};
	});

	$effect(() => {
		setupScrollSpy();
		return () => observer?.disconnect();
	});

	// Filter: TOC shows h1+h2 on mobile accordion, h1+h2+h3 on desktop sidebar
	const tocHeadingsDesktop = $derived((data.article.headings ?? []).filter((h) => h.depth <= 3));
	const tocHeadingsMobile = $derived((data.article.headings ?? []).filter((h) => h.depth <= 2));

	function formatDate(value, withTime = false) {
		if (!value) return 'Recently';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
		});
	}
</script>

<svelte:head>
	<title>{data.article.title} · Learn</title>
	<meta name="description" content={data.article.summary || data.article.title} />
</svelte:head>

<!--
	Outer layout:
	- xl+: article column stays the same width; TOC floats as a sticky right sidebar
	- Below xl: single column, TOC is an accordion
-->

<!-- Reading progress bar (fixed to viewport top) -->
<div class="progress-bar-track" aria-hidden="true">
	<div class="progress-bar-fill" style="width: {scrollProgress * 100}%"></div>
</div>

<div class="article-page-root">
	<!-- ═══ MAIN ARTICLE COLUMN ══════════════════════════════════════════ -->
	<div class="article-main">
		<section
			class="border-surface-500/20 bg-surface-950/55 article-card overflow-hidden rounded-[2rem] border shadow-2xl"
			bind:this={articleEl}
		>
			{#if data.article.cover_image_url}
				<div class="aspect-[18/6] overflow-hidden">
					<img
						class="h-full w-full object-cover"
						src={data.article.cover_image_url}
						alt={data.article.title}
					/>
				</div>
			{/if}

			<div class="space-y-6 p-6 lg:p-8">
				<!-- Header chips + title + meta -->
				<div class="space-y-4">
					<div class="flex flex-wrap items-center gap-2">
						<span class="chip preset-filled-primary-500">{data.article.category_name}</span>
						<span class="chip preset-tonal-surface">
							<IconHistory class="h-3.5 w-3.5" />
							v{data.article.last_revision_number}
						</span>
						{#if data.viewingRevision}
							<span class="chip preset-tonal-secondary">
								Viewing revision {data.viewingRevision.revisionNumber}
							</span>
						{/if}
					</div>

					<h1 class="learn-article-title text-left text-4xl font-black lg:text-5xl">
						{data.article.title}
					</h1>

					{#if data.article.summary}
						<p class="max-w-3xl text-lg leading-8 opacity-80">{data.article.summary}</p>
					{/if}

					<div class="flex flex-wrap gap-5 text-sm opacity-70">
						<div class="flex items-center gap-2">
							<IconClock3 class="h-4 w-4" />
							Updated {formatDate(data.article.updated_at)}
						</div>
						<div>{data.article.estimatedReadMinutes} min read</div>
						<div>
							Created by {data.article.authorProfile?.full_name ||
								data.article.authorProfile?.email ||
								'Community member'}
						</div>
					</div>
				</div>

				<!-- ── KEY TAKEAWAYS ───────────────────────────────────────────── -->
				{#if data.article.keyTakeaways?.length}
					<div class="takeaways-panel">
						<div class="takeaways-header">
							<IconSparkle class="h-3.5 w-3.5" />
							<span>Key Takeaways</span>
						</div>
						<ul class="takeaways-list">
							{#each data.article.keyTakeaways as takeaway}
								<li class="takeaway-item">
									<span class="takeaway-dot" aria-hidden="true"></span>
									<span>{takeaway}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- ── MOBILE-ONLY TOC ACCORDION ──────────────────────────────── -->
				{#if tocHeadingsMobile.length}
					<details class="toc-accordion xl:hidden">
						<summary class="toc-accordion-summary">
							<div class="flex items-center gap-2">
								<IconListTree class="h-4 w-4 opacity-70" />
								<span class="font-semibold">On this page</span>
							</div>
							<IconChevronDown class="toc-accordion-chevron h-4 w-4 opacity-60" />
						</summary>
						<nav class="toc-accordion-body">
							{#each tocHeadingsMobile as heading}
								<a
									class={`toc-link ${heading.depth > 1 ? 'toc-link-sub' : ''}`}
									href={`#${heading.id}`}
									onclick={() => {
										const el = document.querySelector('details.toc-accordion');
										if (el) el.removeAttribute('open');
									}}
								>
									{heading.text}
								</a>
							{/each}
						</nav>
					</details>
				{/if}

				<!-- ── VIEWING REVISION BANNER ────────────────────────────────── -->
				{#if data.viewingRevision}
					<div
						class="border-secondary-500/25 bg-secondary-500/10 rounded-[1.5rem] border p-4 text-sm"
					>
						This page is showing revision {data.viewingRevision.revisionNumber} from
						{formatDate(data.viewingRevision.createdAt, true)}.
						<a class="font-semibold underline" href={`/learn/${data.article.slug}`}
							>Return to the latest version</a
						>.
					</div>
				{/if}

				<!-- ── ARTICLE BODY ────────────────────────────────────────────── -->
				<div class="learn-article-body">
					{#if data.article.hasStructuredSections}
						<div class="learn-sections space-y-5">
							{#if data.article.introHtml}
								<div class="prose prose-invert learn-prose max-w-none">
									{@html data.article.introHtml}
								</div>
							{/if}

							{#each data.article.sections as section}
								{#if section.isCollapsible}
									<details
										class="border-surface-500/20 bg-surface-900/35 rounded-[1.5rem] border p-5"
									>
										<summary class="cursor-pointer list-none">
											<div class="flex items-center justify-between gap-3">
												<div>
													<p class="text-left text-xl font-bold">{section.title}</p>
													<p class="mt-1 text-sm opacity-65">Expanded details for this section</p>
												</div>
												<span class="chip preset-tonal-surface">Long section</span>
											</div>
										</summary>
										<div class="prose prose-invert learn-prose mt-5 max-w-none">
											{@html section.html}
										</div>
									</details>
								{:else}
									<div class="prose prose-invert learn-prose max-w-none">
										{@html section.html}
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<div class="prose prose-invert learn-prose max-w-none">
							{@html data.article.bodyHtml}
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- ── BELOW-ARTICLE SECTIONS ─────────────────────────────────── -->
		<section class="space-y-6">
			{#if data.article.assets.some((asset) => asset.usage_kind !== 'embedded')}
				<section
					class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl"
				>
					<h2 class="text-left text-2xl font-bold">Attached media</h2>
					<div class="mt-4 space-y-2">
						{#each data.article.assets.filter((asset) => asset.usage_kind !== 'embedded') as asset}
							<a
								class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 block rounded-2xl border p-4 text-sm transition"
								href={asset.public_url}
								target="_blank"
								rel="noreferrer"
							>
								<div class="font-medium">{asset.file_name}</div>
								<div class="mt-1 opacity-70">{asset.mime_type || 'file'}</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if data.relatedArticles.length}
				<section
					class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl"
				>
					<h2 class="text-left text-2xl font-bold">More in {data.article.category_name}</h2>
					<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.relatedArticles as related}
							<a
								class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 flex min-h-32 flex-col rounded-2xl border p-4 transition hover:-translate-y-0.5"
								href={`/learn/${related.slug}`}
							>
								<div class="font-medium">{related.title}</div>
								<div class="mt-2 text-sm opacity-70">
									<p class="line-clamp-3">{related.summary || 'Open article'}</p>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
				<div class="flex items-center gap-2">
					<IconMessageSquareText class="h-5 w-5" />
					<h2 class="text-left text-2xl font-bold">Discussion</h2>
				</div>

				{#if data.currentUser}
					<form class="preset-tonal-surface mt-5 space-y-3 p-2" method="POST" action="?/comment">
						<textarea
							class="textarea min-h-32"
							name="bodyMarkdown"
							placeholder="Share context, corrections, follow-up questions, or examples from your city."
						></textarea>
						{#if form?.commentError}
							<p class="text-error-500 text-sm">{form.commentError}</p>
						{/if}
						{#if form?.commentSuccess}
							<p class="text-success-500 text-sm">Comment added.</p>
						{/if}
						<button class="btn preset-filled-secondary-500" type="submit">Post comment</button>
					</form>
				{:else}
					<div
						class="border-surface-500/30 mt-5 rounded-[1.5rem] border border-dashed p-5 text-sm opacity-80"
					>
						Sign in with a registered account to comment or edit the article.
					</div>
				{/if}

				<div class="mt-6 space-y-4">
					{#each data.article.comments as comment}
						<div class="border-surface-500/20 bg-surface-900/60 rounded-[1.5rem] border p-4">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<p class="font-semibold">
									{comment.authorProfile?.full_name ||
										comment.authorProfile?.email ||
										'Community member'}
								</p>
								<p class="text-sm opacity-60">{formatDate(comment.created_at, true)}</p>
							</div>
							<div class="prose prose-invert mt-3 max-w-none">
								{@html comment.bodyHtml}
							</div>
						</div>
					{/each}

					{#if !data.article.comments.length}
						<div
							class="border-surface-500/30 rounded-[1.5rem] border border-dashed p-6 text-center opacity-75"
						>
							No comments yet. Start the discussion with implementation notes, questions, or local
							examples.
						</div>
					{/if}
				</div>
			</section>

			<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-3 text-left"
					onclick={() => (showVersionHistory = !showVersionHistory)}
					aria-expanded={showVersionHistory}
					aria-controls="learn-version-history"
				>
					<div class="flex items-center gap-2">
						<IconHistory class="h-5 w-5" />
						<h2 class="text-left text-2xl font-bold">Version history</h2>
					</div>
					<span class="inline-flex items-center gap-2 text-sm opacity-70">
						{data.article.revisions.length} revisions
						<IconChevronDown
							class={`h-4 w-4 transition-transform duration-200 ${showVersionHistory ? 'rotate-180' : ''}`}
						/>
					</span>
				</button>

				{#if showVersionHistory}
					<div id="learn-version-history" class="mt-4 space-y-3">
						{#each data.article.revisions as revision}
							<div class="space-y-2">
								<a
									class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 block rounded-2xl border p-4 transition"
									href={`/learn/${data.article.slug}?revision=${revision.id}`}
								>
									<div class="flex flex-wrap items-center justify-between gap-3">
										<p class="font-medium">Revision {revision.revision_number}</p>
										<p class="text-xs uppercase opacity-60">{formatDate(revision.created_at)}</p>
									</div>
									<p class="mt-1 text-sm opacity-70">
										{revision.authorProfile?.full_name ||
											revision.authorProfile?.email ||
											'Community member'}
									</p>
									{#if data.canEdit}
										<p class="mt-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-60">
											Restore from edit screen
										</p>
									{/if}
								</a>
								{#if data.canEdit}
									<a
										class="btn btn-xs preset-tonal-surface"
										href={`/learn/${data.article.slug}/edit?fromRevision=${revision.id}`}
									>
										Open this revision in editor
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		</section>
	</div>

	<!-- ═══ DESKTOP TOC SIDEBAR (xl+) ════════════════════════════════════
	     The aside is an invisible grid-column placeholder only. The actual
	     visible panel is position:fixed, positioned via JS to work around
	     overflow-x:hidden on the root <main> which breaks position:sticky.
	-->
	{#if tocHeadingsDesktop.length}
		<aside class="toc-placeholder hidden xl:block" bind:this={tocPlaceholderEl}></aside>
	{/if}
</div>

<!-- ═══ FIXED TOC PANEL (rendered outside grid, always on top) ══════════ -->
{#if tocHeadingsDesktop.length && tocFixed.visible}
	<div
		class="toc-fixed-panel"
		style="left: {tocFixed.left}px; top: {tocFixed.top}px; width: {tocFixed.width}px;"
	>
		<div class="toc-sidebar-label">
			<IconListTree class="h-3.5 w-3.5" />
			On this page
		</div>
		<nav class="toc-sidebar-nav">
			{#each tocHeadingsDesktop as heading}
				<a
					class={`toc-sidebar-link ${heading.depth === 2 ? 'toc-sidebar-link-h2' : ''} ${heading.depth === 3 ? 'toc-sidebar-link-h3' : ''} ${activeHeadingId === heading.id ? 'toc-sidebar-link-active' : ''}`}
					href={`#${heading.id}`}
				>
					{heading.text}
				</a>
			{/each}
		</nav>
	</div>
{/if}

<style>
	/* ── Page layout ── */
	.article-page-root {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2rem;
		width: 100%;
		max-width: 80rem; /* ~5xl */
		margin: 0 auto;
	}

	/* On xl+ screens: push a TOC sidebar to the right */
	@media (min-width: 1280px) {
		.article-page-root {
			/* article takes the main space; sidebar is 260px */
			grid-template-columns: minmax(0, 1fr) 260px;
			/* Do NOT set align-items:start here — sticky needs the cell to be full height */
		}
	}

	.article-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* ── Reading progress bar (fixed to viewport top) ── */
	.progress-bar-track {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		height: 3px;
		pointer-events: none;
		background: color-mix(in oklab, var(--color-primary-500) 10%, transparent);
	}

	.progress-bar-fill {
		height: 100%;
		background: linear-gradient(to right, var(--color-primary-500), var(--color-secondary-400));
		transition: width 0.1s linear;
		border-radius: 0 2px 2px 0;
	}

	/* ── Article title ── */
	.learn-article-title {
		font-family: 'Georgia', 'Times New Roman', serif;
		text-wrap: balance;
	}

	/* ── Key Takeaways panel ── */
	.takeaways-panel {
		border-radius: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950) 92%);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		box-shadow: 0 0 32px -8px color-mix(in oklab, var(--color-primary-500) 20%, transparent);
	}

	.takeaways-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-primary-300);
		opacity: 0.9;
	}

	.takeaways-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.takeaway-item {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
		font-size: 0.875rem;
		line-height: 1.6;
		opacity: 0.85;
	}

	.takeaway-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-primary-400);
		margin-top: 0.45rem;
	}

	/* ── Mobile TOC accordion ── */
	.toc-accordion {
		border-radius: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 25%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		overflow: hidden;
	}

	.toc-accordion-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.125rem;
		cursor: pointer;
		list-style: none;
		user-select: none;
		font-size: 0.875rem;
	}

	.toc-accordion-summary::-webkit-details-marker {
		display: none;
	}

	.toc-accordion[open] .toc-accordion-chevron {
		transform: rotate(180deg);
	}

	.toc-accordion-chevron {
		transition: transform 200ms ease;
	}

	.toc-accordion-body {
		padding: 0.25rem 0.75rem 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		padding-top: 0.625rem;
	}

	.toc-link {
		display: block;
		padding: 0.375rem 0.625rem;
		border-radius: 0.625rem;
		font-size: 0.8125rem;
		opacity: 0.75;
		transition:
			background 150ms ease,
			opacity 150ms ease;
	}

	.toc-link:hover {
		background: color-mix(in oklab, var(--color-surface-50) 6%, transparent);
		opacity: 1;
	}

	.toc-link-sub {
		padding-left: 1.25rem;
		opacity: 0.6;
	}

	/* ── Desktop TOC placeholder (reserves grid column space only) ── */
	.toc-placeholder {
		/* No visual — just holds the grid column. The fixed panel renders outside. */
		pointer-events: none;
	}

	/* ── Fixed TOC panel (JS-positioned, rendered outside the grid) ── */
	.toc-fixed-panel {
		position: fixed;
		z-index: 30;
		max-height: calc(100vh - 9rem);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: color-mix(in oklab, var(--color-surface-500) 30%, transparent) transparent;
		/* Visual styling same as old sidebar-inner */
		border-radius: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 85%, transparent);
		backdrop-filter: blur(12px);
		padding: 1.125rem;
	}

	.toc-sidebar-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		opacity: 0.5;
		margin-bottom: 0.75rem;
		padding-bottom: 0.625rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.toc-sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toc-sidebar-link {
		display: block;
		padding: 0.3rem 0.625rem;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		line-height: 1.45;
		opacity: 0.65;
		border-left: 2px solid transparent;
		transition:
			opacity 150ms ease,
			background 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.toc-sidebar-link:hover {
		opacity: 0.95;
		background: color-mix(in oklab, var(--color-surface-50) 5%, transparent);
	}

	.toc-sidebar-link-h2 {
		padding-left: 1rem;
		font-size: 0.775rem;
		opacity: 0.55;
	}

	.toc-sidebar-link-h3 {
		padding-left: 1.625rem;
		font-size: 0.75rem;
		opacity: 0.45;
	}

	.toc-sidebar-link-active {
		opacity: 1 !important;
		border-left-color: var(--color-primary-400);
		color: var(--color-primary-200);
		background: color-mix(in oklab, var(--color-primary-500) 8%, transparent);
	}

	/* ── Prose styles ── */
	.learn-prose :global(h1),
	.learn-prose :global(h2),
	.learn-prose :global(h3),
	.learn-prose :global(h4) {
		text-align: left;
		/* Offset for fixed header (~73px top bar + ~57px secondary nav) */
		scroll-margin-top: 8rem;
	}

	.learn-prose :global(img) {
		border-radius: 1rem;
	}
</style>
