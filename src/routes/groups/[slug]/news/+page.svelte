<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';

	const { data } = $props();
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
		const words = body.split(/\s+/).length;
		return Math.max(1, Math.ceil(words / 200));
	}

	function isOpen(slug) {
		return openSlug === slug;
	}

	async function togglePost(post) {
		const nextOpen = openSlug === post.slug ? '' : post.slug;
		openSlug = nextOpen;
		const url = new URL(window.location.href);
		if (nextOpen) {
			url.searchParams.set('open', nextOpen);
		} else {
			url.searchParams.delete('open');
		}
		await goto(`${url.pathname}${url.search}${url.hash}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<svelte:head>
	<title>{data.group.name} Updates</title>
	<meta name="description" content={`Latest updates from ${data.group.name}.`} />
</svelte:head>

<div class="mx-auto w-full max-w-4xl pb-10">
	<!-- Hero Section -->
	<section class="news-hero relative overflow-hidden rounded-2xl" in:fade={{ duration: 240 }}>
		<div class="news-accent-bar" aria-hidden="true"></div>
		<div class="news-glow" aria-hidden="true"></div>
		<div class="news-hero-cover">
			{#if data.group.cover_photo_url}
				<img
					src={data.group.cover_photo_url}
					alt={`${data.group.name} cover`}
					class="news-hero-image"
					loading="lazy"
				/>
			{:else}
				<div class="news-hero-fallback"></div>
			{/if}
			<div class="news-hero-scrim"></div>
		</div>

		<div
			class="relative z-10 flex min-h-[190px] flex-col justify-between p-4 md:min-h-[220px] md:p-6"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="news-hero-pill">
					<IconNewspaper class="h-4 w-4 text-white" />
					<span>Updates archive</span>
				</div>
				<a
					class="btn btn-sm preset-tonal-surface/70 inline-flex items-center gap-2 backdrop-blur-sm"
					href={`/groups/${data.group.slug}`}
				>
					<IconChevronLeft class="h-4 w-4" />
					Back to group
				</a>
			</div>
			<div>
				<h1 class="text-2xl font-black text-white drop-shadow-sm md:text-3xl">{data.group.name}</h1>
				<p class="mt-2 max-w-2xl text-sm leading-6 text-white/80">
					Announcements, route changes, event recaps, volunteer asks, and other updates from the
					group, newest first.
				</p>
			</div>
		</div>
	</section>

	<!-- Posts List -->
	{#if data.posts.length}
		<div class="mt-5 space-y-4">
			{#each data.posts as post, i}
				<article
					class="news-card group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200"
					style="--stagger: {i}"
					in:fade={{ duration: 200, delay: i * 50 }}
				>
					<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0 flex-1">
							<!-- Meta -->
							<div class="flex flex-wrap items-center gap-3 text-xs opacity-60">
								<span>{formatDate(post.published_at || post.created_at)}</span>
								{#if post.body}
									<span class="flex items-center gap-1">
										<IconClock3 class="h-3 w-3" />
										{estimateReadTime(post.body)} min read
									</span>
								{/if}
							</div>

							<!-- Title -->
							<h2 class="mt-2 text-xl leading-snug font-bold">
								<button
									type="button"
									class="hover:text-primary-400 inline-flex cursor-pointer items-center gap-2 text-left transition-colors"
									onclick={() => togglePost(post)}
								>
									{post.title}
									{#if isOpen(post.slug)}
										<IconChevronUp class="h-4 w-4 opacity-70" />
									{:else}
										<IconChevronDown class="h-4 w-4 opacity-70" />
									{/if}
								</button>
							</h2>

							<!-- Preview -->
							{#if post.preview_text}
								<p class="mt-2 line-clamp-2 text-sm leading-relaxed opacity-75">
									{post.preview_text}
								</p>
							{/if}
						</div>

						<!-- CTA -->
						<div class="shrink-0 sm:pt-1">
							<button
								type="button"
								class="btn btn-sm preset-tonal-surface group-hover:preset-filled-primary-500 flex items-center gap-1.5 transition-all"
								onclick={() => togglePost(post)}
							>
								{#if isOpen(post.slug)}
									Close
								{:else}
									Open
								{/if}
							</button>
						</div>
					</div>

					{#if isOpen(post.slug)}
						<div class="border-surface-500/15 mt-4 border-t pt-4" in:fade={{ duration: 180 }}>
							<div class="prose prose-invert news-prose max-w-none">
								{@html post.bodyHtml}
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<section
			class="border-surface-500/20 bg-surface-950/40 mt-5 rounded-2xl border border-dashed p-10 text-center"
			in:fade={{ duration: 200 }}
		>
			<div
				class="bg-surface-800/50 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
			>
				<IconNewspaper class="h-8 w-8 opacity-50" />
			</div>
			<h2 class="mt-4 text-xl font-bold">No updates yet</h2>
			<p class="mt-2 text-sm opacity-70">Check back soon for updates from {data.group.name}.</p>
		</section>
	{/if}
</div>

<style>
	.news-hero {
		background:
			radial-gradient(circle at top right, rgb(234 179 8 / 0.18), transparent 36%),
			linear-gradient(135deg, rgb(249 115 22 / 0.08), rgb(8 47 73 / 0.28));
		border: 1px solid rgb(251 191 36 / 0.18);
	}

	.news-hero-cover {
		position: absolute;
		inset: 0;
	}

	.news-hero-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.news-hero-fallback {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			130deg,
			color-mix(in oklab, var(--color-primary-700) 70%, transparent),
			color-mix(in oklab, var(--color-secondary-600) 60%, transparent)
		);
	}

	.news-hero-scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgb(10 10 15 / 0.84),
			rgb(10 10 15 / 0.52) 45%,
			rgb(10 10 15 / 0.35) 70%,
			rgb(10 10 15 / 0.2)
		);
	}

	.news-accent-bar {
		position: absolute;
		inset: 0 auto auto 0;
		width: 100%;
		height: 4px;
		background: linear-gradient(90deg, rgb(249 115 22), rgb(251 191 36), rgb(14 165 233));
	}

	.news-glow {
		position: absolute;
		right: -4rem;
		top: -4rem;
		width: 16rem;
		height: 16rem;
		border-radius: 9999px;
		background: rgb(251 191 36 / 0.12);
		filter: blur(52px);
		pointer-events: none;
	}

	.news-hero-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgb(255 255 255 / 0.2);
		background: rgb(7 12 26 / 0.55);
		backdrop-filter: blur(4px);
		border-radius: 9999px;
		padding: 0.3rem 0.65rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgb(255 255 255 / 0.9);
	}

	/* News Cards */
	.news-card {
		background: color-mix(in oklab, var(--color-surface-900) 95%, var(--color-surface-800) 5%);
		border-color: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		box-shadow: 0 4px 20px rgb(0 0 0 / 0.15);
		animation: card-in 380ms ease both;
		animation-delay: calc(var(--stagger, 0) * 60ms);
	}

	.news-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		box-shadow: 0 8px 30px rgb(0 0 0 / 0.2);
		transform: translateY(-2px);
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.line-clamp-2 {
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
