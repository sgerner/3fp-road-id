<script>
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	let { report, initialQuestion = '', currentTopic = '' } = $props();
	const topicLabel = $derived(
		typeof currentTopic === 'string'
			? currentTopic
					.trim()
					.replace(/^\d+\.\s*/, '')
					.split(':', 1)[0]
					.trim()
			: ''
	);
	let draft = $state(untrack(() => initialQuestion));
	let busy = $state(false);
	let error = $state('');
	let related = $state([]);
	let messages = $state([]);
	let input;
	let controller;
	let destroyed = false;
	let elapsed = $state(0);
	let timer;
	let requestStarted = 0;
	let timedOut = false;
	let motionDuration = $state(0);
	onMount(() => {
		const preference = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (motionDuration = preference.matches ? 0 : 220);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});

	function clearRequestTimer() {
		clearInterval(timer);
		timer = undefined;
	}

	function cancelRequest() {
		controller?.abort();
	}

	const defaultPrompts = [
		'What makes a cycling safety campaign effective?',
		'What does the evidence say about safe passing?',
		'How should we evaluate a campaign?',
		'What are the limitations of this review?'
	];
	const prompts = $derived(
		topicLabel
			? [
					`What does the review say about ${topicLabel}?`,
					`Which sources support the findings on ${topicLabel}?`,
					`What should a campaign test about ${topicLabel}?`
				]
			: defaultPrompts
	);
	const templateRoutes = [
		{ pattern: /\bpass(?:ing)?\b|\blane position\b/i, campaigns: ['01-give-people-space'] },
		{ pattern: /\bdoor(?:ing)?\b|\bopening a door\b/i, campaigns: ['06-before-the-door'] },
		{
			pattern: /\bturn(?:ing)?\b|\bjunctions?\b|\bintersections?\b/i,
			campaigns: ['07-check-before-you-turn']
		},
		{
			pattern: /\bstor(?:y|ies)\b|\bhuman stor(?:y|ies)\b|\bidentit(?:y|ies)\b|why i'?m here/i,
			campaigns: ['02-why-im-here', '03-a-person-on-a-bike']
		},
		{ pattern: /\blights?\b|\bvisibility\b|\breflective\b/i, campaigns: ['05-light-the-ride'] }
	];

	function relevantTemplates(question) {
		const context = `${topicLabel} ${question}`;
		const campaigns = templateRoutes
			.filter(({ pattern }) => pattern.test(context))
			.flatMap(({ campaigns: slugs }) => slugs);
		const selected = [];
		for (const campaign of campaigns) {
			const item = report?.campaignGallery?.find(
				(candidate) =>
					candidate.campaign === campaign &&
					candidate.page === 1 &&
					candidate.assetId &&
					candidate.src &&
					(candidate.pdfUrl || candidate.editableUrl || candidate.canvaTemplateUrl)
			);
			if (!item || selected.some((suggestion) => suggestion.assetId === item.assetId)) continue;
			selected.push(item);
			if (selected.length === 3) break;
		}
		return selected;
	}

	function openTarget(id) {
		const target = document.getElementById(id);
		let parent = target;
		while (parent) {
			if (parent.tagName === 'DETAILS') parent.open = true;
			parent = parent.parentElement;
		}
	}

	function conversationHistory() {
		const turns = messages.flatMap((message) => [
			{ role: 'user', content: message.question },
			{ role: 'assistant', content: message.result.answer }
		]);
		const recent = turns.slice(-6);
		let remaining = 6000;
		return recent
			.reverse()
			.map((turn) => {
				const content = turn.content.slice(0, remaining);
				remaining -= content.length;
				return { ...turn, content };
			})
			.reverse()
			.filter((turn) => turn.content);
	}

	async function submit() {
		const question = draft.trim();
		if (!question || busy) return;
		draft = question.slice(0, 1200);
		const topicContext = topicLabel ? `\nReport topic: ${topicLabel}` : '';
		const retrievalQuestion =
			topicContext && draft.length + topicContext.length <= 1200
				? `${draft}${topicContext}`
				: draft;
		busy = true;
		elapsed = 0;
		timedOut = false;
		requestStarted = Date.now();
		clearRequestTimer();
		timer = setInterval(() => {
			elapsed = Math.floor((Date.now() - requestStarted) / 1000);
			if (elapsed >= 45) {
				timedOut = true;
				controller?.abort();
			}
		}, 1000);
		error = '';
		related = [];
		controller = new AbortController();
		try {
			const response = await fetch('/api/learn/safety-report/ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ question: retrievalQuestion, history: conversationHistory() }),
				signal: controller.signal
			});
			const data = await response.json();
			if (!response.ok) {
				error = data.error || 'The assistant could not answer right now. Please try again.';
				related = Array.isArray(data.sections) ? data.sections : [];
				return;
			}
			messages = [
				...messages,
				{ question: draft, result: data, templates: relevantTemplates(draft) }
			];
			draft = '';
		} catch (err) {
			if (!destroyed && timedOut)
				error =
					'The service is taking too long to respond. Your question is still here; please try again.';
			else if (!destroyed && err?.name !== 'AbortError')
				error = 'The assistant could not connect. Please try again.';
		} finally {
			clearRequestTimer();
			if (!destroyed) busy = false;
		}
	}

	/** Ask from another report control, such as the encounter lab. */
	export async function ask(question) {
		if (busy || typeof question !== 'string' || !question.trim()) return;
		draft = question.trim().slice(0, 1200);
		await tick();
		input?.focus();
		input?.scrollIntoView({ behavior: motionDuration ? 'smooth' : 'instant', block: 'center' });
		await submit();
	}

	onDestroy(() => {
		destroyed = true;
		clearRequestTimer();
		controller?.abort();
	});
