<script>
	import { Check, CalendarClock, MapPin, RefreshCcw, XCircle } from '@lucide/svelte';

	const { data, form } = $props();

	const upcomingEvents = $derived((data?.upcomingEvents ?? []).filter(Boolean));
	const pastEvents = $derived((data?.pastEvents ?? []).filter(Boolean));
	const feedback = $derived(data?.feedback ?? null);
	const highlightedShiftId = $derived(data?.highlightedShiftId ?? null);
	const confirmWindowHours = $derived(data?.confirmWindowHours ?? 48);
	const user = $derived(data?.user ?? null);

	let openReschedule = $state(null);

	function toggleReschedule(id) {
		openReschedule = openReschedule === id ? null : id;
	}

	function isRescheduleOpen(id) {
		return openReschedule === id;
	}

	function formatDateTime(value, timezone, options) {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.valueOf())) return null;
		const formatter = new Intl.DateTimeFormat(undefined, {
			timeZone: timezone || undefined,
			...options
		});
		return formatter.format(date);
	}

	function formatShiftRange(shift, event) {
		const tz = shift?.timezone || event?.timezone || undefined;
		if (!shift?.starts_at) {
			return 'Timing to be announced';
		}
		const startLabel = formatDateTime(shift.starts_at, tz, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
		if (!shift.ends_at) {
			return startLabel ?? 'Timing to be announced';
		}
		const endLabel = formatDateTime(shift.ends_at, tz, { timeStyle: 'short' });
		if (startLabel && endLabel) {
			return `${startLabel} – ${endLabel}`;
		}
		return startLabel ?? 'Timing to be announced';
	}

	function formatEventRange(event) {
		if (!event) return null;
		const tz = event.timezone || undefined;
		if (event.event_start && event.event_end) {
			const startDate = formatDateTime(event.event_start, tz, { dateStyle: 'medium' });
			const endDate = formatDateTime(event.event_end, tz, { dateStyle: 'medium' });
			if (startDate && endDate && startDate === endDate) return startDate;
			if (startDate && endDate) return `${startDate} – ${endDate}`;
			return startDate || endDate;
		}
		if (event.event_start) {
			return formatDateTime(event.event_start, tz, { dateStyle: 'medium' });
		}
		return null;
	}

	function formatLocation(shift, event) {
		const parts = [];
		if (shift?.location_name) parts.push(shift.location_name);
		else if (event?.location_name) parts.push(event.location_name);
		if (shift?.location_address) parts.push(shift.location_address);
		else if (event?.location_address) parts.push(event.location_address);
		if (!parts.length) return ['Location to be announced'];
		return parts;
	}

	function availableOptions(entry, assignment) {
		if (!entry?.availableShifts) return [];
		return entry.availableShifts.filter((option) => option.shift.id !== assignment.shift.id);
	}

	function optionLabel(option, event) {
		const shift = option?.shift;
		const opportunity = option?.opportunity;
		const parts = [];
		if (opportunity?.title) parts.push(opportunity.title);
		const range = formatShiftRange(shift, event);
		if (range) parts.push(range);
		if (option?.remaining !== null && option?.remaining !== undefined) {
			const remaining = Number(option.remaining);
			if (Number.isFinite(remaining)) {
				parts.push(`${remaining} spot${remaining === 1 ? '' : 's'} left`);
			}
		}
		return parts.join(' • ');
	}

	function isHighlighted(id) {
		if (!highlightedShiftId || !id) return false;
		return String(highlightedShiftId) === String(id);
	}

	const submissionError = $derived(form?.error ?? null);
</script>

<svelte:head>
	<title>My Volunteer Shifts</title>
</svelte:head>

<div class="w-full max-w-5xl space-y-6 py-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold text-white">My Volunteer Shifts</h1>
		<p class="text-surface-300 mx-auto max-w-3xl !text-center text-sm">
			Review upcoming and past volunteer commitments, confirm your spot as the shift approaches,
			cancel if plans change, or move into an open shift. Confirmation is available within {confirmWindowHours}
			hours of a shift’s start time.
		</p>
	</header>

	{#if !user}
		<div
			class="border-surface-600 bg-surface-900/70 text-surface-200 flex flex-col gap-2 rounded-lg border p-4"
		>
			<p class="font-medium">Sign in to manage your volunteer shifts.</p>
			<p class="text-surface-400 text-sm">
				Use the volunteer hub sign-in link sent with your confirmation email. Once signed in, you
				can confirm, cancel, or reschedule your shifts here.
			</p>
		</div>
	{:else}
		{#if feedback}
			<div
				class={`border ${
					feedback.type === 'success'
						? 'border-secondary-500 bg-secondary-900/40 text-secondary-100'
						: feedback.type === 'info'
							? 'border-primary-500 bg-primary-950/30 text-primary-100'
							: 'border-error-500 bg-error-900/30 text-error-100'
				} rounded-lg p-4`}
			>
				<p class="font-medium">{feedback.message}</p>
			</div>
		{/if}

		{#if submissionError}
			<div class="border-error-500 bg-error-900/30 text-error-100 rounded-lg border p-4">
				<p class="font-medium">{submissionError}</p>
			</div>
		{/if}

		<section class="space-y-4">
			<h2 class="text-2xl font-semibold text-white">Upcoming shifts</h2>
			{#if !upcomingEvents.length}
				<p class="text-surface-400 text-sm">
					You don’t have any upcoming volunteer shifts. Browse <a
						class="text-secondary-200 underline"
						href="/volunteer">volunteer opportunities</a
					> to get involved.
				</p>
			{:else}
				{#each upcomingEvents as entry (entry.event.id)}
					<article
						class="border-surface-700 bg-surface-900/60 flex flex-col gap-4 rounded-xl border p-5"
					>
						<header class="flex flex-col gap-1">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									{#if entry.event.slug}
										<a
											class="text-secondary-200 hover:text-secondary-100 text-xl font-semibold"
											href={`/volunteer/${entry.event.slug}`}
										>
											{entry.event.title}
										</a>
									{:else}
										<h3 class="text-secondary-100 text-xl font-semibold">{entry.event.title}</h3>
									{/if}
									{#if formatEventRange(entry.event)}
										<div class="text-surface-400 flex items-center gap-2 text-sm">
											<CalendarClock class="size-4" />
											<span>{formatEventRange(entry.event)}</span>
										</div>
									{/if}
									<div class="text-surface-400 flex items-start gap-2 text-sm">
										<MapPin class="mt-0.5 size-4" />
										<span>
											{#each formatLocation(null, entry.event) as part, i}
												{part}{#if i < formatLocation(null, entry.event).length - 1}
													<br />{/if}
											{/each}
										</span>
									</div>
								</div>
							</div>
						</header>
						<div class="space-y-4">
							{#each entry.assignments as record (record.id)}
								<div
									class={`border ${
										isHighlighted(record.id) ? 'border-secondary-400' : 'border-surface-700'
									} bg-surface-950/40 rounded-lg p-4`}
								>
									<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div class="space-y-2">
											<p class="text-secondary-100 text-lg font-semibold">
												{record.opportunity.title}
											</p>
											<p class="text-surface-300 text-sm">
												{formatShiftRange(record.shift, entry.event)}
											</p>

											<div
												class="text-surface-400 flex items-center gap-2 text-xs tracking-wide uppercase"
											>
												{#if record.assignment.confirmed_at}
													<Check class="text-secondary-400 size-4" />
													<span>{record.statusLabel}</span>
												{:else if record.assignment.cancelled_at}
													<XCircle class="text-error-400 size-4" />
													<span>{record.statusLabel}</span>
												{:else}
													<span class="bg-primary-900/40 text-primary-100 rounded-full px-3 py-1">
														{record.statusLabel}
													</span>
												{/if}
											</div>
										</div>
										<div class="flex flex-col gap-2 md:items-end">
											<div class="flex flex-wrap gap-2">
												{#if record.canUncancel}
													<form method="POST" action="?/uncancel">
														<input type="hidden" name="assignment_id" value={record.id} />
														<button type="submit" class="btn btn-sm preset-outlined-primary-500">
															Un-cancel
														</button>
													</form>
												{:else}
													<form method="POST" action="?/confirm">
														<input type="hidden" name="assignment_id" value={record.id} />
														<button
															type="submit"
															class="btn btn-sm preset-filled-secondary-500"
															disabled={!record.canConfirm}
														>
															Confirm
														</button>
													</form>
													<form method="POST" action="?/cancel">
														<input type="hidden" name="assignment_id" value={record.id} />
														<button
															type="submit"
															class="btn btn-sm preset-outlined-error-500"
															disabled={!record.canCancel}
														>
															Cancel
														</button>
													</form>
												{/if}
											</div>
											{#if !record.canConfirm}
												<p class="text-surface-500 text-xs">
													{#if record.confirmBlockedReason === 'not_approved'}
														Awaiting approval before you can confirm.
													{:else if record.confirmBlockedReason === 'waitlisted'}
														This shift is currently waitlisted.
													{:else if record.confirmBlockedReason === 'cancelled'}
														This shift has been cancelled.
													{:else if record.confirmBlockedReason === 'already_confirmed'}
														This shift has already been confirmed.
													{:else if record.confirmBlockedReason === 'missing_start'}
														Confirmation will open once the schedule is finalized.
													{:else if record.confirmBlockedReason === 'already_started'}
														This shift has already started.
													{:else}
														Confirm {confirmWindowHours} hr before.
													{/if}
												</p>
											{/if}
											<div
												class="border-surface-700 bg-surface-950/60 mt-2 w-full rounded-lg border p-3"
											>
												<div class="flex items-center justify-between gap-2">
													<div class="text-surface-200 flex items-center gap-2 text-sm font-medium">
														<RefreshCcw class="size-4" />
														<span>Reschedule</span>
													</div>
													<button
														type="button"
														class="text-secondary-300 text-xs tracking-wide uppercase"
														onclick={() => toggleReschedule(record.id)}
													>
														{isRescheduleOpen(record.id) ? 'Hide options' : 'View options'}
													</button>
												</div>
												{#if isRescheduleOpen(record.id)}
													{#if availableOptions(entry, record).length}
														<form method="POST" action="?/reschedule" class="mt-3 space-y-2">
															<input type="hidden" name="assignment_id" value={record.id} />
															<label
																class="text-surface-400 text-xs font-semibold tracking-wide uppercase"
																for={`reschedule-${record.id}`}
															>
																Choose a new shift
															</label>
															<select
																id={`reschedule-${record.id}`}
																class="input bg-surface-900/70 text-sm"
																name="new_shift_id"
																required
															>
																<option value="" disabled selected>Select a shift</option>
																{#each availableOptions(entry, record) as option (option.shift.id)}
																	<option value={option.shift.id}>
																		{optionLabel(option, entry.event)}
																	</option>
																{/each}
															</select>
															<button type="submit" class="btn btn-sm preset-filled-primary-500"
																>Update shift</button
															>
														</form>
													{:else}
														<p class="text-surface-500 mt-3 text-xs">
															No alternate shifts are currently available for this event.
														</p>
													{/if}
												{/if}
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</article>
				{/each}
			{/if}
		</section>

		<section class="space-y-4">
			<h2 class="text-2xl font-semibold text-white">Past shifts</h2>
			{#if !pastEvents.length}
				<p class="text-surface-500 text-sm">No past shifts yet.</p>
			{:else}
				{#each pastEvents as entry (entry.event.id)}
					<article class="border-surface-800 bg-surface-950/40 rounded-xl border p-5">
						<header class="flex flex-col gap-1">
							<p class="text-secondary-200 text-lg font-semibold">{entry.event.title}</p>
							{#if formatEventRange(entry.event)}
								<p class="text-surface-500 text-sm">{formatEventRange(entry.event)}</p>
							{/if}
						</header>
						<ul class="mt-3 space-y-3 text-sm">
							{#each entry.assignments as record (record.id)}
								<li class="border-surface-800 bg-surface-900/40 rounded-lg border p-3">
									<p class="text-surface-200 font-medium">{record.opportunity.title}</p>
									<p class="text-surface-400">{formatShiftRange(record.shift, entry.event)}</p>
									<p class="text-surface-500 text-xs tracking-wide uppercase">
										{record.statusLabel}
									</p>
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			{/if}
		</section>
	{/if}
</div>
