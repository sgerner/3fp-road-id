<script>
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
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
	import { merchCart } from '$lib/merch/cart';

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
	let paymentReturnUrl = $state('');
	let preparedSignature = $state('');
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
		submitError = '';
		submitSuccess = '';

		const validationError = validateCheckoutForm();
		if (validationError) {
			submitError = validationError;
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
</svelte:head>

<div class="checkout-page mx-auto w-full max-w-5xl space-y-6 pb-12">
	<!-- ═══ HERO ═══════════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl px-6 py-8 sm:px-8 sm:py-10">
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div class="relative z-10 flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<span class="checkout-badge">
					<IconLock class="h-3 w-3" />
					Secure Checkout
				</span>
				<span class="checkout-badge checkout-badge-impact">
					<IconHeart class="h-3 w-3" />
					Funds Street Safety
				</span>
			</div>
			<div>
				<h1 class="checkout-headline text-3xl font-extrabold tracking-tight sm:text-4xl">
					Almost there — <span class="checkout-headline-accent">finish strong.</span>
				</h1>
				<p class="mt-2 text-left text-sm leading-relaxed opacity-70 sm:text-base">
					You're one step away from rocking the mission. Every order funds real advocacy for safer
					streets.
				</p>
			</div>

			{#if data.canceled}
				<div class="alert-banner alert-amber">
					<IconSparkles class="h-4 w-4 shrink-0" />
					<span>Checkout was canceled — but your cart is still here, ready when you are.</span>
				</div>
			{/if}
			{#if data.loadError}
				<div class="alert-banner alert-red">
					<span>{data.loadError}</span>
				</div>
			{/if}
		</div>
	</section>

	<!-- ═══ MAIN GRID ══════════════════════════════════════════════ -->
	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<!-- ── LEFT: Form ────────────────────────────────────────── -->
		<form id="merch-checkout-form" class="space-y-4" onsubmit={startCheckout}>
			<!-- Contact -->
			<section class="checkout-card">
				<div class="checkout-card-header">
					<div class="checkout-card-icon">
						<IconUser class="h-4 w-4" />
					</div>
					<div>
						<h2 class="checkout-card-title">Contact Info</h2>
						<p class="checkout-card-sub">Where we'll send your order confirmation</p>
					</div>
				</div>
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					<div>
						<label class="field-label" for="customer_name">Full Name</label>
						<input
							id="customer_name"
							class="preset-tonal-surface w-full rounded-lg"
							bind:value={customerName}
							maxlength="140"
							placeholder="Jane Smith"
						/>
					</div>
					<div>
						<label class="field-label" for="customer_email">
							Email <span class="required-star">*</span>
						</label>
						<input
							id="customer_email"
							type="email"
							class="preset-tonal-surface w-full rounded-lg"
							bind:value={customerEmail}
							required
							placeholder="jane@example.com"
						/>
					</div>
					<div>
						<label class="field-label" for="customer_phone"
							>Phone <span class="optional-tag">optional</span></label
						>
						<input
							id="customer_phone"
							class="preset-tonal-surface w-full rounded-lg"
							bind:value={customerPhone}
							maxlength="40"
							placeholder="+1 555 000 0000"
						/>
					</div>
				</div>
			</section>

			<!-- Manual fulfillment -->
			{#if hasManualItems}
				<section class="checkout-card">
					<div class="checkout-card-header">
						<div class="checkout-card-icon checkout-card-icon-secondary">
							<IconTruck class="h-4 w-4" />
						</div>
						<div>
							<h2 class="checkout-card-title">Fulfillment Method</h2>
							<p class="checkout-card-sub">How 3FP will get your items to you</p>
						</div>
					</div>
					<div class="mt-4">
						<label class="field-label" for="manual_method">Select method</label>
						<select
							id="manual_method"
							class="preset-tonal-surface w-full rounded-lg"
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
							<p class="mt-1.5 text-xs opacity-65">{selectedManualMethod.description}</p>
						{/if}
						{#if quote?.manual?.matchedRule}
							<p class="mt-1 text-xs opacity-55">
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
				<section class="checkout-card">
					<div class="checkout-card-header">
						<div class="checkout-card-icon checkout-card-icon-tertiary">
							<IconMapPin class="h-4 w-4" />
						</div>
						<div>
							<h2 class="checkout-card-title">Shipping Address</h2>
							<p class="checkout-card-sub">US addresses only — we'll get it to your door</p>
						</div>
					</div>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div class="sm:col-span-2">
							<label class="field-label" for="line1"
								>Address Line 1 <span class="required-star">*</span></label
							>
							<input
								id="line1"
								class="preset-tonal-surface w-full rounded-lg"
								bind:value={line1}
								required={needsAddress}
								oninput={scheduleQuote}
								placeholder="123 Main St"
							/>
						</div>
						<div class="sm:col-span-2">
							<label class="field-label" for="line2"
								>Address Line 2 <span class="optional-tag">optional</span></label
							>
							<input
								id="line2"
								class="preset-tonal-surface w-full rounded-lg"
								bind:value={line2}
								oninput={scheduleQuote}
								placeholder="Apt, suite, unit, etc."
							/>
						</div>
						<div>
							<label class="field-label" for="city">City <span class="required-star">*</span></label
							>
							<input
								id="city"
								class="preset-tonal-surface w-full rounded-lg"
								bind:value={city}
								required={needsAddress}
								oninput={scheduleQuote}
								placeholder="Portland"
							/>
						</div>
						<div>
							<label class="field-label" for="state"
								>State <span class="required-star">*</span></label
							>
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
									<Combobox.Input id="state" class="preset-tonal-surface w-full rounded-lg" />
								</Combobox.Control>
								<Portal>
									<Combobox.Positioner>
										<Combobox.Content class="preset-tonal-surface z-50 max-h-64 overflow-auto p-1">
											{#each stateItems as region (region.code)}
												<Combobox.Item item={region} class="hover:preset-tonal-tertiary p-2">
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
						<div>
							<label class="field-label" for="postal"
								>ZIP Code <span class="required-star">*</span></label
							>
							<input
								id="postal"
								class="preset-tonal-surface w-full rounded-lg"
								bind:value={postalCode}
								required={needsAddress}
								oninput={scheduleQuote}
								placeholder="97201"
							/>
						</div>
						<div>
							<label class="field-label" for="country">Country</label>
							<input
								id="country"
								class="preset-tonal-surface w-full rounded-lg"
								value="United States"
								disabled
							/>
						</div>
					</div>
				</section>
			{/if}

			<!-- Printful Shipping -->
			{#if hasPrintfulItems}
				<section class="checkout-card">
					<div class="checkout-card-header">
						<div class="checkout-card-icon">
							<IconTruck class="h-4 w-4" />
						</div>
						<div>
							<h2 class="checkout-card-title">Shipping Speed</h2>
							<p class="checkout-card-sub">Live rates from Printful, our fulfillment partner</p>
						</div>
					</div>
					{#if quote?.printful?.addressReady && (quote?.printful?.options?.length ?? 0) > 0}
						<div class="mt-4 space-y-2">
							{#each quote.printful.options as option (option.id)}
								<label
									class="shipping-option {printfulShippingOptionId === option.id ? 'selected' : ''}"
								>
									<input
										type="radio"
										name="printful_shipping_option"
										value={option.id}
										checked={printfulShippingOptionId === option.id}
										onchange={() => {
											printfulShippingOptionId = option.id;
											scheduleQuote();
										}}
										class="sr-only"
									/>
									<div class="shipping-option-radio" aria-hidden="true">
										{#if printfulShippingOptionId === option.id}
											<div class="shipping-option-radio-dot"></div>
										{/if}
									</div>
									<div class="flex-1">
										<div class="flex items-center justify-between gap-3">
											<span class="text-sm font-semibold">{option.name}</span>
											<span class="text-primary-300 text-sm font-bold"
												>{formatCurrency(option.amountCents)}</span
											>
										</div>
										{#if option.minDeliveryDays || option.maxDeliveryDays}
											<div class="mt-0.5 text-xs opacity-60">
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
							class="mt-4 rounded-xl border border-white/8 bg-black/10 px-4 py-3 text-sm opacity-65"
						>
							<IconMapPin class="mb-1 inline-block h-4 w-4 opacity-60" />
							Enter your full shipping address above to see live delivery options.
						</div>
					{/if}
				</section>
			{/if}

			<!-- Support 3FP -->
			<section class="checkout-card checkout-card-support">
				<div class="checkout-card-header">
					<div class="checkout-card-icon checkout-card-icon-heart">
						<IconHeart class="h-4 w-4" />
					</div>
					<div>
						<h2 class="checkout-card-title">Double Your Impact</h2>
						<p class="checkout-card-sub">Add a donation — 100% goes to street safety advocacy</p>
					</div>
				</div>
				<div class="mt-4 space-y-3">
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="donation-pill {Number(donationAmount) === 0 ? 'selected' : ''}"
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
								class="donation-pill {Number(donationAmount) === preset ? 'selected' : ''}"
								onclick={() => {
									donationAmount = preset;
									scheduleQuote();
								}}
							>
								${preset}
							</button>
						{/each}
					</div>
					<div class="flex items-center gap-2">
						<span class="text-sm opacity-60">Custom:</span>
						<div class="relative">
							<span
								class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm opacity-50"
								>$</span
							>
							<input
								id="donation"
								type="number"
								min="0"
								step="1"
								class="preset-tonal-surface w-32 rounded-lg pl-7"
								bind:value={donationAmount}
								oninput={scheduleQuote}
							/>
						</div>
					</div>
					<div>
						<label class="field-label" for="notes"
							>Order Notes <span class="optional-tag">optional</span></label
						>
						<textarea
							id="notes"
							class="preset-tonal-surface w-full resize-none rounded-lg"
							rows="3"
							bind:value={notes}
							placeholder="Any special instructions or requests…"
						></textarea>
					</div>
				</div>
			</section>
		</form>

		<!-- ── RIGHT: Order Summary + Payment ───────────────────── -->
		<aside class="space-y-4">
			<section class="checkout-card order-summary-card sticky top-20">
				<!-- Header -->
				<div class="mb-5 flex items-center gap-2">
					<div class="checkout-card-icon checkout-card-icon-primary">
						<IconPackage class="h-4 w-4" />
					</div>
					<h2 class="text-sm font-bold tracking-widest uppercase opacity-80">Your Order</h2>
				</div>

				<!-- Cart items -->
				{#if cartItems.length === 0}
					<p class="py-4 text-center text-sm opacity-60">Your cart is empty.</p>
				{:else}
					<ul class="mb-4 space-y-2">
						{#each cartItems as line (line.variantId)}
							<li class="cart-summary-item">
								{#if line.productImageUrl}
									<img
										src={line.productImageUrl}
										alt={line.productName}
										class="bg-surface-950/60 h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-white/10"
									/>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm leading-tight font-semibold">{line.productName}</p>
									<p class="mt-0.5 truncate text-xs opacity-60">{line.variantName}</p>
									<p class="text-primary-300 mt-0.5 text-xs font-semibold">
										{line.quantity} × {formatCurrency(line.priceCents)}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}

				<!-- Totals -->
				{#if quoteLoading}
					<div class="flex items-center gap-2 py-2 text-xs opacity-60">
						<IconLoaderCircle class="h-3.5 w-3.5 animate-spin" />
						Updating totals…
					</div>
				{/if}
				{#if quoteError}
					<div class="alert-banner alert-red mb-3">
						{quoteError}
					</div>
				{/if}
				{#if submitError}
					<div class="alert-banner alert-red mb-3">
						{submitError}
					</div>
				{/if}
				{#if submitSuccess}
					<div class="alert-banner alert-green mb-3">
						<IconCheck class="h-3.5 w-3.5 shrink-0" />
						{submitSuccess}
					</div>
				{/if}

				{#if quote}
					<div class="space-y-1.5 border-t border-white/10 pt-4 text-sm">
						<div class="totals-row">
							<span class="opacity-70">Subtotal</span>
							<span>{formatCurrency(quote.subtotalCents)}</span>
						</div>
						{#if quote.manual?.present}
							<div class="totals-row">
								<span class="opacity-70">{quote.manual?.selectedMethod?.name || 'Fulfillment'}</span
								>
								<span>{formatCurrency(quote.manualShippingFeeCents)}</span>
							</div>
						{/if}
						{#if quote.printful?.present}
							<div class="totals-row">
								<span class="opacity-70">{quote.printful?.selectedOption?.name || 'Shipping'}</span>
								<span>{formatCurrency(quote.printfulShippingFeeCents)}</span>
							</div>
						{/if}
						<div class="totals-row opacity-70">
							<span>Tax</span>
							<span>{formatCurrency(quote.taxCents)}</span>
						</div>
						{#if quote.donationCents > 0}
							<div class="totals-row text-tertiary-300">
								<span class="flex items-center gap-1">
									<IconHeart class="h-3 w-3" />
									Donation
								</span>
								<span>{formatCurrency(quote.donationCents)}</span>
							</div>
						{/if}
						<div class="totals-total">
							<span>Total</span>
							<span class="text-primary-200">{formatCurrency(quote.totalCents)}</span>
						</div>
					</div>
				{/if}

				<!-- Payment form container -->
				<div class="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
					<div
						class="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest uppercase opacity-60"
					>
						<IconCreditCard class="h-4 w-4" />
						Card Details
					</div>
					<div bind:this={paymentElementHost}></div>
					{#if !paymentFormReady}
						<p class="text-xs leading-relaxed opacity-50">
							The secure payment form will appear here once all required checkout info is complete.
						</p>
					{/if}
				</div>

				{#if !data.canCheckout}
					<div class="alert-banner alert-amber mt-4">
						<IconShieldCheck class="h-4 w-4 shrink-0" />
						<span>Checkout is disabled until Stripe is connected for this store.</span>
					</div>
				{/if}

				<!-- Pay Button -->
				<button
					type="submit"
					form="merch-checkout-form"
					class="pay-btn mt-5 w-full"
					disabled={payButtonDisabled}
				>
					{#if preparingPayment}
						<IconLoaderCircle class="h-4 w-4 animate-spin" />
						Setting up secure payment…
					{:else if submitting}
						<IconLoaderCircle class="h-4 w-4 animate-spin" />
						Confirming your order…
					{:else}
						<IconLock class="h-4 w-4" />
						{quote ? `Pay ${formatCurrency(quote.totalCents)} — Ride Loud` : 'Complete Purchase'}
					{/if}
				</button>

				<!-- Trust row -->
				<div class="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs opacity-45">
					<span class="flex items-center gap-1"
						><IconShieldCheck class="h-3.5 w-3.5" /> Stripe secured</span
					>
					<span>·</span>
					<span class="flex items-center gap-1"
						><IconHeart class="h-3.5 w-3.5" /> Funds street safety</span
					>
				</div>
			</section>
		</aside>
	</div>
</div>

<style>
	/* ── Hero ─────────────────────────────────────────────────── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}
	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}
	.hero-orb-1 {
		width: 60%;
		height: 220%;
		top: -60%;
		left: -12%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}
	.hero-orb-2 {
		width: 40%;
		height: 180%;
		top: -40%;
		right: 2%;
		background: color-mix(in oklab, var(--color-secondary-500) 16%, transparent);
		animation: orb-drift 26s ease-in-out infinite alternate-reverse;
	}
	.hero-orb-3 {
		width: 30%;
		height: 160%;
		bottom: -50%;
		left: 28%;
		background: color-mix(in oklab, var(--color-tertiary-500) 12%, transparent);
		animation: orb-drift 30s ease-in-out infinite alternate;
	}
	@keyframes orb-drift {
		0% {
			transform: translate3d(0, 0, 0) scale(1);
		}
		100% {
			transform: translate3d(3%, -2%, 0) scale(1.05);
		}
	}

	/* Headline */
	.checkout-headline {
		color: var(--color-primary-50);
		line-height: 1.1;
	}
	.checkout-headline-accent {
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

	/* Badges */
	.checkout-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		background: color-mix(in oklab, var(--color-surface-600) 20%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 25%, transparent);
		color: color-mix(in oklab, var(--color-surface-50) 80%, transparent);
	}
	.checkout-badge-impact {
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 40%, transparent);
		color: var(--color-primary-200);
	}

	/* ── Cards ────────────────────────────────────────────────── */
	.checkout-card {
		background: color-mix(in oklab, var(--color-surface-900) 55%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 12%, transparent);
		border-radius: 1.25rem;
		padding: 1.25rem;
		backdrop-filter: blur(12px);
	}
	.checkout-card-support {
		border-color: color-mix(in oklab, var(--color-tertiary-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-tertiary-500) 5%, var(--color-surface-900) 55%);
	}
	.order-summary-card {
		background: color-mix(in oklab, var(--color-surface-900) 65%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 15%, var(--color-surface-400) 12%);
	}
	.checkout-card-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.checkout-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 18%, var(--color-surface-800) 82%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		color: var(--color-primary-300);
		flex-shrink: 0;
	}
	.checkout-card-icon-secondary {
		background: color-mix(in oklab, var(--color-secondary-500) 18%, var(--color-surface-800) 82%);
		border-color: color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		color: var(--color-secondary-300);
	}
	.checkout-card-icon-tertiary {
		background: color-mix(in oklab, var(--color-tertiary-500) 18%, var(--color-surface-800) 82%);
		border-color: color-mix(in oklab, var(--color-tertiary-500) 30%, transparent);
		color: var(--color-tertiary-300);
	}
	.checkout-card-icon-heart {
		background: color-mix(in oklab, var(--color-tertiary-500) 22%, var(--color-surface-800) 78%);
		border-color: color-mix(in oklab, var(--color-tertiary-400) 40%, transparent);
		color: var(--color-tertiary-200);
	}
	.checkout-card-icon-primary {
		background: color-mix(in oklab, var(--color-primary-500) 20%, var(--color-surface-800) 80%);
		border-color: color-mix(in oklab, var(--color-primary-400) 35%, transparent);
		color: var(--color-primary-300);
	}
	.checkout-card-title {
		font-size: 0.9375rem;
		font-weight: 700;
		line-height: 1.25;
		text-align: left;
	}
	.checkout-card-sub {
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
		line-height: 1.4;
	}

	/* ── Form fields ──────────────────────────────────────────── */
	.field-label {
		display: block;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.65;
		margin-bottom: 0.35rem;
	}
	.required-star {
		color: var(--color-error-400);
		font-weight: 700;
	}
	.optional-tag {
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: none;
		letter-spacing: 0;
		opacity: 0.55;
		font-style: italic;
		margin-left: 0.2rem;
	}

	/* ── Shipping options ─────────────────────────────────────── */
	.shipping-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 15%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 40%, transparent);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.shipping-option:hover {
		border-color: color-mix(in oklab, var(--color-primary-400) 40%, transparent);
	}
	.shipping-option.selected {
		border-color: color-mix(in oklab, var(--color-primary-400) 60%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-900) 45%);
	}
	.shipping-option-radio {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: 2px solid color-mix(in oklab, var(--color-surface-300) 40%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: border-color 0.15s;
	}
	.shipping-option.selected .shipping-option-radio {
		border-color: var(--color-primary-400);
	}
	.shipping-option-radio-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-primary-400);
	}

	/* ── Donation pills ───────────────────────────────────────── */
	.donation-pill {
		padding: 0.4rem 1rem;
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 600;
		border: 1px solid color-mix(in oklab, var(--color-primary-400) 30%, transparent);
		background: color-mix(in oklab, var(--color-primary-500) 8%, transparent);
		color: color-mix(in oklab, var(--color-primary-200) 80%, transparent);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.donation-pill:hover {
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 55%, transparent);
	}
	.donation-pill.selected {
		background: var(--color-primary-500);
		border-color: var(--color-primary-400);
		color: var(--color-primary-950);
		box-shadow: 0 4px 16px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	/* ── Cart summary ─────────────────────────────────────────── */
	.cart-summary-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.625rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-900) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 10%, transparent);
	}

	/* ── Totals ───────────────────────────────────────────────── */
	.totals-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.8125rem;
	}
	.totals-total {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 1rem;
		font-weight: 800;
		padding-top: 0.625rem;
		margin-top: 0.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-400) 15%, transparent);
	}

	/* ── Pay button ───────────────────────────────────────────── */
	.pay-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1.25rem;
		border-radius: 0.875rem;
		font-size: 0.9375rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		cursor: pointer;
		transition: all 0.2s ease;
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-primary-400) 80%, var(--color-secondary-400) 20%)
		);
		color: var(--color-primary-950);
		border: none;
		box-shadow:
			0 6px 24px color-mix(in oklab, var(--color-primary-500) 35%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 20%, transparent);
	}
	.pay-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow:
			0 10px 32px color-mix(in oklab, var(--color-primary-500) 45%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 20%, transparent);
	}
	.pay-btn:active:not(:disabled) {
		transform: translateY(0);
	}
	.pay-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	/* ── Alerts ───────────────────────────────────────────────── */
	.alert-banner {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		border-radius: 0.75rem;
		font-size: 0.8125rem;
		line-height: 1.5;
	}
	.alert-amber {
		background: color-mix(in oklab, var(--color-warning-500) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-warning-400) 30%, transparent);
		color: var(--color-warning-200);
	}
	.alert-red {
		background: color-mix(in oklab, var(--color-error-500) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-error-400) 30%, transparent);
		color: var(--color-error-200);
	}
	.alert-green {
		background: color-mix(in oklab, var(--color-success-500) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-success-400) 30%, transparent);
		color: var(--color-success-200);
	}
</style>
