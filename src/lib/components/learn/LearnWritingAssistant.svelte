<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import { verifyAppliedFingerprint, verifyBaseFingerprint } from '#lib/ai/assistantHelpers.js';
	import {
		LEARN_ALT_TEXT_MAX_LENGTH,
		applyMarkdownAltReplacements,
		sanitizeAltText
	} from '#lib/learn/altText';

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
	let altAuditProposals = $state([]);
	let altAuditMessage = $state('');
	let altAuditPending = $state(false);
	let altAuditError = $state('');

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

	async function runAltAudit() {
		const context = getContext?.() ?? {};
		const content = readLiveMarkdown();
		const title = context.title || '';

		if (!content.trim()) {
			altAuditError = 'Add markdown content with images before auditing image alt text.';
			return;
		}

		altAuditPending = true;
		altAuditError = '';
		altAuditProposals = [];
		altAuditMessage = '';
		try {
			const response = await fetch('/api/learn/ai', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'audit_alt',
					...(articleId ? { articleId } : {}),
					content,
					title
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(
					result.message || result.error || 'The assistant could not complete that request.'
				);
			}
			const totalImages = Number(result.totalImages ?? 0);
			const proposals = Array.isArray(result.proposals) ? result.proposals : [];
			altAuditProposals = proposals.map((item) => ({
				index: item.index,
				imageUrl: item.imageUrl || '',
				currentAlt: item.currentAlt || '',
				proposedAlt: item.proposedAlt || '',
				isDecorative: Boolean(item.isDecorative),
				isSoleLinkContent: Boolean(item.isSoleLinkContent),
				isCanvaLink: Boolean(item.isCanvaLink),
				enclosingLinkUrl: item.enclosingLinkUrl || '',
				sectionHeading: item.sectionHeading || '',
				status: item.status || 'ok',
				selected: Boolean(item.proposedAlt || item.isDecorative)
			}));
			if (!totalImages) {
				altAuditMessage = 'No markdown images were found in this draft.';
			} else if (!altAuditProposals.length) {
				altAuditMessage = `Checked ${totalImages} image(s). All markdown images already have descriptive alt text.`;
			} else {
				const draftedCount = altAuditProposals.filter(
					(item) => item.proposedAlt || item.isDecorative
				).length;
				altAuditMessage = draftedCount
					? `Flagged ${altAuditProposals.length} image(s) with filename or missing alt text. Review and edit the proposed descriptions below before applying.`
					: `Flagged ${altAuditProposals.length} image(s) with filename or missing alt text. AI suggestions were unavailable—enter descriptions manually below and apply.`;
			}
		} catch (cause) {
			altAuditError =
				cause instanceof Error ? cause.message : 'The assistant could not complete that request.';
		} finally {
			altAuditPending = false;
		}
	}

	function applyAltAuditReplacements() {
		const editor = getEditor?.();
		if (!editor) return;
		const currentMarkdown = editor.getMarkdown?.() ?? '';
		const replacements = altAuditProposals
			.filter((item) => item.selected)
			.map((item) => ({
				index: item.index,
				altText: item.proposedAlt,
				isDecorative: item.isDecorative && !item.isSoleLinkContent
			}))
			.filter(
				(item) =>
					item.isDecorative ||
					Boolean(
						sanitizeAltText(item.altText, {
							maxLength: LEARN_ALT_TEXT_MAX_LENGTH
						})
					)
			);

		if (!replacements.length) {
			altAuditError =
				'Enter descriptive alt text (not a filename) for at least one selected image before applying.';
			return;
		}

		const nextMarkdown = applyMarkdownAltReplacements(currentMarkdown, replacements);
		if (nextMarkdown === currentMarkdown) {
			altAuditError =
				'No image tags were updated. Ensure the draft has not changed and descriptions are not filenames.';
			return;
		}

		altAuditError = '';
		appliedPrevious = currentMarkdown;
		appliedText = nextMarkdown;
		undoConflictMessage = '';
		if (editor.setMarkdown?.(nextMarkdown)) {
			appliedText = editor.getMarkdown?.() ?? nextMarkdown;
			altAuditProposals = [];
			altAuditMessage = `Updated alt text on ${replacements.length} image(s). Use Undo below to revert.`;
		} else {
			appliedPrevious = null;
			appliedText = null;
		}
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
		<button
			type="button"
			class="border-secondary-500 bg-secondary-500 text-surface-950 hover:border-primary-500 hover:bg-primary-500 border-2 px-3 py-1.5 text-xs font-bold tracking-wide uppercase transition disabled:opacity-50"
			disabled={altAuditPending}
			onclick={runAltAudit}
		>
			{altAuditPending ? 'Auditing image alt text…' : 'Audit image alt text'}
		</button>
	</div>

	{#if altAuditError}
		<p class="text-error-400 text-sm" role="alert">{altAuditError}</p>
	{/if}

	{#if altAuditMessage || altAuditProposals.length}
		<div
			class="border-surface-500/25 bg-surface-950 space-y-4 border p-4"
			aria-live="polite"
			role="status"
		>
			{#if altAuditMessage}
				<p class="text-sm font-medium">{altAuditMessage}</p>
			{/if}
			{#if altAuditProposals.length}
				<div class="space-y-3">
					{#each altAuditProposals as item (item.index)}
						<div class="border-surface-500/20 bg-surface-900 space-y-2 border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<label class="flex items-center gap-2 text-xs font-semibold">
									<input
										type="checkbox"
										class="checkbox accent-secondary-500"
										bind:checked={item.selected}
									/>
									<span>
										Current alt: <code>{item.currentAlt || '(empty)'}</code>
									</span>
								</label>
								<div class="flex flex-wrap gap-1">
									{#if item.isCanvaLink}
										<span class="chip preset-tonal-tertiary text-[10px]">Canva template link</span>
									{:else if item.isSoleLinkContent}
										<span class="chip preset-tonal-secondary text-[10px]">Image-only link</span>
									{/if}
									{#if item.sectionHeading}
										<span class="chip preset-tonal-surface text-[10px]">{item.sectionHeading}</span>
									{/if}
								</div>
							</div>
							<p class="truncate text-xs opacity-60">{item.imageUrl}</p>
							<div class="space-y-1">
								<div class="flex items-center justify-between gap-2">
									<label
										class="text-xs font-medium opacity-80"
										for={`audit-alt-input-${item.index}`}
									>
										Replacement alt text
									</label>
									<span class="text-[11px] tabular-nums opacity-65">
										{item.isDecorative ? 0 : item.proposedAlt.length}/{LEARN_ALT_TEXT_MAX_LENGTH}
									</span>
								</div>
								<input
									id={`audit-alt-input-${item.index}`}
									class="input text-sm"
									type="text"
									maxlength={LEARN_ALT_TEXT_MAX_LENGTH}
									disabled={item.isDecorative}
									bind:value={item.proposedAlt}
									oninput={() => {
										if (item.proposedAlt.trim()) item.selected = true;
									}}
									placeholder={item.isCanvaLink
										? 'Describe the Canva template link purpose and poster subject…'
										: 'Describe the image content in 150 characters or fewer…'}
								/>
							</div>
							{#if !item.isSoleLinkContent}
								<label class="flex items-center gap-2 text-xs opacity-80">
									<input
										type="checkbox"
										class="checkbox accent-secondary-500"
										bind:checked={item.isDecorative}
										onchange={() => {
											if (item.isDecorative) item.selected = true;
										}}
									/>
									<span>Decorative image (use empty <code>alt=""</code>)</span>
								</label>
							{/if}
						</div>
					{/each}
				</div>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<button
						type="button"
						class="btn btn-sm preset-filled-primary-500"
						onclick={applyAltAuditReplacements}
					>
						Apply alt text updates
					</button>
					<p class="text-xs opacity-65">
						Replaces only checked <code>![...](...)</code> tags. You can undo right after applying.
					</p>
				</div>
			{/if}
		</div>
	{/if}

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
