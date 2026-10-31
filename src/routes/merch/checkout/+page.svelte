<script>
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';
	import IconLoaderCircle from '@lucide/svelte/icons/loader-circle';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconTruck from '@lucide/svelte/icons/truck';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconPackage from '@lucide/svelte/icons/package';
	import IconUser from '@lucide/svelte/icons/user';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconLock from '@lucide/svelte/icons/lock';
	import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { merchCart } from '#lib/merch/cart';

	let { data } = $props();

	let customerName = $state('');
	let customerEmail = $state('');
	let customerPhone = $state('');
	let donationAmount = $state(0);
	let notes = $state('');
	let manualFulfillmentMethodId = $state('');
	let printfulShippingOptionId = $state('');
	let quote = $state(null);
	let quoteLoading = $state(false);
	let quoteError = $state('');
	let submitError = $state('');
	let submitSuccess = $state('');
	let submitting = $state(false);
	let preparingPayment = $state(false);
	let paymentFormReady = $state(false);
	let paymentElementHost = $state(null);
	let paymentIntentId = $state('');
	let paymentIntentClientSecret = $state('');
	let paymentReturnUrl = $state('');
	let preparedSignature = $state('');
	let cartLoaded = $state(false);
	let quoteTimer = 0;

	let line1 = $state('');
	let line2 = $state('');
	let city = $state('');
	let stateRegion = $state('');
	let postalCode = $state('');
	const country = 'US';

	const donationPresets = [10, 25, 50, 100, 250];
	const usStates = [
		{ code: 'AL', name: 'Alabama' },
		{ code: 'AK', name: 'Alaska' },
		{ code: 'AZ', name: 'Arizona' },
		{ code: 'AR', name: 'Arkansas' },
		{ code: 'CA', name: 'California' },
		{ code: 'CO', name: 'Colorado' },
		{ code: 'CT', name: 'Connecticut' },
		{ code: 'DE', name: 'Delaware' },
		{ code: 'FL', name: 'Florida' },
		{ code: 'GA', name: 'Georgia' },
		{ code: 'HI', name: 'Hawaii' },
		{ code: 'ID', name: 'Idaho' },
		{ code: 'IL', name: 'Illinois' },
		{ code: 'IN', name: 'Indiana' },
		{ code: 'IA', name: 'Iowa' },
		{ code: 'KS', name: 'Kansas' },
		{ code: 'KY', name: 'Kentucky' },
		{ code: 'LA', name: 'Louisiana' },
		{ code: 'ME', name: 'Maine' },
		{ code: 'MD', name: 'Maryland' },
		{ code: 'MA', name: 'Massachusetts' },
		{ code: 'MI', name: 'Michigan' },
		{ code: 'MN', name: 'Minnesota' },
		{ code: 'MS', name: 'Mississippi' },
		{ code: 'MO', name: 'Missouri' },
		{ code: 'MT', name: 'Montana' },
		{ code: 'NE', name: 'Nebraska' },
		{ code: 'NV', name: 'Nevada' },
		{ code: 'NH', name: 'New Hampshire' },
		{ code: 'NJ', name: 'New Jersey' },
		{ code: 'NM', name: 'New Mexico' },
		{ code: 'NY', name: 'New York' },
		{ code: 'NC', name: 'North Carolina' },
		{ code: 'ND', name: 'North Dakota' },
		{ code: 'OH', name: 'Ohio' },
		{ code: 'OK', name: 'Oklahoma' },
		{ code: 'OR', name: 'Oregon' },
		{ code: 'PA', name: 'Pennsylvania' },
		{ code: 'RI', name: 'Rhode Island' },
		{ code: 'SC', name: 'South Carolina' },
		{ code: 'SD', name: 'South Dakota' },
		{ code: 'TN', name: 'Tennessee' },
		{ code: 'TX', name: 'Texas' },
		{ code: 'UT', name: 'Utah' },
		{ code: 'VT', name: 'Vermont' },
		{ code: 'VA', name: 'Virginia' },
		{ code: 'WA', name: 'Washington' },
		{ code: 'WV', name: 'West Virginia' },
		{ code: 'WI', name: 'Wisconsin' },
		{ code: 'WY', name: 'Wyoming' }
	];
	let stateItems = $state(usStates);
	const stateCollection = $derived(
		useListCollection({
			items: stateItems,
			itemToString: (item) => item.code,
			itemToValue: (item) => item.code
		})
	);

	const manualMethods = $derived(data?.fulfillmentMethods ?? []);
	const cartItems = $derived($merchCart ?? []);
	const cartItemCount = $derived(
		cartItems.reduce((count, line) => count + Math.max(0, Number(line.quantity) || 0), 0)
	);
	const hasManualItems = $derived(cartItems.some((line) => line.partnerProvider !== 'printful'));
	const hasPrintfulItems = $derived(cartItems.some((line) => line.partnerProvider === 'printful'));
	const selectedManualMethod = $derived(
		manualMethods.find((method) => method.id === manualFulfillmentMethodId) || null
	);
	const needsAddress = $derived(
		Boolean(hasPrintfulItems || selectedManualMethod?.requires_address)
	);
	const checkoutDetailsComplete = $derived(
		validateCheckoutForm() === '' && Boolean(quote) && !quoteLoading && !quoteError
	);
	const payButtonDisabled = $derived(
		submitting || preparingPayment || !checkoutDetailsComplete || !paymentFormReady
	);

	const onStateOpenChange = () => {
		stateItems = usStates;
	};

	const onStateInputValueChange = (event) => {
		const inputValue = String(event?.inputValue || '')
			.toLowerCase()
			.trim();
		if (!inputValue) {
			stateItems = usStates;
			return;
		}
		const filtered = usStates.filter((region) =>
			`${region.code} ${region.name}`.toLowerCase().includes(inputValue)
		);
		stateItems = filtered.length ? filtered : usStates;
	};

	const onStateValueChange = (event) => {
		const next = Array.isArray(event?.value) ? String(event.value[0] || '') : '';
		stateRegion = next.toUpperCase();
		scheduleQuote();
	};

	let stripe = null;
	let elements = null;
	let paymentElement = null;

	onMount(async () => {
		if (!customerEmail && data?.user?.email) {
			customerEmail = data.user.email;
		}
		if (!manualFulfillmentMethodId && manualMethods[0]?.id) {
			manualFulfillmentMethodId = manualMethods[0].id;
		}
		merchCart.load();
		cartLoaded = true;
		await tick();
		await refreshQuote();
		return () => {
			if (quoteTimer) clearTimeout(quoteTimer);
		};
	});

	onDestroy(() => {
		teardownPaymentElement();
	});

	$effect(() => {
		if (
			!paymentElementHost ||
			paymentFormReady ||
			preparingPayment ||
			paymentIntentId ||
			!checkoutDetailsComplete
		) {
			return;
		}
		void preparePaymentElement({ quiet: true });
	});

	function formatCurrency(cents) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
			Number(cents || 0) / 100
		);
	}

	function formatRule(rule, metricType) {
		if (!rule) return '';
		const min = Number(rule.min_value || 0);
		const max =
			rule.max_value === null || rule.max_value === undefined ? null : Number(rule.max_value);
		if (metricType === 'subtotal') {
			const minLabel = formatCurrency(min);
			const maxLabel = max === null ? '' : formatCurrency(max);
			if (max === null) return `${minLabel}+ order value`;
			return `${minLabel} to ${maxLabel} order value`;
		}
		if (max === null) return `${min}+ items`;
		return `${min}-${max} items`;
	}

	function cartItemsPayload() {
		return cartItems.map((line) => ({
			variantId: line.variantId,
			quantity: Number(line.quantity || 0)
		}));
	}

	function shippingAddressPayload() {
		return {
			line1,
			line2,
			city,
			state: String(stateRegion || '')
				.trim()
				.toUpperCase(),
			postalCode,
			country
		};
	}

	function buildCheckoutPayload() {
		return {
			storeSlug: 'main',
			items: cartItemsPayload(),
			manualFulfillmentMethodId: hasManualItems ? manualFulfillmentMethodId || null : null,
			printfulShippingOptionId: hasPrintfulItems ? printfulShippingOptionId || null : null,
			donationAmount: Number(donationAmount || 0),
			customer: {
				name: customerName,
				email: customerEmail,
				phone: customerPhone
			},
			shippingAddress: shippingAddressPayload(),
			notes
		};
	}

	function buildPaymentSignature() {
		const sortedItems = cartItemsPayload()
			.slice()
			.sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)));
		return JSON.stringify({
			...buildCheckoutPayload(),
			items: sortedItems
		});
	}

	function validateCheckoutForm() {
		if (!data.canCheckout) return 'Checkout is currently unavailable.';
		if (cartItems.length === 0) return 'Your cart is empty.';
		if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
			return 'A valid email is required.';
		}
		if (hasManualItems && !manualFulfillmentMethodId) {
			return 'Select a fulfillment method for manual items.';
		}
		if (needsAddress && (!line1 || !city || !stateRegion || !postalCode)) {
			return 'Complete the United States shipping address.';
		}
		if (hasPrintfulItems && !printfulShippingOptionId) {
			return 'Select a shipping option for Printful items.';
		}
		return '';
	}

	function scheduleQuote() {
		if (quoteTimer) clearTimeout(quoteTimer);
		quoteTimer = setTimeout(() => {
			void refreshQuote();
		}, 220);
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
		preparedSignature = '';
	}

	async function refreshQuote() {
		quoteError = '';
		const items = cartItemsPayload();
		if (!items.length) {
			quote = null;
			return;
		}

		quoteLoading = true;
		try {
			const response = await fetch('/api/merch/quote', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storeSlug: 'main',
					items,
					manualFulfillmentMethodId: hasManualItems ? manualFulfillmentMethodId || null : null,
					printfulShippingOptionId: hasPrintfulItems ? printfulShippingOptionId || null : null,
					shippingAddress: shippingAddressPayload(),
					donationAmount: Number(donationAmount || 0)
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Failed to calculate totals.');
			quote = payload?.quote || null;

			if (!manualFulfillmentMethodId && payload?.quote?.manual?.selectedMethod?.id) {
				manualFulfillmentMethodId = payload.quote.manual.selectedMethod.id;
			}
			if (payload?.quote?.printful?.selectedOption?.id) {
				printfulShippingOptionId = payload.quote.printful.selectedOption.id;
			} else if (!payload?.quote?.printful?.present) {
				printfulShippingOptionId = '';
			}
		} catch (error) {
			quoteError = error?.message || 'Failed to calculate totals.';
			quote = null;
		} finally {
			quoteLoading = false;
		}
	}

	async function preparePaymentElement(options = {}) {
		const { quiet = false } = options;
		if (!quiet) {
			submitError = '';
			submitSuccess = '';
		}

		const validationError = validateCheckoutForm();
		if (validationError) {
			if (!quiet) submitError = validationError;
			return false;
		}

		preparingPayment = true;
		try {
			teardownPaymentElement();
			const response = await fetch('/api/merch/create-payment-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(buildCheckoutPayload())
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

			paymentIntentId = payload.paymentIntentId || '';
			paymentIntentClientSecret = payload.clientSecret;
			paymentReturnUrl = payload.returnUrl;
			preparedSignature = buildPaymentSignature();

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
			if (!quiet) submitSuccess = 'Secure payment form loaded below.';
			return true;
		} catch (error) {
			teardownPaymentElement();
			if (!quiet) submitError = error?.message || 'Unable to prepare payment form.';
			return false;
		} finally {
			preparingPayment = false;
		}
	}

	async function syncPaymentIntentDetails() {
		if (!paymentIntentId) {
			return preparePaymentElement({ quiet: true });
		}

		const response = await fetch('/api/merch/update-payment-intent', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				paymentIntentId,
				clientSecret: paymentIntentClientSecret,
				...buildCheckoutPayload()
			})
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Unable to update payment details.');
		}

		preparedSignature = buildPaymentSignature();
		if (elements?.fetchUpdates) {
			await elements.fetchUpdates();
		}
	}

	async function startCheckout(event) {
		event?.preventDefault?.();
		if (submitting || preparingPayment) return;
		submitError = '';
		submitSuccess = '';

		const validationError = validateCheckoutForm();
		if (validationError) {
			submitError = validationError;
			return;
		}
		if (!checkoutDetailsComplete) {
			submitError =
				quoteError ||
				(quoteLoading
					? 'Please wait while your order total is updated.'
					: 'Your order total is not ready yet.');
			return;
		}

		if (!paymentFormReady) {
			await preparePaymentElement({ quiet: false });
		}
		if (!paymentFormReady) return;

		if (preparedSignature !== buildPaymentSignature()) {
			try {
				await syncPaymentIntentDetails();
			} catch (error) {
				submitError = error?.message || 'Unable to update payment details.';
				return;
			}
		}

		if (!stripe || !elements || !paymentReturnUrl) {
			submitError = 'Stripe payment form is not ready yet.';
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
		} catch (error) {
			submitError = error?.message || 'Unable to confirm payment.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout • 3 Feet Please Merch</title>
	<meta
		name="description"
		content="Complete your order and support safer streets. Every purchase directly funds 3FP street safety advocacy."
	/>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="text-surface-50 flex flex-col overflow-hidden">
	<!-- ═══ HERO ═══════════════════════════════════════════════════ -->
	<section
		class="bg-secondary-500 text-surface-50 border-surface-950 border-b-[3px] px-6 py-10 sm:px-10 lg:px-14 lg:py-14"
		aria-labelledby="checkout-heading"
	>
		<div class="flex flex-col gap-5">
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="bg-primary-500 text-surface-950 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					<IconLock class="h-3.5 w-3.5" />
					Secure Checkout
				</span>
				<span
					class="bg-tertiary-500 text-surface-950 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					<IconHeart class="h-3.5 w-3.5" />
					Funds Street Safety
				</span>
			</div>

			<div class="flex flex-col gap-3">
				<h1
					id="checkout-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.9] font-black tracking-[-0.04em] text-balance uppercase italic sm:text-6xl"
				>
					{#if !cartLoaded}
						Loading your cart…
					{:else if cartItems.length === 0}
						Your cart is <span class="text-primary-500">empty.</span>
					{:else}
						Almost there — <span class="text-primary-500">finish strong.</span>
					{/if}
				</h1>
				<p class="m-0 max-w-2xl text-base leading-snug font-medium sm:text-xl">
					{#if !cartLoaded}
						Loading your saved items…
					{:else if cartItems.length === 0}
						Browse the shop to find something that supports safer streets.
					{:else}
						You're one step away from rocking the mission. Every order funds real advocacy for safer
						streets.
					{/if}
				</p>
			</div>

			{#if data.canceled && cartLoaded && cartItems.length > 0}
				<div
					class="bg-primary-500 text-surface-950 flex items-center gap-3 px-5 py-3 text-sm font-black uppercase"
				>
					<IconSparkles class="h-4 w-4 shrink-0" />
					<span>Checkout was canceled — but your cart is still here, ready when you are.</span>
				</div>
			{/if}
			{#if data.loadError}
				<div class="bg-tertiary-500 text-surface-950 px-5 py-3 text-sm font-black uppercase">
					<span>{data.loadError}</span>
				</div>
			{/if}
		</div>
	</section>

	{#if !cartLoaded}
		<div class="bg-surface-950 px-6 py-10 text-sm font-bold uppercase sm:px-10" role="status">
			Loading your cart…
		</div>
	{:else if cartItems.length === 0}
		<section class="bg-surface-950 flex flex-col items-start gap-4 px-6 py-10 sm:px-10 lg:px-14">
			<p class="text-surface-300 m-0 max-w-xl text-sm leading-relaxed">
				Your cart is empty. Add an item from the shop to continue to checkout.
			</p>
			<a
				href="/merch"
				class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
			>
				<IconPackage class="h-4 w-4" /> Browse the shop
			</a>
		</section>
	{:else}
		<div class="bg-surface-900 border-surface-800 space-y-2 border-b px-6 py-4 lg:hidden">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<p class="text-surface-300 m-0 text-xs font-bold uppercase">
						{cartItemCount} item{cartItemCount === 1 ? '' : 's'}
					</p>
					<p class="text-primary-500 m-0 text-lg font-black tabular-nums">
						{quoteLoading
							? 'Calculating…'
							: quote
								? formatCurrency(quote.totalCents)
								: quoteError
									? 'Unavailable'
									: 'Total pending'}
					</p>
				</div>
				<a
					href="#checkout-summary"
					class="text-primary-500 border-primary-500 shrink-0 border-b text-xs font-black tracking-wide uppercase hover:no-underline"
				>
					View summary
				</a>
			</div>
			{#if quoteError}
				<p class="text-error-500 m-0 text-xs font-bold" role="alert">{quoteError}</p>
			{/if}
		</div>
		<!-- ═══ MAIN SPLIT GRID ════════════════════════════════════════ -->
		<div class="bg-surface-950 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(24rem,1fr)]">
			<!-- ── LEFT: Form ────────────────────────────────────────── -->
			<form
				id="merch-checkout-form"
				class="border-surface-800 divide-surface-800 flex flex-col divide-y-[3px] lg:border-r-[3px]"
				onsubmit={startCheckout}
			>
				<!-- 01: Contact -->
				<section
					class="flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14"
					aria-labelledby="step-contact"
				>
					<div class="flex items-start gap-4">
						<span
							class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-12 sm:text-4xl"
						>
							01
						</span>
						<div class="flex flex-1 items-start justify-between gap-4">
							<div>
								<h2
									id="step-contact"
									class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl"
								>
									Contact Info
								</h2>
								<p class="text-surface-300 m-0 mt-1 text-sm">
									Where we'll send your order confirmation
								</p>
							</div>
							<span
								class="bg-primary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
							>
								<IconUser class="h-5 w-5" />
							</span>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
								for="customer_name"
							>
								Full Name
							</label>
							<input
								id="customer_name"
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
								bind:value={customerName}
								maxlength="140"
								placeholder="Jane Smith"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
								for="customer_email"
							>
								Email <span class="text-tertiary-500 font-black">*</span>
							</label>
							<input
								id="customer_email"
								type="email"
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
								bind:value={customerEmail}
								required
								placeholder="jane@example.com"
							/>
						</div>
						<div class="flex flex-col gap-1.5 sm:col-span-2">
							<label
								class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
								for="customer_phone"
							>
								Phone <span class="text-surface-300 font-normal tracking-normal normal-case italic"
									>(optional)</span
								>
							</label>
							<input
								id="customer_phone"
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
								bind:value={customerPhone}
								maxlength="40"
								placeholder="+1 555 000 0000"
							/>
						</div>
					</div>
				</section>

				<!-- Manual fulfillment -->
				{#if hasManualItems}
					<section
						class="flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14"
						aria-labelledby="step-fulfillment"
					>
						<div class="flex items-start gap-4">
							<span
								class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-12 sm:text-4xl"
							>
								02
							</span>
							<div class="flex flex-1 items-start justify-between gap-4">
								<div>
									<h2
										id="step-fulfillment"
										class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl"
									>
										Fulfillment Method
									</h2>
									<p class="text-surface-300 m-0 mt-1 text-sm">
										How 3FP will get your items to you
									</p>
								</div>
								<span
									class="bg-secondary-500 text-surface-50 flex h-10 w-10 shrink-0 items-center justify-center"
								>
									<IconTruck class="h-5 w-5" />
								</span>
							</div>
						</div>

						<div class="flex flex-col gap-2">
							<label
								class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
								for="manual_method"
							>
								Select method
							</label>
							<select
								id="manual_method"
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
								bind:value={manualFulfillmentMethodId}
								onchange={scheduleQuote}
								required
							>
								<option value="" disabled>Pick one…</option>
								{#each manualMethods as method (method.id)}
									<option value={method.id}>
										{method.name}{method.shipping_speed_label
											? ` · ${method.shipping_speed_label}`
											: ''}
									</option>
								{/each}
							</select>
							{#if selectedManualMethod?.description}
								<p class="text-surface-300 m-0 text-xs">{selectedManualMethod.description}</p>
							{/if}
							{#if quote?.manual?.matchedRule}
								<p class="text-primary-500 m-0 text-xs font-bold">
									Flat rate based on {formatRule(
										quote.manual.matchedRule,
										quote.manual.matchedRule.metric_type
									)}.
								</p>
							{/if}
						</div>
					</section>
				{/if}

				<!-- Shipping Address -->
				{#if needsAddress}
					<section
						class="flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14"
						aria-labelledby="step-address"
					>
						<div class="flex items-start gap-4">
							<span
								class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-12 sm:text-4xl"
							>
								{hasManualItems ? '03' : '02'}
							</span>
							<div class="flex flex-1 items-start justify-between gap-4">
								<div>
									<h2
										id="step-address"
										class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl"
									>
										Shipping Address
									</h2>
									<p class="text-surface-300 m-0 mt-1 text-sm">
										US addresses only — we'll get it to your door
									</p>
								</div>
								<span
									class="bg-tertiary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
								>
									<IconMapPin class="h-5 w-5" />
								</span>
							</div>
						</div>

						<div class="grid gap-4 sm:grid-cols-2">
							<div class="flex flex-col gap-1.5 sm:col-span-2">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="line1"
								>
									Address Line 1 <span class="text-tertiary-500 font-black">*</span>
								</label>
								<input
									id="line1"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
									bind:value={line1}
									required={needsAddress}
									oninput={scheduleQuote}
									placeholder="123 Main St"
								/>
							</div>
							<div class="flex flex-col gap-1.5 sm:col-span-2">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="line2"
								>
									Address Line 2 <span
										class="text-surface-300 font-normal tracking-normal normal-case italic"
										>(optional)</span
									>
								</label>
								<input
									id="line2"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
									bind:value={line2}
									oninput={scheduleQuote}
									placeholder="Apt, suite, unit, etc."
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="city"
								>
									City <span class="text-tertiary-500 font-black">*</span>
								</label>
								<input
									id="city"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
									bind:value={city}
									required={needsAddress}
									oninput={scheduleQuote}
									placeholder="Portland"
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="state"
								>
									State <span class="text-tertiary-500 font-black">*</span>
								</label>
								<Combobox
									collection={stateCollection}
									value={stateRegion ? [stateRegion] : []}
									onOpenChange={onStateOpenChange}
									onInputValueChange={onStateInputValueChange}
									onValueChange={onStateValueChange}
									inputBehavior="autohighlight"
									placeholder="Search state…"
									openOnClick
									class="w-full"
								>
									<Combobox.Control class="w-full">
										<Combobox.Input
											id="state"
											class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
										/>
									</Combobox.Control>
									<Portal>
										<Combobox.Positioner>
											<Combobox.Content
												class="bg-surface-950 border-primary-500 z-50 max-h-64 overflow-auto border-2 p-1"
											>
												{#each stateItems as region (region.code)}
													<Combobox.Item
														item={region}
														class="text-surface-50 hover:bg-primary-500 hover:text-surface-950 cursor-pointer p-2 text-sm font-bold"
													>
														<Combobox.ItemText>{region.code} - {region.name}</Combobox.ItemText>
														<Combobox.ItemIndicator />
													</Combobox.Item>
												{/each}
											</Combobox.Content>
										</Combobox.Positioner>
									</Portal>
								</Combobox>
								<input
									class="sr-only"
									required={needsAddress}
									value={stateRegion}
									tabindex="-1"
									aria-hidden="true"
									readonly
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="postal"
								>
									ZIP Code <span class="text-tertiary-500 font-black">*</span>
								</label>
								<input
									id="postal"
									class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-sm font-medium focus:outline-none"
									bind:value={postalCode}
									required={needsAddress}
									oninput={scheduleQuote}
									placeholder="97201"
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label
									class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
									for="country"
								>
									Country
								</label>
								<input
									id="country"
									class="border-surface-800 bg-surface-900 text-surface-300 w-full border-2 px-4 py-3 text-sm font-medium"
									value="United States"
									disabled
								/>
							</div>
						</div>
					</section>
				{/if}

				<!-- Printful Shipping -->
				{#if hasPrintfulItems}
					<section
						class="flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14"
						aria-labelledby="step-shipping-speed"
					>
						<div class="flex items-start gap-4">
							<span
								class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-12 sm:text-4xl"
							>
								{hasManualItems ? '04' : '03'}
							</span>
							<div class="flex flex-1 items-start justify-between gap-4">
								<div>
									<h2
										id="step-shipping-speed"
										class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl"
									>
										Shipping Speed
									</h2>
									<p class="text-surface-300 m-0 mt-1 text-sm">
										Live rates from Printful, our fulfillment partner
									</p>
								</div>
								<span
									class="bg-primary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
								>
									<IconTruck class="h-5 w-5" />
								</span>
							</div>
						</div>

						{#if quote?.printful?.addressReady && (quote?.printful?.options?.length ?? 0) > 0}
							<div class="border-surface-50 flex flex-col border-t-2">
								{#each quote.printful.options as option (option.id)}
									{@const isSelected = printfulShippingOptionId === option.id}
									<label
										class="border-surface-800 flex cursor-pointer items-center gap-4 border-b px-4 py-4 transition {isSelected
											? 'bg-primary-500 text-surface-950'
											: 'text-surface-50 hover:bg-surface-900'}"
									>
										<input
											type="radio"
											name="printful_shipping_option"
											value={option.id}
											checked={isSelected}
											onchange={() => {
												printfulShippingOptionId = option.id;
												scheduleQuote();
											}}
											class="sr-only"
										/>
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center border-2 {isSelected
												? 'border-surface-950 bg-surface-950 text-primary-500'
												: 'border-surface-50'}"
											aria-hidden="true"
										>
											{#if isSelected}
												<IconCheck class="h-3.5 w-3.5" />
											{/if}
										</span>
										<div class="flex-1">
											<div class="flex items-center justify-between gap-3">
												<span class="text-sm font-black uppercase">{option.name}</span>
												<span class="text-base font-black italic tabular-nums">
													{formatCurrency(option.amountCents)}
												</span>
											</div>
											{#if option.minDeliveryDays || option.maxDeliveryDays}
												<div class="mt-0.5 text-xs font-medium opacity-80">
													Estimated {option.minDeliveryDays ||
														option.maxDeliveryDays}{#if option.maxDeliveryDays && option.minDeliveryDays !== option.maxDeliveryDays}–{option.maxDeliveryDays}{/if}
													business days
												</div>
											{/if}
										</div>
									</label>
								{/each}
							</div>
						{:else}
							<div
								class="border-surface-700 bg-surface-900 text-surface-300 flex items-center gap-3 border-2 p-4 text-sm"
							>
								<IconMapPin class="text-primary-500 h-5 w-5 shrink-0" />
								<span>Enter your full shipping address above to see live delivery options.</span>
							</div>
						{/if}
					</section>
				{/if}

				<!-- Support 3FP (Full-bleed Magenta Color Block) -->
				<section
					class="bg-tertiary-500 text-surface-950 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14"
					aria-labelledby="step-donation"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="m-0 flex items-center gap-2 text-xs font-black tracking-[0.22em] uppercase">
								<IconHeart class="h-4 w-4" /> Every dollar counts
							</p>
							<h2
								id="step-donation"
								class="text-surface-950! m-0 mt-1 text-3xl font-black uppercase italic sm:text-4xl"
							>
								Double Your Impact
							</h2>
							<p class="m-0 mt-1 text-sm font-medium">
								Add a donation — 100% goes to street safety advocacy
							</p>
						</div>
						<span
							class="bg-surface-950 text-primary-500 flex h-12 w-12 shrink-0 items-center justify-center"
						>
							<IconHeart class="h-6 w-6" />
						</span>
					</div>

					<div class="flex flex-col gap-5">
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="border-surface-950 cursor-pointer border-[3px] px-4 py-2.5 text-xs font-black tracking-wide uppercase transition {Number(
									donationAmount
								) === 0
									? 'bg-surface-950 text-primary-500'
									: 'text-surface-950 hover:bg-surface-950 hover:text-surface-50 bg-transparent'}"
								onclick={() => {
									donationAmount = 0;
									scheduleQuote();
								}}
							>
								No thanks
							</button>
							{#each donationPresets as preset (preset)}
								<button
									type="button"
									class="border-surface-950 cursor-pointer border-[3px] px-4 py-2.5 text-xs font-black tracking-wide uppercase tabular-nums transition {Number(
										donationAmount
									) === preset
										? 'bg-surface-950 text-primary-500'
										: 'text-surface-950 hover:bg-surface-950 hover:text-surface-50 bg-transparent'}"
									onclick={() => {
										donationAmount = preset;
										scheduleQuote();
									}}
								>
									${preset}
								</button>
							{/each}
						</div>

						<div class="flex flex-wrap items-center gap-3">
							<label for="donation" class="text-xs font-black tracking-[0.18em] uppercase">
								Custom:
							</label>
							<div class="relative">
								<span
									class="text-surface-50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-black"
								>
									$
								</span>
								<input
									id="donation"
									type="number"
									min="0"
									step="1"
									class="border-surface-950 bg-surface-950 text-surface-50 w-36 border-2 py-2.5 pr-3 pl-7 text-sm font-black tabular-nums focus:outline-none"
									bind:value={donationAmount}
									oninput={scheduleQuote}
								/>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<label class="text-xs font-black tracking-[0.18em] uppercase" for="notes">
								Order Notes <span class="font-medium tracking-normal normal-case italic"
									>(optional)</span
								>
							</label>
							<textarea
								id="notes"
								class="border-surface-950 bg-surface-950 text-surface-50 placeholder:text-surface-400 w-full resize-none border-2 p-3 text-sm font-medium focus:outline-none"
								rows="3"
								bind:value={notes}
								placeholder="Any special instructions or requests…"></textarea>
						</div>
					</div>
				</section>
			</form>

			<!-- ── RIGHT: Order Summary + Payment ───────────────────── -->
			<aside class="bg-surface-950 flex flex-col">
				<section
					id="checkout-summary"
					class="sticky top-16 flex flex-col gap-6 px-6 py-10 sm:px-10"
					aria-labelledby="order-summary-heading"
				>
					<!-- Header -->
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Summary & Payment
							</p>
							<h2
								id="order-summary-heading"
								class="text-surface-50! m-0 text-3xl font-black uppercase italic"
							>
								Your Order
							</h2>
						</div>
						<span
							class="bg-primary-500 text-surface-950 flex h-11 w-11 shrink-0 items-center justify-center"
						>
							<IconPackage class="h-5 w-5" />
						</span>
					</div>

					<!-- Cart items -->
					{#if cartItems.length === 0}
						<div class="border-surface-50 border-t-2 pt-6">
							<p class="text-surface-300 m-0 text-sm font-bold uppercase">Your cart is empty.</p>
						</div>
					{:else}
						<ul class="border-surface-50 m-0 list-none border-t-2 p-0">
							{#each cartItems as line (line.variantId)}
								<li class="border-surface-800 flex items-start gap-3 border-b py-4">
									{#if line.productImageUrl}
										<img
											src={line.productImageUrl}
											alt={line.productName}
											class="bg-surface-50 h-14 w-14 shrink-0 object-contain p-1"
										/>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="m-0 truncate text-sm leading-tight font-black uppercase">
											{line.productName}
										</p>
										<p class="text-surface-300 m-0 mt-0.5 truncate text-xs">{line.variantName}</p>
										<p class="text-primary-500 m-0 mt-1 text-xs font-black tabular-nums">
											{line.quantity} × {formatCurrency(line.priceCents)}
										</p>
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Status & Alerts -->
					{#if quoteLoading}
						<div class="text-primary-500 flex items-center gap-2 text-xs font-bold uppercase">
							<IconLoaderCircle class="h-4 w-4 animate-spin" />
							<span>Updating totals…</span>
						</div>
					{/if}
					{#if quoteError}
						<div class="bg-tertiary-500 text-surface-950 p-4 text-xs font-black uppercase">
							{quoteError}
						</div>
					{/if}
					{#if submitError}
						<div class="bg-tertiary-500 text-surface-950 p-4 text-xs font-black uppercase">
							{submitError}
						</div>
					{/if}
					{#if submitSuccess}
						<div
							class="bg-primary-500 text-surface-950 flex items-center gap-2 p-4 text-xs font-black uppercase"
						>
							<IconCheck class="h-4 w-4 shrink-0" />
							<span>{submitSuccess}</span>
						</div>
					{/if}

					<!-- Totals -->
					{#if quote}
						<div class="border-surface-50 flex flex-col gap-2 border-t-2 pt-4 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-surface-300">Subtotal</span>
								<span class="font-bold tabular-nums">{formatCurrency(quote.subtotalCents)}</span>
							</div>
							{#if quote.manual?.present}
								<div class="flex items-center justify-between">
									<span class="text-surface-300">
										{quote.manual?.selectedMethod?.name || 'Fulfillment'}
									</span>
									<span class="font-bold tabular-nums">
										{formatCurrency(quote.manualShippingFeeCents)}
									</span>
								</div>
							{/if}
							{#if quote.printful?.present}
								<div class="flex items-center justify-between">
									<span class="text-surface-300">
										{quote.printful?.selectedOption?.name || 'Shipping'}
									</span>
									<span class="font-bold tabular-nums">
										{formatCurrency(quote.printfulShippingFeeCents)}
									</span>
								</div>
							{/if}
							<div class="flex items-center justify-between">
								<span class="text-surface-300">Tax</span>
								<span class="font-bold tabular-nums">{formatCurrency(quote.taxCents)}</span>
							</div>
							{#if quote.donationCents > 0}
								<div class="text-tertiary-400 flex items-center justify-between font-bold">
									<span class="flex items-center gap-1.5">
										<IconHeart class="h-3.5 w-3.5" />
										Donation
									</span>
									<span class="tabular-nums">{formatCurrency(quote.donationCents)}</span>
								</div>
							{/if}
							<div
								class="border-surface-800 mt-2 flex items-baseline justify-between border-t-2 pt-3"
							>
								<span class="text-xs font-black tracking-[0.2em] uppercase">Total</span>
								<span class="text-primary-500 text-3xl font-black italic tabular-nums">
									{formatCurrency(quote.totalCents)}
								</span>
							</div>
						</div>
					{/if}

					<!-- Payment form container -->
					<div class="border-surface-700 bg-surface-900 flex flex-col gap-3 border-2 p-5">
						<div
							class="text-primary-500 flex items-center gap-2 text-xs font-black tracking-[0.2em] uppercase"
						>
							<IconCreditCard class="h-4 w-4" />
							<span>Card Details</span>
						</div>
						<div bind:this={paymentElementHost}></div>
						{#if !paymentFormReady}
							<p class="text-surface-300 m-0 text-xs leading-relaxed">
								The secure payment form will appear here once all required checkout info is
								complete.
							</p>
						{/if}
					</div>

					{#if !data.canCheckout}
						<div
							class="bg-secondary-500 text-surface-50 flex items-center gap-3 p-4 text-xs font-bold uppercase"
						>
							<IconShieldCheck class="text-primary-500 h-4 w-4 shrink-0" />
							<span>Checkout is disabled until Stripe is connected for this store.</span>
						</div>
					{/if}

					<!-- Pay Button -->
					<button
						type="submit"
						form="merch-checkout-form"
						class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 flex w-full cursor-pointer items-center justify-center gap-3 px-7 py-5 text-base font-black tracking-wide uppercase transition disabled:cursor-not-allowed disabled:opacity-40"
						disabled={payButtonDisabled}
					>
						{#if preparingPayment}
							<IconLoaderCircle class="h-5 w-5 animate-spin" />
							<span>Setting up secure payment…</span>
						{:else if submitting}
							<IconLoaderCircle class="h-5 w-5 animate-spin" />
							<span>Confirming your order…</span>
						{:else}
							<IconLock class="h-5 w-5" />
							<span>
								{quote
									? `Pay ${formatCurrency(quote.totalCents)} — Ride Loud`
									: 'Complete Purchase'}
							</span>
						{/if}
					</button>

					<!-- Trust row -->
					<div
						class="text-surface-300 flex flex-wrap items-center justify-center gap-3 text-xs font-bold tracking-[0.14em] uppercase"
					>
						<span class="flex items-center gap-1.5">
							<IconShieldCheck class="text-primary-500 h-4 w-4" /> Stripe secured
						</span>
						<span>·</span>
						<span class="flex items-center gap-1.5">
							<IconHeart class="text-tertiary-500 h-4 w-4" /> Funds street safety
						</span>
					</div>
				</section>
			</aside>
		</div>
	{/if}
</div>
