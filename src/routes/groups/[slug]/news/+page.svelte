<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';

	const { data } = $props();

	function formatDate(value) {
		if (!value) return 'Recently';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}
</script>

<svelte:head>
	<title>{data.group.name} Updates</title>
	<meta name="description" content={`Latest updates from ${data.group.name}.`} />
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
	<section class="border-surface-500/20 bg-surface-950/55 rounded-[2rem] border p-6 shadow-xl">
		<a class="btn btn-sm preset-tonal-surface gap-2" href={`/groups/${data.group.slug}`}>
			<IconChevronLeft class="h-4 w-4" />
			Back to group
		</a>

		<div class="mt-5 flex flex-wrap items-start justify-between gap-4">
			<div>
				<div class="mb-2 flex items-center gap-2 opacity-70">
					<IconNewspaper class="h-4 w-4" />
					<span class="label">Updates archive</span>
				</div>
				<h1 class="text-4xl font-black">{data.group.name} updates</h1>
				<p class="mt-3 max-w-3xl text-base leading-7 opacity-75">
					Announcements, route changes, event recaps, volunteer asks, and other updates from the
					group, newest first.
				</p>
			</div>
			<div class="chip preset-tonal-surface text-sm">
				{data.posts.length}
				{data.posts.length === 1 ? 'update' : 'updates'}
			</div>
		</div>
	</section>

	{#if data.posts.length}
		<div class="space-y-4">
			{#each data.posts as post}
				<article
					class="border-surface-500/20 bg-surface-950/40 rounded-[2rem] border p-6 shadow-xl"
				>
					<div class="text-sm opacity-65">{formatDate(post.published_at || post.created_at)}</div>
					<h2 class="mt-3 text-2xl font-black">
						<a class="hover:underline" href={`/groups/${data.group.slug}/news/${post.slug}`}>
							{post.title}
						</a>
					</h2>
					{#if post.preview_text}
						<p class="mt-3 max-w-3xl text-base leading-7 opacity-80">{post.preview_text}</p>
					{/if}
					<div class="mt-5">
						<a
							class="btn preset-filled-primary-500 gap-2"
							href={`/groups/${data.group.slug}/news/${post.slug}`}
						>
							Read article
							<IconArrowRight class="h-4 w-4" />
						</a>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<section
			class="border-surface-500/20 bg-surface-950/40 rounded-[2rem] border border-dashed p-10 text-center shadow-xl"
		>
			<h2 class="text-2xl font-black">No updates yet</h2>
			<p class="mt-3 text-sm leading-6 opacity-70">
				Check back soon for updates from {data.group.name}.
			</p>
		</section>
	{/if}
</div>
