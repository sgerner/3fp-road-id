import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { requireAiModel } from '$lib/server/ai/models';
import { sendEmail } from '$lib/services/email';
import { GROUP_ASSET_BUCKET } from '$lib/groups/assets';

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

function buildPriorityScore({
	hasEmail,
	hasSocial,
	completeness,
	lastContact,
	hasLogo,
	hasCoverPhoto,
	isLowPriority
}) {
	let score = 0;
	// Prioritize groups that are complete and have strong profile assets.
	score += completeness * 0.55;
	if (hasLogo) score += 18;
	if (hasCoverPhoto) score += 18;
	if (hasEmail) score += 16;
	if (hasSocial) score += 8;
	if (!lastContact) score += 6;
	if (isLowPriority) score -= 120;
	return Math.round(score);
}

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function stripCodeFences(value) {
	const text = cleanText(value, 100000);
	if (!text) return '';
	return text
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

function safeJsonParse(value) {
	const text = stripCodeFences(value);
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		const firstBrace = text.indexOf('{');
		const lastBrace = text.lastIndexOf('}');
		if (firstBrace >= 0 && lastBrace > firstBrace) {
			try {
				return JSON.parse(text.slice(firstBrace, lastBrace + 1));
			} catch {
				return null;
			}
		}
		return null;
	}
}

function removeEmDashes(value) {
	return cleanText(value).replace(/[—–]/g, '-');
}

function parseDataUrl(dataUrl) {
	const raw = cleanText(dataUrl, 5_000_000);
	const match = raw.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	const mimeType = cleanText(match[1], 100).toLowerCase();
	const base64 = match[2];
	const bytes = Buffer.from(base64, 'base64');
	if (!bytes.length) return null;
	return { mimeType, bytes };
}

function extForMime(mimeType) {
	if (mimeType === 'image/png') return '.png';
	if (mimeType === 'image/webp') return '.webp';
	return '.jpg';
}

async function uploadCroppedImage(serviceSupabase, groupId, field, dataUrl) {
	const parsed = parseDataUrl(dataUrl);
	if (!parsed) return null;
	const extension = extForMime(parsed.mimeType);
	const objectPath = `groups/${groupId}/outreach/${field}/${Date.now()}${extension}`;
	const { error: uploadError } = await serviceSupabase.storage
		.from(GROUP_ASSET_BUCKET)
		.upload(objectPath, parsed.bytes, {
			contentType: parsed.mimeType,
			upsert: false,
			cacheControl: '3600'
		});
	if (uploadError) throw new Error(uploadError.message);
	const { data: urlData } = serviceSupabase.storage
		.from(GROUP_ASSET_BUCKET)
		.getPublicUrl(objectPath);
	return urlData?.publicUrl || null;
}

