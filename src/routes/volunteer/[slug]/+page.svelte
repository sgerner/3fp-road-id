<script>
	import ShareButton from '#lib/components/ui/ShareButton.svelte';
	let { data } = $props();
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { supabase } from '#lib/supabaseClient';
	import { renderMarkdown } from '#lib/markdown';
	import { safeNavigationUrl } from '#lib/security/urls.js';
	import {
		createVolunteerSignup,
		updateVolunteerSignup,
		createVolunteerSignupShift,
		deleteVolunteerSignupShift,
		createVolunteerSignupResponse,
		updateVolunteerSignupResponse,
		deleteVolunteerSignupResponse
	} from '#lib/services/volunteers';
	import { notifyVolunteerHosts } from '#lib/services/volunteerHostNotifications';
	import { buildVolunteerStatusUpdateEmail } from '#lib/volunteer/email-templates.js';
	import { buildGoogleCalendarUrl, eventLocation } from '#lib/calendar/links';
	import { ensureLeafletDefaultIcon } from '#lib/map/leaflet';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconCircle from '@lucide/svelte/icons/circle';
	import IconCircleCheckBig from '@lucide/svelte/icons/circle-check-big';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconLayers from '@lucide/svelte/icons/layers';
	import IconBuilding from '@lucide/svelte/icons/building';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle-2';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconArrowDown from '@lucide/svelte/icons/arrow-down';
	import VolunteerQuestionFields from '#lib/components/volunteer/VolunteerQuestionFields.svelte';
	import VolunteerContactFields from '#lib/components/volunteer/VolunteerContactFields.svelte';
	import VolunteerSelectedShifts from '#lib/components/volunteer/VolunteerSelectedShifts.svelte';
	import SmsContextOptIn from '#lib/components/sms/SmsContextOptIn.svelte';
	import { slide, fade } from 'svelte/transition';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import {
		buildAbsoluteUrl,
		buildCanonicalUrl,
		cleanSeoText,
		limitSeoText,
		toJsonLd
	} from '#lib/seo';

	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();
	const event = pageData.event ?? {};
	const eventFinished = pageData.eventFinished ?? false;
	const hostGroup = pageData.hostGroup ?? null;
	const eventType = pageData.eventType ?? null;
	const customQuestions = pageData.customQuestions ?? [];
	const eventQuestions = customQuestions.filter((question) => !question?.opportunity_id);
	const authRequired = pageData.authRequired ?? false;
	const draftRestricted = pageData.draftForbidden ?? false;
	const canManage = pageData.canManageEvent ?? false;
	let signups = [...(pageData.signups ?? [])];
	let signupShifts = [...(pageData.signupShifts ?? [])];
	let signupResponses = [...(pageData.signupResponses ?? [])];
	let shiftSignupCounts = { ...(pageData.shiftSignupCounts ?? {}) };
	const user = pageData.user ?? null;
	let profile = pageData.profile ?? null;
	let userSignups = [...(pageData.userSignups ?? [])];
	let loginReturnTo = pageData.returnTo ?? '';

	const opportunityTypeLabels = {
		coordination: 'Coordination & Leads',
		'check-in': 'Check-in & Registration',
		logistics: 'Logistics & Support',
		mechanic: 'Mechanics & Repairs',
		education: 'Education & Coaching',
		hospitality: 'Hospitality & Culture',
		safety: 'Safety & Course Marshals',
		outreach: 'Outreach & Info Booths',
		other: 'Other'
	};

	function emptyValueForQuestion(question) {
		switch (question?.field_type) {
			case 'multiselect':
				return [];
			case 'checkbox':
				return false;
			default:
				return '';
		}
	}

	function normalizeResponseValue(question, responseRow) {
		const rawValue =
			responseRow && typeof responseRow === 'object' && 'response' in responseRow
				? responseRow.response
				: responseRow;
		if (rawValue === null || rawValue === undefined) return emptyValueForQuestion(question);
		if (question?.field_type === 'checkbox') {
			return Boolean(rawValue);
		}
		if (question?.field_type === 'multiselect') {
			if (Array.isArray(rawValue)) return rawValue;
			if (typeof rawValue === 'string' && rawValue.trim()) {
				try {
					const parsed = JSON.parse(rawValue);
					if (Array.isArray(parsed)) return parsed;
				} catch {
					return [rawValue];
				}
				return [rawValue];
			}
			return [];
		}
		if (question?.field_type === 'number') {
			if (rawValue === '') return '';
			if (typeof rawValue === 'number') return rawValue;
			const parsed = Number(rawValue);
			return Number.isNaN(parsed) ? rawValue : parsed;
		}
		if (typeof rawValue === 'string') return rawValue;
		return rawValue ?? '';
	}

	function isResponseEmpty(question, value) {
		switch (question?.field_type) {
			case 'multiselect':
				return !Array.isArray(value) || value.length === 0;
			case 'checkbox':
				return value !== true;
			case 'number':
				return value === '' || value === null || Number.isNaN(value);
			default:
				return !value || (typeof value === 'string' && value.trim().length === 0);
		}
	}

	function formatResponseForApi(question, value) {
		if (question?.field_type === 'multiselect') {
			return Array.isArray(value) ? value : [];
		}
		if (question?.field_type === 'checkbox') {
			return Boolean(value);
		}
		if (question?.field_type === 'number') {
			if (value === '' || value === null || value === undefined) return null;
			const parsed = Number(value);
			return Number.isNaN(parsed) ? null : parsed;
		}
		if (typeof value === 'string') return value.trim();
		return value ?? null;
	}

	function requiredQuestionMessage(question) {
		if (question?.field_type === 'checkbox') return 'Please confirm this checkbox.';
		return 'This question is required.';
	}

	function requireValidationMessage(result) {
		if (result?.reason === 'validation') {
			return 'Please resolve the highlighted questions before submitting.';
		}
		return result?.error || 'Unable to save signups. Please try again.';
	}

	const eventDescriptionHtml = renderMarkdown(event.description || event.summary || '');
	const TRUNCATE_LIMIT = 360;

	const plainTextFromHtml = (html) => {
		if (!html) return '';
		return html
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	};

	const truncateText = (text, limit = TRUNCATE_LIMIT) => {
		if (!text) return '';
		if (text.length <= limit) return text;
		return `${text.slice(0, limit).trimEnd()}...`;
	};

	const eventDescriptionPlain = plainTextFromHtml(eventDescriptionHtml);
	let showFullOverview = $state(false);
	let expandedOpportunityDescriptions = $state(new Set());

	const toggleOpportunityDescription = (id) => {
		const next = new Set(expandedOpportunityDescriptions);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedOpportunityDescriptions = next;
	};

	function humanizeSlug(value) {
		return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	const eventTypeLabel = eventType?.event_type
		? eventType.event_type
		: event?.event_type_slug
			? humanizeSlug(event.event_type_slug)
			: '';

	const hostWebsite = safeNavigationUrl(hostGroup?.website_url);
	const hostSocialLinks = (() => {
		const raw = hostGroup?.social_links;
		if (!raw || typeof raw !== 'object') return [];
		return Object.entries(raw)
			.filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
			.map(([key, value]) => ({ key, url: safeNavigationUrl(value) }))
			.filter((link) => link.url);
	})();

	const organizerEmail = (pageData.organizerEmail || '').trim();
	const contactEmail = (event.contact_email || '').trim();
	const contactPhone = (event.contact_phone || '').trim();

	let signupByOpportunity = userSignups.reduce((acc, signup) => {
		if (signup?.opportunity_id) acc[signup.opportunity_id] = signup;
		return acc;
	}, {});
	let shiftRowsBySignup = signupShifts.reduce((acc, row) => {
		if (!row?.signup_id) return acc;
		if (!acc[row.signup_id]) acc[row.signup_id] = [];
		acc[row.signup_id].push(row);
		return acc;
	}, {});
	let responsesBySignup = signupResponses.reduce((acc, row) => {
		const signupId = row?.signup_id;
		const questionId = row?.question_id;
		if (!signupId || !questionId) return acc;
		if (!acc[signupId]) acc[signupId] = {};
		acc[signupId][questionId] = row;
		return acc;
	}, {});

	const opportunitiesRaw = pageData.opportunities ?? [];
	const mapOpportunityMeta = (opportunity) => {
		const userSignup = signupByOpportunity[opportunity.id];
		const userShiftRows = userSignup ? (shiftRowsBySignup[userSignup.id] ?? []) : [];
		const shiftIds = userShiftRows.map((row) => row.shift_id);
		const descriptionHtml = renderMarkdown(opportunity.description || '');
		return {
			...opportunity,
			userSignup,
			defaultShiftIds: shiftIds,
			descriptionHtml,
			descriptionPlain: plainTextFromHtml(descriptionHtml)
		};
	};
	const opportunities = opportunitiesRaw.map(mapOpportunityMeta);

	const defaultName = (profile?.full_name || user?.user_metadata?.full_name || '').trim();
	const defaultEmail = (profile?.email || user?.email || '').trim();
	const defaultPhone = (profile?.phone || '').trim();
	const defaultEmergencyName = (profile?.emergency_contact_name || '').trim();
	const defaultEmergencyPhone = (profile?.emergency_contact_phone || '').trim();

	const eventQuestionDefaults = eventQuestions.reduce((acc, question) => {
		let existingValue = emptyValueForQuestion(question);
		const relatedSignup = userSignups.find((signup) => {
			const responses = responsesBySignup[signup.id];
			return responses && responses[question.id];
		});
		if (relatedSignup) {
			const responseRow = responsesBySignup[relatedSignup.id]?.[question.id];
			existingValue = normalizeResponseValue(question, responseRow);
		}
		acc[question.id] = existingValue;
		return acc;
	}, {});

	const signupFormDefaults = opportunities.reduce((acc, opportunity) => {
		const existing = opportunity.userSignup;
		const responseMap = existing?.id ? (responsesBySignup[existing.id] ?? {}) : {};
		const opportunityQuestions = getQuestionsForOpportunity(opportunity.id);
		const questionResponses = opportunityQuestions.reduce((map, question) => {
			map[question.id] = normalizeResponseValue(question, responseMap[question.id]);
			return map;
		}, {});
		const questionRecords = opportunityQuestions.reduce((map, question) => {
			const row = responseMap[question.id];
			if (row?.id) map[question.id] = row;
			return map;
		}, {});
		const eventQuestionRecords = eventQuestions.reduce((map, question) => {
			const row = responseMap[question.id];
			if (row?.id) map[question.id] = row;
			return map;
		}, {});
		const initialShiftIds = (() => {
			if (opportunitiesRaw?.length === 1) {
				const preset = [...(opportunity.defaultShiftIds ?? [])];

				if (!preset.length && opportunity.shifts?.length === 1) {
					return [opportunity.shifts[0].id];
				}
				return preset;
			}
		})();

		acc[opportunity.id] = {
			volunteerName: existing?.volunteer_name?.trim() || defaultName || '',
			volunteerEmail: existing?.volunteer_email?.trim() || defaultEmail || '',
			volunteerPhone: existing?.volunteer_phone?.trim() || defaultPhone,
			emergencyContactName: existing?.emergency_contact_name?.trim() || defaultEmergencyName,
			emergencyContactPhone: existing?.emergency_contact_phone?.trim() || defaultEmergencyPhone,
			shiftIds: initialShiftIds,
			questionResponses,
			questionRecords,
			eventQuestionRecords,
			questionErrors: {},
			loading: false,
			success: '',
			error: ''
		};
		return acc;
	}, {});

	let eventQuestionResponses = $state(eventQuestionDefaults);
	let eventQuestionErrors = $state({});

	let signupForms = $state(signupFormDefaults);

	const sharedDetailsDefaults = (() => {
		const firstOpportunity = opportunities[0];
		if (!firstOpportunity) {
			return {
				volunteerName: defaultName || '',
				volunteerEmail: defaultEmail || '',
				volunteerPhone: defaultPhone || '',
				emergencyContactName: defaultEmergencyName || '',
				emergencyContactPhone: defaultEmergencyPhone || ''
			};
		}
		const initialForm = signupFormDefaults[firstOpportunity.id] ?? {};
		return {
			volunteerName: initialForm.volunteerName ?? '',
			volunteerEmail: initialForm.volunteerEmail ?? '',
			volunteerPhone: initialForm.volunteerPhone ?? '',
			emergencyContactName: initialForm.emergencyContactName ?? '',
			emergencyContactPhone: initialForm.emergencyContactPhone ?? ''
		};
	})();

	let sharedDetails = $state(sharedDetailsDefaults);

	function applySharedDetailsToForms(details) {
		const nextForms = {};
		for (const opportunity of opportunities) {
			const id = opportunity.id;
			const current = signupForms[id] ?? signupFormDefaults[id] ?? {};
			nextForms[id] = {
				...current,
				volunteerName: details.volunteerName ?? '',
				volunteerEmail: details.volunteerEmail ?? '',
				volunteerPhone: details.volunteerPhone ?? '',
				emergencyContactName: details.emergencyContactName ?? '',
				emergencyContactPhone: details.emergencyContactPhone ?? ''
			};
		}
		signupForms = nextForms;
	}

	function updateSharedDetail(key, value) {
		const nextDetails = { ...sharedDetails, [key]: value };
		sharedDetails = nextDetails;
		applySharedDetailsToForms(nextDetails);
	}

	function updateEventQuestionResponse(questionId, value) {
		eventQuestionResponses = { ...eventQuestionResponses, [questionId]: value };
		if (eventQuestionErrors[questionId]) {
			const nextErrors = { ...eventQuestionErrors };
			delete nextErrors[questionId];
			eventQuestionErrors = nextErrors;
		}
	}

	if (opportunities.length) {
		applySharedDetailsToForms(sharedDetailsDefaults);
	}

	const selectedOpportunities = $derived(getSelectedOpportunities());
	let loginEmail = $state(defaultEmail || '');
	let loginError = $state('');
	let loginSuccess = $state('');
	let loginLoading = $state(false);
	let loginHoneypot = $state('');
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);
	async function initTurnstile() {
		if (!turnstileEnabled || !turnstileEl || turnstileWidgetId) return;
		try {
			const widgetId = await renderTurnstile(turnstileEl, {
				sitekey: PUBLIC_TURNSTILE_SITE_KEY,
				size: 'invisible'
			});
			turnstileWidgetId = widgetId;
		} catch (err) {
			console.error('Failed to initialize Turnstile widget', err);
		}
	}

	$effect(() => {
		if (turnstileEnabled && turnstileEl && !turnstileWidgetId) {
			initTurnstile();
		}
	});
	let bulkSubmit = $state({ loading: false, success: '', error: '' });

	const defaultQuestionSubject = event.title
		? `Question about ${event.title}`
		: 'Question about your volunteer event';

	let questionForm = $state({
		replyTo: defaultEmail || '',
		subject: defaultQuestionSubject,
		message: ''
	});
	let questionErrors = $state({});
	let questionStatus = $state({ loading: false, success: '', error: '' });

	const questionEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function updateQuestionField(key, value) {
		questionForm = { ...questionForm, [key]: value };
		if (questionErrors[key]) {
			const nextErrors = { ...questionErrors };
			delete nextErrors[key];
			questionErrors = nextErrors;
		}
		if (questionStatus.success || questionStatus.error) {
			questionStatus = { ...questionStatus, success: '', error: '' };
		}
	}

	function escapeQuestionHtml(value = '') {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function formatQuestionHtml(message) {
		if (!message) return '';
		const escaped = escapeQuestionHtml(message.trim());
		if (!escaped) return '';
		return escaped
			.split(/\n{2,}/)
			.map((block) => block.trim())
			.filter(Boolean)
			.map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
			.join('');
	}

	async function handleQuestionSubmit(event) {
		event.preventDefault();
		if (!organizerEmail) {
			questionStatus = {
				loading: false,
				success: '',
				error: 'We could not find a contact for this event just yet. Please try again later.'
			};
			return;
		}

		const replyTo = (questionForm.replyTo || '').trim();
		const subject = (questionForm.subject || '').trim();
		const message = questionForm.message;

		const nextErrors = {};
		if (!replyTo || !questionEmailPattern.test(replyTo)) {
			nextErrors.replyTo = 'Enter a valid email address so the organizer can respond.';
		}
		if (subject.length < 3) {
			nextErrors.subject = 'Subject must be at least 3 characters long.';
		}
		if (!message) {
			nextErrors.message = 'Please include a question or message for the organizer.';
		}

		if (Object.keys(nextErrors).length) {
			questionErrors = nextErrors;
			questionStatus = {
				loading: false,
				success: '',
				error: 'Please fix the highlighted fields before sending your question.'
			};
			return;
		}

		questionErrors = {};
		questionStatus = { loading: true, success: '', error: '' };

		try {
			const htmlBody = formatQuestionHtml(message);
			const payload = {
				to: organizerEmail,
				subject,
				text: message,
				replyTo,
				...(htmlBody ? { html: htmlBody } : {}),
				tags: [
					{ Name: 'context', Value: 'volunteer-question' },
					event?.id ? { Name: 'volunteer_event_id', Value: String(event.id) } : null
				].filter(Boolean)
			};

			const response = await fetch('/api/v1/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			let responseBody = null;
			try {
				responseBody = await response.json();
			} catch {
				responseBody = null;
			}

			if (!response.ok) {
				const errorMessage =
					(responseBody && responseBody.error) ||
					'We could not send your question. Please try again.';
				throw new Error(errorMessage);
			}

			questionStatus = {
				loading: false,
				success: 'Your question was sent to the event organizer.',
				error: ''
			};
			questionForm = { ...questionForm, message: '' };
		} catch (err) {
			questionStatus = {
				loading: false,
				success: '',
				error: err?.message || 'We could not send your question. Please try again.'
			};
		}
	}

	let mapEl = $state(null);
	let map;
	let marker;
	let L;
	const hasCoords = Number.isFinite(event.latitude) && Number.isFinite(event.longitude);

	onMount(async () => {
		if (!loginReturnTo && typeof window !== 'undefined') {
			loginReturnTo = window.location.pathname + window.location.search + window.location.hash;
		}
		if (!hasCoords) return;
		try {
			const mod = await import('leaflet');
			L = mod.default || mod;
			await ensureLeafletDefaultIcon(L);
			if (!mapEl) return;
			map = L.map(mapEl).setView([Number(event.latitude), Number(event.longitude)], 13);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);
			marker = L.marker([Number(event.latitude), Number(event.longitude)]).addTo(map);
		} catch (err) {
			console.warn('Failed to load Leaflet map', err);
		}
	});

	const statusStyles = {
		draft: {
			label: 'Draft',
			className:
				'bg-surface-950 text-primary-500 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase'
		},
		published: {
			label: 'Published',
			className:
				'bg-surface-950 text-primary-500 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase'
		},
		cancelled: {
			label: 'Cancelled',
			className:
				'bg-tertiary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.18em] uppercase'
		},
		archived: {
			label: 'Archived',
			className:
				'border-2 border-surface-950 text-surface-950 px-3 py-0.5 text-xs font-black tracking-[0.18em] uppercase'
		}
	};
	const statusInfo = statusStyles[event.status] ?? {
		label: event.status ? event.status.replace(/_/g, ' ') : 'Unknown',
		className:
			'border-2 border-surface-950 text-surface-950 px-3 py-0.5 text-xs font-black tracking-[0.18em] uppercase'
	};

	function typeLabel(value) {
		const normalized = (value || '').toLowerCase();
		return opportunityTypeLabels[normalized] || capitalize(value || 'Other');
	}

	function capitalize(value) {
		return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
	}

	function formatDateTime(value, timezone, options = {}) {
		if (!value) return 'TBD';
		try {
			const date = new Date(value);
			const config = {};
			const tz = timezone || event.timezone;
			if (tz) config.timeZone = tz;
			const dateStyle = options.dateStyle ?? 'medium';
			const timeStyle = options.timeStyle ?? 'short';
			if (dateStyle && dateStyle !== 'none') config.dateStyle = dateStyle;
			if (timeStyle && timeStyle !== 'none') config.timeStyle = timeStyle;
			if (!config.dateStyle && !config.timeStyle) config.timeStyle = 'short';
			const formatter = new Intl.DateTimeFormat(undefined, config);
			return formatter.format(date);
		} catch {
			try {
				return new Date(value).toLocaleString();
			} catch {
				return value;
			}
		}
	}

	function isSameDay(startIso, endIso, timezone) {
		try {
			const tz = timezone || event.timezone || 'UTC';
			const opts = { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' };
			const fmt = new Intl.DateTimeFormat(undefined, opts);
			return fmt.format(new Date(startIso)) === fmt.format(new Date(endIso));
		} catch {
			return false;
		}
	}

	function formatShiftRange(shift) {
		const tz = shift?.timezone || event.timezone;
		const start = formatDateTime(shift?.starts_at, tz, { dateStyle: 'medium', timeStyle: 'short' });
		const end = formatDateTime(shift?.ends_at, tz, { timeStyle: 'short', dateStyle: 'none' });
		if (shift?.starts_at && shift?.ends_at) {
			const sameDay = isSameDay(shift.starts_at, shift.ends_at, tz);
			if (sameDay) return `${start} - ${end}`;
			return `${start} -> ${end}`;
		}
		return start || end || 'Shift timing TBD';
	}

	function volunteerShiftCalendarLinks(shift, opportunity) {
		const origin = page?.url?.origin || '';
		const slug = event?.slug || '';
		const eventUrl =
			origin && slug ? new URL(`/volunteer/${encodeURIComponent(slug)}`, origin).toString() : '';
		const icsUrl =
			origin && slug && shift?.id
				? new URL(
						`/api/calendar/volunteer-events/${encodeURIComponent(slug)}?shiftId=${encodeURIComponent(shift.id)}`,
						origin
					).toString()
				: '';
		const googleUrl = buildGoogleCalendarUrl({
			title: `${event?.title || 'Volunteer event'} - ${opportunity?.title || 'Shift'}`,
			start: shift?.starts_at,
			end: shift?.ends_at,
			description: shift?.notes || opportunity?.description || event?.summary || '',
			location: eventLocation(
				shift?.location_name || opportunity?.location_name || event?.location_name,
				shift?.location_address || opportunity?.location_address || event?.location_address
			),
			url: eventUrl
		});
		return { googleUrl, icsUrl };
	}

	function eventDateLabel(startIso, endIso, timezone) {
		if (!startIso && !endIso) return 'Date coming soon';
		const tz = timezone || event.timezone;
		const startDate = startIso
			? formatDateTime(startIso, tz, { dateStyle: 'full', timeStyle: 'none' })
			: null;
		const endDate = endIso
			? formatDateTime(endIso, tz, { dateStyle: 'full', timeStyle: 'none' })
			: null;
		if (startDate && endDate) {
			return isSameDay(startIso, endIso, tz) ? startDate : `${startDate} → ${endDate}`;
		}
		return startDate || endDate || 'Date coming soon';
	}

	function eventTimeLabel(startIso, endIso, timezone) {
		if (!startIso && !endIso) return 'Time coming soon';
		const tz = timezone || event.timezone;
		const startTime = startIso
			? formatDateTime(startIso, tz, { timeStyle: 'short', dateStyle: 'none' })
			: null;
		const endTime = endIso
			? formatDateTime(endIso, tz, { timeStyle: 'short', dateStyle: 'none' })
			: null;
		if (startTime && endTime) {
			if (isSameDay(startIso, endIso, tz)) {
				return `${startTime} – ${endTime}`.trim();
			}
			const startDate = formatDateTime(startIso, tz, { dateStyle: 'short', timeStyle: 'none' });
			const endDate = formatDateTime(endIso, tz, { dateStyle: 'short', timeStyle: 'none' });
			return `${startTime} (${startDate}) → ${endTime} (${endDate})`;
		}
		return (startTime || endTime || 'Time coming soon') + (tz ? ` ${tz}` : '');
	}

	function getQuestionsForOpportunity(opportunityId) {
		if (!customQuestions.length) return [];
		return customQuestions.filter((question) => question?.opportunity_id === opportunityId);
	}

	function hostLocationLabel() {
		if (!hostGroup) return '';
		const parts = [hostGroup.city, hostGroup.state_region, hostGroup.country]
			.map((part) => (part || '').trim())
			.filter(Boolean);
		return parts.join(', ');
	}

	function getOpportunitySignupCount(opportunityId) {
		return signups.filter((signup) => signup?.opportunity_id === opportunityId).length;
	}

	function getOpportunityShiftCapacity(opportunity) {
		return (opportunity.shifts ?? []).reduce(
			(sum, shift) => sum + (Number(shift?.capacity) || 0),
			0
		);
	}

	function ensureShiftCountEntry(shiftId) {
		const current = shiftSignupCounts[shiftId];
		if (current && typeof current === 'object') {
			const approved = Number(current.approved) || 0;
			const waitlisted = Number(current.waitlisted) || 0;
			return { approved, waitlisted };
		}
		if (typeof current === 'number') {
			return { approved: current, waitlisted: 0 };
		}
		return { approved: 0, waitlisted: 0 };
	}

	function getShiftSignupCount(shiftId) {
		return ensureShiftCountEntry(shiftId).approved || 0;
	}

	function getShiftWaitlistCount(shiftId) {
		return ensureShiftCountEntry(shiftId).waitlisted || 0;
	}

	function findShift(opportunity, shiftId) {
		return opportunity?.shifts?.find((shift) => shift.id === shiftId);
	}

	function getSelectedShiftEntries(opportunity, form) {
		if (!form?.shiftIds?.length) return [];
		return form.shiftIds
			.map((shiftId) => {
				const shift = findShift(opportunity, shiftId);
				if (!shift) return null;
				return { id: shiftId, label: formatShiftRange(shift) };
			})
			.filter(Boolean);
	}

	function getSelectedOpportunities() {
		return opportunities.filter((opportunity) => {
			const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id];
			return getSelectedShiftEntries(opportunity, form).length > 0;
		});
	}

	async function handleBulkSignupSubmission() {
		if (eventFinished) {
			bulkSubmit = {
				loading: false,
				success: '',
				error: 'Sign-ups have closed for this event.'
			};
			return;
		}

		if (bulkSubmit.loading) return;
		const selected = getSelectedOpportunities();
		if (!selected.length) {
			bulkSubmit = {
				loading: false,
				success: '',
				error: 'Select at least one shift above to enable signup.'
			};
			return;
		}
		bulkSubmit = { loading: true, success: '', error: '' };

		const allCreatedAssignmentIds = [];
		const allNewlyAddedShifts = [];
		let volunteerInfo = null;

		try {
			for (const opportunity of selected) {
				const result = await handleSignupSubmission(null, opportunity, { skipRefresh: true });
				if (!result?.ok) {
					bulkSubmit = {
						loading: false,
						success: '',
						error: result?.error || requireValidationMessage(result)
					};
					return;
				}
				if (result.createdAssignmentIds?.length) {
					allCreatedAssignmentIds.push(...result.createdAssignmentIds);
				}
				if (result.newlyAddedShifts?.length) {
					allNewlyAddedShifts.push({
						opportunity: result.opportunity,
						shifts: result.newlyAddedShifts,
						status: result.status
					});
				}
				if (result.volunteer && !volunteerInfo) {
					volunteerInfo = result.volunteer;
				}
			}

			// Send grouped notifications
			if (allCreatedAssignmentIds.length) {
				notifyVolunteerHosts({ assignmentIds: allCreatedAssignmentIds, type: 'register' }).catch(
					(error) => {
						console.warn('Failed to notify hosts about new volunteer signups', error);
					}
				);
			}

			if (allNewlyAddedShifts.length && volunteerInfo) {
				const allShifts = allNewlyAddedShifts.flatMap((item) => item.shifts);
				const status = allNewlyAddedShifts[0]?.status; // Assume status is the same for all
				// The opportunity is ambiguous here. For the email, we can pass just the first one
				// as the template likely uses event-level details more.
				const firstOpportunity = allNewlyAddedShifts[0]?.opportunity;

				await sendVolunteerStatusUpdateEmail({
					shifts: allShifts,
					opportunity: firstOpportunity,
					status,
					volunteer: volunteerInfo
				});
			}

			bulkSubmit = {
				loading: false,
				success: "Thanks for volunteering! We'll be in touch soon.",
				error: ''
			};
		} catch (err) {
			bulkSubmit = {
				loading: false,
				success: '',
				error: err?.message || 'Unable to save signups. Please try again.'
			};
		}
	}

	function updateSignupForm(opportunityId, patch) {
		const current = signupForms[opportunityId] ?? signupFormDefaults[opportunityId];
		signupForms = {
			...signupForms,
			[opportunityId]: { ...current, ...patch }
		};
	}

	function toggleShiftSelection(opportunityId, shiftId) {
		if (eventFinished) return;
		const current = signupForms[opportunityId] ?? signupFormDefaults[opportunityId];
		const next = new Set(current.shiftIds || []);
		if (next.has(shiftId)) next.delete(shiftId);
		else next.add(shiftId);
		updateSignupForm(opportunityId, { shiftIds: Array.from(next) });
	}

	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	async function maybeUpdateProfile(details) {
		if (!user) return;
		const current = profile || {};
		const payload = { user_id: user.id };
		let changed = false;

		const assign = (key, raw) => {
			const value = (raw || '').trim();
			const normalized = value ? value : null;
			const currentValue = current[key] ?? null;
			if (normalized !== currentValue) {
				payload[key] = normalized;
				changed = true;
			}
		};

		if (details.full_name !== undefined) assign('full_name', details.full_name);
		if (details.phone !== undefined) assign('phone', details.phone);
		if (details.emergency_contact_name !== undefined)
			assign('emergency_contact_name', details.emergency_contact_name);
		if (details.emergency_contact_phone !== undefined)
			assign('emergency_contact_phone', details.emergency_contact_phone);

		if (!changed) return;
		// Keep the conflict key out of the UPDATE statement. The profiles grants
		// intentionally protect user_id from client updates, while PostgREST
		// includes every upsert payload column in its ON CONFLICT update clause.
		const mutablePayload = { ...payload };
		delete mutablePayload.user_id;

		let profileResult = await supabase
			.from('profiles')
			.update(mutablePayload)
			.eq('user_id', user.id)
			.select()
			.maybeSingle();

		// Auth normally creates this row through the database trigger, but keep the
		// signup flow self-healing if that row is missing for an older account.
		if (!profileResult.error && !profileResult.data) {
			profileResult = await supabase
				.from('profiles')
				.insert({ user_id: user.id, ...mutablePayload })
				.select()
				.single();
		}

		const { error: profileError, data: updated } = profileResult;
		if (profileError) {
			throw new Error(profileError.message || 'Unable to update profile');
		}
		profile = updated ?? { ...current, user_id: user.id, ...mutablePayload };
	}

	async function sendVolunteerStatusUpdateEmail({ shifts, opportunity, status, volunteer }) {
		if (!Array.isArray(shifts) || !shifts.length) return;
		const volunteerName = volunteer?.name ?? '';
		const volunteerEmail = volunteer?.email ?? '';
		if (!volunteerEmail) return;

		let eventUrl = '';
		let origin = '';

		if (page?.url) {
			eventUrl = page.url.href;
			origin = page.url.origin;
		}

		if ((!eventUrl || !origin) && typeof window !== 'undefined') {
			eventUrl = eventUrl || window.location.href;
			origin = origin || window.location.origin;
		}

		const shiftsUrl = origin ? new URL('/volunteer/shifts', origin).toString() : '';

		const emailPayload = buildVolunteerStatusUpdateEmail({
			event,
			opportunity,
			shifts,
			volunteer: { name: volunteerName, email: volunteerEmail },
			hostGroup,
			contactEmail,
			contactPhone,
			hostEmail: organizerEmail,
			eventUrl,
			shiftsUrl,
			status
		});

		if (!emailPayload) return;

		try {
			const response = await fetch('/api/v1/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(emailPayload)
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				console.error('Failed to send volunteer status update email', response.status, errorText);
			}
		} catch (emailError) {
			console.error('Failed to send volunteer status update email', emailError);
		}
	}

	function signupStatusText(opportunity) {
		const total = getOpportunitySignupCount(opportunity.id);
		const max = Number(opportunity.max_volunteers) || null;
		if (max) return `${total} of ${max} spots claimed`;
		if (total === 1) return '1 volunteer registered';
		return `${total} volunteers registered`;
	}

	async function handleSignupSubmission(eventObj, opportunity, options = {}) {
		const { skipRefresh = false } = options ?? {};
		eventObj?.preventDefault?.();
		const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id];

		if (!user) {
			updateSignupForm(opportunity.id, {
				error: 'Please sign in with a magic link to volunteer.',
				success: ''
			});
			return { ok: false, reason: 'auth', error: 'Please sign in with a magic link to volunteer.' };
		}

		const volunteerName = (form.volunteerName || '').trim();
		const volunteerEmail = (form.volunteerEmail || '').trim();
		const volunteerPhone = (form.volunteerPhone || '').trim();
		const emergencyContactName = (form.emergencyContactName || '').trim();
		const emergencyContactPhone = (form.emergencyContactPhone || '').trim();
		const selectedShiftIds = (form.shiftIds || []).filter(Boolean);

		if (!volunteerName) {
			updateSignupForm(opportunity.id, {
				error: 'Add your name so the host can confirm you.',
				success: ''
			});
			return { ok: false, reason: 'validation' };
		}
		if (!emailPattern.test(volunteerEmail)) {
			updateSignupForm(opportunity.id, {
				error: 'Enter a valid email address.',
				success: ''
			});
			return { ok: false, reason: 'validation' };
		}

		const opportunityQuestions = getQuestionsForOpportunity(opportunity.id);
		const questionResponses = form.questionResponses ?? {};
		const questionErrors = {};
		let hasQuestionErrors = false;

		for (const question of opportunityQuestions) {
			const value = questionResponses[question.id];
			if (question.is_required && isResponseEmpty(question, value)) {
				questionErrors[question.id] = requiredQuestionMessage(question);
				hasQuestionErrors = true;
			}
		}

		const eventErrors = {};
		for (const question of eventQuestions) {
			const value = eventQuestionResponses[question.id];
			if (question.is_required && isResponseEmpty(question, value)) {
				eventErrors[question.id] = requiredQuestionMessage(question);
				hasQuestionErrors = true;
			}
		}

		if (hasQuestionErrors) {
			updateSignupForm(opportunity.id, {
				questionErrors,
				error: '',
				success: ''
			});
			eventQuestionErrors = eventErrors;
			return { ok: false, reason: 'validation' };
		}

		eventQuestionErrors = {};
		updateSignupForm(opportunity.id, { loading: true, error: '', success: '', questionErrors: {} });

		try {
			const basePayload = {
				event_id: event.id,
				opportunity_id: opportunity.id,
				volunteer_user_id: user.id,
				volunteer_name: volunteerName,
				volunteer_email: volunteerEmail,
				volunteer_phone: volunteerPhone || null,
				emergency_contact_name: emergencyContactName || null,
				emergency_contact_phone: emergencyContactPhone || null,
				signed_waiver: signupByOpportunity[opportunity.id]?.signed_waiver ?? true,
				source: 'volunteer-event-page'
			};

			let signupRecord = signupByOpportunity[opportunity.id];
			if (signupRecord?.id) {
				const response = await updateVolunteerSignup(signupRecord.id, basePayload);
				signupRecord = response?.data ?? response ?? signupRecord;
				signups = signups.map((row) => (row.id === signupRecord.id ? signupRecord : row));
			} else {
				const response = await createVolunteerSignup(basePayload);
				signupRecord = response?.data ?? response;
				if (!signupRecord?.id) throw new Error('Unable to save signup.');
				signups = [...signups, signupRecord];
				userSignups = [...userSignups, signupRecord];
			}

			signupByOpportunity = {
				...signupByOpportunity,
				[opportunity.id]: signupRecord
			};

			await maybeUpdateProfile({
				full_name: volunteerName,
				email: volunteerEmail,
				phone: volunteerPhone,
				emergency_contact_name: emergencyContactName,
				emergency_contact_phone: emergencyContactPhone
			});

			const existingShiftRows = signupRecord?.id
				? signupShifts.filter((row) => row.signup_id === signupRecord.id)
				: [];
			const existingShiftIds = existingShiftRows.map((row) => row.shift_id);
			const toAdd = selectedShiftIds.filter((shiftId) => !existingShiftIds.includes(shiftId));
			const toRemove = existingShiftIds.filter((shiftId) => !selectedShiftIds.includes(shiftId));

			const status = opportunity.requires_approval ? 'pending' : 'approved';
			const newlyAddedShifts = [];
			const createdAssignmentIds = [];

			for (const shiftId of toAdd) {
				const response = await createVolunteerSignupShift({
					signup_id: signupRecord.id,
					shift_id: shiftId,
					status
				});
				const created = response?.data ?? response;
				if (created?.id) {
					createdAssignmentIds.push(created.id);
					signupShifts = [...signupShifts, created];
					const counts = ensureShiftCountEntry(shiftId);
					const shiftDetails = findShift(opportunity, shiftId);
					if (shiftDetails) newlyAddedShifts.push(shiftDetails);
					if (status === 'approved') {
						shiftSignupCounts = {
							...shiftSignupCounts,
							[shiftId]: {
								...counts,
								approved: counts.approved + 1
							}
						};
					} else if (status === 'waitlisted') {
						shiftSignupCounts = {
							...shiftSignupCounts,
							[shiftId]: {
								...counts,
								waitlisted: counts.waitlisted + 1
							}
						};
					}
				}
			}

			return {
				ok: true,
				signup: signupRecord,
				createdAssignmentIds,
				newlyAddedShifts,
				volunteer: { name: volunteerName, email: volunteerEmail },
				opportunity,
				status
			};
		} catch (err) {
			console.error(err);
			updateSignupForm(opportunity.id, {
				loading: false,
				error: err?.message || 'Unable to save signup. Please try again.',
				success: ''
			});
			return { ok: false, error: err?.message || 'Unable to save signup. Please try again.' };
		}
	}

	async function syncSignupResponses(signupRecord, opportunity, form) {
		const signupId = signupRecord?.id;
		if (!signupId) return;
		const opportunityQuestions = getQuestionsForOpportunity(opportunity.id);
		const questionResponses = form.questionResponses ?? {};
		const questionRecords = { ...(form.questionRecords ?? {}) };
		const eventRecords = { ...(form.eventQuestionRecords ?? {}) };

		const upsertResponse = async (question, value, existingRecord, recordMap) => {
			if (isResponseEmpty(question, value)) {
				if (existingRecord?.id) {
					await deleteVolunteerSignupResponse(existingRecord.id);
					delete recordMap[question.id];
				}
				return;
			}
			const payload = {
				signup_id: signupId,
				question_id: question.id,
				response: formatResponseForApi(question, value)
			};
			if (existingRecord?.id) {
				const response = await updateVolunteerSignupResponse(existingRecord.id, payload);
				const updated = response?.data ?? response ?? existingRecord;
				recordMap[question.id] = updated;
			} else {
				const response = await createVolunteerSignupResponse(payload);
				const created = response?.data ?? response;
				if (created?.id) recordMap[question.id] = created;
			}
		};

		for (const question of opportunityQuestions) {
			await upsertResponse(
				question,
				questionResponses[question.id],
				questionRecords[question.id],
				questionRecords
			);
		}

		for (const question of eventQuestions) {
			await upsertResponse(
				question,
				eventQuestionResponses[question.id],
				eventRecords[question.id],
				eventRecords
			);
		}

		updateSignupForm(opportunity.id, {
			questionRecords,
			eventQuestionRecords: eventRecords
		});

		responsesBySignup = {
			...responsesBySignup,
			[signupId]: { ...questionRecords, ...eventRecords }
		};
	}

	async function requestMagicLink(eventObj) {
		eventObj?.preventDefault?.();
		loginError = '';
		loginSuccess = '';
		const email = (loginEmail || '').trim();
		if (!emailPattern.test(email)) {
			loginError = 'Enter a valid email address to continue.';
			return;
		}
		if (loginHoneypot.trim()) {
			loginError = 'Invalid submission.';
			return;
		}
		loginLoading = true;
		try {
			let turnstileToken = '';
			if (turnstileEnabled) {
				await initTurnstile();
				if (!turnstileWidgetId) {
					loginError = 'Verification failed. Please reload and try again.';
					loginLoading = false;
					return;
				}
				turnstileToken = await executeTurnstile(turnstileWidgetId);
				if (!turnstileToken) {
					loginError = 'Verification failed. Please try again.';
					loginLoading = false;
					return;
				}
			}
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					createProfile: true,
					returnTo: loginReturnTo,
					honeypot: loginHoneypot,
					turnstileToken
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Unable to send magic link.');
			}
			loginSuccess = `Check ${email} for your login link.`;
			loginHoneypot = '';
		} catch (err) {
			loginError = err.message || 'Something went wrong.';
		} finally {
			loginLoading = false;
			if (turnstileEnabled && turnstileWidgetId) {
				resetTurnstile(turnstileWidgetId);
			}
		}
	}

	// Notices via query params
	const authFlag = $derived((page && page.url && page.url.searchParams.get('auth')) || '');

	let showQuestion = $state(false);

	const opportunityTypeAccent = {
		coordination: 'border-l-primary-500',
		'check-in': 'border-l-secondary-500',
		logistics: 'border-l-secondary-400',
		mechanic: 'border-l-warning-500',
		education: 'border-l-success-500',
		hospitality: 'border-l-pink-500',
		safety: 'border-l-error-500',
		outreach: 'border-l-tertiary-500',
		other: 'border-l-surface-500'
	};
	function opportunityAccent(type) {
		return opportunityTypeAccent[(type || '').toLowerCase()] ?? 'border-l-secondary-500';
	}

	const seoTitle = $derived.by(() => cleanSeoText(event.title || 'Volunteer Event'));
	const seoDescription = $derived.by(() =>
		limitSeoText(
			event.summary ||
				eventType?.description ||
				`${seoTitle} on 3 Feet Please with roles, shifts, and signup details.`,
			165
		)
	);
	const seoCanonical = $derived(buildCanonicalUrl(page.url, ['auth']));
	const seoImage = $derived.by(() => {
		const image = hostGroup?.cover_photo_url || hostGroup?.logo_url || '';
		if (!image) return '';
		try {
			return new URL(image, page.url.origin).toString();
		} catch {
			return image;
		}
	});
	const seoStructuredData = $derived.by(() => {
		const breadcrumbs = {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Volunteer',
					item: buildAbsoluteUrl(page.url.origin, '/volunteer')
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: seoTitle,
					item: seoCanonical
				}
			]
		};
		const eventSchema = {
			'@context': 'https://schema.org',
			'@type': 'Event',
			name: seoTitle,
			description: seoDescription,
			url: seoCanonical,
			image: seoImage || undefined,
			startDate: event?.event_start || undefined,
			endDate: event?.event_end || undefined,
			eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
			location:
				event?.location_name || event?.location_address
					? {
							'@type': 'Place',
							name: event?.location_name || undefined,
							address: event?.location_address || undefined
						}
					: undefined,
			organizer: hostGroup?.name
				? {
						'@type': 'Organization',
						name: hostGroup.name,
						url: buildAbsoluteUrl(page.url.origin, `/groups/${hostGroup.slug}`)
					}
				: undefined
		};
		return toJsonLd([breadcrumbs, eventSchema]);
	});
