<script>
	import { onMount, tick, untrack } from 'svelte';
	import IconBot from '@lucide/svelte/icons/bot';
	import IconSendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconX from '@lucide/svelte/icons/x';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import {
		matchSafetyReportTemplates,
		normalizeReportTopicLabel
	} from '#lib/ai/assistantHelpers.js';
	import {
		normalizeAssistantHref,
		normalizeNavigationTarget,
		renderAssistantMessageHtml
	} from '#lib/ai/assistantMessage';
	import { safeHttpUrl } from '#lib/security/urls';

	const DEFAULT_WELCOME = {
		id: 'welcome',
		role: 'assistant',
		synthetic: true,
		mode: 'discover',
		content:
			'Ask for **rides**, **cycling groups**, **volunteer shifts**, **safety guides**, **Road ID** (`/roadid`), **merch** (`/merch`), or **donations** (`/donate`)—or tell me your city and state to search nearby.',
		recommendations: [],
		navigationTarget: null,
		followUpQuestion: null,
		reportEvidence: null,
		templates: [],
		proposal: null
	};

	let { userId = null, pathname = '/', initialOpen = false } = $props();
	const assistantContext = getAssistantContext();

	let isOpen = $state(false);
	let sending = $state(false);
	let activeLearnAction = $state('');
	let input = $state('');
	let error = $state('');
	let statusBanner = $state(null);
	let messages = $state([DEFAULT_WELCOME]);
	let proposalStates = $state({});
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
	let activeTopicOverride = $state('');

	const pageConfig = $derived(assistantContext.pageConfig);
	const hasPageMode = $derived(assistantContext.hasPageMode);
	const activeMode = $derived(assistantContext.activeMode);
	const pageModeMeta = $derived(assistantContext.pageModeMeta);
	const discoveryModeMeta = $derived(assistantContext.discoveryModeMeta);
	const activeModeMeta = $derived(assistantContext.activeModeMeta);
	const effectiveTopic = $derived(
		normalizeReportTopicLabel(activeTopicOverride || pageConfig?.topic || '')
	);
	const maxInputLength = $derived(activeModeMeta?.maxLength || 500);
	const starterPrompts = $derived(activeModeMeta?.starterPrompts || []);
	const isAuthoringMode = $derived(
		activeMode === 'learn-write' || activeMode === 'ride-write' || activeMode === 'group-site-write'
	);

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
		pathname;
		activeTopicOverride = '';
		statusBanner = null;
		error = '';
	});

	$effect(() => {
		if (initialOpen && !assistantContext.pendingRequest) {
			untrack(() => openAssistant());
		}
	});

	$effect(() => {
		const req = assistantContext.pendingRequest;
		if (!req) return;
		untrack(() => {
			assistantContext.consumePendingRequest(req.id);
			if (req.topic) {
				activeTopicOverride = req.topic;
			}
			error = '';
			statusBanner = null;
			openAssistant(req.triggerEl);
			if (req.prompt) {
				input = req.prompt.slice(0, maxInputLength);
			}
			if (req.learnAction) {
				const fallbackPrompt =
					req.learnAction === 'takeaways'
						? req.prompt || 'Preview key takeaways for my current draft'
						: req.prompt;
				if (fallbackPrompt) {
					input = fallbackPrompt.slice(0, maxInputLength);
					void sendMessage({ learnAction: req.learnAction });
				}
			} else if (req.submit && req.prompt.trim()) {
				void sendMessage();
			}
		});
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

	function openAssistant(explicitTrigger = null) {
		if (isOpen) {
			void tick().then(() => {
				if (!isOpen) return;
				if (window.matchMedia('(min-width: 768px)').matches) inputTextareaEl?.focus();
				else dialogEl?.focus();
			});
			return;
		}
		focusRestoreVersion += 1;
		const candidate =
			explicitTrigger instanceof HTMLElement ? explicitTrigger : document.activeElement;
		previousFocusEl =
			candidate instanceof HTMLElement && candidate !== document.body ? candidate : toggleButtonEl;
		isOpen = true;
		void tick().then(() => {
			if (!isOpen) return;
			if (window.matchMedia('(min-width: 768px)').matches) inputTextareaEl?.focus();
			else dialogEl?.focus();
		});
	}

	function closeAssistant({ restoreFocus = true } = {}) {
		assistantContext.markClosed();
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
		else openAssistant(toggleButtonEl);
	}

	function handleModeSwitch(targetPreference) {
		assistantContext.selectMode(targetPreference);
		error = '';
		statusBanner = null;
		void tick().then(() => {
			resizeInputTextarea();
			inputTextareaEl?.focus();
		});
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

	function normalizeReportEvidence(raw) {
		if (!raw || typeof raw !== 'object') return null;
		const nextSteps = Array.isArray(raw.nextSteps)
			? raw.nextSteps.map((s) => String(s || '').trim()).filter(Boolean)
			: [];
		const sections = Array.isArray(raw.sections)
			? raw.sections
					.filter((sec) => sec?.id && sec?.title)
					.map((sec) => ({ id: String(sec.id).trim(), title: String(sec.title).trim() }))
			: [];
		const sources = Array.isArray(raw.sources)
			? raw.sources
					.filter((src) => src?.record && src?.title)
					.map((src) => ({
						record: String(src.record).trim(),
						title: String(src.title).trim(),
						url: src.url ? safeHttpUrl(String(src.url).trim()) : ''
					}))
			: [];
		if (!nextSteps.length && !sections.length && !sources.length) return null;
		return { nextSteps, sections, sources };
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
		return rec?.type === 'article' && Boolean(rec?.articleId);
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
		const articleId = String(recommendation.articleId || '').trim();
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
				const isDefaultWelcome = entry.id === 'welcome' || entry.synthetic === true;
				return {
					id: entry.id || generateId(role),
					role,
					synthetic: isDefaultWelcome,
					mode: entry.mode ? String(entry.mode) : 'discover',
					content,
					recommendations,
					navigationTarget,
					followUpQuestion,
					reportEvidence: normalizeReportEvidence(entry.reportEvidence),
					templates: Array.isArray(entry.templates) ? entry.templates.slice(0, 3) : [],
					proposal: null
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
				synthetic: Boolean(entry.synthetic),
				mode: entry.mode || 'discover',
				content: entry.content,
				recommendations: entry.recommendations || [],
				navigationTarget: entry.navigationTarget || null,
				followUpQuestion: entry.followUpQuestion || null,
				reportEvidence: entry.reportEvidence || null,
				templates: entry.templates || []
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

	function handleReportCitationClick(event, targetId) {
		event.preventDefault();
		const cleanId = String(targetId || '')
			.replace(/^#/, '')
			.trim();
		if (!cleanId || typeof document === 'undefined') return;

		closeAssistant({ restoreFocus: false });
		document.documentElement.style.overflow = '';

		void tick().then(() => {
			if (typeof pageConfig?.onCitationSelect === 'function') {
				pageConfig.onCitationSelect(cleanId);
				return;
			}
			const target = document.getElementById(cleanId);
			if (!target) return;
			let ancestor = target;
			while (ancestor) {
				if (ancestor.tagName === 'DETAILS') ancestor.open = true;
				ancestor = ancestor.parentElement;
			}
			window.history.replaceState(null, '', `#${cleanId}`);
			target.scrollIntoView({
				behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
					? 'instant'
					: 'smooth',
				block: 'start'
			});
		});
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

	function submitStarterPrompt(promptText) {
		if (sending || !promptText) return;
		input = promptText.slice(0, maxInputLength);
		void sendMessage();
	}

	function triggerLearnStudioAction(action) {
		if (sending) return;
		error = '';
		statusBanner = null;
		if (action === 'takeaways') {
			const current = pageConfig?.getContext?.() ?? {};
			if (!String(current.bodyMarkdown || '').trim()) {
				error = 'Add some article text before generating takeaways.';
				return;
			}
			if (!input.trim()) {
				input = 'Preview key takeaways for my current draft';
			}
			void sendMessage({ learnAction: 'takeaways' });
			return;
		}
		if (!input.trim()) {
			error =
				action === 'ask'
					? 'Type a question about the saved article first.'
					: 'Add a short instruction for the writing assistant first.';
			inputTextareaEl?.focus();
			return;
		}
		void sendMessage({ learnAction: action });
	}

	async function handleApplyProposal(messageId, proposal) {
		if (!proposal || !pageConfig) return;
		error = '';
		statusBanner = null;

		if (proposal.kind === 'learn-draft' || proposal.kind === 'ride-draft') {
			const result = await pageConfig.applyDraft?.(proposal);
			if (!result?.ok) {
				proposalStates = {
					...proposalStates,
					[messageId]: {
						status: 'conflict',
						message:
							result?.error ||
							'Your draft changed after this suggestion was created. Ask again so your latest edits are preserved.'
					}
				};
				return;
			}
			proposalStates = {
				...proposalStates,
				[messageId]: {
					status: 'applied',
					message: 'Draft applied to the editor. You can undo before making conflicting edits.'
				}
			};
			return;
		}

		if (proposal.kind === 'group-site-draft') {
			const result = await pageConfig.applyDraft?.(proposal);
			if (!result?.ok) {
				proposalStates = {
					...proposalStates,
					[messageId]: {
						status: 'conflict',
						message:
							result?.error ||
							'Your page changed after this draft was created. Ask the assistant again so it uses your latest edits.'
					}
				};
				return;
			}
			proposalStates = {
				...proposalStates,
				[messageId]: {
					status: 'applied',
					message: 'Website proposal applied as a draft. Review it, then publish when ready.'
				}
			};
		}
	}

	async function handleApplySummary(messageId, proposal) {
		if (!proposal?.summary || !pageConfig?.applySummary) return;
		const result = await pageConfig.applySummary(proposal);
		if (!result?.ok) {
			proposalStates = {
				...proposalStates,
				[messageId]: {
					...(proposalStates[messageId] || {}),
					summaryStatus: 'conflict',
					summaryMessage:
						result?.error ||
						'Your summary field changed after this suggestion was created. Ask again to refresh.'
				}
			};
			return;
		}
		proposalStates = {
			...proposalStates,
			[messageId]: {
				...(proposalStates[messageId] || {}),
				summaryStatus: 'applied',
				summaryMessage: 'Summary applied to article details.'
			}
		};
	}

	function dismissProposal(messageId) {
		proposalStates = {
			...proposalStates,
			[messageId]: { status: 'dismissed', message: 'Kept your current editor content.' }
		};
	}

	async function handleUndoActiveDraft(messageId = null) {
		if (!pageConfig?.undoDraft) return;
		const result = await pageConfig.undoDraft();
		if (!result?.ok) {
			const conflictMsg =
				result?.error ||
				'Your draft changed after you applied this suggestion, so undo was skipped to protect newer edits.';
			statusBanner = { tone: 'warning', text: conflictMsg };
			if (messageId) {
				proposalStates = {
					...proposalStates,
					[messageId]: { status: 'conflict', message: conflictMsg }
				};
			}
			return;
		}
		statusBanner = { tone: 'success', text: 'Reverted the applied AI draft.' };
		if (messageId) {
			proposalStates = {
				...proposalStates,
				[messageId]: { status: 'undone', message: 'Reverted the applied AI draft.' }
			};
		}
	}

	async function handleUndoActiveSummary(messageId = null) {
		if (!pageConfig?.undoSummary) return;
		const result = await pageConfig.undoSummary();
		if (!result?.ok) {
			statusBanner = {
				tone: 'warning',
				text:
					result?.error ||
					'The summary changed after applying, so undo was skipped to protect your edits.'
			};
			return;
		}
		statusBanner = { tone: 'success', text: 'Reverted the applied summary.' };
		if (messageId) {
			proposalStates = {
				...proposalStates,
				[messageId]: {
					...(proposalStates[messageId] || {}),
					summaryStatus: 'undone',
					summaryMessage: 'Reverted the applied summary.'
				}
			};
		}
	}

	function buildModeRequestBody(conversationMessages, explicitLearnAction = '') {
		const mode = activeMode;
		const base = {
			mode,
			pathname,
			messages: conversationMessages
				.filter((entry) => !entry.synthetic)
				.slice(-20)
				.map((entry) => ({ role: entry.role, content: entry.content }))
		};

		if (mode === 'learn-article') {
			return {
				...base,
				articleSlug: pageConfig?.articleSlug || '',
				articleId: pageConfig?.articleId || ''
			};
		}

		if (mode === 'safety-report') {
			return {
				...base,
				topic: effectiveTopic
			};
		}

		if (mode === 'learn-write') {
			const editorContext = pageConfig?.getContext?.() ?? {};
			return {
				...base,
				articleId: pageConfig?.articleId || editorContext.articleId || '',
				learnAction: explicitLearnAction || '',
				editorContext
			};
		}

		if (mode === 'ride-write') {
			const editorContext = pageConfig?.getContext?.() ?? {};
			return {
				...base,
				editorContext
			};
		}

		if (mode === 'group-site-write') {
			const editorContext = pageConfig?.getContext?.() ?? {};
			return {
				...base,
				groupSlug: pageConfig?.groupSlug || '',
				editorContext
			};
		}

		return base;
	}

	async function sendMessage(options = {}) {
		const explicitLearnAction = options.learnAction || '';
		const message = input.trim();
		if (sending || !message) return;

		if (activeMode === 'learn-write' && !explicitLearnAction) {
			const ctx = pageConfig?.getContext?.() ?? {};
			const looksLikeTakeaways =
				/\b(?:preview|generate|find|create)\s+(?:key\s+)?takeaways?\b|^takeaways\b/i.test(message);
			if (looksLikeTakeaways && !String(ctx.bodyMarkdown || '').trim()) {
				error = 'Add some article text before generating takeaways.';
				return;
			}
		}

		const requestMode = activeMode;
		const requestTopic = effectiveTopic;
		input = '';
		error = '';
		statusBanner = null;
		sending = true;
		activeLearnAction = explicitLearnAction;

		const nextMessages = [
			...messages,
			{
				id: generateId('user'),
				role: 'user',
				synthetic: false,
				mode: requestMode,
				content: message,
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null,
				reportEvidence: null,
				templates: [],
				proposal: null
			}
		];
		messages = nextMessages;

		try {
			const requestBody = buildModeRequestBody(nextMessages, explicitLearnAction);
			const response = await fetch('/api/ai/assistant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			const payload = await response.json().catch(() => ({}));
			const reportEvidence = normalizeReportEvidence(payload?.reportEvidence);

			if (!response.ok) {
				const errMsg = payload?.error || 'Unable to reach the assistant right now.';
				error = errMsg;
				if (reportEvidence?.sections?.length) {
					const assistantId = generateId('assistant');
					messages = [
						...messages,
						{
							id: assistantId,
							role: 'assistant',
							synthetic: true,
							mode: requestMode,
							content: errMsg,
							recommendations: [],
							navigationTarget: null,
							followUpQuestion: null,
							reportEvidence,
							templates: [],
							proposal: null
						}
					];
					await scrollAssistantMessageToTop(assistantId);
				}
				return;
			}
			const nextHint = String(payload?.context?.locationHint || '').trim();
			if (nextHint) {
				activeLocationHint = nextHint;
			}

			const templates =
				requestMode === 'safety-report' && pageConfig?.report
					? matchSafetyReportTemplates(pageConfig.report, message, requestTopic)
					: [];

			const assistantId = generateId('assistant');
			const assistantEntry = {
				id: assistantId,
				role: 'assistant',
				synthetic: false,
				mode: payload?.mode || requestMode,
				content: String(payload?.reply || 'Here is what I found.'),
				recommendations: normalizeRecommendations(payload?.recommendations),
				navigationTarget: normalizeNavigationTarget(payload?.navigationTarget),
				followUpQuestion: payload?.followUpQuestion
					? String(payload.followUpQuestion).trim()
					: null,
				reportEvidence,
				templates,
				proposal: payload?.proposal || null
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
					synthetic: true,
					mode: requestMode,
					content:
						'I hit a temporary connection issue. Please try again in a moment or rephrase your request.',
					recommendations: [],
					navigationTarget: null,
					followUpQuestion: null,
					reportEvidence: null,
					templates: [],
					proposal: null
				}
			];
			messageShownAt.set(assistantId, Date.now());
			await scrollAssistantMessageToTop(assistantId);
		} finally {
			sending = false;
			activeLearnAction = '';
			resizeInputTextarea();
		}
	}

	function clearChat() {
		messages = [
			{
				...DEFAULT_WELCOME,
				mode: activeMode,
				content: activeModeMeta?.welcome || DEFAULT_WELCOME.content
			}
		];
		activeLocationHint = '';
		error = '';
		statusBanner = null;
		proposalStates = {};
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
		class="bg-surface-950/80 fixed inset-0 z-[79] cursor-default rounded-none border-0"
		tabindex="-1"
		aria-label="Close 3FP assistant"
		onclick={() => closeAssistant()}
	></button>
{/if}

<div class="assistant-lane-root md:fixed md:right-4 md:bottom-4 md:z-[80]">
	{#if isOpen}
		<div
			bind:this={dialogEl}
			class="assistant-lane-dialog border-surface-500 border-t-primary-500 bg-surface-900 text-surface-50 fixed right-2 bottom-2 z-[80] flex h-[min(82dvh,44rem)] w-[min(30rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-none border-2 border-t-4 md:absolute md:right-0 md:bottom-[calc(100%+0.5rem)]"
			role="dialog"
			aria-label="3FP assistant"
			aria-modal="true"
			tabindex="-1"
			onkeydown={handleDialogKeydown}
		>
			<header class="border-surface-800 bg-surface-950 shrink-0 border-b-2 px-4 py-3">
				<div class="flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-3">
						<div
							class="bg-primary-500 text-surface-950 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none font-black"
							aria-hidden="true"
						>
							<IconBot class="h-4 w-4" />
						</div>
						<div class="min-w-0">
							<p class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.22em] uppercase">
								{activeModeMeta?.tabLabel || '3FP Assistant'}
							</p>
							<h2
								class="text-surface-50! m-0 truncate text-sm leading-tight font-black uppercase italic"
							>
								3FP Assistant
							</h2>
							<p class="text-surface-300 m-0 truncate text-[11px]">
								{activeModeMeta?.subtitle || 'Personalized rides, groups & guides'}
							</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<button
							type="button"
							class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-9 items-center justify-center rounded-none border-2 px-2.5 py-1.5 text-[11px] font-black tracking-wider uppercase transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
							onclick={clearChat}
						>
							Clear
						</button>
						<button
							type="button"
							class="border-surface-500 bg-surface-950 text-surface-50 hover:border-error-500 hover:bg-error-500 hover:text-surface-950 inline-flex h-9 w-9 items-center justify-center rounded-none border-2 transition-colors pointer-coarse:size-11"
							onclick={() => closeAssistant()}
							aria-label="Close assistant"
						>
							<IconX class="h-4 w-4" />
						</button>
					</div>
				</div>
				{#if activeMode === 'discover' && activeLocationHint}
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

			{#if hasPageMode && pageModeMeta}
				<div
					class="border-surface-800 bg-surface-950 flex shrink-0 border-b-2 px-2"
					role="group"
					aria-label="Assistant mode"
				>
					<button
						type="button"
						aria-pressed={activeMode !== 'discover'}
						class="rounded-none px-3 py-2 text-[11px] font-black tracking-[0.16em] uppercase transition {activeMode !==
						'discover'
							? 'border-primary-500 text-primary-500 -mb-0.5 border-b-4'
							: 'text-surface-300 hover:text-surface-50'}"
						onclick={() => handleModeSwitch('page')}
					>
						{pageModeMeta.tabLabel}
					</button>
					<button
						type="button"
						aria-pressed={activeMode === 'discover'}
						class="rounded-none px-3 py-2 text-[11px] font-black tracking-[0.16em] uppercase transition {activeMode ===
						'discover'
							? 'border-primary-500 text-primary-500 -mb-0.5 border-b-4'
							: 'text-surface-300 hover:text-surface-50'}"
						onclick={() => handleModeSwitch('discover')}
					>
						{discoveryModeMeta.tabLabel}
					</button>
				</div>
			{/if}

			{#if isAuthoringMode && (pageConfig?.canUndoDraft || pageConfig?.canUndoSummary || pageConfig?.undoConflictMessage)}
				<div
					class="border-surface-800 bg-surface-950 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs"
				>
					{#if pageConfig?.undoConflictMessage}
						<span class="text-surface-300">{pageConfig.undoConflictMessage}</span>
					{:else}
						<span class="text-surface-300 font-semibold">AI changes applied to editor</span>
						<div class="flex flex-wrap items-center gap-2">
							{#if pageConfig?.canUndoDraft}
								<button
									type="button"
									class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 rounded-none border-2 px-2.5 py-1 text-[11px] font-black tracking-wide uppercase transition"
									onclick={() => handleUndoActiveDraft()}
								>
									<IconUndo2 class="h-3.5 w-3.5" />
									Undo draft
								</button>
							{/if}
							{#if pageConfig?.canUndoSummary}
								<button
									type="button"
									class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 rounded-none border-2 px-2.5 py-1 text-[11px] font-black tracking-wide uppercase transition"
									onclick={() => handleUndoActiveSummary()}
								>
									<IconUndo2 class="h-3.5 w-3.5" />
									Undo summary
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="bg-surface-900 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
				bind:this={chatBodyEl}
				onclick={handleMessageBodyClick}
			>
				{#each messages as entry (entry.id)}
					<div
						class={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
						data-message-id={entry.id}
						data-message-role={entry.role}
					>
						<div
							class={`w-[94%] rounded-none border-2 p-3 ${
								entry.role === 'user'
									? 'border-secondary-500 bg-secondary-500 text-surface-50'
									: 'border-surface-800 border-l-primary-500 bg-surface-950 text-surface-50 border-l-4'
							}`}
						>
							<div class="assistant-message-copy m-0 text-sm leading-relaxed break-words">
								{#if entry.id === 'welcome' && messages.length === 1}
									{@html renderAssistantMessageHtml(activeModeMeta?.welcome || entry.content)}
								{:else}
									{@html renderAssistantMessageHtml(entry.content)}
								{/if}
							</div>

							{#if entry.followUpQuestion}
								<p class="text-surface-300 m-0 mt-2 text-xs whitespace-pre-line">
									{entry.followUpQuestion}
								</p>
							{/if}

							{#if entry.navigationTarget}
								<a
									href={entry.navigationTarget.url}
									class="group bg-primary-500 text-surface-950 hover:bg-tertiary-500 mt-3 inline-flex items-center gap-1.5 rounded-none px-3 py-2 text-xs font-black tracking-wider uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11"
									data-testid="assistant-action-button"
									onclick={() => closeAssistant()}
								>
									<IconArrowRight
										class="h-3.5 w-3.5 transition-transform motion-safe:group-hover:translate-x-1"
									/>
									{entry.navigationTarget.label}
								</a>
								{#if entry.navigationTarget.reason}
									<p class="text-surface-300 m-0 mt-1 text-[11px]">
										{entry.navigationTarget.reason}
									</p>
								{/if}
							{/if}

							{#if entry.reportEvidence}
								<div class="border-surface-800 mt-3 space-y-3 border-t-2 pt-3 text-xs">
									{#if entry.reportEvidence.nextSteps?.length}
										<div>
											<p
												class="text-primary-500 m-0 mb-1 text-[10px] font-bold tracking-[0.2em] uppercase"
											>
												Explore next
											</p>
											<ul class="text-surface-300 m-0 list-disc space-y-1 pl-4">
												{#each entry.reportEvidence.nextSteps as step}
													<li>{step}</li>
												{/each}
											</ul>
										</div>
									{/if}

									{#if entry.reportEvidence.sections?.length}
										<div>
											<p
												class="text-primary-500 m-0 mb-1.5 text-[10px] font-bold tracking-[0.2em] uppercase"
											>
												Report sections
											</p>
											<ul class="border-surface-800 m-0 list-none border-t p-0">
												{#each entry.reportEvidence.sections as section, sIdx}
													<li class="border-surface-800 border-b">
														<a
															href={`#${section.id}`}
															class="text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex items-center justify-between gap-2 px-2 py-2 font-bold transition hover:no-underline"
															onclick={(event) => handleReportCitationClick(event, section.id)}
														>
															<span class="flex min-w-0 items-center gap-2">
																<span
																	class="text-tertiary-500 shrink-0 font-black italic tabular-nums"
																>
																	{formatIndexNumeral(sIdx)}
																</span>
																<span class="truncate">{section.title}</span>
															</span>
															<IconArrowRight class="h-3.5 w-3.5 shrink-0" />
														</a>
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									{#if entry.reportEvidence.sources?.length}
										<div>
											<p
												class="text-primary-500 m-0 mb-1.5 text-[10px] font-bold tracking-[0.2em] uppercase"
											>
												Cited sources
											</p>
											<ul class="m-0 list-none space-y-1.5 p-0">
												{#each entry.reportEvidence.sources as source}
													<li
														class="border-surface-800 bg-surface-900 flex flex-wrap items-center gap-1.5 border p-2"
													>
														<a
															href={`#ref-${source.record}`}
															class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 px-1.5 py-0.5 text-[11px] font-black uppercase hover:no-underline"
															onclick={(event) =>
																handleReportCitationClick(event, `ref-${source.record}`)}
														>
															{source.record}
														</a>
														<span class="text-surface-50 text-xs">{source.title}</span>
														{#if source.url}
															<a
																href={source.url}
																target="_blank"
																rel="noopener noreferrer"
																class="text-primary-500 hover:text-tertiary-500 ml-auto text-[11px] font-bold underline"
															>
																Original source ↗
															</a>
														{/if}
													</li>
												{/each}
											</ul>
										</div>
									{/if}
								</div>
							{/if}

							{#if entry.templates?.length}
								<div class="border-surface-800 mt-3 space-y-2 border-t-2 pt-3">
									<p class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.2em] uppercase">
										Example templates to adapt
									</p>
									<div class="grid gap-2 sm:grid-cols-2">
										{#each entry.templates as template (template.assetId)}
											<div class="border-surface-800 bg-surface-900 border p-2">
												<img
													src={template.src}
													alt={template.alt}
													class="bg-surface-50 aspect-[4/3] w-full object-contain"
													loading="lazy"
												/>
												<p class="text-surface-50 m-0 mt-1.5 text-xs font-bold">{template.title}</p>
												<div class="mt-1 flex flex-wrap gap-2 text-[11px]">
													{#if template.pdfUrl}
														<a
															href={template.pdfUrl}
															download
															class="text-primary-500 font-bold underline">PDF</a
														>
													{/if}
													{#if template.editableUrl}
														<a
															href={template.editableUrl}
															download
															class="text-primary-500 font-bold underline">PowerPoint</a
														>
													{/if}
													{#if template.canvaTemplateUrl}
														<a
															href={template.canvaTemplateUrl}
															target="_blank"
															rel="noopener noreferrer"
															class="text-primary-500 font-bold underline">Canva ↗</a
														>
													{/if}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if entry.proposal}
								{@const pState = proposalStates[entry.id] || {}}
								<div class="border-surface-500 bg-surface-900 mt-3 space-y-3 border-2 p-3">
									{#if entry.proposal.kind === 'learn-draft'}
										<div class="flex items-center justify-between gap-2">
											<p
												class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.2em] uppercase"
											>
												Draft suggestion preview
											</p>
										</div>
										<div
											class="border-surface-800 bg-surface-950 text-surface-50 max-h-52 overflow-y-auto border p-2.5 text-xs leading-relaxed whitespace-pre-wrap"
										>
											{entry.proposal.draft}
										</div>
										{#if pState.status === 'conflict'}
											<p
												class="bg-warning-500 text-surface-950 m-0 px-3 py-2 text-xs font-bold"
												role="alert"
											>
												{pState.message}
											</p>
										{:else if pState.status === 'applied'}
											<div class="flex flex-wrap items-center justify-between gap-2">
												<span class="text-primary-500 text-xs font-bold">Applied to editor</span>
												<button
													type="button"
													class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 rounded-none border-2 px-3 py-1.5 text-xs font-black uppercase transition"
													onclick={() => handleUndoActiveDraft(entry.id)}
												>
													<IconUndo2 class="h-3.5 w-3.5" />
													Undo
												</button>
											</div>
										{:else if pState.status === 'dismissed' || pState.status === 'undone'}
											<p class="text-surface-300 m-0 text-xs">{pState.message}</p>
										{:else}
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 rounded-none px-3 py-2 text-xs font-black tracking-wider uppercase transition"
													onclick={() => handleApplyProposal(entry.id, entry.proposal)}
												>
													Use this draft
												</button>
												<button
													type="button"
													class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 rounded-none border-2 px-3 py-2 text-xs font-bold uppercase transition"
													onclick={() => dismissProposal(entry.id)}
												>
													Keep current
												</button>
											</div>
										{/if}
									{:else if entry.proposal.kind === 'learn-takeaways'}
										{#if entry.proposal.summary}
											<div class="border-surface-800 space-y-2 border-b pb-3">
												<div class="flex flex-wrap items-center justify-between gap-2">
													<p
														class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.2em] uppercase"
													>
														Summary suggestion
													</p>
													{#if pState.summaryStatus === 'applied'}
														<button
															type="button"
															class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1 rounded-none border-2 px-2.5 py-1 text-[11px] font-black uppercase transition"
															onclick={() => handleUndoActiveSummary(entry.id)}
														>
															<IconUndo2 class="h-3 w-3" />
															Undo summary
														</button>
													{:else}
														<button
															type="button"
															class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 rounded-none px-2.5 py-1 text-[11px] font-black uppercase transition"
															onclick={() => handleApplySummary(entry.id, entry.proposal)}
														>
															Use summary
														</button>
													{/if}
												</div>
												<p class="text-surface-50 m-0 text-xs leading-relaxed">
													{entry.proposal.summary}
												</p>
												{#if pState.summaryStatus === 'conflict'}
													<p
														class="bg-warning-500 text-surface-950 m-0 px-2.5 py-1.5 text-xs font-bold"
														role="alert"
													>
														{pState.summaryMessage}
													</p>
												{/if}
											</div>
										{/if}
										<p
											class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.2em] uppercase"
										>
											Takeaway preview
										</p>
										<ul class="text-surface-50 m-0 list-disc space-y-1 pl-4 text-xs">
											{#each entry.proposal.takeaways as takeaway}
												<li>{takeaway}</li>
											{/each}
										</ul>
									{:else if entry.proposal.kind === 'ride-draft' || entry.proposal.kind === 'group-site-draft'}
										<p
											class="text-primary-500 m-0 text-[10px] font-bold tracking-[0.2em] uppercase"
										>
											{entry.proposal.kind === 'ride-draft'
												? 'Proposed ride updates'
												: 'Proposed website updates'}
										</p>
										{#if entry.proposal.summary?.length}
											<ul class="text-surface-50 m-0 list-none space-y-1.5 p-0 text-xs">
												{#each entry.proposal.summary as item}
													<li class="flex items-start gap-2">
														<IconCheck class="text-primary-500 mt-0.5 h-3.5 w-3.5 shrink-0" />
														<span>{item}</span>
													</li>
												{/each}
											</ul>
										{/if}
										{#if pState.status === 'conflict'}
											<p
												class="bg-warning-500 text-surface-950 m-0 px-3 py-2 text-xs font-bold"
												role="alert"
											>
												{pState.message}
											</p>
										{:else if pState.status === 'applied'}
											<div class="flex flex-wrap items-center justify-between gap-2">
												<span class="text-primary-500 text-xs font-bold">
													{entry.proposal.kind === 'ride-draft'
														? 'Applied to ride form'
														: 'Applied to website draft'}
												</span>
												<button
													type="button"
													class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 rounded-none border-2 px-3 py-1.5 text-xs font-black uppercase transition"
													onclick={() => handleUndoActiveDraft(entry.id)}
												>
													<IconUndo2 class="h-3.5 w-3.5" />
													Undo
												</button>
											</div>
										{:else if pState.status === 'dismissed' || pState.status === 'undone'}
											<p class="text-surface-300 m-0 text-xs">{pState.message}</p>
										{:else}
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 rounded-none px-3 py-2 text-xs font-black tracking-wider uppercase transition"
													onclick={() => handleApplyProposal(entry.id, entry.proposal)}
												>
													{entry.proposal.kind === 'ride-draft'
														? 'Apply to ride form'
														: 'Apply to website'}
												</button>
												<button
													type="button"
													class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 rounded-none border-2 px-3 py-2 text-xs font-bold uppercase transition"
													onclick={() => dismissProposal(entry.id)}
												>
													{entry.proposal.kind === 'ride-draft'
														? 'Keep current form'
														: 'Keep current site'}
												</button>
											</div>
										{/if}
									{/if}
								</div>
							{/if}

							{#if entry.recommendations?.length}
								<div class="border-surface-800 mt-3 border-t-2">
									{#each entry.recommendations as rec, recIdx}
										<div class="border-surface-800 border-b py-2.5">
											<a
												href={rec.url}
												class="group text-surface-50 hover:bg-primary-500 hover:text-surface-950 block p-2 transition hover:no-underline"
												onclick={() => handleRecommendationClick(entry, rec)}
											>
												<div class="flex items-start gap-2.5">
													<span
														class="text-tertiary-500 group-hover:text-secondary-500 shrink-0 text-sm font-black italic tabular-nums"
													>
														{formatIndexNumeral(recIdx)}
													</span>
													<div class="min-w-0 flex-1">
														<div
															class="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase opacity-75"
														>
															<IconSparkles class="h-3 w-3" />
															{rec.type}
														</div>
														<p class="m-0 text-sm leading-snug font-black uppercase">
															{rec.title}
														</p>
														{#if rec.subtitle}
															<p class="m-0 text-xs opacity-75">{rec.subtitle}</p>
														{/if}
														{#if rec.reason}
															<p class="m-0 mt-1 text-xs opacity-85">{rec.reason}</p>
														{/if}
													</div>
													<IconArrowRight
														class="mt-1 h-4 w-4 shrink-0 transition motion-safe:group-hover:translate-x-1"
													/>
												</div>
											</a>
											{#if isArticleRecommendation(rec)}
												<div class="mt-1.5 flex flex-wrap items-center gap-2 px-2">
													<button
														type="button"
														class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 min-h-9 rounded-none border-2 px-3 py-1 text-[11px] font-black uppercase transition"
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
														class="border-surface-500 bg-surface-900 text-surface-300 hover:border-warning-500 hover:bg-warning-500 hover:text-surface-950 min-h-9 rounded-none border-2 px-3 py-1 text-[11px] font-bold uppercase transition"
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
							class="border-surface-800 border-l-primary-500 bg-surface-950 text-surface-50 w-[94%] rounded-none border-2 border-l-4 p-3"
						>
							<div class="text-surface-300 flex items-center gap-2 text-sm">
								<IconLoader class="text-primary-500 h-4 w-4 motion-safe:animate-spin" />
								<span>
									{activeLearnAction === 'takeaways'
										? 'Preparing takeaway preview…'
										: activeMode === 'safety-report'
											? 'Reading the review & sources…'
											: isAuthoringMode
												? 'Preparing draft preview…'
												: 'Searching 3 Feet Please…'}
								</span>
							</div>
						</div>
					</div>
				{/if}
			</div>

			{#if statusBanner}
				<div
					class="shrink-0 px-4 py-2 text-xs font-bold {statusBanner.tone === 'warning'
						? 'bg-warning-500 text-surface-950'
						: 'bg-success-500 text-surface-950'}"
					role="status"
				>
					{statusBanner.text}
				</div>
			{/if}

			{#if error}
				<div
					class="bg-error-500 text-surface-950 shrink-0 px-4 py-2 text-xs font-bold"
					role="alert"
				>
					{error}
				</div>
			{/if}

			{#if starterPrompts.length}
				<div
					class="border-surface-800 bg-surface-950 flex shrink-0 gap-1.5 overflow-x-auto border-t px-3 py-2"
					aria-label="Starter prompts"
				>
					{#each starterPrompts as promptItem}
						<button
							type="button"
							class="border-surface-500 bg-surface-900 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 shrink-0 rounded-none border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50"
							disabled={sending}
							onclick={() => submitStarterPrompt(promptItem)}
						>
							{promptItem}
						</button>
					{/each}
				</div>
			{/if}

			{#if activeMode === 'learn-write'}
				<div
					class="border-surface-800 bg-surface-950 flex shrink-0 flex-wrap gap-1.5 border-t px-3 pt-2"
				>
					<button
						type="button"
						class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 rounded-none border px-2.5 py-1 text-[11px] font-black tracking-wide uppercase transition disabled:opacity-50"
						disabled={sending}
						onclick={() => triggerLearnStudioAction('write')}
					>
						Suggest draft
					</button>
					<button
						type="button"
						class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 rounded-none border px-2.5 py-1 text-[11px] font-black tracking-wide uppercase transition disabled:opacity-50"
						disabled={sending}
						onclick={() => triggerLearnStudioAction('takeaways')}
					>
						Preview takeaways
					</button>
					{#if pageConfig?.canAskSavedArticle}
						<button
							type="button"
							class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 rounded-none border px-2.5 py-1 text-[11px] font-black tracking-wide uppercase transition disabled:opacity-50"
							disabled={sending}
							onclick={() => triggerLearnStudioAction('ask')}
						>
							Ask saved article
						</button>
					{/if}
				</div>
			{/if}

			<form
				class="border-surface-800 bg-surface-950 shrink-0 border-t-2 p-3"
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
						placeholder={activeModeMeta?.placeholder ||
							'Ask for rides, groups, volunteer events, articles, or posting help'}
						maxlength={maxInputLength}
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 w-full resize-none rounded-none border-2 p-2.5 text-sm focus:ring-0 focus:outline-none pointer-coarse:min-h-11"
						disabled={sending}
						aria-label={`Message to 3FP Assistant (${activeModeMeta?.tabLabel || 'AI'})`}
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
		class="group border-primary-500 bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-none border-2 px-3 py-2 font-black tracking-[0.16em] uppercase transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11"
		onclick={toggleAssistant}
		aria-label={isOpen
			? 'Close 3FP assistant'
			: `Open 3FP assistant (${activeModeMeta?.tabLabel || 'AI'})`}
	>
		{#if isOpen}
			<IconX class="h-4 w-4" />
		{:else}
			<IconSparkles class="text-primary-500 group-hover:text-surface-950 h-3.5 w-3.5 shrink-0" />
			<span class="text-xs font-black tracking-[0.16em] uppercase">
				{activeModeMeta?.buttonBadge || 'AI'}
			</span>
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
