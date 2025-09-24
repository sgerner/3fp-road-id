<script>
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	export let volunteers = [];
	export let statusFilters = [];
	export let activityFilters = [];
	export let shiftFilters = [];
	export let shifts = [];
	export let selectedStatus = 'all';
	export let selectedActivity = 'all';
	export let selectedShift = 'all';
	export let searchTerm = '';
	export let onStatusChange = () => {};
	export let onActivityChange = () => {};
	export let onShiftChange = () => {};
	export let onSearch = () => {};
	export let onApprove = () => {};
	export let onDecline = () => {};
	export let onWaitlist = () => {};
	export let onMoveShift = () => {};
	export let onPresent = () => {};

	let expandedVolunteers = new SvelteSet();
	$: shiftLookup = new SvelteMap(shifts.map((shift) => [shift.id, shift]));
	function toggleVolunteerShifts(id) {
		if (!id) return;
		const next = new SvelteSet(expandedVolunteers);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedVolunteers = next;
	}
	function isVolunteerExpanded(id) {
		if (!id) return false;
		return expandedVolunteers.has(id);
	}
	function volunteerShiftCount(volunteer) {
		return (volunteer?.shiftIds ?? []).filter(Boolean).length;
	}
	function volunteerShiftEntries(volunteer) {
		const entries = [];
		const ids = (volunteer?.shiftIds ?? []).filter(Boolean);
		if (ids.length) {
			ids.forEach((shiftId, index) => {
				const shift = shiftLookup.get(shiftId ?? '') ?? null;
				const keyBase = volunteer?.id ?? volunteer?.signupId ?? `volunteer-${index}`;
				if (shift) {
					entries.push({
						key: `${keyBase}-${shiftId}-${index}`,
						title: shift.opportunityTitle || 'Volunteer shift',
						label: shift.optionLabel || shift.windowLabel || 'Scheduled shift',
						windowLabel: shift.windowLabel || shift.optionLabel || '',
						shiftId
					});
					return;
				}
				const fallbackLabel =
					volunteer?.displayShifts?.[index] ??
					volunteer?.displayShifts?.[0] ??
					'Shift details unavailable';
				entries.push({
					key: `${keyBase}-fallback-${index}`,
					title: 'Volunteer shift',
					label: fallbackLabel,
					windowLabel: fallbackLabel,
					shiftId
				});
			});
			return entries;
		}
		if (Array.isArray(volunteer?.displayShifts) && volunteer.displayShifts.length) {
			volunteer.displayShifts.forEach((label, index) => {
				const keyBase = volunteer?.id ?? volunteer?.signupId ?? `volunteer-${index}`;
				entries.push({
					key: `${keyBase}-display-${index}`,
					title: 'Volunteer shift',
					label,
					windowLabel: label,
					shiftId: null
				});
			});
		}
		if (!entries.length) {
			const keyBase = volunteer?.id ?? volunteer?.signupId ?? 'volunteer';
			entries.push({
				key: `${keyBase}-unassigned`,
				title: 'Volunteer shift',
				label: 'Unassigned',
				windowLabel: 'No shift selected',
				shiftId: null
			});
		}
		return entries;
	}

	function buildShiftGroups(list = []) {
		const map = new SvelteMap();
		for (const shift of list) {
			if (!shift?.id) continue;
			const key = shift.opportunityId ?? 'default';
			if (!map.has(key)) {
				map.set(key, {
					id: key,
					title: shift.opportunityTitle || 'Volunteer activity',
					shifts: []
				});
			}
			map.get(key)?.shifts.push(shift);
		}
		for (const entry of map.values()) {
			entry.shifts.sort((a, b) => {
				const timeA = a.startsAt ? new Date(a.startsAt).getTime() : 0;
				const timeB = b.startsAt ? new Date(b.startsAt).getTime() : 0;
				return timeA - timeB;
			});
		}
		return Array.from(map.values());
	}

	$: groupedShifts = buildShiftGroups(shifts);

	function statusClass(status) {
		switch (status) {
			case 'approved':
				return 'bg-success-500/20 text-success-200';
			case 'pending':
				return 'bg-warning-500/20 text-warning-200';
			case 'waitlisted':
				return 'bg-surface-500/20 text-surface-100';
			case 'declined':
				return 'bg-error-500/20 text-error-200';
			case 'cancelled':
				return 'bg-error-500/20 text-error-200';
			default:
				return 'bg-surface-500/20 text-surface-100';
		}
	}
