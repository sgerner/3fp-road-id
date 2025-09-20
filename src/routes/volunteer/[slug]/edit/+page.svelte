<script>
	function _nullishCoalesce(lhs, rhsFn) {
		if (lhs != null) {
			return lhs;
		} else {
			return rhsFn();
		}
	}
	function _optionalChain(ops) {
		let lastAccessLHS = undefined;
		let value = ops[0];
		let i = 1;
		while (i < ops.length) {
			const op = ops[i];
			const fn = ops[i + 1];
			i += 2;
			if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
				return undefined;
			}
			if (op === 'access' || op === 'optionalAccess') {
				lastAccessLHS = value;
				value = fn(value);
			} else if (op === 'call' || op === 'optionalCall') {
				value = fn((...args) => value.call(lastAccessLHS, ...args));
				lastAccessLHS = undefined;
			}
		}
		return value;
	}
	import { Toaster, createToaster } from '@skeletonlabs/skeleton-svelte';
	import EventOverviewStep from '$lib/components/volunteer/EventOverviewStep.svelte';
	import ScheduleStep from '$lib/components/volunteer/ScheduleStep.svelte';
	import RolesStep from '$lib/components/volunteer/RolesStep.svelte';
	import CommunicationsStep from '$lib/components/volunteer/CommunicationsStep.svelte';

	import {
		mapEventRecordToFormDetails,
		buildEventUpdatePayload,
		mapOpportunityRecordToFormDetails,
		buildOpportunityPayload,
		mapShiftRecordToFormDetails,
		buildShiftPayload,
		mapQuestionRecordToFormDetails,
		buildQuestionPayload,
		mapEmailRecordToFormDetails,
		buildEmailPayload,
		ensureArray
	} from '$lib/components/volunteer/form-utils';
	import {
		getVolunteerEvent,
		updateVolunteerEvent,
		createVolunteerOpportunity,
		updateVolunteerOpportunity,
		deleteVolunteerOpportunity,
		getVolunteerOpportunity,
		listVolunteerShifts,
		createVolunteerShift,
		updateVolunteerShift,
		deleteVolunteerShift,
		getVolunteerShift,
		createVolunteerCustomQuestion,
		updateVolunteerCustomQuestion,
		deleteVolunteerCustomQuestion,
		getVolunteerCustomQuestion,
		createVolunteerEventEmail,
		updateVolunteerEventEmail,
		deleteVolunteerEventEmail,
		getVolunteerEventEmail
	} from '$lib';

	let { data } = $props();

	const toaster = createToaster({ placement: 'top-end' });

	const notifySuccess = (message) => toaster.success({ title: message });
	const notifyError = (message) => toaster.error({ title: message });
	const notifyWarning = (message) => toaster.warning({ title: message });

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

	function slugify(text) {
		return (text || '')
			.toString()
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-');
	}

	function createAutosave({ delay = 600, onSave, successMessage, errorMessage, setSaving }) {
		let timer = null;
		let pending = {};
		let saving = false;

		async function run() {
			if (!Object.keys(pending).length) return;
			const payload = pending;
			pending = {};
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			saving = true;
			_optionalChain([setSaving, 'optionalCall', (_) => _(true)]);
			try {
				await onSave(payload);
				if (successMessage) {
					notifySuccess(successMessage);
				}
			} catch (err) {
				const message =
					_optionalChain([err, 'optionalAccess', (_2) => _2.message]) ||
					errorMessage ||
					'Unable to save changes.';
				notifyError(message);
				throw err;
			} finally {
				saving = false;
				_optionalChain([setSaving, 'optionalCall', (_3) => _3(false)]);
			}
		}

		function queue(patch) {
			pending = { ...pending, ...patch };
			if (timer) clearTimeout(timer);
			timer = setTimeout(run, delay);
		}

		return {
			queue,
			flush: run,
			get isSaving() {
				return saving;
			}
		};
	}

	const eventTypes = _nullishCoalesce(data.eventTypes, () => []);
	const eventTypeOptions = eventTypes.map((item) => ({
		value: String(_nullishCoalesce(item.slug, () => '')),
		label: String(_nullishCoalesce(item.event_type, () => '')),
		description: _nullishCoalesce(item.description, () => '')
	}));

	const eventRecordInitial = _nullishCoalesce(data.event, () => ({}));
	const eventId = _nullishCoalesce(eventRecordInitial.id, () => '');
	let eventRecord = $state({ ...eventRecordInitial });
	let eventDetails = $state(mapEventRecordToFormDetails(eventRecord));

	const hostGroups = _nullishCoalesce(data.hostGroups, () => []);
	const hostGroupOptions = hostGroups
		.map((group) => ({ label: String(_nullishCoalesce(group.name, () => '')), value: group.id }))
		.sort((a, b) => String(a.label).localeCompare(String(b.label)));
	const initialHostGroupId = _nullishCoalesce(
		_nullishCoalesce(eventRecordInitial.host_group_id, () => eventRecordInitial.hostGroupId),
		() => ''
	);
	let hostGroupSelection = $state(initialHostGroupId ? [initialHostGroupId] : []);
	let filteredHostGroupOptions = $state(hostGroupOptions);
	let showAdvancedSettings = $state(false);
	let showAdvancedCommunications = $state(false);
	let eventSaving = $state(false);

	function currentEventTypeDescription() {
		const match = eventTypeOptions.find((option) => option.value === eventDetails.eventTypeSlug);
		return _nullishCoalesce(
			_optionalChain([match, 'optionalAccess', (_4) => _4.description]),
			() => ''
		);
	}

	function handleHostGroupValueChange(value) {
		const next = _nullishCoalesce(value, () => []);
		hostGroupSelection = next;
		updateEventDetails({
			hostGroupId: _nullishCoalesce(
				_optionalChain([next, 'optionalAccess', (_5) => _5[0]]),
				() => ''
			)
		});
	}
	function handleHostGroupSearch(inputValue) {
		const query = _nullishCoalesce(
			_optionalChain([
				inputValue,
				'optionalAccess',
				(_6) => _6.trim,
				'call',
				(_7) => _7(),
				'access',
				(_8) => _8.toLowerCase,
				'call',
				(_9) => _9()
			]),
			() => ''
		);
		if (!query) {
			filteredHostGroupOptions = hostGroupOptions;
			return;
		}
		filteredHostGroupOptions = hostGroupOptions.filter((option) =>
			option.label.toLowerCase().includes(query)
		);
	}
	function handleClearHostGroup() {
		hostGroupSelection = [];
		updateEventDetails({ hostGroupId: '' });
	}

	const eventAutosave = createAutosave({
		onSave: async (patch) => {
			const payload = buildEventUpdatePayload(patch);
			await updateVolunteerEvent(eventId, payload);
			const refreshed = await getVolunteerEvent(eventId);
			const freshRecord = _nullishCoalesce(
				_optionalChain([refreshed, 'optionalAccess', (_10) => _10.data]),
				() => refreshed
			);
			if (freshRecord && typeof freshRecord === 'object') {
				eventRecord = { ...eventRecord, ...freshRecord };
				const normalized = mapEventRecordToFormDetails(eventRecord);
				eventDetails = normalized;
				hostGroupSelection = normalized.hostGroupId ? [normalized.hostGroupId] : [];
			}
		},
		successMessage: 'Event details saved',
		errorMessage: 'Unable to save event details.',
		setSaving: (value) => (eventSaving = value)
	});

	function updateEventDetails(patch) {
		eventDetails = { ...eventDetails, ...patch };
		eventAutosave.queue(patch);
	}

	function handleSlugInput(value) {
		const sanitized = slugify(value);
		updateEventDetails({ slug: sanitized });
	}

	const timezoneOptions = FALLBACK_TIMEZONES;

	function overviewDetailsChange(...args) {
		const patch = _nullishCoalesce(
			_optionalChain([args, 'optionalAccess', (_11) => _11[0]]),
			() => ({})
		);
		updateEventDetails(patch);
	}

	function scheduleDetailsChange(...args) {
		const patch = _nullishCoalesce(
			_optionalChain([args, 'optionalAccess', (_14) => _14[0]]),
			() => ({})
		);
		updateEventDetails(patch);
	}

	const loadedOpportunities = ensureArray(_nullishCoalesce(data.opportunities, () => []));
	let opportunities = $state(
		loadedOpportunities.map((op) =>
			mapOpportunityRecordToFormDetails(
				op,
				ensureArray(
					_nullishCoalesce(_optionalChain([op, 'optionalAccess', (_15) => _15.shifts]), () => [])
				)
			)
		)
	);
	const opportunityAutosaves = new Map();
	const shiftAutosaves = new Map();

	function getOpportunityAutosave(id) {
		if (!opportunityAutosaves.has(id)) {
			const autosave = createAutosave({
				onSave: async (patch) => {
					const payload = buildOpportunityPayload(patch);
					await updateVolunteerOpportunity(id, payload);
					const [freshOpp, freshShifts] = await Promise.all([
						getVolunteerOpportunity(id),
						listVolunteerShifts({
							query: {
								opportunity_id: `eq.${id}`,
								order: 'starts_at.asc'
							}
						})
					]);
					const rawOpp = _nullishCoalesce(
						_optionalChain([freshOpp, 'optionalAccess', (_16) => _16.data]),
						() => freshOpp
					);

					const normalized = mapOpportunityRecordToFormDetails(
						{ id, ..._nullishCoalesce(rawOpp, () => ({})) },
						ensureArray(
							_nullishCoalesce(
								_optionalChain([freshShifts, 'optionalAccess', (_17) => _17.data]),
								() => freshShifts
							)
						)
					);
					opportunities = opportunities.map((op) => (op.id === id ? normalized : op));
				},
				successMessage: 'Activity saved',
				errorMessage: 'Unable to save activity.'
			});
			opportunityAutosaves.set(id, autosave);
		}
		return opportunityAutosaves.get(id);
	}

	function getShiftAutosave(id, opportunityId) {
		if (!shiftAutosaves.has(id)) {
			const autosave = createAutosave({
				onSave: async (patch) => {
					const payload = buildShiftPayload(patch);
					await updateVolunteerShift(id, payload);
					const refreshed = await getVolunteerShift(id);
					const freshRecord = _nullishCoalesce(
						_optionalChain([refreshed, 'optionalAccess', (_18) => _18.data]),
						() => refreshed
					);
					const normalized = mapShiftRecordToFormDetails({
						id,
						..._nullishCoalesce(freshRecord, () => ({}))
					});
					opportunities = opportunities.map((op) => {
						if (op.id !== opportunityId) return op;
						const shifts = op.shifts.map((shift) => (shift.id === id ? normalized : shift));
						return { ...op, shifts };
					});
				},
				successMessage: 'Shift saved',
				errorMessage: 'Unable to save shift.'
			});
			shiftAutosaves.set(id, autosave);
		}
		return shiftAutosaves.get(id);
	}

	async function addOpportunity() {
		try {
			const payload = buildOpportunityPayload(
				{
					title: 'New activity',
					opportunityType: _nullishCoalesce(
						_optionalChain([
							opportunityTypeOptions,
							'access',
							(_19) => _19[0],
							'optionalAccess',
							(_20) => _20.value
						]),
						() => 'coordination'
					),
					requiresApproval: false,
					autoConfirmAttendance: true,
					minVolunteers: '0',
					locationName: eventDetails.locationName,
					locationNotes: eventDetails.locationAddress
				},
				eventId
			);
			const response = await createVolunteerOpportunity(payload);
			const created = _nullishCoalesce(
				_optionalChain([response, 'optionalAccess', (_21) => _21.data]),
				() => response
			);
			if (!created || typeof created !== 'object') throw new Error('Unable to create activity.');
			const freshShifts = await listVolunteerShifts({
				query: {
					opportunity_id: `eq.${created.id}`,
					order: 'starts_at.asc'
				}
			});
			const normalized = mapOpportunityRecordToFormDetails(
				created,
				ensureArray(
					_nullishCoalesce(
						_optionalChain([freshShifts, 'optionalAccess', (_22) => _22.data]),
						() => freshShifts
					)
				)
			);
			opportunities = [...opportunities, normalized];
			notifySuccess('Activity added');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_23) => _23.message]) || 'Unable to add activity.'
			);
		}
	}

	async function removeOpportunity(id) {
		try {
			await deleteVolunteerOpportunity(id);
			opportunities = opportunities.filter((op) => op.id !== id);
			opportunityAutosaves.delete(id);
			for (const [shiftId] of shiftAutosaves.entries()) {
				const belongsToRemoved = opportunities.every((op) =>
					op.shifts.every((shift) => shift.id !== shiftId)
				);
				if (belongsToRemoved) shiftAutosaves.delete(shiftId);
			}
			notifySuccess('Activity removed');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_24) => _24.message]) ||
					'Unable to remove activity.'
			);
		}
	}

	function updateOpportunity(id, patch) {
		opportunities = opportunities.map((op) => (op.id === id ? { ...op, ...patch } : op));
		getOpportunityAutosave(id).queue(patch);
	}

	async function addShift(opportunityId) {
		try {
			const opportunity = opportunities.find((op) => op.id === opportunityId);
			const payload = buildShiftPayload(
				{
					startsAt:
						_optionalChain([
							opportunity,
							'optionalAccess',
							(_25) => _25.shifts,
							'optionalAccess',
							(_26) => _26[0],
							'optionalAccess',
							(_27) => _27.startsAt
						]) || eventDetails.eventStart,
					endsAt:
						_optionalChain([
							opportunity,
							'optionalAccess',
							(_28) => _28.shifts,
							'optionalAccess',
							(_29) => _29[0],
							'optionalAccess',
							(_30) => _30.endsAt
						]) || eventDetails.eventEnd,
					timezone:
						_optionalChain([
							opportunity,
							'optionalAccess',
							(_31) => _31.shifts,
							'optionalAccess',
							(_32) => _32[0],
							'optionalAccess',
							(_33) => _33.timezone
						]) || eventDetails.timezone,
					locationName:
						_optionalChain([opportunity, 'optionalAccess', (_34) => _34.locationName]) ||
						eventDetails.locationName,
					locationAddress:
						_optionalChain([opportunity, 'optionalAccess', (_35) => _35.locationNotes]) ||
						eventDetails.locationAddress,
					notes: ''
				},
				opportunityId
			);
			const response = await createVolunteerShift(payload);
			const created = _nullishCoalesce(
				_optionalChain([response, 'optionalAccess', (_36) => _36.data]),
				() => response
			);
			if (!created || typeof created !== 'object') throw new Error('Unable to create shift.');
			const normalized = mapShiftRecordToFormDetails(created);
			opportunities = opportunities.map((op) =>
				op.id === opportunityId ? { ...op, shifts: [...op.shifts, normalized] } : op
			);
			notifySuccess('Shift added');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_37) => _37.message]) || 'Unable to add shift.'
			);
		}
	}

	async function removeShift(opportunityId, shiftId) {
		try {
			await deleteVolunteerShift(shiftId);
			opportunities = opportunities.map((op) =>
				op.id === opportunityId
					? { ...op, shifts: op.shifts.filter((shift) => shift.id !== shiftId) }
					: op
			);
			shiftAutosaves.delete(shiftId);
			notifySuccess('Shift removed');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_38) => _38.message]) || 'Unable to remove shift.'
			);
		}
	}

	function updateShift(opportunityId, shiftId, patch) {
		opportunities = opportunities.map((op) => {
			if (op.id !== opportunityId) return op;
			const shifts = op.shifts.map((shift) =>
				shift.id === shiftId ? { ...shift, ...patch } : shift
			);
			return { ...op, shifts };
		});
		getShiftAutosave(shiftId, opportunityId).queue(patch);
	}

	const loadedQuestions = ensureArray(_nullishCoalesce(data.customQuestions, () => []));
	let customQuestions = $state(
		loadedQuestions.map((question) => mapQuestionRecordToFormDetails(question))
	);
	const questionAutosaves = new Map();

	function getQuestionAutosave(id) {
		if (!questionAutosaves.has(id)) {
			const autosave = createAutosave({
				onSave: async (patch) => {
					const payload = buildQuestionPayload(patch);
					await updateVolunteerCustomQuestion(id, payload);
					const refreshed = await getVolunteerCustomQuestion(id);
					const freshRecord = _nullishCoalesce(
						_optionalChain([refreshed, 'optionalAccess', (_39) => _39.data]),
						() => refreshed
					);
					const normalized = mapQuestionRecordToFormDetails({
						id,
						..._nullishCoalesce(freshRecord, () => ({}))
					});
					customQuestions = customQuestions.map((question) =>
						question.id === id ? normalized : question
					);
				},
				successMessage: 'Question saved',
				errorMessage: 'Unable to save question.'
			});
			questionAutosaves.set(id, autosave);
		}
		return questionAutosaves.get(id);
	}

	function generateQuestionKey(label, index) {
		const base = slugify(label || `question-${index + 1}`);
		return base || `question-${crypto.randomUUID().slice(0, 8)}`;
	}

	async function addQuestion() {
		try {
			const position = customQuestions.length;
			const label = 'New question';
			const payload = buildQuestionPayload(
				{
					label,
					fieldType: 'text',
					isRequired: false,
					helpText: '',
					fieldKey: generateQuestionKey(label, position),
					position
				},
				eventId
			);
			const response = await createVolunteerCustomQuestion(payload);
			const created = _nullishCoalesce(
				_optionalChain([response, 'optionalAccess', (_40) => _40.data]),
				() => response
			);
			if (!created || typeof created !== 'object') throw new Error('Unable to add question.');
			const normalized = mapQuestionRecordToFormDetails(created);
			customQuestions = [...customQuestions, normalized];
			notifySuccess('Question added');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_41) => _41.message]) || 'Unable to add question.'
			);
		}
	}

	async function removeQuestion(id) {
		try {
			await deleteVolunteerCustomQuestion(id);
			customQuestions = customQuestions.filter((question) => question.id !== id);
			questionAutosaves.delete(id);
			notifySuccess('Question removed');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_42) => _42.message]) ||
					'Unable to remove question.'
			);
		}
	}

	function updateQuestion(id, patch) {
		customQuestions = customQuestions.map((question) =>
			question.id === id ? { ...question, ...patch } : question
		);
		getQuestionAutosave(id).queue(patch);
	}

	const loadedEmails = ensureArray(_nullishCoalesce(data.eventEmails, () => []));
	let eventEmails = $state(loadedEmails.map((email) => mapEmailRecordToFormDetails(email)));
	const emailAutosaves = new Map();

	function getEmailAutosave(id) {
		if (!emailAutosaves.has(id)) {
			const autosave = createAutosave({
				onSave: async (patch) => {
					const payload = buildEmailPayload(patch);
					await updateVolunteerEventEmail(id, payload);
					const refreshed = await getVolunteerEventEmail(id);
					const freshRecord = _nullishCoalesce(
						_optionalChain([refreshed, 'optionalAccess', (_43) => _43.data]),
						() => refreshed
					);
					const normalized = mapEmailRecordToFormDetails({
						id,
						..._nullishCoalesce(freshRecord, () => ({}))
					});
					eventEmails = eventEmails.map((email) => (email.id === id ? normalized : email));
				},
				successMessage: 'Email saved',
				errorMessage: 'Unable to save email.'
			});
			emailAutosaves.set(id, autosave);
		}
		return emailAutosaves.get(id);
	}

	async function addEmail() {
		try {
			const payload = buildEmailPayload(
				{
					emailType: 'reminder',
					sendOffsetMinutes: 720,
					subject: '',
					body: '',
					requireConfirmation: false,
					surveyUrl: ''
				},
				eventId
			);
			const response = await createVolunteerEventEmail(payload);
			const created = _nullishCoalesce(
				_optionalChain([response, 'optionalAccess', (_44) => _44.data]),
				() => response
			);
			if (!created || typeof created !== 'object') throw new Error('Unable to add email.');
			const normalized = mapEmailRecordToFormDetails(created);
			eventEmails = [...eventEmails, normalized];
			notifySuccess('Email added');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_45) => _45.message]) || 'Unable to add email.'
			);
		}
	}

	async function removeEmail(id) {
		try {
			await deleteVolunteerEventEmail(id);
			eventEmails = eventEmails.filter((email) => email.id !== id);
			emailAutosaves.delete(id);
			notifySuccess('Email removed');
		} catch (err) {
			notifyError(
				_optionalChain([err, 'optionalAccess', (_46) => _46.message]) || 'Unable to remove email.'
			);
		}
	}

	function updateEmail(id, patch) {
		eventEmails = eventEmails.map((email) => (email.id === id ? { ...email, ...patch } : email));
		if (patch && 'aiComposerOpen' in patch) {
			// Prevent AI composer usage in the edit view.
			if (patch.aiComposerOpen) {
				notifyWarning('The AI composer is unavailable on the edit page.');
				eventEmails = eventEmails.map((email) =>
					email.id === id ? { ...email, aiComposerOpen: false } : email
				);
				return;
			}
		}
		getEmailAutosave(id).queue(patch);
	}

	function handleComposeEmail(_id) {
		notifyWarning('Email composer is disabled in this editor.');
	}

	const rolesAddOpportunityWrapper = () => {
		addOpportunity();
	};
	function rolesRemoveOpportunityWrapper(...args) {
		const id = _optionalChain([args, 'optionalAccess', (_47) => _47[0]]);
		if (id === undefined) return;
		removeOpportunity(id);
	}
	function rolesUpdateOpportunityWrapper(...args) {
		const [id, patch] = args;

		if (id === undefined || !patch) return;
		updateOpportunity(id, patch);
	}
	function rolesAddShiftWrapper(...args) {
		const id = _optionalChain([args, 'optionalAccess', (_48) => _48[0]]);
		if (id === undefined) return;
		addShift(id);
	}
	function rolesRemoveShiftWrapper(...args) {
		const [opportunityId, shiftId] = args;

		if (opportunityId === undefined || shiftId === undefined) return;
		removeShift(opportunityId, shiftId);
	}
	function rolesUpdateShiftWrapper(...args) {
		const [opportunityId, shiftId, patch] = args;

		if (opportunityId === undefined || shiftId === undefined || !patch) return;
		updateShift(opportunityId, shiftId, patch);
	}

	const commAddQuestionWrapper = () => {
		addQuestion();
	};
	function commRemoveQuestionWrapper(...args) {
		const id = _optionalChain([args, 'optionalAccess', (_49) => _49[0]]);
		if (id === undefined) return;
		removeQuestion(id);
	}
	function commUpdateQuestionWrapper(...args) {
		const [id, patch] = args;

		if (id === undefined || !patch) return;
		updateQuestion(id, patch);
	}
	const commAddEmailWrapper = () => {
		addEmail();
	};
	function commRemoveEmailWrapper(...args) {
		const id = _optionalChain([args, 'optionalAccess', (_50) => _50[0]]);
		if (id === undefined) return;
		removeEmail(id);
	}
	function commUpdateEmailWrapper(...args) {
		const [id, patch] = args;
		if (id === undefined || !patch) return;
		updateEmail(id, patch);
	}
	function commComposeEmailWrapper(...args) {
		handleComposeEmail(_optionalChain([args, 'optionalAccess', (_51) => _51[0]]));
	}
