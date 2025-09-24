<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLoader from '@lucide/svelte/icons/loader-2';

	export let showAdvancedCommunications = false;
	export let customQuestions = [];
	export let showCustomQuestionsSection = true;
	export let eventEmails = [];
	export let eventDetails = {};
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
	export let onComposeEmail = () => {};

	const OPTION_FIELD_TYPES = new Set(['select', 'multiselect', 'checkbox']);

	const supportsOptionField = (type) => OPTION_FIELD_TYPES.has(type);

	function parseOptions(raw) {
		return (raw || '')
			.split(/\r?\n/)
			.map((value) => value.trim())
			.filter(Boolean);
	}

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

	function addOption(question) {
		const draft = question?.optionDraft?.trim();
		if (!draft) return;
		const existing = parseOptions(question.optionsRaw);
		if (existing.includes(draft)) {
			onUpdateQuestion(question.id, { optionDraft: '' });
			return;
		}
		const next = [...existing, draft];
		onUpdateQuestion(question.id, {
			optionsRaw: next.join('\n'),
			optionDraft: ''
		});
	}

	function removeOption(question, value) {
		const next = parseOptions(question.optionsRaw).filter((option) => option !== value);
		onUpdateQuestion(question.id, { optionsRaw: next.join('\n') });
	}

	function parseLocalDateTime(value) {
		if (!value) return null;
		const [datePart, timePart = '00:00'] = String(value).split('T');
		if (!datePart) return null;
		const [year, month, day] = datePart.split('-').map(Number);
		if (!year || !month || !day) return null;
		const [hour = 0, minute = 0] = timePart.split(':').map(Number);
		return new Date(Date.UTC(year, month - 1, day, hour, minute));
	}

	function formatDateTime(value, timezone, { dateStyle = 'medium', timeStyle = 'short' } = {}) {
		const date = parseLocalDateTime(value);
		if (!date) return 'TBD';
		try {
			const options = { timeZone: timezone || eventDetails?.timezone || undefined };
			if (dateStyle && dateStyle !== 'none') options.dateStyle = dateStyle;
			if (timeStyle && timeStyle !== 'none') options.timeStyle = timeStyle;
			if (!options.dateStyle && !options.timeStyle) options.timeStyle = 'short';
			const formatter = new Intl.DateTimeFormat(undefined, options);
			return formatter.format(date);
		} catch {
			return value || 'TBD';
		}
	}

	function formatEventDayTime(details) {
		if (!details) return 'Schedule coming soon';
		const start = formatDateTime(details.eventStart, details.timezone, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
		const endDate = parseLocalDateTime(details.eventEnd);
		const startDate = parseLocalDateTime(details.eventStart);
		const end = endDate
			? formatDateTime(details.eventEnd, details.timezone, {
					dateStyle:
						startDate && endDate && startDate.toDateString() === endDate.toDateString()
							? undefined
							: 'medium',
					timeStyle: 'short'
				})
			: null;
		const tzLabel = details.timezone ? ` (${details.timezone})` : '';
		if (end && end !== 'TBD') {
			const sameDay = startDate && endDate && startDate.toDateString() === endDate.toDateString();
			const endLabel = sameDay
				? formatDateTime(details.eventEnd, details.timezone, {
						dateStyle: undefined,
						timeStyle: 'short'
					})
				: end;
			return `${start} → ${endLabel}${tzLabel}`;
		}
		return `${start}${tzLabel}`;
	}

	function escapeRegExp(value) {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function resolveActivityTitle() {
		const firstNamed = opportunities?.find((opp) => opp?.title?.trim());
		return firstNamed?.title?.trim() || 'Volunteer activity';
	}

	function buildMergePreview(template) {
		const replacements = {
			'{{volunteer_name}}': 'Jordan Volunteer',
			'{{event_title}}': eventDetails?.title?.trim() || 'Your volunteer event',
			'{{event_day_time}}': formatEventDayTime(eventDetails) || 'Schedule coming soon',
			'{{event_location}}':
				eventDetails?.locationName?.trim() ||
				eventDetails?.locationAddress?.trim() ||
				'Location to be announced',
			'{{event_start}}': formatDateTime(eventDetails?.eventStart, eventDetails?.timezone),
			'{{activity_title}}': resolveActivityTitle()
		};
		let output = template ?? '';
		for (const [token, value] of Object.entries(replacements)) {
			output = output.replace(new RegExp(escapeRegExp(token), 'g'), value);
		}
		return output.trim() ? output : '';
	}
</script>

<div class="space-y-6">
	<div class="card border-secondary-500/20 bg-surface-900/70 border p-4">
		<h3 class="text-secondary-100 font-semibold">Keep volunteers in the loop</h3>
		<p class="text-surface-400 text-sm">
			Start with your event description and host contact info. A 12-hour reminder email is
			preloaded—expand below to customise messaging or add intake questions when you need extra
			structure.
		</p>
	</div>

	<div class="space-y-4">
		<button
			type="button"
			class="text-primary-300 inline-flex items-center gap-2 text-sm font-semibold"
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
				{#if showCustomQuestionsSection}
					<section class="space-y-4">
						<h4 class="text-surface-400 text-sm font-semibold tracking-wide uppercase">
							Custom intake questions
						</h4>
						{#each customQuestions as question, idx (question.id)}
							<div class="card border-primary-500/20 bg-surface-900/70 border p-4">
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
											oninput={(e) =>
												onUpdateQuestion(question.id, { label: e.currentTarget.value })}
										/>
									</label>
									<label class="label flex flex-col gap-2">
										<span>Field type</span>
										<select
											class="select bg-surface-900/60"
											value={question.fieldType}
											onchange={(e) =>
												onUpdateQuestion(question.id, { fieldType: e.currentTarget.value })}
										>
											{#each fieldTypeOptions as option (option)}
												<option value={option}>{option}</option>
											{/each}
										</select>
									</label>
									<div class="flex flex-col gap-2">
										<label class="label" for={`question-required-${question.id}`}>Required?</label>
										<label class="flex items-center gap-3 text-sm">
											<input
												id={`question-required-${question.id}`}
												type="checkbox"
												checked={question.isRequired}
												onchange={(e) =>
													onUpdateQuestion(question.id, { isRequired: e.currentTarget.checked })}
											/>
											<span>Volunteers must answer</span>
										</label>
									</div>
									<label class="label flex flex-col gap-2 md:col-span-2">
										<span>Help text</span>
										<textarea
											class="textarea bg-surface-900/60 min-h-20"
											value={question.helpText}
											oninput={(e) =>
												onUpdateQuestion(question.id, { helpText: e.currentTarget.value })}
											placeholder="Give volunteers context, links, or clarifications."
										></textarea>
									</label>
									{#if supportsOptionField(question.fieldType)}
										<div class="space-y-2 md:col-span-2">
											<div class="label flex flex-col gap-2">
												<span>Options</span>
												<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
													<input
														class="input bg-surface-900/60 md:flex-1"
														value={question.optionDraft}
														oninput={(e) =>
															onUpdateQuestion(question.id, { optionDraft: e.currentTarget.value })}
														placeholder="Add a choice"
														onkeydown={(event) => {
															if (event.key === 'Enter') {
																event.preventDefault();
																addOption(question);
															}
														}}
													/>
													<button
														type="button"
														class="btn preset-filled-primary-500 flex items-center gap-2 md:w-auto"
														onclick={() => addOption(question)}
														disabled={!question.optionDraft?.trim()}
													>
														<IconPlus class="h-4 w-4" />
														<span>Add option</span>
													</button>
												</div>
											</div>
											{#if parseOptions(question.optionsRaw).length}
												<div class="flex flex-wrap gap-2">
													{#each parseOptions(question.optionsRaw) as option (option)}
														<span
															class="bg-surface-900/80 text-surface-200 border-surface-700 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
														>
															{option}
															<button
																type="button"
																class="text-error-300 hover:text-error-200 text-xs"
																onclick={() => removeOption(question, option)}
															>
																Remove
															</button>
														</span>
													{/each}
												</div>
											{:else}
												<p class="text-surface-500 text-xs">
													Add at least one option for this field.
												</p>
											{/if}
										</div>
									{/if}
									<label class="label flex flex-col gap-2 md:col-span-2">
										<span>Limit to activity</span>
										<select
											class="select bg-surface-900/60"
											value={question.opportunityId}
											onchange={(e) =>
												onUpdateQuestion(question.id, { opportunityId: e.currentTarget.value })}
										>
											<option value="">Applies to all signups</option>
											{#each opportunities as opp (opp.id)}
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
				{/if}

				<section class="space-y-4">
					<h4 class="text-surface-400 text-sm font-semibold tracking-wide uppercase">
						Automated emails
					</h4>
					{#each eventEmails as email, idx (email.id)}
						<div class="card border-primary-500/20 bg-surface-900/70 border p-4">
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

							<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
								<button
									type="button"
									class={`btn flex items-center gap-2 ${
										email.aiComposerOpen ? 'preset-tonal-secondary-500' : 'preset-tonal-primary'
									}`}
									onclick={() =>
										onUpdateEmail(email.id, { aiComposerOpen: !email.aiComposerOpen, aiError: '' })}
									disabled={email.aiLoading}
								>
									<IconSparkles class="h-4 w-4" />
									<span>{email.aiComposerOpen ? 'Close composer' : 'Compose with AI'}</span>
								</button>
							</div>

							{#if email.aiComposerOpen}
								<div
									class="border-primary-400/30 bg-primary-400/10 mt-4 space-y-3 rounded border p-4"
								>
									<label class="label text-sm font-semibold" for={`email-ai-prompt-${email.id}`}>
										Describe the message
									</label>
									<textarea
										id={`email-ai-prompt-${email.id}`}
										class="textarea bg-surface-950/80 min-h-20"
										value={email.aiPrompt}
										oninput={(e) => onUpdateEmail(email.id, { aiPrompt: e.currentTarget.value })}
										placeholder="Share the tone, reminders, or updates you'd like this email to cover."
										disabled={email.aiLoading}
									></textarea>
									<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
										<button
											type="button"
											class="btn preset-filled-secondary-500 flex items-center gap-2"
											onclick={() => onComposeEmail(email.id)}
											disabled={!email.aiPrompt?.trim() || email.aiLoading}
										>
											{#if email.aiLoading}
												<IconLoader class="h-4 w-4 animate-spin" />
												<span>Composing…</span>
											{:else}
												<IconSparkles class="h-4 w-4" />
												<span>Generate email</span>
											{/if}
										</button>
										<button
											type="button"
											class="btn preset-tonal-surface flex items-center gap-2"
											onclick={() =>
												onUpdateEmail(email.id, { aiComposerOpen: false, aiError: '' })}
											disabled={email.aiLoading}
										>
											<span>Cancel</span>
										</button>
									</div>
									{#if email.aiError}
										<p class="text-error-300 text-xs">{email.aiError}</p>
									{/if}
									<p class="text-surface-400 text-xs">
										Merge tags available: <code>&#123;&#123;volunteer_name&#125;&#125;</code>,
										<code>&#123;&#123;event_day_time&#125;&#125;</code>,
										<code>&#123;&#123;event_location&#125;&#125;</code>,
										<code>&#123;&#123;event_title&#125;&#125;</code>, and
										<code>&#123;&#123;activity_title&#125;&#125;</code>.
									</p>
								</div>
							{/if}

							<div class="mt-4 grid gap-4 md:grid-cols-2">
								<label class="label flex flex-col gap-2">
									<span>Email type</span>
									<select
										class="select bg-surface-900/60"
										value={email.emailType}
										onchange={(e) => onUpdateEmail(email.id, { emailType: e.currentTarget.value })}
									>
										{#each emailTypeOptions as option (option)}
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
									<p class="text-surface-500 text-xs">We convert this to minutes automatically.</p>
								</label>
								<div class="flex flex-col gap-2">
									<label class="label" for={`email-confirm-${email.id}`}
										>Require confirmation?</label
									>
									<label class="flex items-center gap-3 text-sm">
										<input
											id={`email-confirm-${email.id}`}
											type="checkbox"
											checked={email.requireConfirmation}
											onchange={(e) =>
												onUpdateEmail(email.id, { requireConfirmation: e.currentTarget.checked })}
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
								<div
									class="border-surface-700/60 bg-surface-950/50 text-surface-300 rounded-md border p-2 text-xs"
								>
									<strong class="text-surface-400 block text-[11px] tracking-wide uppercase"
										>Subject preview</strong
									>
									<p class="text-surface-200 mt-1 break-words whitespace-pre-wrap">
										{buildMergePreview(email.subject) ||
											'Merge tags such as {{volunteer_name}} will render here exactly as written.'}
									</p>
								</div>
							</label>

							<label class="label flex flex-col gap-2">
								<span>Body *</span>
								<textarea
									class="textarea bg-surface-900/60 min-h-32"
									value={email.body}
									oninput={(e) => onUpdateEmail(email.id, { body: e.currentTarget.value })}
									placeholder="Drop volunteer instructions, call-to-actions, or celebratory recaps."
								></textarea>
								<div
									class="border-surface-700/60 bg-surface-950/50 text-surface-300 rounded-md border p-3 text-xs"
								>
									<strong class="text-surface-400 block text-[11px] tracking-wide uppercase"
										>Body preview</strong
									>
									<p class="text-surface-200 mt-2 break-words whitespace-pre-wrap">
										{buildMergePreview(email.body) ||
											'Use merge tags like {{event_day_time}} and {{activity_title}}. They appear exactly where you place them.'}
									</p>
								</div>
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
					<p class="text-surface-500 text-xs">
						Tip: use <code>&#123;&#123;volunteer_name&#125;&#125;</code>,
						<code>&#123;&#123;event_title&#125;&#125;</code>,
						<code>&#123;&#123;event_day_time&#125;&#125;</code>,
						<code>&#123;&#123;event_location&#125;&#125;</code>,
						<code>&#123;&#123;event_start&#125;&#125;</code>, and
						<code>&#123;&#123;activity_title&#125;&#125;</code> to personalise messages.
					</p>
				</section>
			</div>
		{:else}
			<p class="text-surface-400 text-sm">
				When you're ready to add intake questions, reminders, or thank-you emails, expand the tools
				above.
			</p>
		{/if}
	</div>
</div>
