<script>
	import LearnNavigator from '#lib/components/learn/LearnNavigator.svelte';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconGripVertical from '@lucide/svelte/icons/grip-vertical';
	import IconLayersThree from '@lucide/svelte/icons/layers-3';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '#lib/seo';

	let { data, form } = $props();

	let searchQuery = $state('');
	let activeSubcategory = $state('all');
	let isReordering = $state(false);

	// Mutable local copies used by DnD
	let subcategories = $state([]);
	let articles = $state([]);

	$effect(() => {
		subcategories = [...data.subcategories];
		articles = [...data.articles];
	});

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
			items.push({ id: 'uncategorized', subcategory: null, articles: uncategorized });
		}
		for (const sub of subcategories) {
			const subArticles = filteredArticles.filter((a) => a.subcategory_slug === sub.slug);
			items.push({ id: sub.slug, subcategory: sub, articles: subArticles });
		}
		return items;
	});

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

	// ── DnD state ─────────────────────────────────────────────────────────
	// dndArticleMap: groupId → article[]
	// All article zones share type:'article' so items can cross between zones.
	let dndArticleMap = $state({});
	// Subcategory-level drag list
	let dndSubGroups = $state([]);

	// groupId → subcategory_slug (null for uncategorized)
	function groupIdToSlug(groupId) {
		return groupId === 'uncategorized' ? null : groupId;
	}

	function enterReorderMode() {
		const map = {};
		for (const g of groups) {
			map[g.id] = g.articles.map((a) => ({ ...a }));
		}
		// Ensure every group has an entry (even empty ones)
		for (const sub of subcategories) {
			if (!(sub.slug in map)) map[sub.slug] = [];
		}
		if (!('uncategorized' in map)) map['uncategorized'] = [];
		dndArticleMap = map;
		dndSubGroups = subcategories.map((sub, i) => ({ id: sub.slug, sub, sort_order: i }));
		isReordering = true;
	}

	function exitReorderMode() {
		isReordering = false;
	}

	// ── Subcategory section reordering ────────────────────────────────────
	function handleGroupConsider(e) {
		dndSubGroups = e.detail.items;
	}

	function handleGroupFinalize(e) {
		dndSubGroups = e.detail.items;
		const newOrder = dndSubGroups.map((g) => g.sub);
		newOrder.forEach((sub, i) => (sub.sort_order = i));
		subcategories = newOrder;
		document.getElementById('reorder-subcategories-payload').value = JSON.stringify(
			newOrder.map((s) => ({ id: s.slug, sort_order: s.sort_order }))
		);
		document.getElementById('reorder-subcategories-form').requestSubmit();
	}

	// ── Article reordering (within-zone AND cross-zone) ───────────────────
	//
	// svelte-dnd-action fires consider/finalize on BOTH source and target
	// zones when an item crosses zones. We just update dndArticleMap for
	// whichever zone called us — the library keeps both in sync during
	// the consider phase and commits on finalize.
	function handleArticleConsider(groupId, e) {
		dndArticleMap = { ...dndArticleMap, [groupId]: e.detail.items };
	}

	function handleArticleFinalize(groupId, e) {
		const newItems = e.detail.items;

		// Assign the correct subcategory_slug based on which zone this is
		const targetSlug = groupIdToSlug(groupId);
		newItems.forEach((a, i) => {
			a.sort_order = i;
			a.subcategory_slug = targetSlug;
		});

		// Commit to the full map
		dndArticleMap = { ...dndArticleMap, [groupId]: newItems };

		// Also update the canonical articles array so the rest of the UI stays in sync
		for (const item of newItems) {
			const orig = articles.find((a) => a.id === item.id);
			if (orig) {
				orig.sort_order = item.sort_order;
				orig.subcategory_slug = item.subcategory_slug;
			}
		}

		// Collect ALL articles across every zone so we save a complete snapshot.
		// This ensures the source zone's items get their new sort_orders saved too.
		const allChanged = Object.entries(dndArticleMap).flatMap(([gid, items]) => {
			const slug = groupIdToSlug(gid);
			return items.map((a, i) => ({
				id: a.id,
				sort_order: i,
				subcategory_slug: slug
			}));
		});

		document.getElementById('reorder-articles-payload').value = JSON.stringify(allChanged);
		document.getElementById('reorder-articles-form').requestSubmit();
	}

	// ── Move to subcategory (dropdown fallback) ────────────────────────────
	function assignSubcategory(articleId, subcategorySlug) {
		const article = articles.find((a) => a.id === articleId);
		if (!article) return;
		const targetSlug = subcategorySlug || null;
		article.subcategory_slug = targetSlug;

		// Also update the dnd map so the UI stays in sync
		const newMap = {};
		for (const [gid, items] of Object.entries(dndArticleMap)) {
			newMap[gid] = items.filter((a) => a.id !== articleId);
		}
		const targetGroupId = targetSlug ?? 'uncategorized';
		if (!newMap[targetGroupId]) newMap[targetGroupId] = [];
		const movedArticle = { ...article, subcategory_slug: targetSlug };
		newMap[targetGroupId] = [...newMap[targetGroupId], movedArticle];
		dndArticleMap = newMap;

		// Re-index sort orders
		const allChanged = Object.entries(newMap).flatMap(([gid, items]) => {
			const slug = groupIdToSlug(gid);
			return items.map((a, i) => ({ id: a.id, sort_order: i, subcategory_slug: slug }));
		});
		document.getElementById('reorder-articles-payload').value = JSON.stringify(allChanged);
		document.getElementById('reorder-articles-form').requestSubmit();
	}

	const FLIP_MS = 200;
	const seoTitle = $derived.by(() => cleanSeoText(data.category.name || 'Learn Category'));
	const seoDescription = $derived.by(() =>
		limitSeoText(
			data.category.description ||
				`Browse ${seoTitle} guides in the 3 Feet Please knowledge library.`,
			165
		)
	);
	const seoCanonical = $derived(buildCanonicalUrl(page.url));
	const seoStructuredData = $derived.by(() => {
		const breadcrumbs = {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Learn',
					item: buildAbsoluteUrl(page.url.origin, '/learn')
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: seoTitle,
					item: seoCanonical
				}
			]
		};
		const collection = {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: seoTitle,
			description: seoDescription,
			url: seoCanonical,
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: articles.length,
				itemListElement: articles.map((article, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					name: article.title,
					url: buildAbsoluteUrl(page.url.origin, `/learn/${article.slug}`)
				}))
			}
		};
		return toJsonLd([breadcrumbs, collection]);
	});
