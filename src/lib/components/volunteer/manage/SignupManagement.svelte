<script>
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import { SvelteMap } from 'svelte/reactivity';

	const {
		volunteers = [],
		statusFilters = [],
		activityFilters = [],
		shiftFilters = [],
		shifts = [],
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
		onPresent = (/** @type {string} */ assignmentId, /** @type {boolean} */ isPresent) => {}
	} = $props();

	const shiftMap = $derived(new SvelteMap(shifts.map((shift) => [shift.id, shift])));

	const individualShifts = $derived.by(() => {
		const flattened = [];
		for (const volunteer of volunteers) {
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
					hasMultipleShifts: false
				});
			} else {
				for (const assignment of assignments) {
					flattened.push({
						key: `${volunteer.id}-${assignment.id}`,
						volunteer,
						assignment,
						shiftDetails: shiftMap.get(assignment.shiftId ?? '') ?? {},
						hasMultipleShifts: (volunteer.shiftIds?.length ?? 0) > 1
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
			const createdAtA = a.volunteer.signup.created_at
				? new Date(a.volunteer.signup.created_at).getTime()
				: 0;
			const createdAtB = b.volunteer.signup.created_at
				? new Date(b.volunteer.signup.created_at).getTime()
				: 0;
			return createdAtA - createdAtB;
		});

		return flattened;
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
					<th class="px-3 py-2">Shift</th>
					<th class="px-3 py-2">Status</th>
					<th class="px-3 py-2">Presence</th>
					<th class="px-3 py-2">Actions</th>
				</tr>
			</thead>
			<tbody class="divide-surface-800/60 divide-y">
				{#if !individualShifts.length}
					<tr>
						<td class="text-surface-400 px-3 py-6 text-center" colspan="5"
							>No volunteers match the selected filters.</td
						>
					</tr>
				{:else}
					{#each individualShifts as item, i (item.key)}
						{@const prevItem = individualShifts[i - 1] ?? null}
						{@const showDivider =
							prevItem && item.shiftDetails.startsAt !== prevItem.shiftDetails.startsAt}
						<tr
							class:border-t-2={showDivider}
							class:border-surface-600={showDivider}
							class={item.assignment.status === 'waitlisted' ? 'bg-amber-500/10' : ''}
						>
							<td class="px-3 py-3">
								<div class="flex items-center gap-2">
									<span class="font-semibold text-white">{item.volunteer.name}</span>
									{#if item.hasMultipleShifts}
										<span
											class="chip preset-tonal-secondary-500 px-2 py-0.5 text-[10px] tracking-wide"
											>Multiple Shifts</span
										>
									{/if}
								</div>
								{#if item.volunteer.email}
									<div class="text-surface-400 mt-1 flex items-center gap-1 text-xs">
										<IconMail class="h-3.5 w-3.5" />
										<span>{item.volunteer.email}</span>
									</div>
								{/if}
								{#if item.volunteer.phone}
									<div class="text-surface-500 flex items-center gap-1 text-xs">
										<IconPhone class="h-3.5 w-3.5" />
										<span>{item.volunteer.phone}</span>
									</div>
								{/if}
							</td>
							<td class="px-3 py-3">
								<div class="font-medium text-white">{item.shiftDetails.opportunityTitle}</div>
								<div class="text-surface-300 text-xs">{item.shiftDetails.optionLabel}</div>
							</td>
							<td class="px-3 py-3">
								<span
									class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(
										item.assignment.status
									)}`}
								>
									{item.assignment.status.replace('_', ' ')}
								</span>
							</td>
							<td class="px-3 py-3">
								{#if item.assignment.id}
									<label class="flex cursor-pointer items-center">
										<div class="relative">
											<input
												type="checkbox"
												class="peer sr-only"
												checked={item.assignment.attended}
												onchange={(event) =>
													onPresent(item.assignment.id, event.currentTarget.checked)}
											/>
											<div
												class="bg-surface-600 peer-checked:bg-primary-500 h-6 w-10 rounded-full"
											></div>
											<div
												class="peer-checked:border-primary-500 peer-checked:translate-x-full absolute top-0.5 left-0.5 h-5 w-5 rounded-full border border-transparent bg-white transition"
											></div>
										</div>
										<div class="text-surface-300 ml-3 text-xs">
											{item.assignment.attended ? 'Present' : 'No-show'}
										</div>
									</label>
								{:else}
									<span class="text-surface-500 text-xs">N/A</span>
								{/if}
							</td>
							<td class="px-3 py-3">
								{#if item.assignment.id}
									<div class="flex flex-wrap gap-2">
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
												class="chip preset-tonal-error px-2 py-1 text-xs"
												onclick={() => onDecline(item.assignment.id)}
											>
												Decline
											</button>
										{/if}
										<button
											class="chip preset-outlined-secondary-500 px-2 py-1 text-xs"
											onclick={() => onWaitlist(item.assignment.id)}
										>
											{item.assignment.status === 'waitlisted'
												? 'Remove waitlist'
												: 'Move to waitlist'}
										</button>
									</div>
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</section>