<script>
	import { slide } from 'svelte/transition';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { normalizePhoneNumber, formatPhoneNumber } from '$lib/utils/phone';
	import AlertSystem from '$lib/components/AlertSystem.svelte';
	import CrashResponse from '$lib/components/CrashResponse.svelte';

	let { data } = $props();
	const code = data.code;
	const notFound = data.notFound;
	const user = data.user;

	// If there's no profile, create an empty one
	const emptyProfile = {
		user_id: user?.id,
		full_name: '',
		phone: '',
		blood_type: '',
		allergies: '',
		medication: ''
	};
	let profile = $state(data.qrData ? { ...data.qrData?.profile } : emptyProfile);
	let showLogin = $state(false);

	// Control which tab is active. 'profile' is default.
	let group = $state('profile');

	// For a new profile claim
	let newProfile = $state({ email: '' });
	let loading = $state(false);
	let emailTouched = $state(false);
	let errorMessage = $state('');
	let submissionSuccess = $state(false);

	// Email validation
	let emailIsValid = $derived(/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(newProfile.email));

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
		errorMessage = '';

		const payload = {
			code,
			email: newProfile.email,
			createProfile: true
		};

		const res = await fetch('/api/v1/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.ok) {
			submissionSuccess = true;
		} else {
			const err = await res.json();
			errorMessage = err.error || 'An error occurred';
		}
		loading = false;
	};

	// Update profile fields (excluding emergency_contacts).
	const handleProfileUpdate = async () => {
		const { emergency_contacts, ...profileUpdate } = profile;

		const res = await fetch('/api/v1/profile', {
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

<div class="max-w-md">
	<!-- Skeleton UI Tabs -->
	<Tabs value={group} onValueChange={(e) => (group = e.value)}>
		{#snippet list()}
			<!-- The tab controls -->
			<Tabs.Control value="profile">Profile</Tabs.Control>
			<Tabs.Control value="crash">Crash Response</Tabs.Control>
			<Tabs.Control value="alert">Safety Tips</Tabs.Control>
		{/snippet}

		{#snippet content()}
			<!-- The tab content panels -->
			<Tabs.Panel value="profile">
				<div class="card preset-outlined-primary-500 flex flex-col gap-4 p-4">
					{#if notFound}
						<section>
							<h1 class="h1">Code Not Found</h1>
							<p class="mb-4">
								We haven't created a road ID bracelet for the code <strong>{code}</strong> yet.
							</p>
							<p class="mb-4">
								For more information about ordering a bracelet, please visit
								<a
									href="https://3feetplease.org"
									target="_blank"
									rel="noopener noreferrer"
									class="anchor"
								>
									3 Feet Please
								</a>.
							</p>
						</section>
					{:else if !profile.user_id && !user}
						<!-- Not logged in and no profile exists: show claim/login form -->
						<section class="flex flex-col items-center justify-center">
							{#if submissionSuccess}
								<div class="rounded p-4" transition:slide>
									<h2 class="h2">Check Your Email</h2>
									<p>
										A link has been sent to <strong>{newProfile.email}</strong>.
									</p>
									<p>Please click the link in your email to complete your sign-up.</p>
								</div>
							{:else}
								<h2 class="h2">Claim Your Profile</h2>
								<p class="mb-4">
									This profile hasn’t been claimed yet. Please enter your details below to claim it.
								</p>
								<form class="flex w-full max-w-md flex-col gap-4" onsubmit={handleSubmit}>
									<div class="flex flex-col gap-2">
										<label for="email" class="label">Email</label>
										<input
											type="email"
											id="email"
											bind:value={newProfile.email}
											placeholder="jane@example.com"
											class="input bg-primary-950/30 {emailTouched && !emailIsValid
												? 'border-red-500'
												: emailTouched && emailIsValid
													? 'border-green-500'
													: ''}"
											required
											oninput={() => (emailTouched = true)}
										/>
										{#if emailTouched && !emailIsValid}
											<p class="text-sm text-red-500" transition:slide>
												Please enter a valid email address.
											</p>
										{/if}
									</div>
									{#if errorMessage}
										<p class="text-red-500" transition:slide>{errorMessage}</p>
									{/if}
									<button
										type="submit"
										class="btn preset-outlined-success-500 mt-4 {loading ? 'animate-pulse' : ''}"
										disabled={loading}
									>
										Claim This Profile
									</button>
								</form>
							{/if}
						</section>
					{:else if (!profile.user_id && user) || user?.id === profile.user_id}
						<!-- Signed-in user: show editable profile form -->
						<section class="flex flex-col gap-4">
							<h6 class="h6 !mb-0">Emergency Information</h6>

							<div class="flex flex-col">
								<label for="full_name" class="label">Your Name</label>
								<input
									type="text"
									id="full_name"
									value={profile?.full_name}
									class="input bg-primary-950/30"
									onblur={(e) => {
										profile.full_name = e.target.value;
										handleProfileUpdate();
									}}
								/>
							</div>

							<div class="flex flex-col">
								<label for="phone" class="label">Phone</label>
								<input
									type="text"
									id="phone"
									value={profile?.phone}
									class="input bg-primary-950/30"
									onblur={(e) => {
										profile.phone = e.target.value;
										handleProfileUpdate();
									}}
								/>
							</div>

							<div class="flex flex-col">
								<label for="blood_type" class="label">Blood Type</label>
								<select
									id="blood_type"
									class="select bg-primary-950/30"
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

							<div class="flex flex-col">
								<label class="label">Allergies</label>
								<div class="flex flex-wrap gap-2">
									{#each allergyOptions as allergy}
										<button
											type="button"
											class="chip {isAllergySelected(allergy)
												? 'preset-filled-primary-500'
												: 'preset-outlined-primary-500'}"
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
									class="input bg-primary-950/30 mt-2"
									onblur={(e) => {
										profile.allergies = e.target.value;
										handleProfileUpdate();
									}}
								/>
							</div>

							<div class="flex flex-col">
								<label class="label">Medication</label>
								<div class="flex flex-wrap gap-2">
									{#each medicineOptions as med}
										<button
											type="button"
											class="chip {isMedicationSelected(med)
												? 'preset-filled-primary-500'
												: 'preset-outlined-primary-500'}"
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
									class="textarea bg-primary-950/30 mt-2"
									onblur={(e) => {
										profile.medication = e.target.value;
										handleProfileUpdate();
									}}>{profile?.medication}</textarea
								>
							</div>

							<!-- Emergency Contacts Section: Always display input fields -->
							<h6 class="h6">Emergency Contacts</h6>
							{#if errorMessage}
								<p class="text-red-500">{errorMessage}</p>
							{/if}
							{#if profile?.emergency_contacts && profile.emergency_contacts.length}
								<div class="flex flex-col gap-2">
									{#each profile.emergency_contacts as contact}
										<div class="card rounded border p-2">
											<div class="flex flex-col gap-2">
												<label class="label">Name</label>
												<input
													type="text"
													bind:value={contact.contact_name}
													class="input bg-primary-950/30"
													onblur={() => handleUpdateContact(contact)}
												/>
												<label class="label">Relationship</label>
												<input
													type="text"
													bind:value={contact.contact_relationship}
													class="input bg-primary-950/30"
													onblur={() => handleUpdateContact(contact)}
												/>
												<label class="label">Phone</label>
												<input
													type="text"
													bind:value={contact.contact_phone}
													class="input bg-primary-950/30"
													onblur={() => handleUpdateContact(contact)}
												/>
												<button
													class="btn btn-sm preset-outlined-error-500 hover:preset-filled-error-500"
													onclick={() => handleDeleteContact(contact.id)}
												>
													Delete
												</button>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<p>No emergency contacts provided.</p>
							{/if}

							<!-- Add New Contact Form -->
							<div class="card preset-outlined-success-500 mt-4 rounded p-2">
								<h6 class="h6">Add a New Contact</h6>
								<form class="flex flex-col gap-2" onsubmit={handleCreateContact}>
									<div class="flex flex-col gap-1">
										<label for="contact_name" class="label">Name</label>
										<input
											type="text"
											id="contact_name"
											bind:value={newContact.contact_name}
											class="input bg-primary-950/30"
											required
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="contact_relationship" class="label">Relationship</label>
										<input
											type="text"
											id="contact_relationship"
											bind:value={newContact.contact_relationship}
											class="input bg-primary-950/30"
											required
										/>
									</div>
									<div class="flex flex-col gap-1">
										<label for="contact_phone" class="label">Phone</label>
										<input
											type="text"
											id="contact_phone"
											bind:value={newContact.contact_phone}
											class="input bg-primary-950/30"
											required
										/>
									</div>
									<button
										type="submit"
										class="btn preset-outlined-success-500 btn-sm hover:preset-filled-success-500 mt-2"
									>
										Create Contact
									</button>
								</form>
							</div>
						</section>
					{:else}
						<!-- Public / read-only view -->
						<section>
							<h1>Emergency Information</h1>
							<div class="flex flex-col gap-4">
								<div class="card">
									<span class="label">Name</span><strong>{profile?.full_name}</strong>
								</div>
								{#if profile.phone}
									<div class="card">
										<span class="label">Phone</span>
										<a
											href="tel:{normalizePhoneNumber(profile.phone)}"
											target="_blank"
											class="font-bold"
										>
											{profile?.phone ? formatPhoneNumber(profile.phone) : ''}
										</a>
									</div>
								{/if}
								{#if profile.blood_type}
									<div class="card">
										<span class="label">Blood Type</span><strong>{profile?.blood_type}</strong>
									</div>
								{/if}
								{#if profile.allergies}
									<div class="card">
										<span class="label">Allergies</span><strong>{profile?.allergies}</strong>
									</div>
								{/if}
								{#if profile.medication}
									<div class="card">
										<span class="label">Medication</span><strong>{profile?.medication}</strong>
									</div>
								{/if}
							</div>

							<h2 class="mt-6">Emergency Contacts</h2>
							{#if profile?.emergency_contacts && profile.emergency_contacts.length}
								<ul>
									{#each profile.emergency_contacts as contact}
										<li>
											<strong>{contact.contact_name}</strong> ({contact.contact_relationship}) –
											<a
												href="tel:{normalizePhoneNumber(contact.contact_phone)}"
												target="_blank"
												class="font-bold"
											>
												{profile?.phone ? formatPhoneNumber(contact.contact_phone) : ''}
											</a>
										</li>
									{/each}
								</ul>
							{:else}
								<p>No emergency contacts provided.</p>
							{/if}
						</section>

						<section class="border-success-500 rounded-md border">
							{#if submissionSuccess}
								<div class="rounded p-4" transition:slide>
									<h4 class="h4">Check Your Email</h4>
									<p>
										A link has been sent to <strong>{newProfile.email}</strong>.
									</p>
									<p>Please click the link in your email to login.</p>
								</div>
							{:else}
								<button
									class="btn preset-tonal-success btn-sm hover:preset-filled-success-500 w-full"
									onclick={() => (showLogin = !showLogin)}
								>
									Manage Profile
								</button>
								{#if showLogin}
									<form
										class="flex w-full max-w-md flex-col"
										onsubmit={handleSubmit}
										transition:slide
									>
										<div class="flex flex-col gap-2">
											<div class="input-group grid-cols-[auto_1fr_auto]">
												<div class="ig-cell preset-tonal">Email</div>
												<input
													type="email"
													id="email"
													bind:value={newProfile.email}
													placeholder="jane@example.com"
													class="ig-input {emailTouched && !emailIsValid
														? 'border-red-500'
														: emailTouched && emailIsValid
															? 'border-green-500'
															: ''}"
													required
													oninput={() => (emailTouched = true)}
												/>
											</div>
											{#if emailTouched && !emailIsValid}
												<p class="text-sm text-red-500" transition:slide>
													Please enter a valid email address.
												</p>
											{/if}
										</div>
										{#if errorMessage}
											<p class="text-red-500" transition:slide>{errorMessage}</p>
										{/if}
										<button
											type="submit"
											class="btn preset-filled-success-500 {loading ? 'animate-pulse' : ''}"
											disabled={loading}
										>
											Login to Manage Profile
										</button>
									</form>
								{/if}
							{/if}
						</section>
					{/if}
				</div>
			</Tabs.Panel>
			<Tabs.Panel value="crash">
				<CrashResponse />
			</Tabs.Panel>
			<Tabs.Panel value="alert">
				<AlertSystem />
			</Tabs.Panel>
		{/snippet}
	</Tabs>
</div>
