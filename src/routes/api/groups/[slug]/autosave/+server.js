import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

const UPDATABLE_FIELDS = new Set([
	'name',
	'city',
	'state_region',
	'country',
	'tagline',
	'description',
	'website_url',
	'public_contact_email',
	'public_phone_number',
	'preferred_contact_method_instructions',
	'how_to_join_instructions',
	'specific_meeting_point_address',
	'latitude',
	'longitude',
	'service_area_description',
	'activity_frequency',
	'typical_activity_day_time',
	'membership_info',
	'logo_url',
	'cover_photo_url',
	'social_links',
	'preferred_cta_kind',
	'preferred_cta_label',
	'preferred_cta_url'
]);

export const POST = async ({ params, request }) => {
	const slug = params.slug;
	let payload = {};
	try {
		payload = await request.json();
	} catch {}

	const { data: group, error: ge } = await supabase
		.from('groups')
		.select('id')
		.eq('slug', slug)
		.single();
	if (ge || !group) return json({ ok: false, error: 'Group not found' }, { status: 404 });
	const group_id = group.id;

	const updates = {};
	for (const [k, v] of Object.entries(payload.fields || {})) {
		if (UPDATABLE_FIELDS.has(k)) updates[k] = v;
	}

	// Normalize preferred CTA
	if (Object.prototype.hasOwnProperty.call(updates, 'preferred_cta_kind')) {
		const kind = (updates.preferred_cta_kind || 'auto').toString();
		if (
			![
				'auto',
				'website',
				'email',
				'phone',
				'custom',
				'facebook',
				'instagram',
				'strava',
				'x',
				'tiktok'
			].includes(kind)
		) {
			updates.preferred_cta_kind = 'auto';
		} else {
			updates.preferred_cta_kind = kind;
		}
	}
	if (updates.preferred_cta_kind === 'custom') {
		if (typeof updates.preferred_cta_label === 'string') {
			updates.preferred_cta_label = updates.preferred_cta_label.slice(0, 10);
		} else {
			updates.preferred_cta_label = null;
		}
	} else {
		// Clear custom fields when not custom
		if (Object.prototype.hasOwnProperty.call(updates, 'preferred_cta_label'))
			updates.preferred_cta_label = null;
		if (Object.prototype.hasOwnProperty.call(updates, 'preferred_cta_url'))
			updates.preferred_cta_url = null;
	}

	// Handle cropped data URLs for logo / cover
	if (payload.logo_file_cropped) {
		const url = await uploadDataUrlToStorage(payload.logo_file_cropped, `groups/${group_id}/logo`);
		if (url) updates.logo_url = url;
	}
	if (payload.cover_file_cropped) {
		const url = await uploadDataUrlToStorage(
			payload.cover_file_cropped,
			`groups/${group_id}/cover`
		);
		if (url) updates.cover_photo_url = url;
	}

	if (Object.keys(updates).length) {
		const { error: upErr } = await supabase.from('groups').update(updates).eq('id', group_id);
		if (upErr) return json({ ok: false, error: upErr.message }, { status: 400 });
	}

	// Many-to-many replacements if provided
	const ops = [];
	const gt = payload.group_type_ids;
	const af = payload.audience_focus_ids;
	const rd = payload.riding_discipline_ids;
	const sl = payload.skill_level_ids;

	if (Array.isArray(gt)) {
		ops.push(supabase.from('group_x_group_types').delete().eq('group_id', group_id));
	}
	if (Array.isArray(af)) {
		ops.push(supabase.from('group_x_audience_focuses').delete().eq('group_id', group_id));
	}
	if (Array.isArray(rd)) {
		ops.push(supabase.from('group_x_riding_disciplines').delete().eq('group_id', group_id));
	}
	if (Array.isArray(sl)) {
		ops.push(supabase.from('group_x_skill_levels').delete().eq('group_id', group_id));
	}
	if (ops.length) {
		const delRes = await Promise.all(ops);
		const delErr = delRes.find((r) => r.error)?.error;
		if (delErr) return json({ ok: false, error: delErr.message }, { status: 400 });
	}

	const inserts = [];
	if (Array.isArray(gt) && gt.length) {
		inserts.push(
			supabase
				.from('group_x_group_types')
				.insert(gt.map((group_type_id) => ({ group_id, group_type_id })))
		);
	}
	if (Array.isArray(af) && af.length) {
		inserts.push(
			supabase
				.from('group_x_audience_focuses')
				.insert(af.map((audience_focus_id) => ({ group_id, audience_focus_id })))
		);
	}
	if (Array.isArray(rd) && rd.length) {
		inserts.push(
			supabase
				.from('group_x_riding_disciplines')
				.insert(rd.map((riding_discipline_id) => ({ group_id, riding_discipline_id })))
		);
	}
	if (Array.isArray(sl) && sl.length) {
		inserts.push(
			supabase
				.from('group_x_skill_levels')
				.insert(sl.map((skill_level_id) => ({ group_id, skill_level_id })))
		);
	}
	if (inserts.length) {
		const insRes = await Promise.all(inserts);
		const insErr = insRes.find((r) => r.error)?.error;
		if (insErr) return json({ ok: false, error: insErr.message }, { status: 400 });
	}

	return json({ ok: true, saved: { fields: Object.keys(updates), gt, af, rd, sl } });
};

function parseDataUrl(dataUrl) {
	if (!dataUrl || typeof dataUrl !== 'string') return null;
	const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
	if (!m) return null;
	const [, mime, b64] = m;
	try {
		const buf = Buffer.from(b64, 'base64');
		return { mime, buffer: buf };
	} catch {
		return null;
	}
}

async function uploadDataUrlToStorage(dataUrl, destBasePath) {
	const parsed = parseDataUrl(dataUrl);
	if (!parsed) return null;
	const { mime, buffer } = parsed;
	const ct = mime || 'image/jpeg';
	if (!ct.startsWith('image/')) return null;
	const ext = ct.includes('jpeg')
		? 'jpg'
		: ct.includes('png')
			? 'png'
			: ct.includes('webp')
				? 'webp'
				: 'img';
	const path = `${destBasePath}-${Date.now()}.${ext}`;
	const up = await supabase.storage
		.from('storage')
		.upload(path, buffer, { contentType: ct, upsert: true });
	if (up.error) return null;
	const { data } = supabase.storage.from('storage').getPublicUrl(path);
	return data?.publicUrl || null;
}
