<script>
	let { data } = $props();
	import { Progress } from '@skeletonlabs/skeleton-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { env } from '$env/dynamic/public';

	// Simple client-side slug preview
	let name = $state('');
	let handle = $state('');
	let handleTouched = $state(false);
	let handleStatus = $state(''); // '', 'checking', 'available', 'taken', 'invalid'
	let handleTimer;
	// Optional AI-assisted enrichment inputs
	let aiInstagram = $state('');
	let aiFacebook = $state('');
	let aiWebsite = $state('');
	let aiLoading = $state(false);
	let aiError = $state('');
	// Hidden values we will submit (extra AI fields not shown on this page)
	let hiddenSuggestedWebsite = $state('');
	let hiddenSocialLinks = $state(''); // JSON string
	let hiddenMembershipInfo = $state('');
	let hiddenMeetingAddress = $state('');
	let hiddenLat = $state('');
	let hiddenLng = $state('');
	let hiddenServiceArea = $state('');
	let hiddenSkills = $state('');
	let hiddenActivityFrequency = $state('');
	let hiddenTypicalTime = $state('');
	let hiddenLogoUrl = $state('');
	let hiddenCoverUrl = $state('');
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
			scheduleGeocode(pendingGeocode.query, pendingGeocode.country, { immediate: true, force: true });
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
	let city = $state('');
	let stateRegion = $state('');
	let country = $state('US');
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
</script>