</script>

<svelte:head>
	<title>Edit volunteer event</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-8 pb-16">
	<header class="space-y-1">
		<h1 class="text-3xl font-bold">Edit volunteer event</h1>
		<p class="text-surface-400 text-sm">
			Updates save automatically. You can leave this page when you see a success toast.
		</p>
	</header>

	<section class="border-surface-700 bg-surface-950/70 space-y-6 rounded-lg border p-6 shadow-sm">
		<h2 class="text-xl font-semibold">Event basics</h2>
		<div class="grid gap-4 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label class="label" for="event-status">Status</label>
				<select
					id="event-status"
					class="select bg-surface-900/60"
					value={eventDetails.status}
					onchange={(event) => updateEventDetails({ status: event.currentTarget.value })}
				>
					{#each statusOptions as status}
						<option value={status}>{status}</option>
					{/each}
				</select>
			</div>
		</div>

		<EventOverviewStep
			{statusOptions}
			{eventDetails}
			{eventTypeOptions}
			{hostGroupSelection}
			{filteredHostGroupOptions}
			{showAdvancedSettings}
			currentEventTypeDescription={currentEventTypeDescription()}
			hasHostGroups={hostGroupOptions.length > 0}
			onEventDetailsChange={overviewDetailsChange}
			onHostGroupValueChange={handleHostGroupValueChange}
			onHostGroupSearch={handleHostGroupSearch}
			onClearHostGroup={handleClearHostGroup}
			onToggleAdvanced={() => (showAdvancedSettings = !showAdvancedSettings)}
		/>
	</section>

	<section class="border-surface-700 bg-surface-950/70 space-y-6 rounded-lg border p-6 shadow-sm">
		<h2 class="text-xl font-semibold">Schedule &amp; contact</h2>
		<ScheduleStep {eventDetails} {timezoneOptions} onEventDetailsChange={scheduleDetailsChange} />
	</section>

	<section class="border-surface-700 bg-surface-950/70 space-y-6 rounded-lg border p-6 shadow-sm">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-semibold">Roles &amp; shifts</h2>
			<button type="button" class="btn preset-filled-primary-500" onclick={addOpportunity}>
				Add activity
			</button>
		</div>
		<RolesStep
			{opportunities}
			{opportunityTypeOptions}
			onAddOpportunity={rolesAddOpportunityWrapper}
			onRemoveOpportunity={rolesRemoveOpportunityWrapper}
			onUpdateOpportunity={rolesUpdateOpportunityWrapper}
			onAddShift={rolesAddShiftWrapper}
			onRemoveShift={rolesRemoveShiftWrapper}
			onUpdateShift={rolesUpdateShiftWrapper}
		/>
	</section>

	<section class="border-surface-700 bg-surface-950/70 space-y-6 rounded-lg border p-6 shadow-sm">
		<h2 class="text-xl font-semibold">Signup questions &amp; messaging</h2>
		<CommunicationsStep
			{customQuestions}
			{eventEmails}
			{eventDetails}
			{opportunities}
			{fieldTypeOptions}
			{emailTypeOptions}
			{showAdvancedCommunications}
			onToggleAdvanced={() => (showAdvancedCommunications = !showAdvancedCommunications)}
			onAddQuestion={commAddQuestionWrapper}
			onRemoveQuestion={commRemoveQuestionWrapper}
			onUpdateQuestion={commUpdateQuestionWrapper}
			onAddEmail={commAddEmailWrapper}
			onRemoveEmail={commRemoveEmailWrapper}
			onUpdateEmail={commUpdateEmailWrapper}
			onComposeEmail={commComposeEmailWrapper}
		/>
	</section>

	<Toaster {toaster} />
</div>
