<script>
	import IconBot from '@lucide/svelte/icons/bot';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconPencilLine from '@lucide/svelte/icons/pencil-line';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconSave from '@lucide/svelte/icons/save';
	import IconSend from '@lucide/svelte/icons/send';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import { tick } from 'svelte';
	import LearnEditor from '$lib/components/learn/LearnEditor.svelte';

	let {
		group,
		values = {},
		error = '',
		isEditing = false,
		isPublished = false,
		memberEmailCount = 0,
		emailMembers = false,
		publicHref = '',
		resetHref = '',
		onDelete = null
	} = $props();

	const publishLabel = $derived(isPublished ? 'Update published post' : 'Publish update');
	const draftLabel = $derived(isPublished ? 'Unpublish to draft' : 'Save draft');
	const STYLE_OPTIONS = [
		{
			value: 'warm_community',
			label: 'Warm community',
			description: 'Friendly and polished. Good default for most member-facing updates.'
		},
		{
			value: 'quick_bulletin',
			label: 'Quick bulletin',
			description: 'Short, crisp, and factual. Best for route changes and practical notices.'
		},
		{
			value: 'energy_boost',
			label: 'Energy boost',
			description: 'More upbeat and lively for recaps, launches, and momentum-building posts.'
		},
		{
			value: 'action_focused',
			label: 'Action focused',
			description: 'Built around deadlines, next steps, and clear calls to action.'
		}
	];

	let titleEl = $state(null);
	let editorApi = $state(null);
	let aiOpen = $state(true);
	let aiStylePreset = $state('warm_community');
	let aiPrompt = $state('');
	let aiLoading = $state(false);
	let aiError = $state('');
	let aiStatus = $state('');
	let aiMessages = $state([]);
	let draftSessionKey = $state('');
	let isGeneratingSummary = $state(false);
	let formRef = $state(null);
	let allowNativeSubmit = $state(false);
	let formTitle = $state('');
	let formSummary = $state('');
	let formSlug = $state('');
	let formBodyMarkdown = $state('');
	let aiMessagesEl = $state(null);

	const selectedStyle = $derived(
		STYLE_OPTIONS.find((option) => option.value === aiStylePreset) ?? STYLE_OPTIONS[0]
	);
	const aiPlaceholder = $derived(
		aiMessages.length
			? 'Ask for changes, tone tweaks, or a shorter version...'
			: 'Describe what you want to announce to members...'
	);

	function safeTrim(value) {
		if (value === null || value === undefined) return '';
		return String(value).trim();
	}

	function generateSlug(title) {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.substring(0, 60);
	}

	async function generateSummaryAndSlug() {
		const title = safeTrim(formTitle);
		const content = safeTrim(editorApi?.getMarkdown?.() || formBodyMarkdown);

		if (!title && !content) return null;

		isGeneratingSummary = true;

		try {
			const response = await fetch('/api/ai/group-update-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'generate_metadata',
					title: safeTrim(title),
					content: safeTrim(content),
					style_preset: aiStylePreset,
					context: {
						group: {
							name: group?.name || '',
							city: group?.city || '',
							state: group?.state || '',
							description: group?.description || group?.short_description || ''
						}
					}
				})
			});

			const payload = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to generate summary');
			}

			return {
				summary: payload.summary || '',
				slug: payload.slug || generateSlug(title) || ''
			};
		} catch (err) {
			// Fallback to auto-generated slug if AI fails
			return {
				summary: '',
				slug: generateSlug(title) || ''
			};
		} finally {
			isGeneratingSummary = false;
		}
	}

	function getCurrentDraftContext() {
		return {
			group: {
				name: group?.name || '',
				city: group?.city || '',
				state: group?.state || '',
				description: group?.description || group?.short_description || ''
			},
			draft: {
				title: safeTrim(formTitle),
				summary: safeTrim(formSummary),
				body_markdown: safeTrim(editorApi?.getMarkdown?.() || formBodyMarkdown)
			}
		};
	}

	function safeParseJson(text) {
		if (!text) return null;
		const first = text.indexOf('{');
		const last = text.lastIndexOf('}');
		if (first === -1 || last === -1 || last <= first) return null;
		const candidate = text.slice(first, last + 1).trim();
		try {
			return JSON.parse(candidate);
		} catch {
			const cleaned = candidate.replace(/^```json\s*/i, '').replace(/```$/i, '');
			try {
				return JSON.parse(cleaned);
			} catch {
				return null;
			}
		}
	}

	function applyAiDraft(draft) {
		if (!draft || typeof draft !== 'object') return;
		if (safeTrim(draft.title)) {
			formTitle = safeTrim(draft.title);
		}
		if (Object.prototype.hasOwnProperty.call(draft, 'summary')) {
			formSummary = typeof draft.summary === 'string' ? draft.summary : '';
		}
		if (safeTrim(draft.body_markdown) && editorApi?.setMarkdown) {
			formBodyMarkdown = draft.body_markdown;
			editorApi.setMarkdown(formBodyMarkdown);
		}
	}

	function resetAiChat() {
		aiMessages = [];
		aiPrompt = '';
		aiError = '';
		aiStatus = '';
	}

	async function scrollAiMessagesToBottom() {
		await tick();
		if (!aiMessagesEl) return;
		aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
	}

	$effect(() => {
		const nextKey = `${values.postId || 'new'}:${values.slug || values.title || ''}`;
		if (nextKey === draftSessionKey) return;
		draftSessionKey = nextKey;
		formTitle = values.title || '';
		formSummary = values.summary || '';
		formSlug = values.slug || '';
		formBodyMarkdown = values.bodyMarkdown || '';
		if (editorApi?.setMarkdown) {
			editorApi.setMarkdown(formBodyMarkdown);
		}
		resetAiChat();
	});

	function handleAiPromptKeydown(event) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			sendAiPrompt();
		}
	}

	async function sendAiPrompt() {
		const prompt = safeTrim(aiPrompt);
		if (!prompt || aiLoading) return;

		aiLoading = true;
		aiError = '';
		aiStatus = '';
		const nextMessages = [...aiMessages, { role: 'user', content: prompt }];
		aiMessages = nextMessages;
		aiPrompt = '';

		try {
			const response = await fetch('/api/ai/group-update-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: nextMessages,
					style_preset: aiStylePreset,
					context: getCurrentDraftContext()
				})
			});
			const raw = await response.text();
			const payload = JSON.parse(raw || '{}');
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to draft update content right now.');
			}

			const assistantMessages = [];
			if (safeTrim(payload?.reply)) {
				assistantMessages.push({ role: 'assistant', content: safeTrim(payload.reply) });
			}
			if (Array.isArray(payload?.follow_up_questions) && payload.follow_up_questions.length) {
				assistantMessages.push({
					role: 'assistant',
					content: payload.follow_up_questions
						.map((question) => safeTrim(question))
						.filter(Boolean)
						.map((question) => `• ${question}`)
						.join('\n')
				});
			}

			if (assistantMessages.length) {
				aiMessages = [...nextMessages, ...assistantMessages];
			}

			if (payload?.draft) {
				applyAiDraft(payload.draft);
				aiStatus = 'Draft applied below.';
			}
			await scrollAiMessagesToBottom();
		} catch (error) {
			// Fallback parser handles non-JSON wrappers while still surfacing the content
			if (error instanceof SyntaxError) {
				try {
					const response = await fetch('/api/ai/group-update-writer', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							messages: nextMessages,
							style_preset: aiStylePreset,
							context: getCurrentDraftContext()
						})
					});
					const raw = await response.text();
					const payload = safeParseJson(raw) || {};
					if (response.ok) {
						const assistantMessages = [];
						if (safeTrim(payload?.reply)) {
							assistantMessages.push({ role: 'assistant', content: safeTrim(payload.reply) });
						}
						if (Array.isArray(payload?.follow_up_questions) && payload.follow_up_questions.length) {
							assistantMessages.push({
								role: 'assistant',
								content: payload.follow_up_questions
									.map((question) => safeTrim(question))
									.filter(Boolean)
									.map((question) => `• ${question}`)
									.join('\n')
							});
						}
						if (assistantMessages.length) {
							aiMessages = [...nextMessages, ...assistantMessages];
						}
						if (payload?.draft) {
							applyAiDraft(payload.draft);
							aiStatus = 'Draft applied below.';
						}
						await scrollAiMessagesToBottom();
						aiLoading = false;
						return;
					}
				} catch {
					// Continue to standard error path below
				}
			}
			aiMessages = nextMessages;
			aiPrompt = prompt;
			aiError = error?.message || 'Unable to draft update content right now.';
			await scrollAiMessagesToBottom();
		} finally {
			aiLoading = false;
		}
	}

	async function handleSubmit(event) {
		if (allowNativeSubmit) {
			allowNativeSubmit = false;
			return;
		}
		event.preventDefault();

		const submitter = event.submitter;
		if (!submitter) return;

		// Generate summary and slug before submitting
		const metadata = await generateSummaryAndSlug();

		if (metadata) {
			formSummary = metadata.summary || formSummary;
			formSlug = metadata.slug || generateSlug(formTitle) || '';
		}

		allowNativeSubmit = true;
		formRef.requestSubmit(submitter);
	}
