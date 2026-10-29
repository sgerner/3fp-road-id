<script>
	export let values = {};
	export let onChange = () => {};
	export let disabled = false;

	const fields = [
		{ key: 'volunteerName', label: 'Name', type: 'text', required: true, autocomplete: 'name' },
		{ key: 'volunteerEmail', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
		{ key: 'volunteerPhone', label: 'Phone', type: 'tel', autocomplete: 'tel' },
		{ key: 'emergencyContactName', label: 'Emergency contact name', type: 'text' },
		{ key: 'emergencyContactPhone', label: 'Emergency contact phone', type: 'tel' }
	];
</script>

<div class="grid gap-4 md:grid-cols-2">
	{#each fields as field (field.key)}
		<label class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.18em] uppercase">
			<span>{field.label}</span>
			<input
				type={field.type}
				required={field.required}
				autocomplete={field.autocomplete}
				class="border-surface-950 bg-surface-950 text-surface-50 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
				value={values[field.key] ?? ''}
				{disabled}
				oninput={(event) => onChange(field.key, event.currentTarget.value)}
			/>
		</label>
	{/each}
</div>
