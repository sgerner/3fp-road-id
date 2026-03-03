<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconMessageSquareText from '@lucide/svelte/icons/message-square-text';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconSparkles from '@lucide/svelte/icons/sparkles';

	const { data } = $props();

	let search = $state('');
	let category = $state('all');

	const articles = $derived(data?.articles ?? []);
	const categories = $derived(
		Array.from(new Set(articles.map((article) => article.category_name).filter(Boolean))).sort()
	);
	const filteredArticles = $derived(
		articles.filter((article) => {
			const query = search.trim().toLowerCase();
			const matchesCategory = category === 'all' || article.category_name === category;
			const haystack = [article.title, article.summary, article.category_name]
				.filter(Boolean)
				.join(' ');
			const matchesSearch = !query || haystack.toLowerCase().includes(query);
			return matchesCategory && matchesSearch;
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

<div class="mx-auto flex w-full max-w-7xl flex-col gap-8">
	<section
		class="learn-hero border-primary-500/20 bg-surface-950/60 relative overflow-hidden rounded-[2rem] border p-6 shadow-2xl lg:p-10"
	>
		<div class="learn-hero-orb learn-hero-orb-a"></div>
		<div class="learn-hero-orb learn-hero-orb-b"></div>
		<div class="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_22rem]">
			<div class="space-y-6">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-2 font-semibold">
						<IconBookOpen class="h-4 w-4" />
						Learn
					</span>
					<span class="chip preset-tonal-secondary">Wiki</span>
					<span class="chip preset-tonal-tertiary">
						<IconSparkles class="h-3.5 w-3.5" />
						Community edited
					</span>
				</div>

				<div class="space-y-4">
					<h1 class="learn-headline text-left text-4xl font-black tracking-tight lg:text-6xl">
						Field-tested bike advocacy knowledge, ready to reuse and refine.
					</h1>
					<p class="max-w-2xl text-base leading-7 opacity-80 lg:text-lg">
						This is the working library for safer streets: response guides, organizing playbooks,
						templates, and lessons from the field. Read what exists, improve what is weak, and add
						what your community has learned.
					</p>
				</div>

				<div class="flex flex-wrap gap-3">
					<a class="btn preset-filled-primary-500 gap-2" href="/learn/new">
						<IconPlus class="h-4 w-4" />
						Create article
					</a>
					<a class="btn preset-tonal-surface gap-2" href="#library">
						<IconArrowRight class="h-4 w-4" />
						Browse library
					</a>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
				<div class="border-surface-500/20 bg-surface-900/55 rounded-[1.5rem] border p-5">
					<p class="label">Articles</p>
					<p class="mt-2 text-3xl font-black">{articles.length}</p>
				</div>
				<div class="border-surface-500/20 bg-surface-900/55 rounded-[1.5rem] border p-5">
					<p class="label">Categories</p>
					<p class="mt-2 text-3xl font-black">{categories.length}</p>
				</div>
				<div class="border-surface-500/20 bg-surface-900/55 rounded-[1.5rem] border p-5">
					<p class="label">Collaboration</p>
					<div class="mt-3 flex items-center gap-2 text-sm opacity-80">
						<IconHistory class="h-4 w-4" />
						Version history
					</div>
					<div class="mt-2 flex items-center gap-2 text-sm opacity-80">
						<IconMessageSquareText class="h-4 w-4" />
						User comments
					</div>
				</div>
			</div>
		</div>
	</section>

	<section
		id="library"
		class="border-surface-500/20 bg-surface-950/45 rounded-[2rem] border p-5 shadow-xl lg:p-6"
	>
		<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div class="space-y-1">
				<p class="label">Library</p>
				<h2 class="text-left text-2xl font-bold">Search the knowledge base</h2>
			</div>

			<div class="grid gap-3 sm:grid-cols-[minmax(0,22rem)_12rem]">
				<label class="relative block">
					<span class="pointer-events-none absolute inset-y-0 left-4 flex items-center opacity-60">
						<IconSearch class="h-4 w-4" />
					</span>
					<input
						bind:value={search}
						class="input w-full rounded-full pl-11"
						type="search"
						placeholder="Search articles"
					/>
				</label>
				<select bind:value={category} class="select rounded-full">
					<option value="all">All categories</option>
					{#each categories as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
			{#each filteredArticles as article}
				<a
					class="group border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 flex h-full flex-col overflow-hidden rounded-[1.75rem] border transition hover:-translate-y-1 hover:shadow-2xl"
					href={`/learn/${article.slug}`}
				>
					{#if article.cover_image_url}
						<div class="aspect-[16/8] overflow-hidden">
							<img
								class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
								src={article.cover_image_url}
								alt={article.title}
							/>
						</div>
					{/if}

					<div class="flex flex-1 flex-col gap-4 p-5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="chip preset-tonal-primary">{article.category_name}</span>
							<span class="chip preset-tonal-surface">
								<IconHistory class="h-3.5 w-3.5" />
								v{article.last_revision_number}
							</span>
						</div>

						<div class="space-y-2">
							<h3 class="text-left text-xl font-bold">{article.title}</h3>
							<p class="min-h-24 text-sm leading-6 opacity-75">
								{article.summary || 'Open the article to read the full guide and discussion.'}
							</p>
						</div>

						<div class="mt-auto flex items-center justify-between gap-3 text-sm opacity-70">
							<div class="flex items-center gap-2">
								<IconClock3 class="h-4 w-4" />
								{formatDate(article.updated_at)}
							</div>
							<span class="inline-flex items-center gap-1 font-medium">
								Read
								<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-0.5" />
							</span>
						</div>
					</div>
				</a>
			{/each}
		</div>

		{#if !filteredArticles.length}
			<div class="border-surface-500/30 mt-8 rounded-[1.5rem] border border-dashed p-8 text-center">
				<p class="text-lg font-semibold">No articles match that filter.</p>
				<p class="mt-2 opacity-70">Try a different category or create a new guide.</p>
			</div>
		{/if}
	</section>
</div>

<style>
	.learn-hero-orb {
		position: absolute;
		border-radius: 9999px;
		filter: blur(20px);
		opacity: 0.5;
	}

	.learn-hero-orb-a {
		top: -4rem;
		right: -3rem;
		height: 14rem;
		width: 14rem;
		background: color-mix(in oklab, var(--color-primary-500) 55%, transparent);
	}

	.learn-hero-orb-b {
		bottom: -4rem;
		left: 18%;
		height: 12rem;
		width: 12rem;
		background: color-mix(in oklab, var(--color-secondary-500) 45%, transparent);
	}

	.learn-headline {
		font-family: 'Georgia', 'Times New Roman', serif;
		text-wrap: balance;
	}
</style>
