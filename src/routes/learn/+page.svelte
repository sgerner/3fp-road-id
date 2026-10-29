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

<div class="-m-4 flex flex-col">
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
						href="/learn/new"
						class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<IconPlus class="h-4 w-4" /> Write a guide
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</a>
					<a
						href="#library"
						class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						Browse {articles.length} guides
					</a>
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

	<!-- Featured research uses a dedicated interactive report layout. -->
	<a href="/learn/safer-cycling-better-messages" class="research-feature">
		<div class="research-feature-copy">
			<p>NEW / INTERACTIVE RESEARCH</p>
			<h2>Safer Cycling.<br /><span>Better Messages.</span></h2>
			<p class="research-feature-deck">
				Make a campaign people can understand and use. Explore the evidence, test a message, and see
				the designs.
			</p>
			<span class="research-feature-link">Explore the report <span aria-hidden="true">↗</span></span
			>
		</div>
		<div class="research-feature-art" aria-hidden="true">
			<img
				src="/reports/safer-cycling-better-messages/campaigns/01-give-people-space-poster-v9-page-01.webp"
				alt=""
				loading="lazy"
			/><span>68 sources<br />Interactive tools<br />Free PDF guides</span>
		</div>
	</a>

	<!-- SEARCH & FILTER BAND -->
	<div
		id="library"
		class="bg-surface-900 text-surface-50 border-surface-800 scroll-mt-20 border-b-2 px-6 py-5 sm:px-10 lg:px-12"
	>
		<div class="flex flex-col gap-4">
			<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
				<label class="relative block min-w-0">
					<span
						class="text-surface-400 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
					>
						<IconSearch class="h-4 w-4" />
					</span>
					<input
						bind:value={search}
						class="bg-surface-950 text-surface-50 placeholder:text-surface-400 border-surface-700 focus:border-primary-500 h-11 w-full border-2 pr-4 pl-10 text-sm font-medium focus:outline-none"
						type="search"
						aria-label="Search articles"
						placeholder="Search the field guide…"
					/>
				</label>
				<select
					bind:value={category}
					class="bg-surface-950 text-surface-50 border-surface-700 focus:border-primary-500 h-11 border-2 px-3.5 text-xs font-black tracking-wide uppercase focus:outline-none"
					aria-label="Filter by category"
				>
					<option value="all">All topics</option>
					{#each categories as option}<option value={option}>{option}</option>{/each}
				</select>
				{#if search || category !== 'all'}
					<button
						type="button"
						class="bg-primary-500 text-surface-950 h-11 px-4 text-xs font-black tracking-wide uppercase"
						onclick={() => {
							search = '';
							category = 'all';
						}}
					>
						Reset
					</button>
				{/if}
			</div>

			<LearnNavigator />
		</div>
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
				aria-live="polite"
			>
				{filteredArticles.length}
				{filteredArticles.length === 1 ? 'article' : 'articles'}
			</p>
		</div>

		<!-- Lane divider -->
		<div
			class="my-6 h-1 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_48px,transparent_48px_80px)]"
			aria-hidden="true"
		></div>

		{#if filteredArticles.length}
			<div class="border-surface-800 grid border-t-2 border-l-2 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredArticles as article, index (article.id ?? article.slug)}
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
								<p class="text-surface-300 m-0 line-clamp-3 text-sm leading-relaxed">
									{article.summary || 'Open the article to read the full guide and discussion.'}
								</p>
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

<style>
	.research-feature {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 1.5rem;
		background: #35125f;
		color: white;
		padding: clamp(1.5rem, 4vw, 3rem);
		border-top: 5px solid #ff0180;
		overflow: hidden;
		text-decoration: none;
		position: relative;
	}
	.research-feature:hover {
		text-decoration: none;
		background: #42166d;
	}
	.research-feature:focus-visible {
		outline: 4px solid #ffff0a;
		outline-offset: -7px;
	}
	.research-feature-copy > p:first-child {
		font-size: 0.65rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		color: #ffff0a;
		margin-bottom: 1rem;
	}
	.research-feature h2 {
		font-size: clamp(2rem, 4vw, 3.7rem);
		color: white !important;
		line-height: 0.98;
		letter-spacing: -0.04em;
		margin: 0;
	}
	.research-feature h2 span {
		color: #ffff0a;
	}
	.research-feature-deck {
		font-size: 0.95rem;
		line-height: 1.55;
		max-width: 32rem;
		color: #e4d5f0;
		margin-top: 1.15rem;
	}
	.research-feature-link {
		display: inline-flex;
		align-items: center;
		gap: 2rem;
		color: white;
		font-size: 0.8rem;
		font-weight: 900;
		margin-top: 1.4rem;
	}
	.research-feature-link > span {
		color: #ff0180;
		font-size: 1.4rem;
	}
	.research-feature-art {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
	}
	.research-feature-art img {
		height: 250px;
		width: auto;
		max-width: 55%;
		object-fit: contain;
		transform: rotate(7deg);
		box-shadow: 0 20px 30px #16052666;
	}
	.research-feature-art > span {
		font-size: 0.75rem;
		font-weight: 800;
		line-height: 2;
		color: #e4d5f0;
	}
	@media (max-width: 680px) {
		.research-feature {
			grid-template-columns: 1fr;
		}
		.research-feature-art {
			display: none;
		}
	}
</style>
