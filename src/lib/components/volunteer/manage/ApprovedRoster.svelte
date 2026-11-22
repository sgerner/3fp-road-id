<script lang="ts">
	import IconUsers from '@lucide/svelte/icons/users';
	import IconDownload from '@lucide/svelte/icons/download';
	import IconPrinter from '@lucide/svelte/icons/printer';
	import IconBrush from '@lucide/svelte/icons/brush-cleaning';
	import IconCheckCircle from '@lucide/svelte/icons/circle-check-big';
	import { SvelteMap } from 'svelte/reactivity';
	import ManageActionButton from './ManageActionButton.svelte';
	import ManageActionGrid from './ManageActionGrid.svelte';
	import ManageContactRow from './ManageContactRow.svelte';
	import ManageFilterToolbar, { type ToolbarSelectFilter } from './ManageFilterToolbar.svelte';
	import ManageShiftHeader, { type ShiftHeaderBadge } from './ManageShiftHeader.svelte';

	type RosterAssignment = {
		id: string | null;
		shiftId?: string | null;
		status?: string;
		attended?: boolean;
	};

	type RosterVolunteer = {
		id?: string;
		name: string;
		email?: string;
		phone?: string;
		emergencyContactName?: string;
		emergencyContactPhone?: string;
		assignments: RosterAssignment[];
	};

	type RosterVolunteerEntry = RosterVolunteer & {
		assignmentId: string | null;
		attended?: boolean;
		status: string;
	};

	type ShiftRecord = {
		id: string;
		opportunityTitle?: string;
		optionLabel?: string;
		windowLabel?: string;
		startsAt?: string | null;
	};

	type ShiftRosterGroup = {
		shift: ShiftRecord;
		volunteers: RosterVolunteerEntry[];
	};

	type RosterEventRecord = {
		title?: string | null;
	};

	type Props = {
		volunteers?: RosterVolunteer[];
		event?: RosterEventRecord;
		shiftMap?: SvelteMap<string, ShiftRecord> | Map<string, ShiftRecord>;
		shifts?: ShiftRecord[];
		selectedShift?: string;
		searchTerm?: string;
		checkInMode?: boolean;
		onShiftChange?: ((shiftId: string) => void) | undefined;
		onSearch?: ((value: string) => void) | undefined;
		onCheckInModeChange?: ((enabled: boolean) => void) | undefined;
		onStatusChange?: (assignmentId: string | null, status: string) => void;
		onBulkStatusChange?: (assignmentIds: string[], status: string) => void;
	};

	let {
		volunteers = [],
		event = {},
		shiftMap = new SvelteMap(),
		shifts = [],
		selectedShift = $bindable('all'),
		searchTerm = $bindable(''),
		checkInMode = $bindable(false),
		onShiftChange = undefined,
		onSearch = undefined,
		onCheckInModeChange = undefined,
		onStatusChange = () => {},
		onBulkStatusChange = () => {}
	}: Props = $props();

	const rosterHeadingId = $props.id();

	const allShiftsWithVolunteers = $derived.by<ShiftRosterGroup[]>(() => {
		const map = new SvelteMap<string, ShiftRosterGroup>();
		for (const volunteer of volunteers) {
			for (const assignment of volunteer.assignments ?? []) {
				if (!['approved', 'checked_in', 'no_show'].includes(assignment.status ?? '')) continue;

				const shiftId = assignment.shiftId;
				if (!shiftId) continue;

				if (!map.has(shiftId)) {
					const knownShift =
						shiftMap.get(shiftId) ?? shifts.find((s) => String(s.id) === String(shiftId));
					map.set(shiftId, {
						shift: knownShift ?? {
							id: shiftId,
							opportunityTitle: 'Volunteer Shift',
							optionLabel: ''
						},
						volunteers: []
					});
				}
				map.get(shiftId)?.volunteers.push({
					...volunteer,
					assignmentId: assignment.id,
					attended: assignment.attended,
					status: assignment.status ?? 'approved'
				});
			}
		}

		return Array.from(map.values()).sort((a, b) => {
			const timeA = a.shift?.startsAt ? new Date(a.shift.startsAt).getTime() : 0;
			const timeB = b.shift?.startsAt ? new Date(b.shift.startsAt).getTime() : 0;
			return timeA - timeB;
		});
	});

	const totalApprovedVolunteersCount = $derived.by(() => {
		const ids = new Set<string>();
		let count = 0;
		for (const group of allShiftsWithVolunteers) {
			for (const v of group.volunteers) {
				const key = v.id ?? v.email ?? v.name;
				if (key && !ids.has(key)) {
					ids.add(key);
					count += 1;
				}
			}
		}
		return count;
	});

	const activeSelectedShift = $derived.by(() => {
		if (selectedShift === 'all') return 'all';
		const exists = allShiftsWithVolunteers.some(
			(group) => String(group.shift?.id) === String(selectedShift)
		);
		return exists ? selectedShift : 'all';
	});

	const shiftFilterOptions = $derived.by(() => {
		const totalAssignments = allShiftsWithVolunteers.reduce(
			(sum, group) => sum + group.volunteers.length,
			0
		);
		const options = [{ value: 'all', label: `All shifts (${totalAssignments})` }];
		for (const group of allShiftsWithVolunteers) {
			const checkedIn = group.volunteers.filter((v) => v.status === 'checked_in').length;
			const title = group.shift?.opportunityTitle || 'Shift';
			const time = group.shift?.optionLabel || group.shift?.windowLabel || '';
			const label = time
				? `${title} · ${time} (${checkedIn}/${group.volunteers.length})`
				: `${title} (${checkedIn}/${group.volunteers.length})`;
			options.push({
				value: String(group.shift.id),
				label
			});
		}
		return options;
	});

	const filteredShiftsWithVolunteers = $derived.by<ShiftRosterGroup[]>(() => {
		const term = searchTerm.trim().toLowerCase();
		const result: ShiftRosterGroup[] = [];

		for (const group of allShiftsWithVolunteers) {
			if (
				activeSelectedShift !== 'all' &&
				String(group.shift?.id) !== String(activeSelectedShift)
			) {
				continue;
			}

			const matchedVolunteers = term
				? group.volunteers.filter((v) =>
						`${v.name ?? ''} ${v.email ?? ''} ${v.phone ?? ''}`.toLowerCase().includes(term)
					)
				: group.volunteers;

			if (matchedVolunteers.length > 0) {
				result.push({
					shift: group.shift,
					volunteers: matchedVolunteers
				});
			}
		}

		return result;
	});

	const visibleStats = $derived.by(() => {
		let total = 0;
		let checkedIn = 0;
		let noShow = 0;
		for (const group of filteredShiftsWithVolunteers) {
			for (const v of group.volunteers) {
				total += 1;
				if (v.status === 'checked_in') checkedIn += 1;
				if (v.status === 'no_show') noShow += 1;
			}
		}
		return { total, checkedIn, noShow };
	});

	function handleSelectShift(value: string) {
		selectedShift = value;
		onShiftChange?.(value);
	}

	function handleSearchInput(value: string) {
		searchTerm = value;
		onSearch?.(value);
	}

	function handleToggleCheckInMode() {
		const next = !checkInMode;
		checkInMode = next;
		onCheckInModeChange?.(next);
	}

	const toolbarFilters = $derived<ToolbarSelectFilter[]>([
		{
			id: 'shift-filter',
			label: checkInMode ? 'Active Shift' : 'Shift Filter',
			value: activeSelectedShift,
			options: shiftFilterOptions,
			onChange: handleSelectShift
		}
	]);

	function handleMarkAllPresent(volunteersInShift: RosterVolunteerEntry[]) {
		const assignmentIds = volunteersInShift
			.map((v) => v.assignmentId)
			.filter((id): id is string => id !== null && id !== undefined);
		if (assignmentIds.length > 0) {
			onBulkStatusChange(assignmentIds, 'checked_in');
		}
	}

	const expandedContacts = new SvelteMap<string, boolean>();
	function toggleEmergencyVisibility(assignmentId: string | null) {
		if (!assignmentId) return;
		const current = expandedContacts.get(assignmentId) ?? false;
		expandedContacts.set(assignmentId, !current);
	}

	function handleStatusChange(assignmentId: string | null, status: string) {
		onStatusChange(assignmentId, status);
	}

	function formatPhoneNumber(value: string | null | undefined): string {
		if (!value) return '';
		const digits = String(value).replace(/\D/g, '');
		if (digits.length < 10) {
			return String(value).trim();
		}
		const tenDigits = digits.slice(-10);
		const area = tenDigits.slice(0, 3);
		const prefix = tenDigits.slice(3, 6);
		const line = tenDigits.slice(6);
		return `${area}-${prefix}-${line}`;
	}

	function formatCsvValue(value: unknown): string {
		if (value === null || value === undefined) return '""';
		const str = String(value).replace(/"/g, '""');
		return `"${str}"`;
	}

	function exportCsv() {
		let csvContent =
			'data:text/csv;charset=utf-8,' +
			[
				'Volunteer Name',
				'Email',
				'Phone',
				'Emergency Contact Name',
				'Emergency Contact Phone',
				'Shift',
				'Shift Time',
				'Status'
			].join(',') +
			'\n';

		allShiftsWithVolunteers.forEach((group) => {
			const opportunityTitle = group.shift?.opportunityTitle ?? '';
			const shiftLabel = group.shift?.optionLabel ?? group.shift?.windowLabel ?? '';
			group.volunteers.forEach((v) => {
				const row = [
					formatCsvValue(v.name),
					formatCsvValue(v.email),
					formatCsvValue(v.phone),
					formatCsvValue(v.emergencyContactName),
					formatCsvValue(v.emergencyContactPhone),
					formatCsvValue(opportunityTitle),
					formatCsvValue(shiftLabel),
					formatCsvValue(v.status)
				].join(',');
				csvContent += row + '\n';
			});
		});

		const encodedUri = encodeURI(csvContent);
		const link = document.createElement('a');
		link.setAttribute('href', encodedUri);
		link.setAttribute('download', 'approved_volunteers.csv');
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function printRoster() {
		window.print();
	}

	function buildGroupBadges(group: ShiftRosterGroup): ShiftHeaderBadge[] {
		const checkedIn = group.volunteers.filter((v) => v.status === 'checked_in').length;
		const noShow = group.volunteers.filter((v) => v.status === 'no_show').length;
		const badges: ShiftHeaderBadge[] = [
			{
				label: `${checkedIn}/${group.volunteers.length} checked in`,
				tone:
					checkedIn === group.volunteers.length && group.volunteers.length > 0
						? 'success'
						: 'surface'
			}
		];
		if (noShow > 0) {
			badges.push({
				label: `${noShow} no show`,
				tone: 'error'
			});
		}
		return badges;
	}

	function statusTagClasses(status: string): string {
		switch (status) {
			case 'checked_in':
				return 'bg-success-500 text-surface-950 border-success-500';
			case 'no_show':
				return 'bg-error-500 text-surface-950 border-error-500';
			default:
				return 'bg-surface-800 text-surface-50 border-surface-500';
		}
	}

	function statusTagLabel(status: string): string {
		switch (status) {
			case 'checked_in':
				return 'Checked In';
			case 'no_show':
				return 'No Show';
			default:
				return 'Approved';
		}
	}

	function cardTopBorderClass(status: string): string {
		switch (status) {
			case 'checked_in':
				return 'border-t-success-500';
			case 'no_show':
				return 'border-t-error-500';
			default:
				return 'border-t-secondary-500';
		}
	}
</script>

<section
	aria-labelledby={rosterHeadingId}
	class="printable-roster border-secondary-500 bg-surface-900 text-surface-50 flex w-full min-w-0 flex-col border-t-4"
>
	<!-- Roster Header -->
	<div
		class="border-surface-800 flex w-full min-w-0 flex-col gap-4 border-b-2 p-4 sm:p-6 md:flex-row md:items-center md:justify-between"
	>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h2
					id={rosterHeadingId}
					class="text-surface-50! m-0 text-left! text-xl font-black uppercase"
				>
					Approved Volunteers
				</h2>
				<span
					class="bg-surface-800 text-surface-50 border-surface-500 inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-black tabular-nums"
				>
					<IconUsers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{totalApprovedVolunteersCount || volunteers.length}
				</span>
			</div>
			<p class="text-surface-300 m-0 mt-1 text-sm">
				{checkInMode
					? 'One-handed check-in mode active — filter by shift and tap to record attendance.'
					: 'Day-of roster for quick attendance tracking, emergency lookup, and contact.'}
			</p>
		</div>

		<ManageActionGrid columns={3} ariaLabel="Roster tools" class="no-print md:w-auto">
			<ManageActionButton
				label={checkInMode ? 'Check-In On' : 'Check-In'}
				ariaLabel={checkInMode
					? 'Check-In On: exit mobile check-in mode'
					: 'Check-In: enter mobile check-in mode'}
				icon={IconCheckCircle}
				tone={checkInMode ? 'primary' : 'secondary'}
				variant="filled"
				selected={checkInMode}
				fullWidth={true}
				class="md:w-auto"
				onclick={handleToggleCheckInMode}
			/>
			<ManageActionButton
				label="Export"
				ariaLabel="Export approved volunteers CSV"
				icon={IconDownload}
				tone="primary"
				variant="outlined"
				fullWidth={true}
				class="md:w-auto"
				onclick={exportCsv}
			/>
			<ManageActionButton
				label="Print"
				ariaLabel="Print approved volunteer roster"
				icon={IconPrinter}
				tone="primary"
				variant="outlined"
				fullWidth={true}
				class="md:w-auto"
				onclick={printRoster}
			/>
		</ManageActionGrid>
	</div>

	<!-- Shared Filter & Search Toolbar (pins in Check-In Mode) -->
	{#if allShiftsWithVolunteers.length > 0}
		<ManageFilterToolbar
			filters={toolbarFilters}
			searchValue={searchTerm}
			searchLabel="Search Volunteers"
			searchPlaceholder="Search name, email, phone…"
			onSearch={handleSearchInput}
			sticky={checkInMode}
			class="no-print"
		>
			{#snippet summary()}
				<div class="flex flex-wrap items-center gap-2 text-xs font-black tracking-wide uppercase">
					<span class="bg-success-500 text-surface-950 px-2.5 py-1 tabular-nums">
						{visibleStats.checkedIn} / {visibleStats.total} Checked In
					</span>
					{#if visibleStats.noShow > 0}
						<span class="bg-error-500 text-surface-950 px-2.5 py-1 tabular-nums">
							{visibleStats.noShow} No Show
						</span>
					{/if}
				</div>
				{#if activeSelectedShift !== 'all' || searchTerm.trim()}
					<ManageActionButton
						label="Show All"
						ariaLabel="Show all roster shifts and clear search"
						tone="surface"
						variant="outlined"
						onclick={() => {
							handleSelectShift('all');
							handleSearchInput('');
						}}
					/>
				{/if}
			{/snippet}
		</ManageFilterToolbar>
	{/if}

	<!-- Shift Groups -->
	<div class="flex w-full min-w-0 flex-col gap-5 p-2.5 sm:gap-6 sm:p-6">
		{#if allShiftsWithVolunteers.length === 0}
			<p class="text-surface-300 m-0 text-sm">No approved volunteers yet.</p>
		{:else if filteredShiftsWithVolunteers.length === 0}
			<div class="border-surface-800 bg-surface-950 flex flex-col items-start gap-3 border-2 p-4">
				<p class="text-surface-300 m-0 text-sm">
					No approved volunteers match the selected shift or search query.
				</p>
				<ManageActionButton
					label="Reset Filters"
					tone="primary"
					variant="filled"
					onclick={() => {
						handleSelectShift('all');
						handleSearchInput('');
					}}
				/>
			</div>
		{:else}
			{#each filteredShiftsWithVolunteers as group (group.shift.id)}
				<div class="shift-group border-surface-800 flex min-w-0 flex-col border-2">
					<ManageShiftHeader
						headingLevel="h3"
						title={group.shift?.opportunityTitle || 'Volunteer Shift'}
						subtitle={group.shift?.optionLabel || group.shift?.windowLabel || ''}
						badges={buildGroupBadges(group)}
					>
						{#snippet actions()}
							<ManageActionButton
								label="Check In All"
								ariaLabel={`Check in all volunteers for ${group.shift?.opportunityTitle || 'shift'} ${group.shift?.optionLabel || ''}`.trim()}
								tone="secondary"
								variant="filled"
								fullWidth={true}
								class="sm:w-auto"
								onclick={() => handleMarkAllPresent(group.volunteers)}
							/>
						{/snippet}
					</ManageShiftHeader>

					<div
						class={`grid min-w-0 gap-4 p-3 sm:p-4 ${
							checkInMode ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'
						}`}
					>
						{#each group.volunteers as volunteer (volunteer.assignmentId ?? volunteer.id ?? volunteer.email)}
							{@const checkInSelected = volunteer.status === 'checked_in'}
							{@const noShowSelected = volunteer.status === 'no_show'}
							<article
								class={`border-surface-700 bg-surface-950 flex min-w-0 flex-col gap-3 border-2 border-t-4 p-3 sm:p-4 ${cardTopBorderClass(volunteer.status)}`}
							>
								<header class="flex min-w-0 flex-wrap items-start justify-between gap-2">
									<div
										class="text-surface-50 min-w-0 flex-1 text-lg leading-snug font-black break-words"
									>
										{volunteer.name}
									</div>
									<span
										class={`shrink-0 border px-2.5 py-1 text-xs font-black tracking-wide uppercase ${statusTagClasses(volunteer.status)}`}
									>
										{statusTagLabel(volunteer.status)}
									</span>
								</header>

								<ManageActionGrid
									columns={checkInMode ? 1 : 3}
									ariaLabel={`Attendance controls for ${volunteer.name}`}
									class="attendance-actions no-print"
								>
									<ManageActionButton
										label="Check In"
										ariaLabel={`Check In ${volunteer.name}`}
										tone="success"
										variant={checkInSelected ? 'filled' : 'outlined'}
										selected={checkInSelected}
										fullWidth={true}
										onclick={() => handleStatusChange(volunteer.assignmentId, 'checked_in')}
									/>
									<ManageActionButton
										label="No Show"
										ariaLabel={`No Show ${volunteer.name}`}
										tone="error"
										variant={noShowSelected ? 'filled' : 'outlined'}
										selected={noShowSelected}
										fullWidth={true}
										onclick={() => handleStatusChange(volunteer.assignmentId, 'no_show')}
									/>
									<ManageActionButton
										label="Reset"
										ariaLabel={`Reset attendance for ${volunteer.name}`}
										icon={IconBrush}
										tone="warning"
										variant="outlined"
										fullWidth={true}
										onclick={() => handleStatusChange(volunteer.assignmentId, 'approved')}
									/>
								</ManageActionGrid>

								<ManageContactRow
									name={volunteer.name}
									email={volunteer.email}
									phone={volunteer.phone}
									emergencyContactName={volunteer.emergencyContactName}
									emergencyContactPhone={volunteer.emergencyContactPhone}
									emergencyExpanded={Boolean(
										volunteer.assignmentId && expandedContacts.get(volunteer.assignmentId)
									)}
									onToggleEmergency={() => toggleEmergencyVisibility(volunteer.assignmentId)}
									class="no-print"
								/>
							</article>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>

<div class="printable-roster-table">
	<h1>{event?.title ?? 'Event'} Volunteers</h1>
	<table>
		<thead>
			<tr>
				<th>Shift</th>
				<th>Name</th>
				<th>Phone</th>
				<th>Emergency Contact</th>
				<th>Check In</th>
			</tr>
		</thead>
		<tbody>
			{#each allShiftsWithVolunteers as group}
				{#each group.volunteers as v}
					<tr>
						<td
							>{group.shift?.opportunityTitle ?? ''} | {group.shift?.optionLabel ??
								group.shift?.windowLabel ??
								''}</td
						>
						<td>{v.name ?? ''}</td>
						<td>{formatPhoneNumber(v.phone) || v.phone || ''}</td>
						<td
							>{v.emergencyContactName ?? ''}{v.emergencyContactName || v.emergencyContactPhone
								? ' @ '
								: ''}{formatPhoneNumber(v.emergencyContactPhone) ||
								v.emergencyContactPhone ||
								''}</td
						>
						<td>__________</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.printable-roster-table {
		display: none;
	}

	@media print {
		:global(body *) {
			visibility: hidden;
		}
		:global(.app-shell header),
		:global(.app-shell aside),
		.printable-roster,
		.no-print {
			display: none !important;
		}
		.printable-roster-table,
		.printable-roster-table * {
			visibility: visible !important;
		}
		.printable-roster-table {
			display: block !important;
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			padding: 1rem;
			background: #ffffff !important;
			color: #000000 !important;
		}
		h1 {
			font-size: 1.5rem;
			margin-bottom: 1rem;
			color: #000000 !important;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.9rem;
			color: #000000 !important;
		}
		th,
		td {
			padding: 0.5rem;
			text-align: left;
			border-bottom: 1px solid #000 !important;
			color: #000000 !important;
		}
		th {
			background-color: #f2f2f2 !important;
		}
		table tr {
			border-bottom: 1px solid #000 !important;
		}
	}
</style>
