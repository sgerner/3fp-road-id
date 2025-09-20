<script>
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';

	export let opportunities = [];
	export let opportunityTypeOptions = [];
	export let onAddOpportunity = () => {};
	export let onRemoveOpportunity = () => {};
	export let onUpdateOpportunity = () => {};
	export let onAddShift = () => {};
	export let onRemoveShift = () => {};
	export let onUpdateShift = () => {};
</script>

<div class="space-y-4">
	{#each opportunities as opportunity, idx (opportunity.id)}
		<div class="card border-primary-500/20 bg-surface-900/70 border p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<h3 class="font-semibold">Activity {idx + 1}</h3>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="btn preset-tonal-error flex items-center gap-2"
						disabled={opportunities.length === 1}
						onclick={() => onRemoveOpportunity(opportunity.id)}
					>
						<IconTrash class="h-4 w-4" />
						<span>Remove</span>
					</button>
				</div>
			</div>

			<div class="mt-4 grid gap-4 md:grid-cols-2">
				<label class="label flex flex-col gap-2">
					<span>Title *</span>
					<input
						class="input bg-surface-900/60"
						value={opportunity.title}
						oninput={(e) => onUpdateOpportunity(opportunity.id, { title: e.currentTarget.value })}
					/>
				</label>
				<label class="label flex flex-col gap-2">
					<span>Type</span>
					<select
						class="select bg-surface-900/60"
						value={opportunity.opportunityType}
						onchange={(e) =>
							onUpdateOpportunity(opportunity.id, { opportunityType: e.currentTarget.value })}
					>
						{#each opportunityTypeOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
				<label class="label flex flex-col gap-2 md:col-span-2">
					<span>Description</span>
					<textarea
						class="textarea bg-surface-900/60 min-h-28"
						value={opportunity.description}
						oninput={(e) =>
							onUpdateOpportunity(opportunity.id, { description: e.currentTarget.value })}
						placeholder="What does this crew handle? Call out skills needed, vibe, and perks."
					></textarea>
				</label>
				<label class="label flex flex-col gap-2">
					<span>Minimum volunteers</span>
					<input
						type="number"
						class="input bg-surface-900/60"
						value={opportunity.minVolunteers}
						oninput={(e) =>
							onUpdateOpportunity(opportunity.id, { minVolunteers: e.currentTarget.value })}
						min="0"
					/>
				</label>
				<label class="label flex flex-col gap-2">
					<span>Maximum volunteers</span>
					<input
						type="number"
						class="input bg-surface-900/60"
						value={opportunity.maxVolunteers}
						oninput={(e) =>
							onUpdateOpportunity(opportunity.id, { maxVolunteers: e.currentTarget.value })}
						min="0"
						placeholder="Leave blank for open"
					/>
				</label>
				<label class="label flex flex-col gap-2">
					<span>Waitlist limit</span>
					<input
						type="number"
						class="input bg-surface-900/60"
						value={opportunity.waitlistLimit}
						oninput={(e) =>
							onUpdateOpportunity(opportunity.id, { waitlistLimit: e.currentTarget.value })}
						min="0"
						placeholder="Optional limit"
					/>
				</label>
				<div class="flex flex-col gap-2">
					<label class="label" for={`requires-approval-${opportunity.id}`}>Requires approval?</label
					>
					<label class="flex items-center gap-3 text-sm">
						<input
							id={`requires-approval-${opportunity.id}`}
							type="checkbox"
							checked={opportunity.requiresApproval}
							onchange={(e) =>
								onUpdateOpportunity(opportunity.id, { requiresApproval: e.currentTarget.checked })}
						/>
						<span>Manual review for this role</span>
					</label>
				</div>
				<div class="flex flex-col gap-2">
					<label class="label" for={`auto-confirm-${opportunity.id}`}
						>Auto-confirm attendance?</label
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
						<span>Mark as confirmed automatically</span>
					</label>
				</div>
			</div>

			<div class="mt-6 space-y-4">
				<div class="flex items-center justify-between">
					<h4 class="text-surface-400 text-sm font-semibold tracking-wide uppercase">Shifts</h4>
					<button
						type="button"
						class="btn preset-outlined-primary-500 flex items-center gap-2"
						onclick={() => onAddShift(opportunity.id)}
					>
						<IconPlus class="h-4 w-4" />
						<span>Add shift</span>
					</button>
				</div>

				{#each opportunity.shifts as shift, shiftIdx (shift.id)}
					<div class="border-surface-700 bg-surface-950/80 rounded border p-4">
						<div class="flex items-center justify-between">
							<p class="text-sm font-semibold">Shift {shiftIdx + 1}</p>
							<button
								type="button"
								class="btn preset-tonal-error flex items-center gap-2"
								onclick={() => onRemoveShift(opportunity.id, shift.id)}
							>
								<IconTrash class="h-4 w-4" />
								<span>Remove</span>
							</button>
						</div>

						<div class="mt-4 grid gap-4 md:grid-cols-2">
							<label class="label flex flex-col gap-2">
								<span>Starts</span>
								<input
									type="datetime-local"
									class="input bg-surface-900/60"
									value={shift.startsAt}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { startsAt: e.currentTarget.value })}
								/>
							</label>
							<label class="label flex flex-col gap-2">
								<span>Ends</span>
								<input
									type="datetime-local"
									class="input bg-surface-900/60"
									value={shift.endsAt}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { endsAt: e.currentTarget.value })}
								/>
							</label>
							<label class="label flex flex-col gap-2">
								<span>Capacity</span>
								<input
									type="number"
									class="input bg-surface-900/60"
									value={shift.capacity}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { capacity: e.currentTarget.value })}
									min="0"
								/>
							</label>
							<label class="label flex flex-col gap-2 md:col-span-2">
								<span>Shift notes</span>
								<textarea
									class="textarea bg-surface-900/60 min-h-20"
									value={shift.notes}
									oninput={(e) =>
										onUpdateShift(opportunity.id, shift.id, { notes: e.currentTarget.value })}
									placeholder="Call out hand-offs, materials, or accessibility tips."
								></textarea>
							</label>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<button
		type="button"
		onclick={onAddOpportunity}
		class="btn preset-filled-primary-500 flex items-center gap-2"
	>
		<IconPlus class="h-4 w-4" />
		<span>Add activity</span>
	</button>
</div>
