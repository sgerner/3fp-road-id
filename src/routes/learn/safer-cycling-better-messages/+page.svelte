<script>
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import CampaignPlanner from '#lib/components/safety-report/CampaignPlanner.svelte';
	import EncounterLab from '#lib/components/safety-report/EncounterLab.svelte';
	import DesignGallery from '#lib/components/safety-report/DesignGallery.svelte';
	import EvidenceExplorer from '#lib/components/safety-report/EvidenceExplorer.svelte';
	import ReportAssistant from '#lib/components/safety-report/ReportAssistant.svelte';

	let { data } = $props();
	const report = $derived(data.report);
	let query = $state('');
	let active = $state('start');
	let currentTopic = $state('');
	let assistant;
	let motionReady = $state(false);
	const navigation = [
		['start', 'Key takeaways'],
		['campaign-planner', 'Build a campaign'],
		['read', 'Full review'],
		['evidence', 'Evidence'],
		['gallery', 'Visual library'],
		['assistant', 'Ask the report']
	];

	const heroImages = $derived(
		[
			report.campaignGallery.find((i) => i.id === '01-give-people-space-poster-v9-page-01'),
			report.campaignGallery.find(
				(i) => i.campaign === '03-a-person-on-a-bike' && i.kind === 'poster'
			),
			report.campaignGallery.find((i) => i.campaign === '05-light-the-ride' && i.kind === 'poster')
		].filter(Boolean)
	);
	const searchEntries = $derived([
		...report.sections
			.filter((s) => s.id !== 'references')
			.map((s) => ({
				id: s.id,
				title: s.title.replace(/^\d+\.\s*/, ''),
				kind: 'Chapter',
				text: s.plainText,
				target: s.id
			})),
		...report.sources.map((s) => ({
			id: s.record,
			title: `${s.record} · ${s.title}`,
			kind: 'Study / guidance',
			text: `${s.authors} ${s.year} ${s.endpoint} ${s.finding} ${s.limits}`,
			target: `ref-${s.record}`
		})),
		...report.figures.map((f) => ({
			id: f.id,
			title: f.title,
			kind: f.kind === 'print' ? 'Print example' : 'Visual explanation',
			text: `${f.alt} ${f.caption} ${f.topic}`,
			target: f.id
		}))
	]);
	const results = $derived.by(() => {
		const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
		if (!terms.length) return [];
		return searchEntries
			.map((item) => {
				const title = item.title.toLowerCase();
				const body = item.text.toLowerCase();
				const score = terms.reduce(
					(sum, term) => sum + (title.includes(term) ? 8 : body.includes(term) ? 1 : 0),
					0
				);
				const first =
					terms
						.map((term) => body.indexOf(term))
						.filter((index) => index >= 0)
						.sort((a, b) => a - b)[0] ?? 0;
				const start = Math.max(0, first - 65);
				const excerpt = `${start ? '…' : ''}${item.text.slice(start, start + 220)}${item.text.length > start + 220 ? '…' : ''}`;
				return { ...item, score, excerpt };
			})
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 12);
	});

	function reveal(id, scroll = true) {
		const target = document.getElementById(id);
		if (!target) return;
		let ancestor = target;
		while (ancestor) {
			if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
			ancestor = ancestor.parentElement;
		}
		if (scroll)
			requestAnimationFrame(() =>
				target.scrollIntoView({
					behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
					block: 'start'
				})
			);
	}
	function navigateTo(id) {
		window.history.replaceState(null, '', `#${id}`);
		reveal(id);
	}
	function followHash() {
		if (typeof window === 'undefined' || !window.location.hash) return;
		try {
			reveal(decodeURIComponent(window.location.hash.slice(1)));
		} catch {
			/* Ignore malformed fragments. */
		}
	}
	function openChapters(open) {
		document.querySelectorAll('.report-reading > details').forEach((el) => {
			el.open = open;
		});
	}
	async function askReport(question) {
		navigateTo('assistant');
		await tick();
		assistant?.ask(question);
	}
	function chapterLinks(section) {
		return [...section.html.matchAll(/<h3 id="([^"]+)">([\s\S]*?)<\/h3>/g)].map((match) => ({
			id: match[1],
			title: match[2].replace(/<[^>]*>/g, '')
		}));
	}
	function chapterParts(section) {
		const html = chapterHtml(section);
		const index = html.indexOf('<h3');
		return [html.slice(0, index), html.slice(index)];
	}
	function chapterHtml(section) {
		return section.html
			.replace(new RegExp(`<h2 id="${section.id}">[\\s\\S]*?<\\/h2>`), '')
			.replaceAll('<img ', '<img loading="lazy" decoding="async" ');
	}
	onMount(() => {
		followHash();
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		motionReady = !reduceMotion;
		let revealObserver;
		if (!reduceMotion && 'IntersectionObserver' in window) {
			revealObserver = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							entry.target.classList.add('is-visible');
							revealObserver.unobserve(entry.target);
						}
					}
				},
				{ rootMargin: '0px 0px -8% 0px', threshold: 0.01 }
			);
			for (const el of document.querySelectorAll('.report-page .motion-reveal'))
				revealObserver.observe(el);
		}
		// Track section starts, including sections taller than the viewport.
		let frame = 0;
		const updateActive = () => {
			frame = 0;
			let current = navigation[0][0];
			for (const [id] of navigation) {
				const element = document.getElementById(id);
				if (element && element.getBoundingClientRect().top <= 165) current = id;
			}
			active = current;
			for (const section of report.sections) {
				const element = document.getElementById(section.id);
				if (element instanceof HTMLDetailsElement && element.open) {
					const rect = element.getBoundingClientRect();
					if (rect.top <= 220 && rect.bottom > 220)
						currentTopic = section.title.replace(/^\d+\.\s*/, '');
				}
			}
		};
		const queueActive = () => {
			if (!frame) frame = requestAnimationFrame(updateActive);
		};
		window.addEventListener('scroll', queueActive, { passive: true });
		window.addEventListener('resize', queueActive);
		queueActive();
		return () => {
			window.removeEventListener('scroll', queueActive);
			window.removeEventListener('resize', queueActive);
			cancelAnimationFrame(frame);
			revealObserver?.disconnect();
		};
	});
