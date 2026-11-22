export const SMS_INLINE_DEFAULT_CONSENT_TEXT =
	'By checking the SMS consent box or selecting “Agree & enable SMS,” I agree to receive recurring 3 Feet Please SMS messages about the categories I select. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to rejoin, or HELP for help.';

export const RIDE_RSVP_SMS_CATEGORIES = Object.freeze([
	{
		key: 'ride_reminders',
		label: 'Text me reminders for rides I RSVP for',
		description:
			'Get concise reminders for upcoming rides you choose to attend. Manage anytime in Profile.'
	},
	{
		key: 'admin_messages',
		label: 'Let ride organizers text me about my RSVP',
		description: 'Receive and reply to messages from organizers about rides you attend.'
	}
]);

export const VOLUNTEER_SIGNUP_SMS_CATEGORIES = Object.freeze([
	{
		key: 'volunteer_reminders',
		label: 'Text me reminders for my volunteer shifts',
		description: 'Get concise reminders for shifts you select at this event.'
	},
	{
		key: 'admin_messages',
		label: 'Let volunteer organizers text me about my shifts',
		description: 'Receive and reply to messages from organizers about volunteer shifts you select.'
	}
]);

export const VOLUNTEER_MANAGE_SMS_CATEGORIES = Object.freeze([
	{
		key: 'admin_messages',
		label: 'Text me volunteer organizer messages',
		description: 'Receive concise updates and replies related to this volunteer event.'
	}
]);

export function emptySmsPreferences() {
	return {
		phone: '',
		status: 'paused',
		ride_reminders: false,
		volunteer_reminders: false,
		admin_messages: false,
		bike_valet_messages: false,
		consent_version: null,
		opted_in_at: null,
		opted_out_at: null
	};
}

export function normalizeLoadedSmsPreferences(payload = {}) {
	const raw =
		payload?.preferences && typeof payload.preferences === 'object' ? payload.preferences : {};
	return {
		preferences: {
			phone: typeof raw.phone === 'string' ? raw.phone : '',
			status: typeof raw.status === 'string' && raw.status ? raw.status : 'paused',
			ride_reminders: raw.ride_reminders === true,
			volunteer_reminders: raw.volunteer_reminders === true,
			admin_messages: raw.admin_messages === true,
			bike_valet_messages: raw.bike_valet_messages === true,
			consent_version: raw.consent_version || null,
			opted_in_at: raw.opted_in_at || null,
			opted_out_at: raw.opted_out_at || null
		},
		consentText:
			typeof payload?.consentText === 'string' && payload.consentText.trim()
				? payload.consentText
				: SMS_INLINE_DEFAULT_CONSENT_TEXT
	};
}

export function isSmsCategoryActive(preferences, key) {
	return preferences?.status === 'active' && preferences?.[key] === true;
}

export function getInlineSmsMode(preferences, categoryOptions = []) {
	const status = preferences?.status || 'paused';
	if (status === 'unsubscribed') {
		return {
			mode: 'unsubscribed',
			availableCategories: [],
			activeCategories: []
		};
	}
	if (status === 'blocked') {
		return {
			mode: 'blocked',
			availableCategories: [],
			activeCategories: []
		};
	}

	const availableCategories = [];
	const activeCategories = [];
	for (const option of categoryOptions) {
		if (!option?.key) continue;
		if (isSmsCategoryActive(preferences, option.key)) {
			activeCategories.push(option);
		} else {
			availableCategories.push(option);
		}
	}

	if (categoryOptions.length > 0 && availableCategories.length === 0) {
		return {
			mode: 'all_active',
			availableCategories: [],
			activeCategories
		};
	}

	return {
		mode: 'editable',
		availableCategories,
		activeCategories
	};
}

export function getSelectedNewCategoryKeys(availableCategories = [], selectedMap = {}) {
	const keys = [];
	for (const option of availableCategories) {
		if (option?.key && selectedMap?.[option.key] === true) {
			keys.push(option.key);
		}
	}
	return keys;
}

export function resolveInlineConsentSource(context, selectedKeys = []) {
	const selected = new Set(selectedKeys);
	if (context === 'ride-rsvp') {
		return selected.has('ride_reminders') ? 'ride-rsvp' : 'ride-rsvp-admin-messages';
	}
	if (context === 'volunteer-signup') {
		return selected.has('volunteer_reminders')
			? 'volunteer-signup'
			: 'volunteer-signup-admin-messages';
	}
	if (context === 'volunteer-management') {
		return 'volunteer-management';
	}
	return 'profile';
}

export function validateInlineSmsInput({
	selectedKeys = [],
	phone = '',
	consentChecked = false,
	requireSelection = false
} = {}) {
	if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
		if (requireSelection) {
			return {
				ok: false,
				phoneError: '',
				consentError: '',
				error: 'Select at least one SMS option before enabling text updates.'
			};
		}
		return { ok: true, phoneError: '', consentError: '', error: '' };
	}

	const trimmedPhone = String(phone ?? '').trim();
	const missingPhone = !trimmedPhone;
	const missingConsent = consentChecked !== true;

	if (missingPhone && missingConsent) {
		return {
			ok: false,
			phoneError: 'Enter a mobile phone number to enable text updates.',
			consentError: 'Check the SMS consent box to enable text updates.',
			error: 'Enter a mobile phone number and check the SMS consent box to enable text updates.'
		};
	}
	if (missingPhone) {
		return {
			ok: false,
			phoneError: 'Enter a mobile phone number to enable text updates.',
			consentError: '',
			error: 'Enter a mobile phone number to enable text updates.'
		};
	}
	if (missingConsent) {
		return {
			ok: false,
			phoneError: '',
			consentError: 'Check the SMS consent box to enable text updates.',
			error: 'Check the SMS consent box to enable text updates.'
		};
	}

	return { ok: true, phoneError: '', consentError: '', error: '' };
}

