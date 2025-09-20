<script>
	let { data } = $props();
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { renderMarkdown } from '$lib/markdown';
	import {
		createVolunteerSignup,
		updateVolunteerSignup,
		createVolunteerSignupShift,
		deleteVolunteerSignupShift,
		createVolunteerSignupResponse,
		updateVolunteerSignupResponse,
		deleteVolunteerSignupResponse
	} from '$lib/services/volunteers';
	import { ensureLeafletDefaultIcon } from '$lib/map/leaflet';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import IconLink from '@lucide/svelte/icons/link';
	import IconLayers from '@lucide/svelte/icons/layers';
	import IconBuilding from '@lucide/svelte/icons/building';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import VolunteerQuestionFields from '$lib/components/volunteer/VolunteerQuestionFields.svelte';
	import VolunteerContactFields from '$lib/components/volunteer/VolunteerContactFields.svelte';
	import VolunteerSelectedShifts from '$lib/components/volunteer/VolunteerSelectedShifts.svelte';
	import { slide } from 'svelte/transition';

	const event = data.event ?? {};
	const hostGroup = data.hostGroup ?? null;
	const eventType = data.eventType ?? null;
	const customQuestions = data.customQuestions ?? [];
	const eventQuestions = customQuestions.filter((question) => !question?.opportunity_id);
	const authRequired = data.authRequired ?? false;
	const draftRestricted = data.draftForbidden ?? false;
	const canManage = data.canManageEvent ?? false;
	let signups = [...(data.signups ?? [])];
	let signupShifts = [...(data.signupShifts ?? [])];
	let signupResponses = [...(data.signupResponses ?? [])];
	let shiftSignupCounts = { ...(data.shiftSignupCounts ?? {}) };
	const user = data.user ?? null;
	let profile = data.profile ?? null;
	let userSignups = [...(data.userSignups ?? [])];
	let loginReturnTo = data.returnTo ?? '';

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

	const fieldTypeLabels = {
		text: 'Short text',
		textarea: 'Long text',
		number: 'Number',
		select: 'Single select',
		multiselect: 'Multi select',
		checkbox: 'Checkbox',
		phone: 'Phone',
		email: 'Email',
		url: 'Link'
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

	function humanizeSlug(value) {
		return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	const eventTypeLabel = eventType?.event_type
		? eventType.event_type
		: event?.event_type_slug
			? humanizeSlug(event.event_type_slug)
			: '';

	const hostWebsite = (hostGroup?.website_url || '').trim();
	const hostServiceArea = (hostGroup?.service_area_description || '').trim();
	const hostSocialLinks = (() => {
		const raw = hostGroup?.social_links;
		if (!raw || typeof raw !== 'object') return [];
		return Object.entries(raw)
			.filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
			.map(([key, value]) => ({ key, url: value.trim() }));
	})();

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

	const opportunitiesRaw = data.opportunities ?? [];
	const mapOpportunityMeta = (opportunity) => {
		const userSignup = signupByOpportunity[opportunity.id];
		const userShiftRows = userSignup ? (shiftRowsBySignup[userSignup.id] ?? []) : [];
		const shiftIds = userShiftRows.map((row) => row.shift_id);
		return {
			...opportunity,
			userSignup,
			defaultShiftIds: shiftIds,
			descriptionHtml: renderMarkdown(opportunity.description || '')
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
		acc[opportunity.id] = {
			volunteerName: existing?.volunteer_name?.trim() || defaultName || '',
			volunteerEmail: existing?.volunteer_email?.trim() || defaultEmail || '',
			volunteerPhone: existing?.volunteer_phone?.trim() || defaultPhone,
			emergencyContactName: existing?.emergency_contact_name?.trim() || defaultEmergencyName,
			emergencyContactPhone: existing?.emergency_contact_phone?.trim() || defaultEmergencyPhone,
			shiftIds: [...(opportunity.defaultShiftIds ?? [])],
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
	let bulkSubmit = $state({ loading: false, success: '', error: '' });

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
				'chip preset-tonal-warning border border-warning-400/40 bg-warning-500/10 text-warning-50 uppercase tracking-wide text-[11px]'
		},
		published: {
			label: 'Published',
			className:
				'chip preset-tonal-success border border-success-500/40 bg-success-500/10 text-success-50 uppercase tracking-wide text-[11px]'
		},
		cancelled: {
			label: 'Cancelled',
			className:
				'chip preset-tonal-error border border-error-500/40 bg-error-500/10 text-error-100 uppercase tracking-wide text-[11px]'
		},
		archived: {
			label: 'Archived',
			className:
				'chip preset-tonal-surface border border-surface-400/40 bg-surface-700/40 text-surface-100 uppercase tracking-wide text-[11px]'
		}
	};
	const statusInfo = statusStyles[event.status] ?? {
		label: event.status ? event.status.replace(/_/g, ' ') : 'Unknown',
		className:
			'chip preset-tonal-surface border border-surface-500/40 bg-surface-700/40 text-surface-100 uppercase tracking-wide text-[11px]'
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

	function questionScope(question) {
		if (question?.opportunity_id) {
			const match = opportunities.find((opp) => opp.id === question.opportunity_id);
			return match?.title || 'Specific role';
		}
		return 'All signups';
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

	function getShiftSignupCount(shiftId) {
		return shiftSignupCounts[shiftId] || 0;
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
			}
			bulkSubmit = { loading: false, success: 'Signups saved! Refreshing...', error: '' };
			if (typeof window !== 'undefined') {
				await new Promise((resolve) => setTimeout(resolve, 650));
				await goto(window.location.pathname + window.location.search, {
					replaceState: true,
					keepFocus: true,
					noScroll: true
				});
			}
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
		if (details.email !== undefined) assign('email', details.email);
		if (details.emergency_contact_name !== undefined)
			assign('emergency_contact_name', details.emergency_contact_name);
		if (details.emergency_contact_phone !== undefined)
			assign('emergency_contact_phone', details.emergency_contact_phone);

		if (!changed) return;
		const { error: profileError, data: updated } = await supabase
			.from('profiles')
			.upsert(payload, { onConflict: 'user_id' })
			.select()
			.single();
		if (profileError) {
			throw new Error(profileError.message || 'Unable to update profile');
		}
		profile = updated ?? { ...current, ...payload };
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

			for (const shiftId of toAdd) {
				const response = await createVolunteerSignupShift({
					signup_id: signupRecord.id,
					shift_id: shiftId
				});
				const created = response?.data ?? response;
				if (created?.id) {
					signupShifts = [...signupShifts, created];
					shiftSignupCounts = {
						...shiftSignupCounts,
						[shiftId]: (shiftSignupCounts[shiftId] || 0) + 1
					};
				}
			}

			for (const shiftId of toRemove) {
				const row = signupShifts.find(
					(existing) => existing.signup_id === signupRecord.id && existing.shift_id === shiftId
				);
				if (row?.id) {
					await deleteVolunteerSignupShift(row.id);
					signupShifts = signupShifts.filter((existing) => existing.id !== row.id);
					shiftSignupCounts = {
						...shiftSignupCounts,
						[shiftId]: Math.max((shiftSignupCounts[shiftId] || 1) - 1, 0)
					};
				}
			}

			shiftRowsBySignup = signupShifts.reduce((acc, row) => {
				if (!row?.signup_id) return acc;
				if (!acc[row.signup_id]) acc[row.signup_id] = [];
				acc[row.signup_id].push(row);
				return acc;
			}, {});

			await syncSignupResponses(signupRecord, opportunity, form);

			updateSignupForm(opportunity.id, {
				loading: false,
				success: skipRefresh ? 'Signup saved!' : 'Signup saved! Refreshing...',
				error: '',
				questionErrors: {}
			});

			if (!skipRefresh && typeof window !== 'undefined') {
				await new Promise((resolve) => setTimeout(resolve, 650));
				await goto(window.location.pathname + window.location.search, {
					replaceState: true,
					keepFocus: true,
					noScroll: true
				});
			}
			return { ok: true, signup: signupRecord };
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
		loginLoading = true;
		try {
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, createProfile: true, returnTo: loginReturnTo })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Unable to send magic link.');
			}
			loginSuccess = `Check ${email} for your login link.`;
		} catch (err) {
			loginError = err.message || 'Something went wrong.';
		} finally {
			loginLoading = false;
		}
	}

	function volunteerCapacityLabel() {
		const volunteerCapacity = opportunities.reduce((sum, opportunity) => {
			const shiftCapacity = getOpportunityShiftCapacity(opportunity);
			if (shiftCapacity) return sum + shiftCapacity;
			if (Number(opportunity.max_volunteers)) return sum + Number(opportunity.max_volunteers);
			return sum;
		}, 0);
		if (volunteerCapacity) return `Targeting ${volunteerCapacity} volunteers`;
		if (event.max_volunteers) return `Max ${event.max_volunteers} volunteers`;
		return 'Flexible roster';
	}
</script>

<svelte:head>
	<title
		>{event.title ? `${event.title} - Volunteer Event` : 'Volunteer Event'} | 3 Feet Please</title
	>
	{#if event.summary}
		<meta name="description" content={event.summary} />
	{/if}
</svelte:head>

{#if draftRestricted}
	<section class="mx-auto max-w-3xl space-y-6 px-4 py-16">
		<div
			class="border-error-500/40 bg-error-900/30 text-error-100 rounded-3xl border p-8 shadow-lg"
		>
			<h1 class="text-2xl font-semibold">This draft is locked</h1>
			<p class="text-error-200 mt-3 text-sm">
				Only the event host or owners of the hosting group can view draft events. Ask the organizer
				to publish or add you as an owner to continue.
			</p>
		</div>
	</section>
{:else if authRequired}
	<section class="mx-auto max-w-3xl space-y-6 px-4 py-16">
		<div
			class="border-warning-500/40 bg-warning-900/30 text-warning-100 rounded-3xl border p-8 shadow-lg"
		>
			<h1 class="text-2xl font-semibold">Log in to view this draft event</h1>
			<p class="text-warning-200 mt-3 text-sm">
				This event is still in draft. Enter your email to receive a magic link and continue.
			</p>
			<form class="mt-6 space-y-3" onsubmit={requestMagicLink}>
				<label
					class="text-warning-200 text-xs font-semibold tracking-wide uppercase"
					for="draft-login-email">Email</label
				>
				<input
					id="draft-login-email"
					type="email"
					class="input bg-surface-950/60"
					bind:value={loginEmail}
					required
					placeholder="you@example.com"
				/>
				{#if loginError}
					<p class="text-error-200 text-xs">{loginError}</p>
				{/if}
				{#if loginSuccess}
					<p class="text-success-200 text-xs">{loginSuccess}</p>
				{/if}
				<button
					type="submit"
					class={`btn preset-filled-warning-500 w-full ${loginLoading ? 'animate-pulse' : ''}`}
					disabled={loginLoading}
				>
					{loginLoading ? 'Sending magic link…' : 'Email me a magic link'}
				</button>
			</form>
		</div>
	</section>
{:else}
	<section class="mx-auto max-w-6xl space-y-12 px-4 py-12">
		<header
			class="border-surface-400/20 bg-surface-900/70 rounded-3xl border p-8 shadow-2xl shadow-black/20"
		>
			<div class="flex flex-wrap items-center gap-3">
				{#if eventTypeLabel}
					<span
						class="chip preset-tonal-secondary border-secondary-400/30 bg-secondary-500/10 text-secondary-100 border text-[11px] tracking-wide uppercase"
					>
						{eventTypeLabel}
					</span>
				{/if}
				{#if canManage}
					<span class={statusInfo.className}>{statusInfo.label}</span>
					{#if event.waitlist_enabled}
						<span
							class="chip preset-tonal-primary border-primary-400/30 bg-primary-500/10 text-primary-100 border text-[11px] tracking-wide uppercase"
						>
							Waitlist enabled
						</span>
					{/if}
				{/if}
			</div>
			<div class="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<div class="space-y-3">
					<h1 class="text-secondary-100 !text-left text-3xl font-bold md:text-4xl">
						{event.title || 'Untitled volunteer event'}
					</h1>
					{#if eventType?.description}
						<p class="text-surface-300 max-w-3xl text-sm">{eventType.description}</p>
					{:else if eventTypeLabel}
						<p class="text-surface-400 max-w-3xl text-sm">
							{eventTypeLabel} volunteer opportunity.
						</p>
					{/if}
					{#if event.summary}
						<p class="text-surface-200 max-w-2xl text-base">{event.summary}</p>
					{/if}
				</div>
				{#if hostGroup?.slug}
					<a
						href={`/groups/${hostGroup.slug}`}
						class="btn preset-filled-secondary-500 flex items-center gap-2 self-start"
					>
						<IconBuilding class="h-4 w-4" />
						<span>View host profile</span>
					</a>
				{/if}
			</div>

			<div class="mt-8 grid gap-4 lg:grid-cols-3">
				<div class="border-surface-400/20 bg-surface-800/40 rounded-2xl border p-4">
					<div class="flex items-center gap-3 text-sm">
						<span class="bg-primary-500/15 text-primary-200 rounded-lg p-2">
							<IconCalendar class="h-4 w-4" />
						</span>
						<div>
							<p class="text-surface-400 text-xs tracking-wide uppercase">Schedule</p>
							<p class="text-surface-100 font-semibold">
								{eventDateLabel(event.event_start, event.event_end, event.timezone)}
							</p>
							<p class="text-surface-300 text-xs">
								{eventTimeLabel(event.event_start, event.event_end, event.timezone)}
							</p>
						</div>
					</div>
				</div>
				<div class="border-surface-400/20 bg-surface-800/40 rounded-2xl border p-4">
					<div class="flex items-center gap-3 text-sm">
						<span class="bg-secondary-500/15 text-secondary-200 rounded-lg p-2">
							<IconMapPin class="h-4 w-4" />
						</span>
						<div>
							<p class="text-surface-400 text-xs tracking-wide uppercase">Location</p>
							<p class="text-surface-100 font-semibold">
								{#if event.location_name}
									{event.location_name}
								{:else}
									Meeting spot coming soon
								{/if}
							</p>
							{#if event.location_address}
								<p class="text-surface-400 text-xs">{event.location_address}</p>
							{/if}
						</div>
					</div>
				</div>
				<div class="border-surface-400/20 bg-surface-800/40 rounded-2xl border p-4">
					<div class="flex items-center gap-3 text-sm">
						<span class="bg-primary-300/15 text-primary-100 rounded-lg p-2">
							<IconUsers class="h-4 w-4" />
						</span>
						<div>
							<p class="text-surface-400 text-xs tracking-wide uppercase">Host</p>
							<p class="text-surface-100 font-semibold">
								{#if hostGroup}
									{hostGroup.name}
								{:else}
									Independent host
								{/if}
							</p>
							{#if hostGroup}
								<p class="text-surface-400 text-xs">
									{hostLocationLabel() || 'Local volunteer crew'}
								</p>
								{#if hostSocialLinks.length}
									<ul
										class="text-surface-400 mt-2 flex flex-wrap gap-2 text-[11px] tracking-wide uppercase"
									>
										{#if hostWebsite}
											<li>
												<a
													href={hostWebsite}
													target="_blank"
													rel="noopener noreferrer"
													class="hover:text-secondary-100"
												>
													Website
												</a>
											</li>
										{/if}
										{#each hostSocialLinks as link}
											<li>
												<a
													href={link.url}
													target="_blank"
													rel="noopener noreferrer"
													class="hover:text-secondary-100"
												>
													{humanizeSlug(link.key)}
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
							<ul class="mt-2 space-y-1 text-xs">
								{#if contactEmail}
									<li class="flex items-center gap-2">
										<IconMail class="text-secondary-200 h-4 w-4" />
										<a href={`mailto:${contactEmail}`} class="hover:underline">{contactEmail}</a>
									</li>
								{/if}
								{#if contactPhone}
									<li class="flex items-center gap-2">
										<IconPhone class="text-secondary-200 h-4 w-4" />
										<a href={`tel:${contactPhone}`} class="hover:underline">{contactPhone}</a>
									</li>
								{/if}
							</ul>
						</div>
					</div>
				</div>
			</div>

			{#if hasCoords}
				<div class="mt-8">
					<div
						class="border-surface-400/20 bg-surface-900/40 h-72 w-full overflow-hidden rounded-3xl border"
					>
						<div bind:this={mapEl} class="h-full w-full"></div>
					</div>
				</div>
			{/if}
		</header>

		<div class="space-y-10">
			{#if eventDescriptionHtml}
				<section class="border-surface-400/20 bg-surface-900/70 rounded-3xl border p-6 shadow-lg">
					<h2 class="text-secondary-100 text-2xl font-semibold">Overview</h2>
					<div class="prose prose-invert text-surface-100 mt-4 max-w-none space-y-4">
						{@html eventDescriptionHtml}
					</div>
				</section>
			{/if}

			{#if !user}
				<section
					class="border-secondary-500/30 bg-secondary-500/5 rounded-3xl border p-6 shadow-lg"
				>
					<h2 class="text-secondary-100 text-2xl font-semibold">Ready to volunteer?</h2>
					<p class="text-surface-300 mt-2 text-sm">
						Enter your email to get a magic link. Once you’re logged in you’ll be able to pick
						shifts and share the details organizers need.
					</p>
					<form
						class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
						onsubmit={requestMagicLink}
					>
						<label
							class="text-surface-400 flex flex-col gap-1 text-xs tracking-wide uppercase sm:flex-1"
						>
							<span>Email</span>
							<input
								type="email"
								class="input bg-surface-950/40"
								bind:value={loginEmail}
								required
								placeholder="you@example.com"
							/>
						</label>
						<button
							type="submit"
							class={`btn preset-filled-primary-500 ${loginLoading ? 'animate-pulse' : ''}`}
							disabled={loginLoading}
						>
							{loginLoading ? 'Sending link…' : 'Email me a login link'}
						</button>
					</form>
					{#if loginError}
						<p
							class="border-error-500/40 bg-error-500/10 text-error-200 mt-3 rounded-lg border px-3 py-2 text-xs"
						>
							{loginError}
						</p>
					{/if}
					{#if loginSuccess}
						<p
							class="border-success-500/40 bg-success-500/10 text-success-200 mt-3 rounded-lg border px-3 py-2 text-xs"
						>
							{loginSuccess}
						</p>
					{/if}
				</section>
			{/if}

			<section class="space-y-6">
				<div class="flex items-start justify-between gap-3">
					<h2 class="text-secondary-100 text-2xl font-semibold">Volunteer roles & shifts</h2>
				</div>

				{#if opportunities.length === 0}
					<div
						class="border-primary-500/40 bg-primary-500/5 text-primary-100 rounded-3xl border border-dashed p-6 text-center text-sm"
					>
						No volunteer opportunities defined yet. Organizers can add roles, capacities, and shift
						coverage once planning begins.
					</div>
				{:else}
					<div class="space-y-6">
						{#each opportunities as opportunity (opportunity.id)}
							{@const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id]}
							<article
								class="border-surface-400/20 bg-surface-900/60 rounded-3xl border p-6 shadow-lg"
							>
								<header class="flex flex-wrap items-center justify-between gap-4">
									<div>
										<h3 class="text-surface-50 text-xl font-semibold">
											{opportunity.title || 'Untitled role'}
										</h3>
										<p class="text-surface-400 text-xs tracking-wide uppercase">
											{typeLabel(opportunity.opportunity_type)}
										</p>
									</div>
									<div
										class="text-surface-300 flex flex-wrap items-center gap-2 text-xs tracking-wide uppercase"
									>
										<span class="chip preset-tonal-surface">{signupStatusText(opportunity)}</span>
										{#if opportunity.requires_approval}
											<span class="chip preset-tonal-warning text-warning-200"
												>Approval required</span
											>
										{/if}
										{#if opportunity.auto_confirm_attendance}
											<span class="chip preset-tonal-success text-success-100"
												>Auto-confirm shifts</span
											>
										{/if}
									</div>
								</header>

								{#if opportunity.descriptionHtml}
									<div
										class="prose prose-invert text-surface-100 mt-4 max-w-none space-y-3 text-sm"
									>
										{@html opportunity.descriptionHtml}
									</div>
								{/if}

								<div class="mt-6 space-y-6">
									<div class="space-y-2">
										{#if !user}
											<p class="text-surface-400 text-xs">
												Log in above to choose shifts and share your details.
											</p>
										{:else}
											<p
												class="bg-secondary-500/15 text-secondary-50 border-secondary-400/40 rounded-xl border px-3 py-2 text-sm font-semibold"
											>
												Pick the shifts you want to cover, then finish your signup below.
											</p>
										{/if}
									</div>

									<div class="space-y-3">
										<h5
											class="text-surface-300 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase"
										>
											<IconLayers class="h-4 w-4" /> Shift coverage
										</h5>
										{#if !opportunity.shifts || opportunity.shifts.length === 0}
											<p
												class="border-surface-500/40 bg-surface-800/40 text-surface-300 rounded-2xl border border-dashed p-4 text-sm"
											>
												Organizers will add shift timing soon. Volunteers can still express interest
												below.
											</p>
										{:else}
											<ul class="grid gap-2 md:grid-cols-2">
												{#each opportunity.shifts as shift (shift.id)}
													{@const isSelected = form.shiftIds?.includes(shift.id)}
													<li>
														<button
															type="button"
															class={`focus:ring-secondary-400 w-full rounded-2xl border p-4 text-left transition focus:ring-2 focus:outline-none ${
																isSelected
																	? 'border-secondary-300 bg-secondary-500/25 text-secondary-50 ring-secondary-300 font-semibold shadow-md ring-2'
																	: 'border-surface-500/40 bg-surface-800/40 text-surface-200 hover:border-secondary-400/50'
															}`}
															aria-pressed={isSelected}
															disabled={!user}
															onclick={() => {
																if (!user) return;
																toggleShiftSelection(opportunity.id, shift.id);
															}}
														>
															<div class="flex flex-wrap items-center justify-between gap-3">
																<div class="flex items-center gap-3">
																	<span
																		class={`${
																			isSelected
																				? 'bg-secondary-500/40 text-secondary-50'
																				: 'bg-primary-500/10 text-primary-200'
																		} rounded-lg p-2`}
																	>
																		<IconClock class="h-4 w-4" />
																	</span>
																	<div class="min-w-0">
																		<p class="text-surface-50 text-sm font-semibold">
																			{formatShiftRange(shift)}
																		</p>
																		<p class="text-surface-400 text-xs">
																			{shift.timezone || event.timezone || 'Timezone TBD'}
																		</p>
																	</div>
																</div>
																<div class="text-surface-300 ml-auto text-right text-xs">
																	<span class="text-surface-100 font-semibold">
																		{getShiftSignupCount(shift.id)} volunteer{getShiftSignupCount(
																			shift.id
																		) === 1
																			? ''
																			: 's'}
																	</span>
																	{#if Number(shift.capacity)}
																		<span> / {Number(shift.capacity)} slots</span>
																	{/if}
																	{#if shift.notes}
																		<p class="text-surface-400 text-xs">{shift.notes}</p>
																	{/if}
																</div>
															</div>
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
			{#if user}
				<section class="border-surface-400/20 bg-surface-900/70 rounded-3xl border p-6 shadow-lg">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<h2 class="text-secondary-100 text-2xl font-semibold">
							Complete your volunteer signup
						</h2>
						<p class="text-surface-300 text-xs sm:text-sm">Signed in as {user.email}</p>
					</div>

					{#if selectedOpportunities.length}
						<div class="mt-6 space-y-6" transition:slide>
							<h3 class="text-secondary-100 text-lg font-semibold tracking-wide uppercase">
								Selected shifts
							</h3>
							{#each selectedOpportunities as opportunity (opportunity.id)}
								{@const form = signupForms[opportunity.id] ?? signupFormDefaults[opportunity.id]}
								{@const selectedShifts = getSelectedShiftEntries(opportunity, form)}
								{@const opportunityQuestions = getQuestionsForOpportunity(opportunity.id)}
								<article transition:slide>
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
						<p class="text-surface-400 mt-4 text-sm">
							Select at least one shift above to review your signup details.
						</p>
					{/if}

					<div
						class="border-surface-500/30 bg-surface-900/60 mt-8 space-y-4 rounded-3xl border p-6"
					>
						<h3 class="text-secondary-100 text-lg font-semibold tracking-wide uppercase">
							Volunteer details & questions
						</h3>
						<p class="text-surface-400 text-xs">
							These contact details apply to every role you sign up for above.
						</p>
						<VolunteerContactFields values={sharedDetails} onChange={updateSharedDetail} />
						{#if eventQuestions.length}
							<VolunteerQuestionFields
								questions={eventQuestions}
								values={eventQuestionResponses}
								errors={eventQuestionErrors}
								onChange={(questionId, value) => updateEventQuestionResponse(questionId, value)}
							/>
						{/if}

						<div class="space-y-3 pt-2">
							<div class="text-surface-400 text-xs">
								We’ll send confirmations to the contact details above once you submit.
							</div>
							<button
								type="button"
								class="btn preset-filled-primary-500 flex items-center gap-2"
								disabled={bulkSubmit.loading || selectedOpportunities.length === 0}
								onclick={handleBulkSignupSubmission}
							>
								{#if bulkSubmit.loading}
									<IconLoader class="h-4 w-4 animate-spin" />
								{/if}
								<span>Sign me up!</span>
							</button>
							{#if bulkSubmit.error}
								<p class="text-error-200 text-xs">{bulkSubmit.error}</p>
							{/if}
							{#if bulkSubmit.success}
								<p class="text-success-200 text-xs">{bulkSubmit.success}</p>
							{/if}
						</div>
					</div>
				</section>
			{/if}
		</div>
	</section>
{/if}
