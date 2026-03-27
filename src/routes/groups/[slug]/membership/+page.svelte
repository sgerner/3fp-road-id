<script>
	import { loadStripe } from '@stripe/stripe-js';
	import { tick } from 'svelte';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconSend from '@lucide/svelte/icons/send';
	import IconCrown from '@lucide/svelte/icons/crown';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLock from '@lucide/svelte/icons/lock';
	import IconShield from '@lucide/svelte/icons/shield';
	import IconZap from '@lucide/svelte/icons/zap';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconStar from '@lucide/svelte/icons/star';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconTrendingDown from '@lucide/svelte/icons/trending-down';
	import IconWallet from '@lucide/svelte/icons/wallet';
	import IconUser from '@lucide/svelte/icons/user';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let { data } = $props();
	const initialData = (() => data)();
	const initialProgram = initialData?.program_data?.program || null;
	const initialTiers = Array.isArray(initialData?.program_data?.tiers)
		? initialData.program_data.tiers
		: [];
	const initialCurrentUserProfile = initialData?.current_user_profile || null;

	const group = $derived(data?.group || null);
	const program = $derived(data?.program_data?.program || null);
	const stripeConnection = $derived(data?.program_data?.stripe_connection || null);
	const tiers = $derived(Array.isArray(data?.program_data?.tiers) ? data.program_data.tiers : []);
	const formFields = $derived(
		Array.isArray(data?.program_data?.form_fields) ? data.program_data.form_fields : []
	);
	const myApplications = $derived(Array.isArray(data?.my_applications) ? data.my_applications : []);
	const myMemberships = $derived(Array.isArray(data?.my_memberships) ? data.my_memberships : []);
	const myTierChangeRequests = $derived(
		Array.isArray(data?.my_tier_change_requests) ? data.my_tier_change_requests : []
	);
	const currentUserProfile = $derived(data?.current_user_profile || null);
	const currentUserId = $derived(data?.current_user_id || null);

	let selectedTierId = $state(initialProgram?.default_tier_id || initialTiers?.[0]?.id || '');
	let selectedBillingInterval = $state('month');
	let answers = $state({});
	let memberProfile = $state({
		full_name: initialCurrentUserProfile?.full_name || '',
		email: initialCurrentUserProfile?.email || '',
		phone: initialCurrentUserProfile?.phone || ''
	});
	let busy = $state(false);
	let statusError = $state('');
	let statusMessage = $state('');
	let memberActionBusy = $state(false);
	let customMonthlyInput = $state('');
	let customAnnualInput = $state('');
	let preparingPayment = $state(false);
	let paymentFormReady = $state(false);
	let paymentFormComplete = $state(false);
	let paymentIntentId = $state('');
	let paymentSubscriptionId = $state('');
	let paymentReturnUrl = $state('');
	let preparedPaymentSignature = $state('');
	let stripe = null;
	let elements = null;
	let paymentElement = null;
	let paymentElementHost = $state(null);

	const currentMembership = $derived(
		myMemberships.find((entry) => ['active', 'past_due', 'paused'].includes(entry.status)) || null
	);
	const currentMembershipTier = $derived(
		currentMembership ? tiers.find((tier) => tier.id === currentMembership.tier_id) || null : null
	);
	const pendingTierChange = $derived(
		currentMembership
			? myTierChangeRequests.find((entry) => entry.membership_id === currentMembership.id) || null
			: null
	);
	const pendingTierChangeTier = $derived(
		pendingTierChange
			? tiers.find((tier) => tier.id === pendingTierChange.requested_tier_id) || null
			: null
	);
	const selectedTier = $derived(tiers.find((tier) => tier.id === selectedTierId) || null);
	const selectedTierAllowsCustom = $derived(Boolean(selectedTier?.allow_custom_amount === true));
	const selectedTierMinAmountCents = $derived(Number(selectedTier?.min_amount_cents || 0));
	const customAmountCents = $derived(
		(() => {
			const raw = String(
				selectedBillingInterval === 'year' ? customAnnualInput : customMonthlyInput
			).trim();
			if (!raw) return 0;
			const parsed = Number.parseFloat(raw);
			if (!Number.isFinite(parsed) || parsed < 0) return 0;
			return Math.round(parsed * 100);
		})()
	);
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
			? selectedTier?.monthly_amount_cents !== null &&
				selectedTier?.monthly_amount_cents !== undefined
				? true
				: selectedTier?.amount_cents !== null && selectedTier?.amount_cents !== undefined
					? true
					: selectedTier.allow_custom_amount === true
			: false
	);
	const selectedTierHasAnnual = $derived(
		selectedTier
			? selectedTierAnnualCents !== null || selectedTier.allow_custom_amount === true
			: false
	);
	const accessMode = $derived(program?.access_mode || 'public');
	const contributionMode = $derived(program?.contribution_mode || 'donation');
	const stripeReady = $derived(
		Boolean(stripeConnection?.connected === true && stripeConnection?.charges_enabled === true)
	);
	const requiresPayment = $derived(
		Boolean(
			selectedTier &&
			(contributionMode === 'paid'
				? true
				: selectedTierAllowsCustom
					? Number(customAmountCents || 0) > 0
					: selectedBillingInterval === 'year'
						? Number(selectedTierAnnualCents || 0) > 0
						: Number(selectedTierMonthlyCents || 0) > 0)
		)
	);
	const selectedTierBlockedByStripe = $derived(Boolean(requiresPayment && !stripeReady));
	const canCompletePrivatePayment = $derived(
		Boolean(
			latestApplication &&
			['approved', 'payment_pending'].includes(latestApplication.status) &&
			requiresPayment
		)
	);
	const customAmountInvalidForPaid = $derived(
		Boolean(
			selectedTierAllowsCustom &&
			contributionMode === 'paid' &&
			Number(customAmountCents || 0) < Math.max(1, selectedTierMinAmountCents)
		)
	);
	const isPrivate = $derived(accessMode === 'private_request');
	const shouldShowInlinePayment = $derived(
		Boolean(currentUserId && requiresPayment && (!isPrivate || canCompletePrivatePayment))
	);
	const latestApplication = $derived(myApplications[0] || null);

	const currentPrice = $derived(
		selectedTierAllowsCustom
			? Number(customAmountCents || 0)
			: selectedBillingInterval === 'year' && selectedTierAnnualCents
				? selectedTierAnnualCents
				: selectedTierMonthlyCents
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
		if (
			selectedTierAllowsCustom &&
			contributionMode === 'paid' &&
			Number(customAmountCents || 0) < Math.max(1, selectedTierMinAmountCents)
		) {
			setFeedback(
				'',
				`Enter an amount of at least ${formatMembershipPrice(Math.max(1, selectedTierMinAmountCents))}.`
			);
			return;
		}
		if (!stripeReady && requiresPayment) {
			setFeedback('', 'Payments are temporarily unavailable. This group needs to connect Stripe.');
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
					custom_amount_cents: selectedTierAllowsCustom ? customAmountCents : null,
					profile: profilePayload
				})
			});
			if (result?.requires_checkout) {
				await submitInlinePayment();
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

	function buildPaymentPayload() {
		return {
			tier_id: selectedTierId,
			billing_interval: selectedBillingInterval,
			application_id: latestApplication?.id || null,
			custom_amount_cents: selectedTierAllowsCustom ? customAmountCents : null,
			profile: buildProfilePayload()
		};
	}

	function buildPaymentSignature() {
		const payload = buildPaymentPayload();
		return JSON.stringify({
			tier_id: payload.tier_id || '',
			billing_interval: payload.billing_interval || '',
			application_id: payload.application_id || '',
			custom_amount_cents: payload.custom_amount_cents || 0,
			full_name: payload.profile?.full_name || '',
			email: payload.profile?.email || '',
			phone: payload.profile?.phone || ''
		});
	}

	function teardownPaymentElement() {
		try {
			paymentElement?.destroy?.();
		} catch {
			// Ignore teardown failures from stale Stripe elements.
		}
		paymentElement = null;
		elements = null;
		stripe = null;
		paymentFormReady = false;
		paymentFormComplete = false;
	}

	async function prepareInlinePaymentElement({ quiet = false } = {}) {
		if (!shouldShowInlinePayment || !paymentElementHost) return false;
		if (!selectedTierId) return false;
		if (selectedTierBlockedByStripe) return false;
		if (customAmountInvalidForPaid) return false;

		const profilePayload = buildProfilePayload();
		const profileError = validateProfilePayload(profilePayload);
		if (profileError) {
			if (!quiet) setFeedback('', profileError);
			return false;
		}

		const nextSignature = buildPaymentSignature();
		if (paymentFormReady && preparedPaymentSignature === nextSignature) return true;

		preparingPayment = true;
		if (!quiet) setFeedback();
		try {
			teardownPaymentElement();
			const result = await api(`/api/groups/${group.slug}/membership/create-payment-intent`, {
				method: 'POST',
				body: JSON.stringify(buildPaymentPayload())
			});

			if (result?.requires_payment === false && result?.membership) {
				setFeedback('Membership activated.');
				setTimeout(() => window.location.reload(), 550);
				return false;
			}

			if (!result?.client_secret || !result?.publishable_key || !result?.connected_account_id) {
				throw new Error('Stripe payment form could not be initialized.');
			}

			const stripeClient = await loadStripe(result.publishable_key, {
				stripeAccount: result.connected_account_id
			});
			if (!stripeClient) throw new Error('Stripe.js failed to load.');

			stripe = stripeClient;
			paymentIntentId = result.payment_intent_id || '';
			paymentSubscriptionId = result.subscription_id || '';
			paymentReturnUrl = result.return_url || window.location.href;
			preparedPaymentSignature = nextSignature;

			await tick();
			elements = stripe.elements({
				clientSecret: result.client_secret,
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
			paymentElement.on('change', (event) => {
				paymentFormComplete = Boolean(event?.complete);
				if (event?.error?.message) {
					setFeedback('', event.error.message);
				} else if (paymentFormComplete) {
					setFeedback();
				}
			});
			paymentElement.mount(paymentElementHost);
			paymentFormReady = true;
			if (!quiet) setFeedback('Secure Stripe payment form is ready.');
			return true;
		} catch (paymentError) {
			teardownPaymentElement();
			if (!quiet) setFeedback('', paymentError?.message || 'Unable to prepare payment form.');
			return false;
		} finally {
			preparingPayment = false;
		}
	}

	async function finalizeInlinePayment(paymentIntentIdToFinalize) {
		const result = await api(`/api/groups/${group.slug}/membership/finalize-payment-intent`, {
			method: 'POST',
			body: JSON.stringify({
				payment_intent_id: paymentIntentIdToFinalize,
				subscription_id: paymentSubscriptionId || null
			})
		});
		if (result?.completed) {
			setFeedback('Membership activated.');
			setTimeout(() => window.location.reload(), 550);
			return;
		}
		const pendingStatus = result?.payment_status || 'processing';
		setFeedback('', `Payment status is ${pendingStatus}. Please try again in a few seconds.`);
	}

	async function submitInlinePayment() {
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
		if (
			selectedTierAllowsCustom &&
			contributionMode === 'paid' &&
			Number(customAmountCents || 0) < Math.max(1, selectedTierMinAmountCents)
		) {
			setFeedback(
				'',
				`Enter an amount of at least ${formatMembershipPrice(Math.max(1, selectedTierMinAmountCents))}.`
			);
			return;
		}
		if (!stripeReady && requiresPayment) {
			setFeedback('', 'Payments are temporarily unavailable. This group needs to connect Stripe.');
			return;
		}
		if (!paymentFormComplete) {
			setFeedback('', 'Complete the card details before continuing.');
			return;
		}

		try {
			busy = true;
			setFeedback();
			if (!paymentFormReady || preparedPaymentSignature !== buildPaymentSignature()) {
				const prepared = await prepareInlinePaymentElement({ quiet: false });
				if (!prepared) return;
			}
			if (!stripe || !elements) {
				throw new Error('Stripe payment form is not ready yet.');
			}
			const { error: submitError } = await elements.submit();
			if (submitError) {
				throw new Error(submitError.message || 'Unable to validate payment details.');
			}

			const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
				elements,
				redirect: 'if_required',
				confirmParams: {
					return_url: paymentReturnUrl || window.location.href
				}
			});
			if (stripeError) {
				throw new Error(stripeError.message || 'Unable to confirm payment.');
			}

			const finalizedIntentId = paymentIntent?.id || paymentIntentId || null;
			if (!finalizedIntentId && !paymentSubscriptionId) {
				throw new Error('Stripe did not return a payment reference to finalize.');
			}

			await finalizeInlinePayment(finalizedIntentId);
		} catch (checkoutError) {
			setFeedback('', checkoutError?.message || 'Unable to complete payment.');
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
					custom_amount_cents: selectedTierAllowsCustom ? customAmountCents : null,
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

	function getTierPrice(tier, interval = 'month') {
		if (
			interval === 'year' &&
			tier.annual_amount_cents !== null &&
			tier.annual_amount_cents !== undefined
		) {
			return formatMembershipPrice(tier.annual_amount_cents);
		}
		if (tier.monthly_amount_cents !== null && tier.monthly_amount_cents !== undefined) {
			return formatMembershipPrice(tier.monthly_amount_cents);
		}
		if (tier.amount_cents !== null && tier.amount_cents !== undefined) {
			return formatMembershipPrice(tier.amount_cents);
		}
		return 'Free';
	}

	function calculateSavings(monthlyCents, annualCents) {
		if (!monthlyCents || !annualCents || monthlyCents <= 0 || annualCents <= 0) return 0;
		const monthlyTotal = monthlyCents * 12;
		const savings = Math.round((1 - annualCents / monthlyTotal) * 100);
		return savings > 0 ? savings : 0;
	}

	function selectTier(tier) {
		selectedTierId = tier.id;
		customMonthlyInput = '';
		customAnnualInput = '';
		// Auto-select appropriate billing interval
		const hasMonthly =
			tier.monthly_amount_cents !== null && tier.monthly_amount_cents !== undefined;
		const hasAnnual = tier.annual_amount_cents !== null && tier.annual_amount_cents !== undefined;
		const hasAmount = tier.amount_cents !== null && tier.amount_cents !== undefined;
		const canCustom = tier.allow_custom_amount === true;

		if (hasMonthly || (hasAmount && !hasAnnual)) {
			selectedBillingInterval = 'month';
		} else if (hasAnnual) {
			selectedBillingInterval = 'year';
		} else if (canCustom) {
			selectedBillingInterval = 'month';
		}
	}

	function handleCustomAmountTyping(interval, event) {
		const value = event?.currentTarget?.value ?? '';
		if (interval === 'year') {
			customAnnualInput = value;
			if (String(value).trim()) customMonthlyInput = '';
			selectedBillingInterval = 'year';
			return;
		}
		customMonthlyInput = value;
		if (String(value).trim()) customAnnualInput = '';
		selectedBillingInterval = 'month';
	}

	function getMembershipTierSummary(tier, membership) {
		if (!tier) return 'Tier unavailable';
		const interval = membership?.interval_unit || 'month';
		const persistedAmount = Number(membership?.contribution_amount_cents ?? NaN);
		if (Number.isFinite(persistedAmount) && persistedAmount > 0) {
			return `${formatMembershipPrice(persistedAmount)}/${interval === 'year' ? 'year' : 'month'}`;
		}
		if (interval === 'year' && tier.annual_amount_cents) {
			return `${formatMembershipPrice(tier.annual_amount_cents)}/year`;
		}
		if (tier.monthly_amount_cents) {
			return `${formatMembershipPrice(tier.monthly_amount_cents)}/month`;
		}
		if (tier.amount_cents) {
			return `${formatMembershipPrice(tier.amount_cents)}/${interval === 'year' ? 'year' : 'month'}`;
		}
		return tier.allow_custom_amount ? 'Custom contribution' : 'Free';
	}

	async function requestTierChangeToSelectedTier() {
		if (!currentMembership?.id) return;
		if (!selectedTierId) {
			setFeedback('', 'Select a tier first.');
			return;
		}
		if (selectedTierId === currentMembership.tier_id) {
			setFeedback('', 'You are already on this tier.');
			return;
		}
		try {
			memberActionBusy = true;
			setFeedback();
			await api(`/api/groups/${group.slug}/membership/tier-change-request`, {
				method: 'POST',
				body: JSON.stringify({
					membership_id: currentMembership.id,
					requested_tier_id: selectedTierId
				})
			});
			setFeedback('Tier change requested. It will apply at your next renewal.');
			setTimeout(() => window.location.reload(), 700);
		} catch (requestError) {
			setFeedback('', requestError?.message || 'Unable to request a tier change right now.');
		} finally {
			memberActionBusy = false;
		}
	}

	async function cancelCurrentMembership() {
		if (!currentMembership?.id) return;
		const confirmed = window.confirm(
			'Cancel this membership? Paid memberships remain active until the end of the current billing cycle.'
		);
		if (!confirmed) return;
		try {
			memberActionBusy = true;
			setFeedback();
			await api(`/api/groups/${group.slug}/membership/cancel`, {
				method: 'POST',
				body: JSON.stringify({
					membership_id: currentMembership.id
				})
			});
			setFeedback('Your membership cancellation has been scheduled.');
			setTimeout(() => window.location.reload(), 700);
		} catch (cancelError) {
			setFeedback('', cancelError?.message || 'Unable to cancel membership right now.');
		} finally {
			memberActionBusy = false;
		}
	}

	async function renewCurrentMembership() {
		if (!currentMembership?.id) return;
		try {
			memberActionBusy = true;
			setFeedback();
			await api(`/api/groups/${group.slug}/membership/cancel`, {
				method: 'POST',
				body: JSON.stringify({
					membership_id: currentMembership.id,
					resume: true
				})
			});
			setFeedback('Your membership will continue after this billing period.');
			setTimeout(() => window.location.reload(), 700);
		} catch (renewError) {
			setFeedback('', renewError?.message || 'Unable to renew membership right now.');
		} finally {
			memberActionBusy = false;
		}
	}

	$effect(() => {
		if (!shouldShowInlinePayment || !paymentElementHost) {
			teardownPaymentElement();
			preparedPaymentSignature = '';
			return;
		}
		if (selectedTierBlockedByStripe || customAmountInvalidForPaid) {
			teardownPaymentElement();
			preparedPaymentSignature = '';
			return;
		}
		const profileError = validateProfilePayload(buildProfilePayload());
		if (profileError) {
			teardownPaymentElement();
			preparedPaymentSignature = '';
			return;
		}
		const timeoutId = setTimeout(() => {
			void prepareInlinePaymentElement({ quiet: true });
		}, 150);
		return () => clearTimeout(timeoutId);
	});

	$effect(() => {
		return () => {
			teardownPaymentElement();
		};
	});

	function getTierIcon(index) {
		const icons = [IconHeart, IconStar, IconCrown, IconShield, IconZap];
		return icons[index % icons.length];
	}

	function getTierGradient(index) {
		const gradients = [
			'from-primary-500 to-secondary-500',
			'from-secondary-500 to-tertiary-500',
			'from-tertiary-500 to-primary-500',
			'from-success-500 to-primary-500',
			'from-warning-500 to-secondary-500'
		];
		return gradients[index % gradients.length];
	}
</script>

<div class="membership-page">
	<!-- Hero -->
	<section class="hero-section" in:fade={{ duration: 300 }}>
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div class="hero-content">
			<div class="hero-left">
				{#if group?.logo_url}
					<img src={group.logo_url} alt="{group.name} logo" class="hero-logo" />
				{:else}
					<div class="hero-logo-placeholder">
						<IconUsers class="h-8 w-8 text-white/60" />
					</div>
				{/if}
				<div class="min-w-0 space-y-1">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="chip preset-filled-secondary-500 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
						>
							Membership
						</span>
						<span class="text-surface-400 text-xs"
							>{tiers.length} tier{tiers.length === 1 ? '' : 's'}</span
						>
					</div>
					<h1 class="text-2xl font-extrabold tracking-tight text-white lg:text-3xl">
						{group?.name}
					</h1>
				</div>
			</div>
			<a href="/groups/{group?.slug}" class="btn preset-tonal-surface hero-back">
				<IconArrowLeft class="h-4 w-4" />
				Back to group
			</a>
		</div>
	</section>

	<!-- Status Messages -->
	{#if statusMessage}
		<div class="status-banner success" in:fly={{ y: -20, duration: 300 }}>
			<IconCheckCircle class="h-5 w-5" />
			<span>{statusMessage}</span>
		</div>
	{/if}

	{#if statusError}
		<div class="status-banner error" in:fly={{ y: -20, duration: 300 }}>
			<IconAlertCircle class="h-5 w-5" />
			<span>{statusError}</span>
		</div>
	{/if}

	{#if !program || program.enabled === false}
		<!-- Empty State -->
		<section class="empty-state" in:fade={{ duration: 400, delay: 100 }}>
			<div class="empty-icon">
				<IconUsers class="h-10 w-10" />
			</div>
			<h3 class="empty-title">Membership Unavailable</h3>
			<p class="empty-description">No membership program is currently available for this group.</p>
			<a href="/groups/{group?.slug}" class="btn preset-tonal-surface">Return to Group</a>
		</section>
	{:else if currentMembership}
		<!-- Active Membership -->
		<section class="active-membership-card" in:fade={{ duration: 400, delay: 100 }}>
			<div class="card-accent-bar"></div>
			<div class="active-content">
				<div class="active-icon-ring">
					<IconCheckCircle class="h-8 w-8 text-white" />
				</div>
				<div class="active-details">
					<h2 class="active-title">You're a Member</h2>
					<div class="active-tier-line">
						<span class="active-tier-name">{currentMembershipTier?.name || 'Member'}</span>
						<span class="active-tier-price"
							>· {getMembershipTierSummary(currentMembershipTier, currentMembership)}</span
						>
					</div>
					<div class="active-meta">
						<span class="status-chip {currentMembership.status}">{currentMembership.status}</span>
						{#if currentMembership.renews_at}
							<span class="renewal-info">
								<IconCalendar class="h-3.5 w-3.5" />
								{currentMembership.cancel_at_period_end ? 'Ends' : 'Renews'}
								{new Date(currentMembership.renews_at).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</span>
						{:else if currentMembership.cancel_at_period_end}
							<span class="renewal-info">Ends at period end</span>
						{/if}
					</div>
				</div>
			</div>

			{#if pendingTierChange}
				<div class="pending-change-notice" in:fly={{ y: 8, duration: 250 }}>
					<IconClock class="h-4 w-4" />
					<span
						>Changing to <strong>{pendingTierChangeTier?.name || 'new tier'}</strong> at next renewal</span
					>
				</div>
			{/if}

			<!-- Tier Selection for Change -->
			{#if tiers.length > 0}
				<div class="change-tiers-section">
					<h3 class="h3">Change Tier</h3>
					<p class="change-tiers-subtitle">Select a different tier for your next billing cycle</p>
					<div class="tiers-grid">
						{#each tiers as tier, i (tier.id)}
							{@const isCurrent = currentMembership.tier_id === tier.id}
							{@const isSelected = selectedTierId === tier.id}
							{@const TierIcon = getTierIcon(i)}
							<button
								type="button"
								class="tier-card"
								class:current={isCurrent}
								class:selected={isSelected && !isCurrent}
								onclick={() => selectTier(tier)}
								disabled={memberActionBusy}
							>
								<div class="tier-card-header">
									<div class="tier-icon bg-gradient-to-br {getTierGradient(i)}">
										<TierIcon class="h-4 w-4 text-white" />
									</div>
									<div class="tier-name">{tier.name}</div>
								</div>
								<div class="tier-price">
									{#if tier.monthly_amount_cents}
										{formatMembershipPrice(tier.monthly_amount_cents)}/month
									{:else if tier.amount_cents}
										{formatMembershipPrice(tier.amount_cents)}/month
									{:else if tier.allow_custom_amount}
										Custom amount
									{:else}
										Free
									{/if}
								</div>
								{#if tier.annual_amount_cents}
									<div class="tier-annual">
										{formatMembershipPrice(tier.annual_amount_cents)}/year
									</div>
								{/if}
								{#if isCurrent}
									<span class="current-badge">Current</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="active-actions">
				{#if selectedTierId && selectedTierId !== currentMembership.tier_id}
					<button
						class="btn preset-filled-primary-500"
						onclick={requestTierChangeToSelectedTier}
						disabled={memberActionBusy}
					>
						{#if memberActionBusy}
							<IconLoader class="h-5 w-5 animate-spin" />
						{:else}
							<IconRefreshCw class="h-5 w-5" />
						{/if}
						Change Tier at Renewal
					</button>
				{/if}
				{#if currentMembership.cancel_at_period_end}
					<button
						class="btn preset-filled-primary-500"
						onclick={renewCurrentMembership}
						disabled={memberActionBusy}
					>
						Renew Membership
					</button>
				{:else}
					<button
						class="btn preset-tonal-warning"
						onclick={cancelCurrentMembership}
						disabled={memberActionBusy}
					>
						Cancel Membership
					</button>
				{/if}
			</div>
		</section>

		<!-- Membership History -->
		{#if myMemberships.length > 0}
			<section class="history-section" in:fade={{ duration: 400, delay: 200 }}>
				<div class="card-accent-bar"></div>
				<div class="section-header">
					<div class="section-icon-ring small">
						<IconClock class="h-4 w-4 text-white" />
					</div>
					<h2 class="section-title">Membership History</h2>
				</div>
				<div class="history-list">
					{#each myMemberships as membership (membership.id)}
						{@const tier = tiers.find((t) => t.id === membership.tier_id)}
						<div class="history-item">
							<div class="history-icon">
								<IconUser class="h-4 w-4" />
							</div>
							<div class="history-content">
								<div class="history-title">
									<span class="history-tier">{tier?.name || 'Membership'}</span>
									<span class="status-chip {membership.status}">{membership.status}</span>
								</div>
								<div class="history-meta">
									<span>{getMembershipTierSummary(tier, membership)}</span>
									{#if membership.started_at}
										<span
											>Started {new Date(membership.started_at).toLocaleDateString(undefined, {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}</span
										>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
		<!-- Join Flow -->
		<div class="membership-layout">
			<!-- Left: Tier Selection -->
			<div class="membership-column">
				<section class="tier-selection-card" in:fade={{ duration: 400, delay: 100 }}>
					<div class="card-accent-bar"></div>
					<div class="card-glow"></div>

					<div class="section-header">
						<div class="section-icon-ring">
							<IconSparkles class="h-5 w-5 text-white" />
						</div>
						<div class="section-header-text">
							<h2 class="section-title">Choose Your Tier</h2>
							<p class="section-subtitle">Select the membership level that's right for you</p>
						</div>
					</div>

					{#if tiers.length === 0}
						<div class="empty-mini">
							<IconInfo class="mb-2 h-8 w-8 opacity-50" />
							<p>No tiers have been published yet.</p>
						</div>
					{:else}
						<!-- Billing Toggle -->
						{#if tiers.some((t) => t.annual_amount_cents)}
							<div class="billing-toggle">
								<button
									type="button"
									class="billing-option"
									class:active={selectedBillingInterval === 'month'}
									onclick={() => (selectedBillingInterval = 'month')}
								>
									<span class="billing-label">Monthly</span>
									<span class="billing-description">Pay each month</span>
								</button>
								<button
									type="button"
									class="billing-option relative"
									class:active={selectedBillingInterval === 'year'}
									onclick={() => (selectedBillingInterval = 'year')}
								>
									<span class="billing-label">Annual</span>
									<span class="billing-description">Pay once per year</span>
									{#if selectedTierMonthlyCents && selectedTierAnnualCents}
										{@const savings = calculateSavings(
											selectedTierMonthlyCents,
											selectedTierAnnualCents
										)}
										{#if savings > 0}
											<span class="chip preset-filled-success-500 absolute -top-2 right-2"
												>Save {savings}%</span
											>
										{/if}
									{/if}
								</button>
							</div>
						{/if}

						<!-- Tiers Grid -->
						<div class="tiers-grid">
							{#each tiers as tier, i (tier.id)}
								{@const isSelected = selectedTierId === tier.id}
								{@const TierIcon = getTierIcon(i)}
								{@const monthlyPrice = getTierPrice(tier, 'month')}
								{@const annualPrice = getTierPrice(tier, 'year')}
								{@const savings = calculateSavings(
									tier.monthly_amount_cents || tier.amount_cents,
									tier.annual_amount_cents
								)}
								<button
									type="button"
									class="tier-card"
									class:selected={isSelected}
									onclick={() => selectTier(tier)}
								>
									{#if i === 1 && tiers.length > 1}
										<span class="chip preset-filled-secondary-500 absolute -top-2 right-3"
											>Popular</span
										>
									{/if}
									<div class="tier-card-header">
										<div class="tier-icon bg-gradient-to-br {getTierGradient(i)}">
											<TierIcon class="h-4 w-4 text-white" />
										</div>
										<div class="tier-info">
											<div class="tier-name">{tier.name}</div>
											{#if tier.description}
												<div class="tier-description">{tier.description}</div>
											{/if}
										</div>
									</div>

									<div class="tier-pricing">
										<div class="tier-price-row">
											{#if isSelected && selectedTierAllowsCustom}
												{@const customValue =
													selectedBillingInterval === 'year'
														? customAnnualInput
														: customMonthlyInput}
												{@const customCents = customValue
													? Math.round(parseFloat(customValue) * 100)
													: 0}
												{#if customCents > 0}
													<span class="tier-price">{formatMembershipPrice(customCents)}</span>
													<span class="tier-period"
														>/{selectedBillingInterval === 'year' ? 'year' : 'month'}</span
													>
												{:else}
													<span class="tier-price">Enter amount</span>
												{/if}
											{:else}
												<span class="tier-price"
													>{selectedBillingInterval === 'year' && annualPrice !== 'Free'
														? annualPrice
														: monthlyPrice}</span
												>
												<span class="tier-period"
													>/{selectedBillingInterval === 'year' && annualPrice !== 'Free'
														? 'year'
														: 'month'}</span
												>
											{/if}
										</div>
										{#if selectedBillingInterval === 'month' && annualPrice !== 'Free' && annualPrice !== monthlyPrice}
											<div class="tier-annual-option">
												or {annualPrice}/year
												{#if savings > 0}
													<span
														class="chip preset-tonal-success border-success-500 border p-1 text-[0.65rem]"
														>Save {savings}% annually</span
													>
												{/if}
											</div>
										{/if}
									</div>

									{#if isSelected && selectedTierAllowsCustom}
										<div class="custom-amount-wrapper">
											<div class="custom-amount-input">
												<span class="custom-prefix">$</span>
												<input
													class="custom-input"
													type="number"
													min={(Math.max(0, selectedTierMinAmountCents) / 100).toFixed(2)}
													step="0.01"
													inputmode="decimal"
													placeholder="0.00"
													value={selectedBillingInterval === 'year'
														? customAnnualInput
														: customMonthlyInput}
													onclick={(event) => event.stopPropagation()}
													oninput={(event) =>
														handleCustomAmountTyping(selectedBillingInterval, event)}
												/>
												<span class="custom-suffix"
													>/{selectedBillingInterval === 'year' ? 'year' : 'month'}</span
												>
											</div>
											{#if selectedTierMinAmountCents > 0}
												<p class="custom-minimum">
													Minimum {formatMembershipPrice(
														selectedTierMinAmountCents
													)}/{selectedBillingInterval === 'year' ? 'year' : 'month'}
												</p>
											{/if}
										</div>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<!-- Right: Join Form -->
			<div class="membership-column">
				{#if currentUserId}
					{#if isPrivate && !canCompletePrivatePayment}
						<!-- Application Form -->
						<section class="join-card" in:fade={{ duration: 400, delay: 200 }}>
							<div class="card-accent-bar private"></div>
							<div class="card-glow private"></div>

							<div class="section-header">
								<div class="section-icon-ring private">
									<IconLock class="h-5 w-5 text-white" />
								</div>
								<div class="section-header-text">
									<h2 class="section-title">Membership Application</h2>
									<p class="section-subtitle">Submit your request to join this group</p>
								</div>
							</div>

							<div class="join-content">
								<!-- Selection Summary -->
								<div class="summary-box">
									<div class="summary-row">
										<span class="summary-label">Selected Tier</span>
										<span class="summary-value">{selectedTier?.name || '—'}</span>
									</div>
									<div class="summary-row">
										<span class="summary-label">Amount</span>
										<span class="summary-value price"
											>{selectedTierAllowsCustom && currentPrice <= 0
												? 'Choose amount'
												: formatMembershipPrice(currentPrice)}/{selectedBillingInterval === 'year'
												? 'year'
												: 'month'}</span
										>
									</div>
								</div>

								{#if selectedTierBlockedByStripe}
									<div class="notice warning">
										<IconAlertCircle class="h-5 w-5" />
										<div>
											<p class="notice-title">Payments Temporarily Unavailable</p>
											<p class="notice-text">
												This group needs to connect Stripe before paid memberships can be activated.
											</p>
										</div>
									</div>
								{/if}

								<!-- Contact Fields -->
								<div class="form-section">
									<div class="form-section-header">
										<IconUser class="h-4 w-4" />
										<h3>Your Contact Details</h3>
									</div>
									<p class="form-hint">
										Name, email, and phone come from your profile. Changes here update your profile.
									</p>

									<div class="form-fields">
										<div class="form-field">
											<label for="app-name">Full Name *</label>
											<input
												id="app-name"
												type="text"
												placeholder="Your full name"
												bind:value={memberProfile.full_name}
											/>
										</div>
										<div class="form-field">
											<label for="app-email">Email Address *</label>
											<input
												id="app-email"
												type="email"
												placeholder="you@example.com"
												bind:value={memberProfile.email}
											/>
										</div>
										<div class="form-field">
											<label for="app-phone">Phone Number</label>
											<input
												id="app-phone"
												type="tel"
												placeholder="(555) 123-4567"
												bind:value={memberProfile.phone}
											/>
										</div>
									</div>
								</div>

								{#if formFields.length > 0}
									<div class="form-divider"></div>
									<div class="form-section">
										<div class="form-section-header">
											<IconInfo class="h-4 w-4" />
											<h3>Additional Questions</h3>
										</div>
										<div class="custom-fields">
											{#each formFields as field (field.id)}
												<div class="custom-field">
													<p class="custom-field-label">{field.label}</p>
													{#if field.help_text}
														<p class="field-help">{field.help_text}</p>
													{/if}
													{#if field.field_type === 'textarea'}
														<textarea
															id={`custom-field-${field.id}`}
															placeholder="Enter your answer..."
															value={answers[field.id] || ''}
															oninput={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														></textarea>
													{:else if field.field_type === 'select'}
														<select
															id={`custom-field-${field.id}`}
															value={answers[field.id] || ''}
															onchange={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														>
															<option value="">Select an option</option>
															{#each readOptions(field) as option}
																<option value={option}>{option}</option>
															{/each}
														</select>
													{:else if field.field_type === 'multiselect'}
														<div class="checkbox-group">
															{#each readOptions(field) as option}
																<label class="checkbox-item">
																	<input
																		type="checkbox"
																		checked={Array.isArray(answers[field.id]) &&
																			answers[field.id].includes(option)}
																		onchange={(e) =>
																			toggleMultiOption(field.id, option, e.currentTarget.checked)}
																	/>
																	<span class="checkbox-check"></span>
																	<span>{option}</span>
																</label>
															{/each}
														</div>
													{:else if field.field_type === 'checkbox'}
														<label class="checkbox-item single">
															<input
																id={`custom-field-${field.id}`}
																type="checkbox"
																checked={answers[field.id] === true}
																onchange={(e) =>
																	(answers = { ...answers, [field.id]: e.currentTarget.checked })}
															/>
															<span class="checkbox-check"></span>
															<span>Yes</span>
														</label>
													{:else if field.field_type === 'number'}
														<input
															type="number"
															placeholder="0"
															value={answers[field.id] || ''}
															oninput={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														/>
													{:else if field.field_type === 'date'}
														<input
															type="date"
															value={answers[field.id] || ''}
															onchange={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														/>
													{:else if field.field_type === 'email'}
														<input
															type="email"
															placeholder="email@example.com"
															value={answers[field.id] || ''}
															oninput={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														/>
													{:else}
														<input
															id={`custom-field-${field.id}`}
															type="text"
															placeholder="Enter your answer..."
															value={answers[field.id] || ''}
															oninput={(e) =>
																(answers = { ...answers, [field.id]: e.currentTarget.value })}
														/>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<button
									class="btn preset-filled-primary-500 w-full"
									onclick={submitApplication}
									disabled={busy}
								>
									{#if busy}
										<IconLoader class="h-5 w-5 animate-spin" />
									{:else}
										<IconSend class="h-5 w-5" />
									{/if}
									Submit Application
								</button>
							</div>
						</section>
					{:else}
						<!-- Join Form -->
						<section class="join-card" in:fade={{ duration: 400, delay: 200 }}>
							<div class="card-accent-bar"></div>
							<div class="card-glow"></div>

							<div class="section-header">
								<div class="section-icon-ring">
									<IconUsers class="h-5 w-5 text-white" />
								</div>
								<div class="section-header-text">
									<h2 class="section-title">Complete Your Membership</h2>
									<p class="section-subtitle">
										{requiresPayment ? 'Payment required to activate' : 'Join this group for free'}
									</p>
								</div>
							</div>

							<div class="join-content">
								<!-- Selection Summary -->
								<div class="summary-box">
									<div class="summary-row">
										<span class="summary-label">Selected Tier</span>
										<span class="summary-value">{selectedTier?.name || '—'}</span>
									</div>
									<div class="summary-row">
										<span class="summary-label">Amount</span>
										<span class="summary-value price"
											>{selectedTierAllowsCustom && currentPrice <= 0
												? 'Choose amount'
												: formatMembershipPrice(currentPrice)}/{selectedBillingInterval === 'year'
												? 'year'
												: 'month'}</span
										>
									</div>
								</div>

								{#if selectedTierBlockedByStripe}
									<div class="notice warning">
										<IconAlertCircle class="h-5 w-5" />
										<div>
											<p class="notice-title">Payment Setup In Progress</p>
											<p class="notice-text">
												This group is still setting up their payment account.
											</p>
										</div>
									</div>
								{/if}

								<!-- Contact Fields -->
								<div class="form-section">
									<div class="form-section-header">
										<IconUser class="h-4 w-4" />
										<h3>Your Contact Details</h3>
									</div>
									<p class="form-hint">
										Name and email come from your profile. Changes here update your profile.
									</p>

									<div class="form-fields">
										<div class="form-field">
											<label for="join-name">Full Name *</label>
											<input
												id="join-name"
												type="text"
												placeholder="Your full name"
												bind:value={memberProfile.full_name}
											/>
										</div>
										<div class="form-field">
											<label for="join-email">Email Address *</label>
											<input
												id="join-email"
												type="email"
												placeholder="you@example.com"
												bind:value={memberProfile.email}
											/>
										</div>
										<div class="form-field">
											<label for="join-phone">Phone Number</label>
											<input
												id="join-phone"
												type="tel"
												placeholder="(555) 123-4567"
												bind:value={memberProfile.phone}
											/>
										</div>
									</div>
								</div>

								<!-- Payment Section -->
								{#if requiresPayment}
									<div class="form-divider"></div>
									<div class="form-section">
										<div class="form-section-header">
											<IconCreditCard class="h-4 w-4" />
											<h3>Secure Payment</h3>
										</div>
										<p class="form-hint">
											Enter your card details below. Payment is securely processed by Stripe.
										</p>
										<div class="stripe-container">
											{#if preparingPayment}
												<p class="stripe-loading">Loading secure payment form…</p>
											{/if}
											<div class="stripe-element" bind:this={paymentElementHost}></div>
											{#if !preparingPayment && !paymentFormReady}
												<p class="stripe-loading">
													Payment form will appear once details are complete.
												</p>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Submit Button -->
								{#if canCompletePrivatePayment}
									<div class="notice">
										<IconCheckCircle class="h-5 w-5" />
										<div>
											<p class="notice-title">Application Approved!</p>
											<p class="notice-text">
												{contributionMode === 'paid'
													? 'Payment is required to activate your membership.'
													: 'Complete checkout to activate with a contribution.'}
											</p>
										</div>
									</div>
									<button
										type="button"
										class="btn preset-filled-primary-500 w-full"
										onclick={submitInlinePayment}
										disabled={busy ||
											preparingPayment ||
											selectedTierBlockedByStripe ||
											customAmountInvalidForPaid ||
											!paymentFormComplete}
									>
										{#if busy}
											<IconLoader class="h-5 w-5 animate-spin" />
										{:else}
											<IconCreditCard class="h-5 w-5" />
										{/if}
										Complete Payment
									</button>
								{:else if requiresPayment}
									<button
										type="button"
										class="btn preset-filled-primary-500 w-full"
										onclick={submitInlinePayment}
										disabled={busy ||
											preparingPayment ||
											selectedTierBlockedByStripe ||
											customAmountInvalidForPaid ||
											!paymentFormComplete}
									>
										{#if busy}
											<IconLoader class="h-5 w-5 animate-spin" />
										{:else}
											<IconCreditCard class="h-5 w-5" />
										{/if}
										Pay & Join
									</button>
								{:else}
									<button
										type="button"
										class="btn preset-filled-primary-500 w-full"
										onclick={joinNow}
										disabled={busy}
									>
										{#if busy}
											<IconLoader class="h-5 w-5 animate-spin" />
										{:else}
											<IconCheckCircle class="h-5 w-5" />
										{/if}
										{currentPrice <= 0 ? 'Join Free' : 'Join'}
									</button>
								{/if}
							</div>
						</section>
					{/if}
				{:else}
					<!-- Logged Out -->
					<section class="join-card login-card" in:fade={{ duration: 400, delay: 200 }}>
						<div class="card-accent-bar private"></div>
						<div class="card-glow private"></div>

						<div class="login-content">
							<div class="login-icon-ring">
								<IconLock class="h-8 w-8 text-white" />
							</div>
							<h2 class="login-title">Sign in to Join</h2>
							<p class="login-description">
								Please log in to apply for membership or join this group. It only takes a moment.
							</p>
							<a
								href="/login?returnTo=/groups/{group?.slug}/membership"
								class="btn preset-filled-primary-500"
							>
								Sign In / Register
							</a>
						</div>
					</section>
				{/if}
			</div>
		</div>

		<!-- Application History -->
		{#if currentUserId && myApplications.length > 0}
			<section class="history-section" in:fade={{ duration: 400, delay: 300 }}>
				<div class="card-accent-bar"></div>
				<div class="section-header">
					<div class="section-icon-ring small">
						<IconClock class="h-4 w-4 text-white" />
					</div>
					<h2 class="section-title">Application History</h2>
				</div>
				<div class="history-list">
					{#each myApplications as app (app.id)}
						<div class="history-item">
							<div class="history-icon">
								<IconSend class="h-4 w-4" />
							</div>
							<div class="history-content">
								<div class="history-title">
									<span>Application Submitted</span>
									<span class="status-chip {app.status}">{app.status}</span>
								</div>
								<div class="history-meta">
									<span
										>{new Date(app.submitted_at).toLocaleDateString(undefined, {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}</span
									>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	/* ── Base ── */
	.membership-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.membership-page {
			padding: 1.5rem;
			gap: 2rem;
		}
	}

	/* ── Hero ── */
	.hero-section {
		position: relative;
		overflow: hidden;
		border-radius: 1.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		animation: card-in 400ms ease both;
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(60px);
		pointer-events: none;
		animation: orb-float 8s ease-in-out infinite;
	}

	.hero-orb-1 {
		width: 200px;
		height: 200px;
		background: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		top: -60px;
		right: -30px;
	}

	.hero-orb-2 {
		width: 140px;
		height: 140px;
		background: color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		bottom: -40px;
		left: 10%;
		animation-delay: -3s;
	}

	.hero-orb-3 {
		width: 100px;
		height: 100px;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		top: 40%;
		left: 30%;
		animation-delay: -5s;
	}

	.hero-content {
		position: relative;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
	}

	@media (min-width: 640px) {
		.hero-content {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			padding: 1.5rem;
		}
	}

	.hero-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.hero-logo {
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		object-fit: cover;
		box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.3);
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	@media (min-width: 768px) {
		.hero-logo {
			width: 5rem;
			height: 5rem;
		}
	}

	.hero-logo-placeholder {
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		display: flex;
		align-items: center;
		justify-content: center;
	}

	@media (min-width: 768px) {
		.hero-logo-placeholder {
			width: 5rem;
			height: 5rem;
		}
	}

	.hero-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.hero-left .min-w-0 {
		min-width: 0;
	}

	.hero-left .space-y-1 {
		margin-top: 0.25rem;
	}

	.hero-back {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		align-self: flex-start;
	}

	@media (min-width: 640px) {
		.hero-back {
			align-self: center;
		}
	}

	/* ── Status Banners ── */
	.status-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		font-size: 0.9375rem;
		font-weight: 500;
		animation: card-in 300ms ease both;
	}

	.status-banner.success {
		background: color-mix(in oklab, var(--color-success-500) 10%, var(--color-surface-900));
		border: 1px solid color-mix(in oklab, var(--color-success-500) 30%, transparent);
		color: var(--color-success-400);
	}

	.status-banner.error {
		background: color-mix(in oklab, var(--color-error-500) 10%, var(--color-surface-900));
		border: 1px solid color-mix(in oklab, var(--color-error-500) 30%, transparent);
		color: var(--color-error-400);
	}

	/* ── Cards ── */
	.active-membership-card,
	.tier-selection-card,
	.join-card,
	.history-section,
	.empty-state {
		position: relative;
		overflow: hidden;
		border-radius: 1.5rem;
		background: color-mix(in oklab, var(--color-surface-900) 97%, var(--color-primary-500) 3%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		animation: card-in 400ms ease both;
	}

	.card-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		border-radius: 2rem 2rem 0 0;
		opacity: 0.8;
	}

	.card-accent-bar.private {
		background: linear-gradient(90deg, var(--color-tertiary-500), var(--color-primary-500));
	}

	.card-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 10% 0%,
			color-mix(in oklab, var(--color-primary-500) 8%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.card-glow.private {
		background: radial-gradient(
			ellipse 60% 50% at 10% 0%,
			color-mix(in oklab, var(--color-tertiary-500) 8%, transparent),
			transparent 70%
		);
	}

	/* ── Section Header ── */
	.section-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
	}

	.section-header.compact {
		padding-bottom: 0.75rem;
	}

	.section-icon-ring {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.875rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 4px 14px -2px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.section-icon-ring.private {
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		box-shadow: 0 4px 14px -2px color-mix(in oklab, var(--color-tertiary-500) 30%, transparent);
	}

	.section-icon-ring.small {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
	}

	.section-header-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: white;
		letter-spacing: -0.01em;
	}

	.section-subtitle {
		font-size: 0.8125rem;
		color: color-mix(in oklab, white 55%, transparent);
	}

	/* ── Layout ── */
	.membership-layout {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 1024px) {
		.membership-layout {
			grid-template-columns: 1fr 24rem;
			gap: 2rem;
		}
	}

	@media (min-width: 1280px) {
		.membership-layout {
			grid-template-columns: 1fr 28rem;
		}
	}

	.membership-column {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* ── Billing Toggle ── */
	.billing-toggle {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		padding: 1.25rem;
		padding-bottom: 0;
	}

	.billing-option {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.875rem;
		border-radius: 1rem;
		border: 2px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		cursor: pointer;
		transition: all 200ms ease;
	}

	.billing-option:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	.billing-option.active {
		border-color: var(--color-primary-800);
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-950));
		box-shadow: 0 0 20px -4px color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.billing-label {
		font-size: 0.875rem;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.billing-description {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
	}

	.savings-badge {
		position: absolute;
		top: -0.5rem;
		right: 0.5rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--color-success-500);
		color: white;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	/* ── Tiers Grid ── */
	.tiers-grid {
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) and (max-width: 1023px) {
		.tiers-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.tier-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1rem;
		border: 2px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		text-align: left;
		cursor: pointer;
		transition: all 200ms ease;
	}

	.tier-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 85%, transparent);
	}

	.tier-card.selected {
		border-color: var(--color-primary-800);
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-950));
		box-shadow: 0 4px 20px -4px color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.tier-card.current {
		border-color: var(--color-success-500);
		background: color-mix(in oklab, var(--color-success-500) 10%, var(--color-surface-950));
	}

	.popular-badge {
		position: absolute;
		top: -0.5rem;
		right: 0.75rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-secondary-500) 20%, var(--color-surface-800));
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
		color: var(--color-secondary-400);
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.tier-card-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.tier-icon {
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.tier-info {
		flex: 1;
		min-width: 0;
	}

	.tier-name {
		font-size: 1rem;
		font-weight: 700;
		color: white;
	}

	.tier-description {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 55%, transparent);
		line-height: 1.4;
	}

	.tier-pricing {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.tier-price-row {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.tier-price {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--color-primary-400);
	}

	.tier-period {
		font-size: 0.875rem;
		color: color-mix(in oklab, white 50%, transparent);
	}

	.tier-annual-option {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 55%, transparent);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tier-savings {
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-success-500) 20%, transparent);
		color: var(--color-success-400);
		font-size: 0.625rem;
		font-weight: 700;
	}

	.current-badge {
		position: absolute;
		top: 0.5rem;
		right: 0.75rem;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success-400);
	}

	/* ── Custom Amount Input ── */
	.custom-amount-input {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 25%, transparent);
		border-radius: 0.75rem;
	}

	.custom-prefix,
	.custom-suffix {
		font-size: 0.875rem;
		color: color-mix(in oklab, white 60%, transparent);
	}

	.custom-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		font-size: 1rem;
		color: white;
		text-align: center;
	}

	.custom-input:focus {
		outline: none;
	}

	.custom-input::placeholder {
		color: color-mix(in oklab, white 30%, transparent);
	}

	/* ── Join Card ── */
	.join-content {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.summary-box {
		padding: 1rem;
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950));
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		border-radius: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.summary-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.summary-label {
		font-size: 0.8125rem;
		color: color-mix(in oklab, white 60%, transparent);
	}

	.summary-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
	}

	.summary-value.price {
		color: var(--color-primary-400);
		font-weight: 700;
	}

	/* ── Form Elements ── */
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-primary-400);
	}

	.form-section-header h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: white;
	}

	.form-hint {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
		line-height: 1.4;
	}

	.form-divider {
		height: 1px;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: color-mix(in oklab, white 70%, transparent);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.form-field input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.75rem;
		font-size: 0.9375rem;
		color: white;
		transition: all 200ms ease;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary-500) 15%, transparent);
	}

	.form-field input::placeholder {
		color: color-mix(in oklab, white 35%, transparent);
	}

	/* ── Custom Fields ── */
	.custom-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.custom-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.custom-field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: white;
		margin: 0;
	}

	.field-help {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
		line-height: 1.4;
	}

	.checkbox-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.5rem;
		transition: background 150ms ease;
	}

	.checkbox-item:hover {
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
	}

	.checkbox-item input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.checkbox-check {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 0.25rem;
		border: 2px solid color-mix(in oklab, var(--color-surface-500) 40%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 150ms ease;
		flex-shrink: 0;
	}

	.checkbox-check::after {
		content: '';
		width: 0.375rem;
		height: 0.625rem;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg) translate(-1px, -1px);
		opacity: 0;
		transition: opacity 150ms ease;
	}

	.checkbox-item input:checked + .checkbox-check {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
	}

	.checkbox-item input:checked + .checkbox-check::after {
		opacity: 1;
	}

	.checkbox-item span:last-child {
		font-size: 0.875rem;
		color: white;
	}

	/* ── Notices ── */
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem;
		background: color-mix(in oklab, var(--color-success-500) 8%, var(--color-surface-950));
		border: 1px solid color-mix(in oklab, var(--color-success-500) 25%, transparent);
		border-radius: 0.875rem;
		color: var(--color-success-400);
	}

	.notice.warning {
		background: color-mix(in oklab, var(--color-warning-500) 10%, var(--color-surface-950));
		border-color: color-mix(in oklab, var(--color-warning-500) 35%, transparent);
		color: var(--color-warning-400);
	}

	.notice-title {
		font-weight: 700;
		color: white;
		margin-bottom: 0.25rem;
	}

	.notice-text {
		font-size: 0.8125rem;
		color: color-mix(in oklab, white 65%, transparent);
		line-height: 1.4;
	}

	/* ── Stripe Payment ── */
	.stripe-container {
		padding: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.75rem;
	}

	.stripe-element {
		min-height: 180px;
	}

	.stripe-loading {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
		text-align: center;
		padding: 1rem;
	}

	/* ── Active Membership Card ── */
	.active-membership-card {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.active-content {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.active-icon-ring {
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		background: linear-gradient(135deg, var(--color-success-500), var(--color-primary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 4px 16px -4px color-mix(in oklab, var(--color-success-500) 50%, transparent);
	}

	.active-details {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.active-title {
		font-size: 1.375rem;
		font-weight: 800;
		color: white;
		line-height: 1.2;
	}

	.active-tier-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.active-tier-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: white;
	}

	.active-tier-price {
		font-size: 0.9375rem;
		color: var(--color-primary-400);
	}

	.active-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
		margin-top: 0.25rem;
	}

	.status-chip {
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-chip.active {
		background: color-mix(in oklab, var(--color-success-500) 20%, transparent);
		color: var(--color-success-400);
	}

	.status-chip.pending {
		background: color-mix(in oklab, var(--color-warning-500) 20%, transparent);
		color: var(--color-warning-400);
	}

	.status-chip.approved {
		background: color-mix(in oklab, var(--color-success-500) 20%, transparent);
		color: var(--color-success-400);
	}

	.status-chip.payment_pending {
		background: color-mix(in oklab, var(--color-info-500) 20%, transparent);
		color: var(--color-info-400);
	}

	.status-chip.rejected,
	.status-chip.cancelled {
		background: color-mix(in oklab, var(--color-error-500) 20%, transparent);
		color: var(--color-error-400);
	}

	.renewal-info {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: color-mix(in oklab, white 55%, transparent);
	}

	.pending-change-notice {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-warning-500) 10%, var(--color-surface-950));
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 25%, transparent);
		color: color-mix(in oklab, white 75%, transparent);
		font-size: 0.8125rem;
	}

	.pending-change-notice strong {
		font-weight: 700;
		color: var(--color-warning-300);
	}

	/* ── Change Tiers Section ── */
	.change-tiers-section {
		padding-top: 0.5rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
	}

	.change-tiers-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.25rem;
	}

	.change-tiers-subtitle {
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
		margin-bottom: 0.75rem;
	}

	.active-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
	}

	/* ── Login Card ── */
	.login-card {
		min-height: 20rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.login-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1rem;
		padding: 2rem;
	}

	.login-icon-ring {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 1.25rem;
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 16px -4px color-mix(in oklab, var(--color-tertiary-500) 50%, transparent);
	}

	.login-title {
		font-size: 1.25rem;
		font-weight: 800;
		color: white;
	}

	.login-description {
		font-size: 0.875rem;
		color: color-mix(in oklab, white 55%, transparent);
		line-height: 1.5;
		max-width: 280px;
	}

	/* ── History Section ── */
	.history-section {
		padding: 1rem 1.25rem 1.25rem;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.history-item {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.75rem;
		transition: all 150ms ease;
	}

	.history-item:hover {
		border-color: color-mix(in oklab, var(--color-surface-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
	}

	.history-icon {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		color: var(--color-primary-400);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.history-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.history-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.history-tier {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
	}

	.history-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
		color: color-mix(in oklab, white 50%, transparent);
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem 1.5rem;
	}

	.empty-icon {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 1.25rem;
		background: color-mix(in oklab, var(--color-surface-800) 90%, transparent);
		color: var(--color-primary-400);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.25rem;
	}

	.empty-title {
		font-size: 1.25rem;
		font-weight: 800;
		color: white;
		margin-bottom: 0.5rem;
	}

	.empty-description {
		font-size: 0.875rem;
		color: color-mix(in oklab, white 55%, transparent);
		margin-bottom: 1.5rem;
	}

	.empty-mini {
		text-align: center;
		padding: 2rem;
		color: color-mix(in oklab, white 50%, transparent);
		font-size: 0.875rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* ── Animations ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes orb-float {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		25% {
			transform: translate(10px, -15px) scale(1.05);
		}
		50% {
			transform: translate(-5px, 10px) scale(0.95);
		}
		75% {
			transform: translate(15px, 5px) scale(1.02);
		}
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Reduced Motion ── */
	@media (prefers-reduced-motion: reduce) {
		.hero-section,
		.active-membership-card,
		.tier-selection-card,
		.join-card,
		.history-section,
		.empty-state,
		.status-banner {
			animation: none;
			transform: none;
		}

		.hero-orb {
			animation: none;
		}
	}
</style>
