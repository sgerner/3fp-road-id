<script>
	import { onMount, tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { page } from '$app/state';
	import CampaignPlanner from '#lib/components/safety-report/CampaignPlanner.svelte';
	import EncounterLab from '#lib/components/safety-report/EncounterLab.svelte';
	import DesignGallery from '#lib/components/safety-report/DesignGallery.svelte';
	import EvidenceExplorer from '#lib/components/safety-report/EvidenceExplorer.svelte';
	import ReportAssistant from '#lib/components/safety-report/ReportAssistant.svelte';

	let { data } = $props();
	const report = $derived(data.report);

	const modeTabs = [
		{ id: 'read', label: 'Read Report', tabId: 'tab-read', panelId: 'panel-read' },
		{
			id: 'campaign',
			label: 'Campaign Kit and Templates',
			tabId: 'tab-campaign',
			panelId: 'panel-campaign'
		},
		{
			id: 'evidence',
			label: 'Evidence Table',
			tabId: 'tab-evidence',
			panelId: 'panel-evidence'
		}
	];

	const legacyChapter11Pathways = {
		'section-47': { target: 'campaign-planner-title' },
		'section-48': { target: 'pathway-passing', pathway: 'passing' },
		'section-49': { target: 'pathway-passing', pathway: 'passing' },
		'section-50': { target: 'pathway-doors', pathway: 'doors' },
		'section-51': { target: 'pathway-turning', pathway: 'turning' },
		'section-52': { target: 'pathway-visibility', pathway: 'visibility' },
		'section-53': { target: 'pathway-skills', pathway: 'skills' },
		'section-54': { target: 'pathway-stories', pathway: 'stories' },
		'section-55': { target: 'pathway-reach', pathway: 'reach' },
		'section-56': { target: 'evaluation-title' }
	};

	function normalizeMode(raw) {
		if (!raw) return '';
		const value = String(raw).trim().toLowerCase();
		if (value === 'read' || value === 'report' || value === 'read-report') return 'read';
		if (
			value === 'campaign' ||
			value === 'campaign-kit' ||
			value === 'campaign-kit-and-templates' ||
			value === 'templates' ||
			value === 'planner' ||
			value === 'gallery' ||
			value === 'kit'
		) {
			return 'campaign';
		}
		if (
			value === 'evidence' ||
			value === 'evidence-table' ||
			value === 'studies' ||
			value === 'sources'
		) {
			return 'evidence';
		}
		return '';
	}

	let activeMode = $state(
		untrack(
			() =>
				normalizeMode(page.url.searchParams.get('mode') || page.url.searchParams.get('view')) ||
				'read'
		)
	);
	let query = $state('');
	let searchOpen = $state(false);
	let currentChapterTopic = $state('');
	let selectedPathway = $state('passing');
	let galleryType = $state('All');
	let galleryTopic = $state('All');
	let evidenceOutcome = $state('All');
	let motionReady = $state(false);
	let isPrinting = $state(false);
	let modeBarEl;
	let assistant;
	/** @type {Record<string, HTMLButtonElement>} */
	let tabButtons = {};

	const heroPoster = $derived(
		report.campaignGallery.find((item) => item.id === '01-give-people-space-poster-v9-page-01') ??
			report.campaignGallery[0]
	);

	const activeModeLabel = $derived(
		modeTabs.find((tab) => tab.id === activeMode)?.label ?? 'Read Report'
	);

	const assistantTopic = $derived.by(() => {
		if (activeMode === 'campaign') {
			const path = report.campaignGuide?.paths?.find((item) => item.id === selectedPathway);
			return path?.label ?? '';
		}
		if (activeMode === 'evidence') {
			return evidenceOutcome !== 'All' ? evidenceOutcome : '';
		}
		return currentChapterTopic;
	});

	function rawSectionHtml(section) {
		if (section.id === 'chapter-11') {
			const cutoff = section.html.indexOf('<h3 id="section-47">');
			return cutoff >= 0 ? section.html.slice(0, cutoff) : section.html;
		}
		if (section.id === 'references') {
			return section.html.replaceAll(/id="ref-(R\d+)"/g, 'id="citation-$1"');
		}
		return section.html;
	}

	function sectionPlainText(section) {
		if (section.id !== 'chapter-11') return section.plainText;
		return rawSectionHtml(section)
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function chapterLinks(section) {
		return [...rawSectionHtml(section).matchAll(/<h3 id="([^"]+)">([\s\S]*?)<\/h3>/g)].map(
			(match) => ({
				id: match[1],
				title: match[2].replace(/<[^>]*>/g, '')
			})
		);
	}

	function chapterHtml(section) {
		return rawSectionHtml(section)
			.replace(new RegExp(`<h2 id="${section.id}">[\\s\\S]*?<\\/h2>`), '')
			.replaceAll('<img ', '<img loading="lazy" decoding="async" ');
	}

	function chapterParts(section) {
		const html = chapterHtml(section);
		const index = html.indexOf('<h3');
		return index >= 0 ? [html.slice(0, index), html.slice(index)] : [html, ''];
	}

	const groupedSearchSets = $derived.by(() => {
		const seen = new Set();
		const sets = [];
		for (const item of report.campaignGallery ?? []) {
			const key = item.assetId || item.id;
			if (seen.has(key)) continue;
			seen.add(key);
			const title = (item.title || key).replace(/\s*\(page \d+\)$/i, '');
			sets.push({
				id: `asset-${key}`,
				title,
				kind: 'Template set',
				viewLabel: 'Campaign Kit and Templates',
				text: `${title} ${item.kind} ${item.campaign} ${item.alt || ''}`,
				target: `asset-${key}`
			});
		}
		return sets;
	});

	const searchEntries = $derived([
		...report.sections
			.filter((section) => section.id !== 'references')
			.map((section) => ({
				id: section.id,
				title: section.title.replace(/^\d+\.\s*/, ''),
				kind: 'Chapter',
				viewLabel: 'Read Report',
				text: sectionPlainText(section),
				target: section.id
			})),
		...(report.campaignGuide?.paths ?? []).map((path) => ({
			id: `pathway-${path.id}`,
			title: `${path.label} · Campaign pathway`,
			kind: 'Campaign pathway',
			viewLabel: 'Campaign Kit and Templates',
			text: `${path.label} ${path.action} ${path.why} ${path.example} ${path.support} ${path.check}`,
			target: `pathway-${path.id}`
		})),
		...groupedSearchSets,
		...report.sources.map((source) => ({
			id: source.record,
			title: `${source.record} · ${source.title}`,
			kind: 'Study / guidance',
			viewLabel: 'Evidence Table',
			text: `${source.authors} ${source.year} ${source.design} ${source.endpoint} ${source.finding} ${source.limits}`,
			target: `ref-${source.record}`
		})),
		...report.figures.map((figure) => ({
			id: figure.id,
			title: figure.title,
			kind: figure.kind === 'print' ? 'Print example' : 'Visual explanation',
			viewLabel: 'Read Report',
			text: `${figure.alt} ${figure.caption} ${figure.topic}`,
			target: figure.id
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
				const excerpt = `${start ? '…' : ''}${item.text.slice(start, start + 200)}${item.text.length > start + 200 ? '…' : ''}`;
				return { ...item, score, excerpt };
			})
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 12);
	});

	function syncUrl(mode, hashId = '') {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('mode', mode);
		url.searchParams.delete('view');
		url.hash = hashId ? `#${hashId}` : '';
		window.history.replaceState(
			window.history.state,
			'',
			`${url.pathname}${url.search}${url.hash}`
		);
	}

	function resolveTarget(rawId) {
		const id = rawId.trim().replace(/^#/, '');
		if (!id) return null;

		if (id === 'assistant') {
			return { mode: activeMode, targetId: 'assistant' };
		}

		if (id in legacyChapter11Pathways) {
			const mapped = legacyChapter11Pathways[id];
			return {
				mode: 'campaign',
				targetId: mapped.target,
				pathway: mapped.pathway
			};
		}

		if (/^ref-R\d+$/i.test(id)) {
			const normalizedRecord = `ref-${id.slice(4).toUpperCase()}`;
			return { mode: 'evidence', targetId: normalizedRecord, resetEvidence: true };
		}

		if (id === 'evidence' || id === 'panel-evidence' || id === 'r42-chart') {
			return {
				mode: 'evidence',
				targetId: id === 'evidence' ? 'panel-evidence' : id
			};
		}

		if (id.startsWith('pathway-')) {
			return {
				mode: 'campaign',
				targetId: id,
				pathway: id.slice('pathway-'.length)
			};
		}

		if (id.startsWith('asset-')) {
			return {
				mode: 'campaign',
				targetId: id,
				resetGallery: true
			};
		}

		if (
			id === 'campaign' ||
			id === 'campaign-planner' ||
			id === 'campaign-planner-title' ||
			id === 'panel-campaign' ||
			id === 'evaluation-title'
		) {
			return {
				mode: 'campaign',
				targetId:
					id === 'campaign' || id === 'panel-campaign'
						? 'panel-campaign'
						: id === 'campaign-planner'
							? 'campaign-planner-title'
							: id
			};
		}

		if (id === 'gallery' || id === 'campaign-gallery') {
			return { mode: 'campaign', targetId: 'campaign-gallery' };
		}

		if (typeof document !== 'undefined') {
			const existing = document.getElementById(id);
			if (existing?.closest('#panel-campaign')) return { mode: 'campaign', targetId: id };
			if (existing?.closest('#panel-evidence')) return { mode: 'evidence', targetId: id };
		}

		return { mode: 'read', targetId: id };
	}

	async function reveal(rawId, { scroll = true, updateUrl = false } = {}) {
		const resolved = resolveTarget(rawId);
		if (!resolved) return;

		if (resolved.pathway) selectedPathway = resolved.pathway;
		if (resolved.resetGallery) {
			galleryType = 'All';
			galleryTopic = 'All';
		}
		if (resolved.resetEvidence) {
			evidenceOutcome = 'All';
		}
		if (activeMode !== resolved.mode) {
			activeMode = resolved.mode;
		}
		if (updateUrl) {
			syncUrl(resolved.mode, resolved.targetId);
		}

		await tick();

		const target = document.getElementById(resolved.targetId);
		if (!target) return;

		let ancestor = target;
		while (ancestor) {
			if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
			ancestor = ancestor.parentElement;
		}

		if (scroll) {
			const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
			requestAnimationFrame(() => {
				target.scrollIntoView({
					behavior: instant ? 'instant' : 'smooth',
					block: 'start'
				});
			});
		}
	}

	async function navigateTo(id) {
		if (!id) return;
		searchOpen = false;
		await reveal(id, { scroll: true, updateUrl: true });
	}

	async function selectMode(modeId, focusTab = false) {
		if (!modeId) return;
		searchOpen = false;
		const barRect = modeBarEl?.getBoundingClientRect();
		const wasScrolledPastHeader = barRect ? barRect.top <= 78 : false;
		activeMode = modeId;
		syncUrl(modeId, '');
		await tick();
		if (focusTab) {
			tabButtons[modeId]?.focus();
		}
		if (wasScrolledPastHeader) {
			document.getElementById(`panel-${modeId}`)?.scrollIntoView({
				behavior: 'instant',
				block: 'start'
			});
		}
	}

	function handleTabKeydown(event, index) {
		const count = modeTabs.length;
		let nextIndex = -1;
		if (event.key === 'ArrowRight') nextIndex = (index + 1) % count;
		else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
		else if (event.key === 'Home') nextIndex = 0;
		else if (event.key === 'End') nextIndex = count - 1;
		if (nextIndex >= 0) {
			event.preventDefault();
			selectMode(modeTabs[nextIndex].id, true);
		}
	}

	async function syncFromLocation() {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		const modeFromQuery = normalizeMode(params.get('mode') || params.get('view'));
		const rawHash = window.location.hash ? window.location.hash.slice(1) : '';
		if (rawHash) {
			try {
				const decoded = decodeURIComponent(rawHash);
				await reveal(decoded, { scroll: true, updateUrl: true });
				return;
			} catch {
				/* Ignore malformed hash fragments. */
			}
		}
		if (modeFromQuery && modeFromQuery !== activeMode) {
			activeMode = modeFromQuery;
		}
	}

	function handleContainerClick(event) {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const target = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
		if (!target) return;
		const href = target.getAttribute('href');
		if (!href || href === '#') return;
		event.preventDefault();
		navigateTo(href.slice(1));
	}

	function openChapters(open) {
		document.querySelectorAll('.report-reading > details').forEach((el) => {
			if (el instanceof HTMLDetailsElement) el.open = open;
		});
	}

	async function askReport(question) {
		await tick();
		await assistant?.ask(question, document.activeElement);
	}

	onMount(() => {
		syncFromLocation();

		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		motionReady = !reduceMotion;

		let savedOpenIds = null;
		const enterPrint = () => {
			isPrinting = true;
			const detailsList = [...document.querySelectorAll('.report-reading > details')];
			if (!savedOpenIds) {
				savedOpenIds = new Set(
					detailsList.filter((el) => el instanceof HTMLDetailsElement && el.open).map((el) => el.id)
				);
			}
			for (const el of detailsList) {
				if (el instanceof HTMLDetailsElement) el.open = true;
			}
		};
		const exitPrint = () => {
			isPrinting = false;
			if (!savedOpenIds) return;
			for (const el of document.querySelectorAll('.report-reading > details')) {
				if (el instanceof HTMLDetailsElement) {
					el.open = savedOpenIds.has(el.id);
				}
			}
			savedOpenIds = null;
		};

		const printMedia = matchMedia('print');
		const handlePrintMedia = (event) => {
			if (event.matches) enterPrint();
			else exitPrint();
		};
		if (printMedia.matches) enterPrint();
		printMedia.addEventListener('change', handlePrintMedia);
		window.addEventListener('beforeprint', enterPrint);
		window.addEventListener('afterprint', exitPrint);

		let frame = 0;
		const updateActiveChapter = () => {
			frame = 0;
			if (activeMode !== 'read') return;
			let matched = '';
			for (const section of report.sections) {
				const element = document.getElementById(section.id);
				if (element instanceof HTMLDetailsElement && element.open) {
					const rect = element.getBoundingClientRect();
					if (rect.top <= 220 && rect.bottom > 220) {
						matched = section.title.replace(/^\d+\.\s*/, '');
					}
				}
			}
			currentChapterTopic = matched;
		};
		const queueActiveChapter = () => {
			if (!frame) frame = requestAnimationFrame(updateActiveChapter);
		};
		window.addEventListener('scroll', queueActiveChapter, { passive: true });
		window.addEventListener('resize', queueActiveChapter);
		queueActiveChapter();

		return () => {
			printMedia.removeEventListener('change', handlePrintMedia);
			window.removeEventListener('beforeprint', enterPrint);
			window.removeEventListener('afterprint', exitPrint);
			window.removeEventListener('scroll', queueActiveChapter);
			window.removeEventListener('resize', queueActiveChapter);
			cancelAnimationFrame(frame);
		};
	});
</script>

<svelte:window onhashchange={syncFromLocation} onpopstate={syncFromLocation} />
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
	{#if heroPoster}<meta property="og:image" content={`https://3fp.org${heroPoster.src}`} />{/if}
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="report-page" onclick={handleContainerClick}>
	<a class="skip-report" href={`#panel-${activeMode}`}>Skip to active workspace</a>

	<header class="report-header" class:motion-ready={motionReady}>
		<div class="download-bar">
			<a href="/learn" class="back-link">← Learn library</a>
			<div class="download-links" aria-label="Download the report">
				<a href={report.meta.quickPdfUrl} target="_blank" rel="noopener noreferrer"
					>One-page quick guide <span>PDF ↗</span></a
				>
				<a href={report.meta.fullPdfUrl} target="_blank" rel="noopener noreferrer"
					>Full research report <span>PDF ↗</span></a
				>
			</div>
		</div>

		<div class="report-hero">
			<div class="hero-copy">
				<p class="kicker"><span></span> 3 FEET PLEASE / OPEN RESEARCH</p>
				<h1>Safer cycling.<br /><em>Better messages.</em></h1>
				<p class="hero-deck">Build a campaign with clear actions and practical help.</p>
				<p class="hero-description">
					This review brings together 68 studies on safety messages, riding education, and practical
					support. Switch between the full report, the campaign kit and templates, and the evidence
					register below.
				</p>
				<div class="hero-meta">
					<span class="edition">
						Evidence reviewed through 28 October 2026 <span>•</span> Public edition 4.4
						<span>•</span> Updated 1 November 2026
					</span>
					<a
						href="#assistant"
						class="text-link"
						onclick={(event) => {
							event.preventDefault();
							assistant?.openReportAssistant?.(event.currentTarget);
						}}>Ask the report ↗</a
					>
				</div>
			</div>

			<div class="report-search" role="search" aria-label="Search the safety report">
				<label for="report-search">Search chapters, templates, and all 68 studies</label>
				<div class="search-line">
					<span aria-hidden="true">⌕</span>
					<input
						id="report-search"
						type="search"
						bind:value={query}
						oninput={() => (searchOpen = true)}
						onfocus={() => {
							if (query.trim()) searchOpen = true;
						}}
						onkeydown={(event) => {
							if (event.key === 'Escape') searchOpen = false;
						}}
						placeholder="Try “passing”, “dooring”, “R42”, or “lights”"
						aria-describedby="search-hint"
					/>
					{#if query}
						<button
							type="button"
							onclick={() => {
								query = '';
								searchOpen = false;
							}}>Clear</button
						>
					{/if}
				</div>
				<p id="search-hint">
					Matches open the containing workspace automatically and jump straight to the chapter,
					template set, or study record.
				</p>
				<div class="search-chips" aria-label="Suggested searches">
					{#each ['Passing', 'Before the door', 'R42', 'Evaluation'] as term (term)}
						<button
							type="button"
							onclick={() => {
								query = term;
								searchOpen = true;
							}}>{term} ↗</button
						>
					{/each}
				</div>

				{#if searchOpen && query.trim()}
					<div class="search-results" aria-live="polite">
						<div class="search-results-bar">
							<p>
								{results.length
									? `${results.length} matching ${results.length === 1 ? 'result' : 'results'}${results.length === 12 ? ' · closest matches' : ''}`
									: 'No matches. Try a shorter phrase or a source ID like R42.'}
							</p>
							<button type="button" onclick={() => (searchOpen = false)}>Hide results</button>
						</div>
						{#each results as result (result.id)}
							<button
								type="button"
								class="search-hit"
								onclick={() => navigateTo(result.target)}
								in:fly={{ y: motionReady ? 6 : 0, duration: motionReady ? 140 : 0 }}
								out:fade={{ duration: motionReady ? 90 : 0 }}
							>
								<span class="hit-meta">
									<strong>{result.kind}</strong>
									<small>{result.viewLabel}</small>
								</span>
								<span class="hit-body">
									<strong>{result.title}</strong>
									<small class="search-excerpt">{result.excerpt}</small>
								</span>
								<b aria-hidden="true">↗</b>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</header>

	<div class="mode-bar" bind:this={modeBarEl} role="tablist" aria-label="Safety report views">
		{#each modeTabs as tab, index (tab.id)}
			<button
				type="button"
				role="tab"
				id={tab.tabId}
				bind:this={tabButtons[tab.id]}
				class="mode-tab"
				class:active={activeMode === tab.id}
				aria-selected={activeMode === tab.id}
				aria-controls={tab.panelId}
				tabindex={activeMode === tab.id ? 0 : -1}
				onclick={() => selectMode(tab.id)}
				onkeydown={(event) => handleTabKeydown(event, index)}
			>
				<span class="mode-index" aria-hidden="true">0{index + 1}</span>
				<span>{tab.label}</span>
			</button>
		{/each}
	</div>

	<div
		id="panel-read"
		class="mode-panel read-workspace"
		role="tabpanel"
		aria-labelledby="tab-read"
		hidden={!isPrinting && activeMode !== 'read'}
	>
		<section id="start" class="start-section section-pad">
			<div class="takeaways-intro">
				<p class="kicker"><span></span> THE RESEARCH / PUT IT TO WORK</p>
				<h2>Make a safety message<br /><em>people can use.</em></h2>
				<p>
					For community advocates, local groups, and anyone making a safety campaign: give people
					one clear action and a practical way to take it. Start with these seven decisions from the
					one-page guide.
				</p>
			</div>

			<ol class="quick-takeaways" aria-label="Seven decisions for a useful safety campaign">
				{#each report.quickGuide.steps as step (step.number)}
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
					<a class="primary-link" href="#chapter-4"
						>Explore this road encounter <span aria-hidden="true">↓</span></a
					>
					<button type="button" class="secondary-mode-link" onclick={() => selectMode('campaign')}>
						Open Campaign Kit and Templates →
					</button>
				</div>
			</div>
		</section>

		<section id="read" class="reading-section section-pad">
			<div class="section-heading">
				<div>
					<p class="kicker"><span></span> THE COMPLETE REVIEW</p>
					<h2>Go as deep<br /><em>as you need.</em></h2>
				</div>
				<p>
					Every chapter, study citation, road encounter lab, and visual explanation from the report.
					Open a chapter to follow the reasoning behind a campaign choice.
				</p>
			</div>

			<div class="reading-toolbar" role="region" aria-label="Chapter controls">
				<label class="chapter-jump">
					Chapter
					<select
						aria-label="Jump to a report chapter"
						value={report.sections.find(
							(section) => section.title.replace(/^\d+\.\s*/, '') === currentChapterTopic
						)?.id || ''}
						onchange={(event) => navigateTo(event.currentTarget.value)}
					>
						<option value="" disabled>Choose a chapter</option>
						{#each report.sections as section (section.id)}
							<option value={section.id}>{section.title}</option>
						{/each}
					</select>
				</label>
				<button type="button" onclick={() => openChapters(true)}>Open all chapters +</button>
				<button type="button" onclick={() => openChapters(false)}>Close all −</button>
				<a href={report.meta.fullPdfUrl} target="_blank" rel="noopener noreferrer"
					>Take the full PDF ↗</a
				>
			</div>

			<div class="report-reading">
				{#each report.sections as section (section.id)}
					<details id={section.id} open={section.id === 'executive-findings'}>
						<summary>
							<span class="chapter-number">
								{section.number
									? String(section.number).padStart(2, '0')
									: section.id === 'references'
										? 'REF'
										: 'READ'}
							</span>
							<h3>{section.title.replace(/^\d+\.\s*/, '')}</h3>
							<span class="expand-icon" aria-hidden="true">+</span>
						</summary>

						{#if chapterLinks(section).length}
							<nav class="chapter-links" aria-label={`In ${section.title}`}>
								<span>In this chapter</span>
								{#each chapterLinks(section) as link (link.id)}
									<a href={`#${link.id}`}>{link.title}</a>
								{/each}
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

						{#if section.id === 'chapter-11'}
							<div class="chapter-kit-callout">
								<div>
									<p class="kicker">NEXT STEP · CAMPAIGN PACKAGES, PATHWAYS & TEMPLATES</p>
									<h4>Turn your creative brief into a ready-to-adapt campaign kit.</h4>
									<p>
										Choose from three connected packages, seven action pathways, downloadable design
										sets, and the evaluation recording sheet in the Campaign Kit and Templates
										workspace.
									</p>
								</div>
								<button
									type="button"
									class="primary-link"
									onclick={() => navigateTo('campaign-planner-title')}
								>
									Open Campaign Kit and Templates <span aria-hidden="true">→</span>
								</button>
							</div>
						{/if}
					</details>
				{/each}
			</div>
		</section>
	</div>

	<div
		id="panel-campaign"
		class="mode-panel campaign-workspace"
		role="tabpanel"
		aria-labelledby="tab-campaign"
		hidden={activeMode !== 'campaign'}
	>
		<section id="campaign-planner" class="section-pad planner-section">
			<CampaignPlanner
				{report}
				bind:activePath={selectedPathway}
				onNavigate={navigateTo}
				onAsk={askReport}
			/>
		</section>
		<section id="campaign-gallery" class="section-pad gallery-section">
			<DesignGallery
				{report}
				bind:type={galleryType}
				bind:topic={galleryTopic}
				active={activeMode === 'campaign'}
				onAsk={askReport}
			/>
		</section>
	</div>

	<div
		id="panel-evidence"
		class="mode-panel evidence-workspace"
		role="tabpanel"
		aria-labelledby="tab-evidence"
		hidden={activeMode !== 'evidence'}
	>
		<section id="evidence-register" class="section-pad evidence-section">
			<EvidenceExplorer
				{report}
				bind:outcome={evidenceOutcome}
				onNavigate={navigateTo}
				onAsk={askReport}
			/>
		</section>
	</div>

	<section id="assistant" class="section-pad assistant-section">
		<ReportAssistant
			{report}
			activeView={activeModeLabel}
			currentTopic={assistantTopic}
			onNavigate={navigateTo}
			onCitationSelect={navigateTo}
			bind:this={assistant}
		/>
	</section>

	<footer class="report-footer">
		<img src="/logos/3FeetPlease_WhiteOutline.png" alt="3 Feet Please" width="64" height="64" />
		<div>
			<p>Research made useful.</p>
			<span>
				Published by 3 Feet Please. Human research design, synthesis and editing by the 3FP data
				team, with AI assistance.
			</span>
		</div>
		<a href="/learn">Back to Learn ↗</a>
	</footer>
</div>

<style>
	:global(main:has(> .report-page)) {
		overflow-x: clip;
		overflow-y: visible;
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

	.report-page :global(input),
	.report-page :global(select),
	.report-page :global(textarea) {
		border-color: var(--color-secondary-400);
		border-radius: 0;
	}

	.report-page :global(h4),
	.report-page :global(h5) {
		color: var(--color-secondary-950);
	}

	.report-page h1,
	.report-page h2,
	.report-page h3 {
		font-family: 'Space Grotesk', Arial, sans-serif;
		color: var(--ink);
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
	.report-page input,
	.report-page select {
		font: inherit;
	}

	.report-page em {
		font-style: normal;
		color: var(--purple);
	}

	.report-page a:focus-visible,
	.report-page button:focus-visible,
	.report-page summary:focus-visible,
	.report-page input:focus-visible,
	.report-page select:focus-visible {
		outline: 3px solid var(--pink);
		outline-offset: 3px;
	}

	.skip-report {
		position: fixed;
		left: 1rem;
		top: -5rem;
		z-index: 99;
		background: var(--color-primary-100);
		color: var(--ink);
		border: 2px solid var(--ink);
		padding: 0.85rem 1.1rem;
		font-weight: 800;
	}

	.skip-report:focus {
		top: 1rem;
	}

	.report-header {
		background: var(--report-soft);
		border-bottom: 1px solid var(--line);
	}

	.download-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.95rem clamp(1.25rem, 4vw, 4rem);
		border-bottom: 1px solid var(--line);
		font-size: 0.82rem;
		font-weight: 700;
		background: var(--report-paper);
	}

	.back-link {
		color: var(--purple);
	}

	.download-links {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
	}

	.download-links a {
		color: var(--ink);
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
	}

	.download-links a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.download-links span {
		color: var(--purple);
		font-size: 0.7rem;
	}

	.report-hero {
		padding: clamp(1.75rem, 4vw, 3.25rem) clamp(1.25rem, 4vw, 4rem);
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
		gap: clamp(1.75rem, 4vw, 3.5rem);
		align-items: start;
		color: var(--ink);
	}

	.report-header.motion-ready .hero-copy {
		animation: hero-arrive 450ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}

	@keyframes hero-arrive {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.kicker {
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		font-weight: 800;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--purple);
	}

	.kicker > span {
		width: 22px;
		height: 4px;
		background: var(--pink);
		flex-shrink: 0;
	}

	.hero-copy .kicker {
		margin-bottom: 1.2rem;
	}

	.report-hero h1 {
		font-size: clamp(2.6rem, 4.8vw, 4.9rem);
		line-height: 0.97;
		letter-spacing: -0.055em;
	}

	.hero-deck {
		font-size: clamp(1.1rem, 1.5vw, 1.4rem);
		line-height: 1.35;
		margin-top: 1.15rem !important;
		max-width: 34rem;
		font-weight: 700;
	}

	.hero-description {
		max-width: 38rem;
		margin-top: 0.75rem !important;
		line-height: 1.6;
		font-size: 0.95rem;
		color: var(--muted);
	}

	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
		margin-top: 1.35rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}

	.edition {
		font-size: 0.68rem;
		color: var(--purple);
		line-height: 1.6;
	}

	.edition span {
		padding: 0 0.35rem;
	}

	.text-link {
		color: var(--ink);
		font-size: 0.82rem;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.report-search {
		background: var(--report-paper);
		border: 1px solid var(--report-border);
		border-top: 4px solid var(--purple);
		padding: 1.25rem 1.4rem;
	}

	.report-search > label {
		display: block;
		font-size: 0.88rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		margin-bottom: 0.7rem;
	}

	.search-line {
		border-bottom: 2px solid var(--ink);
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.search-line > span {
		color: var(--purple);
		font-size: 1.5rem;
		line-height: 1;
	}

	.search-line input {
		background: transparent;
		border: 0;
		outline: 0;
		box-shadow: none;
		flex: 1;
		min-width: 0;
		padding: 0.65rem 0;
		color: var(--ink);
		font-size: 0.95rem;
	}

	.search-line button {
		border: 1px solid var(--line);
		background: var(--report-soft);
		color: var(--ink);
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.35rem 0.65rem;
		cursor: pointer;
	}

	#search-hint {
		font-size: 0.75rem;
		color: var(--muted);
		line-height: 1.5;
		margin-top: 0.65rem;
	}

	.search-chips {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}

	.search-chips button {
		padding: 0.35rem 0.65rem;
		border: 1px solid var(--report-border);
		color: var(--purple);
		font-size: 0.72rem;
		font-weight: 700;
		background: var(--report-soft);
		cursor: pointer;
	}

	.search-chips button:hover {
		border-color: var(--ink);
		background: var(--color-primary-100);
		color: var(--ink);
	}

	.search-results {
		margin-top: 1rem;
		border-top: 2px solid var(--ink);
		max-height: 24rem;
		overflow-y: auto;
	}

	.search-results-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--line);
	}

	.search-results-bar p {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--muted);
	}

	.search-results-bar button {
		border: 0;
		background: none;
		color: var(--purple);
		font-size: 0.74rem;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
		padding: 0.2rem 0;
	}

	.search-hit {
		display: grid;
		grid-template-columns: 9.5rem minmax(0, 1fr) 1.25rem;
		align-items: start;
		gap: 0.85rem;
		text-align: left;
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--line);
		padding: 0.85rem 0.35rem;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}

	.search-hit:hover {
		background: var(--report-soft);
	}

	.hit-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.hit-meta strong {
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--purple);
	}

	.hit-meta small {
		font-size: 0.68rem;
		color: var(--muted);
		line-height: 1.35;
	}

	.hit-body {
		display: block;
		min-width: 0;
	}

	.hit-body strong {
		display: block;
		font-size: 0.86rem;
		font-weight: 700;
		line-height: 1.35;
	}

	.search-excerpt {
		display: block;
		margin-top: 0.3rem;
		font-size: 0.78rem;
		font-weight: 400;
		color: var(--muted);
		line-height: 1.45;
	}

	.search-hit b {
		color: var(--pink);
		font-size: 0.9rem;
	}

	.mode-bar {
		position: sticky;
		top: var(--app-header-height, 73px);
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		background: var(--color-primary-100);
		border-top: 1px solid var(--ink);
		border-bottom: 2px solid var(--ink);
	}

	.mode-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.9rem 1rem;
		border: 0;
		border-right: 1px solid var(--ink);
		border-bottom: 4px solid transparent;
		background: transparent;
		color: var(--ink);
		font-family: 'Space Grotesk', Arial, sans-serif;
		font-size: 0.86rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		cursor: pointer;
		text-align: center;
	}

	.mode-tab:last-child {
		border-right: 0;
	}

	.mode-tab:hover {
		background: color-mix(in srgb, var(--report-paper) 55%, transparent);
	}

	.mode-tab.active {
		background: var(--report-paper);
		border-bottom-color: var(--pink);
	}

	.mode-index {
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		color: var(--pink);
	}

	.mode-panel {
		scroll-margin-top: 132px;
	}

	.mode-panel[hidden] {
		display: none;
	}

	.section-pad {
		padding: clamp(2.25rem, 5vw, 4.5rem) clamp(1.25rem, 4vw, 4rem);
		scroll-margin-top: 140px;
	}

	.planner-section {
		padding-bottom: 2rem;
	}

	.gallery-section {
		padding-top: 2.5rem;
		border-top: 1px solid var(--line);
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
		border-top: 2px solid var(--ink);
	}

	.takeaways-intro {
		max-width: 48rem;
		margin-bottom: 2rem;
	}

	.takeaways-intro .kicker {
		margin-bottom: 1rem;
	}

	.takeaways-intro h2 {
		font-size: clamp(2rem, 3.8vw, 3.6rem);
		line-height: 1.05;
	}

	.takeaways-intro > p:last-child {
		margin-top: 1rem;
		line-height: 1.65;
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
		padding: 1.35rem 0;
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
		margin-top: 0.45rem;
	}

	.takeaway-example {
		display: grid;
		grid-template-columns: 1.25fr 1fr;
		align-items: center;
		gap: 2rem;
		background: var(--report-soft);
		color: var(--ink);
		border: 1px solid var(--line);
		border-top: 4px solid var(--pink);
		padding: clamp(1.4rem, 3vw, 2.25rem);
		margin-top: 1.5rem;
	}

	.takeaway-example .kicker {
		font-size: 0.62rem;
	}

	.takeaway-example blockquote {
		font-size: clamp(1.35rem, 2.3vw, 1.85rem);
		font-weight: 800;
		line-height: 1.25;
		margin: 0.85rem 0;
		letter-spacing: -0.03em;
	}

	.takeaway-example p:last-child {
		font-size: 0.88rem;
		line-height: 1.6;
		color: var(--muted);
	}

	.takeaway-actions {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		align-items: flex-start;
	}

	.primary-link {
		display: inline-flex;
		align-items: center;
		gap: 1.25rem;
		background: var(--color-primary-100);
		color: var(--ink);
		border: 2px solid var(--ink);
		padding: 0.85rem 1.15rem;
		font-weight: 800;
		font-size: 0.86rem;
		cursor: pointer;
	}

	.primary-link:hover {
		background: var(--report-paper);
	}

	.secondary-mode-link {
		border: 0;
		background: none;
		padding: 0;
		color: var(--purple);
		font-size: 0.82rem;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 2rem;
		margin-bottom: 2.25rem;
	}

	.section-heading h2 {
		font-size: clamp(2rem, 3.8vw, 3.8rem);
		line-height: 1.03;
	}

	.section-heading .kicker {
		margin-bottom: 1rem;
	}

	.section-heading > p {
		max-width: 24rem;
		line-height: 1.65;
		font-size: 0.95rem;
		color: var(--muted);
	}

	.reading-toolbar {
		position: static;
		background: var(--report-soft);
		display: flex;
		gap: 1.25rem;
		align-items: center;
		flex-wrap: wrap;
		border-top: 2px solid var(--ink);
		border-bottom: 1px solid var(--line);
		padding: 0.95rem 1.1rem;
		margin-bottom: 0.5rem;
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
		background: var(--report-paper);
		border: 1px solid var(--report-border);
		border-radius: 0;
		padding: 0.45rem 2rem 0.45rem 0.7rem;
		max-width: 24rem;
		font-size: 0.8rem;
	}

	.reading-toolbar button {
		background: none;
		color: var(--purple);
		border: 0;
		padding: 0;
		font-size: 0.78rem;
		font-weight: 800;
		cursor: pointer;
	}

	.reading-toolbar button:hover,
	.reading-toolbar a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.reading-toolbar a {
		font-size: 0.78rem;
		margin-left: auto;
		color: var(--purple);
		font-weight: 800;
	}

	.report-reading > details {
		border-bottom: 1px solid var(--line);
		scroll-margin-top: 140px;
	}

	.report-reading > details > summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.35rem 0;
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
		text-transform: none;
	}

	.chapter-number {
		min-width: 2.5rem;
		font-size: 0.68rem;
		color: var(--pink);
		font-weight: 800;
	}

	.expand-icon {
		margin-left: auto;
		font-size: 1.5rem;
		font-weight: 400;
		color: var(--purple);
	}

	.report-reading > details[open] > summary .expand-icon {
		transform: rotate(45deg);
	}

	.chapter-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		margin: 0 0 1.6rem 3.5rem;
		max-width: 70ch;
		padding: 0.95rem 1.1rem;
		background: var(--report-soft);
		border-left: 4px solid var(--purple);
		border-radius: 0;
	}

	.chapter-links span {
		width: 100%;
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.chapter-links a {
		font-size: 0.88rem;
		text-decoration: underline;
		text-underline-offset: 3px;
		color: var(--purple);
	}

	.chapter-copy {
		padding: 0.25rem 0 2.5rem 3.5rem;
		max-width: 76ch;
		font-size: 1.08rem;
		line-height: 1.82;
	}

	.chapter-copy :global(p) {
		margin: 0 0 1.15rem;
	}

	.chapter-copy :global(h2),
	.chapter-copy :global(h3) {
		font-size: 1.32rem !important;
		line-height: 1.3;
		color: var(--purple) !important;
		margin: 1.8rem 0 0.8rem !important;
		letter-spacing: -0.02em !important;
		text-transform: none;
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
		font-size: 0.8rem;
		line-height: 1.5;
		width: 100%;
		display: block;
		overflow: auto;
		margin: 1.5rem 0;
	}

	.chapter-copy :global(td),
	.chapter-copy :global(th) {
		border: 1px solid var(--line);
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

	.chapter-interactive {
		margin: 1.5rem 0 2rem;
		padding: 0;
		border-radius: 0;
		background: var(--report-paper);
	}

	.chapter-kit-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		margin: 0 0 2.5rem 3.5rem;
		max-width: 76ch;
		padding: 1.5rem;
		background: var(--report-soft);
		border: 1px solid var(--line);
		border-top: 4px solid var(--purple);
	}

	.chapter-kit-callout > div {
		max-width: 44ch;
	}

	.chapter-kit-callout h4 {
		font-family: 'Space Grotesk', Arial, sans-serif;
		font-size: 1.2rem;
		font-weight: 800;
		margin: 0.5rem 0;
	}

	.chapter-kit-callout p:last-child {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--muted);
	}

	.report-footer {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		background: var(--report-soft);
		border-top: 1px solid var(--line);
		color: var(--ink);
		padding: 2.25rem clamp(1.25rem, 4vw, 4rem);
	}

	.report-footer img {
		width: 48px;
		height: 48px;
	}

	.report-footer p {
		font-size: 1.15rem;
		font-weight: 800;
		margin-bottom: 0.25rem;
	}

	.report-footer div {
		max-width: 42rem;
	}

	.report-footer span {
		font-size: 0.76rem;
		color: var(--muted);
		line-height: 1.6;
	}

	.report-footer > a {
		margin-left: auto;
		color: var(--purple);
		font-size: 0.82rem;
		font-weight: 800;
		white-space: nowrap;
	}

	@media (max-width: 960px) {
		.report-hero {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.download-bar {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.65rem;
		}

		.download-links {
			gap: 1rem;
			font-size: 0.76rem;
		}

		.mode-bar {
			display: flex;
			overflow-x: auto;
			scrollbar-width: thin;
		}

		.mode-tab {
			flex: 1 0 auto;
			white-space: nowrap;
			padding: 0.8rem 0.85rem;
			font-size: 0.76rem;
		}

		.quick-takeaways,
		.takeaway-example {
			grid-template-columns: 1fr;
		}

		.section-heading {
			display: block;
		}

		.section-heading > p {
			max-width: none;
			margin-top: 1rem;
		}

		.chapter-jump {
			width: 100%;
		}

		.chapter-jump select {
			min-width: 0;
			flex: 1;
		}

		.reading-toolbar a {
			margin-left: 0;
		}

		.search-hit {
			grid-template-columns: minmax(0, 1fr) 1.25rem;
		}

		.hit-meta {
			grid-column: 1 / -1;
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.chapter-links,
		.chapter-copy,
		.chapter-kit-callout {
			margin-left: 0;
			padding-left: 0;
		}

		.chapter-links,
		.chapter-kit-callout {
			padding-left: 1rem;
		}

		.chapter-copy {
			font-size: 0.96rem;
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
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto;
		}
		.report-header.motion-ready .hero-copy {
			animation: none;
		}
	}

	@media print {
		.report-page {
			margin: 0;
			background: var(--report-paper);
		}

		#panel-read.mode-panel.read-workspace[hidden] {
			display: block !important;
		}

		.report-header,
		.mode-bar,
		.start-section,
		.campaign-workspace,
		.evidence-workspace,
		.assistant-section,
		.report-footer,
		.reading-toolbar,
		.chapter-kit-callout,
		.chapter-interactive {
			display: none !important;
		}

		.reading-section {
			padding: 0;
			border-top: 0;
		}

		.chapter-copy {
			padding-left: 0;
		}

		.report-reading > details {
			break-inside: auto;
		}

		.report-reading > details::details-content {
			display: block;
			content-visibility: visible;
		}

		.chapter-copy :global(figure) {
			break-inside: avoid;
		}
	}
</style>
