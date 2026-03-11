<script>
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconFilter from '@lucide/svelte/icons/filter';
	import IconX from '@lucide/svelte/icons/x';
	import IconUserPlus from '@lucide/svelte/icons/user-plus';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconSend from '@lucide/svelte/icons/send';
	import { SvelteMap } from 'svelte/reactivity';
	import { slide, fly } from 'svelte/transition';

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

	// ── Status pill definitions ──────────────────────────────────────────────
	const statusPills = [
		{ value: 'all', label: 'All' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'waitlisted', label: 'Waitlisted' },
		{ value: 'declined', label: 'Declined' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	function pillClass(value) {
		const active = selectedStatus === value;
		switch (value) {
			case 'approved':
				return active
					? 'bg-success-500 text-white'
					: 'bg-success-500/10 text-success-400 hover:bg-success-500/20';
			case 'pending':
				return active
					? 'bg-warning-500 text-white'
					: 'bg-warning-500/10 text-warning-400 hover:bg-warning-500/20';
			case 'waitlisted':
				return active
					? 'bg-surface-500 text-white'
					: 'bg-surface-500/10 text-surface-400 hover:bg-surface-500/20';
			case 'declined':
			case 'cancelled':
				return active
					? 'bg-error-600 text-white'
					: 'bg-error-500/10 text-error-400 hover:bg-error-500/20';
			default:
				return active
					? 'bg-primary-500 text-white'
					: 'bg-surface-500/10 text-surface-300 hover:bg-surface-500/20';
		}
	}

	// ── Add volunteer form ────────────────────────────────────────────────────
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

	// ── Email queue panel ─────────────────────────────────────────────────────
	let emailQueueOpen = $state(false);

	let expandedRows = $state(new Set());

	function toggleRow(key) {
		const next = new Set(expandedRows);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedRows = next;
	}

	function closeMenus() {
		expandedRows = new Set();
	}

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
				return timeA - timeB;
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
				return;
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
			if (requestId !== profileLookupRequestId) return;
			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || response.statusText || 'Failed to fetch profile');
			}
			const result = await response.json();
			const profile = normalizeProfileRow(result.data);
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

	function applyProfileToForm(profile) {
		if (!profile) return;
		clearProfileLookup();
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
		if (suggestionTimeout) clearTimeout(suggestionTimeout);
	}

	function handleEmailInput(value) {
		const email = value.trim();
		addForm = { ...addForm, email };
		if (selectedProfile && selectedProfile.email === email) return;
		if (suggestionTimeout) clearTimeout(suggestionTimeout);
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
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
		const now = new Date();
		let diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
		if (diffInSeconds < 0) diffInSeconds = 0;
		if (diffInSeconds < 10) return 'just now';
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

	function parseDateValue(value) {
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date;
	}

	function formatExactDate(date, timezone) {
		if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
		try {
			const formatter = new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
				...(timezone ? { timeZone: timezone } : {})
			});
			return formatter.format(date);
		} catch {
			return date.toLocaleString();
		}
	}

	function buildConfirmationDisplay(confirmedAt, timezone) {
		const date = parseDateValue(confirmedAt);
		if (!date) return null;
		const relative = formatRelativeTime(date);
		return {
			date,
			timestamp: date.getTime(),
			relative: relative === '—' ? '' : relative,
			exact: formatExactDate(date, timezone)
		};
	}

	function buildSignupInfo(createdAt) {
		if (!createdAt) return { createdAt: null, timestamp: 0, relative: '—' };
		const parsed = new Date(createdAt);
		if (Number.isNaN(parsed.getTime())) return { createdAt, timestamp: 0, relative: '—' };
		return { createdAt, timestamp: parsed.getTime(), relative: formatRelativeTime(parsed) };
	}

	const individualShifts = $derived.by(() => {
		const flattened = [];
		for (const volunteer of volunteers) {
			const signupInfo = buildSignupInfo(volunteer.signup?.created_at ?? null);
			const assignments = volunteer.assignments ?? [];
			if (assignments.length === 0) {
				flattened.push({
					key: `${volunteer.id}-unassigned`,
					volunteer,
					assignment: { id: null, status: volunteer.status, attended: volunteer.attended },
					shiftDetails: { optionLabel: 'Unassigned', windowLabel: 'No shift selected' },
					hasMultipleShifts: false,
					signup: signupInfo,
					confirmation: null
				});
			} else {
				for (const assignment of assignments) {
					const shiftDetails = shiftMap.get(assignment.shiftId ?? '') ?? {};
					flattened.push({
						key: `${volunteer.id}-${assignment.id}`,
						volunteer,
						assignment,
						shiftDetails,
						hasMultipleShifts: (volunteer.shiftIds?.length ?? 0) > 1,
						signup: signupInfo,
						confirmation: buildConfirmationDisplay(
							assignment.confirmedAt,
							shiftDetails?.timezone ?? shiftDetails?.time_zone ?? null
						)
					});
				}
			}
		}

		flattened.sort((a, b) => {
			const startTimeA = a.shiftDetails.startsAt ? new Date(a.shiftDetails.startsAt).getTime() : 0;
			const startTimeB = b.shiftDetails.startsAt ? new Date(b.shiftDetails.startsAt).getTime() : 0;
			if (startTimeA !== startTimeB) return startTimeA - startTimeB;
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
			if (typeof value === 'string' && value.trim().length > 0) return value.trim();
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

	function statusBadgeClass(status) {
		switch (status) {
			case 'approved':
			case 'checked_in':
				return 'bg-success-500/20 text-success-300 border border-success-500/30';
			case 'pending':
				return 'bg-warning-500/20 text-warning-300 border border-warning-500/30';
			case 'waitlisted':
				return 'bg-surface-500/20 text-surface-300 border border-surface-500/30';
			case 'declined':
			case 'cancelled':
				return 'bg-error-500/20 text-error-300 border border-error-500/30';
			case 'no_show':
				return 'bg-error-700/30 text-error-200 border border-error-600/30';
			default:
				return 'bg-surface-500/20 text-surface-300 border border-surface-500/30';
		}
	}

	function orbClass(status) {
		switch (status) {
			case 'approved':
			case 'checked_in':
				return 'bg-success-500/20 text-success-300';
			case 'pending':
				return 'bg-warning-500/20 text-warning-300';
			case 'waitlisted':
				return 'bg-surface-500/20 text-surface-300';
			case 'declined':
			case 'cancelled':
			case 'no_show':
				return 'bg-error-500/20 text-error-300';
			default:
				return 'bg-primary-500/20 text-primary-300';
		}
	}

	function statusLabel(status) {
		switch (status) {
			case 'checked_in':
				return 'Checked In';
			case 'no_show':
				return 'No Show';
			default:
				return (status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		}
	}

	function formatQueueStatus(s) {
		return (s || '').replace(/_/g, ' ');
	}
</script>

<!-- ── Email queue floating button ──────────────────────────────────────────── -->
{#if emailQueue.length > 0 || emailQueueError}
	<div class="fixed bottom-4 left-1/2 z-50" transition:fly={{ y: 16, duration: 200 }}>
		<!-- Queue panel (open) -->
		{#if emailQueueOpen}
			<div
				class="bg-surface-900/95 border-surface-600/40 mb-3 w-80 rounded-2xl border shadow-2xl backdrop-blur-xl"
				transition:slide={{ duration: 200 }}
			>
				<div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
					<div>
						<span class="text-surface-50 text-sm font-semibold">Queued Emails</span>
						<p class="text-surface-400 text-xs">Review before sending</p>
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="preset-filled-primary-500 rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50"
							disabled={!emailQueue.length || emailQueueSending}
							onclick={() => onSendAllQueuedEmails()}
						>
							{emailQueueSending ? 'Sending…' : `Send all (${emailQueue.length})`}
						</button>
						<button
							type="button"
							class="text-surface-400 hover:text-surface-100 rounded p-1 transition-colors"
							onclick={() => (emailQueueOpen = false)}
						>
							<IconX class="h-4 w-4" />
						</button>
					</div>
				</div>
				{#if emailQueueError}
					<div class="bg-error-500/10 text-error-300 border-b border-white/10 px-4 py-2 text-xs">
						{emailQueueError}
					</div>
				{/if}
				<ul class="max-h-64 divide-y divide-white/5 overflow-y-auto">
					{#each emailQueue as queueItem (queueItem.id)}
						<li class="px-4 py-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="text-surface-100 truncate text-xs font-semibold">
										{queueItem.volunteerName}
									</div>
									<div class="text-surface-400 truncate text-xs">{queueItem.volunteerEmail}</div>
									<div class="text-surface-500 mt-0.5 text-xs capitalize">
										{formatQueueStatus(queueItem.status)}
										{#if queueItem.shiftLabel}
											· {queueItem.shiftLabel}
										{/if}
									</div>
								</div>
								<div class="flex flex-shrink-0 gap-1">
									<button
										type="button"
										class="preset-filled-primary-500 rounded px-2 py-0.5 text-xs disabled:opacity-50"
										disabled={emailQueueSending}
										onclick={() => onSendQueuedEmail(queueItem.id)}
									>
										Send
									</button>
									<button
										type="button"
										class="text-surface-500 hover:text-error-400 rounded p-0.5 transition-colors"
										onclick={() => onRemoveQueuedEmail(queueItem.id)}
									>
										<IconX class="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Floating badge button -->
		<button
			type="button"
			class="preset-filled-secondary-500 shadow-secondary-500/30 relative flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95"
			onclick={() => (emailQueueOpen = !emailQueueOpen)}
			title="Email queue"
		>
			<IconSend class="h-5 w-5" />
			{#if emailQueue.length}
				<span
					class="text-primary-600 absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold"
				>
					{emailQueue.length}
				</span>
			{/if}
		</button>
	</div>
{/if}

<!-- ── Main panel ─────────────────────────────────────────────────────────── -->
<section
	class="border-surface-300-700 bg-surface-100-900/70 overflow-clip rounded-2xl border shadow-xl"
>
	<!-- ── Filter bar ──────────────────────────────────────────────────────── -->
	<div class="border-surface-300-700/50 border-b px-4 py-3">
		<!-- Status pills row (desktop) -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- Status pills: hidden on smallest screens, shown sm+ -->
			<div class="hidden flex-wrap gap-1.5 sm:flex">
				{#each statusPills as pill (pill.value)}
					<button
						type="button"
						class={`rounded-full px-3 py-1 text-xs font-medium transition-all ${pillClass(pill.value)}`}
						onclick={() => onStatusChange(pill.value)}
					>
						{pill.label}
					</button>
				{/each}
			</div>

			<!-- Status dropdown: mobile only -->
			<div class="flex sm:hidden">
				<select
					class="border-surface-400-600 bg-surface-50-950/60 rounded-lg border px-3 py-1.5 text-sm"
					value={selectedStatus}
					onchange={(e) => onStatusChange(e.currentTarget.value)}
				>
					{#each statusPills as pill (pill.value)}
						<option value={pill.value}>{pill.label}</option>
					{/each}
				</select>
			</div>

			<!-- Shift filter (only if multiple activities) -->
			{#if activityFilters.length > 1}
				<select
					class="border-surface-400-600 bg-surface-50-950/60 ml-1 rounded-lg border px-3 py-1.5 text-xs"
					value={selectedActivity}
					onchange={(e) => onActivityChange(e.currentTarget.value)}
				>
					<option value="all">All activities</option>
					{#each activityFilters as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{/if}

			{#if selectedActivity !== 'all' && shiftFilters.length > 0}
				<select
					class="border-surface-400-600 bg-surface-50-950/60 rounded-lg border px-3 py-1.5 text-xs"
					value={selectedShift}
					onchange={(e) => onShiftChange(e.currentTarget.value)}
				>
					<option value="all">All times</option>
					{#each shiftFilters as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			{/if}

			<!-- Search – pushes to right -->
			<div class="relative ml-auto flex items-center">
				<IconSearch class="text-surface-500 pointer-events-none absolute left-2.5 h-3.5 w-3.5" />
				<input
					type="search"
					class="border-surface-400-600 bg-surface-50-950/60 w-40 rounded-lg border py-1.5 pr-3 pl-8 text-sm transition-all focus:w-56"
					value={searchTerm}
					oninput={(e) => onSearch(e.currentTarget.value)}
					placeholder="Search…"
				/>
			</div>

			<!-- Add volunteer button -->
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all
					{addVolunteer
					? 'preset-tonal-tertiary'
					: 'bg-primary-500/10 text-primary-400 hover:bg-primary-500/20'}"
				onclick={() => (addVolunteer = !addVolunteer)}
			>
				<IconUserPlus class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">Add</span>
			</button>
		</div>
	</div>

	<!-- ── Add volunteer drawer ─────────────────────────────────────────────── -->
	{#if addVolunteer}
		<div class="border-surface-300-700/50 bg-surface-50-950/30 border-b px-4 py-4" transition:slide>
			<h3 class="text-surface-950-50 mb-3 !text-left text-sm font-semibold">Add a volunteer</h3>
			<form class="grid gap-3 md:grid-cols-2" onsubmit={submitAddVolunteer}>
				<div class="md:col-span-1">
					<label class="text-surface-800-200 mb-1 block text-xs font-medium" for="add-email">
						Email *
					</label>
					<input
						id="add-email"
						type="email"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						placeholder="volunteer@example.com"
						value={addForm.email}
						oninput={(e) => handleEmailInput(e.currentTarget.value)}
						onblur={() => lookupProfileByEmail(addForm.email)}
						required
					/>
					{#if emailSuggestions.length > 0 && addForm.email.trim() && (!selectedProfile || selectedProfile.email.toLowerCase() !== addForm.email
									.trim()
									.toLowerCase())}
						<div class="bg-surface-100-900/70 border-surface-300-700 mt-1 rounded-lg border p-1.5">
							{#each emailSuggestions as profile (profile.email)}
								<button
									type="button"
									class="hover:bg-primary-500/10 text-surface-900-100 flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs"
									onclick={() => applyProfileToForm(profile)}
								>
									<span class="font-medium">{profile.name || 'Unnamed'}</span>
									<span class="text-surface-500">{profile.email}</span>
								</button>
							{/each}
						</div>
					{/if}
					{#if profileLookupLoading}
						<p class="text-surface-500 mt-1 text-xs">Looking up profile…</p>
					{:else if profileLookupError}
						<p class="text-error-400 mt-1 text-xs">{profileLookupError}</p>
					{/if}
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-800-200 mb-1 block text-xs font-medium" for="add-name">
						Full name
					</label>
					<input
						id="add-name"
						type="text"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						placeholder="Alex Smith"
						value={addForm.name}
						oninput={(e) => (addForm = { ...addForm, name: e.currentTarget.value })}
					/>
				</div>

				<div class="md:col-span-1">
					<label
						class="text-surface-800-200 mb-1 block text-xs font-medium"
						for="add-shift-activity"
					>
						Activity
					</label>
					<select
						id="add-shift-activity"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						value={addForm.shiftActivityId}
						onchange={(e) =>
							(addForm = { ...addForm, shiftActivityId: e.currentTarget.value, shiftId: '' })}
					>
						{#if addActivityOptions.length === 0}
							<option value="">No activities available</option>
						{:else}
							{#if addActivityOptions.length > 1}
								<option value="" disabled>Select activity</option>
							{/if}
							{#each addActivityOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						{/if}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-800-200 mb-1 block text-xs font-medium" for="add-shift-time">
						Shift *
					</label>
					<select
						id="add-shift-time"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						value={addForm.shiftId}
						onchange={(e) => (addForm = { ...addForm, shiftId: e.currentTarget.value })}
						required
					>
						{#if !addForm.shiftActivityId}
							<option value="">Pick activity first</option>
						{:else if !shiftTimeOptions.length}
							<option value="">No shifts available</option>
						{:else if shiftTimeOptions.length > 1}
							<option value="" disabled>Select shift time</option>
						{/if}
						{#each shiftTimeOptions as shift (shift.id)}
							<option value={shift.id}>{shift.optionLabel}</option>
						{/each}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-800-200 mb-1 block text-xs font-medium" for="add-status">
						Initial status
					</label>
					<select
						id="add-status"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						value={addForm.status}
						onchange={(e) => (addForm = { ...addForm, status: e.currentTarget.value })}
					>
						{#each statusOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<div class="md:col-span-1">
					<label class="text-surface-800-200 mb-1 block text-xs font-medium" for="add-phone">
						Phone (optional)
					</label>
					<input
						id="add-phone"
						type="tel"
						class="border-surface-400-600 bg-surface-50-950/60 w-full rounded-lg border px-3 py-2 text-sm"
						placeholder="(555) 555-1234"
						value={addForm.phone}
						oninput={(e) => (addForm = { ...addForm, phone: e.currentTarget.value })}
					/>
				</div>

				{#if selectedProfile}
					<div
						class="bg-primary-500/5 border-primary-500/30 rounded-lg border px-3 py-2 text-xs md:col-span-2"
					>
						<span class="text-surface-100 font-semibold">Existing profile:</span>
						<span class="text-surface-400 ml-2">{selectedProfile.email}</span>
					</div>
				{:else if addForm.email.trim() && !profileLookupLoading && !profileLookupError}
					<div
						class="bg-surface-500/5 border-surface-500/20 text-surface-400 rounded-lg border px-3 py-2 text-xs md:col-span-2"
					>
						No existing profile found — a new account will be created.
					</div>
				{/if}

				{#if addError}
					<div
						class="bg-error-500/10 border-error-500/30 text-error-300 rounded-lg border px-3 py-2 text-xs md:col-span-2"
					>
						{addError}
					</div>
				{/if}
				{#if addSuccess}
					<div
						class="bg-success-500/10 border-success-500/30 text-success-300 rounded-lg border px-3 py-2 text-xs md:col-span-2"
					>
						{addSuccess}
					</div>
				{/if}

				<div class="flex justify-end md:col-span-2">
					<button
						type="submit"
						class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
						disabled={addLoading}
					>
						{addLoading ? 'Adding…' : 'Add to shift'}
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- ── Volunteer list ──────────────────────────────────────────────────── -->
	<div class="divide-surface-300-700/30 divide-y">
		{#if !groupedShiftBlocks.length}
			<div class="text-surface-500 px-4 py-10 text-center text-sm" transition:slide>
				No volunteers match the selected filters.
			</div>
		{:else}
			{#each groupedShiftBlocks as group (group.key)}
				<!-- Shift group header -->
				<div
					class="from-primary-500/5 to-secondary-500/5 border-surface-300-700/30 flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-r px-4 py-2.5"
				>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-surface-800-200 text-xs font-medium">{group.activityLabel}</span>
						<span class="text-surface-950-50 text-sm font-bold">{group.timeLabel}</span>
					</div>
					<div class="flex items-center gap-2 text-xs">
						{#if group.approvedCount > 0}
							<span class="bg-success-500/15 text-success-400 rounded-full px-2 py-0.5 font-medium">
								{group.approvedCount} approved
							</span>
						{/if}
						{#if group.waitlistedCount > 0}
							<span class="text-surface-400 bg-surface-500/15 rounded-full px-2 py-0.5 font-medium">
								{group.waitlistedCount} waitlisted
							</span>
						{/if}
					</div>
				</div>

				<!-- Volunteer rows -->
				{#each group.items as item (item.key)}
					<div
						class="border-surface-300-700/10 hover:bg-surface-50-950/5 border-b transition-colors last:border-0"
						transition:slide
					>
						<div
							class="grid cursor-pointer grid-cols-1 gap-x-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto_auto]"
							role="button"
							tabindex="0"
							onclick={() => toggleRow(item.key)}
							onkeydown={(e) => e.key === 'Enter' && toggleRow(item.key)}
						>
							<!-- Name + meta -->
							<div class="flex min-w-0 items-start gap-2">
								<!-- Avatar circle -->
								<div
									class={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${orbClass(item.assignment.status)}`}
								>
									{(item.volunteer.name || '?')[0].toUpperCase()}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-1.5">
										<span class="text-surface-950-50 font-semibold">{item.volunteer.name}</span>
										{#if item.hasMultipleShifts}
											<span class="chip preset-outlined-secondary-500 px-1.5 py-0.5 text-[10px]">
												Multi-shift
											</span>
										{/if}
										{#if item.confirmation}
											<span
												class="text-success-400 flex items-center gap-1 text-[10px]"
												title={item.confirmation.exact
													? `Confirmed ${item.confirmation.exact}`
													: 'Confirmed'}
											>
												<IconCheckCircle class="h-3 w-3" />
												Confirmed
											</span>
										{/if}
									</div>
									<!-- Shift info on mobile -->
									<div
										class="text-surface-600-400 flex flex-wrap items-center gap-2 text-xs md:hidden"
									>
										<span class="text-surface-500">{item.shiftDetails.optionLabel || ''}</span>
									</div>
								</div>
							</div>

							<!-- Status badge (desktop, pushed to right) -->
							<div class="hidden items-center md:flex">
								<span
									class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${statusBadgeClass(item.assignment.status)}`}
								>
									{statusLabel(item.assignment.status)}
								</span>
							</div>

							<!-- Signup time (desktop) -->
							<div class="text-surface-500 hidden items-center text-xs md:flex">
								{#if item.signup?.relative && item.signup.relative !== '—'}
									{item.signup.relative}
								{:else}
									—
								{/if}
							</div>

							<!-- Actions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="mt-2 flex items-center gap-1.5 md:mt-0"
								onclick={(e) => e.stopPropagation()}
							>
								<!-- Mobile: status badge inline -->
								<span
									class={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize md:hidden ${statusBadgeClass(item.assignment.status)}`}
								>
									{statusLabel(item.assignment.status)}
								</span>

								{#if item.assignment.id}
									<div class="flex items-center gap-1">
										{#if item.assignment.status !== 'approved' && item.assignment.status !== 'checked_in'}
											<button
												type="button"
												class="chip preset-tonal-success px-2 py-1 text-xs"
												onclick={() => onApprove(item.assignment.id)}
											>
												Approve
											</button>
										{/if}
										{#if item.assignment.status !== 'waitlisted' && item.assignment.status !== 'cancelled' && item.assignment.status !== 'checked_in' && item.assignment.status !== 'no_show'}
											<button
												type="button"
												class="chip preset-tonal-surface px-2 py-1 text-xs"
												onclick={() => onWaitlist(item.assignment.id)}
											>
												Waitlist
											</button>
										{/if}
										{#if item.assignment.status !== 'declined' && item.assignment.status !== 'no_show'}
											<button
												type="button"
												class="chip preset-tonal-error px-2 py-1 text-xs"
												onclick={() => onDecline(item.assignment.id)}
											>
												Decline
											</button>
										{/if}
									</div>
								{/if}
							</div>
						</div>
						<!-- Expanded Details -->
						{#if expandedRows.has(item.key)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="bg-surface-50-950/10 cursor-auto px-4 pt-1 pb-3 text-xs"
								transition:slide
								onclick={(e) => e.stopPropagation()}
							>
								<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
									<div class="flex flex-col gap-0.5">
										<span class="text-surface-500 font-medium tracking-wide uppercase">Email</span>
										<a
											href="mailto:{item.volunteer.email}"
											class="text-surface-100 hover:text-primary-400 truncate transition-colors"
											>{item.volunteer.email || '—'}</a
										>
									</div>
									<div class="flex flex-col gap-0.5">
										<span class="text-surface-500 font-medium tracking-wide uppercase">Phone</span>
										{#if item.volunteer.phone}
											<a
												href="tel:{item.volunteer.phone}"
												class="text-surface-100 hover:text-primary-400 transition-colors"
												>{item.volunteer.phone}</a
											>
										{:else}
											<span class="text-surface-400">—</span>
										{/if}
									</div>
									{#if item.volunteer.emergencyContactName || item.volunteer.emergencyContactPhone}
										<div class="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-2">
											<span class="text-surface-500 font-medium tracking-wide uppercase"
												>Emergency Contact</span
											>
											<span class="text-surface-100"
												>{item.volunteer.emergencyContactName || '—'}</span
											>
											{#if item.volunteer.emergencyContactPhone}
												<a
													href="tel:{item.volunteer.emergencyContactPhone}"
													class="text-surface-400 hover:text-primary-400 transition-colors"
													>{item.volunteer.emergencyContactPhone}</a
												>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			{/each}
		{/if}
	</div>
</section>

<!-- Close dropdowns on outside click -->
<svelte:window onclick={closeMenus} />
