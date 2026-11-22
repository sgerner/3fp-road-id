<script>
	import { slide } from 'svelte/transition';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { normalizePhoneNumber, formatPhoneNumber } from '#lib/utils/phone';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '#lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';

	/** @type {Record<string, any>} */
	let { data } = $props();
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();
	const code = pageData.code;
	const notFound = pageData.notFound;
	const user = pageData.user;

	// If there's no profile, create an empty one
	/** @type {any} */
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
	/** @type {any} */
	let profile = $state(pageData.qrData ? { ...pageData.qrData?.profile } : emptyProfile);
	/** @type {any} */
	let showLogin = $state(false);

	// Control which tab is active. 'profile' is default.
	/** @type {any} */
	let group = $state('profile');

	// For a new profile claim
	/** @type {any} */
	let newProfile = $state({ email: '' });
	/** @type {any} */
	let loading = $state(false);
	/** @type {any} */
	let emailTouched = $state(false);
	/** @type {any} */
	let errorMessage = $state('');
	/** @type {any} */
	let submissionSuccess = $state(false);
	/** @type {any} */
	let honeypot = $state('');
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	/** @type {any} */
	let turnstileEl = $state(null);
	/** @type {any} */
	let turnstileWidgetId = $state(null);

	// Email validation
	/** @type {any} */
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
	/** @type {any} */
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

		/** @type {any} */
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
	/** @type {any} */
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
	/** @type {any} */
	const getAllergyArray = () =>
		profile?.allergies ? profile.allergies.split(',').map((s) => s.trim()) : [];
	/** @type {any} */
	const isAllergySelected = (allergy) => getAllergyArray().includes(allergy);
	/** @type {any} */
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

	const medicineOptions = ['Insulin', 'Blood Thinners', 'Albuterol', 'Aspirin'];
	/** @type {any} */
	const normalizeMedication = (medication) => {
		const value = medication.trim();
		return value.toLowerCase() === 'asprin' ? 'Aspirin' : value;
	};
	/** @type {any} */
	const getMedicationArray = () =>
		profile?.medication ? profile.medication.split(',').map(normalizeMedication) : [];
	/** @type {any} */
	const isMedicationSelected = (med) => getMedicationArray().includes(med);
	/** @type {any} */
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
	/** @type {any} */
	let newContact = $state({
		contact_name: '',
		contact_phone: '',
		contact_relationship: ''
	});

	// Create a new emergency contact
	/** @type {any} */
	const handleCreateContact = async (event) => {
		event.preventDefault();
		errorMessage = '';
		try {
			/** @type {any} */
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
	/** @type {any} */
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
	/** @type {any} */
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
							We haven't created a In Case bracelet for the code
							<strong class="text-primary-500 font-black">{code}</strong> yet.
						</p>
						<p class="text-surface-300 m-0 text-base leading-relaxed">
							For details about In Case bracelets, see
							<a href="/roadid" class="text-primary-500 font-bold underline"
								>the bracelet information page</a
							>.
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
									<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
										Emergency Information
									</h2>
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
											profile.full_name = /** @type {any} */ (e.target).value;
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
										type="tel"
										id="phone"
										value={profile?.phone}
										autocomplete="tel"
										class="input bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.phone = /** @type {any} */ (e.target).value;
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
											profile.blood_type = /** @type {any} */ (e.target).value;
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
									<p
										id="allergies-label"
										class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Allergies
									</p>
									<div class="flex flex-wrap gap-2" role="group" aria-labelledby="allergies-label">
										{#each allergyOptions as allergy (allergy)}
											<button
												type="button"
												aria-pressed={isAllergySelected(allergy)}
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
									<label for="allergies" class="text-surface-300 text-sm font-medium">
										Other allergies (comma-separated)
									</label>
									<input
										type="text"
										id="allergies"
										value={profile?.allergies}
										class="input bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.allergies = /** @type {any} */ (e.target).value;
											handleProfileUpdate();
										}}
									/>
								</div>

								<div class="flex flex-col gap-2">
									<p
										id="medication-label"
										class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
									>
										Medication
									</p>
									<div class="flex flex-wrap gap-2" role="group" aria-labelledby="medication-label">
										{#each medicineOptions as med (med)}
											<button
												type="button"
												aria-pressed={isMedicationSelected(med)}
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
									<label for="medication" class="text-surface-300 text-sm font-medium">
										Other medications (comma-separated)
									</label>
									<textarea
										id="medication"
										rows="3"
										class="textarea bg-surface-900 border-surface-700 text-surface-50"
										onblur={(e) => {
											profile.medication = /** @type {any} */ (e.target).value;
											handleProfileUpdate();
										}}>{getMedicationArray().join(', ')}</textarea
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
									<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
										Emergency Contacts
									</h2>
								</div>
							</div>

							{#if errorMessage}
								<p
									class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold"
									role="alert"
								>
									{errorMessage}
								</p>
							{/if}

							<div class="border-surface-50 flex flex-col gap-6 border-t-2 pt-6">
								{#if profile?.emergency_contacts && profile.emergency_contacts.length}
									<div class="divide-surface-800 flex flex-col divide-y">
										{#each profile.emergency_contacts as contact (contact.id)}
											<div class="flex flex-col gap-3 py-4 first:pt-0">
												<label
													for={`contact-name-${contact.id}`}
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Name
												</label>
												<input
													type="text"
													id={`contact-name-${contact.id}`}
													bind:value={contact.contact_name}
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<label
													for={`contact-relationship-${contact.id}`}
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Relationship
												</label>
												<input
													type="text"
													id={`contact-relationship-${contact.id}`}
													bind:value={contact.contact_relationship}
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<label
													for={`contact-phone-${contact.id}`}
													class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
												>
													Phone
												</label>
												<input
													type="tel"
													id={`contact-phone-${contact.id}`}
													bind:value={contact.contact_phone}
													autocomplete="tel"
													class="input bg-surface-900 border-surface-700 text-surface-50"
													onblur={() => handleUpdateContact(contact)}
												/>
												<button
													type="button"
													class="border-tertiary-500 text-tertiary-500 hover:bg-tertiary-500 hover:text-surface-950 self-start border-2 px-4 py-2 text-xs font-black uppercase transition"
													aria-label={`Delete emergency contact ${contact.contact_name || 'contact'}`}
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
									<h3 class="text-surface-50! m-0 text-lg font-black uppercase">
										Add a New Contact
									</h3>
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
												type="tel"
												id="contact_phone"
												bind:value={newContact.contact_phone}
												autocomplete="tel"
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
								<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Information
								</h2>
								<div class="border-surface-50 divide-surface-800 flex flex-col divide-y border-t-2">
									<div class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4">
										<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
											Name
										</span>
										<strong class="min-w-0 text-right text-lg font-black break-words"
											>{profile?.full_name}</strong
										>
									</div>
									{#if profile.phone}
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
									{#if profile.blood_type}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
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
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Allergies
											</span>
											<strong class="max-w-[70%] min-w-0 text-right font-bold break-words"
												>{profile?.allergies}</strong
											>
										</div>
									{/if}
									{#if profile.medication}
										<div
											class="flex items-start justify-between gap-4 py-3 sm:items-center sm:py-4"
										>
											<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
												Medication
											</span>
											<strong class="max-w-[70%] min-w-0 text-right font-bold break-words"
												>{getMedicationArray().join(', ')}</strong
											>
										</div>
									{/if}
								</div>
							</div>

							<div class="flex flex-col gap-6">
								<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
									Emergency Contacts
								</h2>
								<div class="border-surface-50 border-t-2 pt-4">
									{#if profile?.emergency_contacts && profile.emergency_contacts.length}
										<ul class="divide-surface-800 m-0 list-none divide-y p-0">
											{#each profile.emergency_contacts as contact (contact.id)}
												{@const contactPhone = normalizePhoneNumber(contact.contact_phone)}
												<li
													class="flex flex-wrap items-start justify-between gap-2 py-2 sm:items-center sm:py-4"
												>
													<span class="min-w-0">
														<strong class="font-black uppercase">{contact.contact_name}</strong>
														<span class="text-surface-300 text-sm">
															({contact.contact_relationship})
														</span>
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

						<section class="border-surface-800 border-t-2 pt-8">
							{#if submissionSuccess}
								<div class="bg-primary-500 text-surface-950 p-6" transition:slide>
									<h2 class="text-surface-950! m-0 text-2xl font-black uppercase italic">
										Check Your Email
									</h2>
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
