import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';
import { optimizeImageForStorage } from '#lib/server/storageImages';
import {
	parseGroupEditorImageDataUrl,
	uploadGroupEditorImageDataUrl
} from '#lib/server/groupEditorImages';
import { mirrorRemoteImageToStorage as mirrorPreparedRemoteImage } from '#lib/server/remoteImages';
import { readFormData } from '#lib/server/security';
import { collectGroupSocialLinkInputs } from '#lib/groups/socialLinks';
import { fail, redirect } from '@sveltejs/kit';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * @param {any} supabase
 * @param {any} remoteUrl
 * @param {any} destBasePath
 */
async function mirrorRemoteImageToStorage(supabase, remoteUrl, destBasePath) {
	try {
		return await mirrorPreparedRemoteImage(supabase, remoteUrl, destBasePath, {
			maxBytes: MAX_BYTES,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
	} catch {
		return null;
	}
}

/**
 * @param {any} supabase
 * @param {any} file
 * @param {any} destBasePath
 */
async function uploadLocalImageToStorage(supabase, file, destBasePath) {
	try {
		if (!file || typeof file.arrayBuffer !== 'function') return null;
		const ct = file.type || 'application/octet-stream';
		if (!ct.startsWith('image/')) return null;
		const optimized = await optimizeImageForStorage(Buffer.from(await file.arrayBuffer()), {
			contentType: ct,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
		const objectPath = `${destBasePath}.${optimized.extension}`;
		const up = await supabase.storage.from('storage').upload(objectPath, optimized.buffer, {
			contentType: optimized.contentType,
			upsert: true
		});
		if (up.error) return null;
		const { data } = supabase.storage.from('storage').getPublicUrl(objectPath);
		return data?.publicUrl || null;
	} catch {
		return null;
	}
}

/**
 * @param {any} param0
 */
async function resolveGroupEditorContext({ params, cookies }) {
	const slug = params.slug;

	// Require authenticated user
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, response: fail(401, { error: 'Authentication required.' }) };
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group, error: ge } = await supabase
		.from('groups')
		.select('id, slug, logo_url, cover_photo_url, is_published')
		.eq('slug', slug)
		.single();
	if (ge || !group) {
		return { ok: false, response: fail(404, { error: 'Group not found' }) };
	}

	// Admin or owner can proceed
	let isAdmin = false;
	try {
		const { data: prof } = await supabase
			.from('profiles')
			.select('user_id, email, admin')
			.eq('user_id', user.id)
			.maybeSingle();
		isAdmin = !!prof?.admin;
	} catch {
		// ignore
	}
	if (!isAdmin) {
		const { data: ownerRows } = await supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('role', 'owner')
			.eq('user_id', user.id);
		if (!ownerRows || ownerRows.length === 0) {
			return {
				ok: false,
				response: fail(403, { error: 'You do not have permission to edit this group.' })
			};
		}
	}

	return { ok: true, slug, group, group_id: group.id, user_id: user.id, isAdmin, supabase };
}

export const load = async ({ params, cookies, url }) => {
	const slug = params.slug;

	// Require authenticated user
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		const returnTo = `${url.pathname}${url.search}`;
		throw redirect(303, `/groups/${slug}?auth=required&returnTo=${encodeURIComponent(returnTo)}`);
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const privateSupabase = createServiceSupabaseClient() || supabase;
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.single();
	if (groupError) return { error: groupError.message };

	// Admin or Ownership check
	let isAdmin = false;
	/** @type {any} */
	let profileRow = null;
	try {
		const { data: prof } = await supabase
			.from('profiles')
			.select('user_id, email, admin')
			.eq('user_id', user.id)
			.maybeSingle();
		profileRow = prof || null;
		isAdmin = !!prof?.admin;
	} catch (e) {
		// ignore
	}

	if (!isAdmin) {
		const { data: ownerRows, error: ownerErr } = await supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('role', 'owner')
			.eq('user_id', user.id);
		if (ownerErr) throw redirect(303, `/groups/${slug}`);
		if (!ownerRows || ownerRows.length === 0) throw redirect(303, `/groups/${slug}?auth=forbidden`);
	}

	// Fetch all owners for display
	const { data: allOwners, error: allOwnersErr } = await supabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', group.id)
		.eq('role', 'owner');
	if (allOwnersErr) {
		return { error: allOwnersErr.message };
	}

	// Fetch emails for owners from profiles mapping
	const ownerIds = (allOwners ?? []).map((r) => r.user_id);
	/** @type {any} */
	let ownerEmails = [];
	if (ownerIds.length) {
		const { data: emailsData } = await privateSupabase
			.from('profiles')
			.select('user_id, email')
			.in('user_id', ownerIds);
		ownerEmails = emailsData || [];
	}

	const [gt, af, rd, sl, gx, ax, rx, sx] = await Promise.all([
		supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name'),
		supabase.from('skill_levels').select('id, name').order('name'),
		supabase.from('group_x_group_types').select('group_type_id').eq('group_id', group.id),
		supabase.from('group_x_audience_focuses').select('audience_focus_id').eq('group_id', group.id),
		supabase
			.from('group_x_riding_disciplines')
			.select('riding_discipline_id')
			.eq('group_id', group.id),
		supabase.from('group_x_skill_levels').select('skill_level_id').eq('group_id', group.id)
	]);

	/** @type {any} */
	let donationAccount = null;
	try {
		const { data } = await privateSupabase
			.from('donation_accounts')
			.select(
				'id,stripe_account_id,stripe_account_email,charges_enabled,payouts_enabled,connected_at'
			)
			.eq('group_id', group.id)
			.maybeSingle();
		donationAccount = data ?? null;
	} catch {
		donationAccount = null;
	}

	return {
		group,
		group_types: gt.data ?? [],
		audience_focuses: af.data ?? [],
		riding_disciplines: rd.data ?? [],
		skill_levels: sl.data ?? [],
		selected: {
			group_type_ids: (gx.data ?? []).map((r) => r.group_type_id),
			audience_focus_ids: (ax.data ?? []).map((r) => r.audience_focus_id),
			riding_discipline_ids: (rx.data ?? []).map((r) => r.riding_discipline_id),
			skill_level_ids: (sx.data ?? []).map((r) => r.skill_level_id)
		},
		owners: (allOwners ?? []).map((r) => ({
			user_id: r.user_id,
			email: ownerEmails.find((e) => e.user_id === r.user_id)?.email || ''
		})),
		donation_account: donationAccount,
		stripe_status: url.searchParams.get('stripe') || '',
		stripe_reason: url.searchParams.get('reason') || '',
		current_user_id: user.id,
		current_profile: profileRow
	};
};
export const actions = {
	default: async ({ params, request, cookies }) => {
		const auth = await resolveGroupEditorContext({ params, cookies });
		if (!auth.ok) return auth.response;
		const { slug, group, group_id, supabase } = auth;

		const parsedForm = await readFormData(request, { maxBytes: 24 * 1024 * 1024 });
		if (!parsedForm.ok) return fail(parsedForm.status, { error: parsedForm.error });
		const form = parsedForm.value;

		/** @type {any} */
		const payload = {
			city: form.get('city')?.toString().trim() ?? '',
			state_region: form.get('state_region')?.toString().trim() ?? '',
			country: form.get('country')?.toString().trim()?.toUpperCase() ?? 'US',
			tagline: form.get('tagline')?.toString().trim() || null,
			description: form.get('description')?.toString().trim() || null,
			website_url: form.get('website_url')?.toString().trim() || null,
			public_contact_email: form.get('public_contact_email')?.toString().trim() || null,
			public_phone_number: form.get('public_phone_number')?.toString().trim() || null,
			preferred_contact_method_instructions:
				form.get('preferred_contact_method_instructions')?.toString().trim() || null,
			how_to_join_instructions: form.get('how_to_join_instructions')?.toString().trim() || null,
			specific_meeting_point_address:
				form.get('specific_meeting_point_address')?.toString().trim() || null,
			latitude: (() => {
				const v = form.get('latitude');
				if (v === null || v === '') return null;
				const n = Number(v);
				return Number.isFinite(n) ? n : null;
			})(),
			longitude: (() => {
				const v = form.get('longitude');
				if (v === null || v === '') return null;
				const n = Number(v);
				return Number.isFinite(n) ? n : null;
			})(),
			service_area_description: form.get('service_area_description')?.toString().trim() || null,
			zip_code: form.get('zip_code')?.toString().trim() || null,
			// skill_levels now managed via join table
			activity_frequency: form.get('activity_frequency')?.toString().trim() || null,
			typical_activity_day_time: form.get('typical_activity_day_time')?.toString().trim() || null,
			membership_info: form.get('membership_info')?.toString().trim() || null,
			preferred_cta_kind: (() => {
				const v = (form.get('preferred_cta_kind')?.toString() || 'auto').toLowerCase();
				return [
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
				].includes(v)
					? v
					: 'auto';
			})(),
			preferred_cta_label: null,
			preferred_cta_url: null,
			// logo/cover handled below (mirror to storage first)
			social_links: (() => {
				const cleaned = collectGroupSocialLinkInputs(
					(field) => form.get(`social_${field}`)?.toString() || ''
				);
				return Object.keys(cleaned).length ? cleaned : null;
			})()
		};

		if (payload.preferred_cta_kind === 'custom') {
			const lbl = (form.get('preferred_cta_label')?.toString().trim() || '').slice(0, 10);
			const url = form.get('preferred_cta_url')?.toString().trim() || '';
			if (!lbl)
				return fail(400, {
					error: 'Custom CTA label is required and must be 10 characters or fewer.'
				});
			if (!url) return fail(400, { error: 'Custom CTA URL is required.' });
			payload.preferred_cta_label = lbl;
			payload.preferred_cta_url = url;
		}

		// Optional name update (avoid null overwriting not-null column)
		const incomingName = form.get('name')?.toString().trim() || '';
		if (incomingName) payload.name = incomingName;

		// Basic required validation
		if (!payload.state_region || !payload.country) {
			return fail(400, { error: 'State/Region and Country are required.' });
		}

		// Handle images: prefer uploaded file, else mirror remote URL, empty clears
		const incomingLogo = form.get('logo_url')?.toString().trim() || '';
		const incomingCover = form.get('cover_photo_url')?.toString().trim() || '';
		const clearLogo = (form.get('clear_logo')?.toString() || '') === '1';
		const clearCover = (form.get('clear_cover')?.toString() || '') === '1';
		/** @type {any} */
		const logoFile = form.get('logo_file');
		/** @type {any} */
		const coverFile = form.get('cover_file');
		/** @type {any} */
		const logoCropped = form.get('logo_file_cropped')?.toString() || '';
		/** @type {any} */
		const coverCropped = form.get('cover_file_cropped')?.toString() || '';

		// Hard limit server-side for safety
		if (logoFile && logoFile.size && logoFile.size > MAX_BYTES) {
			return fail(400, { error: 'Logo file exceeds 10MB limit.' });
		}
		if (coverFile && coverFile.size && /** @type {any} */ (coverFile).size > MAX_BYTES) {
			return fail(400, { error: 'Cover image exceeds 10MB limit.' });
		}
		// Validate cropped data URLs size if provided
		if (logoCropped) {
			const parsed = parseGroupEditorImageDataUrl(logoCropped);
			if (!parsed || parsed.buffer.length > MAX_BYTES)
				return fail(400, { error: 'Cropped logo exceeds 10MB limit.' });
		}
		if (coverCropped) {
			/** @type {any} */
			const parsed = parseGroupEditorImageDataUrl(coverCropped);
			if (!parsed || parsed.buffer.length > MAX_BYTES)
				return fail(400, { error: 'Cropped cover exceeds 10MB limit.' });
		}
		if (clearLogo) payload.logo_url = null;
		if (clearCover) payload.cover_photo_url = null;
		if (logoCropped) {
			/** @type {any} */
			const newLogo = await uploadGroupEditorImageDataUrl(
				supabase,
				logoCropped,
				`groups/${group_id}/logo`
			);
			if (newLogo) payload.logo_url = newLogo;
			else if (group?.logo_url) payload.logo_url = group.logo_url;
		} else if (logoFile && /** @type {any} */ (logoFile).size) {
			/** @type {any} */
			const newLogo = await uploadLocalImageToStorage(
				supabase,
				logoFile,
				`groups/${group_id}/logo`
			);
			if (newLogo) payload.logo_url = newLogo;
			else if (group?.logo_url) payload.logo_url = group.logo_url;
		} else if (incomingLogo && /^https?:\/\//i.test(incomingLogo)) {
			/** @type {any} */
			const newLogo = await mirrorRemoteImageToStorage(
				supabase,
				incomingLogo,
				`groups/${group_id}/logo`
			);
			if (newLogo) payload.logo_url = newLogo;
			else if (group?.logo_url) payload.logo_url = group.logo_url; // keep previous if mirror fails
		}
		if (coverCropped) {
			/** @type {any} */
			const newCover = await uploadGroupEditorImageDataUrl(
				supabase,
				coverCropped,
				`groups/${group_id}/cover`
			);
			if (newCover) payload.cover_photo_url = newCover;
			else if (group?.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
		} else if (coverFile && /** @type {any} */ (coverFile).size) {
			/** @type {any} */
			const newCover = await uploadLocalImageToStorage(
				supabase,
				coverFile,
				`groups/${group_id}/cover`
			);
			if (newCover) payload.cover_photo_url = newCover;
			else if (group?.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
		} else if (incomingCover && /^https?:\/\//i.test(incomingCover)) {
			/** @type {any} */
			const newCover = await mirrorRemoteImageToStorage(
				supabase,
				incomingCover,
				`groups/${group_id}/cover`
			);
			if (newCover) payload.cover_photo_url = newCover;
			else if (group?.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
		}

		const { error: upErr } = await /** @type {any} */ (supabase)
			.from('groups')
			.update(payload)
			.eq('id', group_id);
		if (upErr) return fail(500, { error: upErr.message });

		// Update many-to-many mappings by replacing sets
		const gt_ids = form
			.getAll('group_type_ids')
			.map((v) => Number(v))
			.filter(Boolean);
		const af_ids = form
			.getAll('audience_focus_ids')
			.map((v) => Number(v))
			.filter(Boolean);
		const rd_ids = form
			.getAll('riding_discipline_ids')
			.map((v) => Number(v))
			.filter(Boolean);

		/** @type {any} */
		const ops = [];
		ops.push(
			/** @type {any} */ (supabase).from('group_x_group_types').delete().eq('group_id', group_id)
		);
		ops.push(
			/** @type {any} */ (supabase)
				.from('group_x_audience_focuses')
				.delete()
				.eq('group_id', group_id)
		);
		ops.push(
			/** @type {any} */ (supabase)
				.from('group_x_riding_disciplines')
				.delete()
				.eq('group_id', group_id)
		);
		ops.push(
			/** @type {any} */ (supabase).from('group_x_skill_levels').delete().eq('group_id', group_id)
		);

		const delRes = await Promise.all(ops);
		const delErr = delRes.find((r) => r.error)?.error;
		if (delErr) return fail(500, { error: delErr.message });

		/** @type {any} */
		const inserts = [];
		if (gt_ids.length)
			inserts.push(
				/** @type {any} */ (supabase)
					.from('group_x_group_types')
					.insert(gt_ids.map((group_type_id) => ({ group_id, group_type_id })))
			);
		if (af_ids.length)
			inserts.push(
				/** @type {any} */ (supabase)
					.from('group_x_audience_focuses')
					.insert(af_ids.map((audience_focus_id) => ({ group_id, audience_focus_id })))
			);
		if (rd_ids.length)
			inserts.push(
				/** @type {any} */ (supabase)
					.from('group_x_riding_disciplines')
					.insert(rd_ids.map((riding_discipline_id) => ({ group_id, riding_discipline_id })))
			);
		const sl_ids = form
			.getAll('skill_level_ids')
			.map((v) => Number(v))
			.filter(Boolean);
		if (sl_ids.length)
			inserts.push(
				/** @type {any} */ (supabase)
					.from('group_x_skill_levels')
					.insert(sl_ids.map((skill_level_id) => ({ group_id, skill_level_id })))
			);

		if (inserts.length) {
			const insRes = await Promise.all(inserts);
			const insErr = insRes.find((r) => r.error)?.error;
			if (insErr) return fail(500, { error: insErr.message });
		}

		throw redirect(303, `/groups/${slug}/manage/edit?saved=1`);
	},
	delete: async ({ params, cookies }) => {
		const auth = await resolveGroupEditorContext({ params, cookies });
		if (!auth.ok) return auth.response;

		const { group_id, supabase } = auth;
		const { error: deleteError } = await /** @type {any} */ (supabase)
			.from('groups')
			.update({
				is_published: false,
				updated_at: new Date().toISOString()
			})
			.eq('id', group_id);
		if (deleteError) return fail(500, { error: deleteError.message });

		throw redirect(303, `/groups/my`);
	}
};
