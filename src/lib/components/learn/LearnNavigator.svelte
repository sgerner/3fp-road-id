<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
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

<details class="border-surface-800 bg-surface-950 text-surface-50 border-2">
	<summary
		class="hover:bg-primary-500 hover:text-surface-950 flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-xs font-black tracking-[0.18em] uppercase transition [&::-webkit-details-marker]:hidden"
	>
		<span class="flex items-center gap-3">
			<span
				class="bg-tertiary-500 text-surface-950 flex h-7 w-7 shrink-0 items-center justify-center"
			>
				<IconSparkles class="h-4 w-4" />
			</span>
			<span>Not sure where to start? Ask the library</span>
		</span>
		<span class="text-primary-500 text-[0.68rem] font-black tracking-[0.22em] uppercase">
			AI Guide +
		</span>
	</summary>
	<div class="border-surface-800 flex flex-col gap-4 border-t-2 p-5 sm:p-6">
		<p class="text-surface-300 m-0 text-sm leading-relaxed">
			Tell us what you want to learn. We’ll point you to relevant articles.
		</p>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				ask();
			}}
			class="flex flex-col gap-3 sm:flex-row"
		>
			<label class="min-w-0 flex-1">
				<span class="sr-only">What would you like to learn?</span>
				<input
					class="border-surface-50 bg-surface-950 text-surface-50 placeholder:text-surface-300 focus:border-primary-500 h-12 w-full border-2 px-4 text-sm font-medium focus:outline-none"
					bind:value={question}
					maxlength="1200"
					required
					placeholder="How can I make my commute safer?"
				/>
			</label>
			<button
				class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 h-12 shrink-0 px-6 text-sm font-black tracking-wide uppercase transition disabled:opacity-50"
				disabled={busy || !question.trim()}
			>
				{busy ? 'Finding guidance…' : 'Find guidance'}
			</button>
		</form>
		<div class="flex flex-wrap gap-2">
			{#each ['I’m new to cycling', 'Help me organize a community ride'] as example}
				<button
					type="button"
					class="border-surface-800 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
					disabled={busy}
					onclick={() => ask(example)}
				>
					{example}
				</button>
			{/each}
		</div>
		<div aria-live="polite" aria-busy={busy} class="flex flex-col gap-4">
			{#if error}
				<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-3 text-sm font-bold" role="alert">
					{error}
				</p>
			{/if}
			{#if answer}
				<p
					class="text-surface-50 border-primary-500 m-0 border-l-4 pl-4 text-sm leading-relaxed whitespace-pre-wrap"
				>
					{answer}
				</p>
			{/if}
			{#if articles.length}
				<ul class="border-surface-50 m-0 list-none border-t-2 p-0">
					{#each articles as article, idx}
						<li class="border-surface-800 border-b">
							<a
								class="group text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex items-center gap-4 px-3 py-3 transition hover:no-underline"
								href={`/learn/${article.slug}`}
							>
								<span
									class="text-tertiary-500 group-hover:text-secondary-500 w-7 shrink-0 text-lg font-black italic tabular-nums"
								>
									{String(idx + 1).padStart(2, '0')}
								</span>
								<span class="min-w-0 flex-1">
									<strong class="block truncate text-sm font-black uppercase">
										{article.title}
									</strong>
									{#if article.summary}
										<span class="block truncate text-xs opacity-75">{article.summary}</span>
									{/if}
								</span>
								<IconArrowRight class="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<p class="text-surface-300 m-0 text-xs">
			AI guidance uses the library. Read the linked articles for full context.
		</p>
	</div>
</details>
