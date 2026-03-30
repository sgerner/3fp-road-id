<script>
	import { onMount, tick, untrack } from 'svelte';
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
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconLayoutGrid from '@lucide/svelte/icons/layout-grid';
	import IconBrush from '@lucide/svelte/icons/brush';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconX from '@lucide/svelte/icons/x';
	import IconSave from '@lucide/svelte/icons/save';
	import { slide } from 'svelte/transition';

	let { data, form } = $props();

	// Panel states
	let previewOpen = $state(true);
	let contentOpen = $state(true);
	let aiOpen = $state(false);
	let designOpen = $state(false);
	let sectionsOpen = $state(false);
	let widgetOpen = $state(false);
	let advancedOpen = $state(false);
	let domainOpen = $state(false);
	let previewMode = $state('desktop');

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
	let siteConfig = $state(
		untrack(() => ({
			...structuredClone(data.siteConfig || {}),
			theme_colors: {
				...EMPTY_THEME_COLORS,
				...structuredClone(data.siteConfig?.theme_colors || {})
			},
			sections: {
				...EMPTY_SECTIONS,
				...structuredClone(data.siteConfig?.sections || {})
			}
		}))
	);

	let themeMode = $state('derived');
	let sponsorItems = $state([]);
	let sponsorItemsInitialized = $state(false);
	let faqItems = $state([]);
	let faqItemsInitialized = $state(false);
	let slugInput = $state('');
	let slugInputInitialized = $state(false);
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
		immersive: 'Immersive (Cinematic)',
		bold: 'Bold (Editorial)',
		orbit: 'Orbit (Floating cards)'
	};
	const backgroundLabels = {
		cinematic: 'Cinematic (Color orbs)',
		aurora: 'Aurora (Northern lights)',
		prism: 'Prism (Geometric shards)',
		void: 'Void (Deep space)'
	};
	const panelStyleLabels = {
		glass: 'Glass (Translucent)',
		filled: 'Filled (Solid)',
		outlined: 'Outlined (Border focus)'
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
		group_only: 'Only our rides',
		selected_groups: 'Selected groups'
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
			const fromItems = Array.isArray(siteConfig.sponsor_items) ? siteConfig.sponsor_items : [];
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
		rideWidgetEnabled = Boolean(siteConfig.ride_widget_enabled);
		rideWidgetTitle = siteConfig.ride_widget_title || 'Ride calendar';
		rideWidgetHostScope = siteConfig.ride_widget_host_scope || 'group_only';
		selectedRideWidgetGroupIds = Array.isArray(siteConfig.ride_widget_group_ids)
			? siteConfig.ride_widget_group_ids
			: [];
		const widget = siteConfig.ride_widget_config || {};
		rideWidgetLocation =
			widget.location || [widget.city, widget.state].filter(Boolean).join(' ') || groupCityDefault;
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
	const slugDomainPreview = $derived(`${data.hostName || ''}/${slugPreview || 'yourgroup'}`);

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
					{ signal: controller.signal }
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
			widgetOpen = false;
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
				{ method: 'POST' }
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

	function formatUsd(cents) {
		const amount = Number(cents);
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'USD'
		}).format((Number.isFinite(amount) ? amount : 0) / 100);
	}
</script>

