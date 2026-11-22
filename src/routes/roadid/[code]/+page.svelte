<script>
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { isValidRoadIdEmail, normalizeRoadIdProfile } from '#lib/utils/roadId';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import RoadIdResponderCard from '#lib/components/RoadIdResponderCard.svelte';
	import TurnstileVerification from '#lib/components/security/TurnstileVerification.svelte';

	let { data } = $props();
	const code = $derived(data?.code ?? '');
	const notFound = $derived(Boolean(data?.notFound));
	const user = $derived(data?.user ?? null);
	const profile = $derived(
		data?.qrData?.profile ? normalizeRoadIdProfile(data.qrData.profile, user) : null
	);
	const isClaimed = $derived(Boolean(profile?.claimed));
	const isOwner = $derived(Boolean(profile?.is_owner));

	let showLogin = $state(false);
	let group = $state('profile');

	let newProfile = $state({ email: '' });
	let claimBusy = $state(false);
	let ownerLoginBusy = $state(false);
	const loading = $derived(claimBusy || ownerLoginBusy);
	let claimingDirect = $state(false);
	let emailTouched = $state(false);
	let errorMessage = $state('');
	let submissionSuccess = $state(false);
	let honeypot = $state('');
	/** @type {any} */
	let claimTurnstile = $state(null);
	/** @type {any} */
	let ownerLoginTurnstile = $state(null);

	let emailIsValid = $derived(isValidRoadIdEmail(newProfile.email));

	const handleDirectClaim = async () => {
		if (claimingDirect || !code) return;
		claimingDirect = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/v1/road-id-profile/codes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMessage = payload?.error || 'Unable to claim this bracelet code.';
				return;
			}
			await goto('/profile#road-id');
		} catch (err) {
			errorMessage = err?.message || 'Unable to claim this bracelet code.';
		} finally {
			claimingDirect = false;
		}
	};

	const handleSubmit = async (event, turnstileControl = claimTurnstile) => {
		event.preventDefault();
		if (loading || !turnstileControl) return;
		emailTouched = true;
		errorMessage = '';
		claimTurnstile?.clearError();
		ownerLoginTurnstile?.clearError();

		await turnstileControl.submit({
			validate: () => {
				if (!emailIsValid) {
					errorMessage = 'Please enter a valid email address.';
					return false;
				}
				if (honeypot.trim()) {
					errorMessage = 'Invalid submission.';
					return false;
				}
				return true;
			},
			onSubmit: async (turnstileToken) => {
				const payload = {
					...(!isClaimed ? { code } : {}),
					email: newProfile.email.trim(),
					createProfile: true,
					returnTo: '/profile#road-id',
					honeypot,
					turnstileToken
				};

				try {
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
						errorMessage = err.error || 'An error occurred.';
					}
				} catch (err) {
					errorMessage = err?.message || 'Unable to send login link.';
				}
			}
		});
	};
</script>

<svelte:head>
	<title>{code ? `Road ID · ${code}` : 'Road ID'} · 3 Feet Please</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-hidden"
