import { getContext, setContext, untrack } from 'svelte';
import { getContextualModeDefaults } from '#lib/ai/assistantHelpers.js';

const ASSISTANT_CONTEXT_KEY = Symbol('3fp-assistant-context');

function createAssistantStore() {
	let pathname = $state('/');
	let registrations = $state([]);
	let modePreference = $state('page');
	let requestedOpen = $state(false);
	let pendingRequest = $state(null);
	let requestSeq = 0;
	let lastRouteSignature = '';

	const pageConfig = $derived.by(() => {
		const active = registrations.at(-1);
		if (!active || typeof active.getConfig !== 'function') return null;
		const config = active.getConfig();
		if (!config || typeof config !== 'object' || !config.mode || config.mode === 'discover') {
			return null;
		}
		return config;
	});

	const hasPageMode = $derived(Boolean(pageConfig?.mode));

	const activeMode = $derived(
		hasPageMode && modePreference !== 'discover' ? pageConfig.mode : 'discover'
	);

	const pageModeMeta = $derived.by(() => {
		if (!pageConfig?.mode) return null;
		const defaults = getContextualModeDefaults(pageConfig.mode, {
			pathname,
			categoryName: pageConfig.categoryName,
			articleTitle: pageConfig.articleTitle,
			topic: pageConfig.topic,
			canAskSavedArticle: pageConfig.canAskSavedArticle
		});
		return {
			...defaults,
			...(pageConfig.tabLabel ? { tabLabel: pageConfig.tabLabel } : {}),
			...(pageConfig.buttonBadge ? { buttonBadge: pageConfig.buttonBadge } : {}),
			...(pageConfig.subtitle ? { subtitle: pageConfig.subtitle } : {}),
			...(pageConfig.placeholder ? { placeholder: pageConfig.placeholder } : {}),
			...(Array.isArray(pageConfig.starterPrompts) && pageConfig.starterPrompts.length
				? { starterPrompts: pageConfig.starterPrompts }
				: {})
		};
	});

	const discoveryModeMeta = $derived(getContextualModeDefaults('discover', { pathname }));

	const activeModeMeta = $derived(
		activeMode !== 'discover' && pageModeMeta ? pageModeMeta : discoveryModeMeta
	);

	function register(getConfig) {
		const token = Symbol('assistant-route-registration');
		untrack(() => {
			registrations = [...registrations, { token, getConfig }];
			modePreference = 'page';
		});
		return () => {
			untrack(() => {
				registrations = registrations.filter((entry) => entry.token !== token);
			});
		};
	}

	function setPathname(nextPathname) {
		const normalized = String(nextPathname || '/').trim() || '/';
		untrack(() => {
			if (normalized === pathname) return;
			pathname = normalized;
			if (normalized !== lastRouteSignature) {
				lastRouteSignature = normalized;
				modePreference = 'page';
			}
		});
	}

	function selectMode(preference) {
		untrack(() => {
			modePreference = preference === 'discover' ? 'discover' : 'page';
		});
	}

	function open(options = {}) {
		untrack(() => {
			const targetPreference = options.mode === 'discover' ? 'discover' : 'page';
			modePreference = targetPreference;
			requestedOpen = true;
			pendingRequest = {
				id: ++requestSeq,
				mode: targetPreference,
				prompt: typeof options.prompt === 'string' ? options.prompt : '',
				submit: Boolean(options.submit),
				learnAction: typeof options.learnAction === 'string' ? options.learnAction : '',
				topic: typeof options.topic === 'string' ? options.topic : '',
				triggerEl: options.triggerEl ?? null
			};
		});
	}

	function consumePendingRequest(id) {
		untrack(() => {
			if (pendingRequest?.id === id) {
				pendingRequest = null;
			}
		});
	}

	function markClosed() {
		untrack(() => {
			requestedOpen = false;
		});
	}

	return {
		get pathname() {
			return pathname;
		},
		get pageConfig() {
			return pageConfig;
		},
		get hasPageMode() {
			return hasPageMode;
		},
		get activeMode() {
			return activeMode;
		},
		get modePreference() {
			return modePreference;
		},
		get pageModeMeta() {
			return pageModeMeta;
		},
		get discoveryModeMeta() {
			return discoveryModeMeta;
		},
		get activeModeMeta() {
			return activeModeMeta;
		},
		get requestedOpen() {
			return requestedOpen;
		},
		get pendingRequest() {
			return pendingRequest;
		},
		register,
		setPathname,
		selectMode,
		open,
		consumePendingRequest,
		markClosed
	};
}

const FALLBACK_STORE = {
	pathname: '/',
	pageConfig: null,
	hasPageMode: false,
	activeMode: 'discover',
	modePreference: 'page',
	pageModeMeta: null,
	discoveryModeMeta: getContextualModeDefaults('discover', { pathname: '/' }),
	activeModeMeta: getContextualModeDefaults('discover', { pathname: '/' }),
	requestedOpen: false,
	pendingRequest: null,
	register: () => () => {},
	setPathname: () => {},
	selectMode: () => {},
	open: () => {},
	consumePendingRequest: () => {},
	markClosed: () => {}
};

export function setAssistantContext() {
	const store = createAssistantStore();
	setContext(ASSISTANT_CONTEXT_KEY, store);
	return store;
}

export function getAssistantContext() {
	return getContext(ASSISTANT_CONTEXT_KEY) ?? FALLBACK_STORE;
}
