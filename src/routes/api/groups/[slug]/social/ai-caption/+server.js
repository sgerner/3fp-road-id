import { json } from '@sveltejs/kit';
import { generateGroupSocialCaptionDraft } from '$lib/server/social/ai';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { normalizePlatforms, normalizePostTarget } from '$lib/server/social/types';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizeConversationMessages(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => ({
			role: cleanText(entry?.role, 20).toLowerCase(),
			content: cleanText(entry?.content, 1200)
		}))
		.filter((entry) => (entry.role === 'user' || entry.role === 'assistant') && entry.content)
		.slice(-10);
}

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const payload = await request.json().catch(() => ({}));
		const rideDetails = cleanText(payload.ride_details, 800);
		const eventTitle = cleanText(payload.event_title, 200);
		const normalizedEventTitle =
			eventTitle && rideDetails && eventTitle.toLowerCase() === rideDetails.toLowerCase()
				? ''
				: eventTitle;
		const input = {
			source_prompt: cleanText(payload.source_prompt, 800),
			group_name: auth.group.name,
			event_title: normalizedEventTitle,
			event_datetime: cleanText(payload.event_datetime, 200),
			event_location: cleanText(payload.event_location, 240),
			ride_details: rideDetails,
			advocacy_details: cleanText(payload.advocacy_details, 800),
			existing_caption: cleanText(payload.existing_caption, 4000),
			target_tone: cleanText(payload.target_tone, 600),
			post_target: normalizePostTarget(payload.post_target),
			platforms: normalizePlatforms(payload.platforms),
			call_to_action: cleanText(payload.call_to_action, 400),
			hashtags: cleanText(payload.hashtags, 240),
			conversation_messages: normalizeConversationMessages(payload.conversation_messages)
		};

		const result = await generateGroupSocialCaptionDraft(input);
		if (!result.ok) {
			return json({ error: result.error || 'Unable to generate caption.' }, { status: 503 });
		}

		return json({ data: { caption: result.caption, ai_prompt: result.prompt } });
	} catch (error) {
		console.error('Unable to generate group social caption', error);
		return json({ error: error?.message || 'Unable to generate caption.' }, { status: 500 });
	}
}
