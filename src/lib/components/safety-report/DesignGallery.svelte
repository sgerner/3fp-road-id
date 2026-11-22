<script>
	import { tick, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	/** @type {{ report: Record<string, any>, type?: string, topic?: string, active?: boolean, onAsk?: (question: string) => void }} */
	let {
		report,
		type = $bindable('All'),
		topic = $bindable('All'),
		active = true,
		onAsk = undefined
	} = $props();

	let activeIndex = $state(0);
	let activePageIndex = $state(0);
	let cardPages = $state(/** @type {Record<string, number>} */ ({}));
	/** @type {HTMLDialogElement | undefined} */
	let dialog = $state();
	/** @type {HTMLElement | null | undefined} */
	let trigger;
	let reducedMotion = $state(true);

	onMount(() => {
		const preference = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (reducedMotion = preference.matches);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});

	$effect(() => {
		if (!active && dialog?.open) {
			dialog.close();
		}
	});

	const bytes = (size) =>
		size >= 1000000 ? `${(size / 1000000).toFixed(1)} MB` : `${Math.ceil(size / 1000)} KB`;

	const campaignName = (value) =>
		value === 'All'
			? 'All campaigns'
			: value
					.split(', ')
					.map((name) =>
						name === '03-a-person-on-a-bike'
							? 'Family, friends & everyday rides'
							: name === '02-why-im-here'
								? 'Why I’m here'
								: name.replace(/^\d+-/, '').replaceAll('-', ' ')
					)
					.join(' + ');

	const formatSize = (item) =>
		item.kind === 'social'
			? `${item.pixelWidth || 1080} × ${item.pixelHeight || 1080} px`
			: item.dimensions?.length
				? `${item.dimensions.map((size) => Number(size.toFixed(1))).join(' × ')} in`
				: '';

	const assetCustomTitles = {
		'3fp-driver-handout-letter-2up-space-v9': 'Give People Space — Driver Handout (2-up Letter)',
		'lights-ready-practice-card-4x6-v3-v9': 'Light The Ride — Practice Card (4 × 6 in)',
		'3fp-poster-look-before-you-open-letter-native-v9': 'Before The Door — Poster (8.5 × 11 in)',
		'3fp-poster-look-before-you-open-11x17-native-v9': 'Before The Door — Poster (11 × 17 in)',
		'3fp-poster-check-before-you-turn-letter-native-v9':
			'Check Before You Turn — Poster (8.5 × 11 in)',
		'3fp-poster-check-before-you-turn-11x17-native-v9':
			'Check Before You Turn — Poster (11 × 17 in)',
		'3fp-welcoming-group-ride-card-4x6-rev2-native-v9':
			'Find Your People — Welcoming Group Ride Card (4 × 6 in)',
		'3fp-local-groups-rides-rack-card-4x9-rev2-native-v9':
			'Find Your People — Local Rides Rack Card (4 × 9 in)',
		'3fp-public-display-pair-letter-rev2-native-v9':
			'Find Your People — Public Display Pair (8.5 × 11 in)',
		'relationships-poster-11x17-v9': 'Family, Friends & Everyday Rides — Poster (11 × 17 in)',
		'relationships-poster-letter-v9': 'Family, Friends & Everyday Rides — Poster (8.5 × 11 in)'
	};

	function formatSetTitle(item) {
		if (item.assetId && assetCustomTitles[item.assetId]) return assetCustomTitles[item.assetId];
		return (item.title || item.assetId || '')
			.replace(/\s*\(page \d+\)$/i, '')
			.replace(/\bWhy Im Here\b/, 'Why I’m Here');
	}

	const campaignUses = {
		'01-give-people-space': {
			audience: 'Drivers and fleet teams',
			action: 'Wait when there is not enough safe, legal room to pass.',
			placement: 'Driver training, fleet briefings, community outreach',
			customize: 'Local passing rules, road context, and help links'
		},
		'02-why-im-here': {
			audience: 'Drivers and neighbors',
			action: 'Pair a human story with one clear, respectful road action.',
			placement: 'Community outreach, social posts, school or work displays',
			customize: 'A real local voice, accurate image, and relevant action'
		},
		'03-a-person-on-a-bike': {
			audience: 'Drivers and neighbors',
			action: 'Recognize the person riding and give them room on the road.',
			placement: 'Community outreach, social posts, school or work displays',
			customize: 'A real local voice, accurate image, and relevant action'
		},
		'05-light-the-ride': {
			audience: 'Riders and families',
			action: 'Use visible front and rear lights after dark; offer fitting help.',
			placement: 'Schools, bike programs, and community gear events',
			customize: 'Local light rules, access to gear, and fitting support'
		},
		'06-before-the-door': {
			audience: 'People in parked vehicles',
			action: 'Check behind and wait for riders before opening a door.',
			placement: 'Workplaces, parking areas, and driver training',
			customize: 'Local rules, vehicle setup, and the parking context'
		},
		'07-check-before-you-turn': {
			audience: 'Drivers approaching turns',
			action: 'Check for riders and wait until the crossing path is clear.',
			placement: 'Driver training, fleet briefings, intersection outreach',
			customize: 'Local intersections, turning rules, and vehicle types'
		},
		'08-ride-alert, 09-after-a-crash': {
			audience: 'Riders, ride leaders, and helpers',
			action: 'Share a ride check-in plan and know where to get help after a crash.',
			placement: 'Group ride check-ins, wallet cards, event kits',
			customize: 'Emergency contacts, local routes, and response guidance'
		},
		'09-after-a-crash': {
			audience: 'Riders, witnesses, and ride leaders',
			action: 'Use the card to gather key details and connect with local help.',
			placement: 'Ride kits, wallet cards, group ride briefings',
			customize: 'Emergency contacts and local reporting procedures'
		},
		'10-find-your-people': {
			audience: 'New or returning riders',
			action: 'Join a welcoming local ride or connect with a riding community.',
			placement: 'Group rides, newcomer sessions, community events',
			customize: 'Local groups, meeting details, pace, and accessibility'
		},
		'11-arizona-riding-essentials': {
			audience: 'New riders and families in Arizona',
			action: 'Plan a ride with local gear, route, and heat-preparedness guidance.',
			placement: 'Beginner guides, school and community sessions',
			customize: 'Local routes, rules, climate, and support resources'
		}
	};

	const suggestedUse = (campaign) =>
		campaignUses[campaign] || {
			audience: 'Local riders and road users',
			action: 'Choose one clear, practical action for this audience.',
			placement: 'Community, school, or workplace outreach',
			customize: 'Local people, road rules, routes, and working links'
		};

	const designSets = $derived.by(() => {
		const grouped = new Map();
		for (const item of report.campaignGallery ?? []) {
			const key = item.assetId || item.id;
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key).push(item);
		}
		return [...grouped.entries()].map(([assetId, rawPages]) => {
			const pages = [...rawPages].sort((a, b) => (a.page ?? 1) - (b.page ?? 1));
			const first = pages[0];
			return {
				id: `asset-${assetId}`,
				assetId,
				title: formatSetTitle(first),
				campaign: first.campaign,
				kind: first.kind,
				pageCount: pages.length,
				pages,
				pdfUrl: first.pdfUrl,
				pdfBytes: first.pdfBytes,
				editableUrl: first.editableUrl,
				editableBytes: first.editableBytes,
				canvaTemplateUrl: first.canvaTemplateUrl,
				dimensions: first.dimensions,
				pixelWidth: first.pixelWidth,
				pixelHeight: first.pixelHeight
			};
		});
	});

	const types = $derived([...new Set(designSets.map((set) => set.kind))].sort());
	const topics = $derived([...new Set(designSets.map((set) => set.campaign))].sort());

	const results = $derived(
		designSets.filter(
			(set) => (type === 'All' || set.kind === type) && (topic === 'All' || set.campaign === topic)
		)
	);

	const totalMatchingPages = $derived(results.reduce((sum, set) => sum + set.pageCount, 0));
	const activeSet = $derived(results[activeIndex] ?? results[0]);
	const activePage = $derived(
		activeSet ? activeSet.pages[Math.min(activePageIndex, activeSet.pages.length - 1)] : undefined
	);

	const displayType = (value) =>
		value === 'All'
			? 'All formats'
			: value.replace(/^\w/, (char) => char.toUpperCase()).replaceAll('-', ' ');

	function cardPageIndex(set) {
		const current = cardPages[set.assetId] ?? 0;
		return Math.min(Math.max(0, current), set.pages.length - 1);
	}

	function stepCardPage(set, delta) {
		const next = (cardPageIndex(set) + delta + set.pages.length) % set.pages.length;
		cardPages = { ...cardPages, [set.assetId]: next };
	}

	function openImage(index, pageIdx, event) {
		trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		activeIndex = index;
		activePageIndex = pageIdx;
		dialog?.showModal();
	}

	function closeImage() {
		dialog?.close();
	}

	function restoreFocus() {
		trigger?.focus();
	}

	function move(delta) {
		if (!results.length) return;
		if (activeSet && activeSet.pages.length > 1) {
			const nextPage = activePageIndex + delta;
			if (nextPage >= 0 && nextPage < activeSet.pages.length) {
				activePageIndex = nextPage;
				return;
			}
		}
		const nextSetIndex = (activeIndex + delta + results.length) % results.length;
		activeIndex = nextSetIndex;
		activePageIndex = delta < 0 ? (results[nextSetIndex]?.pages.length ?? 1) - 1 : 0;
	}

	function moveSet(delta) {
		if (!results.length) return;
		activeIndex = (activeIndex + delta + results.length) % results.length;
		activePageIndex = 0;
	}

	function keydown(event) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			move(event.key === 'ArrowLeft' ? -1 : 1);
		}
	}
