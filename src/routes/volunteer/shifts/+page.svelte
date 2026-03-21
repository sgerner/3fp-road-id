<script>
	import {
		Check,
		CalendarClock,
		MapPin,
		RefreshCcw,
		XCircle,
		ChevronDown,
		ChevronUp,
		ClipboardList,
		Clock,
		AlertCircle,
		CheckCircle2,
		ArrowRight
	} from '@lucide/svelte';

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

	// Status chip config
	function statusChip(record) {
		const { assignment, statusLabel } = record;
		if (assignment.cancelled_at || (assignment.status ?? '').toLowerCase() === 'cancelled') {
			return { label: statusLabel, cls: 'chip preset-tonal-error', icon: XCircle };
		}
		if ((assignment.status ?? '').toLowerCase() === 'confirmed' || assignment.confirmed_at) {
			return { label: statusLabel, cls: 'chip preset-tonal-success', icon: CheckCircle2 };
		}
		if ((assignment.status ?? '').toLowerCase() === 'approved') {
			return { label: statusLabel, cls: 'chip preset-tonal-primary', icon: Check };
		}
		if ((assignment.status ?? '').toLowerCase() === 'waitlisted') {
			return { label: statusLabel, cls: 'chip preset-tonal-warning', icon: Clock };
		}
		return { label: statusLabel, cls: 'chip preset-tonal-surface', icon: Clock };
	}

	function feedbackClasses(type) {
		if (type === 'success') return 'border-success-500/40 bg-success-500/10 text-success-900-100';
		if (type === 'info') return 'border-primary-500/40 bg-primary-500/10 text-primary-900-100';
		return 'border-error-500/40 bg-error-500/10 text-error-900-100';
	}
</script>

