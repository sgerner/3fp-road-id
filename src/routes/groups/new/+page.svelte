<script>
	let { data, form } = $props();
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import ImageGeneratorPanel from '$lib/components/ai/ImageGeneratorPanel.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { env } from '$env/dynamic/public';

	function getInitialValues() {
		return form?.values ?? {};
	}
	function getDuplicateCandidates() {
		return form?.duplicate_candidates ?? [];
	}
	function getNeedsDuplicateOverride(candidateCount) {
		return Boolean(form?.needs_duplicate_override && candidateCount);
	}
	const initialValues = getInitialValues();
	const duplicateCandidates = getDuplicateCandidates();
	const needsDuplicateOverride = getNeedsDuplicateOverride(duplicateCandidates.length);
	let duplicateOverrideConfirmed = $state(false);

	function toValueSet(input) {
		if (Array.isArray(input)) return new Set(input.map((value) => String(value)));
		if (input == null || input === '') return new Set();
		return new Set([String(input)]);
	}

	const selectedGroupTypeIds = toValueSet(initialValues.group_type_ids);
	const selectedAudienceFocusIds = toValueSet(initialValues.audience_focus_ids);
	const selectedRidingDisciplineIds = toValueSet(initialValues.riding_discipline_ids);
	const selectedSkillLevelIds = toValueSet(initialValues.skill_level_ids);

	// Simple client-side slug preview
	let name = $state(initialValues.name || '');
	let handle = $state(initialValues.slug || '');
	let handleTouched = $state(Boolean(initialValues.slug));
	let handleStatus = $state(''); // '', 'checking', 'available', 'taken', 'invalid'
	let handleTimer;
	// Optional AI-assisted enrichment inputs
	let aiInstagram = $state(initialValues.aiInstagram || '');
	let aiFacebook = $state(initialValues.aiFacebook || '');
	let aiWebsite = $state(initialValues.aiWebsite || '');
	let aiLoading = $state(false);
	let aiError = $state('');
	// Hidden values we will submit (extra AI fields not shown on this page)
	let hiddenSuggestedWebsite = $state(initialValues.suggested_website_url || '');
	let hiddenSocialLinks = $state(initialValues.social_links || ''); // JSON string
	let hiddenMembershipInfo = $state(initialValues.membership_info || '');
	let hiddenMeetingAddress = $state(initialValues.specific_meeting_point_address || '');
	let hiddenLat = $state(initialValues.latitude || '');
	let hiddenLng = $state(initialValues.longitude || '');
	let hiddenServiceArea = $state(initialValues.service_area_description || '');
	let hiddenSkills = $state(initialValues.skill_levels_description || '');
	let hiddenActivityFrequency = $state(initialValues.activity_frequency || '');
	let hiddenTypicalTime = $state(initialValues.typical_activity_day_time || '');
	let hiddenLogoUrl = $state(initialValues.logo_url || '');
	let hiddenCoverUrl = $state(initialValues.cover_photo_url || '');
	let formEl = $state();
	function applyLocationValue(id, value) {
		const v = value == null ? '' : `${value}`.trim();
		if (id === 'city') city = v;
		if (id === 'state_region') stateRegion = v;
		if (id === 'country') {
			const c = v || country;
			country = c ? c.toUpperCase() : '';
		}
	}
	function updateHiddenLatLng(lat, lng) {
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
		hiddenLat = lat.toFixed(6);
		hiddenLng = lng.toFixed(6);
	}
	function loadGooglePlaces() {
		if (typeof window === 'undefined') return;
		if (window.google?.maps?.places) {
			initGooglePlaces();
			return;
		}
		const key = env.PUBLIC_GOOGLE_MAPS_API_KEY;
		if (!key) {
			console.warn('Missing PUBLIC_GOOGLE_MAPS_API_KEY; cannot geocode group location.');
			return;
		}
		if (document.getElementById('gmaps-places-groups-new')) return;
		const script = document.createElement('script');
		script.id = 'gmaps-places-groups-new';
		script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=beta&callback=initGroupsNewPlaces`;
		script.async = true;
		script.defer = true;
		script.onerror = () => console.error('Failed to load Google Maps Places for new group form.');
		window.initGroupsNewPlaces = initGooglePlaces;
		document.head.appendChild(script);
	}
	function initGooglePlaces() {
		const maps = window.google?.maps;
		if (!maps?.places) return;
		geocoder = geocoder || new maps.Geocoder();
		googleReady = true;
		if (pendingGeocode?.query) {
			scheduleGeocode(pendingGeocode.query, pendingGeocode.country, {
				immediate: true,
				force: true
			});
		}
		if (window.initGroupsNewPlaces === initGooglePlaces) delete window.initGroupsNewPlaces;
	}
	function fetchLatLngWithGeocoder(query, countryCode) {
		if (!geocoder) return Promise.resolve(null);
		return new Promise((resolve) => {
			const request = { address: query };
			if (countryCode) request.componentRestrictions = { country: countryCode };
			geocoder.geocode(request, (results, status) => {
				const okStatus = window.google?.maps?.GeocoderStatus?.OK;
				if (status !== 'OK' && status !== okStatus) {
					resolve(null);
					return;
				}
				const result = results?.[0];
				const loc = result?.geometry?.location;
				if (!loc) {
					resolve(null);
					return;
				}
				const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
				const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
				if (typeof lat === 'number' && typeof lng === 'number') resolve({ lat, lng });
				else resolve(null);
			});
		});
	}
	function runGeocode(config) {
		if (!config) return;
		const currentKey = config.key;
		const execute = async () => {
			try {
				const coords = await fetchLatLngWithGeocoder(config.query, config.country);
				if (!coords) return;
				if (pendingGeocode?.key && pendingGeocode.key !== currentKey) return;
				lastGeocodeKey = currentKey;
				updateHiddenLatLng(coords.lat, coords.lng);
			} catch (error) {
				console.error('Unable to geocode new group location', error);
			}
		};
		void execute();
	}
	function scheduleGeocode(query, countryCode, options = {}) {
		const q = (query || '').trim();
		if (!q) return;
		const countryCodeNorm = (countryCode || '').trim().toUpperCase();
		const key = `${q}|${countryCodeNorm}`;
		if (!options.force && key === lastGeocodeKey) return;
		const config = { query: q, country: countryCodeNorm, key };
		pendingGeocode = config;
		if (!googleReady) return;
		const run = () => runGeocode(config);
		clearTimeout(geocodeTimeout);
		if (options.immediate) run();
		else geocodeTimeout = setTimeout(run, 600);
	}
	let city = $state(initialValues.city || '');
	let stateRegion = $state(initialValues.state_region || '');
	let country = $state(initialValues.country || 'US');
	let googleReady = $state(false);
	let pendingGeocode;
	let lastGeocodeKey = '';
	let geocodeTimeout;
	let geocoder;
	async function suggestFromAI() {
		aiError = '';
		aiLoading = true;
		try {
			const res = await fetch('/api/ai/enrich-group', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instagram: aiInstagram.trim() || null,
					facebook: aiFacebook.trim() || null,
					website: aiWebsite.trim() || null,
					name
				})
			});
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t || 'AI request failed');
			}
			const payload = await res.json();
			const f = payload.fields || {};
			const setVal = (id, v) => {
				if (v == null) return;
				const str = typeof v === 'string' ? v : `${v}`;
				const el = document.getElementById(id);
				if (el) el.value = str;
				applyLocationValue(id, str);
			};
			// Allow AI to suggest or correct the name
			if (f.name) {
				name = f.name;
				setVal('name', f.name);
				handleTouched = false; // allow slug to refresh from new name
			}
			setVal('tagline', f.tagline);
			setVal('description', f.description);
			setVal('website_url', f.website_url);
			setVal('public_contact_email', f.public_contact_email);
			setVal('public_phone_number', f.public_phone_number);
			setVal('preferred_contact_method_instructions', f.preferred_contact_method_instructions);
			setVal('how_to_join_instructions', f.how_to_join_instructions);
			setVal('city', f.city);
			setVal('state_region', f.state_region);
			if (f.country) {
				const sel = document.getElementById('country');
				if (sel) sel.value = f.country;
				applyLocationValue('country', f.country);
			}
			// Hidden fields not shown on this page
			hiddenSuggestedWebsite = f.website_url || hiddenSuggestedWebsite;
			hiddenMembershipInfo = f.membership_info || hiddenMembershipInfo;
			hiddenMeetingAddress = f.specific_meeting_point_address || hiddenMeetingAddress;
			hiddenLat = (f.latitude ?? '') + '';
			hiddenLng = (f.longitude ?? '') + '';
			hiddenServiceArea = f.service_area_description || hiddenServiceArea;
			hiddenSkills = f.skill_levels_description || hiddenSkills;
			hiddenActivityFrequency = f.activity_frequency || hiddenActivityFrequency;
			hiddenTypicalTime = f.typical_activity_day_time || hiddenTypicalTime;
			hiddenLogoUrl = f.logo_url || hiddenLogoUrl;
			hiddenCoverUrl = f.cover_photo_url || hiddenCoverUrl;
			if (f.social_links && typeof f.social_links === 'object') {
				try {
					hiddenSocialLinks = JSON.stringify(f.social_links);
				} catch {}
			}
			const cats = payload.categories || {};
			const nameIn = (s) => (s || '').toString().trim().toLowerCase();
			if (cats.group_types?.length) {
				const map = new Map(data.group_types.map((x) => [nameIn(x.name), x.id]));
				cats.group_types.forEach((n) => {
					const id = map.get(nameIn(n));
					if (id) {
						const box = document.querySelector(`input[name="group_type_ids"][value="${id}"]`);
						if (box) box.checked = true;
					}
				});
			}
			if (cats.audience_focuses?.length) {
				const map = new Map(data.audience_focuses.map((x) => [nameIn(x.name), x.id]));
				cats.audience_focuses.forEach((n) => {
					const id = map.get(nameIn(n));
					if (id) {
						const box = document.querySelector(`input[name="audience_focus_ids"][value="${id}"]`);
						if (box) box.checked = true;
					}
				});
			}
			if (cats.riding_disciplines?.length) {
				const map = new Map(data.riding_disciplines.map((x) => [nameIn(x.name), x.id]));
				cats.riding_disciplines.forEach((n) => {
					const id = map.get(nameIn(n));
					if (id) {
						const box = document.querySelector(
							`input[name="riding_discipline_ids"][value="${id}"]`
						);
						if (box) box.checked = true;
					}
				});
			}
		} catch (e) {
			aiError = e.message || 'Failed to fetch suggestions.';
		} finally {
			aiLoading = false;
		}
	}
	// Keep hidden fields in sync with user-provided AI inputs when no AI call is made
	$effect(() => {
		// Suggested website falls back to AI Website field if visible Website is left blank
		hiddenSuggestedWebsite = (aiWebsite || '').trim();
		const socials = {};
		if ((aiInstagram || '').trim())
			socials.instagram = `https://www.instagram.com/${aiInstagram.replace(/^@/, '').trim()}`;
		if ((aiFacebook || '').trim()) socials.facebook = aiFacebook.trim();
		// If user provides direct website here, also reflect in social_links.other for completeness
		if ((aiWebsite || '').trim()) socials.website = (aiWebsite || '').trim();
		try {
			hiddenSocialLinks = Object.keys(socials).length ? JSON.stringify(socials) : '';
		} catch {
			hiddenSocialLinks = '';
		}
	});
	$effect(() => {
		const aiAddress = (hiddenMeetingAddress || '').trim();
		const cityPart = (city || '').trim();
		const statePart = (stateRegion || '').trim();
		const countryPart = (country || '').trim().toUpperCase();
		const manualParts = [];
		if (cityPart) manualParts.push(cityPart);
		if (statePart) manualParts.push(statePart);
		if (manualParts.length && countryPart && countryPart !== 'OTHER') manualParts.push(countryPart);
		const manualQuery = manualParts.join(', ');
		const query = aiAddress || manualQuery;
		if (!query) return;
		const countryForRequest = countryPart && countryPart !== 'OTHER' ? countryPart : '';
		scheduleGeocode(query, countryForRequest, { immediate: Boolean(aiAddress) });
	});
	function slugify(text) {
		return (text || '')
			.toString()
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-');
	}
	$effect(() => {
		if (!handleTouched) handle = slugify(name);
	});

	// Debounced slug availability check
	$effect(() => {
		if (!handle) {
			handleStatus = '';
			return;
		}
		handleStatus = 'checking';
		clearTimeout(handleTimer);
		handleTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/groups/check-slug?slug=${encodeURIComponent(handle)}`);
				if (!res.ok) throw new Error('check failed');
				const j = await res.json();
				if (!j.slug || j.slug !== handle) {
					if (!handleTouched && j.slug) handle = j.slug;
				}
				if (j.reason === 'too_short_or_invalid') handleStatus = 'invalid';
				else handleStatus = j.available ? 'available' : 'taken';
			} catch (_) {
				handleStatus = '';
			}
		}, 350);
	});
	onMount(() => {
		if (typeof window === 'undefined') return;
		const read = (id) => document.getElementById(id)?.value?.trim() || '';
		city = read('city');
		stateRegion = read('state_region');
		const countryEl = document.getElementById('country');
		if (countryEl) country = (countryEl.value || country).trim().toUpperCase() || country;
		loadGooglePlaces();
	});
	onDestroy(() => {
		if (geocodeTimeout) clearTimeout(geocodeTimeout);
		if (typeof window !== 'undefined' && window.initGroupsNewPlaces === initGooglePlaces) {
			delete window.initGroupsNewPlaces;
		}
	});

	function buildImageContext() {
		const formData = new FormData(formEl);
		const selectedAudience = Array.from(
			formEl?.querySelectorAll?.('input[name="audience_focus_ids"]:checked') ?? []
		)
			.map((input) => {
				const id = Number(input.value);
				return data.audience_focuses.find((item) => item.id === id)?.name || '';
			})
			.filter(Boolean);
		const selectedDisciplines = Array.from(
			formEl?.querySelectorAll?.('input[name="riding_discipline_ids"]:checked') ?? []
		)
			.map((input) => {
				const id = Number(input.value);
				return data.riding_disciplines.find((item) => item.id === id)?.name || '';
			})
			.filter(Boolean);

		return {
			name: formData.get('name')?.toString().trim() || name,
			tagline: formData.get('tagline')?.toString().trim() || '',
			description: formData.get('description')?.toString().trim() || '',
			location: [formData.get('city'), formData.get('state_region'), formData.get('country')]
				.map((value) => (value == null ? '' : String(value).trim()))
				.filter(Boolean)
				.join(', '),
			serviceArea: hiddenServiceArea,
			activityFrequency: hiddenActivityFrequency,
			typicalTime: hiddenTypicalTime,
			ridingDisciplines: selectedDisciplines,
			audienceFocuses: selectedAudience,
			howToJoin: formData.get('how_to_join_instructions')?.toString().trim() || ''
		};
	}

	function applyGeneratedGroupImage(result) {
		hiddenCoverUrl = result?.url || hiddenCoverUrl;
	}
</script>

<div class="new-group-page mx-auto w-full max-w-3xl space-y-5 pb-10">
	<!-- ── Cinematic header ── -->
	<header class="new-header relative overflow-hidden rounded-3xl">
		<div class="new-orb new-orb-1" aria-hidden="true"></div>
		<div class="new-orb new-orb-2" aria-hidden="true"></div>
		<div class="new-orb new-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-10"
		>
			<div class="space-y-4">
				<h1 class="group-headline text-4xl font-extrabold tracking-tight text-balance lg:text-5xl">
					Add a Cycling Group
				</h1>
				<p class="max-w-3xl text-base leading-relaxed opacity-80">
					Share local bike clubs, teams, and advocacy orgs with the community.
				</p>
			</div>
		</div>
	</header>

	<!-- ── Optional AI assist ── -->
	<section
		class="new-card new-ai-card relative overflow-hidden rounded-2xl p-5 {aiLoading
			? 'is-loading'
			: ''}"
	>
		<div class="new-card-accent-bar ai" aria-hidden="true"></div>
		<div class="mb-3 flex items-center gap-2">
			<span class="text-lg">✨</span>
			<h2 class="text-sm font-bold tracking-widest uppercase opacity-70">Optional: AI Autofill</h2>
		</div>
		<p class="text-surface-400-600 mb-4 text-sm">
			Give us your Instagram, Facebook group name, or website and we'll pre-fill the form. Nothing
			is saved until you submit.
		</p>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div class="flex flex-col gap-1">
				<label class="label" for="aiInstagram">Instagram Username</label>
				<input
					id="aiInstagram"
					class="input preset-tonal-surface"
					bind:value={aiInstagram}
					placeholder="e.g. bikeclub"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="label" for="aiFacebook">Facebook Group Name</label>
				<input
					id="aiFacebook"
					class="input preset-tonal-surface"
					bind:value={aiFacebook}
					placeholder="e.g. mybikegroup"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="label" for="aiWebsite">Website</label>
				<input
					id="aiWebsite"
					class="input preset-tonal-surface"
					bind:value={aiWebsite}
					placeholder="https://example.org"
				/>
			</div>
		</div>
		{#if aiError}
			<p class="text-error-600-400 mt-2 text-sm">{aiError}</p>
		{/if}
		<div class="mt-4 flex items-center justify-end gap-3">
			{#if aiLoading}
				<Progress value={null} class="w-32" />
			{/if}
			<button
				class="btn preset-outlined-primary-500 {aiLoading ? 'animate-pulse' : ''}"
				type="button"
				onclick={suggestFromAI}
				disabled={aiLoading}
			>
				{aiLoading ? 'Working…' : '✨ Autofill'}
			</button>
		</div>
	</section>

	<form method="POST" class="space-y-5" bind:this={formEl}>
		<!-- Hidden AI-suggested fields -->
		<input type="hidden" name="suggested_website_url" value={hiddenSuggestedWebsite} />
		<input type="hidden" id="membership_info" name="membership_info" value={hiddenMembershipInfo} />
		<input
			type="hidden"
			id="specific_meeting_point_address"
			name="specific_meeting_point_address"
			value={hiddenMeetingAddress}
		/>
		<input type="hidden" id="latitude" name="latitude" value={hiddenLat} />
		<input type="hidden" id="longitude" name="longitude" value={hiddenLng} />
		<input
			type="hidden"
			id="service_area_description"
			name="service_area_description"
			value={hiddenServiceArea}
		/>
		<input
			type="hidden"
			id="activity_frequency"
			name="activity_frequency"
			value={hiddenActivityFrequency}
		/>
		<input
			type="hidden"
			id="typical_activity_day_time"
			name="typical_activity_day_time"
			value={hiddenTypicalTime}
		/>
		<input type="hidden" id="logo_url" name="logo_url" value={hiddenLogoUrl} />
		<input type="hidden" id="cover_photo_url" name="cover_photo_url" value={hiddenCoverUrl} />
		<input type="hidden" id="social_links" name="social_links" value={hiddenSocialLinks} />
		<input
			type="hidden"
			name="allow_duplicate_override"
			value={needsDuplicateOverride && duplicateOverrideConfirmed ? '1' : '0'}
		/>

		{#if form?.error}
			<div class="new-card border-error-500/35 bg-error-500/10 rounded-2xl border px-4 py-3">
				<p class="text-error-600-400 text-sm">{form.error}</p>
			</div>
		{/if}

		{#if needsDuplicateOverride}
			<section class="new-card border-warning-500/35 bg-warning-500/10 rounded-2xl border p-4">
				<h2 class="text-sm font-bold tracking-wide uppercase opacity-85">Possible Duplicates</h2>
				<p class="mt-1 text-sm opacity-80">
					These existing groups look similar. Confirm the override below only if this is a false
					positive or a separate chapter.
				</p>
				<ul class="mt-3 space-y-2">
					{#each duplicateCandidates as candidate}
						<li class="border-surface-500/20 rounded-xl border px-3 py-2 text-sm">
							<div class="font-semibold">
								<a href={`/groups/${candidate.slug}`} target="_blank" rel="noreferrer">
									{candidate.name}
								</a>
							</div>
							<div class="opacity-70">
								{#if candidate.city}{candidate.city},{/if}
								{candidate.state_region} · {candidate.country}
							</div>
							{#if candidate.duplicate_reason}
								<div class="text-xs opacity-65">Match: {candidate.duplicate_reason}</div>
							{/if}
						</li>
					{/each}
				</ul>
				<label class="mt-3 flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						class="checkbox mt-0.5"
						bind:checked={duplicateOverrideConfirmed}
					/>
					<span> I confirm this is a new group and want to continue creating it. </span>
				</label>
			</section>
		{/if}

		<section class="new-card relative overflow-hidden rounded-2xl p-5">
			<div class="new-card-accent-bar tertiary" aria-hidden="true"></div>
			<h2 class="new-section-title">AI Cover Art</h2>
			<div class="mt-4">
				<ImageGeneratorPanel
					target="group"
					heading="Generate group cover art"
					description="Build a comic-book group banner from the name, description, location, and community focus on this page."
					helperText="Generated cover art is added to the hidden cover field now and will be stored with the group when you submit."
					currentImageUrl={hiddenCoverUrl}
					buildContext={buildImageContext}
					onApply={applyGeneratedGroupImage}
				/>
			</div>
		</section>

		<!-- ── Identity ── -->
		<section class="new-card relative overflow-hidden rounded-2xl p-5">
			<div class="new-card-accent-bar primary" aria-hidden="true"></div>
			<h2 class="new-section-title">Identity</h2>
			<div class="mt-4 grid grid-cols-1 gap-4">
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label class="label" for="name">
							Group Name <span class="text-error-400">*</span>
						</label>
						<input
							id="name"
							name="name"
							class="input preset-tonal-surface"
							required
							bind:value={name}
							oninput={(e) => {
								if (!handleTouched) handle = slugify(e.target.value);
							}}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label class="label" for="handle">Group URL</label>
						<input
							id="handle"
							name="slug"
							class="input preset-tonal-surface"
							bind:value={handle}
							oninput={(e) => {
								handleTouched = true;
								handle = slugify(e.target.value);
							}}
							autocomplete="off"
						/>
						<div class="flex items-center justify-between">
							<p class="text-surface-600-400 text-xs">
								/groups/<code>{handle || 'your-group'}</code>
							</p>
							{#if handleStatus === 'checking'}
								<span class="text-surface-500 text-xs">Checking…</span>
							{:else if handleStatus === 'available'}
								<span class="text-success-500 text-xs font-semibold">✓ Available</span>
							{:else if handleStatus === 'taken'}
								<span class="text-error-500 text-xs font-semibold">✗ Already taken</span>
							{:else if handleStatus === 'invalid'}
								<span class="text-warning-500 text-xs">Use 3+ letters/numbers</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="tagline">Tagline</label>
					<input
						id="tagline"
						name="tagline"
						class="input preset-tonal-surface"
						placeholder="A short, punchy description of your group"
						value={initialValues.tagline || ''}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="description">Description</label>
					<textarea
						id="description"
						name="description"
						class="textarea preset-tonal-surface"
						rows="4">{initialValues.description || ''}</textarea
					>
				</div>
			</div>
		</section>

		<!-- ── Location ── -->
		<section class="new-card relative overflow-hidden rounded-2xl p-5">
			<div class="new-card-accent-bar secondary" aria-hidden="true"></div>
			<h2 class="new-section-title">Location</h2>
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
				<div class="flex flex-col gap-1">
					<label class="label" for="city">City</label>
					<input
						id="city"
						name="city"
						class="input preset-tonal-surface"
						placeholder="Leave blank if statewide"
						bind:value={city}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="state_region"
						>State / Region <span class="text-error-400">*</span></label
					>
					<input
						id="state_region"
						name="state_region"
						class="input preset-tonal-surface"
						required
						bind:value={stateRegion}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="country">Country <span class="text-error-400">*</span></label>
					<select
						id="country"
						name="country"
						class="select preset-tonal-surface"
						required
						bind:value={country}
					>
						<option value="US">United States</option>
						<option value="CA">Canada</option>
						<option value="MX">Mexico</option>
						<option value="GB">United Kingdom</option>
						<option value="AU">Australia</option>
						<option value="NZ">New Zealand</option>
						<option value="OTHER">Other</option>
					</select>
				</div>
			</div>
		</section>

		<!-- ── Contact ── -->
		<section class="new-card relative overflow-hidden rounded-2xl p-5">
			<div class="new-card-accent-bar tertiary" aria-hidden="true"></div>
			<h2 class="new-section-title">Contact</h2>
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label class="label" for="website_url">Website</label>
					<input
						id="website_url"
						name="website_url"
						class="input preset-tonal-surface"
						placeholder="https://example.org"
						value={initialValues.website_url || ''}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="public_contact_email">Public Email</label>
					<input
						id="public_contact_email"
						name="public_contact_email"
						class="input preset-tonal-surface"
						value={initialValues.public_contact_email || ''}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="public_phone_number">Public Phone</label>
					<input
						id="public_phone_number"
						name="public_phone_number"
						class="input preset-tonal-surface"
						value={initialValues.public_phone_number || ''}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="preferred_contact_method_instructions"
						>Preferred Contact Method</label
					>
					<input
						id="preferred_contact_method_instructions"
						name="preferred_contact_method_instructions"
						class="input preset-tonal-surface"
						placeholder="Best way to reach you"
						value={initialValues.preferred_contact_method_instructions || ''}
					/>
				</div>
				<div class="flex flex-col gap-1 md:col-span-2">
					<label class="label" for="how_to_join_instructions">How to Join</label>
					<textarea
						id="how_to_join_instructions"
						name="how_to_join_instructions"
						class="textarea preset-tonal-surface"
						rows="3">{initialValues.how_to_join_instructions || ''}</textarea
					>
				</div>
			</div>
		</section>

		<!-- ── Categories ── -->
		<section class="new-card relative overflow-hidden rounded-2xl p-5">
			<div class="new-card-accent-bar primary" aria-hidden="true"></div>
			<h2 class="new-section-title">Categories & Tags</h2>
			<p class="text-surface-500 mt-1 mb-4 text-xs">
				Select all that apply — you can update these later.
			</p>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<div class="new-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Group Types</div>
					<div class="flex flex-col gap-2">
						{#each data.group_types as gt}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="group_type_ids"
									value={gt.id}
									class="checkbox"
									checked={selectedGroupTypeIds.has(String(gt.id))}
								/>
								<span>{gt.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="new-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Audience Focus</div>
					<div class="flex flex-col gap-2">
						{#each data.audience_focuses as af}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="audience_focus_ids"
									value={af.id}
									class="checkbox"
									checked={selectedAudienceFocusIds.has(String(af.id))}
								/>
								<span>{af.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="new-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Riding Disciplines</div>
					<div class="flex flex-col gap-2">
						{#each data.riding_disciplines as rd}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="riding_discipline_ids"
									value={rd.id}
									class="checkbox"
									checked={selectedRidingDisciplineIds.has(String(rd.id))}
								/>
								<span>{rd.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="new-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Skill Levels</div>
					<div class="flex flex-col gap-2">
						{#each data.skill_levels as sl}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="skill_level_ids"
									value={sl.id}
									class="checkbox"
									checked={selectedSkillLevelIds.has(String(sl.id))}
								/>
								<span>{sl.name}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- ── Submit ── -->
		<div class="flex justify-end">
			<button
				class="btn preset-filled-primary-500 px-8 py-3 text-base font-bold shadow-lg transition-transform hover:scale-105"
				disabled={needsDuplicateOverride && !duplicateOverrideConfirmed}
			>
				{needsDuplicateOverride ? 'Create Group Anyway →' : 'Create Group →'}
			</button>
		</div>
	</form>
</div>

<style>
	/* ── Page header ── */
	.new-header {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}
	.new-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}
	.new-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}
	.new-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}
	.new-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}
	.group-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	/* ── Section cards ── */
	.new-card {
		background: color-mix(in oklab, var(--color-surface-900) 94%, var(--color-primary-500) 6%);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		animation: card-in 360ms ease both;
	}
	.new-ai-card {
		background: color-mix(
			in oklab,
			var(--color-primary-950, var(--color-surface-950)) 92%,
			var(--color-primary-500) 8%
		);
	}
	.new-card-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 2rem 2rem 0 0;
	}
	.new-card-accent-bar.primary {
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.75;
	}
	.new-card-accent-bar.secondary {
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		opacity: 0.75;
	}
	.new-card-accent-bar.tertiary {
		background: linear-gradient(90deg, var(--color-tertiary-500), var(--color-primary-500));
		opacity: 0.65;
	}
	.new-card-accent-bar.ai {
		background: linear-gradient(90deg, #a855f7, #3b82f6, #06b6d4);
		opacity: 0.8;
	}

	.new-section-title {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	/* ── Check sub-cards ── */
	.new-check-card {
		background: color-mix(in oklab, var(--color-surface-950) 55%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
	}

	/* ── Card entrance ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