export async function load({ cookies, url }) {
	await requireAdmin(cookies);

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		throw error(500, 'Service role key missing');
	}

	const status = url.searchParams.get('status') || 'all';
	const sort = url.searchParams.get('sort') || 'priority';
	const q = (url.searchParams.get('q') || '').trim().toLowerCase();
	const contact = url.searchParams.get('contact') || 'all';
	const minCompleteness = Number.parseInt(url.searchParams.get('min_completeness') || '0', 10) || 0;

	const [
		{ data: groups, error: groupsError },
		{ data: owners, error: ownersError },
		{ data: enrichments },
		{ data: outreachHistory }
	] = await Promise.all([
		supabase.from('groups').select('*').order('created_at', { ascending: false }),
		supabase.from('group_members').select('group_id').eq('role', 'owner'),
		supabase.from('group_enrichment').select('*'),
		supabase
			.from('group_outreach')
			.select('group_id, contacted_at, contact_method, message_content')
			.order('contacted_at', { ascending: false })
	]);

	if (groupsError) throw error(500, groupsError.message);
	if (ownersError) throw error(500, ownersError.message);

	const claimedSet = new Set((owners || []).map((o) => o.group_id).filter(Boolean));
	const enrichmentMap = new Map((enrichments || []).map((e) => [e.group_id, e]));
	const outreachMap = new Map();
	(outreachHistory || []).forEach((o) => {
		if (!outreachMap.has(o.group_id)) outreachMap.set(o.group_id, []);
		outreachMap.get(o.group_id).push(o);
	});

	const processedGroups = (groups || [])
		.filter((g) => !claimedSet.has(g.id))
		.map((g) => {
			const completeness = calculateCompleteness(g);
			const enrichment = enrichmentMap.get(g.id) || null;
			const history = outreachMap.get(g.id) || [];
			const lastContact = history.length ? history[0] : null;
			const hasEmail = Boolean(g.public_contact_email);
			const socialLinks = g.social_links || {};
			const hasSocial = Object.values(socialLinks).some(Boolean);
			const contactsCount =
				(hasEmail ? 1 : 0) + Object.values(socialLinks).filter((value) => Boolean(value)).length;
			const outreachStatus = enrichment?.outreach_status || 'pending';
			const hasLogo = Boolean(g.logo_url);
			const hasCoverPhoto = Boolean(g.cover_photo_url);
			const isLowPriority = Boolean(enrichment?.enrichment_data?.outreach?.low_priority);

			return {
				id: g.id,
				name: g.name,
				slug: g.slug,
				tagline: g.tagline,
				description: g.description,
				city: g.city,
				state_region: g.state_region,
				website_url: g.website_url,
				logo_url: g.logo_url,
				cover_photo_url: g.cover_photo_url,
				public_contact_email: g.public_contact_email,
				social_links: g.social_links,
				completeness,
				enrichment,
				last_contact: lastContact,
				outreach_status: outreachStatus,
				has_email: hasEmail,
				has_social: hasSocial,
				contacts_count: contactsCount,
				priority_score: buildPriorityScore({
					hasEmail,
					hasSocial,
					completeness,
					lastContact,
					hasLogo,
					hasCoverPhoto,
					isLowPriority
				}),
				is_low_priority: isLowPriority,
				has_logo: hasLogo,
				has_cover_photo: hasCoverPhoto,
				claim_url: `https://3fp.org/groups/${g.slug}/claim`,
				outreach_count: history.length,
				outreach_history: history.slice(0, 8),
				recent_contact_methods: [
					...new Set(history.map((item) => item.contact_method).filter(Boolean))
				].slice(0, 3)
			};
		});

	let filtered = processedGroups;
	if (status !== 'all') filtered = filtered.filter((g) => g.outreach_status === status);
	if (q) {
		filtered = filtered.filter((g) => {
			const haystack =
				`${g.name || ''} ${g.city || ''} ${g.state_region || ''} ${g.slug || ''}`.toLowerCase();
			return haystack.includes(q);
		});
	}
	if (contact === 'email') filtered = filtered.filter((g) => g.has_email);
	else if (contact === 'social') filtered = filtered.filter((g) => g.has_social);
	else if (contact === 'none') filtered = filtered.filter((g) => !g.has_email && !g.has_social);
	if (minCompleteness > 0) filtered = filtered.filter((g) => g.completeness >= minCompleteness);

	if (sort === 'priority') {
		filtered.sort((a, b) => b.priority_score - a.priority_score || b.completeness - a.completeness);
	} else if (sort === 'completeness') {
		filtered.sort((a, b) => b.completeness - a.completeness);
	} else if (sort === 'newest') {
		filtered.sort(
			(a, b) =>
				new Date(b.enrichment?.created_at || b.last_contact?.contacted_at || 0) -
				new Date(a.enrichment?.created_at || a.last_contact?.contacted_at || 0)
		);
	} else if (sort === 'stale') {
		filtered.sort(
			(a, b) =>
				new Date(a.last_contact?.contacted_at || 0) - new Date(b.last_contact?.contacted_at || 0)
		);
	}

	const stats = {
		pending: filtered.filter((g) => g.outreach_status === 'pending').length,
		contacted: filtered.filter((g) => g.outreach_status === 'contacted').length,
		withContacts: filtered.filter((g) => g.contacts_count > 0).length,
		neverContacted: filtered.filter((g) => !g.last_contact).length,
		avgCompleteness: filtered.length
			? Math.round(filtered.reduce((acc, g) => acc + g.completeness, 0) / filtered.length)
			: 0
	};

	return {
		groups: filtered,
		total: filtered.length,
		status,
		sort,
		q,
		contact,
		minCompleteness,
		stats
	};
}