</script>

<form class="editor-form" method="POST" bind:this={formRef} onsubmit={handleSubmit}>
	<input name="postId" type="hidden" value={values.postId || ''} />
	<input name="summary" type="hidden" value={formSummary} />
	<input name="slug" type="hidden" value={formSlug} />

	<!-- Unified Card Container -->
	<div class="editor-card">
		<!-- Accent Bar -->
		<div class="edit-card-accent-bar primary" aria-hidden="true"></div>

		<!-- Header -->
		<header class="editor-header">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip {isPublished ? 'preset-filled-success-500' : 'preset-tonal-warning'}">
						{isPublished ? 'Live' : 'Draft'}
					</span>
					<h1 class="text-xl font-bold">
						{isEditing ? 'Edit update' : 'New update'}
					</h1>
				</div>

				<div class="flex flex-wrap gap-2">
					{#if publicHref}
						<a class="btn preset-tonal-surface gap-1.5 text-sm" href={publicHref} target="_blank">
							<IconEye class="h-4 w-4" />
							View
						</a>
					{/if}
					{#if resetHref}
						<a class="btn preset-tonal-surface text-sm" href={resetHref}>
							{isEditing ? 'New' : 'Reset'}
						</a>
					{/if}
				</div>
			</div>
		</header>

		<!-- Content Body -->
		<div class="editor-body">
			<!-- AI Assistant -->
			<section class="ai-assistant">
				<div class="ai-header">
					<div class="ai-header-left">
						<div class="ai-avatar">
							<IconSparkles class="h-5 w-5" />
						</div>
						<div class="ai-header-text">
							<h3 class="ai-title">AI Assistant</h3>
							<p class="ai-subtitle">Draft your update</p>
						</div>
					</div>
					<button
						class="ai-clear-btn"
						type="button"
						onclick={resetAiChat}
						title="Clear conversation"
					>
						<IconRefreshCw class="h-4 w-4" />
					</button>
				</div>

				<div class="ai-chat-container" bind:this={aiMessagesEl}>
					{#if aiMessages.length === 0}
						<div class="ai-welcome">
							<div class="ai-welcome-bubble">
								<p class="ai-welcome-text">
									Describe what you want to announce, and I'll draft it for you.
								</p>
								<div class="ai-quick-prompts">
									<button
										class="quick-prompt"
										type="button"
										onclick={() => {
											aiPrompt = 'Write a welcome message for new members';
											sendAiPrompt();
										}}
									>
										"Welcome new members..."
									</button>
									<button
										class="quick-prompt"
										type="button"
										onclick={() => {
											aiPrompt = 'Announce a route change for this weekend';
											sendAiPrompt();
										}}
									>
										"Route change this weekend..."
									</button>
									<button
										class="quick-prompt"
										type="button"
										onclick={() => {
											aiPrompt = 'Share results from our latest event';
											sendAiPrompt();
										}}
									>
										"Event results..."
									</button>
								</div>
							</div>
						</div>
					{:else}
						<div class="ai-messages">
							{#each aiMessages as message, i}
								<div class="ai-message {message.role}">
									<div class="ai-message-avatar">
										{#if message.role === 'assistant'}
											<IconSparkles class="h-4 w-4" />
										{:else}
											<span class="user-avatar">You</span>
										{/if}
									</div>
									<div class="ai-message-content">
										<p class="ai-message-text">{message.content}</p>
									</div>
								</div>
							{/each}
							{#if aiLoading}
								<div class="ai-message assistant loading">
									<div class="ai-message-avatar">
										<IconSparkles class="h-4 w-4" />
									</div>
									<div class="ai-message-content">
										<div class="typing-indicator">
											<span></span>
											<span></span>
											<span></span>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div class="ai-composer">
					<div class="ai-style-select">
						<select bind:value={aiStylePreset}>
							{#each STYLE_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<span class="style-hint">{selectedStyle.description}</span>
					</div>
					<div class="ai-input-area">
						<textarea
							bind:value={aiPrompt}
							onkeydown={handleAiPromptKeydown}
							placeholder={aiMessages.length
								? 'Reply to refine the draft...'
								: 'What do you want to announce?'}
							rows="2"
						></textarea>
						<button
							class="ai-send-btn"
							type="button"
							onclick={sendAiPrompt}
							disabled={aiLoading || !safeTrim(aiPrompt)}
							aria-label="Send message"
						>
							<IconSend class="h-5 w-5" />
						</button>
					</div>
					{#if aiMessages.length > 0}
						<p class="ai-hint">Press Enter to send, Shift+Enter for new line</p>
					{/if}
				</div>

				{#if aiStatus}
					<div class="ai-status success">
						<IconCheck class="h-3.5 w-3.5" />
						<span>{aiStatus}</span>
					</div>
				{/if}
				{#if aiError}
					<div class="ai-status error">
						<span>{aiError}</span>
					</div>
				{/if}
			</section>

			<!-- Title (Below AI) -->
			<label class="form-field" id="update-title-field">
				<span class="form-label">Title</span>
				<input
					bind:this={titleEl}
					bind:value={formTitle}
					class="input preset-tonal-surface"
					id="update-title-input"
					name="title"
					placeholder="Weekend route update"
					required
				/>
			</label>

			<!-- Content Editor (No label) -->
			<div class="content-section">
				<LearnEditor
					value={formBodyMarkdown}
					height="320px"
					label=""
					placeholder="Write your update..."
					onReady={(api) => {
						editorApi = api;
					}}
				/>
			</div>

			<!-- Actions -->
			<footer class="editor-footer">
				<div class="footer-info">
					<div class="info-item">
						<IconPencilLine class="h-3.5 w-3.5" />
						<span>Drafts are private</span>
					</div>
					<div class="info-item">
						<IconGlobe class="h-3.5 w-3.5" />
						<span>Published on group page</span>
					</div>
				</div>

				<div class="footer-actions">
					<label class="email-switch" class:disabled={memberEmailCount === 0}>
						<input
							type="checkbox"
							name="emailMembers"
							checked={emailMembers}
							disabled={memberEmailCount === 0}
						/>
						<span class="switch-track">
							<span class="switch-thumb"></span>
						</span>
						<span class="switch-label">Email {memberEmailCount || ''}</span>
					</label>
					{#if onDelete && isEditing}
						<button
							class="btn-delete-icon"
							type="button"
							onclick={onDelete}
							aria-label="Delete post"
							title="Delete post"
						>
							<IconTrash2 class="h-4 w-4" />
						</button>
					{/if}
					<button
						class="btn preset-tonal-warning gap-1.5"
						type="submit"
						name="intent"
						value="save_draft"
						disabled={isGeneratingSummary}
					>
						<IconSave class="h-4 w-4" />
						{isGeneratingSummary ? 'Saving…' : draftLabel}
					</button>
					<button
						class="btn preset-filled-primary-500 gap-1.5"
						type="submit"
						name="intent"
						value="publish"
						disabled={isGeneratingSummary}
					>
						<IconGlobe class="h-4 w-4" />
						{isGeneratingSummary ? 'Publishing…' : publishLabel}
					</button>
				</div>
			</footer>
		</div>
	</div>

	{#if error}
		<p class="form-error">{error}</p>
	{/if}
</form>

<style>
	.editor-form {
		--card-bg: color-mix(in oklab, var(--color-surface-900) 94%, var(--color-secondary-500) 6%);
		--card-border: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.editor-card {
		position: relative;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1rem;
		overflow: hidden;
		animation: card-in 360ms ease both;
	}

	.edit-card-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 2rem 2rem 0 0;
		pointer-events: none;
	}

	.edit-card-accent-bar.primary {
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.7;
	}

	.edit-card-accent-bar.secondary {
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		opacity: 0.7;
	}

	.edit-card-accent-bar.tertiary {
		background: linear-gradient(90deg, var(--color-tertiary-500), var(--color-primary-500));
		opacity: 0.6;
	}

	.editor-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--card-border);
	}

	.editor-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-label {
		font-size: 0.75rem;
		font-weight: 500;
		opacity: 0.7;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* AI Assistant - Beautiful Modern Design */
	.ai-assistant {
		background: linear-gradient(
			145deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-950) 90%, transparent)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 12%, transparent);
		border-radius: 1rem;
		overflow: hidden;
		box-shadow:
			0 1px 2px color-mix(in oklab, black 5%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 3%, transparent);
	}

	.ai-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
	}

	.ai-header-left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.ai-avatar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-primary-500) 70%, var(--color-secondary-500) 30%)
		);
		color: white;
		box-shadow: 0 2px 8px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.ai-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.ai-title {
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.ai-subtitle {
		font-size: 0.6875rem;
		opacity: 0.55;
		line-height: 1.2;
	}

	.ai-clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: color-mix(in oklab, var(--color-surface-300) 70%, transparent);
		cursor: pointer;
		transition: all 150ms ease;
	}

	.ai-clear-btn:hover {
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		color: var(--color-surface-200);
	}

	.ai-chat-container {
		padding: 1rem;
		min-height: 200px;
		max-height: 320px;
		overflow-y: auto;
	}

	/* Welcome State */
	.ai-welcome {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0;
	}

	.ai-welcome-bubble {
		background: color-mix(in oklab, var(--color-surface-800) 40%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		border-radius: 1rem;
		padding: 1rem 1.25rem;
		max-width: 28rem;
	}

	.ai-welcome-text {
		font-size: 0.875rem;
		line-height: 1.5;
		text-align: center;
		opacity: 0.9;
		margin-bottom: 0.875rem;
	}

	.ai-quick-prompts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.quick-prompt {
		width: 100%;
		padding: 0.625rem 0.875rem;
		font-size: 0.8125rem;
		text-align: left;
		background: color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.5rem;
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.quick-prompt:hover {
		background: color-mix(in oklab, var(--color-primary-500) 10%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	/* Messages */
	.ai-messages {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ai-message {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
	}

	.ai-message.user {
		flex-direction: row-reverse;
	}

	.ai-message-avatar {
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		color: color-mix(in oklab, var(--color-surface-300) 80%, transparent);
		font-size: 0.625rem;
		font-weight: 600;
	}

	.ai-message.assistant .ai-message-avatar {
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-primary-500) 70%, var(--color-secondary-500) 30%)
		);
		color: white;
	}

	.user-avatar {
		font-size: 0.5625rem;
		letter-spacing: 0.02em;
	}

	.ai-message-content {
		flex: 1;
		max-width: calc(100% - 3rem);
	}

	.ai-message-text {
		font-size: 0.8125rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.ai-message.assistant .ai-message-content {
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		border-radius: 0.75rem;
		border-top-left-radius: 0.25rem;
		padding: 0.75rem 0.875rem;
	}

	.ai-message.user .ai-message-content {
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		border-radius: 0.75rem;
		border-top-right-radius: 0.25rem;
		padding: 0.75rem 0.875rem;
	}

	/* Typing Indicator */
	.typing-indicator {
		display: flex;
		gap: 0.25rem;
		padding: 0.5rem 0;
	}

	.typing-indicator span {
		width: 0.5rem;
		height: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-400) 60%, transparent);
		border-radius: 9999px;
		animation: typing-bounce 1.4s ease-in-out infinite;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: 0ms;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 160ms;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 320ms;
	}

	@keyframes typing-bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-4px);
		}
	}

	/* Composer */
	.ai-composer {
		padding: 0.875rem 1rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 20%, transparent);
	}

	.ai-style-select {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.625rem;
	}

	.ai-style-select select {
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.ai-style-select select:hover,
	.ai-style-select select:focus {
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
		outline: none;
	}

	.style-hint {
		font-size: 0.6875rem;
		opacity: 0.55;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 480px) {
		.style-hint {
			display: none;
		}
	}

	.ai-input-area {
		display: flex;
		gap: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 15%, transparent);
		border-radius: 0.75rem;
		padding: 0.5rem;
		transition: all 150ms ease;
	}

	.ai-input-area:focus-within {
		border-color: color-mix(in oklab, var(--color-primary-500) 50%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary-500) 10%, transparent);
	}

	.ai-input-area textarea {
		flex: 1;
		min-height: 2.5rem;
		max-height: 6rem;
		padding: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		background: transparent;
		border: none;
		color: inherit;
		resize: none;
		outline: none;
	}

	.ai-input-area textarea::placeholder {
		color: color-mix(in oklab, var(--color-surface-400) 70%, transparent);
	}

	.ai-send-btn {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		background: var(--color-primary-500);
		border: none;
		color: white;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.ai-send-btn:hover:not(:disabled) {
		background: var(--color-primary-600);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.ai-send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.ai-hint {
		font-size: 0.6875rem;
		opacity: 0.5;
		margin-top: 0.5rem;
		text-align: center;
	}

	.ai-status {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}

	.ai-status.success {
		background: color-mix(in oklab, var(--color-success-500) 8%, transparent);
		color: var(--color-success-400);
	}

	.ai-status.error {
		background: color-mix(in oklab, var(--color-error-500) 8%, transparent);
		color: var(--color-error-400);
	}

	/* Footer */
	.editor-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--card-border);
	}

	.footer-info {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.info-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.email-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		font-size: 0.75rem;
	}

	.email-toggle:hover {
		border-color: color-mix(in oklab, var(--color-surface-500) 40%, transparent);
	}

	/* Email Switch Toggle */
	.email-switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.25rem;
	}

	.email-switch.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.email-switch input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.switch-track {
		position: relative;
		width: 44px;
		height: 24px;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		transition: background 200ms ease;
		flex-shrink: 0;
	}

	.email-switch input:checked + .switch-track {
		background: var(--color-primary-500);
	}

	.switch-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		border-radius: 9999px;
		background: white;
		transition: transform 200ms ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.email-switch input:checked + .switch-track .switch-thumb {
		transform: translateX(20px);
	}

	.email-switch input:focus + .switch-track {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary-500) 50%, transparent);
	}

	.switch-label {
		font-size: 0.75rem;
		white-space: nowrap;
	}

	/* Delete Icon Button */
	.btn-delete-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-error-500) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 20%, transparent);
		color: var(--color-error-400);
		cursor: pointer;
		transition: all 150ms ease;
		flex-shrink: 0;
	}

	.btn-delete-icon:hover {
		background: color-mix(in oklab, var(--color-error-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-error-500) 35%, transparent);
		transform: translateY(-1px);
	}

	.btn-delete-icon:active {
		transform: translateY(0);
	}

	.form-error {
		color: var(--color-error-400);
		font-size: 0.875rem;
		margin-top: 0.5rem;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Mobile */
	@media (max-width: 640px) {
		.editor-body {
			padding: 0.75rem;
			gap: 0.75rem;
		}

		.ai-messages {
			min-height: 112px;
			max-height: 152px;
		}

		.ai-composer {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}

		.ai-send {
			width: 100%;
		}

		.ai-section {
			padding: 0.625rem;
		}

		.ai-header {
			margin-bottom: 0.625rem;
			gap: 0.5rem;
		}

		.ai-icon {
			width: 1.9rem;
			height: 1.9rem;
			border-radius: 0.5rem;
		}

		.ai-title {
			font-size: 0.875rem;
		}

		.ai-message {
			padding: 0.55rem 0.625rem;
			font-size: 0.775rem;
			line-height: 1.38;
		}

		.ai-toolbar {
			flex-wrap: nowrap;
			align-items: end;
		}

		.style-select {
			flex: 1;
			min-width: 0;
		}

		.style-select .form-label {
			display: none;
		}

		.style-select .select {
			width: 100%;
			min-height: 2.2rem;
			font-size: 0.875rem;
		}

		.ai-toolbar .btn {
			padding-inline: 0.55rem;
			min-height: 2.2rem;
		}

		.style-description {
			font-size: 0.7rem;
			line-height: 1.3;
		}

		.ai-input {
			min-height: 3.6rem;
			font-size: 0.95rem;
		}

		.hint {
			font-size: 0.68rem;
		}

		.starter-text-desktop {
			display: none;
		}

		.starter-text-mobile {
			display: block;
		}

		.editor-header {
			padding: 0.75rem;
		}

		.editor-footer {
			flex-direction: column;
			align-items: stretch;
		}

		.footer-actions {
			justify-content: stretch;
		}

		.footer-actions .btn {
			flex: 1;
		}
	}
</style>
