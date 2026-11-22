<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { verifyAppliedFingerprint, verifyBaseFingerprint } from '#lib/ai/assistantHelpers.js';

	let {
		articleId = null,
		canAsk = false,
		getContext,
		getEditor,
		getSummary = null,
		setSummary = () => {},
		heading = 'Writing assistant'
	} = $props();

	const assistantContext = getAssistantContext();
	let openBtnEl = $state(null);
	let appliedPrevious = $state(null);
	let appliedText = $state(null);
	let summaryPrevious = $state(null);
	let summaryApplied = $state(null);
	let undoConflictMessage = $state('');

	function readLiveMarkdown() {
		const editorVal = getEditor?.()?.getMarkdown?.();
		if (typeof editorVal === 'string') return editorVal;
		return String(getContext?.()?.bodyMarkdown ?? '');
	}

	function readLiveSummary() {
		if (typeof getSummary === 'function') return String(getSummary() ?? '');
		return String(getContext?.()?.summary ?? '');
	}

	function buildAssistantEditorContext() {
		const context = getContext?.() ?? {};
		const bodyMarkdown = readLiveMarkdown();
		const summary = readLiveSummary();
		return {
			...context,
			articleId,
			bodyMarkdown,
			summary,
			baseMarkdown: bodyMarkdown,
			baseSummary: summary
		};
	}

	function applyDraft(proposal) {
		const editor = getEditor?.();
		const suggestion = String(proposal?.draft ?? '').trim();
		if (!editor || !suggestion) {
			return {
				ok: false,
				error: 'The article editor is still loading. Try applying again in a moment.'
			};
		}
		const currentMarkdown = editor.getMarkdown?.() ?? '';
		const check = verifyBaseFingerprint(
			currentMarkdown,
			proposal?.baseMarkdown,
			'Your article draft changed after this suggestion was created. Ask the writing assistant again so your latest edits are preserved.'
		);
		if (!check.ok) return check;

		appliedPrevious = currentMarkdown;
		appliedText = suggestion;
		undoConflictMessage = '';
		if (editor.setMarkdown?.(suggestion)) {
			appliedText = editor.getMarkdown?.() ?? suggestion;
			return { ok: true };
		}
		appliedPrevious = null;
		appliedText = null;
		return { ok: false, error: 'Unable to apply this draft right now.' };
	}

	function undoDraft() {
		if (appliedPrevious === null) {
			return { ok: false, error: 'No applied draft to undo.' };
		}
		const currentMarkdown = getEditor?.()?.getMarkdown?.() ?? '';
		const check = verifyAppliedFingerprint(
			currentMarkdown,
			appliedText,
			'The draft changed after you applied this suggestion. Use the editor’s undo command to step back without losing newer edits.'
		);
		if (!check.ok) {
			undoConflictMessage = check.error;
			return check;
		}
		getEditor?.()?.setMarkdown?.(appliedPrevious);
		appliedPrevious = null;
		appliedText = null;
		undoConflictMessage = '';
		return { ok: true };
	}

	function applySummaryProposal(proposal) {
		const nextSummary = String(proposal?.summary ?? '').trim();
		if (!nextSummary) return { ok: false, error: 'No summary suggestion to apply.' };
		const currentSummary = readLiveSummary();
		const check = verifyBaseFingerprint(
			currentSummary,
			proposal?.baseSummary,
			'Your summary changed after this suggestion was created. Preview takeaways again to refresh.'
		);
		if (!check.ok) return check;

		summaryPrevious = currentSummary;
		summaryApplied = nextSummary;
		undoConflictMessage = '';
		setSummary(nextSummary);
		return { ok: true };
	}

	function undoSummaryProposal() {
		if (summaryPrevious === null) {
			return { ok: false, error: 'No applied summary to undo.' };
		}
		const currentSummary = readLiveSummary();
		const check = verifyAppliedFingerprint(
			currentSummary,
			summaryApplied,
			'The summary changed after applying, so undo was skipped to protect your newer edits.'
		);
		if (!check.ok) {
			undoConflictMessage = check.error;
			return check;
		}
		setSummary(summaryPrevious);
		summaryPrevious = null;
		summaryApplied = null;
		undoConflictMessage = '';
		return { ok: true };
	}

	$effect(() => {
		return assistantContext.register(() => ({
			mode: 'learn-write',
			articleId,
			canAskSavedArticle: Boolean(canAsk),
			getContext: buildAssistantEditorContext,
			applyDraft,
			undoDraft,
			applySummary: applySummaryProposal,
			undoSummary: undoSummaryProposal,
			canUndoDraft: appliedPrevious !== null && !undoConflictMessage,
			canUndoSummary: summaryPrevious !== null && !undoConflictMessage,
			undoConflictMessage
		}));
	});

	function openStudio({ prompt = '', learnAction = '', triggerEl = openBtnEl } = {}) {
		assistantContext.open({
			mode: 'page',
			prompt,
			submit: Boolean(prompt && !learnAction),
			learnAction,
			triggerEl
		});
	}
</script>

<section
	class="border-surface-500/30 bg-surface-900 space-y-3 border-t-2 p-4 sm:p-5"
	aria-labelledby="writing-assistant-title"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-start gap-3">
			<span
				class="bg-primary-500 text-surface-950 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center"
				aria-hidden="true"
			>
				<IconSparkles class="h-4 w-4" />
			</span>
			<div class="min-w-0">
				<h2 id="writing-assistant-title" class="text-sm font-black tracking-wide uppercase">
					{heading}
				</h2>
				<p class="text-surface-300 text-xs leading-relaxed">
					Draft revisions, takeaway previews, and saved-article questions open in the 3FP Assistant
					so you can review changes before applying.
				</p>
			</div>
		</div>
		<button
			bind:this={openBtnEl}
			type="button"
			class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition"
			onclick={() => openStudio({ triggerEl: openBtnEl })}
		>
			<span>Open writing assistant</span>
			<IconArrowRight class="h-3.5 w-3.5" />
		</button>
	</div>

	<div class="flex flex-wrap gap-2">
		<button
			type="button"
			class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
			onclick={(event) =>
				openStudio({
					prompt: 'Make this clearer and more welcoming for first-time riders',
					triggerEl: event.currentTarget
				})}
		>
			Suggest a draft
		</button>
		<button
			type="button"
			class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
			onclick={(event) =>
				openStudio({
					prompt: 'Preview key takeaways for my current draft',
					learnAction: 'takeaways',
					triggerEl: event.currentTarget
				})}
		>
			Preview takeaways
		</button>
		{#if canAsk}
			<button
				type="button"
				class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition"
				onclick={(event) =>
					openStudio({
						prompt: 'Summarize what the saved article covers so far',
						learnAction: 'ask',
						triggerEl: event.currentTarget
					})}
			>
				Ask about saved article
			</button>
		{/if}
	</div>

	{#if undoConflictMessage}
		<p class="text-surface-300 m-0 text-xs" role="status">{undoConflictMessage}</p>
	{:else if appliedPrevious !== null || summaryPrevious !== null}
		<div class="flex flex-wrap items-center gap-2 pt-1">
			{#if appliedPrevious !== null}
				<button
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-xs font-black uppercase transition"
					type="button"
					onclick={undoDraft}
				>
					<IconUndo2 class="h-3.5 w-3.5" /> Undo applied suggestion
				</button>
			{/if}
			{#if summaryPrevious !== null}
				<button
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-xs font-black uppercase transition"
					type="button"
					onclick={undoSummaryProposal}
				>
					<IconUndo2 class="h-3.5 w-3.5" /> Undo applied summary
				</button>
			{/if}
		</div>
	{/if}
</section>
