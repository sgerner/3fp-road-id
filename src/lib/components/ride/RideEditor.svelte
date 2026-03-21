<script>
	import { goto } from '$app/navigation';
	import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { onMount, tick } from 'svelte';
	import {
		DEFAULT_RIDE_FORM,
		MONTH_POSITION_OPTIONS,
		RIDE_TIMEZONES,
		SURFACE_TYPE_OPTIONS,
		BIKE_SUITABILITY_OPTIONS,
		WEEKDAY_OPTIONS
	} from '$lib/rides/constants';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconSave from '@lucide/svelte/icons/save';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import ImageGeneratorPanel from '$lib/components/ai/ImageGeneratorPanel.svelte';

	let {
		pageTitle = 'New Ride',
		pageDescription = '',
		initialRide = null,
		difficultyLevels = [],
		disciplines = [],
		hostGroups = [],
		currentUser = null,
		currentProfile = null,
		manageMode = false
	} = $props();

	function cloneDefaultForm() {
		return JSON.parse(JSON.stringify(DEFAULT_RIDE_FORM));
	}

	function supportedTimezoneOptions() {
		try {
			if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
				const values = Intl.supportedValuesOf('timeZone');
				return values.length ? values : RIDE_TIMEZONES;
			}
		} catch {
			// ignore unsupported browsers
		}
		return RIDE_TIMEZONES;
	}

	async function syncTimezoneFromCoordinates(latitude, longitude) {
		const timezone = await resolveTimezoneForCoordinates(latitude, longitude);
		if (timezone && timezone !== form.timezone) {
			form = { ...form, timezone };
		}
	}

	function safeTrim(value) {
		return value == null ? '' : String(value).trim();
	}

	function slugify(value) {
		return safeTrim(value)
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function toLocalDateTimeValue(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const pad = (part) => String(part).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function initializeForm(ride) {
		const base = cloneDefaultForm();
		if (!ride) {
			base.contactEmail = currentProfile?.email || currentUser?.email || '';
			base.contactPhone = currentProfile?.phone || '';
			return base;
		}

		const activity = ride.activity ?? {};
		const rideDetails = ride.rideDetails ?? {};
		const recurrenceRule = ride.recurrenceRule ?? null;

		return {
			...base,
			title: activity.title || '',
			slug: activity.slug || '',
			summary: activity.summary || '',
			description: activity.description || '',
			status: activity.status || 'published',
			timezone: activity.timezone || base.timezone,
			isHost: Boolean(activity.host_user_id),
			startsAt: toLocalDateTimeValue(activity.starts_at),
			endsAt: toLocalDateTimeValue(activity.ends_at),
			startLocationName: activity.start_location_name || '',
			startLocationAddress: activity.start_location_address || '',
			startLatitude: activity.start_latitude ?? '',
			startLongitude: activity.start_longitude ?? '',
			endLocationName: rideDetails.end_location_name || '',
			endLocationAddress: rideDetails.end_location_address || '',
			endLatitude: rideDetails.end_latitude ?? '',
			endLongitude: rideDetails.end_longitude ?? '',
			contactEmail: activity.contact_email || '',
			contactPhone: activity.contact_phone || '',
			hostGroupId: activity.host_group_id || '',
			imageUrls: rideDetails.image_urls ?? [],
			participantVisibility: rideDetails.participant_visibility || 'public',
			estimatedDistanceMiles: rideDetails.estimated_distance_miles ?? '',
			estimatedDurationMinutes: rideDetails.estimated_duration_minutes ?? '',
			elevationGainFeet: rideDetails.elevation_gain_feet ?? '',
			paceNotes: rideDetails.pace_notes || '',
			isNoDrop: rideDetails.is_no_drop ?? true,
			surfaceTypes: rideDetails.surface_types ?? [],
			bikeSuitability: rideDetails.bike_suitability ?? [],
			accessibilityNotes: rideDetails.accessibility_notes || '',
			waiverRequired: rideDetails.waiver_required ?? false,
			difficultyLevelIds: (ride.difficultyLevels ?? []).map((item) => item.id),
			ridingDisciplineIds: (ride.ridingDisciplines ?? []).map((item) => item.id),
			recurrenceEnabled: Boolean(recurrenceRule),
			recurrenceFrequency: recurrenceRule?.frequency || 'weekly',
			recurrenceInterval: recurrenceRule?.interval_count || 1,
			recurrenceWeekdays: recurrenceRule?.by_weekdays ?? [],
			recurrenceMonthPositions: recurrenceRule?.by_set_positions ?? [1],
			recurrenceUntilOn: recurrenceRule?.until_on || '',
			exclusions: (ride.exclusions ?? []).map((entry) => ({
				id: entry.id,
				starts_on: entry.starts_on,
				ends_on: entry.ends_on,
				note: entry.note || ''
			})),
			emailTemplates:
				ride.emailTemplates?.map((template, index) => ({
					id: template.id || `template-${index + 1}`,
					name: template.name,
					templateType: template.template_type || template.templateType || 'reminder',
					sendOffsetMinutes: template.send_offset_minutes ?? template.sendOffsetMinutes ?? '',
					subject: template.subject || '',
					body: template.body || '',
					isActive: template.is_active ?? template.isActive ?? true
				})) ?? base.emailTemplates
		};
	}

	function buildPayload() {
		return {
			title: form.title,
			slug: form.slug,
			summary: form.summary,
			description: form.description,
			status: form.status,
			timezone: form.timezone,
			isHost: form.isHost,
			startsAt: form.startsAt,
			endsAt: form.endsAt,
			startLocationName: form.startLocationName,
			startLocationAddress: form.startLocationAddress,
			startLatitude: form.startLatitude,
			startLongitude: form.startLongitude,
			endLocationName: form.endLocationName,
			endLocationAddress: form.endLocationAddress,
			endLatitude: form.endLatitude,
			endLongitude: form.endLongitude,
			contactEmail: form.contactEmail,
			contactPhone: form.contactPhone,
			hostGroupId: form.hostGroupId || null,
			imageUrls: form.imageUrls,
			participantVisibility: form.participantVisibility,
			estimatedDistanceMiles: form.estimatedDistanceMiles,
			estimatedDurationMinutes: form.estimatedDurationMinutes,
			elevationGainFeet: form.elevationGainFeet,
			paceNotes: form.paceNotes,
			isNoDrop: form.isNoDrop,
			surfaceTypes: form.surfaceTypes,
			bikeSuitability: form.bikeSuitability,
			accessibilityNotes: form.accessibilityNotes,
			waiverRequired: form.waiverRequired,
			difficultyLevelIds: form.difficultyLevelIds,
			ridingDisciplineIds: form.ridingDisciplineIds,
			recurrenceEnabled: form.recurrenceEnabled,
			recurrenceFrequency: form.recurrenceFrequency,
			recurrenceInterval: form.recurrenceInterval,
			recurrenceWeekdays: form.recurrenceWeekdays,
			recurrenceMonthPositions: form.recurrenceMonthPositions,
			recurrenceUntilOn: form.recurrenceUntilOn || null,
			exclusions: form.exclusions,
			emailTemplates: form.emailTemplates
		};
	}

	function mergeDraft(draft) {
		if (!draft) return;
		const metadata = draft.metadata ?? {};
		const rideDraft = draft.ride ?? {};
		const recurrence = draft.recurrence ?? {};

		form = {
			...form,
			title: metadata.title ?? form.title,
			summary: metadata.summary ?? form.summary,
			description: metadata.description ?? form.description,
			status: metadata.status ?? form.status,
			startsAt: metadata.starts_at ? toLocalDateTimeValue(metadata.starts_at) : form.startsAt,
			endsAt: metadata.ends_at ? toLocalDateTimeValue(metadata.ends_at) : form.endsAt,
			startLocationName: metadata.start_location_name ?? form.startLocationName,
			startLocationAddress: metadata.start_location_address ?? form.startLocationAddress,
			startLatitude: metadata.start_latitude ?? form.startLatitude,
			startLongitude: metadata.start_longitude ?? form.startLongitude,
			endLocationName: metadata.end_location_name ?? form.endLocationName,
			endLocationAddress: metadata.end_location_address ?? form.endLocationAddress,
			endLatitude: metadata.end_latitude ?? form.endLatitude,
			endLongitude: metadata.end_longitude ?? form.endLongitude,
			participantVisibility: rideDraft.participant_visibility ?? form.participantVisibility,
			estimatedDistanceMiles: rideDraft.estimated_distance_miles ?? form.estimatedDistanceMiles,
			estimatedDurationMinutes:
				rideDraft.estimated_duration_minutes ?? form.estimatedDurationMinutes,
			elevationGainFeet: rideDraft.elevation_gain_feet ?? form.elevationGainFeet,
			paceNotes: rideDraft.pace_notes ?? form.paceNotes,
			isNoDrop: rideDraft.is_no_drop ?? form.isNoDrop,
			surfaceTypes: rideDraft.surface_types ?? form.surfaceTypes,
			bikeSuitability: rideDraft.bike_suitability ?? form.bikeSuitability,
			accessibilityNotes: rideDraft.accessibility_notes ?? form.accessibilityNotes,
			waiverRequired: rideDraft.waiver_required ?? form.waiverRequired,
			recurrenceEnabled: recurrence.enabled ?? form.recurrenceEnabled,
			recurrenceFrequency: recurrence.frequency ?? form.recurrenceFrequency,
			recurrenceInterval: recurrence.interval_count ?? form.recurrenceInterval,
			recurrenceWeekdays: recurrence.by_weekdays ?? form.recurrenceWeekdays,
			recurrenceMonthPositions: recurrence.by_set_positions ?? form.recurrenceMonthPositions,
			recurrenceUntilOn: recurrence.until_on ?? form.recurrenceUntilOn
		};

		if (!slugTouched && form.title) {
			form.slug = slugify(form.title);
		}

		if (rideDraft.difficulty_labels?.length) {
			form.difficultyLevelIds = difficultyLevels
				.filter((level) =>
					rideDraft.difficulty_labels.some(
						(label) =>
							safeTrim(label).toLowerCase() === safeTrim(level.name).toLowerCase() ||
							safeTrim(label).toLowerCase() === safeTrim(level.slug).toLowerCase()
					)
				)
				.map((level) => level.id);
		}

		if (rideDraft.riding_disciplines?.length) {
			form.ridingDisciplineIds = disciplines
				.filter((discipline) =>
					rideDraft.riding_disciplines.some(
						(label) =>
							safeTrim(label).toLowerCase() === safeTrim(discipline.name).toLowerCase() ||
							safeTrim(label).toLowerCase() === safeTrim(discipline.slug).toLowerCase()
					)
				)
				.map((discipline) => discipline.id);
		}

		if (draft.email_templates?.length) {
			form.emailTemplates = draft.email_templates.map((template, index) => ({
				id: `ai-template-${index + 1}-${Date.now()}`,
				name: template.name || `Reminder ${index + 1}`,
				templateType: template.template_type || 'reminder',
				sendOffsetMinutes: template.send_offset_minutes ?? '',
				subject: template.subject || '',
				body: template.body || '',
				isActive: true
			}));
		}
	}

	function toggleSelection(listKey, value) {
		const next = new Set(form[listKey]);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		form = { ...form, [listKey]: Array.from(next) };
	}

	function addExclusion() {
		form = {
			...form,
			exclusions: [
				...form.exclusions,
				{ id: `new-exclusion-${Date.now()}`, starts_on: '', ends_on: '', note: '' }
			]
		};
	}

	function updateExclusion(id, key, value) {
		form = {
			...form,
			exclusions: form.exclusions.map((entry) =>
				entry.id === id ? { ...entry, [key]: value } : entry
			)
		};
	}

	function removeExclusion(id) {
		form = { ...form, exclusions: form.exclusions.filter((entry) => entry.id !== id) };
	}

	function addEmailTemplate() {
		form = {
			...form,
			emailTemplates: [
				...form.emailTemplates,
				{
					id: `template-${Date.now()}`,
					name: 'Reminder',
					templateType: 'reminder',
					sendOffsetMinutes: 24 * 60,
					subject: '',
					body: '',
					isActive: true
				}
			]
		};
	}

	function updateEmailTemplate(id, key, value) {
		form = {
			...form,
			emailTemplates: form.emailTemplates.map((template) =>
				template.id === id ? { ...template, [key]: value } : template
			)
		};
	}

	function removeEmailTemplate(id) {
		form = {
			...form,
			emailTemplates: form.emailTemplates.filter((template) => template.id !== id)
		};
	}

	function updateTitle(value) {
		form = { ...form, title: value };
		if (!slugTouched) {
			form = { ...form, slug: slugify(value) };
		}
	}

	async function geocodeLocation(query) {
		if (!safeTrim(query)) return null;
		const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Unable to geocode location.');
		return payload?.data?.[0] ?? null;
	}

	async function resolveTimezoneForCoordinates(latitude, longitude) {
		if (latitude == null || longitude == null || latitude === '' || longitude === '') return null;
		const response = await fetch(
			`/api/timezone?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
		);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) return null;
		return safeTrim(payload?.data?.timezone) || null;
	}

	async function geocode(prefix) {
		const query =
			prefix === 'start'
				? form.startLocationAddress || form.startLocationName
				: form.endLocationAddress || form.endLocationName;
		if (!query) return;

		geocodeLoading = prefix;
		geocodeError = '';
		try {
			const match = await geocodeLocation(query);
			if (!match) throw new Error('No matching location was found.');
			if (prefix === 'start') {
				const timezone =
					(await resolveTimezoneForCoordinates(match.latitude, match.longitude)) || form.timezone;
				form = {
					...form,
					startLocationAddress: form.startLocationAddress || match.label,
					startLatitude: match.latitude,
					startLongitude: match.longitude,
					timezone
				};
			} else {
				form = {
					...form,
					endLocationAddress: form.endLocationAddress || match.label,
					endLatitude: match.latitude,
					endLongitude: match.longitude
				};
			}
		} catch (error) {
			geocodeError = error.message || 'Unable to geocode location.';
		} finally {
			geocodeLoading = '';
		}
	}

	async function ensureGeocodedForm() {
		let nextForm = form;
		let didUpdate = false;

		if (
			safeTrim(nextForm.startLocationAddress || nextForm.startLocationName) &&
			(nextForm.startLatitude === '' ||
				nextForm.startLatitude == null ||
				nextForm.startLongitude === '' ||
				nextForm.startLongitude == null)
		) {
			const match = await geocodeLocation(
				nextForm.startLocationAddress || nextForm.startLocationName
			);
			if (match) {
				const timezone =
					(await resolveTimezoneForCoordinates(match.latitude, match.longitude)) ||
					nextForm.timezone;
				nextForm = {
					...nextForm,
					startLocationAddress: nextForm.startLocationAddress || match.label,
					startLatitude: match.latitude,
					startLongitude: match.longitude,
					timezone
				};
				didUpdate = true;
			}
		}

		if (
			safeTrim(nextForm.endLocationAddress || nextForm.endLocationName) &&
			(nextForm.endLatitude === '' ||
				nextForm.endLatitude == null ||
				nextForm.endLongitude === '' ||
				nextForm.endLongitude == null)
		) {
			const match = await geocodeLocation(nextForm.endLocationAddress || nextForm.endLocationName);
			if (match) {
				nextForm = {
					...nextForm,
					endLocationAddress: nextForm.endLocationAddress || match.label,
					endLatitude: match.latitude,
					endLongitude: match.longitude
				};
				didUpdate = true;
			}
		}

		if (didUpdate) form = nextForm;
		return nextForm;
	}

	async function saveRide() {
		saveError = '';
		saveSuccess = '';
		saving = true;
		geocodeError = '';
		try {
			const endpoint = manageMode ? `/api/rides/${rideId}` : '/api/rides';
			await ensureGeocodedForm();
			const payload = buildPayload();
			if (manageMode && applyFromOccurrenceStart) {
				payload.cutoffStart = applyFromOccurrenceStart;
			}

			const response = await fetch(endpoint, {
				method: manageMode ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to save ride.');

			const slug = result?.data?.activity?.slug;
			saveSuccess = manageMode ? 'Ride updated.' : 'Ride created.';
			if (slug) {
				await goto(`/ride/${slug}`, {
					invalidateAll: true,
					replaceState: manageMode
				});
			}
		} catch (error) {
			saveError = error.message || 'Unable to save ride.';
		} finally {
			saving = false;
		}
	}

	async function uploadImages(files) {
		if (!files?.length) return;
		imageUploadError = '';
		imageUploading = true;
		try {
			const remainingSlots = Math.max(0, 6 - form.imageUrls.length);
			if (!remainingSlots) {
				throw new Error('You can attach up to 6 images per ride.');
			}

			const selectedFiles = Array.from(files).slice(0, remainingSlots);
			const formData = new FormData();
			for (const file of selectedFiles) {
				formData.append('files', file);
			}

			const response = await fetch('/api/rides/images', {
				method: 'POST',
				body: formData
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to upload images.');

			const urls = (result?.files ?? []).map((file) => file?.url).filter(Boolean);
			form = {
				...form,
				imageUrls: [...form.imageUrls, ...urls].slice(0, 6)
			};
		} catch (error) {
			imageUploadError = error.message || 'Unable to upload images.';
		} finally {
			imageUploading = false;
		}
	}

	function buildRideImageContext() {
		const selectedHostGroup = hostGroups.find(
			(group) => String(group.id) === String(form.hostGroupId)
		);
		const startLocation = [safeTrim(form.startLocationName), safeTrim(form.startLocationAddress)]
			.filter(Boolean)
			.join(' · ');
		const endLocation = [safeTrim(form.endLocationName), safeTrim(form.endLocationAddress)]
			.filter(Boolean)
			.join(' · ');
		const difficulty = difficultyLevels
			.filter((level) => form.difficultyLevelIds.includes(level.id))
			.map((level) => level.name);
		const selectedDisciplines = disciplines
			.filter((discipline) => form.ridingDisciplineIds.includes(discipline.id))
			.map((discipline) => discipline.name);

		return {
			title: form.title,
			summary: form.summary,
			description: form.description,
			startLocation,
			endLocation,
			hostGroupLocation: [
				selectedHostGroup?.city,
				selectedHostGroup?.state_region,
				selectedHostGroup?.country
			]
				.filter((value) => safeTrim(value))
				.join(', '),
			hostGroupState: safeTrim(selectedHostGroup?.state_region),
			time: [form.startsAt, form.endsAt].filter(Boolean).join(' to '),
			distance: form.estimatedDistanceMiles ? `${form.estimatedDistanceMiles} miles` : '',
			difficulty,
			disciplines: selectedDisciplines,
			hostGroup: selectedHostGroup?.name || '',
			paceNotes: form.paceNotes,
			accessibilityNotes: form.accessibilityNotes
		};
	}

	function applyGeneratedRideImage(result) {
		const url = safeTrim(result?.url);
		if (!url) return;

		form = {
			...form,
			imageUrls: [url, ...form.imageUrls.filter((imageUrl) => imageUrl !== url)].slice(0, 6)
		};
	}

	function removeImage(index) {
		form = {
			...form,
			imageUrls: form.imageUrls.filter((_, imageIndex) => imageIndex !== index)
		};
	}

	function promoteImage(index) {
		if (index <= 0 || index >= form.imageUrls.length) return;
		const nextImages = [...form.imageUrls];
		const [selected] = nextImages.splice(index, 1);
		nextImages.unshift(selected);
		form = { ...form, imageUrls: nextImages };
	}

	async function sendAiPrompt() {
		if (!aiPrompt.trim()) return;
		aiError = '';
		aiLoading = true;
		const nextMessages = [...aiMessages, { role: 'user', content: aiPrompt.trim() }];
		aiMessages = nextMessages;
		const promptToSend = aiPrompt;
		aiPrompt = '';
		try {
			const response = await fetch('/api/ai/ride-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: nextMessages,
					context: buildPayload()
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to generate ride draft.');
			const reply =
				safeTrim(result.reply) || 'Tell me the route, pace, and timing, and I can keep drafting.';
			aiMessages = [...nextMessages, { role: 'assistant', content: reply }];
			latestAiDraft = result.draft ?? null;
			if (result.draft) {
				mergeDraft(result.draft);
			}
			if (result.follow_up_questions?.length) {
				aiMessages = [
					...aiMessages,
					{
						role: 'assistant',
						content: result.follow_up_questions.map((question) => `• ${question}`).join('\n')
					}
				];
			}
		} catch (error) {
			aiMessages = [
				...nextMessages,
				{ role: 'assistant', content: 'The drafting line went quiet for a minute.' }
			];
			aiError = error.message || 'Unable to generate ride draft.';
			aiPrompt = promptToSend;
		} finally {
			aiLoading = false;
		}
	}

	function beginOccurrenceEdit(occurrence) {
		selectedManageOccurrenceId = occurrence?.id ?? selectedManageOccurrenceId;
		occurrenceDraft = {
			id: occurrence.id,
			titleOverride: occurrence.title_override || '',
			startsAt: toLocalDateTimeValue(occurrence.starts_at),
			endsAt: toLocalDateTimeValue(occurrence.ends_at),
			status: occurrence.status,
			startLocationName: occurrence.start_location_name || '',
			startLocationAddress: occurrence.start_location_address || '',
			endLocationName: occurrence.end_location_name || '',
			endLocationAddress: occurrence.end_location_address || ''
		};
	}

	async function saveOccurrence() {
		if (!occurrenceDraft?.id) return;
		occurrenceSaveError = '';
		occurrenceSaving = true;
		try {
			const response = await fetch(`/api/rides/${rideId}/occurrences/${occurrenceDraft.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(occurrenceDraft)
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to update occurrence.');
			await goto(`/ride/${rideSlug}/manage`, { invalidateAll: true, replaceState: true });
		} catch (error) {
			occurrenceSaveError = error.message || 'Unable to update occurrence.';
		} finally {
			occurrenceSaving = false;
		}
	}

	async function addHost() {
		if (!newHostEmail.trim()) return;
		hostError = '';
		hostSaving = true;
		try {
			const response = await fetch(`/api/rides/${rideId}/hosts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: newHostEmail })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to add co-host.');
			hostEntries = [...hostEntries, result.data];
			newHostEmail = '';
		} catch (error) {
			hostError = error.message || 'Unable to add co-host.';
		} finally {
			hostSaving = false;
		}
	}

	async function removeHost(userId) {
		hostError = '';
		hostSaving = true;
		try {
			const response = await fetch(`/api/rides/${rideId}/hosts`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to remove co-host.');
			hostEntries = hostEntries.filter((entry) => entry.userId !== userId);
		} catch (error) {
			hostError = error.message || 'Unable to remove co-host.';
		} finally {
			hostSaving = false;
		}
	}

	async function sendOrganizerEmail() {
		const occurrenceId = selectedOccurrence?.id ?? null;
		if (!occurrenceId || !organizerEmailSubject.trim() || !organizerEmailBody.trim()) return;
		organizerEmailError = '';
		organizerEmailSending = true;
		try {
			const response = await fetch(`/api/rides/${rideId}/emails`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					occurrenceId,
					subject: organizerEmailSubject,
					body: organizerEmailBody
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to send organizer email.');
			organizerEmailSuccess = `Sent ${result?.data?.sent ?? 0} emails.`;
			organizerEmailSubject = '';
			organizerEmailBody = '';
		} catch (error) {
			organizerEmailError = error.message || 'Unable to send organizer email.';
		} finally {
			organizerEmailSending = false;
		}
	}

	async function deleteRide() {
		if (!rideId || deleting) return;
		const confirmed = window.confirm(
			`Delete this ${initialRide?.recurrenceRule ? 'ride series' : 'ride'}? This cannot be undone.`
		);
		if (!confirmed) return;

		deleteError = '';
		deleting = true;
		try {
			const response = await fetch(`/api/rides/${rideId}`, {
				method: 'DELETE'
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.error || 'Unable to delete ride.');
			await goto('/ride', { invalidateAll: true });
		} catch (error) {
			deleteError = error.message || 'Unable to delete ride.';
		} finally {
			deleting = false;
		}
	}

	const rideId = $derived(initialRide?.activity?.id ?? null);
	const rideSlug = $derived(initialRide?.activity?.slug ?? null);
	let form = $state(cloneDefaultForm());
	let slugTouched = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let saveSuccess = $state('');
	let imageUploading = $state(false);
	let imageUploadError = $state('');
	let geocodeLoading = $state('');
	let geocodeError = $state('');
	let aiMessages = $state([
		{
			role: 'assistant',
			content:
				'Give me the vibe, route, timing, and who the ride is for. I can draft the copy and the structure.'
		}
	]);
	let aiPrompt = $state('');
	let aiLoading = $state(false);
	let aiError = $state('');
	let latestAiDraft = $state(null);
	let aiMessagesEl = $state();
	let occurrenceDraft = $state(null);
	let occurrenceSaving = $state(false);
	let occurrenceSaveError = $state('');
	let newHostEmail = $state('');
	let hostSaving = $state(false);
	let hostError = $state('');
	let hostEntries = $state([]);
	let organizerEmailSubject = $state('');
	let organizerEmailBody = $state('');
	let organizerEmailSending = $state(false);
	let organizerEmailError = $state('');
	let organizerEmailSuccess = $state('');
	let selectedManageOccurrenceId = $state(null);
	let applyFromOccurrenceStart = $state('');
	let hostGroupSelection = $state([]);
	let hostGroupItems = $state([]);
	let deleteError = $state('');
	let deleting = $state(false);
	let timezoneOptions = $state(RIDE_TIMEZONES);

	const occurrenceEntries = $derived(initialRide?.occurrences ?? []);
	const selectedOccurrence = $derived(
		occurrenceEntries.find(
			(occurrence) => String(occurrence.id) === String(selectedManageOccurrenceId)
		) ?? null
	);
	const selectedOccurrenceRsvps = $derived(selectedOccurrence?.rsvps ?? []);
	const aiConversationStarted = $derived(aiMessages.length > 1);
	const hostGroupOptions = $derived(
		hostGroups.map((group) => ({
			label: group.name,
			value: String(group.id),
			slug: group.slug
		}))
	);
	const hostGroupCollection = $derived(
		useListCollection({
			items: hostGroupItems,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);

	let initializedFromProps = $state(false);

	$effect(() => {
		if (initializedFromProps) return;
		form = initializeForm(initialRide);
		slugTouched = Boolean(initialRide?.activity?.slug);
		hostEntries = initialRide?.hosts ?? [];
		const nextOccurrence =
			(initialRide?.occurrences ?? []).find(
				(occurrence) => new Date(occurrence.starts_at) >= new Date()
			) ??
			initialRide?.occurrences?.[0] ??
			null;
		selectedManageOccurrenceId = nextOccurrence?.id ?? null;
		applyFromOccurrenceStart = manageMode ? nextOccurrence?.starts_at || '' : '';
		hostGroupSelection = form.hostGroupId ? [String(form.hostGroupId)] : [];
		hostGroupItems = hostGroupOptions;
		initializedFromProps = true;
	});

	$effect(() => {
		if (!initializedFromProps) return;
		hostGroupItems = hostGroupOptions;
	});

	$effect(() => {
		const messageCount = aiMessages.length;
		if (!messageCount || !aiMessagesEl) return;

		tick().then(() => {
			if (!aiMessagesEl) return;
			aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
		});
	});

	onMount(() => {
		void (async () => {
			timezoneOptions = supportedTimezoneOptions();
			const fallbackTimezone = timezoneOptions.includes(form.timezone)
				? form.timezone
				: timezoneOptions[0] || 'UTC';
			let nextTimezone = fallbackTimezone;

			try {
				const browserTimezone = Intl.DateTimeFormat().resolvedOptions()?.timeZone;
				if (
					browserTimezone &&
					timezoneOptions.includes(browserTimezone) &&
					form.timezone === DEFAULT_RIDE_FORM.timezone
				) {
					nextTimezone = browserTimezone;
				}
			} catch {
				// ignore unsupported browsers
			}

			if (form.startLatitude !== '' && form.startLongitude !== '') {
				const coordinateTimezone = await resolveTimezoneForCoordinates(
					form.startLatitude,
					form.startLongitude
				);
				if (coordinateTimezone) nextTimezone = coordinateTimezone;
			}

			if (nextTimezone !== form.timezone) {
				form = { ...form, timezone: nextTimezone };
			}
		})();

		return undefined;
	});

	$effect(() => {
		if (form.startLatitude === '' || form.startLongitude === '') return;
		void syncTimezoneFromCoordinates(form.startLatitude, form.startLongitude);
	});

	function handleHostGroupValueChange(value) {
		hostGroupSelection = value;
		const nextId = value?.[0] ?? '';
		form = { ...form, hostGroupId: nextId };
	}

	function handleHostGroupSearch(inputValue) {
		const query = safeTrim(inputValue).toLowerCase();
		if (!query) {
			hostGroupItems = hostGroupOptions;
			return;
		}
		const filtered = hostGroupOptions.filter(
			(option) =>
				option.label.toLowerCase().includes(query) || option.slug?.toLowerCase().includes(query)
		);
		hostGroupItems = filtered.length ? filtered : hostGroupOptions;
	}

	function clearHostGroupSelection() {
		hostGroupSelection = [];
		hostGroupItems = hostGroupOptions;
		form = { ...form, hostGroupId: '' };
	}

	function handleHostGroupOpenChange() {
		hostGroupItems = hostGroupOptions;
	}
</script>

<div class="mx-auto w-full max-w-7xl space-y-6">
	<!-- ── Hero ── -->
	<section class="editor-hero relative overflow-hidden rounded-3xl">
		<div class="editor-orb editor-orb-1" aria-hidden="true"></div>
		<div class="editor-orb editor-orb-2" aria-hidden="true"></div>
		<div
			class="relative z-10 flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8"
		>
			<div class="space-y-1.5">
				<p class="editor-eyebrow">Ride Builder</p>
				<h1 class="editor-title">{pageTitle}</h1>
				{#if pageDescription}
					<p class="max-w-2xl text-sm leading-relaxed opacity-75">{pageDescription}</p>
				{/if}
			</div>
			<div class="flex shrink-0 flex-col gap-2">
				{#if !currentUser}
					<p class="text-sm opacity-70">Log in to save your ride.</p>
				{/if}
				<button
					class="btn preset-filled-primary-500 gap-2"
					onclick={saveRide}
					disabled={!currentUser || saving}
				>
					{#if saving}
						<IconLoader class="h-4 w-4 animate-spin" />
						Saving…
					{:else}
						<IconSave class="h-4 w-4" />
						{manageMode ? 'Save changes' : 'Create ride'}
					{/if}
				</button>
			</div>
		</div>
		{#if saveError}
			<div
				class="border-error-500/30 bg-error-500/10 relative z-10 mx-6 mb-4 rounded-xl border p-3 text-sm"
			>
				{saveError}
			</div>
		{/if}
		{#if saveSuccess}
			<div
				class="border-success-500/30 bg-success-500/10 relative z-10 mx-6 mb-4 rounded-xl border p-3 text-sm"
			>
				{saveSuccess}
			</div>
		{/if}
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
		<div class="order-2 space-y-6 xl:order-1">
			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconCalendarClock class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Overview</h2>
				</div>
				<div class="p-5 pt-4">
					<div class="grid gap-4 md:grid-cols-2">
						<label class="block md:col-span-2">
							<span class="label mb-1">Ride title</span>
							<input
								class="input"
								value={form.title}
								oninput={(event) => updateTitle(event.currentTarget.value)}
								placeholder="Sunrise gravel loop"
							/>
						</label>
						<label class="block md:col-span-2">
							<span class="label mb-1">Slug</span>
							<input
								class="input"
								value={form.slug}
								oninput={(event) => (
									(slugTouched = true),
									(form = { ...form, slug: slugify(event.currentTarget.value) })
								)}
							/>
						</label>
						<label class="block md:col-span-2">
							<span class="label mb-1">Summary</span>
							<input
								class="input"
								value={form.summary}
								oninput={(event) => (form = { ...form, summary: event.currentTarget.value })}
								placeholder="Short, sharp, public-facing hook"
							/>
						</label>
						<label class="block md:col-span-2">
							<span class="label mb-1">Description</span>
							<textarea
								class="textarea min-h-32"
								value={form.description}
								oninput={(event) => (form = { ...form, description: event.currentTarget.value })}
								placeholder="What the ride feels like, what riders should expect, and anything they should bring."
							></textarea>
						</label>
						<label class="block">
							<span class="label mb-1">Status</span>
							<select class="select" bind:value={form.status}>
								<option value="draft">Draft</option>
								<option value="published">Published</option>
								<option value="cancelled">Cancelled</option>
							</select>
						</label>
						<label class="block">
							<span class="label mb-1">Timezone</span>
							<select class="select" bind:value={form.timezone}>
								{#each timezoneOptions as timezone}
									<option value={timezone}>{timezone}</option>
								{/each}
							</select>
						</label>
						<div class="card preset-tonal-secondary p-4 md:col-span-2">
							<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div class="space-y-1">
									<div class="font-medium">Hosting</div>
									<p class="text-sm opacity-75">
										Turn this off if you are posting the ride on behalf of someone else. Unhosted
										rides can be claimed later.
									</p>
								</div>
								<label class="flex items-center gap-3">
									<input type="checkbox" class="checkbox" bind:checked={form.isHost} />
									<span class="font-medium">I am one of the ride hosts</span>
								</label>
							</div>
						</div>
						<div class="flex flex-col gap-2">
							<Combobox
								class="w-full"
								placeholder="Search any organization..."
								collection={hostGroupCollection}
								value={hostGroupSelection}
								onValueChange={(event) => handleHostGroupValueChange(event.value)}
								onInputValueChange={(event) => handleHostGroupSearch(event.inputValue)}
								onOpenChange={handleHostGroupOpenChange}
								inputBehavior="autohighlight"
							>
								<Combobox.Label>Organization</Combobox.Label>
								<Combobox.Control class="grid grid-cols-[1fr_auto]">
									<Combobox.Input class="input col-span-1" />
									<Combobox.Trigger />
								</Combobox.Control>
								<Combobox.ClearTrigger>Clear organization</Combobox.ClearTrigger>
								<Portal>
									<Combobox.Positioner>
										<Combobox.Content class="card preset-tonal-surface p-2">
											{#each hostGroupItems as item (item.value)}
												<Combobox.Item {item} class="border-surface-500 border-b p-2">
													<Combobox.ItemText>{item.label}</Combobox.ItemText>
													<Combobox.ItemIndicator />
												</Combobox.Item>
											{/each}
										</Combobox.Content>
									</Combobox.Positioner>
								</Portal>
							</Combobox>
							{#if hostGroupSelection.length}
								<button
									type="button"
									class="text-primary-700-300 text-left text-xs underline"
									onclick={clearHostGroupSelection}
								>
									Clear organization
								</button>
							{:else}
								<p class="text-xs opacity-65">Leave blank for an independent organizer.</p>
							{/if}
						</div>
						<label class="block">
							<span class="label mb-1">Participant list</span>
							<select class="select" bind:value={form.participantVisibility}>
								<option value="public">Public</option>
								<option value="private">Private to hosts</option>
							</select>
						</label>
					</div>
				</div>
			</section>

			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconPlus class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Images</h2>
				</div>
				<div class="space-y-4 p-5 pt-4">
					<ImageGeneratorPanel
						target="ride"
						heading="Generate ride art"
						description="Create a lead ride image from the ride details already on this page."
						helperText=""
						currentImageUrl={form.imageUrls[0] || ''}
						buildContext={buildRideImageContext}
						onApply={applyGeneratedRideImage}
					/>
					<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
						<div class="space-y-1">
							<p class="font-medium">Attach up to 6 ride photos</p>
							<p class="text-sm opacity-70">
								The first image becomes the lead photo on the ride page. Featured cards on `/ride`
								only show that lead image so the directory stays readable.
							</p>
						</div>
						<label class="btn preset-outlined-primary-500 cursor-pointer gap-2">
							<input
								type="file"
								class="hidden"
								accept="image/jpeg,image/png,image/webp,image/gif"
								multiple
								disabled={!currentUser || imageUploading || form.imageUrls.length >= 6}
								onchange={(event) => {
									void uploadImages(event.currentTarget.files);
									event.currentTarget.value = '';
								}}
							/>
							{imageUploading ? 'Uploading…' : 'Add images'}
						</label>
					</div>
					{#if imageUploadError}
						<div class="card preset-tonal-warning p-3 text-sm">{imageUploadError}</div>
					{/if}
					{#if form.imageUrls.length}
						<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{#each form.imageUrls as imageUrl, index (imageUrl)}
								<div
									class="ride-image-card border-surface-500/20 overflow-hidden rounded-2xl border"
								>
									<img
										src={imageUrl}
										alt={`Ride image ${index + 1}`}
										class="h-44 w-full object-cover"
									/>
									<div class="flex items-center justify-between gap-2 p-3">
										<div class="text-sm font-medium">
											{index === 0 ? 'Lead image' : `Image ${index + 1}`}
										</div>
										<div class="flex gap-2">
											{#if index > 0}
												<button
													type="button"
													class="btn btn-sm preset-outlined-secondary-500"
													onclick={() => promoteImage(index)}
												>
													Use as lead
												</button>
											{/if}
											<button
												type="button"
												class="btn btn-sm preset-outlined-error-500"
												onclick={() => removeImage(index)}
											>
												<IconTrash2 class="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="border-surface-500/25 rounded-2xl border border-dashed p-6 text-sm opacity-70"
						>
							No ride images yet.
						</div>
					{/if}
				</div>
			</section>

			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconMapPin class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Schedule and Route</h2>
				</div>
				<div class="p-5 pt-4">
					<div class="grid gap-4 md:grid-cols-2">
						<label class="block">
							<span class="label mb-1">Start</span>
							<input type="datetime-local" class="input" bind:value={form.startsAt} />
						</label>
						<label class="block">
							<span class="label mb-1">End</span>
							<input type="datetime-local" class="input" bind:value={form.endsAt} />
						</label>
						<label class="block md:col-span-2">
							<span class="label mb-1">Start location</span>
							<input class="input" bind:value={form.startLocationName} placeholder="Meet at..." />
						</label>
						<label class="block md:col-span-2">
							<span class="label mb-1">Start address</span>
							<div class="flex gap-2">
								<input
									class="input flex-1"
									bind:value={form.startLocationAddress}
									placeholder="123 Main St, City, ST"
								/>
								<button
									type="button"
									class="btn preset-outlined-secondary-500 shrink-0"
									onclick={() => geocode('start')}
									disabled={geocodeLoading === 'start'}
								>
									{geocodeLoading === 'start' ? 'Locating...' : 'Geocode'}
								</button>
							</div>
						</label>
						<label class="block">
							<span class="label mb-1">End location</span>
							<input
								class="input"
								bind:value={form.endLocationName}
								placeholder="Optional finish point"
							/>
						</label>
						<label class="block">
							<span class="label mb-1">End address</span>
							<div class="flex gap-2">
								<input
									class="input flex-1"
									bind:value={form.endLocationAddress}
									placeholder="Optional finish address"
								/>
								<button
									type="button"
									class="btn preset-outlined-secondary-500 shrink-0"
									onclick={() => geocode('end')}
									disabled={geocodeLoading === 'end'}
								>
									{geocodeLoading === 'end' ? 'Locating...' : 'Geocode'}
								</button>
							</div>
						</label>
					</div>
					{#if geocodeError}
						<div class="card preset-tonal-warning mt-4 p-3 text-sm">{geocodeError}</div>
					{/if}

					<div class="mt-6 space-y-4">
						<label class="flex items-center gap-3">
							<input type="checkbox" class="checkbox" bind:checked={form.recurrenceEnabled} />
							<span class="font-medium">Recurring ride</span>
						</label>
						{#if form.recurrenceEnabled}
							<div class="border-surface-500/20 grid gap-4 rounded-xl border p-4 md:grid-cols-2">
								<label class="block">
									<span class="label mb-1">Pattern</span>
									<select class="select" bind:value={form.recurrenceFrequency}>
										<option value="weekly">Weekly</option>
										<option value="monthly">Monthly</option>
									</select>
								</label>
								<label class="block">
									<span class="label mb-1">Interval</span>
									<input type="number" min="1" class="input" bind:value={form.recurrenceInterval} />
								</label>
								<div class="md:col-span-2">
									<span class="label mb-2 block">Weekdays</span>
									<div class="flex flex-wrap gap-2">
										{#each WEEKDAY_OPTIONS as option}
											<button
												type="button"
												class={`chip ${form.recurrenceWeekdays.includes(option.value) ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
												onclick={() => toggleSelection('recurrenceWeekdays', option.value)}
											>
												{option.label}
											</button>
										{/each}
									</div>
								</div>
								{#if form.recurrenceFrequency === 'monthly'}
									<div class="md:col-span-2">
										<span class="label mb-2 block">Month positions</span>
										<div class="flex flex-wrap gap-2">
											{#each MONTH_POSITION_OPTIONS as option}
												<button
													type="button"
													class={`chip ${form.recurrenceMonthPositions.includes(option.value) ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}`}
													onclick={() => toggleSelection('recurrenceMonthPositions', option.value)}
												>
													{option.label}
												</button>
											{/each}
										</div>
									</div>
								{/if}
								<label class="block">
									<span class="label mb-1">Repeat until</span>
									<input type="date" class="input" bind:value={form.recurrenceUntilOn} />
								</label>
								{#if manageMode && occurrenceEntries.length}
									<label class="block">
										<span class="label mb-1">Apply series changes from</span>
										<select class="select" bind:value={applyFromOccurrenceStart}>
											<option value="">Series start</option>
											{#each occurrenceEntries.filter((entry) => entry.status === 'scheduled') as occurrence}
												<option value={occurrence.starts_at}>
													{new Date(occurrence.starts_at).toLocaleString()}
												</option>
											{/each}
										</select>
									</label>
								{/if}
							</div>
						{/if}

						<div class="border-surface-500/20 rounded-xl border p-4">
							<div class="mb-3 flex items-center justify-between">
								<div>
									<h3 class="font-semibold">Skipped dates</h3>
									<p class="text-sm opacity-70">
										One-off dates or ranges to skip for closures and holidays.
									</p>
								</div>
								<button
									type="button"
									class="btn preset-outlined-secondary-500"
									onclick={addExclusion}
								>
									<IconPlus class="h-4 w-4" />
									Add skip
								</button>
							</div>
							<div class="space-y-3">
								{#each form.exclusions as exclusion (exclusion.id)}
									<div
										class="border-surface-500/20 grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_2fr_auto]"
									>
										<input
											type="date"
											class="input"
											value={exclusion.starts_on}
											oninput={(event) =>
												updateExclusion(exclusion.id, 'starts_on', event.currentTarget.value)}
										/>
										<input
											type="date"
											class="input"
											value={exclusion.ends_on}
											oninput={(event) =>
												updateExclusion(exclusion.id, 'ends_on', event.currentTarget.value)}
										/>
										<input
											class="input"
											value={exclusion.note}
											placeholder="Optional note"
											oninput={(event) =>
												updateExclusion(exclusion.id, 'note', event.currentTarget.value)}
										/>
										<button
											type="button"
											class="btn preset-outlined-error-500"
											onclick={() => removeExclusion(exclusion.id)}
										>
											<IconTrash2 class="h-4 w-4" />
										</button>
									</div>
								{/each}
								{#if !form.exclusions.length}
									<p class="text-sm opacity-70">No skips yet.</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</section>

			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconUsers class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Rider Fit and Labels</h2>
				</div>
				<div class="p-5 pt-4">
					<div class="grid gap-5 md:grid-cols-2">
						<div>
							<span class="label mb-2 block">Difficulty</span>
							<div class="flex flex-wrap gap-2">
								{#each difficultyLevels as level}
									<button
										type="button"
										class={`chip ${form.difficultyLevelIds.includes(level.id) ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
										onclick={() => toggleSelection('difficultyLevelIds', level.id)}
									>
										{level.name}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<span class="label mb-2 block">Discipline</span>
							<div class="flex flex-wrap gap-2">
								{#each disciplines as discipline}
									<button
										type="button"
										class={`chip ${form.ridingDisciplineIds.includes(discipline.id) ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}`}
										onclick={() => toggleSelection('ridingDisciplineIds', discipline.id)}
									>
										{discipline.name}
									</button>
								{/each}
							</div>
						</div>
						<label class="block">
							<span class="label mb-1">Distance (miles)</span>
							<input
								type="number"
								step="0.1"
								class="input"
								bind:value={form.estimatedDistanceMiles}
							/>
						</label>
						<label class="block">
							<span class="label mb-1">Duration (minutes)</span>
							<input
								type="number"
								min="0"
								class="input"
								bind:value={form.estimatedDurationMinutes}
							/>
						</label>
						<label class="block">
							<span class="label mb-1">Elevation gain (feet)</span>
							<input type="number" min="0" class="input" bind:value={form.elevationGainFeet} />
						</label>
						<label class="block">
							<span class="label mb-1">Pace notes</span>
							<input
								class="input"
								bind:value={form.paceNotes}
								placeholder="Conversational, spicy climbs, steady social pace..."
							/>
						</label>
						<div class="flex flex-wrap items-center gap-6 md:col-span-2">
							<label class="flex items-center gap-2">
								<input type="checkbox" class="checkbox" bind:checked={form.isNoDrop} />
								<span>No-drop ride</span>
							</label>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="checkbox" bind:checked={form.waiverRequired} />
								<span>Waiver required</span>
							</label>
						</div>
						<div class="md:col-span-2">
							<span class="label mb-2 block">Surface types</span>
							<div class="flex flex-wrap gap-2">
								{#each SURFACE_TYPE_OPTIONS as option}
									<button
										type="button"
										class={`chip ${form.surfaceTypes.includes(option) ? 'preset-filled-success-500' : 'preset-tonal-surface'}`}
										onclick={() => toggleSelection('surfaceTypes', option)}
									>
										{option}
									</button>
								{/each}
							</div>
						</div>
						<div class="md:col-span-2">
							<span class="label mb-2 block">Bike suitability</span>
							<div class="flex flex-wrap gap-2">
								{#each BIKE_SUITABILITY_OPTIONS as option}
									<button
										type="button"
										class={`chip ${form.bikeSuitability.includes(option) ? 'preset-filled-warning-500' : 'preset-tonal-surface'}`}
										onclick={() => toggleSelection('bikeSuitability', option)}
									>
										{option}
									</button>
								{/each}
							</div>
						</div>
						<label class="block md:col-span-2">
							<span class="label mb-1">Accessibility notes</span>
							<textarea
								class="textarea min-h-24"
								bind:value={form.accessibilityNotes}
								placeholder="Accessibility, regroup habits, transit access, bathroom notes, anything riders should know."
							></textarea>
						</label>
					</div>
				</div>
			</section>

			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconMail class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Reminder Emails</h2>
					<button
						type="button"
						class="btn btn-sm preset-outlined-secondary-500 ml-auto gap-1"
						onclick={addEmailTemplate}
					>
						<IconPlus class="h-3.5 w-3.5" />
						Add template
					</button>
				</div>
				<div class="p-5 pt-4">
					<div class="space-y-4">
						{#each form.emailTemplates as template (template.id)}
							<div class="border-surface-500/20 rounded-xl border p-4">
								<div class="grid gap-3 md:grid-cols-2">
									<label class="block">
										<span class="label mb-1">Template name</span>
										<input
											class="input"
											value={template.name}
											oninput={(event) =>
												updateEmailTemplate(template.id, 'name', event.currentTarget.value)}
										/>
									</label>
									<label class="block">
										<span class="label mb-1">Send before ride (minutes)</span>
										<input
											type="number"
											min="0"
											class="input"
											value={template.sendOffsetMinutes}
											oninput={(event) =>
												updateEmailTemplate(
													template.id,
													'sendOffsetMinutes',
													event.currentTarget.value
												)}
										/>
									</label>
									<label class="block md:col-span-2">
										<span class="label mb-1">Subject</span>
										<input
											class="input"
											value={template.subject}
											oninput={(event) =>
												updateEmailTemplate(template.id, 'subject', event.currentTarget.value)}
											placeholder={'Tomorrow: {{ride_title}}'}
										/>
									</label>
									<label class="block md:col-span-2">
										<span class="label mb-1">Body</span>
										<textarea
											class="textarea min-h-28"
											value={template.body}
											oninput={(event) =>
												updateEmailTemplate(template.id, 'body', event.currentTarget.value)}
										></textarea>
									</label>
								</div>
								<div class="mt-3 flex items-center justify-between">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											class="checkbox"
											checked={template.isActive}
											onchange={(event) =>
												updateEmailTemplate(template.id, 'isActive', event.currentTarget.checked)}
										/>
										<span>Active</span>
									</label>
									<button
										type="button"
										class="btn preset-outlined-error-500"
										onclick={() => removeEmailTemplate(template.id)}
									>
										<IconTrash2 class="h-4 w-4" />
										Remove
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</section>

			<section class="card preset-tonal-primary p-5">
				<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 class="text-lg font-semibold">
							{manageMode ? 'Ready to update this ride?' : 'Ready to publish this ride?'}
						</h2>
					</div>
					<button
						class="btn preset-filled-primary-500 gap-2"
						onclick={saveRide}
						disabled={!currentUser || saving}
					>
						{#if saving}
							<IconLoader class="h-4 w-4 animate-spin" />
							Saving…
						{:else}
							<IconSave class="h-4 w-4" />
							{manageMode ? 'Save changes' : 'Create ride'}
						{/if}
					</button>
				</div>
			</section>

			{#if manageMode}
				<section class="card preset-tonal-error p-5">
					<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 class="text-lg font-semibold">
								Delete this {initialRide?.recurrenceRule ? 'ride series' : 'ride'}
							</h2>
							<p class="mt-1 text-sm opacity-75">
								This permanently removes the ride, its occurrences, RSVPs, reminders, and host data.
							</p>
						</div>
						<button
							type="button"
							class="btn preset-outlined-error-500 gap-2"
							onclick={deleteRide}
							disabled={deleting}
						>
							{#if deleting}
								<IconLoader class="h-4 w-4 animate-spin" />
								Deleting…
							{:else}
								<IconTrash2 class="h-4 w-4" />
								Delete {initialRide?.recurrenceRule ? 'series' : 'ride'}
							{/if}
						</button>
					</div>
					{#if deleteError}
						<div class="mt-3 text-sm">{deleteError}</div>
					{/if}
				</section>
			{/if}

			{#if manageMode}
				<section class="card preset-tonal-surface p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconUsers class="h-5 w-5" />
						Hosts and Participants
					</div>
					<div class="grid gap-6 xl:grid-cols-2">
						<div class="space-y-4">
							<div>
								<h3 class="font-semibold">Co-hosts</h3>
								<p class="text-sm opacity-70">
									Owners and admins of the attached organization already inherit access.
								</p>
							</div>
							<div class="flex gap-2">
								<input
									class="input flex-1"
									bind:value={newHostEmail}
									placeholder="cohost@example.com"
								/>
								<button
									type="button"
									class="btn preset-filled-secondary-500"
									onclick={addHost}
									disabled={hostSaving}
								>
									Add
								</button>
							</div>
							{#if hostError}
								<div class="card preset-tonal-error p-3 text-sm">{hostError}</div>
							{/if}
							<div class="space-y-2">
								{#each hostEntries as host (host.userId)}
									<div
										class="border-surface-500/20 flex items-center justify-between rounded-xl border p-3"
									>
										<div>
											<div class="font-medium">{host.profile?.fullName || 'Unnamed host'}</div>
											<div class="text-sm opacity-70">
												{host.profile?.email || 'No email on file'}
											</div>
										</div>
										<button
											type="button"
											class="btn btn-sm preset-outlined-error-500"
											onclick={() => removeHost(host.userId)}
											disabled={hostSaving}
										>
											Remove
										</button>
									</div>
								{/each}
								{#if !hostEntries.length}
									<p class="text-sm opacity-70">No co-hosts yet.</p>
								{/if}
							</div>
						</div>

						<div class="space-y-4">
							<div>
								<h3 class="font-semibold">Occurrence roster</h3>
								<p class="text-sm opacity-70">
									Participants are shown for the selected ride occurrence.
								</p>
							</div>
							{#if occurrenceEntries.length}
								<select class="select" bind:value={selectedManageOccurrenceId}>
									<option value="">Choose an occurrence</option>
									{#each occurrenceEntries as occurrence}
										<option value={occurrence.id}
											>{new Date(occurrence.starts_at).toLocaleString()}</option
										>
									{/each}
								</select>
								<div class="space-y-2">
									{#each selectedOccurrenceRsvps as rsvp (rsvp.id)}
										<div class="border-surface-500/20 rounded-xl border p-3">
											<div class="font-medium">{rsvp.participantName}</div>
											<div class="text-sm opacity-70">{rsvp.participantEmail}</div>
										</div>
									{/each}
									{#if !selectedOccurrenceRsvps.length}
										<p class="text-sm opacity-70">No one has RSVP'd for that occurrence yet.</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</section>

				<section class="card preset-tonal-surface p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconMail class="h-5 w-5" />
						Email Participants
					</div>
					<div class="grid gap-4">
						<label class="block">
							<span class="label mb-1">Occurrence</span>
							<select class="select" bind:value={selectedManageOccurrenceId}>
								<option value="">Choose an occurrence</option>
								{#each occurrenceEntries as occurrence}
									<option value={occurrence.id}
										>{new Date(occurrence.starts_at).toLocaleString()}</option
									>
								{/each}
							</select>
						</label>
						<label class="block">
							<span class="label mb-1">Subject</span>
							<input class="input" bind:value={organizerEmailSubject} />
						</label>
						<label class="block">
							<span class="label mb-1">Message</span>
							<textarea class="textarea min-h-28" bind:value={organizerEmailBody}></textarea>
						</label>
						<div class="flex items-center gap-3">
							<button
								type="button"
								class="btn preset-filled-primary-500"
								onclick={sendOrganizerEmail}
								disabled={organizerEmailSending || !selectedManageOccurrenceId}
							>
								{organizerEmailSending ? 'Sending...' : 'Send to participants'}
							</button>
							{#if organizerEmailSuccess}
								<span class="text-success-700-300 text-sm">{organizerEmailSuccess}</span>
							{/if}
						</div>
						{#if organizerEmailError}
							<div class="card preset-tonal-error p-3 text-sm">{organizerEmailError}</div>
						{/if}
					</div>
				</section>

				<section class="card preset-tonal-surface p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconCalendarClock class="h-5 w-5" />
						Edit One Occurrence
					</div>
					{#if occurrenceEntries.length}
						<div class="grid gap-4">
							<label class="block">
								<span class="label mb-1">Occurrence</span>
								<select
									class="select"
									onchange={(event) =>
										beginOccurrenceEdit(
											occurrenceEntries.find(
												(entry) => String(entry.id) === event.currentTarget.value
											)
										)}
								>
									<option value="">Pick one occurrence</option>
									{#each occurrenceEntries as occurrence}
										<option value={occurrence.id}
											>{new Date(occurrence.starts_at).toLocaleString()}</option
										>
									{/each}
								</select>
							</label>
							{#if occurrenceDraft}
								<div class="grid gap-4 md:grid-cols-2">
									<label class="block">
										<span class="label mb-1">Start</span>
										<input
											type="datetime-local"
											class="input"
											bind:value={occurrenceDraft.startsAt}
										/>
									</label>
									<label class="block">
										<span class="label mb-1">End</span>
										<input
											type="datetime-local"
											class="input"
											bind:value={occurrenceDraft.endsAt}
										/>
									</label>
									<label class="block">
										<span class="label mb-1">Status</span>
										<select class="select" bind:value={occurrenceDraft.status}>
											<option value="scheduled">Scheduled</option>
											<option value="cancelled">Cancelled</option>
										</select>
									</label>
									<label class="block">
										<span class="label mb-1">Title override</span>
										<input class="input" bind:value={occurrenceDraft.titleOverride} />
									</label>
									<label class="block md:col-span-2">
										<span class="label mb-1">Start location override</span>
										<input class="input" bind:value={occurrenceDraft.startLocationName} />
									</label>
									<label class="block md:col-span-2">
										<span class="label mb-1">Start address override</span>
										<input class="input" bind:value={occurrenceDraft.startLocationAddress} />
									</label>
									<label class="block">
										<span class="label mb-1">End location override</span>
										<input class="input" bind:value={occurrenceDraft.endLocationName} />
									</label>
									<label class="block">
										<span class="label mb-1">End address override</span>
										<input class="input" bind:value={occurrenceDraft.endLocationAddress} />
									</label>
								</div>
								<div class="mt-4 flex items-center gap-3">
									<button
										type="button"
										class="btn preset-filled-primary-500"
										onclick={saveOccurrence}
										disabled={occurrenceSaving}
									>
										{occurrenceSaving ? 'Saving...' : 'Save occurrence'}
									</button>
									{#if occurrenceSaveError}
										<span class="text-error-700-300 text-sm">{occurrenceSaveError}</span>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<p class="text-sm opacity-70">No occurrences have been generated yet.</p>
					{/if}
				</section>
			{/if}
		</div>

		<aside class="order-1 space-y-5 xl:sticky xl:top-24 xl:order-2 xl:self-start">
			<!-- AI Intake -->
			<section class="ai-panel card overflow-hidden">
				<div class="ai-panel-header p-4 pb-3">
					<div class="flex items-center gap-2">
						<IconSparkles class="h-4 w-4" />
						<span class="text-sm font-bold tracking-[0.18em] uppercase">Ride Muse</span>
						{#if aiLoading}
							<span class="ml-auto flex items-center gap-1.5 text-xs opacity-60">
								<IconLoader class="h-3 w-3 animate-spin" />
								Drafting…
							</span>
						{/if}
					</div>
				</div>
				<div bind:this={aiMessagesEl} class="ai-messages space-y-2 px-4 py-3">
					{#each aiMessages as message, index (`${message.role}-${index}`)}
						<div class={`ai-bubble ai-bubble-${message.role}`}>
							<div class="ai-bubble-label">
								{message.role === 'assistant' ? '✦ Ride Muse' : 'You'}
							</div>
							<div class=" text-sm leading-relaxed whitespace-pre-wrap">
								{message.content}
							</div>
						</div>
					{/each}
					{#if aiLoading}
						<div class="ai-bubble ai-bubble-assistant ai-bubble-loading">
							<div class="ai-bubble-label">✦ Ride Muse</div>
							<div class="flex items-center gap-2 text-sm">
								<span class="ai-loader-dot"></span>
								<span class="ai-loader-dot ai-loader-dot-delay-1"></span>
								<span class="ai-loader-dot ai-loader-dot-delay-2"></span>
								<span class="opacity-70">Drafting your ride…</span>
							</div>
						</div>
					{/if}
				</div>
				<div class="border-surface-500/15 space-y-3 border-t p-4 pt-3">
					<textarea
						class="textarea preset-tonal-surface min-h-24 text-sm"
						bind:value={aiPrompt}
						placeholder="Monthly coffee ride, 18 miles, casual pace, first and third Monday, start downtown…"
					></textarea>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="btn preset-filled-secondary-500 flex-1 gap-1.5"
							onclick={sendAiPrompt}
							disabled={aiLoading}
						>
							<IconSparkles class="h-3.5 w-3.5" />
							{aiLoading ? 'Drafting…' : aiConversationStarted ? 'Send' : 'Ask Ride Muse'}
						</button>
					</div>
					{#if aiLoading}
						<div class="card preset-tonal-secondary flex items-center gap-3 p-3 text-xs">
							<span class="relative flex h-3 w-3">
								<span
									class="bg-secondary-400 absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
								></span>
								<span class="bg-secondary-500 relative inline-flex h-3 w-3 rounded-full"></span>
							</span>
							<span>Ride Muse is shaping copy, timing, and structure from your prompt.</span>
						</div>
					{/if}
					{#if aiError}
						<div class="border-warning-500/30 bg-warning-500/10 rounded-lg border p-2.5 text-xs">
							{aiError}
						</div>
					{/if}
				</div>
			</section>

			<section class="editor-section card preset-tonal-surface">
				<div class="editor-section-header">
					<div class="editor-section-icon"><IconMail class="h-4 w-4" /></div>
					<h2 class="editor-section-title">Contact</h2>
				</div>
				<div class="grid gap-3 p-5 pt-4">
					<label class="block">
						<span class="label mb-1">Reply-to email</span>
						<input class="input" bind:value={form.contactEmail} />
					</label>
					<label class="block">
						<span class="label mb-1">Phone</span>
						<input class="input" bind:value={form.contactPhone} />
					</label>
				</div>
			</section>
		</aside>
	</div>
</div>

<style>
	/* ── Hero ── */
	.editor-hero {
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-950) 86%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	.editor-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(64px);
		pointer-events: none;
	}

	.editor-orb-1 {
		width: 50%;
		height: 250%;
		top: -75%;
		left: -8%;
		background: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		animation: editor-orb-drift 20s ease-in-out infinite alternate;
	}

	.editor-orb-2 {
		width: 40%;
		height: 200%;
		top: -50%;
		right: 0;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: editor-orb-drift 26s ease-in-out infinite alternate-reverse;
	}

	@keyframes editor-orb-drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		100% {
			transform: translate(3%, 8%) scale(1.06);
		}
	}

	.editor-eyebrow {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.22em;
		opacity: 0.6;
	}

	.editor-title {
		font-size: 1.875rem;
		font-weight: 800;
		color: var(--color-primary-50);
		text-align: left;
		background: linear-gradient(120deg, var(--color-primary-200), var(--color-secondary-200));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* ── Section cards ── */
	.editor-section {
		overflow: hidden;
	}

	.editor-section-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		background: color-mix(in oklab, var(--color-surface-500) 6%, transparent);
	}

	.ai-loader-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-secondary-400) 75%, white);
		animation: ai-loader-bounce 1.2s ease-in-out infinite;
	}

	.ai-loader-dot-delay-1 {
		animation-delay: 0.15s;
	}

	.ai-loader-dot-delay-2 {
		animation-delay: 0.3s;
	}

	.ai-bubble-loading {
		border-style: dashed;
	}

	@keyframes ai-loader-bounce {
		0%,
		80%,
		100% {
			transform: scale(0.72);
			opacity: 0.45;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.editor-section-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		color: var(--color-primary-300);
		flex-shrink: 0;
	}

	.editor-section-title {
		font-size: 0.95rem;
		font-weight: 700;
		text-align: left;
		color: var(--color-primary-50);
		-webkit-text-fill-color: unset;
		background: none;
		-webkit-background-clip: unset;
		background-clip: unset;
	}

	/* ── AI panel ── */
	.ai-panel {
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-900) 92%);
	}

	.ai-panel-header {
		border-bottom: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-300);
	}

	.ai-messages {
		max-height: 320px;
		overflow-y: auto;
		scroll-behavior: smooth;
	}

	.ai-bubble {
		border-radius: 0.75rem;
		padding: 0.625rem 0.875rem;
	}

	.ai-bubble-assistant {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.ai-bubble-user {
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		margin-left: 1rem;
	}

	.ai-bubble-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		opacity: 0.55;
		margin-bottom: 0.25rem;
	}
</style>
