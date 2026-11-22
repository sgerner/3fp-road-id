<script>
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import IconUserCircle2 from '@lucide/svelte/icons/user-circle-2';
	import { normalizePhoneNumber, formatPhoneNumber } from '#lib/utils/phone';
	import { isValidRoadIdEmail, normalizeRoadIdProfile } from '#lib/utils/roadId';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';

	let { data } = $props();
	const code = $derived(data?.code ?? '');
	const notFound = $derived(Boolean(data?.notFound));
	const user = $derived(data?.user ?? null);
	const profile = $derived(
		data?.qrData?.profile ? normalizeRoadIdProfile(data.qrData.profile, user) : null
	);
	const isClaimed = $derived(Boolean(profile?.claimed));
	const isOwner = $derived(Boolean(profile?.is_owner));

	// Control which tab is active. 'profile' is default.
	let group = $state('profile');

	// For a new profile claim via magic link (signed-out) or direct claim (signed-in)
	let newProfile = $state({ email: '' });
	let loading = $state(false);
	let claimingAuthenticated = $state(false);
	let emailTouched = $state(false);
	let errorMessage = $state('');
	let submissionSuccess = $state(false);
	let honeypot = $state('');
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);

	// Email validation
	let emailIsValid = $derived(isValidRoadIdEmail(newProfile.email));

	const medicationList = $derived.by(() => {
		if (!profile?.medication) return '';
		return profile.medication
			.split(',')
			.map((entry) => {
				const trimmed = entry.trim();
				return trimmed.toLowerCase() === 'asprin' ? 'Aspirin' : trimmed;
			})
			.filter(Boolean)
			.join(', ');
	});

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

	$effect(() => {
		if (turnstileEnabled && turnstileEl && !turnstileWidgetId) {
			initTurnstile();
		}
	});

	// Claim unclaimed bracelet via magic link when signed out
	const handleSubmit = async (event) => {
		event.preventDefault();
		loading = true;
		emailTouched = true;
		if (!emailIsValid) {
			errorMessage = 'Please enter a valid email address';
			loading = false;
			return;
		}
		if (honeypot.trim()) {
			errorMessage = 'Invalid submission.';
			loading = false;
			return;
		}
		errorMessage = '';

		let turnstileToken = '';
		if (turnstileEnabled) {
			await initTurnstile();
			if (!turnstileWidgetId) {
				errorMessage = 'Verification failed. Please reload and try again.';
				loading = false;
				return;
			}
			turnstileToken = await executeTurnstile(turnstileWidgetId);
			if (!turnstileToken) {
				errorMessage = 'Verification failed. Please try again.';
				loading = false;
				return;
			}
		}

		const payload = {
			code,
			email: newProfile.email.trim(),
			createProfile: true,
			returnTo: `/profile?claimed=${encodeURIComponent(code)}#safety`,
			honeypot,
			turnstileToken
		};

		const res = await fetch('/api/v1/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.ok) {
			submissionSuccess = true;
			honeypot = '';
		} else {
			const err = await res.json().catch(() => ({}));
			errorMessage = err.error || 'An error occurred';
		}
		loading = false;
		if (turnstileEnabled && turnstileWidgetId) {
			resetTurnstile(turnstileWidgetId);
		}
	};

	// Claim unclaimed bracelet immediately when already signed in
	const handleAuthenticatedClaim = async () => {
		if (claimingAuthenticated || !code) return;
		claimingAuthenticated = true;
		errorMessage = '';
		try {
			const res = await fetch(`/api/v1/code/${encodeURIComponent(code)}/claim`, {
				method: 'POST'
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Unable to claim bracelet.');
			}
			await goto(payload?.redirectTo || `/profile?claimed=${encodeURIComponent(code)}#safety`);
		} catch (err) {
			errorMessage = err?.message || 'Unable to claim bracelet.';
		} finally {
			claimingAuthenticated = false;
		}
	};
</script>

<svelte:head>
	<title>Road ID · {code} · 3 Feet Please</title>
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-x-clip"
>
	<div aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;">
		<div bind:this={turnstileEl}></div>
	</div>

	<!-- HERO -->
	<header
		class="bg-tertiary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby="roadid-heading"
	>
		<div
			class="flex flex-col justify-between gap-6 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<div class="flex flex-wrap items-center gap-3">
				<span class="bg-surface-950 h-3 w-3" aria-hidden="true"></span>
				<span class="text-xs font-bold tracking-[0.22em] uppercase">
					In Case Bracelet · Emergency ID
				</span>
				{#if code}
					<span
						class="bg-surface-950 text-primary-500 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
					>
						Code: {code}
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-4">
				<h1
					id="roadid-heading"
					class="text-surface-950! m-0 text-[clamp(2.8rem,6.6vw,6rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
				>
					Every rider is
					<span class="text-transparent [-webkit-text-stroke:3px_var(--color-surface-950)]"
						>someone.</span
					>
				</h1>
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-xl">
					Emergency medical details, crash response checklist, and everyday road safety habits.
				</p>
			</div>
		</div>

		<div
			class="bg-primary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</header>

	<!-- Skeleton UI Tabs -->
	<Tabs value={group} onValueChange={(e) => (group = e.value)}>
		<div
			class="bg-secondary-500 text-surface-50 border-surface-950 border-y-[3px] px-3 py-2 sm:px-10 sm:py-3 lg:px-14"
		>
			<Tabs.List class="flex flex-wrap gap-1 border-0 sm:gap-3">
				<Tabs.Trigger
					value="profile"
					class="inline-flex min-h-11 items-center justify-center px-2 text-[0.7rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
					'profile'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Profile
				</Tabs.Trigger>
				<Tabs.Trigger
					value="crash"
					class="inline-flex min-h-11 items-center justify-center px-2 text-[0.7rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
					'crash'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Crash Response
				</Tabs.Trigger>
				<Tabs.Trigger
					value="alert"
					class="inline-flex min-h-11 items-center justify-center px-2 text-[0.7rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
					'alert'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Safety Tips
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<Tabs.Content value="profile">
			<div class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
				{#if notFound}
					<section class="flex max-w-2xl flex-col gap-6">
						<span
							class="text-tertiary-500 text-6xl leading-none font-black italic tabular-nums sm:text-7xl"
							aria-hidden="true"
						>
							404
						</span>
						<h2
							class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
						>
							Code Not Found
						</h2>
						<p class="text-surface-200 m-0 text-lg leading-relaxed">
							We haven't created an In Case bracelet for the code
							<strong class="text-primary-500 font-black">{code}</strong> yet.
						</p>
						<p class="text-surface-300 m-0 text-base leading-relaxed">
							For details about In Case bracelets, see
							<a href="/roadid" class="text-primary-500 font-bold underline"
								>the bracelet information page</a
							>.
						</p>
					</section>
				{:else if !isClaimed}
					<!-- Unclaimed bracelet activation -->
					<section class="flex max-w-xl flex-col gap-6">
						{#if user}
							<div class="flex flex-col gap-3">
								<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
									Activate Bracelet
								</p>
								<h2
									class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
								>
									Link Bracelet to Your Profile
								</h2>
								<p class="text-surface-300 m-0 text-base leading-relaxed">
									This In Case bracelet (<strong class="text-surface-50">{code}</strong>) hasn’t
									been claimed yet. Claiming it attaches your saved medical notes and emergency
									contacts to this QR code and opens your profile safety workspace.
								</p>
							</div>
							{#if errorMessage}
								<p
									class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
									role="alert"
								>
									{errorMessage}
								</p>
							{/if}
							<div class="border-surface-50 flex flex-wrap items-center gap-4 border-t-2 pt-6">
								<button
									type="button"
									class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center px-8 py-4 text-base font-black tracking-wide uppercase transition"
									onclick={handleAuthenticatedClaim}
									disabled={claimingAuthenticated}
								>
									{claimingAuthenticated ? 'Claiming…' : 'Claim This Bracelet'}
								</button>
								{#if user.email}
									<span class="text-surface-300 text-xs">
										Signed in as <strong class="text-surface-50">{user.email}</strong>
									</span>
								{/if}
							</div>
						{:else if submissionSuccess}
							<div class="bg-primary-500 text-surface-950 flex flex-col gap-3 p-8" transition:slide>
								<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Magic Link Sent</p>
								<h2 class="text-surface-950! m-0 text-3xl font-black uppercase italic">
									Check Your Email
								</h2>
								<p class="m-0 text-base font-medium">
									A link has been sent to <strong>{newProfile.email}</strong>.
								</p>
								<p class="m-0 text-sm">
									Click the link in your email to confirm sign-in, claim bracelet
									<strong>{code}</strong>, and open your profile safety settings.
								</p>
							</div>
						{:else}
							<div class="flex flex-col gap-2">
								<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
									Activate Bracelet
								</p>
								<h2
									class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
								>
									Claim Your Profile
								</h2>
								<p class="text-surface-300 m-0 text-base leading-relaxed">
									This bracelet hasn’t been claimed yet. Enter your email to claim it with a magic
									link and open your unified safety profile.
								</p>
							</div>
							<form
								class="border-surface-50 flex w-full flex-col gap-5 border-t-2 pt-6"
								onsubmit={handleSubmit}
							>
								<input
									type="text"
									name="website"
									bind:value={honeypot}
									autocomplete="off"
									tabindex="-1"
									aria-hidden="true"
									style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
								/>
								<div class="flex flex-col gap-2">
									<label
										for="email"
										class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Email
									</label>
									<input
										type="email"
										id="email"
										bind:value={newProfile.email}
										placeholder="jane@example.com"
										class="input bg-surface-900 text-surface-50 min-h-11 {emailTouched &&
										!emailIsValid
											? 'border-tertiary-500'
											: emailTouched && emailIsValid
												? 'border-primary-500'
												: 'border-surface-500'}"
										required
										aria-invalid={emailTouched && !emailIsValid}
										aria-describedby={emailTouched && !emailIsValid
											? 'email-validation-error'
											: undefined}
										oninput={() => (emailTouched = true)}
									/>
									<p
										id="email-validation-error"
										class="text-tertiary-500 m-0 text-xs font-bold uppercase"
										aria-live="polite"
										transition:slide
									>
										{#if emailTouched && !emailIsValid}Please enter a valid email address.{/if}
									</p>
								</div>
								{#if errorMessage}
									<p
										class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
										role="alert"
										transition:slide
									>
										{errorMessage}
									</p>
								{/if}
								<button
									type="submit"
									class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center self-start px-8 py-4 text-base font-black tracking-wide uppercase transition {loading
										? 'motion-safe:animate-pulse'
										: ''}"
									disabled={loading}
								>
									Claim This Bracelet
								</button>
							</form>
						{/if}
					</section>
				{:else}
					<!-- Claimed bracelet: Clean read-only responder view for everyone -->
					<div class="flex flex-col gap-10">
						{#if isOwner}
							<div
								class="bg-surface-900 border-t-primary-500 flex flex-wrap items-center justify-between gap-4 border-t-4 p-6"
							>
								<div class="min-w-0 flex-1">
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Owner Preview · Bracelet {code}
									</p>
									<p class="text-surface-200 m-0 mt-1 text-sm leading-relaxed">
										First responders see this read-only summary when scanning your bracelet. Update
										your name, medical notes, or emergency contacts in your profile.
									</p>
								</div>
								<a
									href="/profile#safety"
									class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 shrink-0 items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
								>
									<IconUserCircle2 class="h-4 w-4" />
									Edit in Profile
								</a>
							</div>
						{/if}

						<section class="grid gap-12 lg:grid-cols-2">
							<div class="flex min-w-0 flex-col gap-6">
								<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Information
								</h2>
								<div class="border-surface-50 divide-surface-800 flex flex-col divide-y border-t-2">
									<div class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4">
										<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
											Name
										</span>
										<strong class="min-w-0 text-right text-lg font-black break-words">
											{profile?.full_name || 'Not listed'}
										</strong>
									</div>
									{#if profile?.phone}
										{@const profilePhone = normalizePhoneNumber(profile.phone)}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Phone
											</span>
											{#if profilePhone}
												<a
													href={`tel:${profilePhone}`}
													class="text-primary-500 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-lg font-black whitespace-nowrap underline"
												>
													{formatPhoneNumber(profile.phone)}
												</a>
											{:else}
												<span class="text-lg font-black">{profile.phone}</span>
											{/if}
										</div>
									{/if}
									{#if profile?.blood_type}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Blood Type
											</span>
											<strong
												class="bg-tertiary-500 text-surface-950 px-3 py-1 text-base font-black"
											>
												{profile.blood_type}
											</strong>
										</div>
									{/if}
									{#if profile?.allergies}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Allergies
											</span>
											<strong class="max-w-[70%] min-w-0 text-right font-bold break-words">
												{profile.allergies}
											</strong>
										</div>
									{/if}
									{#if medicationList}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Medication
											</span>
											<strong class="max-w-[70%] min-w-0 text-right font-bold break-words">
												{medicationList}
											</strong>
										</div>
									{/if}
								</div>
							</div>

							<div class="flex min-w-0 flex-col gap-6">
								<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Contacts
								</h2>
								<div class="border-surface-50 border-t-2 pt-4">
									{#if profile?.emergency_contacts && profile.emergency_contacts.length}
										<ul class="divide-surface-800 m-0 list-none divide-y p-0">
											{#each profile.emergency_contacts as contact, idx (contact.id ?? idx)}
												{@const contactPhone = normalizePhoneNumber(contact.contact_phone)}
												<li
													class="flex flex-wrap items-start justify-between gap-2 py-2 sm:items-center sm:py-4"
												>
													<span class="min-w-0">
														<strong class="font-black uppercase">{contact.contact_name}</strong>
														{#if contact.contact_relationship?.trim()}
															<span class="text-surface-300 text-sm">
																({contact.contact_relationship.trim()})
															</span>
														{/if}
													</span>
													{#if contactPhone}
														<a
															href={`tel:${contactPhone}`}
															class="text-primary-500 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center font-black whitespace-nowrap underline"
														>
															{formatPhoneNumber(contact.contact_phone)}
														</a>
													{:else if contact.contact_phone}
														<span class="font-black">{contact.contact_phone}</span>
													{/if}
												</li>
											{/each}
										</ul>
									{:else}
										<p class="text-surface-300 m-0">No emergency contacts provided.</p>
									{/if}
								</div>
							</div>
						</section>

						{#if !user}
							<section class="border-surface-800 flex flex-wrap items-center gap-4 border-t-2 pt-8">
								<button
									type="button"
									class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center border-2 px-6 py-3 text-sm font-black uppercase transition"
									onclick={(event) => {
										event.stopPropagation();
										window.dispatchEvent(
											new CustomEvent('open-login', {
												detail: {
													returnTo: '/profile#safety',
													message:
														'Sign in to manage your safety details and emergency contacts in your profile.'
												}
											})
										);
									}}
								>
									Bracelet owner? Sign in to edit in Profile
								</button>
							</section>
						{/if}
					</div>
				{/if}
			</div>
		</Tabs.Content>
		<Tabs.Content value="crash">
			<div class="bg-surface-950 px-6 py-7 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
				<CrashResponse />
			</div>
		</Tabs.Content>
		<Tabs.Content value="alert">
			<div class="bg-surface-950 px-6 py-7 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
				<AlertSystem />
			</div>
		</Tabs.Content>
	</Tabs>
</div>