export const actions = {
	generate: async ({ request, cookies }) => {
		const { user, supabase: requestSupabase } = await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		const method = formData.get('method') || 'email';
		if (!groupId) return fail(400, { error: 'Missing group id' });

		const supabase = createServiceSupabaseClient();
		const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single();
		if (!group) return fail(404, { error: 'Group not found', selectedGroupId: groupId });
		const { data: profile } = await requestSupabase
			.from('profiles')
			.select('full_name,email')
			.eq('user_id', user.id)
			.maybeSingle();
		const senderName =
			cleanText(profile?.full_name || profile?.email || user?.email, 140) || 'a teammate';
		const location =
			[group.city, group.state_region].filter(Boolean).join(', ') || 'your community';

		const ai = requireAiModel('group_enrichment');
		const prompt = `Write a short, realistic outreach message from a real human at 3 Feet Please.

Audience: organizers of "${group.name}".

Primary goal: encourage the group owner to claim or check their 3FP directory page so cyclists who find it get accurate, useful information.

Important framing:
- Focus on the benefit to individual cyclists and potential riders first.
- The message should feel like: "We want people looking for a ride near you to find the right info."
- Do not make the message feel like a sales pitch, platform pitch, marketing email, or fundraising message.
- Do not over-explain 3FP.
- Do not list features like a brochure.
- Do not pretend we know the group personally or know anything beyond the provided data.

Tone:
- Human, modest, practical, and warm.
- Like one volunteer cyclist writing a useful note to another group organizer.
- Short, focused, approachable.
- No hype, slogans, generic praise, fake flattery, or bike puns.
- Every message should be unique in wording and structure.

Length:
- 90-140 words.
- Prefer 2 or 3 short paragraphs.
- Use plain language.

Must include naturally:
- Sender context: "I'm ${senderName} from 3 Feet Please..."
- 3FP is a volunteer-powered nonprofit that helps cyclists find local groups and rides and works to make roads safer.
- Someone added "${group.name}" to the 3FP directory.
- Mention "${location}" only as the directory location. Do not imply personal knowledge of the group's work there.
- Ask them to check whether the profile and upcoming rides are accurate.
- Group page URL: https://3fp.org/groups/${group.slug}
- Mention that claiming the page is free.
- Try hard to mention 2 or 3 relevant benefits for the group in claiming the page, described by user benefit, not feature name.

Choose 2 or 3 benefits from this list when they fit naturally:
- keep public group details up to date
- add or update upcoming rides
- give new riders a simple page to learn about the group
- send updates or announcements to members
- manage signups, memberships, donations, or volunteer events
- organize photos, files, links, or reusable group materials
- schedule social posts or reply to messages

Good examples of concrete benefits to mention when relevant:
- free email newsletter for member updates, similar to Mailchimp
- membership management
- easily accept donations
- social media scheduling

Optional:
- It is okay to say the tools came from our experience helping run local bike groups in Phoenix and the Bay Area, but only if it fits naturally and does not make the message longer or more self-focused.

Closing:
- End with one short sentence inviting corrections, questions, or feedback.

Subject line:
- Write a short, specific subject line that gives the recipient a real reason to open the email.
- Make it clear this is about their group's 3FP page or ride information.
- Keep it useful, human, and moderately interesting, not clever or salesy.
- Prefer concrete context like the group name, ride info, or directory accuracy.
- Avoid vague subjects like "${group.name} directory page".
- Avoid spammy or marketing-style wording, urgency tricks, or excessive punctuation.

Do not:
- Say or imply we know the group personally.
- Compliment the group beyond a simple thanks.
- Claim personal familiarity, shared rides, or local knowledge.
- Include a bike pun.
- Use em dashes or en dashes. Use regular hyphens only.
- Use feature labels like "Edit Profile", "Membership", or "Social Media" unless absolutely necessary.
- Use phrases like "powerful tools", "grow your audience", "boost engagement", "unlock", "leverage", or "platform".

Return ONLY valid JSON in this exact shape:
{
  "subject": "short subject line without the word Subject",
  "body": "message body without a subject prefix"
}
Do not wrap in markdown or code fences.`;

		const response = await ai.client.generateContent({
			model: ai.model.model,
			contents: [prompt]
		});

		let responseText = response.text ?? '';
		if (typeof responseText === 'function') responseText = responseText();
		const parsed = safeJsonParse(responseText) || {};
		const generatedSubject = removeEmDashes(
			parsed.subject || `Quick hello from 3 Feet Please for ${group.name}`
		).slice(0, 300);
		const generatedMessage = removeEmDashes(parsed.body || responseText).slice(0, 12000);
		return { success: true, generatedMessage, generatedSubject, selectedGroupId: groupId };
	},

	log: async ({ request, cookies }) => {
		const { user } = await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		const method = formData.get('method');
		const content = formData.get('content');
		if (!groupId || !method)
			return fail(400, { error: 'Missing outreach details', selectedGroupId: groupId });

		const supabase = createServiceSupabaseClient();
		const { error: logError } = await supabase.from('group_outreach').insert({
			group_id: groupId,
			contacted_by: user.id,
			contact_method: method,
			message_content: content || null,
			contacted_at: new Date().toISOString()
		});
		if (logError) return fail(500, { error: logError.message, selectedGroupId: groupId });

		await supabase.from('group_enrichment').upsert({
			group_id: groupId,
			outreach_status: 'contacted'
		});

		return { success: true, selectedGroupId: groupId };
	},

	enrich: async ({ request, cookies, fetch }) => {
		await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		if (!groupId) return fail(400, { error: 'Missing group id' });

		const supabase = createServiceSupabaseClient();
		const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single();
		if (!group) return fail(404, { error: 'Group not found', selectedGroupId: groupId });

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
			return fail(res.status, {
				error: err.error || 'Deep enrichment failed',
				selectedGroupId: groupId
			});
		}
		const enrichedData = await res.json();
		const { error: updateError } = await supabase.from('group_enrichment').upsert({
			group_id: groupId,
			last_enriched_at: new Date().toISOString(),
			enrichment_data: enrichedData,
			completeness_score: calculateCompleteness({ ...group, ...(enrichedData?.fields || {}) }) / 100
		});
		if (updateError) return fail(500, { error: updateError.message, selectedGroupId: groupId });
		return { success: true, selectedGroupId: groupId };
	},

	updateAssets: async ({ request, cookies }) => {
		await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		const hasLogoUrl = formData.has('logo_url');
		const hasCoverUrl = formData.has('cover_photo_url');
		const hasLogoCrop = formData.has('logo_file_cropped');
		const hasCoverCrop = formData.has('cover_file_cropped');
		const logoUrl = (formData.get('logo_url') || '').toString().trim();
		const coverPhotoUrl = (formData.get('cover_photo_url') || '').toString().trim();
		const logoFileCropped = (formData.get('logo_file_cropped') || '').toString();
		const coverFileCropped = (formData.get('cover_file_cropped') || '').toString();
		if (!groupId) return fail(400, { error: 'Missing group id' });

		const payload = {};
		const supabase = createServiceSupabaseClient();
		if (hasLogoCrop || hasLogoUrl) {
			if (logoFileCropped)
				payload.logo_url = await uploadCroppedImage(supabase, groupId, 'logo', logoFileCropped);
			else payload.logo_url = logoUrl || null;
		}
		if (hasCoverCrop || hasCoverUrl) {
			if (coverFileCropped)
				payload.cover_photo_url = await uploadCroppedImage(
					supabase,
					groupId,
					'cover',
					coverFileCropped
				);
			else payload.cover_photo_url = coverPhotoUrl || null;
		}
		const { error: updateError } = await supabase.from('groups').update(payload).eq('id', groupId);
		if (updateError) return fail(500, { error: updateError.message, selectedGroupId: groupId });
		return { success: true, selectedGroupId: groupId };
	},

	toggleLowPriority: async ({ request, cookies }) => {
		await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		const value = formData.get('value') === 'true';
		if (!groupId) return fail(400, { error: 'Missing group id' });
		const supabase = createServiceSupabaseClient();
		const { data: current } = await supabase
			.from('group_enrichment')
			.select('enrichment_data')
			.eq('group_id', groupId)
			.maybeSingle();
		const enrichmentData =
			current?.enrichment_data && typeof current.enrichment_data === 'object'
				? current.enrichment_data
				: {};
		const nextEnrichmentData = {
			...enrichmentData,
			outreach: {
				...(enrichmentData.outreach || {}),
				low_priority: value
			}
		};
		const { error: upsertError } = await supabase.from('group_enrichment').upsert({
			group_id: groupId,
			enrichment_data: nextEnrichmentData
		});
		if (upsertError) return fail(500, { error: upsertError.message, selectedGroupId: groupId });
		return { success: true, selectedGroupId: groupId };
	},

	sendMessage: async ({ request, cookies, fetch }) => {
		const { user } = await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		const subject = (formData.get('subject') || '').toString().trim();
		const content = (formData.get('content') || '').toString().trim();
		if (!groupId || !content) return fail(400, { error: 'Missing group id or message content' });

		const supabase = createServiceSupabaseClient();
		const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single();
		if (!group) return fail(404, { error: 'Group not found', selectedGroupId: groupId });
		if (!group.public_contact_email) {
			return fail(400, {
				error: 'This group has no public contact email.',
				selectedGroupId: groupId
			});
		}

		let emailSent = false;
		if (group.public_contact_email) {
			const html = content
				.split('\n')
				.map(
					(line) =>
						`<p style="margin:0 0 12px 0;">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
				)
				.join('');
			await sendEmail(
				{
					to: group.public_contact_email,
					subject: subject || `Quick hello from 3 Feet Please for ${group.name}`,
					text: content,
					html,
					replyTo: 'hi@3fp.org',
					tags: [{ Name: 'context', Value: 'admin-outreach' }],
					branding: {
						category: 'Group Outreach',
						recipientReason: `Admin outreach to ${group.name}`,
						actionUrl: `https://3fp.org/groups/${group.slug}/claim`,
						actionLabel: 'Claim Group'
					}
				},
				{ fetch }
			);
			emailSent = true;
		}

		await supabase.from('group_outreach').insert({
			group_id: groupId,
			contacted_by: user.id,
			contact_method: emailSent ? 'email' : 'manual_social',
			message_content: content,
			contacted_at: new Date().toISOString()
		});
		await supabase.from('group_enrichment').upsert({
			group_id: groupId,
			outreach_status: 'contacted'
		});

		return {
			success: true,
			selectedGroupId: groupId,
			emailSent
		};
	},

	deleteGroup: async ({ request, cookies }) => {
		await requireAdmin(cookies);
		const formData = await request.formData();
		const groupId = formData.get('group_id');
		if (!groupId) return fail(400, { error: 'Missing group id' });
		const supabase = createServiceSupabaseClient();
		await supabase.from('group_outreach').delete().eq('group_id', groupId);
		await supabase.from('group_enrichment').delete().eq('group_id', groupId);
		await supabase.from('group_members').delete().eq('group_id', groupId);
		const { error: deleteError } = await supabase.from('groups').delete().eq('id', groupId);
		if (deleteError) return fail(500, { error: deleteError.message });
		return { success: true, deletedGroupId: groupId, selectedGroupId: null };
	}
};
