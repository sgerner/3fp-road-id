<script>
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconUsers from '@lucide/svelte/icons/users';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const basePath = $derived(site.basePath || '');
	const tiers = $derived(Array.isArray(site.membershipTiers) ? site.membershipTiers : []);
	const membershipEnabled = $derived(Boolean(site.membershipProgram?.enabled === true));
	let handoffTierId = $state('');
	let handoffInterval = $state('month');
	let handoffName = $state('');
	let handoffEmail = $state('');

	$effect(() => {
		if (handoffTierId) return;
		if (!tiers.length) return;
		const preferred = site?.membershipProgram?.default_tier_id || tiers?.[0]?.id || '';
		handoffTierId = preferred;
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

	function intervalLabel(tier) {
		const monthly = Number(tier?.monthly_amount_cents ?? tier?.amount_cents ?? 0);
		const annual = Number(tier?.annual_amount_cents ?? 0);
		if (monthly > 0 && annual > 0)
			return `${formatAmount(monthly)}/mo or ${formatAmount(annual)}/yr`;
		if (monthly > 0) return `${formatAmount(monthly)}/month`;
		if (annual > 0) return `${formatAmount(annual)}/year`;
		if (tier?.allow_custom_amount === true) return 'Choose your amount';
		return 'Free';
	}
</script>

<svelte:head>
	<title>{site.siteConfig.site_title} Join</title>
</svelte:head>

<div class="microsite-join-page mx-auto max-w-6xl px-4 pt-6 pb-8 md:px-6 md:pt-10">
	<section class="join-hero rounded-[2rem] p-6 md:p-8">
		<p class="text-surface-700-300 text-xs font-semibold tracking-[0.24em] uppercase">
			Join + support
		</p>
		<h1 class="text-surface-950-50 mt-3 text-4xl font-black tracking-tight">
			Ways to support {site.siteConfig.site_title}
		</h1>
		<AutoLinkText
			text={group.how_to_join_instructions ||
				group.membership_info ||
				'Choose the support path that fits you best and continue on 3FP to complete it.'}
			className="block text-surface-800-200 mt-4 max-w-3xl text-base leading-8"
			linkClass="text-primary-700-300 underline underline-offset-2"
		/>
	</section>

	<div class="mt-6 grid gap-6 lg:grid-cols-[1fr,0.85fr]">
		<section class="join-panel rounded-[1.7rem] p-6 md:p-8">
			<div class="mb-5 flex items-center gap-3">
				<div class="join-icon">
					<IconUsers class="h-5 w-5" />
				</div>
				<div>
					<p class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
						Membership
					</p>
					<h2 class="text-surface-950-50 text-2xl font-black tracking-tight">Join us</h2>
				</div>
			</div>

			{#if membershipEnabled && tiers.length}
				<div class="grid gap-4">
					{#each tiers as tier}
						<div class="tier-card rounded-[1.4rem] p-5">
							<div class="flex items-start justify-between gap-4">
								<div>
									<h3 class="text-surface-950-50 text-xl font-black tracking-tight">
										{tier.name || 'Membership'}
									</h3>
									<p class="text-surface-700-300 mt-1 text-sm">{intervalLabel(tier)}</p>
								</div>
								<div class="tier-price">
									{formatAmount(tier.monthly_amount_cents ?? tier.amount_cents ?? 0)}
								</div>
							</div>
							{#if tier.description}
								<AutoLinkText
									text={tier.description}
									className="block text-surface-800-200 mt-4 text-sm leading-7"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							{/if}
						</div>
					{/each}
				</div>
				<form
					method="GET"
					action={`/groups/${group.slug}/membership`}
					class="border-surface-500/20 mt-5 grid gap-3 rounded-2xl border p-4 md:grid-cols-2"
				>
					<label class="flex flex-col gap-1">
						<span class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Tier
						</span>
						<select name="tier" bind:value={handoffTierId} class="input preset-filled-surface-50-950">
							{#each tiers as tier}
								<option value={tier.id}>{tier.name || 'Membership'}</option>
							{/each}
						</select>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Billing
						</span>
						<select
							name="interval"
							bind:value={handoffInterval}
							class="input preset-filled-surface-50-950"
						>
							<option value="month">Monthly</option>
							<option value="year">Yearly</option>
						</select>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Name (optional)
						</span>
						<input
							type="text"
							name="name"
							maxlength="120"
							bind:value={handoffName}
							class="input preset-filled-surface-50-950"
							placeholder="Your name"
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Email (optional)
						</span>
						<input
							type="email"
							name="email"
							maxlength="254"
							bind:value={handoffEmail}
							class="input preset-filled-surface-50-950"
							placeholder="you@example.com"
						/>
					</label>
					<button type="submit" class="join-cta mt-1 md:col-span-2">
						Continue to secure membership
					</button>
				</form>
			{:else}
				<p class="text-surface-800-200 text-sm leading-7">
					Membership is not configured yet, but we may still be open to riders, volunteers,
					or supporters through the links on the home page.
				</p>
			{/if}
		</section>

		<div class="space-y-6">
			<section class="join-panel rounded-[1.7rem] p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<div class="join-icon">
						<IconHeart class="h-5 w-5" />
					</div>
					<div>
						<p class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Support
						</p>
						<h2 class="text-surface-950-50 text-2xl font-black tracking-tight">Give directly</h2>
					</div>
				</div>
				<p class="text-surface-800-200 text-sm leading-7">
					{#if site.donationEnabled}
						Donations are enabled for us on 3FP.
					{:else}
						The direct donation flow is not enabled yet.
					{/if}
				</p>
				{#if site.donationEnabled}
					<a href={`/donate?group=${group.slug}`} class="join-cta mt-5">Donate to us</a>
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	.join-hero,
	.join-panel,
	.tier-card {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
		backdrop-filter: blur(18px);
	}

	.join-hero {
		background:
			radial-gradient(
				20rem 12rem at 100% 0%,
				color-mix(in oklab, var(--color-secondary-500) 22%, transparent),
				transparent 60%
			),
			color-mix(in oklab, var(--color-surface-950) 76%, transparent);
	}

	.join-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
		color: white;
	}

	.tier-price {
		font-size: 0.9rem;
		font-weight: 800;
		color: white;
		padding: 0.4rem 0.75rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
	}

	.join-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0.9rem 1.25rem;
		font-weight: 800;
		text-decoration: none;
		color: var(--color-primary-contrast-500);
		background: var(--color-primary-500);
	}

	:global(.microsite-shell[data-color-mode='light']) .microsite-join-page :global(.text-white) {
		color: rgb(15 23 42 / 0.92) !important;
	}

	:global(.microsite-shell[data-color-mode='light'])
		.microsite-join-page
		:global([class*='text-white/']) {
		color: rgb(51 65 85 / 0.78) !important;
	}

	:global(.microsite-shell[data-color-mode='light']) .join-hero,
	:global(.microsite-shell[data-color-mode='light']) .join-panel,
	:global(.microsite-shell[data-color-mode='light']) .tier-card {
		border-color: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		background: color-mix(in oklab, white 80%, var(--color-primary-100) 20%);
		box-shadow: 0 16px 34px -28px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .join-hero {
		background:
			radial-gradient(
				20rem 12rem at 100% 0%,
				color-mix(in oklab, var(--color-secondary-300) 26%, transparent),
				transparent 62%
			),
			color-mix(in oklab, white 80%, var(--color-secondary-100) 20%);
	}

	:global(.microsite-shell[data-color-mode='light']) .join-icon {
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		color: rgb(15 23 42 / 0.9);
	}
</style>
