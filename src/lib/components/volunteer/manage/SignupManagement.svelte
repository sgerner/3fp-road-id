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

	<div class="mt-6">
		<!-- Desktop header -->
		<div
			class="text-surface-400 hidden grid-cols-5 gap-x-4 px-3 py-2 text-xs tracking-wide uppercase md:grid"
		>
			<div class="col-span-1">Volunteer</div>
			<div class="col-span-1">Shift</div>
			<div class="col-span-1">Status</div>
			<div class="col-span-1">Actions</div>
		</div>
		<!-- Volunteer list -->
		<div class="space-y-4 md:space-y-0">
			{#if !individualShifts.length}
				<div class="text-surface-400 px-3 py-6 text-center">
					No volunteers match the selected filters.
				</div>
			{:else}
				{#each individualShifts as item, i (item.key)}
					{@const prevItem = individualShifts[i - 1] ?? null}
					{@const showDivider =
						prevItem && item.shiftDetails.startsAt !== prevItem.shiftDetails.startsAt}
					<div
						class:border-t-2={showDivider}
						class:border-surface-600={showDivider}
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
										>Multiple Shifts</span
									>
								{/if}
							</div>
						</div>

						<!-- Shift -->
						<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
							<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">Shift</div>
							<div class="font-medium text-white">{item.shiftDetails.opportunityTitle}</div>
							<div class="text-surface-300 text-xs">{item.shiftDetails.optionLabel}</div>
						</div>

						<!-- Status -->
						<div class="mb-4 md:col-span-1 md:mb-0 md:px-3 md:py-3">
							<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">Status</div>
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
							<div class="text-surface-400 mb-1 text-xs font-bold uppercase md:hidden">Actions</div>
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
									<button
										class="chip preset-outlined-secondary-500 px-2 py-1 text-xs"
										onclick={() => onWaitlist(item.assignment.id)}
									>
										{item.assignment.status === 'waitlisted' ? 'Remove waitlist' : 'Waitlist'}
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</section>
