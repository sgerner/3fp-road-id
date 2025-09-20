<script>
	import { renderMarkdown } from '$lib/markdown';

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

<div class="space-y-4">
	{#each questions as question (question.id)}
		<div class="space-y-2">
			<label class="text-surface-200 block text-sm font-semibold">
				<span class="flex items-center gap-2">
					{question.label}
					{#if question.is_required}
						<span class="text-warning-300 text-xs uppercase">Required</span>
					{/if}
				</span>
			</label>

			{#if question.help_text}
				<div class="text-surface-400 text-xs">
					{@html renderMarkdown(question.help_text)}
				</div>
			{/if}

			{#if question.field_type === 'textarea'}
				<textarea
					class="input bg-surface-950/40 min-h-[120px]"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleTextChange(question, event)}
				></textarea>
			{:else if question.field_type === 'select'}
				<select
					class="input bg-surface-950/40"
					onchange={(event) => handleSelectChange(question, event)}
					value={getValue(question.id) ?? ''}
				>
					<option value="">Select an option</option>
					{#each optionsFor(question) as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			{:else if question.field_type === 'multiselect'}
				<div class="bg-surface-950/40 border-surface-500/30 space-y-2 rounded-xl border p-3">
					{#each optionsFor(question) as option (option)}
						<label class="flex items-center gap-2 text-sm">
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
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="checkbox"
						checked={Boolean(getValue(question.id))}
						onchange={(event) => handleCheckboxChange(question, event)}
					/>
					<span>{question.help_text ? 'I agree' : 'Yes'}</span>
				</label>
			{:else if question.field_type === 'number'}
				<input
					type="number"
					class="input bg-surface-950/40"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleNumberChange(question, event)}
				/>
			{:else}
				<input
					type={inputType(question)}
					class="input bg-surface-950/40"
					value={getValue(question.id) ?? ''}
					oninput={(event) => handleTextChange(question, event)}
				/>
			{/if}

			{#if errors?.[question.id]}
				<p class="text-error-200 text-xs">{errors[question.id]}</p>
			{/if}
		</div>
	{/each}
</div>
