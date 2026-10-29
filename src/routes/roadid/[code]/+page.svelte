<script>
	import { slide } from 'svelte/transition';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { normalizePhoneNumber, formatPhoneNumber } from '#lib/utils/phone';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';

	let { data } = $props();
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();
	const code = pageData.code;
	const notFound = pageData.notFound;
	const user = pageData.user;

	// If there's no profile, create an empty one
	const emptyProfile = {
		user_id: user?.id,
		claimed: Boolean(user?.id),
		is_owner: Boolean(user?.id),
		full_name: '',
		phone: '',
		blood_type: '',
		allergies: '',
		medication: ''
	};
	let profile = $state(pageData.qrData ? { ...pageData.qrData?.profile } : emptyProfile);
	let showLogin = $state(false);

	// Control which tab is active. 'profile' is default.
	let group = $state('profile');

	// For a new profile claim
	let newProfile = $state({ email: '' });
	let loading = $state(false);
	let emailTouched = $state(false);
	let errorMessage = $state('');
	let submissionSuccess = $state(false);
	let honeypot = $state('');
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	let turnstileEl = $state(null);
	let turnstileWidgetId = $state(null);

	// Email validation
	let emailIsValid = $derived(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(newProfile.email));

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

	// Claim/Login via magic link
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
			email: newProfile.email,
			createProfile: true,
			returnTo:
				typeof window !== 'undefined'
					? window.location.pathname + window.location.search + window.location.hash
					: `/roadid/${code}`,
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
			const err = await res.json();
			errorMessage = err.error || 'An error occurred';
		}
		loading = false;
		if (turnstileEnabled && turnstileWidgetId) {
			resetTurnstile(turnstileWidgetId);
		}
	};

	// Update profile fields (excluding emergency_contacts).
	const handleProfileUpdate = async () => {
		const { emergency_contacts, claimed, is_owner, ...profileUpdate } = profile;

		const res = await fetch('/api/v1/road-id-profile', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(profileUpdate)
		});

		if (!res.ok) {
			const err = await res.json();
			errorMessage = err.error || 'Error updating profile';
		}
	};

	// Common allergy & medication chip logic
	const allergyOptions = ['Latex', 'Penicillin', 'Sulfa', 'Iodine'];
	const getAllergyArray = () =>
		profile?.allergies ? profile.allergies.split(',').map((s) => s.trim()) : [];
	const isAllergySelected = (allergy) => getAllergyArray().includes(allergy);
	const toggleAllergy = (allergy) => {
		let current = getAllergyArray();
		if (current.includes(allergy)) {
			current = current.filter((item) => item !== allergy);
		} else {
			current.push(allergy);
		}
		profile.allergies = current.join(', ');
		handleProfileUpdate();
	};

	const medicineOptions = ['Insulin', 'Blood Thinners', 'Albuterol', 'Asprin'];
	const getMedicationArray = () =>
		profile?.medication ? profile.medication.split(',').map((s) => s.trim()) : [];
	const isMedicationSelected = (med) => getMedicationArray().includes(med);
	const toggleMedication = (med) => {
		let current = getMedicationArray();
		if (current.includes(med)) {
			current = current.filter((item) => item !== med);
		} else {
			current.push(med);
		}
		profile.medication = current.join(', ');
		handleProfileUpdate();
	};

	// ---------------------------
	// Emergency Contact Handling
	// ---------------------------
	// Local state for new emergency contact
	let newContact = $state({
		contact_name: '',
		contact_phone: '',
		contact_relationship: ''
	});

	// Create a new emergency contact
	const handleCreateContact = async (event) => {
		event.preventDefault();
		errorMessage = '';
		try {
			const payload = {
				profile_id: user.id,
				contact_name: newContact.contact_name.trim(),
				contact_phone: newContact.contact_phone.trim(),
				contact_relationship: newContact.contact_relationship.trim()
			};

			const res = await fetch('/api/v1/emergency-contacts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Error creating contact');
			}

			const { contact } = await res.json();
			if (!profile.emergency_contacts) {
				profile.emergency_contacts = [];
			}
			profile.emergency_contacts.push(contact);
			newContact = { contact_name: '', contact_phone: '', contact_relationship: '' };
		} catch (err) {
			errorMessage = err.message;
		}
	};

	// Update an existing contact immediately when a field changes (onblur)
	const handleUpdateContact = async (contact) => {
		errorMessage = '';
		try {
			const res = await fetch(`/api/v1/emergency-contacts/${contact.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(contact)
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Error updating contact');
			}
		} catch (err) {
			errorMessage = err.message;
		}
	};

	// Delete an existing contact
	const handleDeleteContact = async (contactId) => {
		errorMessage = '';
		try {
			const res = await fetch(`/api/v1/emergency-contacts/${contactId}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Error deleting contact');
			}

			profile.emergency_contacts = profile.emergency_contacts.filter((c) => c.id !== contactId);
		} catch (err) {
			errorMessage = err.message;
		}
	};
