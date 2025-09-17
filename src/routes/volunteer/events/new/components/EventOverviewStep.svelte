<script>
	import { Combobox } from '@skeletonlabs/skeleton-svelte';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconLoader from '@lucide/svelte/icons/loader-2';

	export let eventDetails;
	export let eventTypeOptions = [];
	export let statusOptions = [];
	export let hostGroupSelection = [];
	export let filteredHostGroupOptions = [];
	export let showAdvancedSettings = false;
	export let currentEventTypeDescription = '';
	export let hasHostGroups = false;
	export let onEventDetailsChange = () => {};
	export let onHostGroupValueChange = () => {};
	export let onHostGroupSearch = () => {};
	export let onClearHostGroup = () => {};
	export let onToggleAdvanced = () => {};
	export let slugCheckInFlight = false;
</script>

<section class="space-y-6">
	<div class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col gap-2">
			<label class="label" for="event-title">Event title *</label>
			<input
				id="event-title"
				class="input bg-surface-900/60"
				value={eventDetails.title}
				oninput={(e) => onEventDetailsChange({ title: e.currentTarget.value })}
				placeholder="Community Bike Festival"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<label class="label" for="event-type">Event type *</label>
			<select
				id="event-type"
				class="select bg-surface-900/60"
				value={eventDetails.eventTypeSlug}
				onchange={(e) => onEventDetailsChange({ eventTypeSlug: e.currentTarget.value })}
			>
				{#each eventTypeOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			{#if currentEventTypeDescription}
				<p class="text-xs text-surface-500">{currentEventTypeDescription}</p>
			{/if}
		</div>
		<div class="flex flex-col gap-2">
			<label class="label" for="event-public-link">Public link</label>
			<div
				id="event-public-link"
				class="input bg-surface-900/40 flex items-center justify-between gap-2 text-sm"
			>
				<code class="text-primary-200">/volunteer/events/{eventDetails.slug || 'your-event'}</code>
				{#if slugCheckInFlight}
					<span class="inline-flex items-center gap-1 text-xs text-primary-200">
						<IconLoader class="h-3 w-3 animate-spin" />
						Checking…
					</span>
				{/if}
			</div>
			<p class="text-xs text-surface-500">Slug updates automatically as you edit the title.</p>
		</div>
		<div class="flex flex-col gap-2">
			<Combobox
				data={filteredHostGroupOptions}
				value={hostGroupSelection}
				onValueChange={(e) => onHostGroupValueChange(e.value)}
				onInputValueChange={(e) => onHostGroupSearch(e.inputValue)}
				label="Host group (Optional)"
				placeholder={hasHostGroups ? 'Search groups…' : 'No groups available'}
				classes="w-full"
				inputGroupClasses="bg-surface-900/60"
				contentClasses="bg-surface-900"
			/>
			{#if hostGroupSelection.length}
				<button
					type="button"
					class="text-left text-xs text-primary-300 underline"
					onclick={onClearHostGroup}
				>
					Clear selection
				</button>
			{:else}
				<p class="text-xs text-surface-500">Leave blank if this event is not owned by a host group.</p>
			{/if}
		</div>
		<div class="md:col-span-2 flex flex-col gap-2">
			<label class="label" for="event-summary">Short summary</label>
			<input
				id="event-summary"
				class="input bg-surface-900/60"
				value={eventDetails.summary}
				oninput={(e) => onEventDetailsChange({ summary: e.currentTarget.value })}
				placeholder="Neighborhood celebration with repair stations, youth rodeo, and info booths."
			/>
		</div>
		<div class="md:col-span-2 flex flex-col gap-2">
			<label class="label" for="event-description">Full description</label>
			<textarea
				id="event-description"
				class="textarea min-h-36 bg-surface-900/60"
				value={eventDetails.description}
				oninput={(e) => onEventDetailsChange({ description: e.currentTarget.value })}
				placeholder="Share the vibe, call out volunteer roles, and explain why the event matters."
			></textarea>
		</div>
	</div>

	<button
		type="button"
		class="inline-flex items-center gap-2 text-sm font-semibold text-primary-300"
		onclick={onToggleAdvanced}
	>
		{#if showAdvancedSettings}
			<IconChevronUp class="h-4 w-4" />
			<span>Hide advanced event settings</span>
		{:else}
			<IconChevronDown class="h-4 w-4" />
			<span>Show advanced event settings</span>
		{/if}
	</button>

	{#if showAdvancedSettings}
		<div class="grid gap-4 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label class="label" for="event-status">Status</label>
				<select
					id="event-status"
					class="select bg-surface-900/60"
					value={eventDetails.status}
					onchange={(e) => onEventDetailsChange({ status: e.currentTarget.value })}
				>
					{#each statusOptions as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
			<div class="flex flex-col gap-2">
				<label class="label" for="event-max-volunteers">Max volunteers</label>
				<input
					id="event-max-volunteers"
					class="input bg-surface-900/60"
					type="number"
					value={eventDetails.maxVolunteers}
					oninput={(e) => onEventDetailsChange({ maxVolunteers: e.currentTarget.value })}
					min="0"
					placeholder="Leave blank for open capacity"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label class="label" for="event-require-approval">Signup approval required?</label>
				<label class="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						id="event-require-approval"
						checked={eventDetails.requireSignupApproval}
						onchange={(e) => onEventDetailsChange({ requireSignupApproval: e.currentTarget.checked })}
					/>
					<span>Hold signups for host approval</span>
				</label>
			</div>
			<div class="flex flex-col gap-2">
				<label class="label" for="event-waitlist">Waitlist enabled?</label>
				<label class="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						id="event-waitlist"
						checked={eventDetails.waitlistEnabled}
						onchange={(e) => onEventDetailsChange({ waitlistEnabled: e.currentTarget.checked })}
					/>
					<span>Allow automated waitlist when full</span>
				</label>
			</div>
		</div>
	{/if}
</section>
