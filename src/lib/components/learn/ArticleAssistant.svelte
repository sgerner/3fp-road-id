<script>
	const { articleSlug } = $props();
	let draft = $state('');
	let turns = $state([]);
	let busy = $state(false);
	let error = $state('');
	let panelOpen = $state(false);
	let historyOpen = $state(false);
	let currentSlug = $state('');
	let nextTurnId = 0;

	$effect(() => {
		if (articleSlug !== currentSlug) {
			currentSlug = articleSlug;
			draft = '';
			turns = [];
			busy = false;
			error = '';
			panelOpen = false;
			historyOpen = false;
		}
	});

	const suggestions = [
		'Explain this article simply',
		'Give me a practical example',
		'What should I remember?'
	];

	async function ask(question = draft) {
		const prompt = question.trim();
		if (!prompt || busy) return;

		draft = prompt;
		error = '';
		busy = true;
		const turnId = ++nextTurnId;
		const requestSlug = articleSlug;
		const turn = { id: turnId, question: prompt, answer: '', pending: true };
		turns = [...turns, turn];
		draft = '';

		try {
			const response = await fetch('/api/learn/ai', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'ask', question: prompt, articleSlug: requestSlug })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(payload.error || 'The article assistant is unavailable right now.');
			if (typeof payload.answer !== 'string' || !payload.answer.trim()) {
				throw new Error('The assistant returned an empty answer. Please try again.');
			}
			if (requestSlug !== currentSlug) return;
			turns = turns.map((item) =>
				item.id === turnId ? { ...item, answer: payload.answer.trim(), pending: false } : item
			);
		} catch (cause) {
			if (requestSlug === currentSlug) {
				turns = turns.filter((item) => item.id !== turnId);
				error = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
			}
		} finally {
			if (requestSlug === currentSlug) busy = false;
		}
	}

	function submit(event) {
		event.preventDefault();
		ask();
	}
</script>

