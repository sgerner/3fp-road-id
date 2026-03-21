<script>
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconSend from '@lucide/svelte/icons/send';

	let { data } = $props();

	const group = $derived(data?.group || null);
	const program = $derived(data?.program_data?.program || null);
	const tiers = $derived(Array.isArray(data?.program_data?.tiers) ? data.program_data.tiers : []);
	const formFields = $derived(
		Array.isArray(data?.program_data?.form_fields) ? data.program_data.form_fields : []
	);
	const myApplications = $derived(
		Array.isArray(data?.my_applications) ? data.my_applications : []
	);
	const myMemberships = $derived(Array.isArray(data?.my_memberships) ? data.my_memberships : []);
	const currentUserProfile = $derived(data?.current_user_profile || null);
	const currentUserId = $derived(data?.current_user_id || null);

	let selectedTierId = $state(program?.default_tier_id || tiers?.[0]?.id || '');
	let selectedBillingInterval = $state('month');
	let answers = $state({});
	let memberProfile = $state({
		full_name: currentUserProfile?.full_name || '',
		email: currentUserProfile?.email || '',
		phone: currentUserProfile?.phone || ''
	});
	let busy = $state(false);
	let statusError = $state('');
	let statusMessage = $state('');

	const activeMembership = $derived(myMemberships.find((entry) => entry.status === 'active') || null);
	const latestApplication = $derived(myApplications[0] || null);
	const selectedTier = $derived(tiers.find((tier) => tier.id === selectedTierId) || null);
	const selectedTierMonthlyCents = $derived(
		selectedTier?.monthly_amount_cents === null || selectedTier?.monthly_amount_cents === undefined
			? Number(selectedTier?.amount_cents || 0)
			: Number(selectedTier?.monthly_amount_cents || 0)
	);
	const selectedTierAnnualCents = $derived(
		selectedTier?.annual_amount_cents === null || selectedTier?.annual_amount_cents === undefined
			? null
			: Number(selectedTier.annual_amount_cents || 0)
	);
	const selectedTierHasMonthly = $derived(
		selectedTier
			? selectedTier?.monthly_amount_cents !== null && selectedTier?.monthly_amount_cents !== undefined
				? true
				: selectedTier?.amount_cents !== null && selectedTier?.amount_cents !== undefined
					? true
					: selectedTier.allow_custom_amount === true
			: false
	);
	const selectedTierHasAnnual = $derived(
		selectedTier ? selectedTierAnnualCents !== null || selectedTier.allow_custom_amount === true : false
	);
	const accessMode = $derived(program?.access_mode || 'public');
	const contributionMode = $derived(program?.contribution_mode || 'donation');
	const modeIntroCopy = $derived(
		contributionMode === 'paid'
			? accessMode === 'private_request'
				? 'This group reviews applications first. Approved members complete payment to activate membership.'
				: 'Choose a paid tier to become a member. Payment is required to activate membership.'
			: accessMode === 'private_request'
				? 'This group reviews applications first. Once approved, you can join free or add optional support.'
				: 'Join free or add optional support to help fund rides, advocacy, and community programs.'
	);
	const requiresPayment = $derived(
		Boolean(
			selectedTier &&
				(contributionMode === 'paid' ||
					(selectedBillingInterval === 'year'
						? Number(selectedTierAnnualCents || 0) > 0
						: Number(selectedTierMonthlyCents || 0) > 0))
		)
	);
	const canCompletePrivatePayment = $derived(
		Boolean(
			latestApplication &&
			['approved', 'payment_pending'].includes(latestApplication.status) &&
			requiresPayment
		)
	);
	const checkoutButtonLabel = $derived(
		contributionMode === 'paid' ? 'Continue To Payment' : 'Support This Group'
	);

	function setFeedback(message = '', error = '') {
		statusMessage = message;
		statusError = error;
	}

	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: {
				'Content-Type': 'application/json',
				...(options.headers || {})
			},
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Request failed');
		}
		return payload?.data;
	}

	function normalizeAnswerValue(field, value) {
		if (field.field_type === 'checkbox') return value === true;
		if (field.field_type === 'number') {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		if (field.field_type === 'multiselect') {
			return Array.isArray(value) ? value : [];
		}
		return value ?? '';
	}

	function collectAnswersPayload() {
		return formFields
			.filter((field) => field.active !== false)
			.map((field) => ({
				field_id: field.id,
				value_json: normalizeAnswerValue(field, answers[field.id])
			}));
	}

	async function joinNow() {
		if (!selectedTierId) {
			setFeedback('', 'Select a membership tier first.');
			return;
		}
		const profilePayload = buildProfilePayload();
		const profileError = validateProfilePayload(profilePayload);
		if (profileError) {
			setFeedback('', profileError);
			return;
		}

		try {
			busy = true;
			setFeedback();
			const result = await api(`/api/groups/${group.slug}/membership/join`, {
				method: 'POST',
				body: JSON.stringify({
					tier_id: selectedTierId,
					billing_interval: selectedBillingInterval,
					profile: profilePayload
				})
			});
			if (result?.requires_checkout) {
				await startCheckout();
				return;
			}
			setFeedback('Membership activated.');
			setTimeout(() => {
				window.location.reload();
			}, 600);
		} catch (joinError) {
			setFeedback('', joinError?.message || 'Unable to join right now.');
		} finally {
			busy = false;
		}
	}

	async function startCheckout(applicationId = null) {
		if (!selectedTierId) {
			setFeedback('', 'Select a membership tier first.');
			return;
		}
		const profilePayload = buildProfilePayload();
		const profileError = validateProfilePayload(profilePayload);
		if (profileError) {
			setFeedback('', profileError);
			return;
		}
		try {
			busy = true;
			setFeedback();
			const result = await api(`/api/groups/${group.slug}/membership/checkout`, {
				method: 'POST',
				body: JSON.stringify({
					tier_id: selectedTierId,
					billing_interval: selectedBillingInterval,
					application_id: applicationId || latestApplication?.id || null,
					profile: profilePayload
				})
			});
			if (result?.checkout_url) {
				window.location.href = result.checkout_url;
				return;
			}
			setFeedback('Membership activated.');
			setTimeout(() => {
				window.location.reload();
			}, 600);
		} catch (checkoutError) {
			setFeedback('', checkoutError?.message || 'Unable to start checkout.');
		} finally {
			busy = false;
		}
	}

	async function submitApplication() {
		if (!selectedTierId) {
			setFeedback('', 'Select a tier before submitting your application.');
			return;
		}
		const profilePayload = buildProfilePayload();
		const profileError = validateProfilePayload(profilePayload);
		if (profileError) {
			setFeedback('', profileError);
			return;
		}
		try {
			busy = true;
			setFeedback();
			await api(`/api/groups/${group.slug}/membership/apply`, {
				method: 'POST',
				body: JSON.stringify({
					selected_tier_id: selectedTierId,
					billing_interval: selectedBillingInterval,
					profile: profilePayload,
					answers: collectAnswersPayload()
				})
			});
			setFeedback('Application submitted. You will receive an update after review.');
			setTimeout(() => {
				window.location.reload();
			}, 700);
		} catch (applyError) {
			setFeedback('', applyError?.message || 'Unable to submit application.');
		} finally {
			busy = false;
		}
	}

	function toggleMultiOption(fieldId, optionValue, checked) {
		const current = Array.isArray(answers[fieldId]) ? answers[fieldId] : [];
		if (checked) {
			answers = {
				...answers,
				[fieldId]: Array.from(new Set([...current, optionValue]))
			};
			return;
		}
		answers = {
			...answers,
			[fieldId]: current.filter((entry) => entry !== optionValue)
		};
	}

	function readOptions(field) {
		if (Array.isArray(field?.options_json)) return field.options_json;
		return [];
	}

	function buildProfilePayload() {
		return {
			full_name: String(memberProfile.full_name || '').trim(),
			email: String(memberProfile.email || '').trim(),
			phone: String(memberProfile.phone || '').trim()
		};
	}

	function validateProfilePayload(profilePayload) {
		if (!profilePayload.full_name) return 'Name is required.';
		if (!profilePayload.email) return 'Email is required.';
		if (!/^\S+@\S+\.\S+$/.test(profilePayload.email)) return 'Enter a valid email address.';
		return '';
	}

	function formatMembershipPrice(cents) {
		const value = Number(cents ?? 0);
		if (!Number.isFinite(value) || value <= 0) return 'Free';
		return `$${(value / 100).toFixed(2)}`;
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 px-3 pt-4 pb-10 md:px-4 lg:px-6">
	<section class="card border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-5">
		<h1 class="text-2xl font-bold">{group?.name} Membership</h1>
		{#if program?.enabled}
			<p class="text-surface-600-400 mt-1 text-sm">{modeIntroCopy}</p>
		{:else}
			<p class="text-warning-600-400 mt-1 text-sm">Membership is currently disabled for this group.</p>
		{/if}
	</section>

	{#if statusMessage}
		<div class="text-success-600-400 flex items-center gap-2 text-sm">
			<IconCheckCircle class="h-4 w-4" /> {statusMessage}
		</div>
	{/if}
	{#if statusError}
		<div class="text-error-600-400 flex items-center gap-2 text-sm">
			<IconAlertCircle class="h-4 w-4" /> {statusError}
		</div>
	{/if}

	{#if !program || program.enabled === false}
		<section class="card border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-5 text-sm opacity-80">
			No membership program is currently available.
		</section>
	{:else}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-5">
			<h2 class="text-lg font-semibold">Choose Tier</h2>
			{#if tiers.length === 0}
				<p class="text-sm opacity-70">No tiers have been published yet.</p>
			{:else}
				<div class="space-y-2">
					{#each tiers as tier (tier.id)}
						<label class="border-surface-400-600/30 flex cursor-pointer items-start gap-3 rounded-xl border p-3">
							<input
								type="radio"
								class="preset-tonal-surface"
								name="membership-tier"
								value={tier.id}
								checked={selectedTierId === tier.id}
								onchange={() => {
									selectedTierId = tier.id;
									const monthlyAvailable =
										(tier.monthly_amount_cents !== null &&
											tier.monthly_amount_cents !== undefined) ||
										(tier.amount_cents !== null && tier.amount_cents !== undefined) ||
										tier.allow_custom_amount === true;
									const annualAvailable =
										(tier.annual_amount_cents !== null &&
											tier.annual_amount_cents !== undefined) ||
										tier.allow_custom_amount === true;
									selectedBillingInterval = monthlyAvailable
										? 'month'
										: annualAvailable
											? 'year'
											: 'month';
								}}
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="font-medium">{tier.name}</div>
									<div class="text-sm">
										{#if tier.monthly_amount_cents !== null && tier.monthly_amount_cents !== undefined}
											{formatMembershipPrice(
												tier.monthly_amount_cents ?? tier.amount_cents ?? 0
											)}/month
										{/if}
										{#if tier.annual_amount_cents !== null && tier.annual_amount_cents !== undefined}
											{tier.monthly_amount_cents !== null && tier.monthly_amount_cents !== undefined
												? ' · '
												: ''}
											{formatMembershipPrice(tier.annual_amount_cents)}/year
										{/if}
									</div>
								</div>
								{#if tier.description}
									<p class="text-sm opacity-80">{tier.description}</p>
								{/if}
							</div>
						</label>
					{/each}
				</div>
			{/if}
		</section>

		{#if selectedTier && (selectedTierHasMonthly || selectedTierHasAnnual)}
			<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-3 rounded-2xl border p-5">
				<h2 class="text-lg font-semibold">Billing Cadence</h2>
				<div class="flex flex-wrap gap-2">
					{#if selectedTierHasMonthly}
						<label class="chip preset-tonal-surface inline-flex items-center gap-2 px-3 py-1.5">
							<input
								type="radio"
								class="preset-tonal-surface"
								name="membership-billing-interval"
								value="month"
								checked={selectedBillingInterval === 'month'}
								onchange={() => {
									selectedBillingInterval = 'month';
								}}
							/>
							<span>Monthly</span>
						</label>
					{/if}
					{#if selectedTierHasAnnual}
						<label class="chip preset-tonal-surface inline-flex items-center gap-2 px-3 py-1.5">
							<input
								type="radio"
								class="preset-tonal-surface"
								name="membership-billing-interval"
								value="year"
								checked={selectedBillingInterval === 'year'}
								onchange={() => {
									selectedBillingInterval = 'year';
								}}
							/>
							<span>Annual</span>
						</label>
					{/if}
				</div>
			</section>
		{/if}

		{#if currentUserId}
			{#if accessMode === 'private_request'}
				<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-5">
					<h2 class="text-lg font-semibold">Membership Application</h2>
					<div class="space-y-2 rounded-xl border border-surface-400-600/30 p-3">
						<div class="text-sm font-semibold">Your Contact Details</div>
						<p class="text-xs opacity-70">
							Name, email, and phone come from your profile. Changes here update your profile.
						</p>
						<div class="grid gap-2 md:grid-cols-3">
							<input class="input preset-tonal-surface" placeholder="Name" bind:value={memberProfile.full_name} />
							<input
								class="input preset-tonal-surface"
								type="email"
								placeholder="Email"
								bind:value={memberProfile.email}
							/>
							<input
								class="input preset-tonal-surface"
								type="tel"
								placeholder="Phone"
								bind:value={memberProfile.phone}
							/>
						</div>
					</div>
					{#if formFields.length === 0}
						<p class="text-sm opacity-70">No custom questions are required for this application.</p>
					{:else}
						<div class="space-y-3">
							{#each formFields as field (field.id)}
								<div class="space-y-1.5">
									<label class="text-sm font-medium">{field.label}</label>
									{#if field.help_text}
										<p class="text-xs opacity-70">{field.help_text}</p>
									{/if}
									{#if field.field_type === 'textarea'}
										<textarea
											class="textarea preset-tonal-surface"
											value={answers[field.id] || ''}
											oninput={(event) => {
												answers = { ...answers, [field.id]: event.currentTarget.value };
											}}
										></textarea>
									{:else if field.field_type === 'select'}
										<select
											class="select preset-tonal-surface"
											value={answers[field.id] || ''}
											onchange={(event) => {
												answers = { ...answers, [field.id]: event.currentTarget.value };
											}}
										>
											<option value="">Select</option>
											{#each readOptions(field) as option}
												<option value={option}>{option}</option>
											{/each}
										</select>
									{:else if field.field_type === 'multiselect'}
										<div class="space-y-1.5">
											{#each readOptions(field) as option}
												<label class="flex items-center gap-2 text-sm">
													<input
														type="checkbox"
														class="preset-tonal-surface"
														checked={Array.isArray(answers[field.id]) && answers[field.id].includes(option)}
														onchange={(event) => {
															toggleMultiOption(field.id, option, event.currentTarget.checked);
														}}
													/>
													<span>{option}</span>
												</label>
											{/each}
										</div>
									{:else if field.field_type === 'checkbox'}
										<label class="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													class="preset-tonal-surface"
													checked={answers[field.id] === true}
												onchange={(event) => {
													answers = { ...answers, [field.id]: event.currentTarget.checked };
												}}
											/>
											<span>Yes</span>
										</label>
									{:else}
										<input
											type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : 'text'}
											class="input preset-tonal-surface"
											value={answers[field.id] || ''}
											oninput={(event) => {
												answers = { ...answers, [field.id]: event.currentTarget.value };
											}}
										/>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if canCompletePrivatePayment}
						<div class="rounded-xl border border-primary-500/30 bg-primary-500/10 p-3 text-sm">
							{contributionMode === 'paid'
								? 'Your application is approved. Payment is required to activate your membership.'
								: 'Your application is approved. You can complete optional support checkout to activate with a contribution.'}
						</div>
						<button
							type="button"
							class="btn preset-filled-primary-500"
							onclick={() => startCheckout(latestApplication.id)}
							disabled={busy}
						>
							{#if busy}
								<IconLoader class="h-4 w-4 animate-spin" />
							{:else}
								<IconCreditCard class="h-4 w-4" />
							{/if}
							{checkoutButtonLabel}
						</button>
					{:else}
						<button
							type="button"
							class="btn preset-filled-primary-500"
							onclick={submitApplication}
							disabled={busy}
						>
							{#if busy}
								<IconLoader class="h-4 w-4 animate-spin" />
							{:else}
								<IconSend class="h-4 w-4" />
							{/if}
							Submit Application
						</button>
					{/if}
				</section>
			{:else}
				<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-5">
					<h2 class="text-lg font-semibold">Join</h2>
					<div class="space-y-2 rounded-xl border border-surface-400-600/30 p-3">
						<div class="text-sm font-semibold">Your Contact Details</div>
						<p class="text-xs opacity-70">
							Name, email, and phone come from your profile. Changes here update your profile.
						</p>
						<div class="grid gap-2 md:grid-cols-3">
							<input class="input preset-tonal-surface" placeholder="Name" bind:value={memberProfile.full_name} />
							<input
								class="input preset-tonal-surface"
								type="email"
								placeholder="Email"
								bind:value={memberProfile.email}
							/>
							<input
								class="input preset-tonal-surface"
								type="tel"
								placeholder="Phone"
								bind:value={memberProfile.phone}
							/>
						</div>
					</div>
					<p class="text-sm opacity-80">
						{#if contributionMode === 'paid'}
							Payment is required to activate this membership tier.
						{:else if requiresPayment}
							Support checkout will activate your membership with this contribution.
						{:else}
							This tier is free to join right now.
						{/if}
					</p>
					{#if requiresPayment}
						<button
							type="button"
							class="btn preset-filled-primary-500"
							onclick={() => startCheckout()}
							disabled={busy}
						>
							{#if busy}
								<IconLoader class="h-4 w-4 animate-spin" />
							{:else}
								<IconCreditCard class="h-4 w-4" />
							{/if}
							{checkoutButtonLabel}
						</button>
					{:else}
						<button
							type="button"
							class="btn preset-filled-primary-500"
							onclick={joinNow}
							disabled={busy}
						>
							{#if busy}
								<IconLoader class="h-4 w-4 animate-spin" />
							{:else}
								<IconCheckCircle class="h-4 w-4" />
							{/if}
							{contributionMode === 'donation' ? 'Join Free' : 'Join Now'}
						</button>
					{/if}
				</section>
			{/if}
		{:else}
			<section class="card border-warning-500/30 bg-warning-500/10 rounded-2xl border p-5 text-sm">
				Please log in to apply or join this membership program.
			</section>
		{/if}
	{/if}

	{#if currentUserId && (myApplications.length || myMemberships.length)}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-3 rounded-2xl border p-5">
			<h2 class="text-lg font-semibold">Your Membership Activity</h2>
			{#if myApplications.length}
				<div class="space-y-1">
					<div class="text-sm font-medium">Applications</div>
					{#each myApplications as app (app.id)}
						<div class="rounded-xl border border-surface-400-600/30 p-2 text-sm">
							{app.status} · Submitted {new Date(app.submitted_at).toLocaleString()}
						</div>
					{/each}
				</div>
			{/if}
			{#if myMemberships.length}
				<div class="space-y-1">
					<div class="text-sm font-medium">Memberships</div>
					{#each myMemberships as membership (membership.id)}
						<div class="rounded-xl border border-surface-400-600/30 p-2 text-sm">
							{membership.status}
							{#if membership.renews_at}
								· Renews {new Date(membership.renews_at).toLocaleDateString()}
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
