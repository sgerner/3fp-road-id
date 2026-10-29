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
	import { slide } from 'svelte/transition';

	let { data } = $props();

	const prefill = $derived(data?.prefill ?? {});
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
	let paymentIntentClientSecret = $state('');
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

	$effect(() => {
		const amountValue = Number(prefill?.amount) || 25;
		if (amount === 25 && amountValue !== 25) amount = amountValue;
		if (!donorName && prefill?.donorName) donorName = prefill.donorName;
		if (!donorEmail && prefill?.donorEmail) donorEmail = prefill.donorEmail;
	});

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
		paymentIntentClientSecret = '';
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
			paymentIntentClientSecret = payload.clientSecret;
			paymentReturnUrl = payload.returnUrl;

			await tick();
			elements = stripe.elements({
				clientSecret: payload.clientSecret,
				appearance: {
					theme: 'night',
					variables: {
						colorPrimary: '#f4ff00',
						colorBackground: '#09090b',
						colorText: '#f8f5dd',
						colorDanger: '#ff6b6b',
						fontFamily: 'inherit',
						borderRadius: '0px'
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
				clientSecret: paymentIntentClientSecret,
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

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
		aria-labelledby="donate-heading"
	>
		<div
			class="flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-surface-950 text-primary-500 inline-flex items-center gap-1.5 px-3 py-1.5">
					<IconHeart class="h-3.5 w-3.5" />
					Donate
				</span>
				{#if isGroupRecipient}
					<span class="bg-secondary-500 text-surface-50 px-3 py-1.5">Community Group</span>
					<span class="bg-tertiary-500 text-surface-950 px-3 py-1.5">Tax Status Varies</span>
				{:else}
					<span class="bg-secondary-500 text-surface-50 px-3 py-1.5">501(c)(3) Nonprofit</span>
					<span class="bg-tertiary-500 text-surface-950 px-3 py-1.5">Tax-Deductible</span>
				{/if}
			</div>

			<div class="flex flex-col gap-6">
				<h1
					id="donate-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.4vw,6.8rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					{#if isGroupRecipient}
						Support {recipientLabel}.
						<span class="text-secondary-500">Fund local impact.</span>
					{:else}
						Every ride counts. <span class="text-secondary-500">Fund safer streets.</span>
					{/if}
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					{#if isGroupRecipient}
						This page sends donations directly to <strong>{recipientLabel}</strong> through their connected
						Stripe account. Tax deductibility depends on that group's legal status and may not apply.
					{:else}
						3 Feet Please is a 501(c)(3) nonprofit fighting for cyclist safety and stronger cycling
						culture. Your tax-deductible gift powers advocacy, education, and community programs
						that protect riders everywhere.
					{/if}
				</p>
			</div>

			<div class="flex flex-col gap-6">
				<div
					class="border-surface-950 flex flex-wrap items-center gap-x-6 gap-y-3 border-t-[3px] pt-5 text-xs font-bold tracking-[0.16em] uppercase"
				>
					<span class="flex items-center gap-2">
						<IconLock class="h-4 w-4 shrink-0" />
						Secure via Stripe
					</span>
					<span class="flex items-center gap-2">
						<IconShield class="h-4 w-4 shrink-0" />
						{#if isGroupRecipient}
							Tax status depends on the group
						{:else}
							Tax-deductible (EIN 99-3658890)
						{/if}
					</span>
					<span class="flex items-center gap-2">
						<IconEyeOff class="h-4 w-4 shrink-0" />
						Anonymity available
					</span>
				</div>

				{#if data.canceled}
					<div class="bg-surface-950 text-primary-500 px-5 py-4 text-sm font-bold">
						Checkout was canceled. No donation was charged.
					</div>
				{/if}
				{#if data.stripeStatus === 'connected'}
					<div
						class="bg-surface-950 text-primary-500 flex items-center gap-2 px-5 py-4 text-sm font-bold"
					>
						<IconCheck class="h-4 w-4 shrink-0" />
						Stripe account connected successfully.
					</div>
				{:else if data.stripeStatus === 'error'}
					<div
						class="bg-tertiary-500 text-surface-950 border-surface-950 border-[3px] px-5 py-4 text-sm font-bold"
					>
						Stripe connection failed. {data.stripeReason ? `Reason: ${data.stripeReason}` : ''}
					</div>
				{/if}
			</div>
		</div>

		<!-- Right: impact stat blocks -->
		<div
			class="bg-secondary-500 text-surface-50 border-surface-950 grid grid-rows-3 border-t-[3px] lg:border-t-0 lg:border-l-[3px]"
		>
			<div
				class="border-surface-950 flex flex-col justify-between gap-4 border-b-[3px] px-6 py-8 sm:px-10 lg:px-12"
			>
				<div
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconBike class="h-4 w-4" />
					{isGroupRecipient ? 'Direct Support' : 'Years Active'}
				</div>
				<div
					class="text-surface-50 text-5xl leading-none font-black tracking-tight uppercase italic tabular-nums sm:text-6xl"
				>
					{isGroupRecipient ? 'Local' : '10+'}
				</div>
			</div>
			<div
				class="border-surface-950 flex flex-col justify-between gap-4 border-b-[3px] px-6 py-8 sm:px-10 lg:px-12"
			>
				<div
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconUsers class="h-4 w-4" />
					{isGroupRecipient ? 'Funds Route' : 'Advocates'}
				</div>
				<div
					class="text-surface-50 text-5xl leading-none font-black tracking-tight uppercase italic tabular-nums sm:text-6xl"
				>
					{isGroupRecipient ? 'Group' : '100+'}
				</div>
			</div>
			<div class="flex flex-col justify-between gap-4 px-6 py-8 sm:px-10 lg:px-12">
				<div
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconTrendingUp class="h-4 w-4" />
					{isGroupRecipient ? 'Tax Status' : 'Lives Impacted'}
				</div>
				<div
					class="text-surface-50 text-5xl leading-none font-black tracking-tight uppercase italic tabular-nums sm:text-6xl"
				>
					{isGroupRecipient ? 'Varies' : '1000+'}
				</div>
			</div>
		</div>
	</section>

	<!-- Ruler band: 0 → 3 ft -->
	<div
		class="bg-tertiary-500 text-surface-950 border-surface-950 grid grid-cols-3 border-y-[3px]"
		aria-hidden="true"
	>
		{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
			<div class="border-surface-950 relative h-14 border-l-[3px] first:border-l-0">
				<span
					class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-surface-950)_0_2px,transparent_2px_calc(100%/12))]"
				></span>
				<span class="absolute bottom-2 left-3 text-sm font-black uppercase">{mark}</span>
				{#if i === 2}
					<span class="absolute right-3 bottom-2 text-sm font-black uppercase">3 ft</span>
				{/if}
			</div>
		{/each}
	</div>

	<!-- ADMIN: MANAGE MAIN STRIPE -->
	{#if data.showManageMain}
		<section
			class="bg-secondary-500 text-surface-50 border-surface-950 border-b-[3px] px-6 py-10 sm:px-10 lg:px-14"
			aria-labelledby="admin-stripe-heading"
		>
			<div class="flex flex-wrap items-start justify-between gap-6">
				<div class="flex items-start gap-4">
					<span
						class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconSparkles class="h-6 w-6" />
					</span>
					<div class="flex flex-col gap-1">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Admin</p>
						<h2
							id="admin-stripe-heading"
							class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-3xl"
						>
							Main Organization Stripe
						</h2>
						<p class="m-0 max-w-2xl text-sm opacity-90">
							Connect or replace the main 3 Feet Please Stripe account used by the global Donate
							button.
						</p>
						{#if accountConnected}
							<p class="text-primary-500 m-0 pt-1 text-sm font-bold">
								{#if accountReady}
									Account connected and ready to accept charges.
								{:else}
									Account connected, but Stripe has not enabled charges yet.
								{/if}
							</p>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<a
						href="/api/donations/connect/start?recipient=main"
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<IconSparkles class="h-4 w-4" />
						Connect / Reconnect Stripe
					</a>
					{#if recipient?.accountConnected}
						<button
							type="button"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 border-[3px] px-6 py-2.5 text-sm font-black tracking-wide uppercase transition"
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

	<!-- DONATION FORM / STATUS -->
	<section
		class="bg-surface-950 text-surface-50 px-6 py-14 sm:px-10 lg:px-14 lg:py-20"
		aria-labelledby="donation-form-heading"
	>
		{#if data.loadError}
			<div class="border-tertiary-500 flex flex-col gap-3 border-l-4 pl-6">
				<p class="text-tertiary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Error</p>
				<h2
					id="donation-form-heading"
					class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-5xl"
				>
					Unable to load donation form
				</h2>
				<p class="text-surface-300 m-0 text-lg">{data.loadError}</p>
			</div>
		{:else if !recipient}
			<div class="border-tertiary-500 flex flex-col gap-3 border-l-4 pl-6">
				<p class="text-tertiary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Error</p>
				<h2
					id="donation-form-heading"
					class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-5xl"
				>
					Recipient unavailable
				</h2>
				<p class="text-surface-300 m-0 text-lg">Donation recipient could not be loaded.</p>
			</div>
		{:else if recipientType === 'group' && !recipient?.claimed}
			<div class="border-primary-500 flex flex-col gap-3 border-l-4 pl-6">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Group Status
				</p>
				<h2
					id="donation-form-heading"
					class="text-surface-50! m-0 text-3xl font-black uppercase italic sm:text-5xl"
				>
					Donations not enabled yet
				</h2>
				<p class="text-surface-300 m-0 text-lg">
					This group has not been claimed yet, so donations are not enabled.
				</p>
			</div>
		{:else if !donationEnabled}
			<div class="border-surface-50 flex flex-col gap-6 border-t-2 pt-10">
				<span
					class="bg-primary-500 text-surface-950 flex h-14 w-14 items-center justify-center"
					aria-hidden="true"
				>
					<IconHeart class="h-7 w-7" />
				</span>
				<div class="flex flex-col gap-3">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Status update
					</p>
					<h2
						id="donation-form-heading"
						class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
					>
						Donations coming soon
					</h2>
					<p class="text-surface-300 m-0 max-w-xl text-lg leading-relaxed">
						{#if accountConnected}
							Stripe is connected, but this account is not yet ready to accept charges.
						{:else if recipientType === 'group'}
							This group hasn't connected Stripe donations yet.
						{:else}
							The main organization hasn't connected Stripe donations yet.
						{/if}
					</p>
				</div>
			</div>
		{:else}
			<div class="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
				<!-- Left column: Form header & context -->
				<div class="flex flex-col justify-between gap-10">
					<div class="flex flex-col gap-5">
						<p
							class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconSparkles class="h-4 w-4" />
							Secure Donation
						</p>
						<h2
							id="donation-form-heading"
							class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-6xl"
						>
							Support {recipientLabel}
						</h2>
						<p class="text-surface-300 m-0 max-w-md text-lg leading-snug">
							{#if isGroupRecipient}
								Choose an amount and complete your gift directly to this group with Stripe.
							{:else}
								Choose an amount and complete your gift directly on this page with Stripe.
							{/if}
						</p>

						<!-- lane divider -->
						<div
							class="my-2 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
							aria-hidden="true"
						></div>

						<ol class="m-0 list-none p-0">
							<li class="border-surface-800 flex gap-4 border-t py-4">
								<span
									class="text-tertiary-500 w-10 shrink-0 text-2xl leading-none font-black italic tabular-nums"
								>
									01
								</span>
								<p class="text-surface-300 m-0 text-sm leading-relaxed">
									<strong class="text-surface-50 block font-black uppercase">Pick an amount</strong>
									Select a preset or enter any custom contribution from $1 to $25,000.
								</p>
							</li>
							<li class="border-surface-800 flex gap-4 border-t py-4">
								<span
									class="text-tertiary-500 w-10 shrink-0 text-2xl leading-none font-black italic tabular-nums"
								>
									02
								</span>
								<p class="text-surface-300 m-0 text-sm leading-relaxed">
									<strong class="text-surface-50 block font-black uppercase"
										>Receipt & privacy</strong
									>
									We send an instant confirmation to your email and honor anonymity requests.
								</p>
							</li>
						</ol>
					</div>

					<p class="border-surface-800 text-surface-300 m-0 border-t pt-5 text-xs leading-relaxed">
						{data.taxNotice}
					</p>
				</div>

				<!-- Right column: Interactive form -->
				<form
					class="border-surface-800 flex flex-col gap-8 border-t-2 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-14"
					onsubmit={startCheckout}
				>
					<!-- Amount selector -->
					<div class="flex flex-col gap-4">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="donation_amount"
						>
							01 / Choose your amount (USD)
						</label>
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
							{#each presetAmounts as preset (preset)}
								<button
									type="button"
									class="border-[3px] px-4 py-3 text-lg font-black tracking-wide uppercase tabular-nums transition {Number(
										amount
									) === preset
										? 'border-primary-500 bg-primary-500 text-surface-950'
										: 'border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950'}"
									onclick={() => (amount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>
						<div class="relative max-w-xs">
							<span
								class="text-primary-500 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl font-black"
							>
								$
							</span>
							<input
								id="donation_amount"
								type="number"
								class="border-surface-50 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-[3px] py-3 pr-4 pl-9 text-xl font-black tabular-nums focus:outline-none"
								min="1"
								max="25000"
								step="0.01"
								bind:value={amount}
								required
							/>
						</div>
					</div>

					<!-- Donor info -->
					<div class="border-surface-800 flex flex-col gap-5 border-t pt-6">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							02 / Donor details
						</p>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
									for="donor_name"
								>
									Name <span class="text-surface-300 normal-case">(optional)</span>
								</label>
								<input
									id="donor_name"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
									type="text"
									maxlength="120"
									placeholder="Your name"
									bind:value={donorName}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
									for="donor_email"
								>
									Email <span class="text-surface-300 normal-case">(for receipt)</span>
								</label>
								<input
									id="donor_email"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
									type="email"
									maxlength="160"
									placeholder="you@example.com"
									bind:value={donorEmail}
									required
								/>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
								for="donor_message"
							>
								Message <span class="text-surface-300 normal-case">(optional)</span>
							</label>
							<textarea
								id="donor_message"
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
								rows="3"
								maxlength="1000"
								placeholder="Share what inspires you to give…"
								bind:value={donorMessage}></textarea>
						</div>

						<!-- Anonymity checkbox -->
						<label
							class="flex cursor-pointer items-start gap-3 border-2 p-4 transition {requestAnonymity
								? 'border-primary-500 bg-surface-900'
								: 'border-surface-800 bg-surface-900 hover:border-surface-600'}"
						>
							<input
								type="checkbox"
								class="checkbox mt-0.5 shrink-0"
								bind:checked={requestAnonymity}
							/>
							<div class="flex flex-col gap-1">
								<div class="text-surface-50 flex items-center gap-2 text-sm font-black uppercase">
									<IconEyeOff class="text-primary-500 h-4 w-4" />
									Request anonymity from the recipient
								</div>
								<p class="text-surface-300 m-0 text-xs leading-relaxed">
									Card and payment records may still contain identifying information; this asks the
									recipient to keep your donation private.
								</p>
							</div>
						</label>
					</div>

					<!-- Payment Element -->
					<div class="border-surface-800 flex flex-col gap-3 border-t pt-6">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							03 / Payment method
						</p>
						<div class="border-surface-700 bg-surface-900 min-h-24 border-2 p-4">
							<div bind:this={paymentElementHost}></div>
							{#if !paymentFormReady}
								<p class="text-surface-300 m-0 text-sm">
									The card form loads automatically as the page initializes.
								</p>
							{/if}
						</div>
					</div>

					<!-- Errors / success -->
					{#if error}
						<div
							class="border-tertiary-500 bg-surface-900 text-surface-50 border-l-4 px-5 py-4 text-sm font-bold"
							in:slide
						>
							{error}
						</div>
					{/if}
					{#if success}
						<div
							class="border-primary-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 px-5 py-4 text-sm font-bold"
							in:slide
						>
							<IconCheck class="text-primary-500 h-4 w-4 shrink-0" />
							{success}
						</div>
					{/if}

					<!-- Submit -->
					<div class="sm: flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
						<button
							type="submit"
							class="group bg-primary-500 text-surface-950 hover:bg-tertiary-500 hover:text-surface-950 inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-black tracking-wide uppercase transition disabled:opacity-50"
							disabled={submitting || preparingPayment}
						>
							{#if preparingPayment}
								<span>Loading secure payment form…</span>
							{:else if submitting}
								<span>Confirming donation…</span>
							{:else}
								<IconHeart class="h-5 w-5" />
								Donate
								{formatAmount(amount) !== '0.00' ? ` $${formatAmount(amount)}` : ''}
								<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
							{/if}
						</button>
						{#if !paymentFormReady}
							<p class="text-surface-300 m-0 text-xs">
								Loading Stripe's secure card form directly into this page.
							</p>
						{/if}
					</div>
				</form>
			</div>
		{/if}
	</section>
</div>
