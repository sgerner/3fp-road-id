<script>
	import { onMount, tick } from 'svelte';
	import EncounterLab from '#lib/components/safety-report/EncounterLab.svelte';
	import MessageWorkbench from '#lib/components/safety-report/MessageWorkbench.svelte';
	import DesignGallery from '#lib/components/safety-report/DesignGallery.svelte';
	import EvidenceExplorer from '#lib/components/safety-report/EvidenceExplorer.svelte';
	import ReportAssistant from '#lib/components/safety-report/ReportAssistant.svelte';

	let { data } = $props();
	const report = $derived(data.report);
	let query = $state('');
	let active = $state('start');
	let assistant;
	const navigation = [
		['start', 'Start here'],
		['encounters', 'Road encounters'],
		['workbench', 'Make a message'],
		['gallery', 'Visual library'],
		['evidence', 'Evidence'],
		['read', 'Full review'],
		['assistant', 'Ask the report']
	];
	const topics = [
		{
			label: 'Passing & lane position',
			chapter: 'chapter-4',
			number: '01',
			text: 'Explain the space a rider needs. Show when a driver should wait.',
			sources: ['R15', 'R34']
		},
		{
			label: 'Doors & turns',
			chapter: 'chapter-5',
			number: '02',
			text: 'Make the check and the wait clear. Rehearse the decision in a safe setting.',
			sources: ['R06', 'R09', 'R45']
		},
		{
			label: 'Stories & creative choices',
			chapter: 'chapter-6',
			number: '03',
			text: 'Pair an everyday human connection with a specific driver action. Test the response.',
			sources: ['R07', 'R08', 'R31']
		},
		{
			label: 'Skills & equipment',
			chapter: 'chapter-8',
			number: '04',
			text: 'Connect the advice to practice, feedback, gear and fitting help.',
			sources: ['R05', 'R20', 'R32']
		},
		{
			label: 'Delivery & evaluation',
			chapter: 'chapter-12',
			number: '05',
			text: 'Reach the right people. Check understanding, use and follow-through.',
			sources: ['R47', 'R48', 'R49']
		}
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
				return { ...item, score };
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
	function chapterHtml(section) {
		return section.html
			.replace(new RegExp(`<h2 id="${section.id}">[\\s\\S]*?<\\/h2>`), '')
			.replaceAll('<img ', '<img loading="lazy" decoding="async" ');
	}
	onMount(() => {
		followHash();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) active = entry.target.id;
			},
			{ rootMargin: '-10% 0px -65% 0px' }
		);
		for (const [id] of navigation) {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
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
				>Two-page quick guide <span>PDF ↗</span></a
			>
			<a href={report.meta.fullPdfUrl} target="_blank" rel="noopener"
				>Full research report <span>PDF ↗</span></a
			>
		</div>
	</div>

	<header class="report-hero">
		<div class="hero-copy">
			<p class="kicker"><span></span> 3 FEET PLEASE / OPEN RESEARCH</p>
			<h1>Safer cycling.<br /><em>Better messages.</em></h1>
			<p class="hero-deck">
				Turn research into a campaign<br class="wide-only" /> people can understand and use.
			</p>
			<p class="hero-description">
				Explore what was studied, see the design choices, and build a practical plan for your own
				community.
			</p>
			<div class="hero-actions">
				<a href="#start" class="primary-link">Find your starting point <span>↓</span></a><a
					href="#assistant"
					class="text-link">Ask the report ↗</a
				>
			</div>
			<div class="edition">
				Evidence reviewed through 28 October 2026 <span>•</span> Public edition 4.4
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

	<section id="start" class="start-section section-pad">
		<div class="infrastructure">
			<span aria-hidden="true">↗</span>
			<div>
				<h2>Start with safer streets.</h2>
				<p>
					Prioritize safer road design and speeds. Use messages and practical support to address
					today’s needs while continuing to work for better streets.
				</p>
				<a href="#executive-findings" onclick={() => reveal('executive-findings', false)}
					>Read the report’s starting point →</a
				>
			</div>
		</div>
		<div class="section-heading">
			<div>
				<p class="kicker">01 / CHOOSE YOUR WAY IN</p>
				<h2>What are you<br /><em>trying to change?</em></h2>
			</div>
			<p>
				Pick a road situation or a practical need. Follow the evidence to an action your audience
				can take.
			</p>
		</div>
		<div class="topic-list">
			{#each topics as topic}<a
					href={`#${topic.chapter}`}
					onclick={() => reveal(topic.chapter, false)}
					><span class="topic-number">{topic.number}</span>
					<div>
						<h3>{topic.label}</h3>
						<p>{topic.text}</p>
					</div>
					<span class="topic-arrow" aria-hidden="true">↗</span></a
				>{/each}
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
					{#each results as result}<button type="button" onclick={() => navigateTo(result.target)}
							><span>{result.kind}</span><strong>{result.title}</strong><b aria-hidden="true">↗</b
							></button
						>{/each}
				</div>{/if}
		</div>
	</section>

	<section id="encounters" class="section-pad encounter-section">
		<EncounterLab onAsk={askReport} />
	</section>
	<section id="workbench" class="section-pad workbench-section">
		<MessageWorkbench {report} onAsk={askReport} />
	</section>
	<section id="gallery" class="section-pad gallery-section">
		<DesignGallery {report} onAsk={askReport} />
	</section>
	<section id="evidence" class="section-pad evidence-section">
		<EvidenceExplorer {report} onAsk={askReport} />
	</section>

	<section id="read" class="reading-section section-pad">
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
					<div class="chapter-copy">{@html chapterHtml(section)}</div>
				</details>{/each}
		</div>
	</section>

	<section id="assistant" class="section-pad assistant-section">
		<ReportAssistant bind:this={assistant} {report} />
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
	:global(main:has(> .report-page)) {
		overflow-x: clip;
		overflow-y: visible;
	}
	.report-page h2,
	.report-page h3 {
		color: var(--ink) !important;
	}
	.report-page {
		--purple: #7926cb;
		--pink: #ff0180;
		--lemon: #ffff0a;
		--ink: #23143a;
		--cream: #fff3df;
		--muted: #655b70;
		--line: #dfd3e8;
		margin: -1rem;
		background: #fffaf3;
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
		background: var(--lemon);
		color: var(--ink);
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
		background: #35125f;
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1.5rem;
		overflow: hidden;
		color: white;
		min-height: 650px;
		align-items: center;
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
		color: var(--lemon);
		margin-bottom: 2.3rem;
	}
	.report-hero h1 {
		font-size: clamp(3.4rem, 5.8vw, 7rem);
		line-height: 0.96;
		letter-spacing: -0.06em;
		color: white;
	}
	.report-page em {
		font-style: normal;
		color: var(--purple);
	}
	.report-hero h1 em {
		color: var(--lemon);
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
		color: #e2d2f1;
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
		background: var(--lemon);
		color: var(--ink);
		padding: 1rem 1.2rem;
		font-weight: 800;
		font-size: 0.9rem;
	}
	.primary-link:hover {
		background: white;
	}
	.text-link {
		color: white;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.text-link:hover {
		text-decoration: underline;
	}
	.edition {
		font-size: 0.65rem;
		color: #cdb7e0;
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
		background: white;
		padding: 6px;
		box-shadow: 0 25px 60px #13082080;
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
		color: #e9d7fc;
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
		background: var(--lemon);
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
	}
	.report-nav a:hover,
	.report-nav a[aria-current] {
		border-color: var(--pink);
		background: #ffffff50;
	}
	.section-pad {
		padding: clamp(2.75rem, 6vw, 6rem) clamp(1.25rem, 5vw, 5rem);
		scroll-margin-top: 140px;
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
	.infrastructure {
		display: flex;
		gap: 1.4rem;
		background: var(--cream);
		border-left: 5px solid var(--pink);
		padding: 1.5rem 1.7rem;
		margin-bottom: 4.5rem;
		align-items: flex-start;
	}
	.infrastructure > span {
		color: var(--purple);
		font-size: 2.3rem;
		line-height: 1;
	}
	.infrastructure h2 {
		font-size: 1.35rem;
		letter-spacing: -0.025em;
	}
	.infrastructure p {
		font-size: 0.95rem;
		line-height: 1.6;
		max-width: 59rem;
		margin-top: 0.45rem;
	}
	.infrastructure a {
		display: inline-block;
		color: var(--purple);
		font-size: 0.75rem;
		font-weight: 800;
		margin-top: 0.65rem;
	}
	.topic-list {
		border-top: 1px solid var(--ink);
	}
	.topic-list > a {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem 0.25rem;
		border-bottom: 1px solid var(--line);
		color: var(--ink);
		transition: padding 0.2s;
	}
	.topic-list > a:hover {
		background: var(--cream);
		padding-left: 1rem;
	}
	.topic-number {
		font-size: 0.75rem;
		font-weight: 800;
		color: var(--pink);
		min-width: 1.7rem;
	}
	.topic-list h3 {
		font-size: 1.35rem;
		letter-spacing: -0.02em;
	}
	.topic-list p {
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--muted);
		margin-top: 0.35rem;
	}
	.topic-arrow {
		font-size: 1.6rem;
		color: var(--purple);
		margin-left: auto;
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
		background: white;
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
		background: #f0e6f8;
		border-top: 1px solid var(--line);
	}
	.workbench-section {
		background: var(--cream);
	}
	.gallery-section {
		background: white;
	}
	.evidence-section {
		background: #f4edf9;
	}
	.reading-section {
		background: #fffaf3;
		border-top: 1px solid var(--line);
	}
	.assistant-section {
		background: #f0e6f8;
		border-top: 1px solid var(--line);
	}
	.reading-toolbar {
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
		max-width: 940px;
		font-size: 1rem;
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
		background: white;
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
		border: 1px solid #d6c4e4;
		padding: 0.8rem;
		vertical-align: top;
		min-width: 100px;
	}
	.chapter-copy :global(th) {
		background: #e5d5f2;
		text-align: left;
	}
	.chapter-copy :global(tr:nth-child(even)) {
		background: #f4edf9;
	}
	.chapter-copy :global([id]) {
		scroll-margin-top: 140px;
	}
	.report-footer {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		background: #35125f;
		color: white;
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
		color: #d8c6e9;
		line-height: 1.6;
	}
	.report-footer > a {
		margin-left: auto;
		color: var(--lemon);
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
		.infrastructure {
			padding: 1.2rem;
			gap: 0.8rem;
			margin-bottom: 3rem;
		}
		.infrastructure > span {
			display: none;
		}
		.topic-list > a {
			gap: 0.7rem;
		}
		.topic-list h3 {
			font-size: 1.1rem;
		}
		.topic-list p {
			font-size: 0.8rem;
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
		.topic-list > a {
			transition: none;
		}
		* {
			scroll-behavior: auto;
		}
	}
	@media print {
		.report-page {
			margin: 0;
			background: white;
		}
		.download-bar,
		.report-hero,
		.report-nav,
		.start-section,
		.encounter-section,
		.workbench-section,
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
</style>
