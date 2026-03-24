<script>
	import { onMount, tick } from 'svelte';
	import IconBot from '@lucide/svelte/icons/bot';
	import IconSendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconX from '@lucide/svelte/icons/x';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconLoader from '@lucide/svelte/icons/loader-2';

	const DEFAULT_WELCOME = {
		id: 'welcome',
		role: 'assistant',
		content:
			'I can help you find rides, groups, volunteer events, and learn articles that match your interests and location. Ask for recommendations or say “I want to post my own ride” and I will route you to the right page.',
		recommendations: [],
		navigationTarget: null,
		followUpQuestion: null
	};

	let { userId = null, pathname = '/' } = $props();

	let isOpen = $state(false);
	let sending = $state(false);
	let input = $state('');
	let error = $state('');
	let messages = $state([DEFAULT_WELCOME]);
	let chatBodyEl = $state(null);
	let inputTextareaEl = $state(null);
	let assistantSessionId = $state('');
	let savedRecommendationKeys = $state({});
	let hasMounted = $state(false);
	let lastLoadedStorageKey = $state('');

	const storageKey = $derived(userId ? `3fp-assistant-chat-${userId}` : '3fp-assistant-chat-guest');
	const canSend = $derived(!sending && input.trim().length > 0);
	const feedbackStorageKey = '3fp-assistant-session-id';
	const feedbackEndpoint = '/api/ai/article-feedback';
	const feedbackSentKeys = new Set();
	const messageShownAt = new Map();

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function normalizeAssistantLink(raw) {
		const candidate = String(raw || '').trim();
		if (!candidate) return '';
		if (/^https?:\/\//i.test(candidate)) return candidate;
		if (candidate.startsWith('/')) return candidate;
		return '';
	}

	function renderAssistantMessageHtml(content) {
		const source = String(content || '');
		const parts = [];
		const tokenRegex =
			/\((\/[^\s)]+|https?:\/\/[^\s)]+)\)|\b(https?:\/\/[^\s<>"')]+)|(\/(?:ride|groups|volunteer|learn|get-involved|profile|donate)[^\s<>"')]+)/gi;
		let cursor = 0;
		let match;
		while ((match = tokenRegex.exec(source)) !== null) {
			const fullMatch = match[0];
			const pathInParens = match[1] || '';
			const absoluteUrl = match[2] || '';
			const inlinePath = match[3] || '';
			const href = normalizeAssistantLink(pathInParens || absoluteUrl || inlinePath);
			if (!href) continue;
			const start = match.index;
			const end = start + fullMatch.length;
			if (start > cursor) {
				parts.push(escapeHtml(source.slice(cursor, start)));
			}
			const text = pathInParens || absoluteUrl || inlinePath;
			parts.push(`<a href="${escapeHtml(href)}" class="anchor">${escapeHtml(text)}</a>`);
			cursor = end;
		}
		if (cursor < source.length) {
			parts.push(escapeHtml(source.slice(cursor)));
		}
		return parts.join('').replace(/\n/g, '<br />');
	}

	function generateId(prefix = 'msg') {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `${prefix}-${crypto.randomUUID()}`;
		}
		return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	function recommendationKey(messageId, recommendation) {
		const baseId = String(
			recommendation?.articleId || recommendation?.id || recommendation?.url || ''
		);
		return `${String(messageId || '')}:${baseId}`;
	}

	function normalizeRecommendation(item) {
		const type = String(item?.type || '')
			.trim()
			.toLowerCase();
		const articleId = item?.articleId ? String(item.articleId).trim() : null;
		const id = item?.id ? String(item.id).trim() : articleId;
		const url = String(item?.url || '').trim();
		return {
			id: id || null,
			type,
			title: String(item?.title || '').trim(),
			subtitle: item?.subtitle ? String(item.subtitle).trim() : null,
			summary: item?.summary ? String(item.summary).trim() : null,
			url,
			reason: String(item?.reason || '').trim(),
			articleId: articleId || null,
			chunkId: item?.chunkId ? String(item.chunkId).trim() : null,
			contentType: item?.contentType ? String(item.contentType).trim() : null
		};
	}

	function normalizeRecommendations(items) {
		if (!Array.isArray(items)) return [];
		return items
			.map((item) => normalizeRecommendation(item))
			.filter((item) => item.title && item.url);
	}

	function ensureAssistantSessionId() {
		if (assistantSessionId) return assistantSessionId;
		if (typeof window === 'undefined') return '';
		try {
			const existing = String(window.localStorage.getItem(feedbackStorageKey) || '').trim();
			if (existing) {
				assistantSessionId = existing;
				return assistantSessionId;
			}
			const created = generateId('assistant-session');
			window.localStorage.setItem(feedbackStorageKey, created);
			assistantSessionId = created;
			return assistantSessionId;
		} catch {
			return '';
		}
	}

	function isArticleRecommendation(rec) {
		return rec?.type === 'article' && Boolean(rec?.articleId || rec?.id);
	}

	function estimateDwellSeconds(messageId) {
		const shownAt = messageShownAt.get(messageId);
		if (!shownAt) return 0;
		return Math.max(0, Math.floor((Date.now() - shownAt) / 1000));
	}

	async function sendArticleFeedback({
		messageId,
		recommendation,
		feedbackType,
		dwellSeconds = 0
	}) {
		if (!isArticleRecommendation(recommendation)) return;
		const articleId = String(recommendation.articleId || recommendation.id || '').trim();
		if (!articleId) return;
		const dedupeKey = `${feedbackType}:${messageId}:${articleId}:${recommendation.chunkId || ''}`;
		if (feedbackSentKeys.has(dedupeKey)) return;
		feedbackSentKeys.add(dedupeKey);

		try {
			await fetch(feedbackEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					articleId,
					chunkId: recommendation?.chunkId || null,
					feedbackType,
					dwellSeconds:
						feedbackType === 'dwell' ? Math.max(0, Math.round(dwellSeconds)) : undefined,
					sessionId: ensureAssistantSessionId() || null,
					context: {
						pathname,
						surface: 'global_assistant',
						messageId,
						contentType: recommendation?.contentType || null
					}
				})
			});
		} catch {
			// ignore feedback failures
		}
	}

	function queueArticleImpressions(entry) {
		if (!entry || entry.role !== 'assistant') return;
		const recommendations = Array.isArray(entry.recommendations) ? entry.recommendations : [];
		for (const recommendation of recommendations) {
			if (!isArticleRecommendation(recommendation)) continue;
			void sendArticleFeedback({
				messageId: entry.id,
				recommendation,
				feedbackType: 'impression'
			});
		}
	}

	function normalizeSavedMessages(raw) {
		if (!Array.isArray(raw)) return [DEFAULT_WELCOME];
		const rows = raw
			.map((entry) => {
				if (!entry || typeof entry !== 'object') return null;
				const role =
					entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
				const content = String(entry.content || '').trim();
				if (!role || !content) return null;
				const recommendations = normalizeRecommendations(entry.recommendations);
				const navigationTarget = entry.navigationTarget?.url
					? {
							url: String(entry.navigationTarget.url),
							label: String(entry.navigationTarget.label || 'Open'),
							reason: String(entry.navigationTarget.reason || '')
						}
					: null;
				const followUpQuestion = entry.followUpQuestion
					? String(entry.followUpQuestion).trim()
					: null;
				return {
					id: entry.id || generateId(role),
					role,
					content,
					recommendations,
					navigationTarget,
					followUpQuestion
				};
			})
			.filter(Boolean)
			.slice(-24);
		if (!rows.length || rows[0]?.role !== 'assistant') {
			return [DEFAULT_WELCOME, ...rows];
		}
		return rows;
	}

	function saveMessages() {
		if (typeof window === 'undefined' || !hasMounted) return;
		try {
			const serializable = messages.slice(-24).map((entry) => ({
				id: entry.id,
				role: entry.role,
				content: entry.content,
				recommendations: entry.recommendations || [],
				navigationTarget: entry.navigationTarget || null,
				followUpQuestion: entry.followUpQuestion || null
			}));
			window.localStorage.setItem(storageKey, JSON.stringify(serializable));
		} catch {
			// ignore persistence failures
		}
	}

	function loadMessagesFromStorage(key) {
		if (typeof window === 'undefined') return;
		try {
			const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
			messages = normalizeSavedMessages(saved);
		} catch {
			messages = [DEFAULT_WELCOME];
		}
		messageShownAt.clear();
		for (const entry of messages) {
			if (entry?.role === 'assistant' && entry?.id) {
				messageShownAt.set(entry.id, Date.now());
			}
		}
		lastLoadedStorageKey = key;
	}

	async function scrollAssistantMessageToTop(messageId) {
		await tick();
		if (!chatBodyEl || !messageId) return;
		const target = chatBodyEl.querySelector(`[data-message-id="${messageId}"]`);
		if (!target) return;
		chatBodyEl.scrollTo({
			top: Math.max(0, target.offsetTop - 8),
			behavior: 'smooth'
		});
	}

	function resizeInputTextarea() {
		if (!inputTextareaEl) return;
		inputTextareaEl.style.height = 'auto';
		const nextHeight = Math.max(38, Math.min(inputTextareaEl.scrollHeight, 180));
		inputTextareaEl.style.height = `${nextHeight}px`;
	}

	function handleInputKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendMessage();
		}
	}

	function handleRecommendationClick(entry, recommendation) {
		if (isArticleRecommendation(recommendation)) {
			void sendArticleFeedback({
				messageId: entry.id,
				recommendation,
				feedbackType: 'click'
			});
			const dwellSeconds = estimateDwellSeconds(entry.id);
			if (dwellSeconds >= 12) {
				void sendArticleFeedback({
					messageId: entry.id,
					recommendation,
					feedbackType: 'dwell',
					dwellSeconds
				});
			}
		}
		isOpen = false;
	}

	function markRecommendationSaved(key) {
		savedRecommendationKeys = { ...savedRecommendationKeys, [key]: true };
	}

	function hideRecommendation(messageId, recommendation) {
		const key = recommendationKey(messageId, recommendation);
		messages = messages.map((entry) => {
			if (entry.id !== messageId) return entry;
			return {
				...entry,
				recommendations: (entry.recommendations || []).filter(
					(rec) => recommendationKey(messageId, rec) !== key
				)
			};
		});
	}

	async function handleArticlePreference(event, entry, recommendation, feedbackType) {
		event.preventDefault();
		event.stopPropagation();
		if (!isArticleRecommendation(recommendation)) return;

		const key = recommendationKey(entry.id, recommendation);
		if (feedbackType === 'save') markRecommendationSaved(key);
		if (feedbackType === 'hide') hideRecommendation(entry.id, recommendation);

		await sendArticleFeedback({
			messageId: entry.id,
			recommendation,
			feedbackType
		});
	}

	async function sendMessage() {
		if (!canSend) return;
		const message = input.trim();
		input = '';
		error = '';
		sending = true;

		messages = [
			...messages,
			{
				id: generateId('user'),
				role: 'user',
				content: message,
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null
			}
		];
		try {
			const response = await fetch('/api/ai/assistant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: messages
						.slice(-20)
						.map((entry) => ({ role: entry.role, content: entry.content })),
					pathname
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to reach the assistant right now.');
			}
			const assistantId = generateId('assistant');
			const assistantEntry = {
				id: assistantId,
				role: 'assistant',
				content: String(payload?.reply || 'Here are your recommendations.'),
				recommendations: normalizeRecommendations(payload?.recommendations),
				navigationTarget: payload?.navigationTarget || null,
				followUpQuestion: payload?.followUpQuestion || null
			};
			messages = [...messages, assistantEntry];
			messageShownAt.set(assistantId, Date.now());
			queueArticleImpressions(assistantEntry);
			await scrollAssistantMessageToTop(assistantId);
		} catch (sendError) {
			error = sendError?.message || 'Unable to reach the assistant right now.';
			const assistantId = generateId('assistant');
			messages = [
				...messages,
				{
					id: assistantId,
					role: 'assistant',
					content:
						'I hit a temporary issue. Try again, or tell me your city plus what you want to find and I can retry.',
					recommendations: [],
					navigationTarget: null,
					followUpQuestion: null
				}
			];
			messageShownAt.set(assistantId, Date.now());
			await scrollAssistantMessageToTop(assistantId);
		} finally {
			sending = false;
			resizeInputTextarea();
		}
	}

	function clearChat() {
		messages = [DEFAULT_WELCOME];
		error = '';
		savedRecommendationKeys = {};
		messageShownAt.clear();
		saveMessages();
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		ensureAssistantSessionId();
		hasMounted = true;
		loadMessagesFromStorage(storageKey);

		const onEscape = (event) => {
			if (event.key === 'Escape') isOpen = false;
		};
		document.addEventListener('keydown', onEscape);

		resizeInputTextarea();
		return () => {
			document.removeEventListener('keydown', onEscape);
		};
	});

	$effect(() => {
		if (!hasMounted || typeof window === 'undefined') return;
		const key = storageKey;
		if (!key || key === lastLoadedStorageKey) return;
		loadMessagesFromStorage(key);
	});

	$effect(() => {
		messages.length;
		saveMessages();
	});

	$effect(() => {
		input;
		resizeInputTextarea();
	});