export function createSingleFlightPreferencesLoader(fetchImpl = fetch) {
	let inFlight = null;
	let cached = null;

	return {
		async load({ force = false } = {}) {
			if (!force && cached) return cached;
			if (!force && inFlight) return inFlight;

			inFlight = (async () => {
				const response = await fetchImpl('/api/sms/preferences');
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error || 'Unable to load SMS preferences.');
				}
				const normalized = normalizeLoadedSmsPreferences(payload);
				cached = normalized;
				return normalized;
			})();

			try {
				return await inFlight;
			} finally {
				inFlight = null;
			}
		},
		setCached(nextValue) {
			cached = nextValue;
		},
		getCached() {
			return cached;
		}
	};
}

export async function saveInlineSmsPreferences({
	fetchImpl = fetch,
	phone = '',
	selectedKeys = [],
	source = 'profile',
	registrationLabel = ''
} = {}) {
	const trimmedPhone = String(phone ?? '').trim();
	const categoryPatch = Object.fromEntries(selectedKeys.map((key) => [key, true]));

	try {
		const response = await fetchImpl('/api/sms/preferences', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				phone: trimmedPhone,
				sms_consent: true,
				...categoryPatch,
				source
			})
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			const apiError = payload?.error || 'Unable to enable SMS updates.';
			const phoneInvalid = response.status === 400 || response.status === 409;
			const retrySuffix = registrationLabel
				? `Your ${registrationLabel} is saved. Check your mobile number and retry SMS signup.`
				: 'Check your mobile number and try again.';
			return {
				ok: false,
				status: response.status,
				error: apiError,
				retryMessage: `${apiError} ${retrySuffix}`,
				phoneInvalid,
				preferences: null,
				consentText: null
			};
		}

		const normalized = normalizeLoadedSmsPreferences(payload);
		const allEnabled = selectedKeys.every((key) =>
			isSmsCategoryActive(normalized.preferences, key)
		);
		if (!allEnabled) {
			const fallbackError = 'SMS updates could not be enabled for this account.';
			const retrySuffix = registrationLabel
				? `Your ${registrationLabel} is saved. Please retry SMS signup.`
				: 'Please try again.';
			return {
				ok: false,
				status: 200,
				error: fallbackError,
				retryMessage: `${fallbackError} ${retrySuffix}`,
				phoneInvalid: false,
				preferences: normalized.preferences,
				consentText: normalized.consentText
			};
		}

		return {
			ok: true,
			status: response.status,
			error: '',
			retryMessage: '',
			phoneInvalid: false,
			preferences: normalized.preferences,
			consentText: normalized.consentText
		};
	} catch (err) {
		const message = err?.message || 'Unable to enable SMS updates.';
		const retrySuffix = registrationLabel
			? `Your ${registrationLabel} is saved. Please retry SMS signup.`
			: 'Please try again.';
		return {
			ok: false,
			status: 0,
			error: message,
			retryMessage: `${message} ${retrySuffix}`,
			phoneInvalid: false,
			preferences: null,
			consentText: null
		};
	}
}

export async function submitRegistrationThenSms({
	register,
	selectedKeys = [],
	phone = '',
	consentChecked = false,
	source = 'profile',
	registrationLabel = 'registration',
	fetchImpl = fetch
} = {}) {
	const validation = validateInlineSmsInput({
		selectedKeys,
		phone,
		consentChecked,
		requireSelection: false
	});
	if (!validation.ok) {
		return {
			ok: false,
			stage: 'sms_validation',
			registrationSaved: false,
			smsSaved: false,
			smsRetryNeeded: false,
			validation
		};
	}

	const registrationResult = await register();
	if (!registrationResult?.ok) {
		return {
			ok: false,
			stage: 'registration',
			registrationSaved: false,
			smsSaved: false,
			smsRetryNeeded: false,
			registrationResult
		};
	}

	if (!selectedKeys.length) {
		return {
			ok: true,
			stage: 'complete',
			registrationSaved: true,
			smsSaved: false,
			smsRetryNeeded: false,
			registrationResult
		};
	}

	const smsResult = await saveInlineSmsPreferences({
		fetchImpl,
		phone,
		selectedKeys,
		source,
		registrationLabel
	});

	if (!smsResult.ok) {
		return {
			ok: false,
			stage: 'sms_save',
			registrationSaved: true,
			smsSaved: false,
			smsRetryNeeded: true,
			registrationResult,
			smsResult
		};
	}

	return {
		ok: true,
		stage: 'complete',
		registrationSaved: true,
		smsSaved: true,
		smsRetryNeeded: false,
		registrationResult,
		smsResult
	};
}
