<script>
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import Toggle from '#lib/components/ui/Toggle.svelte';
	import { slide } from 'svelte/transition';

	/**
	 * @type {{
	 *   customQuestions?: any[],
	 *   opportunities?: any[],
	 *   fieldTypeOptions?: any[],
	 *   showHeader?: boolean,
	 *   onAddQuestion?: () => any,
	 *   onRemoveQuestion?: (id: any) => any,
	 *   onUpdateQuestion?: (id: any, patch: Record<string, any>) => any
	 * }}
	 */
	let {
		customQuestions = [],
		opportunities = [],
		fieldTypeOptions = [],
		showHeader = false,
		onAddQuestion = () => {},
		onRemoveQuestion = () => {},
		onUpdateQuestion = () => {}
	} = $props();

	const OPTION_FIELD_TYPES = new Set(['select', 'multiselect', 'checkbox']);

	const supportsOptionField = (type) => OPTION_FIELD_TYPES.has(type);

	function parseOptions(raw) {
		return (raw || '')
			.split(/\r?\n/)
			.map((value) => value.trim())
			.filter(Boolean);
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
</script>

<div class="space-y-4">
	{#if showHeader}
		<div class="card preset-tonal-tertiary flex items-center justify-between px-4 py-2">
			<h2 class="!text-left text-lg font-bold">Signup questions</h2>
			<button
				type="button"
				onclick={onAddQuestion}
				class="btn btn-sm preset-tonal-primary flex min-h-11 items-center gap-2"
			>
				<IconPlus class="h-3.5 w-3.5" />
				<span>Add question</span>
			</button>
		</div>
	{/if}

	{#if customQuestions.length === 0}
		<p class="text-surface-600-400 text-sm" transition:slide>
			Collect extra details like T-shirt size, certifications, or emergency contacts when volunteers
			sign up.
		</p>
	{:else}
		<div class="space-y-4">
			{#each customQuestions as question, idx (question.id)}
				<div class="card border-surface-500/15 bg-surface-200-800/20 border p-5">
					<div class="mb-4 flex items-center justify-between">
						<h3 class="text-base font-bold">Question {idx + 1}</h3>
						<button
							type="button"
							class="btn btn-sm preset-tonal-error flex min-h-11 min-w-11 items-center justify-center gap-2"
							aria-label={`Remove question ${idx + 1}`}
							onclick={() => onRemoveQuestion(question.id)}
						>
							<IconTrash class="h-4 w-4" />
							<span class="hidden sm:inline">Remove</span>
						</button>
					</div>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="flex flex-col gap-1.5 md:col-span-2">
							<label
								class="text-surface-800-200 text-sm font-medium"
								for={`question-label-${question.id}`}>Label *</label
							>
							<input
								id={`question-label-${question.id}`}
								class="input preset-tonal-surface min-h-11 rounded-lg px-4 py-2"
								value={question.label}
								oninput={(e) => onUpdateQuestion(question.id, { label: e.currentTarget.value })}
								placeholder="e.g. Any dietary restrictions or T-shirt size?"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-800-200 text-sm font-medium"
								for={`question-type-${question.id}`}>Field type</label
							>
							<select
								id={`question-type-${question.id}`}
								class="select preset-tonal-surface min-h-11 rounded-lg px-4 py-2"
								value={question.fieldType}
								onchange={(e) =>
									onUpdateQuestion(question.id, { fieldType: e.currentTarget.value })}
							>
								{#each fieldTypeOptions as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-1.5">
							<span class="text-surface-800-200 text-sm font-medium">Required?</span>
							<div class="flex min-h-11 items-center gap-3">
								<Toggle
									name={`question-required-${question.id}`}
									ariaLabel="Mark question as required"
									checked={question.isRequired}
									onChange={(v) => onUpdateQuestion(question.id, { isRequired: v })}
								/>
								<span class="text-surface-800-200 text-sm">Required</span>
							</div>
						</div>
						<div class="flex flex-col gap-1.5 md:col-span-2">
							<label
								class="text-surface-800-200 text-sm font-medium"
								for={`question-help-${question.id}`}>Help text</label
							>
							<textarea
								id={`question-help-${question.id}`}
								class="textarea preset-tonal-surface min-h-20 w-full rounded-lg px-4 py-2"
								value={question.helpText}
								oninput={(e) => onUpdateQuestion(question.id, { helpText: e.currentTarget.value })}
								placeholder="Give volunteers context, links, or clarifications."></textarea>
						</div>
						{#if supportsOptionField(question.fieldType)}
							<div class="space-y-2 md:col-span-2">
								<div class="flex flex-col gap-1.5">
									<label
										class="text-surface-800-200 text-sm font-medium"
										for={`question-option-draft-${question.id}`}>Options</label
									>
									<div class="flex flex-col gap-2 py-1 md:flex-row md:items-center">
										<input
											id={`question-option-draft-${question.id}`}
											class="input preset-tonal-surface min-h-11 rounded-lg px-4 py-2 md:w-64"
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
											class="btn preset-tonal-surface flex min-h-11 items-center gap-2 md:w-auto"
											onclick={() => addOption(question)}
											disabled={!question.optionDraft?.trim()}
										>
											<IconPlus class="h-4 w-4" />
											<span>Add option</span>
										</button>
									</div>
								</div>
								{#if parseOptions(question.optionsRaw).length}
									<div class="flex flex-wrap gap-2 pt-2">
										{#each parseOptions(question.optionsRaw) as option (option)}
											<span
												class="bg-surface-200-800/40 text-surface-800-200 border-surface-500/15 inline-flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-sm font-medium"
											>
												{option}
												<button
													type="button"
													class="text-error-600-400 hover:text-error-500 grid size-11 shrink-0 place-items-center transition-colors"
													aria-label={`Remove option ${option}`}
													onclick={() => removeOption(question, option)}
												>
													<IconTrash class="h-3.5 w-3.5" />
												</button>
											</span>
										{/each}
									</div>
								{:else}
									<p class="text-surface-600-400 text-sm">
										Add at least one option for this field.
									</p>
								{/if}
							</div>
						{/if}
						<div class="flex flex-col gap-1.5 md:col-span-2">
							<label
								class="text-surface-800-200 text-sm font-medium"
								for={`question-role-${question.id}`}>Limit to role</label
							>
							<select
								id={`question-role-${question.id}`}
								class="select preset-tonal-surface min-h-11 rounded-lg px-4 py-2"
								value={question.opportunityId ?? ''}
								onchange={(e) =>
									onUpdateQuestion(question.id, { opportunityId: e.currentTarget.value })}
							>
								<option value="">Applies to all signups</option>
								{#each opportunities as opp (opp.id)}
									<option value={opp.id}>{opp.title || 'Unnamed role'}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if !showHeader}
		<div class={customQuestions.length > 0 ? 'border-surface-500/15 border-t pt-4' : 'pt-1'}>
			<button
				type="button"
				onclick={onAddQuestion}
				class="btn preset-tonal-surface min-h-11 gap-2 font-medium"
			>
				<IconPlus class="h-4 w-4" />
				<span>Add question</span>
			</button>
		</div>
	{/if}
</div>
