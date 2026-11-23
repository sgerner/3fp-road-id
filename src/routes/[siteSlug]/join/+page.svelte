<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import AutoLinkText from '#lib/components/ui/AutoLinkText.svelte';
	import { CONTACT_ICON_MAP } from '#lib/groups/contactLinks';
	import { deriveMicrositeCapabilities } from '#lib/microsites/capabilities';

	let { data } = $props();

	const site = $derived(data.site);
	const capabilities = $derived(deriveMicrositeCapabilities(site));
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const isTbagSite = $derived(config?.site_variant === 'tbag');
	const tiers = $derived(Array.isArray(site.membershipTiers) ? site.membershipTiers : []);

	let selectedTierId = $state('');
	let selectedInterval = $state('month');
	let donateAmount = $state(25);

	let signupFirstName = $state('');
	let signupEmail = $state('');
	let signupConsent = $state(false);
	let signupCompany = $state('');
	let signupState = $state('idle');
	let signupMessage = $state('');

	$effect(() => {
		if (selectedTierId) return;
		if (!tiers.length) return;
		const preferred = site?.membershipProgram?.default_tier_id || tiers?.[0]?.id || '';
		selectedTierId = preferred;
	});

	const emailSignupBlock = $derived.by(() => {
		for (const page of config?.site_pages || []) {
			for (const block of page?.blocks || []) {
				if (block?.type === 'email_signup') return block;
			}
		}
		for (const block of config?.page_blocks || []) {
			if (block?.type === 'email_signup') return block;
		}
		return null;
	});

	const pageEyebrow = $derived.by(() => {
		if (!capabilities.hasFollowOptions) return 'Connect with this group';
		const parts = [];
		if (capabilities.hasEmailFollow) parts.push('Follow');
		if (capabilities.hasMembership) parts.push('Membership');
		if (capabilities.hasDonation) parts.push('Support');
		return parts.join(' · ') || 'Follow';
	});

	const pageHeading = $derived.by(() => {
		const title = config?.site_title || group?.name || 'this group';
		if (capabilities.hasMembership || capabilities.hasDonation) {
			return `Follow & support ${title}`;
		}
		if (capabilities.hasEmailFollow) {
			return `Follow ${title}`;
		}
		return `Connect with ${title}`;
	});

	const pageIntro = $derived.by(() => {
		const instructions = (group?.how_to_join_instructions || group?.membership_info || '').trim();
		if (instructions) return instructions;
		if (capabilities.hasEmailFollow) {
			return `Get ride notes, volunteer calls, and local updates from ${config?.site_title || group?.name}, or reach the organizers directly below.`;
		}
		return `Online membership and email updates aren't managed here yet. Reach ${config?.site_title || group?.name} directly through its verified channels or view its 3 Feet Please directory profile.`;
	});

	const nonWebsiteContactLinks = $derived(
		capabilities.contactLinks.filter((link) => {
			if (!capabilities.externalWebsiteUrl) return true;
			return !(
				link.key === 'website' &&
				link.href.toLowerCase() === capabilities.externalWebsiteUrl.toLowerCase()
			);
		})
	);

	async function subscribeToGroupEmails(event) {
		event.preventDefault();
		if (signupState === 'submitting') return;
		signupState = 'submitting';
		signupMessage = '';
		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(group.slug)}/email/subscribe`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						first_name: signupFirstName,
						email: signupEmail,
						consent: signupConsent,
						company: signupCompany
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload.error || 'Unable to sign up right now.');
			}
			signupState = 'success';
			signupMessage =
				payload.message ||
				`You're signed up for email updates from ${group?.name || 'this group'}.`;
			signupEmail = '';
			signupConsent = false;
		} catch (error) {
			signupState = 'error';
			signupMessage = error?.message || 'Unable to sign up. Please try again.';
		}
	}

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

	function formatContactLabel(link) {
		if (!link?.key) return 'Contact link';
		if (link.key === 'website') return 'Official website';
		if (link.key === 'email') return 'Email organizers';
		if (link.key === 'phone') return 'Call organizers';
		if (link.key === 'x') return 'X (Twitter)';
		return link.key.charAt(0).toUpperCase() + link.key.slice(1);
	}

	function formatContactValue(href = '') {
		return String(href)
			.replace(/^mailto:/i, '')
			.replace(/^tel:/i, '')
			.replace(/^https?:\/\/(www\.)?/i, '')
			.replace(/\/$/, '');
	}

	const donateAmountPresets = [10, 25, 50, 100];
