/**
 * @typedef {Object} SmsCategoryOption
 * @property {string} key
 * @property {string} label
 * @property {string} [description]
 */

/**
 * @typedef {Object} SmsPreferencesState
 * @property {string} phone
 * @property {string} status
 * @property {boolean} ride_reminders
 * @property {boolean} volunteer_reminders
 * @property {boolean} admin_messages
 * @property {boolean} bike_valet_messages
 * @property {string | null} consent_version
 * @property {string | null} opted_in_at
 * @property {string | null} opted_out_at
 */

/**
 * @typedef {Object} LoadedSmsPreferences
 * @property {SmsPreferencesState} preferences
 * @property {string} consentText
 */

/**
 * @typedef {Object} InlineSmsValidationResult
 * @property {boolean} ok
 * @property {string} phoneError
 * @property {string} consentError
 * @property {string} error
 */

/**
 * @typedef {{
 *   ok: true,
 *   status: number,
 *   error: string,
 *   retryMessage: string,
 *   phoneInvalid: false,
 *   preferences: SmsPreferencesState,
 *   consentText: string
 * } | {
 *   ok: false,
 *   status: number,
 *   error: string,
 *   retryMessage: string,
 *   phoneInvalid: boolean,
 *   preferences: SmsPreferencesState | null,
 *   consentText: string | null
 * }} SaveInlineSmsResult
 */

/**
 * @typedef {{
 *   ok: false,
 *   stage: 'sms_validation',
 *   registrationSaved: false,
 *   smsSaved: false,
 *   smsRetryNeeded: false,
 *   validation: InlineSmsValidationResult
 * } | {
 *   ok: false,
 *   stage: 'registration',
 *   registrationSaved: false,
 *   smsSaved: false,
 *   smsRetryNeeded: false,
 *   registrationResult: any
 * } | {
 *   ok: false,
 *   stage: 'sms_save',
 *   registrationSaved: true,
 *   smsSaved: false,
 *   smsRetryNeeded: true,
 *   registrationResult: any,
 *   smsResult: Extract<SaveInlineSmsResult, { ok: false }>
 * } | {
 *   ok: true,
 *   stage: 'complete',
 *   registrationSaved: true,
 *   smsSaved: boolean,
 *   smsRetryNeeded: false,
 *   registrationResult: any,
 *   smsResult?: Extract<SaveInlineSmsResult, { ok: true }>
 * }} SubmitRegistrationThenSmsOutcome
 */

/** @type {string} */
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

/**
 * @returns {SmsPreferencesState}
 */
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

/**
 * @param {any} [payload]
 * @returns {LoadedSmsPreferences}
 */
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

/**
 * @param {any} preferences
 * @param {string} key
 * @returns {boolean}
 */
export function isSmsCategoryActive(preferences, key) {
	return preferences?.status === 'active' && preferences?.[key] === true;
}

/**
 * @param {any} preferences
 * @param {readonly SmsCategoryOption[]} [categoryOptions]
 * @returns {{
 *   mode: 'unsubscribed' | 'blocked' | 'all_active' | 'editable',
 *   availableCategories: SmsCategoryOption[],
 *   activeCategories: SmsCategoryOption[]
 * }}
 */
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

	/** @type {SmsCategoryOption[]} */
	const availableCategories = [];
	/** @type {SmsCategoryOption[]} */
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

/**
 * @param {readonly SmsCategoryOption[]} [availableCategories]
 * @param {Record<string, any>} [selectedMap]
 * @returns {string[]}
 */
export function getSelectedNewCategoryKeys(availableCategories = [], selectedMap = {}) {
	/** @type {string[]} */
	const keys = [];
	for (const option of availableCategories) {
		if (option?.key && selectedMap?.[option.key] === true) {
			keys.push(option.key);
		}
	}
	return keys;
}

/**
 * @param {string} context
 * @param {readonly string[]} [selectedKeys]
 * @returns {string}
 */
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

/**
 * @param {{
 *   selectedKeys?: readonly string[],
 *   phone?: string,
 *   consentChecked?: boolean,
 *   requireSelection?: boolean
 * }} [options]
 * @returns {InlineSmsValidationResult}
 */
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

/**
 * @param {(url: any, init?: any) => Promise<Response>} [fetchImpl]
 */
export function createSingleFlightPreferencesLoader(fetchImpl = fetch) {
	/** @type {Map<string, Promise<LoadedSmsPreferences>>} */
	const inFlightByKey = new Map();
	/** @type {Map<string, LoadedSmsPreferences>} */
	const cachedByKey = new Map();

	return {
		/**
		 * @param {{ force?: boolean, cacheKey?: string }} [options]
		 * @returns {Promise<LoadedSmsPreferences>}
		 */
		async load({ force = false, cacheKey = 'default' } = {}) {
			const key = String(cacheKey ?? 'default');
			if (!force && cachedByKey.has(key)) {
				return /** @type {LoadedSmsPreferences} */ (cachedByKey.get(key));
			}
			if (!force && inFlightByKey.has(key)) {
				return /** @type {Promise<LoadedSmsPreferences>} */ (inFlightByKey.get(key));
			}

			const request = (async () => {
				const response = await fetchImpl('/api/sms/preferences');
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error || 'Unable to load SMS preferences.');
				}
				const normalized = normalizeLoadedSmsPreferences(payload);
				cachedByKey.set(key, normalized);
				return normalized;
			})();
			inFlightByKey.set(key, request);

			try {
				return await request;
			} finally {
				if (inFlightByKey.get(key) === request) inFlightByKey.delete(key);
			}
		},
		/**
		 * @param {LoadedSmsPreferences} nextValue
		 * @param {{ cacheKey?: string }} [options]
		 */
		setCached(nextValue, { cacheKey = 'default' } = {}) {
			cachedByKey.set(String(cacheKey ?? 'default'), nextValue);
		},
		/**
		 * @param {{ cacheKey?: string }} [options]
		 * @returns {LoadedSmsPreferences | null}
		 */
		getCached({ cacheKey = 'default' } = {}) {
			return cachedByKey.get(String(cacheKey ?? 'default')) ?? null;
		}
	};
}

/**
 * @param {{
 *   fetchImpl?: (url: any, init?: any) => Promise<Response>,
 *   phone?: string,
 *   selectedKeys?: readonly string[],
 *   source?: string,
 *   registrationLabel?: string
 * }} [options]
 * @returns {Promise<SaveInlineSmsResult>}
 */
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

/**
 * @param {{
 *   register?: () => Promise<any>,
 *   selectedKeys?: readonly string[],
 *   phone?: string,
 *   consentChecked?: boolean,
 *   source?: string,
 *   registrationLabel?: string,
 *   fetchImpl?: (url: any, init?: any) => Promise<Response>
 * }} [options]
 * @returns {Promise<SubmitRegistrationThenSmsOutcome>}
 */
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

	const registrationResult = await register?.();
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
