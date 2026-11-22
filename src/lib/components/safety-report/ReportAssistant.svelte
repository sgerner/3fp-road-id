<script>
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { buildSafetyReportPrompts, normalizeReportTopicLabel } from '#lib/ai/assistantHelpers.js';

	let { report, initialQuestion = '', currentTopic = '', onCitationSelect = null } = $props();
	const assistantContext = getAssistantContext();
	let openBtnEl = $state(null);

	const topicLabel = $derived(normalizeReportTopicLabel(currentTopic));
	const prompts = $derived(buildSafetyReportPrompts(topicLabel));

	$effect(() => {
		return assistantContext.register(() => ({
			mode: 'safety-report',
			topic: topicLabel,
			report,
			onCitationSelect
		}));
	});

	/** Ask from another report control, such as the encounter lab or campaign planner. */
	export async function ask(question, triggerEl = null) {
		const trimmed = typeof question === 'string' ? question.trim().slice(0, 1200) : '';
		assistantContext.open({
			mode: 'page',
			prompt: trimmed,
			submit: Boolean(trimmed),
			topic: topicLabel,
			triggerEl: triggerEl ?? openBtnEl
		});
	}

	export function openReportAssistant(triggerEl = null) {
		assistantContext.open({
			mode: 'page',
			prompt: initialQuestion ? String(initialQuestion).trim().slice(0, 1200) : '',
			submit: false,
			topic: topicLabel,
			triggerEl: triggerEl ?? openBtnEl
		});
	}
</script>

<div class="assistant">
	<div class="assistant-header">
		<div class="intro">
			<p class="eyebrow">
				Explore the evidence{#if topicLabel}
					· {topicLabel}{/if}
			</p>
			<h2>Ask the report</h2>
			<p>
				Open the 3FP Assistant in research mode for source-linked answers across all 68 cited
				studies and chapters.
			</p>
		</div>
		<button
			bind:this={openBtnEl}
			type="button"
			class="open-btn"
			onclick={() => openReportAssistant(openBtnEl)}
		>
			Open report assistant ↗
		</button>
	</div>
	<div class="suggestions" aria-label="Suggested questions">
		{#each prompts as prompt}
			<button type="button" onclick={(event) => ask(prompt, event.currentTarget)}>{prompt}</button>
		{/each}
	</div>
</div>

<style>
	h2 {
		color: var(--color-secondary-950) !important;
	}
	.assistant {
		background: var(--report-paper);
		border: 2px solid var(--color-secondary-950);
		color: var(--color-secondary-950);
		padding: clamp(1.2rem, 3vw, 2rem);
	}
	.assistant-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.intro {
		max-width: 44rem;
	}
	.intro h2 {
		font-size: clamp(1.7rem, 3vw, 2.3rem);
		line-height: 1.1;
		margin: 0.25rem 0 0.55rem;
		text-transform: none;
	}
	.intro p {
		line-height: 1.6;
		margin: 0;
	}
	.eyebrow {
		color: var(--color-tertiary-700-300);
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.open-btn {
		background: var(--color-secondary-950);
		border: 2px solid var(--color-secondary-950);
		color: var(--color-primary-500);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 800;
		padding: 0.7rem 1.15rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.open-btn:hover {
		background: var(--color-primary-500);
		color: var(--color-secondary-950);
	}
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	.suggestions button {
		background: var(--report-soft);
		border: 1px solid var(--color-tertiary-700-300);
		color: var(--color-secondary-950);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 650;
		padding: 0.55rem 0.8rem;
		text-align: left;
	}
	.suggestions button:hover {
		background: var(--color-primary-500);
		border-color: var(--color-secondary-950);
	}
	button:focus-visible {
		outline: 3px solid var(--color-tertiary-700-300);
		outline-offset: 3px;
	}
</style>
