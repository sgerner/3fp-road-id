<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	let question = $state('');
	let busy = $state(false);
	let answer = $state('');
	let articles = $state([]);
	let error = $state('');

	async function ask(value = question) {
		if (busy || !value.trim()) return;
		question = value;
		busy = true;
		error = '';
		answer = '';
		articles = [];
		try {
			const response = await fetch('/api/learn/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'navigate', question: value.trim() })
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(result.error || 'The guide is unavailable. Try searching the library.');
			answer = result.answer || '';
			articles = result.articles || [];
		} catch (failure) {
			error = failure.message || 'Unable to find guidance. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<details class="navigator">
	<summary
		><IconSparkles class="h-4 w-4" /><span>Not sure where to start? Ask the library</span></summary
	>
	<div class="navigator-body">
		<p class="text-sm opacity-70">
			Tell us what you want to learn. We’ll point you to relevant articles.
		</p>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				ask();
			}}
			class="mt-4 flex flex-col gap-3 sm:flex-row"
		>
			<label class="min-w-0 flex-1">
				<span class="sr-only">What would you like to learn?</span>
				<input
					class="input w-full"
					bind:value={question}
					maxlength="1200"
					required
					placeholder="How can I make my commute safer?"
				/>
			</label>
			<button class="btn preset-filled-primary-500" disabled={busy || !question.trim()}
				>{busy ? 'Finding guidance…' : 'Find guidance'}</button
			>
		</form>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each ['I’m new to cycling', 'Help me organize a community ride'] as example}
				<button type="button" class="example" disabled={busy} onclick={() => ask(example)}
					>{example}</button
				>
			{/each}
		</div>
		<div aria-live="polite" aria-busy={busy}>
			{#if error}<p class="text-error-400 mt-4 text-sm" role="alert">{error}</p>{/if}
			{#if answer}<p class="mt-5 text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>{/if}
			{#if articles.length}
				<ul class="mt-4 grid gap-2 sm:grid-cols-2">
					{#each articles as article}
						<li>
							<a class="result" href={`/learn/${article.slug}`}
								><strong>{article.title}</strong>{#if article.summary}<span>{article.summary}</span
									>{/if}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<p class="mt-4 text-xs opacity-55">
			AI guidance uses the library. Read the linked articles for full context.
		</p>
	</div>
</details>

<style>
	.navigator {
		border: 1px solid color-mix(in oklab, var(--color-primary-400) 25%, transparent);
		border-radius: 1.25rem;
		background: color-mix(in oklab, var(--color-primary-500) 5%, transparent);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 1.1rem 1.25rem;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 650;
	}
	.navigator-body {
		padding: 0 1.25rem 1.25rem;
	}
	.example {
		padding: 0.4rem 0.7rem;
		border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
		border-radius: 999px;
		font-size: 0.75rem;
		text-align: left;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}
	.result span {
		font-size: 0.8rem;
		opacity: 0.7;
	}
	a:hover,
	button:hover {
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
	}
	summary:focus-visible,
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--color-primary-400);
		outline-offset: 4px;
	}
</style>
