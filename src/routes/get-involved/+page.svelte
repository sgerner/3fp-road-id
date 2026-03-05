<script>
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '$lib/security/turnstile';
	import IconHandshake from '@lucide/svelte/icons/handshake';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMegaphone from '@lucide/svelte/icons/megaphone';
	import IconBriefcase from '@lucide/svelte/icons/briefcase';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconShare2 from '@lucide/svelte/icons/share-2';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle-2';
	import { fade, slide } from 'svelte/transition';

	let { data, form } = $props();

	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);
	let captchaError = $state('');

	const turnstileEnabled = $derived(
		!data?.user?.id && Boolean(PUBLIC_TURNSTILE_SITE_KEY) && data.turnstileEnabled !== false
	);
	const selectedOpportunityIds = $derived(
		Array.isArray(form?.interestValues?.opportunityIds) ? form.interestValues.opportunityIds : []
	);
	const parsedOpportunities = $derived(
		(data.opportunities ?? []).map((opportunity) => {
			const lines = String(opportunity.description ?? '')
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
			const summary = lines.find((line) => !line.startsWith('-')) ?? '';
			const bullets = lines
				.filter((line) => line.startsWith('-'))
				.map((line) => line.replace(/^-+\s*/, '').trim())
				.filter(Boolean);
			return { ...opportunity, summary, bullets };
		})
	);

	// Local checkbox state for interactive selection
	let checkedIds = $state([]);

	$effect(() => {
		checkedIds = [...selectedOpportunityIds];
	});

	function toggleOpportunity(id) {
		const s = new Set(checkedIds);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		checkedIds = Array.from(s);
	}

	async function initTurnstile() {
		if (!turnstileEnabled || !turnstileEl || turnstileWidgetId) return;
		try {
			const widgetId = await renderTurnstile(turnstileEl, {
				sitekey: PUBLIC_TURNSTILE_SITE_KEY,
				size: 'invisible'
			});
			turnstileWidgetId = widgetId;
		} catch (err) {
			console.error('Failed to initialize Turnstile widget', err);
		}
	}

	onMount(() => {
		if (turnstileEnabled) {
			void initTurnstile();
		}
	});

	async function enhanceInterestForm({ formData, cancel }) {
		captchaError = '';
		if (turnstileEnabled) {
			await initTurnstile();
			if (!turnstileWidgetId) {
				captchaError = 'Verification failed. Please reload and try again.';
				cancel();
				return;
			}
			const token = await executeTurnstile(turnstileWidgetId);
			if (!token) {
				captchaError = 'Verification failed. Please try again.';
				cancel();
				return;
			}
			formData.set('turnstileToken', token);
		}

		return async ({ update }) => {
			await update({ reset: false });
			if (turnstileEnabled && turnstileWidgetId) {
				resetTurnstile(turnstileWidgetId);
			}
		};
	}

	// Pick an icon per opportunity based on keywords in the title
	function opportunityIcon(title = '') {
		const t = title.toLowerCase();
		if (t.includes('board')) return IconBriefcase;
		if (t.includes('social') || t.includes('media')) return IconShare2;
		if (t.includes('volunteer') || t.includes('event')) return IconHandshake;
		if (t.includes('advocate') || t.includes('advocacy') || t.includes('outreach'))
			return IconMegaphone;
		if (t.includes('ride') || t.includes('cycling')) return IconBike;
		if (t.includes('community') || t.includes('group')) return IconUsers;
		return IconHeart;
	}

	// Vivid accent per opportunity slot (cycles through app colors)
	const accentColors = [
		'var(--color-primary-500)',
		'var(--color-secondary-500)',
		'var(--color-tertiary-500)',
		'var(--color-warning-500)',
		'var(--color-success-500)'
	];
	function opportunityAccent(index) {
		return accentColors[index % accentColors.length];
	}
</script>

<svelte:head>
	<title>Get Involved | 3 Feet Please</title>
	<meta
		name="description"
		content="Help build safer streets and stronger cycling culture. Choose where you want to contribute to 3 Feet Please."
	/>
</svelte:head>

