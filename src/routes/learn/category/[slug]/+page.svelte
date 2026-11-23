<script>
	import LearnNavigator from '#lib/components/learn/LearnNavigator.svelte';
	import PositionAssignmentBar from '#lib/components/ui/PositionAssignmentBar.svelte';
	import { reassignAndOrderLearnArticles, reorderListItem } from '#lib/ui/formControlHelpers';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconLayersThree from '@lucide/svelte/icons/layers';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash2 from '@lucide/svelte/icons/trash';
	import { tick } from 'svelte';
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

	// Mutable local copies used for deterministic ordering
	let subcategories = $state([]);
	let articles = $state([]);
	let reorderAnnouncement = $state('');

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

	function returnToControl(event, id) {
		const target = document.getElementById(id);
		if (!target) return;
		event.preventDefault();
		window.history.replaceState(null, '', `#${id}`);
		target.scrollIntoView({ block: 'start' });
		target.focus({ preventScroll: true });
	}

	const sectionOptions = $derived([
		{ value: '', label: 'General' },
		...subcategories.map((sub) => ({ value: sub.slug, label: sub.name }))
	]);

	async function restoreControlFocus(focusKey) {
		if (!focusKey) return;
		await tick();
		let el = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
		if (el?.disabled) {
			const fallbackKey = focusKey.endsWith('-up')
				? focusKey.replace(/-up$/, '-down')
				: focusKey.endsWith('-down')
					? focusKey.replace(/-down$/, '-up')
					: focusKey;
			const fallback = document.querySelector(`[data-focus-key="${CSS.escape(fallbackKey)}"]`);
			if (fallback && !fallback.disabled) {
				el = fallback;
			} else {
				const posKey = focusKey.replace(/-(up|down|group)$/, '-pos');
				el = document.querySelector(`[data-focus-key="${CSS.escape(posKey)}"]`);
			}
		}
		el?.focus?.();
	}

	function enterReorderMode() {
		searchQuery = '';
		activeSubcategory = 'all';
		isReordering = true;
		reorderAnnouncement =
			'Reorder mode active. Use Position, Section, Move up, and Move down controls to organize guides and subcategories.';
	}

	function exitReorderMode() {
		isReordering = false;
		reorderAnnouncement = 'Exited reorder mode.';
	}

	function moveSubcategory(slug, targetIndex, focusKey = '') {
		const fromIndex = subcategories.findIndex((sub) => sub.slug === slug);
		if (fromIndex === -1) return;
		const nextOrder = reorderListItem(subcategories, fromIndex, targetIndex).map((sub, idx) => ({
			...sub,
			sort_order: idx
		}));
		subcategories = nextOrder;
		const movedIndex = nextOrder.findIndex((sub) => sub.slug === slug);
		const movedSub = nextOrder[movedIndex];
		if (movedSub) {
			reorderAnnouncement = `Moved section ${movedSub.name} to position ${movedIndex + 1} of ${nextOrder.length}.`;
		}
		document.getElementById('reorder-subcategories-payload').value = JSON.stringify(
			nextOrder.map((s) => ({ id: s.slug, sort_order: s.sort_order }))
		);
		document.getElementById('reorder-subcategories-form').requestSubmit();
		void restoreControlFocus(focusKey);
	}

	function moveArticleInSection(articleId, targetIndex, focusKey = '') {
		const result = reassignAndOrderLearnArticles(articles, subcategories, {
			articleId,
			targetIndex
		});
		if (!result.movedArticle) return;
		articles = result.articles;
		reorderAnnouncement = `Moved ${result.movedArticle.title} to position ${result.position} of ${result.sectionCount}.`;
		document.getElementById('reorder-articles-payload').value = JSON.stringify(result.payload);
		document.getElementById('reorder-articles-form').requestSubmit();
		void restoreControlFocus(focusKey);
	}

	function assignSubcategory(articleId, subcategorySlug, focusKey = '') {
		const result = reassignAndOrderLearnArticles(articles, subcategories, {
			articleId,
			targetSubcategorySlug: subcategorySlug
		});
		if (!result.movedArticle) return;
		articles = result.articles;
		const sectionLabel = result.sectionSlug
			? subcategories.find((sub) => sub.slug === result.sectionSlug)?.name || result.sectionSlug
			: 'General';
		reorderAnnouncement = `Moved ${result.movedArticle.title} to ${sectionLabel}, position ${result.position} of ${result.sectionCount}.`;
		document.getElementById('reorder-articles-payload').value = JSON.stringify(result.payload);
		document.getElementById('reorder-articles-form').requestSubmit();
		void restoreControlFocus(focusKey);
	}
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
{#snippet articleCard(article, index = 0, sectionCount = 1)}
	<div
		class="group bg-surface-950 text-surface-50 border-surface-800 hover:bg-primary-500 hover:text-surface-950 relative flex h-full flex-col justify-between border-2 transition"
	>
		<a
			href={`/learn/${article.slug}`}
			class="focus-visible:outline-primary-500 flex flex-1 flex-col justify-between hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
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

		<!-- Reorder controls (Position, Section, Move up / Move down) -->
		{#if isReordering}
			<div class="border-surface-800 bg-surface-900 text-surface-50 border-t-2 p-3">
				<PositionAssignmentBar
					itemLabel={article.title}
					{index}
					count={sectionCount}
					groups={sectionOptions}
					groupValue={article.subcategory_slug ?? ''}
					groupLabel="Section"
					focusKey={`article-${article.id}`}
					onPositionChange={(targetIdx, fk) => moveArticleInSection(article.id, targetIdx, fk)}
					onGroupChange={(nextSlug, fk) => assignSubcategory(article.id, nextSlug, fk)}
				/>
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
						aria-pressed={isReordering}
						class="focus-visible:outline-surface-950 inline-flex items-center justify-center gap-2 border-[3px] px-7 py-4 text-sm font-black tracking-wide uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 {isReordering
							? 'bg-tertiary-500 border-surface-950 text-surface-950'
							: 'border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500'}"
						onclick={isReordering ? exitReorderMode : enterReorderMode}
					>
						<IconArrowUpDown class="h-4 w-4" aria-hidden="true" />
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
		</div>
	</section>

	<div
		id="category-filters"
		class="bg-primary-500 text-surface-950 border-surface-950 flex flex-col gap-1 border-t-2 px-6 py-4 sm:px-10 lg:px-14"
	>
		<label
			for="category-search"
			class="flex items-center gap-2 text-xs font-black tracking-[0.22em] uppercase"
		>
			<IconSearch class="h-4 w-4" />
			Search this category
		</label>
		<div class="relative">
			<IconSearch
				class="text-surface-950 pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2"
			/>
			<input
				id="category-search"
				bind:value={searchQuery}
				class="bg-surface-50 text-surface-950 placeholder:text-surface-950/60 border-surface-950 focus-visible:outline-primary-500 h-11 w-full border-[3px] pr-4 pl-12 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
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
								class="border-surface-50 bg-surface-950 text-surface-50 placeholder:text-surface-300 focus-visible:outline-primary-500 h-12 w-full border-2 px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
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
			<IconArrowUpDown class="h-5 w-5 shrink-0" aria-hidden="true" />
			<span>
				Choose a <strong>Position</strong> or <strong>Section</strong>, or activate
				<strong>Move up</strong> and <strong>Move down</strong> on any guide card or subcategory header
				to update order immediately.
			</span>
		</div>
	{/if}

	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
		{reorderAnnouncement}
	</p>

	<!-- ═══════════════════════════════════════════════
	     ARTICLE GROUPS
	═══════════════════════════════════════════════ -->
	<div class="bg-surface-950 flex flex-col gap-16 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
		{#if isReordering && activeSubcategory === 'all'}
			{@const generalArticles = articles.filter((a) => !a.subcategory_slug)}
			<section class="flex flex-col gap-6" aria-labelledby="reorder-section-general">
				<div class="border-surface-50 flex items-center gap-4 border-b-2 pb-4">
					<span class="bg-primary-500 h-4 w-4 shrink-0" aria-hidden="true"></span>
					<div>
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Category
						</p>
						<h2
							id="reorder-section-general"
							class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl"
						>
							General
						</h2>
					</div>
				</div>
				{#if generalArticles.length > 0}
					<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{#each generalArticles as article, idx (article.id)}
							{@render articleCard(article, idx, generalArticles.length)}
						{/each}
					</div>
				{:else}
					<div
						class="border-surface-700 bg-surface-900 text-surface-300 border-2 p-6 text-sm font-bold"
					>
						No guides in General. Select General in any guide's Section menu to move it here.
					</div>
				{/if}
			</section>

			{#if subcategories.length > 0}
				<div class="flex flex-col gap-16">
					{#each subcategories as sub, subIndex (sub.slug)}
						{@const artItems = articles.filter((a) => a.subcategory_slug === sub.slug)}
						{@const isEmpty = artItems.length === 0}
						<section class="flex flex-col gap-6" aria-labelledby={`reorder-section-${sub.slug}`}>
							<div
								class="border-surface-50 flex flex-wrap items-end justify-between gap-4 border-b-2 pb-4"
							>
								<div class="flex items-center gap-4">
									<span class="bg-tertiary-500 h-4 w-4 shrink-0" aria-hidden="true"></span>
									<div>
										<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
											Subcategory
										</p>
										<h2
											id={`reorder-section-${sub.slug}`}
											class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-4xl"
										>
											{sub.name}
										</h2>
									</div>
								</div>

								<div class="flex flex-wrap items-end gap-3">
									<PositionAssignmentBar
										itemLabel={sub.name}
										index={subIndex}
										count={subcategories.length}
										positionLabel="Section position"
										focusKey={`subcategory-${sub.slug}`}
										onPositionChange={(targetIdx, fk) => moveSubcategory(sub.slug, targetIdx, fk)}
									/>

									{#if isEmpty}
										<button
											type="button"
											class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 min-w-9 items-center justify-center gap-2 px-4 text-xs font-black tracking-wider uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
											aria-label={`Delete empty subcategory ${sub.name}`}
											onclick={() => {
												document.getElementById('delete-subcategory-slug').value = sub.slug;
												document.getElementById('delete-subcategory-form').requestSubmit();
											}}
										>
											<IconTrash2 class="h-4 w-4" aria-hidden="true" />
											<span>Delete</span>
										</button>
									{/if}
								</div>
							</div>

							{#if artItems.length > 0}
								<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
									{#each artItems as article, idx (article.id)}
										{@render articleCard(article, idx, artItems.length)}
									{/each}
								</div>
							{:else}
								<div
									class="border-surface-700 bg-surface-900 text-surface-300 border-2 p-6 text-sm font-bold"
								>
									No guides in {sub.name}. Select {sub.name} in any guide's Section menu to move it here.
								</div>
							{/if}
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
								{@render articleCard(article, articleIndex, group.articles.length)}
							{/each}
						</div>
					{:else}
						<div class="border-surface-800 text-surface-300 border-2 p-6 text-sm font-medium">
							No articles in this section yet.
						</div>
					{/if}

					<div class="flex justify-end pt-2">
						<a
							href="#category-search"
							data-return-link="category-search"
							onclick={(event) => returnToControl(event, 'category-search')}
							class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
						>
							<IconArrowUp class="h-4 w-4 shrink-0" aria-hidden="true" />
							<span>Back to category search</span>
						</a>
					</div>
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
