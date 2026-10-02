<script>
	import LearnNavigator from '$lib/components/learn/LearnNavigator.svelte';

	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconClock3 from '@lucide/svelte/icons/clock-3';

	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSearch from '@lucide/svelte/icons/search';
	import { optimizedImageUrl } from '$lib/media/optimized';

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

<div class="learn-library mx-auto flex w-full max-w-7xl flex-col gap-8 sm:gap-10">
	<header class="library-hero">
		<div class="max-w-3xl">
			<p
				class="text-primary-400 mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase"
			>
				<IconBookOpen class="h-4 w-4" /> The shared field guide
			</p>
			<h1 class="text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-6xl">
				A little knowledge.<br /><span class="text-primary-400">A better ride.</span>
			</h1>
			<p class="mt-5 max-w-xl text-base leading-relaxed opacity-75 sm:text-lg">
				Practical guides for safer cycling and stronger communities. Find an answer, learn something
				new, or share what you know.
			</p>
		</div>
		<a class="btn preset-tonal-primary shrink-0 gap-2" href="/learn/new"
			><IconPlus class="h-4 w-4" /> Write a guide</a
		>
	</header>

	<div id="library" class="scroll-mt-28 space-y-4">
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
			<label class="search-field">
				<span class="search-icon"><IconSearch class="h-5 w-5 opacity-60" /></span>
				<input
					bind:value={search}
					class="input w-full"
					type="search"
					aria-label="Search articles"
					placeholder="Search the field guide…"
				/>
			</label>
			<select bind:value={category} class="select" aria-label="Filter by category">
				<option value="all">All topics</option>
				{#each categories as option}<option value={option}>{option}</option>{/each}
			</select>
		</div>
		<LearnNavigator />
	</div>

	<section class="space-y-6" aria-labelledby="library-heading">
		<div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
			<div>
				<p class="text-xs font-black tracking-[0.2em] uppercase opacity-55">The library</p>
				<h2 id="library-heading" class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
					Find your next read
				</h2>
			</div>
			<p class="text-sm tabular-nums opacity-60" aria-live="polite">
				{filteredArticles.length}
				{filteredArticles.length === 1 ? 'article' : 'articles'}
			</p>
		</div>

		{#if filteredArticles.length}
			<div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredArticles as article}
					<a
						class="article-card group flex h-full flex-col overflow-hidden"
						href={`/learn/${article.slug}`}
					>
						{#if article.cover_image_url}
							<img
								class="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
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
						{/if}
						<div class="flex flex-1 flex-col p-5">
							<div class="flex flex-wrap gap-2">
								<span class="text-primary-400 text-xs font-bold tracking-wide"
									>{article.category_name}</span
								>
							</div>
							<h3 class="mt-5 text-xl leading-snug font-bold">{article.title}</h3>
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
				<p class="mt-2 opacity-65">Try a broader search or explore all topics.</p>
				<button
					class="btn preset-tonal-primary mt-4"
					onclick={() => {
						search = '';
						category = 'all';
					}}>Clear filters</button
				>
			</div>
		{/if}
	</section>
</div>

<style>
	.learn-library {
		background: color-mix(in oklab, var(--color-surface-950) 96%, transparent);
		padding: clamp(1.1rem, 3vw, 2.5rem);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 18%, transparent);
		border-radius: 1.75rem;
	}
	.search-field {
		display: block;
		position: relative;
		min-width: 0;
	}
	.search-icon {
		position: absolute;
		left: 1rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
	}
	.search-field input {
		padding-left: 2.75rem;
		min-height: 3.5rem;
	}

	.library-hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		padding: 2rem 0 1rem;
	}
	.article-card {
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 20%, transparent);
		border-radius: 1.25rem;
		background: color-mix(in oklab, var(--color-surface-500) 6%, transparent);
		transition:
			border-color 180ms,
			background 180ms;
	}
	.article-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-400) 65%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 6%, transparent);
	}
	.article-card:focus-visible {
		outline: 2px solid var(--color-primary-400);
		outline-offset: 4px;
	}
	@media (max-width: 640px) {
		.library-hero {
			flex-direction: column;
			align-items: flex-start;
			padding-top: 1rem;
			gap: 1.25rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.article-card {
			transition: none;
		}
	}
</style>
