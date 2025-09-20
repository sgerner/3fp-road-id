<script>
	import IconLoader from '@lucide/svelte/icons/loader-2';

	export let eventDetails;
	export let opportunities = [];
	export let customQuestions = [];
	export let eventEmails = [];
	export let saveError = '';
	export let saveSuccess = '';
	export let saving = false;
	export let onSubmit = () => {};
	export let onSaveDraft = null;
	export let saveIntent = 'publish';

	function parseLocalDateTime(value) {
		if (!value) return null;
		const [datePart, timePart = '00:00'] = value.split('T');
		if (!datePart) return null;
		const [year, month, day] = datePart.split('-').map(Number);
		if (!year || !month || !day) return null;
		const [hour = 0, minute = 0] = timePart.split(':').map(Number);
		return new Date(Date.UTC(year, month - 1, day, hour, minute));
	}

	function formatEventRange(details) {
		if (!details) return 'TBD';
		const { eventStart, eventEnd, timezone } = details;
		const startDate = parseLocalDateTime(eventStart);
		if (!startDate) return 'TBD';
		const endDate = parseLocalDateTime(eventEnd);
		const tz = timezone || 'UTC';
		try {
			const dateFormatter = new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeZone: tz
			});
			const timeFormatter = new Intl.DateTimeFormat(undefined, {
				timeStyle: 'short',
				timeZone: tz
			});
			const startDateLabel = dateFormatter.format(startDate);
			const startTimeLabel = timeFormatter.format(startDate);
			let result = `${startDateLabel} · ${startTimeLabel}`;
			if (endDate) {
				const endDateLabel = dateFormatter.format(endDate);
				const endTimeLabel = timeFormatter.format(endDate);
				if (startDateLabel === endDateLabel) {
					result += ` — ${endTimeLabel}`;
				} else {
					result += ` → ${endDateLabel} · ${endTimeLabel}`;
				}
			}
			if (timezone) {
				result += ` (${timezone})`;
			}
			return result;
		} catch {
			return `${eventStart || 'TBD'}${eventEnd ? ` → ${eventEnd}` : ''}`;
		}
	}

	$: whenSummary = formatEventRange(eventDetails);
</script>

<div class="space-y-6">
	<div class="border-primary-500/30 bg-primary-500/10 rounded border p-4">
		<h3 class="text-primary-100 font-semibold">Event snapshot</h3>
		<ul class="text-primary-50 mt-3 space-y-1 text-sm">
			<li><strong>Title:</strong> {eventDetails.title || 'Unnamed event'}</li>
			<li><strong>When:</strong> {whenSummary}</li>
			<li><strong>Where:</strong> {eventDetails.locationName || 'Meetup TBD'}</li>
			<li><strong>Opportunities:</strong> {opportunities.length}</li>
			<li><strong>Custom questions:</strong> {customQuestions.length}</li>
			<li><strong>Emails queued:</strong> {eventEmails.length}</li>
		</ul>
	</div>

	{#if saveError}
		<p class="border-error-500/40 bg-error-500/10 text-error-200 rounded border p-3 text-sm">
			{saveError}
		</p>
	{/if}
	{#if saveSuccess}
		<p class="border-success-500/40 bg-success-500/10 text-success-200 rounded border p-3 text-sm">
			{saveSuccess}
		</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<p class="text-surface-500 text-sm">
			Publish now or save a draft to finish later. Either way, you can revisit this builder to tweak
			opportunities, shifts, and messaging when needed.
		</p>
		<div class="flex flex-col gap-2 md:flex-row">
			<button
				type="button"
				class="btn preset-tonal-surface-500 flex items-center gap-2"
				onclick={() => onSaveDraft?.()}
				disabled={saving}
			>
				{#if saving && saveIntent === 'draft'}
					<IconLoader class="h-4 w-4 animate-spin" />
				{/if}
				<span>{saving && saveIntent === 'draft' ? 'Saving draft…' : 'Save draft'}</span>
			</button>
			<button
				type="button"
				class="btn preset-filled-primary-500 flex items-center gap-2"
				onclick={onSubmit}
				disabled={saving}
			>
				{#if saving && saveIntent === 'publish'}
					<IconLoader class="h-4 w-4 animate-spin" />
				{/if}
				<span>
					{#if saving && saveIntent === 'publish'}
						Publishing…
					{:else}
						Publish volunteer event
					{/if}
				</span>
			</button>
		</div>
	</div>
</div>
