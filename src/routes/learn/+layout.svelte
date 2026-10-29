<script>
	import { page } from '$app/state';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';

	let { children } = $props();

	const pathname = $derived(page.url.pathname);
	const currentUser = $derived(page.data?.currentUser ?? null);
	const currentArticleSlug = $derived(page.data?.article?.slug ?? null);
	const canEditCurrentArticle = $derived(
		Boolean(
			currentArticleSlug &&
			(page.data?.canEdit ||
				pathname === `/learn/${currentArticleSlug}/edit` ||
				pathname.startsWith(`/learn/${currentArticleSlug}/edit`))
		)
	);

	const currentCategorySlug = $derived(
		page.data?.category?.slug ?? page.data?.article?.category_slug
	);
	const currentCategoryName = $derived(
		page.data?.category?.name ?? page.data?.article?.category_name
	);
	const isEditorRoute = $derived(pathname === '/learn/new' || pathname.endsWith('/edit'));
	const isResearchReport = $derived(pathname === '/learn/safer-cycling-better-messages');
</script>

{#if isResearchReport}
	{@render children()}
{:else}
	<div class="text-surface-50 -m-4 flex min-h-[calc(100dvh-73px)] flex-col overflow-hidden">
		<nav
			aria-label="Learn secondary navigation"
			class="bg-surface-950 border-surface-800 flex flex-wrap items-center justify-between gap-3 border-b-2 px-6 py-3 sm:px-10 lg:px-14"
		>
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<span class="bg-tertiary-500 h-3 w-3 shrink-0" aria-hidden="true"></span>
				<a
					href="/learn"
					aria-current={pathname === '/learn' ? 'page' : undefined}
					class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-black tracking-[0.2em] uppercase transition hover:no-underline {pathname ===
					'/learn'
						? 'bg-primary-500 text-surface-950'
						: 'text-surface-50 hover:bg-surface-800'}"
				>
					<IconBookOpen class="h-3.5 w-3.5 shrink-0" />
					<span>Learn Library</span>
				</a>

				{#if currentCategorySlug}
					<span class="text-tertiary-500 px-1 text-xs font-black" aria-hidden="true">/</span>
					<a
						href={`/learn/category/${currentCategorySlug}`}
						aria-current={pathname === `/learn/category/${currentCategorySlug}`
							? 'page'
							: undefined}
						class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-black tracking-[0.2em] uppercase transition hover:no-underline {pathname ===
						`/learn/category/${currentCategorySlug}`
							? 'bg-primary-500 text-surface-950'
							: 'bg-tertiary-500 text-surface-950 hover:bg-primary-500'}"
					>
						<span class="max-w-[14rem] truncate">{currentCategoryName || 'Overview'}</span>
					</a>
				{/if}

				{#if currentArticleSlug && page.data?.article?.title}
					<span
						class="text-tertiary-500 hidden px-1 text-xs font-black sm:inline"
						aria-hidden="true">/</span
					>
					<span
						class="text-surface-300 hidden max-w-[18rem] truncate text-xs font-bold tracking-[0.14em] uppercase sm:inline"
					>
						{page.data.article.title}
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if currentUser}
					<a
						href="/learn/new"
						aria-current={pathname === '/learn/new' ? 'page' : undefined}
						class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
					>
						<IconPlus class="h-3.5 w-3.5 shrink-0" />
						<span>Create Article</span>
					</a>
				{/if}

				{#if currentArticleSlug}
					{#if canEditCurrentArticle}
						<a
							href={`/learn/${currentArticleSlug}/edit`}
							aria-current={pathname === `/learn/${currentArticleSlug}/edit` ? 'page' : undefined}
							class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-3.5 py-1 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
						>
							<IconSquarePen class="h-3.5 w-3.5 shrink-0" />
							<span>Edit Article</span>
						</a>
					{/if}

					{#if page.data?.viewingRevision}
						<a
							href={`/learn/${currentArticleSlug}?revision=${page.data.viewingRevision.id}`}
							class="bg-tertiary-500 text-surface-950 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-black tracking-[0.18em] uppercase hover:no-underline"
						>
							<IconHistory class="h-3.5 w-3.5 shrink-0" />
							<span>Revision {page.data.viewingRevision.revisionNumber}</span>
						</a>
					{/if}
				{/if}
			</div>
		</nav>

		{#if isEditorRoute}
			<div class="p-4 sm:p-6 lg:p-10">
				{@render children()}
			</div>
		{:else}
			{@render children()}
		{/if}
	</div>
{/if}