</script>

<div class="gallery">
	<div class="gallery-header">
		<p class="eyebrow">TEMPLATE LIBRARY · {designSets.length} DESIGN SETS</p>
		<h2>Adapt a complete design set.</h2>
		<p class="intro">
			Each card groups all proof pages for one downloadable template set. Poster A and B pages are
			alternatives; card pages may form duplex pairs. Preview every page before downloading the PDF,
			PowerPoint, or Canva copy.
		</p>
	</div>

	<aside class="customization-notice" aria-label="Template customization notice">
		<p class="notice-label">PLACEHOLDER NOTICE · CUSTOMIZE BEFORE SHARING</p>
		<p>
			Campaign images are AI generated. Images, logos, website addresses, and QR codes are design
			placeholders—replace them with local people, verified road rules, and working links in Canva
			or PowerPoint before distribution. No email or form is required for downloads.
		</p>
	</aside>

	<div class="controls" aria-label="Filter template sets">
		<label
			>Format
			<select
				bind:value={type}
				onchange={() => {
					activeIndex = 0;
					activePageIndex = 0;
				}}
			>
				<option value="All">All formats</option>
				{#each types as value (value)}<option {value}>{displayType(value)}</option>{/each}
			</select>
		</label>
		<label
			>Campaign
			<select
				bind:value={topic}
				onchange={() => {
					activeIndex = 0;
					activePageIndex = 0;
				}}
			>
				<option value="All">All campaigns</option>
				{#each topics as value (value)}<option {value}>{campaignName(value)}</option>{/each}
			</select>
		</label>
		{#if type !== 'All' || topic !== 'All'}
			<button
				type="button"
				class="reset-filters"
				onclick={() => {
					type = 'All';
					topic = 'All';
					activeIndex = 0;
					activePageIndex = 0;
				}}>Reset filters</button
			>
		{/if}
	</div>

	<p class="count" aria-live="polite">
		{results.length}
		{results.length === 1 ? 'design set' : 'design sets'} · {totalMatchingPages}
		{totalMatchingPages === 1 ? 'proof page' : 'proof pages'}
	</p>

	<div class="grid">
		{#each results as set, index (set.assetId)}
			{@const guidance = suggestedUse(set.campaign)}
			{@const pageIdx = cardPageIndex(set)}
			{@const currentPage = set.pages[pageIdx]}
			<article
				id={set.id}
				class="set-card"
				in:fly={{ y: reducedMotion ? 0 : 12, duration: reducedMotion ? 0 : 220 }}
				animate:flip={{ duration: reducedMotion ? 0 : 200 }}
			>
				<div class="preview-frame">
					<button
						type="button"
						class="image-button"
						aria-label={`Preview ${set.title} (${set.pageCount === 1 ? '1 page' : `page ${pageIdx + 1} of ${set.pageCount}`})`}
						onclick={(event) => openImage(index, pageIdx, event)}
					>
						<img
							src={currentPage.src}
							alt={currentPage.alt}
							loading="lazy"
							decoding="async"
							width="600"
							height="450"
						/>
						<span class="set-badge"
							>{set.pageCount === 1 ? '1 page' : `${set.pageCount}-page set`}</span
						>
					</button>
					{#if set.pageCount > 1}
						<div class="page-stepper" aria-label={`Pages in ${set.title}`}>
							<button
								type="button"
								aria-label={`Previous page of ${set.title}`}
								onclick={() => stepCardPage(set, -1)}>‹</button
							>
							<span>Page {pageIdx + 1} of {set.pageCount}</span>
							<button
								type="button"
								aria-label={`Next page of ${set.title}`}
								onclick={() => stepCardPage(set, 1)}>›</button
							>
						</div>
					{/if}
				</div>

				<p class="item-label">
					{displayType(set.kind)} · {formatSize(set)}
				</p>
				<h3>{set.title}</h3>

				<details class="campaign-guidance">
					<summary>Suggested use</summary>
					<dl>
						<div>
							<dt>Audience</dt>
							<dd>{guidance.audience}</dd>
						</div>
						<div>
							<dt>Action</dt>
							<dd>{guidance.action}</dd>
						</div>
						<div>
							<dt>Placement</dt>
							<dd>{guidance.placement}</dd>
						</div>
						<div>
							<dt>Customize</dt>
							<dd>{guidance.customize}</dd>
						</div>
					</dl>
				</details>

				<div class="card-actions">
					{#if set.pdfUrl}<a
							href={set.pdfUrl}
							download
							aria-label={`Download PDF set: ${set.title}`}>PDF set ↓</a
						>{/if}
					{#if currentPage.pngUrl}<a
							href={currentPage.pngUrl}
							download
							aria-label={`Download PNG page ${currentPage.page}: ${set.title}`}>PNG ↓</a
						>{/if}
					{#if set.editableUrl}<a
							href={set.editableUrl}
							download
							aria-label={`Download PowerPoint: ${set.title}`}>PPTX ↓</a
						>{/if}
					{#if set.canvaTemplateUrl}<a
							href={set.canvaTemplateUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Make your own Canva copy: ${set.title}`}>Make a Canva copy ↗</a
						>{/if}
				</div>
			</article>
		{/each}
	</div>

	{#if results.length === 0}
		<p class="empty">No template sets match those filters. Reset a dropdown to see all sets.</p>
	{/if}
</div>

<dialog
	bind:this={dialog}
	onclose={restoreFocus}
	onkeydown={keydown}
	onclick={(event) => event.target === event.currentTarget && closeImage()}
	aria-labelledby="gallery-dialog-title"
>
	{#if activeSet && activePage}
		<div class="dialog-top">
			<p class="eyebrow">
				Set {activeIndex + 1} / {results.length} · {displayType(activeSet.kind)} · Page {activePage.page}
				of {activeSet.pageCount}
			</p>
			<button type="button" class="close" onclick={closeImage} aria-label="Close preview">×</button>
		</div>
		<h2 id="gallery-dialog-title">{activeSet.title}</h2>
		{#if activeSet.pageCount > 1}
			<div class="dialog-pages" role="group" aria-label="Select page in design set">
				{#each activeSet.pages as pageItem, idx (pageItem.id)}
					<button
						type="button"
						aria-pressed={activePageIndex === idx}
						onclick={() => (activePageIndex = idx)}>Page {pageItem.page}</button
					>
				{/each}
			</div>
		{/if}
		{#key activePage.id}<img
				class="full-image"
				src={activePage.src}
				alt={activePage.alt}
				in:fade={{ duration: reducedMotion ? 0 : 180 }}
			/>{/key}
		<p class="caption">{activePage.alt}</p>
		<div class="actions">
			{#if activeSet.pdfUrl}<a class="download-primary" href={activeSet.pdfUrl} download
					>Download PDF set ↓ <small>{bytes(activeSet.pdfBytes)}</small></a
				>{/if}
			{#if activePage.pngUrl}<a href={activePage.pngUrl} download
					>Download PNG (page {activePage.page}) ↓ <small>{bytes(activePage.pngBytes)}</small></a
				>{/if}
			{#if activeSet.canvaTemplateUrl}<a
					class="template-link"
					href={activeSet.canvaTemplateUrl}
					target="_blank"
					rel="noopener noreferrer">Make your own Canva copy ↗</a
				>{/if}
			{#if activeSet.editableUrl}<a href={activeSet.editableUrl} download
					>Download editable PowerPoint ↓ <small>{bytes(activeSet.editableBytes)}</small></a
				>{/if}
			{#if onAsk}<button
					type="button"
					onclick={async () => {
						const question = `Help me adapt this template set for our community: ${activeSet.title} (${activePage.alt}).`;
						closeImage();
						await tick();
						onAsk(question);
					}}>Ask about this template →</button
				>{/if}
		</div>
		<p class="download-note">
			The PDF and PowerPoint downloads include {activeSet.pageCount === 1
				? 'the complete design'
				: `all ${activeSet.pageCount} pages in this set`} ({formatSize(activeSet)}). Canva opens a
			copy-safe template; check final layout, local rules, and QR links after editing.
		</p>
		<div class="navigation">
			<button type="button" onclick={() => moveSet(-1)}>← Previous set</button><span
				>Use Left / Right arrow keys to step pages</span
			><button type="button" onclick={() => moveSet(1)}>Next set →</button>
		</div>
	{/if}
</dialog>

<style>
	.gallery,
	dialog {
		--dg-ink: var(--ink, light-dark(var(--color-secondary-950), var(--color-surface-50)));
		--dg-muted: var(--muted, light-dark(var(--color-surface-700), var(--color-surface-200)));
		--dg-purple: var(--purple, light-dark(var(--color-secondary-700), var(--color-secondary-200)));
		--dg-pink: var(--pink, light-dark(var(--color-tertiary-700), var(--color-tertiary-300)));
		--dg-border: var(
			--report-border,
			light-dark(var(--color-secondary-400), var(--color-surface-400))
		);
		--dg-line: var(--line, light-dark(var(--color-secondary-200), var(--color-surface-700)));
		--dg-paper: var(--report-paper, light-dark(var(--color-surface-50), var(--color-surface-950)));
		--dg-soft: var(
			--report-soft,
			light-dark(
				color-mix(in srgb, var(--color-secondary-50) 24%, var(--color-surface-50)),
				var(--color-surface-900)
			)
		);
	}
	h2,
	h3 {
		color: var(--dg-ink) !important;
	}
	.gallery {
		color: var(--dg-ink);
	}
	.gallery h2,
	.gallery h3 {
		text-transform: none;
	}
	.gallery p {
		line-height: 1.6;
	}
	.eyebrow,
	.item-label,
	.notice-label {
		color: var(--dg-purple);
		letter-spacing: 0.08em;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	h2 {
		font-size: clamp(2rem, 4.5vw, 3.4rem);
		line-height: 1.04;
		letter-spacing: -0.04em;
		margin: 0.5rem 0 0.85rem;
	}
	.intro {
		max-width: 52rem;
	}
	.customization-notice {
		background: var(--dg-soft);
		border-left: 4px solid var(--dg-pink);
		padding: 1.15rem 1.35rem;
		margin: 1.75rem 0;
	}
	.customization-notice .notice-label {
		color: var(--dg-ink);
		margin-bottom: 0.35rem;
	}
	.customization-notice p:last-child {
		font-size: 0.92rem;
		color: var(--dg-muted);
		max-width: 60rem;
	}
	button,
	select {
		font: inherit;
		border-radius: 0;
	}
	button {
		cursor: pointer;
	}
	button:focus-visible,
	a:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--dg-pink);
		outline-offset: 3px;
	}
	.controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) auto;
		gap: 1rem;
		align-items: end;
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	select {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0.7rem 2rem 0.7rem 0.8rem;
		color: var(--dg-ink);
		border: 2px solid var(--dg-border);
		background-color: var(--dg-paper);
		font-size: 0.95rem;
		font-weight: 600;
		text-transform: none;
	}
	.reset-filters {
		min-height: 44px;
		padding: 0.7rem 1rem;
		border: 2px solid var(--dg-ink);
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		font-size: 0.82rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.count {
		font-weight: 800;
		margin: 1.5rem 0 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.5rem 1.25rem;
	}
	.set-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--dg-border);
		border-top: 4px solid var(--dg-purple);
		background: var(--dg-paper);
		padding: 1rem;
		scroll-margin-top: 140px;
	}
	.preview-frame {
		background: var(--dg-soft);
	}
	.image-button {
		position: relative;
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: var(--color-surface-50);
	}
	.image-button img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
		object-fit: contain;
		transition: transform 0.25s ease;
	}
	.image-button:hover {
		box-shadow: inset 0 0 0 3px var(--dg-pink);
	}
	.image-button:hover img {
		transform: scale(1.02);
	}
	.set-badge {
		position: absolute;
		top: 0;
		left: 0;
		background: var(--color-secondary-950);
		color: var(--color-primary-500);
		padding: 0.28rem 0.55rem;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.page-stepper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-top: 1px solid var(--dg-border);
		background: var(--dg-paper);
		color: var(--dg-ink);
		font-size: 0.78rem;
		font-weight: 750;
	}
	.page-stepper button {
		border: 0;
		background: var(--dg-soft);
		color: var(--dg-ink);
		padding: 0.35rem 0.7rem;
		font-size: 1rem;
		font-weight: 800;
	}
	.page-stepper button:hover {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.item-label {
		margin: 0.85rem 0 0.3rem;
		font-size: 0.74rem;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.3;
	}
	.campaign-guidance {
		margin-top: 0.75rem;
		padding-top: 0.65rem;
		border-top: 1px solid var(--dg-line);
		font-size: 0.85rem;
		line-height: 1.45;
	}
	.campaign-guidance > summary {
		cursor: pointer;
		padding-block: 0.3rem;
		color: var(--dg-muted);
		font-size: 0.84rem;
		font-weight: 750;
	}
	.campaign-guidance dl {
		display: grid;
		gap: 0.35rem;
		margin: 0.45rem 0 0;
	}
	.campaign-guidance dl div {
		display: grid;
		grid-template-columns: 5.2rem minmax(0, 1fr);
		gap: 0.45rem;
	}
	.campaign-guidance dt {
		font-weight: 750;
	}
	.campaign-guidance dd {
		margin: 0;
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: auto;
		padding-top: 0.9rem;
	}
	.card-actions a {
		font-size: 0.78rem;
		padding: 0.48rem 0.6rem;
		background: var(--dg-soft);
		color: var(--dg-purple);
		border: 1px solid var(--dg-border);
		text-decoration: none;
		font-weight: 800;
	}
	.card-actions a:last-child {
		background: var(--dg-purple);
		border-color: var(--dg-purple);
		color: light-dark(var(--color-surface-50), var(--color-surface-950));
	}
	.card-actions a:hover {
		background: var(--color-primary-500);
		border-color: var(--dg-ink);
		color: var(--color-primary-contrast-500);
	}
	.empty {
		padding: 1.25rem 0;
		color: var(--dg-muted);
	}
	dialog {
		box-sizing: border-box;
		margin: auto;
		width: min(1100px, calc(100% - 2rem));
		max-width: 1100px;
		max-height: 90vh;
		overflow: auto;
		padding: clamp(1rem, 4vw, 2.25rem);
		color: var(--dg-ink);
		background: var(--dg-paper);
		border: 2px solid var(--dg-ink);
		border-top: 6px solid var(--dg-pink);
		border-radius: 0;
	}
	dialog[open] {
		animation: gallery-arrive 0.18s ease-out;
	}
	@keyframes gallery-arrive {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	dialog::backdrop {
		background: rgb(35 20 58 / 0.8);
	}
	.dialog-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.close {
		border: 0;
		background: transparent;
		color: var(--dg-ink);
		font-size: 2.25rem;
		line-height: 1;
		padding: 0.1rem 0.4rem;
	}
	dialog h2 {
		font-size: clamp(1.4rem, 2.8vw, 2.2rem);
		margin-bottom: 0.75rem;
	}
	.dialog-pages {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.75rem 0;
	}
	.dialog-pages button {
		padding: 0.4rem 0.7rem;
		border: 2px solid var(--dg-border);
		background: var(--dg-paper);
		color: var(--dg-ink);
		font-size: 0.82rem;
		font-weight: 800;
	}
	.dialog-pages button[aria-pressed='true'] {
		background: var(--color-primary-500);
		border-color: var(--dg-ink);
		color: var(--color-primary-contrast-500);
	}
	.full-image {
		display: block;
		max-width: 100%;
		max-height: 60vh;
		width: auto;
		height: auto;
		margin: 1.25rem auto;
		object-fit: contain;
		background: var(--color-surface-50);
	}
	.caption {
		max-width: 65rem;
		line-height: 1.6;
		margin-bottom: 1rem;
	}
	.actions,
	.navigation {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
	}
	.actions a,
	.actions button {
		color: var(--dg-purple);
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.actions .download-primary,
	.actions .template-link {
		padding: 0.55rem 0.85rem;
		text-decoration: none;
	}
	.actions .download-primary {
		background: var(--dg-purple);
		color: light-dark(var(--color-surface-50), var(--color-surface-950));
	}
	.actions .template-link {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.actions small {
		display: block;
		font-size: 0.74rem;
		font-weight: 400;
	}
	.actions button {
		border: 0;
		background: none;
		padding: 0;
	}
	.download-note {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--dg-muted);
		margin: 1rem 0;
	}
	.navigation {
		justify-content: space-between;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--dg-border);
	}
	.navigation button {
		border: 2px solid var(--dg-ink);
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		padding: 0.6rem 0.9rem;
		font-weight: 800;
	}
	.navigation span {
		font-size: 0.85rem;
	}
	@media (max-width: 860px) {
		.controls {
			grid-template-columns: 1fr 1fr;
		}
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 580px) {
		.controls,
		.grid {
			grid-template-columns: 1fr;
		}
		.navigation span {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog[open] {
			animation: none;
		}
		.image-button img {
			transition: none;
		}
		.image-button:hover img {
			transform: none;
		}
	}
</style>
