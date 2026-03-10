<script>
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';

	export let opportunities = [];
	export let opportunityTypeOptions = [];
	export let onAddOpportunity = () => {};
	export let onRemoveOpportunity = () => {};
	export let onUpdateOpportunity = () => {};
	export let onAddShift = () => {};
	export let onRemoveShift = () => {};
	export let onUpdateShift = () => {};

	// Keep track of which roles have their advanced settings expanded
	let expandedSettings = {};
	function toggleAdvanced(id) {
		expandedSettings[id] = !expandedSettings[id];
	}
</script>

<div class="space-y-8">
	{#each opportunities as opportunity, idx (opportunity.id)}
		<div class={idx > 0 ? 'border-surface-500/15 border-t pt-8' : ''}>
			<div
				class="mb-6 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4"
			>
				<div class="w-full flex-grow">
					<input
						id={`title-${opportunity.id}`}
						class="input text-primary-500 border-primary-500 bg-primary-500/10 w-full rounded-md border-b text-3xl font-bold"
						value={opportunity.title}
						oninput={(e) => onUpdateOpportunity(opportunity.id, { title: e.currentTarget.value })}
						placeholder={`Role ${idx + 1} (e.g. Course Marshal)`}
					/>
				</div>
				<div class="mt-2 flex w-full shrink-0 items-center justify-between gap-3 md:mt-0 md:w-auto">
					<select
						id={`type-${opportunity.id}`}
						class="select preset-tonal-surface w-full rounded-lg px-4 py-2 text-sm md:w-auto md:min-w-[240px]"
						value={opportunity.opportunityType}
						aria-label="Role type"
						onchange={(e) =>
							onUpdateOpportunity(opportunity.id, { opportunityType: e.currentTarget.value })}
					>
						{#each opportunityTypeOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<button
						type="button"
						class="btn-icon preset-tonal-error flex shrink-0 items-center gap-1.5"
						disabled={opportunities.length === 1}
						onclick={() => onRemoveOpportunity(opportunity.id)}
					>
						<IconTrash class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1.5 md:col-span-2">
					<label class="text-surface-200 text-sm font-medium" for={`desc-${opportunity.id}`}
						>Description <span class="text-surface-500 font-normal">(optional)</span></label
					>
					<textarea
						id={`desc-${opportunity.id}`}
						class="textarea preset-tonal-surface min-h-24 w-full rounded-lg px-4 py-2"
						value={opportunity.description}
						oninput={(e) =>
							onUpdateOpportunity(opportunity.id, { description: e.currentTarget.value })}
						placeholder="What does this crew do? Call out skills needed, vibe, and perks."
					></textarea>
				</div>
			</div>

			<div class="mt-4 flex">
				<button
					type="button"
					class="text-surface-300 hover:text-surface-100 inline-flex items-center gap-2 text-sm font-medium transition-colors"
					onclick={() => toggleAdvanced(opportunity.id)}
				>
					{#if expandedSettings[opportunity.id]}
						<IconChevronUp class="h-4 w-4" />
						<span>Hide advanced role settings</span>
					{:else}
						<IconChevronDown class="h-4 w-4" />
						<span>Show advanced role settings</span>
					{/if}
				</button>
			</div>

			{#if expandedSettings[opportunity.id]}
				<div class="bg-surface-500/5 mt-4 grid gap-4 rounded-xl p-4 md:grid-cols-3">
					<div class="flex flex-col gap-1.5">
						<label class="text-surface-200 text-sm font-medium" for={`min-${opportunity.id}`}
							>Min volunteers</label
						>
						<input
							id={`min-${opportunity.id}`}
							type="number"
							class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
							value={opportunity.minVolunteers}
							oninput={(e) =>
								onUpdateOpportunity(opportunity.id, { minVolunteers: e.currentTarget.value })}
							min="0"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-surface-200 text-sm font-medium" for={`max-${opportunity.id}`}
							>Max volunteers</label
						>
						<input
							id={`max-${opportunity.id}`}
							type="number"
							class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
							value={opportunity.maxVolunteers}
							oninput={(e) =>
								onUpdateOpportunity(opportunity.id, { maxVolunteers: e.currentTarget.value })}
							min="0"
							placeholder="Open capacity"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-surface-200 text-sm font-medium" for={`waitlist-${opportunity.id}`}
							>Waitlist limit</label
						>
						<input
							id={`waitlist-${opportunity.id}`}
							type="number"
							class="input preset-tonal-surface w-full rounded-lg px-4 py-2"
							value={opportunity.waitlistLimit}
							oninput={(e) =>
								onUpdateOpportunity(opportunity.id, { waitlistLimit: e.currentTarget.value })}
							min="0"
							placeholder="Optional"
						/>
					</div>
					<div class="flex flex-col gap-2 md:col-span-3">
						<label
							class="text-surface-200 text-sm font-medium"
							for={`requires-approval-${opportunity.id}`}>Signups require approval?</label
						>
						<label class="flex items-center gap-3 text-sm">
							<input
								id={`requires-approval-${opportunity.id}`}
								type="checkbox"
								checked={opportunity.requiresApproval}
								onchange={(e) =>
									onUpdateOpportunity(opportunity.id, {
										requiresApproval: e.currentTarget.checked
									})}
							/>
							<span class="text-surface-300">Manually review signups for this role</span>
						</label>
					</div>
					<div class="flex flex-col gap-2 md:col-span-3">
						<label
							class="text-surface-200 text-sm font-medium"
							for={`auto-confirm-${opportunity.id}`}>Auto-confirm attendance?</label
						>
						<label class="flex items-center gap-3 text-sm">
							<input
								id={`auto-confirm-${opportunity.id}`}
								type="checkbox"
								checked={opportunity.autoConfirmAttendance}
								onchange={(e) =>
									onUpdateOpportunity(opportunity.id, {
										autoConfirmAttendance: e.currentTarget.checked
									})}
							/>
							<span class="text-surface-300"
								>Mark volunteers as 'attended' automatically when shift ends</span
							>
						</label>
					</div>
				</div>
			{/if}

			<div class="mt-8 space-y-4">
				<div class="flex items-center gap-4">
					<h4 class="text-surface-200 text-sm font-bold">Shifts</h4>
					<div class="bg-surface-500/20 h-px flex-grow"></div>
				</div>

				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{#each opportunity.shifts as shift, shiftIdx (shift.id)}
						<div class="card preset-outlined-surface-500 relative flex flex-col gap-3 p-4">
							<div class="flex items-center justify-between">
								<p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
									Shift {shiftIdx + 1}
								</p>
								<button
									type="button"
									class="text-error-600 hover:text-error-300 p-1 transition-colors"
									onclick={() => onRemoveShift(opportunity.id, shift.id)}
									aria-label="Remove shift"
								>
									<IconTrash class="h-3.5 w-3.5" />
								</button>
							</div>

							<div class="flex flex-col gap-1.5">
								<label class="text-surface-200 text-xs font-medium" for={`start-${shift.id}`}
									>Starts</label
								>
								<input
									id={`start-${shift.id}`}
									type="datetime-local"
									class="input preset-tonal-surface w-full rounded-lg px-3 py-1.5 text-sm"
									value={shift.startsAt}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { startsAt: e.currentTarget.value })}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label class="text-surface-200 text-xs font-medium" for={`end-${shift.id}`}
									>Ends</label
								>
								<input
									id={`end-${shift.id}`}
									type="datetime-local"
									class="input preset-tonal-surface w-full rounded-lg px-3 py-1.5 text-sm"
									value={shift.endsAt}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { endsAt: e.currentTarget.value })}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label class="text-surface-200 text-xs font-medium" for={`cap-${shift.id}`}
									>Capacity</label
								>
								<input
									id={`cap-${shift.id}`}
									type="number"
									class="input preset-tonal-surface w-full rounded-lg px-3 py-1.5 text-sm"
									value={shift.capacity}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { capacity: e.currentTarget.value })}
									min="0"
									placeholder="Unlimited"
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label class="text-surface-200 text-xs font-medium" for={`notes-${shift.id}`}
									>Notes <span class="text-surface-500 font-normal">(optional)</span></label
								>
								<textarea
									id={`notes-${shift.id}`}
									class="textarea preset-tonal-surface min-h-16 w-full rounded-lg px-3 py-1.5 text-sm"
									value={shift.notes}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { notes: e.currentTarget.value })}
									placeholder="Hand-offs, instructions..."
								></textarea>
							</div>
						</div>
					{/each}

					<button
						type="button"
						class="border-surface-500/20 text-surface-400 hover:text-surface-200 hover:border-surface-500/40 flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 transition-colors"
						onclick={() => onAddShift(opportunity.id)}
					>
						<div class="bg-surface-500/10 rounded-full p-2">
							<IconPlus class="h-5 w-5" />
						</div>
						<span class="text-sm font-medium">Add another shift</span>
					</button>
				</div>
			</div>
		</div>
	{/each}

	<div class="border-surface-500/15 border-t pt-6">
		<button
			type="button"
			onclick={onAddOpportunity}
			class="btn preset-tonal-surface gap-2 font-medium"
		>
			<IconPlus class="h-4 w-4" />
			<span>Add another role</span>
		</button>
	</div>
</div>