</script>

<svelte:head>
	<title>{seoTitle} | Volunteer | 3 Feet Please</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content={draftRestricted || authRequired
			? 'noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
			: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}
	/>
	<link rel="canonical" href={seoCanonical} />

	<meta property="og:type" content="event" />
	<meta property="og:site_name" content="3 Feet Please" />
	<meta property="og:title" content={`${seoTitle} | Volunteer | 3 Feet Please`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={seoCanonical} />
	{#if seoImage}
		<meta property="og:image" content={seoImage} />
	{/if}

	<meta name="twitter:card" content={seoImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={`${seoTitle} | Volunteer | 3 Feet Please`} />
	<meta name="twitter:description" content={seoDescription} />
	{#if seoImage}
		<meta name="twitter:image" content={seoImage} />
	{/if}

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	{#if draftRestricted}
		<section class="bg-tertiary-500 text-surface-950 px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
			<div class="flex max-w-3xl flex-col gap-5">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<span class="bg-surface-950 h-3 w-3" aria-hidden="true"></span>
					<span>Restricted draft</span>
				</p>
				<h1
					class="text-surface-950! m-0 text-4xl leading-[0.88] font-black tracking-[-0.04em] uppercase italic sm:text-6xl"
				>
					This draft is locked
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium">
					Only the event host or owners of the hosting group can view draft events. Ask the
					organizer to publish or add you as an owner to continue.
				</p>
			</div>
		</section>
	{:else if authRequired}
		<section class="bg-primary-500 text-surface-950 px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
			<div class="flex max-w-2xl flex-col gap-6">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
					<span>Authentication required</span>
				</p>
				<h1
					class="text-surface-950! m-0 text-4xl leading-[0.88] font-black tracking-[-0.04em] uppercase italic sm:text-6xl"
				>
					Log in to view this draft event
				</h1>
				<p class="m-0 text-lg leading-snug font-medium">
					This event is still in draft. Enter your email to receive a magic link and continue.
				</p>
				<form class="flex flex-col gap-4 pt-2" onsubmit={requestMagicLink}>
					<div
						aria-hidden="true"
						style="position: absolute; width: 0; height: 0; overflow: hidden;"
					>
						<div bind:this={turnstileEl}></div>
					</div>
					<input
						type="text"
						name="website"
						bind:value={loginHoneypot}
						autocomplete="off"
						tabindex="-1"
						aria-hidden="true"
						style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
					/>
					<label class="text-xs font-bold tracking-[0.2em] uppercase" for="draft-login-email">
						Email
					</label>
					<input
						id="draft-login-email"
						type="email"
						class="border-surface-950 bg-surface-950 text-surface-50 placeholder:text-surface-400 border-[3px] px-4 py-3.5 text-base font-medium focus:outline-none"
						bind:value={loginEmail}
						required
						placeholder="you@example.com"
					/>
					{#if loginError}
						<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-black uppercase">
							{loginError}
						</p>
					{/if}
					{#if loginSuccess}
						<p class="bg-surface-950 text-primary-500 m-0 px-4 py-2 text-xs font-black uppercase">
							{loginSuccess}
						</p>
					{/if}
					<button
						type="submit"
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 px-7 py-4 text-base font-black tracking-wide uppercase transition {loginLoading
							? 'opacity-70'
							: ''}"
						disabled={loginLoading}
					>
						{loginLoading ? 'Sending magic link…' : 'Email me a magic link'}
					</button>
				</form>
			</div>
		</section>
	{:else}
		<!-- BREADCRUMB BAR -->
		<nav
			aria-label="Breadcrumb"
			class="bg-surface-950 text-surface-300 border-surface-800 flex flex-wrap items-center gap-2 border-b px-6 py-3 text-xs font-bold tracking-[0.18em] uppercase sm:px-10 lg:px-14"
		>
			<a
				class="text-primary-500 hover:text-surface-50 transition hover:no-underline"
				href="/volunteer"
			>
				Volunteer
			</a>
			<span aria-hidden="true">/</span>
			<span class="text-surface-50">{seoTitle}</span>
			{#if hostGroup?.slug}
				<span aria-hidden="true">·</span>
				<a
					class="text-surface-300 hover:text-primary-500 transition hover:no-underline"
					href={`/volunteer/groups/${hostGroup.slug}`}
				>
					{hostGroup.name}
				</a>
			{/if}
		</nav>

		{#if authFlag === 'required' || authFlag === 'forbidden'}
			<section
				class="border-surface-950 border-b-[3px] px-6 py-4 sm:px-10 lg:px-14 {authFlag ===
				'required'
					? 'bg-primary-500 text-surface-950'
					: 'bg-tertiary-500 text-surface-950'}"
			>
				{#if authFlag === 'required'}
					<div class="text-sm">
						<strong class="font-black uppercase">Please log in to edit this event.</strong>
						<div>Use the "Log in / Register" button in the header, then try again.</div>
					</div>
				{:else}
					<div class="text-sm">
						<strong class="font-black uppercase"
							>You don't have permission to edit this event.</strong
						>
						<div>Ask an existing owner to add you as an owner.</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- HERO BANNER -->
		<header class="bg-primary-500 text-surface-950">
			<div class="flex flex-col gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16">
				<!-- Eyebrow & status row -->
				<div class="flex flex-wrap items-center gap-3">
					<span class="bg-tertiary-500 h-3 w-3 shrink-0" aria-hidden="true"></span>
					{#if eventTypeLabel}
						<span
							class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
						>
							{eventTypeLabel}
						</span>
					{:else}
						<span class="text-xs font-bold tracking-[0.22em] uppercase">Volunteer Event</span>
					{/if}
					{#if canManage}
						<span class={statusInfo.className}>{statusInfo.label}</span>
						{#if event.waitlist_enabled}
							<span
								class="border-surface-950 text-surface-950 border-2 px-3 py-0.5 text-xs font-black tracking-[0.18em] uppercase"
							>
								Waitlist enabled
							</span>
						{/if}
					{/if}
				</div>

				<!-- Title + Actions row -->
				<div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div class="flex flex-col gap-4">
						<h1
							class="text-surface-950! m-0 text-[clamp(2.6rem,6.5vw,6rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
						>
							{event.title || 'Untitled volunteer event'}
						</h1>
						{#if eventType?.description}
							<p class="m-0 max-w-3xl text-lg leading-snug font-medium sm:text-xl">
								{eventType.description}
							</p>
						{:else if event.summary}
							<p class="m-0 max-w-3xl text-lg leading-snug font-medium sm:text-2xl">
								{event.summary}
							</p>
						{/if}
					</div>

					<!-- Manage / Host CTA + Share -->
					<div class="flex shrink-0 flex-wrap items-center gap-3 self-start lg:self-end">
						{#if canManage}
							<a
								href={`/volunteer/${event.slug}/manage`}
								class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							>
								<span>Manage</span>
							</a>
							<a
								href={`/volunteer/${event.slug}/edit`}
								class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center gap-2 border-[3px] px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							>
								<span>Edit</span>
							</a>
						{:else if hostGroup?.slug}
							<a
								href={`/groups/${hostGroup.slug}`}
								class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							>
								<IconBuilding class="h-4 w-4" />
								<span>View host profile</span>
							</a>
						{/if}
						{#if event.status !== 'draft'}
							<ShareButton
								title={seoTitle}
								text={seoDescription}
								url={seoCanonical}
								kind="volunteer event"
							/>
						{/if}
					</div>
				</div>
			</div>

			<!-- 3-TILE METADATA BAND -->
			<div class="border-surface-950 grid border-t-[3px] lg:grid-cols-3">
				<!-- 01 / Schedule -->
				<div
					class="bg-surface-950 text-surface-50 border-surface-800 flex flex-col justify-between gap-4 border-b p-6 sm:p-8 lg:border-r lg:border-b-0"
				>
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconCalendar class="h-4 w-4" />
						<span>01 / Schedule</span>
					</p>
					<div class="flex flex-col gap-1">
						<p class="m-0 text-xl leading-tight font-black uppercase italic sm:text-2xl">
							{eventDateLabel(event.event_start, event.event_end, event.timezone)}
						</p>
						<p class="text-surface-300 m-0 text-sm font-bold uppercase">
							{eventTimeLabel(event.event_start, event.event_end, event.timezone)}
						</p>
					</div>
				</div>

				<!-- 02 / Location -->
				<div
					class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-col justify-between gap-4 border-b p-6 sm:p-8 lg:border-r lg:border-b-0"
				>
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconMapPin class="h-4 w-4" />
						<span>02 / Location</span>
					</p>
					<div class="flex flex-col gap-1">
						<p class="m-0 text-xl leading-tight font-black uppercase italic sm:text-2xl">
							{event.location_name || 'Meeting spot coming soon'}
						</p>
						{#if event.location_address}
							<p class="m-0 text-sm opacity-90">{event.location_address}</p>
						{/if}
					</div>
				</div>

				<!-- 03 / Host -->
				<div
					class="bg-tertiary-500 text-surface-950 flex flex-col justify-between gap-4 p-6 sm:p-8"
				>
					<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
						<IconUsers class="h-4 w-4" />
						<span>03 / Host</span>
					</p>
					<div class="flex flex-col gap-1.5">
						<p class="m-0 text-xl leading-tight font-black uppercase italic sm:text-2xl">
							{hostGroup ? hostGroup.name : 'Independent host'}
						</p>
						{#if hostGroup}
							<p class="m-0 text-xs font-bold uppercase">
								{hostLocationLabel() || 'Local volunteer crew'}
							</p>
						{/if}
						{#if contactEmail}
							<a
								href={`mailto:${contactEmail}`}
								class="text-surface-950 inline-flex items-center gap-1.5 text-xs font-bold underline underline-offset-4"
							>
								<IconMail class="h-3.5 w-3.5" />
								{contactEmail}
							</a>
						{/if}
						{#if contactPhone}
							<a
								href={`tel:${contactPhone}`}
								class="text-surface-950 inline-flex items-center gap-1.5 text-xs font-bold underline underline-offset-4"
							>
								<IconPhone class="h-3.5 w-3.5" />
								{contactPhone}
							</a>
						{/if}
						{#if hostSocialLinks.length || hostWebsite}
							<div class="flex flex-wrap gap-3 pt-1">
								{#if hostWebsite}
									<a
										href={hostWebsite}
										target="_blank"
										rel="noopener noreferrer"
										class="text-surface-950 text-xs font-black tracking-wide uppercase underline underline-offset-4"
									>
										Website
									</a>
								{/if}
								{#each hostSocialLinks as link (link.key)}
									<a
										href={link.url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-surface-950 text-xs font-black tracking-wide uppercase underline underline-offset-4"
									>
										{humanizeSlug(link.key)}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Map — flush inside hero -->
			{#if hasCoords}
				<div class="border-surface-950 h-64 w-full overflow-hidden border-t-[3px] md:h-80">
					<div bind:this={mapEl} class="h-full w-full"></div>
				</div>
			{/if}
		</header>

		<!-- EVENT FINISHED BANNER -->
		{#if eventFinished}
			<section
				class="bg-tertiary-500 text-surface-950 border-surface-950 flex items-center gap-4 border-t-[3px] px-6 py-6 sm:px-10 lg:px-14"
			>
				<span
					class="bg-surface-950 text-primary-500 flex h-12 w-12 shrink-0 items-center justify-center"
				>
					<IconAlertCircle class="h-6 w-6" />
				</span>
				<div>
					<h2 class="text-surface-950! m-0 text-xl font-black uppercase italic">
						This event has finished
					</h2>
					<p class="m-0 mt-1 text-sm font-medium">
						Sign-ups are closed, but you can still review the event details below.
					</p>
				</div>
			</section>
		{/if}

		<!-- OVERVIEW -->
		{#if eventDescriptionHtml}
			<section
				class="bg-surface-950 text-surface-50 border-surface-800 border-b px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				aria-labelledby="overview-heading"
			>
				<div class="flex flex-col gap-4">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Briefing</p>
					<h2
						id="overview-heading"
						class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
					>
						Overview
					</h2>
				</div>
				<div class="prose prose-invert mt-6 max-w-3xl space-y-4 text-base leading-relaxed">
					{#if showFullOverview || eventDescriptionPlain.length <= TRUNCATE_LIMIT}
						{@html eventDescriptionHtml}
					{:else}
						<p>{truncateText(eventDescriptionPlain)}</p>
					{/if}
				</div>
				{#if eventDescriptionPlain.length > TRUNCATE_LIMIT}
					<button
						class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:text-surface-950 hover:border-primary-500 mt-6 border-2 px-5 py-2.5 text-xs font-black tracking-wide uppercase transition"
						type="button"
						onclick={() => (showFullOverview = !showFullOverview)}
					>
						{showFullOverview ? 'Show less' : 'Show full details'}
					</button>
				{/if}
			</section>
		{/if}

		<!-- LOGIN / VOLUNTEER CTA -->
		{#if !user && !eventFinished}
			<section
				class="bg-secondary-500 text-surface-50 border-surface-950 border-b-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				aria-labelledby="ready-volunteer-heading"
			>
				<div class="flex max-w-3xl flex-col gap-4">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Step 01 / Sign in
					</p>
					<h2
						id="ready-volunteer-heading"
						class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
					>
						Ready to volunteer?
					</h2>
					<p class="m-0 text-base leading-relaxed opacity-90 sm:text-lg">
						Enter your email to get a magic link. Once you're logged in you'll be able to pick
						shifts and share the details organizers need.
					</p>
					<form
						class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end"
						onsubmit={requestMagicLink}
					>
						<div
							aria-hidden="true"
							style="position: absolute; width: 0; height: 0; overflow: hidden;"
						>
							<div bind:this={turnstileEl}></div>
						</div>
						<input
							type="text"
							name="website"
							bind:value={loginHoneypot}
							autocomplete="off"
							tabindex="-1"
							aria-hidden="true"
							style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
						/>
						<label
							class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.2em] uppercase sm:flex-1"
						>
							<span>Your email</span>
							<input
								type="email"
								class="border-surface-950 bg-surface-950 text-surface-50 placeholder:text-surface-400 border-[3px] px-4 py-3.5 text-base font-medium focus:outline-none"
								bind:value={loginEmail}
								required
								placeholder="you@example.com"
							/>
						</label>
						<button
							type="submit"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 shrink-0 px-7 py-4 text-sm font-black tracking-wide uppercase transition {loginLoading
								? 'opacity-70'
								: ''}"
							disabled={loginLoading}
						>
							{loginLoading ? 'Sending link…' : 'Email me a magic link'}
						</button>
					</form>
					{#if loginError}
						<div
							class="bg-tertiary-500 text-surface-950 mt-2 px-4 py-3 text-xs font-black uppercase"
							transition:slide
						>
							{loginError}
						</div>
					{/if}
					{#if loginSuccess}
						<div
							class="bg-primary-500 text-surface-950 mt-2 px-4 py-3 text-xs font-black uppercase"
							transition:slide
						>
							{loginSuccess}
						</div>
					{/if}
				</div>
			</section>
		{/if}

		<!-- SIGNUP SUCCESS -->
		{#if bulkSubmit.success}
			<section
				class="bg-primary-500 text-surface-950 px-6 py-16 sm:px-10 lg:px-14 lg:py-20"
				transition:slide
			>
				<div class="flex max-w-2xl flex-col gap-5">
					<span class="bg-surface-950 text-primary-500 flex h-14 w-14 items-center justify-center">
						<IconCheckCircle class="h-8 w-8" />
					</span>
					<h2
						class="text-surface-950! m-0 text-4xl leading-[0.9] font-black uppercase italic sm:text-6xl"
					>
						Thank you for volunteering!
					</h2>
					<p class="m-0 text-lg font-medium">
						We received your signup and look forward to seeing you there.
					</p>
					<div>
						<a
							href="/volunteer/shifts"
							class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						>
							View my shifts
						</a>
					</div>
				</div>
			</section>
		{/if}

		<!-- VOLUNTEER ROLES & SHIFTS -->
		{#if !bulkSubmit.success}
			<section
				id="opportunities"
				class="bg-surface-950 text-surface-50 flex flex-col gap-8 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				aria-labelledby="roles-shifts-heading"
			>
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div class="flex flex-col gap-2">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Assignments
						</p>
						<h2
							id="roles-shifts-heading"
							class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
						>
							Volunteer roles &amp; shifts
						</h2>
					</div>
				</div>

				{#if opportunities.length === 0}
					<div class="border-surface-50 border-t-2 pt-8">
						<p class="text-surface-300 m-0 max-w-xl text-base leading-relaxed">
							No volunteer opportunities defined yet. Organizers can add roles, capacities, and
							shift coverage once planning begins.
						</p>
					</div>
				{:else}
					<div class="flex flex-col gap-6">
						<!-- Instruction banner -->
						{#if !user}
							<div
								class="border-primary-500 text-primary-500 border-l-4 py-1 pl-4 text-xs font-black tracking-[0.18em] uppercase"
							>
								Log in above to choose shifts and share your details.
							</div>
						{:else}
							<div
								class="bg-secondary-500 text-surface-50 flex items-center gap-3 px-4 py-3 text-xs font-black tracking-[0.18em] uppercase"
							>
								<IconArrowDown class="text-primary-500 h-4 w-4 shrink-0" />
								<span>Click on any shift card below to select it.</span>
							</div>
						{/if}

						<div class="border-surface-50 divide-surface-800 divide-y-2 border-t-2">
							{#each opportunities as opportunity, idx (opportunity.id)}
								{@const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id]}
								<article class="flex flex-col gap-6 py-10">
									<header class="flex flex-wrap items-start justify-between gap-4">
										<div class="flex items-start gap-4 sm:gap-6">
											<span
												class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-5xl"
											>
												{String(idx + 1).padStart(2, '0')}
											</span>
											<div class="flex flex-col gap-1">
												<p
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													{typeLabel(opportunity.opportunity_type)}
												</p>
												<h3
													class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-3xl"
												>
													{opportunity.title || 'Untitled role'}
												</h3>
											</div>
										</div>
										<div class="flex flex-wrap items-center gap-2 pl-14 sm:pl-0">
											<span
												class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
											>
												{signupStatusText(opportunity)}
											</span>
											{#if opportunity.requires_approval}
												<span
													class="bg-tertiary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
												>
													Approval required
												</span>
											{/if}
										</div>
									</header>

									{#if opportunity.descriptionHtml}
										<div class="lg:pl-20">
											<div class="prose prose-invert max-w-3xl space-y-3 text-sm leading-relaxed">
												{#if expandedOpportunityDescriptions.has(opportunity.id) || opportunity.descriptionPlain.length <= TRUNCATE_LIMIT}
													{@html opportunity.descriptionHtml}
												{:else}
													<p>{truncateText(opportunity.descriptionPlain)}</p>
												{/if}
											</div>
											{#if opportunity.descriptionPlain.length > TRUNCATE_LIMIT}
												<button
													class="text-primary-500 hover:text-surface-50 mt-3 text-xs font-black tracking-[0.16em] uppercase transition"
													type="button"
													onclick={() => toggleOpportunityDescription(opportunity.id)}
												>
													{expandedOpportunityDescriptions.has(opportunity.id)
														? '↑ Show less'
														: '↓ Show full details'}
												</button>
											{/if}
										</div>
									{/if}

									<div class="lg:pl-20">
										{#if !opportunity.shifts || opportunity.shifts.length === 0}
											<p
												class="border-surface-800 text-surface-300 m-0 border-t border-b py-4 text-sm"
											>
												Organizers will add shift timing soon. Volunteers can still express interest
												below.
											</p>
										{:else}
											<ul class="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
												{#each opportunity.shifts as shift (shift.id)}
													{@const isSelected = form.shiftIds?.includes(shift.id)}
													{@const approvedCount = getShiftSignupCount(shift.id)}
													{@const waitlistedCount = getShiftWaitlistCount(shift.id)}
													{@const calendarLinks = volunteerShiftCalendarLinks(shift, opportunity)}
													{@const cap = Number(shift.capacity) || 0}
													{@const pct = cap
														? Math.min(100, Math.round((approvedCount / cap) * 100))
														: 0}
													<li class="flex flex-col gap-2">
														<button
															type="button"
															class={`group relative w-full border-[3px] p-4 text-left transition ${
																isSelected
																	? 'border-primary-500 bg-primary-500 text-surface-950'
																	: 'border-surface-700 bg-surface-900 text-surface-50 hover:border-primary-500'
															}`}
															aria-pressed={isSelected}
															disabled={!user || eventFinished}
															onclick={() => {
																if (!user || eventFinished) return;
																toggleShiftSelection(opportunity.id, shift.id);
															}}
														>
															<!-- capacity bar -->
															{#if cap > 0}
																<div class="bg-surface-800 absolute top-0 right-0 left-0 h-1">
																	<div
																		class="h-full {pct >= 100
																			? 'bg-tertiary-500'
																			: isSelected
																				? 'bg-surface-950'
																				: 'bg-primary-500'}"
																		style="width: {pct}%"
																	></div>
																</div>
															{/if}

															<div class="flex flex-wrap items-center justify-between gap-3 pt-1">
																<div class="flex items-center gap-3">
																	<span
																		class={`flex h-8 w-8 shrink-0 items-center justify-center ${
																			isSelected
																				? 'text-surface-950'
																				: 'text-surface-300 group-hover:text-primary-500'
																		}`}
																	>
																		<IconCircleCheckBig class="h-7 w-7" />
																	</span>
																	<div class="min-w-0">
																		<p class="m-0 text-sm leading-tight font-black uppercase">
																			{formatShiftRange(shift)}
																		</p>
																		<p
																			class="m-0 mt-1 flex items-center gap-1 text-[11px] font-bold uppercase opacity-80"
																		>
																			<IconClock class="h-3 w-3" />
																			{shift.timezone || event.timezone || 'Timezone TBD'}
																		</p>
																	</div>
																</div>
																<div class="text-right text-xs font-black uppercase tabular-nums">
																	<span>
																		{approvedCount}{cap ? `/${cap}` : ''} spots
																	</span>
																	{#if waitlistedCount > 0}
																		<p class="m-0 text-[11px]">
																			{waitlistedCount} waitlisted
																		</p>
																	{/if}
																</div>
															</div>
															{#if shift.notes}
																<p class="m-0 mt-2 text-xs opacity-85">{shift.notes}</p>
															{/if}
														</button>
														{#if calendarLinks.googleUrl || calendarLinks.icsUrl}
															<div
																class="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold uppercase"
															>
																{#if calendarLinks.googleUrl}
																	<a
																		href={calendarLinks.googleUrl}
																		target="_blank"
																		rel="noopener noreferrer"
																		class="text-primary-500 hover:text-surface-50 underline underline-offset-4"
																		onclick={(eventObj) => eventObj.stopPropagation()}
																	>
																		Add to Google Calendar
																	</a>
																{/if}
																{#if calendarLinks.icsUrl}
																	<a
																		href={calendarLinks.icsUrl}
																		class="text-primary-500 hover:text-surface-50 underline underline-offset-4"
																		onclick={(eventObj) => eventObj.stopPropagation()}
																	>
																		Download .ics
																	</a>
																{/if}
															</div>
														{/if}
													</li>
												{/each}
											</ul>
										{/if}
									</div>

									{#if !selectedOpportunities.length && user && !eventFinished}
										<div
											class="border-tertiary-500 text-tertiary-400 flex items-center gap-2 border-l-4 py-1 pl-4 text-xs font-black tracking-[0.16em] uppercase lg:ml-20"
											transition:slide
										>
											<IconArrowUp class="h-4 w-4 shrink-0" />
											<p class="m-0">
												You haven't selected any shifts yet. Pick one above to get started.
											</p>
										</div>
									{/if}
								</article>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}

		<!-- COMPLETE SIGNUP (authenticated) -->
		{#if user && !bulkSubmit.success && !eventFinished}
			<section
				class="bg-secondary-500 text-surface-50 border-surface-950 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
				transition:slide
				aria-labelledby="complete-signup-heading"
			>
				<div class="flex flex-col gap-8">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Final step
							</p>
							<h2
								id="complete-signup-heading"
								class="text-surface-50! m-0 mt-1 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
							>
								Complete your volunteer signup
							</h2>
						</div>
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.16em] uppercase">
							Signed in as {user.email}
						</p>
					</div>

					<div class="flex flex-col gap-3">
						<SmsContextOptIn
							category="volunteer_reminders"
							source="volunteer-signup"
							title="Text me reminders for my volunteer shifts"
							description="Get concise reminders for shifts you select at this event."
						/>
						<SmsContextOptIn
							category="admin_messages"
							source="volunteer-signup-admin-messages"
							title="Let volunteer organizers text me about my shifts"
							description="Receive and reply to messages from organizers about volunteer shifts you select."
						/>
					</div>

					{#if selectedOpportunities.length}
						<div
							class="border-surface-950 flex flex-col gap-6 border-t-[3px] pt-6"
							transition:slide
						>
							<h3 class="text-primary-500! m-0 text-sm font-black tracking-[0.22em] uppercase">
								Selected shifts
							</h3>
							{#each selectedOpportunities as opportunity (opportunity.id)}
								{@const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id]}
								{@const selectedShifts = getSelectedShiftEntries(opportunity, form)}
								{@const opportunityQuestions = getQuestionsForOpportunity(opportunity.id)}
								<article class="flex flex-col gap-4" transition:slide>
									<VolunteerSelectedShifts
										{selectedShifts}
										{opportunity}
										requiresSelection={false}
										onRemoveShift={(shiftId) => toggleShiftSelection(opportunity.id, shiftId)}
										optionalSelectionMessage="No shifts selected."
									/>
									{#if opportunityQuestions.length}
										<VolunteerQuestionFields
											questions={opportunityQuestions}
											values={form.questionResponses ?? {}}
											errors={form.questionErrors ?? {}}
											onChange={(questionId, value) => {
												const nextResponses = {
													...(form.questionResponses ?? {}),
													[questionId]: value
												};
												const nextErrors = { ...(form.questionErrors ?? {}) };
												if (nextErrors[questionId]) delete nextErrors[questionId];
												updateSignupForm(opportunity.id, {
													questionResponses: nextResponses,
													questionErrors: nextErrors
												});
											}}
										/>
									{/if}
								</article>
							{/each}
						</div>
					{:else}
						<p class="text-primary-500 m-0 text-sm font-bold uppercase">
							Select at least one shift above to review your signup details.
						</p>
					{/if}

					<!-- Volunteer details (ruled section, no nested card) -->
					<div class="border-surface-950 flex flex-col gap-5 border-t-[3px] pt-6">
						<div class="flex flex-col gap-1">
							<h3 class="text-surface-50! m-0 text-xl font-black uppercase italic sm:text-2xl">
								Volunteer details &amp; questions
							</h3>
							<p class="m-0 text-xs opacity-85">
								These contact details apply to every role you sign up for above.
							</p>
						</div>
						<VolunteerContactFields values={sharedDetails} onChange={updateSharedDetail} />
						{#if eventQuestions.length}
							<VolunteerQuestionFields
								questions={eventQuestions}
								values={eventQuestionResponses}
								errors={eventQuestionErrors}
								onChange={(questionId, value) => updateEventQuestionResponse(questionId, value)}
							/>
						{/if}
					</div>

					<!-- Submit -->
					<div class="border-surface-950 flex flex-col gap-3 border-t-[3px] pt-6">
						<p class="m-0 text-xs opacity-85">
							We'll send confirmations to the contact details above once you submit.
						</p>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex w-full items-center justify-center gap-2 px-7 py-4 text-base font-black tracking-wide uppercase transition disabled:opacity-40 {bulkSubmit.loading
								? 'animate-pulse'
								: ''}"
							disabled={bulkSubmit.loading || selectedOpportunities.length === 0}
							onclick={handleBulkSignupSubmission}
						>
							{#if bulkSubmit.loading}
								<IconLoader class="h-5 w-5 animate-spin" />
								Processing…
							{:else}
								Sign me up!
							{/if}
						</button>
						{#if selectedOpportunities.length === 0 && !bulkSubmit.loading}
							<p class="text-primary-500 m-0 text-center text-xs font-bold uppercase">
								Select at least one shift above to enable the button.
							</p>
						{/if}
						{#if bulkSubmit.error}
							<p
								class="bg-tertiary-500 text-surface-950 m-0 px-4 py-3 text-xs font-black uppercase"
							>
								{bulkSubmit.error}
							</p>
						{/if}
					</div>
				</div>
			</section>
		{/if}

		<!-- HAVE A QUESTION (collapsible) -->
		{#if organizerEmail}
			<section
				class="bg-surface-950 text-surface-50 border-surface-800 border-t-[3px] px-6 py-10 sm:px-10 lg:px-14"
			>
				<button
					type="button"
					class="text-surface-50 hover:text-primary-500 flex w-full items-center justify-between py-2 text-left transition"
					onclick={() => (showQuestion = !showQuestion)}
				>
					<span class="text-2xl font-black uppercase italic sm:text-3xl">Have a question?</span>
					<IconChevronDown
						class="text-primary-500 h-6 w-6 transition-transform duration-300 {showQuestion
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if showQuestion}
					<div class="border-surface-800 mt-4 border-t pt-6" transition:slide>
						<p class="text-surface-300 m-0 max-w-2xl text-sm">
							Send the event organizer a message. We'll share your email address so they can reply
							directly.
						</p>
						{#if questionStatus.success}
							<div
								class="bg-primary-500 text-surface-950 mt-4 px-5 py-4 text-sm font-black uppercase"
								transition:slide
							>
								{questionStatus.success}
							</div>
						{:else}
							<form
								class="mt-6 flex max-w-3xl flex-col gap-5"
								onsubmit={handleQuestionSubmit}
								transition:slide
							>
								<div class="grid gap-4 md:grid-cols-2">
									<label class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.2em] uppercase">
										<span class="text-primary-500">Your email</span>
										<input
											type="email"
											class="border-surface-50 bg-surface-900 text-surface-50 border-2 px-4 py-3 text-sm font-medium focus:outline-none"
											autocomplete="email"
											required
											value={questionForm.replyTo}
											oninput={(event) => updateQuestionField('replyTo', event.currentTarget.value)}
										/>
										{#if questionErrors.replyTo}
											<span class="text-tertiary-400 text-[11px] tracking-normal normal-case">
												{questionErrors.replyTo}
											</span>
										{/if}
									</label>
									<label class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.2em] uppercase">
										<span class="text-primary-500">Subject</span>
										<input
											type="text"
											class="border-surface-50 bg-surface-900 text-surface-50 border-2 px-4 py-3 text-sm font-medium focus:outline-none"
											required
											minlength="3"
											value={questionForm.subject}
											oninput={(event) => updateQuestionField('subject', event.currentTarget.value)}
										/>
										{#if questionErrors.subject}
											<span class="text-tertiary-400 text-[11px] tracking-normal normal-case">
												{questionErrors.subject}
											</span>
										{/if}
									</label>
								</div>
								<label class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.2em] uppercase">
									<span class="text-primary-500">Message</span>
									<textarea
										class="border-surface-50 bg-surface-900 text-surface-50 border-2 px-4 py-3 text-sm font-medium focus:outline-none"
										required
										rows="4"
										bind:value={questionForm.message}></textarea>
									{#if questionErrors.message}
										<span class="text-tertiary-400 text-[11px] tracking-normal normal-case">
											{questionErrors.message}
										</span>
									{/if}
								</label>
								{#if !questionStatus.success && questionStatus.error}
									<p
										class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-black uppercase"
									>
										{questionStatus.error}
									</p>
								{/if}
								<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<button
										type="submit"
										class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition"
										disabled={questionStatus.loading}
									>
										{#if questionStatus.loading}
											<IconLoader class="h-4 w-4 animate-spin" />
										{/if}
										<span>Send question</span>
									</button>
									{#if !questionStatus.success && !questionStatus.error}
										<p class="text-surface-300 m-0 text-xs">
											Responses will go to {questionForm.replyTo || 'your email'}.
										</p>
									{/if}
								</div>
							</form>
						{/if}
					</div>
				{/if}
			</section>
		{:else}
			<section
				class="bg-surface-950 text-surface-50 border-surface-800 border-t-[3px] px-6 py-10 sm:px-10 lg:px-14"
			>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
					Organizer contact coming soon
				</h2>
				<p class="text-surface-300 m-0 mt-2 max-w-xl text-sm">
					We're getting the organizer's contact information ready. Please check back later if you
					need to get in touch.
				</p>
			</section>
		{/if}
	{/if}
</div>
