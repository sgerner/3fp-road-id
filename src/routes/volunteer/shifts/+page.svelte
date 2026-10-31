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

	function statusChip(record) {
		const { assignment, statusLabel } = record;
		if (assignment.cancelled_at || (assignment.status ?? '').toLowerCase() === 'cancelled') {
			return {
				label: statusLabel,
				cls: 'bg-tertiary-500 text-surface-950',
				icon: XCircle
			};
		}
		if ((assignment.status ?? '').toLowerCase() === 'confirmed' || assignment.confirmed_at) {
			return {
				label: statusLabel,
				cls: 'bg-primary-500 text-surface-950',
				icon: CheckCircle2
			};
		}
		if ((assignment.status ?? '').toLowerCase() === 'approved') {
			return {
				label: statusLabel,
				cls: 'bg-secondary-500 text-surface-50',
				icon: Check
			};
		}
		if ((assignment.status ?? '').toLowerCase() === 'waitlisted') {
			return {
				label: statusLabel,
				cls: 'border-2 border-primary-500 text-primary-500',
				icon: Clock
			};
		}
		return {
			label: statusLabel,
			cls: 'border-2 border-surface-50 text-surface-50',
			icon: Clock
		};
	}

	function feedbackClasses(type) {
		if (type === 'success') return 'bg-primary-500 text-surface-950';
		if (type === 'info') return 'bg-secondary-500 text-surface-50';
		return 'bg-tertiary-500 text-surface-950';
	}
</script>

