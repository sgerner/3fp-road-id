<script>
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCamera from '@lucide/svelte/icons/camera';
	import IconContact from '@lucide/svelte/icons/contact';
	import IconDownload from '@lucide/svelte/icons/download';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconLink2 from '@lucide/svelte/icons/link-2';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconPrinter from '@lucide/svelte/icons/printer';
	import IconQrCode from '@lucide/svelte/icons/qr-code';
	import IconSave from '@lucide/svelte/icons/save';
	import IconTrash2 from '@lucide/svelte/icons/trash';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconUserCircle2 from '@lucide/svelte/icons/circle-user-round';
	import IconX from '@lucide/svelte/icons/x';
	import RoadIdResponderCard from '#lib/components/RoadIdResponderCard.svelte';
	import { formatPhoneNumber } from '#lib/utils/phone';
	import { renderPrintableQrSheetSvg, renderQrSvg } from '#lib/utils/qr';
	import {
		ALLERGY_OPTIONS,
		BLOOD_TYPE_OPTIONS,
		MEDICATION_OPTIONS,
		normalizeMedicationItem,
		splitCommaItems
	} from '#lib/utils/roadId';

	const { data } = $props();
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();

	const currentUser = pageData.currentUser ?? null;
	const recommendationOptions = (pageData.recommendationOptions ?? []).filter(Boolean);
	const interestSuggestions = (pageData.interestSuggestions ?? []).filter(Boolean);
	const existingProfile = pageData.profile ?? null;
	const existingRoadId = pageData.roadIdProfile ?? null;
	const publicOrigin = String(pageData.publicOrigin || 'https://3fp.org').replace(/\/+$/, '');
	const existingContext = pageData.context ?? {
		location: '',
		interests: [],
		recommendation_focus: []
	};

	const defaultAccountName =
		existingProfile?.full_name ?? currentUser?.user_metadata?.full_name ?? '';
	const defaultAccountPhone = formatPhoneNumber(existingProfile?.phone ?? '');

	let fullName = $state(defaultAccountName || currentUser?.email || '');
	let phone = $state(defaultAccountPhone);
	let avatarUrl = $state(existingProfile?.avatar_url ?? '');
	let bio = $state(existingProfile?.bio ?? '');

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

	// ---------------------------
	// Emergency ID / Safety & Road ID State (decoupled from SMS opt-ins)
	// ---------------------------
	let emergencyFullName = $state(
		String(existingRoadId?.full_name || defaultAccountName || '').trim()
	);
	let emergencyPhone = $state(
		formatPhoneNumber(existingRoadId?.phone || existingProfile?.phone || '')
	);
	let emergencyNameOverridden = $state(Boolean(String(existingRoadId?.full_name ?? '').trim()));
	let emergencyPhoneOverridden = $state(Boolean(String(existingRoadId?.phone ?? '').trim()));
	let emergencyBloodType = $state(existingRoadId?.blood_type ?? '');
	let emergencyAllergies = $state(existingRoadId?.allergies ?? '');
	let emergencyMedication = $state(existingRoadId?.medication ?? '');

	let emergencyContacts = $state(
		(pageData.emergencyContacts ?? []).map((contact) => ({
			id: contact.id ?? null,
			contact_name: contact.contact_name ?? '',
			contact_phone: formatPhoneNumber(contact.contact_phone ?? ''),
			contact_relationship: contact.contact_relationship ?? ''
		}))
	);
	let newContact = $state({
		contact_name: '',
		contact_phone: '',
		contact_relationship: ''
	});

	let linkedCodes = $state(
		Array.isArray(pageData.linkedCodes) && pageData.linkedCodes.length
			? [...pageData.linkedCodes]
			: (pageData.claimedCodes ?? []).map((code) => ({ code, created_at: null }))
	);
	let claimedNoticeCode = $state(pageData.claimedCode ?? null);
	let claimCodeInput = $state('');
	let claimingCode = $state(false);
	let claimError = $state('');
	let claimSuccess = $state('');
	let confirmUnlinkCode = $state('');
	let unlinkingCode = $state('');

	let savingEmergency = $state(false);
	let emergencySaveError = $state('');
	let emergencySaveSuccess = $state('');
	let contactError = $state('');
	let contactSuccess = $state('');
	let addingContact = $state(false);
	let busyContactId = $state(null);

	let qrScope = $state('all');
	let qrCopiesPerCode = $state(2);

	const claimedCodes = $derived(linkedCodes.map((item) => item.code).filter(Boolean));

	const hasSavedEmergencyContact = $derived.by(() =>
		emergencyContacts.some(
			(contact) =>
				String(contact.contact_name || '').trim() && String(contact.contact_phone || '').trim()
		)
	);

	const previewContacts = $derived.by(() => {
		const draftHasContent =
			String(newContact.contact_name || '').trim() ||
			String(newContact.contact_phone || '').trim() ||
			String(newContact.contact_relationship || '').trim();
		return draftHasContent ? [...emergencyContacts, newContact] : emergencyContacts;
	});

	const activePreviewCode = $derived.by(() => {
		if (!linkedCodes.length) return '';
		if (qrScope !== 'all' && linkedCodes.some((item) => item.code === qrScope)) {
			return qrScope;
		}
		return linkedCodes[0]?.code ?? '';
	});

	const selectedQrCodes = $derived.by(() => {
		if (!linkedCodes.length) return [];
		if (qrScope === 'all') return linkedCodes.map((item) => item.code);
		const matched = linkedCodes.find((item) => item.code === qrScope);
		return matched ? [matched.code] : [linkedCodes[0].code];
	});

	const liveEmergencyProfile = $derived({
		full_name: emergencyFullName,
		phone: emergencyPhone,
		blood_type: emergencyBloodType,
		allergies: emergencyAllergies,
		medication: emergencyMedication
	});

	const singleQrPreviewUrl = $derived(
		activePreviewCode ? `${publicOrigin}/roadid/${encodeURIComponent(activePreviewCode)}` : ''
	);

	const singleQrPreviewSvg = $derived.by(() => {
		if (!singleQrPreviewUrl) return '';
		try {
			return renderQrSvg(singleQrPreviewUrl, {
				pixelSize: 184,
				label: `Emergency ID QR code for ${activePreviewCode}`
			});
		} catch {
			return '';
		}
	});

	const printableSheetSvg = $derived.by(() => {
		if (!selectedQrCodes.length) return '';
		try {
			return renderPrintableQrSheetSvg({
				codes: selectedQrCodes,
				origin: publicOrigin,
				riderName: emergencyFullName,
				copiesPerCode: qrCopiesPerCode
			});
		} catch {
			return '';
		}
	});

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

	function dispatchProfileUpdated(profilePayload = existingProfile, canManageSms = undefined) {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(
			new CustomEvent('profile-updated', {
				detail: {
					profile: profilePayload,
					claimedCodes,
					...(typeof canManageSms === 'boolean' ? { canManageSms } : {})
				}
			})
		);
	}

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

	// Allergy & Medication chip helpers
	function isAllergySelected(option) {
		return splitCommaItems(emergencyAllergies).some(
			(item) => item.toLowerCase() === option.toLowerCase()
		);
	}

	function toggleAllergyChip(option) {
		const current = splitCommaItems(emergencyAllergies);
		if (current.some((item) => item.toLowerCase() === option.toLowerCase())) {
			emergencyAllergies = current
				.filter((item) => item.toLowerCase() !== option.toLowerCase())
				.join(', ');
		} else {
			emergencyAllergies = [...current, option].join(', ');
		}
	}

	function isMedicationSelected(option) {
		return splitCommaItems(emergencyMedication, normalizeMedicationItem).some(
			(item) => item.toLowerCase() === option.toLowerCase()
		);
	}

	function toggleMedicationChip(option) {
		const current = splitCommaItems(emergencyMedication, normalizeMedicationItem);
		if (current.some((item) => item.toLowerCase() === option.toLowerCase())) {
			emergencyMedication = current
				.filter((item) => item.toLowerCase() !== option.toLowerCase())
				.join(', ');
		} else {
			emergencyMedication = [...current, option].join(', ');
		}
	}

	function syncDefaultsFromRiderProfile() {
		if (String(fullName || '').trim()) {
			emergencyFullName = String(fullName).trim();
			emergencyNameOverridden = true;
		}
		const sourcePhone = String(phone || smsPhone || '').trim();
		if (sourcePhone) {
			emergencyPhone = formatPhoneNumber(sourcePhone);
			emergencyPhoneOverridden = true;
		}
	}

	async function syncPrimaryContactToRiderProfile(contactsList = emergencyContacts) {
		const primary = contactsList[0] ?? null;
		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					emergency_contact_name: primary?.contact_name ?? '',
					emergency_contact_phone: primary?.contact_phone ?? ''
				})
			});
			if (res.ok) {
				const payload = await res.json().catch(() => ({}));
				if (payload?.profile) {
					dispatchProfileUpdated(payload.profile);
				}
			}
		} catch {
			// Best-effort sync of primary emergency contact to public.profiles
		}
	}

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
			const contactsPayload = emergencyContacts.map((contact) => ({
				id: contact.id,
				contact_name: contact.contact_name,
				contact_relationship: contact.contact_relationship,
				contact_phone: contact.contact_phone
			}));
			const hasDraftContact =
				Boolean(newContact.contact_name.trim()) ||
				Boolean(newContact.contact_phone.trim()) ||
				Boolean(newContact.contact_relationship.trim());
			if (hasDraftContact) {
				contactsPayload.push({
					id: null,
					contact_name: newContact.contact_name,
					contact_relationship: newContact.contact_relationship,
					contact_phone: newContact.contact_phone
				});
			}

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
						full_name: emergencyNameOverridden ? emergencyFullName : fullName,
						phone: emergencyPhoneOverridden ? emergencyPhone : phone,
						blood_type: emergencyBloodType,
						allergies: splitCommaItems(emergencyAllergies).join(', '),
						medication: splitCommaItems(emergencyMedication, normalizeMedicationItem).join(', '),
						emergency_contacts: contactsPayload
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
			if (payload?.roadIdProfile) {
				emergencyFullName = payload.roadIdProfile.full_name || fullName;
				emergencyPhone = formatPhoneNumber(
					payload.roadIdProfile.phone || savedProfile?.phone || ''
				);
			} else if (!emergencyNameOverridden && savedProfile?.full_name) {
				emergencyFullName = savedProfile.full_name;
			}
			if (payload?.safetyProfile) {
				emergencyBloodType = payload.safetyProfile.blood_type ?? '';
				emergencyAllergies = payload.safetyProfile.allergies ?? '';
				emergencyMedication = payload.safetyProfile.medication ?? '';
			}
			if (Array.isArray(payload?.emergencyContacts)) {
				emergencyContacts = payload.emergencyContacts.map((contact) => ({
					id: contact.id ?? null,
					contact_name: contact.contact_name ?? '',
					contact_phone: formatPhoneNumber(contact.contact_phone ?? ''),
					contact_relationship: contact.contact_relationship ?? ''
				}));
			}
			if (hasDraftContact) {
				newContact = { contact_name: '', contact_phone: '', contact_relationship: '' };
			}
			if (Array.isArray(payload?.linkedCodes)) {
				linkedCodes = payload.linkedCodes;
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

			saveSuccess = 'Profile, Emergency ID, and preferences saved.';
			dispatchProfileUpdated(savedProfile, payload?.canManageSms);
		} catch (error) {
			saveError = error?.message || 'Unable to save profile.';
		} finally {
			saving = false;
		}
	}

	async function saveEmergencyProfile(event) {
		event?.preventDefault?.();
		if (!currentUser?.id || savingEmergency) return;

		savingEmergency = true;
		emergencySaveError = '';
		emergencySaveSuccess = '';
		contactError = '';

		try {
			const normalizedMedication = splitCommaItems(
				emergencyMedication,
				normalizeMedicationItem
			).join(', ');
			const normalizedAllergies = splitCommaItems(emergencyAllergies).join(', ');

			const res = await fetch('/api/v1/road-id-profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					full_name: emergencyFullName.trim(),
					phone: emergencyPhone.trim(),
					blood_type: emergencyBloodType.trim(),
					allergies: normalizedAllergies,
					medication: normalizedMedication
				})
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Unable to save Emergency ID.');
			}

			const saved = payload?.profile ?? null;
			if (saved) {
				emergencyFullName = saved.full_name ?? emergencyFullName;
				emergencyPhone = formatPhoneNumber(saved.phone ?? emergencyPhone);
				emergencyBloodType = saved.blood_type ?? emergencyBloodType;
				emergencyAllergies = saved.allergies ?? normalizedAllergies;
				emergencyMedication = saved.medication ?? normalizedMedication;
				emergencyNameOverridden = Boolean(String(emergencyFullName || '').trim());
				emergencyPhoneOverridden = Boolean(String(emergencyPhone || '').trim());
			}

			// Persist any inline edits to emergency contacts (supporting seeded contacts without id too).
			const updatedContacts = [];
			for (const contact of emergencyContacts) {
				const cName = String(contact.contact_name ?? '').trim();
				const cPhone = String(contact.contact_phone ?? '').trim();
				const cRel = String(contact.contact_relationship ?? '').trim();
				if (!cName && !cPhone && !cRel) continue;
				if (!cName || !cPhone) {
					throw new Error('Each emergency contact requires both a name and phone number.');
				}
				if (contact?.id) {
					const cRes = await fetch(`/api/v1/emergency-contacts/${contact.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							contact_name: cName,
							contact_phone: cPhone,
							contact_relationship: cRel
						})
					});
					const cData = await cRes.json().catch(() => ({}));
					if (!cRes.ok) {
						throw new Error(cData?.error || 'Unable to update emergency contact.');
					}
					updatedContacts.push({
						id: contact.id,
						contact_name: cName,
						contact_phone: formatPhoneNumber(cData?.contact_phone ?? cPhone),
						contact_relationship: cRel
					});
				} else {
					const createRes = await fetch('/api/v1/emergency-contacts', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							profile_id: currentUser.id,
							contact_name: cName,
							contact_phone: cPhone,
							contact_relationship: cRel
						})
					});
					const createData = await createRes.json().catch(() => ({}));
					if (!createRes.ok) {
						throw new Error(createData?.error || 'Unable to create emergency contact.');
					}
					if (createData?.contact) {
						updatedContacts.push({
							id: createData.contact.id,
							contact_name: createData.contact.contact_name ?? cName,
							contact_phone: formatPhoneNumber(createData.contact.contact_phone ?? cPhone),
							contact_relationship: createData.contact.contact_relationship ?? cRel
						});
					}
				}
			}

			// If the rider also filled in the new contact fields, save that contact too.
			if (newContact.contact_name.trim() && newContact.contact_phone.trim()) {
				const addRes = await fetch('/api/v1/emergency-contacts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						profile_id: currentUser.id,
						contact_name: newContact.contact_name.trim(),
						contact_phone: newContact.contact_phone.trim(),
						contact_relationship: newContact.contact_relationship.trim()
					})
				});
				const addPayload = await addRes.json().catch(() => ({}));
				if (!addRes.ok) {
					throw new Error(addPayload?.error || 'Unable to create emergency contact.');
				}
				if (addPayload?.contact) {
					updatedContacts.push({
						id: addPayload.contact.id,
						contact_name: addPayload.contact.contact_name ?? '',
						contact_phone: formatPhoneNumber(addPayload.contact.contact_phone ?? ''),
						contact_relationship: addPayload.contact.contact_relationship ?? ''
					});
					newContact = { contact_name: '', contact_phone: '', contact_relationship: '' };
				}
			}

			emergencyContacts = updatedContacts;
			await syncPrimaryContactToRiderProfile(updatedContacts);
			emergencySaveSuccess = 'Emergency ID saved.';
		} catch (err) {
			emergencySaveError = err?.message || 'Unable to save Emergency ID.';
		} finally {
			savingEmergency = false;
		}
	}

	async function handleAddContact(event) {
		event?.preventDefault?.();
		if (!currentUser?.id || addingContact) return;

		const name = newContact.contact_name.trim();
		const contactPhone = newContact.contact_phone.trim();
		const relationship = newContact.contact_relationship.trim();
		if (!name || !contactPhone) {
			contactError = 'Enter both a contact name and phone number.';
			return;
		}

		addingContact = true;
		contactError = '';
		contactSuccess = '';
		try {
			const res = await fetch('/api/v1/emergency-contacts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					profile_id: currentUser.id,
					contact_name: name,
					contact_phone: contactPhone,
					contact_relationship: relationship
				})
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Unable to add emergency contact.');
			}
			if (payload?.contact) {
				const added = {
					id: payload.contact.id,
					contact_name: payload.contact.contact_name ?? name,
					contact_phone: formatPhoneNumber(payload.contact.contact_phone ?? contactPhone),
					contact_relationship: payload.contact.contact_relationship ?? relationship
				};
				emergencyContacts = [...emergencyContacts, added];
				await syncPrimaryContactToRiderProfile(emergencyContacts);
			}
			newContact = { contact_name: '', contact_phone: '', contact_relationship: '' };
			contactSuccess = 'Emergency contact added.';
		} catch (err) {
			contactError = err?.message || 'Unable to add emergency contact.';
		} finally {
			addingContact = false;
		}
	}

	async function handleSaveExistingContact(contact, index) {
		const busyKey = contact?.id ?? `idx-${index}`;
		if (busyContactId === busyKey) return;
		const name = String(contact.contact_name ?? '').trim();
		const contactPhone = String(contact.contact_phone ?? '').trim();
		const relationship = String(contact.contact_relationship ?? '').trim();
		if (!name || !contactPhone) {
			contactError = 'Contact name and phone number are required.';
			return;
		}

		busyContactId = busyKey;
		contactError = '';
		contactSuccess = '';
		try {
			if (contact?.id) {
				const res = await fetch(`/api/v1/emergency-contacts/${contact.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contact_name: name,
						contact_phone: contactPhone,
						contact_relationship: relationship
					})
				});
				const payload = await res.json().catch(() => ({}));
				if (!res.ok) {
					throw new Error(payload?.error || 'Unable to update emergency contact.');
				}
				contact.contact_phone = formatPhoneNumber(payload?.contact_phone ?? contactPhone);
			} else {
				const res = await fetch('/api/v1/emergency-contacts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						profile_id: currentUser.id,
						contact_name: name,
						contact_phone: contactPhone,
						contact_relationship: relationship
					})
				});
				const payload = await res.json().catch(() => ({}));
				if (!res.ok) {
					throw new Error(payload?.error || 'Unable to save emergency contact.');
				}
				if (payload?.contact) {
					contact.id = payload.contact.id;
					contact.contact_phone = formatPhoneNumber(payload.contact.contact_phone ?? contactPhone);
				}
			}
			await syncPrimaryContactToRiderProfile(emergencyContacts);
			contactSuccess = `Saved ${name}.`;
		} catch (err) {
			contactError = err?.message || 'Unable to update emergency contact.';
		} finally {
			busyContactId = null;
		}
	}

	async function handleDeleteContact(contact, index) {
		const busyKey = contact?.id ?? `idx-${index}`;
		if (busyContactId === busyKey) return;
		busyContactId = busyKey;
		contactError = '';
		contactSuccess = '';
		try {
			if (contact?.id) {
				const res = await fetch(`/api/v1/emergency-contacts/${contact.id}`, {
					method: 'DELETE'
				});
				const payload = await res.json().catch(() => ({}));
				if (!res.ok) {
					throw new Error(payload?.error || 'Unable to remove emergency contact.');
				}
			}
			emergencyContacts = emergencyContacts.filter((_, idx) => idx !== index);
			await syncPrimaryContactToRiderProfile(emergencyContacts);
			contactSuccess = 'Emergency contact removed.';
		} catch (err) {
			contactError = err?.message || 'Unable to remove emergency contact.';
		} finally {
			busyContactId = null;
		}
	}

	async function handleClaimBracelet(event) {
		event?.preventDefault?.();
		if (!currentUser?.id || claimingCode) return;

		const raw = claimCodeInput.trim();
		if (!raw) {
			claimError = 'Enter the bracelet code printed on your band.';
			return;
		}

		claimingCode = true;
		claimError = '';
		claimSuccess = '';
		try {
			const res = await fetch('/api/v1/road-id-profile/codes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: raw })
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Unable to claim bracelet code.');
			}

			if (Array.isArray(payload?.codes)) {
				linkedCodes = payload.codes;
			}
			if (payload?.profile) {
				if (!emergencyFullName.trim() && payload.profile.full_name) {
					emergencyFullName = payload.profile.full_name;
				}
				if (!emergencyPhone.trim() && payload.profile.phone) {
					emergencyPhone = formatPhoneNumber(payload.profile.phone);
				}
			}
			if (payload?.code) {
				qrScope = linkedCodes.length > 1 ? 'all' : payload.code;
			}
			claimCodeInput = '';
			claimSuccess = `Bracelet ${payload?.code || ''} linked to your Emergency ID.`;
			dispatchProfileUpdated();
		} catch (err) {
			claimError = err?.message || 'Unable to claim bracelet code.';
		} finally {
			claimingCode = false;
		}
	}

	async function handleUnlinkBracelet(code) {
		if (!code || unlinkingCode) return;
		unlinkingCode = code;
		claimError = '';
		claimSuccess = '';
		try {
			const res = await fetch(`/api/v1/road-id-profile/codes/${encodeURIComponent(code)}`, {
				method: 'DELETE'
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Unable to unlink bracelet code.');
			}
			linkedCodes = Array.isArray(payload?.codes)
				? payload.codes
				: linkedCodes.filter((item) => item.code !== code);
			if (qrScope === code) {
				qrScope = 'all';
			}
			if (claimedNoticeCode === code) {
				claimedNoticeCode = null;
			}
			confirmUnlinkCode = '';
			claimSuccess = `Bracelet ${code} unlinked.`;
			dispatchProfileUpdated();
		} catch (err) {
			claimError = err?.message || 'Unable to unlink bracelet code.';
		} finally {
			unlinkingCode = '';
		}
	}

	function downloadQrSheetSvg() {
		if (!printableSheetSvg || typeof window === 'undefined') return;
		const blob = new Blob([printableSheetSvg], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		const suffix =
			selectedQrCodes.length === 1 ? selectedQrCodes[0] : `${selectedQrCodes.length}-codes`;
		anchor.href = url;
		anchor.download = `3fp-emergency-id-${suffix}.svg`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function printQrSheet() {
		if (!printableSheetSvg || typeof window === 'undefined') return;
		document.body.classList.add('printing-roadid-qr');
		const cleanup = () => {
			document.body.classList.remove('printing-roadid-qr');
			window.removeEventListener('afterprint', cleanup);
		};
		window.addEventListener('afterprint', cleanup);
		window.print();
		setTimeout(cleanup, 1500);
	}
</script>

<svelte:head>
	<title>Profile &amp; Emergency ID · 3 Feet Please</title>
	<meta
		name="description"
		content="Manage your 3 Feet Please rider profile, SMS notifications, Emergency ID medical details, bracelets, and printable QR labels."
	/>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

{#if printableSheetSvg}
	<div class="roadid-qr-print-only" aria-hidden="true">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html printableSheetSvg}
	</div>
{/if}

<div
	class="roadid-screen-workspace bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-x-clip"
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
				<span>Profile &amp; Emergency ID</span>
			</p>

			<div class="flex flex-col gap-3">
				<h1
					id="profile-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Shape your experience. <span class="text-primary-500">Ride prepared.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-2xl text-base leading-snug font-medium">
					Manage local group and ride recommendations, SMS preferences, Emergency ID medical
					details, and linked In Case bracelets in one workspace.
				</p>
			</div>

			{#if currentUser}
				<div class="flex flex-wrap items-center gap-3">
					<a
						href="#road-id"
						class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
					>
						<IconContact class="h-4 w-4 shrink-0" />
						Jump to Emergency ID &amp; Bracelets
					</a>
				</div>
			{/if}
		</div>

		<div
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-secondary-500 flex min-w-0 flex-col justify-between gap-5 border-t-4 px-6 py-7 sm:px-10 lg:border-l-2 lg:px-10 lg:py-8"
		>
			{#if currentUser}
				<div class="flex flex-col gap-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span
							class="bg-primary-500 text-surface-950 px-2.5 py-1 text-xs font-black tracking-[0.2em] uppercase"
						>
							{completionScore}% Complete
						</span>
						<span
							class="border-surface-500 text-surface-200 border px-2.5 py-1 text-xs font-bold tracking-[0.16em] uppercase"
						>
							{linkedCodes.length}
							{linkedCodes.length === 1 ? 'Bracelet' : 'Bracelets'}
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
				<div class="flex flex-col gap-2.5">
					<div class="flex flex-wrap gap-3">
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
							onclick={saveProfile}
							disabled={saving}
						>
							<IconSave class="h-4 w-4" />
							{saving ? 'Saving…' : 'Save profile'}
						</button>
						<a
							href="#road-id"
							class="border-surface-50 text-surface-50 hover:bg-tertiary-500 hover:border-tertiary-500 hover:text-surface-950 inline-flex min-h-11 items-center justify-center gap-2 border-2 px-4 py-2.5 text-sm font-black tracking-wide uppercase transition"
						>
							<IconContact class="h-4 w-4" />
							Emergency ID
						</a>
					</div>
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
						Log in to access your profile &amp; Emergency ID
					</h2>
					<p class="text-surface-300 m-0 text-sm leading-relaxed">
						Sign in to personalize recommendations, update medical information, and manage In Case
						bracelets.
					</p>
				</div>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center gap-2 self-start px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
					onclick={(event) => {
						event.stopPropagation();
						const returnTo =
							typeof window !== 'undefined' &&
							(window.location.hash === '#road-id' || window.location.hash === '#safety')
								? '/profile#road-id'
								: '/profile';
						window.dispatchEvent(
							new CustomEvent('open-login', {
								detail: {
									returnTo,
									message: 'Sign in to manage your profile and Emergency ID.'
								}
							})
						);
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
							class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
							bind:value={fullName}
							autocomplete="name"
							oninput={() => {
								if (!emergencyNameOverridden) {
									emergencyFullName = fullName;
								}
							}}
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
							class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
							bind:value={phone}
							oninput={() => {
								if (!emergencyPhoneOverridden) {
									emergencyPhone = phone;
								}
							}}
							maxlength="24"
							placeholder="(480) 555-0123"
						/>
						<p class="text-surface-300 m-0 text-xs leading-relaxed">
							Shared with volunteer shift signups and your Emergency ID card. Entering a phone here
							never opts you into SMS text alerts.
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
							class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
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
							class="textarea bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-32 border-2"
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
								class={`inline-flex min-h-11 items-center border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition ${
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
									class="bg-secondary-500 text-surface-50 inline-flex min-h-11 items-center gap-1 pr-1 pl-3.5 text-xs font-black uppercase"
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
							class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 min-w-0 flex-1 border-2"
							bind:value={customInterest}
							placeholder="Add interest"
							maxlength="40"
							aria-label="Custom interest"
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

		<!-- 04 · SMS UPDATES -->
		<section
			class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-col gap-8 border-t-[3px] px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
			aria-labelledby="sms-heading"
		>
			<div class="flex max-w-3xl flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					04 · Optional notifications
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
						class="input bg-surface-950 border-surface-50 text-surface-50 min-h-11 border-2"
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

		<!-- GENERAL PROFILE + SMS SAVE BAR -->
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-4 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
			aria-label="Save general profile and SMS settings"
		>
			<div class="flex flex-wrap items-center gap-4">
				<button
					type="button"
					class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center gap-3 px-8 py-4 text-base font-black tracking-wide uppercase transition"
					onclick={saveProfile}
					disabled={saving}
				>
					<IconSave class="h-5 w-5" />
					{saving ? 'Saving…' : 'Save profile & SMS'}
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

		<!-- 05 · ROAD ID / EMERGENCY ID WORKSPACE -->
		<div id="safety" class="scroll-mt-24"></div>
		<section
			id="road-id"
			class="bg-surface-950 border-surface-950 scroll-mt-24 border-t-[3px]"
			aria-labelledby="road-id-heading"
		>
			<!-- Section Intro Band -->
			<div
				class="border-surface-800 flex flex-wrap items-end justify-between gap-6 border-b-2 px-6 py-12 sm:px-10 lg:px-14"
			>
				<div class="flex max-w-3xl items-start gap-4">
					<span
						class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-6xl"
						aria-hidden="true"
					>
						05
					</span>
					<div class="flex min-w-0 flex-col gap-2">
						<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
							In Case Bracelet · Safety &amp; Roadside Profile
						</p>
						<h2
							id="road-id-heading"
							class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
						>
							Emergency ID
						</h2>
						<p class="text-surface-300 m-0 text-base leading-relaxed">
							Save medical details, emergency contacts, and linked bracelets in one place. Your
							primary contact prefills volunteer signups automatically, and linked bracelets display
							this responder summary on scan.
						</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<button
						type="button"
						class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-5 py-2.5 text-xs font-black tracking-wider uppercase transition"
						onclick={syncDefaultsFromRiderProfile}
					>
						Copy name &amp; phone from profile
					</button>
					<a
						href="/roadid"
						class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
					>
						<IconContact class="h-4 w-4 shrink-0" />
						Road ID &amp; responder tools
					</a>
				</div>
			</div>

			{#if claimedNoticeCode}
				<div class="border-surface-800 border-b-2 px-6 py-5 sm:px-10 lg:px-14">
					<div
						class="bg-primary-500 text-surface-950 flex flex-wrap items-center justify-between gap-4 p-5"
						role="status"
					>
						<div class="min-w-0 flex-1">
							<p class="m-0 text-xs font-black tracking-[0.2em] uppercase">Bracelet Linked</p>
							<p class="m-0 mt-1 text-sm font-bold">
								Code <strong>{claimedNoticeCode}</strong> is linked to your Emergency ID. Review your
								medical details and emergency contacts below.
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
				</div>
			{/if}

			<div class="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<!-- LEFT COLUMN: Medical Details + Emergency Contacts -->
				<div
					class="lg:border-surface-800 divide-surface-800 flex min-w-0 flex-col divide-y-2 lg:border-r-2"
				>
					<!-- Medical Details Form -->
					<form
						class="flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14 lg:py-12"
						onsubmit={saveEmergencyProfile}
					>
						<div class="flex flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Rider Medical Details
							</p>
							<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">
								Emergency Information
							</h3>
						</div>

						<div class="grid gap-5 sm:grid-cols-2">
							<label class="flex min-w-0 flex-col gap-2">
								<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
									Emergency Name
								</span>
								<input
									type="text"
									class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
									bind:value={emergencyFullName}
									oninput={() => (emergencyNameOverridden = true)}
									maxlength="200"
									placeholder="Full legal name for responders"
								/>
								<span class="text-surface-300 text-xs">
									Seeded from your profile; override if responders need your full legal name.
								</span>
							</label>

							<label class="flex min-w-0 flex-col gap-2">
								<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
									Rider Phone (Emergency Card)
								</span>
								<input
									type="tel"
									autocomplete="tel"
									class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
									bind:value={emergencyPhone}
									oninput={() => (emergencyPhoneOverridden = true)}
									maxlength="64"
									placeholder="(480) 555-0123"
								/>
								<span class="text-surface-300 text-xs">
									Shown on your responder card; independent of SMS opt-in.
								</span>
							</label>
						</div>

						<label class="flex max-w-xs flex-col gap-2" for="blood_type">
							<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
								Blood Type
							</span>
							<select
								id="blood_type"
								class="select bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
								bind:value={emergencyBloodType}
							>
								<option value="">Not listed</option>
								{#each BLOOD_TYPE_OPTIONS as bt (bt)}
									<option value={bt}>{bt}</option>
								{/each}
							</select>
						</label>

						<div class="flex flex-col gap-2.5">
							<p
								id="emergency-allergies-label"
								class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
							>
								Allergies
							</p>
							<div
								class="flex flex-wrap gap-2"
								role="group"
								aria-labelledby="emergency-allergies-label"
							>
								{#each ALLERGY_OPTIONS as allergy (allergy)}
									{@const active = isAllergySelected(allergy)}
									<button
										type="button"
										aria-pressed={active}
										class={`inline-flex min-h-11 items-center border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition ${
											active
												? 'bg-primary-500 text-surface-950 border-primary-500'
												: 'bg-surface-900 text-surface-50 border-surface-500 hover:border-primary-500'
										}`}
										onclick={() => toggleAllergyChip(allergy)}
									>
										{allergy}
									</button>
								{/each}
							</div>
							<label class="flex flex-col gap-1.5">
								<span class="text-surface-300 text-xs font-medium">
									All allergies (comma-separated)
								</span>
								<input
									type="text"
									class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
									bind:value={emergencyAllergies}
									maxlength="2000"
									placeholder="Penicillin, Bee stings, Latex"
								/>
							</label>
						</div>

						<div class="flex flex-col gap-2.5">
							<p
								id="emergency-medication-label"
								class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
							>
								Medications
							</p>
							<div
								class="flex flex-wrap gap-2"
								role="group"
								aria-labelledby="emergency-medication-label"
							>
								{#each MEDICATION_OPTIONS as med (med)}
									{@const active = isMedicationSelected(med)}
									<button
										type="button"
										aria-pressed={active}
										class={`inline-flex min-h-11 items-center border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition ${
											active
												? 'bg-primary-500 text-surface-950 border-primary-500'
												: 'bg-surface-900 text-surface-50 border-surface-500 hover:border-primary-500'
										}`}
										onclick={() => toggleMedicationChip(med)}
									>
										{med}
									</button>
								{/each}
							</div>
							<label class="flex flex-col gap-1.5">
								<span class="text-surface-300 text-xs font-medium">
									All medications (comma-separated)
								</span>
								<textarea
									rows="3"
									class="textarea bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 border-2"
									bind:value={emergencyMedication}
									maxlength="2000"
									placeholder="Albuterol inhaler, Eliquis 5mg"></textarea>
							</label>
						</div>

						<div class="flex flex-wrap items-center gap-4 pt-2">
							<button
								type="submit"
								class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center gap-2.5 px-7 py-3.5 text-sm font-black tracking-wide uppercase transition"
								disabled={savingEmergency}
							>
								<IconSave class="h-4 w-4" />
								{savingEmergency ? 'Saving Emergency ID…' : 'Save Emergency ID'}
							</button>
							{#if emergencySaveError}
								<p
									class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-bold uppercase"
									role="alert"
								>
									{emergencySaveError}
								</p>
							{/if}
							{#if emergencySaveSuccess}
								<p
									class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-xs font-black uppercase"
									role="status"
								>
									{emergencySaveSuccess}
								</p>
							{/if}
						</div>
					</form>

					<!-- Emergency Contacts Section -->
					<div class="flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
						<div class="flex flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Who First Responders Should Call
							</p>
							<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">Emergency Contacts</h3>
							<p class="text-surface-300 m-0 mt-1 text-xs leading-relaxed">
								Contact #1 prefills your emergency contact on volunteer shift signups. Emergency
								contact phone numbers are never subscribed to SMS notifications.
							</p>
						</div>

						{#if contactError}
							<p
								class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-bold uppercase"
								role="alert"
							>
								{contactError}
							</p>
						{/if}
						{#if contactSuccess}
							<p
								class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-xs font-black uppercase"
								role="status"
							>
								{contactSuccess}
							</p>
						{/if}

						{#if emergencyContacts.length}
							<div class="border-surface-50 divide-surface-800 flex flex-col divide-y border-t-2">
								{#each emergencyContacts as contact, idx (contact.id ?? idx)}
									{@const busyKey = contact.id ?? `idx-${idx}`}
									<div class="flex min-w-0 flex-col gap-4 py-5">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span
												class={`px-2.5 py-1 text-xs font-black tracking-[0.18em] uppercase ${
													idx === 0
														? 'bg-primary-500 text-surface-950'
														: 'bg-surface-900 text-surface-300 border-surface-700 border'
												}`}
											>
												{idx === 0
													? 'Primary Contact · Volunteer & Road ID'
													: `Contact #${idx + 1}`}
											</span>
										</div>
										<div class="grid gap-3 sm:grid-cols-3">
											<label class="flex min-w-0 flex-col gap-1.5">
												<span
													class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase"
												>
													Name
												</span>
												<input
													type="text"
													class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
													bind:value={contact.contact_name}
													maxlength="200"
												/>
											</label>
											<label class="flex min-w-0 flex-col gap-1.5">
												<span
													class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase"
												>
													Relationship
												</span>
												<input
													type="text"
													class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
													bind:value={contact.contact_relationship}
													maxlength="120"
												/>
											</label>
											<label class="flex min-w-0 flex-col gap-1.5">
												<span
													class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase"
												>
													Phone
												</span>
												<input
													type="tel"
													autocomplete="off"
													class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
													bind:value={contact.contact_phone}
													maxlength="64"
												/>
											</label>
										</div>
										<div class="flex flex-wrap items-center gap-3">
											<button
												type="button"
												class="bg-surface-900 border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2 text-xs font-black uppercase transition"
												onclick={() => handleSaveExistingContact(contact, idx)}
												disabled={busyContactId === busyKey}
											>
												<IconSave class="h-3.5 w-3.5" />
												Save Contact
											</button>
											<button
												type="button"
												class="border-tertiary-500 text-tertiary-500 hover:bg-tertiary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2 text-xs font-black uppercase transition"
												aria-label={`Remove emergency contact ${contact.contact_name || 'contact'}`}
												onclick={() => handleDeleteContact(contact, idx)}
												disabled={busyContactId === busyKey}
											>
												<IconTrash2 class="h-3.5 w-3.5" />
												Remove
											</button>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-surface-300 m-0 text-sm">
								No emergency contacts added yet. Add at least one person first responders can call.
							</p>
						{/if}

						<form
							class="bg-surface-900 border-t-secondary-500 flex min-w-0 flex-col gap-4 border-t-4 p-5 sm:p-6"
							onsubmit={handleAddContact}
						>
							<h4 class="text-surface-50! m-0 text-base font-black uppercase">
								Add Emergency Contact
							</h4>
							<div class="grid gap-3 sm:grid-cols-3">
								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase">
										Name
									</span>
									<input
										type="text"
										class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
										bind:value={newContact.contact_name}
										maxlength="200"
										placeholder="Alex Rivera"
										required
									/>
								</label>
								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase">
										Relationship
									</span>
									<input
										type="text"
										class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
										bind:value={newContact.contact_relationship}
										maxlength="120"
										placeholder="Partner / Parent"
									/>
								</label>
								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase">
										Phone
									</span>
									<input
										type="tel"
										autocomplete="off"
										class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
										bind:value={newContact.contact_phone}
										maxlength="64"
										placeholder="(480) 555-0199"
										required
									/>
								</label>
							</div>
							<button
								type="submit"
								class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center gap-2 self-start px-6 py-2.5 text-xs font-black tracking-wider uppercase transition"
								disabled={addingContact}
							>
								<IconPlus class="h-4 w-4" />
								{addingContact ? 'Adding…' : 'Add Contact'}
							</button>
						</form>
					</div>
				</div>

				<!-- RIGHT COLUMN: Bracelets + Live Responder Preview + Printable Vector QR Generator -->
				<div class="divide-surface-800 flex min-w-0 flex-col divide-y-2">
					<!-- Bracelets & Linked Codes -->
					<div class="flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
						<div class="flex flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Wristbands &amp; Spare Tags
							</p>
							<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">Linked Bracelets</h3>
							<p class="text-surface-300 m-0 text-sm leading-relaxed">
								Link multiple In Case bracelets to share this Emergency ID, or unlink retired bands.
							</p>
						</div>

						<form class="flex flex-wrap gap-2.5" onsubmit={handleClaimBracelet}>
							<label class="sr-only" for="claim-bracelet-code">Bracelet code</label>
							<input
								id="claim-bracelet-code"
								type="text"
								class="input bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 min-w-0 flex-1 border-2"
								bind:value={claimCodeInput}
								maxlength="120"
								placeholder="Enter bracelet code (e.g. ABC12345)"
							/>
							<button
								type="submit"
								class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 shrink-0 items-center gap-2 px-5 py-2.5 text-xs font-black tracking-wider uppercase transition"
								disabled={claimingCode}
							>
								<IconLink2 class="h-4 w-4" />
								{claimingCode ? 'Claiming…' : 'Claim Bracelet'}
							</button>
						</form>

						{#if claimError}
							<p
								class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-xs font-bold uppercase"
								role="alert"
							>
								{claimError}
							</p>
						{/if}
						{#if claimSuccess}
							<p
								class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-xs font-black uppercase"
								role="status"
							>
								{claimSuccess}
							</p>
						{/if}

						{#if linkedCodes.length}
							<ul
								class="border-surface-50 divide-surface-800 m-0 list-none divide-y border-t-2 p-0"
							>
								{#each linkedCodes as item (item.code)}
									<li class="flex flex-col gap-3 py-4">
										<div class="flex flex-wrap items-center justify-between gap-3">
											<div class="flex min-w-0 items-center gap-3">
												<span
													class="bg-primary-500 text-surface-950 px-3 py-1 font-mono text-sm font-black"
												>
													{item.code}
												</span>
												<span class="text-surface-300 font-mono text-xs break-all">
													/roadid/{item.code}
												</span>
											</div>
											<div class="flex flex-wrap items-center gap-2">
												<a
													href={`/roadid/${encodeURIComponent(item.code)}`}
													class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-1.5 border-2 px-3.5 py-2 text-xs font-black uppercase transition"
												>
													<span>Responder View</span>
													<IconExternalLink class="h-3.5 w-3.5" />
												</a>
												{#if confirmUnlinkCode === item.code}
													<button
														type="button"
														class="bg-tertiary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center px-3.5 py-2 text-xs font-black uppercase transition"
														onclick={() => handleUnlinkBracelet(item.code)}
														disabled={unlinkingCode === item.code}
													>
														{unlinkingCode === item.code ? 'Unlinking…' : 'Confirm Unlink'}
													</button>
													<button
														type="button"
														class="border-surface-500 text-surface-200 hover:border-surface-50 inline-flex min-h-11 items-center border-2 px-3.5 py-2 text-xs font-black uppercase transition"
														onclick={() => (confirmUnlinkCode = '')}
													>
														Cancel
													</button>
												{:else}
													<button
														type="button"
														class="border-tertiary-500 text-tertiary-500 hover:bg-tertiary-500 hover:text-surface-950 inline-flex min-h-11 items-center border-2 px-3.5 py-2 text-xs font-black uppercase transition"
														aria-label={`Unlink bracelet ${item.code}`}
														onclick={() => (confirmUnlinkCode = item.code)}
													>
														Unlink
													</button>
												{/if}
											</div>
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							<div class="bg-surface-900 border-t-primary-500 border-t-4 p-5">
								<p class="m-0 text-sm font-bold uppercase">No bracelets linked yet</p>
								<p class="text-surface-300 m-0 mt-1 text-xs leading-relaxed">
									You do not need a bracelet to save medical notes or emergency contacts here. Scan
									an unclaimed wristband or enter its code above anytime to bind it to your
									Emergency ID.
								</p>
							</div>
						{/if}
					</div>

					<!-- Live Responder Preview Card -->
					<div class="flex min-w-0 flex-col gap-5 px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
						<div class="flex flex-col gap-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
								Roadside Formatting Check
							</p>
							<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">
								Live Responder Preview
							</h3>
							<p class="text-surface-300 m-0 text-sm leading-relaxed">
								Updates as you type so you can verify what paramedics and fellow riders see.
							</p>
						</div>

						<RoadIdResponderCard
							preview={true}
							code={activePreviewCode}
							profile={liveEmergencyProfile}
							contacts={previewContacts}
						/>
					</div>

					<!-- Printable Vector QR Sticker & Sheet Generator -->
					<div class="flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
						<div class="flex flex-col gap-1">
							<p
								class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
							>
								<IconQrCode class="h-4 w-4" />
								<span>Local Vector QR Generator</span>
							</p>
							<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">
								Backup QR Labels &amp; Print Sheet
							</h3>
							<p class="text-surface-300 m-0 text-sm leading-relaxed">
								Generate crisp vector QR stickers locally in your browser for helmets, bike frames,
								or wallet cards.
							</p>
						</div>

						{#if linkedCodes.length}
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase">
										Codes to include
									</span>
									<select
										class="select bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
										bind:value={qrScope}
									>
										{#if linkedCodes.length > 1}
											<option value="all">All linked bracelets ({linkedCodes.length})</option>
										{/if}
										{#each linkedCodes as item (item.code)}
											<option value={item.code}>Code: {item.code}</option>
										{/each}
									</select>
								</label>

								<label class="flex min-w-0 flex-col gap-1.5">
									<span class="text-primary-500 text-xs font-bold tracking-[0.18em] uppercase">
										Stickers per code
									</span>
									<select
										class="select bg-surface-950 border-surface-500 text-surface-50 focus:border-primary-500 min-h-11 border-2"
										bind:value={qrCopiesPerCode}
									>
										<option value={1}>1 label</option>
										<option value={2}>2 labels</option>
										<option value={4}>4 labels</option>
										<option value={6}>6 labels</option>
									</select>
								</label>
							</div>

							<div
								class="bg-surface-900 border-t-secondary-500 flex flex-wrap items-center gap-6 border-t-4 p-5"
							>
								{#if singleQrPreviewSvg}
									<div class="bg-surface-50 shrink-0 p-2">
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html singleQrPreviewSvg}
									</div>
								{/if}
								<div class="flex min-w-[12rem] flex-1 flex-col gap-3">
									<div>
										<p class="text-primary-500 m-0 text-xs font-black tracking-[0.18em] uppercase">
											Scannable Target URL
										</p>
										<p class="m-0 mt-1 font-mono text-sm font-bold break-all">
											{singleQrPreviewUrl}
										</p>
									</div>
									<p class="text-surface-300 m-0 text-xs leading-relaxed">
										Sheet includes {selectedQrCodes.length * qrCopiesPerCode} high-contrast vector
										{selectedQrCodes.length * qrCopiesPerCode === 1 ? 'label' : 'labels'}.
									</p>
									<div class="flex flex-wrap gap-3 pt-1">
										<button
											type="button"
											class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-xs font-black tracking-wider uppercase transition"
											onclick={printQrSheet}
										>
											<IconPrinter class="h-4 w-4" />
											Print QR Sheet
										</button>
										<button
											type="button"
											class="border-surface-50 text-surface-50 hover:bg-secondary-500 hover:border-secondary-500 inline-flex min-h-11 items-center gap-2 border-2 px-5 py-2.5 text-xs font-black tracking-wider uppercase transition"
											onclick={downloadQrSheetSvg}
										>
											<IconDownload class="h-4 w-4" />
											Download Vector SVG
										</button>
									</div>
								</div>
							</div>
						{:else}
							<div class="bg-surface-900 border-t-secondary-500 border-t-4 p-5">
								<p class="m-0 text-sm font-bold uppercase">
									Claim a bracelet code to unlock QR label printing
								</p>
								<p class="text-surface-300 m-0 mt-1 text-xs leading-relaxed">
									Once at least one bracelet code is linked above, you can download vector SVG
									stickers or print multi-label backup sheets right here.
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>
	{:else}
		<div id="safety" class="scroll-mt-24"></div>
		<section
			id="road-id"
			class="bg-surface-950 flex flex-1 scroll-mt-24 flex-col justify-between gap-8 px-6 py-12 sm:px-10 lg:px-14"
		>
			<div class="grid gap-8 lg:grid-cols-2">
				<div class="flex max-w-2xl flex-col gap-3">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Why create a profile
					</p>
					<h2
						class="text-surface-50! m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
					>
						Local groups, rides, shifts, and Emergency ID in one place.
					</h2>
				</div>
				<div class="bg-surface-900 border-t-tertiary-500 flex flex-col gap-4 border-t-4 p-6">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						In Case Bracelet · Emergency ID
					</p>
					<p class="text-surface-200 m-0 text-sm leading-relaxed">
						Sign in to claim wristbands, update allergies, medications, and emergency contacts, and
						print replacement vector QR labels.
					</p>
					<button
						type="button"
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center justify-center self-start px-6 py-3 text-xs font-black tracking-wider uppercase transition"
						onclick={(event) => {
							event.stopPropagation();
							window.dispatchEvent(
								new CustomEvent('open-login', {
									detail: {
										returnTo: '/profile#road-id',
										message: 'Sign in to manage your Emergency ID and bracelets.'
									}
								})
							);
						}}
					>
						Sign in for Emergency ID
					</button>
				</div>
			</div>
			<div
				class="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
				aria-hidden="true"
			></div>
		</section>
	{/if}
</div>

<style>
	.roadid-qr-print-only {
		display: none;
	}

	:global(body.printing-roadid-qr .app-header),
	:global(body.printing-roadid-qr .app-rail),
	:global(body.printing-roadid-qr .roadid-screen-workspace) {
		display: none !important;
	}

	:global(body.printing-roadid-qr .roadid-qr-print-only) {
		display: block !important;
		background: #ffffff;
		padding: 0;
	}

	@media print {
		:global(body.printing-roadid-qr) {
			background: #ffffff !important;
		}
	}

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
