<script>
	import CinematicHero from '$lib/components/landing/CinematicHero.svelte';
	import DiscoveryToolbar from '$lib/components/landing/DiscoveryToolbar.svelte';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';

	const { data } = $props();

	let search = $state('');
	let category = $state('all');

	const articles = $derived(data?.articles ?? []);
	const categories = $derived(
		Array.from(new Set(articles.map((article) => article.category_name).filter(Boolean))).sort()
	);
	const heroArticle = $derived(articles.find((article) => article.cover_image_url) ?? null);
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

<div class="mx-auto flex w-full max-w-7xl flex-col gap-12 sm:gap-16">
	<CinematicHero
		eyebrow="The shared field guide"
		title="Knowledge that makes every ride safer."
		description="Practical crash guidance, organizing playbooks, and lessons from people building better streets. Read what works, improve what is weak, and share what your community learns."
		icon={IconBookOpen}
		imageUrl={heroArticle?.cover_image_url}
		imageAlt={heroArticle ? heroArticle.title : ''}
		stats={[
			{ value: articles.length, label: 'Articles' },
			{ value: categories.length, label: 'Categories' },
			{ value: 'Open', label: 'Community edited' }
		]}
	>
		{#snippet actions()}
			<a class="btn preset-filled-primary-500 gap-2" href="#library">
				Browse the library <IconArrowRight class="h-4 w-4" />
			</a>
			<a class="btn preset-tonal-surface gap-2 backdrop-blur-md" href="/learn/new">
				<IconPlus class="h-4 w-4" /> Add what you know
			</a>
		{/snippet}
	</CinematicHero>

	<DiscoveryToolbar
		eyebrow="Library"
		title="Find the guidance you need"
		description="Search by topic or narrow the field by category."
		icon={IconSearch}
	>
		<div id="library" class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
			<label class="input-group grid-cols-[auto_1fr]">
				<span class="ig-cell"><IconSearch class="h-4 w-4 opacity-60" /></span>
				<input bind:value={search} class="ig-input" type="search" placeholder="Search articles" />
			</label>
			<select bind:value={category} class="select">
				<option value="all">All categories</option>
				{#each categories as option}<option value={option}>{option}</option>{/each}
			</select>
		</div>
	</DiscoveryToolbar>

	<section class="space-y-6" aria-labelledby="library-heading">
		<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
			<div>
				<p class="text-xs font-black tracking-[0.2em] uppercase opacity-55">Working knowledge</p>
				<h2 id="library-heading" class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
					Explore the collection
				</h2>
			</div>
			<p class="text-sm tabular-nums opacity-60">
				{filteredArticles.length}
				{filteredArticles.length === 1 ? 'article' : 'articles'}
			</p>
		</div>

		{#if filteredArticles.length}
			<div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredArticles as article}
					<a
						class="group preset-tonal-surface flex h-full flex-col overflow-hidden transition hover:-translate-y-1"
						href={`/learn/${article.slug}`}
					>
						{#if article.cover_image_url}
							<img
								class="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
								src={article.cover_image_url}
								alt={article.title}
								loading="lazy"
							/>
						{/if}
						<div class="flex flex-1 flex-col p-5">
							<div class="flex flex-wrap gap-2">
								<span class="chip preset-tonal-primary">{article.category_name}</span><span
									class="chip preset-tonal-surface"
									><IconHistory class="h-3.5 w-3.5" /> v{article.last_revision_number}</span
								>
							</div>
							<h3 class="mt-5 text-xl leading-tight font-black">{article.title}</h3>
							<p class="mt-3 line-clamp-3 text-sm leading-relaxed opacity-70">
								{article.summary || 'Open the article to read the full guide and discussion.'}
							</p>
							<div class="mt-auto flex items-center justify-between gap-3 pt-6 text-sm opacity-65">
								<span class="flex items-center gap-2"
									><IconClock3 class="h-4 w-4" /> {formatDate(article.updated_at)}</span
								><span class="flex items-center gap-1 font-bold"
									>Read <IconArrowRight
										class="h-4 w-4 transition group-hover:translate-x-0.5"
									/></span
								>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="preset-tonal-surface p-8 text-center">
				<p class="text-lg font-bold">No articles match that filter.</p>
				<p class="mt-2 opacity-65">Try another category or create a new guide.</p>
			</div>
		{/if}
	</section>
</div>
