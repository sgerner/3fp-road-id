<script>
	import { Combobox } from '@skeletonlabs/skeleton-svelte';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';

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
</script>

<section class="space-y-6">
	<div class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-200 text-sm font-medium" for="event-title">Event title *</label>
			<input
				id="event-title"
				class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
				value={eventDetails.title}
				oninput={(e) => onEventDetailsChange({ title: e.currentTarget.value })}
				placeholder="Community Bike Festival"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-200 text-sm font-medium" for="event-type">Event type *</label>
			<select
				id="event-type"
				class="select preset-tonal-surface w-full rounded-lg px-4 py-2"
				value={eventDetails.eventTypeSlug}
				onchange={(e) => onEventDetailsChange({ eventTypeSlug: e.currentTarget.value })}
			>
				{#each eventTypeOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			{#if currentEventTypeDescription}
				<p class="text-surface-400 text-xs">{currentEventTypeDescription}</p>
			{/if}
		</div>
		<div class="flex flex-col gap-1.5">
			<Combobox
				data={filteredHostGroupOptions}
				key="value"
				defaultValue={hostGroupSelection}
				value={hostGroupSelection}
				onValueChange={(e) => onHostGroupValueChange(e.value)}
				onInputValueChange={(e) => onHostGroupSearch(e.inputValue)}
				label="Host group (optional)"
				placeholder={hasHostGroups ? 'Search groups…' : 'No groups available'}
				classes="w-full"
				inputGroupClasses="preset-tonal-surface"
				contentClasses="bg-surface-100-900"
			/>
			{#if hostGroupSelection.length}
				<button
					type="button"
					class="text-primary-400 text-left text-xs underline"
					onclick={onClearHostGroup}
				>
					Clear selection
				</button>
			{:else}
				<p class="text-surface-500 text-xs">Leave blank if not tied to a host group.</p>
			{/if}
		</div>
		<div class="flex flex-col gap-1.5 md:col-span-2">
			<label class="text-surface-200 text-sm font-medium" for="event-summary">Short summary</label>
			<input
				id="event-summary"
				class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
				value={eventDetails.summary}
				oninput={(e) => onEventDetailsChange({ summary: e.currentTarget.value })}
				placeholder="Neighborhood celebration with repair stations, youth rodeo, and info booths."
			/>
		</div>
		<div class="flex flex-col gap-1.5 md:col-span-2">
			<label class="text-surface-200 text-sm font-medium" for="event-description"
				>Full description <span class="text-surface-500 font-normal">(optional)</span></label
			>
			<textarea
				id="event-description"
				class="textarea preset-tonal-surface min-h-36 w-full rounded-lg px-4 py-2"
				value={eventDetails.description}
				oninput={(e) => onEventDetailsChange({ description: e.currentTarget.value })}
				placeholder="Share the vibe, call out volunteer roles, and explain why the event matters."
			></textarea>
		</div>
	</div>

	<button
		type="button"
		class="text-primary-400 hover:text-primary-300 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
		onclick={onToggleAdvanced}
	>
		{#if showAdvancedSettings}
			<IconChevronUp class="h-4 w-4" />
			<span>Hide advanced settings</span>
		{:else}
			<IconChevronDown class="h-4 w-4" />
			<span>Show advanced settings</span>
		{/if}
	</button>

	{#if showAdvancedSettings}
		<div class="grid gap-4 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<label class="text-surface-200 text-sm font-medium" for="event-status">Status</label>
				<select
					id="event-status"
					class="select preset-tonal-surface w-full rounded-lg px-4 py-2"
					value={eventDetails.status}
					onchange={(e) => onEventDetailsChange({ status: e.currentTarget.value })}
				>
					{#each statusOptions as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="text-surface-200 text-sm font-medium" for="event-max-volunteers"
					>Max volunteers</label
				>
				<input
					id="event-max-volunteers"
					class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
					type="number"
					value={eventDetails.maxVolunteers}
					oninput={(e) => onEventDetailsChange({ maxVolunteers: e.currentTarget.value })}
					min="0"
					placeholder="Leave blank for open capacity"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label class="text-surface-200 text-sm font-medium" for="event-require-approval"
					>Signup approval</label
				>
				<label class="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						id="event-require-approval"
						checked={eventDetails.requireSignupApproval}
						onchange={(e) =>
							onEventDetailsChange({ requireSignupApproval: e.currentTarget.checked })}
					/>
					<span class="text-surface-300">Hold signups for host approval</span>
				</label>
			</div>
			<div class="flex flex-col gap-2">
				<label class="text-surface-200 text-sm font-medium" for="event-waitlist">Waitlist</label>
				<label class="flex items-center gap-3 text-sm">
					<input
						type="checkbox"
						id="event-waitlist"
						checked={eventDetails.waitlistEnabled}
						onchange={(e) => onEventDetailsChange({ waitlistEnabled: e.currentTarget.checked })}
					/>
					<span class="text-surface-300">Allow automated waitlist when full</span>
				</label>
			</div>
		</div>
	{/if}
</section>
