<script>
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconShield from '@lucide/svelte/icons/shield';
	import IconLock from '@lucide/svelte/icons/lock';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconTrendingUp from '@lucide/svelte/icons/trending-up';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconEyeOff from '@lucide/svelte/icons/eye-off';
	import { loadStripe } from '@stripe/stripe-js';
	import { onDestroy, onMount, tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	let { data } = $props();

	let amount = $state(25);
	let donorName = $state('');
	let donorEmail = $state('');
	let donorMessage = $state('');
	let requestAnonymity = $state(false);
	let submitting = $state(false);
	let disconnecting = $state(false);
	let preparingPayment = $state(false);
	let error = $state('');
	let success = $state('');
	let paymentFormReady = $state(false);
	let paymentElementHost = $state(null);
	let preparedAmount = $state('');
	let paymentIntentId = $state('');
	let paymentReturnUrl = $state('');

	const presetAmounts = [10, 25, 50, 100, 250];
	const recipient = $derived(data?.recipient ?? null);
	const recipientLabel = $derived(recipient?.label ?? '3 Feet Please');
	const recipientType = $derived(recipient?.type ?? 'main');
	const isGroupRecipient = $derived(recipientType === 'group');
	const groupSlug = $derived(recipient?.group?.slug ?? '');
	const groupDonationIntentUrl = $derived(
		isGroupRecipient && groupSlug
			? `/api/groups/${encodeURIComponent(groupSlug)}/donate/create-payment-intent`
			: '/api/donations/create-payment-intent'
	);
	const donationEnabled = $derived(recipient?.donationEnabled === true);
	const accountConnected = $derived(recipient?.accountConnected === true);
	const accountReady = $derived(recipient?.accountReady === true);
	const pageTitle = $derived(
		isGroupRecipient ? `Donate to ${recipientLabel} • 3 Feet Please` : 'Donate • 3 Feet Please'
	);
	const pageDescription = $derived(
		isGroupRecipient
			? `Support ${recipientLabel} directly. Donations on this page go to this group's connected Stripe account and may not be tax-deductible.`
			: 'Support 3 Feet Please and help build safer streets for cyclists everywhere. Every dollar makes a difference.'
	);

	let stripe = null;
	let elements = null;
	let paymentElement = null;
	let preparedSignature = '';

	function formatAmount(value) {
		const n = Number(value || 0);
		return Number.isFinite(n) ? n.toFixed(2) : '0.00';
	}

	function validateAmountOnly() {
		const numericAmount = Number(amount);
		if (!Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > 25000) {
			return 'Donation amount must be between $1 and $25,000.';
		}
		return '';
	}

	function validateDonationForm() {
		const amountError = validateAmountOnly();
		if (amountError) return amountError;
		if (!String(donorEmail || '').trim()) {
			return 'A valid donor email is required so we can send your confirmation.';
		}
		return '';
	}

	function buildPaymentSignature() {
		return JSON.stringify({
			recipientType,
			groupSlug,
			amount: formatAmount(amount),
			donorName: String(donorName || '').trim(),
			donorEmail: String(donorEmail || '')
				.trim()
				.toLowerCase(),
			donorMessage: String(donorMessage || '').trim(),
			requestAnonymity
		});
	}

	function teardownPaymentElement() {
		if (paymentElement) {
			paymentElement.destroy();
			paymentElement = null;
		}
		elements = null;
		stripe = null;
		paymentFormReady = false;
		paymentIntentId = '';
		paymentReturnUrl = '';
	}

	async function preparePaymentElement(options = {}) {
		const { quiet = false } = options;
		error = '';
		if (!quiet) success = '';

		const validationError = validateAmountOnly();
		if (validationError) {
			error = validationError;
			return false;
		}

		preparingPayment = true;
		try {
			teardownPaymentElement();
			const response = await fetch(groupDonationIntentUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipient: recipientType === 'group' ? 'group' : 'main',
					group: recipientType === 'group' ? groupSlug : undefined,
					amount: Number(amount),
					donorName,
					donorEmail,
					donorMessage,
					requestAnonymity
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to prepare payment form.');
			}
			if (
				!payload?.clientSecret ||
				!payload?.publishableKey ||
				!payload?.connectedAccountId ||
				!payload?.returnUrl
			) {
				throw new Error('Stripe payment form could not be initialized.');
			}

			stripe = await loadStripe(payload.publishableKey, {
				stripeAccount: payload.connectedAccountId
			});
			if (!stripe) {
				throw new Error('Stripe.js failed to load.');
			}

			preparedSignature = buildPaymentSignature();
			preparedAmount = formatAmount(amount);
			paymentIntentId = payload.paymentIntentId || '';
			paymentReturnUrl = payload.returnUrl;

			await tick();
			elements = stripe.elements({
				clientSecret: payload.clientSecret,
				appearance: {
					theme: 'night',
					variables: {
						colorPrimary: '#f4ff00',
						colorBackground: 'rgba(10, 15, 20, 0.55)',
						colorText: '#f8f5dd',
						colorDanger: '#ff6b6b',
						fontFamily: 'inherit',
						borderRadius: '16px'
					}
				}
			});
			paymentElement = elements.create('payment', {
				layout: {
					type: 'tabs',
					defaultCollapsed: false
				}
			});
			paymentElement.mount(paymentElementHost);
			paymentFormReady = true;
			if (!quiet) {
				success = 'Secure payment form loaded below.';
			}
			return true;
		} catch (err) {
			teardownPaymentElement();
			error = err?.message || 'Unable to prepare payment form.';
			return false;
		} finally {
			preparingPayment = false;
		}
	}

	async function syncPaymentIntentDetails() {
		if (!paymentIntentId) {
			return preparePaymentElement({ quiet: true });
		}

		const response = await fetch('/api/donations/update-payment-intent', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				paymentIntentId,
				amount: Number(amount),
				donorName,
				donorEmail,
				donorMessage,
				requestAnonymity
			})
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Unable to update payment details.');
		}

		preparedSignature = buildPaymentSignature();
		preparedAmount = formatAmount(amount);
		if (elements?.fetchUpdates) {
			await elements.fetchUpdates();
		}
	}

	async function startCheckout(event) {
		event?.preventDefault?.();
		error = '';
		success = '';

		const validationError = validateDonationForm();
		if (validationError) {
			error = validationError;
			return;
		}

		if (!paymentFormReady) {
			await preparePaymentElement({ quiet: true });
		}
		if (!paymentFormReady) {
			return;
		}

		if (preparedSignature !== buildPaymentSignature()) {
			try {
				await syncPaymentIntentDetails();
			} catch (err) {
				error = err?.message || 'Unable to update payment details.';
				return;
			}
		}

		if (!stripe || !elements || !paymentReturnUrl) {
			error = 'Stripe payment form is not ready yet.';
			return;
		}

		submitting = true;
		try {
			const { error: stripeError } = await stripe.confirmPayment({
				elements,
				confirmParams: {
					return_url: paymentReturnUrl
				}
			});

			if (stripeError) {
				throw new Error(stripeError.message || 'Unable to confirm payment.');
			}
		} catch (err) {
			error = err?.message || 'Unable to confirm payment.';
		} finally {
			submitting = false;
		}
	}

	async function disconnectMainStripe() {
		error = '';
		success = '';
		disconnecting = true;
		try {
			const response = await fetch('/api/donations/connect/disconnect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient: 'main' })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to disconnect Stripe.');
			}
			success = 'Main organization Stripe account disconnected.';
			window.location.reload();
		} catch (err) {
			error = err?.message || 'Failed to disconnect Stripe.';
		} finally {
			disconnecting = false;
		}
	}

	onDestroy(() => {
		teardownPaymentElement();
	});

	onMount(() => {
		if (donationEnabled) {
			void preparePaymentElement({ quiet: true });
		}
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
</svelte:head>

<div class="donate-page mx-auto flex w-full max-w-5xl flex-col gap-10 pb-16">
	<!-- ═══════════════════════════════════════════════
	     CINEMATIC HERO
	═══════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div class="relative z-10 p-6 lg:p-12">
			<!-- Badge chips -->
			<div class="mb-6 flex flex-wrap items-center gap-2">
				<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
					<IconHeart class="h-3.5 w-3.5" />
					Donate
				</span>
				{#if isGroupRecipient}
					<span class="chip preset-tonal-secondary">Community Group</span>
					<span class="chip preset-tonal-tertiary">Tax Status Varies</span>
				{:else}
					<span class="chip preset-tonal-secondary">501(c)(3) Nonprofit</span>
					<span class="chip preset-tonal-tertiary">Tax-Deductible</span>
				{/if}
			</div>

			<!-- Two-column layout for content + stat cards -->
			<div class="grid gap-8 lg:grid-cols-[1fr_auto]">
				<!-- Left: headline + copy -->
				<div class="flex flex-col gap-6">
					<div class="space-y-4">
						<h1
							class="donate-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
						>
							{#if isGroupRecipient}
								Support {recipientLabel}.<br />
								<span class="donate-headline-accent">Fund local impact.</span>
							{:else}
								Every ride counts.<br />
								<span class="donate-headline-accent">Fund safer streets.</span>
							{/if}
						</h1>
						<p class="max-w-xl text-base leading-relaxed opacity-75">
							{#if isGroupRecipient}
								This page sends donations directly to <strong>{recipientLabel}</strong> through their
								connected Stripe account. Tax deductibility depends on that group's legal status and may
								not apply.
							{:else}
								3 Feet Please is a 501(c)(3) nonprofit fighting for cyclist safety and stronger
								cycling culture. Your tax-deductible gift powers advocacy, education, and community
								programs that protect riders everywhere.
							{/if}
						</p>
					</div>

					<!-- Trust signals row -->
					<div class="flex flex-wrap items-center gap-4 text-sm opacity-70">
						<span class="flex items-center gap-1.5">
							<IconLock class="h-4 w-4 text-green-400" />
							Secure via Stripe
						</span>
						<span class="flex items-center gap-1.5">
							<IconShield class="h-4 w-4 text-blue-400" />
							{#if isGroupRecipient}
								Tax status depends on the group
							{:else}
								Tax-deductible (EIN 99-3658890)
							{/if}
						</span>
						<span class="flex items-center gap-1.5">
							<IconEyeOff class="h-4 w-4 text-purple-400" />
							Anonymity available
						</span>
					</div>
				</div>

				<!-- Right: impact stat cards -->
				<div class="flex flex-col gap-3 lg:w-56">
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-primary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconBike class="h-4 w-4" />
							{isGroupRecipient ? 'Direct Support' : 'Years Active'}
						</div>
						<div class="text-3xl font-black tabular-nums">{isGroupRecipient ? 'Local' : '10+'}</div>
					</div>
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-secondary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconUsers class="h-4 w-4" />
							{isGroupRecipient ? 'Funds Route' : 'Advocates'}
						</div>
						<div class="text-3xl font-black tabular-nums">
							{isGroupRecipient ? 'Group' : '100+'}
						</div>
					</div>
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-tertiary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconTrendingUp class="h-4 w-4" />
							{isGroupRecipient ? 'Tax Status' : 'Lives Impacted'}
						</div>
						<div class="text-3xl font-black tabular-nums">
							{isGroupRecipient ? 'Varies' : '1000+'}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Status alerts inside hero -->
		{#if data.canceled}
			<div
				class="relative z-10 mx-6 mb-6 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm lg:mx-12"
			>
				Checkout was canceled. No donation was charged.
			</div>
		{/if}
		{#if data.stripeStatus === 'connected'}
			<div
				class="relative z-10 mx-6 mb-6 flex items-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm lg:mx-12"
			>
				<IconCheck class="h-4 w-4 shrink-0 text-green-400" />
				Stripe account connected successfully.
			</div>
		{:else if data.stripeStatus === 'error'}
			<div
				class="relative z-10 mx-6 mb-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm lg:mx-12"
			>
				Stripe connection failed. {data.stripeReason ? `Reason: ${data.stripeReason}` : ''}
			</div>
		{/if}
	</section>

	<!-- ═══════════════════════════════════════════════
	     ADMIN: MANAGE MAIN STRIPE
	═══════════════════════════════════════════════ -->
	{#if data.showManageMain}
		<section
			class="card border-surface-300-700/50 bg-surface-100-900/60 relative overflow-hidden border p-6"
		>
			<div class="admin-glow" aria-hidden="true"></div>
			<div class="relative z-10 flex flex-wrap items-start justify-between gap-4">
				<div class="flex items-start gap-3">
					<div
						class="admin-icon-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
					>
						<IconSparkles class="h-5 w-5" />
					</div>
					<div>
						<p class="label mb-0.5 text-xs tracking-widest uppercase opacity-60">Admin</p>
						<h2 class="!mt-0 !mb-1 !text-left text-lg font-bold">Main Organization Stripe</h2>
						<p class="text-sm opacity-70">
							Connect or replace the main 3 Feet Please Stripe account used by the global Donate
							button.
						</p>
						{#if accountConnected}
							<p class="mt-2 text-sm opacity-70">
								{#if accountReady}
									Account connected and ready to accept charges.
								{:else}
									Account connected, but Stripe has not enabled charges yet.
								{/if}
							</p>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href="/api/donations/connect/start?recipient=main"
						class="btn preset-filled-primary-500 gap-2"
					>
						<IconSparkles class="h-4 w-4" />
						Connect / Reconnect Stripe
					</a>
					{#if recipient?.accountConnected}
						<button
							type="button"
							class="btn preset-outlined-error-500"
							disabled={disconnecting}
							onclick={disconnectMainStripe}
						>
							{disconnecting ? 'Disconnecting…' : 'Disconnect'}
						</button>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     DONATION FORM / STATUS
	═══════════════════════════════════════════════ -->
	{#if data.loadError}
		<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-5 text-sm">
			{data.loadError}
		</section>
	{:else if !recipient}
		<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-5 text-sm">
			Donation recipient could not be loaded.
		</section>
	{:else if recipientType === 'group' && !recipient?.claimed}
		<section class="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 text-sm">
			This group has not been claimed yet, so donations are not enabled.
		</section>
	{:else if !donationEnabled}
		<section class="not-enabled-section card relative overflow-hidden p-8 text-center">
			<div class="not-enabled-orb" aria-hidden="true"></div>
			<div class="relative z-10 mx-auto max-w-sm space-y-3">
				<div
					class="not-enabled-icon mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
				>
					<IconHeart class="h-8 w-8 opacity-60" />
				</div>
				<h2 class="text-xl font-bold">Donations coming soon</h2>
				<p class="text-sm leading-relaxed opacity-70">
					{#if accountConnected}
						Stripe is connected, but this account is not yet ready to accept charges.
					{:else if recipientType === 'group'}
						This group hasn't connected Stripe donations yet.
					{:else}
						The main organization hasn't connected Stripe donations yet.
					{/if}
				</p>
			</div>
		</section>
	{:else}
		<!-- THE DONATION FORM -->
		<form class="donation-form-section card relative overflow-hidden p-0" onsubmit={startCheckout}>
			<div class="form-orb" aria-hidden="true"></div>

			<div class="relative z-10 p-6 lg:p-8">
				<!-- Form header -->
				<div class="mb-7 flex items-start gap-4">
					<div
						class="form-icon-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
					>
						<IconHeart class="h-5 w-5" />
					</div>
					<div>
						<div
							class="mb-1 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-60"
						>
							<IconSparkles class="h-3.5 w-3.5" />
							Secure Donation
						</div>
						<h2 class="!mt-0 !mb-0.5 !text-left text-2xl font-bold">Support {recipientLabel}</h2>
						<p class="text-sm opacity-65">
							{#if isGroupRecipient}
								Choose an amount and complete your gift directly to this group with Stripe.
							{:else}
								Choose an amount and complete your gift directly on this page with Stripe.
							{/if}
						</p>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-6">
					<!-- Amount selector -->
					<div class="amount-section rounded-2xl p-5">
						<label
							class="label mb-3 text-xs font-semibold tracking-[0.15em] uppercase opacity-60"
							for="donation_amount"
						>
							Choose your amount (USD)
						</label>
						<!-- Preset chips -->
						<div class="mb-4 flex flex-wrap gap-2">
							{#each presetAmounts as preset}
								<button
									type="button"
									class="btn px-4 py-2 {Number(amount) === preset
										? 'preset-filled-primary-500'
										: 'preset-outlined-primary-500'}"
									onclick={() => (amount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>
						<!-- Custom amount -->
						<div class="relative">
							<span
								class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold opacity-50"
								>$</span
							>
							<input
								id="donation_amount"
								type="number"
								class="input preset-tonal-surface w-full pl-8 text-lg font-bold md:w-48"
								min="1"
								max="25000"
								step="0.01"
								bind:value={amount}
								required
							/>
						</div>
					</div>

					<!-- Donor info -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label
								class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
								for="donor_name"
							>
								Name <span class="normal-case opacity-60">(optional)</span>
							</label>
							<input
								id="donor_name"
								class="input preset-tonal-surface w-full"
								type="text"
								maxlength="120"
								placeholder="Your name"
								bind:value={donorName}
							/>
						</div>
						<div>
							<label
								class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
								for="donor_email"
							>
								Email <span class="normal-case opacity-60">(for receipt)</span>
							</label>
							<input
								id="donor_email"
								class="input preset-tonal-surface w-full"
								type="email"
								maxlength="160"
								placeholder="you@example.com"
								bind:value={donorEmail}
								required
							/>
						</div>
					</div>

					<div>
						<label
							class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
							for="donor_message"
						>
							Message <span class="normal-case opacity-60">(optional)</span>
						</label>
						<textarea
							id="donor_message"
							class="textarea preset-tonal-surface w-full"
							rows="3"
							maxlength="1000"
							placeholder="Share what inspires you to give…"
							bind:value={donorMessage}
						></textarea>
					</div>

					<!-- Anonymity checkbox -->
					<label class="anonymity-check flex cursor-pointer items-start gap-3 rounded-xl p-3">
						<input
							type="checkbox"
							class="checkbox mt-0.5 shrink-0"
							bind:checked={requestAnonymity}
						/>
						<div>
							<div class="flex items-center gap-1.5 text-sm font-medium">
								<IconEyeOff class="h-3.5 w-3.5 opacity-70" />
								Request anonymity from the recipient
							</div>
							<p class="mt-0.5 text-xs leading-relaxed opacity-70">
								Card and payment records may still contain identifying information; this asks the
								recipient to keep your donation private.
							</p>
						</div>
					</label>

					<div class="min-h-24 rounded-2xl border border-dashed border-white/10 bg-black/10 p-3">
						<div bind:this={paymentElementHost}></div>
						{#if !paymentFormReady}
							<p class="text-sm opacity-60">
								The card form loads automatically as the page initializes.
							</p>
						{/if}
					</div>

					<!-- Errors / success -->
					{#if error}
						<div
							class="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm"
							in:slide
						>
							{error}
						</div>
					{/if}
					{#if success}
						<div
							class="flex items-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm"
							in:slide
						>
							<IconCheck class="h-4 w-4 shrink-0 text-green-400" />
							{success}
						</div>
					{/if}

					<!-- Submit -->
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							class="donate-btn btn preset-filled-primary-500 gap-2"
							disabled={submitting || preparingPayment}
						>
							{#if preparingPayment}
								<span class="animate-pulse">Loading secure payment form…</span>
							{:else if submitting}
								<span class="animate-pulse">Confirming donation…</span>
							{:else}
								<IconHeart class="h-4 w-4" />
								Donate
								{formatAmount(amount) !== '0.00' ? ` $${formatAmount(amount)}` : ''}
								<IconArrowRight class="h-4 w-4" />
							{/if}
						</button>
						<p class="text-xs opacity-50">
							{#if !paymentFormReady}
								Loading Stripe's secure card form directly into this page.
							{/if}
						</p>
					</div>

					<!-- Tax notice -->
					<p class="text-xs leading-relaxed opacity-70">
						{data.taxNotice}
					</p>
				</div>
			</div>
		</form>
	{/if}
</div>

<style>
	/* ── Hero ── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-950) 86%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	/* ── Headline ── */
	.donate-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.donate-headline-accent {
		background: linear-gradient(
			120deg,
			var(--color-primary-300),
			var(--color-secondary-300),
			var(--color-tertiary-300)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* ── Stat cards ── */
	.stat-card {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.stat-card-glow {
		position: absolute;
		inset: 0;
		opacity: 0.07;
		pointer-events: none;
	}

	/* ── Admin section ── */
	.admin-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 70% 80% at 0% 50%,
			color-mix(in oklab, var(--color-warning-500) 10%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.admin-icon-ring {
		background: color-mix(in oklab, var(--color-warning-500) 18%, var(--color-surface-800) 82%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 32%, transparent);
		color: color-mix(in oklab, var(--color-warning-400) 90%, white 10%);
	}

	/* ── Not enabled state ── */
	.not-enabled-section {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.not-enabled-orb {
		position: absolute;
		width: 300px;
		height: 300px;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: color-mix(in oklab, var(--color-primary-500) 10%, transparent);
		filter: blur(60px);
		pointer-events: none;
	}

	.not-enabled-icon {
		background: color-mix(in oklab, var(--color-primary-500) 15%, var(--color-surface-800) 85%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		color: color-mix(in oklab, var(--color-primary-400) 90%, white 10%);
	}

	/* ── Donation form section ── */
	.donation-form-section {
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 6%, var(--color-surface-950) 94%);
	}

	.form-orb {
		position: absolute;
		width: 55%;
		height: 200%;
		top: -50%;
		right: -10%;
		border-radius: 50%;
		background: color-mix(in oklab, var(--color-primary-500) 10%, transparent);
		filter: blur(80px);
		pointer-events: none;
	}

	.form-icon-ring {
		background: color-mix(in oklab, var(--color-primary-500) 20%, var(--color-surface-800) 80%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		color: color-mix(in oklab, var(--color-primary-400) 90%, white 10%);
	}

	/* ── Amount section ── */
	.amount-section {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
	}

	/* ── Anonymity checkbox area ── */
	.anonymity-check {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
		transition:
			background 180ms,
			border-color 180ms;
	}

	.anonymity-check:has(input:checked) {
		background: color-mix(in oklab, var(--color-primary-500) 8%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	/* ── Donate button ── */
	.donate-btn {
		font-size: 1.05rem;
		font-weight: 700;
		padding: 0.75rem 2rem;
		transition:
			transform 150ms,
			box-shadow 150ms;
	}

	.donate-btn:not(:disabled):hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 45%, transparent);
	}
</style>
