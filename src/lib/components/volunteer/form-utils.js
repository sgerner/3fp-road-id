function toLocalDatetime(value) {
	if (!value) return '';
	try {
		const date = new Date(String(value));
		if (Number.isNaN(date.getTime())) return String(value);
		const pad = (num, size = 2) => `${num}`.padStart(size, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	} catch {
		return String(value);
	}
}
function toIso(value) {
	if (value === null || value === undefined || value === '') return null;
	try {
		const date = new Date(String(value));
		if (Number.isNaN(date.getTime())) return String(value);
		return date.toISOString();
	} catch {
		return String(value);
	}
}
function numberString(value) {
	if (value === null || value === undefined || value === '') return '';
	const num = Number(value);
	if (Number.isFinite(num)) return `${num}`;
	return String(value);
}
function nullableString(value) {
	if (value === null || value === undefined) return '';
	return String(value);
}
function stringOrNull(value) {
	if (value === null || value === undefined) return null;
	const str = String(value);
	return str.trim() === '' ? null : str;
}
function numberOrNull(value) {
	if (value === null || value === undefined || value === '') return null;
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}
function ensureBoolean(value) {
	return value === true || value === 'true' || value === 1 || value === '1';
}
export function mapEventRecordToFormDetails(record) {
	return {
		id: record.id ?? '',
		title: nullableString(record.title),
		slug: nullableString(record.slug),
		summary: nullableString(record.summary),
		description: nullableString(record.description),
		eventTypeSlug:
			nullableString(
				record.event_type_slug ?? record.eventTypeSlug ?? record.event_type ?? record.eventType
			) || 'ride',
		hostGroupId: record.host_group_id ?? record.hostGroupId ?? '',
		status: nullableString(record.status) || 'draft',
		maxVolunteers: numberString(record.max_volunteers ?? record.maxVolunteers),
		requireSignupApproval: ensureBoolean(
			record.require_signup_approval ?? record.requireSignupApproval ?? false
		),
		waitlistEnabled: ensureBoolean(record.waitlist_enabled ?? record.waitlistEnabled ?? true),
		eventStart: toLocalDatetime(record.event_start ?? record.eventStart ?? ''),
		eventEnd: toLocalDatetime(record.event_end ?? record.eventEnd ?? ''),
		timezone: nullableString(record.timezone) || 'UTC',
		locationName: nullableString(record.location_name ?? record.locationName),
		locationAddress: nullableString(record.location_address ?? record.locationAddress),
		latitude: nullableString(record.latitude),
		longitude: nullableString(record.longitude),
		contactEmail: nullableString(record.contact_email ?? record.contactEmail),
		contactPhone: nullableString(record.contact_phone ?? record.contactPhone)
	};
}
export function buildEventUpdatePayload(patch) {
	const payload = {};
	if ('title' in patch) payload.title = stringOrNull(patch.title);
	if ('slug' in patch) payload.slug = stringOrNull(patch.slug);
	if ('summary' in patch) payload.summary = stringOrNull(patch.summary);
	if ('description' in patch) payload.description = stringOrNull(patch.description);
	if ('eventTypeSlug' in patch) payload.event_type_slug = stringOrNull(patch.eventTypeSlug);
	if ('hostGroupId' in patch) payload.host_group_id = stringOrNull(patch.hostGroupId);
	if ('status' in patch) payload.status = stringOrNull(patch.status);
	if ('maxVolunteers' in patch) payload.max_volunteers = numberOrNull(patch.maxVolunteers);
	if ('requireSignupApproval' in patch)
		payload.require_signup_approval = ensureBoolean(patch.requireSignupApproval);
	if ('waitlistEnabled' in patch) payload.waitlist_enabled = ensureBoolean(patch.waitlistEnabled);
	if ('eventStart' in patch) payload.event_start = toIso(patch.eventStart);
	if ('eventEnd' in patch) payload.event_end = toIso(patch.eventEnd);
	if ('timezone' in patch) payload.timezone = stringOrNull(patch.timezone);
	if ('locationName' in patch) payload.location_name = stringOrNull(patch.locationName);
	if ('locationAddress' in patch) payload.location_address = stringOrNull(patch.locationAddress);
	if ('latitude' in patch) payload.latitude = numberOrNull(patch.latitude);
	if ('longitude' in patch) payload.longitude = numberOrNull(patch.longitude);
	if ('contactEmail' in patch) payload.contact_email = stringOrNull(patch.contactEmail);
	if ('contactPhone' in patch) payload.contact_phone = stringOrNull(patch.contactPhone);
	return payload;
}
export function mapShiftRecordToFormDetails(record) {
	return {
		id: record.id ?? '',
		startsAt: toLocalDatetime(record.starts_at ?? record.startsAt ?? ''),
		endsAt: toLocalDatetime(record.ends_at ?? record.endsAt ?? ''),
		timezone: nullableString(record.timezone),
		capacity: numberString(record.capacity),
		locationName: nullableString(record.location_name ?? record.locationName),
		locationAddress: nullableString(record.location_address ?? record.locationAddress),
		notes: nullableString(record.notes)
	};
}
export function buildShiftPayload(patch, opportunityId) {
	const payload = {};
	if (opportunityId !== undefined) payload.opportunity_id = opportunityId;
	if ('startsAt' in patch) payload.starts_at = toIso(patch.startsAt);
	if ('endsAt' in patch) payload.ends_at = toIso(patch.endsAt);
	if ('timezone' in patch) payload.timezone = stringOrNull(patch.timezone);
	if ('capacity' in patch) payload.capacity = numberOrNull(patch.capacity);
	if ('locationName' in patch) payload.location_name = stringOrNull(patch.locationName);
	if ('locationAddress' in patch) payload.location_address = stringOrNull(patch.locationAddress);
	if ('notes' in patch) payload.notes = stringOrNull(patch.notes);
	return payload;
}
export function mapOpportunityRecordToFormDetails(record, shifts) {
	return {
		id: record.id ?? '',
		title: nullableString(record.title),
		description: nullableString(record.description),
		opportunityType: nullableString(
			record.opportunity_type ?? record.opportunityType ?? 'coordination'
		),
		requiresApproval: ensureBoolean(record.requires_approval ?? record.requiresApproval ?? false),
		autoConfirmAttendance: ensureBoolean(
			record.auto_confirm_attendance ?? record.autoConfirmAttendance ?? true
		),
		minVolunteers: numberString(record.min_volunteers ?? record.minVolunteers ?? 0),
		maxVolunteers: numberString(record.max_volunteers ?? record.maxVolunteers),
		waitlistLimit: numberString(record.waitlist_limit ?? record.waitlistLimit),
		locationName: nullableString(record.location_name ?? record.locationName),
		locationNotes: nullableString(record.location_notes ?? record.locationNotes),
		shifts: shifts.map((shift) => mapShiftRecordToFormDetails(shift))
	};
}
export function buildOpportunityPayload(patch, eventId) {
	const payload = {};
	if (eventId !== undefined) payload.event_id = eventId;
	if ('title' in patch) payload.title = stringOrNull(patch.title);
	if ('description' in patch) payload.description = stringOrNull(patch.description);
	if ('opportunityType' in patch) payload.opportunity_type = stringOrNull(patch.opportunityType);
	if ('requiresApproval' in patch)
		payload.requires_approval = ensureBoolean(patch.requiresApproval);
	if ('autoConfirmAttendance' in patch)
		payload.auto_confirm_attendance = ensureBoolean(patch.autoConfirmAttendance);
	if ('minVolunteers' in patch) payload.min_volunteers = numberOrNull(patch.minVolunteers) ?? 0;
	if ('maxVolunteers' in patch) payload.max_volunteers = numberOrNull(patch.maxVolunteers);
	if ('waitlistLimit' in patch) payload.waitlist_limit = numberOrNull(patch.waitlistLimit);
	if ('locationName' in patch) payload.location_name = stringOrNull(patch.locationName);
	if ('locationNotes' in patch) payload.location_notes = stringOrNull(patch.locationNotes);
	return payload;
}
function parseOptions(raw) {
	if (!raw) return null;
	const values = String(raw)
		.split(/\r?\n|,/)
		.map((value) => value.trim())
		.filter(Boolean);
	return values.length ? values : null;
}
export function mapQuestionRecordToFormDetails(record) {
	const options = record.options ?? record.options_list ?? [];
	const optionsArray = Array.isArray(options) ? options : [];
	return {
		id: record.id ?? '',
		opportunityId: record.opportunity_id ?? record.opportunityId ?? null,
		fieldKey: nullableString(record.field_key ?? record.fieldKey),
		label: nullableString(record.label),
		helpText: nullableString(record.help_text ?? record.helpText),
		fieldType: nullableString(record.field_type ?? record.fieldType) || 'text',
		isRequired: ensureBoolean(record.is_required ?? record.isRequired ?? false),
		optionsRaw: optionsArray.join('\n'),
		optionDraft: '',
		position: Number(record.position ?? 0)
	};
}
export function buildQuestionPayload(patch, eventId) {
	const payload = {};
	if (eventId !== undefined) payload.event_id = eventId;
	if ('opportunityId' in patch) payload.opportunity_id = patch.opportunityId ?? null;
	if ('fieldKey' in patch) payload.field_key = stringOrNull(patch.fieldKey);
	if ('label' in patch) payload.label = stringOrNull(patch.label);
	if ('helpText' in patch) payload.help_text = stringOrNull(patch.helpText);
	if ('fieldType' in patch) payload.field_type = stringOrNull(patch.fieldType);
	if ('isRequired' in patch) payload.is_required = ensureBoolean(patch.isRequired);
	if ('optionsRaw' in patch) payload.options = parseOptions(patch.optionsRaw);
	if ('position' in patch)
		payload.position = Number.isFinite(Number(patch.position)) ? Number(patch.position) : 0;
	return payload;
}
export function mapEmailRecordToFormDetails(record) {
	return {
		id: record.id ?? '',
		emailType: nullableString(record.email_type ?? record.emailType) || 'reminder',
		sendOffsetMinutes: Number(record.send_offset_minutes ?? record.sendOffsetMinutes ?? 0) || 0,
		subject: nullableString(record.subject),
                body: nullableString(record.body),
                requireConfirmation: ensureBoolean(
                        record.require_confirmation ?? record.requireConfirmation ?? false
                ),
                surveyUrl: nullableString(record.survey_url ?? record.surveyUrl),
                lastSentAt: nullableString(record.last_sent_at ?? record.lastSentAt),
                aiComposerOpen: false,
                aiPrompt: '',
                aiLoading: false,
                aiError: ''
        };
}
export function buildEmailPayload(patch, eventId) {
	const payload = {};
	if (eventId !== undefined) payload.event_id = eventId;
	if ('emailType' in patch) payload.email_type = stringOrNull(patch.emailType) ?? 'reminder';
	if ('sendOffsetMinutes' in patch)
		payload.send_offset_minutes = Number(patch.sendOffsetMinutes ?? 0) || 0;
	if ('subject' in patch) payload.subject = stringOrNull(patch.subject) ?? '';
	if ('body' in patch) payload.body = stringOrNull(patch.body) ?? '';
	if ('requireConfirmation' in patch)
		payload.require_confirmation = ensureBoolean(patch.requireConfirmation);
	if ('surveyUrl' in patch) payload.survey_url = stringOrNull(patch.surveyUrl);
	return payload;
}
export function ensureArray(value) {
	if (Array.isArray(value)) return value;
	if (value === null || value === undefined) return [];
	return [value];
}
export function ensureDefaultEmail(values) {
        if (values.length) return values;
        return [
                createEmailTemplate({
                        emailType: 'reminder',
                        sendOffsetMinutes: 2160,
                        subject: 'Reminder: {{event_title}} starts soon',
                        body: "We're excited to have you on the crew!\n\n{{event_details_block}}\n\n{{shift_details_block}}\n\n{{volunteer_portal_block}}",
                        requireConfirmation: false,
                        surveyUrl: ''
                })
        ];
}
export { toLocalDatetime, toIso, numberOrNull };