</script>

<svelte:window onhashchange={followHash} />
<svelte:head>
	<title>Safer Cycling, Better Messages · Interactive research · 3 Feet Please</title>
	<meta
		name="description"
		content="Build a cycling safety campaign with clear actions and real support. Explore 68 sources, interactive road scenes, design galleries, practical tools and the complete research review."
	/>
	<link rel="canonical" href="https://3fp.org/learn/safer-cycling-better-messages" />
	<meta property="og:title" content="Safer Cycling, Better Messages" />
	<meta
		property="og:description"
		content="The research, the examples, and the tools to make your next campaign more useful."
	/>
	<meta property="og:type" content="article" />
	<meta property="og:url" content="https://3fp.org/learn/safer-cycling-better-messages" />
	{#if heroImages[0]}<meta
			property="og:image"
			content={`https://3fp.org${heroImages[0].src}`}
		/>{/if}
</svelte:head>

<div class="report-page">
	<a class="skip-report" href="#start">Skip to the report</a>
	<div class="download-bar">
		<a href="/learn" class="back-link">← Learn library</a>
		<div class="download-links" aria-label="Download the report">
			<a href={report.meta.quickPdfUrl} target="_blank" rel="noopener"
				>One-page quick guide <span>PDF ↗</span></a
			>
			<a href={report.meta.fullPdfUrl} target="_blank" rel="noopener"
				>Full research report <span>PDF ↗</span></a
			>
		</div>
	</div>

	<header class="report-hero" class:motion-ready={motionReady}>
		<div class="hero-copy">
			<p class="kicker"><span></span> 3 FEET PLEASE / OPEN RESEARCH</p>
			<h1>Safer cycling.<br /><em>Better messages.</em></h1>
			<p class="hero-deck">
				Build a campaign with clear actions<br class="wide-only" /> and practical help.
			</p>
			<p class="hero-description">
				This review brings together research on safety messages, riding education, and support.
				Start with seven practical decisions, then explore the examples and evidence.
			</p>
			<div class="hero-actions">
				<a href="#start" class="primary-link">Start with the key takeaways <span>↓</span></a><a
					href="#assistant"
					class="text-link">Ask the report ↗</a
				>
			</div>
			<div class="edition">
				Evidence reviewed through 28 October 2026 <span>•</span> Public edition 4.4 <span>•</span> Updated
				1 November 2026
			</div>
		</div>
		<div class="hero-art" aria-label="Examples from the campaign library">
			{#each heroImages as image, i}<a
					href="#gallery"
					class={`hero-poster poster-${i}`}
					aria-label={`Explore ${image.title}`}
					><img
						src={image.src}
						alt={image.alt}
						loading={i === 0 ? 'eager' : 'lazy'}
						fetchpriority={i === 0 ? 'high' : 'auto'}
					/><span
						>{i === 0 ? 'A CLEAR ACTION' : i === 1 ? 'A HUMAN CONNECTION' : 'PRACTICAL HELP'}</span
					></a
				>{/each}
			<div class="art-note"><span>✳</span> Ideas to adapt.<br />Questions to test.</div>
		</div>
	</header>

	<nav class="report-nav" aria-label="Report navigation">
		{#each navigation as [id, label]}<a
				href={`#${id}`}
				aria-current={active === id ? 'location' : undefined}>{label}</a
			>{/each}
	</nav>

	<section id="start" class="start-section section-pad motion-reveal">
		<p class="template-notice">
			<strong>Make these examples local.</strong> Campaign images are AI generated. Images, logos, website
			addresses and QR codes are design placeholders. Customize the Canva templates with locally appropriate
			images, road rules and working links before sharing.
		</p>
		<div class="takeaways-intro">
			<p class="kicker">THE RESEARCH / PUT IT TO WORK</p>
			<h2>Make a safety message<br /><em>people can use.</em></h2>
			<p>
				For community advocates, local groups, and anyone making a safety campaign: give people one
				clear action and a practical way to take it. Start with these steps from the one-page guide.
			</p>
		</div>
		<ol class="quick-takeaways" aria-label="Seven decisions for a useful safety campaign">
			{#each report.quickGuide.steps as step, i}
				<li>
					<span class="takeaway-number" aria-hidden="true"
						>{String(step.number).padStart(2, '0')}</span
					>
					<div>
						<h3>{step.title}</h3>
						<p>{step.body}</p>
					</div>
				</li>
			{/each}
		</ol>
		<div class="takeaway-example">
			<div>
				<p class="kicker">EXAMPLE / A DRIVER PASSING A RIDER</p>
				<blockquote>“{report.quickGuide.examples[0].text}”</blockquote>
				<p>
					Show a driver waiting behind the rider. Ask a few drivers to explain when to wait before
					you print a large batch.
				</p>
			</div>
			<div class="takeaway-actions">
				<a
					class="primary-link"
					href="#chapter-4"
					onclick={(event) => {
						event.preventDefault();
						navigateTo('chapter-4');
					}}>Explore this road encounter <span aria-hidden="true">↗</span></a
				><a href={report.meta.quickPdfUrl} target="_blank" rel="noopener"
					>Keep the one-page guide · PDF ↗</a
				>
			</div>
		</div>
		<div class="report-search">
			<label for="report-search">Find a topic, a source or an example</label>
			<div class="search-line">
				<span aria-hidden="true">⌕</span><input
					id="report-search"
					type="search"
					bind:value={query}
					placeholder="Try “passing”, “fear”, “R42” or “school”"
					aria-describedby="search-hint"
				/>{#if query}<button type="button" onclick={() => (query = '')}>Clear</button>{/if}
			</div>
			<p id="search-hint">
				Search the complete review, all 68 sources and the visual explanations.
			</p>
			<div class="search-chips">
				{#each ['Passing', 'Human stories', 'Lights', 'Evaluation'] as term}<button
						type="button"
						onclick={() => (query = term)}>{term} ↗</button
					>{/each}
			</div>
			{#if query.trim()}<div class="search-results" aria-live="polite">
					<p>
						{results.length
							? `${results.length} matching results${results.length === 12 ? ' · showing the closest matches' : ''}`
							: 'No matches. Try a shorter phrase or a source ID.'}
					</p>
					{#each results as result (result.id)}<button
							type="button"
							onclick={() => navigateTo(result.target)}
							in:fly={{ y: 8, duration: 180 }}
							out:fade={{ duration: 100 }}
							><span>{result.kind}</span><strong
								>{result.title}<small class="search-excerpt">{result.excerpt}</small></strong
							><b aria-hidden="true">↗</b></button
						>{/each}
				</div>{/if}
		</div>
	</section>

	<section id="campaign-planner" class="section-pad planner-section">
		<CampaignPlanner {report} onNavigate={navigateTo} onAsk={askReport} />
	</section>

	<section id="read" class="reading-section section-pad motion-reveal">
		<div class="section-heading">
			<div>
				<p class="kicker">THE COMPLETE REVIEW</p>
				<h2>Go as deep<br /><em>as you need.</em></h2>
			</div>
			<p>
				Every chapter, study citation and visual from the report. Open a chapter to follow the
				reasoning behind a campaign choice.
			</p>
		</div>
		<div class="reading-toolbar">
			<label class="chapter-jump"
				>Chapter
				<select
					aria-label="Jump to a report chapter"
					value={report.sections.find(
						(section) => section.title.replace(/^\d+\.\s*/, '') === currentTopic
					)?.id || ''}
					onchange={(event) => navigateTo(event.currentTarget.value)}
				>
					<option value="" disabled>Choose a chapter</option>
					{#each report.sections as section}<option value={section.id}>{section.title}</option
						>{/each}
				</select>
			</label>
			<button type="button" onclick={() => openChapters(true)}>Open all chapters +</button><button
				type="button"
				onclick={() => openChapters(false)}>Close all −</button
			><a href={report.meta.fullPdfUrl} target="_blank" rel="noopener">Take the full PDF ↗</a>
		</div>
		<div class="report-reading">
			{#each report.sections as section}<details
					id={section.id}
					open={section.id === 'executive-findings'}
				>
					<summary
						><span class="chapter-number"
							>{section.number
								? String(section.number).padStart(2, '0')
								: section.id === 'references'
									? 'REF'
									: 'READ'}</span
						>
						<h3>{section.title.replace(/^\d+\.\s*/, '')}</h3>
						<span class="expand-icon" aria-hidden="true">+</span></summary
					>
					{#if chapterLinks(section).length}
						<nav class="chapter-links" aria-label={`In ${section.title}`}>
							<span>In this chapter</span>
							{#each chapterLinks(section) as link}<a
									href={`#${link.id}`}
									onclick={(event) => {
										event.preventDefault();
										navigateTo(link.id);
									}}>{link.title}</a
								>{/each}
						</nav>
					{/if}
					<div class="chapter-copy">
						{@html ['chapter-4', 'chapter-5'].includes(section.id)
							? chapterParts(section)[0]
							: chapterHtml(section)}
					</div>
					{#if section.id === 'chapter-4' || section.id === 'chapter-5'}
						<div class="chapter-interactive">
							<EncounterLab
								instanceId={section.id}
								initialMode={section.id === 'chapter-5' ? 'door' : 'passing'}
								onAsk={askReport}
							/>
						</div>
						<div class="chapter-copy">{@html chapterParts(section)[1]}</div>
					{/if}
					{#if ['chapter-4', 'chapter-5', 'chapter-6', 'chapter-9'].includes(section.id)}
						<div class="chapter-examples">
							<h4>Adapt an example for your community</h4>
							<p>
								Campaign images are AI generated. Images, logos, website addresses and QR codes are
								design placeholders. Customize these templates with locally appropriate imagery,
								accurate road rules and working local links before use.
							</p>
							<div class="chapter-example-grid">
								{#each report.campaignGallery
									.filter((item) => item.kind === 'poster' && item.page === 1 && (section.id === 'chapter-6' ? item.campaign === '03-a-person-on-a-bike' : section.id === 'chapter-9' ? item.campaign === '05-light-the-ride' : section.id === 'chapter-4' ? item.campaign.includes('give-people-space') : /door|turn/.test(item.campaign)))
									.slice(0, 2) as item}
									<article>
										<img src={item.src} alt={item.alt} loading="lazy" />
										<h5>{item.title}</h5>
										{#if item.canvaTemplateUrl}<a
												href={item.canvaTemplateUrl}
												target="_blank"
												rel="noopener">Customize in Canva ↗</a
											>{/if}
										{#if item.pdfUrl}<a href={item.pdfUrl} download>Download example PDF ↓</a>{/if}
									</article>
								{/each}
							</div>
							<a href="#gallery">Explore all example templates ↗</a>
						</div>
					{/if}
				</details>{/each}
		</div>
	</section>

	<section id="evidence" class="section-pad evidence-section motion-reveal">
		<EvidenceExplorer {report} onAsk={askReport} />
	</section>

	<section id="gallery" class="section-pad gallery-section motion-reveal">
		<DesignGallery {report} onAsk={askReport} />
	</section>

	<section id="assistant" class="section-pad assistant-section motion-reveal">
		<ReportAssistant {currentTopic} bind:this={assistant} {report} />
	</section>
	<footer class="report-footer">
		<img src="/logos/3FeetPlease_WhiteOutline.png" alt="3 Feet Please" width="64" height="64" />
		<div>
			<p>Research made useful.</p>
			<span
				>Published by 3 Feet Please. Human research design, synthesis and editing by the 3FP data
				team, with AI assistance.</span
			>
		</div>
		<a href="/learn">Back to Learn ↗</a>
	</footer>
</div>

<style>
	.report-page :global(input),
	.report-page :global(select),
	.report-page :global(textarea) {
		border-color: var(--color-secondary-400);
	}

	.report-page :global(h4),
	.report-page :global(h5) {
		color: var(--color-secondary-950);
	}

	.chapter-jump {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		font-size: 0.8rem;
		font-weight: 700;
		max-width: 100%;
	}
	.chapter-jump select {
		color: var(--ink);
		background: var(--cream);
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		padding: 0.5rem 2rem 0.5rem 0.7rem;
		max-width: 24rem;
		font-size: 0.8rem;
	}

	@media (max-width: 720px) {
		.reading-toolbar {
			position: static;
		}
		.chapter-jump {
			width: 100%;
		}
		.chapter-jump select {
			min-width: 0;
			flex: 1;
		}
	}

	.chapter-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		margin: 0 0 1.8rem 3.5rem;
		max-width: 70ch;
		padding: 1rem;
		background: var(--report-soft);
		border-radius: 0.5rem;
	}
	.chapter-links span {
		width: 100%;
		font-weight: 700;
	}
	.chapter-links a {
		font-size: 0.9rem;
		text-decoration: underline;
		color: var(--purple);
	}
	.search-excerpt {
		display: block;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--muted);
		line-height: 1.5;
	}
	.chapter-copy :global(h3),
	.report-reading > details > summary h3 {
		text-transform: none;
	}
	.chapter-copy :global([id]) {
		scroll-margin-top: 160px;
	}
	.planner-section {
		padding-top: 2rem;
		padding-bottom: 2rem;
		scroll-margin-top: 140px;
	}
	@media (max-width: 720px) {
		.chapter-links {
			margin-left: 0;
		}
	}

	.template-notice {
		padding: 1.25rem;
		border-left: 4px solid var(--color-tertiary-700-300);
		background: var(--report-soft);
		line-height: 1.6;
		margin-bottom: 2rem;
	}
	.chapter-interactive,
	.chapter-examples {
		margin: 2rem 0;
		padding: 1.5rem;
		border-radius: 20px;
		background: var(--report-paper);
	}
	.chapter-examples h4 {
		font-size: 1.5rem;
		margin: 0 0 1rem;
	}
	.chapter-example-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1.5rem;
		margin: 1.5rem 0;
	}
	.chapter-example-grid img {
		width: 100%;
		max-height: 420px;
		object-fit: contain;
	}
	.chapter-example-grid a {
		display: block;
		margin: 0.6rem 0;
	}

	.takeaways-intro {
		max-width: 48rem;
		margin-top: 2.5rem;
		margin-bottom: 2rem;
	}
	.takeaways-intro .kicker {
		color: var(--purple);
		margin-bottom: 1.2rem;
	}
	.takeaways-intro h2 {
		font-size: clamp(2.1rem, 4vw, 4rem);
		line-height: 1.05;
	}
	.takeaways-intro > p:last-child {
		margin-top: 1.2rem;
		line-height: 1.7;
		color: var(--muted);
		max-width: 43rem;
	}
	.quick-takeaways {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 2.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.quick-takeaways li {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.5rem 0;
		border-top: 1px solid var(--line);
	}
	.takeaway-number {
		flex-shrink: 0;
		color: var(--pink);
		font-size: 0.75rem;
		font-weight: 800;
		padding-top: 0.2rem;
	}
	.quick-takeaways h3 {
		font-size: 1.05rem;
		line-height: 1.4;
		letter-spacing: -0.015em;
	}
	.quick-takeaways p {
		font-size: 0.9rem;
		line-height: 1.65;
		color: var(--muted);
		margin-top: 0.5rem;
	}
	.takeaway-example {
		display: grid;
		grid-template-columns: 1.25fr 1fr;
		align-items: center;
		gap: 2rem;
		background: var(--report-soft);
		color: var(--color-surface-700);
		border-top: 5px solid var(--pink);
		padding: clamp(1.4rem, 3vw, 2.5rem);
		margin: 1.2rem 0 4rem;
	}
	.takeaway-example .kicker {
		color: var(--color-secondary-700);
		font-size: 0.6rem;
	}
	.takeaway-example blockquote {
		font-size: clamp(1.4rem, 2.5vw, 2rem);
		font-weight: 800;
		line-height: 1.25;
		margin: 1rem 0;
		letter-spacing: -0.03em;
	}
	.takeaway-example p:last-child {
		font-size: 0.85rem;
		line-height: 1.65;
		color: var(--color-surface-700);
	}
	.takeaway-actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-start;
	}
	.takeaway-actions > a:last-child {
		color: var(--color-surface-700);
		font-size: 0.78rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	@media (max-width: 720px) {
		.quick-takeaways,
		.takeaway-example {
			grid-template-columns: 1fr;
		}
		.quick-takeaways li {
			padding: 1.2rem 0;
		}
		.takeaway-example {
			gap: 1.5rem;
		}
		.takeaway-actions .primary-link {
			font-size: 0.8rem;
			gap: 0.8rem;
		}
	}

	:global(main:has(> .report-page)) {
		overflow-x: clip;
		overflow-y: visible;
	}
	.report-page h2,
	.report-page h3 {
		color: var(--ink) !important;
	}
	.report-page {
		--report-paper: var(--color-surface-50);
		--report-soft: color-mix(in srgb, var(--color-secondary-50) 24%, var(--color-surface-50));
		--report-border: var(--color-secondary-300);
		--purple: var(--color-secondary-700-300);
		--pink: var(--color-tertiary-700-300);
		--lemon: var(--color-primary-500);
		--ink: var(--color-secondary-950);
		--cream: var(--report-soft);
		--muted: var(--color-surface-700);
		--line: var(--color-secondary-200);
		margin: -1rem;
		background: var(--report-paper);
		color: var(--ink);
		font-family: Arial, Helvetica, sans-serif;
		color-scheme: light;
		overflow-wrap: anywhere;
	}
	.report-page h1,
	.report-page h2,
	.report-page h3 {
		font-family: 'Space Grotesk', Arial, sans-serif;
		color: inherit;
		margin: 0;
		letter-spacing: -0.035em;
		font-weight: 800;
	}
	.report-page p {
		margin: 0;
	}
	.report-page a {
		text-decoration: none;
	}
	.report-page button,
	.report-page input {
		font: inherit;
	}
	.report-page a:focus-visible,
	.report-page button:focus-visible,
	.report-page summary:focus-visible,
	.report-page input:focus-visible {
		outline: 3px solid var(--pink);
		outline-offset: 4px;
	}
	.skip-report {
		position: fixed;
		left: 1rem;
		top: -5rem;
		z-index: 99;
		background: var(--color-primary-100);
		color: var(--color-secondary-950);
		padding: 1rem;
	}
	.skip-report:focus {
		top: 1rem;
	}
	.download-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 1.1rem clamp(1.25rem, 4vw, 4rem);
		border-bottom: 1px solid var(--line);
		font-size: 0.82rem;
		font-weight: 700;
		background: var(--cream);
	}
	.back-link {
		color: var(--purple);
	}
	.download-links {
		display: flex;
		gap: 1.5rem;
	}
	.download-links a {
		color: var(--ink);
		display: flex;
		gap: 0.7rem;
	}
	.download-links span {
		color: var(--purple);
		font-size: 0.7rem;
		align-self: center;
	}
	.report-hero {
		padding: clamp(2rem, 5vw, 5rem) clamp(1.25rem, 4vw, 4rem) 3.5rem;
		background: var(--report-soft);
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1.5rem;
		overflow: hidden;
		color: var(--color-secondary-950);
		min-height: 650px;
		align-items: center;
	}
	.report-hero.motion-ready .hero-copy {
		animation: hero-arrive 650ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.report-hero.motion-ready .hero-poster {
		animation: poster-arrive 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.report-hero.motion-ready .poster-1 {
		animation-delay: 90ms;
	}
	.report-hero.motion-ready .poster-2 {
		animation-delay: 170ms;
	}
	@keyframes hero-arrive {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes poster-arrive {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.kicker {
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		font-weight: 800;
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.kicker > span {
		width: 23px;
		height: 5px;
		background: var(--pink);
	}
	.report-hero .kicker {
		color: var(--color-secondary-700);
		margin-bottom: 2.3rem;
	}
	.report-hero h1 {
		font-size: clamp(3.4rem, 5.8vw, 7rem);
		line-height: 0.96;
		letter-spacing: -0.06em;
		color: var(--color-secondary-950);
	}
	.report-page em {
		font-style: normal;
		color: var(--purple);
	}
	.report-hero h1 em {
		color: var(--color-secondary-700);
	}
	.hero-deck {
		font-size: clamp(1.2rem, 1.7vw, 1.65rem);
		line-height: 1.3;
		margin-top: 1.8rem !important;
		max-width: 30rem;
		font-weight: 700;
	}
	.hero-description {
		max-width: 28rem;
		margin-top: 1rem !important;
		line-height: 1.6;
		font-size: 1rem;
		color: var(--color-surface-700);
	}
	.hero-actions {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-top: 2rem;
	}
	.primary-link {
		display: inline-flex;
		align-items: center;
		gap: 2rem;
		background: var(--color-primary-100);
		color: var(--color-secondary-950);
		padding: 1rem 1.2rem;
		font-weight: 800;
		font-size: 0.9rem;
	}
	.primary-link:hover {
		background: var(--report-paper);
	}
	.text-link {
		color: var(--color-secondary-950);
		font-size: 0.85rem;
		font-weight: 700;
	}
	.text-link:hover {
		text-decoration: underline;
	}
	.edition {
		font-size: 0.65rem;
		color: var(--color-secondary-700-300);
		margin-top: 2rem;
		line-height: 1.8;
	}
	.edition span {
		padding: 0 0.5rem;
	}
	.hero-art {
		height: 490px;
		position: relative;
		margin-left: 1rem;
		perspective: 1000px;
	}
	.hero-poster {
		display: block;
		position: absolute;
		width: 48%;
		background: var(--report-paper);
		padding: 6px;
		box-shadow: 0 25px 60px color-mix(in srgb, var(--color-surface-950) 50%, transparent);
		transition: transform 0.25s;
	}
	.hero-poster img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 8.5/11;
		object-fit: cover;
	}
	.hero-poster > span {
		display: block;
		padding: 7px 5px 4px;
		color: var(--ink);
		font-size: 0.48rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.poster-0 {
		left: 2%;
		top: 45px;
		transform: rotate(-9deg);
		z-index: 2;
	}
	.poster-1 {
		right: 0;
		top: 0;
		transform: rotate(9deg);
		z-index: 1;
	}
	.poster-2 {
		right: 8%;
		top: 225px;
		width: 42%;
		transform: rotate(4deg);
		z-index: 3;
	}
	.hero-poster:hover {
		transform: rotate(0) translateY(-7px);
		z-index: 4;
	}
	.art-note {
		position: absolute;
		left: 0;
		bottom: 0;
		color: var(--color-surface-700);
		font-size: 0.78rem;
		line-height: 1.45;
		z-index: 3;
	}
	.art-note > span {
		font-size: 2.1rem;
		display: block;
		color: var(--pink);
		line-height: 1.3;
	}
	.report-nav {
		position: sticky;
		top: 73px;
		z-index: 20;
		display: flex;
		gap: 0;
		overflow-x: auto;
		background: var(--color-primary-100);
		border-bottom: 1px solid var(--ink);
		padding: 0 clamp(1rem, 3vw, 3rem);
		scrollbar-width: thin;
	}
	.report-nav a {
		flex-shrink: 0;
		color: var(--ink);
		font-weight: 700;
		font-size: 0.7rem;
		padding: 1.1rem 0.95rem;
		white-space: nowrap;
		border-bottom: 4px solid transparent;
		transition:
			background-color 160ms ease,
			border-color 160ms ease;
	}
	.report-nav a:hover,
	.report-nav a[aria-current] {
		border-color: var(--pink);
		background: color-mix(in srgb, var(--report-paper) 31%, transparent);
	}
	.section-pad {
		padding: clamp(2.75rem, 6vw, 6rem) clamp(1.25rem, 5vw, 5rem);
		scroll-margin-top: 140px;
	}
	.motion-reveal {
		opacity: 1;
		transform: none;
	}
	/* Keep all report text visible before hydration and without JavaScript. */
	.motion-reveal.is-visible {
		animation: section-arrive 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	@keyframes section-arrive {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 2rem;
		margin-bottom: 2.8rem;
	}
	.section-heading h2 {
		font-size: clamp(2.1rem, 4vw, 4.2rem);
		line-height: 1.03;
	}
	.section-heading .kicker {
		color: var(--purple);
		margin-bottom: 1.25rem;
	}
	.section-heading > p {
		max-width: 22rem;
		line-height: 1.65;
		font-size: 0.95rem;
		color: var(--muted);
	}
	.report-search {
		margin-top: 3.5rem;
	}
	.report-search > label {
		display: block;
		font-size: 1.15rem;
		font-weight: 800;
		margin-bottom: 1rem;
	}
	.search-line {
		border-bottom: 2px solid var(--purple);
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.search-line > span {
		color: var(--purple);
		font-size: 2rem;
	}
	.search-line input {
		background: transparent;
		border: 0;
		outline: 0;
		box-shadow: none;
		flex: 1;
		min-width: 0;
		padding: 0.8rem 0;
		color: var(--ink);
		font-size: 1rem;
	}
	.search-line button {
		border: 0;
		background: none;
		color: var(--purple);
		font-size: 0.8rem;
		padding: 0.5rem;
	}
	.report-search > p {
		font-size: 0.75rem;
		color: var(--muted);
		margin-top: 0.8rem;
	}
	.search-chips {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}
	.search-chips button {
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--line);
		color: var(--purple);
		font-size: 0.72rem;
		background: var(--report-paper);
	}
	.search-chips button:hover {
		border-color: var(--purple);
	}
	.search-results {
		margin-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.search-results > p {
		padding: 1rem 0;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.search-results > button {
		display: grid;
		grid-template-columns: 8rem 1fr 1rem;
		align-items: center;
		gap: 1rem;
		text-align: left;
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--line);
		padding: 1rem 0;
		background: none;
		color: var(--ink);
	}
	.search-results > button > span {
		font-size: 0.65rem;
		color: var(--purple);
	}
	.search-results strong {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.search-results b {
		color: var(--pink);
	}
	.encounter-section {
		background: var(--report-soft);
		border-top: 1px solid var(--line);
	}
	.gallery-section {
		background: var(--report-paper);
	}
	.evidence-section {
		background: var(--report-paper);
	}
	.reading-section {
		background: var(--report-paper);
		border-top: 1px solid var(--line);
	}
	.assistant-section {
		background: var(--report-soft);
		border-top: 1px solid var(--line);
	}
	.reading-toolbar {
		position: sticky;
		top: 132px;
		z-index: 12;
		background: var(--report-paper);
		display: flex;
		gap: 1.4rem;
		align-items: center;
		flex-wrap: wrap;
		border-top: 1px solid var(--ink);
		padding: 1rem 0 1.5rem;
	}
	.reading-toolbar button {
		background: none;
		color: var(--purple);
		border: 0;
		padding: 0;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.reading-toolbar a {
		font-size: 0.75rem;
		margin-left: auto;
		color: var(--purple);
		font-weight: 700;
	}
	.report-reading > details {
		border-bottom: 1px solid var(--line);
		scroll-margin-top: 140px;
	}
	.report-reading > details > summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.45rem 0;
		cursor: pointer;
		list-style: none;
	}
	.report-reading > details > summary::-webkit-details-marker {
		display: none;
	}
	.report-reading h3 {
		font-size: 1.1rem;
		line-height: 1.35;
		letter-spacing: -0.015em;
	}
	.chapter-number {
		min-width: 2.5rem;
		font-size: 0.65rem;
		color: var(--pink);
		font-weight: 800;
	}
	.expand-icon {
		margin-left: auto;
		font-size: 1.6rem;
		font-weight: 400;
		color: var(--purple);
	}
	.report-reading > details[open] > summary .expand-icon {
		transform: rotate(45deg);
	}
	.chapter-copy {
		padding: 0.25rem 0 3rem 3.5rem;
		max-width: 76ch;
		font-size: 1.125rem;
		line-height: 1.85;
	}
	.chapter-copy :global(p) {
		margin: 0 0 1.15rem;
	}
	.chapter-copy :global(h2),
	.chapter-copy :global(h3) {
		font-size: 1.35rem !important;
		line-height: 1.3;
		color: var(--purple) !important;
		margin: 1.8rem 0 0.8rem !important;
		letter-spacing: -0.02em !important;
	}
	.chapter-copy :global(h2:first-child) {
		margin-top: 0 !important;
	}
	.chapter-copy :global(a) {
		color: var(--purple);
		text-decoration: underline;
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}
	.chapter-copy :global(ul),
	.chapter-copy :global(ol) {
		padding-left: 1.4rem;
		margin: 1rem 0;
		list-style: revert;
	}
	.chapter-copy :global(li) {
		margin: 0.45rem 0;
	}
	.chapter-copy :global(.lead),
	.chapter-copy :global(.notice) {
		background: var(--cream);
		border-left: 4px solid var(--pink);
		padding: 1rem 1.2rem;
		margin-bottom: 1.6rem;
	}
	.chapter-copy :global(.lead ul) {
		margin: 0.4rem 0 0;
	}
	.chapter-copy :global(figure) {
		margin: 2rem 0;
		scroll-margin-top: 140px;
	}
	.chapter-copy :global(img) {
		width: 100%;
		height: auto;
		display: block;
		background: var(--report-paper);
	}
	.chapter-copy :global(figcaption) {
		font-size: 0.8rem;
		line-height: 1.6;
		margin-top: 0.75rem;
		color: var(--muted);
	}
	.chapter-copy :global(table) {
		border-collapse: collapse;
		font-size: 0.78rem;
		line-height: 1.5;
		width: 100%;
		display: block;
		overflow: auto;
		margin: 1.5rem 0;
	}
	.chapter-copy :global(td),
	.chapter-copy :global(th) {
		border: 1px solid var(--report-soft);
		padding: 0.8rem;
		vertical-align: top;
		min-width: 100px;
	}
	.chapter-copy :global(th) {
		background: var(--report-soft);
		text-align: left;
	}
	.chapter-copy :global(tr:nth-child(even)) {
		background: var(--report-paper);
	}
	.chapter-copy :global([id]) {
		scroll-margin-top: 140px;
	}
	.report-footer {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		background: var(--report-soft);
		color: var(--color-secondary-950);
		padding: 2.5rem clamp(1.25rem, 5vw, 5rem);
	}
	.report-footer img {
		width: 48px;
		height: 48px;
	}
	.report-footer p {
		font-size: 1.2rem;
		font-weight: 800;
		margin-bottom: 0.3rem;
	}
	.report-footer div {
		max-width: 42rem;
	}
	.report-footer span {
		font-size: 0.75rem;
		color: var(--color-surface-700);
		line-height: 1.6;
	}
	.report-footer > a {
		margin-left: auto;
		color: var(--color-secondary-700);
		font-size: 0.8rem;
		white-space: nowrap;
	}
	@media (min-width: 1600px) {
		.report-hero {
			min-height: 730px;
		}
		.hero-art {
			height: 560px;
		}
		.poster-2 {
			top: 270px;
		}
	}
	@media (max-width: 1050px) {
		.report-hero {
			grid-template-columns: 1fr 1fr;
			min-height: 560px;
		}
		.report-hero h1 {
			font-size: clamp(3rem, 5.8vw, 5rem);
		}
		.hero-art {
			height: 400px;
		}
		.poster-2 {
			top: 190px;
		}
		.hero-description {
			font-size: 0.9rem;
		}
		.art-note {
			font-size: 0.68rem;
		}
		.section-heading > p {
			max-width: 18rem;
		}
	}
	@media (max-width: 720px) {
		.download-bar {
			align-items: flex-start;
			flex-direction: column;
		}
		.download-links {
			gap: 1.25rem;
			font-size: 0.75rem;
		}
		.report-hero {
			display: block;
			padding-top: 2.4rem;
			padding-bottom: 2rem;
			min-height: 0;
		}
		.report-hero .kicker {
			margin-bottom: 1.5rem;
		}
		.report-hero h1 {
			font-size: clamp(3.1rem, 10vw, 5rem);
		}
		.hero-deck {
			font-size: 1.25rem;
		}
		.hero-description {
			max-width: 28rem;
		}
		.hero-art {
			height: 400px;
			max-width: 420px;
			margin: 2.5rem auto 0;
		}
		.poster-2 {
			top: 170px;
		}
		.art-note {
			bottom: 8px;
		}
		.report-nav a {
			font-size: 0.67rem;
			padding: 0.9rem 0.75rem;
		}
		.section-heading {
			display: block;
		}
		.section-heading > p {
			max-width: none;
			margin-top: 1.2rem;
		}
		.section-heading h2 {
			font-size: 2.45rem;
		}
		.search-results > button {
			grid-template-columns: 1fr 1rem;
			gap: 0.4rem;
		}
		.search-results > button > span {
			grid-column: 1/-1;
		}
		.chapter-copy {
			padding-left: 0;
			font-size: 0.95rem;
		}
		.report-reading > details > summary {
			gap: 0.65rem;
		}
		.chapter-number {
			min-width: 2rem;
		}
		.report-reading h3 {
			font-size: 1rem;
		}
		.reading-toolbar a {
			margin-left: 0;
		}
		.report-footer {
			align-items: flex-start;
			flex-wrap: wrap;
		}
		.report-footer div {
			flex: 1;
			min-width: 200px;
		}
		.report-footer > a {
			margin-left: 0;
		}
		.wide-only {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-poster,
		* {
			scroll-behavior: auto;
		}
		.motion-reveal:not(.is-visible) {
			opacity: 1;
			transform: none;
		}
		.report-hero.motion-ready .hero-copy,
		.report-hero.motion-ready .hero-poster,
		.motion-reveal.is-visible {
			animation: none;
		}
	}
	@media print {
		.report-page {
			margin: 0;
			background: var(--report-paper);
		}
		.download-bar,
		.report-hero,
		.report-nav,
		.start-section,
		.encounter-section,
		.gallery-section,
		.evidence-section,
		.assistant-section,
		.report-footer,
		.reading-toolbar {
			display: none;
		}
		.reading-section {
			padding: 0;
		}
		.chapter-copy {
			padding-left: 0;
		}
		.report-reading > details {
			break-inside: auto;
		}
		.chapter-copy :global(figure) {
			break-inside: avoid;
		}
	}

	@media (min-width: 721px) {
		.report-page :global(#read [id]) {
			scroll-margin-top: 240px;
		}
	}
</style>
