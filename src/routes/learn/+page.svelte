<script>
	import { onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { afterNavigate, replaceState } from '$app/navigation';
	import LearnNavigator from '#lib/components/learn/LearnNavigator.svelte';
	import { buildLearnCardExcerpt } from '#lib/learn/readingAid';

	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import { page } from '$app/state';

	const { data } = $props();
	const authRequired = $derived(
		!data.currentUser?.id && page.url.searchParams.get('auth') === 'required'
	);

	let search = $state(untrack(() => data?.initialQuery ?? ''));
	let category = $state(untrack(() => data?.initialCategory || 'all'));
	let activeQuery = $state(untrack(() => data?.initialQuery ?? ''));
	let serverResults = $state(untrack(() => data?.initialSearchResults ?? null));
	let searching = $state(false);
	let searchError = $state('');

	const pageSize = 12;
	let visibleCount = $state(pageSize);
	let debounceTimer = null;
	let activeController = null;

	function clearPendingSearch() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (activeController) {
			activeController.abort();
			activeController = null;
		}
	}

	onDestroy(() => {
		clearPendingSearch();
	});

	function syncUrlParams(nextQuery, nextCategory) {
		if (!browser) return;
		const nextUrl = new URL(page.url);
		const trimmed = nextQuery.trim();
		if (trimmed) {
			nextUrl.searchParams.set('q', trimmed);
		} else {
			nextUrl.searchParams.delete('q');
		}
		if (nextCategory && nextCategory !== 'all') {
			nextUrl.searchParams.set('category', nextCategory);
		} else {
			nextUrl.searchParams.delete('category');
		}
		if (nextUrl.search !== page.url.search) {
			replaceState(nextUrl, page.state);
		}
	}

	async function runServerSearch(trimmedQuery) {
		syncUrlParams(trimmedQuery, category);
		const controller = new AbortController();
		activeController = controller;
		searching = true;
		searchError = '';

		try {
			const params = new URLSearchParams({ q: trimmedQuery });
			const response = await fetch(`/api/learn/search?${params.toString()}`, {
				signal: controller.signal
			});
			const payload = await response.json().catch(() => ({}));
			if (activeController !== controller) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to search the Learn library right now.');
			}
			serverResults = Array.isArray(payload?.articles) ? payload.articles : [];
			activeQuery = payload?.query ?? trimmedQuery;
		} catch (err) {
			if (err?.name === 'AbortError') return;
			if (activeController === controller) {
				searchError = err?.message || 'Unable to search the Learn library right now.';
			}
		} finally {
			if (activeController === controller) {
				searching = false;
				activeController = null;
			}
		}
	}

	function handleSearchChange(nextValue) {
		search = nextValue;
		visibleCount = pageSize;
		clearPendingSearch();

		const trimmed = nextValue.trim();
		if (!trimmed) {
			searching = false;
			searchError = '';
			activeQuery = '';
			serverResults = null;
			syncUrlParams('', category);
			return;
		}

		searching = true;
		searchError = '';
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			runServerSearch(trimmed);
		}, 250);
	}

	function handleCategoryChange(nextCategory) {
		category = nextCategory;
		visibleCount = pageSize;
		syncUrlParams(search, nextCategory);
	}

	function resetFilters() {
		clearPendingSearch();
		search = '';
		category = 'all';
		visibleCount = pageSize;
		searching = false;
		searchError = '';
		activeQuery = '';
		serverResults = null;
		syncUrlParams('', 'all');
	}

	afterNavigate(() => {
		const urlQuery = page.url.searchParams.get('q') ?? '';
		const urlCategory = page.url.searchParams.get('category') || 'all';
		if (urlCategory !== category) {
			category = urlCategory;
		}
		if (urlQuery !== search) {
			search = urlQuery;
			if (!urlQuery.trim()) {
				clearPendingSearch();
				searching = false;
				searchError = '';
				activeQuery = '';
				serverResults = null;
			} else if (data?.initialQuery === urlQuery && data?.initialSearchResults) {
				clearPendingSearch();
				searching = false;
				searchError = '';
				activeQuery = urlQuery;
				serverResults = data.initialSearchResults;
			} else {
				handleSearchChange(urlQuery);
			}
		}
	});

	const articles = $derived(data?.articles ?? []);
	const categories = $derived(
		Array.from(new Set(articles.map((article) => article.category_name).filter(Boolean))).sort()
	);
	const categoryPairs = $derived.by(() => {
		const map = new Map();
		for (const article of articles) {
			if (article.category_name && article.category_slug && !map.has(article.category_name)) {
				map.set(article.category_name, article.category_slug);
			}
		}
		return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
	});
	const hasActiveSearch = $derived(Boolean(search.trim()));
	const filteredArticles = $derived.by(() => {
		const source = hasActiveSearch && serverResults !== null ? serverResults : articles;
		return source.filter((article) => category === 'all' || article.category_name === category);
	});
	const statusAnnouncement = $derived.by(() => {
		if (searching) return 'Searching guides…';
		if (searchError) return searchError;
		const count = filteredArticles.length;
		const noun = count === 1 ? 'article' : 'articles';
		if (hasActiveSearch && activeQuery) {
			return `${count} matching ${noun} for “${activeQuery}”`;
		}
		return `${count} ${noun}`;
	});

	function formatDate(value) {
		if (!value) return 'Recently updated';
		return new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Learn · 3 Feet Please</title>
	<meta
		name="description"
		content="Collaborative wiki guides for bike safety, advocacy, and community organizing."
	/>
</svelte:head>

<div class="flex flex-col">
	{#if authRequired}
		<section
			class="bg-tertiary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10"
			aria-labelledby="learn-auth-heading"
		>
			<div class="flex flex-col gap-1">
				<h2 id="learn-auth-heading" class="m-0 text-xl font-black uppercase">
					Sign in to contribute a guide
				</h2>
				<p class="m-0 text-sm font-medium">After signing in, choose “Write a guide” to continue.</p>
			</div>
			<button
				type="button"
				class="bg-surface-950 text-primary-500 hover:bg-surface-50 inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase transition"
				onclick={() => window.dispatchEvent(new Event('open-login'))}
			>
				Log in / Register
			</button>
		</section>
	{/if}
	<!-- HERO -->
	<header
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]"
	>
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<div class="flex flex-col gap-3">
				<p
					class="text-primary-500 m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
					<IconBookOpen class="h-4 w-4" />
					<span>The shared field guide</span>
				</p>

				<h1
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					A little knowledge. <span class="text-primary-500">A better ride.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium text-balance">
					Practical guides for safer cycling and stronger communities. Find an answer, learn
					something new, or share what you know.
				</p>
			</div>

			<div
				class="border-surface-800 flex flex-wrap items-center justify-between gap-4 border-t pt-5"
			>
				<div class="flex flex-wrap gap-3">
					<a
						href="#library"
						class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						>Browse {articles.length} guides <IconArrowRight class="h-4 w-4" /></a
					>
					<a
						href="/learn/new"
						class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						><IconPlus class="h-4 w-4" /> Write a guide</a
					>
				</div>
			</div>
		</div>

		<div
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-tertiary-500 relative flex flex-col justify-between gap-5 border-t-4 px-6 py-7 sm:px-10 lg:border-l-2 lg:px-10 lg:py-8"
		>
			<div class="flex items-baseline justify-between gap-4">
				<span class="text-tertiary-500 text-xs font-black tracking-[0.22em] uppercase">
					Field index · Browse by topic
				</span>
				<span
					class="text-primary-500 text-3xl leading-none font-black tracking-tighter italic tabular-nums sm:text-4xl"
				>
					{String(articles.length).padStart(2, '0')}
				</span>
			</div>

			<div class="border-surface-800 flex flex-col border-t-2">
				{#each categoryPairs as [catName, catSlug], idx (catSlug)}
					<a
						href={`/learn/category/${catSlug}`}
						class="group border-surface-800 hover:bg-surface-950 flex items-center justify-between gap-3 border-b py-2.5 pr-2 transition hover:px-2 hover:no-underline"
					>
						<span class="flex min-w-0 items-center gap-3">
							<span class="text-tertiary-500 text-xs font-black italic tabular-nums">
								{String(idx + 1).padStart(2, '0')}
							</span>
							<span class="group-hover:text-primary-500 truncate text-sm font-black uppercase">
								{catName}
							</span>
						</span>
						<IconArrowUpRight
							class="text-primary-500 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						/>
					</a>
				{/each}
			</div>
		</div>
	</header>

	<!-- SEARCH & FILTER BAND -->
	<div
		id="library"
		class="bg-surface-900 text-surface-50 border-surface-800 sticky top-[var(--app-header-height)] z-10 scroll-mt-[var(--app-header-height)] border-b-2 px-4 py-2 sm:px-10 lg:px-12"
	>
		<div class="flex flex-col gap-4">
			<div
				class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto]"
			>
				<label class="relative col-span-2 block min-w-0 sm:col-span-1">
					<span
						class="text-surface-400 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
					>
						<IconSearch class="h-4 w-4" />
					</span>
					<input
						value={search}
						oninput={(event) => handleSearchChange(event.currentTarget.value)}
						class="bg-surface-950 text-surface-50 placeholder:text-surface-400 border-surface-500 focus:border-primary-500 focus-visible:outline-primary-500 h-11 w-full border-2 pr-4 pl-10 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
						type="search"
						aria-label="Search articles"
						placeholder="Search the field guide…"
					/>
				</label>
				<select
					value={category}
					onchange={(event) => handleCategoryChange(event.currentTarget.value)}
					class="bg-surface-950 text-surface-50 border-surface-500 focus:border-primary-500 focus-visible:outline-primary-500 h-11 min-w-0 border-2 px-3.5 text-xs font-black tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
					aria-label="Filter by category"
				>
					<option value="all">All topics</option>
					{#each categories as option}<option value={option}>{option}</option>{/each}
				</select>
				{#if search || category !== 'all'}
					<button
						type="button"
						class="bg-primary-500 text-surface-950 h-11 px-4 text-xs font-black tracking-wide uppercase"
						onclick={resetFilters}
					>
						Reset
					</button>
				{/if}
			</div>
			{#if searchError}
				<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-bold" role="alert">
					{searchError}
				</p>
			{/if}
		</div>
	</div>
	<div class="bg-surface-900 px-6 py-5 sm:px-10 lg:px-12">
		<LearnNavigator />
	</div>

	<div class="bg-surface-950 border-surface-800 border-b px-6 py-4 sm:px-10 lg:px-12">
		<a href="/learn/safer-cycling-better-messages" class="text-primary-500 font-bold underline"
			>Safer Cycling, Better Messages research report</a
		>
	</div>
	<!-- ARTICLES DIRECTORY -->
	<section
		class="bg-surface-950 px-6 py-10 sm:px-10 lg:px-12 lg:py-12"
		aria-labelledby="library-heading"
	>
		<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					The library
				</p>
				<h2
					id="library-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
				>
					Find your next read
				</h2>
			</div>
			<p
				class="text-tertiary-500 m-0 text-sm font-black tracking-wide uppercase italic tabular-nums"
				role="status"
				aria-live="polite"
				aria-busy={searching}
			>
				{statusAnnouncement}
			</p>
		</div>

		<!-- Lane divider -->
		<div
			class="my-6 h-1 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_48px,transparent_48px_80px)]"
			aria-hidden="true"
		></div>

		{#if filteredArticles.length}
			<div class="border-surface-800 grid border-t-2 border-l-2 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredArticles.slice(0, visibleCount) as article, index (article.id ?? article.slug)}
					<a
						class="group bg-surface-950 text-surface-50 border-surface-800 hover:bg-surface-900 flex h-full flex-col justify-between border-r-2 border-b-2 transition hover:no-underline"
						href={`/learn/${article.slug}`}
					>
						{#if article.cover_image_url}
							<div
								class="border-surface-800 relative aspect-[16/9] w-full overflow-hidden border-b-2"
							>
								<img
									class="h-full w-full object-cover"
									src={optimizedImageUrl(article.cover_image_url, {
										width: 768,
										height: 432,
										quality: 64
									})}
									alt={article.title}
									loading="lazy"
									width="768"
									height="432"
									decoding="async"
								/>
								<span
									class="bg-primary-500 text-surface-950 absolute top-0 left-0 px-3 py-1.5 text-xs font-black tracking-[0.2em] uppercase"
								>
									{article.category_name}
								</span>
							</div>
						{/if}
						<div class="flex flex-1 flex-col justify-between gap-5 p-6">
							<div class="flex flex-col gap-3">
								<div class="flex items-baseline justify-between gap-3">
									<span
										class="text-tertiary-500 group-hover:text-primary-500 text-2xl leading-none font-black italic tabular-nums"
									>
										{String(index + 1).padStart(2, '0')}
									</span>
									{#if !article.cover_image_url}
										<span
											class="bg-secondary-500 text-surface-50 px-2.5 py-1 text-xs font-black tracking-[0.18em] uppercase"
										>
											{article.category_name}
										</span>
									{/if}
								</div>
								<h3
									class="text-surface-50! group-hover:text-primary-500! m-0 text-xl leading-tight font-black uppercase sm:text-2xl"
								>
									{article.title}
								</h3>
								{#if hasActiveSearch && serverResults !== null && article.matched_snippet}
									{#if article.matched_heading && article.matched_heading.toLowerCase() !== 'overview'}
										<p class="text-tertiary-500 m-0 text-xs font-bold tracking-[0.18em] uppercase">
											Section · {article.matched_heading}
										</p>
									{/if}
									<p class="text-surface-300 m-0 line-clamp-3 text-sm leading-relaxed">
										{article.matched_snippet}
									</p>
								{:else}
									<p class="text-surface-300 m-0 line-clamp-3 text-sm leading-relaxed">
										{buildLearnCardExcerpt(article)}
									</p>
								{/if}
							</div>
							<div
								class="border-surface-800 flex items-center justify-between gap-3 border-t pt-4 text-xs font-bold tracking-wider uppercase"
							>
								<span class="text-surface-400 flex items-center gap-2">
									<IconClock3 class="h-4 w-4" />
									{formatDate(article.updated_at)}
								</span>
								<span class="text-primary-500 flex items-center gap-1.5 font-black">
									Read
									<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
			{#if visibleCount < filteredArticles.length}
				<button
					type="button"
					class="btn preset-tonal-primary mt-4 min-h-11"
					onclick={() => (visibleCount += pageSize)}>Show more articles</button
				>
			{/if}
		{:else}
			<div class="border-surface-50 flex flex-col items-start gap-4 border-t-2 pt-8">
				<p class="text-surface-50 m-0 text-2xl font-black uppercase italic">
					No articles match that filter.
				</p>
				<p class="text-surface-300 m-0 text-base">Try a broader search or explore all topics.</p>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 px-7 py-4 text-sm font-black tracking-wide uppercase transition"
					onclick={resetFilters}
				>
					Clear filters
				</button>
			</div>
		{/if}
	</section>
</div>