<section class="assistant-card" aria-labelledby="article-assistant-title">
	<div class="assistant-heading">
		<div class="assistant-mark" aria-hidden="true">✳</div>
		<div class="assistant-copy">
			<p class="assistant-eyebrow">Reading companion</p>
			<h2 id="article-assistant-title">Ask about this article</h2>
			{#if panelOpen}
				<p>Get a simpler explanation, an example, or help with a detail that feels unclear.</p>
			{/if}
		</div>
		<button
			type="button"
			class="assistant-toggle"
			aria-expanded={panelOpen}
			aria-controls="article-assistant-panel"
			onclick={() => (panelOpen = !panelOpen)}
		>
			{panelOpen ? 'Close' : 'Ask'}
		</button>
	</div>

	{#if panelOpen}
		<div id="article-assistant-panel" class="assistant-panel">
			{#if turns.length}
				<div class="assistant-answer" aria-live="polite">
					<div class="assistant-question">{turns.at(-1).question}</div>
					<p class="assistant-answer-label">Answer</p>
					<div class="assistant-answer-text">
						{#if turns.at(-1).pending}
							<span class="typing-indicator" aria-label="Thinking">Thinking…</span>
						{:else}
							{turns.at(-1).answer}
						{/if}
					</div>
				</div>
				{#if turns.length > 1}
					<details class="assistant-history" bind:open={historyOpen}>
						<summary>Earlier questions <span>({turns.length - 1})</span></summary>
						<div class="assistant-history-list">
							{#each turns.slice(0, -1).reverse() as turn}
								<div class="assistant-history-item">
									<p class="assistant-history-question">{turn.question}</p>
									<p>{turn.answer}</p>
								</div>
							{/each}
						</div>
					</details>
				{/if}
			{/if}

			{#if error}
				<p class="assistant-error" role="alert">{error}</p>
			{/if}

			{#if !turns.length}
				<div class="assistant-suggestions" aria-label="Suggested questions">
					{#each suggestions as suggestion}
						<button type="button" disabled={busy} onclick={() => ask(suggestion)}
							>{suggestion}</button
						>
					{/each}
				</div>
			{/if}

			<form class="assistant-form" onsubmit={submit}>
				<label class="sr-only" for="article-assistant-question">Your question</label>
				<textarea
					bind:value={draft}
					id="article-assistant-question"
					rows="2"
					maxlength="700"
					placeholder="What would you like help understanding?"
					disabled={busy}></textarea>
				<button type="submit" disabled={busy || !draft.trim()} aria-label="Send question">
					{busy ? '…' : 'Send'}
				</button>
			</form>
			<p class="assistant-note">
				Answers are based on this article. Check important details against the source.
			</p>
		</div>
	{/if}
</section>

<style>
	.assistant-card {
		border: 1px solid
			color-mix(in oklab, var(--color-primary-400) 25%, var(--color-surface-500) 15%);
		border-radius: 1.25rem;
		background:
			linear-gradient(
				125deg,
				color-mix(in oklab, var(--color-primary-500) 9%, transparent),
				transparent 58%
			),
			color-mix(in oklab, var(--color-surface-900) 72%, var(--color-surface-950));
		overflow: hidden;
	}
	.assistant-heading {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.1rem 1.25rem;
	}
	.assistant-mark {
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		flex: 0 0 auto;
		border-radius: 0.85rem;
		color: var(--color-primary-300);
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
		font-size: 1.25rem;
	}
	.assistant-copy {
		min-width: 0;
		flex: 1;
	}
	.assistant-eyebrow {
		margin: 0 0 0.15rem;
		color: var(--color-primary-300);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.assistant-copy h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}
	.assistant-copy > p:last-child {
		margin: 0.2rem 0 0;
		font-size: 0.84rem;
		line-height: 1.5;
		opacity: 0.7;
	}
	.assistant-toggle {
		flex: 0 0 auto;
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		background: color-mix(in oklab, var(--color-primary-500) 16%, transparent);
		color: var(--color-primary-200);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.assistant-toggle:hover {
		background: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}
	.assistant-panel {
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		padding: 1rem 1.25rem 1.1rem;
	}
	.assistant-suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.assistant-suggestions button {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 24%, transparent);
		border-radius: 999px;
		padding: 0.38rem 0.7rem;
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.assistant-suggestions button:hover {
		border-color: color-mix(in oklab, var(--color-primary-400) 50%, transparent);
		opacity: 1;
	}
	.assistant-form {
		display: flex;
		align-items: end;
		gap: 0.6rem;
	}
	.assistant-form textarea {
		min-width: 0;
		flex: 1;
		resize: vertical;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 25%, transparent);
		border-radius: 0.85rem;
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
		padding: 0.7rem 0.8rem;
		font: inherit;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.assistant-form textarea:focus {
		outline: 2px solid color-mix(in oklab, var(--color-primary-400) 70%, transparent);
		outline-offset: 1px;
	}
	.assistant-form > button {
		min-width: 4.2rem;
		border-radius: 0.75rem;
		background: var(--color-primary-500);
		padding: 0.65rem 0.85rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-primary-contrast, white);
	}
	.assistant-form > button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.assistant-note {
		margin: 0.55rem 0 0;
		font-size: 0.7rem;
		opacity: 0.55;
	}
	.assistant-answer {
		border-radius: 0.9rem;
		background: color-mix(in oklab, var(--color-surface-950) 56%, transparent);
		padding: 0.9rem 1rem;
		margin-bottom: 0.75rem;
	}
	.assistant-question {
		font-size: 0.85rem;
		font-weight: 700;
	}
	.assistant-answer-label {
		margin: 0.65rem 0 0.2rem;
		color: var(--color-primary-300);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.assistant-answer-text {
		font-size: 0.875rem;
		line-height: 1.7;
		opacity: 0.88;
		white-space: pre-wrap;
	}
	.typing-indicator {
		opacity: 0.65;
	}
	.assistant-error {
		margin: 0 0 0.65rem;
		color: var(--color-error-400);
		font-size: 0.82rem;
	}
	.assistant-history {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
	}
	.assistant-history summary {
		cursor: pointer;
		opacity: 0.72;
	}
	.assistant-history-list {
		display: grid;
		gap: 0.7rem;
		margin-top: 0.65rem;
		max-height: 15rem;
		overflow: auto;
	}
	.assistant-history-item {
		border-left: 2px solid color-mix(in oklab, var(--color-primary-400) 35%, transparent);
		padding-left: 0.7rem;
		opacity: 0.78;
	}
	.assistant-history-item p {
		margin: 0;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.assistant-history-question {
		margin-bottom: 0.25rem !important;
		font-weight: 700;
	}
	@media (max-width: 520px) {
		.assistant-heading {
			align-items: flex-start;
			padding: 1rem;
			gap: 0.7rem;
		}
		.assistant-toggle {
			margin-left: auto;
		}
		.assistant-panel {
			padding: 0.9rem 1rem 1rem;
		}
		.assistant-form {
			align-items: stretch;
			flex-direction: column;
		}
		.assistant-form > button {
			align-self: flex-end;
		}
	}
</style>