<div class="mx-auto w-full max-w-3xl space-y-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-bold">Add a Cycling Group</h1>
		<p class="text-surface-400 text-center">Share local bike clubs, teams, and advocacy orgs.</p>
	</header>

	<!-- Optional AI assist section -->
	<section
		class="card border-primary-300 bg-surface-950 card-hover ai-panel border p-4 {aiLoading
			? 'is-loading'
			: ''}"
	>
		<h2 class="h5 mb-2 text-center">Optional: Let AI Help Fill Details</h2>
		<p class="text-surface-400 mb-3 text-center text-sm">
			Provide any of the following and we’ll suggest fields. Nothing is saved until you submit.
		</p>
		<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
			<div class="flex flex-col">
				<label class="label" for="aiInstagram">Instagram Username</label>
				<input
					id="aiInstagram"
					class="input bg-primary-950/30"
					bind:value={aiInstagram}
					placeholder="e.g. bikeclub"
				/>
			</div>
			<div class="flex flex-col">
				<label class="label" for="aiFacebook">Facebook Group Name</label>
				<input
					id="aiFacebook"
					class="input bg-primary-950/30"
					bind:value={aiFacebook}
					placeholder="e.g. mybikegroup"
				/>
			</div>
			<div class="flex flex-col">
				<label class="label" for="aiWebsite">Website</label>
				<input
					id="aiWebsite"
					class="input bg-primary-950/30"
					bind:value={aiWebsite}
					placeholder="https://example.org"
				/>
			</div>
		</div>
		{#if aiError}
			<p class="text-error-400 mt-2 text-sm">{aiError}</p>
		{/if}
		<div class="mt-3 flex items-center justify-end gap-3">
			{#if aiLoading}
				<Progress value={null} class="w-32" />
			{/if}
			<button
				class="btn {aiLoading ? 'animate-pulse' : ''} preset-outlined-primary-500"
				type="button"
				onclick={suggestFromAI}
				disabled={aiLoading}
			>
				{aiLoading ? 'Working…' : 'Autofill'}
			</button>
		</div>
	</section>

	<section class="card border-primary-300 bg-surface-950 card-hover border p-4">
		<form method="POST" class="grid grid-cols-1 gap-4">
			<!-- Hidden AI-suggested fields to submit silently -->
			<input type="hidden" name="suggested_website_url" value={hiddenSuggestedWebsite} />
			<input
				type="hidden"
				id="membership_info"
				name="membership_info"
				value={hiddenMembershipInfo}
			/>
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
			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="name">Group Name * Required</label>
					<input
						id="name"
						name="name"
						class="input bg-primary-950/30"
						required
						bind:value={name}
						oninput={(e) => {
							if (!handleTouched) handle = slugify(e.target.value);
						}}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="handle">Group URL</label>
					<input
						id="handle"
						name="slug"
						class="input bg-primary-950/30"
						bind:value={handle}
						oninput={(e) => {
							handleTouched = true;
							handle = slugify(e.target.value);
						}}
						autocomplete="off"
					/>
					<div class="mt-1 flex items-center justify-between">
						<p class="text-surface-400 text-xs">
							Your page will be at <code>/groups/{handle || 'your-group'}</code>
						</p>
						{#if handleStatus === 'checking'}
							<span class="text-surface-400 text-xs">Checking…</span>
						{:else if handleStatus === 'available'}
							<span class="text-success-400 text-xs">Available</span>
						{:else if handleStatus === 'taken'}
							<span class="text-error-400 text-xs">Already taken</span>
						{:else if handleStatus === 'invalid'}
							<span class="text-warning-400 text-xs">Use 3+ letters/numbers</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
				<div class="flex flex-col">
					<label class="label" for="city">City</label>
					<input
						id="city"
						name="city"
						class="input bg-primary-950/30"
						placeholder="Leave blank if statewide"
						bind:value={city}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="state_region">State/Region * Required</label>
					<input
						id="state_region"
						name="state_region"
						class="input bg-primary-950/30"
						required
						bind:value={stateRegion}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="country">Country * Required</label>
					<select
						id="country"
						name="country"
						class="select bg-primary-950/30"
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

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="tagline">Tagline</label>
					<input id="tagline" name="tagline" class="input bg-primary-950/30" />
				</div>
				<div class="flex flex-col">
					<label class="label" for="website_url">Website</label>
					<input
						id="website_url"
						name="website_url"
						class="input bg-primary-950/30"
						placeholder="https://example.org"
					/>
				</div>
			</div>

			<div class="flex flex-col">
				<label class="label" for="description">Description</label>
				<textarea id="description" name="description" class="textarea bg-primary-950/30" rows="4"
				></textarea>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
				<div class="flex flex-col">
					<label class="label" for="public_contact_email">Public Contact Email</label>
					<input
						id="public_contact_email"
						name="public_contact_email"
						class="input bg-primary-950/30"
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="public_phone_number">Public Phone</label>
					<input
						id="public_phone_number"
						name="public_phone_number"
						class="input bg-primary-950/30"
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="preferred_contact_method_instructions">Preferred Contact</label>
					<input
						id="preferred_contact_method_instructions"
						name="preferred_contact_method_instructions"
						class="input bg-primary-950/30"
						placeholder="Best way to reach you"
					/>
				</div>
			</div>

			<div class="flex flex-col">
				<label class="label" for="how_to_join_instructions">How to Join</label>
				<textarea
					id="how_to_join_instructions"
					name="how_to_join_instructions"
					class="textarea bg-primary-950/30"
					rows="3"
				></textarea>
			</div>

			<!-- Many-to-many selections -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Group Types</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.group_types as gt}
							<label class="flex items-center gap-2">
								<input type="checkbox" name="group_type_ids" value={gt.id} class="checkbox" />
								<span>{gt.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Audience Focus</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.audience_focuses as af}
							<label class="flex items-center gap-2">
								<input type="checkbox" name="audience_focus_ids" value={af.id} class="checkbox" />
								<span>{af.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Riding Disciplines</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.riding_disciplines as rd}
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									name="riding_discipline_ids"
									value={rd.id}
									class="checkbox"
								/>
								<span>{rd.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Skill Levels</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.skill_levels as sl}
							<label class="flex items-center gap-2">
								<input type="checkbox" name="skill_level_ids" value={sl.id} class="checkbox" />
								<span>{sl.name}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<div class="mt-2 flex justify-end">
				<button class="btn preset-filled-primary-500">Create Group</button>
			</div>
		</form>
	</section>
</div>
