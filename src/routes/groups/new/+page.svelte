<script>
	let { data, form } = $props();
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import ImageGeneratorPanel from '#lib/components/ai/ImageGeneratorPanel.svelte';
	import { onMount, onDestroy } from 'svelte';
	import * as env from '$app/env/public';

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

<svelte:head>
	<title>Create Group · 3 Feet Please</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby="new-group-heading"
	>
		<div
			class="flex flex-col justify-between gap-6 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Community Directory</span>
			</p>
			<div class="flex flex-col gap-4">
				<h1
					id="new-group-heading"
					class="text-surface-950! m-0 text-[clamp(2.8rem,6.6vw,6rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Add a Cycling <span class="text-secondary-500">Group</span>
				</h1>
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-2xl">
					Share local bike clubs, teams, and advocacy orgs with the community.
				</p>
			</div>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</header>

	<!-- OPTIONAL AI ASSIST -->
	<section
		class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-col gap-6 border-t-[3px] px-6 py-10 sm:px-10 lg:px-14 lg:py-12"
		aria-labelledby="ai-autofill-heading"
	>
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Fast Track · Optional
				</p>
				<h2
					id="ai-autofill-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
				>
					Optional: AI Autofill
				</h2>
				<p class="m-0 max-w-2xl text-sm leading-relaxed opacity-90">
					Give us your Instagram, Facebook group name, or website and we'll pre-fill the form.
					Nothing is saved until you submit.
				</p>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div class="flex flex-col gap-1.5">
				<label
					class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
					for="aiInstagram"
				>
					Instagram Username
				</label>
				<input
					id="aiInstagram"
					class="input bg-surface-950 border-surface-50 text-surface-50"
					bind:value={aiInstagram}
					placeholder="e.g. bikeclub"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label
					class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
					for="aiFacebook"
				>
					Facebook Group Name
				</label>
				<input
					id="aiFacebook"
					class="input bg-surface-950 border-surface-50 text-surface-50"
					bind:value={aiFacebook}
					placeholder="e.g. mybikegroup"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label
					class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
					for="aiWebsite"
				>
					Website
				</label>
				<input
					id="aiWebsite"
					class="input bg-surface-950 border-surface-50 text-surface-50"
					bind:value={aiWebsite}
					placeholder="https://example.org"
				/>
			</div>
		</div>

		{#if aiError}
			<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold">{aiError}</p>
		{/if}

		<div class="flex flex-wrap items-center justify-end gap-4">
			{#if aiLoading}
				<Progress value={null} class="w-32" />
			{/if}
			<button
				class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-7 py-3.5 text-sm font-black tracking-wide uppercase transition {aiLoading
					? 'animate-pulse'
					: ''}"
				type="button"
				onclick={suggestFromAI}
				disabled={aiLoading}
			>
				{aiLoading ? 'Working…' : '✨ Autofill'}
			</button>
		</div>
	</section>

	<form method="POST" class="flex flex-col" bind:this={formEl}>
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
			<div
				class="bg-tertiary-500 text-surface-950 border-surface-950 border-t-[3px] px-6 py-5 sm:px-10 lg:px-14"
			>
				<p class="m-0 text-sm font-black uppercase">{form.error}</p>
			</div>
		{/if}

		{#if needsDuplicateOverride}
			<section
				class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-col gap-4 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
			>
				<h2 class="text-surface-950! m-0 text-2xl font-black uppercase italic">
					Possible Duplicates
				</h2>
				<p class="m-0 text-sm font-medium">
					These existing groups look similar. Confirm the override below only if this is a false
					positive or a separate chapter.
				</p>
				<ul class="border-surface-950 m-0 list-none border-t-2 p-0">
					{#each duplicateCandidates as candidate (candidate.slug)}
						<li class="border-surface-950 border-b py-3 text-sm">
							<div class="font-black uppercase">
								<a
									href={`/groups/${candidate.slug}`}
									target="_blank"
									rel="noreferrer"
									class="underline"
								>
									{candidate.name}
								</a>
							</div>
							<div class="font-medium">
								{#if candidate.city}{candidate.city},{/if}
								{candidate.state_region} · {candidate.country}
							</div>
							{#if candidate.duplicate_reason}
								<div class="text-xs font-bold uppercase">Match: {candidate.duplicate_reason}</div>
							{/if}
						</li>
					{/each}
				</ul>
				<label class="bg-surface-950 text-surface-50 flex items-start gap-3 p-4 text-sm font-bold">
					<input
						type="checkbox"
						class="checkbox mt-0.5"
						bind:checked={duplicateOverrideConfirmed}
					/>
					<span> I confirm this is a new group and want to continue creating it. </span>
				</label>
			</section>
		{/if}

		<!-- 01 · AI COVER ART -->
		<section
			class="bg-surface-950 border-surface-800 flex flex-col gap-6 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14"
			aria-labelledby="cover-art-heading"
		>
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
					aria-hidden="true"
				>
					01
				</span>
				<div class="flex flex-col gap-1">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Visuals</p>
					<h2
						id="cover-art-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						AI Cover Art
					</h2>
				</div>
			</div>
			<div>
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

		<!-- 02 · IDENTITY -->
		<section
			class="bg-surface-950 border-surface-800 flex flex-col gap-8 border-t-2 px-6 py-12 sm:px-10 lg:px-14"
			aria-labelledby="identity-heading"
		>
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
					aria-hidden="true"
				>
					02
				</span>
				<div class="flex flex-col gap-1">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Who you are
					</p>
					<h2
						id="identity-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						Identity
					</h2>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-6">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="name"
						>
							Group Name <span class="text-tertiary-500">*</span>
						</label>
						<input
							id="name"
							name="name"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							required
							bind:value={name}
							oninput={(e) => {
								if (!handleTouched) handle = slugify(e.target.value);
							}}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="handle"
						>
							Group URL
						</label>
						<input
							id="handle"
							name="slug"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							bind:value={handle}
							oninput={(e) => {
								handleTouched = true;
								handle = slugify(e.target.value);
							}}
							autocomplete="off"
						/>
						<div class="flex items-center justify-between">
							<p class="text-surface-300 m-0 text-xs">
								/groups/<code>{handle || 'your-group'}</code>
							</p>
							{#if handleStatus === 'checking'}
								<span class="text-surface-300 text-xs font-bold uppercase">Checking…</span>
							{:else if handleStatus === 'available'}
								<span class="text-primary-500 text-xs font-black uppercase">✓ Available</span>
							{:else if handleStatus === 'taken'}
								<span class="text-tertiary-500 text-xs font-black uppercase">✗ Already taken</span>
							{:else if handleStatus === 'invalid'}
								<span class="text-tertiary-500 text-xs font-bold uppercase"
									>Use 3+ letters/numbers</span
								>
							{/if}
						</div>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<label
						class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
						for="tagline"
					>
						Tagline
					</label>
					<input
						id="tagline"
						name="tagline"
						class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
						placeholder="A short, punchy description of your group"
						value={initialValues.tagline || ''}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label
						class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
						for="description"
					>
						Description
					</label>
					<textarea
						id="description"
						name="description"
						class="textarea bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
						rows="4">{initialValues.description || ''}</textarea
					>
				</div>
			</div>
		</section>

		<!-- 03 · LOCATION & 04 · CONTACT -->
		<div class="bg-surface-950 border-surface-800 grid border-t-2 lg:grid-cols-2">
			<section
				class="lg:border-surface-800 flex flex-col gap-8 px-6 py-12 sm:px-10 lg:border-r lg:px-14"
				aria-labelledby="location-heading"
			>
				<div class="flex items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
						aria-hidden="true"
					>
						03
					</span>
					<div class="flex flex-col gap-1">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Where you ride
						</p>
						<h2
							id="location-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
						>
							Location
						</h2>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-5">
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="city"
						>
							City
						</label>
						<input
							id="city"
							name="city"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							placeholder="Leave blank if statewide"
							bind:value={city}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="state_region"
						>
							State / Region <span class="text-tertiary-500">*</span>
						</label>
						<input
							id="state_region"
							name="state_region"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							required
							bind:value={stateRegion}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="country"
						>
							Country <span class="text-tertiary-500">*</span>
						</label>
						<select
							id="country"
							name="country"
							class="select bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
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

			<section
				class="border-surface-800 flex flex-col gap-8 border-t-2 px-6 py-12 sm:px-10 lg:border-t-0 lg:px-14"
				aria-labelledby="contact-heading"
			>
				<div class="flex items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
						aria-hidden="true"
					>
						04
					</span>
					<div class="flex flex-col gap-1">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							How riders reach you
						</p>
						<h2
							id="contact-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
						>
							Contact
						</h2>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="website_url"
						>
							Website
						</label>
						<input
							id="website_url"
							name="website_url"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							placeholder="https://example.org"
							value={initialValues.website_url || ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="public_contact_email"
						>
							Public Email
						</label>
						<input
							id="public_contact_email"
							name="public_contact_email"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							value={initialValues.public_contact_email || ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="public_phone_number"
						>
							Public Phone
						</label>
						<input
							id="public_phone_number"
							name="public_phone_number"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							value={initialValues.public_phone_number || ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="preferred_contact_method_instructions"
						>
							Preferred Contact Method
						</label>
						<input
							id="preferred_contact_method_instructions"
							name="preferred_contact_method_instructions"
							class="input bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							placeholder="Best way to reach you"
							value={initialValues.preferred_contact_method_instructions || ''}
						/>
					</div>
					<div class="flex flex-col gap-2 md:col-span-2">
						<label
							class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase"
							for="how_to_join_instructions"
						>
							How to Join
						</label>
						<textarea
							id="how_to_join_instructions"
							name="how_to_join_instructions"
							class="textarea bg-surface-900 border-surface-700 text-surface-50 focus:border-primary-500"
							rows="3">{initialValues.how_to_join_instructions || ''}</textarea
						>
					</div>
				</div>
			</section>
		</div>

		<!-- 05 · CATEGORIES & TAGS -->
		<section
			class="bg-surface-950 border-surface-800 flex flex-col gap-8 border-t-2 px-6 py-12 sm:px-10 lg:px-14"
			aria-labelledby="categories-heading"
		>
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div class="flex items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
						aria-hidden="true"
					>
						05
					</span>
					<div class="flex flex-col gap-1">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							Directory Filters
						</p>
						<h2
							id="categories-heading"
							class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
						>
							Categories & Tags
						</h2>
					</div>
				</div>
				<p class="text-surface-300 m-0 text-xs font-bold tracking-wider uppercase">
					Select all that apply — you can update these later.
				</p>
			</div>

			<div
				class="border-surface-50 divide-surface-800 grid grid-cols-1 divide-y border-t-2 md:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0"
			>
				<div class="flex flex-col gap-4 py-6 lg:pr-6">
					<div class="text-primary-500 text-xs font-black tracking-[0.22em] uppercase">
						Group Types
					</div>
					<div class="flex flex-col gap-2.5">
						{#each data.group_types as gt (gt.id)}
							<label
								class="hover:text-primary-500 flex cursor-pointer items-center gap-3 text-sm font-medium transition"
							>
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

				<div class="flex flex-col gap-4 py-6 lg:px-6">
					<div class="text-primary-500 text-xs font-black tracking-[0.22em] uppercase">
						Audience Focus
					</div>
					<div class="flex flex-col gap-2.5">
						{#each data.audience_focuses as af (af.id)}
							<label
								class="hover:text-primary-500 flex cursor-pointer items-center gap-3 text-sm font-medium transition"
							>
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

				<div class="flex flex-col gap-4 py-6 lg:px-6">
					<div class="text-primary-500 text-xs font-black tracking-[0.22em] uppercase">
						Riding Disciplines
					</div>
					<div class="flex flex-col gap-2.5">
						{#each data.riding_disciplines as rd (rd.id)}
							<label
								class="hover:text-primary-500 flex cursor-pointer items-center gap-3 text-sm font-medium transition"
							>
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

				<div class="flex flex-col gap-4 py-6 lg:pl-6">
					<div class="text-primary-500 text-xs font-black tracking-[0.22em] uppercase">
						Skill Levels
					</div>
					<div class="flex flex-col gap-2.5">
						{#each data.skill_levels as sl (sl.id)}
							<label
								class="hover:text-primary-500 flex cursor-pointer items-center gap-3 text-sm font-medium transition"
							>
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

		<!-- SUBMIT BAR -->
		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-4 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
		>
			<p class="m-0 text-lg font-black tracking-tight uppercase italic">
				Put your crew on the map.
			</p>
			<button
				class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-3 px-8 py-4 text-base font-black tracking-wide uppercase transition disabled:opacity-50"
				disabled={needsDuplicateOverride && !duplicateOverrideConfirmed}
			>
				{needsDuplicateOverride ? 'Create Group Anyway →' : 'Create Group →'}
			</button>
		</div>
	</form>
</div>
