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

<section
	class="border-surface-800 bg-surface-950 text-surface-50 border-2"
	aria-labelledby="article-assistant-title"
>
	<div class="flex items-center justify-between gap-4 px-5 py-4">
		<div class="flex min-w-0 items-center gap-4">
			<div
				class="bg-primary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center text-xl font-black"
				aria-hidden="true"
			>
				✳
			</div>
			<div class="min-w-0">
				<p class="text-primary-500 m-0 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
					Reading companion
				</p>
				<h2
					id="article-assistant-title"
					class="text-surface-50! m-0 text-lg font-black tracking-tight uppercase"
				>
					Ask about this article
				</h2>
				{#if panelOpen}
					<p class="text-surface-300 m-0 mt-1 text-xs leading-relaxed">
						Get a simpler explanation, an example, or help with a detail that feels unclear.
					</p>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 shrink-0 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition"
			aria-expanded={panelOpen}
			aria-controls="article-assistant-panel"
			onclick={() => (panelOpen = !panelOpen)}
		>
			{panelOpen ? 'Close' : 'Ask'}
		</button>
	</div>

	{#if panelOpen}
		<div id="article-assistant-panel" class="border-surface-800 flex flex-col gap-4 border-t-2 p-5">
			{#if turns.length}
				<div
					class="border-primary-500 bg-surface-900 flex flex-col gap-2 border-l-4 p-4"
					aria-live="polite"
				>
					<div class="text-surface-50 text-sm font-black">{turns.at(-1).question}</div>
					<p class="text-primary-500 m-0 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
						Answer
					</p>
					<div class="text-surface-50 text-sm leading-relaxed whitespace-pre-wrap">
						{#if turns.at(-1).pending}
							<span class="text-surface-300" aria-label="Thinking">Thinking…</span>
						{:else}
							{turns.at(-1).answer}
						{/if}
					</div>
				</div>
				{#if turns.length > 1}
					<details class="border-surface-800 border-t pt-3 text-xs" bind:open={historyOpen}>
						<summary class="text-surface-300 cursor-pointer font-bold tracking-wider uppercase">
							Earlier questions <span>({turns.length - 1})</span>
						</summary>
						<div class="mt-3 flex max-h-60 flex-col gap-3 overflow-auto">
							{#each turns.slice(0, -1).reverse() as turn}
								<div class="border-tertiary-500 border-l-2 pl-3">
									<p class="text-surface-50 m-0 mb-1 font-bold">{turn.question}</p>
									<p class="text-surface-300 m-0 leading-relaxed whitespace-pre-wrap">
										{turn.answer}
									</p>
								</div>
							{/each}
						</div>
					</details>
				{/if}
			{/if}

			{#if error}
				<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-3 text-sm font-bold" role="alert">
					{error}
				</p>
			{/if}

			{#if !turns.length}
				<div class="flex flex-wrap gap-2" aria-label="Suggested questions">
					{#each suggestions as suggestion}
						<button
							type="button"
							class="border-surface-800 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
							disabled={busy}
							onclick={() => ask(suggestion)}
						>
							{suggestion}
						</button>
					{/each}
				</div>
			{/if}

			<form class="flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={submit}>
				<label class="sr-only" for="article-assistant-question">Your question</label>
				<textarea
					bind:value={draft}
					id="article-assistant-question"
					rows="2"
					maxlength="700"
					class="border-surface-50 bg-surface-950 text-surface-50 placeholder:text-surface-300 focus:border-primary-500 min-w-0 flex-1 border-2 p-3 text-sm leading-relaxed focus:outline-none"
					placeholder="What would you like help understanding?"
					disabled={busy}></textarea>
				<button
					type="submit"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 h-12 shrink-0 px-6 text-xs font-black tracking-[0.18em] uppercase transition disabled:opacity-50"
					disabled={busy || !draft.trim()}
					aria-label="Send question"
				>
					{busy ? '…' : 'Send'}
				</button>
			</form>
			<p class="text-surface-300 m-0 text-xs">
				Answers are based on this article. Check important details against the source.
			</p>
		</div>
	{/if}
</section>