<div class="get-involved-page mx-auto flex w-full max-w-7xl flex-col gap-12">
	<!-- ═══════════════════════════════════════════════
	     CINEMATIC HERO
	═══════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:p-10"
		>
			<!-- Left: headline + copy + stat cards -->
			<div class="flex flex-col gap-7">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconHeart class="h-3.5 w-3.5" />
						Get Involved
					</span>
					<span class="chip preset-tonal-secondary">Community</span>
					<span class="chip preset-tonal-tertiary">Local Impact</span>
				</div>

				<div class="space-y-4">
					<h1
						class="gi-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						Make streets safer.<br />
						<span class="gi-headline-accent">Show up for cyclists.</span>
					</h1>
					<p class="max-w-xl text-base leading-relaxed opacity-75">
						3 Feet Please runs on people who care. Whether you want to lead, advocate, or amplify —
						there's a place for you here. Tell us where you want to help and we'll connect you with
						the right next step.
					</p>
				</div>

				<!-- Stat cards -->
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
						<div
							class="stat-card-glow"
							style="background: var(--color-primary-500);"
							aria-hidden="true"
						></div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
						>
							<IconBriefcase class="h-4 w-4" />
							Open Roles
						</div>
						<div class="text-3xl font-black tabular-nums">{data.opportunities?.length || 0}</div>
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
							<IconBike class="h-4 w-4" />
							Years Strong
						</div>
						<div class="text-3xl font-black tabular-nums">10+</div>
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
							<IconUsers class="h-4 w-4" />
							Advocates
						</div>
						<div class="text-3xl font-black tabular-nums">100+</div>
					</div>
				</div>
			</div>

			<!-- Right: contact + social panel -->
			<div
				class="contact-panel card preset-filled-surface-50-950 flex flex-col gap-5 p-6 shadow-2xl"
			>
				<div class="space-y-1">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] uppercase opacity-60"
					>
						<IconSparkles class="h-4 w-4" />
						Reach out
					</div>
					<h2 class="text-xl font-bold">Connect with us</h2>
				</div>

				<div class="space-y-3 text-sm">
					<a href="mailto:hi@3fp.org" class="contact-link flex items-center gap-3 rounded-xl p-3">
						<div class="contact-icon-wrap">
							<IconMail class="h-4 w-4" />
						</div>
						<span>hi@3fp.org</span>
					</a>
					<a
						href="https://www.facebook.com/3FeetPlease/"
						target="_blank"
						rel="noopener noreferrer"
						class="contact-link flex items-center gap-3 rounded-xl p-3"
					>
						<div class="contact-icon-wrap">
							<IconShare2 class="h-4 w-4" />
						</div>
						<span>Facebook</span>
					</a>
					<a
						href="https://www.instagram.com/3feetplease"
						target="_blank"
						rel="noopener noreferrer"
						class="contact-link flex items-center gap-3 rounded-xl p-3"
					>
						<div class="contact-icon-wrap">
							<IconMegaphone class="h-4 w-4" />
						</div>
						<span>Instagram</span>
					</a>
					<div class="contact-link flex items-start gap-3 rounded-xl p-3">
						<div class="contact-icon-wrap mt-0.5">
							<IconMapPin class="h-4 w-4" />
						</div>
						<span class="text-xs leading-relaxed opacity-80"
							>2628 W Birchwood Cir, STE C<br />Mesa, AZ 85202</span
						>
					</div>
				</div>

				<div class="mt-auto">
					<a href="#interest-form" class="btn preset-filled-primary-500 w-full gap-2">
						Raise your hand
						<IconArrowRight class="h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     CURRENT OPPORTUNITIES
	═══════════════════════════════════════════════ -->
	<section class="space-y-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<h2 class="text-2xl font-bold">Current opportunities</h2>
			<a href="#interest-form" class="btn btn-sm preset-outlined-primary-500 gap-1.5">
				<IconArrowRight class="h-3.5 w-3.5" />
				Apply now
			</a>
		</div>

		{#if parsedOpportunities.length}
			<div class="grid gap-4 sm:grid-cols-2">
				{#each parsedOpportunities as opportunity, i}
					{@const OppIcon = opportunityIcon(opportunity.title)}
					{@const accent = opportunityAccent(i)}
					<article
						class="opportunity-card card border-surface-300-700/50 bg-surface-100-900/60 relative overflow-hidden border p-6"
						style="--accent: {accent}"
						in:fade={{ duration: 120, delay: i * 40 }}
					>
						<div class="opp-glow" aria-hidden="true"></div>
						<div class="relative z-10 flex flex-col gap-4">
							<div class="flex items-start gap-4">
								<div
									class="opp-icon-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
								>
									<OppIcon class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<h3 class="!mt-0 !mb-0 !text-left text-lg leading-snug font-bold">
										{opportunity.title}
									</h3>
								</div>
							</div>
							{#if opportunity.summary}
								<p class="text-surface-700-300 !mb-0 text-sm leading-relaxed">
									{opportunity.summary}
								</p>
							{/if}
							{#if opportunity.bullets.length}
								<div>
									<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] uppercase opacity-65">
										What You'll Do
									</p>
									<ul class="m-0 list-disc space-y-1 pl-5 text-sm leading-relaxed opacity-85">
										{#each opportunity.bullets as bullet}
											<li>{bullet}</li>
										{/each}
									</ul>
								</div>
							{/if}
							<div class="mt-auto">
								<a
									href="#interest-form"
									class="opp-cta inline-flex items-center gap-1.5 text-sm font-semibold"
									onclick={() => {
										if (!checkedIds.includes(opportunity.id)) toggleOpportunity(opportunity.id);
									}}
								>
									I'm interested
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center">
				<div class="empty-orb" aria-hidden="true"></div>
				<div class="relative z-10 mx-auto max-w-sm space-y-4">
					<div
						class="empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
					>
						<IconHeart class="h-10 w-10 opacity-60" />
					</div>
					<h3 class="text-2xl font-bold">No roles posted right now</h3>
					<p class="text-sm leading-relaxed opacity-70">
						Check back soon — or reach out at <a href="mailto:hi@3fp.org" class="anchor"
							>hi@3fp.org</a
						> if you're ready to jump in now.
					</p>
				</div>
			</div>
		{/if}
	</section>

	<!-- ═══════════════════════════════════════════════
	     EXPRESS INTEREST FORM
	═══════════════════════════════════════════════ -->
	<section id="interest-form" class="interest-section card relative overflow-hidden p-0">
		<div class="interest-orb" aria-hidden="true"></div>

		<div class="relative z-10 p-6 lg:p-8">
			<div class="mb-6 flex items-start gap-4">
				<div
					class="interest-icon-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
				>
					<IconHandshake class="h-5 w-5" />
				</div>
				<div>
					<div
						class="mb-1 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase opacity-60"
					>
						<IconSparkles class="h-3.5 w-3.5" />
						Express Interest
					</div>
					<h2 class="!mt-0 !mb-1 !text-left text-2xl font-bold">Raise your hand</h2>
					{#if data.user?.id}
						<p class="text-surface-700-300 !mb-0 text-sm">
							Signed in as <strong>{data.user.email || 'you'}</strong>. We prefilled your details so
							you can jump in quickly.
						</p>
					{:else}
						<p class="text-surface-700-300 !mb-0 text-sm">
							Select one or more opportunities and share your contact info. We'll follow up
							directly.
						</p>
					{/if}
				</div>
			</div>

			{#if data.opportunities?.length}
				<form
					method="POST"
					action="?/submitInterest"
					use:enhance={enhanceInterestForm}
					class="space-y-6"
				>
					<input type="hidden" name="turnstileToken" value="" />

					<!-- Opportunity checkboxes -->
					<div>
						<p class="label mb-3 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">
							Opportunities (choose all that fit)
						</p>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each data.opportunities ?? [] as opportunity, i}
								{@const OppIcon = opportunityIcon(opportunity.title)}
								{@const accent = opportunityAccent(i)}
								{@const isChecked = checkedIds.includes(opportunity.id)}
								<label
									for={`opportunity-${opportunity.id}`}
									class="interest-checkbox-label flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all duration-200 {isChecked
										? 'interest-checkbox-label--checked'
										: ''}"
									style="--accent: {accent}"
								>
									<input
										id={`opportunity-${opportunity.id}`}
										name="opportunityIds"
										type="checkbox"
										value={opportunity.id}
										class="checkbox mt-0.5 shrink-0"
										checked={isChecked}
										onchange={() => toggleOpportunity(opportunity.id)}
									/>
									<div
										class="interest-checkbox-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
									>
										<OppIcon class="h-3.5 w-3.5" />
									</div>
									<span class="text-sm leading-tight font-medium">{opportunity.title}</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Contact fields -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label
								class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
								for="fullName">Name</label
							>
							<input
								id="fullName"
								name="fullName"
								type="text"
								required
								class="input preset-tonal-surface w-full"
								value={form?.interestValues?.fullName ?? data.prefill?.fullName ?? ''}
							/>
						</div>
						<div>
							<label
								class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
								for="email">Email</label
							>
							<input
								id="email"
								name="email"
								type="email"
								required
								class="input preset-tonal-surface w-full"
								value={form?.interestValues?.email ?? data.prefill?.email ?? ''}
							/>
						</div>
					</div>

					<div>
						<label
							class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
							for="phone">Phone <span class="normal-case opacity-60">(optional)</span></label
						>
						<input
							id="phone"
							name="phone"
							type="tel"
							class="input preset-tonal-surface w-full"
							value={form?.interestValues?.phone ?? data.prefill?.phone ?? ''}
						/>
					</div>

					<div>
						<label
							class="label mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase opacity-60"
							for="message">Message <span class="normal-case opacity-60">(optional)</span></label
						>
						<textarea
							id="message"
							name="message"
							class="textarea preset-tonal-surface w-full"
							rows="3"
							placeholder="Tell us a bit about yourself, your availability, or anything else..."
							>{form?.interestValues?.message ?? ''}</textarea
						>
					</div>

					{#if turnstileEnabled}
						<p class="text-surface-700-300 text-xs">Protected by Cloudflare Turnstile.</p>
						<div
							aria-hidden="true"
							style="position: absolute; width: 0; height: 0; overflow: hidden;"
						>
							<div bind:this={turnstileEl}></div>
						</div>
					{/if}

					{#if form?.interestError}
						<div class="bg-error-500/10 text-error-300 mb-4 rounded-xl px-4 py-3 text-sm" in:slide>
							{form.interestError}
						</div>
					{/if}
					{#if captchaError}
						<div class="bg-error-500/10 text-error-300 mb-4 rounded-xl px-4 py-3 text-sm" in:slide>
							{captchaError}
						</div>
					{/if}
					{#if form?.interestSuccess}
						<div
							class="bg-success-500/10 text-success-300 mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
							in:slide
						>
							<IconCheckCircle class="h-4 w-4 shrink-0" />
							{form.interestSuccess}
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-3">
						<button type="submit" class="btn preset-filled-primary-500 gap-2">
							<IconHandshake class="h-4 w-4" />
							Send Interest
						</button>
						<p class="text-surface-700-300 text-xs">We typically respond within a few days.</p>
					</div>
				</form>
			{:else}
				<div class="bg-surface-200-800/50 space-y-2 rounded-xl px-5 py-6 text-center">
					<p class="text-surface-700-300 text-sm">
						There are no active opportunities posted right now, but we'd still love to hear from
						you.
					</p>
					<a href="mailto:hi@3fp.org" class="btn btn-sm preset-outlined-primary-500 gap-1.5">
						<IconMail class="h-3.5 w-3.5" />
						Email us at hi@3fp.org
					</a>
				</div>
			{/if}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     ADMIN: POST OPPORTUNITY
	═══════════════════════════════════════════════ -->
	{#if data.isAdmin}
		<section class="card border-surface-300-700/50 bg-surface-100-900/60 space-y-4 border p-6">
			<div class="flex items-center gap-3">
				<div class="bg-success-500/15 flex h-9 w-9 items-center justify-center rounded-xl">
					<IconPlus class="text-success-400-600 h-4 w-4" />
				</div>
				<div>
					<p class="label text-xs tracking-widest uppercase opacity-60">Admin</p>
					<h2 class="!mt-0 !mb-0 !text-left text-xl font-bold">Post Opportunity</h2>
				</div>
			</div>

			{#if form?.createOpportunityError}
				<div class="bg-error-500/10 text-error-300 rounded-xl px-3 py-2 text-sm">
					{form.createOpportunityError}
				</div>
			{/if}
			{#if form?.createOpportunitySuccess}
				<div class="bg-success-500/10 text-success-300 rounded-xl px-3 py-2 text-sm">
					{form.createOpportunitySuccess}
				</div>
			{/if}

			<form method="POST" action="?/createOpportunity" class="space-y-4">
				<div>
					<label class="label mb-1.5" for="title">Title</label>
					<input
						id="title"
						name="title"
						type="text"
						required
						class="input preset-tonal-surface w-full"
						value={form?.createValues?.title ?? ''}
					/>
				</div>
				<div>
					<label class="label mb-1.5" for="description">Description (optional)</label>
					<textarea
						id="description"
						name="description"
						rows="3"
						class="textarea preset-tonal-surface w-full"
						>{form?.createValues?.description ?? ''}</textarea
					>
				</div>
				<button type="submit" class="btn preset-filled-success-500">Post Opportunity</button>
			</form>
		</section>
	{/if}
</div>

<style>
	/* ── Hero ── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.hero-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}

	.hero-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}

	.hero-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}

	@keyframes orb-drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		100% {
			transform: translate(4%, 6%) scale(1.08);
		}
	}

	/* ── Headline ── */
	.gi-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.gi-headline-accent {
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
		opacity: 0.06;
		pointer-events: none;
	}

	/* ── Contact panel ── */
	.contact-panel {
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.contact-link {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: inherit;
		text-decoration: none;
		transition:
			background 180ms,
			border-color 180ms,
			transform 150ms;
	}

	.contact-link:hover {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-500) 10%);
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		transform: translateX(2px);
	}

	.contact-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: color-mix(in oklab, var(--color-primary-500) 18%, var(--color-surface-800) 82%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
		flex-shrink: 0;
	}

	/* ── Opportunity cards ── */
	.opportunity-card {
		transition:
			transform 220ms ease,
			box-shadow 220ms ease,
			border-color 220ms ease;
		animation: card-in 380ms ease both;
	}

	.opportunity-card:hover {
		transform: translateY(-3px);
		box-shadow: 0 12px 32px -6px
			color-mix(in oklab, var(--accent, var(--color-primary-500)) 30%, transparent);
		border-color: color-mix(
			in oklab,
			var(--accent, var(--color-primary-500)) 45%,
			transparent
		) !important;
	}

	.opp-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 60% at 5% 10%,
			color-mix(in oklab, var(--accent, var(--color-primary-500)) 12%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.opp-icon-ring {
		background: color-mix(
			in oklab,
			var(--accent, var(--color-primary-500)) 18%,
			var(--color-surface-800) 82%
		);
		border: 1px solid color-mix(in oklab, var(--accent, var(--color-primary-500)) 32%, transparent);
		color: color-mix(in oklab, var(--accent, var(--color-primary-400)) 90%, white 10%);
	}

	.opp-cta {
		color: color-mix(in oklab, var(--accent, var(--color-primary-400)) 100%, transparent);
		transition: gap 150ms;
		text-decoration: none;
	}

	.opp-cta:hover {
		gap: 0.5rem;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Interest form section ── */
	.interest-section {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-100) 92%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	:global(.dark) .interest-section {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950) 92%);
	}

	.interest-orb {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 70% 60% at 95% 10%,
			color-mix(in oklab, var(--color-secondary-500) 14%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.interest-icon-ring {
		background: color-mix(in oklab, var(--color-primary-500) 18%, var(--color-surface-800) 82%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 32%, transparent);
		color: color-mix(in oklab, var(--color-primary-400) 90%, white 10%);
	}

	/* ── Interest checkboxes ── */
	.interest-checkbox-label {
		border-color: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 5%, transparent);
	}

	.interest-checkbox-label:hover {
		border-color: color-mix(in oklab, var(--accent, var(--color-primary-500)) 40%, transparent);
		background: color-mix(in oklab, var(--accent, var(--color-primary-500)) 8%, transparent);
	}

	.interest-checkbox-label--checked {
		border-color: color-mix(
			in oklab,
			var(--accent, var(--color-primary-500)) 55%,
			transparent
		) !important;
		background: color-mix(
			in oklab,
			var(--accent, var(--color-primary-500)) 10%,
			transparent
		) !important;
	}

	.interest-checkbox-icon {
		background: color-mix(
			in oklab,
			var(--accent, var(--color-primary-500)) 15%,
			var(--color-surface-800) 85%
		);
		border: 1px solid color-mix(in oklab, var(--accent, var(--color-primary-500)) 25%, transparent);
		color: color-mix(in oklab, var(--accent, var(--color-primary-400)) 80%, white 20%);
	}

	/* ── Empty state ── */
	.empty-orb {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 50% 60%,
			color-mix(in oklab, var(--color-primary-500) 12%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.empty-icon-ring {
		background: color-mix(in oklab, var(--color-primary-500) 15%, var(--color-surface-800) 85%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}
</style>
