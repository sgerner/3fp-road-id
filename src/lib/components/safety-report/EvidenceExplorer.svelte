<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	let { report, onAsk = undefined } = $props();
	let motionDuration = $state(140);
	onMount(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (motionDuration = preference.matches ? 0 : 140);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});
	let query = $state('');
	let outcome = $state('All');
	let visible = $state(10);
	let selected = $state(0);

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
		const term = query.trim().toLowerCase();
		const pattern = filters.find(([label]) => label === outcome)?.[1];
		return (report?.sources ?? []).filter((source) => {
			const text = Object.values(source).join(' ').toLowerCase();
			return (
				(!term || text.includes(term)) &&
				(!pattern || pattern.test(`${source.endpoint} ${source.design}`))
			);
		});
	});
	const current = $derived(outcomes[selected]);
	const source42 = $derived(report?.sources?.find((source) => source.id === 'R42'));
	const axis = (value) =>
		48 + ((Math.log(value) - Math.log(0.1)) / (Math.log(3) - Math.log(0.1))) * 504;
	function resetResults() {
		visible = 10;
	}
</script>

<div class="evidence-explorer">
	<div class="intro">
		<p class="eyebrow">The evidence register</p>
		<h2>Find the study behind the claim.</h2>
		<p>
			Search by study ID, topic, author, or outcome. Filters group records by words in their methods
			and measured endpoints; studies can appear in more than one group.
		</p>
		<a class="download" href={report.meta.csvUrl} download
			>Download the full evidence register <span aria-hidden="true">↗</span></a
		>
	</div>

	<div class="controls">
		<label for="evidence-search">Search the evidence</label>
		<input
			id="evidence-search"
			type="search"
			placeholder="Try R42, passing, or helmets"
			bind:value={query}
			oninput={resetResults}
		/>
		<label for="evidence-outcome">Filter by outcome</label>
		<select id="evidence-outcome" bind:value={outcome} onchange={resetResults}>
			<option>All</option>
			{#each filters as [label]}<option>{label}</option>{/each}
		</select>
	</div>
	<p class="count" aria-live="polite">
		{matches.length}
		{matches.length === 1 ? 'study' : 'studies'} found
	</p>
	<div class="records">
		{#each matches.slice(0, visible) as source (source.id)}
			<details in:fade={{ duration: motionDuration }}>
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
						<a href={source.url} target="_blank" rel="noopener noreferrer">Original source ↗</a><a
							href={'#ref-' + source.id}>Reference in report ↓</a
						>{#if onAsk}<button
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
	{#if matches.length === 0}<p class="empty" transition:fade={{ duration: motionDuration }}>
			No studies match. Try another word or choose All.
		</p>{/if}
	{#if visible < matches.length}<button class="more" type="button" onclick={() => (visible += 10)}
			>Show more studies <span aria-hidden="true">↓</span></button
		>{/if}

	<div class="interval">
		<p class="eyebrow">Reading a result · R42</p>
		<h3>One equipment study, three outcomes.</h3>
		<p>
			This trial compared bicycle light use with usual light routines. It tested equipment use, not
			the effect of a message encouraging it. Choose an outcome to see its estimated rate ratio and
			95% confidence interval.
		</p>
		<label for="interval-outcome">Outcome</label>
		<select id="interval-outcome" bind:value={selected}>
			{#each outcomes as item, index}<option value={index}>{item.label}</option>{/each}
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
					{#each [0.1, 0.3, 1, 3] as tick}<line
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
		{#if source42}<a href={source42.url} target="_blank" rel="noopener noreferrer"
				>Read study R42 ↗</a
			>{/if}
	</div>
</div>

<style>
	h2,
	h3 {
		color: #26123c !important;
	}
	.evidence-explorer {
		color: #23143a;
	}
	.intro {
		max-width: 48rem;
	}
	.eyebrow {
		color: #7926cb;
		text-transform: uppercase;
		letter-spacing: 0.11em;
		font-size: 0.76rem;
		font-weight: 800;
	}
	h2 {
		font-size: clamp(2rem, 5vw, 3.6rem);
		line-height: 1.04;
		letter-spacing: -0.04em;
		margin: 0.5rem 0 1rem;
	}
	h3 {
		font-size: clamp(1.6rem, 3vw, 2.5rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
		margin: 0.5rem 0 1rem;
	}
	p {
		line-height: 1.6;
	}
	a {
		color: #681bae;
		font-weight: 700;
		text-underline-offset: 0.2em;
	}
	.download {
		display: inline-block;
		margin: 0.5rem 0 2rem;
	}
	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem 1rem;
		align-items: end;
	}
	.controls label:first-child {
		grid-column: 1;
		grid-row: 1;
	}
	.controls label:nth-of-type(2) {
		grid-column: 2;
		grid-row: 1;
	}
	label {
		font-size: 0.85rem;
		font-weight: 800;
	}
	input,
	select {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid #9d8aab;
		border-radius: 0.35rem;
		background: white;
		padding: 0.8rem;
		color: #23143a;
		font: inherit;
	}
	input:focus-visible,
	select:focus-visible,
	a:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #ff0180;
		outline-offset: 3px;
	}
	.count {
		font-weight: 700;
		margin: 1.4rem 0 0.5rem;
	}
	details {
		border-top: 1px solid #cbbbd3;
	}
	details:last-child {
		border-bottom: 1px solid #cbbbd3;
	}
	summary {
		display: grid;
		grid-template-columns: 4rem 1fr 1.5rem;
		gap: 0.7rem;
		align-items: start;
		padding: 1.15rem 0;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary strong {
		font-size: 1.05rem;
	}
	summary small {
		display: block;
		margin-top: 0.3rem;
		line-height: 1.4;
		color: #5c4b67;
	}
	.record-id {
		color: #7926cb;
		font-weight: 800;
	}
	.expand {
		color: #7926cb;
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
		margin: 0 0 1rem;
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
		gap: 1rem 1.5rem;
		align-items: center;
	}
	button {
		cursor: pointer;
		font: inherit;
		font-weight: 800;
	}
	button,
	a,
	summary {
		transition:
			color 140ms ease,
			background-color 140ms ease,
			border-color 140ms ease;
	}
	button:hover,
	a:hover {
		color: #4e198c;
	}
	.links button {
		color: #681bae;
		border: 0;
		background: none;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.more {
		margin: 1.5rem 0;
		padding: 0.85rem 1.2rem;
		border: 2px solid #7926cb;
		border-radius: 0.35rem;
		background: transparent;
		color: #681bae;
	}
	.interval {
		margin-top: 4rem;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		background: #f7f1e9;
		border-top: 5px solid #ff0180;
	}
	.interval label {
		display: block;
		margin: 1.5rem 0 0.4rem;
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
		fill: #23143a;
		font: 13px sans-serif;
	}
	.result {
		font-size: 1.1rem;
	}
	@media (max-width: 600px) {
		.controls {
			display: flex;
			flex-direction: column;
			align-items: stretch;
		}
		.controls label:nth-of-type(2) {
			margin-top: 0.7rem;
		}
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