</script>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-hidden"
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
			class="bg-secondary-500 text-surface-50 border-surface-950 border-y-[3px] px-6 py-3 sm:px-10 lg:px-14"
		>
			<Tabs.List class="flex flex-wrap gap-3 border-0">
				<Tabs.Trigger
					value="profile"
					class="px-5 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition {group ===
					'profile'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Profile
				</Tabs.Trigger>
				<Tabs.Trigger
					value="crash"
					class="px-5 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition {group ===
					'crash'
						? 'bg-primary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-950 border-2'}"
				>
					Crash Response
				</Tabs.Trigger>
				<Tabs.Trigger
					value="alert"
					class="px-5 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition {group ===
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
						<h1
							class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
						>
							Code Not Found
						</h1>
						<p class="text-surface-200 m-0 text-lg leading-relaxed">
							We haven't created a In Case bracelet for the code
							<strong class="text-primary-500 font-black">{code}</strong> yet.
						</p>
						<p class="text-surface-300 m-0 text-base leading-relaxed">
							For more information about ordering a bracelet, please visit
							<a
								href="https://3feetplease.org"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary-500 font-bold underline"
							>
								3 Feet Please
							</a>.
						</p>
					</section>
				{:else if !profile.claimed && !user}
					<!-- Not logged in and no profile exists: show claim/login form -->
					<section class="flex max-w-xl flex-col gap-6">
						{#if submissionSuccess}
							<div class="bg-primary-500 text-surface-950 flex flex-col gap-3 p-8" transition:slide>
								<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Magic Link Sent</p>
								<h2 class="text-surface-950! m-0 text-3xl font-black uppercase italic">
									Check Your Email
								</h2>
								<p class="m-0 text-base font-medium">
									A link has been sent to <strong>{newProfile.email}</strong>.
								</p>
								<p class="m-0 text-sm">
									Please click the link in your email to complete your sign-up.
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
									This profile hasn’t been claimed yet. Please enter your details below to claim it.
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
										class="input bg-surface-900 text-surface-50 {emailTouched && !emailIsValid
											? 'border-tertiary-500'
											: emailTouched && emailIsValid
												? 'border-primary-500'
												: 'border-surface-700'}"
										required
										oninput={() => (emailTouched = true)}
									/>
									{#if emailTouched && !emailIsValid}
										<p class="text-tertiary-500 m-0 text-xs font-bold uppercase" transition:slide>
											Please enter a valid email address.
										</p>
									{/if}
								</div>
								{#if errorMessage}
									<p
										class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
										transition:slide
									>
										{errorMessage}
									</p>
								{/if}
								<button
									type="submit"
									class="bg-primary-500 text-surface-950 hover:bg-surface-50 self-start px-8 py-4 text-base font-black tracking-wide uppercase transition {loading
										? 'animate-pulse'
										: ''}"
									disabled={loading}
								>
									Claim This Profile
								</button>
							</form>
						{/if}
					</section>
				{:else if (!profile.claimed && user) || profile.is_owner === true}
					<!-- Signed-in user: show editable profile form -->
					<section class="grid gap-12 lg:grid-cols-2">
						<div class="flex flex-col gap-6">
							<div class="flex items-start gap-4">
								<span
									class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
									aria-hidden="true"
								>
									01
								</span>
								<div>
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Rider Medical Details
									</p>
									<h6 class="text-surface-50! m-0 text-2xl font-black uppercase">
										Emergency Information
									</h6>
								</div>
							</div>

							<div class="border-surface-50 flex flex-col gap-5 border-t-2 pt-6">
								<div class="flex flex-col gap-2">
									<label
										for="full_name"
										class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Your Name
									</label>
									<input
										type="text"
										id="full_name"
										value={profile?.full_name}
										class="input bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.full_name = e.target.value;
											handleProfileUpdate();
										}}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<label
										for="phone"
										class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Phone
									</label>
									<input
										type="text"
										id="phone"
										value={profile?.phone}
										class="input bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.phone = e.target.value;
											handleProfileUpdate();
										}}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<label
										for="blood_type"
										class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Blood Type
									</label>
									<select
										id="blood_type"
										class="select bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.blood_type = e.target.value;
											handleProfileUpdate();
										}}
									>
										<option value="">Select</option>
										<option value="A+">A+</option>
										<option value="A-">A-</option>
										<option value="B+">B+</option>
										<option value="B-">B-</option>
										<option value="AB+">AB+</option>
										<option value="AB-">AB-</option>
										<option value="O+">O+</option>
										<option value="O-">O-</option>
									</select>
								</div>

								<div class="flex flex-col gap-2">
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Allergies
									</p>
									<div class="flex flex-wrap gap-2">
										{#each allergyOptions as allergy (allergy)}
											<button
												type="button"
												class="border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition {isAllergySelected(
													allergy
												)
													? 'bg-primary-500 text-surface-950 border-primary-500'
													: 'bg-surface-900 text-surface-50 border-surface-700 hover:border-primary-500'}"
												onclick={() => toggleAllergy(allergy)}
											>
												{allergy}
											</button>
										{/each}
									</div>
									<input
										type="text"
										id="allergies"
										placeholder="Other allergies (comma-separated)"
										value={profile?.allergies}
										class="input bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.allergies = e.target.value;
											handleProfileUpdate();
										}}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Medication
									</p>
									<div class="flex flex-wrap gap-2">
										{#each medicineOptions as med (med)}
											<button
												type="button"
												class="border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition {isMedicationSelected(
													med
												)
													? 'bg-primary-500 text-surface-950 border-primary-500'
													: 'bg-surface-900 text-surface-50 border-surface-700 hover:border-primary-500'}"
												onclick={() => toggleMedication(med)}
											>
												{med}
											</button>
										{/each}
									</div>
									<textarea
										id="medication"
										rows="3"
										placeholder="Other medications (comma-separated)"
										class="textarea bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.medication = e.target.value;
											handleProfileUpdate();
										}}>{profile?.medication}</textarea
									>
								</div>
							</div>
						</div>

						<!-- Emergency Contacts Section: Always display input fields -->
						<div class="flex flex-col gap-6">
							<div class="flex items-start gap-4">
								<span
									class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
									aria-hidden="true"
								>
									02
								</span>
								<div>
									<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
										Who to Call
									</p>
									<h6 class="text-surface-50! m-0 text-2xl font-black uppercase">
										Emergency Contacts
									</h6>
								</div>
							</div>

							{#if errorMessage}
								<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold">
									{errorMessage}
								</p>
							{/if}

							<div class="border-surface-50 flex flex-col gap-6 border-t-2 pt-6">
								{#if profile?.emergency_contacts && profile.emergency_contacts.length}
									<div class="divide-surface-800 flex flex-col divide-y">
										{#each profile.emergency_contacts as contact (contact.id)}
											<div class="flex flex-col gap-3 py-4 first:pt-0">
												<p
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Name
												</p>
												<input
													type="text"
													bind:value={contact.contact_name}
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<p
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Relationship
												</p>
												<input
													type="text"
													bind:value={contact.contact_relationship}
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<p
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Phone
												</p>
												<input
													type="text"
													bind:value={contact.contact_phone}
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<button
													class="border-tertiary-500 text-tertiary-500 hover:bg-tertiary-500 hover:text-surface-950 self-start border-2 px-4 py-2 text-xs font-black uppercase transition"
													onclick={() => handleDeleteContact(contact.id)}
												>
													Delete
												</button>
											</div>
										{/each}
									</div>
								{:else}
									<p class="text-surface-300 m-0 text-sm">No emergency contacts provided.</p>
								{/if}

								<!-- Add New Contact Form -->
								<div class="border-surface-800 flex flex-col gap-4 border-t-2 pt-6">
									<h6 class="text-surface-50! m-0 text-lg font-black uppercase">
										Add a New Contact
									</h6>
									<form class="flex flex-col gap-4" onsubmit={handleCreateContact}>
										<div class="flex flex-col gap-1.5">
											<label
												for="contact_name"
												class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
											>
												Name
											</label>
											<input
												type="text"
												id="contact_name"
												bind:value={newContact.contact_name}
												class="input bg-surface-900 border-surface-700 text-surface-50"
												required
											/>
										</div>
										<div class="flex flex-col gap-1.5">
											<label
												for="contact_relationship"
												class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
											>
												Relationship
											</label>
											<input
												type="text"
												id="contact_relationship"
												bind:value={newContact.contact_relationship}
												class="input bg-surface-900 border-surface-700 text-surface-50"
												required
											/>
										</div>
										<div class="flex flex-col gap-1.5">
											<label
												for="contact_phone"
												class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
											>
												Phone
											</label>
											<input
												type="text"
												id="contact_phone"
												bind:value={newContact.contact_phone}
												class="input bg-surface-900 border-surface-700 text-surface-50"
												required
											/>
										</div>
										<button
											type="submit"
											class="bg-primary-500 text-surface-950 hover:bg-surface-50 self-start px-6 py-3 text-sm font-black uppercase transition"
										>
											Create Contact
										</button>
									</form>
								</div>
							</div>
						</div>
					</section>
				{:else}
					<!-- Public / read-only view -->
					<div class="flex flex-col gap-12">
						<section class="grid gap-12 lg:grid-cols-2">
							<div class="flex flex-col gap-6">
								<h6 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Information
								</h6>
								<div class="border-surface-50 divide-surface-800 flex flex-col divide-y border-t-2">
									<div class="flex items-center justify-between gap-4 py-4">
										<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
											Name
										</span>
										<strong class="text-lg font-black">{profile?.full_name}</strong>
									</div>
									{#if profile.phone}
										<div class="flex items-center justify-between gap-4 py-4">
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Phone
											</span>
											<a
												href="tel:{normalizePhoneNumber(profile.phone)}"
												target="_blank"
												class="text-primary-500 text-lg font-black underline"
											>
												{profile?.phone ? formatPhoneNumber(profile.phone) : ''}
											</a>
										</div>
									{/if}
									{#if profile.blood_type}
										<div class="flex items-center justify-between gap-4 py-4">
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Blood Type
											</span>
											<strong
												class="bg-tertiary-500 text-surface-950 px-3 py-1 text-base font-black"
											>
												{profile?.blood_type}
											</strong>
										</div>
									{/if}
									{#if profile.allergies}
										<div class="flex items-center justify-between gap-4 py-4">
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Allergies
											</span>
											<strong class="text-right font-bold">{profile?.allergies}</strong>
										</div>
									{/if}
									{#if profile.medication}
										<div class="flex items-center justify-between gap-4 py-4">
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Medication
											</span>
											<strong class="text-right font-bold">{profile?.medication}</strong>
										</div>
									{/if}
								</div>
							</div>

							<div class="flex flex-col gap-6">
								<h6 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Contacts
								</h6>
								<div class="border-surface-50 border-t-2 pt-4">
									{#if profile?.emergency_contacts && profile.emergency_contacts.length}
										<ul class="divide-surface-800 m-0 list-none divide-y p-0">
											{#each profile.emergency_contacts as contact (contact.id)}
												<li class="flex flex-wrap items-center justify-between gap-2 py-4">
													<span>
														<strong class="font-black uppercase">{contact.contact_name}</strong>
														<span class="text-surface-300 text-sm">
															({contact.contact_relationship})
														</span>
													</span>
													<a
														href="tel:{normalizePhoneNumber(contact.contact_phone)}"
														target="_blank"
														class="text-primary-500 font-black underline"
													>
														{profile?.phone ? formatPhoneNumber(contact.contact_phone) : ''}
													</a>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="text-surface-300 m-0">No emergency contacts provided.</p>
									{/if}
								</div>
							</div>
						</section>

						<section class="border-surface-800 border-t-2 pt-8">
							{#if submissionSuccess}
								<div class="bg-primary-500 text-surface-950 p-6" transition:slide>
									<h4 class="text-surface-950! m-0 text-2xl font-black uppercase italic">
										Check Your Email
									</h4>
									<p class="m-0 mt-2">
										A link has been sent to <strong>{newProfile.email}</strong>.
									</p>
									<p class="m-0 mt-1 text-sm">Please click the link in your email to login.</p>
								</div>
							{:else}
								<button
									class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 border-2 px-6 py-3 text-sm font-black uppercase transition"
									onclick={() => (showLogin = !showLogin)}
								>
									Manage Profile
								</button>
								{#if showLogin}
									<form
										class="mt-6 flex w-full max-w-md flex-col gap-4"
										onsubmit={handleSubmit}
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
												class="input bg-surface-900 text-surface-50 {emailTouched && !emailIsValid
													? 'border-tertiary-500'
													: emailTouched && emailIsValid
														? 'border-primary-500'
														: 'border-surface-700'}"
												required
												oninput={() => (emailTouched = true)}
											/>
											{#if emailTouched && !emailIsValid}
												<p
													class="text-tertiary-500 m-0 text-xs font-bold uppercase"
													transition:slide
												>
													Please enter a valid email address.
												</p>
											{/if}
										</div>
										{#if errorMessage}
											<p
												class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
												transition:slide
											>
												{errorMessage}
											</p>
										{/if}
										<button
											type="submit"
											class="bg-primary-500 text-surface-950 hover:bg-surface-50 self-start px-6 py-3 text-sm font-black uppercase transition {loading
												? 'animate-pulse'
												: ''}"
											disabled={loading}
										>
											Login to Manage Profile
										</button>
									</form>
								{/if}
							{/if}
						</section>
					</div>
				{/if}
			</div>
		</Tabs.Content>
		<Tabs.Content value="crash">
			<div class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
				<CrashResponse />
			</div>
		</Tabs.Content>
		<Tabs.Content value="alert">
			<div class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
				<AlertSystem />
			</div>
		</Tabs.Content>
	</Tabs>
</div>