</script>

<div class="assistant">
	<div class="intro">
		<p class="eyebrow">
			Explore the evidence{#if topicLabel}
				· {topicLabel}{/if}
		</p>
		<h2>Ask the report</h2>
		<p>Answers use this review. Check linked sources.</p>
	</div>
	<div class="suggestions" aria-label="Suggested questions">
		{#each prompts as prompt}
			<button type="button" disabled={busy} onclick={() => ask(prompt)}>{prompt}</button>
		{/each}
	</div>

	{#if messages.length}
		<div
			class="conversation"
			aria-label="Questions and answers"
			transition:fade={{ duration: motionDuration }}
		>
			{#each messages as message}
				<article class="answer-card" in:fly={{ y: 8, duration: motionDuration }}>
					<p class="question">{message.question}</p>
					<p class="answer">{message.result.answer}</p>
					{#if message.result.nextSteps?.length}
						<h3>Explore next</h3>
						<ul>
							{#each message.result.nextSteps as step}<li>{step}</li>{/each}
						</ul>
					{/if}
					{#if message.result.sections?.length || message.result.sources?.length}
						<div class="evidence">
							{#if message.result.sections?.length}
								<h3>Report sections</h3>
								<ul>
									{#each message.result.sections as section}<li>
											<a href={'#' + section.id} onclick={() => openTarget(section.id)}
												>{section.title}</a
											>
										</li>{/each}
								</ul>
							{/if}
							{#if message.result.sources?.length}
								<h3>Sources</h3>
								<ul>
									{#each message.result.sources as source}<li>
											<a
												href={'#ref-' + source.record}
												onclick={() => openTarget('ref-' + source.record)}>{source.record}</a
											>
											· {source.title}{#if source.url}
												<a href={source.url} target="_blank" rel="noopener noreferrer"
													>Original source<span class="sr-only">
														for {source.record} (opens in a new tab)</span
													> ↗</a
												>{/if}
										</li>{/each}
								</ul>
							{/if}
						</div>
					{/if}
					{#if message.templates.length}
						<div class="template-suggestions">
							<h3>Example templates to adapt</h3>
							<ul>
								{#each message.templates as template (template.assetId)}
									<li class="template-card">
										<img src={template.src} alt={template.alt} loading="eager" />
										<div class="template-copy">
											<strong>{template.title}</strong>
											<div class="template-links">
												{#if template.pdfUrl}<a href={template.pdfUrl} download>PDF proof</a>{/if}
												{#if template.editableUrl}<a href={template.editableUrl} download
														>PowerPoint</a
													>{/if}
												{#if template.canvaTemplateUrl}<a
														href={template.canvaTemplateUrl}
														target="_blank"
														rel="noopener noreferrer">Canva template ↗</a
													>{/if}
											</div>
										</div>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}

	<form
		aria-busy={busy}
		onsubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<label for="report-question">Your question</label>
		<textarea
			id="report-question"
			bind:this={input}
			bind:value={draft}
			maxlength="1200"
			rows="3"
			placeholder="Ask about the findings, evidence, or limitations…"
			disabled={busy}></textarea>
		<div class="form-footer">
			<span>{draft.length} / 1,200 characters</span><button
				class="submit"
				type="submit"
				disabled={busy || !draft.trim()}>{busy ? 'Reading the review…' : 'Ask the report'}</button
			>
		</div>
	</form>
	<div class="status">
		{#if busy}
			<section class="busy-card" in:fly={{ y: 8, duration: motionDuration }}>
				<div class="busy-heading" role="status" aria-live="polite" aria-atomic="true">
					<span class="spinner" aria-hidden="true"></span>
					<div>
						<strong>Preparing your answer</strong>
						<p>Reading the review and preparing a source-linked answer.</p>
					</div>
				</div>
				<div class="progress-track" aria-hidden="true"><span></span></div>
				<div class="busy-footer">
					<span
						>{elapsed} sec elapsed{elapsed >= 8
							? ' · Still waiting for the AI service. You can keep browsing.'
							: ''}</span
					><button type="button" class="cancel" onclick={cancelRequest}>Stop waiting</button>
				</div>
			</section>
		{/if}
		{#if error}<p class="error" role="alert" transition:fade={{ duration: motionDuration }}>
				{error}
			</p>{/if}
		{#if related.length}
			<p>Related report sections:</p>
			<ul>
				{#each related as section}<li>
						<a href={'#' + section.id} onclick={() => openTarget(section.id)}>{section.title}</a>
					</li>{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	h2,
	h3 {
		color: var(--color-secondary-950) !important;
	}
	.assistant {
		background: var(--report-paper);
		border: 2px solid var(--color-secondary-950);
		border-radius: 1.25rem;
		color: var(--color-secondary-950);
		padding: clamp(1.2rem, 3vw, 2rem);
	}
	.assistant h2,
	.assistant h3 {
		text-transform: none;
	}
	.assistant p,
	.assistant li {
		line-height: 1.6;
	}
	.intro h2 {
		font-size: clamp(1.7rem, 3vw, 2.3rem);
		line-height: 1.1;
		margin: 0.25rem 0 0.55rem;
	}
	.intro p {
		margin: 0;
	}
	.eyebrow {
		color: var(--color-tertiary-700-300);
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1.25rem 0;
	}
	.suggestions button {
		background: var(--report-soft);
		border: 1px solid var(--color-tertiary-700-300);
		border-radius: 999px;
		color: var(--color-secondary-950);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 650;
		padding: 0.55rem 0.8rem;
		text-align: left;
	}
	.suggestions button:hover {
		background: var(--report-soft);
	}
	.conversation {
		display: grid;
		gap: 1rem;
		margin: 1rem 0;
	}
	.answer-card {
		background: var(--report-paper);
		border: 1px solid var(--color-secondary-300);
		border-radius: 0.8rem;
		padding: 1rem;
	}
	.question {
		color: var(--color-secondary-950);
		font-weight: 800;
		margin: 0 0 0.75rem;
	}
	.answer {
		line-height: 1.6;
		white-space: pre-line;
	}
	.answer-card h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.4rem;
	}
	.answer-card ul,
	.status ul {
		padding-left: 1.3rem;
	}
	.evidence {
		border-top: 1px solid var(--color-secondary-300);
		margin-top: 1rem;
	}
	.template-suggestions {
		border-top: 1px solid var(--color-secondary-300);
		margin-top: 1rem;
	}
	.template-suggestions h3 {
		font-size: 0.95rem;
		margin: 0.8rem 0 0.6rem;
	}
	.template-suggestions ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 240px));
		gap: 0.75rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.template-card {
		min-width: 0;
		border: 1px solid var(--color-secondary-300);
		border-radius: 0.6rem;
		overflow: hidden;
	}
	.template-card img {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: contain;
		background: var(--report-soft);
	}
	.template-copy {
		padding: 0.7rem;
	}
	.template-copy strong {
		display: block;
		font-size: 0.85rem;
		line-height: 1.4;
		margin-bottom: 0.5rem;
	}
	.template-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.7rem;
		font-size: 0.82rem;
	}
	a {
		color: var(--color-secondary-700-300);
		font-weight: 650;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	form {
		margin-top: 1.25rem;
	}
	label {
		display: block;
		font-weight: 800;
		margin-bottom: 0.4rem;
	}
	textarea {
		background: var(--report-paper);
		border: 1px solid var(--color-surface-700);
		border-radius: 0.6rem;
		box-sizing: border-box;
		color: var(--color-secondary-950);
		font: inherit;
		padding: 0.75rem;
		resize: vertical;
		width: 100%;
	}
	.form-footer {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: space-between;
		margin-top: 0.5rem;
	}
	.form-footer span {
		color: var(--color-surface-700);
		font-size: 0.85rem;
	}
	.submit {
		background: var(--report-soft);
		border: 2px solid var(--color-secondary-950);
		border-radius: 0.6rem;
		color: var(--color-secondary-950);
		cursor: pointer;
		font: inherit;
		font-weight: 800;
		padding: 0.65rem 1rem;
	}
	.submit:hover {
		background: var(--color-secondary-700-300);
		color: var(--color-surface-50);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	button:focus-visible,
	a:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--color-tertiary-700-300);
		outline-offset: 3px;
	}
	.status {
		line-height: 1.5;
	}
	.busy-card {
		background: var(--report-paper);
		border: 1px solid var(--color-secondary-300);
		border-radius: 0.8rem;
		box-shadow: 0 8px 24px color-mix(in srgb, var(--color-secondary-950) 7%, transparent);
		margin: 1rem 0;
		padding: 1rem 1.1rem;
	}
	.busy-heading {
		align-items: center;
		display: flex;
		gap: 0.8rem;
	}
	.busy-heading strong {
		color: var(--color-secondary-950);
	}
	.busy-heading p {
		color: var(--color-surface-700);
		margin: 0.1rem 0 0;
	}
	.spinner {
		animation: spin 0.85s linear infinite;
		border: 3px solid var(--report-soft);
		border-right-color: var(--color-tertiary-700-300);
		border-top-color: var(--color-secondary-950);
		border-radius: 50%;
		flex: 0 0 auto;
		height: 1.35rem;
		width: 1.35rem;
	}
	.progress-track {
		background: var(--report-soft);
		border-radius: 99px;
		height: 0.35rem;
		margin: 0.95rem 0 0.65rem;
		overflow: hidden;
	}
	.progress-track span {
		animation: progress 1.6s ease-in-out infinite;
		background: linear-gradient(
			90deg,
			var(--color-secondary-950),
			var(--color-tertiary-700-300),
			var(--color-primary-500)
		);
		border-radius: inherit;
		display: block;
		height: 100%;
		width: 38%;
	}
	.busy-footer {
		align-items: center;
		color: var(--color-surface-700);
		display: flex;
		flex-wrap: wrap;
		font-size: 0.88rem;
		gap: 0.7rem;
		justify-content: space-between;
	}
	.cancel {
		background: transparent;
		border: 1px solid var(--color-surface-700);
		border-radius: 0.45rem;
		color: var(--color-secondary-950);
		cursor: pointer;
		font: inherit;
		font-weight: 700;
		padding: 0.35rem 0.65rem;
	}
	.cancel:hover {
		background: var(--report-paper);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes progress {
		0% {
			transform: translateX(-130%);
		}
		55% {
			transform: translateX(150%);
		}
		100% {
			transform: translateX(300%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner,
		.progress-track span {
			animation: none;
		}
		.progress-track span {
			width: 100%;
		}
	}
	.error {
		color: var(--color-tertiary-700-300);
		font-weight: 700;
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
</style>
