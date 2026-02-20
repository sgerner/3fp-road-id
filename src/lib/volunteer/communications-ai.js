import { VOLUNTEER_MERGE_TAGS } from '$lib/volunteer/merge-tags';

function cloneWithFallback(value) {
	try {
		return structuredClone(value);
	} catch (error) {
		try {
			return JSON.parse(JSON.stringify(value));
		} catch {
			return value;
		}
	}
}

function normalizeMetadata(metadata = {}) {
	const clone = cloneWithFallback(metadata) ?? {};
	const locationAddress =
		clone.locationAddress ??
		clone.location_address ??
		clone.locationNotes ??
		clone.location_notes ??
		'';
	const locationNotes = clone.locationNotes ?? clone.location_notes ?? '';
	if (!clone.location_notes) {
		clone.location_notes = locationNotes || locationAddress || '';
	}
	if (!clone.location_address) {
		clone.location_address = locationAddress || locationNotes || '';
	}
	return clone;
}

function formatMergeTagsForPrompt(mergeTags = VOLUNTEER_MERGE_TAGS) {
	return mergeTags
		.map((entry) => {
			if (!entry) return null;
			if (typeof entry === 'string') {
				return `- ${entry}: Merge field for volunteer communications.`;
			}
			const token = entry.token ?? '';
			if (!token) return null;
			const label = entry.label ? ` (${entry.label})` : '';
			const description = entry.description ? entry.description.trim() : '';
			const safeDescription = description || 'Merge field for volunteer communications.';
			return `- ${token}${label}: ${safeDescription}`;
		})
		.filter(Boolean)
		.join('\n');
}

function resolveMergeTagTokens(mergeTags = VOLUNTEER_MERGE_TAGS) {
	return Array.from(
		new Set(
			mergeTags
				.map((entry) => {
					if (!entry) return null;
					return typeof entry === 'string' ? entry : entry.token;
				})
				.filter(Boolean)
		)
	);
}

export function buildVolunteerCommunicationsContextSnapshot({
	eventDetails = {},
	opportunities = [],
	customQuestions = [],
	eventEmails = [],
	eventTypeOptions = [],
	opportunityTypeOptions = [],
	mergeTags = VOLUNTEER_MERGE_TAGS
} = {}) {
	const tokens = resolveMergeTagTokens(mergeTags);
	const metadata = normalizeMetadata(eventDetails);
	return {
		metadata,
		opportunities: cloneWithFallback(opportunities),
		custom_questions: cloneWithFallback(customQuestions),
		emails: cloneWithFallback(eventEmails),
		event_type_options: cloneWithFallback(eventTypeOptions),
		opportunity_type_options: cloneWithFallback(opportunityTypeOptions),
		email_merge_tags: cloneWithFallback(tokens)
	};
}

export function createVolunteerEmailComposer({
	fetchFn = fetch,
	getEmails,
	updateEmailTemplate,
	buildContextSnapshot,
	eventTypeOptions = [],
	opportunityTypeOptions = [],
	mergeTags = VOLUNTEER_MERGE_TAGS
} = {}) {
	const mergeTagTokens = resolveMergeTagTokens(mergeTags);
	const mergeTagPrompt = formatMergeTagsForPrompt(mergeTags);

	function extractEmailDraft(payload) {
		if (!payload || typeof payload !== 'object') return null;

		const draftFromArray = (() => {
			if (Array.isArray(payload?.draft?.emails) && payload.draft.emails.length) {
				return payload.draft.emails[0];
			}
			if (Array.isArray(payload?.emails) && payload.emails.length) {
				return payload.emails[0];
			}
			return null;
		})();

		if (draftFromArray) return draftFromArray;

		const candidate = payload?.draft && typeof payload.draft === 'object' ? payload.draft : payload;
		if (!candidate || typeof candidate !== 'object') return null;

		const subject =
			candidate.subject ??
			candidate.emailSubject ??
			candidate.title ??
			candidate.email_title ??
			null;
		const body =
			candidate.body ?? candidate.emailBody ?? candidate.content ?? candidate.email_body ?? null;

		if (!subject && !body) return null;

		return { subject, body };
	}

	return async function composeEmailWithAi(emailId) {
		const emails = typeof getEmails === 'function' ? getEmails() : getEmails;
		if (!Array.isArray(emails) || !emails.length) return;
		const target = emails.find((email) => email?.id === emailId);
		if (!target) return;
		const prompt = target.aiPrompt?.trim();
		if (!prompt) return;

		updateEmailTemplate?.(emailId, { aiLoading: true, aiError: '' });

		const friendlyType = (target.emailType || 'volunteer')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		const messageParts = [
			`Compose a ${friendlyType} volunteer email.`,
			prompt,
			mergeTagPrompt ? `Available merge tags:\n${mergeTagPrompt}` : null
		].filter(Boolean);

		try {
			const response = await fetchFn('/api/ai/volunteer-event-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [
						{
							role: 'user',
							content: messageParts.join('\n\n')
						}
					],
					context: buildContextSnapshot?.() ?? null,
					event_type_options: eventTypeOptions,
					opportunity_type_options: opportunityTypeOptions,
					email_merge_tags: mergeTagTokens,
					goal: `Generate subject and body copy for a ${friendlyType} volunteer email template.`,
					constraints: [
						'Keep the output focused on an email subject and body.',
						'Use the merge tags and blocks (e.g. {{event_details_block}}, {{shift_details_block}}, {{volunteer_portal_block}}, {{shift_confirmation_block}} when confirmations are required) to personalise details.',
						'Aim for clear, encouraging language suitable for community volunteers.'
					],
					preferDraft: true
				})
			});

			if (!response.ok) {
				const info = await response.json().catch(() => ({}));
				throw new Error(info.error || response.statusText || 'AI request failed');
			}

			const payload = await response.json();
			const generated = extractEmailDraft(payload);
			if (generated) {
				updateEmailTemplate?.(emailId, {
					subject: generated.subject || target.subject || '',
					body: generated.body || target.body || '',
					aiPrompt: '',
					aiComposerOpen: false,
					aiLoading: false,
					aiError: ''
				});
				return;
			}

			updateEmailTemplate?.(emailId, {
				aiError: 'No email content returned. Add more detail and try again.',
				aiLoading: false
			});
		} catch (error) {
			updateEmailTemplate?.(emailId, {
				aiError: error?.message || 'Unable to compose email right now.',
				aiLoading: false
			});
		}
	};
}
