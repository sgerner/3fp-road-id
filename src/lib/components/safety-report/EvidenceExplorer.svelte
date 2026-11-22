<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	/** @type {{ report: Record<string, any>, outcome?: string, onNavigate?: (target: string) => void, onAsk?: (question: string) => void }} */
	let { report, outcome = $bindable('All'), onNavigate = undefined, onAsk = undefined } = $props();

	let motionDuration = $state(140);
	onMount(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (motionDuration = preference.matches ? 0 : 140);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});

	let selected = $state(0);

	/** @type {[string, RegExp][]} */
	const filters = [
		[
			'Understanding/attitudes',
			/understand|comprehension|knowledge|attitude|perception|awareness|intention|belief|recall/i
		],
		[
			'On-road behavior',
			/passing distance|passing behav|observed.*(behav|passing|traffic)|lane change|encroachment|speed compliance/i
		],
		['Skills/equipment', /skill|training|helmet|light|equipment|visibility|wearing|fitting/i],
		['Injuries', /injur|crash|accident|fatalit/i],
		['Planning', /guidance|framework|toolkit|planning|implementation/i]
	];

	const outcomes = [
		{ label: 'All multi-party accidents', estimate: 0.7, low: 0.39, high: 1.28 },
		{ label: 'Multi-party injury accidents', estimate: 0.75, low: 0.23, high: 2.47 },
		{ label: 'Multi-party accidents in darkness', estimate: 0.29, low: 0.1, high: 0.84 }
	];

	const matches = $derived.by(() => {
		const pattern = filters.find(([label]) => label === outcome)?.[1];
		return (report?.sources ?? []).filter(
			(source) => !pattern || pattern.test(`${source.endpoint} ${source.design}`)
		);
	});

	const current = $derived(outcomes[selected]);
	/** @type {any} */
	const source42 = $derived(report?.sources?.find((source) => source.id === 'R42'));
	/** @type {any} */
	const axis = (value) =>
		48 + ((Math.log(value) - Math.log(0.1)) / (Math.log(3) - Math.log(0.1))) * 504;

	function citingChapter(recordId) {
		const chapter = (report?.sections ?? []).find(
			(section) => section.id !== 'references' && section.sourceIds?.includes(recordId)
		);
		return chapter
			? { id: chapter.id, label: chapter.title }
			: { id: `citation-${recordId}`, label: 'References' };
	}

	function setAllStudiesOpen(open) {
		document.querySelectorAll('.evidence-explorer .records > details').forEach((el) => {
			if (el instanceof HTMLDetailsElement) el.open = open;
		});
	}
</script>

