<script lang="ts">
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconX from '@lucide/svelte/icons/x';
	import IconUserPlus from '@lucide/svelte/icons/user-plus';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconSend from '@lucide/svelte/icons/send';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';
	import ManageActionButton from './ManageActionButton.svelte';
	import ManageActionGrid from './ManageActionGrid.svelte';
	import ManageContactRow from './ManageContactRow.svelte';
	import ManageFilterToolbar, {
		type ToolbarFilterOption,
		type ToolbarPillOption,
		type ToolbarSelectFilter
	} from './ManageFilterToolbar.svelte';
	import ManageShiftHeader, { type ShiftHeaderBadge } from './ManageShiftHeader.svelte';

	type FilterOption = {
		value: string | number;
		label?: string;
	};

	type ShiftOptionRecord = {
		id: string;
		groupId?: string | number | null;
		opportunityId?: string | number | null;
		opportunityTitle?: string;
		optionLabel?: string;
		windowLabel?: string;
		startsAt?: string | null;
		timezone?: string | null;
		time_zone?: string | null;
	};

	type SignupAssignmentRecord = {
		id: string | null;
		shiftId?: string | null;
		status: string;
		attended?: boolean;
		confirmedAt?: string | Date | null;
	};

	type VolunteerRecord = {
		id?: string;
		name: string;
		email?: string;
		phone?: string;
		status: string;
		attended?: boolean;
		shiftIds?: string[];
		emergencyContactName?: string;
		emergencyContactPhone?: string;
		signup?: {
			created_at?: string | Date | null;
		} | null;
		assignments?: SignupAssignmentRecord[];
	};

	type ProfileRowInput = {
		id?: string | number | null;
		user_id?: string | number | null;
		email?: string | null;
		full_name?: string | null;
		phone?: string | null;
		emergency_contact_name?: string | null;
		emergency_contact_phone?: string | null;
	};

	type NormalizedProfile = {
		id: string | null;
		userId: string | null;
		email: string;
		name: string;
		phone: string;
		emergencyContactName: string;
		emergencyContactPhone: string;
	};

	type AddVolunteerPayload = {
		email: string;
		name: string;
		phone: string;
		emergencyContactName: string;
		emergencyContactPhone: string;
		shiftId: string;
		status: string;
		profileId: string | null;
		userId: string | null;
	};

	type EmailQueueItem = {
		id: string;
		volunteerName: string;
		volunteerEmail: string;
		status: string;
		shiftLabel?: string;
	};

	type Props = {
		volunteers?: VolunteerRecord[];
		statusFilters?: FilterOption[];
		activityFilters?: FilterOption[];
		shiftFilters?: FilterOption[];
		shifts?: ShiftOptionRecord[];
		profiles?: ProfileRowInput[];
		eventId?: string | number | null;
		selectedStatus?: string;
		selectedActivity?: string;
		selectedShift?: string;
		searchTerm?: string;
		onStatusChange?: (value: string) => void;
		onActivityChange?: (value: string) => void;
		onShiftChange?: (value: string) => void;
		onSearch?: (value: string) => void;
		onApprove?: (assignmentId: string) => void;
		onDecline?: (assignmentId: string) => void;
		onWaitlist?: (assignmentId: string) => void;
		onMoveShift?: (volunteerId: string, shiftId: string | null) => void;
		onPresent?: (assignmentId: string, status: string | boolean) => void;
		onAddVolunteer?: (payload: AddVolunteerPayload) => Promise<{
			ok?: boolean;
			error?: string;
			message?: string;
		}>;
		emailQueue?: EmailQueueItem[];
		emailQueueSending?: boolean;
		emailQueueError?: string;
		onSendQueuedEmail?: (queueId: string) => void;
		onRemoveQueuedEmail?: (queueId: string) => void;
		onSendAllQueuedEmails?: () => void;
		onClearEmailQueue?: () => void;
	};

	const {
		volunteers = [],
		statusFilters: _statusFilters = [],
		activityFilters = [],
		shiftFilters = [],
		shifts = [],
		profiles: _profiles = [],
		eventId = null,
		selectedStatus = 'all',
		selectedActivity = 'all',
		selectedShift = 'all',
		searchTerm = '',
		onStatusChange = () => {},
		onActivityChange = () => {},
		onShiftChange = () => {},
		onSearch = () => {},
		onApprove = () => {},
		onDecline = () => {},
		onWaitlist = () => {},
		onMoveShift: _onMoveShift = () => {},
		onPresent: _onPresent = () => {},
		onAddVolunteer = async () => ({ ok: false, error: 'Not implemented' }),
		emailQueue = [],
		emailQueueSending = false,
		emailQueueError = '',
		onSendQueuedEmail = () => {},
		onRemoveQueuedEmail = () => {},
		onSendAllQueuedEmails = () => {},
		onClearEmailQueue = () => {}
	}: Props = $props();

	const uid = $props.id();
	const sectionHeadingId = `${uid}-heading`;
	const queueHeadingId = `${uid}-queue-heading`;

	const shiftMap = $derived(new SvelteMap(shifts.map((shift) => [String(shift.id), shift])));

	const statusOptions = [
		{ value: 'approved', label: 'Approved' },
		{ value: 'pending', label: 'Pending review' },
		{ value: 'waitlisted', label: 'Waitlisted' }
	];

	const statusPills: ToolbarPillOption[] = [
		{ value: 'all', label: 'All', tone: 'primary' },
		{ value: 'approved', label: 'Approved', tone: 'success' },
		{ value: 'pending', label: 'Pending', tone: 'warning' },
		{ value: 'waitlisted', label: 'Waitlisted', tone: 'surface' },
		{ value: 'declined', label: 'Declined', tone: 'error' },
		{ value: 'cancelled', label: 'Cancelled', tone: 'error' }
	];

	// ── Add volunteer form ────────────────────────────────────────────────────
	let selectedProfile = $state<NormalizedProfile | null>(null);
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
	let profileLookupTimeout: ReturnType<typeof setTimeout> | null = null;
	let profileLookupRequestId = 0;
	let emailSuggestions = $state<NormalizedProfile[]>([]);
	let suggestionTimeout: ReturnType<typeof setTimeout> | null = null;

	// ── Email queue bottom sheet dialog ───────────────────────────────────────
	let queueDialog = $state<HTMLDialogElement | undefined>(undefined);

	function openQueueSheet() {
		if (queueDialog && !queueDialog.open) {
			queueDialog.showModal();
		}
	}

	function closeQueueSheet() {
		if (queueDialog?.open) {
			queueDialog.close();
		}
	}

	$effect(() => {
		if (!emailQueue.length && !emailQueueError && queueDialog?.open) {
			queueDialog.close();
		}
	});

	const expandedRows = new SvelteSet<string>();

	function toggleRow(key: string) {
		if (expandedRows.has(key)) {
			expandedRows.delete(key);
		} else {
			expandedRows.add(key);
		}
	}

	const toolbarFilters = $derived.by<ToolbarSelectFilter[]>(() => {
		const list: ToolbarSelectFilter[] = [];

		if (activityFilters.length > 1) {
			const activityOpts: ToolbarFilterOption[] = [
				{ value: 'all', label: 'All activities' },
				...activityFilters.map((opt) => ({
					value: String(opt.value),
					label: String(opt.label ?? 'Activity')
				}))
			];
			list.push({
				id: 'activity',
				label: 'Activity',
				value: String(selectedActivity),
				options: activityOpts,
				onChange: onActivityChange
			});
		}

		if (selectedActivity !== 'all' && shiftFilters.length > 0) {
			const shiftOpts: ToolbarFilterOption[] = [
				{ value: 'all', label: 'All times' },
				...shiftFilters.map((opt) => ({
					value: String(opt.value),
					label: String(opt.label ?? 'Shift')
				}))
			];
			list.push({
				id: 'shift-time',
				label: 'Shift Time',
				value: String(selectedShift),
				options: shiftOpts,
				onChange: onShiftChange
			});
		}

		return list;
	});

	const activityLabelMap = $derived.by(() => {
		const map = new SvelteMap<string, string>();
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
		const map = new SvelteMap<string, ShiftOptionRecord[]>();
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
		const options: { value: string; label: string; shifts: ShiftOptionRecord[] }[] = [];
		const usedIds = new Set<string>();

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
			const onlyShiftId =
				onlyOption.shifts.length === 1 ? String(onlyOption.shifts[0]?.id ?? '') : '';
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

		const hasValidShift = activeOption.shifts.some((shift) => String(shift.id) === addForm.shiftId);
		if (!hasValidShift) {
			const defaultShiftId =
				activeOption.shifts.length === 1 ? String(activeOption.shifts[0]?.id ?? '') : '';
			if (addForm.shiftId !== defaultShiftId) {
				addForm = { ...addForm, shiftId: defaultShiftId };
			}
		}
	});

	async function fetchEmailSuggestions(term: string) {
		if (term.length < 2) {
			emailSuggestions = [];
			return;
		}
		try {
			const url = `/api/v1/volunteer-event-hosts?event_id=${encodeURIComponent(String(eventId || ''))}&lookup_email=${encodeURIComponent(term)}`;
			const response = await fetch(url);
			if (!response.ok) {
				emailSuggestions = [];
				return;
			}
			const result = await response.json();
			emailSuggestions = (result.data || [])
				.map(normalizeProfileRow)
				.filter((item: NormalizedProfile | null): item is NormalizedProfile => Boolean(item));
		} catch {
			emailSuggestions = [];
		}
	}

	function normalizeProfileRow(row: ProfileRowInput | null | undefined): NormalizedProfile | null {
		if (!row) return null;
		const email = String(row.email ?? '').trim();
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

	async function lookupProfileByEmail(email: string) {
		const normalizedEmail = email.trim().toLowerCase();
		if (!normalizedEmail) return;
		const currentEmail = addForm.email.trim().toLowerCase();
		if (currentEmail !== normalizedEmail) return;
		profileLookupLoading = true;
		profileLookupError = '';
		const requestId = ++profileLookupRequestId;
		try {
			const url = `/api/v1/volunteer-event-hosts?event_id=${encodeURIComponent(String(eventId || ''))}&lookup_email=${encodeURIComponent(normalizedEmail)}`;
			const response = await fetch(url);
			if (requestId !== profileLookupRequestId) return;
			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(errorData?.error || response.statusText || 'Failed to fetch profile');
			}
			const result = await response.json();
			const profile = normalizeProfileRow(
				Array.isArray(result.data) ? result.data[0] : result.data
			);
			if (profile) {
				applyProfileToForm(profile);
			} else {
				selectedProfile = null;
			}
		} catch (error: unknown) {
			if (requestId === profileLookupRequestId) {
				profileLookupError =
					error instanceof Error ? error.message : 'Unable to look up volunteer profile.';
			}
		} finally {
			if (requestId === profileLookupRequestId) {
				profileLookupLoading = false;
			}
		}
	}

	function applyProfileToForm(profile: NormalizedProfile) {
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

	function handleEmailInput(value: string) {
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

	async function submitAddVolunteer(event?: SubmitEvent) {
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
		} catch (error: unknown) {
			addError =
				error instanceof Error ? error.message : 'Unable to add volunteer. Please try again.';
		} finally {
			addLoading = false;
		}
	}

	function formatRelativeTime(date: Date | null): string {
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

	function parseDateValue(value: unknown): Date | null {
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(String(value));
		if (Number.isNaN(date.getTime())) return null;
		return date;
	}

	function formatExactDate(date: Date | null, timezone: string | null): string {
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

	function buildConfirmationDisplay(confirmedAt: unknown, timezone: string | null) {
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

	function buildSignupInfo(createdAt: unknown) {
		if (!createdAt) return { createdAt: null, timestamp: 0, relative: '—' };
		const parsed = new Date(String(createdAt));
		if (Number.isNaN(parsed.getTime())) return { createdAt, timestamp: 0, relative: '—' };
		return { createdAt, timestamp: parsed.getTime(), relative: formatRelativeTime(parsed) };
	}

	type FlattenedSignupItem = {
		key: string;
		volunteer: VolunteerRecord;
		assignment: SignupAssignmentRecord;
		shiftDetails: Partial<ShiftOptionRecord>;
		hasMultipleShifts: boolean;
		signup: {
			createdAt: unknown;
			timestamp: number;
			relative: string;
		};
		confirmation: {
			date: Date;
			timestamp: number;
			relative: string;
			exact: string;
		} | null;
	};

	const individualShifts = $derived.by<FlattenedSignupItem[]>(() => {
		const flattened: FlattenedSignupItem[] = [];
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
					const shiftDetails: Partial<ShiftOptionRecord> =
						shiftMap.get(String(assignment.shiftId ?? '')) ?? {};
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

	type ShiftGroupBlock = {
		key: string;
		activityLabel: string;
		timeLabel: string;
		approvedCount: number;
		waitlistedCount: number;
		items: FlattenedSignupItem[];
	};

	const groupedShiftBlocks = $derived.by<ShiftGroupBlock[]>(() => {
		const groups: ShiftGroupBlock[] = [];
		let currentGroup: ShiftGroupBlock | null = null;

		const ensureLabel = (value: unknown, fallback: string) => {
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

	function buildGroupHeaderBadges(group: ShiftGroupBlock): ShiftHeaderBadge[] {
		const badges: ShiftHeaderBadge[] = [];
		if (group.approvedCount > 0) {
			badges.push({
				label: `${group.approvedCount} approved`,
				tone: 'success'
			});
		}
		if (group.waitlistedCount > 0) {
			badges.push({
				label: `${group.waitlistedCount} waitlisted`,
				tone: 'surface'
			});
		}
		return badges;
	}

	function statusBadgeClass(status: string): string {
		switch (status) {
			case 'approved':
			case 'checked_in':
				return 'border-success-500 bg-surface-950 text-success-300';
			case 'pending':
				return 'border-warning-500 bg-surface-950 text-warning-300';
			case 'waitlisted':
				return 'border-surface-400 bg-surface-950 text-surface-200';
			case 'declined':
			case 'cancelled':
			case 'no_show':
				return 'border-error-400 bg-surface-950 text-error-200';
			default:
				return 'border-surface-400 bg-surface-950 text-surface-200';
		}
	}

	function initialTileClass(status: string): string {
		switch (status) {
			case 'approved':
			case 'checked_in':
				return 'bg-success-500 text-surface-950';
			case 'pending':
				return 'bg-warning-500 text-surface-950';
			case 'waitlisted':
				return 'bg-surface-300 text-surface-950';
			case 'declined':
			case 'cancelled':
			case 'no_show':
				return 'bg-error-500 text-surface-950';
			default:
				return 'bg-primary-500 text-surface-950';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'checked_in':
				return 'Checked In';
			case 'no_show':
				return 'No Show';
			default:
				return (status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		}
	}

	function formatQueueStatus(s: string): string {
		return (s || '').replace(/_/g, ' ');
	}
</script>

<!-- ── Email queue trigger bar ─────────────────────────────────────────────── -->
{#if emailQueue.length > 0 || emailQueueError}
	<div class="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6">
		<ManageActionButton
			label={emailQueue.length > 0 ? `Queued Emails (${emailQueue.length})` : 'Email Queue Error'}
			ariaLabel={emailQueue.length > 0
				? `Queued Emails (${emailQueue.length}): open review sheet`
				: 'Email Queue Error: open review sheet'}
			icon={IconSend}
			tone={emailQueueError ? 'error' : 'secondary'}
			variant="filled"
			fullWidth={true}
			class="min-h-12 px-4 sm:w-auto"
			onclick={openQueueSheet}
		/>
	</div>
{/if}

<!-- ── Email queue mobile bottom sheet (<dialog>) ─────────────────────────── -->
<dialog
	bind:this={queueDialog}
	aria-labelledby={queueHeadingId}
	onclick={(e) => {
		if (e.target === e.currentTarget) closeQueueSheet();
	}}
	class="border-primary-500 bg-surface-950 text-surface-50 backdrop:bg-surface-950/80 sm:border-surface-700 sm:border-t-primary-500 fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none flex-col rounded-none border-t-4 p-0 open:flex sm:inset-0 sm:m-auto sm:w-[min(34rem,calc(100%-2rem))] sm:border-2 sm:border-t-4"
>
	<div class="border-surface-800 flex items-start justify-between gap-3 border-b-2 px-4 py-3">
		<div class="min-w-0 flex-1">
			<h2
				id={queueHeadingId}
				class="text-surface-50! m-0 text-left! text-base font-black uppercase"
			>
				Queued Emails ({emailQueue.length})
			</h2>
			<p class="text-surface-300 m-0 mt-0.5 text-xs">
				Review volunteer shift status emails before sending.
			</p>
		</div>
		<ManageActionButton
			label="Close"
			ariaLabel="Close queued emails sheet"
			icon={IconX}
			tone="surface"
			variant="outlined"
			onclick={closeQueueSheet}
		/>
	</div>

	{#if emailQueueError}
		<div
			role="alert"
			class="bg-error-500 text-surface-950 border-surface-800 border-b-2 px-4 py-3 text-xs font-black"
		>
			{emailQueueError}
		</div>
	{/if}

	{#if emailQueue.length > 0}
		<div class="border-surface-800 bg-surface-900 border-b-2 px-4 py-3">
			<ManageActionGrid columns={2} ariaLabel="Bulk queued email actions">
				<ManageActionButton
					label={emailQueueSending ? 'Sending…' : `Send All (${emailQueue.length})`}
					ariaLabel={emailQueueSending
						? 'Sending all queued emails'
						: `Send All (${emailQueue.length}) queued emails`}
					icon={IconSend}
					tone="primary"
					variant="filled"
					disabled={!emailQueue.length || emailQueueSending}
					fullWidth={true}
					onclick={() => onSendAllQueuedEmails()}
				/>
				<ManageActionButton
					label="Clear All"
					ariaLabel="Clear All queued emails"
					icon={IconTrash2}
					tone="error"
					variant="outlined"
					disabled={!emailQueue.length || emailQueueSending}
					fullWidth={true}
					onclick={() => onClearEmailQueue()}
				/>
			</ManageActionGrid>
		</div>

		<ul class="divide-surface-800 m-0 list-none divide-y overflow-y-auto p-0">
			{#each emailQueue as queueItem (queueItem.id)}
				<li class="flex min-w-0 flex-col gap-3 px-4 py-3">
					<div class="min-w-0">
						<div class="text-surface-50 truncate text-sm font-black">
							{queueItem.volunteerName}
						</div>
						<div class="text-surface-300 truncate text-xs font-medium">
							{queueItem.volunteerEmail}
						</div>
						<div class="text-primary-500 mt-1 text-xs font-bold tracking-wide uppercase">
							{formatQueueStatus(queueItem.status)}
							{#if queueItem.shiftLabel}
								· {queueItem.shiftLabel}
							{/if}
						</div>
					</div>
					<ManageActionGrid columns={2} ariaLabel={`Email actions for ${queueItem.volunteerName}`}>
						<ManageActionButton
							label="Send"
							ariaLabel={`Send queued email to ${queueItem.volunteerName}`}
							icon={IconSend}
							tone="primary"
							variant="filled"
							disabled={emailQueueSending}
							fullWidth={true}
							onclick={() => onSendQueuedEmail(queueItem.id)}
						/>
						<ManageActionButton
							label="Remove"
							ariaLabel={`Remove queued email for ${queueItem.volunteerName}`}
							icon={IconX}
							tone="error"
							variant="outlined"
							disabled={emailQueueSending}
							fullWidth={true}
							onclick={() => onRemoveQueuedEmail(queueItem.id)}
						/>
					</ManageActionGrid>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-surface-300 m-0 px-4 py-6 text-center text-sm">No queued emails remaining.</p>
	{/if}
</dialog>

<!-- ── Main panel ─────────────────────────────────────────────────────────── -->
<section
	aria-labelledby={sectionHeadingId}
	class="border-tertiary-500 bg-surface-900 text-surface-50 flex w-full min-w-0 flex-col border-t-4"
>
	<h2 id={sectionHeadingId} class="sr-only">Volunteer Signups</h2>

	<!-- ── Shared Filter Toolbar ───────────────────────────────────────────── -->
	<ManageFilterToolbar
		pills={statusPills}
		selectedPill={selectedStatus}
		pillGroupLabel="Filter volunteer signups by status"
		onPillChange={onStatusChange}
		filters={toolbarFilters}
		searchValue={searchTerm}
		searchLabel="Search Signups"
		searchPlaceholder="Search name, email, phone…"
		{onSearch}
	>
		{#snippet actions()}
			<ManageActionButton
				label={addVolunteer ? 'Close Add' : 'Add Volunteer'}
				ariaLabel={addVolunteer
					? 'Close Add: hide manual volunteer signup form'
					: 'Add Volunteer: open manual volunteer signup form'}
				icon={IconUserPlus}
				tone={addVolunteer ? 'tertiary' : 'primary'}
				variant="filled"
				selected={addVolunteer}
				fullWidth={true}
				class="sm:w-auto"
				onclick={() => (addVolunteer = !addVolunteer)}
			/>
		{/snippet}
	</ManageFilterToolbar>

	<!-- ── Add volunteer drawer ─────────────────────────────────────────────── -->
	{#if addVolunteer}
		<div class="border-surface-800 bg-surface-950 border-b-2 px-4 py-4" transition:slide>
			<h3 class="text-surface-50! m-0 mb-3 text-left! text-sm font-black uppercase">
				Add a volunteer
			</h3>
			<form class="grid min-w-0 gap-3 md:grid-cols-2" onsubmit={submitAddVolunteer}>
				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-email"
					>
						Email *
					</label>
					<input
						id="add-email"
						type="email"
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 min-h-11 w-full min-w-0 rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
						placeholder="volunteer@example.com"
						value={addForm.email}
						oninput={(e) => handleEmailInput(e.currentTarget.value)}
						onblur={() => lookupProfileByEmail(addForm.email)}
						required
					/>
					{#if emailSuggestions.length > 0 && addForm.email.trim() && (!selectedProfile || selectedProfile.email.toLowerCase() !== addForm.email
									.trim()
									.toLowerCase())}
						<div class="bg-surface-900 border-surface-700 mt-1 flex flex-col gap-1 border-2 p-1.5">
							{#each emailSuggestions as profile (profile.email)}
								<button
									type="button"
									class="hover:bg-primary-500 hover:text-surface-950 text-surface-50 flex min-h-11 w-full items-center justify-between gap-2 rounded-none px-3 py-2 text-left text-xs font-bold transition-colors"
									onclick={() => applyProfileToForm(profile)}
								>
									<span class="truncate">{profile.name || 'Unnamed'}</span>
									<span class="truncate opacity-80">{profile.email}</span>
								</button>
							{/each}
						</div>
					{/if}
					{#if profileLookupLoading}
						<p class="text-surface-300 m-0 mt-1 text-xs">Looking up profile…</p>
					{:else if profileLookupError}
						<p class="text-error-200 m-0 mt-1 text-xs">{profileLookupError}</p>
					{/if}
				</div>

				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-name"
					>
						Full name
					</label>
					<input
						id="add-name"
						type="text"
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 min-h-11 w-full min-w-0 rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
						placeholder="Alex Smith"
						value={addForm.name}
						oninput={(e) => (addForm = { ...addForm, name: e.currentTarget.value })}
					/>
				</div>

				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-shift-activity"
					>
						Activity
					</label>
					<select
						id="add-shift-activity"
						class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 min-h-11 w-full max-w-full min-w-0 truncate rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
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

				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-shift-time"
					>
						Shift *
					</label>
					<select
						id="add-shift-time"
						class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 min-h-11 w-full max-w-full min-w-0 truncate rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
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

				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-status"
					>
						Initial status
					</label>
					<select
						id="add-status"
						class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 min-h-11 w-full max-w-full min-w-0 truncate rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
						value={addForm.status}
						onchange={(e) => (addForm = { ...addForm, status: e.currentTarget.value })}
					>
						{#each statusOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<div class="min-w-0 md:col-span-1">
					<label
						class="text-surface-300 mb-1 block text-xs font-bold tracking-[0.18em] uppercase"
						for="add-phone"
					>
						Phone (optional)
					</label>
					<input
						id="add-phone"
						type="tel"
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 min-h-11 w-full min-w-0 rounded-none border-2 px-3 py-2 text-sm focus:outline-none"
						placeholder="(555) 555-1234"
						value={addForm.phone}
						oninput={(e) => (addForm = { ...addForm, phone: e.currentTarget.value })}
					/>
				</div>

				{#if selectedProfile}
					<div
						class="bg-primary-500 text-surface-950 border-primary-500 border-2 px-3 py-2 text-xs font-bold md:col-span-2"
					>
						<span>Existing profile:</span>
						<span class="ml-2">{selectedProfile.email}</span>
					</div>
				{:else if addForm.email.trim() && !profileLookupLoading && !profileLookupError}
					<div
						class="bg-surface-900 border-surface-500 text-surface-200 border-2 px-3 py-2 text-xs md:col-span-2"
					>
						No existing profile found — a new signup contact will be recorded.
					</div>
				{/if}

				{#if addError}
					<div
						role="alert"
						class="bg-error-500 border-error-500 text-surface-950 border-2 px-3 py-2 text-xs font-black md:col-span-2"
					>
						{addError}
					</div>
				{/if}
				{#if addSuccess}
					<div
						role="status"
						class="bg-success-500 border-success-500 text-surface-950 border-2 px-3 py-2 text-xs font-black md:col-span-2"
					>
						{addSuccess}
					</div>
				{/if}

				<div class="flex justify-end md:col-span-2">
					<ManageActionButton
						type="submit"
						label={addLoading ? 'Adding…' : 'Add to shift'}
						tone="primary"
						variant="filled"
						disabled={addLoading}
						fullWidth={true}
						class="sm:w-auto sm:px-5"
					/>
				</div>
			</form>
		</div>
	{/if}

	<!-- ── Volunteer list ──────────────────────────────────────────────────── -->
	<div class="flex w-full min-w-0 flex-col">
		{#if !groupedShiftBlocks.length}
			<div class="text-surface-300 px-4 py-10 text-center text-sm" transition:slide>
				No volunteers match the selected filters.
			</div>
		{:else}
			{#each groupedShiftBlocks as group (group.key)}
				<ManageShiftHeader
					headingLevel="h3"
					eyebrow={group.activityLabel}
					title={group.timeLabel}
					badges={buildGroupHeaderBadges(group)}
					class="border-t-primary-500 border-t-2"
				/>

				<!-- Volunteer rows -->
				{#each group.items as item (item.key)}
					{@const isExpanded = expandedRows.has(item.key)}
					{@const canApprove =
						item.assignment.status !== 'approved' && item.assignment.status !== 'checked_in'}
					{@const canWaitlist =
						item.assignment.status !== 'waitlisted' &&
						item.assignment.status !== 'cancelled' &&
						item.assignment.status !== 'checked_in' &&
						item.assignment.status !== 'no_show'}
					{@const canDecline =
						item.assignment.status !== 'declined' && item.assignment.status !== 'no_show'}
					{@const hasActions =
						Boolean(item.assignment.id) && (canApprove || canWaitlist || canDecline)}
					<div
						class="border-surface-800 bg-surface-900 flex w-full min-w-0 flex-col border-b last:border-b-0"
						transition:slide
					>
						<div
							class="flex w-full min-w-0 flex-col gap-3 px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between"
						>
							<!-- Accessible row details disclosure button (no nested buttons) -->
							<button
								type="button"
								aria-expanded={isExpanded}
								aria-label={`${item.volunteer.name} (${statusLabel(item.assignment.status)}) — ${isExpanded ? 'hide' : 'show'} contact details`}
								onclick={() => toggleRow(item.key)}
								class="hover:bg-surface-800 focus-visible:outline-primary-500 flex min-h-11 w-full min-w-0 flex-1 items-center justify-between gap-3 px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
							>
								<span class="flex min-w-0 flex-1 items-start gap-2.5">
									<span
										aria-hidden="true"
										class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-xs font-black ${initialTileClass(item.assignment.status)}`}
									>
										{(item.volunteer.name || '?')[0].toUpperCase()}
									</span>
									<span class="min-w-0 flex-1">
										<span class="flex flex-wrap items-center gap-1.5">
											<span class="text-surface-50 text-sm font-black break-words">
												{item.volunteer.name}
											</span>
											{#if item.hasMultipleShifts}
												<span
													class="border-secondary-300 bg-surface-950 text-surface-50 border px-1.5 py-0.5 text-[10px] font-black tracking-wide uppercase"
												>
													Multi-shift
												</span>
											{/if}
											{#if item.confirmation}
												<span
													class="text-success-300 inline-flex items-center gap-1 text-[10px] font-bold uppercase"
													title={item.confirmation.exact
														? `Confirmed ${item.confirmation.exact}`
														: 'Confirmed'}
												>
													<IconCheckCircle class="h-3 w-3" aria-hidden="true" />
													Confirmed
												</span>
											{/if}
										</span>
										<span class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											<span
												class={`inline-flex border px-2 py-0.5 text-[11px] font-black tracking-wide uppercase ${statusBadgeClass(item.assignment.status)}`}
											>
												{statusLabel(item.assignment.status)}
											</span>
											{#if item.shiftDetails.optionLabel}
												<span class="text-surface-300 md:hidden">
													{item.shiftDetails.optionLabel}
												</span>
											{/if}
											{#if item.signup?.relative && item.signup.relative !== '—'}
												<span class="text-surface-300">{item.signup.relative}</span>
											{/if}
										</span>
									</span>
								</span>
								<IconChevronDown
									class={`text-surface-300 h-4 w-4 shrink-0 transition-transform ${
										isExpanded ? 'rotate-180' : ''
									}`}
									aria-hidden="true"
								/>
							</button>

							<!-- 3-Column Mobile Action Grid -->
							{#if hasActions}
								<ManageActionGrid
									columns={3}
									ariaLabel={`Signup actions for ${item.volunteer.name}`}
								>
									{#if canApprove}
										<ManageActionButton
											label="Approve"
											ariaLabel={`Approve ${item.volunteer.name}`}
											tone="success"
											variant="filled"
											fullWidth={true}
											class="md:w-auto"
											onclick={() => onApprove(String(item.assignment.id))}
										/>
									{/if}
									{#if canWaitlist}
										<ManageActionButton
											label="Waitlist"
											ariaLabel={`Waitlist ${item.volunteer.name}`}
											tone="surface"
											variant="outlined"
											fullWidth={true}
											class="md:w-auto"
											onclick={() => onWaitlist(String(item.assignment.id))}
										/>
									{/if}
									{#if canDecline}
										<ManageActionButton
											label="Decline"
											ariaLabel={`Decline ${item.volunteer.name}`}
											tone="error"
											variant="outlined"
											fullWidth={true}
											class="md:w-auto"
											onclick={() => onDecline(String(item.assignment.id))}
										/>
									{/if}
								</ManageActionGrid>
							{/if}
						</div>

						<!-- Expanded Contact & Emergency Details -->
						{#if isExpanded}
							<div
								class="border-surface-800 bg-surface-950 border-t px-3 py-3 sm:px-4"
								transition:slide
							>
								{#if item.volunteer.email || item.volunteer.phone || item.volunteer.emergencyContactName || item.volunteer.emergencyContactPhone}
									<ManageContactRow
										name={item.volunteer.name}
										email={item.volunteer.email}
										phone={item.volunteer.phone}
										emergencyContactName={item.volunteer.emergencyContactName}
										emergencyContactPhone={item.volunteer.emergencyContactPhone}
										collapsibleEmergency={false}
									/>
								{:else}
									<p class="text-surface-300 m-0 text-xs">No contact details provided.</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			{/each}
		{/if}
	</div>
</section>