</script>

<svelte:head>
	<title>{config.site_title} — {capabilities.membershipCtaLabel || 'Follow'}</title>
</svelte:head>

<div class="join-hub" class:join-hub-tbag={isTbagSite}>
	<header class="join-band join-band-hero">
		<p class="join-kicker">{pageEyebrow}</p>
		<h1 class="join-title">{pageHeading}</h1>
		<AutoLinkText text={pageIntro} className="join-lead" linkClass="join-inline-link" />
		{#if capabilities.hasFollowOptions}
			<div class="join-quick-jumps" aria-label="Page sections">
				{#if capabilities.hasEmailFollow}
					<a href="#follow" class="join-jump-link">Email updates</a>
				{/if}
				{#if capabilities.hasMembership}
					<a href="#membership" class="join-jump-link">Membership</a>
				{/if}
				{#if capabilities.hasDonation}
					<a href="#donate" class="join-jump-link">Donate</a>
				{/if}
				{#if capabilities.hasContact}
					<a href="#contact" class="join-jump-link">Contact & links</a>
				{/if}
			</div>
		{/if}
	</header>

	{#if capabilities.hasEmailFollow}
		<section class="join-band" id="follow" aria-labelledby="join-email-heading">
			<div class="join-section-head">
				<div class="join-icon-mark" aria-hidden="true">
					<IconMail class="h-5 w-5" />
				</div>
				<div>
					<p class="join-kicker">{emailSignupBlock?.eyebrow || 'Email updates'}</p>
					<h2 class="join-heading" id="join-email-heading">
						{emailSignupBlock?.title || `Get updates from ${config.site_title || group.name}`}
					</h2>
				</div>
			</div>
			<p class="join-copy">
				{emailSignupBlock?.body ||
					`Sign up for ride announcements, volunteer calls, and local advocacy alerts from ${group.name}.`}
			</p>

			<form class="join-form" onsubmit={subscribeToGroupEmails}>
				<div class="join-field-grid">
					<div class="join-field">
						<label class="join-label" for="join-signup-first-name">
							First name <span class="join-label-optional">(optional)</span>
						</label>
						<input
							id="join-signup-first-name"
							name="first_name"
							type="text"
							autocomplete="given-name"
							maxlength="120"
							bind:value={signupFirstName}
							class="join-input"
						/>
					</div>

					<div class="join-field">
						<label class="join-label" for="join-signup-email">Email address</label>
						<input
							id="join-signup-email"
							name="email"
							type="email"
							autocomplete="email"
							required
							maxlength="320"
							bind:value={signupEmail}
							class="join-input"
							placeholder="you@example.com"
						/>
					</div>
				</div>

				<div class="join-honeypot" aria-hidden="true">
					<label for="join-signup-company">Company</label>
					<input
						id="join-signup-company"
						name="company"
						type="text"
						tabindex="-1"
						autocomplete="off"
						bind:value={signupCompany}
					/>
				</div>

				<label class="join-consent" for="join-signup-consent">
					<input
						id="join-signup-consent"
						name="consent"
						type="checkbox"
						required
						bind:checked={signupConsent}
						class="join-checkbox"
					/>
					<span>
						I agree to receive email updates from {group.name}. I can unsubscribe at any time.
					</span>
				</label>

				<div class="join-submit-row">
					<button type="submit" class="join-primary-btn" disabled={signupState === 'submitting'}>
						<span>
							{signupState === 'submitting'
								? 'Signing you up…'
								: emailSignupBlock?.button_label || 'Follow by email'}
						</span>
						<IconArrowRight class="h-4 w-4 shrink-0" />
					</button>
				</div>

				{#if signupMessage}
					<div
						class="join-feedback {signupState === 'error'
							? 'join-feedback-error'
							: 'join-feedback-success'}"
						role={signupState === 'error' ? 'alert' : 'status'}
						aria-live={signupState === 'error' ? 'assertive' : 'polite'}
					>
						{signupMessage}
					</div>
				{/if}
			</form>
		</section>
	{/if}

	{#if capabilities.hasMembership}
		<section class="join-band" id="membership" aria-labelledby="join-membership-heading">
			<div class="join-section-head">
				<div class="join-icon-mark" aria-hidden="true">
					<IconUsers class="h-5 w-5" />
				</div>
				<div>
					<p class="join-kicker">Membership</p>
					<h2 class="join-heading" id="join-membership-heading">Join {config.site_title}</h2>
				</div>
			</div>

			{#if tiers.some((t) => (t.monthly_amount_cents > 0 || t.amount_cents > 0) && t.annual_amount_cents > 0)}
				<div class="join-billing-bar" role="group" aria-label="Billing interval">
					<button
						type="button"
						class="join-toggle-btn {selectedInterval === 'month' ? 'is-selected' : ''}"
						aria-pressed={selectedInterval === 'month'}
						onclick={() => (selectedInterval = 'month')}
					>
						Monthly
					</button>
					<button
						type="button"
						class="join-toggle-btn {selectedInterval === 'year' ? 'is-selected' : ''}"
						aria-pressed={selectedInterval === 'year'}
						onclick={() => (selectedInterval = 'year')}
					>
						Yearly
						{#if tiers.some((t) => getSavings(t))}
							<span class="join-savings-tag">Save</span>
						{/if}
					</button>
				</div>
			{/if}

			<div class="join-tier-grid">
				{#each tiers as tier}
					{@const isSelected = selectedTierId === tier.id}
					<button
						type="button"
						class="join-tier-card {isSelected ? 'is-selected' : ''}"
						aria-pressed={isSelected}
						onclick={() => (selectedTierId = tier.id)}
					>
						<div class="join-tier-top">
							<span class="join-tier-name">{tier.name || 'Membership'}</span>
							<span class="join-tier-price">{getTierPrice(tier)}</span>
						</div>
						{#if tier.description}
							<p class="join-tier-desc">{tier.description}</p>
						{/if}
						{#if selectedInterval === 'year'}
							{@const savings = getSavings(tier)}
							{#if savings}
								<p class="join-tier-savings">{savings}</p>
							{/if}
						{/if}
					</button>
				{/each}
			</div>

			{#if selectedTierId}
				{@const selectedTier = tiers.find((t) => t.id === selectedTierId)}
				{@const hasAnnual =
					selectedTier?.annual_amount_cents > 0 || selectedTier?.allow_custom_amount}
				{@const hasMonthly =
					selectedTier?.monthly_amount_cents > 0 ||
					selectedTier?.amount_cents > 0 ||
					selectedTier?.allow_custom_amount}

				<form method="GET" action={`/groups/${group.slug}/membership`} class="join-action-form">
					<input type="hidden" name="tier" value={selectedTierId} />
					{#if hasAnnual && hasMonthly}
						<input type="hidden" name="interval" value={selectedInterval} />
					{/if}
					<button type="submit" class="join-primary-btn">
						<span>Continue to membership</span>
						<IconArrowRight class="h-4 w-4 shrink-0" />
					</button>
					<p class="join-footnote">Completes securely on 3 Feet Please.</p>
				</form>
			{/if}
		</section>
	{/if}

	{#if capabilities.hasDonation}
		<section class="join-band" id="donate" aria-labelledby="join-donate-heading">
			<div class="join-section-head">
				<div class="join-icon-mark" aria-hidden="true">
					<IconHeartHandshake class="h-5 w-5" />
				</div>
				<div>
					<p class="join-kicker">Direct support</p>
					<h2 class="join-heading" id="join-donate-heading">Donate to {config.site_title}</h2>
				</div>
			</div>

			<form method="GET" action="/donate" class="join-action-form">
				<input type="hidden" name="group" value={group.slug} />

				<div class="join-preset-grid" role="group" aria-label="Preset donation amounts">
					{#each donateAmountPresets as preset}
						<button
							type="button"
							class="join-toggle-btn {donateAmount === preset ? 'is-selected' : ''}"
							aria-pressed={donateAmount === preset}
							onclick={() => (donateAmount = preset)}
						>
							${preset}
						</button>
					{/each}
				</div>

				<div class="join-field">
					<label class="join-label" for="join-donate-amount">Donation amount (USD)</label>
					<div class="join-currency-wrap">
						<span class="join-currency-prefix" aria-hidden="true">$</span>
						<input
							id="join-donate-amount"
							type="number"
							min="1"
							max="25000"
							step="1"
							name="amount"
							bind:value={donateAmount}
							class="join-input join-currency-input"
						/>
					</div>
				</div>

				<button type="submit" class="join-primary-btn">
					<span>Continue to donate</span>
					<IconArrowRight class="h-4 w-4 shrink-0" />
				</button>
				<p class="join-footnote">Secure checkout powered by 3 Feet Please.</p>
			</form>
		</section>
	{/if}

	<section class="join-band" id="contact" aria-labelledby="join-contact-heading">
		<div class="join-section-head">
			<div class="join-icon-mark" aria-hidden="true">
				<IconGlobe class="h-5 w-5" />
			</div>
			<div>
				<p class="join-kicker">
					{capabilities.hasFollowOptions ? 'Direct channels' : 'Verified club links'}
				</p>
				<h2 class="join-heading" id="join-contact-heading">
					{capabilities.hasFollowOptions
						? `Reach ${config.site_title || group.name}`
						: `Where to find ${config.site_title || group.name}`}
				</h2>
			</div>
		</div>
		<p class="join-copy">
			{#if capabilities.hasFollowOptions}
				Questions about rides, volunteering, or local partnerships? Reach the group directly or view
				its full profile on 3 Feet Please.
			{:else}
				This directory microsite hasn't enabled online signups yet. Use the verified links below to
				connect with {group.name} or claim and manage this group on 3 Feet Please.
			{/if}
		</p>

		<div class="join-link-list">
			{#if capabilities.externalWebsiteUrl}
				<a
					href={capabilities.externalWebsiteUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="join-link-row"
				>
					<span class="join-link-icon" aria-hidden="true">
						<IconGlobe class="h-4 w-4" />
					</span>
					<span class="join-link-body">
						<span class="join-link-title">Official club website</span>
						<span class="join-link-meta">{formatContactValue(capabilities.externalWebsiteUrl)}</span
						>
					</span>
					<IconExternalLink class="h-4 w-4 shrink-0" />
				</a>
			{/if}

			{#each nonWebsiteContactLinks as link}
				{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
				{@const isExternal = /^https?:\/\//i.test(link.href)}
				<a
					href={link.href}
					target={isExternal ? '_blank' : undefined}
					rel={isExternal ? 'noopener noreferrer' : undefined}
					class="join-link-row"
				>
					<span class="join-link-icon" aria-hidden="true">
						<ContactIcon class="h-4 w-4" />
					</span>
					<span class="join-link-body">
						<span class="join-link-title">{formatContactLabel(link)}</span>
						<span class="join-link-meta">{formatContactValue(link.href)}</span>
					</span>
					{#if isExternal}
						<IconExternalLink class="h-4 w-4 shrink-0" />
					{:else}
						<IconArrowRight class="h-4 w-4 shrink-0" />
					{/if}
				</a>
			{/each}

			<a href={capabilities.groupProfileHref} class="join-link-row">
				<span class="join-link-icon" aria-hidden="true">
					<IconUsers class="h-4 w-4" />
				</span>
				<span class="join-link-body">
					<span class="join-link-title">3 Feet Please group profile</span>
					<span class="join-link-meta">
						{capabilities.isClaimed
							? `View ${group.name} rides, updates, and community details on 3fp.org`
							: `View ${group.name} in the 3fp.org directory or claim this group`}
					</span>
				</span>
				<IconArrowRight class="h-4 w-4 shrink-0" />
			</a>
		</div>
	</section>
</div>

<style>
	.join-hub {
		--join-surface: var(--color-surface-50, #ffffff);
		--join-surface-alt: var(--color-surface-100, #f4f6f8);
		--join-ink: var(--color-surface-950, #0f172a);
		--join-muted: var(--color-surface-700, #334155);
		--join-line: color-mix(in oklab, var(--color-surface-950, #0f172a) 16%, transparent);
		--join-line-strong: color-mix(in oklab, var(--color-surface-950, #0f172a) 36%, transparent);
		--join-accent: var(--color-primary-500, #155e75);
		--join-cta-bg: var(--color-surface-950, #0f172a);
		--join-cta-fg: var(--color-surface-50, #ffffff);

		max-width: 68rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.join-hub {
			padding: 2rem 1.5rem 5rem;
			gap: 1.75rem;
		}
	}

	.join-hub.join-hub-tbag {
		--join-surface: #f7faf8;
		--join-surface-alt: #edf4f2;
		--join-ink: #11333d;
		--join-muted: #35525e;
		--join-line: rgb(17 51 61 / 0.18);
		--join-line-strong: rgb(21 94 117 / 0.48);
		--join-accent: #155e75;
		--join-cta-bg: #155e75;
		--join-cta-fg: #ffffff;
	}

	:global([data-color-mode='dark']) .join-hub {
		--join-surface: var(--color-surface-950, #0b1320);
		--join-surface-alt: var(--color-surface-900, #111c2d);
		--join-ink: var(--color-surface-50, #f8fafc);
		--join-muted: var(--color-surface-200, #cbd5e1);
		--join-line: color-mix(in oklab, var(--color-surface-50, #f8fafc) 18%, transparent);
		--join-line-strong: color-mix(in oklab, var(--color-surface-50, #f8fafc) 44%, transparent);
		--join-accent: var(--color-primary-400, #8bc9cf);
		--join-cta-bg: var(--color-surface-50, #f8fafc);
		--join-cta-fg: var(--color-surface-950, #0b1320);
	}

	:global([data-color-mode='dark']) .join-hub.join-hub-tbag {
		--join-surface: #102e3a;
		--join-surface-alt: #0a222c;
		--join-ink: #eef7f5;
		--join-muted: #c2dada;
		--join-line: rgb(139 201 207 / 0.22);
		--join-line-strong: rgb(139 201 207 / 0.54);
		--join-accent: #8bc9cf;
		--join-cta-bg: #eef7f5;
		--join-cta-fg: #0a222c;
	}

	.join-band {
		background: var(--join-surface);
		color: var(--join-ink);
		border: 1px solid var(--join-line);
		border-left: 4px solid var(--join-accent);
		border-radius: 0;
		padding: 1.5rem;
	}

	.join-band-hero {
		border-left-width: 1px;
		border-top: 4px solid var(--join-accent);
	}

	@media (min-width: 768px) {
		.join-band {
			padding: 2rem 2.25rem;
		}
	}

	.join-kicker {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--join-muted);
	}

	.join-title {
		margin-top: 0.45rem;
		font-size: clamp(1.85rem, 3.6vw, 2.75rem);
		font-weight: 850;
		line-height: 1.05;
		letter-spacing: -0.03em;
		color: var(--join-ink);
	}

	:global(.join-lead) {
		display: block;
		margin-top: 0.85rem;
		max-width: 62ch;
		font-size: 1rem;
		line-height: 1.6;
		color: var(--join-muted);
	}

	:global(.join-inline-link) {
		color: var(--join-ink);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.join-quick-jumps {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--join-line);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.join-jump-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--join-line-strong);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		font-size: 0.85rem;
		font-weight: 700;
		text-decoration: none;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.join-jump-link:hover {
		border-color: var(--join-ink);
	}

	.join-section-head {
		display: flex;
		align-items: flex-start;
		gap: 0.9rem;
	}

	.join-icon-mark {
		display: flex;
		width: 2.5rem;
		height: 2.5rem;
		align-items: center;
		justify-content: center;
		background: var(--join-cta-bg);
		color: var(--join-cta-fg);
		border-radius: 0;
		flex-shrink: 0;
	}

	.join-heading {
		margin-top: 0.2rem;
		font-size: clamp(1.3rem, 2.4vw, 1.75rem);
		font-weight: 800;
		line-height: 1.15;
		letter-spacing: -0.02em;
		color: var(--join-ink);
	}

	.join-copy {
		margin-top: 0.85rem;
		max-width: 62ch;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--join-muted);
	}

	.join-form,
	.join-action-form {
		margin-top: 1.35rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 44rem;
	}

	.join-field-grid {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.join-field-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.join-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.join-label {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--join-ink);
	}

	.join-label-optional {
		font-weight: 500;
		color: var(--join-muted);
	}

	.join-input {
		width: 100%;
		min-height: 2.875rem;
		padding: 0.625rem 0.85rem;
		border: 1px solid var(--join-line-strong);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		font-size: 1rem;
		line-height: 1.4;
	}

	.join-input::placeholder {
		color: var(--join-muted);
		opacity: 0.75;
	}

	.join-input:focus-visible,
	.join-checkbox:focus-visible,
	.join-primary-btn:focus-visible,
	.join-toggle-btn:focus-visible,
	.join-tier-card:focus-visible,
	.join-link-row:focus-visible,
	.join-jump-link:focus-visible {
		outline: 2px solid var(--join-ink);
		outline-offset: 2px;
	}

	.join-honeypot {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.join-consent {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		padding: 0.35rem 0;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--join-ink);
		cursor: pointer;
	}

	.join-checkbox {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		border-radius: 0;
		accent-color: var(--join-cta-bg);
	}

	.join-submit-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.join-primary-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 3rem;
		padding: 0.75rem 1.35rem;
		border: 1px solid var(--join-cta-bg);
		border-radius: 0;
		background: var(--join-cta-bg);
		color: var(--join-cta-fg);
		font-size: 0.9375rem;
		font-weight: 750;
		cursor: pointer;
		width: fit-content;
		transition: opacity 140ms ease;
	}

	.join-primary-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.join-primary-btn:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	.join-feedback {
		padding: 0.85rem 1rem;
		border: 1px solid var(--join-line-strong);
		border-left: 4px solid var(--join-accent);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.5;
	}

	.join-feedback-error {
		border-left-color: #b91c1c;
	}

	:global([data-color-mode='dark']) .join-feedback-error {
		border-left-color: #f87171;
	}

	.join-billing-bar {
		margin-top: 1.25rem;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		max-width: 24rem;
	}

	.join-preset-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.join-toggle-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 2.875rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--join-line-strong);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}

	.join-toggle-btn.is-selected {
		background: var(--join-cta-bg);
		border-color: var(--join-cta-bg);
		color: var(--join-cta-fg);
	}

	.join-savings-tag {
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.join-tier-grid {
		margin-top: 1.25rem;
		display: grid;
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.join-tier-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.join-tier-card {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-height: 4.5rem;
		padding: 1rem 1.15rem;
		border: 1px solid var(--join-line-strong);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		text-align: left;
		cursor: pointer;
	}

	.join-tier-card.is-selected {
		border-left: 4px solid var(--join-accent);
		border-color: var(--join-ink);
		background: var(--join-surface);
	}

	.join-tier-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.join-tier-name {
		font-size: 1rem;
		font-weight: 800;
	}

	.join-tier-price {
		font-size: 0.9rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.join-tier-desc {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--join-muted);
	}

	.join-tier-savings {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--join-ink);
	}

	.join-currency-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.join-currency-prefix {
		position: absolute;
		left: 0.85rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--join-muted);
		pointer-events: none;
	}

	.join-currency-input {
		padding-left: 2rem;
	}

	.join-footnote {
		font-size: 0.8rem;
		color: var(--join-muted);
	}

	.join-link-list {
		margin-top: 1.25rem;
		border-top: 1px solid var(--join-line);
		display: flex;
		flex-direction: column;
	}

	.join-link-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		min-height: 3.5rem;
		padding: 0.85rem 0.5rem;
		border-bottom: 1px solid var(--join-line);
		border-radius: 0;
		color: var(--join-ink);
		text-decoration: none;
		transition: background-color 140ms ease;
	}

	.join-link-row:hover {
		background: var(--join-surface-alt);
	}

	.join-link-icon {
		display: flex;
		width: 2.25rem;
		height: 2.25rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--join-line-strong);
		border-radius: 0;
		background: var(--join-surface-alt);
		color: var(--join-ink);
		flex-shrink: 0;
	}

	.join-link-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.join-link-title {
		font-size: 0.95rem;
		font-weight: 750;
		color: var(--join-ink);
	}

	.join-link-meta {
		font-size: 0.85rem;
		color: var(--join-muted);
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
