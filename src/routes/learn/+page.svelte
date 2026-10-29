<script>
	import LearnNavigator from '#lib/components/learn/LearnNavigator.svelte';

	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import { optimizedImageUrl } from '#lib/media/optimized';

	const { data } = $props();

	let search = $state('');
	let category = $state('all');

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
	const filteredArticles = $derived(
		articles.filter((article) => {
			const query = search.trim().toLowerCase();
			const matchesCategory = category === 'all' || article.category_name === category;
			const haystack = [article.title, article.summary, article.category_name]
				.filter(Boolean)
				.join(' ');
			return matchesCategory && (!query || haystack.toLowerCase().includes(query));
		})
	);

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
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]"
	>
		<div
			class="flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p
				class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<IconBookOpen class="h-4 w-4" />
				<span>The shared field guide</span>
			</p>

			<div class="flex flex-col gap-6">
				<h1
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.4vw,6.5rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					A little knowledge. <span class="text-secondary-500">A better ride.</span>
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					Practical guides for safer cycling and stronger communities. Find an answer, learn
					something new, or share what you know.
				</p>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<a
					href="/learn/new"
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					<IconPlus class="h-5 w-5" /> Write a guide
					<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
				</a>
				<a
					href="#library"
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					Browse {articles.length} guides
				</a>
			</div>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 relative flex flex-col justify-between gap-8 border-t-[3px] px-6 py-10 sm:px-10 lg:border-t-0 lg:border-l-[3px] lg:px-12 lg:py-14"
		>
			<div class="flex items-start justify-between gap-4">
				<span class="text-xs font-black tracking-[0.22em] uppercase">Field index</span>
				<span
					class="text-6xl leading-[0.8] font-black tracking-tighter italic tabular-nums sm:text-7xl"
				>
					{String(articles.length).padStart(2, '0')}
				</span>
			</div>

			<div class="flex flex-col gap-3">
				<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">Browse by topic</p>
				<div class="border-surface-950 flex flex-col border-t-2">
					{#each categoryPairs as [catName, catSlug], idx (catSlug)}
						<a
							href={`/learn/category/${catSlug}`}
							class="group border-surface-950/30 hover:bg-surface-950 hover:text-primary-500 flex items-center justify-between gap-3 border-b py-3 pr-2 transition hover:px-3 hover:no-underline"
						>
							<span class="flex min-w-0 items-center gap-3">
								<span class="text-sm font-black italic tabular-nums">
									{String(idx + 1).padStart(2, '0')}
								</span>
								<span class="truncate text-base font-black uppercase">{catName}</span>
							</span>
							<IconArrowUpRight
								class="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
							/>
						</a>
					{/each}
				</div>
			</div>

			<!-- 3-foot ruler band -->
			<div class="border-surface-950 grid grid-cols-3 border-t-[3px] pt-2" aria-hidden="true">
				{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
					<div class="border-surface-950 relative h-8 border-l-2 pl-2 first:border-l-0 first:pl-0">
						<span class="text-xs font-black uppercase">{mark}</span>
						{#if i === 2}
							<span class="absolute top-0 right-0 text-xs font-black uppercase">3 ft</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</header>

	<!-- SEARCH & FILTER BAND -->
	<div
		id="library"
		class="bg-secondary-500 text-surface-50 scroll-mt-20 px-6 py-10 sm:px-10 lg:px-14 lg:py-12"
	>
		<div class="flex flex-col gap-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Search & filter the library
				</p>
				{#if search || category !== 'all'}
					<button
						type="button"
						class="bg-primary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-wide uppercase"
						onclick={() => {
							search = '';
							category = 'all';
						}}
					>
						Reset filters
					</button>
				{/if}
			</div>

			<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
				<label class="relative block min-w-0">
					<span
						class="text-surface-950 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
					>
						<IconSearch class="h-5 w-5" />
					</span>
					<input
						bind:value={search}
						class="bg-surface-50 text-surface-950 placeholder:text-surface-950/60 border-surface-950 h-14 w-full border-[3px] pr-4 pl-12 text-base font-bold focus:outline-none"
						type="search"
						aria-label="Search articles"
						placeholder="Search the field guide…"
					/>
				</label>
				<select
					bind:value={category}
					class="bg-surface-950 text-primary-500 border-surface-950 h-14 border-[3px] px-4 text-sm font-black tracking-wide uppercase focus:outline-none"
					aria-label="Filter by category"
				>
					<option value="all">All topics</option>
					{#each categories as option}<option value={option}>{option}</option>{/each}
				</select>
			</div>

			<LearnNavigator />
		</div>
	</div>

	<!-- ARTICLES DIRECTORY -->
	<section
		class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-labelledby="library-heading"
	>
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
			<div class="flex flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					The library
				</p>
				<h2
					id="library-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Find your next read
				</h2>
			</div>
			<p
				class="text-tertiary-500 m-0 text-lg font-black tracking-wide uppercase italic tabular-nums"
				aria-live="polite"
			>
				{filteredArticles.length}
				{filteredArticles.length === 1 ? 'article' : 'articles'}
			</p>
		</div>

		<!-- Lane divider -->
		<div
			class="my-8 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)] lg:my-10"
			aria-hidden="true"
		></div>

		{#if filteredArticles.length}
			<div class="border-surface-50 grid border-t-2 border-l-2 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredArticles as article, index (article.id ?? article.slug)}
					<a
						class="group bg-surface-950 text-surface-50 border-surface-800 hover:bg-primary-500 hover:text-surface-950 flex h-full flex-col justify-between border-r-2 border-b-2 transition hover:no-underline"
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
									class="bg-primary-500 text-surface-950 group-hover:bg-surface-950 group-hover:text-primary-500 absolute top-0 left-0 px-3 py-1.5 text-xs font-black tracking-[0.2em] uppercase"
								>
									{article.category_name}
								</span>
							</div>
						{/if}
						<div class="flex flex-1 flex-col justify-between gap-6 p-6 sm:p-7">
							<div class="flex flex-col gap-4">
								<div class="flex items-baseline justify-between gap-3">
									<span
										class="text-tertiary-500 group-hover:text-secondary-500 text-3xl leading-none font-black italic tabular-nums"
									>
										{String(index + 1).padStart(2, '0')}
									</span>
									{#if !article.cover_image_url}
										<span
											class="bg-secondary-500 text-surface-50 group-hover:bg-surface-950 group-hover:text-primary-500 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase"
										>
											{article.category_name}
										</span>
									{/if}
								</div>
								<h3
									class="text-surface-50! group-hover:text-surface-950! m-0 text-2xl leading-tight font-black uppercase"
								>
									{article.title}
								</h3>
								<p
									class="text-surface-300 group-hover:text-surface-950 m-0 line-clamp-3 text-sm leading-relaxed"
								>
									{article.summary || 'Open the article to read the full guide and discussion.'}
								</p>
							</div>
							<div
								class="border-surface-800 group-hover:border-surface-950/30 flex items-center justify-between gap-3 border-t pt-4 text-xs font-bold tracking-wider uppercase"
							>
								<span class="flex items-center gap-2">
									<IconClock3 class="h-4 w-4" />
									{formatDate(article.updated_at)}
								</span>
								<span class="flex items-center gap-1.5 font-black">
									Read
									<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="border-surface-50 flex flex-col items-start gap-4 border-t-2 pt-8">
				<p class="text-surface-50 m-0 text-2xl font-black uppercase italic">
					No articles match that filter.
				</p>
				<p class="text-surface-300 m-0 text-base">Try a broader search or explore all topics.</p>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 px-7 py-4 text-sm font-black tracking-wide uppercase transition"
					onclick={() => {
						search = '';
						category = 'all';
					}}
				>
					Clear filters
				</button>
			</div>
		{/if}
	</section>
</div>
