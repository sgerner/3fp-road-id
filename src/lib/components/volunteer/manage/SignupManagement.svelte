<script>
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import { SvelteMap } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	const {
		volunteers = [],
		statusFilters = [],
		activityFilters = [],
		shiftFilters = [],
		shifts = [],
		profiles = [],
		selectedStatus = 'all',
		selectedActivity = 'all',
		selectedShift = 'all',
		searchTerm = '',
		onStatusChange = () => {},
		onActivityChange = () => {},
		onShiftChange = () => {},
		onSearch = () => {},
		onApprove = (/** @type {string} */ assignmentId) => {},
		onDecline = (/** @type {string} */ assignmentId) => {},
		onWaitlist = (/** @type {string} */ assignmentId) => {},
		onMoveShift = (/** @type {string} */ volunteerId, /** @type {string | null} */ shiftId) => {},
		onPresent = (/** @type {string} */ assignmentId, /** @type {boolean} */ isPresent) => {},
		onAddVolunteer = async () => ({ ok: false, error: 'Not implemented' }),
		emailQueue = [],
		emailQueueSending = false,
		emailQueueError = '',
		onSendQueuedEmail = (/** @type {string} */ queueId) => {},
		onRemoveQueuedEmail = (/** @type {string} */ queueId) => {},
		onSendAllQueuedEmails = () => {},
		onClearEmailQueue = () => {}
	} = $props();

	const shiftMap = $derived(new SvelteMap(shifts.map((shift) => [shift.id, shift])));

	const statusOptions = [
		{ value: 'approved', label: 'Approved' },
		{ value: 'pending', label: 'Pending review' },
		{ value: 'waitlisted', label: 'Waitlisted' }
	];

	let selectedProfile = $state(null);
	let addForm = $state({
		email: '',
		name: '',
		phone: '',
		emergencyContactName: '',
		emergencyContactPhone: '',
		shiftActivityId: '',
		shiftId: '',
		status: 'approved'
	});
	let addError = $state('');
	let addSuccess = $state('');
	let addLoading = $state(false);
	let addVolunteer = $state(false);
	let profileLookupLoading = $state(false);
	let profileLookupError = $state('');
	let profileLookupTimeout = null;
	let profileLookupRequestId = 0;
	let emailSuggestions = $state([]);
	let suggestionTimeout = null;

	const activityLabelMap = $derived.by(() => {
		const map = new SvelteMap();
		for (const option of activityFilters) {
			if (!option) continue;
			const rawValue = option.value;
			if (rawValue === undefined || rawValue === null) continue;
			const key = String(rawValue);
			if (!key) continue;
			map.set(key, option.label ?? 'Volunteer activity');
		}
		return map;
	});

	const shiftsByActivity = $derived.by(() => {
		const map = new SvelteMap();
		for (const shift of shifts) {
			if (!shift) continue;
			const rawActivityId = shift.groupId ?? shift.opportunityId ?? null;
			if (rawActivityId === null || rawActivityId === undefined) continue;
			const activityId = String(rawActivityId);
			if (!activityId) continue;
			if (!map.has(activityId)) {
				map.set(activityId, []);
			}
			map.get(activityId)?.push(shift);
		}

		for (const [, list] of map) {
			list.sort((a, b) => {
				const timeA = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
				const timeB = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
				if (timeA !== timeB) {
					return timeA - timeB;
				}
				return (a?.optionLabel || '').localeCompare(b?.optionLabel || '');
			});
		}

		return map;
	});

	const addActivityOptions = $derived.by(() => {
		const options = [];
		const usedIds = new Set();

		for (const option of activityFilters) {
			if (!option) continue;
			const rawValue = option.value;
			if (rawValue === undefined || rawValue === null) continue;
			const activityId = String(rawValue);
			if (!activityId) continue;
			const shiftList = shiftsByActivity.get(activityId) ?? [];
			if (!shiftList.length) continue;
			options.push({
				value: activityId,
				label: option.label ?? 'Volunteer activity',
				shifts: shiftList
			});
			usedIds.add(activityId);
		}

		for (const [activityId, shiftList] of shiftsByActivity) {
			if (!shiftList?.length || usedIds.has(activityId)) continue;
			const label =
				activityLabelMap.get(activityId) ?? shiftList[0]?.opportunityTitle ?? 'Volunteer activity';
			options.push({ value: activityId, label, shifts: shiftList });
		}

		return options;
	});

	const selectedAddActivity = $derived.by(
		() => addActivityOptions.find((option) => option.value === addForm.shiftActivityId) ?? null
	);

	const shiftTimeOptions = $derived.by(() => selectedAddActivity?.shifts ?? []);

	const isShiftActivitySelectDisabled = $derived(() => addActivityOptions.length === 1);
	const isShiftTimeSelectDisabled = $derived(
		() => !addForm.shiftActivityId || shiftTimeOptions.length <= 1
	);

	async function fetchEmailSuggestions(term) {
		if (term.length < 2) {
			emailSuggestions = [];
			return;
		}
		try {
			let encodedTerm;
			try {
				encodedTerm = encodeURIComponent(term);
			} catch (e) {
				console.error('Failed to encode search term:', term, e);
				return; // Don't fetch if term is not encodable
			}
			const select =
				'id,user_id,email,full_name,phone,emergency_contact_name,emergency_contact_phone';
			const url = `/api/v1/profiles?select=${encodeURIComponent(select)}&email=ilike.%${encodedTerm}%&limit=5`;
			const response = await fetch(url);
			if (!response.ok) {
				emailSuggestions = [];
				return;
			}
			const result = await response.json();
			emailSuggestions = (result.data || []).map(normalizeProfileRow).filter(Boolean);
		} catch (error) {
			console.error('Failed to fetch email suggestions', error);
			emailSuggestions = [];
		}
	}

	function normalizeProfileRow(row) {
		if (!row) return null;
		const email = (row.email ?? '').trim();
		if (!email) return null;
		return {
			id: row.id ? String(row.id) : null,
			userId: row.user_id ? String(row.user_id) : null,
			email,
			name: row.full_name ?? '',
			phone: row.phone ?? '',
			emergencyContactName: row.emergency_contact_name ?? '',
			emergencyContactPhone: row.emergency_contact_phone ?? ''
		};
	}
	function clearProfileLookup() {
		if (profileLookupTimeout) {
			clearTimeout(profileLookupTimeout);
			profileLookupTimeout = null;
		}
		profileLookupLoading = false;
		profileLookupRequestId += 1;
	}
	function scheduleProfileLookup(email) {
		clearProfileLookup();
		const normalized = email.trim();
		if (!normalized) {
			profileLookupError = '';
			return;
		}
		profileLookupTimeout = setTimeout(() => lookupProfileByEmail(normalized), 250);
	}
	async function lookupProfileByEmail(email) {
		const normalizedEmail = email.trim().toLowerCase();
		if (!normalizedEmail) return;
		const currentEmail = addForm.email.trim().toLowerCase();
		if (currentEmail !== normalizedEmail) return;
		profileLookupLoading = true;
		profileLookupError = '';
		const requestId = ++profileLookupRequestId;
		try {
			const select =
				'id,user_id,email,full_name,phone,emergency_contact_name,emergency_contact_phone';
			const url = `/api/v1/profiles?select=${encodeURIComponent(select)}&email=${encodeURIComponent(normalizedEmail)}&single=maybe`;

			const response = await fetch(url);

			if (requestId !== profileLookupRequestId) {
				return;
			}

			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || response.statusText || 'Failed to fetch profile');
			}

			const result = await response.json();
			const profileData = result.data;

			const profile = normalizeProfileRow(profileData);
			if (profile) {
				applyProfileToForm(profile);
			} else {
				selectedProfile = null;
			}
		} catch (error) {
			if (requestId === profileLookupRequestId) {
				profileLookupError = error?.message || 'Unable to look up volunteer profile.';
			}
		} finally {
			if (requestId === profileLookupRequestId) {
				profileLookupLoading = false;
			}
		}
	}

	$effect(() => {
		const options = addActivityOptions;
		const currentActivityId = addForm.shiftActivityId;

		if (options.length === 1 && options[0]?.value !== currentActivityId) {
			const onlyOption = options[0];
			const onlyShiftId = onlyOption.shifts.length === 1 ? (onlyOption.shifts[0]?.id ?? '') : '';
			addForm = {
				...addForm,
				shiftActivityId: onlyOption.value,
				shiftId: onlyShiftId
			};
			return;
		}

		const activeOption = options.find((option) => option.value === currentActivityId) ?? null;

		if (!activeOption) {
			if (currentActivityId || addForm.shiftId) {
				addForm = { ...addForm, shiftActivityId: '', shiftId: '' };
			}
			return;
		}

		const hasValidShift = activeOption.shifts.some((shift) => shift.id === addForm.shiftId);
		if (!hasValidShift) {
			const defaultShiftId =
				activeOption.shifts.length === 1 ? (activeOption.shifts[0]?.id ?? '') : '';
			if (addForm.shiftId !== defaultShiftId) {
				addForm = { ...addForm, shiftId: defaultShiftId };
			}
		}
	});

	function applyProfileToForm(profile) {
		if (!profile) return;

		clearProfileLookup(); // Cancel pending lookups

		selectedProfile = profile;
		addForm = {
			...addForm,
			email: profile.email,
			name: profile.name || '',
			phone: profile.phone || '',
			emergencyContactName: profile.emergencyContactName || '',
			emergencyContactPhone: profile.emergencyContactPhone || ''
		};
		emailSuggestions = [];
		if (suggestionTimeout) {
			clearTimeout(suggestionTimeout);
		}
	}

	function handleEmailInput(value) {
		const email = value.trim();
		addForm = { ...addForm, email };

		if (selectedProfile && selectedProfile.email === email) {
			// When a suggestion is clicked, applyProfileToForm sets the email,
			// which can re-trigger this handler. If the email is unchanged
			// from the selected profile, do nothing.
			return;
		}

		if (suggestionTimeout) {
			clearTimeout(suggestionTimeout);
		}

		if (!email) {
			selectedProfile = null;
			profileLookupError = '';
			clearProfileLookup();
			emailSuggestions = [];
			addForm = {
				email: '',
				name: '',
				phone: '',
				emergencyContactName: '',
				emergencyContactPhone: '',
				shiftActivityId: addForm.shiftActivityId,
				shiftId: addForm.shiftId,
				status: addForm.status
			};
			return;
		}

		selectedProfile = null;
		// Reset form fields when typing a new email
		addForm = {
			email,
			name: '',
			phone: '',
			emergencyContactName: '',
			emergencyContactPhone: '',
			shiftActivityId: addForm.shiftActivityId,
			shiftId: addForm.shiftId,
			status: addForm.status
		};

		suggestionTimeout = setTimeout(() => {
			fetchEmailSuggestions(email);
		}, 250);
	}

	async function submitAddVolunteer(event) {
		event?.preventDefault?.();
		addError = '';
		addSuccess = '';

		if (!addForm.email) {
			addError = 'Enter an email address to look up or create a volunteer.';
			return;
		}
		if (!addForm.shiftId) {
			addError = 'Choose a shift to assign the volunteer to.';
			return;
		}

		const currentStatus = addForm.status;
		const currentShiftActivityId = addForm.shiftActivityId;
		const currentShiftId = addForm.shiftId;

		addLoading = true;

		try {
			const payload = {
				email: addForm.email,
				name: addForm.name,
				phone: addForm.phone,
				emergencyContactName: addForm.emergencyContactName,
				emergencyContactPhone: addForm.emergencyContactPhone,
				shiftId: addForm.shiftId,
				status: addForm.status,
				profileId: selectedProfile?.id ?? null,
				userId: selectedProfile?.userId ?? null
			};

			const result = await onAddVolunteer(payload);
			if (!result?.ok) {
				throw new Error(result?.error || 'Unable to add volunteer.');
			}

			addSuccess = result?.message || 'Volunteer added to the shift.';
			selectedProfile = null;
			addForm = {
				email: '',
				name: '',
				phone: '',
				emergencyContactName: '',
				emergencyContactPhone: '',
				shiftActivityId: currentShiftActivityId,
				shiftId: currentShiftId,
				status: currentStatus
			};
		} catch (error) {
			addError = error?.message || 'Unable to add volunteer. Please try again.';
		} finally {
			addLoading = false;
		}
	}

	function formatRelativeTime(date) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
			return '—';
		}

		const now = new Date();
		let diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (diffInSeconds < 0) {
			diffInSeconds = 0;
		}

		if (diffInSeconds < 10) {
			return 'just now';
		}

		const units = [
			{ limit: 60, divisor: 1, singular: 'sec', plural: 'sec' },
			{ limit: 3600, divisor: 60, singular: 'min', plural: 'min' },
			{ limit: 86400, divisor: 3600, singular: 'hr', plural: 'hrs' },
			{ limit: 604800, divisor: 86400, singular: 'day', plural: 'days' },
			{ limit: 2629800, divisor: 604800, singular: 'wk', plural: 'wks' },
			{ limit: 31557600, divisor: 2629800, singular: 'mo', plural: 'mos' },
			{ limit: Infinity, divisor: 31557600, singular: 'yr', plural: 'yrs' }
		];

		for (const unit of units) {
			if (diffInSeconds < unit.limit) {
				const value = Math.max(1, Math.floor(diffInSeconds / unit.divisor));
				const label = value === 1 ? unit.singular : unit.plural;
				return `${value} ${label} ago`;
			}
		}

		return '—';
	}

	function buildSignupInfo(createdAt) {
		if (!createdAt) {
			return { createdAt: null, timestamp: 0, relative: '—' };
		}

		const parsed = new Date(createdAt);
		if (Number.isNaN(parsed.getTime())) {
			return { createdAt, timestamp: 0, relative: '—' };
		}

		return {
			createdAt,
			timestamp: parsed.getTime(),
			relative: formatRelativeTime(parsed)
		};
	}

	const individualShifts = $derived.by(() => {
		const flattened = [];
		for (const volunteer of volunteers) {
			const signupInfo = buildSignupInfo(volunteer.signup?.created_at ?? null);
			const assignments = volunteer.assignments ?? [];
			if (assignments.length === 0) {
				// Handle volunteers with no specific shift assignment
				flattened.push({
					key: `${volunteer.id}-unassigned`,
					volunteer,
					assignment: { id: null, status: volunteer.status, attended: volunteer.attended },
					shiftDetails: {
						optionLabel: 'Unassigned',
						windowLabel: 'No shift selected'
					},
					hasMultipleShifts: false,
					signup: signupInfo
				});
			} else {
				for (const assignment of assignments) {
					flattened.push({
						key: `${volunteer.id}-${assignment.id}`,
						volunteer,
						assignment,
						shiftDetails: shiftMap.get(assignment.shiftId ?? '') ?? {},
						hasMultipleShifts: (volunteer.shiftIds?.length ?? 0) > 1,
						signup: signupInfo
					});
				}
			}
		}

		flattened.sort((a, b) => {
			const startTimeA = a.shiftDetails.startsAt ? new Date(a.shiftDetails.startsAt).getTime() : 0;
			const startTimeB = b.shiftDetails.startsAt ? new Date(b.shiftDetails.startsAt).getTime() : 0;
			if (startTimeA !== startTimeB) {
				return startTimeA - startTimeB;
			}
			const createdAtA = a.signup?.timestamp ?? 0;
			const createdAtB = b.signup?.timestamp ?? 0;
			return createdAtA - createdAtB;
		});

		return flattened;
	});

	const groupedShiftBlocks = $derived.by(() => {
		const groups = [];
		let currentGroup = null;

		const ensureLabel = (value, fallback) => {
			if (typeof value === 'string' && value.trim().length > 0) {
				return value.trim();
			}
			return fallback;
		};

		for (const item of individualShifts) {
			const activityLabel = ensureLabel(item.shiftDetails?.opportunityTitle, 'Unassigned shift');
			const timeLabel = ensureLabel(
				item.shiftDetails?.optionLabel ?? item.shiftDetails?.windowLabel,
				'No shift selected'
			);
			const groupKey = `${activityLabel}__${timeLabel}`;

			if (!currentGroup || currentGroup.key !== groupKey) {
				currentGroup = {
					key: groupKey,
					activityLabel,
					timeLabel,
					approvedCount: 0,
					waitlistedCount: 0,
					items: []
				};
				groups.push(currentGroup);
			}

			currentGroup.items.push(item);

			const status = item.assignment?.status ?? '';
			if (status === 'waitlisted') {
				currentGroup.waitlistedCount += 1;
			} else if (status === 'approved' || status === 'checked_in') {
				currentGroup.approvedCount += 1;
			}
		}

		return groups;
	});

	function statusClass(status) {
		switch (status) {
			case 'approved':
			case 'checked_in':
				return 'bg-success-500/20 text-success-200';
			case 'pending':
				return 'bg-warning-500/20 text-warning-200';
			case 'waitlisted':
				return 'bg-surface-500/20 text-surface-100';
			case 'declined':
			case 'cancelled':
			case 'no_show':
				return 'bg-error-500/20 text-error-200';
			default:
				return 'bg-surface-500/20 text-surface-100';
		}
	}

	function cardStatusClass(status) {
		switch (status) {
			case 'approved':
				return 'preset-tonal-success';
			case 'waitlisted':
				return 'bg-secondary-800/10';
			case 'declined':
				return 'bg-error-800/10';
			case 'cancelled':
				return 'preset-tonal-warning';
			default:
				return '';
		}
	}

	function formatStatusLabel(status) {
		return (status || '').replace(/_/g, ' ');
	}
