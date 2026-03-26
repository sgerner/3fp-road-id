<script>
	import { goto } from '$app/navigation';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';

	let { data } = $props();
	let openSlug = $state('');

	$effect(() => {
		if (openSlug) return;
		openSlug = data.initialOpenSlug || '';
	});

	function formatDate(value) {
		if (!value) return 'Recently';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Recently';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function estimateReadTime(body) {
		if (!body) return 1;
		return Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
	}

	async function togglePost(post) {
		openSlug = openSlug === post.slug ? '' : post.slug;
		const nextUrl = new URL(window.location.href);
		if (openSlug) nextUrl.searchParams.set('open', openSlug);
		else nextUrl.searchParams.delete('open');
		await goto(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<svelte:head>
	<title>{data.site.siteConfig.site_title} Updates</title>
</svelte:head>

<div class="microsite-updates-page mx-auto max-w-5xl px-4 pt-6 pb-8 md:px-6 md:pt-10">
	<section class="updates-hero rounded-[2rem] p-6 md:p-8">
		<p class="text-surface-700-300 text-xs font-semibold tracking-[0.24em] uppercase">
			Updates archive
		</p>
		<h1 class="text-surface-950-50 mt-3 text-4xl font-black tracking-tight">
			News from {data.site.siteConfig.site_title}
		</h1>
		<p class="text-surface-800-200 mt-4 max-w-3xl text-base leading-8">
			Announcements, route changes, volunteer asks, recaps, and public notes, all in one place.
		</p>
	</section>

	<div class="mt-6 space-y-4">
		{#if data.posts.length}
			{#each data.posts as post}
				<article class="updates-card rounded-[1.7rem] p-5 md:p-6">
					<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div class="min-w-0 flex-1">
							<div
								class="text-surface-700-300 flex flex-wrap items-center gap-3 text-xs font-semibold tracking-[0.18em] uppercase"
							>
								<span>{formatDate(post.published_at || post.created_at)}</span>
								<span class="inline-flex items-center gap-1">
									<IconClock3 class="h-3.5 w-3.5" />
									{estimateReadTime(post.body_markdown)} min read
								</span>
							</div>
							<h2 class="text-surface-950-50 mt-3 text-2xl font-black tracking-tight">{post.title}</h2>
							<AutoLinkText
								text={post.preview_text}
								className="block text-surface-800-200 mt-2 text-sm leading-7"
								linkClass="text-primary-700-300 underline underline-offset-2"
							/>
						</div>
						<button type="button" class="updates-toggle" onclick={() => togglePost(post)}>
							{#if openSlug === post.slug}
								Close
								<IconChevronUp class="h-4 w-4" />
							{:else}
								Open
								<IconChevronDown class="h-4 w-4" />
							{/if}
						</button>
					</div>
					{#if openSlug === post.slug}
						<div
							class="updates-body prose prose-invert mt-5 max-w-none border-t border-white/10 pt-5"
						>
							{@html post.bodyHtml}
						</div>
					{/if}
				</article>
			{/each}
		{:else}
			<div class="updates-card rounded-[1.7rem] p-8 text-center">
				<div
					class="bg-surface-50/6 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
				>
					<IconNewspaper class="text-surface-700-300 h-7 w-7" />
				</div>
				<h2 class="text-surface-950-50 mt-4 text-2xl font-black tracking-tight">No updates yet</h2>
				<p class="text-surface-800-200 mt-2 text-sm leading-7">
					This archive fills in automatically when we publish updates.
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.updates-hero,
	.updates-card {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
		backdrop-filter: blur(18px);
	}

	.updates-hero {
		background:
			radial-gradient(
				20rem 12rem at 100% 0%,
				color-mix(in oklab, var(--color-primary-500) 24%, transparent),
				transparent 60%
			),
			color-mix(in oklab, var(--color-surface-950) 76%, transparent);
	}

	.updates-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 0;
		border-radius: 999px;
		padding: 0.75rem 1rem;
		font-weight: 800;
		color: white;
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
	}

	.updates-body :global(p) {
		line-height: 1.9;
	}

	:global(.microsite-shell[data-color-mode='light']) .microsite-updates-page :global(.text-white) {
		color: rgb(15 23 42 / 0.92) !important;
	}

	:global(.microsite-shell[data-color-mode='light'])
		.microsite-updates-page
		:global([class*='text-white/']) {
		color: rgb(51 65 85 / 0.78) !important;
	}

	:global(.microsite-shell[data-color-mode='light']) .updates-hero,
	:global(.microsite-shell[data-color-mode='light']) .updates-card {
		border-color: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		background: color-mix(in oklab, white 80%, var(--color-primary-100) 20%);
		box-shadow: 0 16px 34px -28px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .updates-hero {
		background:
			radial-gradient(
				20rem 12rem at 100% 0%,
				color-mix(in oklab, var(--color-primary-300) 24%, transparent),
				transparent 60%
			),
			color-mix(in oklab, white 80%, var(--color-primary-100) 20%);
	}

	:global(.microsite-shell[data-color-mode='light']) .updates-toggle {
		color: rgb(15 23 42 / 0.9);
		background: color-mix(in oklab, var(--color-primary-300) 38%, white 62%);
	}

	:global(.microsite-shell[data-color-mode='light']) .updates-body {
		border-top-color: color-mix(in oklab, var(--color-primary-500) 16%, transparent);
	}
</style>
