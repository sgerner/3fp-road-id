<script>
	import { onMount, tick } from 'svelte';
	import {
		GROUP_SITE_BACKGROUND_STYLES,
		GROUP_SITE_FONT_PAIRING_OPTIONS,
		GROUP_SITE_HERO_STYLES,
		GROUP_SITE_PANEL_DENSITIES,
		GROUP_SITE_PANEL_STYLES,
		GROUP_SITE_PANEL_TONES,
		GROUP_SITE_RIDE_WIDGET_HOST_SCOPES,
		GROUP_SITE_SECTION_KEYS,
		GROUP_SITE_THEME_MODES,
		GROUP_SITE_THEME_OPTIONS
	} from '$lib/microsites/config';
	import { buildRideWidgetSearchParams, normalizeRideWidgetConfig } from '$lib/rides/widgetConfig';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconPalette from '@lucide/svelte/icons/palette';
	import IconRefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconSmartphone from '@lucide/svelte/icons/smartphone';
	import IconSendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';

	let { data, form } = $props();
	const EMPTY_SECTIONS = {
		story: true,
		join: true,
		rides: true,
		volunteer: true,
		news: true,
		gallery: true,
		contact: true
	};
	const EMPTY_THEME_COLORS = {
		primary: '#F59E0B',
		secondary: '#0EA5E9',
		accent: '#FB7185',
		surface: '#111827'
	};
	let siteConfig = $state({
		...structuredClone(data.siteConfig || {}),
		theme_colors: {
			...EMPTY_THEME_COLORS,
			...structuredClone(data.siteConfig?.theme_colors || {})
		},
		sections: {
			...EMPTY_SECTIONS,
			...structuredClone(data.siteConfig?.sections || {})
		}
	});

	let themeMode = $state('derived');
	let showAdvanced = $state(false);
	let sponsorItems = $state([]);
	let sponsorItemsInitialized = $state(false);
	let faqItems = $state([]);
	let faqItemsInitialized = $state(false);
	let previewMode = $state('desktop');
	let slugInput = $state('');
	let slugInputInitialized = $state(false);
	let showRideWidgetBuilder = $state(false);
	let rideWidgetEnabled = $state(false);
	let rideWidgetTitle = $state('Ride calendar');
	let rideWidgetHostScope = $state('group_only');
	let selectedRideWidgetGroupIds = $state([]);
	let groupSearch = $state('');
	let rideWidgetFilterMode = $state('location');
	let rideWidgetLocation = $state('');
	let rideWidgetNear = $state('');
	let rideWidgetRadiusMiles = $state('');
	let rideWidgetDefaultTab = $state('list');
	let rideWidgetTheme = $state('auto');
	let rideWidgetDensity = $state('comfortable');
	let rideWidgetShowUserFilters = $state(true);
	let rideWidgetShowAddButton = $state(true);
	let rideWidgetPrefixCity = $state(false);
	let rideWidgetDifficultyColors = $state(true);
	let slugAvailability = $state({
		state: 'idle',
		label: 'Current',
		message: 'This is your current microsite slug.'
	});
	const AI_DRAFT_STARTER_MESSAGE =
		'I can update your site copy, visual style, and section layout. What first impression do you want visitors to get?';
	let draftChatMessages = $state([
		{
			id: 'ai-draft-starter',
			role: 'assistant',
			content: AI_DRAFT_STARTER_MESSAGE
		}
	]);
	let draftChatInput = $state('');
	let draftChatSending = $state(false);
	let draftChatError = $state('');
	let draftChatBodyEl = $state(null);
	let draftChatInputEl = $state(null);
	let applyingDraft = $state(false);
	let pendingDraft = $state(null);
	let localGeneratedNotice = $state('');
	let previewVersion = $state(0);
	let showDomainManager = $state(false);
	let customDomains = $state([]);
	let domainOrders = $state([]);
	let domainsLoading = $state(false);
	let domainMessage = $state('');
	let domainError = $state('');
	let existingDomainInput = $state('');
	let verifyingDomain = $state('');
	let domainSearchQuery = $state('');
	let domainSearchBusy = $state(false);
	let domainSearchResults = $state([]);
	let checkoutBusyDomain = $state('');
	let billingBusyDomain = $state('');
	let renewalBusyDomain = $state('');
	let registrarContact = $state({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		address1: '',
		address2: '',
		city: '',
		state: '',
		zip: '',
		country: 'US',
		companyName: ''
	});
	const themeLabels = {
		derived: 'Derived from branding',
		repo: 'Repo theme',
		custom: 'Custom colors'
	};
	const sectionLabels = {
		story: 'Story',
		join: 'Join',
		rides: 'Rides',
		volunteer: 'Volunteer',
		news: 'Updates',
		gallery: 'Gallery',
		contact: 'Contact'
	};
	const heroLabels = {
		immersive: 'Immersive (Cinematic image with overlay)',
		bold: 'Bold (Typography-forward editorial with dramatic scale)',
		orbit: 'Orbit (Floating glass card with depth and motion)'
	};
	const backgroundLabels = {
		cinematic: 'Cinematic (Animated color orbs)',
		aurora: 'Aurora (Flowing northern lights effect)',
		prism: 'Prism (Geometric shard lighting)',
		void: 'Void (Deep space with subtle nebula)'
	};
	const panelStyleLabels = {
		glass: 'Glass (Translucent, blurred)',
		filled: 'Filled (Solid tinted panels)',
		outlined: 'Outlined (Low-fill with stronger borders)'
	};
	const panelToneLabels = {
		surface: 'Surface',
		primary: 'Primary',
		secondary: 'Secondary',
		tertiary: 'Tertiary'
	};
	const panelDensityLabels = {
		compact: 'Compact',
		comfortable: 'Comfortable',
		airy: 'Airy'
	};
	const rideWidgetHostScopeLabels = {
		all: 'All published rides',
		group_only: 'Only rides hosted by us',
		selected_groups: 'Only selected groups'
	};
	$effect(() => {
		themeMode = siteConfig.theme_mode || 'derived';
		const groupCityDefault = String(data.group?.city || '').trim();
		const groupCityStateDefault = [data.group?.city, data.group?.state_region]
			.filter(Boolean)
			.join(', ')
			.trim();
		const radiusCenterDefault = groupCityStateDefault || groupCityDefault;
		if (!sponsorItemsInitialized) {
			const fromItems = Array.isArray(siteConfig.sponsor_items)
				? siteConfig.sponsor_items
				: [];
			const fromLinks = Array.isArray(siteConfig.sponsor_links)
				? siteConfig.sponsor_links.map((url) => ({ name: '', text: '', logo: '', url }))
				: [];
			const seed = (fromItems.length ? fromItems : fromLinks)
				.map((item) => ({
					name: String(item?.name || '').trim(),
					text: String(item?.text || '').trim(),
					logo: String(item?.logo || '').trim(),
					url: String(item?.url || '').trim()
				}))
				.filter((item) => item.name || item.text || item.logo || item.url);
			sponsorItems = seed;
			sponsorItemsInitialized = true;
		}
		if (!faqItemsInitialized) {
			faqItems = [
				{
					question: String(siteConfig.faq_1_q || '').trim(),
					answer: String(siteConfig.faq_1_a || '').trim()
				},
				{
					question: String(siteConfig.faq_2_q || '').trim(),
					answer: String(siteConfig.faq_2_a || '').trim()
				}
			].filter((item) => item.question || item.answer);
			faqItemsInitialized = true;
		}
		if (!slugInputInitialized) {
			slugInput = data.micrositeSlug || '';
			slugInputInitialized = true;
		}
		if (!showRideWidgetBuilder) {
			rideWidgetEnabled = Boolean(siteConfig.ride_widget_enabled);
			rideWidgetTitle = siteConfig.ride_widget_title || 'Ride calendar';
			rideWidgetHostScope = siteConfig.ride_widget_host_scope || 'group_only';
			selectedRideWidgetGroupIds = Array.isArray(siteConfig.ride_widget_group_ids)
				? siteConfig.ride_widget_group_ids
				: [];
			const widget = siteConfig.ride_widget_config || {};
			rideWidgetLocation =
				widget.location ||
				[widget.city, widget.state].filter(Boolean).join(' ') ||
				groupCityDefault;
			rideWidgetNear = widget.near || radiusCenterDefault;
			rideWidgetRadiusMiles = widget.radiusMiles || '50';
			rideWidgetDefaultTab = widget.defaultTab || 'list';
			rideWidgetTheme = widget.theme || 'auto';
			rideWidgetDensity = widget.density || 'comfortable';
			rideWidgetShowUserFilters = widget.showUserFilters ?? true;
			rideWidgetShowAddButton = widget.showAddButton ?? true;
			rideWidgetPrefixCity = widget.prefixCity ?? false;
			rideWidgetDifficultyColors = widget.difficultyColors ?? true;
			rideWidgetFilterMode =
				widget.near || widget.radiusMiles ? 'radius' : widget.location ? 'location' : 'none';
		}
	});

	const selectedGroups = $derived(
		(data.availableGroups || []).filter((group) => selectedRideWidgetGroupIds.includes(group.id))
	);
	const groupSuggestions = $derived.by(() => {
		if (rideWidgetHostScope !== 'selected_groups') return [];
		const query = groupSearch.trim().toLowerCase();
		if (!query) return [];
		return (data.availableGroups || [])
			.filter((group) => !selectedRideWidgetGroupIds.includes(group.id))
			.filter((group) =>
				[group.name, group.slug, group.city, group.state_region]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
					.includes(query)
			)
			.slice(0, 8);
	});
	const widgetPreviewPath = $derived.by(() => {
		const previewOrganizationSlug = rideWidgetHostScope === 'group_only' ? data.group.slug : '';
		const normalized = normalizeRideWidgetConfig({
			organizationSlug: previewOrganizationSlug,
			location: rideWidgetFilterMode === 'location' ? rideWidgetLocation : '',
			near: rideWidgetFilterMode === 'radius' ? rideWidgetNear : '',
			radiusMiles: rideWidgetFilterMode === 'radius' ? rideWidgetRadiusMiles : '',
			defaultTab: rideWidgetDefaultTab,
			theme: rideWidgetTheme,
			density: rideWidgetDensity,
			showUserFilters: rideWidgetShowUserFilters,
			showAddButton: rideWidgetShowAddButton,
			prefixCity: rideWidgetPrefixCity,
			difficultyColors: rideWidgetDifficultyColors
		});
		const params = buildRideWidgetSearchParams(normalized);
		params.set('host_scope', rideWidgetHostScope);
		if (rideWidgetHostScope === 'selected_groups' && selectedRideWidgetGroupIds.length) {
			params.set('group_ids', selectedRideWidgetGroupIds.join(','));
		}
		const query = params.toString();
		return query ? `/ride/widget/frame?${query}` : '/ride/widget/frame';
	});
	const sitePreviewPath = $derived.by(() => {
		const base = data.previewPath || '/';
		const joiner = base.includes('?') ? '&' : '?';
		return `${base}${joiner}v=${previewVersion}`;
	});

	function normalizeMicrositeSlugInput(value) {
		return String(value || '')
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]/g, '');
	}

	function onSlugInput(event) {
		slugInput = normalizeMicrositeSlugInput(event.currentTarget.value);
	}

	const slugPreview = $derived(normalizeMicrositeSlugInput(slugInput));
	const slugDomainPreview = $derived(
		`https://${slugPreview || 'yourgroup'}${data.micrositeDomainSuffix || '.3fp.bike'}`
	);

	$effect(() => {
		const slug = slugPreview;
		if (!slug) {
			slugAvailability = {
				state: 'error',
				label: 'Required',
				message: 'Enter a slug using letters and numbers.'
			};
			return;
		}

		if (slug === data.micrositeSlug) {
			slugAvailability = {
				state: 'available',
				label: 'Current',
				message: 'This is your current microsite slug.'
			};
			return;
		}

		slugAvailability = {
			state: 'checking',
			label: 'Checking',
			message: 'Checking availability…'
		};

		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(
					`/api/groups/check-microsite-slug?slug=${encodeURIComponent(slug)}&current_group_id=${encodeURIComponent(data.group.id)}`,
					{
						signal: controller.signal
					}
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					slugAvailability = {
						state: 'error',
						label: 'Error',
						message: 'Unable to verify slug availability right now.'
					};
					return;
				}
				if (payload?.available) {
					const isCurrent = payload?.reason === 'current';
					slugAvailability = {
						state: 'available',
						label: isCurrent ? 'Current' : 'Available',
						message: isCurrent
							? 'This is your current microsite slug.'
							: 'Slug is available. Save website to claim it.'
					};
					return;
				}
				if (payload?.reason === 'reserved') {
					slugAvailability = {
						state: 'taken',
						label: 'Reserved',
						message: 'That slug is reserved by the app. Try another one.'
					};
					return;
				}
				slugAvailability = {
					state: 'taken',
					label: 'Taken',
					message: 'That slug is already taken. Try another one.'
				};
			} catch (error) {
				if (error?.name === 'AbortError') return;
				slugAvailability = {
					state: 'error',
					label: 'Error',
					message: 'Unable to verify slug availability right now.'
				};
			}
		}, 250);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function addSponsor() {
		sponsorItems = [...sponsorItems, { name: '', text: '', logo: '', url: '' }];
	}

	function removeSponsor(index) {
		sponsorItems = sponsorItems.filter((_, idx) => idx !== index);
	}

	function updateSponsor(index, key, value) {
		sponsorItems = sponsorItems.map((item, idx) =>
			idx === index ? { ...item, [key]: String(value || '') } : item
		);
	}

	function addFaq() {
		if (faqItems.length >= 2) return;
		faqItems = [...faqItems, { question: '', answer: '' }];
	}

	function removeFaq(index) {
		faqItems = faqItems.filter((_, idx) => idx !== index);
	}

	function updateFaq(index, key, value) {
		faqItems = faqItems.map((item, idx) =>
			idx === index ? { ...item, [key]: String(value || '') } : item
		);
	}

	function addRideWidgetGroup(id) {
		if (!id) return;
		if (selectedRideWidgetGroupIds.includes(id)) return;
		selectedRideWidgetGroupIds = [...selectedRideWidgetGroupIds, id];
		groupSearch = '';
	}

	function removeRideWidgetGroup(id) {
		selectedRideWidgetGroupIds = selectedRideWidgetGroupIds.filter((value) => value !== id);
	}

	function createDraftMessageId(prefix = 'draft') {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `${prefix}-${crypto.randomUUID()}`;
		}
		return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	async function scrollDraftChatToBottom() {
		await tick();
		if (!draftChatBodyEl) return;
		draftChatBodyEl.scrollTo({ top: draftChatBodyEl.scrollHeight, behavior: 'smooth' });
	}

	function resizeDraftChatInput() {
		if (!draftChatInputEl) return;
		draftChatInputEl.style.height = 'auto';
		const nextHeight = Math.max(38, Math.min(draftChatInputEl.scrollHeight, 180));
		draftChatInputEl.style.height = `${nextHeight}px`;
	}

	function resetDraftChat() {
		draftChatMessages = [
			{
				id: 'ai-draft-starter',
				role: 'assistant',
				content: AI_DRAFT_STARTER_MESSAGE
			}
		];
		draftChatInput = '';
		draftChatError = '';
		pendingDraft = null;
		resizeDraftChatInput();
	}

	const canSendDraftMessage = $derived(!draftChatSending && draftChatInput.trim().length > 0);

	function handleDraftInputKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendDraftMessage();
		}
	}

	async function sendDraftMessage() {
		if (!canSendDraftMessage) return;
		const message = draftChatInput.trim();
		draftChatInput = '';
		draftChatError = '';
		draftChatSending = true;

		const nextMessages = [
			...draftChatMessages,
			{
				id: createDraftMessageId('user'),
				role: 'user',
				content: message
			}
		];
		draftChatMessages = nextMessages;
		await scrollDraftChatToBottom();

		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/site/ai-draft-chat`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messages: nextMessages.map((entry) => ({
							role: entry.role,
							content: entry.content
						}))
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to reach the AI draft assistant right now.');
			}

			const assistantReply =
				String(payload?.reply || '').trim() ||
				'I can keep refining this direction. Tell me anything you want to emphasize.';
			draftChatMessages = [
				...nextMessages,
				{
					id: createDraftMessageId('assistant'),
					role: 'assistant',
					content: assistantReply
				}
			];
			await scrollDraftChatToBottom();

			if (payload?.generated && payload?.config) {
				const summary = Array.isArray(payload?.summary)
					? payload.summary.map((item) => String(item || '').trim()).filter(Boolean)
					: [];
				pendingDraft = {
					config: payload.config,
					source: String(payload?.source || 'ai'),
					generationPrompt: String(payload?.generationPrompt || '').trim(),
					summary
				};
			}
		} catch (error) {
			draftChatError = error?.message || 'Unable to reach the AI draft assistant right now.';
			draftChatMessages = [
				...nextMessages,
				{
					id: createDraftMessageId('assistant'),
					role: 'assistant',
					content:
						'I hit a temporary issue. Try again, or tell me the tone, audience, and must-have sections so I can proceed.'
				}
			];
			await scrollDraftChatToBottom();
		} finally {
			draftChatSending = false;
			resizeDraftChatInput();
		}
	}

	async function applyPendingDraft() {
		if (!pendingDraft?.config || applyingDraft) return;
		draftChatError = '';
		applyingDraft = true;
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/site/ai-draft-apply`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						config: pendingDraft.config,
						source: pendingDraft.source,
						generationPrompt: pendingDraft.generationPrompt
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to apply this draft right now.');
			}

			siteConfig = structuredClone(payload?.config || pendingDraft.config);
			sponsorItemsInitialized = false;
			faqItemsInitialized = false;
			showRideWidgetBuilder = false;
			localGeneratedNotice =
				payload?.source === 'ai'
					? 'AI draft applied to the microsite.'
					: 'AI fallback draft applied. Review and refine before publishing changes.';
			pendingDraft = null;
			previewVersion += 1;
		} catch (error) {
			draftChatError = error?.message || 'Unable to apply this draft right now.';
		} finally {
			applyingDraft = false;
		}
	}

	onMount(() => {
		resizeDraftChatInput();
		void loadDomainData();
	});

	$effect(() => {
		draftChatInput;
		resizeDraftChatInput();
	});

	async function loadDomainData() {
		domainsLoading = true;
		try {
			const response = await fetch(`/api/groups/${encodeURIComponent(data.group.slug)}/domains`);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to load domain manager.');
			}
			customDomains = Array.isArray(payload?.data?.domains) ? payload.data.domains : [];
			domainOrders = Array.isArray(payload?.data?.orders) ? payload.data.orders : [];
		} catch (error) {
			domainError = error?.message || 'Unable to load domain manager.';
		} finally {
			domainsLoading = false;
		}
	}

	async function attachExistingDomain() {
		domainError = '';
		domainMessage = '';
		if (!existingDomainInput.trim()) {
			domainError = 'Enter a domain to attach.';
			return;
		}
		domainsLoading = true;
		try {
			const response = await fetch(`/api/groups/${encodeURIComponent(data.group.slug)}/domains`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain: existingDomainInput })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to attach domain.');
			}
			existingDomainInput = '';
			const records = Array.isArray(payload?.data?.instructions?.records)
				? payload.data.instructions.records
				: [];
			domainMessage = records.length
				? `Domain added. Add ${records[0].type} record ${records[0].name} => ${records[0].value}.`
				: payload?.data?.instructions?.title || 'Domain added.';
			await loadDomainData();
		} catch (error) {
			domainError = error?.message || 'Unable to attach domain.';
		} finally {
			domainsLoading = false;
		}
	}

	async function verifyDomain(domain) {
		if (!domain) return;
		domainError = '';
		domainMessage = '';
		verifyingDomain = domain;
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/domains/${encodeURIComponent(domain)}/verify`,
				{
					method: 'POST'
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to verify domain.');
			}
			domainMessage = payload?.data?.domain?.vercel_verified
				? `${domain} is now verified and active.`
				: `${domain} is not verified yet. Recheck after DNS propagates.`;
			await loadDomainData();
		} catch (error) {
			domainError = error?.message || 'Unable to verify domain.';
		} finally {
			verifyingDomain = '';
		}
	}

	async function searchDomains() {
		domainError = '';
		domainMessage = '';
		domainSearchBusy = true;
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/domains/search`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query: domainSearchQuery })
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to search domains.');
			}
			domainSearchResults = Array.isArray(payload?.data?.results) ? payload.data.results : [];
			if (!domainSearchResults.length) {
				domainMessage = 'No available domains found for this search right now.';
			}
		} catch (error) {
			domainError = error?.message || 'Unable to search domains.';
		} finally {
			domainSearchBusy = false;
		}
	}

	async function startDomainCheckout(domain) {
		if (!domain) return;
		domainError = '';
		domainMessage = '';
		checkoutBusyDomain = domain;
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/domains/checkout`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						domain,
						contactInformation: registrarContact
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to start checkout.');
			}
			const checkoutUrl = String(payload?.data?.checkoutUrl || '').trim();
			if (!checkoutUrl) throw new Error('Stripe checkout URL was not returned.');
			window.location.assign(checkoutUrl);
		} catch (error) {
			domainError = error?.message || 'Unable to start checkout.';
		} finally {
			checkoutBusyDomain = '';
		}
	}

	async function toggleAutoRenew(domain, enabled) {
		if (!domain) return;
		renewalBusyDomain = domain;
		domainError = '';
		domainMessage = '';
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/domains/${encodeURIComponent(domain)}/renewal`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ autoRenew: enabled })
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to update auto-renew.');
			}
			domainMessage = enabled
				? `Auto-renew enabled for ${domain}.`
				: `Auto-renew paused for ${domain}.`;
			await loadDomainData();
		} catch (error) {
			domainError = error?.message || 'Unable to update auto-renew.';
		} finally {
			renewalBusyDomain = '';
		}
	}

	async function openBillingPortal(domain) {
		if (!domain) return;
		billingBusyDomain = domain;
		domainError = '';
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/domains/${encodeURIComponent(domain)}/billing-portal`,
				{
					method: 'POST'
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to open billing portal.');
			}
			const billingPortalUrl = String(payload?.data?.billingPortalUrl || '').trim();
			if (!billingPortalUrl) throw new Error('Billing portal URL was not returned.');
			window.location.assign(billingPortalUrl);
		} catch (error) {
			domainError = error?.message || 'Unable to open billing portal.';
		} finally {
			billingBusyDomain = '';
		}
	}

	function formatUsd(cents) {
		const amount = Number(cents);
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'USD'
		}).format((Number.isFinite(amount) ? amount : 0) / 100);
	}
</script>

<div class="space-y-6 pb-10">
	<section class="grid gap-4 lg:grid-cols-[0.75fr,1.25fr]">
		<div class="manage-card rounded-3xl p-5">
			<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">Microsite</p>
			<h1 class="mt-3 text-3xl font-black tracking-tight text-white">Website builder</h1>
			<p class="mt-3 text-sm leading-7 text-white/70">
				Every group now has a default microsite at its subdomain. Use this page to tune the layout,
				theme, sections, and copy.
			</p>
			<div class="mt-5 grid gap-3">
				<a href={data.liveUrl} target="_blank" rel="noopener noreferrer" class="website-link">
					Live subdomain
					<div class="website-link-value">
						<span>{data.liveUrl}</span>
						<IconExternalLink class="h-4 w-4 flex-shrink-0 opacity-75" />
					</div>
				</a>
			</div>
			<label class="field mt-5">
				<span>Website slug</span>
				<div class="slug-input-wrap">
					<input
						class="input pr-28"
						value={slugInput}
						oninput={onSlugInput}
						pattern="[A-Za-z0-9]+"
						maxlength="40"
						placeholder="letters and numbers only"
					/>
					<span class="slug-status slug-status-{slugAvailability.state}">
						{slugAvailability.label}
					</span>
				</div>
				<div class="slug-meta-row">
					<p class="slug-preview">{slugDomainPreview}</p>
					<p class="slug-message slug-message-{slugAvailability.state}">
						{slugAvailability.message}
					</p>
				</div>
			</label>
			<div class="mt-4">
				<button
					type="button"
					class="btn w-full justify-between preset-tonal-surface"
					onclick={() => (showDomainManager = !showDomainManager)}
					aria-expanded={showDomainManager}
				>
					<span class="inline-flex items-center gap-2">
						<IconGlobe class="h-4 w-4" />
						Domain manager
					</span>
					<span class="inline-flex items-center gap-2 text-xs text-white/65">
						{customDomains.length} active
						<IconChevronDown
							class="h-4 w-4 transition-transform duration-200 {showDomainManager
								? 'rotate-180'
								: ''}"
						/>
					</span>
				</button>
				{#if showDomainManager}
					<div class="domain-panel mt-3 space-y-5 rounded-2xl p-4" transition:slide>
						<div>
							<p class="text-xs font-semibold tracking-[0.2em] text-white/48 uppercase">
								Custom domains
							</p>
							<p class="mt-2 text-sm leading-6 text-white/70">
								Add a domain you already own and we will attach it to this microsite in Vercel.
							</p>
						</div>

						<form
							class="flex gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								void attachExistingDomain();
							}}
						>
							<input
								class="input w-full"
								bind:value={existingDomainInput}
								placeholder="yourdomain.com"
								autocomplete="off"
							/>
							<button class="btn preset-filled-primary-500" disabled={domainsLoading}>Attach</button>
						</form>

						{#if domainMessage}
							<div class="notice rounded-2xl p-3 text-sm">{domainMessage}</div>
						{/if}
						{#if domainError}
							<div class="error-box rounded-2xl p-3 text-sm">{domainError}</div>
						{/if}

						<div class="space-y-3">
							{#if domainsLoading && !customDomains.length}
								<p class="text-sm text-white/70">Loading domains…</p>
							{:else if customDomains.length}
								{#each customDomains as domainRow}
									<div class="domain-row rounded-2xl p-3">
										<div class="flex items-start justify-between gap-3">
											<div>
												<div class="text-sm font-semibold text-white">{domainRow.domain}</div>
												<div class="text-xs text-white/65">
													Status: {domainRow.status}
													{domainRow.vercel_verified
														? ' • verified'
														: ' • needs DNS verification'}
												</div>
											</div>
											<div class="flex flex-wrap gap-2">
												<button
													type="button"
													class="btn btn-xs preset-tonal-surface"
													disabled={verifyingDomain === domainRow.domain}
													onclick={() => void verifyDomain(domainRow.domain)}
												>
													{#if verifyingDomain === domainRow.domain}
														<IconRefreshCw class="h-3.5 w-3.5 animate-spin" /> Verifying
													{:else}
														<IconBadgeCheck class="h-3.5 w-3.5" /> Verify
													{/if}
												</button>
												<button
													type="button"
													class="btn btn-xs preset-tonal-warning"
													disabled={renewalBusyDomain === domainRow.domain}
													onclick={() =>
														void toggleAutoRenew(domainRow.domain, !domainRow.auto_renew)}
												>
													{domainRow.auto_renew ? 'Pause renew' : 'Enable renew'}
												</button>
												<button
													type="button"
													class="btn btn-xs preset-tonal-primary"
													disabled={billingBusyDomain === domainRow.domain}
													onclick={() => void openBillingPortal(domainRow.domain)}
												>
													<IconCreditCard class="h-3.5 w-3.5" /> Card
												</button>
											</div>
										</div>
									</div>
								{/each}
							{:else}
								<p class="text-sm text-white/70">No custom domains added yet.</p>
							{/if}
						</div>

						<div class="domain-divider"></div>

						<div>
							<p class="text-xs font-semibold tracking-[0.2em] text-white/48 uppercase">Find + buy</p>
							<p class="mt-2 text-sm leading-6 text-white/70">
								Search related names and TLDs, then see pricing with 3FP + card fee included.
							</p>
						</div>

						<form
							class="flex gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								void searchDomains();
							}}
						>
							<input
								class="input w-full"
								bind:value={domainSearchQuery}
								placeholder="biketempe"
								autocomplete="off"
							/>
							<button class="btn preset-filled-primary-500" disabled={domainSearchBusy}>
								{domainSearchBusy ? 'Searching…' : 'Search'}
							</button>
						</form>

						<div class="grid gap-3 md:grid-cols-2">
							<label class="field">
								<span>First name</span>
								<input class="input" bind:value={registrarContact.firstName} />
							</label>
							<label class="field">
								<span>Last name</span>
								<input class="input" bind:value={registrarContact.lastName} />
							</label>
							<label class="field">
								<span>Email</span>
								<input class="input" type="email" bind:value={registrarContact.email} />
							</label>
							<label class="field">
								<span>Phone (E.164 preferred)</span>
								<input
									class="input"
									bind:value={registrarContact.phone}
									placeholder="+16025550100"
								/>
							</label>
							<label class="field md:col-span-2">
								<span>Address line 1</span>
								<input class="input" bind:value={registrarContact.address1} />
							</label>
							<label class="field md:col-span-2">
								<span>Address line 2 (optional)</span>
								<input class="input" bind:value={registrarContact.address2} />
							</label>
							<label class="field">
								<span>City</span>
								<input class="input" bind:value={registrarContact.city} />
							</label>
							<label class="field">
								<span>State / Region</span>
								<input class="input" bind:value={registrarContact.state} />
							</label>
							<label class="field">
								<span>Postal code</span>
								<input class="input" bind:value={registrarContact.zip} />
							</label>
							<label class="field">
								<span>Country (2-letter)</span>
								<input class="input" bind:value={registrarContact.country} maxlength="2" />
							</label>
						</div>

						<div class="space-y-3">
							{#if domainSearchResults.length}
								{#each domainSearchResults as row}
									<div class="domain-row rounded-2xl p-3">
										<div class="flex items-start justify-between gap-3">
											<div>
												<div class="text-sm font-semibold text-white">{row.domain}</div>
												<div class="text-xs text-white/65">
													Base {formatUsd(row.pricing.purchase.baseCents)} + fee{' '}
													{formatUsd(row.pricing.purchase.markupCents)} + card{' '}
													{formatUsd(row.pricing.purchase.stripeFeeCents)}
												</div>
												<div class="text-xs text-white/65">
													Estimated annual renewal: {formatUsd(row.pricing.renewal.totalCents)}
												</div>
											</div>
											<div class="text-right">
												<div class="text-sm font-semibold text-white">
													{formatUsd(row.pricing.purchase.totalCents)}
												</div>
												<button
													type="button"
													class="btn btn-xs preset-filled-primary-500 mt-2"
													disabled={checkoutBusyDomain === row.domain}
													onclick={() => void startDomainCheckout(row.domain)}
												>
													{checkoutBusyDomain === row.domain ? 'Starting…' : 'Buy'}
												</button>
											</div>
										</div>
									</div>
								{/each}
							{:else}
								<p class="text-sm text-white/70">No search results yet.</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
			{#if data.saved}
				<div class="notice mt-5 rounded-2xl p-3 text-sm">
					{data.saved === 'palette'
						? 'Palette updated from branding.'
						: 'Microsite settings saved.'}
				</div>
			{/if}
			{#if data.generated}
				<div class="notice mt-3 rounded-2xl p-3 text-sm">
					{data.generated === 'ai'
						? 'AI draft applied to the microsite.'
						: 'AI fallback draft applied. Review and refine before publishing changes.'}
				</div>
			{/if}
			{#if localGeneratedNotice}
				<div class="notice mt-3 rounded-2xl p-3 text-sm">{localGeneratedNotice}</div>
			{/if}
			{#if data.reset}
				<div class="notice mt-3 rounded-2xl p-3 text-sm">
					Microsite reset to the default generated site.
				</div>
			{/if}
			{#if form?.error}
				<div class="error-box mt-3 rounded-2xl p-3 text-sm">{form.error}</div>
			{/if}
		</div>

		<div class="manage-card rounded-3xl p-3 md:p-4">
			<div class="mb-3 flex items-center justify-end gap-2">
				<button
					type="button"
					class="btn btn-xs {previewMode === 'desktop'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					onclick={() => (previewMode = 'desktop')}
				>
					<IconMonitor class="h-3.5 w-3.5" /> Desktop
				</button>
				<button
					type="button"
					class="btn btn-xs {previewMode === 'mobile'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					onclick={() => (previewMode = 'mobile')}
				>
					<IconSmartphone class="h-3.5 w-3.5" /> Mobile
				</button>
			</div>
			<div class="mx-auto {previewMode === 'mobile' ? 'max-w-[420px]' : 'max-w-none'}">
				<iframe
					title="Microsite preview"
					src={sitePreviewPath}
					class="h-[680px] w-full rounded-[1.4rem] border border-white/10 bg-black/30"
				></iframe>
			</div>
		</div>
	</section>

	<section class="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			class="manage-card rounded-3xl p-5 md:p-6"
			id="site-settings-form"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">
						Site settings
					</p>
					<h2 class="mt-2 text-2xl font-black tracking-tight text-white">Design + content</h2>
				</div>
				<button class="btn preset-filled-primary-500">Save website</button>
			</div>

			<div class="mt-6 grid gap-6">
				<input type="hidden" name="simple_mode" value="on" />
				<input type="hidden" name="microsite_slug" value={slugPreview} />

				<div class="grid gap-4 md:grid-cols-2">
					<label class="field">
						<span>Site title</span>
						<input class="input" name="site_title" value={siteConfig.site_title} />
					</label>
					<label class="field">
						<span>Tagline</span>
						<input class="input" name="site_tagline" value={siteConfig.site_tagline} />
					</label>
				</div>

				<label class="field">
					<span>Home intro</span>
					<textarea class="textarea min-h-36" name="home_intro"
						>{siteConfig.home_intro}</textarea
					>
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="field">
						<span>Notice banner (optional)</span>
						<input
							class="input"
							name="microsite_notice"
							maxlength="180"
							value={siteConfig.microsite_notice || ''}
						/>
					</label>
					<label class="field">
						<span>Notice link (optional)</span>
						<input
							class="input"
							name="microsite_notice_href"
							value={siteConfig.microsite_notice_href || ''}
						/>
					</label>
					<label class="field">
						<span>Notice expires at (optional)</span>
						<input
							class="input"
							type="datetime-local"
							name="announcement_expires_at"
							value={siteConfig.announcement_expires_at
								? new Date(siteConfig.announcement_expires_at).toISOString().slice(0, 16)
								: ''}
						/>
					</label>
					<label class="field">
						<span>Meeting instructions</span>
						<input
							class="input"
							name="meeting_instructions"
							maxlength="600"
							value={siteConfig.meeting_instructions || ''}
						/>
					</label>
				</div>

				<label class="field">
					<span>New rider starter note</span>
					<textarea class="textarea min-h-28" name="new_rider_note" maxlength="600"
						>{siteConfig.new_rider_note || ''}</textarea
					>
				</label>

				<div class="grid gap-4">
					<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">
						FAQs (optional)
					</p>
					<input type="hidden" name="faq_1_q" value={faqItems[0]?.question || ''} />
					<input type="hidden" name="faq_1_a" value={faqItems[0]?.answer || ''} />
					<input type="hidden" name="faq_2_q" value={faqItems[1]?.question || ''} />
					<input type="hidden" name="faq_2_a" value={faqItems[1]?.answer || ''} />
					{#if faqItems.length}
						<div class="grid gap-4 md:grid-cols-2">
							{#each faqItems as item, idx}
								<div class="field rounded-2xl border border-white/10 p-3">
									<div class="mb-3 flex items-center justify-between gap-3">
										<span>FAQ {idx + 1}</span>
										<button
											type="button"
											class="btn btn-xs preset-outlined-surface-500"
											onclick={() => removeFaq(idx)}
										>
											Remove
										</button>
									</div>
									<div class="grid gap-3">
										<label class="field">
											<span>Question</span>
											<input
												class="input"
												value={item.question}
												maxlength="120"
												placeholder="What should people know?"
												oninput={(event) => updateFaq(idx, 'question', event.currentTarget.value)}
											/>
										</label>
										<label class="field">
											<span>Answer</span>
											<input
												class="input"
												value={item.answer}
												maxlength="320"
												placeholder="Short, direct answer"
												oninput={(event) => updateFaq(idx, 'answer', event.currentTarget.value)}
											/>
										</label>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<button
						type="button"
						class="btn preset-tonal-primary w-fit"
						onclick={addFaq}
						disabled={faqItems.length >= 2}
					>
						+ Add FAQ
					</button>
				</div>

				<div class="grid gap-4">
					<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">
						Sponsors (optional)
					</p>
					<input type="hidden" name="sponsor_items_json" value={JSON.stringify(sponsorItems)} />
					{#if sponsorItems.length}
						<div class="grid gap-4 md:grid-cols-2">
							{#each sponsorItems as item, idx}
								<div class="field rounded-2xl border border-white/10 p-3">
									<div class="mb-3 flex items-center justify-between gap-3">
										<span>Sponsor {idx + 1}</span>
										<button
											type="button"
											class="btn btn-xs preset-outlined-surface-500"
											onclick={() => removeSponsor(idx)}
										>
											Remove
										</button>
									</div>
									<div class="grid gap-3">
										<label class="field">
											<span>Name</span>
											<input
												class="input"
												value={item.name}
												maxlength="120"
												placeholder="Partner name"
												oninput={(event) => updateSponsor(idx, 'name', event.currentTarget.value)}
											/>
										</label>
										<label class="field">
											<span>Text</span>
											<input
												class="input"
												value={item.text}
												maxlength="220"
												placeholder="Short sponsor blurb"
												oninput={(event) => updateSponsor(idx, 'text', event.currentTarget.value)}
											/>
										</label>
										<label class="field">
											<span>Logo</span>
											<div class="grid gap-2">
												{#if item.logo}
													<div
														class="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2"
													>
														<img
															src={item.logo}
															alt={`${item.name || 'Sponsor'} logo`}
															class="h-10 w-10 rounded-lg bg-white/90 object-contain p-1"
														/>
														<p class="text-xs text-white/60">Current logo uploaded</p>
														<button
															type="button"
															class="btn btn-xs preset-outlined-surface-500 ml-auto"
															onclick={() => updateSponsor(idx, 'logo', '')}
														>
															Remove
														</button>
													</div>
												{/if}
												<input
													class="input"
													type="file"
													name={`sponsor_logo_file_${idx}`}
													accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
												/>
												<p class="text-[11px] text-white/55">
													Upload PNG, JPG, WebP, GIF, or SVG (max 5 MB).
												</p>
											</div>
										</label>
										<label class="field">
											<span>Link URL</span>
											<input
												class="input"
												value={item.url}
												placeholder="https://..."
												oninput={(event) => updateSponsor(idx, 'url', event.currentTarget.value)}
											/>
										</label>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<button type="button" class="btn preset-tonal-primary w-fit" onclick={addSponsor}>
						+ Add sponsor
					</button>
				</div>

				<div class="rounded-2xl border border-white/10 p-4">
					<button
						type="button"
						class="w-full text-left"
						onclick={() => (showRideWidgetBuilder = !showRideWidgetBuilder)}
					>
						<div class="flex items-center justify-between gap-3">
							<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">
								Rides calendar widget
							</p>
							<span class="text-xs text-white/60">{showRideWidgetBuilder ? 'Hide' : 'Show'}</span>
						</div>
					</button>
					{#if showRideWidgetBuilder}
						<div class="mt-4 grid gap-4" transition:slide={{ duration: 180 }}>
							<div class="grid gap-4 md:grid-cols-2">
								<label class="field">
									<span>Widget title</span>
									<input
										class="input"
										name="ride_widget_title"
										maxlength="120"
										bind:value={rideWidgetTitle}
									/>
								</label>
								<label class="field">
									<span>Rides source</span>
									<select
										class="select"
										name="ride_widget_host_scope"
										bind:value={rideWidgetHostScope}
									>
										{#each GROUP_SITE_RIDE_WIDGET_HOST_SCOPES as option}
											<option value={option}>{rideWidgetHostScopeLabels[option]}</option>
										{/each}
									</select>
								</label>
							</div>

							{#if rideWidgetHostScope === 'selected_groups'}
								<div class="grid gap-3">
									<input
										type="hidden"
										name="ride_widget_group_ids"
										value={selectedRideWidgetGroupIds.join(',')}
									/>
									<label class="field relative">
										<span>Selected groups</span>
										<input
											class="input"
											placeholder="Search groups by name..."
											bind:value={groupSearch}
										/>
										{#if groupSuggestions.length}
											<div
												class="absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border border-white/10 bg-black/85 p-1"
											>
												{#each groupSuggestions as group}
													<button
														type="button"
														class="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10"
														onclick={() => addRideWidgetGroup(group.id)}
													>
														<span class="font-semibold">{group.name}</span>
														<span class="ml-2 text-xs text-white/60">({group.slug})</span>
													</button>
												{/each}
											</div>
										{/if}
									</label>
									{#if selectedGroups.length}
										<div class="flex flex-wrap gap-2">
											{#each selectedGroups as group}
												<span class="chip preset-tonal-primary gap-1 text-xs">
													{group.name}
													<button
														type="button"
														class="ml-1 rounded-full px-1 leading-none"
														onclick={() => removeRideWidgetGroup(group.id)}
													>
														x
													</button>
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								<input type="hidden" name="ride_widget_group_ids" value="" />
							{/if}

							<div class="grid gap-3 md:grid-cols-2">
								<label class="field">
									<span>Location filter</span>
									<select
										class="select"
										name="ride_widget_filter_mode"
										bind:value={rideWidgetFilterMode}
									>
										<option value="none">None</option>
										<option value="location">Location Filter</option>
										<option value="radius">Radius Center + Miles</option>
									</select>
								</label>
							</div>
							{#if rideWidgetFilterMode === 'location'}
								<div class="grid gap-4">
									<label class="field">
										<span>Location Filter</span>
										<input
											class="input"
											name="ride_widget_location"
											bind:value={rideWidgetLocation}
											placeholder="City, state, zip, or combination"
										/>
									</label>
								</div>
								<input type="hidden" name="ride_widget_near" value="" />
								<input type="hidden" name="ride_widget_radius_miles" value="" />
							{:else if rideWidgetFilterMode === 'radius'}
								<div class="grid gap-4 md:grid-cols-2">
									<label class="field">
										<span>Radius center</span>
										<input
											class="input"
											name="ride_widget_near"
											bind:value={rideWidgetNear}
											placeholder="85004 or Tempe, AZ"
										/>
									</label>
									<label class="field">
										<span>Radius (miles)</span>
										<input
											class="input"
											type="number"
											min="1"
											max="500"
											step="0.5"
											name="ride_widget_radius_miles"
											bind:value={rideWidgetRadiusMiles}
										/>
									</label>
								</div>
								<input type="hidden" name="ride_widget_location" value="" />
							{:else}
								<input type="hidden" name="ride_widget_location" value="" />
								<input type="hidden" name="ride_widget_near" value="" />
								<input type="hidden" name="ride_widget_radius_miles" value="" />
							{/if}

							<div class="grid gap-4 md:grid-cols-3">
								<label class="field">
									<span>Default tab</span>
									<select
										class="select"
										name="ride_widget_default_tab"
										bind:value={rideWidgetDefaultTab}
									>
										<option value="list">List</option>
										<option value="calendar">Calendar</option>
										<option value="map">Map</option>
									</select>
								</label>
								<label class="field">
									<span>Theme</span>
									<select class="select" name="ride_widget_theme" bind:value={rideWidgetTheme}>
										<option value="auto">Auto</option>
										<option value="light">Light</option>
										<option value="dark">Dark</option>
									</select>
								</label>
								<label class="field">
									<span>Density</span>
									<select class="select" name="ride_widget_density" bind:value={rideWidgetDensity}>
										<option value="comfortable">Comfortable</option>
										<option value="compact">Compact</option>
									</select>
								</label>
							</div>

							<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_show_user_filters"
										bind:checked={rideWidgetShowUserFilters}
									/>
									<span>Allow user filters</span>
								</label>
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_show_add_button"
										bind:checked={rideWidgetShowAddButton}
									/>
									<span>Show add event button</span>
								</label>
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_prefix_city"
										bind:checked={rideWidgetPrefixCity}
									/>
									<span>Prefix title with city</span>
								</label>
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_difficulty_colors"
										bind:checked={rideWidgetDifficultyColors}
									/>
									<span>Difficulty color coding</span>
								</label>
							</div>

							<div class="widget-enable-row rounded-2xl border border-white/10 p-3">
								<button
									type="button"
									class={`toggle-switch ${rideWidgetEnabled ? 'is-on' : ''}`}
									role="switch"
									aria-label="Toggle ride calendar widget"
									aria-checked={rideWidgetEnabled}
									onclick={() => (rideWidgetEnabled = !rideWidgetEnabled)}
								>
									<span></span>
								</button>
								<div class="text-sm font-semibold text-white/85">
									{rideWidgetEnabled ? 'Enable' : 'Disable'}
								</div>
								<button class="btn btn-sm preset-filled-primary-500 ml-auto">Save website</button>
							</div>

							<div class="rounded-2xl border border-white/10 p-2">
								<p class="mb-2 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
									Widget preview
								</p>
								<iframe
									title="Ride widget preview"
									src={widgetPreviewPath}
									class="h-[460px] w-full rounded-xl border border-white/10 bg-black/30"
								></iframe>
							</div>
						</div>
					{/if}
				</div>
				{#if !showRideWidgetBuilder}
					<input type="hidden" name="ride_widget_title" value={rideWidgetTitle} />
					<input type="hidden" name="ride_widget_host_scope" value={rideWidgetHostScope} />
					<input
						type="hidden"
						name="ride_widget_group_ids"
						value={selectedRideWidgetGroupIds.join(',')}
					/>
					<input type="hidden" name="ride_widget_filter_mode" value={rideWidgetFilterMode} />
					<input type="hidden" name="ride_widget_location" value={rideWidgetLocation} />
					<input type="hidden" name="ride_widget_near" value={rideWidgetNear} />
					<input type="hidden" name="ride_widget_radius_miles" value={rideWidgetRadiusMiles} />
					<input type="hidden" name="ride_widget_default_tab" value={rideWidgetDefaultTab} />
					<input type="hidden" name="ride_widget_theme" value={rideWidgetTheme} />
					<input type="hidden" name="ride_widget_density" value={rideWidgetDensity} />
					<input
						type="hidden"
						name="ride_widget_show_user_filters"
						value={rideWidgetShowUserFilters ? 'on' : 'off'}
					/>
					<input
						type="hidden"
						name="ride_widget_show_add_button"
						value={rideWidgetShowAddButton ? 'on' : 'off'}
					/>
					<input
						type="hidden"
						name="ride_widget_prefix_city"
						value={rideWidgetPrefixCity ? 'on' : 'off'}
					/>
					<input
						type="hidden"
						name="ride_widget_difficulty_colors"
						value={rideWidgetDifficultyColors ? 'on' : 'off'}
					/>
				{/if}
				<input type="hidden" name="ride_widget_enabled" value={rideWidgetEnabled ? 'on' : 'off'} />

				<button
					type="button"
					class="btn preset-tonal-surface justify-center"
					onclick={() => (showAdvanced = !showAdvanced)}
				>
					{showAdvanced ? 'Hide advanced design controls' : 'Show advanced design controls'}
				</button>

				<div class:hidden={!showAdvanced} class="grid gap-6">
					<div class="grid gap-4 md:grid-cols-2">
						<label class="field">
							<span>Featured quote</span>
							<textarea class="textarea min-h-28" name="featured_quote"
								>{siteConfig.featured_quote}</textarea
							>
						</label>
						<label class="field">
							<span>Footer blurb</span>
							<textarea class="textarea min-h-28" name="footer_blurb"
								>{siteConfig.footer_blurb}</textarea
							>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<label class="field">
							<span>Hero style</span>
							<select class="select" name="hero_style">
								{#each GROUP_SITE_HERO_STYLES as option}
									<option value={option} selected={siteConfig.hero_style === option}
										>{heroLabels[option]}</option
									>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>Font pairing</span>
							<select class="select" name="font_pairing">
								{#each GROUP_SITE_FONT_PAIRING_OPTIONS as option}
									<option
										value={option.value}
										selected={siteConfig.font_pairing === option.value}>{option.label}</option
									>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>Background style</span>
							<select class="select" name="background_style">
								{#each GROUP_SITE_BACKGROUND_STYLES as option}
									<option value={option} selected={siteConfig.background_style === option}
										>{backgroundLabels[option]}</option
									>
								{/each}
							</select>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<label class="field">
							<span>Panel style</span>
							<select class="select" name="panel_style">
								{#each GROUP_SITE_PANEL_STYLES as option}
									<option value={option} selected={siteConfig.panel_style === option}
										>{panelStyleLabels[option]}</option
									>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>Panel tone</span>
							<select class="select" name="panel_tone">
								{#each GROUP_SITE_PANEL_TONES as option}
									<option value={option} selected={siteConfig.panel_tone === option}
										>{panelToneLabels[option]}</option
									>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>Panel density</span>
							<select class="select" name="panel_density">
								{#each GROUP_SITE_PANEL_DENSITIES as option}
									<option value={option} selected={siteConfig.panel_density === option}
										>{panelDensityLabels[option]}</option
									>
								{/each}
							</select>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="field">
							<span>Theme mode</span>
							<select class="select" name="theme_mode" bind:value={themeMode}>
								{#each GROUP_SITE_THEME_MODES as option}
									<option value={option}>{themeLabels[option]}</option>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>Repo theme</span>
							<select class="select" name="theme_name" disabled={themeMode !== 'repo'}>
								{#each GROUP_SITE_THEME_OPTIONS as theme}
									<option value={theme.value} selected={siteConfig.theme_name === theme.value}>
										{theme.label}
									</option>
								{/each}
							</select>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<label class="field">
							<span>Primary</span>
							<input
								class="input"
								type="color"
								name="theme_primary"
								value={siteConfig.theme_colors.primary || '#F59E0B'}
								disabled={themeMode === 'repo'}
							/>
						</label>
						<label class="field">
							<span>Secondary</span>
							<input
								class="input"
								type="color"
								name="theme_secondary"
								value={siteConfig.theme_colors.secondary || '#0EA5E9'}
								disabled={themeMode === 'repo'}
							/>
						</label>
						<label class="field">
							<span>Accent</span>
							<input
								class="input"
								type="color"
								name="theme_accent"
								value={siteConfig.theme_colors.accent || '#FB7185'}
								disabled={themeMode === 'repo'}
							/>
						</label>
						<label class="field">
							<span>Surface</span>
							<input
								class="input"
								type="color"
								name="theme_surface"
								value={siteConfig.theme_colors.surface || '#111827'}
								disabled={themeMode === 'repo'}
							/>
						</label>
					</div>

					<div>
						<p class="mb-3 text-sm font-semibold text-white">Sections</p>
						<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
							{#each GROUP_SITE_SECTION_KEYS as key}
								<label class="toggle-card">
									<input
										type="checkbox"
										name={`section_${key}`}
										checked={siteConfig.sections[key]}
									/>
									<span>{sectionLabels[key]}</span>
								</label>
							{/each}
						</div>
					</div>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<button class="btn preset-filled-primary-500 justify-center">Save website</button>
				</div>
			</div>
		</form>

		<div class="space-y-6">
			<section class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconSparkles class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">AI draft</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">
							Generate a fresh site direction
						</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					Tell AI what you want your site to feel like. It will ask a few quick questions, then
					build a new draft for you.
				</p>

				<div class="ai-draft-chat mt-4">
					<div class="ai-draft-chat-body" bind:this={draftChatBodyEl}>
						{#each draftChatMessages as entry (entry.id)}
							<div class={`ai-draft-row ${entry.role === 'user' ? 'is-user' : 'is-assistant'}`}>
								<div class="ai-draft-bubble">
									<p class="text-sm leading-relaxed whitespace-pre-wrap">{entry.content}</p>
								</div>
							</div>
						{/each}
						{#if draftChatSending}
							<div class="ai-draft-row is-assistant">
								<div class="ai-draft-bubble">
									<div class="flex items-center gap-2 text-sm opacity-75">
										<IconLoader class="h-4 w-4 animate-spin" /> Thinking...
									</div>
								</div>
							</div>
						{/if}
					</div>

					{#if draftChatError}
						<div class="text-error-400 mt-2 text-xs">{draftChatError}</div>
					{/if}
					{#if pendingDraft}
						<div class="draft-summary mt-3 rounded-2xl p-3">
							<p class="text-xs font-semibold tracking-[0.18em] text-white/55 uppercase">
								Draft ready
							</p>
							<p class="mt-1 text-sm text-white/80">
								Review these proposed updates, then apply when you are ready.
							</p>
							<ul class="mt-2 space-y-1 text-sm text-white/85">
								{#each pendingDraft.summary || [] as item}
									<li>- {item}</li>
								{/each}
							</ul>
							<div class="mt-3 flex flex-wrap justify-end gap-2">
								<button
									type="button"
									class="btn btn-sm preset-tonal-surface"
									onclick={() => (pendingDraft = null)}
									disabled={applyingDraft}
								>
									Discard
								</button>
								<button
									type="button"
									class="btn btn-sm preset-filled-primary-500"
									onclick={() => void applyPendingDraft()}
									disabled={applyingDraft}
								>
									{applyingDraft ? 'Applying…' : 'Apply draft'}
								</button>
							</div>
						</div>
					{/if}

					<form
						class="mt-3"
						onsubmit={(event) => {
							event.preventDefault();
							void sendDraftMessage();
						}}
					>
						<div class="flex items-end gap-2">
							<textarea
								bind:this={draftChatInputEl}
								bind:value={draftChatInput}
								rows="1"
								maxlength="600"
								placeholder="Describe your direction, tone, and any must-have details..."
								class="input w-full resize-none p-2"
								disabled={draftChatSending}
								onkeydown={handleDraftInputKeydown}
							></textarea>
							<button
								type="submit"
								class="btn btn-icon preset-filled-primary-500"
								disabled={!canSendDraftMessage}
								aria-label="Send AI draft message"
							>
								<IconSendHorizontal class="h-4 w-4" />
							</button>
						</div>
					</form>

					<div class="mt-3 flex justify-end">
						<button type="button" class="btn btn-xs preset-tonal-warning" onclick={resetDraftChat}>
							Clear chat
						</button>
					</div>
				</div>
			</section>

			<form method="POST" action="?/deriveTheme" class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconPalette class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">
							Brand palette
						</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">
							Pull colors from logo or cover
						</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					This samples the group branding image, converts it into editable custom colors, and
					applies the result to the microsite.
				</p>
				<button class="btn preset-outlined-primary-500 mt-4 w-full justify-center">
					Derive palette from branding
				</button>
			</form>

			<form method="POST" action="?/reset" class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconRefreshCcw class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] text-white/48 uppercase">Reset</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">
							Return to the default microsite
						</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					This removes the saved microsite config for the group. The public site still exists, but
					it falls back to the generated default state.
				</p>
				<button class="btn preset-outlined-warning-500 mt-4 w-full justify-center"
					>Reset customizations</button
				>
			</form>
		</div>
	</section>
</div>

<style>
	.manage-card,
	.toggle-card,
	.notice,
	.error-box,
	.website-link,
	.action-icon {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
		backdrop-filter: blur(18px);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field span {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgb(255 255 255 / 0.55);
	}

	.input,
	.textarea,
	.select {
		background: color-mix(in oklab, var(--color-surface-950) 86%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}

	.slug-input-wrap {
		position: relative;
	}

	.slug-status {
		position: absolute;
		right: 0.55rem;
		top: 50%;
		transform: translateY(-50%);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.22rem 0.55rem;
		border-radius: 999px;
		border: 1px solid transparent;
	}

	.slug-status-available {
		color: var(--color-success-300);
		background: color-mix(in oklab, var(--color-success-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-success-400) 42%, transparent);
	}

	.slug-status-checking {
		color: var(--color-warning-300);
		background: color-mix(in oklab, var(--color-warning-500) 16%, transparent);
		border-color: color-mix(in oklab, var(--color-warning-400) 40%, transparent);
	}

	.slug-status-taken,
	.slug-status-error {
		color: var(--color-error-300);
		background: color-mix(in oklab, var(--color-error-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-error-400) 42%, transparent);
	}

	.slug-preview {
		font-size: 0.8rem;
		color: rgb(255 255 255 / 0.62);
		word-break: break-all;
	}

	.slug-message {
		font-size: 0.78rem;
		text-align: right;
	}

	.slug-meta-row {
		margin-top: 0.4rem;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.slug-message-available {
		color: var(--color-success-300);
	}

	.slug-message-checking {
		color: var(--color-warning-300);
	}

	.slug-message-taken,
	.slug-message-error {
		color: var(--color-error-300);
	}

	:global(input[type='color'].input) {
		border-width: 2px;
		border-style: solid;
		border-color: color-mix(in oklab, var(--color-surface-50) 28%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-surface-950) 72%, transparent),
			0 0 0 1px color-mix(in oklab, var(--color-surface-50) 18%, transparent);
	}

	.toggle-card {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.85rem 1rem;
		border-radius: 1rem;
		color: white;
	}

	.widget-enable-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.toggle-switch {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		width: 2.75rem;
		height: 1.5rem;
		padding: 0.16rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 22%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		transition:
			background-color 180ms ease,
			border-color 180ms ease;
		cursor: pointer;
	}

	.toggle-switch span {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: var(--color-surface-50);
		transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
	}

	.toggle-switch.is-on {
		background: color-mix(in oklab, var(--color-primary-500) 62%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 76%, transparent);
	}

	.toggle-switch.is-on span {
		transform: translateX(1.2rem);
	}

	.notice {
		color: white;
		background: color-mix(in oklab, var(--color-success-500) 12%, var(--color-surface-950) 88%);
	}

	.error-box {
		color: white;
		background: color-mix(in oklab, var(--color-error-500) 14%, var(--color-surface-950) 86%);
	}

	.website-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.95rem 1rem;
		border-radius: 1rem;
		text-decoration: none;
		color: white;
	}

	.website-link span {
		min-width: 0;
		font-size: 0.85rem;
		text-align: right;
		color: rgb(255 255 255 / 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.website-link-value {
		min-width: 0;
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		color: white;
		flex-shrink: 0;
	}

	.ai-draft-chat {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 12%, transparent);
		border-radius: 1rem;
		padding: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950) 82%, transparent);
	}

	.ai-draft-chat-body {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		max-height: 19rem;
		overflow-y: auto;
		padding-right: 0.1rem;
	}

	.ai-draft-row {
		display: flex;
	}

	.ai-draft-row.is-user {
		justify-content: flex-end;
	}

	.ai-draft-row.is-assistant {
		justify-content: flex-start;
	}

	.ai-draft-bubble {
		width: min(92%, 34rem);
		border-radius: 0.8rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 14%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 14%, transparent);
		color: rgb(255 255 255 / 0.92);
	}

	.ai-draft-row.is-user .ai-draft-bubble {
		background: color-mix(in oklab, var(--color-primary-500) 28%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 42%, transparent);
	}

	.draft-summary {
		border: 1px solid color-mix(in oklab, var(--color-primary-400) 34%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
	}

	.domain-row {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 12%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
	}

	.domain-panel {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 12%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 72%, transparent);
	}

	.domain-divider {
		height: 1px;
		background: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}
</style>