<svelte:head>
	<title>My Volunteer Shifts</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-8 py-6">
	<!-- ═══════════════ CINEMATIC HERO ═══════════════ -->
	<header class="card relative overflow-hidden rounded-3xl">
		<div class="relative z-10 p-6 pb-8 md:p-10 md:pb-10">
			<div class="app-orb app-orb-1" aria-hidden="true"></div>
			<div class="app-orb app-orb-2" aria-hidden="true"></div>
			<div class="app-orb app-orb-3" aria-hidden="true"></div>

			<div class="flex items-center gap-2">
				<span class="chip preset-tonal-primary text-[11px] tracking-widest uppercase">
					Volunteer Hub
				</span>
			</div>

			<div class="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div class="space-y-2">
					<h1 class="h1 !text-left text-4xl font-extrabold tracking-tight md:text-5xl">
						My Shifts
					</h1>
					<p class="text-surface-700-300 max-w-xl text-sm leading-relaxed">
						Confirm your spot within {confirmWindowHours} hours of start time, reschedule into an open
						shift, or cancel if plans change.
					</p>
				</div>
				<a
					href="/volunteer"
					class="btn preset-outlined-secondary-500 flex shrink-0 items-center gap-2 self-start text-sm md:self-end"
				>
					<span>Find opportunities</span>
					<ArrowRight class="size-4" />
				</a>
			</div>
		</div>
	</header>

	<!-- ═══════════════ FEEDBACK BANNERS ═══════════════ -->
	{#if feedback}
		<div class="flex items-start gap-3 rounded-xl border p-4 {feedbackClasses(feedback.type)}">
			{#if feedback.type === 'success'}
				<CheckCircle2 class="text-success-500 mt-0.5 size-5 shrink-0" />
			{:else if feedback.type === 'info'}
				<AlertCircle class="text-primary-500 mt-0.5 size-5 shrink-0" />
			{:else}
				<AlertCircle class="text-error-500 mt-0.5 size-5 shrink-0" />
			{/if}
			<p class="text-sm font-medium">{feedback.message}</p>
		</div>
	{/if}

	{#if submissionError}
		<div
			class="border-error-500/40 bg-error-500/10 text-error-900-100 flex items-start gap-3 rounded-xl border p-4"
		>
			<AlertCircle class="text-error-500 mt-0.5 size-5 shrink-0" />
			<p class="text-sm font-medium">{submissionError}</p>
		</div>
	{/if}

	{#if !user}
		<!-- ═══════════════ SIGNED-OUT STATE ═══════════════ -->
		<div class="border-surface-300-700 bg-surface-100-900/60 rounded-2xl border p-8 text-center">
			<div
				class="bg-primary-500/10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
			>
				<ClipboardList class="text-primary-400 size-7" />
			</div>
			<h2 class="text-surface-950-50 text-xl font-semibold">Sign in to see your shifts</h2>
			<p class="text-surface-600-400 mx-auto mt-2 max-w-sm text-sm leading-relaxed">
				Use the volunteer hub sign-in link from your confirmation email. Once signed in, you can
				confirm, cancel, or reschedule your shifts here.
			</p>
		</div>
	{:else}
		<!-- ═══════════════ UPCOMING SHIFTS ═══════════════ -->
		<section class="space-y-4">
			<div class="flex items-center gap-3">
				<h2 class="text-surface-950-50 text-xl font-bold tracking-tight">Upcoming shifts</h2>
				{#if upcomingEvents.length}
					<span class="chip preset-tonal-primary text-xs">{upcomingEvents.length}</span>
				{/if}
			</div>

			{#if !upcomingEvents.length}
				<div class="preset-tonal-surface rounded-2xl border border-dashed p-8 text-center">
					<div
						class="bg-surface-200-800 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
					>
						<CalendarClock class="text-surface-500 size-6" />
					</div>
					<p class="text-surface-600-400 text-sm">No upcoming shifts yet.</p>
					<a
						href="/volunteer"
						class="text-secondary-600-400 hover:text-secondary-500 mt-2 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
					>
						Browse volunteer opportunities <ArrowRight class="size-3.5" />
					</a>
				</div>
			{:else}
				{#each upcomingEvents as entry (entry.event.id)}
					<article
						class="border-surface-300-700 bg-surface-100-900/60 border-l-primary-500 overflow-hidden rounded-2xl border border-l-4 shadow-sm"
					>
						<!-- Event header -->
						<header class="px-5 py-4 md:px-6">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0 space-y-1.5">
									{#if entry.event.slug}
										<a
											class="text-secondary-700-300 hover:text-secondary-500 text-xl leading-tight font-bold"
											href={`/volunteer/${entry.event.slug}`}
										>
											{entry.event.title}
										</a>
									{:else}
										<h3 class="text-surface-950-50 text-xl leading-tight font-bold">
											{entry.event.title}
										</h3>
									{/if}

									<div class="flex flex-wrap items-center gap-3">
										{#if formatEventRange(entry.event)}
											<span
												class="text-surface-600-400 flex items-center gap-1.5 text-xs font-medium"
											>
												<CalendarClock class="size-3.5" />
												{formatEventRange(entry.event)}
											</span>
										{/if}
										<span
											class="text-surface-600-400 flex items-center gap-1.5 text-xs font-medium"
										>
											<MapPin class="size-3.5" />
											{formatLocation(null, entry.event).join(', ')}
										</span>
									</div>
								</div>
							</div>
						</header>

						<!-- Divider -->
						<div class="border-surface-200-800 border-t"></div>

						<!-- Assignments -->
						<div class="divide-surface-200-800 divide-y">
							{#each entry.assignments as record (record.id)}
								{@const chip = statusChip(record)}
								<div
									class={`px-5 py-4 transition-colors md:px-6 ${isHighlighted(record.id) ? 'bg-secondary-500/5' : ''}`}
								>
									<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
										<!-- Left: shift info -->
										<div class="min-w-0 space-y-2">
											<p class="text-surface-950-50 font-semibold">
												{record.opportunity.title}
											</p>
											<p class="text-surface-600-400 flex items-center gap-1.5 text-sm">
												<Clock class="size-3.5 shrink-0" />
												{formatShiftRange(record.shift, entry.event)}
											</p>

											<!-- Status chip -->
											<div class="flex items-center gap-2">
												<span class="{chip.cls} flex items-center gap-1.5 text-xs font-medium">
													{#if chip.icon}
														{@const ChipIcon = chip.icon}
														<ChipIcon class="size-3.5" />
													{/if}
													{chip.label}
												</span>
											</div>

											<!-- Confirm blocked reason -->
											{#if !record.canConfirm && !record.assignment.cancelled_at && record.confirmBlockedReason !== 'already_confirmed' && record.confirmBlockedReason !== 'cancelled'}
												<p class="text-surface-500 text-xs">
													{#if record.confirmBlockedReason === 'not_approved'}
														Awaiting approval before you can confirm.
													{:else if record.confirmBlockedReason === 'waitlisted'}
														This shift is currently waitlisted.
													{:else if record.confirmBlockedReason === 'missing_start'}
														Confirmation opens once the schedule is finalized.
													{:else if record.confirmBlockedReason === 'already_started'}
														This shift has already started.
													{:else}
														Confirmation opens {confirmWindowHours} hr before the shift.
													{/if}
												</p>
											{/if}
										</div>

										<!-- Right: action buttons -->
										<div class="flex shrink-0 flex-col items-start gap-2 md:items-end">
											<div class="flex flex-wrap gap-2">
												{#if record.canUncancel}
													<form method="POST" action="?/uncancel">
														<input type="hidden" name="assignment_id" value={record.id} />
														<button type="submit" class="btn btn-sm preset-outlined-primary-500">
															Re-activate
														</button>
													</form>
												{:else}
													{#if !record.assignment.confirmed_at && !record.assignment.cancelled_at}
														<form method="POST" action="?/confirm">
															<input type="hidden" name="assignment_id" value={record.id} />
															<button
																type="submit"
																class="btn btn-sm preset-filled-secondary-500"
																disabled={!record.canConfirm}
															>
																<Check class="size-3.5" />
																Confirm
															</button>
														</form>
													{/if}
													{#if !record.assignment.cancelled_at}
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
												{/if}
											</div>
										</div>
									</div>

									<!-- Reschedule panel -->
									{#if !record.assignment.cancelled_at}
										<div
											class="border-surface-200-800 bg-surface-50-950/40 mt-4 rounded-xl border p-3"
										>
											<button
												type="button"
												class="flex w-full items-center justify-between gap-2"
												onclick={() => toggleReschedule(record.id)}
											>
												<span
													class="text-surface-700-300 flex items-center gap-2 text-sm font-medium"
												>
													<RefreshCcw class="size-4" />
													Reschedule
												</span>
												{#if isRescheduleOpen(record.id)}
													<ChevronUp class="text-surface-400 size-4" />
												{:else}
													<ChevronDown class="text-surface-400 size-4" />
												{/if}
											</button>

											{#if isRescheduleOpen(record.id)}
												{#if availableOptions(entry, record).length}
													<form method="POST" action="?/reschedule" class="mt-3 space-y-2.5">
														<input type="hidden" name="assignment_id" value={record.id} />
														<label
															class="text-surface-500 text-xs font-semibold tracking-widest uppercase"
															for={`reschedule-${record.id}`}
														>
															Choose a new shift
														</label>
														<select
															id={`reschedule-${record.id}`}
															class="input bg-surface-100-900/70 text-sm"
															name="new_shift_id"
															required
														>
															<option value="" disabled selected>Select a shift…</option>
															{#each availableOptions(entry, record) as option (option.shift.id)}
																<option value={option.shift.id}>
																	{optionLabel(option, entry.event)}
																</option>
															{/each}
														</select>
														<button type="submit" class="btn btn-sm preset-filled-primary-500">
															Update shift
														</button>
													</form>
												{:else}
													<p class="text-surface-500 mt-3 text-xs">
														No alternate shifts are currently available for this event.
													</p>
												{/if}
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</article>
				{/each}
			{/if}
		</section>

		<!-- ═══════════════ PAST SHIFTS ═══════════════ -->
		<section class="space-y-4">
			<div class="flex items-center gap-3">
				<h2 class="text-surface-950-50 text-xl font-bold tracking-tight">Past shifts</h2>
				{#if pastEvents.length}
					<span class="chip preset-tonal-surface text-xs">{pastEvents.length}</span>
				{/if}
			</div>

			{#if !pastEvents.length}
				<div
					class="border-surface-300-700 bg-surface-100-900/40 rounded-2xl border border-dashed p-6 text-center"
				>
					<p class="text-surface-500 text-sm">No past shifts yet.</p>
				</div>
			{:else}
				{#each pastEvents as entry (entry.event.id)}
					<article
						class="preset-tonal-surface card border-l-secondary-500 overflow-hidden rounded-2xl border-l-4 opacity-90"
					>
						<header class="px-5 py-4 md:px-6">
							<p class="text-secondary-700-300 text-lg font-bold">{entry.event.title}</p>
							{#if formatEventRange(entry.event)}
								<p class="text-surface-500 mt-0.5 flex items-center gap-1.5 text-xs">
									<CalendarClock class="size-3.5" />
									{formatEventRange(entry.event)}
								</p>
							{/if}
						</header>

						<div class="border-surface-200-800 border-t"></div>

						<ul class="divide-surface-200-800 divide-y">
							{#each entry.assignments as record (record.id)}
								{@const chip = statusChip(record)}
								<li class="flex items-center justify-between gap-3 px-5 py-3 md:px-6">
									<div class="min-w-0 space-y-0.5">
										<p class="text-surface-800-200 text-sm font-semibold">
											{record.opportunity.title}
										</p>
										<p class="text-xs">
											{formatShiftRange(record.shift, entry.event)}
										</p>
									</div>
									<span class="{chip.cls} flex shrink-0 items-center gap-1.5 text-xs">
										{#if chip.icon}
											{@const ChipIcon = chip.icon}
											<ChipIcon class="size-3" />
										{/if}
										{chip.label}
									</span>
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			{/if}
		</section>
	{/if}
</div>