</script>

<section
	class="border-surface-700 bg-surface-900/70 rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h2 class="!text-left text-xl font-semibold text-white">Signup Management</h2>
			<p class="text-surface-300 text-sm">
				Filter volunteers by status and shift, manage approvals, and confirm arrivals.
			</p>
		</div>
	</div>

	<div class="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
		<label class="text-surface-200 flex flex-col text-sm md:w-44">
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
		<label class="text-surface-200 flex flex-col text-sm md:w-52">
			<span class="mb-1 font-medium">Shift activity</span>
			<select
				class="border-surface-600 bg-surface-950/60 rounded-lg border px-3 py-2"
				value={selectedActivity}
				onchange={(event) => onActivityChange(event.currentTarget.value)}
			>
				<option value="all">All activities</option>
				{#each activityFilters as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label class="text-surface-200 flex flex-col text-sm md:w-56">
			<span class="mb-1 font-medium">Shift day &amp; time</span>
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

	<div class="mt-6 overflow-x-auto">
		<table
			class="divide-surface-700 text-surface-100 w-full min-w-[760px] divide-y text-left text-sm"
		>
			<thead class="text-surface-400 text-xs tracking-wide uppercase">
				<tr>
					<th class="px-3 py-2">Volunteer</th>
					<th class="px-3 py-2">Status</th>
					<th class="px-3 py-2">Shift</th>
					<th class="px-3 py-2">Present</th>
					<th class="px-3 py-2">Actions</th>
				</tr>
			</thead>
			<tbody class="divide-surface-800/60 divide-y">
				{#if !volunteers.length}
					<tr>
						<td class="text-surface-400 px-3 py-6 text-center" colspan="6"
							>No volunteers match the selected filters.</td
						>
					</tr>
				{:else}
					{#each volunteers as volunteer (volunteer.id)}
						<tr class={volunteer.status === 'waitlisted' ? 'bg-amber-500/10' : ''}>
							<td class="px-3 py-3">
								<div class="font-semibold text-white">{volunteer.name}</div>
								{#if volunteer.email}
									<div class="text-surface-400 flex items-center gap-1 text-xs">
										<IconMail class="h-3.5 w-3.5" />
										<span>{volunteer.email}</span>
									</div>
								{/if}
								{#if volunteer.phone}
									<div class="text-surface-500 flex items-center gap-1 text-xs">
										<IconPhone class="h-3.5 w-3.5" />
										<span>{volunteer.phone}</span>
									</div>
								{/if}
								{#if volunteerShiftCount(volunteer) > 1}
									<button
										type="button"
										class={`chip preset-tonal-secondary-500 mt-2 px-2 py-0.5 text-[11px] tracking-wide uppercase ${
											isVolunteerExpanded(volunteer.id) ? 'ring-secondary-400/60 ring-1' : ''
										}`}
										onclick={() => toggleVolunteerShifts(volunteer.id)}
										aria-expanded={isVolunteerExpanded(volunteer.id)}
									>
										{isVolunteerExpanded(volunteer.id)
											? 'Hide shifts'
											: `${volunteerShiftCount(volunteer)} shifts`}
									</button>
								{/if}
							</td>
							<td class="px-3 py-3">
								<span
									class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(volunteer.status)}`}
								>
									{volunteer.status}
								</span>
							</td>
							<td class="px-3 py-3">
								<select
									class="border-surface-600 bg-surface-950/60 w-48 rounded-lg border px-2 py-1"
									value={volunteer.primaryShiftId || ''}
									onchange={(event) => onMoveShift(volunteer.id, event.currentTarget.value || null)}
								>
									<option value="">Unassigned</option>
									{#each groupedShifts as group (group.id)}
										<optgroup label={group.title}>
											{#each group.shifts as shift (shift.id)}
												<option value={shift.id}>{shift.optionLabel}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
								{#if volunteer.status === 'waitlisted'}
									<p class="mt-1 text-xs text-amber-300">Waitlisted</p>
								{/if}
							</td>
							<td class="px-3 py-3">
								<label class="text-surface-200 flex items-center gap-2 text-xs">
									<input
										type="checkbox"
										class="border-surface-600 bg-surface-950 rounded"
										checked={volunteer.attended}
										onchange={(event) => onPresent(volunteer.id, event.currentTarget.checked)}
									/>
									Present
								</label>
								<p class="text-surface-500 mt-1 text-xs">
									{volunteer.attended && volunteer.checkIn
										? `Checked in ${volunteer.checkIn}`
										: 'No check-in recorded'}
								</p>
							</td>

							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-2">
									{#if volunteer.status !== 'approved'}
										<button
											class="chip preset-filled-primary-500 px-2 py-1 text-xs"
											onclick={() => onApprove(volunteer.id)}
										>
											Approve
										</button>
									{/if}
									{#if volunteer.status !== 'declined'}
										<button
											class="chip preset-tonal-error px-2 py-1 text-xs"
											onclick={() => onDecline(volunteer.id)}
										>
											Decline
										</button>
									{/if}
									<button
										class="chip preset-outlined-secondary-500 px-2 py-1 text-xs"
										onclick={() => onWaitlist(volunteer.id)}
									>
										{volunteer.status === 'waitlisted' ? 'Remove waitlist' : 'Move to waitlist'}
									</button>
								</div>
							</td>
						</tr>
						{#if isVolunteerExpanded(volunteer.id)}
							<tr class="bg-surface-900/60">
								<td class="px-3 pt-0 pb-5" colspan="5">
									<div class="text-surface-300 text-xs font-semibold tracking-wide uppercase">
										All registered shifts
									</div>
									<div class="mt-3 space-y-2">
										{#each volunteerShiftEntries(volunteer) as shiftEntry (shiftEntry.key)}
											<div
												class="border-surface-800/70 bg-surface-950/40 rounded-xl border px-4 py-3"
											>
												<div
													class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
												>
													<div class="space-y-1">
														<div class="text-sm font-semibold text-white">
															{shiftEntry.title}
														</div>
														<div class="text-surface-400 text-xs">
															{shiftEntry.label}
														</div>
														{#if shiftEntry.windowLabel && shiftEntry.windowLabel !== shiftEntry.label}
															<div class="text-surface-500 text-xs">
																{shiftEntry.windowLabel}
															</div>
														{/if}
													</div>
													<div class="flex flex-wrap gap-2">
														{#if volunteer.status !== 'approved'}
															<button
																class="chip preset-filled-primary-500 px-2 py-1 text-xs"
																onclick={() => onApprove(volunteer.id)}
															>
																Approve
															</button>
														{/if}
														{#if volunteer.status !== 'declined'}
															<button
																class="chip preset-tonal-error px-2 py-1 text-xs"
																onclick={() => onDecline(volunteer.id)}
															>
																Decline
															</button>
														{/if}
														<button
															class="chip preset-outlined-secondary-500 px-2 py-1 text-xs"
															onclick={() => onWaitlist(volunteer.id)}
														>
															{volunteer.status === 'waitlisted'
																? 'Remove waitlist'
																: 'Move to waitlist'}
														</button>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</section>
