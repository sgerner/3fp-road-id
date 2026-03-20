<script>
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';

	const { data } = $props();

	function formatDate(value, withTime = false) {
		if (!value) return 'Recently';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
		}).format(date);
	}
</script>

<svelte:head>
	<title>{data.post.title} · {data.group.name}</title>
	<meta
		name="description"
		content={data.post.summary || data.post.preview_text || data.post.title}
	/>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
	<section class="border-surface-500/20 bg-surface-950/55 rounded-[2rem] border p-6 shadow-xl">
		<div class="flex flex-wrap items-center gap-3">
			<a class="btn btn-sm preset-tonal-surface gap-2" href={`/groups/${data.group.slug}/news`}>
				<IconChevronLeft class="h-4 w-4" />
				Back to updates
			</a>
			<a class="btn btn-sm preset-tonal-surface" href={`/groups/${data.group.slug}`}>Group page</a>
		</div>

		<div class="mt-6 flex items-center gap-2 opacity-70">
			<IconNewspaper class="h-4 w-4" />
			<span class="label">{data.group.name}</span>
		</div>
		<h1 class="mt-3 text-4xl font-black lg:text-5xl">{data.post.title}</h1>
		{#if data.post.summary}
			<p class="mt-4 max-w-3xl text-lg leading-8 opacity-80">{data.post.summary}</p>
		{/if}
		<div class="mt-5 flex flex-wrap gap-5 text-sm opacity-70">
			<div>{formatDate(data.post.published_at || data.post.created_at, true)}</div>
			<div class="flex items-center gap-2">
				<IconClock3 class="h-4 w-4" />
				{data.post.estimatedReadMinutes} min read
			</div>
			<div>
				By {data.post.authorProfile?.full_name || data.post.authorProfile?.email || data.group.name}
			</div>
		</div>
	</section>

	<section
		class="border-surface-500/20 bg-surface-950/40 rounded-[2rem] border p-6 shadow-xl lg:p-8"
	>
		<div class="prose prose-invert news-prose max-w-none">
			{@html data.post.bodyHtml}
		</div>
	</section>

	{#if data.relatedPosts.length}
		<section class="border-surface-500/20 bg-surface-950/35 rounded-[2rem] border p-6 shadow-xl">
			<h2 class="text-2xl font-black">More from {data.group.name}</h2>
			<div class="mt-5 grid gap-4 md:grid-cols-3">
				{#each data.relatedPosts as post}
					<a
						class="border-surface-500/20 bg-surface-900/50 hover:bg-surface-900/70 rounded-[1.5rem] border p-4 transition-colors"
						href={`/groups/${data.group.slug}/news/${post.slug}`}
					>
						<div class="text-xs uppercase opacity-60">
							{formatDate(post.published_at || post.created_at)}
						</div>
						<h3 class="mt-2 text-lg font-bold">{post.title}</h3>
						{#if post.preview_text}
							<p class="mt-2 text-sm leading-6 opacity-75">{post.preview_text}</p>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.news-prose :global(h1),
	.news-prose :global(h2),
	.news-prose :global(h3),
	.news-prose :global(h4) {
		scroll-margin-top: 7rem;
	}

	.news-prose :global(img) {
		border-radius: 1rem;
	}
</style>
