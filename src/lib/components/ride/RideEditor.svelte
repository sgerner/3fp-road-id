<script>
	import { navigateAfterMutation } from '#lib/client/navigation';
	import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { onMount } from 'svelte';
	import {
		DEFAULT_RIDE_FORM,
		MONTH_POSITION_OPTIONS,
		RIDE_TIMEZONES,
		SURFACE_TYPE_OPTIONS,
		BIKE_SUITABILITY_OPTIONS,
		WEEKDAY_OPTIONS
	} from '#lib/rides/constants';
	import {
		buildHostGroupOptions,
		buildOccurrenceDraft,
		filterHostGroupOptions,
		toLocalDateTimeValue
	} from '#lib/rides/editorHelpers';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconSave from '@lucide/svelte/icons/save';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUndo2 from '@lucide/svelte/icons/undo-2';
	import ImageGeneratorPanel from '#lib/components/ai/ImageGeneratorPanel.svelte';
	import { getAssistantContext } from '#lib/ai/assistantContext.svelte.js';
	import {
		getContextualModeDefaults,
		rideDraftFingerprint,
		verifyAppliedFingerprint,
		verifyBaseFingerprint
	} from '#lib/ai/assistantHelpers.js';

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
				await navigateAfterMutation(`/ride/${slug}`, {
					replace: manageMode
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

	function applyRideAiProposal(proposal) {
		if (!proposal?.draft) {
			return { ok: false, error: 'No ride draft to apply.' };
		}
		const currentFp = rideDraftFingerprint(buildPayload());
		const check = verifyBaseFingerprint(
			currentFp,
			proposal.baseFingerprint,
			'Your ride form changed after this draft was created. Ask Ride Muse again so it uses your latest edits.'
		);
		if (!check.ok) return check;

		const previous = {
			form: JSON.parse(JSON.stringify(form)),
			slugTouched
		};
		mergeDraft(proposal.draft);
		aiAppliedSnapshot = previous;
		aiAppliedFingerprint = rideDraftFingerprint(buildPayload());
		aiUndoConflictMessage = '';
		return { ok: true };
	}

	function undoRideAiProposal() {
		if (!aiAppliedSnapshot) {
			return { ok: false, error: 'No applied Ride Muse draft to undo.' };
		}
		const currentFp = rideDraftFingerprint(buildPayload());
		const check = verifyAppliedFingerprint(
			currentFp,
			aiAppliedFingerprint,
			'You edited the ride form after applying this draft, so undo was skipped to protect your newer changes.'
		);
		if (!check.ok) {
			aiUndoConflictMessage = check.error;
			return check;
		}
		form = JSON.parse(JSON.stringify(aiAppliedSnapshot.form));
		slugTouched = aiAppliedSnapshot.slugTouched;
		aiAppliedSnapshot = null;
		aiAppliedFingerprint = '';
		aiUndoConflictMessage = '';
		return { ok: true };
	}

	function openRideMuse(prompt = '', triggerEl = rideMuseBtnEl) {
		assistantContext.open({
			mode: 'page',
			prompt,
			submit: Boolean(prompt),
			triggerEl
		});
	}

	function beginOccurrenceEdit(occurrence) {
		occurrenceSaveError = '';
		if (!occurrence) {
			occurrenceDraft = null;
			return;
		}
		selectedManageOccurrenceId = occurrence.id ?? selectedManageOccurrenceId;
		occurrenceDraft = buildOccurrenceDraft(occurrence);
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
			await navigateAfterMutation(`/ride/${rideSlug}/manage`);
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
			await navigateAfterMutation('/ride', { replace: false });
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
	const assistantContext = getAssistantContext();
	const rideMuseStarters = getContextualModeDefaults('ride-write').starterPrompts;
	let rideMuseBtnEl = $state(null);
	let aiAppliedSnapshot = $state(null);
	let aiAppliedFingerprint = $state('');
	let aiUndoConflictMessage = $state('');
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
	let hostGroupQuery = $state('');
	let hostGroupItems = $state([]);
	let activeManageTab = $state('details');
	let deleteError = $state('');
	let deleting = $state(false);
	let timezoneOptions = $state(RIDE_TIMEZONES);

	const manageSections = [
		{ id: 'details', label: 'Series Details', icon: IconCalendarClock },
		{ id: 'hosts', label: 'Hosts and Participants', icon: IconUsers },
		{ id: 'email', label: 'Email Participants', icon: IconMail },
		{ id: 'occurrence', label: 'Edit One Occurrence', icon: IconMapPin }
	];

	const occurrenceEntries = $derived(initialRide?.occurrences ?? []);
	const selectedOccurrence = $derived(
		occurrenceEntries.find(
			(occurrence) => String(occurrence.id) === String(selectedManageOccurrenceId)
		) ?? null
	);
	const selectedOccurrenceRsvps = $derived(selectedOccurrence?.rsvps ?? []);
	const hostGroupOptions = $derived(buildHostGroupOptions(hostGroups));
	const hostGroupCollection = $derived(
		useListCollection({
			items: hostGroupItems,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value
		})
	);

	let initializedFromProps = $state(false);

	$effect(() => {
		return assistantContext.register(() => ({
			mode: 'ride-write',
			getContext: () => {
				const payload = buildPayload();
				return {
					payload,
					fingerprint: rideDraftFingerprint(payload)
				};
			},
			applyDraft: applyRideAiProposal,
			undoDraft: undoRideAiProposal,
			canUndoDraft: Boolean(aiAppliedSnapshot) && !aiUndoConflictMessage,
			undoConflictMessage: aiUndoConflictMessage
		}));
	});

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
		hostGroupQuery = form.hostGroupId
			? (hostGroupOptions.find((option) => option.value === String(form.hostGroupId))?.label ?? '')
			: '';
		hostGroupItems = hostGroupOptions;
		initializedFromProps = true;
	});

	$effect(() => {
		if (!initializedFromProps) return;
		hostGroupItems = filterHostGroupOptions(hostGroupOptions, hostGroupQuery);
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
		hostGroupQuery = nextId
			? (hostGroupOptions.find((option) => option.value === nextId)?.label ?? '')
			: '';
		form = { ...form, hostGroupId: nextId };
	}

	function handleHostGroupSearch(inputValue) {
		hostGroupQuery = inputValue ?? '';
		hostGroupItems = filterHostGroupOptions(hostGroupOptions, inputValue);
	}

	function clearHostGroupSelection() {
		hostGroupSelection = [];
		hostGroupQuery = '';
		hostGroupItems = hostGroupOptions;
		form = { ...form, hostGroupId: '' };
	}

	function handleHostGroupOpenChange(event) {
		if (event?.reason === 'input-change') return;
		hostGroupItems = hostGroupOptions;
	}
</script>

<div class="mx-auto w-full max-w-7xl min-w-0 space-y-6">
	<!-- ── Hero ── -->
	<section class="editor-hero border-primary-500 relative overflow-hidden border-t-4">
		<div
			class="relative z-10 flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8"
		>
			<div class="min-w-0 space-y-1.5">
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
					class="btn preset-filled-primary-500 min-h-11 gap-2"
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
				class="border-error-500 bg-error-500 text-surface-950 relative z-10 mx-6 mb-4 border p-3 text-sm"
				role="alert"
			>
				{saveError}
			</div>
		{/if}
		{#if saveSuccess}
			<div
				class="border-success-500 bg-success-500 text-surface-950 relative z-10 mx-6 mb-4 border p-3 text-sm"
			>
				{saveSuccess}
			</div>
		{/if}
	</section>

	{#if manageMode}
		<div class="min-w-0">
			<div class="flex flex-wrap gap-1" role="group" aria-label="Ride management sections">
				{#each manageSections as section (section.id)}
					{@const active = activeManageTab === section.id}
					{@const Icon = section.icon}
					<button
						type="button"
						class={`flex min-h-11 items-center gap-1.5 rounded-none! border-b-2 px-3 py-2.5 text-sm font-black tracking-wide uppercase transition-colors ${
							active
								? 'border-primary-500 bg-primary-500 text-surface-950'
								: 'text-surface-700-300 hover:text-surface-950-50 hover:border-surface-500 border-transparent'
						}`}
						aria-pressed={active}
						onclick={() => (activeManageTab = section.id)}
					>
						<Icon class="h-4 w-4 shrink-0" />
						<span>{section.label}</span>
					</button>
				{/each}
			</div>
			<div
				aria-hidden="true"
				class="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
			></div>
		</div>
	{/if}

	<div
		class={`grid grid-cols-1 gap-6 ${!manageMode || activeManageTab === 'details' ? 'xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]' : ''}`}
	>
		<div class="order-1 min-w-0 space-y-6 xl:order-1">
			{#if !manageMode || activeManageTab === 'details'}
				<section class="editor-section card preset-tonal-surface">
					<div class="editor-section-header">
						<div class="editor-section-icon"><IconCalendarClock class="h-4 w-4" /></div>
						<h2 class="editor-section-title">Overview</h2>
					</div>
					<div class="p-5 pt-4">
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label class="block min-w-0 md:col-span-2">
								<span class="label mb-1">Ride title</span>
								<input
									class="input"
									value={form.title}
									oninput={(event) => updateTitle(event.currentTarget.value)}
									placeholder="Sunrise gravel loop"
								/>
							</label>
							<label class="block min-w-0 md:col-span-2">
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
							<label class="block min-w-0 md:col-span-2">
								<span class="label mb-1">Summary</span>
								<input
									class="input"
									value={form.summary}
									oninput={(event) => (form = { ...form, summary: event.currentTarget.value })}
									placeholder="Short, sharp, public-facing hook"
								/>
							</label>
							<label class="block min-w-0 md:col-span-2">
								<span class="label mb-1">Description</span>
								<textarea
									class="textarea min-h-32"
									value={form.description}
									oninput={(event) => (form = { ...form, description: event.currentTarget.value })}
									placeholder="What the ride feels like, what riders should expect, and anything they should bring."
								></textarea>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">Status</span>
								<select class="select" bind:value={form.status}>
									<option value="draft">Draft</option>
									<option value="published">Published</option>
									<option value="cancelled">Cancelled</option>
								</select>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">Timezone</span>
								<select class="select" bind:value={form.timezone}>
									{#each timezoneOptions as timezone}
										<option value={timezone}>{timezone}</option>
									{/each}
								</select>
							</label>
							<div class="card preset-tonal-secondary min-w-0 p-4 md:col-span-2">
								<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<div class="min-w-0 space-y-1">
										<div class="font-medium">Hosting</div>
										<p class="text-sm opacity-75">
											Turn this off if you are posting the ride on behalf of someone else. Unhosted
											rides can be claimed later.
										</p>
									</div>
									<label class="flex min-h-11 items-center gap-3">
										<input type="checkbox" class="checkbox" bind:checked={form.isHost} />
										<span class="font-medium">I am one of the ride hosts</span>
									</label>
								</div>
							</div>
							<div class="flex min-w-0 flex-col gap-2">
								<Combobox
									class="w-full min-w-0"
									placeholder="Search any organization..."
									collection={hostGroupCollection}
									value={hostGroupSelection}
									inputValue={hostGroupQuery}
									onValueChange={(event) => handleHostGroupValueChange(event.value)}
									onInputValueChange={(event) => handleHostGroupSearch(event.inputValue)}
									onOpenChange={handleHostGroupOpenChange}
									inputBehavior="autohighlight"
								>
									<Combobox.Label class="label mb-1 block">Organization</Combobox.Label>
									<Combobox.Control
										class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-1"
									>
										<Combobox.Input class="input col-span-1 min-w-0" />
										<Combobox.Trigger
											class="btn preset-tonal-surface static! inset-auto! min-h-11! min-w-11! shrink-0 translate-y-0! px-2"
											aria-label="Toggle organization options"
										/>
									</Combobox.Control>
									<Portal>
										<Combobox.Positioner>
											<Combobox.Content
												class="card preset-tonal-surface z-50 max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-2"
											>
												{#if hostGroupItems.length}
													{#each hostGroupItems as item (item.value)}
														<Combobox.Item {item} class="border-surface-500 min-h-11 border-b p-2">
															<Combobox.ItemText class="break-words">{item.label}</Combobox.ItemText
															>
															<Combobox.ItemIndicator />
														</Combobox.Item>
													{/each}
												{:else}
													<li class="px-2 py-3 text-sm opacity-75">
														No matching organizations found.
													</li>
												{/if}
											</Combobox.Content>
										</Combobox.Positioner>
									</Portal>
								</Combobox>
								{#if hostGroupSelection.length}
									<button
										type="button"
										class="text-primary-700-300 inline-flex min-h-11 items-center self-start text-left text-xs underline"
										onclick={clearHostGroupSelection}
									>
										Clear organization
									</button>
								{:else}
									<p class="text-xs opacity-65">Leave blank for an independent organizer.</p>
								{/if}
							</div>
							<label class="block min-w-0">
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
					<div class="min-w-0 space-y-4 p-5 pt-4">
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
							<div class="min-w-0 space-y-1">
								<p class="font-medium">Attach up to 6 ride photos</p>
								<p class="text-sm opacity-70">
									The first image becomes the lead photo on the ride page. Featured cards on `/ride`
									only show that lead image so the directory stays readable.
								</p>
							</div>
							<label class="btn preset-outlined-primary-500 min-h-11 cursor-pointer gap-2">
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
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
								{#each form.imageUrls as imageUrl, index (imageUrl)}
									<div class="ride-image-card border-surface-500 min-w-0 overflow-hidden border">
										<img
											src={imageUrl}
											alt={`Ride image ${index + 1}`}
											class="h-44 w-full object-cover"
										/>
										<div class="flex flex-wrap items-center justify-between gap-2 p-3">
											<div class="text-sm font-medium">
												{index === 0 ? 'Lead image' : `Image ${index + 1}`}
											</div>
											<div class="flex flex-wrap gap-2">
												{#if index > 0}
													<button
														type="button"
														class="btn btn-sm preset-outlined-secondary-500 min-h-11"
														onclick={() => promoteImage(index)}
													>
														Use as lead
													</button>
												{/if}
												<button
													type="button"
													class="btn btn-sm preset-outlined-error-500 min-h-11 min-w-11"
													aria-label={`Remove ride image ${index + 1}`}
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
							<div class="border-surface-500 border border-dashed p-6 text-sm opacity-70">
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
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label class="block min-w-0">
								<span class="label mb-1">Start</span>
								<input type="datetime-local" class="input" bind:value={form.startsAt} />
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">End</span>
								<input type="datetime-local" class="input" bind:value={form.endsAt} />
							</label>
							<label class="block min-w-0 md:col-span-2">
								<span class="label mb-1">Start location</span>
								<input class="input" bind:value={form.startLocationName} placeholder="Meet at..." />
							</label>
							<label class="block min-w-0 md:col-span-2">
								<span class="label mb-1">Start address</span>
								<div class="flex flex-wrap gap-2">
									<input
										class="input min-w-0 flex-1"
										bind:value={form.startLocationAddress}
										placeholder="123 Main St, City, ST"
									/>
									<button
										type="button"
										class="btn preset-outlined-secondary-500 min-h-11 shrink-0"
										onclick={() => geocode('start')}
										disabled={geocodeLoading === 'start'}
									>
										{geocodeLoading === 'start' ? 'Locating...' : 'Geocode'}
									</button>
								</div>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">End location</span>
								<input
									class="input"
									bind:value={form.endLocationName}
									placeholder="Optional finish point"
								/>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">End address</span>
								<div class="flex flex-wrap gap-2">
									<input
										class="input min-w-0 flex-1"
										bind:value={form.endLocationAddress}
										placeholder="Optional finish address"
									/>
									<button
										type="button"
										class="btn preset-outlined-secondary-500 min-h-11 shrink-0"
										onclick={() => geocode('end')}
										disabled={geocodeLoading === 'end'}
									>
										{geocodeLoading === 'end' ? 'Locating...' : 'Geocode'}
									</button>
								</div>
							</label>
						</div>
						{#if geocodeError}
							<div class="card preset-tonal-warning mt-4 p-3 text-sm" role="alert">
								{geocodeError}
							</div>
						{/if}

						<div class="mt-6 space-y-4">
							<label class="flex min-h-11 items-center gap-3">
								<input type="checkbox" class="checkbox" bind:checked={form.recurrenceEnabled} />
								<span class="font-medium">Recurring ride</span>
							</label>
							{#if form.recurrenceEnabled}
								<div class="border-surface-500 grid grid-cols-1 gap-4 border p-4 md:grid-cols-2">
									<label class="block min-w-0">
										<span class="label mb-1">Pattern</span>
										<select class="select" bind:value={form.recurrenceFrequency}>
											<option value="weekly">Weekly</option>
											<option value="monthly">Monthly</option>
										</select>
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">Interval</span>
										<input
											type="number"
											min="1"
											class="input"
											bind:value={form.recurrenceInterval}
										/>
									</label>
									<div class="min-w-0 md:col-span-2">
										<span class="label mb-2 block">Weekdays</span>
										<div class="flex flex-wrap gap-2" role="group" aria-label="Ride weekdays">
											{#each WEEKDAY_OPTIONS as option}
												<button
													type="button"
													aria-pressed={form.recurrenceWeekdays.includes(option.value)}
													class={`chip min-h-11 min-w-11 ${form.recurrenceWeekdays.includes(option.value) ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
													onclick={() => toggleSelection('recurrenceWeekdays', option.value)}
												>
													{option.label}
												</button>
											{/each}
										</div>
									</div>
									{#if form.recurrenceFrequency === 'monthly'}
										<div class="min-w-0 md:col-span-2">
											<span class="label mb-2 block">Month positions</span>
											<div class="flex flex-wrap gap-2" role="group" aria-label="Month positions">
												{#each MONTH_POSITION_OPTIONS as option}
													<button
														type="button"
														aria-pressed={form.recurrenceMonthPositions.includes(option.value)}
														class={`chip min-h-11 min-w-11 ${form.recurrenceMonthPositions.includes(option.value) ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}`}
														onclick={() =>
															toggleSelection('recurrenceMonthPositions', option.value)}
													>
														{option.label}
													</button>
												{/each}
											</div>
										</div>
									{/if}
									<label class="block min-w-0">
										<span class="label mb-1">Repeat until</span>
										<input type="date" class="input" bind:value={form.recurrenceUntilOn} />
									</label>
									{#if manageMode && occurrenceEntries.length}
										<label class="block min-w-0">
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

							<div class="border-surface-500 min-w-0 border p-4">
								<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
									<div class="min-w-0">
										<h3 class="font-semibold">Skipped dates</h3>
										<p class="text-sm opacity-70">
											One-off dates or ranges to skip for closures and holidays.
										</p>
									</div>
									<button
										type="button"
										class="btn preset-outlined-secondary-500 min-h-11 shrink-0"
										aria-label="Add a skipped date or date range"
										onclick={addExclusion}
									>
										<IconPlus class="h-4 w-4" />
										Add skip
									</button>
								</div>
								<div class="space-y-3">
									{#each form.exclusions as exclusion, index (exclusion.id)}
										<div
											class="border-surface-500 grid grid-cols-1 gap-3 border p-3 md:grid-cols-[1fr_1fr_2fr_auto]"
										>
											<input
												type="date"
												class="input min-w-0"
												aria-label={`Skip range start date ${index + 1}`}
												value={exclusion.starts_on}
												oninput={(event) =>
													updateExclusion(exclusion.id, 'starts_on', event.currentTarget.value)}
											/>
											<input
												type="date"
												class="input min-w-0"
												aria-label={`Skip range end date ${index + 1}`}
												value={exclusion.ends_on}
												oninput={(event) =>
													updateExclusion(exclusion.id, 'ends_on', event.currentTarget.value)}
											/>
											<input
												class="input min-w-0"
												aria-label={`Optional note for skipped date ${index + 1}`}
												value={exclusion.note}
												placeholder="Optional note"
												oninput={(event) =>
													updateExclusion(exclusion.id, 'note', event.currentTarget.value)}
											/>
											<button
												type="button"
												class="btn preset-outlined-error-500 min-h-11 min-w-11"
												aria-label={`Remove skipped date ${index + 1}`}
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
						<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
							<div class="min-w-0">
								<span class="label mb-2 block">Difficulty</span>
								<div class="flex flex-wrap gap-2" role="group" aria-label="Ride difficulty">
									{#each difficultyLevels as level}
										<button
											type="button"
											aria-pressed={form.difficultyLevelIds.includes(level.id)}
											class={`chip min-h-11 ${form.difficultyLevelIds.includes(level.id) ? 'preset-filled-primary-500' : 'preset-tonal-surface'}`}
											onclick={() => toggleSelection('difficultyLevelIds', level.id)}
										>
											{level.name}
										</button>
									{/each}
								</div>
							</div>
							<div class="min-w-0">
								<span class="label mb-2 block">Discipline</span>
								<div class="flex flex-wrap gap-2" role="group" aria-label="Riding disciplines">
									{#each disciplines as discipline}
										<button
											type="button"
											aria-pressed={form.ridingDisciplineIds.includes(discipline.id)}
											class={`chip min-h-11 ${form.ridingDisciplineIds.includes(discipline.id) ? 'preset-filled-secondary-500' : 'preset-tonal-surface'}`}
											onclick={() => toggleSelection('ridingDisciplineIds', discipline.id)}
										>
											{discipline.name}
										</button>
									{/each}
								</div>
							</div>
							<label class="block min-w-0">
								<span class="label mb-1">Distance (miles)</span>
								<input
									type="number"
									step="0.1"
									class="input"
									bind:value={form.estimatedDistanceMiles}
								/>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">Duration (minutes)</span>
								<input
									type="number"
									min="0"
									class="input"
									bind:value={form.estimatedDurationMinutes}
								/>
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">Elevation gain (feet)</span>
								<input type="number" min="0" class="input" bind:value={form.elevationGainFeet} />
							</label>
							<label class="block min-w-0">
								<span class="label mb-1">Pace notes</span>
								<input
									class="input"
									bind:value={form.paceNotes}
									placeholder="Conversational, spicy climbs, steady social pace..."
								/>
							</label>
							<div class="flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-2">
								<label class="flex min-h-11 items-center gap-2">
									<input type="checkbox" class="checkbox" bind:checked={form.isNoDrop} />
									<span>No-drop ride</span>
								</label>
								<label class="flex min-h-11 items-center gap-2">
									<input type="checkbox" class="checkbox" bind:checked={form.waiverRequired} />
									<span>Waiver required</span>
								</label>
							</div>
							<div class="min-w-0 md:col-span-2" role="group" aria-label="Ride surface types">
								<span class="label mb-2 block">Surface types</span>
								<div class="flex flex-wrap gap-2">
									{#each SURFACE_TYPE_OPTIONS as option}
										<button
											type="button"
											aria-pressed={form.surfaceTypes.includes(option)}
											class={`chip min-h-11 ${form.surfaceTypes.includes(option) ? 'preset-filled-success-500' : 'preset-tonal-surface'}`}
											onclick={() => toggleSelection('surfaceTypes', option)}
										>
											{option}
										</button>
									{/each}
								</div>
							</div>
							<div class="min-w-0 md:col-span-2" role="group" aria-label="Bike suitability">
								<span class="label mb-2 block">Bike suitability</span>
								<div class="flex flex-wrap gap-2">
									{#each BIKE_SUITABILITY_OPTIONS as option}
										<button
											type="button"
											aria-pressed={form.bikeSuitability.includes(option)}
											class={`chip min-h-11 ${form.bikeSuitability.includes(option) ? 'preset-filled-warning-500' : 'preset-tonal-surface'}`}
											onclick={() => toggleSelection('bikeSuitability', option)}
										>
											{option}
										</button>
									{/each}
								</div>
							</div>
							<label class="block min-w-0 md:col-span-2">
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
					<div class="editor-section-header flex-wrap">
						<div class="editor-section-icon"><IconMail class="h-4 w-4" /></div>
						<h2 class="editor-section-title">Reminder Emails</h2>
						<button
							type="button"
							class="btn btn-sm preset-outlined-secondary-500 ml-auto min-h-11 gap-1"
							onclick={addEmailTemplate}
						>
							<IconPlus class="h-3.5 w-3.5" />
							Add template
						</button>
					</div>
					<div class="p-5 pt-4">
						<div class="space-y-4">
							{#each form.emailTemplates as template (template.id)}
								<div class="border-surface-500 min-w-0 border p-4">
									<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
										<label class="block min-w-0">
											<span class="label mb-1">Template name</span>
											<input
												class="input"
												value={template.name}
												oninput={(event) =>
													updateEmailTemplate(template.id, 'name', event.currentTarget.value)}
											/>
										</label>
										<label class="block min-w-0">
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
										<label class="block min-w-0 md:col-span-2">
											<span class="label mb-1">Subject</span>
											<input
												class="input"
												value={template.subject}
												oninput={(event) =>
													updateEmailTemplate(template.id, 'subject', event.currentTarget.value)}
												placeholder={'Tomorrow: {{ride_title}}'}
											/>
										</label>
										<label class="block min-w-0 md:col-span-2">
											<span class="label mb-1">Body</span>
											<textarea
												class="textarea min-h-28"
												value={template.body}
												oninput={(event) =>
													updateEmailTemplate(template.id, 'body', event.currentTarget.value)}
											></textarea>
										</label>
									</div>
									<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
										<label class="flex min-h-11 items-center gap-2">
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
											class="btn preset-outlined-error-500 min-h-11"
											aria-label={`Remove ${template.name || 'email template'}`}
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

				<section class="card preset-tonal-primary min-w-0 p-5">
					<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div class="min-w-0">
							<h2 class="text-lg font-semibold">
								{manageMode ? 'Ready to update this ride?' : 'Ready to publish this ride?'}
							</h2>
						</div>
						<button
							class="btn preset-filled-primary-500 min-h-11 gap-2"
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
					<section class="card preset-tonal-error min-w-0 p-5">
						<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div class="min-w-0">
								<h2 class="text-lg font-semibold">
									Delete this {initialRide?.recurrenceRule ? 'ride series' : 'ride'}
								</h2>
								<p class="mt-1 text-sm opacity-75">
									This permanently removes the ride, its occurrences, RSVPs, reminders, and host
									data.
								</p>
							</div>
							<button
								type="button"
								class="btn preset-outlined-error-500 min-h-11 gap-2"
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
			{/if}

			{#if manageMode && activeManageTab === 'hosts'}
				<section class="card preset-tonal-surface min-w-0 p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconUsers class="h-5 w-5 shrink-0" />
						Hosts and Participants
					</div>
					<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<div class="min-w-0 space-y-4">
							<div>
								<h3 class="font-semibold">Co-hosts</h3>
								<p class="text-sm opacity-70">
									Owners and admins of the attached organization already inherit access.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<input
									class="input min-w-0 flex-1"
									bind:value={newHostEmail}
									placeholder="cohost@example.com"
								/>
								<button
									type="button"
									class="btn preset-filled-secondary-500 min-h-11 shrink-0"
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
										class="border-surface-500 flex flex-wrap items-center justify-between gap-3 border p-3"
									>
										<div class="min-w-0 flex-1">
											<div class="font-medium break-words">
												{host.profile?.fullName || 'Unnamed host'}
											</div>
											<div class="text-sm break-all opacity-70">
												{host.profile?.email || 'No email on file'}
											</div>
										</div>
										<button
											type="button"
											class="btn btn-sm preset-outlined-error-500 min-h-11 shrink-0"
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

						<div class="min-w-0 space-y-4">
							<div>
								<h3 class="font-semibold">Occurrence roster</h3>
								<p class="text-sm opacity-70">
									Participants are shown for the selected ride occurrence.
								</p>
							</div>
							{#if occurrenceEntries.length}
								<select
									class="select w-full min-w-0"
									aria-label="Roster occurrence"
									bind:value={selectedManageOccurrenceId}
								>
									<option value="">Choose an occurrence</option>
									{#each occurrenceEntries as occurrence}
										<option value={occurrence.id}
											>{new Date(occurrence.starts_at).toLocaleString()}</option
										>
									{/each}
								</select>
								<div class="space-y-2">
									{#each selectedOccurrenceRsvps as rsvp (rsvp.id)}
										<div class="border-surface-500 min-w-0 border p-3">
											<div class="font-medium break-words">{rsvp.participantName}</div>
											<div class="text-sm break-all opacity-70">{rsvp.participantEmail}</div>
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
			{/if}

			{#if manageMode && activeManageTab === 'email'}
				<section class="card preset-tonal-surface min-w-0 p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconMail class="h-5 w-5 shrink-0" />
						Email Participants
					</div>
					<div class="grid grid-cols-1 gap-4">
						<label class="block min-w-0">
							<span class="label mb-1">Occurrence</span>
							<select class="select w-full min-w-0" bind:value={selectedManageOccurrenceId}>
								<option value="">Choose an occurrence</option>
								{#each occurrenceEntries as occurrence}
									<option value={occurrence.id}
										>{new Date(occurrence.starts_at).toLocaleString()}</option
									>
								{/each}
							</select>
						</label>
						<label class="block min-w-0">
							<span class="label mb-1">Subject</span>
							<input class="input" bind:value={organizerEmailSubject} />
						</label>
						<label class="block min-w-0">
							<span class="label mb-1">Message</span>
							<textarea class="textarea min-h-28" bind:value={organizerEmailBody}></textarea>
						</label>
						<div class="flex flex-wrap items-center gap-3">
							<button
								type="button"
								class="btn preset-filled-primary-500 min-h-11"
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
			{/if}

			{#if manageMode && activeManageTab === 'occurrence'}
				<section class="card preset-tonal-surface min-w-0 p-5">
					<div class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<IconCalendarClock class="h-5 w-5 shrink-0" />
						Edit One Occurrence
					</div>
					{#if occurrenceEntries.length}
						<div class="grid grid-cols-1 gap-4">
							<label class="block min-w-0">
								<span class="label mb-1">Occurrence</span>
								<select
									class="select w-full min-w-0"
									value={occurrenceDraft?.id ?? ''}
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
								<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
									<label class="block min-w-0">
										<span class="label mb-1">Start</span>
										<input
											type="datetime-local"
											class="input"
											bind:value={occurrenceDraft.startsAt}
										/>
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">End</span>
										<input
											type="datetime-local"
											class="input"
											bind:value={occurrenceDraft.endsAt}
										/>
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">Status</span>
										<select class="select" bind:value={occurrenceDraft.status}>
											<option value="scheduled">Scheduled</option>
											<option value="cancelled">Cancelled</option>
										</select>
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">Title override</span>
										<input class="input" bind:value={occurrenceDraft.titleOverride} />
									</label>
									<label class="block min-w-0 md:col-span-2">
										<span class="label mb-1">Start location override</span>
										<input class="input" bind:value={occurrenceDraft.startLocationName} />
									</label>
									<label class="block min-w-0 md:col-span-2">
										<span class="label mb-1">Start address override</span>
										<input class="input" bind:value={occurrenceDraft.startLocationAddress} />
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">End location override</span>
										<input class="input" bind:value={occurrenceDraft.endLocationName} />
									</label>
									<label class="block min-w-0">
										<span class="label mb-1">End address override</span>
										<input class="input" bind:value={occurrenceDraft.endLocationAddress} />
									</label>
								</div>
								<div class="mt-4 flex flex-wrap items-center gap-3">
									<button
										type="button"
										class="btn preset-filled-primary-500 min-h-11"
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

		{#if !manageMode || activeManageTab === 'details'}
			<aside class="order-2 min-w-0 space-y-5 xl:sticky xl:top-24 xl:order-2 xl:self-start">
				<!-- AI Intake -->
				<section class="ai-panel card overflow-hidden">
					<div class="ai-panel-header p-4 pb-3">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<IconSparkles class="h-4 w-4" />
								<span class="text-sm font-bold tracking-[0.18em] uppercase">Ride Muse</span>
							</div>
							<span class="text-[11px] font-bold tracking-wider uppercase opacity-80">AI Draft</span
							>
						</div>
					</div>
					<div class="space-y-3 p-4">
						<p class="text-surface-300 m-0 text-xs leading-relaxed">
							Describe your route, meetup, timing, and pace in the 3FP Assistant. Ride Muse previews
							all changes before applying them to your form.
						</p>
						<button
							bind:this={rideMuseBtnEl}
							type="button"
							class="btn preset-filled-primary-500 min-h-11 w-full justify-between gap-2"
							onclick={() => openRideMuse('', rideMuseBtnEl)}
						>
							<span class="inline-flex items-center gap-1.5">
								<IconSparkles class="h-3.5 w-3.5" />
								Open Ride Muse
							</span>
							<IconArrowRight class="h-4 w-4" />
						</button>
						<div class="grid grid-cols-1 gap-1.5" aria-label="Ride Muse starter prompts">
							{#each rideMuseStarters as starter}
								<button
									type="button"
									class="border-surface-700 bg-surface-900 text-surface-300 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 min-h-11 min-w-0 border px-3 py-2 text-left text-xs font-semibold break-words transition"
									onclick={(event) => openRideMuse(starter, event.currentTarget)}
								>
									{starter}
								</button>
							{/each}
						</div>
						{#if aiUndoConflictMessage}
							<p class="text-surface-300 m-0 text-xs" role="status">{aiUndoConflictMessage}</p>
						{:else if aiAppliedSnapshot}
							<button
								type="button"
								class="btn btn-sm preset-tonal-surface min-h-11 w-full gap-1.5"
								onclick={undoRideAiProposal}
							>
								<IconUndo2 class="h-3.5 w-3.5" />
								Undo Ride Muse draft
							</button>
						{/if}
					</div>
				</section>

				<section class="editor-section card preset-tonal-surface">
					<div class="editor-section-header">
						<div class="editor-section-icon"><IconMail class="h-4 w-4" /></div>
						<h2 class="editor-section-title">Contact</h2>
					</div>
					<div class="grid grid-cols-1 gap-3 p-5 pt-4">
						<label class="block min-w-0">
							<span class="label mb-1">Reply-to email</span>
							<input class="input" bind:value={form.contactEmail} />
						</label>
						<label class="block min-w-0">
							<span class="label mb-1">Phone</span>
							<input class="input" bind:value={form.contactPhone} />
						</label>
					</div>
				</section>
			</aside>
		{/if}
	</div>
</div>

<style>
	/* ── Hero ── */
	.editor-hero {
		background: var(--color-surface-900);
	}

	.editor-eyebrow {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.22em;
		color: var(--color-primary-500);
	}

	.editor-title {
		font-size: clamp(2.25rem, 4vw, 3.25rem);
		font-weight: 900;
		color: var(--color-primary-500);
		text-align: left;
		text-transform: uppercase;
		font-style: italic;
		letter-spacing: -0.03em;
		overflow-wrap: anywhere;
	}

	/* ── Section cards ── */
	.editor-section {
		overflow: hidden;
	}

	.editor-section :global(.btn) {
		min-height: 2.75rem;
	}

	.editor-section-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 2px solid var(--color-surface-800);
		background: var(--color-surface-900);
	}

	.editor-section-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		background: var(--color-primary-500);
		color: var(--color-surface-950);
		flex-shrink: 0;
	}

	.editor-section-title {
		font-size: 0.95rem;
		font-weight: 700;
		text-align: left;
		color: var(--color-surface-50);
		-webkit-text-fill-color: unset;
		background: none;
		-webkit-background-clip: unset;
		background-clip: unset;
	}

	/* ── AI panel ── */
	.ai-panel {
		border: 2px solid var(--color-secondary-500);
		background: var(--color-surface-950);
	}

	.ai-panel-header {
		border-bottom: 2px solid var(--color-secondary-500);
		background: var(--color-secondary-500);
		color: var(--color-surface-50);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.animate-spin),
		:global(.animate-ping) {
			animation: none;
		}
	}
</style>
