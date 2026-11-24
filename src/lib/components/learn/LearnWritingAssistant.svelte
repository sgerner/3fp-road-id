<script>
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import {
		LEARN_ALT_TEXT_MAX_LENGTH,
		applyMarkdownAltReplacements,
		sanitizeAltText
	} from '#lib/learn/altText';

	/** @type {Record<string, any>} */
	let {
		articleId = null,
		canAsk = false,
		getContext,
		getEditor,
		setSummary = () => {},
		heading = 'Writing assistant'
	} = $props();

	let prompt = $state('');
	let suggestion = $state('');
	let answer = $state('');
	/** @type {any} */
	let takeaways = $state([]);
	let takeawaySummary = $state('');
	let altAuditProposals = $state([]);
	let altAuditMessage = $state('');
	let pending = $state('');
	let error = $state('');
	/** @type {any} */
	let appliedPrevious = $state(null);
	/** @type {any} */
	let appliedText = $state(null);
	let undoConflict = $state(false);

	async function run(action) {
		const context = getContext?.() ?? {};
		const content = context.bodyMarkdown || getEditor?.()?.getMarkdown?.() || '';
		const title = context.title || '';
		const promptText = prompt.trim();

		if (action === 'write' && !promptText) {
			error = 'Add a short instruction for the writing assistant first.';
			return;
		}
		if (action === 'ask' && !promptText) {
			error = 'Ask a question about this saved article first.';
			return;
		}
		if (!content.trim() && action === 'takeaways') {
			error = 'Add some article text before generating takeaways.';
			return;
		}
		if (!content.trim() && action === 'audit_alt') {
			error = 'Add markdown content with images before auditing image alt text.';
			return;
		}

		pending = action;
		error = '';
		suggestion = '';
		answer = '';
		takeaways = [];
		takeawaySummary = '';
		altAuditProposals = [];
		altAuditMessage = '';
		try {
			const response = await fetch('/api/learn/ai', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action,
					...(articleId ? { articleId } : {}),
					...(action === 'ask' ? { question: promptText, articleId } : {}),
					...(action === 'write' ? { prompt: promptText } : {}),
					...(action !== 'ask' ? { content, title } : {})
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(
					result.message || result.error || 'The assistant could not complete that request.'
				);
			if (action === 'write') {
				suggestion = String(result.draft ?? result.suggestion ?? '').trim();
				if (!suggestion) throw new Error('The assistant returned an empty draft.');
			} else if (action === 'ask') {
				answer = String(result.answer ?? '').trim();
				if (!answer) throw new Error('The assistant returned an empty answer.');
			} else if (action === 'audit_alt') {
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
			} else {
				const items = Array.isArray(result.takeaways) ? result.takeaways : [];
				takeaways = items.map((item) => String(item).trim()).filter(Boolean);
				takeawaySummary = String(result.summary ?? '').trim();
				if (!takeaways.length) throw new Error('No takeaways were returned for this draft.');
			}
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'The assistant could not complete that request.';
		} finally {
			pending = '';
		}
	}

	function applySuggestion() {
		const editor = getEditor?.();
		if (!editor || !suggestion) return;
		appliedPrevious = editor.getMarkdown?.() ?? '';
		appliedText = suggestion;
		undoConflict = false;
		if (editor.setMarkdown?.(suggestion)) {
			appliedText = editor.getMarkdown?.() ?? suggestion;
			suggestion = '';
		} else {
			appliedPrevious = null;
			appliedText = null;
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
			error =
				'Enter descriptive alt text (not a filename) for at least one selected image before applying.';
			return;
		}

		const nextMarkdown = applyMarkdownAltReplacements(currentMarkdown, replacements);
		if (nextMarkdown === currentMarkdown) {
			error =
				'No image tags were updated. Ensure the draft has not changed and descriptions are not filenames.';
			return;
		}

		error = '';
		appliedPrevious = currentMarkdown;
		appliedText = nextMarkdown;
		undoConflict = false;
		if (editor.setMarkdown?.(nextMarkdown)) {
			appliedText = editor.getMarkdown?.() ?? nextMarkdown;
			altAuditProposals = [];
			altAuditMessage = `Updated alt text on ${replacements.length} image(s). Use Undo below to revert.`;
		} else {
			appliedPrevious = null;
			appliedText = null;
		}
	}

	function undoSuggestion() {
		if (appliedPrevious === null) return;
		if ((getEditor?.()?.getMarkdown?.() ?? '') !== appliedText) {
			undoConflict = true;
			return;
		}
		getEditor?.()?.setMarkdown?.(appliedPrevious);
		appliedPrevious = null;
		appliedText = null;
		undoConflict = false;
	}
</script>

<section
	class="border-surface-500/20 bg-surface-950 space-y-4 border p-4 sm:p-5"
	aria-labelledby="writing-assistant-title"
>
	<div class="flex items-start gap-3">
		<span class="bg-primary-500/15 text-primary-300 mt-0.5 p-2" aria-hidden="true"
			><IconSparkles class="h-5 w-5" /></span
		>
		<div>
			<h2 id="writing-assistant-title" class="font-semibold">{heading}</h2>
			<p class="text-sm opacity-70">
				Get a starting point while you write. Suggestions need your review before they enter the
				article.
			</p>
		</div>
	</div>

	<label class="block space-y-2">
		<span class="label">What would you like help with?</span>
		<textarea
			class="textarea min-h-20"
			bind:value={prompt}
			placeholder="For example: Make this clearer for first-time riders."
			aria-describedby="writing-assistant-help"></textarea>
	</label>
	<p id="writing-assistant-help" class="-mt-2 text-xs opacity-65">
		{canAsk
			? 'Draft tools use your current text. Questions use the saved article.'
			: 'Your current title and article text provide context.'}
	</p>

	<div class="flex flex-wrap gap-2">
		<button
			class="btn btn-sm preset-filled-primary-500"
			type="button"
			disabled={!!pending}
			onclick={() => run('write')}
		>
			{pending === 'write' ? 'Drafting…' : 'Suggest a draft'}
		</button>
		{#if canAsk}
			<button
				class="btn btn-sm preset-tonal-surface"
				type="button"
				disabled={!!pending}
				onclick={() => run('ask')}
			>
				{pending === 'ask' ? 'Thinking…' : 'Ask about saved article'}
			</button>
		{/if}
		<button
			class="btn btn-sm preset-tonal-surface"
			type="button"
			disabled={!!pending}
			onclick={() => run('takeaways')}
		>
			{pending === 'takeaways' ? 'Finding takeaways…' : 'Preview takeaways'}
		</button>
		<button
			class="btn btn-sm preset-filled-secondary-500"
			type="button"
			disabled={!!pending}
			onclick={() => run('audit_alt')}
		>
			{pending === 'audit_alt' ? 'Auditing image alt text…' : 'Audit image alt text'}
		</button>
	</div>

	{#if error}
		<p class="text-error-400 text-sm" role="alert">{error}</p>
	{/if}
	{#if altAuditMessage || altAuditProposals.length}
		<div
			class="border-surface-500/25 bg-surface-900 space-y-4 border p-4"
			aria-live="polite"
			role="status"
		>
			{#if altAuditMessage}
				<p class="text-sm font-medium">{altAuditMessage}</p>
			{/if}
			{#if altAuditProposals.length}
				<div class="space-y-3">
					{#each altAuditProposals as item (item.index)}
						<div class="border-surface-500/20 bg-surface-950 space-y-2 border p-3">
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
	{#if suggestion}
		<div class="border-primary-400/25 bg-primary-500/5 space-y-3 border p-4" aria-live="polite">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm font-semibold">Draft suggestion</p>
				<button class="btn btn-sm preset-filled-primary-500" type="button" onclick={applySuggestion}
					>Use this draft</button
				>
			</div>
			<div class="max-h-72 overflow-auto text-sm leading-6 whitespace-pre-wrap">{suggestion}</div>
			<p class="text-xs opacity-65">
				Review it before applying. Applying replaces the article body, and you can undo that change.
			</p>
		</div>
	{/if}
	{#if answer}
		<div class="bg-surface-800/60 p-4 text-sm leading-6" aria-live="polite">
			<p class="mb-2 font-semibold">Assistant answer</p>
			<div class="whitespace-pre-wrap">{answer}</div>
		</div>
	{/if}
	{#if takeaways.length}
		<div class="bg-surface-800/60 p-4" aria-live="polite">
			{#if takeawaySummary}
				<div class="mb-4 space-y-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="text-sm font-semibold">Summary suggestion</p>
						<button
							class="btn btn-sm preset-tonal-surface"
							type="button"
							onclick={() => setSummary(takeawaySummary)}>Use summary</button
						>
					</div>
					<p class="text-sm leading-6 opacity-80">{takeawaySummary}</p>
				</div>
			{/if}
			<p class="mb-2 text-sm font-semibold">Takeaway preview</p>
			<ul class="list-disc space-y-1 pl-5 text-sm leading-6">
				{#each takeaways as takeaway}<li>{takeaway}</li>{/each}
			</ul>
			<p class="mt-2 text-xs opacity-65">Saving the article refreshes its published takeaways.</p>
		</div>
	{/if}
	{#if appliedPrevious !== null}
		{#if undoConflict}
			<p class="text-sm opacity-70" role="status">
				The draft changed after you applied this suggestion. Use the editor’s undo command to step
				back without losing newer edits.
			</p>
		{:else}
			<button class="btn btn-sm preset-tonal-surface gap-2" type="button" onclick={undoSuggestion}>
				<IconUndo2 class="h-4 w-4" /> Undo applied suggestion
			</button>
		{/if}
	{/if}
</section>
