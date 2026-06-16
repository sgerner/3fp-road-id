<script>
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconSend from '@lucide/svelte/icons/send';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconLayout from '@lucide/svelte/icons/layout-template';
	import IconMegaphone from '@lucide/svelte/icons/megaphone';
	import IconMousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
	import IconBarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import DomainPurchasePanel from '$lib/components/groups/DomainPurchasePanel.svelte';
	import {
		createDefaultEmailDraft,
		EMAIL_TEMPLATE_PRESETS,
		renderCampaignHtml,
		renderCampaignText
	} from '$lib/groups/emailBuilder';

	let { data } = $props();

	const group = $derived(data.group ?? {});

	function createDraft() {
		return createDefaultEmailDraft(data.group, data.senderDomains || []);
	}

	function clone(value) {
		return JSON.parse(JSON.stringify(value));
	}

	function hydrateEditorFromCampaign(campaign) {
		const editorState =
			campaign?.audience_filters &&
			typeof campaign.audience_filters === 'object' &&
			campaign.audience_filters.editor &&
			typeof campaign.audience_filters.editor === 'object'
				? clone(campaign.audience_filters.editor)
				: null;
		if (editorState?.blocks?.length || editorState?.visualDesign || editorState?.visualHtml) {
			return {
				...createDraft(),
				...editorState,
				audienceStatuses: Array.isArray(campaign?.audience_filters?.statuses)
					? campaign.audience_filters.statuses
					: editorState.audienceStatuses || ['active']
			};
		}
		return createDraft();
	}

	function formatDate(value) {
		if (!value) return 'Not scheduled';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Invalid date';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function audienceCount(statuses, summary) {
		const selected = Array.isArray(statuses) && statuses.length ? statuses : ['active'];
		return selected.reduce((total, status) => total + Number(summary?.[status] || 0), 0);
	}

	const VISUAL_THEMES = [
		{
			id: '3fp',
			label: '3FP',
			background: '#15161b',
			panel: '#ffffff',
			ink: '#13151a',
			muted: '#606775',
			accent: '#e7f86a',
			accentDark: '#2f3a16',
			accentSoft: '#f4ffc2',
			border: '#d8ea72'
		},
		{
			id: 'sunrise',
			label: 'Sunrise',
			background: '#fff7ed',
			panel: '#ffffff',
			ink: '#172033',
			muted: '#667085',
			accent: '#f97316',
			accentDark: '#c2410c',
			accentSoft: '#ffedd5',
			border: '#fed7aa'
		},
		{
			id: 'cobalt',
			label: 'Cobalt',
			background: '#eff6ff',
			panel: '#ffffff',
			ink: '#0f172a',
			muted: '#475569',
			accent: '#2563eb',
			accentDark: '#1e40af',
			accentSoft: '#dbeafe',
			border: '#bfdbfe'
		},
		{
			id: 'grove',
			label: 'Grove',
			background: '#f0fdf4',
			panel: '#ffffff',
			ink: '#13251a',
			muted: '#4b6353',
			accent: '#16a34a',
			accentDark: '#166534',
			accentSoft: '#dcfce7',
			border: '#bbf7d0'
		},
		{
			id: 'noir',
			label: 'Noir',
			background: '#f8f5ef',
			panel: '#ffffff',
			ink: '#111827',
			muted: '#5b6472',
			accent: '#d97706',
			accentDark: '#111827',
			accentSoft: '#fef3c7',
			border: '#f3d99b'
		},
		{
			id: 'mint',
			label: 'Mint',
			background: '#ecfdf5',
			panel: '#ffffff',
			ink: '#052e2b',
			muted: '#55706b',
			accent: '#10b981',
			accentDark: '#047857',
			accentSoft: '#ccfbf1',
			border: '#99f6e4'
		},
		{
			id: 'cerberus',
			label: 'Cerberus',
			background: '#111827',
			panel: '#f9fafb',
			ink: '#111827',
			muted: '#4b5563',
			accent: '#f43f5e',
			accentDark: '#1f2937',
			accentSoft: '#ffe4e6',
			border: '#fecdd3'
		},
		{
			id: 'catppuccin',
			label: 'Catppuccin',
			background: '#f5e0dc',
			panel: '#fffaf8',
			ink: '#1e1e2e',
			muted: '#6c7086',
			accent: '#8839ef',
			accentDark: '#4c1d95',
			accentSoft: '#f5e0ff',
			border: '#cba6f7'
		},
		{
			id: 'nouveau',
			label: 'Nouveau',
			background: '#faf5ff',
			panel: '#ffffff',
			ink: '#2e1065',
			muted: '#6b5f7f',
			accent: '#a855f7',
			accentDark: '#6b21a8',
			accentSoft: '#f3e8ff',
			border: '#d8b4fe'
		},
		{
			id: 'rose',
			label: 'Rose',
			background: '#fff1f2',
			panel: '#ffffff',
			ink: '#4c0519',
			muted: '#7f5360',
			accent: '#e11d48',
			accentDark: '#9f1239',
			accentSoft: '#ffe4e6',
			border: '#fecdd3'
		},
		{
			id: 'sahara',
			label: 'Sahara',
			background: '#fffbeb',
			panel: '#ffffff',
			ink: '#3d2a0a',
			muted: '#7c6a4e',
			accent: '#d97706',
			accentDark: '#92400e',
			accentSoft: '#fef3c7',
			border: '#fde68a'
		},
		{
			id: 'seafoam',
			label: 'Seafoam',
			background: '#ecfeff',
			panel: '#ffffff',
			ink: '#083344',
			muted: '#52707a',
			accent: '#0891b2',
			accentDark: '#155e75',
			accentSoft: '#cffafe',
			border: '#a5f3fc'
		},
		{
			id: 'wintry',
			label: 'Wintry',
			background: '#f8fafc',
			panel: '#ffffff',
			ink: '#0f172a',
			muted: '#64748b',
			accent: '#38bdf8',
			accentDark: '#0369a1',
			accentSoft: '#e0f2fe',
			border: '#bae6fd'
		}
	];

	const VISUAL_TEMPLATES = [
		{
			id: 'newsletter',
			label: 'Monthly Newsletter',
			description: 'Hero story, three highlights, quote, and closing CTA.',
			icon: IconMegaphone
		},
		{
			id: 'event',
			label: 'Event Invite',
			description: 'Big date callout, schedule details, and RSVP button.',
			icon: IconClock3
		},
		{
			id: 'fundraiser',
			label: 'Fundraiser',
			description: 'Impact-led appeal with donation tiers and urgency.',
			icon: IconBarChart3
		},
		{
			id: 'renewal',
			label: 'Membership Renewal',
			description: 'Personal renewal reminder with benefit blocks.',
			icon: IconBadgeCheck
		},
		{
			id: 'announcement',
			label: 'Quick Announcement',
			description: 'Short, bold message with one clear action.',
			icon: IconMousePointerClick
		}
	];

	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Request failed');
		return payload?.data;
	}

	async function refreshHistory() {
		emailHistory = await api(`/api/groups/${group.slug}/membership/emails/history`);
	}

	async function refreshSenderDomains() {
		senderDomains = await api(`/api/groups/${group.slug}/email/domains`);
		if (!draft.senderDomainId) {
			draft.senderDomainId =
				senderDomains.find((row) => row.is_default)?.id || senderDomains[0]?.id || '';
		}
	}

	// ── State ──────────────────────────────────────────────────────
	let draft = $state(untrack(() => createDraft()));
	let senderDomains = $state(untrack(() => clone(data.senderDomains || [])));
	let emailHistory = $state(untrack(() => clone(data.emailHistory || [])));
	let selectedSiteDomain = $state('');
	let scheduleAt = $state('');
	let composerBusy = $state(false);
	let senderBusy = $state(false);
	let verifyingSenderId = $state('');
	let notice = $state('');
	let error = $state('');
	let senderNotice = $state('');
	let senderError = $state('');
	let copiedDns = $state('');
	let activeTab = $state('compose'); // 'compose' | 'preview' | 'history'
	let isDomainPanelUserOpen = $state(false);
	let showAdvanced = $state(false);
	let visualEditorReady = $state(false);
	let visualEditorLoading = $state(false);
	let visualEditorError = $state('');
	let selectedVisualTemplate = $state('newsletter');
	let selectedVisualTheme = $state('3fp');
	let visualEditorInstance = null;
	let senderForm = $state(
		untrack(() => ({
			domain: '',
			from_name: data.group?.name || '',
			from_local_part: 'hello',
			sender_email: '',
			reply_to_email: '',
			is_default: (data.senderDomains || []).length === 0
		}))
	);

	// ── Derived ───────────────────────────────────────────────────
	const previewHtml = $derived(
		draft.visualHtml ||
			renderCampaignHtml({
				draft,
				group,
				audienceCount: audienceCount(draft.audienceStatuses, data.audienceSummary)
			})
	);
	const previewText = $derived(renderCampaignText({ draft }));
	const selectedPreset = $derived(
		EMAIL_TEMPLATE_PRESETS.find((item) => item.id === draft.templateId) || EMAIL_TEMPLATE_PRESETS[0]
	);
	const registeredSiteDomains = $derived(
		Array.isArray(data.siteDomains)
			? data.siteDomains.map((row) => ({
					...row,
					label: row?.source === 'registered' ? `${row.domain} · purchased here` : row?.domain || ''
				}))
			: []
	);
	const selectedAudienceCount = $derived(
		audienceCount(draft.audienceStatuses, data.audienceSummary || {})
	);
	const explicitlySelectedSender = $derived(
		senderDomains.find((row) => row.id === draft.senderDomainId) || null
	);
	const selectedSender = $derived(
		explicitlySelectedSender || senderDomains.find((row) => row.is_default) || null
	);
	const senderSelectionNeedsVerification = $derived(
		Boolean(
			draft.senderDomainId &&
			(!explicitlySelectedSender || explicitlySelectedSender.ses_verified_for_sending !== true)
		)
	);
	const verifiedSenderCount = $derived(
		senderDomains.filter((row) => row.ses_verified_for_sending).length
	);
	/** True if there's at least one verified sender ready to use */
	const hasSenderReady = $derived(verifiedSenderCount > 0);
	const domainPanelOpen = $derived(senderDomains.length === 0 || isDomainPanelUserOpen);

	// ── Helpers ───────────────────────────────────────────────────
	function setComposerMessage(nextNotice = '', nextError = '') {
		notice = nextNotice;
		error = nextError;
	}
	function setSenderMessage(nextNotice = '', nextError = '') {
		senderNotice = nextNotice;
		senderError = nextError;
	}

	function loadDraftIntoVisualEditor(nextDraft) {
		if (!visualEditorInstance || !visualEditorReady) return;
		visualEditorInstance.loadDesign(
			nextDraft.visualDesign ||
				buildVisualDesign(nextDraft, nextDraft.visualTemplateId, nextDraft.visualThemeId)
		);
	}

	function loadDesignIntoVisualEditor(design) {
		if (!visualEditorInstance || !visualEditorReady) return;
		visualEditorInstance.loadDesign(clone(design));
	}

	function resetDraft() {
		draft = createDraft();
		draft.visualTemplateId = selectedVisualTemplate;
		draft.visualThemeId = selectedVisualTheme;
		loadDraftIntoVisualEditor(draft);
		setComposerMessage('', '');
	}

	function applyVisualPreset({
		templateId = selectedVisualTemplate,
		themeId = selectedVisualTheme
	} = {}) {
		selectedVisualTemplate = templateId;
		selectedVisualTheme = themeId;
		draft.visualTemplateId = templateId;
		draft.visualThemeId = themeId;
		draft.visualDesign = buildVisualDesign(draft, templateId, themeId);
		draft.visualHtml = '';
		loadDesignIntoVisualEditor(draft.visualDesign);
		setComposerMessage('Template applied. Review the design before sending.', '');
	}

	function loadUnlayerScript() {
		if (typeof window === 'undefined')
			return Promise.reject(new Error('Visual editor unavailable.'));
		if (window.unlayer) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const existing = document.querySelector('script[data-unlayer-editor]');
			if (existing) {
				existing.addEventListener('load', resolve, { once: true });
				existing.addEventListener(
					'error',
					() => reject(new Error('Unable to load visual editor.')),
					{ once: true }
				);
				return;
			}
			const script = document.createElement('script');
			script.src = 'https://editor.unlayer.com/embed.js';
			script.async = true;
			script.dataset.unlayerEditor = 'true';
			script.onload = resolve;
			script.onerror = () => reject(new Error('Unable to load visual editor.'));
			document.head.appendChild(script);
		});
	}

	function textContent(html, color, size = 16, extra = {}) {
		return {
			type: 'text',
			values: {
				text: html,
				color,
				fontSize: `${size}px`,
				lineHeight: '170%',
				textAlign: 'left',
				...extra
			}
		};
	}

	function headingContent(text, color, size = 34, extra = {}) {
		return {
			type: 'heading',
			values: {
				text,
				color,
				size,
				lineHeight: '115%',
				textAlign: 'left',
				...extra
			}
		};
	}

	function buttonContent(text, href, theme, extra = {}) {
		return {
			type: 'button',
			values: {
				text,
				href: { name: 'web', values: { href: href || group.website_url || '' } },
				buttonColors: { color: '#ffffff', backgroundColor: theme.accent },
				borderRadius: '999px',
				padding: '14px 24px',
				textAlign: 'left',
				...extra
			}
		};
	}

	function dividerContent(theme) {
		return {
			type: 'divider',
			values: {
				border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: theme.border },
				padding: '18px 0'
			}
		};
	}

	function row(contents, theme, values = {}) {
		return {
			cells: [1],
			columns: [{ contents }],
			values: {
				padding: '28px 34px',
				backgroundColor: theme.panel,
				borderRadius: '24px',
				...values
			}
		};
	}

	function twoColumnRow(leftContents, rightContents, theme, values = {}) {
		return {
			cells: [1, 1],
			columns: [{ contents: leftContents }, { contents: rightContents }],
			values: {
				padding: '26px 30px',
				backgroundColor: theme.panel,
				borderRadius: '24px',
				...values
			}
		};
	}

	function buildTemplateRows(templateId, sourceDraft, theme) {
		const groupName = group.name || 'Your group';
		const siteUrl = group.website_url || '';
		const subject = sourceDraft.subject || `${groupName} update for {{first_name}}`;
		const preheader = sourceDraft.preheader || 'A polished update for your members.';
		const hero = row(
			[
				textContent(
					`<p style="letter-spacing:0.18em;text-transform:uppercase;font-weight:800;margin:0;">${groupName}</p>`,
					theme.accent,
					12
				),
				headingContent(subject, theme.ink, 42),
				textContent(`<p>${preheader}</p>`, theme.muted, 17),
				buttonContent('Take the next step', siteUrl, theme)
			],
			theme,
			{
				padding: '42px 44px',
				backgroundColor: theme.id === 'noir' ? theme.accentDark : theme.accentSoft
			}
		);

		if (templateId === 'event') {
			return [
				hero,
				twoColumnRow(
					[
						textContent(
							'<p style="margin:0;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">When</p>',
							theme.accent,
							12
						),
						headingContent('Saturday, 8:00 AM', theme.ink, 30),
						textContent(
							'<p>Meet at the usual rollout spot. Bring lights, water, and a friend who has been meaning to join.</p>',
							theme.muted
						)
					],
					[
						textContent(
							'<p style="margin:0;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">What to expect</p>',
							theme.accent,
							12
						),
						textContent(
							'<p><strong>Route:</strong> 32 miles<br><strong>Pace:</strong> Conversational<br><strong>After:</strong> Coffee and member check-in</p>',
							theme.muted
						)
					],
					theme
				),
				row(
					[
						headingContent('RSVP so organizers can plan', theme.ink, 28),
						textContent(
							'<p>Reply yes, update your availability, or share this invite with someone who should be there.</p>',
							theme.muted
						),
						buttonContent('RSVP now', siteUrl, theme)
					],
					theme
				)
			];
		}

		if (templateId === 'fundraiser') {
			return [
				hero,
				row(
					[
						headingContent('Your support turns into real community capacity', theme.ink, 30),
						textContent(
							'<p>Every contribution helps cover safer routes, volunteer supplies, rider support, and the small details that make the group feel welcoming.</p>',
							theme.muted
						)
					],
					theme
				),
				twoColumnRow(
					[
						headingContent('$25', theme.accent, 34),
						textContent('<p>Covers ride snacks and hydration for new riders.</p>', theme.muted)
					],
					[
						headingContent('$100', theme.accent, 34),
						textContent(
							'<p>Funds tools, signage, and safety supplies for a full event.</p>',
							theme.muted
						)
					],
					theme,
					{ backgroundColor: theme.accentSoft }
				),
				row(
					[
						headingContent('Help keep momentum going', theme.ink, 28),
						buttonContent('Donate today', siteUrl, theme)
					],
					theme
				)
			];
		}

		if (templateId === 'renewal') {
			return [
				hero,
				row(
					[
						headingContent('{{first_name}}, your membership keeps this rolling', theme.ink, 30),
						textContent(
							'<p>Your renewal helps sustain events, volunteer coordination, member communications, and the shared infrastructure behind every gathering.</p>',
							theme.muted
						)
					],
					theme
				),
				twoColumnRow(
					[
						textContent('<p style="font-size:28px;margin:0;">✓</p>', theme.accent),
						headingContent('Stay connected', theme.ink, 24),
						textContent('<p>Keep member updates, perks, and invitations coming.</p>', theme.muted)
					],
					[
						textContent('<p style="font-size:28px;margin:0;">✓</p>', theme.accent),
						headingContent('Support the work', theme.ink, 24),
						textContent(
							'<p>Fund the organizers, hosts, and tools behind the scenes.</p>',
							theme.muted
						)
					],
					theme
				),
				row([buttonContent('Renew membership', siteUrl, theme)], theme, {
					backgroundColor: theme.accentDark
				})
			];
		}

		if (templateId === 'announcement') {
			return [
				hero,
				row(
					[
						headingContent('The short version', theme.ink, 30),
						textContent(
							'<p>Use this section for the one thing members need to know. Keep it direct, useful, and easy to act on.</p>',
							theme.muted
						),
						dividerContent(theme),
						buttonContent('Read the update', siteUrl, theme)
					],
					theme
				)
			];
		}

		return [
			hero,
			twoColumnRow(
				[
					headingContent('{{audience_count}}', theme.accent, 34),
					textContent('<p>Members receiving this update.</p>', theme.muted)
				],
				[
					headingContent('{{upcoming_ride_count}}', theme.accent, 34),
					textContent('<p>Upcoming rides and programs to highlight.</p>', theme.muted)
				],
				theme
			),
			row(
				[
					headingContent('What members should know', theme.ink, 30),
					textContent(
						'<p>Lead with the story, deadline, or opportunity. Use merge tags like {{first_name}}, {{membership_tier}}, and {{renewal_date}} to make it personal.</p>',
						theme.muted
					)
				],
				theme
			),
			row(
				[
					textContent(
						'<p style="font-size:22px;line-height:1.55;margin:0;">“Add a member quote, organizer note, or short testimonial to make the update feel human.”</p>',
						theme.ink,
						22
					),
					textContent('<p><strong>Organizer note</strong></p>', theme.muted, 14)
				],
				theme,
				{ borderLeft: `6px solid ${theme.accent}` }
			),
			row(
				[
					headingContent('One clear next step', theme.ink, 28),
					textContent(
						'<p>Close with the action you want members to take after reading.</p>',
						theme.muted
					),
					buttonContent('Open the full update', siteUrl, theme)
				],
				theme
			)
		];
	}

	function buildVisualDesign(
		sourceDraft = draft,
		templateId = selectedVisualTemplate,
		themeId = selectedVisualTheme
	) {
		const theme = VISUAL_THEMES.find((item) => item.id === themeId) || VISUAL_THEMES[0];
		return {
			body: {
				rows: buildTemplateRows(templateId, sourceDraft, theme),
				values: {
					backgroundColor: theme.background,
					contentWidth: '720px',
					fontFamily: { label: 'Helvetica', value: 'helvetica,sans-serif' }
				}
			},
			counters: {},
			schemaVersion: 21
		};
	}

	async function initVisualEditor() {
		if (visualEditorReady || visualEditorLoading || typeof window === 'undefined') return;
		try {
			visualEditorLoading = true;
			visualEditorError = '';
			await loadUnlayerScript();
			window.unlayer.init({
				id: 'group-email-visual-editor',
				displayMode: 'email',
				devices: ['desktop', 'mobile'],
				defaultDevice: 'desktop',
				appearance: { theme: 'modern_light' },
				features: {
					preview: {
						enabled: true,
						deviceResolutions: { showDefaultResolutions: true }
					}
				},
				tools: {
					menu: { enabled: false },
					social: { enabled: false }
				}
			});
			visualEditorInstance = window.unlayer;
			draft.visualTemplateId ||= selectedVisualTemplate;
			draft.visualThemeId ||= selectedVisualTheme;
			visualEditorInstance.loadDesign(
				draft.visualDesign || buildVisualDesign(draft, draft.visualTemplateId, draft.visualThemeId)
			);
			visualEditorReady = true;
		} catch (e) {
			visualEditorError = e?.message || 'Unable to load visual editor.';
		} finally {
			visualEditorLoading = false;
		}
	}

	function exportVisualEmail() {
		if (!visualEditorInstance || !visualEditorReady) return Promise.resolve();
		return new Promise((resolve, reject) => {
			visualEditorInstance.exportHtml((output) => {
				if (!output?.html) {
					reject(new Error('Visual editor did not return email HTML.'));
					return;
				}
				draft.visualDesign = output.design;
				draft.visualHtml = output.html;
				draft.visualTemplateId = selectedVisualTemplate;
				draft.visualThemeId = selectedVisualTheme;
				draft.blocks = [];
				resolve(output);
			});
		});
	}

	async function selectTab(tabId) {
		if (tabId === 'preview') {
			try {
				await exportVisualEmail();
			} catch (e) {
				setComposerMessage('', e?.message || 'Unable to update preview.');
				return;
			}
		}
		activeTab = tabId;
	}

	onMount(() => {
		initVisualEditor();
	});

	function duplicateCampaign(campaign) {
		draft = hydrateEditorFromCampaign(campaign);
		selectedVisualTemplate = draft.visualTemplateId || selectedVisualTemplate;
		selectedVisualTheme = draft.visualThemeId || selectedVisualTheme;
		loadDraftIntoVisualEditor(draft);
		activeTab = 'compose';
		setComposerMessage('Campaign loaded into the composer.', '');
	}

	function applySelectedSiteDomain() {
		if (!selectedSiteDomain) return;
		const currentEmail = String(senderForm.sender_email || '').trim();
		const localPart = currentEmail.includes('@')
			? currentEmail.slice(0, currentEmail.lastIndexOf('@'))
			: currentEmail || 'hello';
		senderForm.sender_email = `${localPart}@${selectedSiteDomain}`;
		setSenderMessage('', '');
	}

	function buildSenderDomainPayload() {
		const senderEmail = String(senderForm.sender_email || '')
			.trim()
			.toLowerCase();
		const atIndex = senderEmail.lastIndexOf('@');
		if (!senderEmail || atIndex <= 0 || atIndex === senderEmail.length - 1) {
			throw new Error('Enter a complete sender email address.');
		}
		const fromLocalPart = senderEmail.slice(0, atIndex);
		const emailDomain = senderEmail.slice(atIndex + 1);
		const { sender_email, ...payload } = senderForm;
		return {
			...payload,
			domain: emailDomain,
			from_local_part: fromLocalPart,
			reply_to_email: senderEmail
		};
	}

	async function createCampaignRecord() {
		await exportVisualEmail();
		const payload = {
			campaign_name: draft.campaignName,
			subject_template: draft.subject,
			body_template: previewHtml,
			audience_filters: {
				statuses: draft.audienceStatuses,
				sender_domain_id: draft.senderDomainId || null,
				editor: { ...clone(draft), rendered_text: previewText }
			}
		};
		return api(`/api/groups/${group.slug}/membership/emails`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	}

	async function saveDraft() {
		try {
			composerBusy = true;
			setComposerMessage('', '');
			await createCampaignRecord();
			await refreshHistory();
			setComposerMessage('Draft saved.', '');
		} catch (e) {
			setComposerMessage('', e?.message || 'Unable to save draft.');
		} finally {
			composerBusy = false;
		}
	}

	async function sendNow() {
		if (senderSelectionNeedsVerification) {
			setComposerMessage('', 'Verify the selected sender domain first.');
			return;
		}
		try {
			composerBusy = true;
			setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/send-now`, {
				method: 'POST'
			});
			await refreshHistory();
			setComposerMessage('Campaign sent successfully.', '');
		} catch (e) {
			setComposerMessage('', e?.message || 'Unable to send campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function scheduleSend() {
		if (!scheduleAt) {
			setComposerMessage('', 'Choose a send time first.');
			return;
		}
		if (senderSelectionNeedsVerification) {
			setComposerMessage('', 'Verify the selected sender domain first.');
			return;
		}
		try {
			composerBusy = true;
			setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/schedule`, {
				method: 'POST',
				body: JSON.stringify({ scheduled_at: new Date(scheduleAt).toISOString() })
			});
			await refreshHistory();
			setComposerMessage('Campaign scheduled.', '');
		} catch (e) {
			setComposerMessage('', e?.message || 'Unable to schedule campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function sendExistingCampaign(campaignId) {
		try {
			composerBusy = true;
			setComposerMessage('', '');
			await api(`/api/groups/${group.slug}/membership/emails/${campaignId}/send-now`, {
				method: 'POST'
			});
			await refreshHistory();
			setComposerMessage('Campaign sent.', '');
		} catch (e) {
			setComposerMessage('', e?.message || 'Unable to send campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function verifySenderDomain(senderId) {
		try {
			verifyingSenderId = senderId;
			setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains/${senderId}/verify`, { method: 'POST' });
			await refreshSenderDomains();
			setSenderMessage('Sender domain verified.', '');
		} catch (e) {
			setSenderMessage('', e?.message || 'Unable to verify.');
		} finally {
			verifyingSenderId = '';
		}
	}

	async function saveSenderDomain() {
		try {
			senderBusy = true;
			setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains`, {
				method: 'POST',
				body: JSON.stringify(buildSenderDomainPayload())
			});
			if (senderDomains.length === 0) {
				isDomainPanelUserOpen = true;
			}
			await refreshSenderDomains();
			senderForm = {
				domain: '',
				from_name: group.name || '',
				from_local_part: 'hello',
				sender_email: '',
				reply_to_email: '',
				is_default: false
			};
			setSenderMessage('Sender domain synced with AWS.', '');
		} catch (e) {
			setSenderMessage('', e?.message || 'Unable to save sender domain.');
		} finally {
			senderBusy = false;
		}
	}

	async function copyDnsValue(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			copiedDns = key;
			setTimeout(() => {
				if (copiedDns === key) copiedDns = '';
			}, 1200);
		} catch {
			setSenderMessage('', 'Unable to copy DNS value.');
		}
	}
</script>

<svelte:head>
	<title>Email | {group.name}</title>
</svelte:head>

<div class="space-y-3 pb-10">
	<!-- ══ STUDIO CARD ══════════════════════════════════════════════ -->
	<div class="card bg-surface-50-950 border-surface-200-800 overflow-hidden border">
		<!-- Studio header -->
		<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b px-4 py-3">
			<div class="flex items-center gap-3">
				<div class="bg-primary-500/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
					<IconMail class="text-primary-400 h-4 w-4" />
				</div>
				<div>
					<h2 class="text-sm font-semibold">Email Studio</h2>
					<p class="text-surface-400-600 text-xs">
						{#if selectedSender}
							Sending from <span class="text-primary-400 font-medium"
								>{selectedSender.from_email_address}</span
							>
							· {selectedAudienceCount} recipients
						{:else if senderDomains.length > 0}
							No verified sender · {selectedAudienceCount} recipients
						{:else}
							Set up a sender domain to start sending
						{/if}
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Sender domain status indicator -->
				{#if verifiedSenderCount > 0}
					<span class="chip preset-tonal-success text-xs">
						<IconBadgeCheck class="h-3 w-3" />
						{verifiedSenderCount} sender{verifiedSenderCount > 1 ? 's' : ''} ready
					</span>
				{:else if senderDomains.length > 0}
					<span class="chip preset-tonal-warning text-xs">
						<IconTriangleAlert class="h-3 w-3" />
						Verification pending
					</span>
				{/if}

				<!-- Settings / domain config button -->
				{#if senderDomains.length > 0}
					<button
						type="button"
						class="btn btn-sm {isDomainPanelUserOpen
							? 'preset-filled-surface-500'
							: 'preset-tonal-surface'}"
						onclick={() => (isDomainPanelUserOpen = !isDomainPanelUserOpen)}
						title="Sender domain settings"
					>
						<IconSettings
							class="h-4 w-4 {isDomainPanelUserOpen
								? 'rotate-45'
								: ''} transition-transform duration-200"
						/>
					</button>
				{/if}
			</div>
		</div>

		<!-- ── DOMAIN CONFIG PANEL (slide-down) ──────────────────── -->
		{#if domainPanelOpen}
			<div class="border-surface-200-800 border-b" transition:slide={{ duration: 200 }}>
				<div class="space-y-5 p-4 sm:p-5">
					<!-- Intro if no domains yet -->
					{#if senderDomains.length === 0}
						<div class="bg-primary-500/5 border-primary-500/20 rounded-lg border p-4">
							<p class="text-sm font-medium">Add a sender domain to start sending campaigns</p>
							<p class="text-surface-400-600 mt-1 text-xs">
								AWS SES requires a verified domain. Once set up, recipients will see your domain
								name as the sender instead of a generic address.
							</p>
						</div>
					{/if}

					{#if senderNotice}
						<div class="preset-tonal-success flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconCheck class="h-4 w-4 shrink-0" />
							{senderNotice}
						</div>
					{/if}
					{#if senderError}
						<div class="preset-tonal-error flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconTriangleAlert class="h-4 w-4 shrink-0" />
							{senderError}
						</div>
					{/if}

					<!-- Add domain form -->
					<div>
						<p class="text-surface-600-400 mb-3 text-xs font-semibold uppercase tracking-wide">
							{senderDomains.length > 0 ? 'Add another domain' : 'Configure sender domain'}
						</p>

						{#if registeredSiteDomains.length}
							<div class="mb-3 flex gap-2">
								<select class="select flex-1 text-sm" bind:value={selectedSiteDomain}>
									<option value="">Quick-fill from a site domain…</option>
									{#each registeredSiteDomains as domainRow}
										<option value={domainRow.domain}>{domainRow.label}</option>
									{/each}
								</select>
								<button
									class="btn preset-tonal-primary btn-sm"
									type="button"
									disabled={!selectedSiteDomain}
									onclick={applySelectedSiteDomain}
								>
									Use
								</button>
							</div>
						{/if}

						<div class="grid gap-3 sm:grid-cols-2">
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">From name</span>
								<input
									class="input w-full text-sm"
									bind:value={senderForm.from_name}
									placeholder={group.name}
								/>
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium"
									>From and reply-to address</span
								>
								<input
									class="input w-full text-sm"
									bind:value={senderForm.sender_email}
									placeholder="organizers@yourgroup.org"
								/>
								<span class="text-surface-400-600 block text-xs">
									Recipients see this as the From address, and replies go to the same inbox.
								</span>
							</label>
						</div>
						<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
							<label class="flex cursor-pointer items-center gap-2 text-sm">
								<input type="checkbox" class="checkbox" bind:checked={senderForm.is_default} />
								Make default sender
							</label>
							<button
								class="btn preset-filled-primary-500"
								type="button"
								disabled={senderBusy}
								onclick={saveSenderDomain}
							>
								<IconGlobe class="h-4 w-4" />
								Sync with AWS
							</button>
						</div>
					</div>

					<!-- Buy domain -->
					<div class="border-surface-200-800 border-t pt-4">
						<DomainPurchasePanel
							groupSlug={group.slug}
							initialSearchQuery={group.slug || ''}
							defaultContact={{
								email: group.public_contact_email || group.contact_email || '',
								city: group.city || '',
								state: group.state_region || '',
								country: 'US'
							}}
							returnPath={`/groups/${group.slug}/manage/email?domain_payment=return`}
							title="Buy New Domain"
						/>
					</div>

					<!-- Existing domains list -->
					{#if senderDomains.length > 0}
						<div class="border-surface-200-800 space-y-3 border-t pt-4">
							<div class="flex items-center justify-between">
								<p class="text-surface-600-400 text-xs font-semibold uppercase tracking-wide">
									Configured domains
								</p>
								<button
									class="btn preset-tonal-surface btn-sm"
									type="button"
									onclick={refreshSenderDomains}
								>
									<IconRefreshCw class="h-3.5 w-3.5" /> Refresh
								</button>
							</div>
							{#each senderDomains as sender}
								<div class="bg-surface-100-900 border-surface-200-800 rounded-lg border p-3">
									<div class="mb-2 flex flex-wrap items-start justify-between gap-2">
										<div>
											<div class="flex flex-wrap items-center gap-1.5">
												<span class="text-sm font-semibold">{sender.domain}</span>
												{#if sender.is_default}<span class="chip preset-tonal-surface text-xs"
														>Default</span
													>{/if}
												<span
													class="chip text-xs {sender.ses_verified_for_sending
														? 'preset-tonal-success'
														: sender.status === 'failed'
															? 'preset-tonal-error'
															: 'preset-tonal-warning'}"
												>
													{#if sender.ses_verified_for_sending}<IconBadgeCheck
															class="h-3 w-3"
														/>{/if}
													{sender.ses_verified_for_sending
														? 'Verified'
														: sender.status || 'Pending'}
												</span>
											</div>
											<p class="text-surface-400-600 mt-0.5 text-xs">{sender.from_email_address}</p>
										</div>
										<button
											class="btn preset-tonal-surface btn-sm"
											type="button"
											disabled={verifyingSenderId === sender.id}
											onclick={() => verifySenderDomain(sender.id)}
										>
											<IconRefreshCw
												class="h-3.5 w-3.5 {verifyingSenderId === sender.id ? 'animate-spin' : ''}"
											/> Verify
										</button>
									</div>

									<!-- DNS badges -->
									<div class="mb-2 flex flex-wrap gap-1.5 text-xs">
										<span class="bg-surface-200-800 rounded px-2 py-0.5"
											>DKIM: <strong>{sender.ses_dkim_status || 'pending'}</strong></span
										>
										<span class="bg-surface-200-800 rounded px-2 py-0.5"
											>MAIL FROM: <strong>{sender.ses_mail_from_status || 'pending'}</strong></span
										>
										<span class="bg-surface-200-800 rounded px-2 py-0.5">
											Vercel DNS: <strong
												>{sender?.verification_details?.vercel_dns?.registered_via_vercel
													? (sender?.verification_details?.vercel_dns?.status ?? 'pending')
													: 'manual'}</strong
											>
										</span>
									</div>

									{#if sender?.verification_details?.vercel_dns?.status === 'failed' && sender?.verification_details?.vercel_dns?.error}
										<div
											class="preset-tonal-error mb-2 flex items-center gap-2 rounded p-2 text-xs"
										>
											<IconTriangleAlert class="h-3.5 w-3.5 shrink-0" />
											{sender.verification_details.vercel_dns.error}
										</div>
									{/if}

									{#if sender.dns_records?.length}
										<div
											class="preset-tonal-warning mb-2 flex items-start gap-2 rounded-lg p-3 text-xs"
										>
											<IconTriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
											<span>
												Manual DNS setup required: add each record below at your DNS provider, then
												click Verify. If Vercel DNS shows connected, these may already be managed
												for you.
											</span>
										</div>
										<div class="overflow-x-auto">
											<table class="w-full text-xs">
												<thead>
													<tr class="text-surface-400-600 border-surface-200-800 border-b">
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide"
															>Type</th
														>
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide"
															>Name</th
														>
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide"
															>Value</th
														>
														<th class="pb-1"></th>
													</tr>
												</thead>
												<tbody>
													{#each sender.dns_records as record}
														<tr class="border-surface-200-800 border-b last:border-0">
															<td class="py-1.5 pr-3 font-mono">{record.type}</td>
															<td class="py-1.5 pr-3 font-mono opacity-80">{record.name}</td>
															<td class="max-w-[160px] break-all py-1.5 pr-3 font-mono opacity-60"
																>{record.value}</td
															>
															<td class="py-1.5">
																<button
																	type="button"
																	class="btn preset-tonal-surface btn-sm"
																	onclick={() =>
																		copyDnsValue(record.value, `${sender.id}-${record.id}`)}
																>
																	{#if copiedDns === `${sender.id}-${record.id}`}
																		<IconCheck class="h-3.5 w-3.5" /> Copied
																	{:else}
																		<IconCopy class="h-3.5 w-3.5" /> Copy
																	{/if}
																</button>
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── TABS AND CONTENT (only shown once sender domain exists) ── -->
		{#if senderDomains.length > 0}
			<nav
				class="border-surface-200-800 flex overflow-x-auto border-b"
				style="scrollbar-width: none;"
			>
				{#each [{ id: 'compose', label: 'Compose', icon: IconSquarePen }, { id: 'preview', label: 'Preview', icon: IconLayout }, { id: 'history', label: `History${emailHistory.length ? ` (${emailHistory.length})` : ''}`, icon: IconClock3 }] as tab}
					{@const Icon = tab.icon}
					{@const isActive = activeTab === tab.id}
					<button
						type="button"
						class="flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all
							{isActive
							? 'border-primary-500 text-primary-400'
							: 'border-transparent text-surface-400-600 hover:text-surface-900-50'}"
						onclick={() => selectTab(tab.id)}
					>
						<Icon class="h-4 w-4" />
						{tab.label}
					</button>
				{/each}
			</nav>

			<!-- ══ COMPOSE ══════════════════════════════════════════════ -->
			{#if activeTab === 'compose'}
				<div class="space-y-4 bg-surface-100-900/40 p-4 sm:p-5">
					<!-- Banners -->
					{#if notice}
						<div class="preset-tonal-success flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconCheck class="h-4 w-4 shrink-0" />
							{notice}
						</div>
					{/if}
					{#if error}
						<div class="preset-tonal-error flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconTriangleAlert class="h-4 w-4 shrink-0" />
							{error}
						</div>
					{/if}
					{#if senderSelectionNeedsVerification}
						<div class="preset-tonal-warning flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconTriangleAlert class="h-4 w-4 shrink-0" />
							The selected sender isn't verified yet.
							<button type="button" class="underline" onclick={() => (isDomainPanelUserOpen = true)}
								>Open settings →</button
							>
						</div>
					{/if}

					<div
						class="border-surface-200-800 overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-surface-950"
					>
						<div
							class="border-surface-200-800 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
						>
							<div class="flex items-center gap-3">
								<div
									class="bg-primary-500/10 flex h-10 w-10 items-center justify-center rounded-full"
								>
									<IconMail class="h-5 w-5 text-primary-500" />
								</div>
								<div>
									<p class="text-xs font-semibold uppercase tracking-wide text-surface-500">
										Compose message
									</p>
									<p class="text-sm font-medium">
										{#if selectedSender}
											From {selectedSender.from_email_address}
										{:else}
											Choose a sender before sending
										{/if}
									</p>
								</div>
							</div>
							<button
								class="btn preset-tonal-surface btn-sm"
								type="button"
								onclick={() => selectTab('preview')}
							>
								<IconLayout class="h-4 w-4" /> Preview
							</button>
						</div>

						<label class="grid gap-2 px-4 py-3 sm:grid-cols-[5rem_1fr] sm:items-center">
							<span class="text-xs font-semibold uppercase tracking-wide text-surface-500"
								>Subject</span
							>
							<input
								class="w-full border-0 bg-transparent text-base font-medium outline-none placeholder:text-surface-400"
								bind:value={draft.subject}
								maxlength="300"
								placeholder="What's this email about?"
							/>
						</label>
					</div>

					<!-- Audience chips -->
					<div class="space-y-2">
						<span class="text-surface-600-400 text-xs font-semibold uppercase tracking-wide"
							>Send to</span
						>
						<div class="flex flex-wrap gap-2">
							{#each ['active', 'past_due', 'cancelled'] as status}
								<label
									class="flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all
									{draft.audienceStatuses.includes(status)
										? 'border-primary-500/50 bg-primary-500/10 text-primary-300'
										: 'border-surface-200-800 bg-surface-100-900 text-surface-600-400'}"
								>
									<input
										type="checkbox"
										class="hidden"
										checked={draft.audienceStatuses.includes(status)}
										onchange={(e) => {
											if (e.currentTarget.checked)
												draft.audienceStatuses = [...new Set([...draft.audienceStatuses, status])];
											else
												draft.audienceStatuses = draft.audienceStatuses.filter((s) => s !== status);
										}}
									/>
									{#if draft.audienceStatuses.includes(status)}<IconCheck
											class="h-3.5 w-3.5"
										/>{/if}
									<span class="capitalize">{status.replace('_', ' ')}</span>
									<span class="font-bold">{data.audienceSummary?.[status] || 0}</span>
								</label>
							{/each}
						</div>
						<p class="text-surface-400-600 text-xs">{selectedAudienceCount} recipients</p>
					</div>

					<div
						class="border-surface-200-800 overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-surface-950"
					>
						<div
							class="border-surface-200-800 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
						>
							<div>
								<p class="text-sm font-semibold">Visual email builder</p>
								<p class="text-surface-400-600 text-xs">
									Drag in content blocks, edit the design, then save, schedule, or send.
								</p>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								{#if visualEditorReady}
									<span class="chip preset-tonal-success text-xs">
										<IconBadgeCheck class="h-3 w-3" /> Builder ready
									</span>
								{:else if visualEditorLoading}
									<span class="chip preset-tonal-warning text-xs">
										<IconRefreshCw class="h-3 w-3 animate-spin" /> Loading builder
									</span>
								{/if}
							</div>
						</div>
						<div
							class="border-surface-200-800 grid gap-4 border-b bg-surface-50-950 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]"
						>
							<div>
								<div class="mb-3 flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold">Start from a template</p>
										<p class="text-surface-400-600 text-xs">
											Choose the email shape first, then customize in the builder.
										</p>
									</div>
								</div>
								<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
									{#each VISUAL_TEMPLATES as template}
										{@const TemplateIcon = template.icon}
										<button
											type="button"
											class="border-surface-200-800 hover:border-primary-500/40 hover:bg-primary-500/5 cursor-pointer rounded-xl border bg-white p-3 text-left transition-colors dark:bg-surface-900
											{selectedVisualTemplate === template.id ? 'border-primary-500/60 ring-primary-500/20 ring-2' : ''}"
											onclick={() => applyVisualPreset({ templateId: template.id })}
										>
											<span
												class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500"
											>
												<TemplateIcon class="h-4 w-4" />
											</span>
											<span class="block text-sm font-semibold">{template.label}</span>
											<span class="text-surface-400-600 block text-xs">{template.description}</span>
										</button>
									{/each}
								</div>
							</div>

							<div>
								<p class="mb-3 text-sm font-semibold">Theme style</p>
								<div class="flex flex-wrap gap-2">
									{#each VISUAL_THEMES as theme}
										<button
											type="button"
											class="border-surface-200-800 hover:border-primary-500/40 cursor-pointer rounded-xl border bg-white p-2 text-left transition-colors dark:bg-surface-900
											{selectedVisualTheme === theme.id ? 'border-primary-500/60 ring-primary-500/20 ring-2' : ''}"
											onclick={() => applyVisualPreset({ themeId: theme.id })}
											title={theme.label}
										>
											<span class="flex overflow-hidden rounded-lg border border-black/10">
												<span class="h-8 w-8" style="background:{theme.background}"></span>
												<span class="h-8 w-8" style="background:{theme.accent}"></span>
												<span class="h-8 w-8" style="background:{theme.ink}"></span>
											</span>
											<span class="mt-1 block text-center text-[11px] font-semibold"
												>{theme.label}</span
											>
										</button>
									{/each}
								</div>
							</div>
						</div>
						{#if visualEditorError}
							<div
								class="preset-tonal-error m-4 flex items-center justify-between gap-3 rounded-lg p-3 text-sm"
							>
								<span class="flex items-center gap-2">
									<IconTriangleAlert class="h-4 w-4 shrink-0" />
									{visualEditorError}
								</span>
								<button
									class="btn preset-tonal-surface btn-sm"
									type="button"
									onclick={initVisualEditor}
								>
									Retry
								</button>
							</div>
						{/if}
						<div class="relative overflow-hidden bg-white">
							{#if visualEditorLoading}
								<div
									class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-surface-500"
								>
									<IconRefreshCw class="mr-2 h-4 w-4 animate-spin" /> Loading visual editor...
								</div>
							{/if}
							<div id="group-email-visual-editor" class="h-[78vh] min-h-[760px] w-full"></div>
						</div>
					</div>

					<!-- Advanced settings (campaign name, template, sender, preheader) -->
					<div class="border-surface-200-800 overflow-hidden rounded-xl border">
						<button
							type="button"
							class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
							onclick={() => (showAdvanced = !showAdvanced)}
						>
							<span>Advanced settings</span>
							<IconChevronDown
								class="h-4 w-4 opacity-50 transition-transform duration-200 {showAdvanced
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if showAdvanced}
							<div
								class="border-surface-200-800 grid gap-3 border-t p-4 sm:grid-cols-2"
								transition:slide={{ duration: 150 }}
							>
								<label class="space-y-1">
									<span class="text-surface-600-400 text-xs font-medium">Campaign name</span>
									<input
										class="input w-full text-sm"
										bind:value={draft.campaignName}
										maxlength="120"
										placeholder="e.g. June newsletter"
									/>
								</label>
								<label class="space-y-1">
									<span class="text-surface-600-400 text-xs font-medium">Preheader</span>
									<input
										class="input w-full text-sm"
										bind:value={draft.preheader}
										maxlength="180"
										placeholder="Preview text in inbox"
									/>
								</label>
								<label class="space-y-1">
									<span class="text-surface-600-400 text-xs font-medium">Template</span>
									<select class="select w-full text-sm" bind:value={draft.templateId}>
										{#each EMAIL_TEMPLATE_PRESETS as preset}
											<option value={preset.id}>{preset.label}</option>
										{/each}
									</select>
								</label>
								<label class="space-y-1">
									<span class="text-surface-600-400 text-xs font-medium">Sender domain</span>
									<select class="select w-full text-sm" bind:value={draft.senderDomainId}>
										<option value="">Default SES sender</option>
										{#each senderDomains as sender}
											<option value={sender.id} disabled={!sender.ses_verified_for_sending}>
												{sender.domain}
												{sender.ses_verified_for_sending ? '· verified' : '· pending'}
											</option>
										{/each}
									</select>
								</label>
								{#if selectedPreset}
									<div
										class="border-surface-200-800 col-span-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
									>
										<div>
											<p class="text-sm font-medium">{selectedPreset.label}</p>
											<p class="text-surface-400-600 text-xs">{selectedPreset.description}</p>
										</div>
										<div class="flex gap-1.5">
											<span
												class="h-4 w-4 rounded-full"
												style="background:{selectedPreset.colors.accent}"
											></span>
											<span
												class="h-4 w-4 rounded-full"
												style="background:{selectedPreset.colors.accentSoft}"
											></span>
											<span
												class="h-4 w-4 rounded-full"
												style="background:{selectedPreset.colors.ink}"
											></span>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Action bar -->
					<div class="border-surface-200-800 flex flex-wrap items-center gap-2 border-t pt-4">
						<button
							class="btn preset-tonal-surface btn-sm"
							type="button"
							disabled={composerBusy}
							onclick={resetDraft}
						>
							<IconSparkles class="h-4 w-4" /> New draft
						</button>
						<button
							class="btn preset-tonal-surface"
							type="button"
							disabled={composerBusy}
							onclick={saveDraft}
						>
							<IconSquarePen class="h-4 w-4" /> Save draft
						</button>
						<div class="ml-auto flex flex-wrap items-center gap-2">
							<div class="flex items-center gap-1.5">
								<input type="datetime-local" class="input text-sm" bind:value={scheduleAt} />
								<button
									class="btn preset-tonal-surface"
									type="button"
									disabled={composerBusy}
									onclick={scheduleSend}
								>
									<IconClock3 class="h-4 w-4" /> Schedule
								</button>
							</div>
							<button
								class="btn preset-filled-primary-500"
								type="button"
								disabled={composerBusy}
								onclick={sendNow}
							>
								<IconSend class="h-4 w-4" /> Send now
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- ══ PREVIEW ══════════════════════════════════════════════ -->
			{#if activeTab === 'preview'}
				<div class="p-4 sm:p-5">
					<div
						class="border-surface-200-800 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
					>
						<div class="flex flex-wrap gap-2">
							<span class="text-surface-400-600">Subject:</span>
							<span class="font-medium">{draft.subject || '(no subject)'}</span>
						</div>
						<div class="flex flex-wrap gap-3 text-surface-400-600">
							<span>{selectedAudienceCount} recipients</span>
							{#if selectedSender}
								<span>from {selectedSender.from_email_address}</span>
							{:else}
								<span>default SES sender</span>
							{/if}
						</div>
					</div>
					<div class="border-surface-200-800 overflow-hidden rounded-xl border bg-white">
						<iframe
							title="Email preview"
							srcdoc={previewHtml}
							class="w-full"
							style="min-height:560px;border:0;background:white;"
						></iframe>
					</div>
				</div>
			{/if}

			<!-- ══ HISTORY ══════════════════════════════════════════════ -->
			{#if activeTab === 'history'}
				<div class="p-4 sm:p-5">
					<div class="mb-4 flex items-center justify-between">
						<p class="text-surface-400-600 text-sm">
							Duplicate any campaign to load it back into the composer.
						</p>
						<button class="btn preset-tonal-surface btn-sm" type="button" onclick={refreshHistory}>
							<IconRefreshCw class="h-3.5 w-3.5" /> Refresh
						</button>
					</div>

					{#if notice}
						<div class="preset-tonal-success mb-4 flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconCheck class="h-4 w-4 shrink-0" />
							{notice}
						</div>
					{/if}

					{#if emailHistory.length === 0}
						<div
							class="border-surface-200-800 flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center"
						>
							<div
								class="bg-surface-100-900 flex h-10 w-10 items-center justify-center rounded-full"
							>
								<IconClock3 class="text-surface-400-600 h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium">No campaigns yet</p>
								<p class="text-surface-400-600 mt-0.5 text-xs">
									Save or send a draft to see it here.
								</p>
							</div>
							<button
								class="btn preset-tonal-primary btn-sm"
								type="button"
								onclick={() => (activeTab = 'compose')}
							>
								Start composing
							</button>
						</div>
					{:else}
						<div class="space-y-2">
							{#each emailHistory as campaign}
								<div class="bg-surface-100-900 border-surface-200-800 rounded-xl border p-3">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<span class="text-sm font-medium"
													>{campaign.campaign_name || campaign.subject_template}</span
												>
												<span
													class="chip text-xs
												{campaign.status === 'sent'
														? 'preset-tonal-success'
														: campaign.status === 'failed'
															? 'preset-tonal-error'
															: campaign.status === 'scheduled'
																? 'preset-tonal-warning'
																: 'preset-tonal-surface'}"
												>
													{campaign.status}
												</span>
											</div>
											{#if campaign.campaign_name}
												<p class="text-surface-400-600 mt-0.5 text-xs">
													{campaign.subject_template}
												</p>
											{/if}
											<div class="text-surface-400-600 mt-1.5 flex flex-wrap gap-3 text-xs">
												<span>{formatDate(campaign.created_at)}</span>
												<span>{campaign.sent_count || 0} sent</span>
												{#if campaign.scheduled_at}<span
														>Scheduled {formatDate(campaign.scheduled_at)}</span
													>{/if}
											</div>
										</div>
										<div class="flex shrink-0 gap-2">
											<button
												class="btn preset-tonal-surface btn-sm"
												type="button"
												onclick={() => duplicateCampaign(campaign)}
											>
												<IconCopy class="h-3.5 w-3.5" /> Duplicate
											</button>
											{#if campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'scheduled'}
												<button
													class="btn preset-filled-primary-500 btn-sm"
													type="button"
													disabled={composerBusy}
													onclick={() => sendExistingCampaign(campaign.id)}
												>
													<IconSend class="h-3.5 w-3.5" /> Send
												</button>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>
