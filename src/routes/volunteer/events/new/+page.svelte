
<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { Avatar, Progress } from '@skeletonlabs/skeleton-svelte';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconSend from '@lucide/svelte/icons/send';
	import IconMessageCircle from '@lucide/svelte/icons/message-circle';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import {
		createVolunteerEvent,
		createVolunteerOpportunity,
		createVolunteerShift,
		createVolunteerCustomQuestion,
		createVolunteerEventEmail
	} from '$lib';
	import EventOverviewStep from './components/EventOverviewStep.svelte';
	import ScheduleStep from './components/ScheduleStep.svelte';
	import RolesStep from './components/RolesStep.svelte';
	import CommunicationsStep from './components/CommunicationsStep.svelte';
	import ReviewStep from './components/ReviewStep.svelte';

	const { data } = $props();

	const FALLBACK_TIMEZONES = [
		'America/Los_Angeles',
		'America/Denver',
		'America/Chicago',
		'America/New_York',
		'America/Toronto',
		'America/Mexico_City',
		'America/Phoenix',
		'America/Anchorage',
		'Pacific/Honolulu',
		'Europe/London',
		'Europe/Berlin',
		'Europe/Paris',
		'Europe/Madrid',
		'Europe/Amsterdam',
		'Europe/Copenhagen',
		'Australia/Sydney',
		'Australia/Melbourne',
		'Pacific/Auckland',
		'Asia/Tokyo',
		'Asia/Singapore',
		'Asia/Hong_Kong',
		'UTC'
	];

	const statusOptions = ['draft', 'published', 'cancelled', 'archived'];
	const opportunityTypeOptions = [
		{ value: 'coordination', label: 'Coordination & Leads' },
		{ value: 'check-in', label: 'Check-in & Registration' },
		{ value: 'logistics', label: 'Logistics & Support' },
		{ value: 'mechanic', label: 'Mechanics & Repairs' },
		{ value: 'education', label: 'Education & Coaching' },
		{ value: 'hospitality', label: 'Hospitality & Culture' },
		{ value: 'safety', label: 'Safety & Course Marshals' },
		{ value: 'outreach', label: 'Outreach & Info Booths' },
		{ value: 'other', label: 'Other' }
	];
	const emailTypeOptions = ['reminder', 'thank_you', 'follow_up', 'custom'];
	const fieldTypeOptions = [
		'text',
		'textarea',
		'number',
		'select',
		'multiselect',
		'checkbox',
		'phone',
		'email',
		'url'
	];

	const steps = [
		{
			key: 'overview',
			title: 'Overview',
			description: 'Event type, host info, and public summary.'
		},
		{
			key: 'schedule',
			title: 'Schedule & Place',
			description: 'Timing, timezone, meetup spot, and contacts.'
		},
		{
			key: 'roles',
			title: 'Roles & Shifts',
			description: 'Define volunteer roles, capacity, and coverage.'
		},
		{
			key: 'communications',
			title: 'Signup & Messaging',
			description: 'Intake questions, reminders, and confirmations.'
		},
		{
			key: 'review',
			title: 'Review & Save',
			description: 'Check the plan and publish when ready.'
		}
	];

	const hostGroups = data?.hostGroups ?? [];
	const eventTypes = data?.eventTypes ?? [];

	const eventTypeOptions = eventTypes.map((item) => ({
		value: item.slug,
		label: item.event_type,
		description: item.description
	}));

	const hostGroupOptions = hostGroups
		.map((group) => ({ label: group.name, value: group.id }))
		.sort((a, b) => a.label.localeCompare(b.label));

	const initialTimezone = FALLBACK_TIMEZONES[0];
	const currentUser = $derived(page.data?.user ?? null);

	function sanitizeEventTypeSlug(value) {
		if (!eventTypeOptions.length) return value || '';
		if (value && eventTypeOptions.some((option) => option.value === value)) {
			return value;
		}
		if (value) {
			const normalized = slugify(value);
			const directMatch = eventTypeOptions.find((option) => option.value === normalized);
			if (directMatch) return directMatch.value;
			const labelMatch = eventTypeOptions.find((option) => slugify(option.label) === normalized);
			if (labelMatch) return labelMatch.value;
		}
		return eventTypeOptions[0]?.value ?? value ?? '';
	}

	let timezoneOptions = $state(FALLBACK_TIMEZONES);
	let activeStep = $state(0);
	let eventDetails = $state({
		title: '',
		slug: '',
		summary: '',
		description: '',
		eventTypeSlug: eventTypeOptions[0]?.value ?? 'ride',
		hostGroupId: '',
		status: 'draft',
		maxVolunteers: '',
		requireSignupApproval: false,
		waitlistEnabled: true,
		eventStart: '',
		eventEnd: '',
		timezone: initialTimezone,
		locationName: '',
		locationAddress: '',
		latitude: '',
		longitude: '',
		contactEmail: '',
		contactPhone: ''
	});

	let lastEventDefaults = $state({
		timezone: initialTimezone,
		locationName: '',
		locationAddress: ''
	});

	let hostGroupSelection = $state([]);
	let filteredHostGroupOptions = $state(hostGroupOptions);
	let slugUpdateToken = 0;
	let slugDebounce;
	let slugCheckInFlight = $state(false);

	function mergeEventDetails(patch, options = {}) {
		const normalizedPatch = { ...patch };
		if ('eventTypeSlug' in normalizedPatch) {
			normalizedPatch.eventTypeSlug = sanitizeEventTypeSlug(normalizedPatch.eventTypeSlug);
		}
		const prevDefaults = { ...lastEventDefaults };
		const next = { ...eventDetails, ...normalizedPatch };
		eventDetails = next;
		lastEventDefaults = {
			timezone: next.timezone,
			locationName: next.locationName,
			locationAddress: next.locationAddress
		};

		if (
			'timezone' in normalizedPatch ||
			'locationName' in normalizedPatch ||
			'locationAddress' in normalizedPatch
		) {
			propagateShiftDefaults(prevDefaults);
		}

		if (options.slugSource === null) return;
		if (options.slugSource) {
			const preferred =
				typeof options.slugSource === 'string'
					? options.slugSource
					: options.slugSource.preferred ?? options.slugSource.slug ?? options.slugSource.title;
			const fallback =
				typeof options.slugSource === 'object'
					? options.slugSource.fallback ?? options.slugSource.title ?? next.title
					: next.title;
			scheduleSlugRefresh(preferred, fallback);
			return;
		}
		if ('title' in normalizedPatch) {
			scheduleSlugRefresh(next.title);
		}
	}

	function updateEventDetails(patch, options) {
		mergeEventDetails(patch, options);
	}

	function handleHostGroupValueChange(value) {
		hostGroupSelection = value;
		const newId = value?.[0] ?? '';
		updateEventDetails({ hostGroupId: newId });
		filteredHostGroupOptions = hostGroupOptions;
	}

	function handleHostGroupSearch(inputValue) {
		const query = inputValue?.trim().toLowerCase() ?? '';
		if (!query) {
			filteredHostGroupOptions = hostGroupOptions;
			return;
		}
		filteredHostGroupOptions = hostGroupOptions.filter((option) =>
			option.label.toLowerCase().includes(query)
		);
	}

	function currentEventType() {
		return (
			eventTypeOptions.find((option) => option.value === eventDetails.eventTypeSlug) ??
			eventTypeOptions[0]
		);
	}


	function createOpportunity(partial = {}) {
		return {
			id: crypto.randomUUID(),
			title: '',
			description: '',
			opportunityType: 'coordination',
			requiresApproval: false,
			autoConfirmAttendance: true,
			minVolunteers: 0,
			maxVolunteers: '',
			waitlistLimit: '',
			locationName: eventDetails.locationName || '',
			locationNotes: '',
			tags: [],
			shifts: [createShift()],
			...partial
		};
	}

	function createShift(partial = {}) {
		return {
			id: crypto.randomUUID(),
			startsAt: '',
			endsAt: '',
			timezone: eventDetails.timezone || '',
			capacity: '',
			locationName: eventDetails.locationName || '',
			locationAddress: eventDetails.locationAddress || '',
			notes: '',
			...partial
		};
	}

	function propagateShiftDefaults(prevDefaults = {}) {
		const currentDefaults = {
			timezone: eventDetails.timezone,
			locationName: eventDetails.locationName,
			locationAddress: eventDetails.locationAddress
		};

		let hasChanges = false;
		const nextOpportunities = opportunities.map((opportunity) => {
			let shiftsChanged = false;
			const nextShifts = opportunity.shifts.map((shift) => {
				const updated = { ...shift };
				if (
					currentDefaults.timezone &&
					(!shift.timezone || shift.timezone === prevDefaults.timezone)
				) {
					updated.timezone = currentDefaults.timezone;
				}
				if (
					currentDefaults.locationName &&
					(!shift.locationName || shift.locationName === prevDefaults.locationName)
				) {
					updated.locationName = currentDefaults.locationName;
				}
				if (
					currentDefaults.locationAddress &&
					(!shift.locationAddress || shift.locationAddress === prevDefaults.locationAddress)
				) {
					updated.locationAddress = currentDefaults.locationAddress;
				}

				if (
					updated.timezone !== shift.timezone ||
					updated.locationName !== shift.locationName ||
					updated.locationAddress !== shift.locationAddress
				) {
					shiftsChanged = true;
					return updated;
				}
				return shift;
			});

			if (shiftsChanged) {
				hasChanges = true;
				return { ...opportunity, shifts: nextShifts };
			}
			return opportunity;
		});

		if (hasChanges) {
			opportunities = nextOpportunities;
		}
	}

	async function checkSlugExists(slug) {
		if (typeof window === 'undefined') return false;
		try {
			const res = await fetch(
				`/api/v1/volunteer-events?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`
			);
			if (!res.ok) return false;
			const payload = await res.json().catch(() => ({}));
			const rows = Array.isArray(payload?.data)
				? payload.data
				: payload?.data
					? [payload.data]
					: [];
			return rows.length > 0;
		} catch (error) {
			console.error('Unable to verify event slug uniqueness', error);
			return false;
		}
	}

	async function ensureUniqueEventSlug(base) {
		if (!base) return '';
		let candidate = base;
		let attempt = 2;
		while (await checkSlugExists(candidate)) {
			candidate = `${base}-${attempt++}`;
		}
		return candidate;
	}

	function assignSlug(nextSlug) {
		if (eventDetails.slug === nextSlug) return;
		const next = { ...eventDetails, slug: nextSlug };
		eventDetails = next;
		lastEventDefaults = {
			timezone: next.timezone,
			locationName: next.locationName,
			locationAddress: next.locationAddress
		};
	}

	function scheduleSlugRefresh(preferredSource, fallbackSource = '') {
		const baseSource = preferredSource || fallbackSource || '';
		if (!baseSource.trim()) {
			slugCheckInFlight = false;
			assignSlug('');
			return;
		}
		if (slugDebounce) clearTimeout(slugDebounce);
		slugDebounce = setTimeout(async () => {
			const base = slugify(baseSource);
			if (!base) {
				assignSlug('');
				return;
			}
			const token = ++slugUpdateToken;
			slugCheckInFlight = true;
			try {
				const unique = await ensureUniqueEventSlug(base);
				if (slugUpdateToken === token) {
					assignSlug(unique);
				}
			} catch (error) {
				console.error('Failed to generate unique slug', error);
			} finally {
				if (slugUpdateToken === token) {
					slugCheckInFlight = false;
				}
			}
		}, 180);
	}

	function createQuestion(partial = {}) {
		return {
			id: crypto.randomUUID(),
			fieldKey: '',
			label: '',
			helpText: '',
			fieldType: 'text',
			isRequired: false,
			optionsRaw: '',
			opportunityId: '',
			...partial
		};
	}

	function createEmailTemplate(partial = {}) {
		return {
			id: crypto.randomUUID(),
			emailType: 'reminder',
			sendOffsetMinutes: 1440,
			subject: '',
			body: '',
			requireConfirmation: false,
			surveyUrl: '',
			...partial
		};
	}

	let opportunities = $state([
		createOpportunity({ title: 'Lead Volunteer', opportunityType: 'coordination' })
	]);
	let customQuestions = $state([]);
	let eventEmails = $state([
		createEmailTemplate({
			emailType: 'reminder',
			sendOffsetMinutes: 720,
			subject: 'Reminder: {{event_title}} starts soon',
			body: "Your volunteer shift is coming up and your spot is ready. Confirm if you're still in or give us a quick heads-up if plans changed."
		})
	]);

	let chatMessages = $state([
		createChatMessage({
			role: 'assistant',
			content:
				"Hey there! I'm Volunteer Muse, your co-host in the cloud. Tell me what kind of volunteer-powered event you're planning and I'll help sketch the details."
		})
	]);
	let chatPrompt = $state('');
	let chatContainer;
	let aiLoading = $state(false);
	let aiError = $state('');
	let followUpQuestions = $state([]);
	let draftAppliedAt = $state(null);
	let showAdvancedSettings = $state(false);
	let showAdvancedCommunications = $state(false);

	let saveError = $state('');
	let saveSuccess = $state('');
	let saving = $state(false);

	onMount(() => {
		try {
			if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
				timezoneOptions = Intl.supportedValuesOf('timeZone');
				if (!timezoneOptions.includes(eventDetails.timezone)) {
					updateEventDetails({ timezone: timezoneOptions[0] });
				}
			}
		} catch {
			// ignore unsupported browsers
		}

		if (!eventDetails.hostGroupId && hostGroups.length === 1) {
			const onlyGroup = hostGroups[0];
			hostGroupSelection = [onlyGroup.id];
			updateEventDetails({ hostGroupId: onlyGroup.id });
		} else if (eventDetails.hostGroupId) {
			hostGroupSelection = [eventDetails.hostGroupId];
		}

		filteredHostGroupOptions = hostGroupOptions;
	});

	function createChatMessage({ role = 'assistant', content }) {
		return {
			id: crypto.randomUUID(),
			role,
			content: content ?? '',
			timestamp: new Date().toISOString(),
			name: role === 'assistant' ? 'Volunteer Muse' : 'You',
			host: role !== 'assistant',
			avatarSeed: role === 'assistant' ? 50 : 22,
			color: role === 'assistant' ? 'preset-tonal-secondary' : 'preset-tonal-primary'
		};
	}

	function formatTimestamp(timestamp) {
		try {
			return new Intl.DateTimeFormat(undefined, {
				hour: 'numeric',
				minute: 'numeric'
			}).format(new Date(timestamp));
		} catch {
			return '';
		}
	}

	function escapeHtml(value) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function renderInlineMarkdown(text) {
		const len = text.length;
		let index = 0;
		let buffer = '';
		let output = '';

		const flushBuffer = () => {
			if (buffer) {
				output += escapeHtml(buffer);
				buffer = '';
			}
		};

		while (index < len) {
			if (text.startsWith('**', index)) {
				const end = text.indexOf('**', index + 2);
				if (end !== -1) {
					flushBuffer();
					output += `<strong>${renderInlineMarkdown(text.slice(index + 2, end))}</strong>`;
					index = end + 2;
					continue;
				}
			}

			if (text[index] === '*' && !text.startsWith('**', index)) {
				const end = text.indexOf('*', index + 1);
				if (end !== -1) {
					flushBuffer();
					output += `<em>${renderInlineMarkdown(text.slice(index + 1, end))}</em>`;
					index = end + 1;
					continue;
				}
			}

			if (text[index] === '`') {
				const end = text.indexOf('`', index + 1);
				if (end !== -1) {
					flushBuffer();
					output += `<code>${escapeHtml(text.slice(index + 1, end))}</code>`;
					index = end + 1;
					continue;
				}
			}

			buffer += text[index];
			index += 1;
		}

		flushBuffer();
		return output;
	}

	function renderChatContent(text) {
		if (!text) return '';
		const lines = text.replace(/\r\n?/g, '\n').split('\n');
		const blocks = [];
		let currentList = null;

		const flushList = () => {
			if (!currentList) return;
			const items = currentList.items
				.map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
				.join('');
			blocks.push(`<${currentList.type}>${items}</${currentList.type}>`);
			currentList = null;
		};

		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line) {
				flushList();
				continue;
			}

			const ordered = line.match(/^(\d+)\.\s+(.*)$/);
			if (ordered) {
				if (!currentList || currentList.type !== 'ol') {
					flushList();
					currentList = { type: 'ol', items: [] };
				}
				currentList.items.push(ordered[2]);
				continue;
			}

			const unordered = line.match(/^[-*+]\s+(.*)$/);
			if (unordered) {
				if (!currentList || currentList.type !== 'ul') {
					flushList();
					currentList = { type: 'ul', items: [] };
				}
				currentList.items.push(unordered[1]);
				continue;
			}

			flushList();
			blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
		}

		flushList();
		return blocks.join('');
	}

	function buildConversationPayload(messages) {
		return messages
			.filter((entry) => entry?.content)
			.map((entry) => ({
				role: entry.role === 'assistant' ? 'assistant' : 'user',
				content: entry.content
			}));
	}

	async function scrollChatBottom(behavior = 'smooth') {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior });
		}
	}

	function slugify(text) {
		return (text || '')
			.toString()
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-');
	}

	function numberOrNull(value) {
		if (value === null || value === undefined || value === '') return null;
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}

	function toIso(value) {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return value;
			return date.toISOString();
		} catch {
			return value;
		}
	}

	function buildContextSnapshot() {
		try {
			return structuredClone({
				metadata: eventDetails,
				opportunities,
				custom_questions: customQuestions,
				emails: eventEmails,
				event_type_options: eventTypeOptions
			});
		} catch {
			return {
				metadata: JSON.parse(JSON.stringify(eventDetails)),
				opportunities: JSON.parse(JSON.stringify(opportunities)),
				custom_questions: JSON.parse(JSON.stringify(customQuestions)),
				emails: JSON.parse(JSON.stringify(eventEmails)),
				event_type_options: JSON.parse(JSON.stringify(eventTypeOptions))
			};
		}
	}

	async function sendPrompt() {
		aiError = '';
		const text = chatPrompt.trim();
		if (!text) return;

		const userMessage = createChatMessage({ role: 'user', content: text });
		chatMessages = [...chatMessages, userMessage];
		chatPrompt = '';
		await scrollChatBottom();

		aiLoading = true;
		try {
			const res = await fetch('/api/ai/volunteer-event-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messages: buildConversationPayload([...chatMessages]),
						context: buildContextSnapshot(),
						event_type_options: eventTypeOptions,
						goal: 'Help the host configure a volunteer event with metadata, opportunities, shifts, and communications'
					})
				});

			if (!res.ok) {
				const info = await res.json().catch(() => ({}));
				throw new Error(info.error || res.statusText || 'AI request failed');
			}

			const payload = await res.json();
			followUpQuestions = Array.isArray(payload.follow_up_questions)
				? payload.follow_up_questions.filter(Boolean)
				: [];

			if (payload.reply) {
				chatMessages = [
					...chatMessages,
					createChatMessage({ role: 'assistant', content: payload.reply })
				];
			}

			if (payload.draft) {
				applyDraft(payload.draft);
			}
		} catch (error) {
			aiError = error?.message || 'Unable to reach Volunteer Muse right now.';
		} finally {
			aiLoading = false;
			await scrollChatBottom();
		}
	}

	function handleChatSubmit(event) {
		event?.preventDefault();
		sendPrompt();
	}

	function applyDraft(draft) {
		if (!draft) return;

		if (draft.metadata) {
			const meta = draft.metadata;
			const eventPatch = {
				title: meta.title ?? eventDetails.title,
				summary: meta.summary ?? eventDetails.summary,
				description: meta.description ?? eventDetails.description,
				eventTypeSlug: sanitizeEventTypeSlug(meta.event_type_slug ?? eventDetails.eventTypeSlug),
				eventStart: meta.event_start ? toLocalDatetime(meta.event_start) : eventDetails.eventStart,
				eventEnd: meta.event_end ? toLocalDatetime(meta.event_end) : eventDetails.eventEnd,
				timezone: meta.timezone || eventDetails.timezone,
				locationName: meta.location_name ?? eventDetails.locationName,
				locationAddress: meta.location_address ?? eventDetails.locationAddress,
				latitude: meta.latitude ?? eventDetails.latitude,
				longitude: meta.longitude ?? eventDetails.longitude,
				status: meta.status ?? eventDetails.status,
				contactEmail: meta.contact_email ?? eventDetails.contactEmail,
				contactPhone: meta.contact_phone ?? eventDetails.contactPhone,
				maxVolunteers:
					meta.max_volunteers != null ? `${meta.max_volunteers}` : eventDetails.maxVolunteers,
				requireSignupApproval:
					meta.require_signup_approval ?? eventDetails.requireSignupApproval,
				waitlistEnabled: meta.waitlist_enabled ?? eventDetails.waitlistEnabled,
				hostGroupId: meta.host_group_id ?? eventDetails.hostGroupId
			};

			mergeEventDetails(eventPatch, {
				slugSource: {
					preferred: meta.slug,
					fallback: meta.title ?? eventPatch.title
				}
			});

			if ('host_group_id' in meta) {
				const groupId = meta.host_group_id ?? '';
				hostGroupSelection = groupId ? [groupId] : [];
				filteredHostGroupOptions = hostGroupOptions;
			}
		}

		if (Array.isArray(draft.opportunities) && draft.opportunities.length) {
			opportunities = draft.opportunities.map((opp) => {
				const next = createOpportunity({
					title: opp.title ?? '',
					description: opp.description ?? '',
					opportunityType: opp.opportunity_type ?? 'other',
					requiresApproval: opp.requires_approval ?? false,
					autoConfirmAttendance: opp.auto_confirm_attendance ?? true,
					minVolunteers: numberOrNull(opp.min_volunteers) ?? 0,
					maxVolunteers: opp.max_volunteers != null ? `${opp.max_volunteers}` : '',
					waitlistLimit: opp.waitlist_limit != null ? `${opp.waitlist_limit}` : '',
					locationName: opp.location_name ?? eventDetails.locationName ?? '',
					locationNotes: opp.location_notes ?? '',
					tags: Array.isArray(opp.tags) ? opp.tags.filter(Boolean) : []
				});

				const defaultTimezone = eventDetails.timezone;
				const defaultLocationName = eventDetails.locationName;
				const defaultLocationAddress = eventDetails.locationAddress;

				next.shifts =
					Array.isArray(opp.shifts) && opp.shifts.length
						? opp.shifts.map((shift) =>
								createShift({
									startsAt: shift.starts_at ? toLocalDatetime(shift.starts_at) : '',
									endsAt: shift.ends_at ? toLocalDatetime(shift.ends_at) : '',
									timezone: shift.timezone || defaultTimezone || '',
									capacity: shift.capacity != null ? `${shift.capacity}` : '',
									locationName: shift.location_name ?? defaultLocationName ?? '',
									locationAddress: shift.location_address ?? defaultLocationAddress ?? '',
									notes: shift.notes ?? ''
								})
							)
						: [createShift()];
				return next;
			});
		}

		if (Array.isArray(draft.custom_questions)) {
			customQuestions = draft.custom_questions.map((q, idx) =>
				createQuestion({
					fieldKey: q.field_key || slugify(q.label || `question-${idx + 1}`),
					label: q.label ?? '',
					helpText: q.help_text ?? '',
					fieldType: q.field_type ?? 'text',
					isRequired: q.is_required ?? false,
					opportunityId: q.opportunity_id ?? '',
					optionsRaw: Array.isArray(q.options) ? q.options.join('\n') : ''
				})
			);
		}

		if (Array.isArray(draft.emails)) {
			eventEmails = draft.emails.map((email) =>
				createEmailTemplate({
					emailType: email.email_type ?? 'reminder',
					sendOffsetMinutes: email.send_offset_minutes != null ? email.send_offset_minutes : 720,
					subject: email.subject ?? '',
					body: email.body ?? '',
					requireConfirmation: email.require_confirmation ?? false,
					surveyUrl: email.survey_url ?? ''
				})
			);
		}

		draftAppliedAt = new Date().toISOString();
	}

	function toLocalDatetime(value) {
		if (!value) return '';
		try {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return value;
			const pad = (num, size = 2) => `${num}`.padStart(size, '0');
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
				date.getHours()
			)}:${pad(date.getMinutes())}`;
		} catch {
			return value;
		}
	}

	function updateOpportunity(id, patch) {
		opportunities = opportunities.map((op) => (op.id === id ? { ...op, ...patch } : op));
	}

	function updateShift(opportunityId, shiftId, patch) {
		opportunities = opportunities.map((op) => {
			if (op.id !== opportunityId) return op;
			const shifts = op.shifts.map((shift) =>
				shift.id === shiftId ? { ...shift, ...patch } : shift
			);
			return { ...op, shifts };
		});
	}

	function removeShift(opportunityId, shiftId) {
		opportunities = opportunities.map((op) => {
			if (op.id !== opportunityId) return op;
			const shifts = op.shifts.filter((shift) => shift.id !== shiftId);
			return { ...op, shifts: shifts.length ? shifts : [createShift()] };
		});
	}

	function addShift(opportunityId) {
		opportunities = opportunities.map((op) => {
			if (op.id !== opportunityId) return op;
			return {
				...op,
				shifts: [
					...op.shifts,
					createShift({
						timezone: eventDetails.timezone,
						locationName: eventDetails.locationName,
						locationAddress: eventDetails.locationAddress
					})
				]
			};
		});
	}

	function addOpportunity() {
		opportunities = [
			...opportunities,
			createOpportunity({
				opportunityType: 'other',
				shifts: [
					createShift({
						timezone: eventDetails.timezone,
						locationName: eventDetails.locationName,
						locationAddress: eventDetails.locationAddress
					})
				]
			})
		];
	}

	function removeOpportunity(id) {
		if (opportunities.length === 1) return;
		opportunities = opportunities.filter((op) => op.id !== id);
	}

	function addQuestion() {
		customQuestions = [...customQuestions, createQuestion()];
	}

	function removeQuestion(id) {
		customQuestions = customQuestions.filter((q) => q.id !== id);
	}

	function updateQuestion(id, patch) {
		customQuestions = customQuestions.map((q) => (q.id === id ? { ...q, ...patch } : q));
	}

	function addEmailTemplate() {
		eventEmails = [...eventEmails, createEmailTemplate()];
	}

	function removeEmailTemplate(id) {
		if (eventEmails.length === 1) {
			eventEmails = eventEmails.map((email) => ({ ...email, subject: '', body: '' }));
			return;
		}
		eventEmails = eventEmails.filter((email) => email.id !== id);
	}

	function updateEmailTemplate(id, patch) {
		eventEmails = eventEmails.map((email) => (email.id === id ? { ...email, ...patch } : email));
	}

	function goToStep(step) {
		if (step < 0 || step >= steps.length) return;
		activeStep = step;
	}

	function nextStep() {
		goToStep(Math.min(activeStep + 1, steps.length - 1));
	}

	function prevStep() {
		goToStep(Math.max(activeStep - 1, 0));
	}

	function progressValue() {
		return Math.round(((activeStep + 1) / steps.length) * 100);
	}

	function ensureFieldKey(label, fallback) {
		const base = label ? slugify(label) : fallback;
		return base || `custom-field-${Math.random().toString(36).slice(2, 6)}`;
	}

	async function handleSubmit() {
		saving = true;
		saveError = '';
		saveSuccess = '';

		try {
			if (!currentUser?.id) throw new Error('You must be logged in to create an event.');
			if (!eventDetails.title) throw new Error('Event title is required');
			if (!eventDetails.eventStart) throw new Error('Event start is required');

			const eventPayload = {
				title: eventDetails.title,
				slug: eventDetails.slug || slugify(eventDetails.title),
				summary: eventDetails.summary || null,
				description: eventDetails.description || null,
				event_type_slug: eventDetails.eventTypeSlug || 'ride',
				host_group_id: eventDetails.hostGroupId || null,
				event_start: toIso(eventDetails.eventStart),
				event_end: toIso(eventDetails.eventEnd) || null,
				timezone: eventDetails.timezone,
				location_name: eventDetails.locationName || null,
				location_address: eventDetails.locationAddress || null,
				latitude: numberOrNull(eventDetails.latitude),
				longitude: numberOrNull(eventDetails.longitude),
				max_volunteers: numberOrNull(eventDetails.maxVolunteers),
				status: eventDetails.status || 'draft',
				contact_email: eventDetails.contactEmail || null,
				contact_phone: eventDetails.contactPhone || null,
				require_signup_approval: !!eventDetails.requireSignupApproval,
				waitlist_enabled: !!eventDetails.waitlistEnabled,
				host_user_id: currentUser.id,
				created_by_user_id: currentUser.id
			};

			const eventResponse = await createVolunteerEvent(eventPayload);
			const createdEvent = eventResponse?.data ?? eventResponse;
			if (!createdEvent?.id) throw new Error('Failed to create event.');

			const eventId = createdEvent.id;

			const opportunityResults = [];
			for (const opportunity of opportunities) {
				if (!opportunity.title) continue;
				const opportunityPayload = {
					event_id: eventId,
					title: opportunity.title,
					description: opportunity.description || null,
					opportunity_type: opportunity.opportunityType || 'other',
					requires_approval: !!opportunity.requiresApproval,
					auto_confirm_attendance: !!opportunity.autoConfirmAttendance,
					min_volunteers: numberOrNull(opportunity.minVolunteers) ?? 0,
					max_volunteers: numberOrNull(opportunity.maxVolunteers),
					waitlist_limit: numberOrNull(opportunity.waitlistLimit),
					location_name: opportunity.locationName || null,
					location_notes: opportunity.locationNotes || null
				};

				const createdOppResponse = await createVolunteerOpportunity(opportunityPayload);
				const createdOpp = createdOppResponse?.data ?? createdOppResponse;
				if (createdOpp?.id) {
					opportunityResults.push({ local: opportunity, remote: createdOpp });
					for (const shift of opportunity.shifts ?? []) {
						if (!shift.startsAt && !shift.endsAt) continue;
						const shiftPayload = {
							opportunity_id: createdOpp.id,
							starts_at: toIso(shift.startsAt),
							ends_at: toIso(shift.endsAt),
							timezone: shift.timezone || eventDetails.timezone,
							capacity: numberOrNull(shift.capacity),
							location_name:
								shift.locationName || opportunity.locationName || eventDetails.locationName || null,
							location_address: shift.locationAddress || eventDetails.locationAddress || null,
							notes: shift.notes || null
						};
						await createVolunteerShift(shiftPayload);
					}
				}
			}

			for (const [index, question] of customQuestions.entries()) {
				if (!question.label) continue;
				const optionsArray = (question.optionsRaw || '')
					.split(/\n|,/)
					.map((item) => item.trim())
					.filter(Boolean);
				const payload = {
					event_id: eventId,
					opportunity_id: question.opportunityId || null,
					field_key: ensureFieldKey(question.fieldKey, `question-${index + 1}`),
					label: question.label,
					help_text: question.helpText || null,
					field_type: question.fieldType || 'text',
					is_required: !!question.isRequired,
					options: optionsArray.length ? optionsArray : null,
					position: index
				};
				await createVolunteerCustomQuestion(payload);
			}

			for (const email of eventEmails) {
				if (!email.subject && !email.body) continue;
				const payload = {
					event_id: eventId,
					email_type: email.emailType || 'reminder',
					send_offset_minutes: Number(email.sendOffsetMinutes) || 0,
					subject: email.subject || '',
					body: email.body || '',
					require_confirmation: !!email.requireConfirmation,
					survey_url: email.surveyUrl || null
				};
				await createVolunteerEventEmail(payload);
			}

			saveSuccess = 'Volunteer event created and ready for host review.';
			activeStep = steps.length - 1;
		} catch (error) {
			saveError = error?.message || 'Unable to save event right now.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Volunteer Event Builder • 3FP</title>
</svelte:head>

<main class="mx-auto flex max-w-6xl flex-col gap-8 pb-24">
	<header class="card border-primary-500/20 bg-surface-950 card-hover border p-6">
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="space-y-2">
				<h1 class="text-3xl font-semibold">Volunteer Event Builder</h1>
				<p class="text-surface-400 max-w-3xl text-sm">
					Guide your volunteer leads, mechanics, educators, hospitality crew, and outreach teams
					from idea to launch. Team up with Volunteer Muse up top, then walk through the steps to
					plan your next community event.
				</p>
			</div>
			<div class="text-surface-400 flex items-center gap-2 text-sm">
				<IconMessageCircle class="h-5 w-5" />
				<span>Drafts autosave when you submit</span>
			</div>
		</div>
	</header>

	<section
		class={`card border-secondary-500/20 bg-surface-950/70 card-hover ai-panel border p-6 ${
			aiLoading ? 'is-loading' : ''
		}`}
		aria-busy={aiLoading}
	>
		<div class="flex items-center gap-3">
			<div class="bg-secondary-500/10 text-secondary-300 rounded-full p-2">
				<IconSparkles class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-xl font-semibold">Volunteer Muse — Generative teammate</h2>
				<p class="text-surface-400 text-sm">
					Describe your event in plain language. Volunteer Muse will suggest copy, staffing plans,
					and reminders, and double-check details with quick follow-up questions.
				</p>
			</div>
		</div>

		{#if aiLoading}
			<div
				class="border-secondary-500/30 bg-secondary-500/10 mt-4 flex flex-col gap-3 rounded border p-4"
				role="status"
				aria-live="polite"
			>
				<div class="text-secondary-100 flex items-center gap-2">
					<IconLoader class="h-4 w-4 animate-spin" />
					<span>Volunteer Muse is drafting shifts and reminders…</span>
				</div>
				<Progress value={null} class="w-full" />
			</div>
		{/if}

		<div class="mt-5 space-y-4">
			<section
				bind:this={chatContainer}
				class="max-h-[360px] w-full space-y-4 overflow-y-auto pr-1"
			>
				{#each chatMessages as bubble (bubble.id)}
					{#if bubble.host}
						<div class="grid grid-cols-[1fr_auto] items-start gap-2">
							<div class={`card preset-tonal-primary rounded-tr-none p-4 ${bubble.color}`}>
								<header class="flex items-center justify-between gap-4 text-sm">
									<p class="font-semibold">{bubble.name}</p>
									<small class="opacity-60">{formatTimestamp(bubble.timestamp)}</small>
								</header>
								<div class="space-y-2 leading-relaxed">
									{@html renderChatContent(bubble.content)}
								</div>
							</div>
							<Avatar
								src={`https://i.pravatar.cc/96?img=${bubble.avatarSeed}`}
								name={bubble.name}
								size="size-12"
							/>
						</div>
					{:else}
						<div class="grid grid-cols-[auto_1fr] items-start gap-2">
							<Avatar
								src={`https://i.pravatar.cc/96?img=${bubble.avatarSeed}`}
								name={bubble.name}
								size="size-12"
							/>
							<div class={`card rounded-tl-none p-4 ${bubble.color}`}>
								<header class="flex items-center justify-between gap-4 text-sm">
									<p class="font-semibold">{bubble.name}</p>
									<small class="opacity-60">{formatTimestamp(bubble.timestamp)}</small>
								</header>
								<div class="space-y-2 leading-relaxed">
									{@html renderChatContent(bubble.content)}
								</div>
							</div>
						</div>
					{/if}
				{/each}
				{#if aiLoading}
					<div class="text-surface-400 flex items-center gap-2 text-sm">
						<IconLoader class="h-4 w-4 animate-spin" />
						<p>Volunteer Muse is thinking…</p>
					</div>
				{/if}
			</section>

			{#if followUpQuestions.length}
				<div class="border-warning-500/40 bg-warning-500/10 rounded border p-3 text-sm">
					<p class="text-warning-200 font-semibold">Volunteer Muse still needs:</p>
					<ul class="text-warning-100 mt-2 list-disc space-y-1 pl-5">
						{#each followUpQuestions as question}
							<li>{question}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if aiError}
				<p class="border-error-500/40 bg-error-500/10 text-error-200 rounded border p-3 text-sm">
					{aiError}
				</p>
			{/if}

			<form
				onsubmit={handleChatSubmit}
				class="card border-primary-500/20 bg-surface-900/60 flex flex-col gap-3 rounded border p-4"
			>
				<label class="label text-sm font-semibold" for="chat-prompt">Describe or ask anything</label
				>
				<textarea
					id="chat-prompt"
					class="textarea bg-surface-950/70 min-h-24"
					bind:value={chatPrompt}
					placeholder="We need 20 volunteers for a pop-up repair station with tune-up and greeting shifts…"
				></textarea>
				<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<p class="text-surface-500 text-xs">
						Volunteer Muse can suggest titles, staffing plans, shifts, and reminder emails. Mention
						date, time, meeting spot, expected turnout, and what support you need.
					</p>
					<button
						type="submit"
						class="btn preset-filled-secondary-500 flex items-center gap-2"
						disabled={aiLoading}
					>
						<IconSend class="h-4 w-4" />
						<span>{aiLoading ? 'Sending…' : 'Send to Volunteer Muse'}</span>
					</button>
				</div>
			</form>
		</div>

		{#if draftAppliedAt}
			<div
				class="border-secondary-500/30 bg-secondary-500/10 mt-5 flex flex-col gap-2 rounded border p-4"
			>
				<div class="text-secondary-100 flex items-center gap-2">
					<IconCheck class="h-4 w-4" />
					<h3 class="text-sm font-semibold">Volunteer Muse suggestions applied</h3>
				</div>
				<p class="text-secondary-200 text-sm">
					The latest plan filled in the event builder automatically. Give the sections below a quick
					review.
				</p>
				<small class="text-secondary-300 text-xs">Updated {formatTimestamp(draftAppliedAt)}</small>
			</div>
		{/if}
	</section>

	<section class="card border-primary-500/20 bg-surface-950/80 card-hover border p-6">
		<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div class="space-y-2">
				<h2 class="text-xl font-semibold">Build the volunteer experience</h2>
				<p class="text-surface-400 text-sm">
					Step through the flow to capture the logistics, people power, and follow-up moments that
					make your volunteer event hum.
				</p>
			</div>
			<div class="flex w-full flex-col gap-2 md:w-64">
				<Progress value={progressValue()} />
				<p class="text-surface-500 text-right text-xs">Step {activeStep + 1} of {steps.length}</p>
			</div>
		</div>
		<nav class="mt-6 grid gap-2 md:grid-cols-5">
			{#each steps as step, idx}
				<button
					type="button"
					onclick={() => goToStep(idx)}
					class={`card border ${
						idx === activeStep
							? 'border-primary-400 bg-primary-400/20'
							: 'bg-surface-900/60 hover:border-primary-500/40 border-transparent'
					} p-3 text-left transition`}
				>
					<p class="text-surface-500 text-xs tracking-wide uppercase">Step {idx + 1}</p>
					<p class="font-semibold">{step.title}</p>
					<p class="text-surface-400 text-xs">{step.description}</p>
				</button>
			{/each}
		</nav>
		<div class="mt-6">
			{#if activeStep === 0}
				<EventOverviewStep
					{eventDetails}
					{eventTypeOptions}
					{statusOptions}
					{hostGroupSelection}
					{filteredHostGroupOptions}
					{showAdvancedSettings}
					currentEventTypeDescription={currentEventType()?.description ?? ''}
					hasHostGroups={hostGroupOptions.length > 0}
					onEventDetailsChange={updateEventDetails}
					onHostGroupValueChange={handleHostGroupValueChange}
					onHostGroupSearch={handleHostGroupSearch}
					onClearHostGroup={() => handleHostGroupValueChange([])}
					onToggleAdvanced={() => (showAdvancedSettings = !showAdvancedSettings)}
					slugCheckInFlight={slugCheckInFlight}
				/>
			{:else if activeStep === 1}
				<ScheduleStep {eventDetails} {timezoneOptions} onEventDetailsChange={updateEventDetails} />
			{:else if activeStep === 2}
				<RolesStep
					{opportunities}
					{opportunityTypeOptions}
					onAddOpportunity={addOpportunity}
					onRemoveOpportunity={removeOpportunity}
					onUpdateOpportunity={updateOpportunity}
					onAddShift={addShift}
					onRemoveShift={removeShift}
					onUpdateShift={updateShift}
				/>
			{:else if activeStep === 3}
				<CommunicationsStep
					{showAdvancedCommunications}
					{customQuestions}
					{eventEmails}
					{opportunities}
					{fieldTypeOptions}
					{emailTypeOptions}
					onToggleAdvanced={() => (showAdvancedCommunications = !showAdvancedCommunications)}
					onAddQuestion={addQuestion}
					onRemoveQuestion={removeQuestion}
					onUpdateQuestion={updateQuestion}
					onAddEmail={addEmailTemplate}
					onRemoveEmail={removeEmailTemplate}
					onUpdateEmail={updateEmailTemplate}
				/>
			{:else if activeStep === 4}
				<ReviewStep
					{eventDetails}
					{opportunities}
					{customQuestions}
					{eventEmails}
					{saveError}
					{saveSuccess}
					{saving}
					onSubmit={handleSubmit}
				/>
			{/if}
		</div>
		<div class="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<button
				type="button"
				class="btn preset-tonal-primary flex items-center gap-2"
				onclick={prevStep}
				disabled={activeStep === 0}
			>
				<IconArrowLeft class="h-4 w-4" />
				<span>Back</span>
			</button>
			<button
				type="button"
				class="btn preset-filled-primary-500 flex items-center gap-2"
				onclick={nextStep}
				disabled={activeStep === steps.length - 1}
			>
				<span>Next</span>
				<IconArrowRight class="h-4 w-4" />
			</button>
		</div>
	</section>
</main>
