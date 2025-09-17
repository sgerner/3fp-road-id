<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';

	export let showAdvancedCommunications = false;
	export let customQuestions = [];
	export let eventEmails = [];
	export let opportunities = [];
	export let fieldTypeOptions = [];
	export let emailTypeOptions = [];
	export let onToggleAdvanced = () => {};
	export let onAddQuestion = () => {};
	export let onRemoveQuestion = () => {};
	export let onUpdateQuestion = () => {};
	export let onAddEmail = () => {};
	export let onRemoveEmail = () => {};
	export let onUpdateEmail = () => {};

	function getEmailTiming(minutes) {
		const value = Number(minutes);
		if (!Number.isFinite(value) || value === 0) {
			return { days: 0, direction: 'before' };
		}
		return {
			days: Math.abs(value) / 1440,
			direction: value >= 0 ? 'before' : 'after'
		};
	}

	function handleTimingChange(id, { days, direction }) {
		const parsedDays = Number(days);
		const numericDays = Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : 0;
		const safeDirection = direction === 'after' ? 'after' : 'before';
		const minutes = numericDays * 1440 * (safeDirection === 'before' ? 1 : -1);
		onUpdateEmail(id, { sendOffsetMinutes: minutes });
	}
</script>

<div class="space-y-6">
	<div class="card border border-secondary-500/20 bg-surface-900/70 p-4">
		<h3 class="font-semibold text-secondary-100">Keep volunteers in the loop</h3>
		<p class="text-sm text-surface-400">
			Start with your event description and host contact info. A 12-hour reminder email is preloaded—expand below
			to customise messaging or add intake questions when you need extra structure.
		</p>
	</div>

	<div class="space-y-4">
		<button
			type="button"
			class="inline-flex items-center gap-2 text-sm font-semibold text-primary-300"
			onclick={onToggleAdvanced}
		>
			{#if showAdvancedCommunications}
				<IconChevronUp class="h-4 w-4" />
				<span>Hide intake & messaging tools</span>
			{:else}
				<IconChevronDown class="h-4 w-4" />
				<span>Show intake & messaging tools</span>
			{/if}
		</button>

		{#if showAdvancedCommunications}
			<div class="space-y-6">
				<section class="space-y-4">
					<h4 class="text-sm font-semibold uppercase tracking-wide text-surface-400">Custom intake questions</h4>
					{#each customQuestions as question, idx (question.id)}
						<div class="card border border-primary-500/20 bg-surface-900/70 p-4">
							<div class="flex items-center justify-between">
								<h3 class="font-semibold">Question {idx + 1}</h3>
								<button
									type="button"
									class="btn preset-tonal-error flex items-center gap-2"
									onclick={() => onRemoveQuestion(question.id)}
								>
									<IconTrash class="h-4 w-4" />
									<span>Remove</span>
								</button>
							</div>

							<div class="mt-4 grid gap-4 md:grid-cols-2">
								<label class="label flex flex-col gap-2">
									<span>Label *</span>
									<input
										class="input bg-surface-900/60"
										value={question.label}
										oninput={(e) => onUpdateQuestion(question.id, { label: e.currentTarget.value })}
									/>
								</label>
								<label class="label flex flex-col gap-2">
									<span>Field key</span>
									<input
										class="input bg-surface-900/60"
										value={question.fieldKey}
										oninput={(e) => onUpdateQuestion(question.id, { fieldKey: e.currentTarget.value })}
										placeholder="Optional override"
									/>
								</label>
								<label class="label flex flex-col gap-2">
									<span>Field type</span>
									<select
										class="select bg-surface-900/60"
										value={question.fieldType}
										onchange={(e) => onUpdateQuestion(question.id, { fieldType: e.currentTarget.value })}
									>
										{#each fieldTypeOptions as option}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</label>
								<div class="flex flex-col gap-2">
									<label class="label">Required?</label>
									<label class="flex items-center gap-3 text-sm">
										<input
											type="checkbox"
											checked={question.isRequired}
											onchange={(e) => onUpdateQuestion(question.id, { isRequired: e.currentTarget.checked })}
										/>
										<span>Volunteers must answer</span>
									</label>
								</div>
								<label class="label flex flex-col gap-2 md:col-span-2">
									<span>Help text</span>
									<textarea
										class="textarea min-h-20 bg-surface-900/60"
										value={question.helpText}
										oninput={(e) => onUpdateQuestion(question.id, { helpText: e.currentTarget.value })}
										placeholder="Give volunteers context, links, or clarifications."
									></textarea>
								</label>
								<label class="label flex flex-col gap-2 md:col-span-2">
									<span>Options (one per line)</span>
									<textarea
										class="textarea min-h-20 bg-surface-900/60"
										value={question.optionsRaw}
										oninput={(e) => onUpdateQuestion(question.id, { optionsRaw: e.currentTarget.value })}
										placeholder="Only used for select and checkbox styles"
									></textarea>
								</label>
								<label class="label flex flex-col gap-2 md:col-span-2">
									<span>Limit to activity</span>
									<select
										class="select bg-surface-900/60"
										value={question.opportunityId}
										onchange={(e) => onUpdateQuestion(question.id, { opportunityId: e.currentTarget.value })}
									>
										<option value="">Applies to all signups</option>
										{#each opportunities as opp}
											<option value={opp.id}>{opp.title || 'Unnamed activity'}</option>
										{/each}
									</select>
								</label>
							</div>
						</div>
					{/each}

					<button
						type="button"
						onclick={onAddQuestion}
						class="btn preset-filled-primary-500 flex items-center gap-2"
					>
						<IconPlus class="h-4 w-4" />
						<span>Add question</span>
					</button>
				</section>

				<section class="space-y-4">
					<h4 class="text-sm font-semibold uppercase tracking-wide text-surface-400">Automated emails</h4>
					{#each eventEmails as email, idx (email.id)}
						<div class="card border border-primary-500/20 bg-surface-900/70 p-4">
							<div class="flex items-center justify-between">
								<h3 class="font-semibold">Email {idx + 1}</h3>
								<button
									type="button"
									class="btn preset-tonal-error flex items-center gap-2"
									onclick={() => onRemoveEmail(email.id)}
								>
									<IconTrash class="h-4 w-4" />
									<span>Remove</span>
								</button>
							</div>

							<div class="mt-4 grid gap-4 md:grid-cols-2">
								<label class="label flex flex-col gap-2">
									<span>Email type</span>
									<select
										class="select bg-surface-900/60"
										value={email.emailType}
										onchange={(e) => onUpdateEmail(email.id, { emailType: e.currentTarget.value })}
									>
										{#each emailTypeOptions as option}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</label>
								<label class="label flex flex-col gap-2">
									<span>Send timing</span>
									<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
										<input
											type="number"
											min="0"
											step="0.5"
											class="input bg-surface-900/60 md:w-28"
											value={getEmailTiming(email.sendOffsetMinutes).days}
											oninput={(e) => {
												const currentTiming = getEmailTiming(email.sendOffsetMinutes);
												handleTimingChange(email.id, {
													days: e.currentTarget.value,
													direction: currentTiming.direction
												});
											}}
										/>
										<select
											class="select bg-surface-900/60 md:w-56"
											value={getEmailTiming(email.sendOffsetMinutes).direction}
											onchange={(e) => {
												handleTimingChange(email.id, {
													days: getEmailTiming(email.sendOffsetMinutes).days,
													direction: e.currentTarget.value
												});
											}}
										>
											<option value="before">days before event</option>
											<option value="after">days after event</option>
										</select>
									</div>
									<p class="text-xs text-surface-500">We convert this to minutes automatically.</p>
								</label>
								<div class="flex flex-col gap-2">
									<label class="label">Require confirmation?</label>
									<label class="flex items-center gap-3 text-sm">
										<input
											type="checkbox"
											checked={email.requireConfirmation}
											onchange={(e) => onUpdateEmail(email.id, { requireConfirmation: e.currentTarget.checked })}
										/>
										<span>Require volunteers to confirm attendance</span>
									</label>
								</div>
								<label class="label flex flex-col gap-2">
									<span>Survey or follow-up link</span>
									<input
										class="input bg-surface-900/60"
										value={email.surveyUrl}
										oninput={(e) => onUpdateEmail(email.id, { surveyUrl: e.currentTarget.value })}
										placeholder="Optional form or thank-you link"
									/>
								</label>
							</div>

							<label class="label flex flex-col gap-2">
								<span>Subject *</span>
								<input
									class="input bg-surface-900/60"
									value={email.subject}
									oninput={(e) => onUpdateEmail(email.id, { subject: e.currentTarget.value })}
									placeholder="Reminder: Your volunteer shift starts in 48 hours"
								/>
							</label>

							<label class="label flex flex-col gap-2">
								<span>Body *</span>
								<textarea
									class="textarea min-h-32 bg-surface-900/60"
									value={email.body}
									oninput={(e) => onUpdateEmail(email.id, { body: e.currentTarget.value })}
									placeholder="Drop volunteer instructions, call-to-actions, or celebratory recaps."
								></textarea>
							</label>
						</div>
					{/each}

					<button
						type="button"
						onclick={onAddEmail}
						class="btn preset-filled-primary-500 flex items-center gap-2"
					>
						<IconPlus class="h-4 w-4" />
						<span>Add email</span>
					</button>
					<p class="text-xs text-surface-500">
						Tip: use <code>&#123;&#123;event_title&#125;&#125;</code>, <code>&#123;&#123;event_start&#125;&#125;</code>, and
						<code>&#123;&#123;activity_title&#125;&#125;</code> to personalise messages.
					</p>
				</section>
			</div>
		{:else}
			<p class="text-sm text-surface-400">
				When you're ready to add intake questions, reminders, or thank-you emails, expand the tools above.
			</p>
		{/if}
	</div>
</div>
