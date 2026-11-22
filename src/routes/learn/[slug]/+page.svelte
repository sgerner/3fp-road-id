<script>
	import { tick } from 'svelte';
	import ShareButton from '#lib/components/ui/ShareButton.svelte';
	import ArticleAssistant from '#lib/components/learn/ArticleAssistant.svelte';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconHistory from '@lucide/svelte/icons/rotate-ccw-clock';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import IconMessageSquareText from '@lucide/svelte/icons/message-square-text';
	import IconListTree from '@lucide/svelte/icons/list-tree';
	import IconSparkle from '@lucide/svelte/icons/sparkle';
	import { page } from '$app/state';
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '#lib/seo';

	const { data, form } = $props();
	/** @type {any} */
	let showVersionHistory = $state(false);
	/** @type {any} */
	const authRequired = $derived(
		!data.currentUser?.id && page.url.searchParams.get('auth') === 'required'
	);

	// ── Reading progress bar ─────────────────────────────────────────────
	/** @type {any} */
	let scrollProgress = $state(0);
	/** @type {HTMLElement | null} */
	let articleEl = $state(null);
	/** @type {HTMLElement | null} */
	let proseEl = $state(null);

	function onScroll() {
		if (!articleEl) return;
		const { top, height } = articleEl.getBoundingClientRect();
		const windowH = window.innerHeight;
		// progress: 0 when article top is at viewport bottom, 1 when article bottom is at viewport top
		const progress = Math.min(1, Math.max(0, (windowH - top) / (height + windowH)));
		scrollProgress = progress;
	}

	// ── TOC Scroll-spy ───────────────────────────────────────────────────
	/** @type {any} */
	let activeHeadingId = $state('');

	/** @type {IntersectionObserver | null} */
	let observer = null;

	function setupScrollSpy() {
		if (observer) observer.disconnect();
		const headingEls = Array.from(
			document.querySelectorAll('.learn-article-body h1, .learn-article-body h2')
		);
		if (!headingEls.length) return;

		const visible = new Set();
		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) visible.add(entry.target.id);
					else visible.delete(entry.target.id);
				});
				const active = headingEls.find((el) => visible.has(el.id));
				if (active) activeHeadingId = active.id;
			},
			{ rootMargin: '-10% 0px -75% 0px', threshold: 0 }
		);
		headingEls.forEach((el) => /** @type {any} */ (observer).observe(el));
	}

	$effect(() => {
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => window.removeEventListener('scroll', onScroll);
	});

	/**
	 * @param {Node} node
	 */
	function selectNodeText(node) {
		const selection = window.getSelection?.();
		if (!selection) return;
		const range = document.createRange();
		range.selectNodeContents(node);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	/**
	 * @param {Element} target
	 * @param {HTMLElement} root
	 */
	function findNearestSectionHeading(target, root) {
		const candidates = Array.from(root.querySelectorAll('h1, h2, h3, h4'));
		/** @type {string} */
		let headingText = '';
		for (const candidate of candidates) {
			const relation = candidate.compareDocumentPosition(target);
			if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
				const text = candidate.textContent?.trim() || '';
				if (text) headingText = text;
			}
		}
		return headingText;
	}

	/**
	 * @param {HTMLElement | null} container
	 */
	function enhanceLearnProse(container) {
		if (!container) return () => {};

		/** @type {Array<() => void>} */
		const cleanups = [];
		const usedCopyLabels = new Map();

		const preBlocks = Array.from(container.querySelectorAll('pre'));
		preBlocks.forEach((pre, index) => {
			if (pre.dataset.learnEnhanced === 'true' || pre.closest('.learn-pre-block')) return;
			pre.dataset.learnEnhanced = 'true';

			const headingText = findNearestSectionHeading(pre, container);
			const baseLabel = headingText ? `Copy template: ${headingText}` : 'Copy template';
			const seenCount = usedCopyLabels.get(baseLabel) ?? 0;
			usedCopyLabels.set(baseLabel, seenCount + 1);
			const ariaLabel =
				seenCount > 0
					? `${baseLabel} (${seenCount + 1})`
					: !headingText && preBlocks.length > 1
						? `Copy template ${index + 1}`
						: baseLabel;

			const block = document.createElement('div');
			block.className = 'learn-pre-block';

			const header = document.createElement('div');
			header.className = 'learn-pre-header no-print';

			const status = document.createElement('span');
			status.className = 'sr-only';
			status.setAttribute('role', 'status');
			status.setAttribute('aria-live', 'polite');

			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'learn-copy-btn min-h-11 min-w-11 no-print';
			button.dataset.copyState = 'idle';
			button.setAttribute('aria-label', ariaLabel);

			const labelSpan = document.createElement('span');
			labelSpan.className = 'learn-copy-label';
			labelSpan.textContent = 'Copy template';
			button.appendChild(labelSpan);

			/** @type {ReturnType<typeof setTimeout> | undefined} */
			let resetTimer;
			const handleCopyClick = async () => {
				const codeNode = pre.querySelector('code') ?? pre;
				const templateText = (codeNode.textContent ?? '').replace(/\n$/, '');
				if (resetTimer) clearTimeout(resetTimer);
				try {
					if (!navigator.clipboard?.writeText) {
						throw new Error('Clipboard unavailable');
					}
					await navigator.clipboard.writeText(templateText);
					button.dataset.copyState = 'copied';
					labelSpan.textContent = 'Copied';
					status.textContent = 'Template copied. Ready to paste anywhere.';
					resetTimer = setTimeout(() => {
						button.dataset.copyState = 'idle';
						labelSpan.textContent = 'Copy template';
						status.textContent = '';
					}, 2200);
				} catch {
					selectNodeText(codeNode);
					button.dataset.copyState = 'selected';
					labelSpan.textContent = 'Select & copy';
					status.textContent = 'Select and copy the template below.';
					resetTimer = setTimeout(() => {
						button.dataset.copyState = 'idle';
						labelSpan.textContent = 'Copy template';
						status.textContent = '';
					}, 3500);
				}
			};

			button.addEventListener('click', handleCopyClick);
			cleanups.push(() => {
				if (resetTimer) clearTimeout(resetTimer);
				button.removeEventListener('click', handleCopyClick);
			});

			pre.parentNode?.insertBefore(block, pre);
			header.append(status, button);
			block.append(header, pre);
		});

		/** @type {Array<() => void>} */
		const overflowUpdaters = [];
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						overflowUpdaters.forEach((fn) => fn());
					})
				: null;

		const tables = Array.from(container.querySelectorAll('table'));
		tables.forEach((table, index) => {
			if (table.dataset.learnEnhanced === 'true' || table.closest('.learn-table-wrap')) return;
			table.dataset.learnEnhanced = 'true';

			const headingText = findNearestSectionHeading(table, container);
			const regionLabel = headingText
				? `Scrollable table: ${headingText}`
				: tables.length > 1
					? `Scrollable table ${index + 1}`
					: 'Scrollable table';

			const wrap = document.createElement('div');
			wrap.className = 'learn-table-wrap';
			wrap.dataset.overflowing = 'false';
			wrap.dataset.canScrollRight = 'false';

			const cue = document.createElement('div');
			cue.className = 'learn-table-cue no-print';
			cue.setAttribute('aria-hidden', 'true');
			cue.textContent = 'Scroll horizontally for more columns →';

			const scrollBox = document.createElement('div');
			scrollBox.className = 'learn-table-scroll';

			table.parentNode?.insertBefore(wrap, table);
			scrollBox.appendChild(table);
			wrap.append(cue, scrollBox);

			const updateTableOverflow = () => {
				const maxScrollLeft = scrollBox.scrollWidth - scrollBox.clientWidth;
				const isOverflowing = maxScrollLeft > 1;
				const canScrollRight = isOverflowing && scrollBox.scrollLeft < maxScrollLeft - 1;
				wrap.dataset.overflowing = isOverflowing ? 'true' : 'false';
				wrap.dataset.canScrollRight = canScrollRight ? 'true' : 'false';
				cue.textContent = canScrollRight
					? 'Scroll horizontally for more columns →'
					: '← Scroll horizontally to view all columns';
				if (isOverflowing) {
					scrollBox.setAttribute('tabindex', '0');
					scrollBox.setAttribute('role', 'region');
					scrollBox.setAttribute('aria-label', regionLabel);
				} else {
					scrollBox.removeAttribute('tabindex');
					scrollBox.removeAttribute('role');
					scrollBox.removeAttribute('aria-label');
				}
			};

			scrollBox.addEventListener('scroll', updateTableOverflow, { passive: true });
			overflowUpdaters.push(updateTableOverflow);
			resizeObserver?.observe(scrollBox);
			resizeObserver?.observe(table);
			updateTableOverflow();

			cleanups.push(() => {
				scrollBox.removeEventListener('scroll', updateTableOverflow);
			});
		});

		const handleWindowResize = () => {
			overflowUpdaters.forEach((fn) => fn());
		};
		if (overflowUpdaters.length) {
			window.addEventListener('resize', handleWindowResize, { passive: true });
			cleanups.push(() => window.removeEventListener('resize', handleWindowResize));
		}
		if (resizeObserver) {
			cleanups.push(() => resizeObserver.disconnect());
		}

		return () => {
			cleanups.forEach((fn) => fn());
		};
	}

	$effect(() => {
		const content = data.article.bodyHtml;
		let cancelled = false;
		/** @type {(() => void) | null} */
		let cleanupProse = null;
		activeHeadingId = '';
		void tick().then(() => {
			if (!cancelled && content) {
				cleanupProse = enhanceLearnProse(proseEl);
				setupScrollSpy();
				onScroll();
			}
		});
		return () => {
			cancelled = true;
			cleanupProse?.();
			observer?.disconnect();
		};
	});

	// Keep the TOC focused on the main sections across screen sizes.
	/** @type {any} */
	const tocHeadingsDesktop = $derived((data.article.headings ?? []).filter((h) => h.depth <= 2));
	/** @type {any} */
	const tocHeadingsMobile = $derived(tocHeadingsDesktop);
	/** @type {any} */
	const seoTitle = $derived.by(() => cleanSeoText(data.article.title || 'Learn'));
	/** @type {any} */
	const seoDescription = $derived.by(() =>
		limitSeoText(
			data.article.summary ||
				`${seoTitle} in the 3 Feet Please learn library, with explanations, examples, and practical guidance.`,
			165
		)
	);
	/** @type {any} */
	const seoCanonical = $derived(buildCanonicalUrl(page.url, ['revision']));
	/** @type {any} */
	const seoImage = $derived.by(() => {
		const image = data.article.cover_image_url || '';
		if (!image) return '';
		try {
			return new URL(image, page.url.origin).toString();
		} catch {
			return image;
		}
	});
	/** @type {any} */
	const optimizedArticleImage = $derived(
		optimizedImageUrl(data.article.cover_image_url, { width: 1200, height: 600, quality: 68 })
	);
	/** @type {any} */
	const seoStructuredData = $derived.by(() => {
		const categoryUrl = buildAbsoluteUrl(
			page.url.origin,
			`/learn/category/${data.article.category_slug}`
		);
		/** @type {any} */
		const breadcrumbs = {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Learn',
					item: buildAbsoluteUrl(page.url.origin, '/learn')
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: data.article.category_name || 'Category',
					item: categoryUrl
				},
				{
					'@type': 'ListItem',
					position: 3,
					name: seoTitle,
					item: seoCanonical
				}
			]
		};
		/** @type {any} */
		const article = {
			'@context': 'https://schema.org',
			'@type': 'Article',
			headline: seoTitle,
			description: seoDescription,
			url: seoCanonical,
			mainEntityOfPage: seoCanonical,
			image: seoImage || undefined,
			articleSection: data.article.category_name || undefined,
			datePublished: data.article.created_at || data.article.updated_at || undefined,
			dateModified: data.viewingRevision?.createdAt || data.article.updated_at || undefined,
			author:
				data.article.authorProfile?.full_name || data.article.authorProfile?.email
					? {
							'@type': 'Person',
							name: data.article.authorProfile?.full_name || data.article.authorProfile?.email
						}
					: undefined,
			publisher: {
				'@type': 'Organization',
				name: '3 Feet Please',
				url: buildAbsoluteUrl(page.url.origin, '/')
			}
		};
		return toJsonLd([breadcrumbs, article]);
	});

	/**
	 * @param {any} value
	 * @param {any} [withTime]
	 */
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
	<title>{seoTitle} · Learn | 3 Feet Please</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content={data.viewingRevision
			? 'noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
			: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="3 Feet Please" />
	<meta property="og:title" content={`${seoTitle} · Learn | 3 Feet Please`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={seoCanonical} />
	{#if seoImage}
		<meta property="og:image" content={seoImage} />
	{/if}

	<meta name="twitter:card" content={seoImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={`${seoTitle} · Learn | 3 Feet Please`} />
	<meta name="twitter:description" content={seoDescription} />
	{#if seoImage}
		<meta name="twitter:image" content={seoImage} />
	{/if}

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<!-- Reading progress bar (fixed to viewport top) -->
<div class="progress-bar-track" aria-hidden="true">
	<div class="progress-bar-fill" style="width: {scrollProgress * 100}%"></div>
</div>

<div class="flex flex-col">
	{#if authRequired}
		<section
			class="bg-tertiary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10"
			aria-labelledby="learn-edit-auth-heading"
		>
			<div class="flex flex-col gap-1">
				<h2 id="learn-edit-auth-heading" class="m-0 text-xl font-black uppercase">
					Sign in to edit this guide
				</h2>
				<p class="m-0 text-sm font-medium">
					After signing in, return here and choose Edit guide to continue.
				</p>
			</div>
			<button
				type="button"
				class="bg-surface-950 text-primary-500 hover:bg-surface-50 inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase transition"
				onclick={() => window.dispatchEvent(new Event('open-login'))}
			>
				Log in / Register
			</button>
		</section>
	{/if}
	<!-- ═══ ARTICLE HERO ══════════════════════════════════════════════════ -->
	<header
		class="bg-primary-500 text-surface-950 {data.article.cover_image_url
			? 'grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]'
			: ''}"
	>
		<div
			class="flex flex-col justify-between gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center gap-2">
				<a
					href="/learn"
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 border-2 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase transition hover:no-underline"
				>
					Learn
				</a>
				<span class="text-xs font-black" aria-hidden="true">/</span>
				<a
					href={`/learn/category/${data.article.category_slug}`}
					class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase transition hover:no-underline"
				>
					{data.article.category_name}
				</a>
				<span
					class="bg-tertiary-500 text-surface-950 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase"
				>
					<IconHistory class="h-3.5 w-3.5" />
					v{data.article.last_revision_number}
				</span>
				{#if data.viewingRevision}
					<span
						class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase"
					>
						Viewing revision {data.viewingRevision.revisionNumber}
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-5">
				<h1
					class="text-surface-950! m-0 text-[clamp(2.4rem,5.5vw,5.25rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					{data.article.title}
				</h1>

				{#if data.article.summary}
					<p class="m-0 max-w-3xl text-lg leading-snug font-medium text-balance sm:text-2xl">
						{data.article.summary}
					</p>
				{/if}
			</div>

			<div
				class="border-surface-950 flex flex-wrap items-center justify-between gap-4 border-t-[3px] pt-5"
			>
				<div
					class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-black tracking-[0.16em] uppercase"
				>
					<span class="flex items-center gap-2">
						<IconClock3 class="h-4 w-4" />
						Updated {formatDate(data.article.updated_at)}
					</span>
					<span class="bg-surface-950 text-primary-500 px-2.5 py-1">
						{data.article.estimatedReadMinutes} min read
					</span>
					<span>
						Created by {data.article.authorProfile?.full_name ||
							data.article.authorProfile?.email ||
							'Community member'}
					</span>
				</div>

				<ShareButton title={seoTitle} text={seoDescription} url={seoCanonical} kind="article" />
			</div>
		</div>

		{#if data.article.cover_image_url}
			<div
				class="bg-surface-950 border-surface-950 relative min-h-[20rem] border-t-[3px] sm:min-h-[26rem] lg:border-t-0 lg:border-l-[3px]"
			>
				<img
					class="absolute inset-0 h-full w-full object-cover"
					src={optimizedArticleImage}
					alt={data.article.title}
					width="1200"
					height="600"
					decoding="async"
				/>
				<!-- Signature: the 3-foot ruler -->
				<div
					class="bg-tertiary-500 text-surface-950 absolute inset-y-0 left-0 flex w-10 flex-col items-center justify-between py-4 sm:w-12"
					aria-hidden="true"
				>
					<span class="text-sm leading-none font-black italic sm:text-lg">3FT</span>
					<span
						class="my-3 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
					></span>
					<span class="text-sm leading-none font-black italic sm:text-lg">0</span>
				</div>
			</div>
		{/if}
	</header>

	<!-- ── VIEWING REVISION BANNER ────────────────────────────────── -->
	{#if data.viewingRevision}
		<div
			class="bg-tertiary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-sm font-bold sm:px-10 lg:px-14"
		>
			<span>
				This page is showing revision {data.viewingRevision.revisionNumber} from
				{formatDate(data.viewingRevision.createdAt, true)}.
			</span>
			<a
				class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
				href={`/learn/${data.article.slug}`}
			>
				Return to the latest version
			</a>
		</div>
	{/if}

	<!-- ── KEY TAKEAWAYS BAND ─────────────────────────────────────── -->
	{#if data.article.keyTakeaways?.length}
		<section
			class="bg-secondary-500 text-surface-50 px-6 py-10 sm:px-10 lg:px-14 lg:py-12"
			aria-label="Key Takeaways"
		>
			<div class="mx-auto flex max-w-6xl flex-col gap-6">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconSparkle class="h-4 w-4" />
					<span>Key Takeaways</span>
				</p>
				<ol class="border-surface-50 m-0 grid list-none gap-6 border-t-2 p-0 pt-6 md:grid-cols-2">
					{#each data.article.keyTakeaways as takeaway, idx}
						<li class="flex items-start gap-4">
							<span
								class="text-primary-500 shrink-0 text-3xl leading-none font-black italic tabular-nums"
								aria-hidden="true"
							>
								{String(idx + 1).padStart(2, '0')}
							</span>
							<span class="text-base leading-relaxed font-medium">{takeaway}</span>
						</li>
					{/each}
				</ol>
			</div>
		</section>
	{/if}

	<!-- ═══ MAIN ARTICLE BODY + SIDEBAR ══════════════════════════════════ -->
	<div class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16" bind:this={articleEl}>
		<div class="article-page-root">
			<div class="article-main">
				{#if !data.viewingRevision}
					<ArticleAssistant articleSlug={data.article.slug} />
				{/if}

				<!-- ── MOBILE-ONLY TOC ACCORDION ──────────────────────────────── -->
				{#if tocHeadingsMobile.length}
					<details class="border-surface-800 bg-surface-950 border-2 xl:hidden">
						<summary
							class="hover:bg-primary-500 hover:text-surface-950 flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-xs font-black tracking-[0.2em] uppercase transition [&::-webkit-details-marker]:hidden"
						>
							<span class="flex items-center gap-2">
								<IconListTree class="h-4 w-4" />
								<span>On this page</span>
							</span>
							<IconChevronDown class="toc-accordion-chevron h-4 w-4" />
						</summary>
						<nav class="border-surface-800 flex flex-col border-t-2 p-3">
							{#each tocHeadingsMobile as heading}
								<a
									class="text-surface-300 hover:bg-primary-500 hover:text-surface-950 px-3 py-2 text-sm font-bold transition hover:no-underline {heading.depth >
									1
										? 'pl-6 text-xs'
										: ''}"
									href={`#${heading.id}`}
									onclick={() => {
										const el = document.querySelector('details.xl\\:hidden');
										if (el) el.removeAttribute('open');
									}}
								>
									{heading.text}
								</a>
							{/each}
						</nav>
					</details>
				{/if}

				<!-- ── ARTICLE BODY ────────────────────────────────────────────── -->
				<div class="learn-article-body border-surface-800 border-t-2 pt-8">
					{#key data.article.bodyHtml}
						<div class="prose prose-invert learn-prose max-w-none" bind:this={proseEl}>
							{@html data.article.bodyHtml}
						</div>
					{/key}
				</div>

				<!-- ── ATTACHED MEDIA ──────────────────────────────────────────── -->
				{#if data.article.assets.some((asset) => asset.usage_kind !== 'embedded')}
					<details class="border-surface-800 bg-surface-950 border-2">
						<summary
							class="hover:bg-primary-500 hover:text-surface-950 flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-black uppercase transition [&::-webkit-details-marker]:hidden"
						>
							<span>Attached media</span>
							<span class="flex items-center gap-2 text-xs font-bold tracking-[0.18em]">
								{data.article.assets.filter((asset) => asset.usage_kind !== 'embedded').length} files
								<IconChevronDown class="h-4 w-4" />
							</span>
						</summary>
						<div class="border-surface-800 flex flex-col border-t-2">
							{#each data.article.assets.filter((asset) => asset.usage_kind !== 'embedded') as asset}
								<a
									class="border-surface-800 hover:bg-primary-500 hover:text-surface-950 flex items-center justify-between gap-4 border-b p-4 text-sm transition last:border-b-0 hover:no-underline"
									href={asset.public_url}
									target="_blank"
									rel="noreferrer"
								>
									<span class="font-black uppercase">{asset.file_name}</span>
									<span class="text-xs font-bold uppercase opacity-75">
										{asset.mime_type || 'file'}
									</span>
								</a>
							{/each}
						</div>
					</details>
				{/if}
			</div>

			<!-- ═══ DESKTOP TOC SIDEBAR (xl+) ════════════════════════════════════ -->
			{#if tocHeadingsDesktop.length}
				<aside class="hidden xl:block">
					<div class="toc-panel">
						<div class="toc-sidebar-label">
							<IconListTree class="h-3.5 w-3.5" />
							On this page
						</div>
						<nav class="toc-sidebar-nav">
							{#each tocHeadingsDesktop as heading}
								<a
									class={`toc-sidebar-link ${heading.depth === 2 ? 'toc-sidebar-link-h2' : ''} ${heading.depth === 3 ? 'toc-sidebar-link-h3' : ''} ${activeHeadingId === heading.id ? 'toc-sidebar-link-active' : ''}`}
									href={`#${heading.id}`}
								>
									{heading.text}
								</a>
							{/each}
						</nav>
					</div>
				</aside>
			{/if}
		</div>
	</div>

	<!-- ── RELATED ARTICLES ───────────────────────────────────────── -->
	{#if data.relatedArticles.length}
		<section
			class="bg-tertiary-500 text-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="related-heading"
		>
			<div class="flex flex-col gap-8">
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div class="flex flex-col gap-2">
						<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Keep reading</p>
						<h2
							id="related-heading"
							class="text-surface-950! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
						>
							More in {data.article.category_name}
						</h2>
					</div>
					<a
						href={`/learn/category/${data.article.category_slug}`}
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center gap-2 border-b-[3px] pb-1 text-sm font-black uppercase hover:no-underline"
					>
						View category <IconArrowRight class="h-4 w-4" />
					</a>
				</div>

				<div
					class="border-surface-950 grid border-t-[3px] border-l-[3px] sm:grid-cols-2 lg:grid-cols-4"
				>
					{#each data.relatedArticles as related, idx}
						<a
							class="group bg-tertiary-500 text-surface-950 border-surface-950 hover:bg-surface-950 hover:text-primary-500 flex min-h-48 flex-col justify-between gap-6 border-r-[3px] border-b-[3px] p-6 transition hover:no-underline"
							href={`/learn/${related.slug}`}
						>
							<div class="flex flex-col gap-3">
								<span class="text-2xl leading-none font-black italic tabular-nums">
									{String(idx + 1).padStart(2, '0')}
								</span>
								<div class="text-xl leading-tight font-black uppercase">{related.title}</div>
								<p class="m-0 line-clamp-3 text-sm leading-relaxed font-medium opacity-85">
									{related.summary || 'Open article'}
								</p>
							</div>
							<span
								class="inline-flex items-center gap-1.5 text-xs font-black tracking-wider uppercase"
							>
								Read guide
								<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
							</span>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- ── DISCUSSION & VERSION HISTORY ──────────────────────────── -->
	<section
		class="bg-surface-950 border-surface-800 border-t-2 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
	>
		<div class="mx-auto flex max-w-5xl flex-col gap-8">
			<details class="border-surface-50 bg-surface-950 border-2">
				<summary
					class="hover:bg-primary-500 hover:text-surface-950 flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-lg font-black uppercase transition [&::-webkit-details-marker]:hidden"
				>
					<span class="flex items-center gap-3">
						<IconMessageSquareText class="h-5 w-5" /> Discussion
					</span>
					<span class="flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase">
						{data.article.comments.length} comments
						<IconChevronDown class="h-4 w-4" />
					</span>
				</summary>

				<div class="border-surface-800 flex flex-col gap-6 border-t-2 p-6">
					{#if data.currentUser}
						<form class="flex flex-col gap-3" method="POST" action="?/comment">
							<textarea
								class="border-surface-50 bg-surface-950 text-surface-50 placeholder:text-surface-300 focus:border-primary-500 focus-visible:outline-primary-500 min-h-32 w-full border-2 p-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
								name="bodyMarkdown"
								placeholder="Share context, corrections, follow-up questions, or examples from your city."
							></textarea>
							{#if form?.commentError}
								<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold">
									{form.commentError}
								</p>
							{/if}
							{#if form?.commentSuccess}
								<p class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold">
									Comment added.
								</p>
							{/if}
							<button
								class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 self-start px-7 py-3 text-sm font-black tracking-wide uppercase transition"
								type="submit"
							>
								Post comment
							</button>
						</form>
					{:else}
						<div class="border-surface-800 text-surface-300 border-2 p-5 text-sm font-medium">
							Sign in with a registered account to comment or edit the article.
						</div>
					{/if}

					<div class="flex flex-col">
						{#each data.article.comments as comment}
							<div class="border-surface-800 border-t py-5 first:border-t-0">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<p class="text-primary-500 m-0 text-sm font-black uppercase">
										{comment.authorProfile?.full_name ||
											comment.authorProfile?.email ||
											'Community member'}
									</p>
									<p class="text-surface-300 m-0 text-xs font-bold uppercase">
										{formatDate(comment.created_at, true)}
									</p>
								</div>
								<div class="prose prose-invert mt-3 max-w-none">
									{@html comment.bodyHtml}
								</div>
							</div>
						{/each}

						{#if !data.article.comments.length}
							<div class="border-surface-800 text-surface-300 border-t py-6 text-sm">
								No comments yet. Start the discussion with implementation notes, questions, or local
								examples.
							</div>
						{/if}
					</div>
				</div>
			</details>

			<div class="border-surface-50 bg-surface-950 border-2">
				<button
					type="button"
					class="hover:bg-primary-500 hover:text-surface-950 flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition"
					onclick={() => (showVersionHistory = !showVersionHistory)}
					aria-expanded={showVersionHistory}
					aria-controls="learn-version-history"
				>
					<span class="flex items-center gap-3">
						<IconHistory class="h-5 w-5" />
						<span class="text-lg font-black uppercase">Version history</span>
					</span>
					<span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase">
						{data.article.revisions.length} revisions
						<IconChevronDown
							class={`h-4 w-4 transition-transform duration-200 ${showVersionHistory ? 'rotate-180' : ''}`}
						/>
					</span>
				</button>

				{#if showVersionHistory}
					<div id="learn-version-history" class="border-surface-800 flex flex-col border-t-2">
						{#each data.article.revisions as revision}
							<div
								class="border-surface-800 flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-b-0"
							>
								<a
									class="group min-w-0 flex-1 hover:no-underline"
									href={`/learn/${data.article.slug}?revision=${revision.id}`}
								>
									<div class="flex flex-wrap items-center gap-3">
										<span
											class="text-primary-500 group-hover:text-tertiary-500 text-base font-black uppercase"
										>
											Revision {revision.revision_number}
										</span>
										<span class="text-surface-300 text-xs font-bold uppercase">
											{formatDate(revision.created_at)}
										</span>
									</div>
									<p class="text-surface-300 m-0 mt-1 text-sm">
										{revision.authorProfile?.full_name ||
											revision.authorProfile?.email ||
											'Community member'}
									</p>
									{#if data.canEdit}
										<p
											class="text-tertiary-500 m-0 mt-2 text-xs font-bold tracking-[0.2em] uppercase"
										>
											Restore from edit screen
										</p>
									{/if}
								</a>
								{#if data.canEdit}
									<a
										class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 border-2 px-4 py-2 text-xs font-black tracking-wider uppercase transition hover:no-underline"
										href={`/learn/${data.article.slug}/edit?fromRevision=${revision.id}`}
									>
										Open this revision in editor
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
</div>

<style>
	/* ── Page layout ── */
	.article-page-root {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.5rem;
		width: 100%;
		max-width: 82rem;
		margin: 0 auto;
	}

	@media (min-width: 1280px) {
		.article-page-root {
			grid-template-columns: minmax(0, 1fr) 260px;
		}
	}

	.article-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* ── Reading progress bar (fixed to viewport top) ── */
	.progress-bar-track {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 60;
		height: 4px;
		pointer-events: none;
		background: var(--color-surface-950);
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-tertiary-500);
		transition: width 0.1s linear;
	}

	.toc-panel {
		position: sticky;
		top: 8.125rem;
		max-height: calc(100vh - 9rem);
		overflow-y: auto;
		scrollbar-width: thin;
		border: 2px solid var(--color-surface-800);
		background: var(--color-surface-950);
		padding: 1.125rem;
	}

	.toc-sidebar-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		font-weight: 900;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-primary-500);
		margin-bottom: 0.75rem;
		padding-bottom: 0.625rem;
		border-bottom: 2px solid var(--color-surface-800);
	}

	.toc-sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toc-sidebar-link {
		display: block;
		padding: 0.35rem 0.625rem;
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.4;
		color: var(--color-surface-300);
		border-left: 3px solid transparent;
		transition:
			background 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.toc-sidebar-link:hover {
		color: var(--color-surface-950);
		background: var(--color-primary-500);
	}

	.toc-sidebar-link-h2 {
		padding-left: 1rem;
		font-size: 0.775rem;
	}

	.toc-sidebar-link-h3 {
		padding-left: 1.625rem;
		font-size: 0.75rem;
	}

	.toc-sidebar-link-active {
		border-left-color: var(--color-tertiary-500);
		color: var(--color-primary-500);
		background: var(--color-surface-900);
	}

	/* ── Prose styles ── */
	.learn-prose :global(h1),
	.learn-prose :global(h2),
	.learn-prose :global(h3),
	.learn-prose :global(h4) {
		text-align: left;
		scroll-margin-top: 8rem;
	}

	.learn-prose {
		font-size: clamp(1rem, 1.2vw, 1.125rem);
		line-height: 1.85;
	}

	.learn-prose :global(p),
	.learn-prose :global(ul),
	.learn-prose :global(ol),
	.learn-prose :global(blockquote) {
		max-width: min(100%, 72ch);
	}

	.learn-prose :global(li) {
		min-width: 0;
		max-width: 100%;
	}

	.learn-prose :global(h2) {
		margin-top: 2.5em;
		margin-bottom: 0.65em;
		font-size: clamp(1.5rem, 2.2vw, 2rem);
		line-height: 1.1;
		border-top: 2px solid var(--color-surface-800);
		padding-top: 1em;
	}

	.learn-prose :global(h3) {
		margin-top: 2em;
		margin-bottom: 0.5em;
		font-size: clamp(1.2rem, 1.6vw, 1.45rem);
	}

	.learn-prose :global(li + li) {
		margin-top: 0.45em;
	}

	.learn-prose :global(a) {
		overflow-wrap: anywhere;
		color: var(--color-primary-500);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.learn-prose :global(pre),
	.learn-prose :global(code) {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.learn-prose :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		border: 2px solid var(--color-surface-800);
		background: var(--color-surface-900);
		padding: 1rem;
	}

	.learn-prose :global(.learn-pre-block) {
		margin: 1.5rem 0;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		border: 2px solid var(--color-surface-800);
		background: var(--color-surface-900);
	}

	.learn-prose :global(.learn-pre-block > pre) {
		margin: 0;
		border: 0;
	}

	.learn-prose :global(.learn-pre-header) {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		border-bottom: 2px solid var(--color-surface-800);
		background: var(--color-surface-950);
	}

	.learn-prose :global(.learn-copy-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		min-width: 2.75rem;
		padding: 0.5rem 1rem;
		border: 0;
		border-left: 2px solid var(--color-surface-800);
		border-radius: 0;
		box-shadow: none;
		background: var(--color-primary-500);
		color: var(--color-surface-950);
		font-size: 0.75rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.learn-prose :global(.learn-copy-btn:hover) {
		background: var(--color-tertiary-500);
		color: var(--color-surface-950);
	}

	.learn-prose :global(.learn-copy-btn[data-copy-state='copied']) {
		background: var(--color-success-500);
		color: var(--color-surface-950);
	}

	.learn-prose :global(.learn-copy-btn[data-copy-state='selected']) {
		background: var(--color-warning-500);
		color: var(--color-surface-950);
	}

	.learn-prose :global(.learn-copy-btn:focus-visible) {
		outline: 2px solid var(--color-surface-50);
		outline-offset: -2px;
	}

	.learn-prose :global(.learn-table-wrap) {
		margin: 1.75rem 0;
		width: 100%;
		max-width: 100%;
		min-width: 0;
	}

	.learn-prose :global(li .learn-table-wrap),
	.learn-prose :global(li .learn-pre-block) {
		margin: 1rem 0;
	}

	.learn-prose :global(.learn-table-cue) {
		display: none;
		padding: 0.45rem 0.75rem;
		background: var(--color-primary-500);
		color: var(--color-surface-950);
		font-size: 0.7rem;
		font-weight: 900;
		line-height: 1.3;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.learn-prose :global(.learn-table-wrap[data-overflowing='true'] > .learn-table-cue) {
		display: block;
	}

	.learn-prose :global(.learn-table-scroll) {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		overflow-x: auto;
	}

	.learn-prose :global(.learn-table-wrap[data-can-scroll-right='true'] > .learn-table-scroll) {
		border-right: 4px solid var(--color-primary-500);
	}

	.learn-prose :global(.learn-table-scroll:focus-visible) {
		outline: 2px solid var(--color-primary-500);
		outline-offset: 2px;
	}

	.learn-prose :global(table) {
		display: block;
		width: max-content;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
	}

	.learn-prose :global(.learn-table-scroll > table) {
		display: table;
		max-width: none;
		margin: 0;
		overflow-x: visible;
	}

	.learn-prose :global(th),
	.learn-prose :global(td) {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-surface-800);
	}

	@media (max-width: 639.98px) {
		.learn-prose :global(table[data-stackable='true']),
		.learn-prose :global(.learn-table-scroll > table[data-stackable='true']) {
			display: block;
			width: 100%;
			max-width: 100%;
			overflow-x: visible;
		}

		.learn-prose :global(table[data-stackable='true'] > thead) {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			clip-path: inset(50%);
			white-space: nowrap;
			border: 0;
		}

		.learn-prose :global(table[data-stackable='true'] > tbody) {
			display: block;
			width: 100%;
		}

		.learn-prose :global(table[data-stackable='true'] > tbody > tr),
		.learn-prose :global(table[data-stackable='true'] > tr) {
			display: block;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			border: 2px solid var(--color-surface-800);
			background: var(--color-surface-950);
		}

		.learn-prose :global(table[data-stackable='true'] > tbody > tr + tr),
		.learn-prose :global(table[data-stackable='true'] > tr + tr) {
			margin-top: 0.75rem;
		}

		.learn-prose :global(table[data-stackable='true'] > tbody > tr > td),
		.learn-prose :global(table[data-stackable='true'] > tr > td),
		.learn-prose :global(table[data-stackable='true'] > tbody > tr > th),
		.learn-prose :global(table[data-stackable='true'] > tr > th) {
			display: block;
			width: 100%;
			max-width: 100%;
			min-width: 0;
			box-sizing: border-box;
			padding: 0.625rem 0.75rem;
			border: 0;
			border-bottom: 1px solid var(--color-surface-800);
			overflow-wrap: anywhere;
			word-break: break-word;
		}

		.learn-prose :global(table[data-stackable='true'] > tbody > tr > :last-child),
		.learn-prose :global(table[data-stackable='true'] > tr > :last-child) {
			border-bottom: 0;
		}

		.learn-prose :global(table[data-stackable='true'] td[data-label]::before) {
			content: attr(data-label);
			display: block;
			margin-bottom: 0.25rem;
			color: var(--color-primary-500);
			font-size: 0.7rem;
			font-weight: 800;
			line-height: 1.35;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			white-space: normal;
			overflow-wrap: anywhere;
			word-break: break-word;
		}

		.learn-prose :global(table[data-stackable='true'] td:empty::after) {
			content: '\00a0';
			display: block;
			min-height: 1.25rem;
		}
	}

	@media print {
		.learn-prose :global(.learn-pre-header),
		.learn-prose :global(.learn-copy-btn),
		.learn-prose :global(.learn-table-cue) {
			display: none !important;
		}
	}

	.learn-prose :global(img) {
		max-width: min(100%, 58rem);
		margin-inline: auto;
	}
</style>
