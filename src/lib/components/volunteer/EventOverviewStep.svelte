<script>
	import HostOrganizationSelector from '#lib/components/groups/HostOrganizationSelector.svelte';

	/** @type {Record<string, any>} */
	export let eventDetails;
	/** @type {any[]} */
	export let eventTypeOptions = [];
	/** @type {any[]} */
	export let statusOptions = [];
	/** @type {string[]} */
	export let timezoneOptions = [];
	/** @type {any[]} */
	export let hostGroups = [];
	export let initialHostGroupId = '';
	export let sponsorshipGroupId = '';
	export let sponsorshipMessage = '';
	/** @type {any} */
	export let activeSponsorshipRequest = null;
	export let immediateSponsorshipMode = false;
	export let eventId = '';
	export let showStatusField = false;
	export let currentEventTypeDescription = '';
	/** @type {(patch: Record<string, any>) => any} */
	export let onEventDetailsChange = () => {};
	/** @type {(groupId: string) => any} */
	export let onHostGroupChange = () => {};
	/** @type {(payload: { groupId: string, message: string }) => any} */
	export let onSponsorshipChange = () => {};
	/** @type {(request: any) => any} */
	export let onActiveSponsorshipRequestChange = () => {};
	/** @type {(group: any) => any} */
	export let onGroupClaimed = () => {};
</script>

<div class="grid gap-4 md:grid-cols-2">
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-title">Event title *</label>
		<input
			id="event-title"
			class="input preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.title}
			required
			oninput={(e) => onEventDetailsChange({ title: e.currentTarget.value })}
			placeholder="Community Bike Festival"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-type">Event type *</label>
		<select
			id="event-type"
			class="select preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.eventTypeSlug}
			onchange={(e) => onEventDetailsChange({ eventTypeSlug: e.currentTarget.value })}
		>
			{#each eventTypeOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		{#if currentEventTypeDescription}
			<p class="text-surface-600-400 text-xs">{currentEventTypeDescription}</p>
		{/if}
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-start">Start *</label>
		<input
			id="event-start"
			type="datetime-local"
			required
			class="input preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.eventStart}
			oninput={(e) => onEventDetailsChange({ eventStart: e.currentTarget.value })}
			onchange={(e) => onEventDetailsChange({ eventStart: e.currentTarget.value })}
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-end">End</label>
		<input
			id="event-end"
			type="datetime-local"
			class="input preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.eventEnd}
			oninput={(e) => onEventDetailsChange({ eventEnd: e.currentTarget.value })}
			onchange={(e) => onEventDetailsChange({ eventEnd: e.currentTarget.value })}
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-timezone">Timezone</label>
		<select
			id="event-timezone"
			class="select preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.timezone}
			onchange={(e) => onEventDetailsChange({ timezone: e.currentTarget.value })}
		>
			{#each timezoneOptions as tz}
				<option value={tz}>{tz}</option>
			{/each}
		</select>
	</div>
	{#if showStatusField}
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-800-200 text-sm font-medium" for="event-status">Status</label>
			<select
				id="event-status"
				class="select preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
				value={eventDetails.status}
				onchange={(e) => onEventDetailsChange({ status: e.currentTarget.value })}
			>
				{#each statusOptions as option}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</div>
	{/if}
	<div class="min-w-0 md:col-span-2">
		<HostOrganizationSelector
			{hostGroups}
			hostGroupId={eventDetails.hostGroupId || ''}
			{initialHostGroupId}
			{sponsorshipGroupId}
			{sponsorshipMessage}
			{activeSponsorshipRequest}
			{immediateSponsorshipMode}
			eventType="volunteer"
			{eventId}
			label="Host organization (optional)"
			helperText="Leave blank if hosting independently without an organization."
			inputId="volunteer-host-organization"
			{onHostGroupChange}
			{onSponsorshipChange}
			{onActiveSponsorshipRequestChange}
			{onGroupClaimed}
		/>
	</div>
	<div class="flex flex-col gap-1.5 md:col-span-2">
		<label class="text-surface-800-200 text-sm font-medium" for="event-summary">Short summary</label
		>
		<input
			id="event-summary"
			class="input preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2"
			value={eventDetails.summary}
			oninput={(e) => onEventDetailsChange({ summary: e.currentTarget.value })}
			placeholder="Neighborhood celebration with repair stations, youth rodeo, and info booths."
		/>
	</div>
	<div class="flex flex-col gap-1.5 md:col-span-2">
		<label class="text-surface-800-200 text-sm font-medium" for="event-description"
			>Full description <span class="text-surface-600-400 font-normal">(optional)</span></label
		>
		<textarea
			id="event-description"
			class="textarea preset-tonal-surface min-h-32 w-full rounded-lg px-4 py-2"
			value={eventDetails.description}
			oninput={(e) => onEventDetailsChange({ description: e.currentTarget.value })}
			placeholder="Share the vibe, call out volunteer roles, and explain why the event matters."
		></textarea>
	</div>
</div>
