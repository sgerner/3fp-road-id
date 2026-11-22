<script>
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCamera from '@lucide/svelte/icons/camera';
	import IconContact from '@lucide/svelte/icons/contact';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconHeartPulse from '@lucide/svelte/icons/heart-pulse';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSave from '@lucide/svelte/icons/save';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconUserCircle2 from '@lucide/svelte/icons/user-circle-2';
	import IconX from '@lucide/svelte/icons/x';
	import { formatPhoneNumber } from '#lib/utils/phone';

	const ALLERGY_OPTIONS = ['Latex', 'Penicillin', 'Sulfa', 'Iodine'];
	const MEDICATION_OPTIONS = ['Insulin', 'Blood Thinners', 'Albuterol', 'Aspirin'];
	const DEFAULT_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

	const { data } = $props();
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();

	const currentUser = pageData.currentUser ?? null;
	const recommendationOptions = (pageData.recommendationOptions ?? []).filter(Boolean);
	const interestSuggestions = (pageData.interestSuggestions ?? []).filter(Boolean);
	const bloodTypeOptions = pageData.bloodTypeOptions?.length
		? pageData.bloodTypeOptions
		: DEFAULT_BLOOD_TYPES;
	const existingProfile = pageData.profile ?? null;
	const existingSafety = pageData.safetyProfile ?? {
		blood_type: '',
		allergies: '',
		medication: ''
	};
	const existingContext = pageData.context ?? {
		location: '',
		interests: [],
		recommendation_focus: []
	};

	let contactKeyCounter = 0;
	function nextContactKey() {
		contactKeyCounter += 1;
		return `ec-${contactKeyCounter}`;
	}

	function toEditableContacts(rows) {
		if (!Array.isArray(rows) || rows.length === 0) {
			return [
				{
					localKey: nextContactKey(),
					id: null,
					contact_name: '',
					contact_relationship: '',
					contact_phone: ''
				}
			];
		}
		return rows.map((row) => ({
			localKey: row?.id ? `id-${row.id}` : nextContactKey(),
			id: row?.id ?? null,
			contact_name: row?.contact_name ?? '',
			contact_relationship: row?.contact_relationship ?? '',
			contact_phone: formatPhoneNumber(row?.contact_phone ?? '')
		}));
	}

	let fullName = $state(
		existingProfile?.full_name ?? currentUser?.user_metadata?.full_name ?? currentUser?.email ?? ''
	);
	let phone = $state(formatPhoneNumber(existingProfile?.phone ?? ''));
	let avatarUrl = $state(existingProfile?.avatar_url ?? '');
	let bio = $state(existingProfile?.bio ?? '');
	let bloodType = $state(existingSafety?.blood_type ?? '');
	let allergies = $state(existingSafety?.allergies ?? '');
	let medication = $state(existingSafety?.medication ?? '');
	let emergencyContacts = $state(toEditableContacts(pageData.emergencyContacts));
	let claimedCodes = $state([...(pageData.claimedCodes ?? [])]);
	let claimedNoticeCode = $state(pageData.claimedCode ?? null);

	let hasSmsSubscription = $state(pageData.hasSmsSubscription === true);
	let smsPhone = $state(pageData.smsPreferences?.phone ?? '');
	let smsConsent = $state(pageData.smsPreferences?.status === 'active');
	let smsRideReminders = $state(pageData.smsPreferences?.ride_reminders === true);
	let smsVolunteerReminders = $state(pageData.smsPreferences?.volunteer_reminders === true);
	let smsAdminMessages = $state(pageData.smsPreferences?.admin_messages === true);
	let smsBikeValetMessages = $state(pageData.smsPreferences?.bike_valet_messages === true);
	let location = $state(existingContext?.location ?? '');
	let interests = $state([...(existingContext?.interests ?? [])]);
	let recommendationFocus = $state([...(existingContext?.recommendation_focus ?? [])]);
	let customInterest = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let saveSuccess = $state('');
	let locationConfirmation = $state(existingContext?.home_location?.label ?? '');
	let uploadingAvatar = $state(false);
	let avatarError = $state('');
	let fileInputEl = $state(null);

	const hasSavedEmergencyContact = $derived.by(() =>
		emergencyContacts.some(
			(contact) =>
				String(contact.contact_name || '').trim() && String(contact.contact_phone || '').trim()
		)
	);

	const completionScore = $derived.by(() => {
		let score = 0;
		if (avatarUrl) score += 1;
		if (String(fullName || '').trim()) score += 1;
		if (String(location || '').trim()) score += 1;
		if (interests.length > 0) score += 1;
		if (recommendationFocus.length > 0) score += 1;
		if (hasSavedEmergencyContact) score += 1;
		return Math.round((score / 6) * 100);
	});

	const profileSummary = $derived.by(() => {
		if (completionScore >= 80)
			return 'Great signal quality for suggestions, shifts, and rider safety.';
		if (completionScore >= 40)
			return 'Good start. Add emergency contact or riding details to complete your profile.';
		return 'Add a few basics and an emergency contact for rides, shifts, and Road ID.';
	});

	function normalizeInterest(value) {
		return String(value || '')
			.trim()
			.replace(/\s+/g, ' ')
			.slice(0, 40);
	}

	function toggleInterest(value) {
		const interest = normalizeInterest(value);
		if (!interest) return;
		if (interests.some((item) => item.toLowerCase() === interest.toLowerCase())) {
			interests = interests.filter((item) => item.toLowerCase() !== interest.toLowerCase());
			return;
		}
		if (interests.length >= 12) return;
		interests = [...interests, interest];
	}

	function addCustomInterest() {
		const interest = normalizeInterest(customInterest);
		if (!interest) return;
		toggleInterest(interest);
		customInterest = '';
	}

	function removeInterest(value) {
		interests = interests.filter(
			(item) => item.toLowerCase() !== String(value || '').toLowerCase()
		);
	}

	function toggleRecommendationFocus(value) {
		const normalized = String(value || '').toLowerCase();
		if (!['groups', 'rides', 'volunteer'].includes(normalized)) return;
		if (recommendationFocus.includes(normalized)) {
			recommendationFocus = recommendationFocus.filter((item) => item !== normalized);
			return;
		}
		recommendationFocus = [...recommendationFocus, normalized];
	}

	function parseCommaTokens(raw) {
		return String(raw || '')
			.split(',')
			.map((token) => token.trim())
			.filter(Boolean);
	}

	function isTokenSelected(raw, target) {
		const needle = target.toLowerCase();
		return parseCommaTokens(raw).some((item) => {
			const normalized = item.toLowerCase() === 'asprin' ? 'aspirin' : item.toLowerCase();
			return normalized === needle;
		});
	}

	function toggleAllergyOption(option) {
		const current = parseCommaTokens(allergies);
		const exists = current.some((item) => item.toLowerCase() === option.toLowerCase());
		const next = exists
			? current.filter((item) => item.toLowerCase() !== option.toLowerCase())
			: [...current, option];
		allergies = next.join(', ');
	}

	function toggleMedicationOption(option) {
		const current = parseCommaTokens(medication).map((item) =>
			item.toLowerCase() === 'asprin' ? 'Aspirin' : item
		);
		const exists = current.some((item) => item.toLowerCase() === option.toLowerCase());
		const next = exists
			? current.filter((item) => item.toLowerCase() !== option.toLowerCase())
			: [...current, option];
		medication = next.join(', ');
	}

	function addEmergencyContactRow() {
		if (emergencyContacts.length >= 10) return;
		emergencyContacts = [
			...emergencyContacts,
			{
				localKey: nextContactKey(),
				id: null,
				contact_name: '',
				contact_relationship: '',
				contact_phone: ''
			}
		];
	}

	function removeEmergencyContactRow(localKey) {
		const remaining = emergencyContacts.filter((item) => item.localKey !== localKey);
		emergencyContacts = remaining.length
			? remaining
			: [
					{
						localKey: nextContactKey(),
						id: null,
						contact_name: '',
						contact_relationship: '',
						contact_phone: ''
					}
				];
	}

	function focusIcon(value) {
		if (value === 'groups') return IconUsers;
		if (value === 'rides') return IconBike;
		return IconHandHeart;
	}

	function toInitials(value) {
		const parts = String(value || '')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!parts.length) return 'U';
		const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
		return initials.join('') || 'U';
	}

	const avatarFallback = $derived.by(() => toInitials(fullName || currentUser?.email || 'Rider'));

	async function handleAvatarInput(event) {
		const file = event?.currentTarget?.files?.[0];
		if (!file) return;

		uploadingAvatar = true;
		avatarError = '';
		saveError = '';
		saveSuccess = '';

		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch('/api/profile/avatar', {
				method: 'POST',
				body: formData
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to upload profile picture.');
			}
			avatarUrl = String(payload?.url || '').trim();
		} catch (error) {
			avatarError = error?.message || 'Unable to upload profile picture.';
		} finally {
			uploadingAvatar = false;
			if (fileInputEl) fileInputEl.value = '';
		}
	}

	async function saveProfile() {
		if (!currentUser?.id || saving) return;

		saving = true;
		saveError = '';
		saveSuccess = '';

		try {
			const response = await fetch('/api/profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					full_name: fullName,
					phone,
					avatar_url: avatarUrl,
					bio,
					location,
					interests,
					recommendation_focus: recommendationFocus,
					safety: {
						blood_type: bloodType,
						allergies,
						medication,
						emergency_contacts: emergencyContacts.map((contact) => ({
							id: contact.id,
							contact_name: contact.contact_name,
							contact_relationship: contact.contact_relationship,
							contact_phone: contact.contact_phone
						}))
					}
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to save profile.');
			}

			const savedProfile = payload?.profile ?? null;
			fullName = savedProfile?.full_name ?? fullName;
			phone = formatPhoneNumber(savedProfile?.phone ?? '');
			avatarUrl = savedProfile?.avatar_url ?? avatarUrl;
			bio = savedProfile?.bio ?? bio;
			if (payload?.safetyProfile) {
				bloodType = payload.safetyProfile.blood_type ?? '';
				allergies = payload.safetyProfile.allergies ?? '';
				medication = payload.safetyProfile.medication ?? '';
			}
			if (Array.isArray(payload?.emergencyContacts)) {
				emergencyContacts = toEditableContacts(payload.emergencyContacts);
			}
			if (Array.isArray(payload?.claimedCodes)) {
				claimedCodes = payload.claimedCodes;
			}
			location = payload?.context?.location ?? location;
			locationConfirmation = payload?.context?.home_location?.label ?? location;
			interests = Array.isArray(payload?.context?.interests)
				? payload.context.interests
				: interests;
			recommendationFocus = Array.isArray(payload?.context?.recommendation_focus)
				? payload.context.recommendation_focus
				: recommendationFocus;

			const shouldSaveSms =
				hasSmsSubscription ||
				smsConsent ||
				smsRideReminders ||
				smsVolunteerReminders ||
				smsAdminMessages ||
				smsBikeValetMessages ||
				Boolean(String(smsPhone || '').trim());

			if (shouldSaveSms) {
				const smsResponse = await fetch('/api/sms/preferences', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						phone: smsPhone,
						preserve_profile_phone: true,
						sms_consent: smsConsent,
						ride_reminders: smsRideReminders,
						volunteer_reminders: smsVolunteerReminders,
						admin_messages: smsAdminMessages,
						bike_valet_messages: smsBikeValetMessages
					})
				});
				const smsPayload = await smsResponse.json().catch(() => ({}));
				if (!smsResponse.ok) {
					throw new Error(smsPayload?.error || 'Unable to save SMS preferences.');
				}
				const savedSms = smsPayload?.preferences ?? null;
				if (savedSms) {
					smsPhone = savedSms.phone ?? smsPhone;
					smsConsent = savedSms.status === 'active';
					smsRideReminders = savedSms.ride_reminders === true;
					smsVolunteerReminders = savedSms.volunteer_reminders === true;
					smsAdminMessages = savedSms.admin_messages === true;
					smsBikeValetMessages = savedSms.bike_valet_messages === true;
					hasSmsSubscription = Boolean(savedSms.phone);
				}
			}

			saveSuccess = 'Profile, safety details, and preferences saved.';

			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('profile-updated', {
						detail: {
							profile: savedProfile,
							claimedCodes
						}
					})
				);
			}
		} catch (error) {
			saveError = error?.message || 'Unable to save profile.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Profile · 3 Feet Please</title>
	<meta
		name="description"
		content="Manage your rider profile, emergency contacts, medical notes, and claimed Road ID bracelets in one place."
	/>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-x-clip"
>
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
		aria-labelledby="profile-heading"
	>
		<div
			class="border-primary-500 flex min-w-0 flex-col justify-between gap-5 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<p
				class="text-primary-500 m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				<IconUserCircle2 class="h-4 w-4" />
				<span>Profile &amp; Road ID</span>
			</p>

			<div class="flex flex-col gap-3">
				<h1
					id="profile-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Shape your experience. <span class="text-primary-500">Ride prepared.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-2xl text-base leading-snug font-medium">
					Manage your identity, Road ID medical notes, emergency contacts, and local riding
					preferences in one place.
				</p>
			</div>

			{#if currentUser}
				<div class="flex flex-wrap items-center gap-3">
					<a
						href="#safety"
						class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
					>
						<IconHeartPulse class="h-4 w-4 shrink-0" />
						Jump to Safety &amp; Road ID
					</a>
					{#if claimedCodes.length > 0}
						<span
							class="bg-surface-900 border-surface-700 text-primary-500 inline-flex min-h-11 items-center border px-3.5 py-2 text-xs font-black tracking-[0.18em] uppercase"
						>
							{claimedCodes.length}
							{claimedCodes.length === 1 ? 'Claimed Bracelet' : 'Claimed Bracelets'}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<div
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-secondary-500 flex min-w-0 flex-col justify-between gap-5 border-t-4 px-6 py-7 sm:px-10 lg:border-l-2 lg:px-10 lg:py-8"
		>
			{#if currentUser}
				<div class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<span
							class="bg-primary-500 text-surface-950 px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
						>
							{completionScore}% Complete
						</span>
					</div>
					<div class="flex items-center gap-4">
						<div
							class="bg-surface-950 text-primary-500 border-primary-500 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border-2 text-base font-black"
						>
							{#if avatarUrl}
								<img src={avatarUrl} alt="Profile" class="h-full w-full object-cover" />
							{:else}
								<span>{avatarFallback}</span>
							{/if}
						</div>
						<div class="min-w-0">
							<p class="m-0 truncate text-lg font-black uppercase">
								{fullName || currentUser?.email || 'Rider profile'}
							</p>
							<p class="text-surface-300 m-0 mt-0.5 text-xs leading-snug">{profileSummary}</p>
						</div>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<button
						type="button"
						class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
						onclick={saveProfile}
						disabled={saving}
					>
						<IconSave class="h-4 w-4" />
						{saving ? 'Saving…' : 'Save profile'}
					</button>
					{#if saveError}
						<p
							class="bg-tertiary-500 text-surface-950 m-0 px-3 py-2 text-xs font-bold"
							role="alert"
						>
							{saveError}
						</p>
					{/if}
					{#if saveSuccess}
						<p
							class="bg-primary-500 text-surface-950 m-0 px-3 py-2 text-xs font-black uppercase"
							role="status"
						>
							{saveSuccess}
						</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<span
						class="bg-primary-500 text-surface-950 self-start px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
					>
						Members
					</span>
					<h2 class="text-surface-50! m-0 text-2xl leading-none font-black uppercase italic">
						Log in to create your profile
					</h2>
					<p class="text-surface-300 m-0 text-sm leading-relaxed">
						Sign in to save your location, emergency contacts, Road ID medical details, and riding
						preferences.
					</p>
				</div>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center gap-2 self-start px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
					onclick={(event) => {
						event.stopPropagation();
						window.dispatchEvent(new Event('open-login'));
					}}
				>
					Log in / Register
				</button>
			{/if}
		</div>
	</section>

	{#if currentUser}
		<!-- ESSENTIALS + INTERESTS/FOCUS -->
		<section
			class="bg-surface-950 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
			aria-labelledby="essentials-heading"
		>
			<div
				class="lg:border-surface-800 flex min-w-0 flex-col gap-8 px-6 py-12 sm:px-10 lg:border-r lg:px-14 lg:py-16"
			>
				<div class="flex items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
						aria-hidden="true"
					>
						01
					</span>
					<div class="flex min-w-0 flex-col gap-1">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Essentials
						</p>
						<h2
							id="essentials-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
						>
							Identity and location
						</h2>
					</div>
				</div>

				<div class="border-surface-800 flex flex-wrap items-center gap-5 border-t pt-6">
					<div
						class="bg-secondary-500 text-surface-50 border-primary-500 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border-[3px] text-xl font-black"
					>
						{#if avatarUrl}
							<img src={avatarUrl} alt="Profile" class="h-full w-full object-cover" />
						{:else}
							<span>{avatarFallback}</span>
						{/if}
					</div>
					<div class="flex flex-wrap gap-3">
						<input
							bind:this={fileInputEl}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							class="hidden"
							onchange={handleAvatarInput}
						/>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex min-h-11 items-center gap-2 px-5 py-3 text-sm font-black tracking-wide uppercase transition"
							onclick={() => fileInputEl?.click()}
							disabled={uploadingAvatar}
						>
							<IconCamera class="h-4 w-4" />
							{uploadingAvatar ? 'Uploading…' : 'Upload photo'}
						</button>
						{#if avatarUrl}
							<button
								type="button"
								class="border-surface-50 text-surface-50 hover:bg-tertiary-500 hover:border-tertiary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-5 py-3 text-sm font-black tracking-wide uppercase transition"
								onclick={() => {
									avatarUrl = '';
									avatarError = '';
								}}
							>
								Remove photo
							</button>
						{/if}
					</div>
				</div>
				{#if avatarError}
					<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold" role="alert">
						{avatarError}
					</p>
				{/if}

				<div class="flex flex-col gap-6">
					<label class="flex flex-col gap-2">
						<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Display name
						</span>
						<input
							id="profile-full-name"
							class="input bg-surface-900 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
							bind:value={fullName}
							autocomplete="name"
							maxlength="120"
							placeholder="How should we show your name?"
						/>
					</label>

					<label class="flex flex-col gap-2">
						<span
							class="text-primary-500 flex items-center gap-1.5 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconPhone class="h-3.5 w-3.5" />
							Phone number (optional)
						</span>
						<input
							id="profile-phone"
							type="tel"
							autocomplete="tel"
							class="input bg-surface-900 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
							bind:value={phone}
							maxlength="24"
							placeholder="(480) 555-0123"
						/>
						<p class="text-surface-300 m-0 text-xs leading-relaxed">
							Shared with your Road ID emergency profile and volunteer signups. Entering a phone
							here never opts you into SMS text alerts.
						</p>
					</label>

					<label class="flex flex-col gap-2">
						<span
							class="text-primary-500 flex items-center gap-1.5 text-xs font-bold tracking-[0.22em] uppercase"
						>
							<IconMapPin class="h-3.5 w-3.5" />
							General location
						</span>
						<input
							class="input bg-surface-900 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
							bind:value={location}
							maxlength="120"
							placeholder="City, State (example: Phoenix, AZ)"
						/>
						<p class="text-surface-300 m-0 text-xs leading-relaxed">
							Use a city or neighborhood—we’ll resolve it to a map point for nearby suggestions. No
							street address needed.
						</p>
						{#if locationConfirmation}
							<p class="text-primary-500 m-0 text-xs font-bold uppercase">
								Saved area: {locationConfirmation}
							</p>
						{/if}
					</label>

					<label class="flex flex-col gap-2">
						<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Short bio (optional)
						</span>
						<textarea
							class="textarea bg-surface-900 border-surface-500 text-surface-50 focus:border-primary-500 min-h-32"
							bind:value={bio}
							maxlength="600"
							placeholder="A sentence or two about your riding style or what you care about."
						></textarea>
					</label>
				</div>
			</div>

			<div class="divide-surface-800 flex min-w-0 flex-col divide-y-2">
				<!-- Interests -->
				<div class="flex min-w-0 flex-col gap-6 px-6 py-12 sm:px-10 lg:px-12 lg:py-14">
					<div class="flex items-start gap-4">
						<span
							class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
							aria-hidden="true"
						>
							02
						</span>
						<div class="flex min-w-0 flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Interests
							</p>
							<h2
								class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
							>
								What are you into?
							</h2>
						</div>
					</div>
					<p class="text-surface-300 m-0 text-sm leading-relaxed">
						Pick the things that best describe what you like to do. Keep it lightweight.
					</p>

					<div class="flex flex-wrap gap-2">
						{#each interestSuggestions as suggestion (suggestion)}
							{@const active = interests.some(
								(item) => item.toLowerCase() === suggestion.toLowerCase()
							)}
							<button
								type="button"
								aria-pressed={active}
								class={`inline-flex min-h-11 items-center border-2 px-4 py-2.5 text-xs font-black tracking-wider uppercase transition ${
									active
										? 'bg-primary-500 text-surface-950 border-primary-500'
										: 'bg-surface-900 text-surface-50 border-surface-500 hover:border-primary-500'
								}`}
								onclick={() => toggleInterest(suggestion)}
							>
								{suggestion}
							</button>
						{/each}
					</div>

					{#if interests.length}
						<div class="flex flex-wrap gap-2">
							{#each interests as interest (interest)}
								<span
									class="bg-secondary-500 text-surface-50 inline-flex min-h-11 items-center gap-1 pl-3.5 text-xs font-black uppercase"
								>
									<span>{interest}</span>
									<button
										type="button"
										class="hover:text-primary-500 inline-flex min-h-11 min-w-11 items-center justify-center"
										onclick={() => removeInterest(interest)}
										aria-label={`Remove ${interest}`}
									>
										<IconX class="h-4 w-4" />
									</button>
								</span>
							{/each}
						</div>
					{/if}

					<div class="flex flex-wrap gap-2 sm:flex-nowrap">
						<input
							class="input bg-surface-900 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 min-w-0 flex-1"
							bind:value={customInterest}
							placeholder="Add interest"
							aria-label="Add custom interest"
							maxlength="40"
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									addCustomInterest();
								}
							}}
						/>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-5 py-2.5 text-sm font-black uppercase transition"
							onclick={addCustomInterest}
						>
							<IconPlus class="h-4 w-4" />
							Add
						</button>
					</div>
				</div>

				<!-- Recommendation focus -->
				<div class="flex min-w-0 flex-col gap-6 px-6 py-12 sm:px-10 lg:px-12 lg:py-14">
					<div class="flex items-start gap-4">
						<span
							class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
							aria-hidden="true"
						>
							03
						</span>
						<div class="flex min-w-0 flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Recommendation focus
							</p>
							<h2
								class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
							>
								What should we prioritize?
							</h2>
						</div>
					</div>
					<div class="border-surface-50 flex flex-col border-t-2">
						{#each recommendationOptions as option (option.value)}
							{@const FocusIcon = focusIcon(option.value)}
							{@const selected = recommendationFocus.includes(option.value)}
							<button
								type="button"
								aria-pressed={selected}
								class={`border-surface-800 flex min-h-11 w-full items-start gap-4 border-b px-4 py-4 text-left transition ${
									selected
										? 'bg-primary-500 text-surface-950'
										: 'text-surface-50 hover:bg-surface-900'
								}`}
								onclick={() => toggleRecommendationFocus(option.value)}
							>
								<FocusIcon class="mt-0.5 h-6 w-6 shrink-0" />
								<div class="min-w-0 flex-1">
									<div class="text-base font-black uppercase">{option.label}</div>
									<div class={`text-xs ${selected ? 'opacity-90' : 'text-surface-300'}`}>
										{option.description}
									</div>
								</div>
								<span class="text-xs font-black tracking-widest uppercase">
									{selected ? 'Active' : 'Select'}
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- SAFETY & ROAD ID -->
		<section
			id="safety"
			class="bg-surface-900 text-surface-50 border-t-primary-500 flex scroll-mt-24 flex-col gap-10 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="safety-heading"
		>
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div class="flex max-w-3xl items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
						aria-hidden="true"
					>
						04
					</span>
					<div class="flex min-w-0 flex-col gap-2">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Safety &amp; Road ID
						</p>
						<h2
							id="safety-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
						>
							Medical details, contacts, and bracelets
						</h2>
						<p class="text-surface-300 m-0 text-base leading-relaxed">
							Save emergency contacts and medical notes once. Your primary contact prefills
							volunteer signups automatically, and claimed In Case bracelets display this responder
							summary on scan.
						</p>
					</div>
				</div>
				<a
					href="/roadid"
					class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
				>
					<IconContact class="h-4 w-4 shrink-0" />
					Road ID &amp; responder tools
				</a>
			</div>

			{#if claimedNoticeCode}
				<div
					class="bg-primary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 p-5"
					role="status"
				>
					<div class="min-w-0 flex-1">
						<p class="m-0 text-xs font-black tracking-[0.2em] uppercase">Bracelet Linked</p>
						<p class="m-0 mt-1 text-sm font-bold">
							Code <strong>{claimedNoticeCode}</strong> is attached to your rider profile. Review your
							medical details and emergency contacts below, then click Save profile to publish any updates.
						</p>
					</div>
					<a
						href={`/roadid/${encodeURIComponent(claimedNoticeCode)}`}
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
					>
						Preview bracelet
						<IconExternalLink class="h-3.5 w-3.5" />
					</a>
				</div>
			{/if}

			<!-- Claimed Bracelets Bar -->
			<div class="bg-surface-950 border-t-secondary-500 flex flex-col gap-4 border-t-4 p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Claimed In Case Bracelets
						</p>
						<h3 class="text-surface-50! m-0 mt-1 text-xl font-black uppercase">
							{#if claimedCodes.length > 0}
								Responder Scan Previews ({claimedCodes.length})
							{:else}
								No Physical Bracelet Claimed Yet
							{/if}
						</h3>
					</div>
				</div>

				{#if claimedCodes.length > 0}
					<div class="flex flex-wrap gap-3">
						{#each claimedCodes as code (code)}
							<a
								href={`/roadid/${encodeURIComponent(code)}`}
								class="border-primary-500 bg-surface-900 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2.5 border-2 px-4 py-2.5 text-sm font-black tracking-wider uppercase transition"
							>
								<IconContact class="h-4 w-4 shrink-0" />
								<span>Preview /roadid/{code}</span>
								<IconExternalLink class="h-4 w-4 shrink-0" />
							</a>
						{/each}
					</div>
				{:else}
					<p class="text-surface-300 m-0 max-w-3xl text-sm leading-relaxed">
						You do not need a bracelet to save medical notes or emergency contacts here. Anything
						you save now prefills volunteer signups and will automatically appear on any In Case
						bracelet QR code you claim later.
					</p>
				{/if}
			</div>

			<div class="grid gap-10 lg:grid-cols-2">
				<!-- Left Column: Medical Details -->
				<div class="border-surface-50 flex min-w-0 flex-col gap-6 border-t-2 pt-6">
					<div>
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Medical Notes
						</p>
						<h3 class="text-surface-50! m-0 mt-1 text-2xl font-black uppercase">
							Responder Medical Summary
						</h3>
					</div>

					<label class="flex flex-col gap-2" for="profile-blood-type">
						<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
							Blood type
						</span>
						<select
							id="profile-blood-type"
							bind:value={bloodType}
							class="select bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
						>
							<option value="">Select blood type (optional)</option>
							{#each bloodTypeOptions as option (option)}
								<option value={option}>{option}</option>
							{/each}
							{#if bloodType && !bloodTypeOptions.includes(bloodType)}
								<option value={bloodType}>{bloodType}</option>
							{/if}
						</select>
					</label>

					<div class="flex flex-col gap-2.5">
						<p
							id="profile-allergies-label"
							class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
						>
							Common allergies
						</p>
						<div
							class="flex flex-wrap gap-2"
							role="group"
							aria-labelledby="profile-allergies-label"
						>
							{#each ALLERGY_OPTIONS as option (option)}
								{@const selected = isTokenSelected(allergies, option)}
								<button
									type="button"
									aria-pressed={selected}
									class={`inline-flex min-h-11 items-center border-2 px-4 py-2.5 text-xs font-black tracking-wider uppercase transition ${
										selected
											? 'bg-primary-500 text-surface-950 border-primary-500'
											: 'bg-surface-950 text-surface-50 border-surface-500 hover:border-primary-500'
									}`}
									onclick={() => toggleAllergyOption(option)}
								>
									{option}
								</button>
							{/each}
						</div>
						<label class="flex flex-col gap-1.5" for="profile-allergies">
							<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
								Allergies (comma-separated)
							</span>
							<input
								id="profile-allergies"
								type="text"
								bind:value={allergies}
								maxlength="2000"
								placeholder="Penicillin, bee stings, latex"
								class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
							/>
						</label>
					</div>

					<div class="flex flex-col gap-2.5">
						<p
							id="profile-medications-label"
							class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
						>
							Common medications
						</p>
						<div
							class="flex flex-wrap gap-2"
							role="group"
							aria-labelledby="profile-medications-label"
						>
							{#each MEDICATION_OPTIONS as option (option)}
								{@const selected = isTokenSelected(medication, option)}
								<button
									type="button"
									aria-pressed={selected}
									class={`inline-flex min-h-11 items-center border-2 px-4 py-2.5 text-xs font-black tracking-wider uppercase transition ${
										selected
											? 'bg-primary-500 text-surface-950 border-primary-500'
											: 'bg-surface-950 text-surface-50 border-surface-500 hover:border-primary-500'
									}`}
									onclick={() => toggleMedicationOption(option)}
								>
									{option}
								</button>
							{/each}
						</div>
						<label class="flex flex-col gap-1.5" for="profile-medication">
							<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
								Medications (comma-separated)
							</span>
							<textarea
								id="profile-medication"
								rows="3"
								bind:value={medication}
								maxlength="2000"
								placeholder="Albuterol inhaler, blood thinners"
								class="textarea bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500"
							></textarea>
						</label>
					</div>
				</div>

				<!-- Right Column: Emergency Contacts -->
				<div class="border-surface-50 flex min-w-0 flex-col gap-6 border-t-2 pt-6">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Who to Call
							</p>
							<h3 class="text-surface-50! m-0 mt-1 text-2xl font-black uppercase">
								Emergency Contacts
							</h3>
						</div>
						{#if emergencyContacts.length < 10}
							<button
								type="button"
								class="bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex min-h-11 items-center gap-1.5 px-4 py-2.5 text-xs font-black tracking-wider uppercase transition"
								onclick={addEmergencyContactRow}
							>
								<IconPlus class="h-4 w-4" />
								Add contact
							</button>
						{/if}
					</div>

					<p class="text-surface-300 m-0 text-xs leading-relaxed">
						Contact #1 prefills your emergency contact on volunteer shift signups. Emergency contact
						phone numbers are never subscribed to SMS notifications.
					</p>

					<div class="divide-surface-800 flex flex-col divide-y-2">
						{#each emergencyContacts as contact, idx (contact.localKey)}
							<div class="flex min-w-0 flex-col gap-4 py-5 first:pt-0">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<span
										class={`px-2.5 py-1 text-xs font-black tracking-[0.18em] uppercase ${
											idx === 0
												? 'bg-primary-500 text-surface-950'
												: 'bg-surface-950 text-surface-300 border-surface-700 border'
										}`}
									>
										{idx === 0 ? 'Primary Contact · Volunteer & Road ID' : `Contact #${idx + 1}`}
									</span>
									<button
										type="button"
										class="border-tertiary-500 text-tertiary-500 hover:bg-tertiary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-1.5 border-2 px-3.5 py-2 text-xs font-black uppercase transition"
										onclick={() => removeEmergencyContactRow(contact.localKey)}
										aria-label={`Remove emergency contact ${contact.contact_name || idx + 1}`}
									>
										<IconTrash2 class="h-3.5 w-3.5" />
										Remove
									</button>
								</div>

								<div class="grid gap-4 sm:grid-cols-2">
									<label class="flex min-w-0 flex-col gap-1.5">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											Contact name
										</span>
										<input
											type="text"
											bind:value={contact.contact_name}
											maxlength="200"
											placeholder="Alex Rivera"
											class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
										/>
									</label>

									<label class="flex min-w-0 flex-col gap-1.5">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											Relationship
										</span>
										<input
											type="text"
											bind:value={contact.contact_relationship}
											maxlength="120"
											placeholder="Spouse, parent, friend"
											class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
										/>
									</label>
								</div>

								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
										Contact phone
									</span>
									<input
										type="tel"
										autocomplete="off"
										bind:value={contact.contact_phone}
										maxlength="64"
										placeholder="(480) 555-0199"
										class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11"
									/>
								</label>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div class="border-surface-800 flex flex-wrap items-center gap-4 border-t pt-6">
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center gap-2.5 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
					onclick={saveProfile}
					disabled={saving}
				>
					<IconSave class="h-4 w-4" />
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				{#if saveError}
					<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold" role="alert">
						{saveError}
					</p>
				{:else if saveSuccess}
					<p
						class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-sm font-black uppercase"
						role="status"
					>
						{saveSuccess}
					</p>
				{:else}
					<span class="text-surface-300 text-xs">
						Saves your identity, medical notes, and emergency contacts together.
					</span>
				{/if}
			</div>
		</section>

		<!-- SMS UPDATES -->
		<section
			class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-col gap-8 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="sms-heading"
		>
			<div class="flex max-w-3xl flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					05 · Optional notifications
				</p>
				<h2
					id="sms-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
				>
					SMS updates
				</h2>
				<p class="m-0 text-base leading-relaxed opacity-90">
					Choose the kinds of 3 Feet Please messages you want to receive. Frequency varies with your
					upcoming RSVPs, shifts, and conversations; messages are not marketing.
				</p>
			</div>

			<div class="flex max-w-md flex-col gap-2">
				<label class="flex flex-col gap-2" for="sms-mobile-phone">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
						SMS mobile number
					</span>
					<input
						id="sms-mobile-phone"
						class="input bg-surface-950 border-surface-50 text-surface-50 min-h-11"
						bind:value={smsPhone}
						type="tel"
						autocomplete="tel"
						maxlength="20"
						placeholder="(480) 555-0123"
					/>
				</label>
				<span class="text-xs opacity-80">
					Separate from your emergency profile phone. US numbers are saved in E.164 format for
					delivery.
				</span>
				{#if phone && !smsPhone}
					<button
						type="button"
						class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center self-start border-2 px-4 py-2 text-xs font-black tracking-wider uppercase transition"
						onclick={() => {
							smsPhone = phone;
						}}
					>
						Use profile phone number
					</button>
				{/if}
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<label class="sms-option bg-surface-950 border-surface-50 text-surface-50 min-h-11">
					<input
						type="checkbox"
						role="switch"
						aria-checked={smsRideReminders}
						bind:checked={smsRideReminders}
					/>
					<span>
						<strong class="font-black uppercase">Ride reminders</strong>
						<small class="text-surface-300">Upcoming rides you RSVP for.</small>
					</span>
				</label>
				<label class="sms-option bg-surface-950 border-surface-50 text-surface-50 min-h-11">
					<input
						type="checkbox"
						role="switch"
						aria-checked={smsVolunteerReminders}
						bind:checked={smsVolunteerReminders}
					/>
					<span>
						<strong class="font-black uppercase">Volunteer shift reminders</strong>
						<small class="text-surface-300">Upcoming shifts you are assigned to.</small>
					</span>
				</label>
				<label class="sms-option bg-surface-950 border-surface-50 text-surface-50 min-h-11">
					<input
						type="checkbox"
						role="switch"
						aria-checked={smsAdminMessages}
						bind:checked={smsAdminMessages}
					/>
					<span>
						<strong class="font-black uppercase">Ride and volunteer admin messages</strong>
						<small class="text-surface-300">Replies and updates from event admins.</small>
					</span>
				</label>
				<label class="sms-option bg-surface-950 border-surface-50 text-surface-50 min-h-11">
					<input
						type="checkbox"
						role="switch"
						aria-checked={smsBikeValetMessages}
						bind:checked={smsBikeValetMessages}
					/>
					<span>
						<strong class="font-black uppercase">Bike valet coordination</strong>
						<small class="text-surface-300"
							>Claim, pickup, and service details when available.</small
						>
					</span>
				</label>
			</div>
			<p class="m-0 text-xs opacity-85">Category switches are saved with your profile below.</p>

			<label
				class="bg-primary-500 text-surface-950 border-surface-950 flex min-h-11 items-start gap-4 border-[3px] p-5"
			>
				<input class="mt-1 h-5 w-5 shrink-0" type="checkbox" bind:checked={smsConsent} />
				<span class="text-sm leading-relaxed font-medium">
					{pageData.smsConsentText ??
						'By checking this box, I agree to receive recurring 3 Feet Please SMS messages about the categories I select. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to rejoin, or HELP for help.'}
				</span>
			</label>
			<p class="m-0 text-xs leading-relaxed opacity-85">
				SMS is optional. We send plain text only, do not support multimedia, and limit message
				volume to control cost and abuse. You can change these choices here or reply STOP at any
				time. See the <a class="text-primary-500 font-bold underline" href="/terms">Terms</a> and
				<a class="text-primary-500 font-bold underline" href="/privacy">Privacy Policy</a>.
			</p>
		</section>

		<!-- SAVE BAR -->
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-4 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
		>
			<div class="flex flex-wrap items-center gap-4">
				<button
					type="button"
					class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center gap-3 px-8 py-4 text-base font-black tracking-wide uppercase transition"
					onclick={saveProfile}
					disabled={saving}
				>
					<IconSave class="h-5 w-5" />
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				{#if saveError}
					<p class="bg-surface-950 text-tertiary-400 m-0 px-4 py-2 text-sm font-bold" role="alert">
						{saveError}
					</p>
				{/if}
				{#if saveSuccess}
					<p
						class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-sm font-black uppercase"
						role="status"
					>
						{saveSuccess}
					</p>
				{/if}
			</div>
			<span class="text-xs font-black tracking-[0.22em] uppercase">Give 3 Feet · Ride Together</span
			>
		</section>
	{:else}
		<section
			class="bg-surface-950 flex flex-1 flex-col justify-between gap-8 px-6 py-12 sm:px-10 lg:px-14"
		>
			<div class="flex max-w-2xl flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Why create a profile
				</p>
				<h2
					class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
				>
					Local groups, rides, shifts, and emergency Road ID in one place.
				</h2>
			</div>
			<div
				class="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
				aria-hidden="true"
			></div>
		</section>
	{/if}
</div>

<style>
	.sms-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-width: 2px;
		padding: 1rem 1.15rem;
		cursor: pointer;
	}

	.sms-option span {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.sms-option small {
		font-size: 0.78rem;
	}

	.sms-option input[role='switch'] {
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		flex: 0 0 auto;
		width: 3rem;
		height: 1.65rem;
		margin: 0;
		border: 2px solid var(--color-surface-50);
		background: var(--color-surface-800);
		background-image: linear-gradient(var(--color-surface-50), var(--color-surface-50));
		background-repeat: no-repeat;
		background-position: 0.2rem center;
		background-size: 1rem 1rem;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			background-position 150ms ease;
	}

	.sms-option input[role='switch']:checked {
		border-color: var(--color-primary-500);
		background-color: var(--color-primary-500);
		background-image: linear-gradient(var(--color-surface-950), var(--color-surface-950));
		background-position: 1.55rem center;
	}

	.sms-option input[role='switch']:focus-visible {
		outline: 3px solid var(--color-primary-500);
		outline-offset: 3px;
	}
</style>
