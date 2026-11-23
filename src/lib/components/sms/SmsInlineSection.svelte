<script>
	import {
		SMS_INLINE_DEFAULT_CONSENT_TEXT,
		emptySmsPreferences,
		getInlineSmsMode,
		getSelectedNewCategoryKeys
	} from '#lib/sms/inlineEnrollment';

	let {
		categories = [],
		preferences = emptySmsPreferences(),
		consentText = SMS_INLINE_DEFAULT_CONSENT_TEXT,
		loading = false,
		saving = false,
		tone = 'surface',
		eyebrow = 'Optional text updates',
		heading = '',
		selected = {},
		phone = '',
		consentChecked = false,
		showPhoneInput = true,
		phoneSharedNote = 'Uses the mobile phone number entered in your contact details above.',
		phoneError = '',
		consentError = '',
		errorMessage = '',
		successMessage = '',
		standalone = false,
		submitLabel = 'Enable text updates',
		savingLabel = 'Saving…',
		onToggleCategory = () => {},
		onPhoneChange = () => {},
		onConsentChange = () => {},
		onSubmit = () => {}
	} = $props();

	const instanceId = $props.id();
	const phoneInputId = `${instanceId}-phone`;
	const phoneErrorId = `${instanceId}-phone-error`;
	const consentErrorId = `${instanceId}-consent-error`;

	const smsState = $derived(getInlineSmsMode(preferences, categories));
	const selectedKeys = $derived(getSelectedNewCategoryKeys(smsState.availableCategories, selected));
	const requiresSmsDetails = $derived(selectedKeys.length > 0);

	const eyebrowClass = $derived(
		tone === 'violet'
			? 'text-primary-500 text-xs font-bold tracking-[0.22em] uppercase'
			: tone === 'lemon'
				? 'text-surface-950 text-xs font-black tracking-[0.22em] uppercase'
				: 'text-surface-700-300 text-xs font-bold tracking-[0.22em] uppercase'
	);

	const ruleClass = $derived(
		tone === 'lemon' || tone === 'violet' ? 'border-surface-950' : 'border-surface-300-700'
	);

	const linkClass = $derived(
		tone === 'violet'
			? 'text-primary-500 font-bold underline underline-offset-4'
			: 'font-bold underline underline-offset-4'
	);

	const checkboxClass = $derived(
		tone === 'violet'
			? 'border-surface-950 bg-surface-50 text-surface-950 focus:ring-primary-500 mt-0.5 h-5 w-5 shrink-0 border-2'
			: tone === 'lemon'
				? 'border-surface-950 bg-surface-50 text-secondary-500 focus:ring-surface-950 mt-0.5 h-5 w-5 shrink-0 border-2'
				: 'border-surface-500 bg-surface-50 text-secondary-500 focus:ring-primary-500 mt-0.5 h-5 w-5 shrink-0 border-2'
	);

	const phoneInputClass = $derived(
		tone === 'surface'
			? 'border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 border-2 px-4 py-3 text-sm font-medium focus:outline-none'
			: 'border-surface-950 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 border-[3px] px-4 py-3 text-sm font-medium focus:outline-none'
	);

	const requiredBadgeClass = $derived(
		tone === 'lemon'
			? 'bg-surface-950 text-primary-500 px-2 py-0.5 text-[10px] font-black uppercase'
			: 'bg-primary-500 text-surface-950 px-2 py-0.5 text-[10px] font-black uppercase'
	);

	const alertClass = $derived(
		tone === 'lemon'
			? 'bg-tertiary-500 text-surface-950 border-surface-950 border-[3px] px-4 py-3 text-xs font-black uppercase'
			: tone === 'violet'
				? 'bg-tertiary-500 text-surface-950 px-4 py-3 text-xs font-black uppercase'
				: 'bg-tertiary-500 text-surface-950 border-surface-950 border-2 px-4 py-3 text-xs font-black uppercase'
	);

	const successClass = $derived(
		tone === 'lemon'
			? 'bg-surface-950 text-primary-500 px-4 py-3 text-xs font-black uppercase'
			: 'bg-primary-500 text-surface-950 px-4 py-3 text-xs font-black uppercase'
	);

	const statusStripeClass = $derived(
		tone === 'violet' ? 'border-primary-500' : 'border-surface-950'
	);
</script>

