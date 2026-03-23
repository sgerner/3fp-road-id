<script>
	import IconBadgeDollarSign from '@lucide/svelte/icons/badge-dollar-sign';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconUsers from '@lucide/svelte/icons/users';

	let { data } = $props();

const site = $derived(data.site);
const group = $derived(site.group);
const basePath = $derived(site.basePath || '');
const tiers = $derived(Array.isArray(site.membershipTiers) ? site.membershipTiers : []);
	const membershipEnabled = $derived(Boolean(site.membershipProgram?.enabled === true));

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
		if (monthly > 0 && annual > 0) return `${formatAmount(monthly)}/mo or ${formatAmount(annual)}/yr`;
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
		<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/55">Join + support</p>
		<h1 class="mt-3 text-4xl font-black tracking-tight text-white">
			Ways to support {site.siteConfig.site_title}
		</h1>
		<p class="mt-4 max-w-3xl text-base leading-8 text-white/72">
			{group.how_to_join_instructions ||
				group.membership_info ||
				'Choose the support path that fits you best and continue on 3FP to complete it.'}
		</p>
	</section>

	<div class="mt-6 grid gap-6 lg:grid-cols-[1fr,0.85fr]">
		<section class="join-panel rounded-[1.7rem] p-6 md:p-8">
			<div class="mb-5 flex items-center gap-3">
				<div class="join-icon">
					<IconUsers class="h-5 w-5" />
				</div>
				<div>
					<p class="text-xs font-semibold tracking-[0.2em] uppercase text-white/52">Membership</p>
					<h2 class="text-2xl font-black tracking-tight text-white">Join the group</h2>
				</div>
			</div>

			{#if membershipEnabled && tiers.length}
				<div class="grid gap-4">
					{#each tiers as tier}
						<div class="tier-card rounded-[1.4rem] p-5">
							<div class="flex items-start justify-between gap-4">
								<div>
									<h3 class="text-xl font-black tracking-tight text-white">{tier.name || 'Membership'}</h3>
									<p class="mt-1 text-sm text-white/68">{intervalLabel(tier)}</p>
								</div>
								<div class="tier-price">{formatAmount(tier.monthly_amount_cents ?? tier.amount_cents ?? 0)}</div>
							</div>
							{#if tier.description}
								<p class="mt-4 text-sm leading-7 text-white/72">{tier.description}</p>
							{/if}
						</div>
					{/each}
				</div>
				<a href={`/groups/${group.slug}/membership`} class="join-cta mt-5">
					Continue to membership
				</a>
			{:else}
				<p class="text-sm leading-7 text-white/68">
					Membership is not configured yet, but the group may still be open to riders, volunteers, or supporters through the links on the home page.
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
						<p class="text-xs font-semibold tracking-[0.2em] uppercase text-white/52">Support</p>
						<h2 class="text-2xl font-black tracking-tight text-white">Give directly</h2>
					</div>
				</div>
				<p class="text-sm leading-7 text-white/72">
					{#if site.donationEnabled}
						Donations are enabled for this group on 3FP.
					{:else}
						The direct donation flow is not enabled yet.
					{/if}
				</p>
				{#if site.donationEnabled}
					<a href={`/donate?group=${group.slug}`} class="join-cta mt-5">Donate to this group</a>
				{/if}
			</section>

			<section class="join-panel rounded-[1.7rem] p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<div class="join-icon">
						<IconBadgeDollarSign class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.2em] uppercase text-white/52">What to expect</p>
						<h2 class="text-2xl font-black tracking-tight text-white">Practical details</h2>
					</div>
				</div>
				<ul class="space-y-3 text-sm leading-7 text-white/72">
					<li class="flex gap-3">
						<IconCheck class="mt-1 h-4 w-4 flex-shrink-0 text-white/62" />
						<span>The final checkout or join flow happens on the main 3FP membership page.</span>
					</li>
					<li class="flex gap-3">
						<IconCheck class="mt-1 h-4 w-4 flex-shrink-0 text-white/62" />
						<span>Groups can keep this microsite simple while still using all the 3FP membership tooling underneath.</span>
					</li>
					<li class="flex gap-3">
						<IconCheck class="mt-1 h-4 w-4 flex-shrink-0 text-white/62" />
						<span>Unclaimed groups still get a microsite automatically, and owners can customize it later.</span>
					</li>
				</ul>
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

	:global(.microsite-shell[data-color-mode='light']) .microsite-join-page :global([class*='text-white/']) {
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
