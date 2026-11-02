<script>
	/** @type {{ report: Record<string, any>, onNavigate?: (target: string) => void, onAsk?: (question: string) => void }} */
	let { report, onNavigate, onAsk } = $props();
	let activePath = $state('passing');
	let audience = $state('');
	let setting = $state('');
	let partner = $state('');
	let copyStatus = $state('');

	let guide = $derived(report.campaignGuide ?? {});
	let paths = $derived(guide.paths ?? []);
	let bundles = $derived(guide.bundles ?? []);
	let evaluation = $derived(guide.evaluation ?? { questions: [], fields: [], instructions: '' });

	let active = $derived(paths.find((path) => path.id === activePath) || paths[0]);
	let activeBundle = $derived(bundles.find((bundle) => bundle.id === active?.bundle) || bundles[0]);
	let sources = $derived(
		(active?.sources ?? [])
			.map((record) => report.sources?.find((source) => source.record === record))
			.filter(Boolean)
	);
	let pieces = $derived.by(() =>
		(active?.pieces ?? [])
			.map((piece) => {
				const asset = piece.assetId
					? report.campaignGallery?.find(
							(item) => item.assetId === piece.assetId && item.page === 1
						)
					: undefined;
				const figure = piece.figureId
					? report.figures?.find((item) => item.id === piece.figureId)
					: undefined;
				const visual = asset || figure;
				const dimensions = asset?.pixelWidth
					? String(asset.pixelWidth) + ' × ' + String(asset.pixelHeight) + ' px'
					: asset?.dimensions?.length
						? asset.dimensions.map((size) => Number(size.toFixed(1))).join(' × ') + ' in'
						: 'Report figure';
				return { ...piece, asset, figure, visual, dimensions };
			})
			.filter((piece) => piece.visual)
	);

	function chooseBundle(bundle) {
		activePath = bundle.defaultPath;
		copyStatus = '';
	}

	function choosePath(path) {
		activePath = path.id;
		copyStatus = '';
	}

	function sourceLink(record) {
		return `#ref-${record}`;
	}

	function evaluationText() {
		return [
			`CAMPAIGN PLANNING KIT — ${active.label.toUpperCase()}`,
			'',
			`Audience: ${audience.trim() || '[define the people you need to reach]'}`,
			`Setting or channel: ${setting.trim() || '[choose a place or channel]'}`,
			`Delivery partner / practical help: ${partner.trim() || '[name a partner and confirmed support]'}`,
			'',
			`Primary action: ${active.action}`,
			`Why this action: ${active.why}`,
			`Example: ${active.example}`,
			`Support to arrange: ${active.support}`,
			'',
			'PRE-LAUNCH QUESTIONS',
			...evaluation.questions.map((question, index) => `${index + 1}. ${question}`),
			'',
			`EVALUATION PLAN: ${evaluation.instructions}`,
			`PATHWAY CHECK: ${active.check}`,
			'',
			`Report evidence records: ${active.sources.join(', ')}`,
			'',
			'COORDINATED MATERIALS',
			...active.pieces.flatMap((piece) => [
				`${piece.format}: ${piece.copy}`,
				`Placement: ${piece.placement}`,
				`Role: ${piece.role}`
			])
		].join('\n');
	}

	async function copyKit() {
		const text = evaluationText();
		try {
			await navigator.clipboard.writeText(text);
			copyStatus = 'Planning kit copied.';
		} catch {
			copyStatus =
				'Copy is unavailable here. Select and copy the planning kit from the text area below.';
		}
	}

	function downloadSheet() {
		const rows = [
			['Campaign recording sheet', activeBundle.title],
			['Pathway', active.label],
			['Audience', audience.trim()],
			['Setting or channel', setting.trim()],
			['Delivery partner / practical help', partner.trim()],
			[],
			evaluation.fields
		];
		const csv = rows
			.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
			.join('\r\n');
		const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'campaign-evaluation-recording-sheet.csv';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<section class="planner" aria-labelledby="campaign-planner-title">
	{#if active && activeBundle}
		<header class="intro">
			<p class="eyebrow">CAMPAIGN PLANNER · REPORT-GROUNDED STARTING POINT</p>
			<h2 id="campaign-planner-title">Choose an action. Build the support around it.</h2>
			<p class="lead">
				Start with the situation or barrier you can address. Each pathway gives you a practical
				action, reason to use it, example wording, partner support, an evaluation check, and
				campaign materials.
			</p>
			<p class="priority">
				<strong>Keep safer streets first.</strong> Use campaigns alongside safer road design and speeds.
			</p>
		</header>

		<div class="step-heading">
			<span>01</span>
			<div>
				<h3>Choose a ready-made package</h3>
				<p>Start with a connected set of messages, support, and places to deliver them.</p>
			</div>
		</div>
		<div class="bundle-grid" aria-label="Choose a campaign package">
			{#each bundles as bundle}
				<button
					type="button"
					class="bundle"
					class:selected={activeBundle.id === bundle.id}
					aria-pressed={activeBundle.id === bundle.id}
					onclick={() => chooseBundle(bundle)}
				>
					<span class="bundle-subtitle">{bundle.subtitle}</span>
					<strong>{bundle.title}</strong>
					<span>{bundle.description}</span>
				</button>
			{/each}
		</div>

		<div class="step-heading">
			<span>02</span>
			<div>
				<h3>Choose the main pathway</h3>
				<p>The package stays connected as you focus the plan on one priority.</p>
			</div>
		</div>
		<div class="path-list" aria-label="Choose a campaign pathway">
			{#each paths as path}
				<button
					type="button"
					class="path-button"
					class:active={activePath === path.id}
					aria-pressed={activePath === path.id}
					onclick={() => choosePath(path)}
					>{path.label}<span aria-hidden="true">{activePath === path.id ? '✓' : '↗'}</span></button
				>
			{/each}
		</div>

		<article class="recommendation">
			<div class="recommendation-top">
				<span class="kicker">RECOMMENDED NEXT STEP</span><span class="bundle-tag"
					>{activeBundle.title}</span
				>
			</div>
			<h3>{active.action}</h3>
			<div class="recommendation-grid">
				<div>
					<h4>Why this is a useful starting point</h4>
					<p>{active.why}</p>
				</div>
				<div>
					<h4>Example wording</h4>
					<blockquote>{active.example}</blockquote>
				</div>
				<div>
					<h4>Make the action possible</h4>
					<p>{active.support}</p>
				</div>
				<div>
					<h4>Check whether it works as intended</h4>
					<p>{active.check}</p>
				</div>
			</div>
			{#if sources.length}
				<div class="evidence">
					<strong>Evidence in this report</strong>
					{#each sources as source, index}
						<a href={sourceLink(source.record)} onclick={() => onNavigate?.(`ref-${source.record}`)}
							>{source.record}<span class="sr-only">: {source.title}</span></a
						>{index < sources.length - 1 ? ', ' : ''}
					{/each}
					<p>
						Use each study for the outcome it measured; match your local check to the change you
						want.
					</p>
				</div>
			{/if}
			{#if onAsk}
				<button
					type="button"
					class="ask-button"
					onclick={() =>
						onAsk(
							`Help me adapt the ${active.label.toLowerCase()} campaign pathway for a local audience. Suggest a teach-back question and a practical follow-up measure.`
						)}>Ask about this pathway <span aria-hidden="true">↗</span></button
				>
			{/if}
		</article>

		<section class="materials" aria-labelledby="materials-title">
			<div class="step-heading">
				<span>03</span>
				<div>
					<h3 id="materials-title">Coordinate three pieces</h3>
					<p>
						Keep the action consistent across a poster, handout, and social post. Each example has a
						placement and job in the campaign.
					</p>
				</div>
			</div>
			{#if pieces.length}
				<div class="material-grid">
					{#each pieces as piece (`${active.id}-${piece.format}`)}
						<article class="material-card">
							<img
								class="material-preview"
								src={piece.visual.src}
								alt={piece.visual.alt}
								loading="lazy"
								decoding="async"
							/>
							<div class="material-topline">
								<span class="material-kind">{piece.format}</span><span class="dimensions"
									>{piece.dimensions}</span
								>
							</div>
							{#if piece.asset}<h4>
									{piece.asset.title?.replace(/ — .*$/, '') || piece.asset.assetId}
								</h4>{:else}<h4>Report artwork reference</h4>{/if}
							<div class="piece-copy">
								<strong>Sample copy</strong>
								<p>{piece.copy}</p>
							</div>
							<div class="piece-details">
								<p><strong>Place it:</strong> {piece.placement}</p>
								<p><strong>Use it to:</strong> {piece.role}</p>
							</div>
							{#if piece.asset}
								<div class="material-links">
									{#if piece.asset.pdfUrl}<a href={piece.asset.pdfUrl} download>Download PDF</a
										>{/if}
									{#if piece.asset.editableUrl}<a href={piece.asset.editableUrl} download
											>Edit PowerPoint</a
										>{/if}
									{#if piece.asset.canvaTemplateUrl}<a
											href={piece.asset.canvaTemplateUrl}
											target="_blank"
											rel="noopener noreferrer">Make Canva copy ↗</a
										>{/if}
								</div>
							{:else}
								<p class="figure-note">
									Report artwork · use as a visual reference for a local version.
								</p>
							{/if}
						</article>
					{/each}
				</div>
			{:else}
				<p class="empty">This pathway has no matching template previews in the report data yet.</p>
			{/if}
		</section>

		<section class="evaluation" aria-labelledby="evaluation-title">
			<div class="step-heading">
				<span>04</span>
				<div>
					<h3 id="evaluation-title">Prepare delivery and evaluation</h3>
					<p>
						Make the audience, location, and support concrete. The copyable kit updates with your
						selected pathway.
					</p>
				</div>
			</div>
			<div class="fields">
				<label
					>Audience <input
						bind:value={audience}
						placeholder="Who needs to act or receive support?"
					/></label
				>
				<label
					>Setting or channel <input
						bind:value={setting}
						placeholder="Where will people encounter the campaign?"
					/></label
				>
				<label
					>Partner and practical help <input
						bind:value={partner}
						placeholder="Who will deliver it, and what will be available?"
					/></label
				>
			</div>
			<div class="evaluation-actions">
				<button type="button" class="primary-action" onclick={copyKit}>Copy planning kit</button>
				<button type="button" class="secondary-action" onclick={downloadSheet}
					>Download recording sheet (CSV)</button
				>
				<span class="copy-status" role="status" aria-live="polite">{copyStatus}</span>
			</div>
			<details class="kit-preview">
				<summary>Preview or select and copy the planning kit</summary>
				<label class="kit-label"
					>Planning kit<textarea readonly rows="10" value={evaluationText()}></textarea></label
				>
			</details>
			<p class="evaluation-note">
				Record delivery, action checks, practical support, and follow-up. Choose each measure to
				match the result you want to change.
			</p>
		</section>
	{:else}
		<p class="empty">Campaign planning content is not available in this report edition.</p>
	{/if}
</section>

<style>
	.planner h2,
	.planner h3,
	.planner h4 {
		color: var(--planner-ink) !important;
		text-transform: none;
	}

	.planner {
		--planner-ink: var(--color-secondary-950);
		--planner-muted: var(--color-surface-700);
		--planner-line: var(--report-border);
		--planner-panel: var(--report-paper);
		--planner-soft: color-mix(in srgb, var(--report-soft) 35%, var(--report-paper));
		--planner-accent: var(--color-primary-500);
		--planner-secondary: var(--color-secondary-700-300);
		--planner-highlight: var(--color-tertiary-700-300);
		max-width: 1100px;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem);
		border: 1px solid var(--planner-line);
		border-radius: 1.5rem;
		background: var(--planner-panel);
		color: var(--planner-ink);
		box-shadow: 0 18px 50px color-mix(in srgb, var(--planner-ink) 8%, transparent);
	}
	.intro {
		max-width: 760px;
		margin-bottom: 2rem;
	}
	.eyebrow,
	.kicker,
	.bundle-subtitle,
	.material-kind {
		color: var(--planner-secondary);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.intro h2 {
		max-width: 720px;
		margin: 0.5rem 0 0.75rem;
		font-size: clamp(2rem, 4.5vw, 3.4rem);
		line-height: 1.02;
		letter-spacing: -0.04em;
	}
	.lead {
		color: var(--planner-muted);
		font-size: 1.05rem;
		line-height: 1.6;
	}
	.priority {
		padding: 0.85rem 1rem;
		border-left: 4px solid var(--planner-accent);
		border-radius: 0 0.75rem 0.75rem 0;
		background: var(--planner-soft);
		line-height: 1.5;
	}
	.step-heading {
		display: flex;
		gap: 0.85rem;
		align-items: flex-start;
		margin: 2rem 0 0.85rem;
	}
	.step-heading > span {
		display: grid;
		flex: 0 0 2rem;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border-radius: 50%;
		background: var(--planner-accent);
		color: var(--color-primary-contrast-500);
		font-size: 0.82rem;
		font-weight: 850;
	}
	.step-heading h3 {
		margin: 0;
		font-size: 1.25rem;
	}
	.step-heading p {
		margin: 0.25rem 0 0;
		color: var(--planner-muted);
		line-height: 1.5;
	}
	.bundle-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.bundle {
		display: flex;
		flex-direction: column;
		min-height: 140px;
		gap: 0.55rem;
		padding: 1rem;
		border: 1px solid var(--planner-line);
		border-radius: 1rem;
		background: var(--planner-soft);
		color: var(--planner-ink);
		text-align: left;
		cursor: pointer;
	}
	.bundle strong {
		font-size: 1.1rem;
	}
	.bundle > span:last-child {
		color: var(--planner-muted);
		line-height: 1.4;
	}
	.bundle.selected {
		border: 2px solid var(--planner-accent);
		background: color-mix(in srgb, var(--planner-accent) 9%, var(--planner-panel));
	}
	.path-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.path-button {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.68rem 0.9rem;
		border: 1px solid var(--planner-line);
		border-radius: 999px;
		background: var(--planner-panel);
		color: var(--planner-ink);
		font-weight: 700;
		cursor: pointer;
	}
	.path-button span {
		color: var(--planner-secondary);
	}
	.path-button.active {
		border-color: var(--planner-accent);
		background: var(--planner-accent);
		color: var(--color-primary-contrast-500);
	}
	.path-button.active span {
		color: inherit;
	}
	.recommendation {
		margin-top: 1.1rem;
		padding: clamp(1rem, 3vw, 1.6rem);
		border-radius: 1.2rem;
		background: var(--planner-soft);
		border-top: 5px solid var(--planner-accent);
	}
	.recommendation-top {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
	}
	.bundle-tag {
		color: var(--planner-muted);
		font-size: 0.78rem;
	}
	.recommendation h3 {
		max-width: 880px;
		margin: 0.65rem 0 1rem;
		font-size: clamp(1.35rem, 2.8vw, 2rem);
		line-height: 1.2;
	}
	.recommendation-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}
	.recommendation-grid > div {
		padding: 0.9rem;
		border: 1px solid var(--planner-line);
		border-radius: 0.8rem;
		background: var(--planner-panel);
	}
	.recommendation-grid h4 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.recommendation-grid p {
		margin: 0;
		color: var(--planner-muted);
		line-height: 1.55;
	}
	blockquote {
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--planner-highlight);
		font-size: 1.08rem;
		font-weight: 750;
		line-height: 1.5;
	}
	.evidence {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--planner-line);
		color: var(--planner-muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.evidence strong {
		color: var(--planner-ink);
		margin-right: 0.5rem;
	}
	.evidence a {
		color: var(--planner-secondary);
		font-weight: 800;
	}
	.evidence p {
		margin: 0.5rem 0 0;
	}
	.ask-button,
	.primary-action,
	.secondary-action {
		min-height: 44px;
		padding: 0.7rem 0.95rem;
		border: 1px solid var(--planner-line);
		border-radius: 0.7rem;
		font: inherit;
		font-weight: 750;
		cursor: pointer;
	}
	.ask-button {
		margin-top: 1rem;
		background: var(--planner-panel);
		color: var(--planner-ink);
	}
	.ask-button span {
		margin-left: 0.4rem;
		color: var(--planner-secondary);
	}
	.material-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.material-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.8rem;
		min-width: 0;
		padding: 0.9rem;
		border: 1px solid var(--planner-line);
		border-radius: 0.8rem;
		background: var(--planner-panel);
	}
	.material-preview {
		display: block;
		width: 100%;
		height: 210px;
		border-radius: 0.55rem;
		background: var(--planner-soft);
		object-fit: contain;
	}
	.material-topline {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.3rem 0.6rem;
	}
	.dimensions {
		color: var(--planner-muted);
		font-size: 0.78rem;
	}
	.material-card h4 {
		margin: 0.3rem 0 0;
		font-size: 1rem;
	}
	.material-kind {
		font-size: 0.66rem;
	}
	.piece-copy,
	.piece-details {
		line-height: 1.45;
	}
	.piece-copy strong,
	.piece-details strong {
		font-size: 0.83rem;
	}
	.piece-copy p,
	.piece-details p {
		margin: 0.2rem 0 0;
		color: var(--planner-muted);
		font-size: 0.9rem;
	}
	.piece-details {
		display: grid;
		gap: 0.55rem;
	}
	.figure-note {
		margin: 0;
		color: var(--planner-muted);
		font-size: 0.8rem;
	}
	.material-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.85rem;
	}
	.material-links a {
		color: var(--planner-secondary);
		font-size: 0.86rem;
		font-weight: 750;
	}
	.empty {
		padding: 1rem;
		color: var(--planner-muted);
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
	}
	.fields label,
	.kit-label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.9rem;
		font-weight: 750;
	}
	.fields input,
	.kit-label textarea {
		width: 100%;
		min-height: 44px;
		padding: 0.7rem;
		border: 1px solid var(--planner-line);
		border-radius: 0.65rem;
		background: var(--planner-panel);
		color: var(--planner-ink);
		font: inherit;
	}
	.evaluation-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
		margin-top: 0.8rem;
	}
	.primary-action {
		border-color: var(--planner-accent);
		background: var(--planner-accent);
		color: var(--color-primary-contrast-500);
	}
	.secondary-action {
		background: var(--planner-panel);
		color: var(--planner-ink);
	}
	.copy-status {
		color: var(--planner-muted);
		font-size: 0.88rem;
	}
	.kit-preview {
		margin-top: 0.85rem;
		color: var(--planner-muted);
	}
	.kit-preview summary {
		width: fit-content;
		color: var(--planner-secondary);
		font-weight: 750;
		cursor: pointer;
	}
	.kit-label {
		margin-top: 1rem;
	}
	.kit-label textarea {
		line-height: 1.5;
		resize: vertical;
	}
	.evaluation-note {
		margin: 0.85rem 0 0;
		color: var(--planner-muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	button:focus-visible,
	a:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--planner-highlight);
		outline-offset: 3px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 760px) {
		.bundle-grid,
		.recommendation-grid,
		.material-grid {
			grid-template-columns: 1fr;
		}
		.fields {
			grid-template-columns: 1fr;
		}
		.bundle {
			min-height: auto;
		}
		.recommendation-top {
			align-items: flex-start;
			flex-direction: column;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			scroll-behavior: auto !important;
			animation-duration: 0.01ms !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
