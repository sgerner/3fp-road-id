import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { requireAiModel } from '$lib/server/ai/models';

const ALL_FIELD_KEYS = [
	'name',
	'tagline',
	'description',
	'city',
	'state_region',
	'country',
	'website_url',
	'public_contact_email',
	'public_phone_number',
	'preferred_contact_method_instructions',
	'how_to_join_instructions',
	'membership_info',
	'specific_meeting_point_address',
	'service_area_description',
	'skill_levels_description',
	'activity_frequency',
	'typical_activity_day_time',
	'logo_url',
	'cover_photo_url'
];

function calculateCompleteness(group) {
	let filledCount = 0;
	for (const key of ALL_FIELD_KEYS) {
		if (group[key] != null && group[key] !== '') {
			filledCount++;
		}
	}
	const socialLinks = group.social_links || {};
	const hasSocial = Object.values(socialLinks).some((v) => v != null && v !== '');
	if (hasSocial) filledCount++;
	return Math.round((filledCount / (ALL_FIELD_KEYS.length + 1)) * 100);
}

export async function load({ params, cookies, fetch }) {
	const { supabase } = await requireAdmin(cookies);
	const { id } = params;

	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*, enrichment:group_enrichment(*)')
		.eq('id', id)
		.single();

	if (groupError || !group) {
		throw error(404, 'Group not found');
	}

	const { data: outreachHistory, error: historyError } = await supabase
		.from('group_outreach')
		.select('*')
		.eq('group_id', id)
		.order('contacted_at', { ascending: false });

	return {
		group: {
			...group,
			completeness: calculateCompleteness(group),
			enrichment: group.enrichment?.[0] || null
		},
		outreachHistory: outreachHistory || []
	};
}

export const actions = {
	enrich: async ({ params, fetch, cookies }) => {
		await requireAdmin(cookies);
		const { id } = params;

		// 1. Fetch group details for enrichment
		const supabase = createServiceSupabaseClient();
		const { data: group } = await supabase.from('groups').select('*').eq('id', id).single();

		if (!group) return fail(404, { error: 'Group not found' });

		// 2. Call the existing enrichment API
		const res = await fetch('/api/ai/enrich-group', {
			method: 'POST',
			body: JSON.stringify({
				name: group.name,
				website: group.website_url,
				instagram: group.social_links?.instagram,
				facebook: group.social_links?.facebook,
				existing_profile: { fields: group }
			})
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return fail(res.status, { error: err.error || 'Enrichment failed' });
		}

		const enrichedData = await res.json();

		// 3. Update the enrichment table
		const { error: updateError } = await supabase.from('group_enrichment').upsert({
			group_id: id,
			last_enriched_at: new Date().toISOString(),
			enrichment_data: enrichedData,
			completeness_score: calculateCompleteness({ ...group, ...enrichedData.fields }) / 100
		});

		if (updateError) return fail(500, { error: updateError.message });

		return { success: true };
	},

	generate: async ({ params, request, cookies }) => {
		const { user } = await requireAdmin(cookies);
		const { id } = params;
		const formData = await request.formData();
		const method = formData.get('method') || 'email';

		const supabase = createServiceSupabaseClient();
		const { data: group } = await supabase.from('groups').select('*').eq('id', id).single();

		if (!group) return fail(404, { error: 'Group not found' });

		const ai = requireAiModel('group_enrichment');

		const prompt = `You are an outreach coordinator for 3fp.org (The Free Flight Federation), a platform for cycling groups.
Write a deeply personalized, high-signal, non-spammy ${method} invite to ${group.name}.
Target: The group organizer.
Goal: Invite them to claim their group on 3fp.org to keep their details up-to-date and reach more cyclists.
USP of 3fp.org: Free tools for ride management, volunteer organizing, and a beautiful microsite.

Context about the group:
- Name: ${group.name}
- Location: ${group.city}, ${group.state_region}
- Tagline: ${group.tagline || 'N/A'}
- Description: ${group.description || 'N/A'}
- Socials: ${JSON.stringify(group.social_links)}

Rules:
- DO NOT be generic. Mention their specific location or mission.
- Write from their perspective: "We saw what you're doing in ${group.city} and wanted to help you scale your impact."
- Be concise. No "I hope this email finds you well."
- Use a friendly, peer-to-peer cycling vibe.
- ${method === 'email' ? 'Include a punchy subject line.' : 'Keep it short for a DM.'}
- The call to action is to visit: https://3fp.org/groups/${group.slug}/claim

Return ONLY the message content.`;

		const response = await ai.client.generateContent({
			model: ai.model.model,
			contents: [prompt]
		});

		let text = response.text ?? '';
		if (typeof text === 'function') text = text();

		return { success: true, generatedMessage: text };
	},

	log: async ({ params, request, cookies }) => {
		const { user } = await requireAdmin(cookies);
		const { id } = params;
		const formData = await request.formData();
		const method = formData.get('method');
		const content = formData.get('content');

		const supabase = createServiceSupabaseClient();

		const { error: logError } = await supabase.from('group_outreach').insert({
			group_id: id,
			contacted_by: user.id,
			contact_method: method,
			message_content: content,
			contacted_at: new Date().toISOString()
		});

		if (logError) return fail(500, { error: logError.message });

		// Update enrichment status
		await supabase.from('group_enrichment').upsert({
			group_id: id,
			outreach_status: 'contacted'
		});

		return { success: true };
	}
};