</script>

<div class="fixed right-0 bottom-0 z-[80]">
	{#if isOpen}
		<div
			class="card preset-filled-surface-100-900 border-surface-300-700 absolute right-0 bottom-[calc(100%+0.5rem)] grid h-[min(75vh,38rem)] w-[min(25rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden border shadow-2xl backdrop-blur max-sm:h-[min(72vh,34rem)]"
			role="dialog"
			aria-label="3FP assistant"
		>
			<header
				class="border-surface-500/20 flex items-center justify-between gap-3 border-b px-4 py-3"
			>
				<div class="flex min-w-0 items-center gap-2">
					<div
						class="bg-primary-500/20 text-primary-300 inline-flex h-7 w-7 items-center justify-center rounded-full"
					>
						<IconBot class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<p class="text-sm leading-tight font-semibold">3FP Assistant</p>
						<p class="text-[11px] opacity-65">Personalized rides, groups & activities</p>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<button type="button" class="btn btn-sm preset-tonal-warning" onclick={clearChat}>
						Clear
					</button>
					<button
						type="button"
						class="btn btn-icon btn-sm preset-tonal-error"
						onclick={() => (isOpen = false)}
						aria-label="Close assistant"
					>
						<IconX class="h-4 w-4" />
					</button>
				</div>
			</header>

			<div class="flex flex-col gap-2 overflow-y-auto p-3" bind:this={chatBodyEl}>
				{#each messages as entry (entry.id)}
					<div
						class={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
						data-message-id={entry.id}
					>
						<div
							class={`card w-[92%] rounded-xl p-3 ${
								entry.role === 'user' ? 'preset-tonal-tertiary' : 'preset-tonal-secondary'
							}`}
						>
							<p class="text-sm leading-relaxed whitespace-pre-wrap">
								{@html renderAssistantMessageHtml(entry.content)}
							</p>
							{#if entry.followUpQuestion}
								<p class="mt-2 text-xs opacity-70">{entry.followUpQuestion}</p>
							{/if}
							{#if entry.navigationTarget}
								<a
									href={entry.navigationTarget.url}
									class="btn btn-sm preset-filled-primary-500 mt-2 inline-flex gap-1.5"
									onclick={() => (isOpen = false)}
								>
									<IconArrowRight class="h-3.5 w-3.5" />
									{entry.navigationTarget.label}
								</a>
								{#if entry.navigationTarget.reason}
									<p class="mt-1 text-[11px] opacity-70">{entry.navigationTarget.reason}</p>
								{/if}
							{/if}
							{#if entry.recommendations?.length}
								<div class="mt-2 space-y-1.5">
									{#each entry.recommendations as rec}
										<div
											class="card preset-tonal-surface border-surface-500/25 rounded-lg border p-2.5"
										>
											<a
												href={rec.url}
												class="hover:text-primary-300 block transition"
												onclick={() => handleRecommendationClick(entry, rec)}
											>
												<div
													class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase opacity-70"
												>
													<IconSparkles class="h-3 w-3" />
													{rec.type}
												</div>
												<p class="text-sm leading-tight font-medium">{rec.title}</p>
												{#if rec.subtitle}
													<p class="text-xs opacity-75">{rec.subtitle}</p>
												{/if}
												<p class="mt-1 text-xs opacity-80">{rec.reason}</p>
											</a>
											{#if isArticleRecommendation(rec)}
												<div class="mt-2 flex flex-wrap items-center gap-1.5">
													<button
														type="button"
														class="btn btn-xs preset-tonal-primary"
														onclick={(event) => handleArticlePreference(event, entry, rec, 'save')}
													>
														{#if savedRecommendationKeys[recommendationKey(entry.id, rec)]}
															Saved
														{:else}
															Save
														{/if}
													</button>
													<button
														type="button"
														class="btn btn-xs preset-tonal-warning"
														onclick={(event) => handleArticlePreference(event, entry, rec, 'hide')}
													>
														Hide
													</button>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}
				{#if sending}
					<div class="flex justify-start">
						<div
							class="card preset-tonal-surface border-surface-500/20 w-[92%] rounded-xl border p-3"
						>
							<div class="flex items-center gap-2 text-sm opacity-75">
								<IconLoader class="h-4 w-4 animate-spin" /> Thinking...
							</div>
						</div>
					</div>
				{/if}
			</div>

			{#if error}
				<div class="text-error-500 px-4 pb-1 text-xs">{error}</div>
			{/if}

			<form
				class="border-surface-500/20 border-t p-3"
				onsubmit={(event) => {
					event.preventDefault();
					void sendMessage();
				}}
			>
				<div class="flex items-end gap-2">
					<textarea
						bind:this={inputTextareaEl}
						bind:value={input}
						rows="1"
						placeholder="Ask for rides, groups, volunteer events, articles, or posting help"
						maxlength="500"
						class="input w-full resize-none p-2"
						disabled={sending}
						onkeydown={handleInputKeydown}
					></textarea>
					<button
						type="submit"
						class="btn btn-icon preset-filled-primary-500"
						disabled={!canSend}
						aria-label="Send message"
					>
						<IconSendHorizontal class="h-4 w-4" />
					</button>
				</div>
			</form>
		</div>
	{/if}

	<button
		type="button"
		class="btn btn-sm preset-tonal-secondary inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 py-2 font-bold shadow-xl"
		onclick={() => (isOpen = !isOpen)}
		aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
	>
		{#if isOpen}
			<IconX class="h-4 w-4" />
		{:else}
			<IconSparkles class="h-3.5 w-3.5" />
			<span class="text-xs font-semibold tracking-wide uppercase">AI</span>
		{/if}
	</button>
</div>