>
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
					class="inline-flex min-h-11 items-center justify-center px-3 text-[0.72rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
					'profile'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Responder ID
				</Tabs.Trigger>
				<Tabs.Trigger
					value="crash"
					class="inline-flex min-h-11 items-center justify-center px-3 text-[0.72rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
					'crash'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Crash Response
				</Tabs.Trigger>
				<Tabs.Trigger
					value="alert"
					class="inline-flex min-h-11 items-center justify-center px-3 text-[0.72rem] font-black tracking-[0.1em] whitespace-nowrap uppercase transition sm:px-5 sm:py-2.5 sm:text-xs sm:tracking-[0.18em] {group ===
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
							We haven’t issued an In Case bracelet for code
							<strong class="text-primary-500 font-black">{code}</strong> yet.
						</p>
						<div class="flex flex-wrap gap-4">
							<a
								href="/roadid"
								class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center px-6 py-3 text-sm font-black uppercase transition"
							>
								About Road ID
							</a>
							{#if user}
								<a
									href="/profile#road-id"
									class="border-surface-50 text-surface-50 hover:bg-secondary-500 hover:border-secondary-500 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black uppercase transition"
								>
									Open Emergency ID
								</a>
							{/if}
						</div>
					</section>
				{:else if !isClaimed}
					<!-- Unclaimed bracelet code -->
					<section class="flex max-w-xl flex-col gap-6">
						{#if user}
							<div class="flex flex-col gap-3">
								<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
									Activate Bracelet
								</p>
								<h2
									class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
								>
									Link Bracelet {code}
								</h2>
								<p class="text-surface-300 m-0 text-base leading-relaxed">
									This bracelet is unclaimed. Link it directly to your Emergency ID profile to
									manage medical details, emergency contacts, and printable QR labels.
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
							<div class="flex flex-wrap items-center gap-4">
								<button
									type="button"
									class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center px-8 py-3.5 text-base font-black tracking-wide uppercase transition {claimingDirect
										? 'motion-safe:animate-pulse'
										: ''}"
									onclick={handleDirectClaim}
									disabled={claimingDirect}
								>
									{claimingDirect ? 'Linking Bracelet…' : 'Claim This Bracelet'}
								</button>
								<a
									href="/profile#road-id"
									class="border-surface-50 text-surface-50 hover:bg-surface-900 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black uppercase transition"
								>
									Open Emergency ID
								</a>
							</div>
						{:else if submissionSuccess}
							<div class="bg-primary-500 text-surface-950 flex flex-col gap-3 p-8" transition:slide>
								<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Magic Link Sent</p>
								<h2 class="text-surface-950! m-0 text-3xl font-black uppercase italic">
									Check Your Email
								</h2>
								<p class="m-0 text-base font-medium">
									We sent a confirmation link to <strong>{newProfile.email}</strong>.
								</p>
								<p class="m-0 text-sm">
									Open the link to bind bracelet <strong>{code}</strong> and complete your Emergency ID
									setup on your profile.
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
									This bracelet hasn’t been claimed yet. Enter your email to confirm access, link
									code <strong class="text-surface-50">{code}</strong>, and set up your Emergency
									ID.
								</p>
							</div>
							<form
								class="border-surface-50 flex w-full flex-col gap-5 border-t-2 pt-6"
								onsubmit={(e) => handleSubmit(e, claimTurnstile)}
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
										for="claim-email"
										class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Email
									</label>
									<input
										type="email"
										id="claim-email"
										autocomplete="email"
										bind:value={newProfile.email}
										placeholder="jane@example.com"
										class="input bg-surface-950 text-surface-50 min-h-11 border-2 {emailTouched &&
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
									{#if emailTouched && !emailIsValid}
										<p
											id="email-validation-error"
											class="text-tertiary-500 m-0 text-xs font-bold uppercase"
											aria-live="polite"
										>
											Please enter a valid email address.
										</p>
									{/if}
								</div>
								<TurnstileVerification
									bind:this={claimTurnstile}
									bind:busy={claimBusy}
									enabled={data?.turnstileEnabled !== false}
								/>
								{#if errorMessage}
									<p
										class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
										role="alert"
									>
										{errorMessage}
									</p>
								{/if}
								<button
									type="submit"
									class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center self-start px-8 py-3.5 text-base font-black tracking-wide uppercase transition {loading
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
					<!-- Claimed bracelet: always display the read-only responder screen -->
					<div class="flex flex-col gap-10">
						{#if isOwner}
							<aside
								class="bg-primary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-4 border-l-8 p-5 sm:px-7"
								aria-label="Bracelet owner controls"
							>
								<div class="flex flex-col gap-1">
									<p class="m-0 text-xs font-black tracking-[0.2em] uppercase">
										Your Bracelet · Live Responder View
									</p>
									<p class="m-0 text-sm font-semibold">
										First responders see this exact read-only screen when scanning
										<strong>{code}</strong>.
									</p>
								</div>
								<a
									href="/profile#road-id"
									class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 shrink-0 items-center justify-center px-6 py-3 text-sm font-black tracking-wide uppercase transition"
								>
									Edit Emergency ID
								</a>
							</aside>
						{/if}

						<RoadIdResponderCard {profile} {code} />

						{#if !isOwner}
							<section class="border-surface-800 border-t-2 pt-8">
								{#if user}
									<div class="flex flex-wrap items-center justify-between gap-4">
										<p class="text-surface-300 m-0 text-sm">
											Need to update your own bracelet or emergency profile?
										</p>
										<a
											href="/profile#road-id"
											class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black uppercase transition"
										>
											Manage My Emergency ID
										</a>
									</div>
								{:else if submissionSuccess}
									<div class="bg-primary-500 text-surface-950 p-6" transition:slide>
										<h2 class="text-surface-950! m-0 text-2xl font-black uppercase italic">
											Check Your Email
										</h2>
										<p class="m-0 mt-2">
											A login link has been sent to <strong>{newProfile.email}</strong>.
										</p>
										<p class="m-0 mt-1 text-sm">
											Open the link to edit your Emergency ID on your profile.
										</p>
									</div>
								{:else}
									<button
										type="button"
										class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black uppercase transition"
										onclick={() => (showLogin = !showLogin)}
									>
										Owner? Edit Emergency ID
									</button>
									{#if showLogin}
										<form
											class="mt-6 flex w-full max-w-md flex-col gap-4"
											onsubmit={(e) => handleSubmit(e, ownerLoginTurnstile)}
											transition:slide
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
													for="owner-email"
													class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Email
												</label>
												<input
													type="email"
													id="owner-email"
													autocomplete="email"
													bind:value={newProfile.email}
													placeholder="jane@example.com"
													class="input bg-surface-950 text-surface-50 min-h-11 border-2 {emailTouched &&
													!emailIsValid
														? 'border-tertiary-500'
														: emailTouched && emailIsValid
															? 'border-primary-500'
															: 'border-surface-500'}"
													required
													aria-invalid={emailTouched && !emailIsValid}
													aria-describedby={emailTouched && !emailIsValid
														? 'owner-email-validation-error'
														: undefined}
													oninput={() => (emailTouched = true)}
												/>
												{#if emailTouched && !emailIsValid}
													<p
														id="owner-email-validation-error"
														class="text-tertiary-500 m-0 text-xs font-bold uppercase"
														aria-live="polite"
													>
														Please enter a valid email address.
													</p>
												{/if}
											</div>
											<TurnstileVerification
												bind:this={ownerLoginTurnstile}
												bind:busy={ownerLoginBusy}
												enabled={data?.turnstileEnabled !== false}
											/>
											{#if errorMessage}
												<p
													class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
													role="alert"
												>
													{errorMessage}
												</p>
											{/if}
											<button
												type="submit"
												class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center self-start px-6 py-3 text-sm font-black uppercase transition {loading
													? 'motion-safe:animate-pulse'
													: ''}"
												disabled={loading}
											>
												Send Login Link
											</button>
										</form>
									{/if}
								{/if}
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
