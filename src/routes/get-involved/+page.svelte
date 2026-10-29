<script>
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import IconHandshake from '@lucide/svelte/icons/handshake';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMegaphone from '@lucide/svelte/icons/megaphone';
	import IconBriefcase from '@lucide/svelte/icons/briefcase';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconShare2 from '@lucide/svelte/icons/share-2';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle-2';
	import { slide } from 'svelte/transition';

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
	let checkedIds = $derived([...selectedOpportunityIds]);

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
</script>

<svelte:head>
	<title>Get Involved | 3 Feet Please</title>
	<meta
		name="description"
		content="Help build safer streets and stronger cycling culture. Choose where you want to contribute to 3 Feet Please."
	/>
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
		aria-labelledby="get-involved-heading"
	>
		<!-- Left: headline + copy + stats -->
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<div class="flex flex-col gap-3">
				<div
					class="flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span
						class="bg-primary-500 text-surface-950 inline-flex items-center gap-1.5 px-2.5 py-1"
					>
						<IconHeart class="h-3.5 w-3.5" />
						Get Involved
					</span>
					<span class="bg-secondary-500 text-surface-50 px-2.5 py-1">Community</span>
					<span class="bg-tertiary-500 text-surface-950 px-2.5 py-1">Local Impact</span>
				</div>

				<h1
					id="get-involved-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Make streets safer. <span class="text-primary-500">Show up for cyclists.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium text-balance">
					3 Feet Please runs on people who care. Whether you want to lead, advocate, or amplify —
					there's a place for you here. Tell us where you want to help and we'll connect you with
					the right next step.
				</p>
			</div>

			<!-- Stat strip -->
			<div class="border-surface-800 flex flex-wrap items-center gap-8 border-t pt-5">
				<div>
					<div
						class="text-surface-400 flex items-center gap-1.5 text-[0.65rem] font-bold tracking-[0.2em] uppercase"
					>
						<IconBriefcase class="text-primary-500 h-3.5 w-3.5 shrink-0" />
						<span>Open Roles</span>
					</div>
					<div
						class="text-primary-500 mt-1 text-2xl leading-none font-black italic tabular-nums sm:text-3xl"
					>
						{data.opportunities?.length || 0}
					</div>
				</div>
				<div>
					<div
						class="text-surface-400 flex items-center gap-1.5 text-[0.65rem] font-bold tracking-[0.2em] uppercase"
					>
						<IconBike class="text-tertiary-500 h-3.5 w-3.5 shrink-0" />
						<span>Years Strong</span>
					</div>
					<div
						class="text-surface-50 mt-1 text-2xl leading-none font-black italic tabular-nums sm:text-3xl"
					>
						10+
					</div>
				</div>
				<div>
					<div
						class="text-surface-400 flex items-center gap-1.5 text-[0.65rem] font-bold tracking-[0.2em] uppercase"
					>
						<IconUsers class="text-primary-500 h-3.5 w-3.5 shrink-0" />
						<span>Advocates</span>
					</div>
					<div
						class="text-tertiary-500 mt-1 text-2xl leading-none font-black italic tabular-nums sm:text-3xl"
					>
						100+
					</div>
				</div>
			</div>
		</div>

		<!-- Right: contact + social block -->
		<div
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-secondary-500 flex flex-col justify-between gap-5 border-t-4 px-6 py-7 sm:px-10 lg:border-l-2 lg:px-10 lg:py-8"
		>
			<div class="flex flex-col gap-1.5">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconSparkles class="h-3.5 w-3.5" />
					Reach out
				</p>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-3xl">
					Connect with us
				</h2>
			</div>

			<div class="border-surface-800 flex flex-col border-t-2">
				<a
					href="mailto:hi@3fp.org"
					class="group border-surface-800 hover:bg-surface-950 flex items-center justify-between gap-3 border-b py-3 text-sm font-bold transition hover:px-2 hover:no-underline"
				>
					<span class="group-hover:text-primary-500 flex items-center gap-3">
						<IconMail class="text-primary-500 h-4 w-4 shrink-0" />
						<span>hi@3fp.org</span>
					</span>
					<IconArrowUpRight class="text-primary-500 h-4 w-4 shrink-0" />
				</a>
				<a
					href="https://www.facebook.com/3FeetPlease/"
					target="_blank"
					rel="noopener noreferrer"
					class="group border-surface-800 hover:bg-surface-950 flex items-center justify-between gap-3 border-b py-3 text-sm font-bold transition hover:px-2 hover:no-underline"
				>
					<span class="group-hover:text-primary-500 flex items-center gap-3">
						<IconShare2 class="text-secondary-400 h-4 w-4 shrink-0" />
						<span>Facebook</span>
					</span>
					<IconArrowUpRight class="text-primary-500 h-4 w-4 shrink-0" />
				</a>
				<a
					href="https://www.instagram.com/3feetplease"
					target="_blank"
					rel="noopener noreferrer"
					class="group border-surface-800 hover:bg-surface-950 flex items-center justify-between gap-3 border-b py-3 text-sm font-bold transition hover:px-2 hover:no-underline"
				>
					<span class="group-hover:text-primary-500 flex items-center gap-3">
						<IconMegaphone class="text-tertiary-500 h-4 w-4 shrink-0" />
						<span>Instagram</span>
					</span>
					<IconArrowUpRight class="text-primary-500 h-4 w-4 shrink-0" />
				</a>
				<div class="text-surface-300 flex items-start gap-3 py-3 text-xs font-medium">
					<IconMapPin class="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
					<span>2628 W Birchwood Cir, STE C<br />Mesa, AZ 85202</span>
				</div>
			</div>

			<a
				href="#interest-form"
				class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
			>
				Raise your hand
				<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
			</a>
		</div>
	</section>

	<!-- CURRENT OPPORTUNITIES -->
	<section
		class="bg-surface-950 text-surface-50 px-6 py-10 sm:px-10 lg:px-12 lg:py-12"
		aria-labelledby="opportunities-heading"
	>
		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Where we need hands
				</p>
				<h2
					id="opportunities-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
				>
					Current opportunities
				</h2>
			</div>
			<a
				href="#interest-form"
				class="group border-primary-500 text-surface-50 hover:text-primary-500 inline-flex items-center gap-2 border-b-[3px] pb-1 font-black uppercase hover:no-underline"
			>
				Apply now <IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
			</a>
		</div>

		<!-- lane divider -->
		<div
			class="my-10 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)] lg:my-14"
			aria-hidden="true"
		></div>

		{#if parsedOpportunities.length}
			<div class="border-surface-50 grid border-t-2 lg:grid-cols-2">
				{#each parsedOpportunities as opportunity, i (opportunity.id)}
					{@const OppIcon = opportunityIcon(opportunity.title)}
					<article
						class="border-surface-800 flex flex-col justify-between gap-6 border-b py-8 lg:odd:border-r lg:odd:pr-12 lg:even:pl-12"
					>
						<div class="flex flex-col gap-5">
							<div class="flex items-start gap-4">
								<span
									class="text-tertiary-500 w-12 shrink-0 text-4xl leading-none font-black italic tabular-nums"
								>
									{String(i + 1).padStart(2, '0')}
								</span>
								<span
									class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
								>
									<OppIcon class="h-6 w-6" />
								</span>
								<h3 class="text-surface-50! m-0 flex-1 text-2xl leading-tight font-black uppercase">
									{opportunity.title}
								</h3>
							</div>

							{#if opportunity.summary}
								<p class="text-surface-300 m-0 text-base leading-relaxed">
									{opportunity.summary}
								</p>
							{/if}

							{#if opportunity.bullets.length}
								<div class="flex flex-col gap-2">
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.2em] uppercase">
										What You'll Do
									</p>
									<ul
										class="text-surface-300 m-0 list-disc space-y-1.5 pl-5 text-sm leading-relaxed"
									>
										{#each opportunity.bullets as bullet (bullet)}
											<li>{bullet}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>

						<div class="pt-2">
							<a
								href="#interest-form"
								class="group bg-surface-900 text-primary-500 border-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-5 py-2.5 text-sm font-black uppercase transition hover:no-underline"
								onclick={() => {
									if (!checkedIds.includes(opportunity.id)) toggleOpportunity(opportunity.id);
								}}
							>
								I'm interested
								<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
							</a>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="border-surface-50 flex flex-col gap-4 border-t-2 pt-8">
				<span
					class="bg-tertiary-500 text-surface-950 flex h-14 w-14 items-center justify-center"
					aria-hidden="true"
				>
					<IconHeart class="h-7 w-7" />
				</span>
				<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
					No roles posted right now
				</h3>
				<p class="text-surface-300 m-0 max-w-md text-lg leading-relaxed">
					Check back soon — or reach out at
					<a href="mailto:hi@3fp.org" class="text-primary-500 font-bold underline">hi@3fp.org</a>
					if you're ready to jump in now.
				</p>
			</div>
		{/if}
	</section>

	<!-- EXPRESS INTEREST FORM -->
	<section
		id="interest-form"
		class="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
		aria-labelledby="interest-heading"
	>
		<!-- Left: Magenta poster header -->
		<div
			class="bg-tertiary-500 text-surface-950 flex flex-col justify-between gap-10 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		>
			<div class="flex flex-col gap-5">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<IconHandshake class="h-4 w-4" />
					Express Interest
				</p>
				<h2
					id="interest-heading"
					class="text-surface-950! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Raise your hand
				</h2>
				{#if data.user?.id}
					<p class="m-0 text-lg leading-snug font-medium">
						Signed in as <strong>{data.user.email || 'you'}</strong>. We prefilled your details so
						you can jump in quickly.
					</p>
				{:else}
					<p class="m-0 text-lg leading-snug font-medium">
						Select one or more opportunities and share your contact info. We'll follow up directly.
					</p>
				{/if}
			</div>

			<p
				class="m-0 text-[clamp(5.5rem,14vw,10rem)] leading-[0.78] font-black tracking-[-0.06em] italic"
				aria-hidden="true"
			>
				3<span class="text-transparent [-webkit-text-stroke:3px_var(--color-surface-950)]">FT</span>
			</p>
		</div>

		<!-- Right: Form on asphalt -->
		<div
			class="bg-surface-950 text-surface-50 border-surface-800 border-t-2 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		>
			{#if data.opportunities?.length}
				<form
					method="POST"
					action="?/submitInterest"
					use:enhance={enhanceInterestForm}
					class="flex flex-col gap-6"
				>
					<input type="hidden" name="turnstileToken" value="" />

					<!-- Opportunity checkboxes -->
					<div class="flex flex-col gap-3">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Opportunities (choose all that fit)
						</p>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each data.opportunities ?? [] as opportunity (opportunity.id)}
								{@const OppIcon = opportunityIcon(opportunity.title)}
								{@const isChecked = checkedIds.includes(opportunity.id)}
								<label
									for={`opportunity-${opportunity.id}`}
									class="flex cursor-pointer items-center gap-3 border-2 p-4 transition {isChecked
										? 'border-primary-500 bg-primary-500 text-surface-950'
										: 'border-surface-700 bg-surface-900 text-surface-50 hover:border-primary-500'}"
								>
									<input
										id={`opportunity-${opportunity.id}`}
										name="opportunityIds"
										type="checkbox"
										value={opportunity.id}
										class="checkbox shrink-0"
										checked={isChecked}
										onchange={() => toggleOpportunity(opportunity.id)}
									/>
									<OppIcon class="h-4 w-4 shrink-0" />
									<span class="text-sm leading-tight font-black uppercase">
										{opportunity.title}
									</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Contact fields -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
								for="fullName"
							>
								Name
							</label>
							<input
								id="fullName"
								name="fullName"
								type="text"
								required
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
								value={form?.interestValues?.fullName ?? data.prefill?.fullName ?? ''}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
								for="email"
							>
								Email
							</label>
							<input
								id="email"
								name="email"
								type="email"
								required
								class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
								value={form?.interestValues?.email ?? data.prefill?.email ?? ''}
							/>
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<label
							class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
							for="phone"
						>
							Phone <span class="text-surface-300 normal-case">(optional)</span>
						</label>
						<input
							id="phone"
							name="phone"
							type="tel"
							class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
							value={form?.interestValues?.phone ?? data.prefill?.phone ?? ''}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<label
							class="text-surface-50 text-xs font-bold tracking-[0.16em] uppercase"
							for="message"
						>
							Message <span class="text-surface-300 normal-case">(optional)</span>
						</label>
						<textarea
							id="message"
							name="message"
							class="border-surface-700 bg-surface-900 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
							rows="3"
							placeholder="Tell us a bit about yourself, your availability, or anything else..."
							>{form?.interestValues?.message ?? ''}</textarea
						>
					</div>

					{#if turnstileEnabled}
						<p class="text-surface-300 m-0 text-xs">Protected by Cloudflare Turnstile.</p>
						<div
							aria-hidden="true"
							style="position: absolute; width: 0; height: 0; overflow: hidden;"
						>
							<div bind:this={turnstileEl}></div>
						</div>
					{/if}

					{#if form?.interestError}
						<div
							class="border-tertiary-500 bg-surface-900 text-surface-50 border-l-4 px-4 py-3 text-sm font-bold"
							in:slide
						>
							{form.interestError}
						</div>
					{/if}
					{#if captchaError}
						<div
							class="border-tertiary-500 bg-surface-900 text-surface-50 border-l-4 px-4 py-3 text-sm font-bold"
							in:slide
						>
							{captchaError}
						</div>
					{/if}
					{#if form?.interestSuccess}
						<div
							class="border-primary-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 px-4 py-3 text-sm font-bold"
							in:slide
						>
							<IconCheckCircle class="text-primary-500 h-4 w-4 shrink-0" />
							{form.interestSuccess}
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-4 pt-2">
						<button
							type="submit"
							class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 hover:text-surface-950 inline-flex items-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition"
						>
							<IconHandshake class="h-5 w-5" />
							Send Interest
						</button>
						<p class="text-surface-300 m-0 text-xs">We typically respond within a few days.</p>
					</div>
				</form>
			{:else}
				<div class="border-surface-800 flex flex-col items-start gap-4 border-2 p-6">
					<p class="text-surface-300 m-0 text-base">
						There are no active opportunities posted right now, but we'd still love to hear from
						you.
					</p>
					<a
						href="mailto:hi@3fp.org"
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black uppercase hover:no-underline"
					>
						<IconMail class="h-4 w-4" />
						Email us at hi@3fp.org
					</a>
				</div>
			{/if}
		</div>
	</section>

	<!-- ADMIN: POST OPPORTUNITY -->
	{#if data.isAdmin}
		<section
			class="bg-secondary-500 text-surface-50 border-surface-950 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14"
			aria-labelledby="admin-post-opportunity-heading"
		>
			<div class="mx-auto flex max-w-3xl flex-col gap-6">
				<div class="flex items-center gap-4">
					<span
						class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconPlus class="h-6 w-6" />
					</span>
					<div>
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Admin</p>
						<h2
							id="admin-post-opportunity-heading"
							class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-3xl"
						>
							Post Opportunity
						</h2>
					</div>
				</div>

				{#if form?.createOpportunityError}
					<div class="bg-tertiary-500 text-surface-950 px-4 py-3 text-sm font-bold">
						{form.createOpportunityError}
					</div>
				{/if}
				{#if form?.createOpportunitySuccess}
					<div class="bg-primary-500 text-surface-950 px-4 py-3 text-sm font-bold">
						{form.createOpportunitySuccess}
					</div>
				{/if}

				<form method="POST" action="?/createOpportunity" class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<label class="text-xs font-bold tracking-[0.16em] uppercase" for="title">Title</label>
						<input
							id="title"
							name="title"
							type="text"
							required
							class="border-surface-50 bg-surface-950 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
							value={form?.createValues?.title ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-xs font-bold tracking-[0.16em] uppercase" for="description">
							Description (optional)
						</label>
						<textarea
							id="description"
							name="description"
							rows="3"
							class="border-surface-50 bg-surface-950 text-surface-50 focus:border-primary-500 w-full border-2 px-4 py-3 text-base focus:outline-none"
							>{form?.createValues?.description ?? ''}</textarea
						>
					</div>
					<div>
						<button
							type="submit"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 px-7 py-4 text-base font-black tracking-wide uppercase transition"
						>
							Post Opportunity
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}
</div>
