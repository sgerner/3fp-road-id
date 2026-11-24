<script>
	import { onMount, tick, untrack } from 'svelte';
	import IconBot from '@lucide/svelte/icons/bot';
	import IconSendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconX from '@lucide/svelte/icons/x';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import {
		normalizeAssistantHref,
		normalizeNavigationTarget,
		renderAssistantMessageHtml
	} from '#lib/ai/assistantMessage';

	const DEFAULT_WELCOME = {
		id: 'welcome',
		role: 'assistant',
		content:
			'Ask for **rides**, **cycling groups**, **volunteer shifts**, **safety guides**, **Road ID** (`/roadid`), **merch** (`/merch`), or **donations** (`/donate`)—or tell me your city and state to search nearby.',
		recommendations: [],
		navigationTarget: null,
		followUpQuestion: null
	};

	let { userId = null, pathname = '/', initialOpen = false } = $props();

	let isOpen = $state(false);
	let sending = $state(false);
	let input = $state('');
	let error = $state('');
	let messages = $state([DEFAULT_WELCOME]);
	let activeLocationHint = $state('');
	let dialogEl = $state(null);
	let chatBodyEl = $state(null);
	let inputTextareaEl = $state(null);
	let toggleButtonEl = $state(null);
	let previousFocusEl = $state(null);
	let focusRestoreVersion = 0;
	let assistantSessionId = $state('');
	let savedRecommendationKeys = $state({});
	let hasMounted = $state(false);
	let lastLoadedStorageKey = $state('');

	const storageKey = $derived(userId ? `3fp-assistant-chat-${userId}` : '3fp-assistant-chat-guest');
	const locationStorageKey = $derived(
		userId ? `3fp-assistant-location-${userId}` : '3fp-assistant-location-guest'
	);
	const canSend = $derived(!sending && input.trim().length > 0);
	const feedbackStorageKey = '3fp-assistant-session-id';
	const feedbackEndpoint = '/api/ai/article-feedback';
	const feedbackSentKeys = new Set();
	const messageShownAt = new Map();

	$effect(() => {
		if (initialOpen) untrack(openAssistant);
	});

	$effect(() => {
		if (!isOpen) return;
		const root = document.documentElement;
		const overflow = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = overflow;
		};
	});

	function openAssistant() {
		if (isOpen) return;
		focusRestoreVersion += 1;
		const activeElement = document.activeElement;
		previousFocusEl =
			activeElement instanceof HTMLElement && activeElement !== document.body
				? activeElement
				: toggleButtonEl;
		isOpen = true;
		void tick().then(() => {
			if (!isOpen) return;
			if (window.matchMedia('(min-width: 768px)').matches) inputTextareaEl?.focus();
			else dialogEl?.focus();
		});
	}

	function closeAssistant({ restoreFocus = true } = {}) {
		if (!isOpen) {
			if (!restoreFocus) focusRestoreVersion += 1;
			return;
		}
		const restoreTarget = previousFocusEl;
		const restoreVersion = ++focusRestoreVersion;
		isOpen = false;
		previousFocusEl = null;
		if (!restoreFocus) return;
		void tick().then(() => {
			if (restoreVersion !== focusRestoreVersion || isOpen) return;
			const target = restoreTarget?.isConnected ? restoreTarget : toggleButtonEl;
			target?.focus();
		});
	}

	function toggleAssistant() {
		if (isOpen) closeAssistant();
		else openAssistant();
	}

	function handleDialogKeydown(event) {
		if (event.key !== 'Tab') return;

		const focusable = Array.from(
			dialogEl?.querySelectorAll(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			) ?? []
		).filter(
			(element) => element.tabIndex >= 0 && !element.hidden && element.getClientRects().length > 0
		);

		if (!focusable.length) {
			event.preventDefault();
			dialogEl?.focus();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const activeElement = document.activeElement;
		if (
			event.shiftKey &&
			(activeElement === first || activeElement === dialogEl || !dialogEl?.contains(activeElement))
		) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (activeElement === last || !dialogEl?.contains(activeElement))) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleMessageBodyClick(event) {
		const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!target) return;
		const href = target.getAttribute('href') || '';
		if (href.startsWith('/')) {
			closeAssistant();
		}
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

	function formatIndexNumeral(index) {
		return String(index + 1).padStart(2, '0');
	}

	function normalizeRecommendation(item) {
		const type = String(item?.type || '')
			.trim()
			.toLowerCase();
		const articleId = item?.articleId ? String(item.articleId).trim() : null;
		const id = item?.id ? String(item.id).trim() : articleId;
		const rawUrl = String(item?.url || '').trim();
		const url = normalizeAssistantHref(rawUrl);
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
				const navigationTarget = normalizeNavigationTarget(entry.navigationTarget);
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
			if (activeLocationHint) {
				window.localStorage.setItem(locationStorageKey, activeLocationHint);
			} else {
				window.localStorage.removeItem(locationStorageKey);
			}
		} catch {
			// ignore persistence failures
		}
	}

	function loadMessagesFromStorage(key) {
		if (typeof window === 'undefined') return;
		try {
			const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
			messages = normalizeSavedMessages(saved);
			activeLocationHint = String(window.localStorage.getItem(locationStorageKey) || '').trim();
		} catch {
			messages = [DEFAULT_WELCOME];
			activeLocationHint = '';
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
		const prefersReducedMotion =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		chatBodyEl.scrollTo({
			top: Math.max(0, target.offsetTop - 8),
			behavior: prefersReducedMotion ? 'auto' : 'smooth'
		});
	}

	function resizeInputTextarea() {
		if (!inputTextareaEl) return;
		inputTextareaEl.style.height = 'auto';
		const minHeight =
			typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 44 : 40;
		const nextHeight = Math.max(minHeight, Math.min(inputTextareaEl.scrollHeight, 180));
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
		closeAssistant();
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
			const nextHint = String(payload?.context?.locationHint || '').trim();
			if (nextHint) {
				activeLocationHint = nextHint;
			}
			const assistantId = generateId('assistant');
			const assistantEntry = {
				id: assistantId,
				role: 'assistant',
				content: String(payload?.reply || 'Here are your recommendations.'),
				recommendations: normalizeRecommendations(payload?.recommendations),
				navigationTarget: normalizeNavigationTarget(payload?.navigationTarget),
				followUpQuestion: payload?.followUpQuestion ? String(payload.followUpQuestion).trim() : null
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
		activeLocationHint = '';
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

		const onGlobalKeydown = (event) => {
			if (!isOpen || event.key !== 'Escape') return;
			event.preventDefault();
			closeAssistant();
		};
		const onOpenLogin = () => closeAssistant({ restoreFocus: false });
		document.addEventListener('keydown', onGlobalKeydown);
		window.addEventListener('open-login', onOpenLogin);
		resizeInputTextarea();
		return () => {
			document.removeEventListener('keydown', onGlobalKeydown);
			window.removeEventListener('open-login', onOpenLogin);
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
		activeLocationHint;
		saveMessages();
	});

	$effect(() => {
		input;
		resizeInputTextarea();
	});
</script>

{#if isOpen}
	<button
		type="button"
		class="bg-surface-950/75 fixed inset-0 z-[79] cursor-default rounded-none"
		tabindex="-1"
		aria-label="Close 3FP assistant"
		onclick={closeAssistant}
	></button>
{/if}

<div class="assistant-lane-root md:fixed md:right-0 md:bottom-0 md:z-[80]">
	{#if isOpen}
		<div
			bind:this={dialogEl}
			class="assistant-lane-dialog border-surface-700 border-t-primary-500 bg-surface-950 text-surface-50 fixed right-2 bottom-2 z-[80] grid h-[min(78dvh,40rem)] w-[min(26rem,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden rounded-none border-2 border-t-4 md:absolute md:right-0 md:bottom-[calc(100%+0.5rem)]"
			role="dialog"
			aria-label="3FP assistant"
			aria-modal="true"
			tabindex="-1"
			onkeydown={handleDialogKeydown}
		>
			<header class="border-surface-800 bg-surface-900 border-b-2 px-4 py-3">
				<div class="flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2.5">
						<div
							class="bg-primary-500 text-surface-950 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none"
							aria-hidden="true"
						>
							<IconBot class="h-4 w-4" />
						</div>
						<div class="min-w-0">
							<h2
								class="text-surface-50! m-0 text-base leading-none font-black tracking-tight uppercase italic"
							>
								3FP Assistant
							</h2>
							<p
								class="text-surface-300 m-0 mt-1 text-[11px] font-bold tracking-[0.14em] uppercase"
							>
								Rides · Groups · Safety
							</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-3">
						<button
							type="button"
							class="border-surface-500 bg-surface-950 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-9 items-center justify-center rounded-none border-2 px-3 py-1.5 text-xs font-black tracking-wider uppercase transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
							onclick={clearChat}
						>
							Clear
						</button>
						<button
							type="button"
							class="border-surface-500 bg-surface-950 text-surface-50 hover:bg-error-500 hover:border-error-500 hover:text-surface-950 inline-flex h-9 w-9 items-center justify-center rounded-none border-2 transition-colors pointer-coarse:size-11"
							onclick={closeAssistant}
							aria-label="Close assistant"
						>
							<IconX class="h-4 w-4" />
						</button>
					</div>
				</div>
				{#if activeLocationHint}
					<div
						class="border-surface-800 mt-2.5 flex items-center gap-1.5 border-t pt-2 text-[11px]"
						data-testid="assistant-location-hint"
					>
						<span
							class="bg-primary-500 text-surface-950 inline-flex items-center gap-1 px-2 py-0.5 font-black tracking-[0.16em] uppercase"
						>
							<IconMapPin class="h-3 w-3" aria-hidden="true" />
							Area
						</span>
						<span class="text-surface-200 truncate font-bold">{activeLocationHint}</span>
					</div>
				{/if}
			</header>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="divide-surface-800 flex flex-col divide-y overflow-y-auto"
				bind:this={chatBodyEl}
				onclick={handleMessageBodyClick}
			>
				{#each messages as entry (entry.id)}
					<article
						class={entry.role === 'user'
							? 'border-l-tertiary-500 bg-surface-900 border-l-4 px-4 py-3.5'
							: 'border-l-primary-500 bg-surface-950 border-l-4 px-4 py-3.5'}
						data-message-id={entry.id}
						data-message-role={entry.role}
					>
						<p
							class={`m-0 mb-1.5 text-[10px] font-black tracking-[0.2em] uppercase ${
								entry.role === 'user' ? 'text-tertiary-500' : 'text-primary-500'
							}`}
						>
							{entry.role === 'user' ? 'You' : '3 Feet Please'}
						</p>
						<div class="assistant-message-copy text-surface-50 text-sm leading-relaxed font-medium">
							{@html renderAssistantMessageHtml(entry.content)}
						</div>
						{#if entry.followUpQuestion}
							<p class="text-surface-300 m-0 mt-2 text-xs font-medium">{entry.followUpQuestion}</p>
						{/if}
						{#if entry.navigationTarget}
							<div class="mt-3">
								<a
									href={entry.navigationTarget.url}
									class="group bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex items-center gap-2 rounded-none px-4 py-2.5 text-xs font-black tracking-wider uppercase transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
									data-testid="assistant-action-button"
									onclick={closeAssistant}
								>
									<span>{entry.navigationTarget.label}</span>
									<IconArrowRight
										class="h-3.5 w-3.5 transition-transform motion-safe:group-hover:translate-x-1"
									/>
								</a>
								{#if entry.navigationTarget.reason}
									<p class="text-surface-300 m-0 mt-1.5 text-[11px]">
										{entry.navigationTarget.reason}
									</p>
								{/if}
							</div>
						{/if}
						{#if entry.recommendations?.length}
							<div class="border-surface-800 mt-3 border-t-2">
								{#each entry.recommendations as rec, recIndex}
									<div class="border-surface-800 border-b py-2.5">
										<a
											href={rec.url}
											class="group hover:bg-primary-500 hover:text-surface-950 -mx-2 block px-2 py-1.5 transition-colors"
											onclick={() => handleRecommendationClick(entry, rec)}
										>
											<div class="flex items-baseline justify-between gap-2">
												<div class="flex items-baseline gap-2">
													<span
														class="text-tertiary-500 group-hover:text-surface-950 text-xs font-black italic tabular-nums"
													>
														{formatIndexNumeral(recIndex)}
													</span>
													<span
														class="text-primary-500 group-hover:text-surface-950 text-[10px] font-bold tracking-[0.2em] uppercase"
													>
														{rec.type}
													</span>
												</div>
												<IconArrowRight
													class="text-surface-300 group-hover:text-surface-950 h-3.5 w-3.5 shrink-0 transition-transform motion-safe:group-hover:translate-x-1"
												/>
											</div>
											<p
												class="text-surface-50 group-hover:text-surface-950 m-0 mt-0.5 text-sm leading-snug font-bold"
											>
												{rec.title}
											</p>
											{#if rec.subtitle}
												<p class="text-surface-300 group-hover:text-surface-950 m-0 mt-0.5 text-xs">
													{rec.subtitle}
												</p>
											{/if}
											{#if rec.reason}
												<p class="text-surface-300 group-hover:text-surface-950 m-0 mt-1 text-xs">
													{rec.reason}
												</p>
											{/if}
										</a>
										{#if isArticleRecommendation(rec)}
											<div class="mt-2 flex flex-wrap items-center gap-2">
												<button
													type="button"
													class="border-surface-500 bg-surface-900 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 min-h-11 rounded-none border-2 px-3 py-1 text-xs font-black tracking-wider uppercase transition-colors"
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
													class="border-surface-500 bg-surface-900 text-surface-300 hover:bg-surface-800 hover:text-surface-50 min-h-11 rounded-none border-2 px-3 py-1 text-xs font-black tracking-wider uppercase transition-colors"
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
					</article>
				{/each}
				{#if sending}
					<div class="border-l-primary-500 bg-surface-900 border-l-4 px-4 py-3.5">
						<div
							class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase"
						>
							<IconLoader class="text-primary-500 h-4 w-4 motion-safe:animate-spin" />
							Searching 3 Feet Please...
						</div>
					</div>
				{/if}
			</div>

			{#if error}
				<div class="bg-error-500 text-surface-950 px-4 py-2 text-xs font-bold" role="alert">
					{error}
				</div>
			{/if}

			<form
				class="border-surface-800 bg-surface-900 border-t-2 p-3"
				onsubmit={(event) => {
					event.preventDefault();
					void sendMessage();
				}}
			>
				<label
					for="assistant-message-input"
					class="text-surface-300 mb-1.5 block text-[10px] font-bold tracking-[0.18em] uppercase"
				>
					Ask 3FP Assistant
				</label>
				<div class="flex items-end gap-2">
					<textarea
						id="assistant-message-input"
						bind:this={inputTextareaEl}
						bind:value={input}
						rows="1"
						placeholder="Rides in Phoenix, AZ · Road ID · Madison, WI groups"
						maxlength="500"
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 w-full resize-none rounded-none border-2 px-3 py-2 text-sm focus:ring-0 focus:outline-none pointer-coarse:min-h-11"
						disabled={sending}
						onkeydown={handleInputKeydown}></textarea>
					<button
						type="submit"
						class="bg-primary-500 text-surface-950 hover:bg-primary-400 disabled:bg-surface-800 disabled:text-surface-400 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none font-black transition-colors pointer-coarse:size-11"
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
		bind:this={toggleButtonEl}
		type="button"
		class="group border-primary-500 bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-none border-2 px-3 py-2 font-black tracking-wider uppercase transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
		onclick={toggleAssistant}
		aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
	>
		{#if isOpen}
			<IconX class="h-4 w-4" />
		{:else}
			<IconSparkles class="text-primary-500 group-hover:text-surface-950 h-3.5 w-3.5" />
			<span class="text-xs font-black tracking-wider uppercase">AI</span>
		{/if}
	</button>
</div>

<style>
	.assistant-lane-root,
	.assistant-lane-root * {
		border-radius: 0 !important;
		box-shadow: none !important;
		backdrop-filter: none !important;
	}

	.assistant-message-copy :global(a.assistant-link) {
		color: var(--color-primary-500);
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.assistant-message-copy :global(a.assistant-link:hover) {
		background-color: var(--color-primary-500);
		color: var(--color-surface-950);
		text-decoration: none;
	}

	.assistant-message-copy :global(strong) {
		color: var(--color-surface-50);
		font-weight: 800;
	}

	.assistant-message-copy :global(code.assistant-inline-code) {
		background-color: var(--color-surface-900);
		border: 1px solid var(--color-surface-700);
		color: var(--color-primary-500);
		font-size: 0.8125rem;
		padding: 0.05rem 0.3rem;
	}

	.assistant-message-copy :global(a.assistant-link code.assistant-inline-code) {
		color: inherit;
		border-color: currentColor;
		background: transparent;
	}
</style>
