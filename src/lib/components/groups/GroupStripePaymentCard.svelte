<script>
	import ManageActionRow from './ManageActionRow.svelte';

	let {
		slug = '',
		stripeConnection = null,
		billingGuard = null,
		title = 'Payments & Stripe',
		description = 'Connect a Stripe account to accept donations and paid membership contributions.',
		returnTo = '',
		stripeStatus = '',
		stripeReason = '',
		onOpenProgramAndTiers = null,
		onDisconnected = null
	} = $props();

	let localDisconnected = $state(false);
	let busy = $state(false);
	let errorMessage = $state('');
	let blockedReason = $state('');
	let blockedManageUrl = $state('');
	let statusMessage = $state('');

	const effectiveConnection = $derived(localDisconnected ? null : stripeConnection);
	const connected = $derived(
		Boolean(effectiveConnection?.connected || effectiveConnection?.stripe_account_id)
	);
	const chargesEnabled = $derived(effectiveConnection?.charges_enabled === true);
	const accountLabel = $derived(
		effectiveConnection?.stripe_account_email || effectiveConnection?.stripe_account_id || ''
	);

	const activePaidTierCount = $derived(
		Number(
			billingGuard?.active_paid_tier_count ?? effectiveConnection?.active_paid_tier_count ?? 0
		) || 0
	);
	const activeSubscriptionCount = $derived(
		Number(
			billingGuard?.active_subscription_count ?? effectiveConnection?.active_subscription_count ?? 0
		) || 0
	);
	const pastDueCount = $derived(
		Number(billingGuard?.past_due_count ?? effectiveConnection?.past_due_count ?? 0) || 0
	);
	const defaultManageUrl = $derived(
		billingGuard?.manage_url ||
			effectiveConnection?.manage_url ||
			(slug ? `/groups/${encodeURIComponent(slug)}/manage/membership?view=program` : '')
	);
	const hasActiveBilling = $derived(activePaidTierCount > 0 || activeSubscriptionCount > 0);

	const initialBannerMessage = $derived(
		statusMessage ? statusMessage : stripeStatus === 'connected' ? 'Stripe account connected.' : ''
	);
	const initialErrorBanner = $derived(
		stripeStatus === 'error'
			? `Stripe connection failed${stripeReason ? `: ${stripeReason}` : ''}`
			: ''
	);

	function buildLocalBlockMessage() {
		const reasons = [];
		if (activePaidTierCount > 0) {
			reasons.push(
				`${activePaidTierCount} active paid ${activePaidTierCount === 1 ? 'tier' : 'tiers'}`
			);
		}
		if (activeSubscriptionCount > 0) {
			reasons.push(
				`${activeSubscriptionCount} active or past-due member ${
					activeSubscriptionCount === 1 ? 'subscription' : 'subscriptions'
				}`
			);
		}
		if (!reasons.length) return '';
		return `Cannot disconnect Stripe while this group has ${reasons.join(' and ')}. Deactivate paid tiers and cancel active member subscriptions in Program and Tiers before disconnecting Stripe.`;
	}

	function connectStripe() {
		if (!slug) return;
		const params = new URLSearchParams({
			recipient: 'group',
			group: slug
		});
		if (returnTo) {
			params.set('return_to', returnTo);
		}
		window.location.href = `/api/donations/connect/start?${params.toString()}`;
	}

	async function disconnectStripe() {
		errorMessage = '';
		statusMessage = '';

		if (hasActiveBilling) {
			blockedReason =
				billingGuard?.disconnect_block_reason ||
				billingGuard?.block_reason ||
				effectiveConnection?.disconnect_block_reason ||
				buildLocalBlockMessage();
			blockedManageUrl = defaultManageUrl;
			return;
		}

		if (typeof window !== 'undefined') {
			const confirmed = window.confirm('Disconnect this group Stripe account?');
			if (!confirmed) return;
		}

		busy = true;
		blockedReason = '';
		try {
			const response = await fetch('/api/donations/connect/disconnect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient: 'group', group: slug })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				if (response.status === 409 || payload?.code === 'active_membership_billing') {
					blockedReason =
						payload?.error ||
						buildLocalBlockMessage() ||
						'Cannot disconnect Stripe while active paid tiers or subscriptions exist.';
					blockedManageUrl = payload?.manage_url || defaultManageUrl;
					return;
				}
				throw new Error(payload?.error || 'Failed to disconnect Stripe account.');
			}

			localDisconnected = true;
			blockedReason = '';
			statusMessage = 'Stripe account disconnected.';
			onDisconnected?.();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to disconnect Stripe account.';
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {MouseEvent} event
	 */
	function handleManageLinkClick(event) {
		if (typeof onOpenProgramAndTiers === 'function') {
			event.preventDefault();
			onOpenProgramAndTiers();
		}
	}
</script>

<div class="space-y-3" data-testid="group-stripe-payment-card">
	<div>
		<h2 class="text-lg font-semibold">{title}</h2>
		{#if description}
			<p class="text-surface-600-400 mt-1 text-sm">{description}</p>
		{/if}
	</div>

	<div class="border-surface-500/25 bg-surface-900/35 rounded-xl border p-4">
		<div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
			<div class="min-w-[min(100%,12rem)] flex-1 space-y-1 text-sm [overflow-wrap:anywhere]">
				<div class="flex flex-wrap items-center gap-2 font-semibold">
					<span>{connected ? 'Stripe account connected' : 'Stripe not connected'}</span>
					{#if connected}
						<span
							class={`badge text-xs ${
								chargesEnabled ? 'preset-tonal-success' : 'preset-tonal-warning'
							}`}
						>
							{chargesEnabled ? 'Charges enabled' : 'Charges pending setup'}
						</span>
					{/if}
				</div>

				{#if connected}
					{#if accountLabel}
						<div class="text-surface-600-400 text-xs">{accountLabel}</div>
					{/if}
					<div class="text-surface-600-400 text-xs">
						{chargesEnabled
							? 'Ready to process donations and paid membership tiers.'
							: 'Finish Stripe onboarding so paid membership tiers and donations can accept charges.'}
					</div>
					{#if hasActiveBilling}
						<div class="text-surface-600-400 pt-1 text-xs">
							Active billing: {activePaidTierCount} paid {activePaidTierCount === 1
								? 'tier'
								: 'tiers'} · {activeSubscriptionCount} member {activeSubscriptionCount === 1
								? 'subscription'
								: 'subscriptions'}{#if pastDueCount > 0}
								({pastDueCount} past due){/if}
						</div>
					{/if}
				{:else}
					<div class="text-surface-600-400 text-xs">
						Connect Stripe before enabling paid membership tiers or recurring billing.
					</div>
				{/if}
			</div>

			<ManageActionRow>
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={busy || !slug}
					onclick={connectStripe}
				>
					{connected ? 'Reconnect Stripe' : 'Connect Stripe'}
				</button>
				{#if connected}
					<button
						type="button"
						class="btn preset-outlined-error-500"
						disabled={busy}
						onclick={disconnectStripe}
					>
						{busy ? 'Disconnecting…' : 'Disconnect'}
					</button>
				{/if}
			</ManageActionRow>
		</div>

		{#if blockedReason}
			<div
				role="alert"
				class="border-warning-500/45 bg-warning-500/12 mt-3 rounded-lg border p-3 text-sm"
				data-testid="stripe-disconnect-guard-alert"
			>
				<p class="font-medium">Stripe disconnect blocked</p>
				<p class="mt-1 opacity-90">{blockedReason}</p>
				{#if blockedManageUrl || defaultManageUrl}
					<p class="mt-2">
						<a
							href={blockedManageUrl || defaultManageUrl}
							class="anchor font-semibold underline"
							onclick={handleManageLinkClick}
						>
							Go to Program and Tiers
						</a>
					</p>
				{/if}
			</div>
		{/if}

		{#if errorMessage || initialErrorBanner}
			<div role="alert" class="text-error-600-400 mt-3 text-sm">
				{errorMessage || initialErrorBanner}
			</div>
		{/if}

		{#if initialBannerMessage}
			<div class="text-success-600-400 mt-3 text-sm">{initialBannerMessage}</div>
		{/if}
	</div>
</div>