</script>

<svelte:head>
	<title>{seoTitle} · Learn · 3 Feet Please</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="3 Feet Please" />
	<meta property="og:title" content={`${seoTitle} · Learn · 3 Feet Please`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={seoCanonical} />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={`${seoTitle} · Learn · 3 Feet Please`} />
	<meta name="twitter:description" content={seoDescription} />

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<!-- ── Article card snippet ───────────────────────────────────────────── -->
{#snippet articleCard(article, index = 0)}
	<div
		class="group bg-surface-950 text-surface-50 border-surface-800 hover:bg-primary-500 hover:text-surface-950 relative flex h-full flex-col justify-between border-2 transition"
	>
		{#if isReordering}
			<div
				class="bg-tertiary-500 text-surface-950 border-surface-950 flex cursor-grab items-center gap-2 border-b-2 px-4 py-2 text-xs font-black tracking-wider uppercase active:cursor-grabbing"
			>
				<IconGripVertical class="h-4 w-4" />
				<span>Drag to reorder</span>
			</div>
		{/if}

		<a
			href={`/learn/${article.slug}`}
			class="flex flex-1 flex-col justify-between hover:no-underline"
		>
			{#if article.cover_image_url}
				<div class="border-surface-800 aspect-[16/9] overflow-hidden border-b-2">
					<img
						class="h-full w-full object-cover"
						src={article.cover_image_url}
						alt={article.title}
					/>
				</div>
			{/if}
			<div class="flex flex-1 flex-col justify-between gap-6 p-6">
				<div class="flex flex-col gap-3">
					<span
						class="text-tertiary-500 group-hover:text-secondary-500 text-3xl leading-none font-black italic tabular-nums"
					>
						{String(index + 1).padStart(2, '0')}
					</span>
					<h3
						class="text-surface-50! group-hover:text-surface-950! m-0 text-xl leading-tight font-black uppercase sm:text-2xl"
					>
						{article.title}
					</h3>
					<p
						class="text-surface-300 group-hover:text-surface-950 m-0 line-clamp-3 text-sm leading-relaxed"
					>
						{article.summary || 'Open the article to read the full guide.'}
					</p>
				</div>
				<div
					class="border-surface-800 group-hover:border-surface-950/30 flex items-center justify-between gap-3 border-t pt-4 text-xs font-bold tracking-wider uppercase"
				>
					<div class="flex items-center gap-1.5">
						<IconClock3 class="h-4 w-4" />
						{formatDate(article.updated_at)}
					</div>
					<span class="inline-flex items-center gap-1.5 font-black">
						Read
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</span>
				</div>
			</div>
		</a>

		<!-- Reorder controls (drag hint + Move-to dropdown) -->
		{#if isReordering}
			<div class="border-surface-800 bg-surface-900 text-surface-50 border-t-2 p-3">
				<div
					class="text-primary-500 mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
				>
					<IconGripVertical class="h-3.5 w-3.5" />
					<span>Drag between sections to move</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-surface-300 text-xs font-black tracking-widest uppercase">Move to</span>
					<select
						class="border-surface-50 bg-surface-950 text-surface-50 flex-1 border-2 px-2 py-1 text-xs font-bold uppercase"
						onchange={(e) => assignSubcategory(article.id, e.target.value)}
					>
						<option value="" selected={!article.subcategory_slug}>General</option>
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
{/snippet}

<div class="flex flex-col">
	<!-- ═══════════════════════════════════════════════
	     HERO
	═══════════════════════════════════════════════ -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]"
	>
		<div
			class="flex flex-col justify-between gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center gap-2">
				<a
					href="/learn"
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center gap-2 border-2 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase transition hover:no-underline"
				>
					<IconBookOpen class="h-3.5 w-3.5" />
					Learn Library
				</a>
				<span class="text-xs font-black" aria-hidden="true">/</span>
				<span
					class="bg-surface-950 text-primary-500 inline-flex items-center gap-2 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					<IconFolderOpen class="h-3.5 w-3.5" />
					{data.category.name}
				</span>
			</div>

			<div class="flex flex-col gap-5">
				<h1
					class="text-surface-950! m-0 text-[clamp(2.6rem,6.5vw,6rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					{data.category.name}
				</h1>
				{#if data.category.description}
					<p class="m-0 max-w-xl text-lg leading-snug font-medium sm:text-2xl">
						{data.category.description}
					</p>
				{:else}
					<p class="m-0 max-w-xl text-lg leading-snug font-medium sm:text-2xl">
						Guides, references, and community-edited resources for this topic area.
					</p>
				{/if}
			</div>

			<div class="flex flex-wrap gap-3">
				<a
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					href="/learn/new"
				>
					<IconPlus class="h-4 w-4" />
					Create article
				</a>
				{#if data.canEdit}
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 border-[3px] px-7 py-4 text-sm font-black tracking-wide uppercase transition {isReordering
							? 'bg-tertiary-500 border-surface-950 text-surface-950'
							: 'border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500'}"
						onclick={isReordering ? exitReorderMode : enterReorderMode}
					>
						<IconGripVertical class="h-4 w-4" />
						{isReordering ? 'Done reordering' : 'Reorder content'}
					</button>
				{/if}
			</div>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-col justify-between gap-8 border-t-[3px] px-6 py-10 sm:px-10 lg:border-t-0 lg:border-l-[3px] lg:px-12 lg:py-14"
		>
			<div class="border-surface-950 grid grid-cols-2 border-2">
				{#each [{ icon: IconBookOpen, label: 'Articles', value: totalArticles }, { icon: IconLayersThree, label: 'Subcategories', value: totalSubcategories }] as stat, i}
					<div
						class="border-surface-950 flex flex-col justify-between gap-4 p-5 {i > 0
							? 'border-l-2'
							: ''}"
					>
						<div class="flex items-center gap-2 text-xs font-black tracking-[0.2em] uppercase">
							<stat.icon class="h-4 w-4" />
							{stat.label}
						</div>
						<div class="text-5xl leading-none font-black italic tabular-nums sm:text-6xl">
							{String(stat.value).padStart(2, '0')}
						</div>
					</div>
				{/each}
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex items-center gap-2 text-xs font-black tracking-[0.22em] uppercase">
					<IconSearch class="h-4 w-4" />
					Search this category
				</div>
				<div class="relative">
					<IconSearch
						class="text-surface-950 pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2"
					/>
					<input
						bind:value={searchQuery}
						class="bg-surface-50 text-surface-950 placeholder:text-surface-950/60 border-surface-950 h-14 w-full border-[3px] pr-4 pl-12 text-base font-bold focus:outline-none"
						type="search"
						placeholder="Find an article…"
						aria-label="Search this category"
					/>
				</div>
				{#if searchQuery.trim()}
					<p class="m-0 text-xs font-black tracking-wider uppercase">
						{filteredArticles.length}
						{filteredArticles.length === 1 ? 'result' : 'results'} in {data.category.name}
					</p>
				{/if}
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     NAVIGATOR & SUBCATEGORY FILTER BAND
	═══════════════════════════════════════════════ -->
	<div class="bg-secondary-500 text-surface-50 px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
		<div class="flex flex-col gap-6">
			<LearnNavigator />

			{#if data.canEdit}
				<details class="border-surface-50 bg-surface-950 text-surface-50 border-2">
					<summary
						class="hover:bg-primary-500 hover:text-surface-950 flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-xs font-black tracking-[0.2em] uppercase transition [&::-webkit-details-marker]:hidden"
					>
						<IconSparkles class="h-4 w-4" />
						<span>Add subcategory</span>
					</summary>
					<div class="border-surface-800 border-t-2 p-5">
						<form
							method="POST"
							action="?/createSubcategory"
							use:enhance
							class="flex max-w-md flex-col gap-3 sm:flex-row"
						>
							<input
								type="text"
								name="name"
								class="border-surface-50 bg-surface-950 text-surface-50 placeholder:text-surface-300 h-12 w-full border-2 px-4 text-sm font-bold focus:outline-none"
								placeholder="e.g. Response Templates"
								required
							/>
							<button
								type="submit"
								class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex h-12 shrink-0 items-center justify-center gap-2 px-6 text-xs font-black tracking-wider uppercase transition"
							>
								<IconPlus class="h-4 w-4" />
								Add
							</button>
						</form>
						{#if form?.error}
							<p class="bg-tertiary-500 text-surface-950 m-0 mt-3 px-4 py-2 text-sm font-bold">
								{form.error}
							</p>
						{/if}
					</div>
				</details>
			{/if}

			{#if subcategories.length > 0}
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						class="px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition {activeSubcategory ===
						'all'
							? 'bg-primary-500 text-surface-950'
							: 'bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950'}"
						onclick={() => (activeSubcategory = 'all')}
					>
						All
					</button>
					{#if groups.some((g) => !g.subcategory && g.articles.length > 0)}
						<button
							type="button"
							class="px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition {activeSubcategory ===
							'uncategorized'
								? 'bg-primary-500 text-surface-950'
								: 'bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950'}"
							onclick={() => (activeSubcategory = 'uncategorized')}
						>
							General
						</button>
					{/if}
					{#each subcategories as sub}
						<button
							type="button"
							class="px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition {activeSubcategory ===
							sub.slug
								? 'bg-primary-500 text-surface-950'
								: 'bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950'}"
							onclick={() => (activeSubcategory = sub.slug)}
						>
							{sub.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════
	     REORDER HINT BANNER
	═══════════════════════════════════════════════ -->
	{#if isReordering}
		<div
			class="bg-tertiary-500 text-surface-950 flex items-center gap-3 px-6 py-4 text-sm font-bold sm:px-10 lg:px-14"
		>
			<IconGripVertical class="h-5 w-5 shrink-0" />
			<span>
				Drag <strong>article cards</strong> within or <em>between</em> sections to reorder and
				reassign them · Drag <strong>section headers</strong> to reorder subcategories.
			</span>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     ARTICLE GROUPS
	═══════════════════════════════════════════════ -->
	<div class="bg-surface-950 flex flex-col gap-16 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
		{#if isReordering && activeSubcategory === 'all'}
			<!-- Uncategorized: always render the DnD zone -->
			{#each groups.filter((g) => !g.subcategory) as group (group.id)}
				{@const artItems = dndArticleMap[group.id] ?? []}
				<section class="flex flex-col gap-6">
					<div class="border-surface-50 flex items-center gap-4 border-b-2 pb-4">
						<span class="bg-primary-500 h-4 w-4 shrink-0" aria-hidden="true"></span>
						<div>
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Category
							</p>
							<h2 class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl">
								General
							</h2>
						</div>
					</div>
					<div
						use:dndzone={{ items: artItems, flipDurationMs: FLIP_MS, type: 'article' }}
						onconsider={(e) => handleArticleConsider(group.id, e)}
						onfinalize={(e) => handleArticleFinalize(group.id, e)}
						class={artItems.length > 0
							? 'dnd-article-zone grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
							: 'dnd-empty-zone'}
					>
						{#each artItems as article, idx (article.id)}
							<div animate:flip={{ duration: FLIP_MS }}>
								{@render articleCard(article, idx)}
							</div>
						{/each}
						{#if artItems.length === 0}
							<div class="dnd-empty-placeholder" aria-hidden="true">Drop articles here</div>
						{/if}
					</div>
				</section>
			{/each}

			<!-- ── Subcategory groups: draggable ── -->
			{#if dndSubGroups.length > 0}
				<div
					use:dndzone={{ items: dndSubGroups, flipDurationMs: FLIP_MS, type: 'subgroup' }}
					onconsider={handleGroupConsider}
					onfinalize={handleGroupFinalize}
					class="dnd-group-zone flex flex-col gap-16"
				>
					{#each dndSubGroups as groupItem (groupItem.id)}
						{@const artItems = dndArticleMap[groupItem.id] ?? []}
						{@const isEmpty = artItems.length === 0}
						<section class="flex flex-col gap-6" animate:flip={{ duration: FLIP_MS }}>
							<!-- Draggable heading bar -->
							<div class="border-surface-50 flex items-center gap-4 border-b-2 pb-4">
								<div class="dnd-drag-handle" title="Drag to reorder subcategory">
									<IconGripVertical class="h-5 w-5" />
								</div>
								<span class="bg-tertiary-500 h-4 w-4 shrink-0" aria-hidden="true"></span>
								<div class="flex-1">
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Subcategory
									</p>
									<h2 class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl">
										{groupItem.sub.name}
									</h2>
								</div>
								<!-- Delete button (only when empty) -->
								{#if isEmpty}
									<button
										type="button"
										class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 inline-flex items-center gap-2 px-4 py-2 text-xs font-black tracking-wider uppercase transition"
										title="Delete empty subcategory"
										onclick={() => {
											document.getElementById('delete-subcategory-slug').value = groupItem.id;
											document.getElementById('delete-subcategory-form').requestSubmit();
										}}
									>
										<IconTrash2 class="h-4 w-4" />
										<span>Delete</span>
									</button>
								{/if}
							</div>

							<!-- Articles within this subcategory — always a live DnD zone -->
							<div
								use:dndzone={{ items: artItems, flipDurationMs: FLIP_MS, type: 'article' }}
								onconsider={(e) => handleArticleConsider(groupItem.id, e)}
								onfinalize={(e) => handleArticleFinalize(groupItem.id, e)}
								class={artItems.length > 0
									? 'dnd-article-zone grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
									: 'dnd-empty-zone'}
							>
								{#each artItems as article, idx (article.id)}
									<div animate:flip={{ duration: FLIP_MS }}>
										{@render articleCard(article, idx)}
									</div>
								{/each}
								{#if artItems.length === 0}
									<div class="dnd-empty-placeholder" aria-hidden="true">Drop articles here</div>
								{/if}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- ── Normal / filtered view ── -->
			{#each visibleGroups as group, groupIndex (group.id)}
				<section class="flex flex-col gap-6">
					<div class="border-surface-50 flex items-end justify-between gap-4 border-b-2 pb-4">
						<div class="flex items-center gap-4">
							<span
								class="bg-tertiary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center text-lg font-black italic tabular-nums"
								aria-hidden="true"
							>
								{String(groupIndex + 1).padStart(2, '0')}
							</span>
							<div>
								{#if group.subcategory}
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Subcategory
									</p>
									<h2
										class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
									>
										{group.subcategory.name}
									</h2>
								{:else}
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Category
									</p>
									<h2
										class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
									>
										General
									</h2>
								{/if}
							</div>
						</div>
						<span class="text-tertiary-500 text-sm font-black uppercase italic tabular-nums">
							{group.articles.length}
							{group.articles.length === 1 ? 'guide' : 'guides'}
						</span>
					</div>

					{#if group.articles.length > 0}
						<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{#each group.articles as article, articleIndex (article.id ?? article.slug)}
								{@render articleCard(article, articleIndex)}
							{/each}
						</div>
					{:else}
						<div class="border-surface-800 text-surface-300 border-2 p-6 text-sm font-medium">
							No articles in this section yet.
						</div>
					{/if}
				</section>
			{/each}
		{/if}

		{#if visibleGroups.length === 0}
			<div class="border-surface-50 flex flex-col items-start gap-5 border-t-2 pt-10">
				<span class="bg-primary-500 text-surface-950 flex h-14 w-14 items-center justify-center">
					<IconBookOpen class="h-7 w-7" />
				</span>
				<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">No articles found</h3>
				<p class="text-surface-300 m-0 max-w-md text-base leading-relaxed">
					Try clearing your search, or create the first guide for this category.
				</p>
				<div class="flex flex-wrap gap-3 pt-2">
					{#if searchQuery}
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 border-2 px-6 py-3 text-sm font-black uppercase transition"
							onclick={() => (searchQuery = '')}
						>
							Clear search
						</button>
					{/if}
					<a
						class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-6 py-3 text-sm font-black uppercase transition hover:no-underline"
						href="/learn/new"
					>
						<IconPlus class="h-4 w-4" />
						Create article
					</a>
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

<form
	id="delete-subcategory-form"
	method="POST"
	action="?/deleteSubcategory"
	use:enhance={() =>
		async ({ update }) => {
			exitReorderMode();
			await update();
		}}
	class="hidden"
>
	<input type="hidden" name="slug" id="delete-subcategory-slug" />
</form>

<style>
	/* ── DnD ── */
	.dnd-group-zone {
		outline: none;
	}

	.dnd-article-zone {
		outline: none;
		min-height: 80px;
	}

	.dnd-drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		cursor: grab;
		color: var(--color-surface-950);
		background: var(--color-primary-500);
		flex-shrink: 0;
	}

	.dnd-drag-handle:active {
		cursor: grabbing;
	}

	.dnd-empty-zone {
		outline: none;
		min-height: 110px;
		border: 2px dashed var(--color-primary-500);
		background: var(--color-surface-900);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.dnd-empty-placeholder {
		font-size: 0.8rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-primary-500);
		pointer-events: none;
		user-select: none;
	}
</style>
