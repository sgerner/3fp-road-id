<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconArrowDown from '@lucide/svelte/icons/arrow-down';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconGripVertical from '@lucide/svelte/icons/grip-vertical';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconLayersThree from '@lucide/svelte/icons/layers-3';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let searchQuery = $state('');
	let activeSubcategory = $state('all');

	let subcategories = $derived(data.subcategories);
	let articles = $derived(data.articles);

	const filteredArticles = $derived(
		articles.filter((article) => {
			if (!searchQuery.trim()) return true;
			const query = searchQuery.trim().toLowerCase();
			const haystack = [article.title, article.summary].filter(Boolean).join(' ');
			return haystack.toLowerCase().includes(query);
		})
	);

	const groups = $derived.by(() => {
		const items = [];

		const uncategorized = filteredArticles.filter((a) => !a.subcategory_slug);
		if (uncategorized.length > 0 || data.canEdit) {
			items.push({
				id: 'uncategorized',
				subcategory: null,
				articles: uncategorized
			});
		}

		for (const sub of subcategories) {
			const subArticles = filteredArticles.filter((a) => a.subcategory_slug === sub.slug);
			items.push({
				id: sub.slug,
				subcategory: sub,
				articles: subArticles
			});
		}

		return items;
	});

	// For subcategory filter nav
	const visibleGroups = $derived(
		activeSubcategory === 'all'
			? groups.filter((g) => g.articles.length > 0 || (data.canEdit && g.subcategory))
			: groups.filter(
					(g) =>
						g.id === activeSubcategory && (g.articles.length > 0 || (data.canEdit && g.subcategory))
				)
	);

	const totalArticles = $derived(articles.length);
	const totalSubcategories = $derived(subcategories.length);

	function formatDate(value) {
		if (!value) return '';
		return new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let isReordering = $state(false);

	function moveSubcategory(index, direction) {
		const newItems = [...subcategories];
		if (direction === -1 && index > 0) {
			[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
		} else if (direction === 1 && index < newItems.length - 1) {
			[newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
		} else {
			return;
		}

		newItems.forEach((sub, i) => (sub.sort_order = i));
		document.getElementById('reorder-subcategories-payload').value = JSON.stringify(
			newItems.map((s) => ({ id: s.slug, sort_order: s.sort_order }))
		);
		document.getElementById('reorder-subcategories-form').requestSubmit();
	}

	function moveArticle(articleId, direction) {
		const article = articles.find((a) => a.id === articleId);
		const currentSubslug = article.subcategory_slug;
		const subArticles = articles.filter((a) => a.subcategory_slug === currentSubslug);
		const index = subArticles.findIndex((a) => a.id === articleId);

		if (direction === -1 && index > 0) {
			[subArticles[index - 1], subArticles[index]] = [subArticles[index], subArticles[index - 1]];
		} else if (direction === 1 && index < subArticles.length - 1) {
			[subArticles[index + 1], subArticles[index]] = [subArticles[index], subArticles[index + 1]];
		} else {
			return;
		}

		subArticles.forEach((art, i) => (art.sort_order = i));
		document.getElementById('reorder-articles-payload').value = JSON.stringify(
			subArticles.map((a) => ({
				id: a.id,
				sort_order: a.sort_order,
				subcategory_slug: a.subcategory_slug
			}))
		);
		document.getElementById('reorder-articles-form').requestSubmit();
	}

	function assignSubcategory(articleId, subcategorySlug) {
		const article = articles.find((a) => a.id === articleId);
		if (!article) return;
		article.subcategory_slug = subcategorySlug || null;

		const subArticles = articles.filter((a) => a.subcategory_slug === subcategorySlug);
		article.sort_order = subArticles.length;

		document.getElementById('reorder-articles-payload').value = JSON.stringify([
			{ id: article.id, sort_order: article.sort_order, subcategory_slug: article.subcategory_slug }
		]);
		document.getElementById('reorder-articles-form').requestSubmit();
	}
</script>

<svelte:head>
	<title>{data.category.name} · Learn · 3 Feet Please</title>
	<meta
		name="description"
		content={data.category.description ||
			`Browse ${data.category.name} guides in the 3 Feet Please knowledge library.`}
	/>
</svelte:head>

<div class="cat-page mx-auto flex w-full max-w-7xl flex-col gap-8">
	<!-- ═══════════════════════════════════════════════
	     HERO
	═══════════════════════════════════════════════ -->
	<section class="cat-hero relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="cat-orb cat-orb-1" aria-hidden="true"></div>
		<div class="cat-orb cat-orb-2" aria-hidden="true"></div>
		<div class="cat-orb cat-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:p-10"
		>
			<!-- Left: breadcrumb + headline + description -->
			<div class="flex flex-col gap-6">
				<!-- Breadcrumb chips -->
				<div class="flex flex-wrap items-center gap-2">
					<a
						href="/learn"
						class="chip preset-tonal-surface hover:preset-filled-surface-500 gap-1.5 font-medium"
					>
						<IconBookOpen class="h-3.5 w-3.5" />
						Learn Library
					</a>
					<span class="opacity-40">/</span>
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold">
						<IconFolderOpen class="h-3.5 w-3.5" />
						{data.category.name}
					</span>
				</div>

				<!-- Headline -->
				<div class="space-y-3">
					<h1 class="cat-headline text-4xl font-black tracking-tight lg:text-5xl xl:text-6xl">
						{data.category.name}
					</h1>
					{#if data.category.description}
						<p class="max-w-xl text-base leading-relaxed opacity-75 lg:text-lg">
							{data.category.description}
						</p>
					{:else}
						<p class="max-w-xl text-base leading-relaxed opacity-60">
							Guides, references, and community-edited resources for this topic area.
						</p>
					{/if}
				</div>

				<!-- Action buttons -->
				<div class="flex flex-wrap gap-3">
					<a class="btn preset-filled-primary-500 gap-2" href="/learn/new">
						<IconPlus class="h-4 w-4" />
						Create article
					</a>
					{#if data.canEdit}
						<button
							type="button"
							class="btn {isReordering
								? 'preset-filled-warning-500'
								: 'preset-tonal-surface'} gap-2"
							onclick={() => (isReordering = !isReordering)}
						>
							<IconGripVertical class="h-4 w-4" />
							{isReordering ? 'Done reordering' : 'Reorder content'}
						</button>
					{/if}
				</div>
			</div>

			<!-- Right: stat cards + search -->
			<div class="flex flex-col gap-5">
				<!-- Stat cards -->
				<div class="grid grid-cols-2 gap-3">
					{#each [{ icon: IconBookOpen, label: 'Articles', value: totalArticles, accent: 'var(--color-primary-500)' }, { icon: IconLayersThree, label: 'Subcategories', value: totalSubcategories, accent: 'var(--color-secondary-500)' }] as stat}
						<div class="cat-stat card preset-tonal-surface relative overflow-hidden p-4">
							<div
								class="cat-stat-glow"
								style="background: {stat.accent};"
								aria-hidden="true"
							></div>
							<div
								class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase opacity-55"
							>
								<svelte:component this={stat.icon} class="h-4 w-4" />
								{stat.label}
							</div>
							<div class="text-3xl font-black tabular-nums">{stat.value}</div>
						</div>
					{/each}
				</div>

				<!-- Search box -->
				<div class="cat-search-panel card preset-filled-surface-50-950 flex flex-col gap-3 p-5">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-55"
					>
						<IconSearch class="h-3.5 w-3.5" />
						Search this category
					</div>
					<div class="relative">
						<IconSearch
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-45"
						/>
						<input
							bind:value={searchQuery}
							class="input pl-9"
							type="search"
							placeholder="Find an article…"
						/>
					</div>
					{#if searchQuery.trim()}
						<p class="text-xs opacity-55">
							{filteredArticles.length}
							{filteredArticles.length === 1 ? 'result' : 'results'} in {data.category.name}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     ADD SUBCATEGORY (admin only)
	═══════════════════════════════════════════════ -->
	{#if data.canEdit}
		<section
			class="card preset-tonal-surface border-surface-500/20 overflow-hidden rounded-[2rem] border p-6"
		>
			<div class="flex items-center gap-2">
				<IconSparkles class="h-4 w-4 opacity-60" />
				<h2 class="font-bold">Add subcategory</h2>
			</div>
			<form method="POST" action="?/createSubcategory" use:enhance class="mt-4 flex max-w-md gap-3">
				<input
					type="text"
					name="name"
					class="input w-full"
					placeholder="e.g. Response Templates"
					required
				/>
				<button type="submit" class="btn preset-filled-primary-500 shrink-0">
					<IconPlus class="h-4 w-4" />
					Add
				</button>
			</form>
			{#if form?.error}
				<p class="text-error-400 mt-2 text-sm">{form.error}</p>
			{/if}
		</section>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     SUBCATEGORY FILTER PILLS
	═══════════════════════════════════════════════ -->
	{#if subcategories.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="chip {activeSubcategory === 'all'
					? 'preset-filled-primary-500'
					: 'preset-tonal-surface'} font-medium"
				onclick={() => (activeSubcategory = 'all')}
			>
				All
			</button>
			{#if groups.some((g) => !g.subcategory && g.articles.length > 0)}
				<button
					type="button"
					class="chip {activeSubcategory === 'uncategorized'
						? 'preset-filled-secondary-500'
						: 'preset-tonal-surface'}"
					onclick={() => (activeSubcategory = 'uncategorized')}
				>
					General
				</button>
			{/if}
			{#each subcategories as sub}
				<button
					type="button"
					class="chip {activeSubcategory === sub.slug
						? 'preset-filled-secondary-500'
						: 'preset-tonal-surface'}"
					onclick={() => (activeSubcategory = sub.slug)}
				>
					{sub.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     ARTICLE GROUPS
	═══════════════════════════════════════════════ -->
	<div class="space-y-14">
		{#each visibleGroups as group, groupIndex}
			<section class="cat-group" style="--group-index: {groupIndex}">
				<!-- Subcategory heading -->
				<div class="cat-group-header mb-5 flex items-center justify-between gap-4">
					<div class="flex items-center gap-3">
						<div class="cat-group-dot" aria-hidden="true"></div>
						<div>
							{#if group.subcategory}
								<p class="label opacity-55">Subcategory</p>
								<h2 class="text-2xl font-bold">{group.subcategory.name}</h2>
							{:else}
								<p class="label opacity-55">Category</p>
								<h2 class="text-2xl font-bold">General</h2>
							{/if}
						</div>
					</div>

					<!-- Reorder subcategory buttons -->
					{#if isReordering && group.subcategory}
						<div class="flex gap-2">
							<button
								class="btn-icon preset-tonal-surface btn-sm"
								onclick={() =>
									moveSubcategory(
										subcategories.findIndex((s) => s.slug === group.subcategory.slug),
										-1
									)}
								disabled={subcategories.findIndex((s) => s.slug === group.subcategory.slug) === 0}
							>
								<IconArrowUp class="h-4 w-4" />
							</button>
							<button
								class="btn-icon preset-tonal-surface btn-sm"
								onclick={() =>
									moveSubcategory(
										subcategories.findIndex((s) => s.slug === group.subcategory.slug),
										1
									)}
								disabled={subcategories.findIndex((s) => s.slug === group.subcategory.slug) ===
									subcategories.length - 1}
							>
								<IconArrowDown class="h-4 w-4" />
							</button>
						</div>
					{/if}
				</div>

				<!-- Article grid -->
				{#if group.articles.length > 0}
					<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{#each group.articles as article, articleIndex}
							<div
								class="cat-card group border-surface-500/20 bg-surface-900/60 relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border shadow-lg"
								style="--stagger: {articleIndex}"
							>
								<!-- Top accent bar -->
								<div class="cat-card-accent" aria-hidden="true"></div>

								<a
									href={`/learn/${article.slug}`}
									class="hover:bg-surface-800/40 flex flex-1 flex-col transition-colors"
								>
									{#if article.cover_image_url}
										<div class="aspect-[16/8] overflow-hidden">
											<img
												class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
												src={article.cover_image_url}
												alt={article.title}
											/>
										</div>
									{/if}

									<div class="flex flex-1 flex-col gap-4 p-5">
										<div class="space-y-2">
											<h3 class="text-lg leading-snug font-bold">{article.title}</h3>
											<p class="line-clamp-3 text-sm leading-relaxed opacity-70">
												{article.summary || 'Open the article to read the full guide.'}
											</p>
										</div>

										<div class="mt-auto flex items-center justify-between gap-3 text-sm">
											<div class="flex items-center gap-1.5 opacity-55">
												<IconClock3 class="h-3.5 w-3.5" />
												{formatDate(article.updated_at)}
											</div>
											<span
												class="inline-flex items-center gap-1 font-semibold opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
											>
												Read
												<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-0.5" />
											</span>
										</div>
									</div>
								</a>

								<!-- Reorder panel (admin) -->
								{#if isReordering}
									<div
										class="reorder-panel border-surface-500/25 bg-surface-900/80 flex flex-col gap-3 border-t p-3"
									>
										<div class="flex items-center gap-2">
											<span class="text-xs font-semibold tracking-wide uppercase opacity-50"
												>Order</span
											>
											<div class="ml-auto flex gap-1">
												<button
													class="btn-icon preset-tonal-surface btn-sm"
													onclick={() => moveArticle(article.id, -1)}
													disabled={articleIndex === 0}
												>
													<IconArrowUp class="h-3 w-3" />
												</button>
												<button
													class="btn-icon preset-tonal-surface btn-sm"
													onclick={() => moveArticle(article.id, 1)}
													disabled={articleIndex === group.articles.length - 1}
												>
													<IconArrowDown class="h-3 w-3" />
												</button>
											</div>
										</div>
										<div class="flex items-center gap-2">
											<span
												class="shrink-0 text-xs font-semibold tracking-wide uppercase opacity-50"
												>Move to</span
											>
											<select
												class="select select-sm w-full"
												onchange={(e) => assignSubcategory(article.id, e.target.value)}
											>
												<option value="">General</option>
												{#each subcategories as sub}
													<option value={sub.slug} selected={sub.slug === article.subcategory_slug}
														>{sub.name}</option
													>
												{/each}
											</select>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="cat-empty border-surface-500/30 rounded-[1.5rem] border border-dashed p-6 text-center"
					>
						<p class="text-sm opacity-60">No articles in this section yet.</p>
					</div>
				{/if}
			</section>
		{/each}

		{#if visibleGroups.length === 0}
			<div
				class="cat-empty-state card preset-tonal-surface relative overflow-hidden rounded-[2rem] p-12 text-center"
			>
				<div class="empty-orb" aria-hidden="true"></div>
				<div class="relative z-10 mx-auto max-w-md space-y-4">
					<div
						class="border-primary-500/25 bg-surface-800 mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border"
					>
						<IconBookOpen class="h-9 w-9 opacity-50" />
					</div>
					<h3 class="text-xl font-bold">No articles found</h3>
					<p class="text-sm leading-relaxed opacity-65">
						Try clearing your search, or create the first guide for this category.
					</p>
					<div class="flex flex-wrap justify-center gap-3 pt-2">
						{#if searchQuery}
							<button class="btn preset-tonal-surface" onclick={() => (searchQuery = '')}>
								Clear search
							</button>
						{/if}
						<a class="btn preset-filled-primary-500 gap-2" href="/learn/new">
							<IconPlus class="h-4 w-4" />
							Create article
						</a>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- ── Hidden forms for server actions ── -->
<form
	id="reorder-subcategories-form"
	method="POST"
	action="?/updateOrder"
	use:enhance
	class="hidden"
>
	<input type="hidden" name="type" value="subcategory" />
	<input type="hidden" name="items" id="reorder-subcategories-payload" />
</form>

<form id="reorder-articles-form" method="POST" action="?/updateOrder" use:enhance class="hidden">
	<input type="hidden" name="type" value="article" />
	<input type="hidden" name="items" id="reorder-articles-payload" />
</form>

<style>
	/* ── Hero ── */
	.cat-hero {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-950) 90%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 22%, transparent);
	}

	.cat-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.cat-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		animation: cat-orb-drift 20s ease-in-out infinite alternate;
	}

	.cat-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 16%, transparent);
		animation: cat-orb-drift 26s ease-in-out infinite alternate-reverse;
	}

	.cat-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 13%, transparent);
		animation: cat-orb-drift 22s ease-in-out infinite alternate;
	}

	@keyframes cat-orb-drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		100% {
			transform: translate(4%, 6%) scale(1.08);
		}
	}

	/* ── Headline ── */
	.cat-headline {
		font-family: 'Georgia', 'Times New Roman', serif;
		text-wrap: balance;
		background: linear-gradient(
			135deg,
			var(--color-primary-100),
			var(--color-primary-300) 40%,
			var(--color-secondary-300)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* ── Stat cards ── */
	.cat-stat {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
	}

	.cat-stat:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 22%, transparent);
	}

	.cat-stat-glow {
		position: absolute;
		inset: 0;
		opacity: 0.07;
		pointer-events: none;
	}

	/* ── Search panel ── */
	.cat-search-panel {
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	/* ── Group sections ── */
	.cat-group {
		animation: group-in 400ms ease both;
		animation-delay: calc(var(--group-index, 0) * 80ms);
	}

	@keyframes group-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.cat-group-header {
		position: relative;
	}

	.cat-group-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary-400), var(--color-secondary-400));
		box-shadow: 0 0 10px 2px color-mix(in oklab, var(--color-primary-400) 40%, transparent);
		flex-shrink: 0;
	}

	/* ── Article cards ── */
	.cat-card {
		transition:
			transform 220ms ease,
			box-shadow 220ms ease;
		animation: card-in 360ms ease both;
		animation-delay: calc(var(--stagger, 0) * 60ms);
	}

	.cat-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 32px -6px color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	.cat-card-accent {
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.6;
		transition: opacity 220ms ease;
	}

	.cat-card:hover .cat-card-accent {
		opacity: 1;
	}

	/* ── Reorder panel ── */
	.reorder-panel {
		animation: slide-in 180ms ease;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Empty state ── */
	.cat-empty {
		animation: group-in 350ms ease both;
	}

	.cat-empty-state {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.empty-orb {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 50% 60%,
			color-mix(in oklab, var(--color-primary-500) 10%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	/* ── Card entrance ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