<div class="evidence-explorer">
	<div class="intro">
		<p class="eyebrow">THE EVIDENCE REGISTER · 68 CITED SOURCES</p>
		<h2>Find the study behind the claim.</h2>
		<p>
			Inspect all 68 studies, reviews, and planning toolkits cited in this report. Outcome filters
			group records by measured endpoints and study designs; studies can appear in more than one
			outcome category. Use the search bar above to jump directly to a study ID, author, or topic.
		</p>
	</div>

	<div class="controls">
		<div class="filter-field">
			<label for="evidence-outcome">Filter by measured outcome</label>
			<select id="evidence-outcome" bind:value={outcome}>
				<option value="All">All outcomes ({report?.sources?.length ?? 68})</option>
				{#each filters as [label] (label)}<option value={label}>{label}</option>{/each}
			</select>
		</div>
		<div class="toolbar-actions">
			<a class="download" href={report.meta.csvUrl} download
				>Export CSV register <span aria-hidden="true">↓</span></a
			>
			<a
				class="chart-link"
				href="#r42-chart"
				onclick={(event) => {
					if (onNavigate) {
						event.preventDefault();
						onNavigate('r42-chart');
					}
				}}>Inspect R42 confidence intervals ↓</a
			>
		</div>
	</div>

	<div class="register-bar">
		<p class="count" aria-live="polite">
			{matches.length}
			{matches.length === 1 ? 'study' : 'studies'} shown
		</p>
		<div class="bulk-controls">
			<button type="button" onclick={() => setAllStudiesOpen(true)}>Expand all +</button>
			<button type="button" onclick={() => setAllStudiesOpen(false)}>Collapse all −</button>
			{#if outcome !== 'All'}
				<button type="button" onclick={() => (outcome = 'All')}>Show all 68</button>
			{/if}
		</div>
	</div>

	<div class="records">
		{#each matches as source (source.id)}
			{@const chapterTarget = citingChapter(source.id)}
			<details id={`ref-${source.id}`} in:fade={{ duration: motionDuration }}>
				<summary
					><span class="record-id">{source.id}</span><span
						><strong>{source.title}</strong><small>{source.authors} · {source.year}</small></span
					><span class="expand" aria-hidden="true">+</span></summary
				>
				<div class="detail">
					<dl>
						<div>
							<dt>What was measured</dt>
							<dd>{source.endpoint}</dd>
						</div>
						<div>
							<dt>What the study found</dt>
							<dd>{source.finding}</dd>
						</div>
						<div>
							<dt>Limits</dt>
							<dd>{source.limits}</dd>
						</div>
						<div>
							<dt>Study design</dt>
							<dd>{source.design}</dd>
						</div>
						<div>
							<dt>Sample</dt>
							<dd>{source.sample}</dd>
						</div>
						<div>
							<dt>Access</dt>
							<dd>{source.access}</dd>
						</div>
					</dl>
					<div class="links">
						<a href={source.url} target="_blank" rel="noopener noreferrer">Original source ↗</a>
						<a
							href={`#${chapterTarget.id}`}
							onclick={(event) => {
								if (onNavigate) {
									event.preventDefault();
									onNavigate(chapterTarget.id);
								}
							}}>Read in report ({chapterTarget.label.replace(/^\d+\.\s*/, '')}) →</a
						>
						{#if onAsk}<button
								type="button"
								onclick={() =>
									onAsk(`What does ${source.id} tell us, and what are its limitations?`)}
								>Ask about {source.id} →</button
							>{/if}
					</div>
				</div>
			</details>
		{/each}
	</div>

	{#if matches.length === 0}
		<p class="empty" transition:fade={{ duration: motionDuration }}>
			No studies match this outcome filter. Choose All outcomes to see all 68 studies.
		</p>
	{/if}

	<section id="r42-chart" class="interval" aria-labelledby="r42-chart-heading">
		<p class="eyebrow">READING A RESULT · STUDY R42</p>
		<h3 id="r42-chart-heading">One equipment study, three outcomes.</h3>
		<p>
			This trial compared bicycle light use with usual light routines. It tested equipment use, not
			the effect of a message encouraging it. Choose an outcome to see its estimated rate ratio and
			95% confidence interval.
		</p>
		<label for="interval-outcome">Outcome</label>
		<select id="interval-outcome" bind:value={selected}>
			{#each outcomes as item, index (item.label)}<option value={index}>{item.label}</option>{/each}
		</select>
		<svg viewBox="0 0 600 150" role="img" aria-labelledby="interval-title interval-desc">
			<title id="interval-title">{current.label}: rate ratio {current.estimate.toFixed(2)}</title>
			<desc id="interval-desc"
				>The 95 percent confidence interval runs from {current.low.toFixed(2)} to {current.high.toFixed(
					2
				)}. The reference value for equal rates is 1.</desc
			>
			<line x1="48" y1="95" x2="552" y2="95" stroke="currentColor" stroke-width="2" />
			{#key selected}<g transition:fade={{ duration: motionDuration }}>
					<line
						x1={axis(1)}
						y1="15"
						x2={axis(1)}
						y2="103"
						stroke="#7926cb"
						stroke-width="2"
						stroke-dasharray="5 5"
					/>
					<text x={axis(1)} y="13" text-anchor="middle" class="chart-label">Equal rates</text>
					<line
						x1={axis(current.low)}
						y1="60"
						x2={axis(current.high)}
						y2="60"
						stroke="#ff0180"
						stroke-width="6"
					/>
					<line
						x1={axis(current.low)}
						y1="49"
						x2={axis(current.low)}
						y2="71"
						stroke="#ff0180"
						stroke-width="3"
					/>
					<line
						x1={axis(current.high)}
						y1="49"
						x2={axis(current.high)}
						y2="71"
						stroke="#ff0180"
						stroke-width="3"
					/>
					<circle cx={axis(current.estimate)} cy="60" r="8" fill="#23143a" />
					{#each [0.1, 0.3, 1, 3] as tick (tick)}<line
							x1={axis(tick)}
							y1="95"
							x2={axis(tick)}
							y2="102"
							stroke="currentColor"
						/><text x={axis(tick)} y="122" text-anchor="middle" class="chart-label">{tick}</text
						>{/each}
					<text x="300" y="145" text-anchor="middle" class="chart-label"
						>Rate ratio (log scale)</text
					>
				</g>{/key}
		</svg>
		<p class="result">
			<strong>Estimate: {current.estimate.toFixed(2)}.</strong> 95% confidence interval: {current.low.toFixed(
				2
			)}–{current.high.toFixed(2)}.
		</p>
		<p>
			Below 1 means a lower rate in the test group. The interval shows a range compatible with the
			data under the study model. {#if current.low <= 1 && current.high >= 1}This interval crosses
				1, so the result is uncertain and is also compatible with equal rates.{:else}This interval
				is below 1. This darkness subgroup result has limitations, including incomplete responses
				and possible differences in nighttime lighting.{/if}
		</p>
		{#if source42}
			<div class="links">
				<a href={source42.url} target="_blank" rel="noopener noreferrer">Read study R42 ↗</a>
				<a
					href="#ref-R42"
					onclick={(event) => {
						if (onNavigate) {
							event.preventDefault();
							onNavigate('ref-R42');
						}
					}}>Open R42 register entry ↑</a
				>
			</div>
		{/if}
	</section>
</div>

<style>
	h2,
	h3 {
		color: var(--color-secondary-950) !important;
	}
	.evidence-explorer {
		color: var(--color-secondary-950);
	}
	.evidence-explorer h2,
	.evidence-explorer h3 {
		text-transform: none;
	}
	.evidence-explorer p,
	.evidence-explorer dd {
		line-height: 1.6;
	}
	.intro {
		max-width: 52rem;
	}
	.eyebrow {
		color: var(--color-secondary-700-300);
		letter-spacing: 0.08em;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	h2 {
		font-size: clamp(2rem, 4.5vw, 3.5rem);
		line-height: 1.04;
		letter-spacing: -0.04em;
		margin: 0.5rem 0 0.85rem;
	}
	h3 {
		font-size: clamp(1.6rem, 3vw, 2.4rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
		margin: 0.5rem 0 1rem;
	}
	a {
		color: var(--color-secondary-700-300);
		font-weight: 750;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem 1.5rem;
		margin: 1.75rem 0 1.25rem;
		padding: 1.15rem;
		background: var(--report-soft);
		border-top: 3px solid var(--color-secondary-950);
	}
	.filter-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: min(100%, 20rem);
		flex: 1 1 20rem;
		max-width: 28rem;
	}
	.toolbar-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
	}
	.download {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0.65rem 1rem;
		border: 2px solid var(--color-secondary-950);
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		text-decoration: none;
		font-weight: 800;
		font-size: 0.88rem;
	}
	.download:hover {
		background: var(--color-secondary-700-300);
		color: var(--color-surface-50);
	}
	.chart-link {
		font-size: 0.9rem;
	}
	label {
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	select {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		border: 2px solid var(--color-secondary-400);
		border-radius: 0;
		background-color: var(--report-paper);
		padding: 0.7rem 2rem 0.7rem 0.8rem;
		color: var(--color-secondary-950);
		font: inherit;
		font-weight: 600;
	}
	select:focus-visible,
	a:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--color-tertiary-700-300);
		outline-offset: 3px;
	}
	.register-bar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1.25rem;
		margin: 1rem 0 0.6rem;
	}
	.count {
		font-weight: 800;
	}
	.bulk-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
	}
	.bulk-controls button {
		border: 0;
		background: none;
		padding: 0;
		color: var(--color-secondary-700-300);
		font-size: 0.84rem;
		font-weight: 800;
	}
	details {
		border-top: 1px solid var(--color-secondary-300);
		scroll-margin-top: 140px;
	}
	details:last-child {
		border-bottom: 1px solid var(--color-secondary-300);
	}
	summary {
		display: grid;
		grid-template-columns: 4rem 1fr 1.5rem;
		gap: 0.7rem;
		align-items: start;
		padding: 1.1rem 0;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary strong {
		font-size: 1.03rem;
	}
	summary small {
		display: block;
		margin-top: 0.28rem;
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--color-surface-700);
	}
	.record-id {
		color: var(--color-secondary-700-300);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.expand {
		color: var(--color-secondary-700-300);
		font-size: 1.5rem;
		line-height: 1;
	}
	details[open] .expand {
		transform: rotate(45deg);
	}
	.detail {
		padding: 0 0 1.5rem 4.7rem;
		max-width: 62rem;
	}
	dl {
		margin: 0;
	}
	dl div {
		margin: 0 0 0.95rem;
	}
	dt {
		font-weight: 800;
		margin-bottom: 0.2rem;
	}
	dd {
		margin: 0;
		line-height: 1.55;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem 1.5rem;
		align-items: center;
		margin-top: 0.75rem;
	}
	button {
		cursor: pointer;
		font: inherit;
		font-weight: 800;
		border-radius: 0;
	}
	button,
	a,
	summary {
		transition:
			color 140ms ease,
			background-color 140ms ease,
			border-color 140ms ease;
	}
	.links button {
		color: var(--color-secondary-700-300);
		border: 0;
		background: none;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.interval {
		margin-top: 3.5rem;
		padding: clamp(1.25rem, 4vw, 2.25rem);
		background: var(--report-soft);
		border-top: 4px solid var(--color-tertiary-700-300);
		scroll-margin-top: 140px;
	}
	.interval label {
		display: block;
		margin: 1.35rem 0 0.4rem;
	}
	.interval select {
		max-width: 30rem;
	}
	.interval svg {
		display: block;
		width: 100%;
		max-width: 42rem;
		margin: 1rem auto;
		overflow: visible;
	}
	.chart-label {
		fill: var(--color-secondary-950);
		font: 14px sans-serif;
	}
	.result {
		font-size: 1.1rem;
		margin-bottom: 0.5rem;
	}
	@media (max-width: 600px) {
		summary {
			grid-template-columns: 3rem 1fr 1rem;
		}
		.detail {
			padding-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button,
		a,
		summary {
			transition: none;
		}
	}
</style>
