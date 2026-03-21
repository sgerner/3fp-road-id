<script>
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCamera from '@lucide/svelte/icons/camera';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSave from '@lucide/svelte/icons/save';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconUserCircle2 from '@lucide/svelte/icons/user-circle-2';
	import IconX from '@lucide/svelte/icons/x';

	const { data } = $props();
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();

	const currentUser = pageData.currentUser ?? null;
	const recommendationOptions = (pageData.recommendationOptions ?? []).filter(Boolean);
	const interestSuggestions = (pageData.interestSuggestions ?? []).filter(Boolean);
	const existingProfile = pageData.profile ?? null;
	const existingContext = pageData.context ?? {
		location: '',
		interests: [],
		recommendation_focus: []
	};

	let fullName = $state(
		existingProfile?.full_name ?? currentUser?.user_metadata?.full_name ?? currentUser?.email ?? ''
	);
	let avatarUrl = $state(existingProfile?.avatar_url ?? '');
	let bio = $state(existingProfile?.bio ?? '');
	let location = $state(existingContext?.location ?? '');
	let interests = $state([...(existingContext?.interests ?? [])]);
	let recommendationFocus = $state([...(existingContext?.recommendation_focus ?? [])]);
	let customInterest = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let saveSuccess = $state('');
	let uploadingAvatar = $state(false);
	let avatarError = $state('');
	let fileInputEl = $state(null);

	const completionScore = $derived.by(() => {
		let score = 0;
		if (avatarUrl) score += 1;
		if (String(fullName || '').trim()) score += 1;
		if (String(location || '').trim()) score += 1;
		if (interests.length > 0) score += 1;
		if (recommendationFocus.length > 0) score += 1;
		return Math.round((score / 5) * 100);
	});

	const profileSummary = $derived.by(() => {
		if (completionScore >= 80) return 'Great signal quality for personalized suggestions.';
		if (completionScore >= 40)
			return 'Good start. Add one or two more details to improve matching.';
		return 'Add a few basics to unlock better group, ride, and volunteer recommendations.';
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
					avatar_url: avatarUrl,
					bio,
					location,
					interests,
					recommendation_focus: recommendationFocus
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to save profile.');
			}

			const savedProfile = payload?.profile ?? null;
			fullName = savedProfile?.full_name ?? fullName;
			avatarUrl = savedProfile?.avatar_url ?? avatarUrl;
			bio = savedProfile?.bio ?? bio;
			location = payload?.context?.location ?? location;
			interests = Array.isArray(payload?.context?.interests)
				? payload.context.interests
				: interests;
			recommendationFocus = Array.isArray(payload?.context?.recommendation_focus)
				? payload.context.recommendation_focus
				: recommendationFocus;

			saveSuccess = 'Profile saved. Suggestions will now reflect these preferences.';

			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('profile-updated', {
						detail: {
							profile: savedProfile
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
		content="Set your profile basics so 3 Feet Please can suggest better groups, rides, and volunteer opportunities."
	/>
</svelte:head>

<div class="profile-page mx-auto flex w-full max-w-7xl flex-col gap-8">
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(290px,0.8fr)] lg:p-10"
		>
			<div class="flex flex-col gap-6">
				<div class="space-y-3">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconUserCircle2 class="h-3.5 w-3.5" />
						Profile
					</span>
					<h1 class="profile-headline max-w-3xl text-4xl font-extrabold tracking-tight lg:text-5xl">
						Shape your experience.<br />
						<span class="profile-headline-accent">Get better suggestions.</span>
					</h1>
					<p class="max-w-2xl text-base leading-relaxed opacity-80">
						Better match with local groups, upcoming rides, and volunteer opportunities.
					</p>
				</div>
			</div>

			<div
				class="search-panel card preset-filled-surface-50-950 flex flex-col gap-4 p-6 shadow-2xl"
			>
				{#if currentUser}
					<div class="flex items-center gap-3">
						<div class="avatar-preview shrink-0">
							{#if avatarUrl}
								<img src={avatarUrl} alt="Profile" class="h-full w-full object-cover" />
							{:else}
								<span>{avatarFallback}</span>
							{/if}
						</div>
						<div class="min-w-0">
							<p class="text-sm font-semibold">
								{fullName || currentUser?.email || 'Rider profile'}
							</p>
							<p class="text-xs opacity-70">{profileSummary}</p>
						</div>
					</div>
					<button
						type="button"
						class="btn preset-filled-primary-500 mt-auto gap-2"
						onclick={saveProfile}
						disabled={saving}
					>
						<IconSave class="h-4 w-4" />
						{saving ? 'Saving…' : 'Save profile'}
					</button>
				{:else}
					<div class="space-y-3">
						<p class="text-sm font-semibold">Log in to create your profile</p>
						<p class="text-sm opacity-75">
							Sign in from the top-right menu, then return here to personalize your recommendations.
						</p>
						<a class="btn preset-filled-primary-500" href="/">Go to home</a>
					</div>
				{/if}
			</div>
		</div>
	</section>

	{#if currentUser}
		<section class="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
			<div class="card preset-tonal-surface form-card space-y-5 p-6">
				<div>
					<p class="label opacity-60">Essentials</p>
					<h2 class="text-2xl font-bold">Identity and location</h2>
				</div>

				<div class="flex flex-wrap items-center gap-4">
					<div class="avatar-editor shrink-0">
						{#if avatarUrl}
							<img src={avatarUrl} alt="Profile" class="h-full w-full object-cover" />
						{:else}
							<span>{avatarFallback}</span>
						{/if}
					</div>
					<div class="flex flex-wrap gap-2">
						<input
							bind:this={fileInputEl}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							class="hidden"
							onchange={handleAvatarInput}
						/>
						<button
							type="button"
							class="btn preset-outlined-primary-500 gap-2"
							onclick={() => fileInputEl?.click()}
							disabled={uploadingAvatar}
						>
							<IconCamera class="h-4 w-4" />
							{uploadingAvatar ? 'Uploading…' : 'Upload photo'}
						</button>
						{#if avatarUrl}
							<button
								type="button"
								class="btn preset-tonal-warning"
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
					<p class="text-error-600-400 text-sm">{avatarError}</p>
				{/if}

				<label class="flex flex-col gap-2">
					<span class="label">Display name</span>
					<input
						class="input bg-surface-50-950/10"
						bind:value={fullName}
						maxlength="120"
						placeholder="How should we show your name?"
					/>
				</label>

				<label class="flex flex-col gap-2">
					<span class="label flex items-center gap-1.5">
						<IconMapPin class="h-3.5 w-3.5" />
						General location
					</span>
					<input
						class="input bg-surface-50-950/10"
						bind:value={location}
						maxlength="120"
						placeholder="City, State (example: Phoenix, AZ)"
					/>
					<p class="text-xs opacity-60">Use a broad location. A city/state combo is perfect.</p>
				</label>

				<label class="flex flex-col gap-2">
					<span class="label">Short bio (optional)</span>
					<textarea
						class="textarea bg-surface-50-950/10 min-h-28"
						bind:value={bio}
						maxlength="600"
						placeholder="A sentence or two about your riding style or what you care about."
					></textarea>
				</label>
			</div>

			<div class="space-y-6">
				<div class="card preset-tonal-surface form-card space-y-4 p-6">
					<div>
						<p class="label opacity-60">Interests</p>
						<h2 class="text-xl font-bold">What are you into?</h2>
					</div>
					<p class="text-sm opacity-75">
						Pick the things that best describe what you like to do. Keep it lightweight.
					</p>

					<div class="flex flex-wrap gap-2">
						{#each interestSuggestions as suggestion}
							<button
								type="button"
								class={`chip ${
									interests.some((item) => item.toLowerCase() === suggestion.toLowerCase())
										? 'preset-filled-primary-500'
										: 'preset-tonal-surface'
								}`}
								onclick={() => toggleInterest(suggestion)}
							>
								{suggestion}
							</button>
						{/each}
					</div>

					<div class="flex flex-wrap gap-2">
						{#each interests as interest}
							<span class="chip preset-tonal-secondary gap-1.5">
								{interest}
								<button
									type="button"
									class="inline-flex rounded-full p-0.5 hover:bg-black/15"
									onclick={() => removeInterest(interest)}
									aria-label={`Remove ${interest}`}
								>
									<IconX class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>

					<div class="flex gap-2">
						<input
							class="input bg-surface-50-950/10"
							bind:value={customInterest}
							placeholder="Add interest"
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
							class="btn preset-outlined-primary-500 gap-1.5"
							onclick={addCustomInterest}
						>
							<IconPlus class="h-4 w-4" />
							Add
						</button>
					</div>
				</div>

				<div class="card preset-tonal-surface form-card space-y-4 p-6">
					<div>
						<p class="label opacity-60">Recommendation focus</p>
						<h2 class="text-xl font-bold">What should we prioritize?</h2>
					</div>
					<div class="grid gap-2">
						{#each recommendationOptions as option}
							{@const FocusIcon = focusIcon(option.value)}
							<button
								type="button"
								class={`focus-option text-left ${recommendationFocus.includes(option.value) ? 'is-selected' : ''}`}
								onclick={() => toggleRecommendationFocus(option.value)}
							>
								<div class="flex items-start gap-3">
									<FocusIcon class="h-5 w-5 shrink-0" />
									<div>
										<div class="font-semibold">{option.label}</div>
										<div class="text-xs opacity-70">{option.description}</div>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section class="card preset-tonal-surface rounded-2xl p-4">
			<div class="flex flex-wrap items-center gap-3">
				<button
					type="button"
					class="btn preset-filled-primary-500 gap-2"
					onclick={saveProfile}
					disabled={saving}
				>
					<IconSave class="h-4 w-4" />
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				{#if saveError}
					<p class="text-error-600-400 text-sm">{saveError}</p>
				{/if}
				{#if saveSuccess}
					<p class="text-success-600-400 text-sm">{saveSuccess}</p>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.profile-headline {
		color: var(--color-primary-50);
	}

	.profile-headline-accent {
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

	.search-panel {
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.form-card {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.avatar-preview {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 9999px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.95rem;
		background: color-mix(in oklab, var(--color-primary-500) 18%, var(--color-surface-900) 82%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.avatar-editor {
		width: 4.75rem;
		height: 4.75rem;
		border-radius: 1rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.05rem;
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-900) 86%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.focus-option {
		width: 100%;
		padding: 0.8rem 0.9rem;
		border-radius: 0.9rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-200) 10%, transparent);
		transition:
			border-color 150ms ease,
			background 150ms ease,
			transform 150ms ease;
	}

	.focus-option:hover {
		transform: translateY(-1px);
		border-color: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.focus-option.is-selected {
		background: color-mix(in oklab, var(--color-primary-500) 16%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 45%, transparent);
	}
</style>