<div class="site-manage">
	<!-- Header -->
	<div class="page-header">
		<div class="header-content">
			<h1 class="page-title">Website Builder</h1>
			<p class="page-subtitle">Customize your group's public microsite</p>
		</div>
		<a
			href={`/${slugPreview}`}
			target="_blank"
			rel="noopener noreferrer"
			class="btn preset-filled-primary-500"
		>
			<IconExternalLink class="h-4 w-4" />
			View Live
		</a>
	</div>

	<!-- Notifications -->
	{#if data.saved}
		<div class="banner success" role="status">
			<IconBadgeCheck class="h-4 w-4" />
			<p>
				{data.saved === 'palette' ? 'Palette updated from branding.' : 'Microsite settings saved.'}
			</p>
		</div>
	{/if}
	{#if data.generated}
		<div class="banner success" role="status">
			<IconSparkles class="h-4 w-4" />
			<p>
				{data.generated === 'ai'
					? 'AI draft applied to the microsite.'
					: 'AI fallback draft applied. Review and refine before publishing changes.'}
			</p>
		</div>
	{/if}
	{#if localGeneratedNotice}
		<div class="banner success" role="status">
			<IconSparkles class="h-4 w-4" />
			<p>{localGeneratedNotice}</p>
		</div>
	{/if}
	{#if data.reset}
		<div class="banner success" role="status">
			<IconRefreshCcw class="h-4 w-4" />
			<p>Microsite reset to the default generated site.</p>
		</div>
	{/if}
	{#if form?.error}
		<div class="banner error" role="alert">
			<IconTrash class="h-4 w-4" />
			<p>{form.error}</p>
		</div>
	{/if}

	<!-- Live Preview -->
	<section class="card preview-section">
		<div class="card-accent secondary"></div>
		<div class="preview-toggle flex flex-wrap">
			<button
				type="button"
				class="preview-toggle-main"
				onclick={() => (previewOpen = !previewOpen)}
				aria-expanded={previewOpen}
			>
				<div class="preview-toggle-left">
					<div class="card-icon secondary">
						<IconEye class="h-5 w-5" />
					</div>
					<div>
						<h2 class="preview-title">Live Preview</h2>
						<p class="preview-subtitle">See changes as you make them</p>
					</div>
				</div>
				<IconChevronDown class="chevron {previewOpen ? 'rotate' : ''}" />
			</button>
			{#if previewOpen}
				<div class="preview-toggle-right">
					<div class="preview-modes">
						<button
							type="button"
							class="mode-btn {previewMode === 'desktop' ? 'active' : ''}"
							onclick={() => {
								previewMode = 'desktop';
							}}
						>
							<IconMonitor class="h-4 w-4" />
							<span>Desktop</span>
						</button>
						<button
							type="button"
							class="mode-btn {previewMode === 'mobile' ? 'active' : ''}"
							onclick={() => {
								previewMode = 'mobile';
							}}
						>
							<IconSmartphone class="h-4 w-4" />
							<span>Mobile</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
		{#if previewOpen}
			<div class="preview-body" transition:slide={{ duration: 200 }}>
				<div class="preview-frame {previewMode}">
					<iframe title="Microsite preview" src={sitePreviewPath}></iframe>
				</div>
			</div>
		{/if}
	</section>

	<!-- Main Form -->
	<form
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		class="form-stack"
		id="site-form"
	>
		<input type="hidden" name="simple_mode" value="on" />
		<input type="hidden" name="microsite_slug" value={slugPreview} />

		<!-- Content Section -->
		<section class="card">
			<div class="card-accent primary"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (contentOpen = !contentOpen)}
				aria-expanded={contentOpen}
			>
				<div class="card-header-left">
					<div class="card-icon primary">
						<IconLayoutGrid class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Content</h2>
						<p class="card-subtitle">Title, tagline, and copy</p>
					</div>
				</div>
				<IconChevronDown class="chevron {contentOpen ? 'rotate' : ''}" />
			</button>
			{#if contentOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="form-grid">
						<div class="field">
							<label class="field-label" for="site-title">Site Title</label>
							<input
								id="site-title"
								class="input"
								name="site_title"
								value={siteConfig.site_title}
							/>
						</div>
						<div class="field">
							<label class="field-label" for="site-tagline">Tagline</label>
							<input
								id="site-tagline"
								class="input"
								name="site_tagline"
								value={siteConfig.site_tagline}
							/>
						</div>
					</div>

					<div class="field mt-4">
						<label class="field-label" for="home-intro">Home Intro</label>
						<textarea id="home-intro" class="textarea" name="home_intro" rows="4"
							>{siteConfig.home_intro}</textarea
						>
					</div>

					<div class="form-grid mt-4">
						<div class="field">
							<label class="field-label" for="notice">Notice Banner</label>
							<input
								id="notice"
								class="input"
								name="microsite_notice"
								maxlength="180"
								value={siteConfig.microsite_notice || ''}
								placeholder="Optional announcement..."
							/>
						</div>
						<div class="field">
							<label class="field-label" for="notice-link">Notice Link</label>
							<input
								id="notice-link"
								class="input"
								name="microsite_notice_href"
								value={siteConfig.microsite_notice_href || ''}
								placeholder="https://..."
							/>
						</div>
					</div>

					<div class="field mt-4">
						<label class="field-label" for="new-rider-note">New Rider Starter Note</label>
						<textarea
							id="new-rider-note"
							class="textarea"
							name="new_rider_note"
							maxlength="600"
							rows="3">{siteConfig.new_rider_note || ''}</textarea
						>
					</div>

					<!-- FAQs -->
					<div class="subsection mt-4">
						<div class="subsection-header">
							<h3 class="subsection-title">FAQs</h3>
							<button
								type="button"
								class="btn btn-sm preset-tonal-primary"
								onclick={addFaq}
								disabled={faqItems.length >= 2}
							>
								<IconPlus class="h-4 w-4" /> Add
							</button>
						</div>
						<input type="hidden" name="faq_1_q" value={faqItems[0]?.question || ''} />
						<input type="hidden" name="faq_1_a" value={faqItems[0]?.answer || ''} />
						<input type="hidden" name="faq_2_q" value={faqItems[1]?.question || ''} />
						<input type="hidden" name="faq_2_a" value={faqItems[1]?.answer || ''} />
						{#if faqItems.length}
							<div class="faq-list">
								{#each faqItems as item, idx}
									<div class="faq-item">
										<div class="faq-header">
											<span class="faq-label">FAQ {idx + 1}</span>
											<button
												type="button"
												class="btn btn-xs preset-outlined-surface"
												onclick={() => removeFaq(idx)}
											>
												<IconTrash class="h-3 w-3" />
											</button>
										</div>
										<div class="faq-fields">
											<input
												class="input"
												value={item.question}
												maxlength="120"
												placeholder="Question"
												oninput={(e) => updateFaq(idx, 'question', e.currentTarget.value)}
											/>
											<input
												class="input"
												value={item.answer}
												maxlength="320"
												placeholder="Answer"
												oninput={(e) => updateFaq(idx, 'answer', e.currentTarget.value)}
											/>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Sponsors -->
					<div class="subsection mt-4">
						<div class="subsection-header">
							<h3 class="subsection-title">Sponsors</h3>
							<button type="button" class="btn btn-sm preset-tonal-primary" onclick={addSponsor}>
								<IconPlus class="h-4 w-4" /> Add
							</button>
						</div>
						<input type="hidden" name="sponsor_items_json" value={JSON.stringify(sponsorItems)} />
						{#if sponsorItems.length}
							<div class="sponsor-list">
								{#each sponsorItems as item, idx}
									<div class="sponsor-item">
										<div class="sponsor-header">
											<span class="sponsor-label">Sponsor {idx + 1}</span>
											<button
												type="button"
												class="btn btn-xs preset-outlined-surface"
												onclick={() => removeSponsor(idx)}
											>
												<IconTrash class="h-3 w-3" />
											</button>
										</div>
										<div class="sponsor-fields">
											<input
												class="input"
												value={item.name}
												maxlength="120"
												placeholder="Name"
												oninput={(e) => updateSponsor(idx, 'name', e.currentTarget.value)}
											/>
											<input
												class="input"
												value={item.text}
												maxlength="220"
												placeholder="Description"
												oninput={(e) => updateSponsor(idx, 'text', e.currentTarget.value)}
											/>
											<input
												class="input"
												value={item.url}
												placeholder="https://..."
												oninput={(e) => updateSponsor(idx, 'url', e.currentTarget.value)}
											/>
											{#if item.logo}
												<div class="sponsor-logo">
													<img src={item.logo} alt="" class="logo-thumb" />
													<button
														type="button"
														class="btn btn-xs preset-outlined-surface"
														onclick={() => updateSponsor(idx, 'logo', '')}>Remove</button
													>
												</div>
											{/if}
											<input
												class="input"
												type="file"
												name={`sponsor_logo_file_${idx}`}
												accept="image/*"
											/>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- AI Assistant -->
		<section class="card ai-card">
			<div class="card-accent accent"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (aiOpen = !aiOpen)}
				aria-expanded={aiOpen}
			>
				<div class="card-header-left">
					<div class="card-icon accent">
						<IconSparkles class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">AI Assistant</h2>
						<p class="card-subtitle">Generate fresh content</p>
					</div>
				</div>
				<IconChevronDown class="chevron {aiOpen ? 'rotate' : ''}" />
			</button>
			{#if aiOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="ai-assistant-inner">
						<div class="ai-chat-container" bind:this={draftChatBodyEl}>
							{#if draftChatMessages.length === 1}
								<div class="ai-welcome">
									<div class="ai-welcome-bubble">
										<p class="ai-welcome-text">
											I can update your site copy, visual style, and section layout. What first
											impression do you want visitors to get?
										</p>
										<div class="ai-quick-prompts">
											<button
												class="quick-prompt"
												type="button"
												onclick={() => {
													draftChatInput = 'Make it bold and energetic for young cyclists';
													sendDraftMessage();
												}}
											>
												"Make it bold and energetic..."
											</button>
											<button
												class="quick-prompt"
												type="button"
												onclick={() => {
													draftChatInput = 'Create a welcoming community feel';
													sendDraftMessage();
												}}
											>
												"Create a welcoming feel..."
											</button>
											<button
												class="quick-prompt"
												type="button"
												onclick={() => {
													draftChatInput = 'Focus on safety and education';
													sendDraftMessage();
												}}
											>
												"Focus on safety and education..."
											</button>
										</div>
									</div>
								</div>
							{:else}
								<div class="ai-messages">
									{#each draftChatMessages.slice(1) as entry (entry.id)}
										<div class="ai-message {entry.role}">
											<div class="ai-message-avatar">
												{#if entry.role === 'assistant'}
													<IconSparkles class="h-4 w-4" />
												{:else}
													<span class="user-avatar">You</span>
												{/if}
											</div>
											<div class="ai-message-content">
												<p class="ai-message-text">{entry.content}</p>
											</div>
										</div>
									{/each}
									{#if draftChatSending}
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

						{#if pendingDraft}
							<div class="draft-preview">
								<p class="draft-title">Draft Ready</p>
								<ul class="draft-list">
									{#each pendingDraft.summary || [] as item}
										<li>{item}</li>
									{/each}
								</ul>
								<div class="draft-actions">
									<button
										type="button"
										class="btn btn-sm preset-tonal-surface"
										onclick={() => (pendingDraft = null)}
										disabled={applyingDraft}>Discard</button
									>
									<button
										type="button"
										class="btn btn-sm preset-filled-primary-500"
										onclick={() => void applyPendingDraft()}
										disabled={applyingDraft}
									>
										{applyingDraft ? 'Applying…' : 'Apply Draft'}
									</button>
								</div>
							</div>
						{/if}

						<div class="ai-composer">
							<div class="ai-input-area">
								<textarea
									bind:this={draftChatInputEl}
									bind:value={draftChatInput}
									rows="2"
									maxlength="600"
									placeholder={draftChatMessages.length > 1
										? 'Reply to refine the draft...'
										: 'What vibe do you want for your site?'}
									disabled={draftChatSending}
									onkeydown={handleDraftInputKeydown}
								></textarea>
								<button
									class="ai-send-btn"
									type="button"
									onclick={sendDraftMessage}
									disabled={draftChatSending || !canSendDraftMessage}
								>
									<IconSendHorizontal class="h-5 w-5" />
								</button>
								<button
									class="ai-clear-btn"
									type="button"
									onclick={resetDraftChat}
									title="Clear conversation"
								>
									<IconRefreshCw class="h-4 w-4" />
								</button>
							</div>
							{#if draftChatMessages.length > 1}
								<p class="ai-hint">Press Enter to send, Shift+Enter for new line</p>
							{/if}
						</div>

						{#if draftChatError}
							<div class="ai-status error">
								<span>{draftChatError}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- Design & Colors Section -->
		<section class="card">
			<div class="card-accent secondary"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (designOpen = !designOpen)}
				aria-expanded={designOpen}
			>
				<div class="card-header-left">
					<div class="card-icon secondary">
						<IconBrush class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Design & Colors</h2>
						<p class="card-subtitle">Theme and styling</p>
					</div>
				</div>
				<IconChevronDown class="chevron {designOpen ? 'rotate' : ''}" />
			</button>
			{#if designOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="form-grid">
						<div class="field">
							<label class="field-label" for="hero-style">Hero Style</label>
							<select id="hero-style" class="select" name="hero_style">
								{#each GROUP_SITE_HERO_STYLES as option}
									<option value={option} selected={siteConfig.hero_style === option}
										>{heroLabels[option]}</option
									>
								{/each}
							</select>
						</div>
						<div class="field">
							<label class="field-label" for="bg-style">Background</label>
							<select id="bg-style" class="select" name="background_style">
								{#each GROUP_SITE_BACKGROUND_STYLES as option}
									<option value={option} selected={siteConfig.background_style === option}
										>{backgroundLabels[option]}</option
									>
								{/each}
							</select>
						</div>
					</div>

					<div class="form-grid mt-4">
						<div class="field">
							<label class="field-label" for="font-pairing">Font Pairing</label>
							<select id="font-pairing" class="select" name="font_pairing">
								{#each GROUP_SITE_FONT_PAIRING_OPTIONS as option}
									<option value={option.value} selected={siteConfig.font_pairing === option.value}
										>{option.label}</option
									>
								{/each}
							</select>
						</div>
						<div class="field">
							<label class="field-label" for="panel-style">Panel Style</label>
							<select id="panel-style" class="select" name="panel_style">
								{#each GROUP_SITE_PANEL_STYLES as option}
									<option value={option} selected={siteConfig.panel_style === option}
										>{panelStyleLabels[option]}</option
									>
								{/each}
							</select>
						</div>
					</div>

					<div class="color-grid mt-4">
						<div class="field">
							<label class="field-label" for="theme-primary">Primary</label>
							<div class="color-input">
								<input
									id="theme-primary"
									class="input"
									type="color"
									name="theme_primary"
									value={siteConfig.theme_colors.primary || '#F59E0B'}
									disabled={themeMode === 'repo'}
								/>
								<span class="color-value">{siteConfig.theme_colors.primary || '#F59E0B'}</span>
							</div>
						</div>
						<div class="field">
							<label class="field-label" for="theme-secondary">Secondary</label>
							<div class="color-input">
								<input
									id="theme-secondary"
									class="input"
									type="color"
									name="theme_secondary"
									value={siteConfig.theme_colors.secondary || '#0EA5E9'}
									disabled={themeMode === 'repo'}
								/>
								<span class="color-value">{siteConfig.theme_colors.secondary || '#0EA5E9'}</span>
							</div>
						</div>
						<div class="field">
							<label class="field-label" for="theme-accent">Accent</label>
							<div class="color-input">
								<input
									id="theme-accent"
									class="input"
									type="color"
									name="theme_accent"
									value={siteConfig.theme_colors.accent || '#FB7185'}
									disabled={themeMode === 'repo'}
								/>
								<span class="color-value">{siteConfig.theme_colors.accent || '#FB7185'}</span>
							</div>
						</div>
						<div class="field">
							<label class="field-label" for="theme-surface">Surface</label>
							<div class="color-input">
								<input
									id="theme-surface"
									class="input"
									type="color"
									name="theme_surface"
									value={siteConfig.theme_colors.surface || '#111827'}
									disabled={themeMode === 'repo'}
								/>
								<span class="color-value">{siteConfig.theme_colors.surface || '#111827'}</span>
							</div>
						</div>
					</div>

					<!-- Derive Colors from Branding -->
					<div class="derive-section mt-6">
						<div class="derive-content">
							<div class="derive-icon">
								<IconPalette class="h-5 w-5" />
							</div>
							<div class="derive-text">
								<h3 class="derive-title">Pull Colors from Branding</h3>
								<p class="derive-desc">
									Sample colors from your logo and apply them to the site theme automatically
								</p>
							</div>
						</div>
						<button type="submit" formaction="?/deriveTheme" class="btn preset-tonal-primary">
							Derive Colors
						</button>
					</div>
				</div>
			{/if}
		</section>

		<!-- Sections Toggle -->
		<section class="card">
			<div class="card-accent tertiary"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (sectionsOpen = !sectionsOpen)}
				aria-expanded={sectionsOpen}
			>
				<div class="card-header-left">
					<div class="card-icon tertiary">
						<IconSettings class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Sections</h2>
						<p class="card-subtitle">Which pages to show</p>
					</div>
				</div>
				<IconChevronDown class="chevron {sectionsOpen ? 'rotate' : ''}" />
			</button>
			{#if sectionsOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="sections-toggle-grid">
						{#each GROUP_SITE_SECTION_KEYS as key}
							<div class="section-toggle-item">
								<span class="section-toggle-label">{sectionLabels[key]}</span>
								<label class="toggle-switch">
									<input
										type="checkbox"
										name={`section_${key}`}
										checked={siteConfig.sections[key]}
									/>
									<span class="toggle-track"></span>
								</label>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- Ride Widget -->
		<section class="card">
			<div class="card-accent primary"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (widgetOpen = !widgetOpen)}
				aria-expanded={widgetOpen}
			>
				<div class="card-header-left">
					<div class="card-icon primary">
						<IconCalendar class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Ride Calendar</h2>
						<p class="card-subtitle">Widget settings</p>
					</div>
				</div>
				<IconChevronDown class="chevron {widgetOpen ? 'rotate' : ''}" />
			</button>
			{#if widgetOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="widget-enable">
						<label class="toggle-switch">
							<input type="checkbox" name="ride_widget_enabled" bind:checked={rideWidgetEnabled} />
							<span class="toggle-track"></span>
						</label>
						<span class="toggle-label">{rideWidgetEnabled ? 'Enabled' : 'Disabled'}</span>
					</div>

					{#if rideWidgetEnabled}
						<div class="widget-settings mt-4 space-y-4">
							<div class="form-grid">
								<div class="field">
									<label class="field-label" for="widget-title">Widget Title</label>
									<input
										id="widget-title"
										class="input"
										name="ride_widget_title"
										maxlength="120"
										bind:value={rideWidgetTitle}
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rides-source">Rides Source</label>
									<select
										id="rides-source"
										class="select"
										name="ride_widget_host_scope"
										bind:value={rideWidgetHostScope}
									>
										{#each GROUP_SITE_RIDE_WIDGET_HOST_SCOPES as option}
											<option value={option}>{rideWidgetHostScopeLabels[option]}</option>
										{/each}
									</select>
								</div>
							</div>

							<div class="form-grid">
								<div class="field">
									<label class="field-label" for="default-tab">Default Tab</label>
									<select
										id="default-tab"
										class="select"
										name="ride_widget_default_tab"
										bind:value={rideWidgetDefaultTab}
									>
										<option value="list">List</option>
										<option value="calendar">Calendar</option>
										<option value="map">Map</option>
									</select>
								</div>
								<div class="field">
									<label class="field-label" for="widget-theme">Theme</label>
									<select
										id="widget-theme"
										class="select"
										name="ride_widget_theme"
										bind:value={rideWidgetTheme}
									>
										<option value="auto">Auto</option>
										<option value="light">Light</option>
										<option value="dark">Dark</option>
									</select>
								</div>
							</div>

							<div class="widget-toggles">
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_show_user_filters"
										bind:checked={rideWidgetShowUserFilters}
									/>
									<span>User filters</span>
								</label>
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_show_add_button"
										bind:checked={rideWidgetShowAddButton}
									/>
									<span>Add event button</span>
								</label>
								<label class="toggle-card">
									<input
										type="checkbox"
										name="ride_widget_difficulty_colors"
										bind:checked={rideWidgetDifficultyColors}
									/>
									<span>Difficulty colors</span>
								</label>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Advanced -->
		<section class="card">
			<div class="card-accent muted"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (advancedOpen = !advancedOpen)}
				aria-expanded={advancedOpen}
			>
				<div class="card-header-left">
					<div class="card-icon muted">
						<IconSettings class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Advanced</h2>
						<p class="card-subtitle">Fine-tune the design</p>
					</div>
				</div>
				<IconChevronDown class="chevron {advancedOpen ? 'rotate' : ''}" />
			</button>
			{#if advancedOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<div class="form-grid">
						<div class="field">
							<label class="field-label" for="panel-tone">Panel Tone</label>
							<select id="panel-tone" class="select" name="panel_tone">
								{#each GROUP_SITE_PANEL_TONES as option}
									<option value={option} selected={siteConfig.panel_tone === option}
										>{panelToneLabels[option]}</option
									>
								{/each}
							</select>
						</div>
						<div class="field">
							<label class="field-label" for="panel-density">Panel Density</label>
							<select id="panel-density" class="select" name="panel_density">
								{#each GROUP_SITE_PANEL_DENSITIES as option}
									<option value={option} selected={siteConfig.panel_density === option}
										>{panelDensityLabels[option]}</option
									>
								{/each}
							</select>
						</div>
					</div>

					<div class="form-grid mt-4">
						<div class="field">
							<label class="field-label" for="theme-mode">Theme Mode</label>
							<select id="theme-mode" class="select" name="theme_mode" bind:value={themeMode}>
								{#each GROUP_SITE_THEME_MODES as option}
									<option value={option}>{themeLabels[option]}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label class="field-label" for="repo-theme">Repo Theme</label>
							<select
								id="repo-theme"
								class="select"
								name="theme_name"
								disabled={themeMode !== 'repo'}
							>
								{#each GROUP_SITE_THEME_OPTIONS as theme}
									<option value={theme.value} selected={siteConfig.theme_name === theme.value}
										>{theme.label}</option
									>
								{/each}
							</select>
						</div>
					</div>

					<div class="field mt-4">
						<label class="field-label" for="featured-quote">Featured Quote</label>
						<textarea id="featured-quote" class="textarea" name="featured_quote" rows="3"
							>{siteConfig.featured_quote}</textarea
						>
					</div>

					<div class="field mt-4">
						<label class="field-label" for="footer-blurb">Footer Blurb</label>
						<textarea id="footer-blurb" class="textarea" name="footer_blurb" rows="3"
							>{siteConfig.footer_blurb}</textarea
						>
					</div>
				</div>
			{/if}
		</section>

		<!-- Domain Manager (Combined URL + Domains) -->
		<section class="card">
			<div class="card-accent primary"></div>
			<button
				type="button"
				class="card-toggle"
				onclick={() => (domainOpen = !domainOpen)}
				aria-expanded={domainOpen}
			>
				<div class="card-header-left">
					<div class="card-icon primary">
						<IconGlobe class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Domain</h2>
						<p class="card-subtitle">URL settings and custom domains</p>
					</div>
				</div>
				<IconChevronDown class="chevron {domainOpen ? 'rotate' : ''}" />
			</button>
			{#if domainOpen}
				<div class="card-body" transition:slide={{ duration: 200 }}>
					<!-- Site URL -->
					<div class="domain-section">
						<h3 class="subsection-title">Site URL</h3>
						<a href={`/${slugPreview}`} target="_blank" rel="noopener noreferrer" class="url-link">
							<span class="url-text">{slugDomainPreview}</span>
							<IconExternalLink class="h-4 w-4" />
						</a>

						<div class="slug-field mt-4">
							<label class="field-label" for="slug-input">Website Slug</label>
							<div class="slug-input-wrap">
								<input
									id="slug-input"
									class="input"
									value={slugInput}
									oninput={onSlugInput}
									pattern="[A-Za-z0-9]+"
									maxlength="40"
									placeholder="yourgroup"
								/>
								<span class="slug-status {slugAvailability.state}">{slugAvailability.label}</span>
							</div>
							<p class="slug-preview">{slugDomainPreview}</p>
							<p class="slug-message {slugAvailability.state}">{slugAvailability.message}</p>
						</div>
					</div>

					<!-- Custom Domains -->
					<div class="domain-section mt-6">
						<h3 class="subsection-title">Custom Domains</h3>
						<p class="field-hint">Add or manage your own domains ({customDomains.length} active)</p>

						<!-- Attach Existing -->
						<div class="mt-4">
							<p class="mb-2 text-sm font-medium">Attach Existing Domain</p>
							<div class="flex gap-2">
								<input
									class="input flex-1"
									bind:value={existingDomainInput}
									placeholder="yourdomain.com"
								/>
								<button
									type="button"
									class="btn preset-filled-primary-500"
									disabled={domainsLoading}
									onclick={() => void attachExistingDomain()}
								>
									Attach
								</button>
							</div>
						</div>

						<!-- Domain List -->
						{#if customDomains.length}
							<div class="domain-list mt-4">
								{#each customDomains as domainRow}
									<div class="domain-item">
										<div class="domain-info">
											<div class="domain-name">{domainRow.domain}</div>
											<div class="domain-status">
												{domainRow.status}
												{#if domainRow.vercel_verified}• Verified{:else}• Needs DNS{/if}
											</div>
										</div>
										<div class="domain-actions">
											<button
												type="button"
												class="btn btn-xs preset-tonal-surface"
												disabled={verifyingDomain === domainRow.domain}
												onclick={() => void verifyDomain(domainRow.domain)}
											>
												{#if verifyingDomain === domainRow.domain}
													<IconRefreshCw class="h-3 w-3 animate-spin" /> Verifying
												{:else}
													<IconBadgeCheck class="h-3 w-3" /> Verify
												{/if}
											</button>
											<button
												type="button"
												class="btn btn-xs preset-tonal-warning"
												disabled={renewalBusyDomain === domainRow.domain}
												onclick={() =>
													void toggleAutoRenew(domainRow.domain, !domainRow.auto_renew)}
											>
												{domainRow.auto_renew ? 'Pause' : 'Renew'}
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Buy Domain -->
						<div class="mt-4">
							<p class="mb-2 text-sm font-medium">Buy Domain</p>
							<div class="flex gap-2">
								<input
									class="input flex-1"
									bind:value={domainSearchQuery}
									placeholder="biketempe"
								/>
								<button
									type="button"
									class="btn preset-filled-primary-500"
									disabled={domainSearchBusy}
									onclick={() => void searchDomains()}
								>
									Search
								</button>
							</div>
						</div>

						{#if domainSearchResults.length}
							<div class="domain-results mt-4">
								{#each domainSearchResults as row}
									<div class="domain-result">
										<div class="domain-result-info">
											<div class="domain-result-name">{row.domain}</div>
											<div class="domain-result-price">
												{formatUsd(row.pricing.purchase.totalCents)}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					{#if domainMessage}
						<div class="banner success mt-4">
							<IconBadgeCheck class="h-4 w-4" />
							<p>{domainMessage}</p>
						</div>
					{/if}
					{#if domainError}
						<div class="banner error mt-4">
							<IconTrash class="h-4 w-4" />
							<p>{domainError}</p>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Reset to Default -->
		<section class="card reset-card">
			<div class="card-accent warning"></div>
			<div class="card-body">
				<div class="reset-content">
					<div class="reset-icon">
						<IconRefreshCcw class="h-5 w-5" />
					</div>
					<div class="reset-text">
						<h3 class="reset-title">Reset to Default</h3>
						<p class="reset-desc">Remove all customizations and return to the generated default</p>
					</div>
				</div>
				<button type="submit" formaction="?/reset" class="btn preset-outlined-warning-500"
					>Reset</button
				>
			</div>
		</section>

		<!-- Sticky Bottom Action Bar -->
		<div class="action-bar">
			<div class="action-bar-content">
				<div class="action-bar-left">
					<div class="action-bar-icon">
						<IconSave class="h-5 w-5" />
					</div>
					<div class="action-bar-text">
						<h3 class="action-bar-title">Save your changes</h3>
						<p class="action-bar-desc">Your edits won't be published until you save</p>
					</div>
				</div>
				<button
					type="submit"
					class="btn preset-filled-primary-500 action-bar-btn"
					formaction="?/save"
				>
					<IconSave class="h-4 w-4" />
					Save Changes
				</button>
			</div>
		</div>
	</form>
</div>

<style>
	.site-manage {
		--card-bg: color-mix(in oklab, var(--color-surface-900) 98%, var(--color-surface-500) 2%);
		--card-border: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		--hover-bg: color-mix(in oklab, var(--color-surface-800) 80%, transparent);

		margin: 0 auto;
		padding-bottom: 6rem;
	}

	@media (min-width: 640px) {
		.site-manage {
			padding: 1.5rem;
			padding-bottom: 8rem;
		}
	}

	/* Page Header */
	.page-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	@media (min-width: 640px) {
		.page-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.page-subtitle {
		font-size: 0.875rem;
		opacity: 0.7;
		margin-top: 0.25rem;
	}

	/* Banners */
	.banner {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.banner.success {
		background: color-mix(in oklab, var(--color-success-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 20%, transparent);
	}

	.banner.error {
		background: color-mix(in oklab, var(--color-error-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 20%, transparent);
	}

	.banner :global(svg) {
		flex-shrink: 0;
		opacity: 0.8;
	}

	/* Cards */
	.card {
		position: relative;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1rem;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.card-accent {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		pointer-events: none;
	}

	.card-accent.primary {
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
	}

	.card-accent.secondary {
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
	}

	.card-accent.tertiary {
		background: linear-gradient(90deg, var(--color-tertiary-500), var(--color-primary-500));
	}

	.card-accent.accent {
		background: linear-gradient(
			90deg,
			var(--color-primary-500),
			var(--color-secondary-500),
			var(--color-tertiary-500)
		);
	}

	.card-accent.warning {
		background: linear-gradient(90deg, var(--color-warning-500), var(--color-error-500));
	}

	.card-accent.muted {
		background: linear-gradient(90deg, var(--color-surface-500), var(--color-surface-400));
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--card-border);
	}

	.card-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		width: 100%;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.card-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		flex-shrink: 0;
	}

	.card-icon.primary {
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		color: var(--color-primary-400);
	}

	.card-icon.secondary {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-400);
	}

	.card-icon.tertiary {
		background: color-mix(in oklab, var(--color-tertiary-500) 12%, transparent);
		color: var(--color-tertiary-400);
	}

	.card-icon.muted {
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: var(--color-surface-400);
	}

	.card-icon.accent {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		color: white;
	}

	.card-title-group {
		min-width: 0;
	}

	.card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.25;
	}

	.card-subtitle {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	.card-body {
		padding: 1rem 1.25rem;
	}

	.chevron {
		flex-shrink: 0;
		opacity: 0.6;
		transition: transform 200ms ease;
	}

	.chevron.rotate {
		transform: rotate(180deg);
	}

	/* Sticky Bottom Action Bar */
	.action-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		padding: 0.75rem 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 98%, var(--color-surface-900) 2%);
		border-top: 1px solid var(--card-border);
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
	}

	@media (min-width: 640px) {
		.action-bar {
			padding: 1rem 1.5rem;
		}
	}

	.action-bar-content {
		max-width: 56rem;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.action-bar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.action-bar-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		color: var(--color-primary-400);
		flex-shrink: 0;
	}

	.action-bar-text {
		min-width: 0;
		display: none;
	}

	@media (min-width: 480px) {
		.action-bar-text {
			display: block;
		}
	}

	.action-bar-title {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.action-bar-desc {
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.action-bar-btn {
		flex-shrink: 0;
	}

	@media (max-width: 639px) {
		.action-bar-content {
			justify-content: center;
		}

		.action-bar-left {
			display: none;
		}

		.action-bar-btn {
			width: 100%;
			max-width: 280px;
		}
	}

	/* Preview Section */
	.preview-section {
		margin-bottom: 1.5rem;
	}

	.preview-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		width: 100%;
	}

	.preview-toggle-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex: 1;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		padding: 0;
	}

	.preview-toggle-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.preview-toggle-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.preview-title {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.preview-subtitle {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	.preview-modes {
		display: flex;
		gap: 0.375rem;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid var(--card-border);
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.mode-btn:hover {
		background: var(--hover-bg);
	}

	.mode-btn.active {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
		color: white;
	}

	.preview-body {
		padding: 0 1.25rem 1.25rem;
	}

	.preview-frame {
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		overflow: hidden;
	}

	.preview-frame iframe {
		width: 100%;
		height: 400px;
		border: none;
		display: block;
	}

	.preview-frame.mobile {
		max-width: 375px;
		margin: 0 auto;
	}

	@media (min-width: 640px) {
		.preview-frame iframe {
			height: 500px;
		}
	}

	/* Form Stack */
	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* URL Link */
	.url-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		text-decoration: none;
		color: inherit;
		transition: all 150ms ease;
	}

	.url-link:hover {
		background: var(--hover-bg);
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.url-text {
		font-size: 0.875rem;
		font-weight: 500;
		opacity: 0.9;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Slug Field */
	.slug-field {
		position: relative;
	}

	.slug-input-wrap {
		position: relative;
	}

	.slug-status {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		border: 1px solid transparent;
	}

	.slug-status.available {
		color: var(--color-success-300);
		background: color-mix(in oklab, var(--color-success-500) 15%, transparent);
		border-color: color-mix(in oklab, var(--color-success-400) 40%, transparent);
	}

	.slug-status.checking {
		color: var(--color-warning-300);
		background: color-mix(in oklab, var(--color-warning-500) 15%, transparent);
		border-color: color-mix(in oklab, var(--color-warning-400) 40%, transparent);
	}

	.slug-status.taken,
	.slug-status.error {
		color: var(--color-error-300);
		background: color-mix(in oklab, var(--color-error-500) 15%, transparent);
		border-color: color-mix(in oklab, var(--color-error-400) 40%, transparent);
	}

	.slug-preview {
		font-size: 0.75rem;
		opacity: 0.7;
		margin-top: 0.375rem;
		word-break: break-all;
	}

	.slug-message {
		font-size: 0.75rem;
		margin-top: 0.25rem;
	}

	.slug-message.available {
		color: var(--color-success-400);
	}

	.slug-message.checking {
		color: var(--color-warning-400);
	}

	.slug-message.taken,
	.slug-message.error {
		color: var(--color-error-400);
	}

	/* Form Elements */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.65;
	}

	.input,
	.textarea,
	.select {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 25%, transparent);
		border-radius: 0.625rem;
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		color: inherit;
		width: 100%;
		transition: all 150ms ease;
	}

	.input:focus,
	.textarea:focus,
	.select:focus {
		outline: none;
		border-color: var(--color-primary-500);
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
	}

	.textarea {
		resize: vertical;
		min-height: 5rem;
	}

	.form-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.form-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* Subsections */
	.subsection {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.subsection-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.subsection-title {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.field-hint {
		font-size: 0.75rem;
		opacity: 0.6;
	}

	/* FAQs & Sponsors */
	.faq-list,
	.sponsor-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.faq-item,
	.sponsor-item {
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.625rem;
		padding: 0.875rem;
	}

	.faq-header,
	.sponsor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
	}

	.faq-label,
	.sponsor-label {
		font-size: 0.75rem;
		font-weight: 500;
		opacity: 0.8;
	}

	.faq-fields,
	.sponsor-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sponsor-logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.375rem;
	}

	.logo-thumb {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.375rem;
		object-fit: cover;
		background: white;
	}

	/* Color Grid */
	.color-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(2, 1fr);
	}

	@media (min-width: 640px) {
		.color-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.color-input {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.color-input .input {
		width: 3.5rem;
		height: 2.5rem;
		padding: 0.25rem;
		cursor: pointer;
	}

	.color-value {
		font-size: 0.75rem;
		font-family: monospace;
		opacity: 0.7;
	}

	/* Derive Section */
	.derive-section {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		padding: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.derive-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.derive-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		color: var(--color-primary-400);
		flex-shrink: 0;
	}

	.derive-text {
		min-width: 0;
	}

	.derive-title {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25;
	}

	.derive-desc {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	/* Sections Grid */
	.sections-grid {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(2, 1fr);
	}

	@media (min-width: 640px) {
		.sections-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.toggle-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.toggle-card:hover {
		background: var(--hover-bg);
	}

	.toggle-card input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-primary-500);
	}

	.toggle-card span {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	/* Sections Toggle Grid */
	.sections-toggle-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(2, 1fr);
	}

	@media (min-width: 640px) {
		.sections-toggle-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.section-toggle-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.5rem;
	}

	.section-toggle-label {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	/* Widget */
	.widget-enable {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.toggle-switch {
		display: inline-flex;
		align-items: center;
		width: 2.75rem;
		height: 1.5rem;
		padding: 0.125rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		cursor: pointer;
		position: relative;
		transition: all 180ms ease;
	}

	.toggle-switch:has(input:checked) {
		background: color-mix(in oklab, var(--color-primary-500) 60%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 70%, transparent);
	}

	.toggle-switch input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.toggle-track {
		display: block;
		width: 1.125rem;
		height: 1.125rem;
		background: white;
		border-radius: 999px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
		transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.toggle-switch:has(input:checked) .toggle-track {
		transform: translateX(1.25rem);
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.widget-toggles {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(2, 1fr);
	}

	@media (min-width: 640px) {
		.widget-toggles {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	/* Domain */
	.domain-section {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.domain-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.domain-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.625rem;
	}

	.domain-info {
		min-width: 0;
	}

	.domain-name {
		font-size: 0.875rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.domain-status {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	.domain-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.domain-results {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.domain-result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border: 1px solid var(--card-border);
		border-radius: 0.625rem;
	}

	.domain-result-info {
		min-width: 0;
	}

	.domain-result-name {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.domain-result-price {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary-400);
		margin-top: 0.125rem;
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
		margin-bottom: 1rem;
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

	.ai-input-area {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.ai-input-area textarea {
		flex: 1;
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.625rem;
		color: inherit;
		resize: none;
		min-height: 2.75rem;
		max-height: 6rem;
		transition: all 150ms ease;
	}

	.ai-input-area textarea:focus {
		outline: none;
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 40%, transparent);
	}

	.ai-send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		background: var(--color-primary-500);
		color: white;
		border: none;
		cursor: pointer;
		transition: all 150ms ease;
		flex-shrink: 0;
	}

	.ai-send-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-primary-500) 85%, black 15%);
		transform: translateY(-1px);
	}

	.ai-send-btn:disabled {
		opacity: 0.5;
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
		padding: 0.625rem 1rem;
		font-size: 0.8125rem;
	}

	.ai-status.success {
		background: color-mix(in oklab, var(--color-success-500) 8%, transparent);
		color: var(--color-success-400);
	}

	.ai-status.error {
		background: color-mix(in oklab, var(--color-error-500) 10%, transparent);
		color: var(--color-error-400);
	}

	.draft-preview {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		border-radius: 0.75rem;
		padding: 0.875rem;
	}

	.draft-title {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
		margin-bottom: 0.5rem;
	}

	.draft-list {
		font-size: 0.8125rem;
		opacity: 0.9;
		list-style: disc;
		padding-left: 1rem;
		margin-bottom: 0.75rem;
	}

	.draft-list li {
		margin-bottom: 0.25rem;
	}

	.draft-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	/* Reset Card */
	.reset-card {
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 25%, transparent);
	}

	.reset-card .card-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.reset-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.reset-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-400);
		flex-shrink: 0;
	}

	.reset-text {
		min-width: 0;
	}

	.reset-title {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25;
	}

	.reset-desc {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}
</style>