</script>

<section
	class="border-surface-700 bg-surface-900/70 overflow-clip rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h2 class="!text-left text-xl font-semibold text-white">Signup Management</h2>
			<p class="text-surface-300 text-sm">
				Filter volunteers by status and shift, manage approvals, and confirm arrivals.
			</p>
		</div>
	</div>

	<div class="mt-4 space-y-4">
		{#if emailQueue.length || emailQueueError}
			<div
				class="border-surface-700/70 bg-surface-950/60 text-surface-200 rounded-xl border px-4 py-4 text-sm"
				transition:slide
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold text-white">Queued emails</h3>
						<p class="text-surface-300 text-xs">Review and send shift updates when you're ready.</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
							disabled={!emailQueue.length || emailQueueSending}
							onclick={() => onSendAllQueuedEmails()}
						>
							{#if emailQueueSending}
								Sending…
							{:else}
								Send all ({emailQueue.length})
							{/if}
						</button>
						<button
							type="button"
							class="preset-outlined-error-500 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
							disabled={!emailQueue.length || emailQueueSending}
							onclick={() => onClearEmailQueue()}
						>
							Remove all
						</button>
					</div>
				</div>
				{#if emailQueueError}
					<div
						class="bg-error-500/10 border-error-500/40 text-error-200 mt-3 rounded-lg border px-3 py-2 text-sm"
					>
						{emailQueueError}
					</div>
				{/if}
				{#if emailQueue.length}
					<ul class="mt-3 space-y-2">
						{#each emailQueue as queueItem (queueItem.id)}
							<li class="border-surface-800/70 bg-surface-900/50 rounded-lg border px-3 py-2">
								<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
									<div>
										<div class="font-semibold text-white">
											{queueItem.volunteerName}
										</div>
										<div class="text-surface-300 text-xs">
											{queueItem.volunteerEmail}
										</div>
									</div>
									<div class="text-surface-300 text-xs md:max-w-xs md:text-right">
										<div class="text-surface-100 font-medium">
											{queueItem.opportunityTitle || 'Volunteer shift'}
										</div>
										{#if queueItem.shiftLabel}
											<div class="text-surface-200">
												{queueItem.shiftLabel}
											</div>
										{/if}
									</div>
									<div class="text-surface-300 text-xs md:text-right">
										<span class="font-semibold text-white capitalize">
											{formatStatusLabel(queueItem.status)}
										</span>
										{#if queueItem.previousStatus}
											<span class="text-surface-400 ml-1">
												from {formatStatusLabel(queueItem.previousStatus)}
											</span>
										{/if}
									</div>
									<div class="flex flex-wrap justify-end gap-2">
										<button
											type="button"
											class="preset-filled-primary-500 rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-60"
											disabled={emailQueueSending}
											onclick={() => onSendQueuedEmail(queueItem.id)}
										>
											Send
										</button>
										<button
											type="button"
											class="preset-outlined-error-500 rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-60"
											disabled={emailQueueSending}
											onclick={() => onRemoveQueuedEmail(queueItem.id)}
										>
											Remove
										</button>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{:else if !emailQueueError}
					<div class="text-surface-300 mt-3 text-sm">No emails are waiting to be sent.</div>
				{/if}
			</div>
		{/if}
		<div class="flex flex-col flex-wrap gap-3 md:flex-row md:items-end">
			<label class="text-surface-200 flex flex-col text-sm md:w-34">
				<span class="mb-1 font-medium">Status</span>
				<select
					class="border-surface-600 bg-surface-950/60 rounded-lg border px-3 py-2"
					value={selectedStatus}
					onchange={(event) => onStatusChange(event.currentTarget.value)}
				>
					{#each statusFilters as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="text-surface-200 flex flex-col text-sm">
				<span class="mb-1 font-medium">Shift Activity</span>
				<select
					class="border-surface-600 bg-surface-950/60 rounded-lg border px-3 py-2 pr-6"
					value={selectedActivity}
					onchange={(event) => onActivityChange(event.currentTarget.value)}
				>
					<option value="all">All activities</option>
					{#each activityFilters as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="text-surface-200 flex flex-col text-sm">
				<span class="mb-1 font-medium">Shift Time</span>
				<select
					class="border-surface-600 bg-surface-950/60 rounded-lg border px-3 py-2"
					value={selectedShift}
					onchange={(event) => onShiftChange(event.currentTarget.value)}
					disabled={selectedActivity === 'all'}
				>
					<option value="all">All times</option>
					{#each shiftFilters as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="text-surface-200 flex flex-1 flex-col text-sm">
				<span class="mb-1 font-medium">Search</span>
				<input
					type="search"
					class="border-surface-600 bg-surface-950/60 rounded-lg border px-3 py-2"
					value={searchTerm}
					oninput={(event) => onSearch(event.currentTarget.value)}
					placeholder="Name, email, phone"
				/>
			</label>
		</div>
	</div>

	<div class="mt-6">
		<!-- Desktop header -->
		<div
			class="text-surface-400 hidden grid-cols-5 gap-x-4 px-3 py-2 text-xs tracking-wide uppercase md:grid"
		>
			<div class="col-span-1">Volunteer</div>
			<div class="col-span-1">Signed up</div>
			<div class="col-span-1">Shift</div>
			<div class="col-span-1">Status</div>
			<div class="col-span-1">Actions</div>
		</div>
		<!-- Volunteer list -->
		<div class="space-y-6 md:space-y-0">
			{#if !groupedShiftBlocks.length}
				<div class="text-surface-400 px-3 py-6 text-center" transition:slide>
					No volunteers match the selected filters.
				</div>
			{:else}
				{#each groupedShiftBlocks as group, groupIndex (group.key)}
					{@const isFirstGroup = groupIndex === 0}
					<div
						class={`space-y-3 md:space-y-0${
							isFirstGroup ? '' : ' md:border-surface-700/60 md:border-t md:pt-4'
						}`}
					>
						<div
							class="preset-tonal-tertiary flex flex-wrap items-center justify-between gap-3 p-2 text-sm"
						>
							<div class="text-surface-100">{group.activityLabel}</div>
							<div class="font-bold tracking-wide uppercase md:text-sm md:normal-case">
								{group.timeLabel}
							</div>
							<div class="text-surface-300 flex flex-wrap gap-4 text-xs tracking-wide uppercase">
								<span>
									Approved
									<span class="font-semibold text-white">
										{group.approvedCount}
									</span>
								</span>
								<span>
									Waitlisted
									<span class="font-semibold text-white">
										{group.waitlistedCount}
									</span>
								</span>
							</div>
						</div>
						{#each group.items as item (item.key)}
							<div
								transition:slide
								class={`card divide-surface-700/60 border-surface-200 rounded-lg border p-4 text-sm md:grid md:grid-cols-5 md:gap-x-4 md:divide-y-0 md:rounded-none md:border-0 md:border-b md:p-0
                                                                ${cardStatusClass(item.assignment.status)}`}
							>
								<!-- Volunteer -->
								<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
									<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">
										Volunteer
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-semibold text-white">{item.volunteer.name}</span>
										{#if item.hasMultipleShifts}
											<span
												class="chip preset-outlined-secondary-500 px-2 py-0.5 text-[10px] tracking-wide"
											>
												Multiple Shifts
											</span>
										{/if}
									</div>
								</div>

								<!-- Signup time -->
								<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
									<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">
										Signed up
									</div>
									{#if item.signup?.relative && item.signup.relative !== '—'}
										<div class="text-surface-200 text-sm" title={item.signup.createdAt ?? ''}>
											{item.signup.relative}
										</div>
									{:else}
										<div class="text-surface-500 text-sm">—</div>
									{/if}
								</div>

								<!-- Shift -->
								<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
									<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">
										Shift
									</div>
									<div class="font-medium text-white">{item.shiftDetails.opportunityTitle}</div>
									<div class="text-surface-300 text-xs">{item.shiftDetails.optionLabel}</div>
								</div>

								<!-- Status -->
								<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
									<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">
										Status
									</div>
									<span
										class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(
											item.assignment.status
										)}`}
									>
										{item.assignment.status.replace('_', ' ')}
									</span>
								</div>

								<!-- Actions -->
								<div class="md:col-span-1 md:px-3 md:py-3">
									<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">
										Actions
									</div>
									{#if item.assignment.id}
										<div class="flex gap-2">
											{#if item.assignment.status !== 'approved' && item.assignment.status !== 'checked_in'}
												<button
													class="chip preset-filled-primary-500 px-2 py-1 text-xs"
													onclick={() => onApprove(item.assignment.id)}
												>
													Approve
												</button>
											{/if}
											{#if item.assignment.status !== 'declined' && item.assignment.status !== 'no_show'}
												<button
													class="chip preset-outlined-error-500 px-2 py-1 text-xs"
													onclick={() => onDecline(item.assignment.id)}
												>
													Decline
												</button>
											{/if}
											{#if item.assignment.status !== 'waitlisted'}
												<button
													class="chip preset-outlined-secondary-500 px-2 py-1 text-xs"
													onclick={() => onWaitlist(item.assignment.id)}
												>
													Waitlist
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<button
		class="btn btn-sm preset-tonal-tertiary mt-4"
		onclick={() => (addVolunteer = !addVolunteer)}
	>
		Add a volunteer
	</button>

	{#if addVolunteer}
		<div transition:slide>
			<p class="text-surface-300 mt-1 text-sm">
				Look up a volunteer by email or create a new account instantly, then choose the shift and
				status.
			</p>

			<form class="mt-4 grid gap-4 md:grid-cols-2" onsubmit={submitAddVolunteer}>
				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-email">
						Email
					</label>
					<input
						id="add-email"
						type="email"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						placeholder="volunteer@example.com"
						value={addForm.email}
						oninput={(event) => handleEmailInput(event.currentTarget.value)}
						onblur={() => lookupProfileByEmail(addForm.email)}
						required
					/>
					{#if emailSuggestions.length > 0 && addForm.email.trim() && (!selectedProfile || selectedProfile.email.toLowerCase() !== addForm.email
									.trim()
									.toLowerCase())}
						<div class="bg-surface-900/70 border-surface-700 mt-2 space-y-1 rounded-lg border p-2">
							<p class="text-surface-300 text-xs tracking-wide uppercase">Matching volunteers</p>
							{#each emailSuggestions as profile (profile.email)}
								<button
									type="button"
									class="hover:bg-primary-500/10 text-surface-100 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm"
									onclick={() => applyProfileToForm(profile)}
								>
									<span class="font-medium">{profile.name || 'Unnamed volunteer'}</span>
									<span class="text-surface-300 text-xs">{profile.email}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if profileLookupLoading}
						<p class="text-surface-300 mt-2 text-xs">Looking up volunteer profile…</p>
					{:else if profileLookupError}
						<p class="text-error-300 mt-2 text-xs">{profileLookupError}</p>
					{/if}
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-status"
						>Status</label
					>
					<select
						id="add-status"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						value={addForm.status}
						onchange={(event) => (addForm = { ...addForm, status: event.currentTarget.value })}
					>
						{#each statusOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-name"
						>Full name</label
					>
					<input
						id="add-name"
						type="text"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						placeholder="Alex Volunteer"
						value={addForm.name}
						oninput={(event) => (addForm = { ...addForm, name: event.currentTarget.value })}
					/>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-phone"
						>Phone (optional)</label
					>
					<input
						id="add-phone"
						type="tel"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						placeholder="(555) 555-1234"
						value={addForm.phone}
						oninput={(event) => (addForm = { ...addForm, phone: event.currentTarget.value })}
					/>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-shift-activity">
						Shift Activity
					</label>
					<select
						id="add-shift-activity"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						value={addForm.shiftActivityId}
						onchange={(event) =>
							(addForm = {
								...addForm,
								shiftActivityId: event.currentTarget.value,
								shiftId: ''
							})}
					>
						{#if addActivityOptions.length === 0}
							<option value="">No shift activities available</option>
						{:else}
							{#if addActivityOptions.length > 1}
								<option value="" disabled>Select a shift activity</option>
							{/if}
							{#each addActivityOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						{/if}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-shift-time">
						Shift Time
					</label>
					<select
						id="add-shift-time"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						value={addForm.shiftId}
						onchange={(event) => (addForm = { ...addForm, shiftId: event.currentTarget.value })}
						required
					>
						{#if !addForm.shiftActivityId}
							<option value="">Select a shift activity first</option>
						{:else if !shiftTimeOptions.length}
							<option value="">No shift times available</option>
						{:else if shiftTimeOptions.length > 1}
							<option value="" disabled>Select a shift time</option>
						{/if}
						{#each shiftTimeOptions as shift (shift.id)}
							<option value={shift.id}>{shift.optionLabel}</option>
						{/each}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-emergency-name"
						>Emergency contact name</label
					>
					<input
						id="add-emergency-name"
						type="text"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						placeholder="Emergency contact"
						value={addForm.emergencyContactName}
						oninput={(event) =>
							(addForm = {
								...addForm,
								emergencyContactName: event.currentTarget.value
							})}
					/>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-200 mb-1 block text-sm font-medium" for="add-emergency-phone"
						>Emergency contact phone</label
					>
					<input
						id="add-emergency-phone"
						type="tel"
						class="border-surface-600 bg-surface-950/60 w-full rounded-lg border px-3 py-2"
						placeholder="(555) 555-7890"
						value={addForm.emergencyContactPhone}
						oninput={(event) =>
							(addForm = {
								...addForm,
								emergencyContactPhone: event.currentTarget.value
							})}
					/>
				</div>

				{#if selectedProfile}
					<div
						class="bg-primary-500/5 border-primary-500/40 rounded-lg border px-3 py-2 text-sm text-white md:col-span-2"
					>
						<div class="flex flex-wrap items-center gap-3">
							<span class="font-semibold">Existing profile selected</span>
							<span class="text-surface-200 flex items-center gap-1 text-xs">
								<IconMail class="size-3" />
								{selectedProfile.email}
							</span>
							{#if selectedProfile.phone}
								<span class="text-surface-200 flex items-center gap-1 text-xs">
									<IconPhone class="size-3" />
									{selectedProfile.phone}
								</span>
							{/if}
						</div>
					</div>
				{:else if addForm.email.trim() && !profileLookupLoading && !profileLookupError}
					<div
						class="bg-secondary-500/5 border-secondary-500/30 text-surface-200 rounded-lg border px-3 py-2 text-sm md:col-span-2"
					>
						No existing profile found for this email. A new volunteer account will be created when
						you submit.
					</div>
				{/if}

				{#if addError}
					<div
						class="bg-error-500/10 border-error-500/40 text-error-200 rounded-lg border px-3 py-2 text-sm md:col-span-2"
					>
						{addError}
					</div>
				{/if}
				{#if addSuccess}
					<div
						class="bg-success-500/10 border-success-500/40 text-success-200 rounded-lg border px-3 py-2 text-sm md:col-span-2"
					>
						{addSuccess}
					</div>
				{/if}

				<div class="flex justify-end md:col-span-2">
					<button
						type="submit"
						class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-semibold"
						disabled={addLoading}
					>
						{#if addLoading}
							Adding…
						{:else}
							Add volunteer to shift
						{/if}
					</button>
				</div>
			</form>
		</div>
	{/if}
</section>
