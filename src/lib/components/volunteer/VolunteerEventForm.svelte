<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconSave from '@lucide/svelte/icons/save';
	import IconCheck from '@lucide/svelte/icons/check';
	import EventOverviewStep from './EventOverviewStep.svelte';
	import ScheduleStep from './ScheduleStep.svelte';
	import RolesStep from './RolesStep.svelte';
	import SignupQuestionsSection from './SignupQuestionsSection.svelte';
	import CommunicationsStep from './CommunicationsStep.svelte';

	let {
		mode = 'create',
		id = 'manual-builder',
		eventDetails,
		eventTypeOptions = [],
		statusOptions = [],
		timezoneOptions = [],
		opportunityTypeOptions = [],
		fieldTypeOptions = [],
		emailTypeOptions = [],
		hostGroupSelection = [],
		filteredHostGroupOptions = [],
		currentEventTypeDescription = '',
		hasHostGroups = false,
		opportunities = [],
		customQuestions = [],
		eventEmails = [],
		saving = false,
		saveIntent = 'publish',
		saveError = '',
		saveSuccess = '',
		capacityOpen = $bindable(false),
		rolesOpen = $bindable(false),
		questionsOpen = $bindable(false),
		remindersOpen = $bindable(false),
		onFocusIn = undefined,
		onEventDetailsChange = () => {},
		onHostGroupValueChange = () => {},
		onHostGroupSearch = () => {},
		onClearHostGroup = () => {},
		onAddOpportunity = () => {},
		onRemoveOpportunity = () => {},
		onUpdateOpportunity = () => {},
		onAddShift = () => {},
		onRemoveShift = () => {},
		onUpdateShift = () => {},
		onAddQuestion = () => {},
		onRemoveQuestion = () => {},
		onUpdateQuestion = () => {},
		onAddEmail = () => {},
		onRemoveEmail = () => {},
		onUpdateEmail = () => {},
		onSubmit = () => {},
		onSaveDraft = () => {}
	} = $props();

	const isEditMode = $derived(mode === 'edit');
	const isFormValid = $derived(
		Boolean(eventDetails?.title?.trim() && eventDetails?.eventTypeSlug && eventDetails?.eventStart)
	);

	const totalShifts = $derived(
		(opportunities ?? []).reduce((sum, opp) => sum + (opp?.shifts?.length ?? 0), 0)
	);

	const scheduledEmailCount = $derived(
		(eventEmails ?? []).filter(
			(email) => email && email.emailType !== 'immediate' && !email.lastSentAt
		).length
	);

	const capacitySummary = $derived.by(() => {
		const parts = [];
		const maxVal = String(eventDetails?.maxVolunteers ?? '').trim();
		parts.push(maxVal ? `Max ${maxVal}` : 'Open capacity');
		parts.push(eventDetails?.requireSignupApproval ? 'Approval required' : 'Auto-approve');
		parts.push(eventDetails?.waitlistEnabled ? 'Waitlist on' : 'No waitlist');
		return parts.join(' · ');
	});

	const rolesSummary = $derived.by(() => {
		const roleCount = opportunities?.length ?? 0;
		const roleLabel = `${roleCount} role${roleCount === 1 ? '' : 's'}`;
		const shiftLabel = `${totalShifts} shift${totalShifts === 1 ? '' : 's'}`;
		return `${roleLabel} · ${shiftLabel}`;
	});

	const questionsSummary = $derived.by(() => {
		const count = customQuestions?.length ?? 0;
		return count === 0 ? 'Optional' : `${count} question${count === 1 ? '' : 's'}`;
	});

	const remindersSummary = $derived.by(() => {
		return scheduledEmailCount === 0 ? 'None scheduled' : `${scheduledEmailCount} scheduled`;
	});
</script>