{#if loading}
	<div class="flex flex-col gap-1 text-xs font-bold tracking-[0.16em] uppercase opacity-80">
		<span>Loading SMS preferences…</span>
	</div>
{:else if smsState.mode === 'unsubscribed'}
	<div class={`${statusStripeClass} flex flex-col gap-1 border-l-4 py-1 pl-4 text-sm`}>
		<div class="font-black uppercase">SMS is opted out for this number</div>
		<p class="m-0 text-xs leading-relaxed opacity-90">
			Reply START from the mobile number you used to opt in to rejoin, then manage categories in
			your <a class={linkClass} href="/profile">Profile</a>.
		</p>
	</div>
{:else if smsState.mode === 'blocked'}
	<div class={`${statusStripeClass} flex flex-col gap-1 border-l-4 py-1 pl-4 text-sm`}>
		<div class="font-black uppercase">SMS cannot be enabled for this number</div>
		<p class="m-0 text-xs leading-relaxed opacity-90">
			Contact <a class={linkClass} href="mailto:hi@3fp.org">hi@3fp.org</a> for help.
		</p>
	</div>
{:else if smsState.mode === 'all_active'}
	<div class={`${statusStripeClass} flex flex-col gap-1 border-l-4 py-1 pl-4 text-sm`}>
		<div class="font-black uppercase">Text updates are enabled</div>
		<p class="m-0 text-xs leading-relaxed opacity-90">
			Your selected text updates are active{preferences?.phone
				? ` for the number ending in ${preferences.phone.slice(-4)}`
				: ''}. Manage SMS choices in your <a class={linkClass} href="/profile">Profile</a>.
		</p>
		{#if successMessage}
			<p class={`${successClass} m-0 mt-2`} role="status">{successMessage}</p>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			{#if eyebrow}
				<p class={`${eyebrowClass} m-0`}>{eyebrow}</p>
			{/if}
			{#if heading}
				<h3
					class={`m-0 text-lg font-black uppercase ${
						tone === 'lemon'
							? 'text-surface-950!'
							: tone === 'violet'
								? 'text-surface-50!'
								: 'text-surface-950-50!'
					}`}
				>
					{heading}
				</h3>
			{/if}
			{#if smsState.activeCategories.length > 0}
				<p class="m-0 text-xs opacity-85">
					Already active: {smsState.activeCategories.map((item) => item.label).join('; ')}. Manage
					in <a class={linkClass} href="/profile">Profile</a>.
				</p>
			{/if}
		</div>

		<div class={`${ruleClass} flex flex-col divide-y border-t border-b`}>
			{#each smsState.availableCategories as option (option.key)}
				{@const checked = selected?.[option.key] === true}
				<label class="flex cursor-pointer items-start gap-3 py-3">
					<input
						type="checkbox"
						class={checkboxClass}
						{checked}
						disabled={saving}
						onchange={(event) => onToggleCategory(option.key, event.currentTarget.checked)}
					/>
					<span class="flex flex-col gap-0.5">
						<span class="text-sm leading-snug font-black uppercase">{option.label}</span>
						{#if option.description}
							<span class="text-xs leading-relaxed opacity-85">{option.description}</span>
						{/if}
					</span>
				</label>
			{/each}
		</div>

		{#if showPhoneInput}
			<div class="flex max-w-md flex-col gap-1.5">
				<label
					for={phoneInputId}
					class="flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase"
				>
					<span>Mobile phone</span>
					{#if requiresSmsDetails}
						<span class={requiredBadgeClass}>Required</span>
					{/if}
				</label>
				<input
					id={phoneInputId}
					type="tel"
					autocomplete="tel"
					maxlength="20"
					placeholder="(480) 555-0123"
					class={phoneInputClass}
					value={phone}
					disabled={saving}
					required={requiresSmsDetails}
					aria-invalid={Boolean(phoneError) || undefined}
					aria-describedby={phoneError ? phoneErrorId : undefined}
					oninput={(event) => onPhoneChange(event.currentTarget.value)}
				/>
				{#if phoneError}
					<p id={phoneErrorId} class={`${alertClass} m-0`} role="alert">{phoneError}</p>
				{/if}
			</div>
		{:else if phoneSharedNote}
			<p class="m-0 text-xs opacity-85">{phoneSharedNote}</p>
		{/if}

		<div class="flex flex-col gap-2">
			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="checkbox"
					class={checkboxClass}
					checked={consentChecked}
					disabled={saving}
					required={requiresSmsDetails}
					aria-invalid={Boolean(consentError) || undefined}
					aria-describedby={consentError ? consentErrorId : undefined}
					onchange={(event) => onConsentChange(event.currentTarget.checked)}
				/>
				<span class="text-xs leading-relaxed">
					{consentText} SMS is optional. See our
					<a class={linkClass} href="/terms">Terms</a> and
					<a class={linkClass} href="/privacy">Privacy Policy</a>.
				</span>
			</label>
			{#if consentError}
				<p id={consentErrorId} class={`${alertClass} m-0`} role="alert">{consentError}</p>
			{/if}
		</div>

		{#if errorMessage}
			<p class={`${alertClass} m-0`} role="alert">{errorMessage}</p>
		{/if}
		{#if successMessage}
			<p class={`${successClass} m-0`} role="status">{successMessage}</p>
		{/if}

		{#if standalone}
			<div>
				<button
					type="button"
					class="btn preset-filled-primary-500 rounded-none px-6 py-3 text-xs font-black tracking-wide uppercase"
					disabled={saving || selectedKeys.length === 0}
					onclick={onSubmit}
				>
					{saving ? savingLabel : submitLabel}
				</button>
			</div>
		{/if}
	</div>
{/if}