<svelte:head>
	<title>My Volunteer Shifts</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 border-surface-950 border-b-[3px] px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
	>
		<div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
			<div class="flex flex-col gap-5">
				<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
					<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
					<span>Volunteer Hub</span>
				</p>
				<h1
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.2vw,6.75rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
				>
					My Shifts
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium sm:text-xl">
					Confirm your spot within {confirmWindowHours} hours of start time, reschedule into an open shift,
					or cancel if plans change.
				</p>
			</div>
			<a
				href="/volunteer"
				class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex shrink-0 items-center gap-3 self-start px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline lg:self-end"
			>
				<span>Find opportunities</span>
				<ArrowRight class="size-5 transition group-hover:translate-x-1" />
			</a>
		</div>
	</header>

	<!-- FEEDBACK BANNERS -->
	{#if feedback}
		<div
			class="border-surface-950 flex items-center gap-3 border-b-[3px] px-6 py-4 sm:px-10 lg:px-14 {feedbackClasses(
				feedback.type
			)}"
		>
			{#if feedback.type === 'success'}
				<CheckCircle2 class="size-5 shrink-0" />
			{:else}
				<AlertCircle class="size-5 shrink-0" />
			{/if}
			<p class="m-0 text-sm font-black uppercase">{feedback.message}</p>
		</div>
	{/if}

	{#if submissionError}
		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex items-center gap-3 border-b-[3px] px-6 py-4 sm:px-10 lg:px-14"
		>
			<AlertCircle class="size-5 shrink-0" />
			<p class="m-0 text-sm font-black uppercase">{submissionError}</p>
		</div>
	{/if}

	<div
		class="bg-surface-950 text-surface-50 flex flex-col gap-16 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
	>
		{#if !user}
			<!-- SIGNED-OUT STATE -->
			<section class="border-surface-50 flex flex-col gap-5 border-t-2 pt-8">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<ClipboardList class="size-4" />
					<span>Roster access</span>
				</p>
				<h2
					class="text-surface-50! m-0 text-3xl leading-[0.92] font-black uppercase italic sm:text-5xl"
				>
					Sign in to see your shifts
				</h2>
				<p class="text-surface-300 m-0 max-w-xl text-lg leading-relaxed">
					Sign in to confirm, cancel, or reschedule your shifts here.
				</p>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex w-fit items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
					onclick={(event) => {
						event.stopPropagation();
						window.dispatchEvent(new Event('open-login'));
					}}
				>
					Sign in
				</button>
			</section>
		{:else}
			<!-- UPCOMING SHIFTS -->
			<section class="flex flex-col gap-8" aria-labelledby="upcoming-shifts-heading">
				<div class="flex flex-wrap items-center gap-4">
					<h2
						id="upcoming-shifts-heading"
						class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
					>
						Upcoming shifts
					</h2>
					{#if upcomingEvents.length}
						<span class="bg-primary-500 text-surface-950 px-3 py-1 text-sm font-black tabular-nums">
							{upcomingEvents.length}
						</span>
					{/if}
				</div>

				{#if !upcomingEvents.length}
					<div class="border-surface-50 flex flex-col gap-4 border-t-2 pt-8">
						<div
							class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<CalendarClock class="size-4" />
							<span>Schedule open</span>
						</div>
						<p class="text-surface-300 m-0 text-lg">No upcoming shifts yet.</p>
						<div>
							<a
								href="/volunteer"
								class="group bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
							>
								Browse volunteer opportunities
								<ArrowRight class="size-4 transition group-hover:translate-x-1" />
							</a>
						</div>
					</div>
				{:else}
					<div class="border-surface-50 divide-surface-800 divide-y-2 border-t-2">
						{#each upcomingEvents as entry, i (entry.event.id)}
							<article class="flex flex-col gap-6 py-8">
								<!-- Event header -->
								<header class="flex items-start gap-4 sm:gap-6">
									<span
										class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-5xl"
									>
										{String(i + 1).padStart(2, '0')}
									</span>
									<div class="flex min-w-0 flex-1 flex-col gap-2">
										{#if entry.event.slug}
											<a
												class="text-surface-50 hover:text-primary-500 text-2xl leading-tight font-black uppercase italic hover:no-underline sm:text-3xl"
												href={`/volunteer/${entry.event.slug}`}
											>
												{entry.event.title}
											</a>
										{:else}
											<h3
												class="text-surface-50! m-0 text-2xl leading-tight font-black uppercase italic sm:text-3xl"
											>
												{entry.event.title}
											</h3>
										{/if}

										<div
											class="text-surface-300 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold tracking-wide uppercase"
										>
											{#if formatEventRange(entry.event)}
												<span class="text-primary-500 flex items-center gap-1.5">
													<CalendarClock class="size-4" />
													{formatEventRange(entry.event)}
												</span>
											{/if}
											<span class="flex items-center gap-1.5">
												<MapPin class="text-tertiary-500 size-4" />
												{formatLocation(null, entry.event).join(', ')}
											</span>
										</div>
									</div>
								</header>

								<!-- Assignments -->
								<div class="border-surface-800 divide-surface-800 divide-y border-t lg:ml-20">
									{#each entry.assignments as record (record.id)}
										{@const chip = statusChip(record)}
										<div
											class={`py-5 ${isHighlighted(record.id) ? 'bg-secondary-500/20 px-4' : ''}`}
										>
											<div
												class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
											>
												<!-- Left: shift info -->
												<div class="flex min-w-0 flex-col gap-2">
													<p class="text-surface-50 m-0 text-lg font-black uppercase">
														{record.opportunity.title}
													</p>
													<p
														class="text-surface-300 m-0 flex items-center gap-1.5 text-sm font-medium"
													>
														<Clock class="text-primary-500 size-4 shrink-0" />
														{formatShiftRange(record.shift, entry.event)}
													</p>

													<!-- Status chip -->
													<div class="flex items-center gap-2 pt-1">
														<span
															class="{chip.cls} inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
														>
															{#if chip.icon}
																{@const ChipIcon = chip.icon}
																<ChipIcon class="size-3.5" />
															{/if}
															{chip.label}
														</span>
													</div>

													<!-- Confirm blocked reason -->
													{#if !record.canConfirm && !record.assignment.cancelled_at && record.confirmBlockedReason !== 'already_confirmed' && record.confirmBlockedReason !== 'cancelled'}
														<p class="text-surface-300 m-0 text-xs">
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
																<button
																	type="submit"
																	class="border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-surface-950 border-2 px-4 py-2 text-xs font-black tracking-wide uppercase transition"
																>
																	Re-activate
																</button>
															</form>
														{:else}
															{#if !record.assignment.confirmed_at && !record.assignment.cancelled_at}
																<form method="POST" action="?/confirm">
																	<input type="hidden" name="assignment_id" value={record.id} />
																	<button
																		type="submit"
																		class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black tracking-wide uppercase transition disabled:opacity-40"
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
																		class="border-tertiary-500 text-tertiary-400 hover:bg-tertiary-500 hover:text-surface-950 border-2 px-4 py-2 text-xs font-black tracking-wide uppercase transition disabled:opacity-40"
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
												<div class="border-surface-800 mt-4 border-t pt-3">
													<button
														type="button"
														class="text-surface-300 hover:text-primary-500 flex w-full items-center justify-between gap-2 text-xs font-black tracking-[0.16em] uppercase transition"
														onclick={() => toggleReschedule(record.id)}
													>
														<span class="flex items-center gap-2">
															<RefreshCcw class="size-3.5" />
															Reschedule
														</span>
														{#if isRescheduleOpen(record.id)}
															<ChevronUp class="size-4" />
														{:else}
															<ChevronDown class="size-4" />
														{/if}
													</button>

													{#if isRescheduleOpen(record.id)}
														{#if availableOptions(entry, record).length}
															<form
																method="POST"
																action="?/reschedule"
																class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
															>
																<input type="hidden" name="assignment_id" value={record.id} />
																<div class="flex flex-1 flex-col gap-1.5">
																	<label
																		class="text-primary-500 text-xs font-bold tracking-[0.2em] uppercase"
																		for={`reschedule-${record.id}`}
																	>
																		Choose a new shift
																	</label>
																	<select
																		id={`reschedule-${record.id}`}
																		class="border-surface-50 bg-surface-900 text-surface-50 border-2 px-3 py-2.5 text-sm font-medium"
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
																</div>
																<button
																	type="submit"
																	class="bg-primary-500 text-surface-950 hover:bg-surface-50 shrink-0 px-5 py-2.5 text-xs font-black tracking-wide uppercase transition"
																>
																	Update shift
																</button>
															</form>
														{:else}
															<p class="text-surface-300 m-0 mt-3 text-xs">
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
					</div>
				{/if}
			</section>

			<!-- Lane divider -->
			<div
				class="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
				aria-hidden="true"
			></div>

			<!-- PAST SHIFTS -->
			<section class="flex flex-col gap-8" aria-labelledby="past-shifts-heading">
				<div class="flex flex-wrap items-center gap-4">
					<h2
						id="past-shifts-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
					>
						Past shifts
					</h2>
					{#if pastEvents.length}
						<span
							class="border-surface-50 text-surface-50 border-2 px-3 py-0.5 text-sm font-black tabular-nums"
						>
							{pastEvents.length}
						</span>
					{/if}
				</div>

				{#if !pastEvents.length}
					<div class="border-surface-800 border-t pt-6">
						<p class="text-surface-300 m-0 text-sm">No past shifts yet.</p>
					</div>
				{:else}
					<div class="border-surface-50 divide-surface-800 divide-y border-t-2">
						{#each pastEvents as entry (entry.event.id)}
							<article class="flex flex-col gap-4 py-6">
								<header class="flex flex-wrap items-baseline justify-between gap-2">
									<p class="text-surface-50 m-0 text-xl font-black uppercase italic">
										{entry.event.title}
									</p>
									{#if formatEventRange(entry.event)}
										<p
											class="text-surface-300 m-0 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase"
										>
											<CalendarClock class="size-3.5" />
											{formatEventRange(entry.event)}
										</p>
									{/if}
								</header>

								<ul
									class="border-surface-800 divide-surface-800 m-0 list-none divide-y border-t p-0"
								>
									{#each entry.assignments as record (record.id)}
										{@const chip = statusChip(record)}
										<li class="flex items-center justify-between gap-3 py-3">
											<div class="flex min-w-0 flex-col gap-0.5">
												<p class="text-surface-50 m-0 text-sm font-bold uppercase">
													{record.opportunity.title}
												</p>
												<p class="text-surface-300 m-0 text-xs">
													{formatShiftRange(record.shift, entry.event)}
												</p>
											</div>
											<span
												class="{chip.cls} inline-flex shrink-0 items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.14em] uppercase"
											>
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
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>
