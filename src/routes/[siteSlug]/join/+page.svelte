<script>
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const tiers = $derived(Array.isArray(site.membershipTiers) ? site.membershipTiers : []);
	const membershipEnabled = $derived(Boolean(site.membershipProgram?.enabled === true));
	let selectedTierId = $state('');
	let selectedInterval = $state('month');
	let donateAmount = $state(25);

	$effect(() => {
		if (selectedTierId) return;
		if (!tiers.length) return;
		const preferred = site?.membershipProgram?.default_tier_id || tiers?.[0]?.id || '';
		selectedTierId = preferred;
	});

	function formatAmount(cents) {
		const value = Number(cents);
		if (!Number.isFinite(value) || value <= 0) return 'Free';
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: value % 100 === 0 ? 0 : 2
		}).format(value / 100);
	}

	function getTierPrice(tier) {
		if (tier.allow_custom_amount) return 'Custom';
		const monthly = Number(tier?.monthly_amount_cents ?? tier?.amount_cents ?? 0);
		const annual = Number(tier?.annual_amount_cents ?? 0);

		if (selectedInterval === 'year' && annual > 0) {
			return formatAmount(annual) + '/yr';
		}
		if (monthly > 0) {
			return formatAmount(monthly) + '/mo';
		}
		if (annual > 0) {
			return formatAmount(annual) + '/yr';
		}
		return 'Free';
	}

	function getSavings(tier) {
		const monthly = Number(tier?.monthly_amount_cents ?? tier?.amount_cents ?? 0);
		const annual = Number(tier?.annual_amount_cents ?? 0);
		if (monthly > 0 && annual > 0) {
			const monthlyCost = monthly * 12;
			const savings = monthlyCost - annual;
			if (savings > 0) {
				return `Save ${formatAmount(savings)}/yr`;
			}
		}
		return null;
	}

	const donateAmountPresets = [10, 25, 50, 100];
</script>

<svelte:head>
	<title>{config.site_title} — Join</title>
</svelte:head>

