<script>
	import { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
	import EventOverviewStep from '#lib/components/volunteer/EventOverviewStep.svelte';
	import ScheduleStep from '#lib/components/volunteer/ScheduleStep.svelte';
	import RolesStep from '#lib/components/volunteer/RolesStep.svelte';
	import CommunicationsStep from '#lib/components/volunteer/CommunicationsStep.svelte';
	import { HOST_GROUP_STATUS } from '#lib/groups/hostGroupDirectory';

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
	} from '#lib/components/volunteer/form-utils';
	import {
		FALLBACK_TIMEZONES,
		statusOptions,
		opportunityTypeOptions,
		emailTypeOptions,
		fieldTypeOptions
	} from '#lib/components/volunteer/form-options';
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
	} from '#lib/services/volunteers';

	let { data } = $props();

	const toaster = createToaster({ placement: 'top-end' });

	const notifySuccess = (message) => toaster.success({ title: message });
	const notifyError = (message) => toaster.error({ title: message });
	const notifyWarning = (message) => toaster.warning({ title: message });

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
			setSaving?.(true);
			try {
				await onSave(payload);
				if (successMessage) {
					notifySuccess(successMessage);
				}
			} catch (err) {
				const message = err?.message || errorMessage || 'Unable to save changes.';
				notifyError(message);
				throw err;
			} finally {
				saving = false;
				setSaving?.(false);
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

	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();
	const eventTypes = pageData.eventTypes ?? [];
	const eventTypeOptions = eventTypes.map((item) => ({
		value: String(item.slug ?? ''),
		label: String(item.event_type ?? ''),
		description: item.description ?? ''
	}));

	const eventRecordInitial = pageData.event ?? {};
	const eventId = eventRecordInitial.id ?? '';
	let eventRecord = $state({ ...eventRecordInitial });
	let eventDetails = $state(mapEventRecordToFormDetails({ ...eventRecordInitial }));

	let hostGroups = $state(pageData.hostGroups ?? []);
	const initialHostGroupId =
		eventRecordInitial.host_group_id ?? eventRecordInitial.hostGroupId ?? '';
	let sponsorshipGroupId = $state('');
	let sponsorshipMessage = $state('');
	let activeSponsorshipRequest = $state(pageData.activeSponsorshipRequest ?? null);
	let showAdvancedSettings = $state(false);
	let showAdvancedCommunications = $state(false);
	let eventSaving = $state(false);

	function currentEventTypeDescription() {
		const match = eventTypeOptions.find((option) => option.value === eventDetails.eventTypeSlug);
		return match?.description ?? '';
	}

	async function handleHostGroupChange(nextGroupId) {
		const normalizedId = nextGroupId || '';
		if (String(eventDetails.hostGroupId || '') !== String(normalizedId)) {
			updateEventDetails({ hostGroupId: normalizedId });
		}
		if (normalizedId && activeSponsorshipRequest?.status === 'pending') {
			await fetch('/api/event-sponsorship-requests', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ requestId: activeSponsorshipRequest.id })
			}).catch(() => {});
			activeSponsorshipRequest = null;
		}
	}

	function handleSponsorshipChange({ groupId = '', message = '' } = {}) {
		sponsorshipGroupId = groupId || '';
		sponsorshipMessage = message || '';
	}

	function handleGroupClaimed(claimedGroup) {
		if (!claimedGroup?.id) return;
		const claimedId = String(claimedGroup.id);
		hostGroups = hostGroups.map((group) =>
			String(group.id) === claimedId
				? { ...group, status: HOST_GROUP_STATUS.MANAGED, isClaimed: true, canManage: true }
				: group
		);
	}

	const eventAutosave = createAutosave({
		onSave: async (patch) => {
			const payload = buildEventUpdatePayload(patch);
			await updateVolunteerEvent(eventId, payload);
			const refreshed = await getVolunteerEvent(eventId);
			const freshRecord = refreshed?.data ?? refreshed;
			if (freshRecord && typeof freshRecord === 'object') {
				eventRecord = { ...eventRecord, ...freshRecord };
				const normalized = mapEventRecordToFormDetails(eventRecord);
				eventDetails = normalized;
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
		const patch = args?.[0] ?? {};
		updateEventDetails(patch);
	}

	function scheduleDetailsChange(...args) {
		const patch = args?.[0] ?? {};
		updateEventDetails(patch);
	}

	const loadedOpportunities = ensureArray(pageData.opportunities ?? []);
	let opportunities = $state(
		loadedOpportunities.map((op) =>
			mapOpportunityRecordToFormDetails(op, ensureArray(op?.shifts ?? []))
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
					const rawOpp = freshOpp?.data ?? freshOpp;

					const normalized = mapOpportunityRecordToFormDetails(
						{ id, ...(rawOpp ?? {}) },
						ensureArray(freshShifts?.data ?? freshShifts)
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
					const freshRecord = refreshed?.data ?? refreshed;
					const normalized = mapShiftRecordToFormDetails({
						id,
						...(freshRecord ?? {})
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
					opportunityType: opportunityTypeOptions[0]?.value ?? 'coordination',
					requiresApproval: false,
					autoConfirmAttendance: true,
					minVolunteers: '0',
					locationName: eventDetails.locationName,
					locationNotes: eventDetails.locationAddress
				},
				eventId
			);
			const response = await createVolunteerOpportunity(payload);
			const created = response?.data ?? response;
			if (!created || typeof created !== 'object') throw new Error('Unable to create activity.');
			const freshShifts = await listVolunteerShifts({
				query: {
					opportunity_id: `eq.${created.id}`,
					order: 'starts_at.asc'
				}
			});
			const normalized = mapOpportunityRecordToFormDetails(
				created,
				ensureArray(freshShifts?.data ?? freshShifts)
			);
			opportunities = [...opportunities, normalized];
			notifySuccess('Activity added');
		} catch (err) {
			notifyError(err?.message || 'Unable to add activity.');
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
			notifyError(err?.message || 'Unable to remove activity.');
		}
	}

	function updateOpportunity(id, patch) {
		opportunities = opportunities.map((op) => (op.id === id ? { ...op, ...patch } : op));
		getOpportunityAutosave(id).queue(patch);
	}

	async function addShift(opportunityId) {
		try {
			const opportunity = opportunities.find((op) => op.id === opportunityId);
			const defaultStartsAt = opportunity?.shifts?.[0]?.startsAt || eventDetails.eventStart;
			const rawDefaultEndsAt = opportunity?.shifts?.[0]?.endsAt || eventDetails.eventEnd;
			let defaultEndsAt = rawDefaultEndsAt;
			const startMs = defaultStartsAt ? Date.parse(String(defaultStartsAt)) : NaN;
			const endMs = defaultEndsAt ? Date.parse(String(defaultEndsAt)) : NaN;
			if (Number.isFinite(startMs) && (!Number.isFinite(endMs) || endMs <= startMs)) {
				defaultEndsAt = new Date(startMs + 60 * 60 * 1000).toISOString().slice(0, 16);
			}
			const payload = buildShiftPayload(
				{
					startsAt: defaultStartsAt,
					endsAt: defaultEndsAt,
					timezone: opportunity?.shifts?.[0]?.timezone || eventDetails.timezone,
					locationName: opportunity?.locationName || eventDetails.locationName,
					locationAddress: opportunity?.locationNotes || eventDetails.locationAddress,
					notes: ''
				},
				opportunityId
			);
			const response = await createVolunteerShift(payload);
			const created = response?.data ?? response;
			if (!created || typeof created !== 'object') throw new Error('Unable to create shift.');
			const normalized = mapShiftRecordToFormDetails(created);
			opportunities = opportunities.map((op) =>
				op.id === opportunityId ? { ...op, shifts: [...op.shifts, normalized] } : op
			);
			notifySuccess('Shift added');
		} catch (err) {
			notifyError(err?.message || 'Unable to add shift.');
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
			notifyError(err?.message || 'Unable to remove shift.');
		}
	}

	function updateShift(opportunityId, shiftId, patch) {
		let nextShiftRecord = null;
		opportunities = opportunities.map((op) => {
			if (op.id !== opportunityId) return op;
			const shifts = op.shifts.map((shift) =>
				shift.id === shiftId ? ((nextShiftRecord = { ...shift, ...patch }), nextShiftRecord) : shift
			);
			return { ...op, shifts };
		});

		const queuePatch = { ...patch };
		if (nextShiftRecord && ('startsAt' in patch || 'endsAt' in patch)) {
			const startMs = nextShiftRecord.startsAt ? Date.parse(String(nextShiftRecord.startsAt)) : NaN;
			const endMs = nextShiftRecord.endsAt ? Date.parse(String(nextShiftRecord.endsAt)) : NaN;
			if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
				queuePatch.startsAt = nextShiftRecord.startsAt;
				queuePatch.endsAt = nextShiftRecord.endsAt;
			} else {
				delete queuePatch.startsAt;
				delete queuePatch.endsAt;
			}
		}

		if (Object.keys(queuePatch).length > 0) {
			getShiftAutosave(shiftId, opportunityId).queue(queuePatch);
		}
	}

	const loadedQuestions = ensureArray(pageData.customQuestions ?? []);
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
					const freshRecord = refreshed?.data ?? refreshed;
					const normalized = mapQuestionRecordToFormDetails({
						id,
						...(freshRecord ?? {})
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
			const created = response?.data ?? response;
			if (!created || typeof created !== 'object') throw new Error('Unable to add question.');
			const normalized = mapQuestionRecordToFormDetails(created);
			customQuestions = [...customQuestions, normalized];
			notifySuccess('Question added');
		} catch (err) {
			notifyError(err?.message || 'Unable to add question.');
		}
	}

	async function removeQuestion(id) {
		try {
			await deleteVolunteerCustomQuestion(id);
			customQuestions = customQuestions.filter((question) => question.id !== id);
			questionAutosaves.delete(id);
			notifySuccess('Question removed');
		} catch (err) {
			notifyError(err?.message || 'Unable to remove question.');
		}
	}

	function updateQuestion(id, patch) {
		customQuestions = customQuestions.map((question) =>
			question.id === id ? { ...question, ...patch } : question
		);
		getQuestionAutosave(id).queue(patch);
	}

	const loadedEmails = ensureArray(pageData.eventEmails ?? []);
	let eventEmails = $state(loadedEmails.map((email) => mapEmailRecordToFormDetails(email)));
	const emailAutosaves = new Map();

	function getEmailAutosave(id) {
		if (!emailAutosaves.has(id)) {
			const autosave = createAutosave({
				onSave: async (patch) => {
					const payload = buildEmailPayload(patch);
					await updateVolunteerEventEmail(id, payload);
					const refreshed = await getVolunteerEventEmail(id);
					const freshRecord = refreshed?.data ?? refreshed;
					const normalized = mapEmailRecordToFormDetails({
						id,
						...(freshRecord ?? {})
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
			const created = response?.data ?? response;
			if (!created || typeof created !== 'object') throw new Error('Unable to add email.');
			const normalized = mapEmailRecordToFormDetails(created);
			eventEmails = [...eventEmails, normalized];
			notifySuccess('Email added');
		} catch (err) {
			notifyError(err?.message || 'Unable to add email.');
		}
	}

	async function removeEmail(id) {
		try {
			await deleteVolunteerEventEmail(id);
			eventEmails = eventEmails.filter((email) => email.id !== id);
			emailAutosaves.delete(id);
			notifySuccess('Email removed');
		} catch (err) {
			notifyError(err?.message || 'Unable to remove email.');
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
		const id = args?.[0];
		if (id === undefined) return;
		removeOpportunity(id);
	}
	function rolesUpdateOpportunityWrapper(...args) {
		const [id, patch] = args;

		if (id === undefined || !patch) return;
		updateOpportunity(id, patch);
	}
	function rolesAddShiftWrapper(...args) {
		const id = args?.[0];
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
		const id = args?.[0];
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
		const id = args?.[0];
		if (id === undefined) return;
		removeEmail(id);
	}
	function commUpdateEmailWrapper(...args) {
		const [id, patch] = args;
		if (id === undefined || !patch) return;
		updateEmail(id, patch);
	}
	function commComposeEmailWrapper(...args) {
		handleComposeEmail(args?.[0]);
	}
</script>

<svelte:head>
	<title>Edit volunteer event</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-8 pb-16">
	<header class="space-y-1">
		<h1 class="text-3xl font-bold">Edit volunteer event</h1>
		<p class="text-surface-600-400 text-sm">
			Updates save automatically. You can leave this page when you see a success toast.
		</p>
	</header>

	<section
		class="border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-lg border p-6 shadow-sm"
	>
		<h2 class="text-xl font-semibold">Event basics</h2>
		<div class="grid gap-4 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label class="label" for="event-status">Status</label>
				<select
					id="event-status"
					class="select bg-surface-100-900/60"
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
			{hostGroups}
			{initialHostGroupId}
			{sponsorshipGroupId}
			{sponsorshipMessage}
			{activeSponsorshipRequest}
			immediateSponsorshipMode={true}
			{eventId}
			{showAdvancedSettings}
			currentEventTypeDescription={currentEventTypeDescription()}
			onEventDetailsChange={overviewDetailsChange}
			onHostGroupChange={handleHostGroupChange}
			onSponsorshipChange={handleSponsorshipChange}
			onActiveSponsorshipRequestChange={(nextReq) => (activeSponsorshipRequest = nextReq)}
			onGroupClaimed={handleGroupClaimed}
			onToggleAdvanced={() => (showAdvancedSettings = !showAdvancedSettings)}
		/>
	</section>

	<section
		class="border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-lg border p-6 shadow-sm"
	>
		<h2 class="text-xl font-semibold">Schedule &amp; contact</h2>
		<ScheduleStep {eventDetails} {timezoneOptions} onEventDetailsChange={scheduleDetailsChange} />
	</section>

	<section
		class="border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-lg border p-6 shadow-sm"
	>
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

	<section
		class="border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-lg border p-6 shadow-sm"
	>
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

	<Toast.Group {toaster} />
</div>
