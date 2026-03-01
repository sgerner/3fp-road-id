<script>
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClipboardList from '@lucide/svelte/icons/clipboard-list';
	import IconCopyPlus from '@lucide/svelte/icons/copy-plus';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';

	const { data } = $props();

	const hostedEvents = $derived((data?.hostedEvents ?? []).filter(Boolean));

	const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function parseDate(value) {
		if (!value) return null;
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function eventDateRange(event) {
		const start = parseDate(event?.event_start);
		const end = parseDate(event?.event_end);
		if (!start) return 'Date to be announced';
		if (!end || start.toDateString() === end.toDateString()) return dateFormatter.format(start);
		return `${dateFormatter.format(start)} → ${dateFormatter.format(end)}`;
	}

	function eventTimeRange(event) {
		const start = parseDate(event?.event_start);
		const end = parseDate(event?.event_end);
		if (!start) return '';
		if (!end || start.toDateString() !== end.toDateString()) return timeFormatter.format(start);
		return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
	}

	function statusPreset(status) {
		switch ((status ?? '').toLowerCase()) {
			case 'published':
				return 'chip preset-tonal-success';
			case 'draft':
				return 'chip preset-tonal-warning';
			case 'cancelled':
				return 'chip preset-tonal-error';
			default:
				return 'chip preset-tonal-surface';
		}
	}
</script>

<svelte:head>
	<title>Hosted Volunteer Events</title>
</svelte:head>

<section class="mx-auto w-full max-w-5xl space-y-6">
	<header class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="space-y-1">
				<h1 class="m-0 text-3xl font-bold">Hosted Volunteer Events</h1>
				<p class="text-surface-600-400 text-sm">
					View and manage every volunteer event you host or oversee.
				</p>
			</div>
			<a href="/volunteer/new" class="btn preset-outlined-secondary-500">
				<IconPlus class="h-4 w-4" />
				Create Event
			</a>
		</div>
	</header>

	{#if hostedEvents.length === 0}
		<div class="border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-6 text-center">
			<h2 class="text-xl font-semibold">No hosted events yet</h2>
			<p class="text-surface-600-400 mt-2 text-sm">
				Create a volunteer event to start collecting signups and managing shifts.
			</p>
		</div>
	{:else}
		<ul class="space-y-3">
			{#each hostedEvents as event (event.id)}
				<li class="border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-4">
					<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div class="space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class={statusPreset(event.status)}>
									{event.status ?? 'unknown'}
								</span>
								{#if event.hostGroup?.name}
									<span class="chip preset-tonal-tertiary">{event.hostGroup.name}</span>
								{/if}
							</div>
							<a
								href={`/volunteer/${event.slug}`}
								class="text-secondary-800-200 text-xl font-semibold hover:underline"
							>
								{event.title}
							</a>
							<div class="text-surface-700-300 flex flex-wrap items-center gap-3 text-sm">
								<span class="inline-flex items-center gap-1.5">
									<IconCalendar class="h-4 w-4" />
									{eventDateRange(event)}
								</span>
								{#if eventTimeRange(event)}
									<span>{eventTimeRange(event)}</span>
								{/if}
							</div>
						</div>
						<div class="flex flex-wrap items-center gap-2 md:justify-end">
							<a class="btn btn-sm preset-tonal-surface" href={`/volunteer/${event.slug}`}>
								View
							</a>
							<a
								class="btn btn-sm preset-outlined-primary-500"
								href={`/volunteer/${event.slug}/edit`}
							>
								<IconSquarePen class="h-4 w-4" />
								Edit
							</a>
							<a
								class="btn btn-sm preset-outlined-secondary-500"
								href={`/volunteer/new?clone=${encodeURIComponent(event.slug || event.id)}`}
							>
								<IconCopyPlus class="h-4 w-4" />
								Clone
							</a>
							<a class="btn btn-sm preset-tonal-tertiary" href={`/volunteer/${event.slug}/manage`}>
								<IconClipboardList class="h-4 w-4" />
								Manage
							</a>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
