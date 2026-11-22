<script>
	/** @type {any} */
	export let values = {};
	/** @type {any} */
	export let onChange = () => {};
	/** @type {any} */
	export let disabled = false;
	export let phoneRequired = false;
	export let phoneError = '';

	/** @type {any} */
	const fields = [
		{ key: 'volunteerName', label: 'Name', type: 'text', required: true, autocomplete: 'name' },
		{ key: 'volunteerEmail', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
		{ key: 'volunteerPhone', label: 'Mobile phone', type: 'tel', autocomplete: 'tel' },
		{ key: 'emergencyContactName', label: 'Emergency contact name', type: 'text' },
		{ key: 'emergencyContactPhone', label: 'Emergency contact phone', type: 'tel' }
	];
</script>

<div class="grid gap-4 md:grid-cols-2">
	{#each fields as field (field.key)}
		{@const isPhoneField = field.key === 'volunteerPhone'}
		{@const isRequired = Boolean(field.required || (isPhoneField && phoneRequired))}
		{@const fieldError = isPhoneField ? phoneError : ''}
		<label class="flex flex-col gap-1.5 text-xs font-bold tracking-[0.18em] uppercase">
			<span class="flex items-center gap-2">
				<span>{field.label}</span>
				{#if isPhoneField && phoneRequired}
					<span
						class="bg-primary-500 text-surface-950 px-2 py-0.5 text-[10px] font-black uppercase"
					>
						Required
					</span>
				{/if}
			</span>
			<input
				type={field.type}
				required={isRequired}
				autocomplete={field.autocomplete}
				aria-invalid={Boolean(fieldError) || undefined}
				aria-describedby={fieldError ? 'volunteer-contact-phone-error' : undefined}
				class="border-surface-950 bg-surface-950 text-surface-50 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none"
				value={values[field.key] ?? ''}
				{disabled}
				oninput={(event) => onChange(field.key, event.currentTarget.value)}
			/>
			{#if fieldError}
				<span
					id="volunteer-contact-phone-error"
					class="bg-tertiary-500 text-surface-950 px-2.5 py-1 text-[11px] font-black tracking-normal uppercase"
					role="alert"
				>
					{fieldError}
				</span>
			{/if}
		</label>
	{/each}
</div>