<div class="microsite-join-page pb-16">
	<!-- Hero -->
	<section class="relative mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		<div
			class="glass-card border-primary-500/20 from-primary-500/5 to-secondary-500/5 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 md:p-8"
		>
			<div
				class="from-primary-500/10 via-secondary-500/5 to-tertiary-500/10 pointer-events-none absolute inset-0 bg-gradient-to-br"
			></div>
			<div class="relative">
				<div class="flex items-center gap-3">
					<div
						class="from-primary-500 to-secondary-500 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconUsers class="h-5 w-5 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							Join + support
						</p>
						<h1 class="text-surface-950-50 text-xl font-bold tracking-tight md:text-2xl">
							Support {config.site_title}
						</h1>
					</div>
				</div>
				<AutoLinkText
					text={group.how_to_join_instructions ||
						group.membership_info ||
						'Choose the support path that fits you best and continue on 3FP to complete it.'}
					className="block text-surface-600-400 mt-3 max-w-2xl text-sm"
					linkClass="text-primary-700-300 underline underline-offset-2"
				/>
			</div>
		</div>
	</section>

	<!-- Membership Section -->
	{#if membershipEnabled && tiers.length}
		<section class="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8" id="membership">
			<div class="glass-card border-surface-500/15 rounded-2xl border p-5 md:p-6">
				<div class="flex items-center gap-3">
					<div
						class="from-primary-500 to-secondary-500 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconUsers class="h-4 w-4 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							Membership
						</p>
						<h2 class="text-surface-950-50 text-lg font-bold tracking-tight">Join us</h2>
					</div>
				</div>

				<!-- Billing Toggle (moved to top) -->
				{#if tiers.some((t) => (t.monthly_amount_cents > 0 || t.amount_cents > 0) && t.annual_amount_cents > 0)}
					<div class="border-surface-500/10 mt-4 rounded-xl border p-3">
						<p class="text-primary-700-300 mb-2 text-[10px] font-semibold tracking-wider uppercase">
							Billing
						</p>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								class="btn {selectedInterval === 'month'
									? 'preset-filled-primary-500 shadow-md'
									: 'preset-tonal-surface'} h-10 text-xs font-bold transition-all"
								onclick={() => (selectedInterval = 'month')}
							>
								Monthly
							</button>
							<button
								type="button"
								class="btn {selectedInterval === 'year'
									? 'preset-filled-primary-500 shadow-md'
									: 'preset-tonal-surface'} h-10 text-xs font-bold transition-all"
								onclick={() => (selectedInterval = 'year')}
							>
								Yearly
								{#if tiers.some((t) => getSavings(t))}
									<span class="text-[8px] opacity-70">Save</span>
								{/if}
							</button>
						</div>
					</div>
				{/if}

				<!-- Tier Cards (simplified) -->
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					{#each tiers as tier}
						{@const isSelected = selectedTierId === tier.id}
						<button
							type="button"
							class="card-interactive group border-surface-500/10 relative w-full rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg {isSelected
								? 'ring-primary-500 ring-2'
								: ''}"
							onclick={() => (selectedTierId = tier.id)}
						>
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-surface-950-50 truncate text-base font-bold">
									{tier.name || 'Membership'}
								</h3>
								<span
									class="chip {isSelected
										? 'preset-filled-primary-500'
										: 'preset-tonal-surface'} flex-shrink-0 text-[10px] font-semibold"
								>
									{getTierPrice(tier)}
								</span>
							</div>
							{#if selectedInterval === 'year'}
								{@const savings = getSavings(tier)}
								{#if savings}
									<p class="text-tertiary-700-300 mt-1 text-[10px] font-semibold">{savings}</p>
								{/if}
							{/if}
						</button>
					{/each}
				</div>

				<!-- Continue Button -->
				{#if selectedTierId}
					{@const selectedTier = tiers.find((t) => t.id === selectedTierId)}
					{@const hasAnnual =
						selectedTier?.annual_amount_cents > 0 || selectedTier?.allow_custom_amount}
					{@const hasMonthly =
						selectedTier?.monthly_amount_cents > 0 ||
						selectedTier?.amount_cents > 0 ||
						selectedTier?.allow_custom_amount}

					<form method="GET" action={`/groups/${group.slug}/membership`} class="mt-5">
						<input type="hidden" name="tier" value={selectedTierId} />
						{#if hasAnnual && hasMonthly}
							<input type="hidden" name="interval" value={selectedInterval} />
						{/if}

						<button
							type="submit"
							class="btn preset-filled-primary-500 shadow-primary-500/25 hover:shadow-primary-500/35 h-12 w-full gap-2 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
						>
							Continue
							<IconArrowRight class="h-4 w-4" />
						</button>

						<p class="text-surface-600-400 mt-2 text-center text-[10px]">
							Continue to 3FP to complete your membership
						</p>
					</form>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Donation Section (with embedded form) -->
	{#if site.donationEnabled}
		<section class="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8" id="donate">
			<div class="glass-card border-surface-500/15 rounded-2xl border p-5 md:p-6">
				<div class="flex items-center gap-3">
					<div
						class="from-secondary-500 to-tertiary-500 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconHeartHandshake class="h-4 w-4 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							Support
						</p>
						<h2 class="text-surface-950-50 text-lg font-bold tracking-tight">Give directly</h2>
					</div>
				</div>

				<form method="GET" action="/donate" class="mt-4">
					<input type="hidden" name="group" value={group.slug} />

					<div class="space-y-4">
						<div class="grid grid-cols-4 gap-2">
							{#each donateAmountPresets as preset}
								<button
									type="button"
									class="btn {donateAmount === preset
										? 'preset-filled-secondary-500 shadow-secondary-500/25 shadow-md'
										: 'preset-tonal-surface hover:preset-filled-secondary-500/80'} h-11 text-sm font-bold transition-all duration-150"
									onclick={() => (donateAmount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>

						<div class="relative">
							<span
								class="text-surface-950-50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-bold"
								>$</span
							>
							<input
								type="number"
								min="1"
								max="25000"
								step="1"
								name="amount"
								bind:value={donateAmount}
								class="input preset-filled-surface-50-950 border-surface-500/20 focus:border-secondary-500 h-11 w-full rounded-lg border pr-3 pl-8 text-base font-semibold transition-colors"
								placeholder="Other amount"
							/>
						</div>

						<button
							type="submit"
							class="btn preset-filled-secondary-500 shadow-secondary-500/25 hover:shadow-secondary-500/35 h-12 w-full gap-2 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
						>
							Donate to us
							<IconArrowRight class="h-4 w-4" />
						</button>

						<p class="text-surface-600-400 text-center text-[10px]">
							Secure checkout · Powered by 3FP
						</p>
					</div>
				</form>
			</div>
		</section>
	{/if}
</div>

<style>
	/* Glass card uses the global class from +page.svelte */
	:global(.glass-card) {
		background: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) :global(.glass-card) {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}

	/* Interactive card effect */
	.card-interactive {
		background: color-mix(in oklab, var(--color-surface-50) 50%, transparent);
		backdrop-filter: blur(10px);
	}

	:global([data-color-mode='dark']) .card-interactive {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-join-page
		:global(.text-surface-600-400),
	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-join-page
		:global(.text-surface-800-200) {
		color: rgb(226 232 240 / 0.84) !important;
	}

	:global(.microsite-shell[data-color-mode='dark'])
		.microsite-join-page
		:global(.text-surface-950-50) {
		color: rgb(248 250 252 / 0.98) !important;
	}

	/* Section fade-in animation */
	.microsite-join-page > section {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
		transform: translateY(20px);
	}

	.microsite-join-page > section:nth-child(1) {
		animation-delay: 0.1s;
	}

	.microsite-join-page > section:nth-child(2) {
		animation-delay: 0.2s;
	}

	.microsite-join-page > section:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes fade-in-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