<div {id} class="space-y-6" onfocusin={onFocusIn}>
	<!-- ── 1. Required & Core Event Details (Upfront) ── -->
	<section
		id="section-event-details"
		class="card border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-xl border p-5 shadow-sm sm:p-6"
	>
		<div class="space-y-1">
			<h2 class="!text-left text-xl font-semibold">Event details</h2>
			<p class="text-surface-600-400 text-sm">
				Required details to publish your event, plus a public summary and description.
			</p>
		</div>

		<EventOverviewStep
			{eventDetails}
			{eventTypeOptions}
			{statusOptions}
			{timezoneOptions}
			{hostGroupSelection}
			{filteredHostGroupOptions}
			showStatusField={isEditMode}
			{currentEventTypeDescription}
			{hasHostGroups}
			{onEventDetailsChange}
			{onHostGroupValueChange}
			{onHostGroupSearch}
			{onClearHostGroup}
		/>
	</section>

	<!-- ── 2. Location & Contact (Upfront) ── -->
	<section
		id="section-location-contact"
		class="card border-surface-300-700 bg-surface-50-950/70 space-y-6 rounded-xl border p-5 shadow-sm sm:p-6"
	>
		<div class="space-y-1">
			<h2 class="!text-left text-xl font-semibold">Location &amp; contact</h2>
			<p class="text-surface-600-400 text-sm">
				Where volunteers meet and how they can reach the organizing crew.
			</p>
		</div>

		<ScheduleStep
			{eventDetails}
			{timezoneOptions}
			showDateTimeFields={false}
			{onEventDetailsChange}
		/>
	</section>

	<!-- ── 3. Progressive Section: Capacity & Signup Rules ── -->
	<details
		id="section-capacity-rules"
		bind:open={capacityOpen}
		class="card border-surface-300-700 bg-surface-50-950/70 overflow-hidden rounded-xl border shadow-sm"
	>
		<summary
			class="hover:bg-surface-500/5 focus-visible:ring-primary-400 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden"
		>
			<div class="min-w-0 space-y-0.5">
				<h2 class="!text-left text-lg font-semibold sm:text-xl">Capacity &amp; signup rules</h2>
				<p class="text-surface-600-400 text-xs sm:text-sm">
					Optional volunteer cap, host approval, and automated waitlist rules.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<span class="chip preset-tonal-surface hidden text-xs sm:inline-flex">
					{capacitySummary}
				</span>
				{#if capacityOpen}
					<IconChevronUp class="text-surface-700-300 h-5 w-5 shrink-0" />
				{:else}
					<IconChevronDown class="text-surface-700-300 h-5 w-5 shrink-0" />
				{/if}
			</div>
		</summary>

		<div class="border-surface-500/15 grid gap-4 border-t p-5 sm:p-6 md:grid-cols-2">
			<div class="flex flex-col gap-1.5 md:col-span-2">
				<label class="text-surface-800-200 text-sm font-medium" for="event-max-volunteers"
					>Max volunteers</label
				>
				<input
					id="event-max-volunteers"
					class="input preset-tonal-surface min-h-11 w-full rounded-lg px-4 py-2 md:max-w-sm"
					type="number"
					value={eventDetails.maxVolunteers}
					oninput={(e) => onEventDetailsChange({ maxVolunteers: e.currentTarget.value })}
					min="0"
					placeholder="Leave blank for open capacity"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<span class="text-surface-800-200 text-sm font-medium">Signup approval</span>
				<label
					for="event-require-approval"
					class="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
				>
					<input
						type="checkbox"
						id="event-require-approval"
						checked={eventDetails.requireSignupApproval}
						onchange={(e) =>
							onEventDetailsChange({ requireSignupApproval: e.currentTarget.checked })}
					/>
					<span class="text-surface-700-300">Hold signups for host approval</span>
				</label>
			</div>
			<div class="flex flex-col gap-1">
				<span class="text-surface-800-200 text-sm font-medium">Waitlist</span>
				<label for="event-waitlist" class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
					<input
						type="checkbox"
						id="event-waitlist"
						checked={eventDetails.waitlistEnabled}
						onchange={(e) => onEventDetailsChange({ waitlistEnabled: e.currentTarget.checked })}
					/>
					<span class="text-surface-700-300">Allow automated waitlist when full</span>
				</label>
			</div>
		</div>
	</details>

	<!-- ── 4. Progressive Section: Roles & Shifts ── -->
	<details
		id="section-roles-shifts"
		bind:open={rolesOpen}
		class="card border-surface-300-700 bg-surface-50-950/70 overflow-hidden rounded-xl border shadow-sm"
	>
		<summary
			class="hover:bg-surface-500/5 focus-visible:ring-primary-400 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden"
		>
			<div class="min-w-0 space-y-0.5">
				<h2 class="!text-left text-lg font-semibold sm:text-xl">Roles &amp; shifts</h2>
				<p class="text-surface-600-400 text-xs sm:text-sm">
					Define volunteer crew roles, shift windows, and per-role capacity.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<span class="chip preset-tonal-surface text-xs">{rolesSummary}</span>
				{#if rolesOpen}
					<IconChevronUp class="text-surface-700-300 h-5 w-5 shrink-0" />
				{:else}
					<IconChevronDown class="text-surface-700-300 h-5 w-5 shrink-0" />
				{/if}
			</div>
		</summary>

		<div class="border-surface-500/15 border-t p-5 sm:p-6">
			<RolesStep
				{opportunities}
				{opportunityTypeOptions}
				{onAddOpportunity}
				{onRemoveOpportunity}
				{onUpdateOpportunity}
				{onAddShift}
				{onRemoveShift}
				{onUpdateShift}
			/>
		</div>
	</details>

	<!-- ── 5. Progressive Section: Signup Questions ── -->
	<details
		id="section-signup-questions"
		bind:open={questionsOpen}
		class="card border-surface-300-700 bg-surface-50-950/70 overflow-hidden rounded-xl border shadow-sm"
	>
		<summary
			class="hover:bg-surface-500/5 focus-visible:ring-primary-400 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden"
		>
			<div class="min-w-0 space-y-0.5">
				<h2 class="!text-left text-lg font-semibold sm:text-xl">Signup questions</h2>
				<p class="text-surface-600-400 text-xs sm:text-sm">
					Custom intake fields asked when volunteers register for this event.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<span class="chip preset-tonal-surface text-xs">{questionsSummary}</span>
				{#if questionsOpen}
					<IconChevronUp class="text-surface-700-300 h-5 w-5 shrink-0" />
				{:else}
					<IconChevronDown class="text-surface-700-300 h-5 w-5 shrink-0" />
				{/if}
			</div>
		</summary>

		<div class="border-surface-500/15 border-t p-5 sm:p-6">
			<SignupQuestionsSection
				{customQuestions}
				{opportunities}
				{fieldTypeOptions}
				showHeader={false}
				{onAddQuestion}
				{onRemoveQuestion}
				{onUpdateQuestion}
			/>
		</div>
	</details>

	<!-- ── 6. Progressive Section: Scheduled Reminders ── -->
	<details
		id="section-scheduled-reminders"
		bind:open={remindersOpen}
		class="card border-surface-300-700 bg-surface-50-950/70 overflow-hidden rounded-xl border shadow-sm"
	>
		<summary
			class="hover:bg-surface-500/5 focus-visible:ring-primary-400 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden"
		>
			<div class="min-w-0 space-y-0.5">
				<h2 class="!text-left text-lg font-semibold sm:text-xl">Scheduled reminders</h2>
				<p class="text-surface-600-400 text-xs sm:text-sm">
					Automated reminder and follow-up email templates scheduled around the event.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<span class="chip preset-tonal-surface text-xs">{remindersSummary}</span>
				{#if remindersOpen}
					<IconChevronUp class="text-surface-700-300 h-5 w-5 shrink-0" />
				{:else}
					<IconChevronDown class="text-surface-700-300 h-5 w-5 shrink-0" />
				{/if}
			</div>
		</summary>

		<div class="border-surface-500/15 border-t p-5 sm:p-6">
			<CommunicationsStep
				showCustomQuestionsSection={false}
				showScheduledEmailsSection={true}
				showSectionHeaders={false}
				showHostNotifications={false}
				showSentHistory={false}
				showImmediateEmailOption={false}
				showAiComposer={false}
				{eventEmails}
				{eventDetails}
				{opportunities}
				{fieldTypeOptions}
				{emailTypeOptions}
				{onAddEmail}
				{onRemoveEmail}
				{onUpdateEmail}
			/>
		</div>
	</details>

	<!-- ── Persistent Action Bar ── -->
	<div
		id="volunteer-form-action-bar"
		class="card border-primary-500/40 bg-surface-50-950/95 sticky bottom-3 z-20 space-y-3 rounded-xl border p-4 shadow-xl backdrop-blur"
	>
		{#if saveError}
			<p
				role="alert"
				class="border-error-500/40 bg-error-500/10 text-error-800-200 rounded-lg border p-3 text-sm"
			>
				{saveError}
			</p>
		{/if}
		{#if saveSuccess}
			<p
				role="status"
				class="border-success-500/40 bg-success-500/10 text-success-800-200 rounded-lg border p-3 text-sm"
			>
				{saveSuccess}
			</p>
		{/if}

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0 space-y-0.5 text-sm">
				{#if isEditMode}
					<p class="text-surface-800-200 flex items-center gap-2 font-medium">
						{#if saving}
							<IconLoader class="text-primary-600-400 h-4 w-4 shrink-0 animate-spin" />
							<span>Saving changes…</span>
						{:else}
							<IconCheck class="text-success-600-400 h-4 w-4 shrink-0" />
							<span>Changes save automatically</span>
						{/if}
					</p>
					<p class="text-surface-600-400 text-xs">
						Current status: <strong class="text-surface-800-200 capitalize"
							>{eventDetails.status}</strong
						>
					</p>
				{:else if isFormValid}
					<p class="text-surface-800-200 font-medium">Ready to publish</p>
					<p class="text-surface-600-400 text-xs">
						Publish immediately or save a draft — optional sections can be updated anytime.
					</p>
				{:else}
					<p class="text-surface-800-200 font-medium">Complete required fields to publish</p>
					<p class="text-surface-600-400 text-xs">
						Enter an event title and start date/time at the top of the form.
					</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				{#if isEditMode && eventDetails?.slug}
					<a
						href={`/volunteer/${encodeURIComponent(eventDetails.slug)}`}
						class="btn preset-outlined-surface-500 flex min-h-11 items-center gap-2"
					>
						<span>View event</span>
					</a>
				{/if}
				<button
					type="button"
					class="btn preset-tonal-surface flex min-h-11 items-center gap-2"
					onclick={onSaveDraft}
					disabled={saving || (!isEditMode && !isFormValid)}
				>
					{#if saving && saveIntent === 'draft'}
						<IconLoader class="h-4 w-4 animate-spin" />
						<span>Saving draft…</span>
					{:else}
						<IconSave class="h-4 w-4" />
						<span>Save draft</span>
					{/if}
				</button>
				<button
					type="button"
					class="btn preset-filled-primary-500 flex min-h-11 items-center gap-2"
					onclick={onSubmit}
					disabled={saving || !isFormValid}
				>
					{#if saving && saveIntent === 'publish'}
						<IconLoader class="h-4 w-4 animate-spin" />
						<span>Publishing…</span>
					{:else}
						<span>Publish volunteer event</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>
