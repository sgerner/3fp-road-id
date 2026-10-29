<script>
	import { renderMarkdown } from '#lib/markdown';

	export let questions = [];
	export let values = {};
	export let errors = {};
	export let onChange = () => {};

	function getValue(questionId) {
		return values?.[questionId];
	}

	function handleTextChange(question, event) {
		onChange(question.id, event.currentTarget.value);
	}

	function handleNumberChange(question, event) {
		const raw = event.currentTarget.value;
		if (raw === '') {
			onChange(question.id, '');
			return;
		}
		const parsed = Number(raw);
		onChange(question.id, Number.isNaN(parsed) ? raw : parsed);
	}

	function handleCheckboxChange(question, event) {
		onChange(question.id, event.currentTarget.checked);
	}

	function handleSelectChange(question, event) {
		onChange(question.id, event.currentTarget.value);
	}

	function handleMultiSelectChange(question, option, event) {
		const current = Array.isArray(values?.[question.id]) ? [...values[question.id]] : [];
		if (event.currentTarget.checked) {
			if (!current.includes(option)) current.push(option);
		} else {
			const idx = current.indexOf(option);
			if (idx !== -1) current.splice(idx, 1);
		}
		onChange(question.id, current);
	}

	function optionsFor(question) {
		if (!question?.options) return [];
		if (Array.isArray(question.options)) return question.options;
		try {
			const parsed = JSON.parse(question.options);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function inputType(question) {
		switch (question.field_type) {
			case 'email':
				return 'email';
			case 'phone':
				return 'tel';
			case 'url':
				return 'url';
			case 'number':
				return 'number';
			default:
				return 'text';
		}
	}
</script>

<div class="flex flex-col gap-5">
	{#each questions as question (question.id)}
		{@const questionInputId = `question-input-${question.id}`}
		<div class="flex flex-col gap-2">
			<label
				class="text-surface-50 block text-xs font-bold tracking-[0.18em] uppercase"
				for={questionInputId}
			>
				<span class="flex items-center gap-2">
					{question.label}
					{#if question.is_required}
						<span
							class="bg-primary-500 text-surface-950 px-2 py-0.5 text-[10px] font-black uppercase"
						>
							Required
						</span>
					{/if}
				</span>
			</label>

			{#if question.help_text}
				<div class="text-xs opacity-85">
					{@html renderMarkdown(question.help_text)}
				</div>
			{/if}

			{#if question.field_type === 'textarea'}
				<textarea
					id={questionInputId}
					class="border-surface-950 bg-surface-950 text-surface-50 min-h-[120px] border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleTextChange(question, event)}></textarea>
			{:else if question.field_type === 'select'}
				<select
					id={questionInputId}
					class="border-surface-950 bg-surface-950 text-surface-50 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
					onchange={(event) => handleSelectChange(question, event)}
					value={getValue(question.id) ?? ''}
				>
					<option value="">Select an option</option>
					{#each optionsFor(question) as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			{:else if question.field_type === 'multiselect'}
				<div
					id={questionInputId}
					class="border-surface-950 bg-surface-950 text-surface-50 flex flex-col gap-2 border-[3px] p-4"
				>
					{#each optionsFor(question) as option (option)}
						<label class="flex items-center gap-2 text-sm font-medium">
							<input
								type="checkbox"
								class="checkbox"
								checked={Array.isArray(getValue(question.id)) &&
									getValue(question.id).includes(option)}
								onchange={(event) => handleMultiSelectChange(question, option, event)}
							/>
							<span>{option}</span>
						</label>
					{/each}
				</div>
			{:else if question.field_type === 'checkbox'}
				<label class="flex items-center gap-2 text-sm font-medium">
					<input
						id={questionInputId}
						type="checkbox"
						class="checkbox"
						checked={Boolean(getValue(question.id))}
						onchange={(event) => handleCheckboxChange(question, event)}
					/>
					<span>{question.help_text ? 'I agree' : 'Yes'}</span>
				</label>
			{:else if question.field_type === 'number'}
				<input
					id={questionInputId}
					type="number"
					class="border-surface-950 bg-surface-950 text-surface-50 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleNumberChange(question, event)}
				/>
			{:else}
				<input
					id={questionInputId}
					type={inputType(question)}
					class="border-surface-950 bg-surface-950 text-surface-50 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleTextChange(question, event)}
				/>
			{/if}

			{#if errors?.[question.id]}
				<p class="bg-tertiary-500 text-surface-950 m-0 px-3 py-1.5 text-xs font-black uppercase">
					{errors[question.id]}
				</p>
			{/if}
		</div>
	{/each}
</div>
