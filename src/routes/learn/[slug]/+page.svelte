<script>
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconMessageSquareText from '@lucide/svelte/icons/message-square-text';

	const { data, form } = $props();
	let showVersionHistory = $state(false);

	function formatDate(value, withTime = false) {
		if (!value) return 'Recently';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
		});
	}
</script>

<svelte:head>
	<title>{data.article.title} · Learn</title>
	<meta name="description" content={data.article.summary || data.article.title} />
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<section
		class="border-surface-500/20 bg-surface-950/55 overflow-hidden rounded-[2rem] border shadow-2xl"
	>
		{#if data.article.cover_image_url}
			<div class="aspect-[18/6] overflow-hidden">
				<img
					class="h-full w-full object-cover"
					src={data.article.cover_image_url}
					alt={data.article.title}
				/>
			</div>
		{/if}

		<div class="space-y-6 p-6 lg:p-8">
			<div class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500">{data.article.category_name}</span>
					<span class="chip preset-tonal-surface">
						<IconHistory class="h-3.5 w-3.5" />
						v{data.article.last_revision_number}
					</span>
					{#if data.viewingRevision}
						<span class="chip preset-tonal-secondary">
							Viewing revision {data.viewingRevision.revisionNumber}
						</span>
					{/if}
				</div>

				<h1 class="learn-article-title text-left text-4xl font-black lg:text-5xl">
					{data.article.title}
				</h1>

				{#if data.article.summary}
					<p class="max-w-3xl text-lg leading-8 opacity-80">{data.article.summary}</p>
				{/if}

				<div class="flex flex-wrap gap-5 text-sm opacity-70">
					<div class="flex items-center gap-2">
						<IconClock3 class="h-4 w-4" />
						Updated {formatDate(data.article.updated_at)}
					</div>
					<div>{data.article.estimatedReadMinutes} min read</div>
					<div>
						Created by {data.article.authorProfile?.full_name ||
							data.article.authorProfile?.email ||
							'Community member'}
					</div>
				</div>
			</div>

			<section class="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
				<div class="rounded-[1.5rem] border border-primary-500/20 bg-primary-500/10 p-5">
					<p class="label">Start Here</p>
					<p class="mt-3 text-base leading-7 opacity-85">{data.article.readerSummary}</p>
					{#if data.article.keyTakeaways?.length}
						<div class="mt-4 space-y-2">
							<p class="text-sm font-semibold uppercase tracking-[0.2em] opacity-65">
								Key Takeaways
							</p>
							<ul class="space-y-2 text-sm leading-6 opacity-80">
								{#each data.article.keyTakeaways as takeaway}
									<li class="flex gap-2">
										<span class="mt-2 h-1.5 w-1.5 rounded-full bg-primary-300"></span>
										<span>{takeaway}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				{#if data.article.headings?.length}
					<nav class="rounded-[1.5rem] border border-surface-500/20 bg-surface-900/55 p-5">
						<p class="label">On This Page</p>
						<div class="mt-3 space-y-2">
							{#each data.article.headings.filter((heading) => heading.depth <= 3) as heading}
								<a
									class={`block rounded-xl px-3 py-2 text-sm transition hover:bg-surface-50/5 hover:opacity-100 ${heading.depth > 2 ? 'ml-4 opacity-70' : 'opacity-85'}`}
									href={`#${heading.id}`}
								>
									{heading.text}
								</a>
							{/each}
						</div>
					</nav>
				{/if}
			</section>

			{#if data.viewingRevision}
				<div
					class="border-secondary-500/25 bg-secondary-500/10 rounded-[1.5rem] border p-4 text-sm"
				>
					This page is showing revision {data.viewingRevision.revisionNumber} from
					{formatDate(data.viewingRevision.createdAt, true)}.
					<a class="font-semibold underline" href={`/learn/${data.article.slug}`}
						>Return to the latest version</a
					>.
				</div>
			{/if}

			{#if data.article.hasStructuredSections}
				<div class="learn-sections space-y-5">
					{#if data.article.introHtml}
						<div class="prose prose-invert learn-prose max-w-none">
							{@html data.article.introHtml}
						</div>
					{/if}

					{#each data.article.sections as section}
						{#if section.isCollapsible}
							<details class="rounded-[1.5rem] border border-surface-500/20 bg-surface-900/35 p-5">
								<summary class="cursor-pointer list-none">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-left text-xl font-bold">{section.title}</p>
											<p class="mt-1 text-sm opacity-65">Expanded details for this section</p>
										</div>
										<span class="chip preset-tonal-surface">Long section</span>
									</div>
								</summary>
								<div class="prose prose-invert learn-prose mt-5 max-w-none">
									{@html section.html}
								</div>
							</details>
						{:else}
							<div class="prose prose-invert learn-prose max-w-none">
								{@html section.html}
							</div>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="prose prose-invert learn-prose max-w-none">
					{@html data.article.bodyHtml}
				</div>
			{/if}
		</div>
	</section>

	<section class="space-y-6">
		{#if data.article.assets.length}
			<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
				<h2 class="text-left text-2xl font-bold">Attached media</h2>
				<div class="mt-4 space-y-2">
					{#each data.article.assets as asset}
						<a
							class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 block rounded-2xl border p-4 text-sm transition"
							href={asset.public_url}
							target="_blank"
							rel="noreferrer"
						>
							<div class="font-medium">{asset.file_name}</div>
							<div class="mt-1 opacity-70">{asset.mime_type || 'file'}</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.relatedArticles.length}
			<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
				<h2 class="text-left text-2xl font-bold">More in {data.article.category_name}</h2>
				<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.relatedArticles as related}
						<a
							class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 flex min-h-32 flex-col rounded-2xl border p-4 transition hover:-translate-y-0.5"
							href={`/learn/${related.slug}`}
						>
							<div class="font-medium">{related.title}</div>
							<div class="mt-2 text-sm opacity-70">
								<p class="line-clamp-3">{related.summary || 'Open article'}</p>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
			<div class="flex items-center gap-2">
				<IconMessageSquareText class="h-5 w-5" />
				<h2 class="text-left text-2xl font-bold">Discussion</h2>
			</div>

			{#if data.currentUser}
				<form class="preset-tonal-surface mt-5 space-y-3 p-2" method="POST" action="?/comment">
					<textarea
						class="textarea min-h-32"
						name="bodyMarkdown"
						placeholder="Share context, corrections, follow-up questions, or examples from your city."
					></textarea>
					{#if form?.commentError}
						<p class="text-error-500 text-sm">{form.commentError}</p>
					{/if}
					{#if form?.commentSuccess}
						<p class="text-success-500 text-sm">Comment added.</p>
					{/if}
					<button class="btn preset-filled-secondary-500" type="submit">Post comment</button>
				</form>
			{:else}
				<div
					class="border-surface-500/30 mt-5 rounded-[1.5rem] border border-dashed p-5 text-sm opacity-80"
				>
					Sign in with a registered account to comment or edit the article.
				</div>
			{/if}

			<div class="mt-6 space-y-4">
				{#each data.article.comments as comment}
					<div class="border-surface-500/20 bg-surface-900/60 rounded-[1.5rem] border p-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="font-semibold">
								{comment.authorProfile?.full_name ||
									comment.authorProfile?.email ||
									'Community member'}
							</p>
							<p class="text-sm opacity-60">{formatDate(comment.created_at, true)}</p>
						</div>
						<div class="prose prose-invert mt-3 max-w-none">
							{@html comment.bodyHtml}
						</div>
					</div>
				{/each}

				{#if !data.article.comments.length}
					<div
						class="border-surface-500/30 rounded-[1.5rem] border border-dashed p-6 text-center opacity-75"
					>
						No comments yet. Start the discussion with implementation notes, questions, or local
						examples.
					</div>
				{/if}
			</div>
		</section>

		<section class="border-surface-500/20 bg-surface-950/50 rounded-[2rem] border p-6 shadow-xl">
			<button
				type="button"
				class="flex w-full items-center justify-between gap-3 text-left"
				onclick={() => (showVersionHistory = !showVersionHistory)}
				aria-expanded={showVersionHistory}
				aria-controls="learn-version-history"
			>
				<div class="flex items-center gap-2">
					<IconHistory class="h-5 w-5" />
					<h2 class="text-left text-2xl font-bold">Version history</h2>
				</div>
				<span class="inline-flex items-center gap-2 text-sm opacity-70">
					{data.article.revisions.length} revisions
					<IconChevronDown
						class={`h-4 w-4 transition-transform duration-200 ${showVersionHistory ? 'rotate-180' : ''}`}
					/>
				</span>
			</button>

			{#if showVersionHistory}
				<div id="learn-version-history" class="mt-4 space-y-3">
					{#each data.article.revisions as revision}
						<div class="space-y-2">
							<a
								class="border-surface-500/20 bg-surface-900/60 hover:border-primary-500/30 block rounded-2xl border p-4 transition"
								href={`/learn/${data.article.slug}?revision=${revision.id}`}
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<p class="font-medium">Revision {revision.revision_number}</p>
									<p class="text-xs uppercase opacity-60">{formatDate(revision.created_at)}</p>
								</div>
								<p class="mt-1 text-sm opacity-70">
									{revision.authorProfile?.full_name ||
										revision.authorProfile?.email ||
										'Community member'}
								</p>
								{#if data.canEdit}
									<p class="mt-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-60">
										Restore from edit screen
									</p>
								{/if}
							</a>
							{#if data.canEdit}
								<a
									class="btn btn-xs preset-tonal-surface"
									href={`/learn/${data.article.slug}/edit?fromRevision=${revision.id}`}
								>
									Open this revision in editor
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</section>
</div>

<style>
	.learn-article-title {
		font-family: 'Georgia', 'Times New Roman', serif;
		text-wrap: balance;
	}

	.learn-prose :global(h1),
	.learn-prose :global(h2),
	.learn-prose :global(h3),
	.learn-prose :global(h4) {
		text-align: left;
	}

	.learn-prose :global(img) {
		border-radius: 1rem;
	}
</style>
