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

<div class="grid gap-3 md:grid-cols-2">
	{#each fields as field}
		<label class="text-surface-400 flex flex-col gap-1 text-xs tracking-wide uppercase">
			<span>{field.label}</span>
			<input
				type={field.type}
				required={field.required}
				autocomplete={field.autocomplete}
				class="input bg-surface-950/40"
				value={values[field.key] ?? ''}
				{disabled}
				oninput={(event) => onChange(field.key, event.currentTarget.value)}
			/>
		</label>
	{/each}
</div>
