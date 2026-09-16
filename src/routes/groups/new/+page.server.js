import { supabase } from '$lib/supabaseClient';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { optimizeImageForStorage } from '$lib/server/storageImages';
import {
	enforceRateLimit,
	fetchPublicHttp,
	readFormData,
	readResponseBuffer
} from '$lib/server/security';
import { fail, redirect } from '@sveltejs/kit';

const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;

async function mirrorRemoteImageToStorage(remoteUrl, destBasePath) {
	try {
		const storageClient = createServiceSupabaseClient();
		if (!storageClient) return null;
		if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null;
		const res = await fetchPublicHttp(
			remoteUrl,
			{ headers: { accept: 'image/*' } },
			{ timeoutMs: 8_000, maxRedirects: 3 }
		);
		if (!res.ok) return null;
		const ct = (res.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
		if (!ct.startsWith('image/')) return null;
		const sourceBuffer = await readResponseBuffer(res, MAX_REMOTE_IMAGE_BYTES);
		if (!sourceBuffer) return null;
		const optimized = await optimizeImageForStorage(sourceBuffer, { contentType: ct });
		const path = `${destBasePath}-${Date.now()}.${optimized.extension}`;
		const up = await storageClient.storage.from('storage').upload(path, optimized.buffer, {
			contentType: optimized.contentType,
			upsert: true
		});
		if (up.error) return null;
		const { data } = storageClient.storage.from('storage').getPublicUrl(path);
		return data?.publicUrl || null;
	} catch {
		return null;
	}
}

function slugify(text) {
	return (text || '')
		.toString()
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

function normalizeComparableText(text) {
	return (text || '')
		.toString()
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function toTokenSet(text) {
	return new Set(
		normalizeComparableText(text)
			.split(' ')
			.map((part) => part.trim())
			.filter((part) => part.length >= 3)
	);
}

function tokenSimilarity(a, b) {
	const aSet = toTokenSet(a);
	const bSet = toTokenSet(b);
	if (!aSet.size || !bSet.size) return 0;
	let overlap = 0;
	for (const token of aSet) {
		if (bSet.has(token)) overlap += 1;
	}
	const union = new Set([...aSet, ...bSet]).size || 1;
	return overlap / union;
}

function normalizeHost(url) {
	if (!url) return '';
	try {
		const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
		return parsed.hostname.replace(/^www\./i, '').toLowerCase();
	} catch {
		return '';
	}
}

function normalizeSocialHandle(value, platform) {
	const raw = (value || '').toString().trim();
	if (!raw) return '';
	const platformName = platform === 'facebook' ? 'facebook' : 'instagram';
	const allowedHosts =
		platformName === 'facebook'
			? new Set(['facebook.com', 'm.facebook.com'])
			: new Set(['instagram.com']);
	const stripHandleDecorators = (input) =>
		input
			.toLowerCase()
			.replace(/^@+/, '')
			.replace(/^\/+|\/+$/g, '')
			.replace(/\?.*$/, '')
			.replace(/#.*$/, '')
			.trim();

	if (!/^https?:\/\//i.test(raw)) return stripHandleDecorators(raw);

	try {
		const parsed = new URL(raw);
		const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
		if (!allowedHosts.has(host)) return '';
		const path = parsed.pathname
			.split('/')
			.map((part) => part.trim())
			.filter(Boolean);
		if (!path.length) return '';
		if (platformName === 'instagram' && ['p', 'reel', 'tv'].includes(path[0]?.toLowerCase())) {
			return '';
		}
		if (
			platformName === 'facebook' &&
			['share', 'events', 'groups'].includes(path[0]?.toLowerCase())
		) {
			return stripHandleDecorators(path.slice(1).join('/'));
		}
		return stripHandleDecorators(path[0]);
	} catch {
		return '';
	}
}

function normalizedSocialMap(socialLinks) {
	const links = socialLinks && typeof socialLinks === 'object' ? socialLinks : {};
	return {
		instagram: normalizeSocialHandle(links.instagram, 'instagram'),
		facebook: normalizeSocialHandle(links.facebook, 'facebook')
	};
}

function sameText(a, b) {
	const av = normalizeComparableText(a);
	const bv = normalizeComparableText(b);
	return Boolean(av && bv && av === bv);
}

function formDataToObject(formData) {
	const out = {};
	for (const [key, rawValue] of formData.entries()) {
		const value = typeof rawValue === 'string' ? rawValue : '';
		if (Object.prototype.hasOwnProperty.call(out, key)) {
			const existing = out[key];
			if (Array.isArray(existing)) existing.push(value);
			else out[key] = [existing, value];
		} else {
			out[key] = value;
		}
	}
	return out;
}

async function findPotentialDuplicateGroups(
	supabaseClient,
	{ name, city, state_region, country, website_url, slug, social_links }
) {
	const safeName = (name || '').trim();
	if (!safeName || !country) return [];

	const tokens = Array.from(toTokenSet(safeName)).slice(0, 4);
	let query = supabaseClient
		.from('groups')
		.select('id, slug, name, city, state_region, country, website_url, social_links')
		.eq('country', country)
		.limit(180);

	if (tokens.length) {
		query = query.or(tokens.map((token) => `name.ilike.%${token}%`).join(','));
	}

	const { data, error } = await query;
	if (error || !Array.isArray(data)) return [];

	const targetHost = normalizeHost(website_url);
	const targetSlug = slugify(slug || safeName);
	const targetState = normalizeComparableText(state_region);
	const targetCity = normalizeComparableText(city);
	const targetName = normalizeComparableText(safeName);
	const targetSocials = normalizedSocialMap(social_links);

	const scored = data
		.map((group) => {
			const groupName = normalizeComparableText(group.name);
			if (!groupName) return null;

			let score = 0;
			const reasons = [];

			if (groupName === targetName) {
				score += 1.35;
				reasons.push('exact name match');
			} else {
				const similarity = tokenSimilarity(group.name, safeName);
				if (similarity >= 0.5) {
					score += similarity;
					reasons.push(`name similarity ${Math.round(similarity * 100)}%`);
				}
			}

			if (sameText(group.slug, targetSlug)) {
				score += 0.7;
				reasons.push('matching slug');
			}

			const groupState = normalizeComparableText(group.state_region);
			const groupCity = normalizeComparableText(group.city);
			if (targetState && groupState && targetState === groupState) {
				score += 0.32;
				reasons.push('same state/region');
			}
			if (targetCity && groupCity && targetCity === groupCity) {
				score += 0.24;
				reasons.push('same city');
			}

			const groupHost = normalizeHost(group.website_url);
			if (targetHost && groupHost && targetHost === groupHost) {
				score += 0.95;
				reasons.push('same website domain');
			}

			const groupSocials = normalizedSocialMap(group.social_links);
			if (
				targetSocials.instagram &&
				groupSocials.instagram &&
				targetSocials.instagram === groupSocials.instagram
			) {
				score += 1.05;
				reasons.push('matching Instagram');
			}
			if (
				targetSocials.facebook &&
				groupSocials.facebook &&
				targetSocials.facebook === groupSocials.facebook
			) {
				score += 1.05;
				reasons.push('matching Facebook');
			}

			if (score < 1.1) return null;

			return {
				id: group.id,
				slug: group.slug,
				name: group.name,
				city: group.city,
				state_region: group.state_region,
				country: group.country,
				website_url: group.website_url,
				duplicate_score: Number(score.toFixed(2)),
				duplicate_reason: reasons.join(', ')
			};
		})
		.filter(Boolean)
		.sort((a, b) => b.duplicate_score - a.duplicate_score)
		.slice(0, 5);

	return scored;
}

export const load = async () => {
	const [gt, af, rd, sl] = await Promise.all([
		supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name'),
		supabase.from('skill_levels').select('id, name').order('name')
	]);

	return {
		group_types: gt.data ?? [],
		audience_focuses: af.data ?? [],
		riding_disciplines: rd.data ?? [],
		skill_levels: sl.data ?? []
	};
};

export const actions = {
	default: async (event) => {
		const { request, cookies } = event;
		if (
			enforceRateLimit(event, {
				name: 'group-create-ip',
				limit: 10,
				windowMs: 60 * 60 * 1000
			})
		) {
			return fail(429, { error: 'Too many group creation attempts. Please try again later.' });
		}

		const parsedForm = await readFormData(request, { maxBytes: 256 * 1024 });
		if (!parsedForm.ok) {
			return fail(parsedForm.status, { error: parsedForm.error });
		}

		const { accessToken, user, verified } = await resolveVerifiedSession(cookies);
		if (!verified || !accessToken || !user?.id) {
			return fail(401, { error: 'Please sign in before creating a group.' });
		}
		if (
			enforceRateLimit(event, {
				name: 'group-create-user',
				key: user.id,
				limit: 5,
				windowMs: 60 * 60 * 1000
			})
		) {
			return fail(429, { error: 'Too many group creation attempts. Please try again later.' });
		}

		const requestSupabase = createRequestSupabaseClient(accessToken);
		const serviceSupabase = createServiceSupabaseClient();
		if (!serviceSupabase) {
			return fail(503, { error: 'Group creation is temporarily unavailable.' });
		}

		const form = parsedForm.value;
		const values = formDataToObject(form);
		const name = form.get('name')?.toString().trim();
		const city = form.get('city')?.toString().trim() ?? '';
		const state_region = form.get('state_region')?.toString().trim();
		const _country = form.get('country')?.toString().trim();
		const country = _country ? _country.toUpperCase() : null;
		const tagline = form.get('tagline')?.toString().trim() || null;
		const description = form.get('description')?.toString().trim() || null;
		const visible_website_url = form.get('website_url')?.toString().trim() || '';
		const suggested_website_url = form.get('suggested_website_url')?.toString().trim() || '';
		const website_url = visible_website_url || suggested_website_url || null;
		const public_contact_email = form.get('public_contact_email')?.toString().trim() || null;
		const public_phone_number = form.get('public_phone_number')?.toString().trim() || null;
		const preferred_contact_method_instructions =
			form.get('preferred_contact_method_instructions')?.toString().trim() || null;
		const how_to_join_instructions =
			form.get('how_to_join_instructions')?.toString().trim() || null;
		// Extra, potentially AI-suggested fields
		const membership_info = form.get('membership_info')?.toString().trim() || null;
		const specific_meeting_point_address =
			form.get('specific_meeting_point_address')?.toString().trim() || null;
		const latitude = (() => {
			const v = form.get('latitude');
			if (v === null || v === '') return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		})();
		const longitude = (() => {
			const v = form.get('longitude');
			if (v === null || v === '') return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		})();
		const service_area_description =
			form.get('service_area_description')?.toString().trim() || null;
		// Deprecated: skill_levels_description now replaced by discrete selections
		const activity_frequency = form.get('activity_frequency')?.toString().trim() || null;
		const typical_activity_day_time =
			form.get('typical_activity_day_time')?.toString().trim() || null;
		const incoming_logo_url = form.get('logo_url')?.toString().trim() || '';
		const incoming_cover_url = form.get('cover_photo_url')?.toString().trim() || '';
		const social_links = (() => {
			const raw = form.get('social_links')?.toString().trim();
			if (!raw) return null;
			try {
				return JSON.parse(raw);
			} catch {
				return null;
			}
		})();
		const allow_duplicate_override = form.get('allow_duplicate_override')?.toString() === '1';

		if (!name || !state_region || !country) {
			return fail(400, { error: 'Please fill required fields.', values });
		}

		let slug = slugify(form.get('slug')?.toString() || name);
		if (!slug) slug = slugify(name);

		const duplicate_candidates = await findPotentialDuplicateGroups(requestSupabase, {
			name,
			city,
			state_region,
			country,
			website_url,
			slug,
			social_links
		});
		if (duplicate_candidates.length && !allow_duplicate_override) {
			return fail(409, {
				error:
					'Possible duplicate group found. Review the matches below, then confirm override to create anyway.',
				values,
				needs_duplicate_override: true,
				duplicate_candidates
			});
		}

		// Attempt insert, handle potential slug conflict once by suffixing a short hash
		const insertPayload = {
			slug,
			name,
			city,
			state_region,
			country,
			tagline,
			description,
			website_url,
			public_contact_email,
			public_phone_number,
			preferred_contact_method_instructions,
			how_to_join_instructions,
			membership_info,
			specific_meeting_point_address,
			latitude,
			longitude,
			service_area_description,
			activity_frequency,
			typical_activity_day_time,
			social_links
		};

		const createGroup = async () => {
			const { data, error } = await serviceSupabase.rpc('create_group_with_owner', {
				group_data: insertPayload,
				owner_user_id: user.id
			});
			return { data: Array.isArray(data) ? data[0] : data, error };
		};

		let { data: groupRes, error: groupErr } = await createGroup();

		if (groupErr && groupErr.code === '23505') {
			// unique_violation on slug; try once with suffix
			const suffix = Math.random().toString(36).slice(2, 6);
			insertPayload.slug = `${slug}-${suffix}`;
			const retry = await createGroup();
			groupRes = retry.data;
			groupErr = retry.error;
		}

		if (groupErr || !groupRes?.id) {
			console.error('Unable to create group:', groupErr);
			return fail(500, { error: 'Unable to create this group. Please try again.', values });
		}

		const group_id = groupRes.id;

		// Mirror remote images to storage after group creation and update the record
		const updates = {};
		if (incoming_logo_url && /^https?:\/\//i.test(incoming_logo_url)) {
			const publicUrl = await mirrorRemoteImageToStorage(
				incoming_logo_url,
				`groups/${group_id}/logo`
			);
			if (publicUrl) updates.logo_url = publicUrl;
		}
		if (incoming_cover_url && /^https?:\/\//i.test(incoming_cover_url)) {
			const publicUrl = await mirrorRemoteImageToStorage(
				incoming_cover_url,
				`groups/${group_id}/cover`
			);
			if (publicUrl) updates.cover_photo_url = publicUrl;
		}
		if (Object.keys(updates).length) {
			await requestSupabase.from('groups').update(updates).eq('id', group_id);
		}

		// Handle many-to-many selections
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
		const sl_ids = form
			.getAll('skill_level_ids')
			.map((v) => Number(v))
			.filter(Boolean);

		const inserts = [];
		if (gt_ids.length) {
			inserts.push(
				requestSupabase
					.from('group_x_group_types')
					.insert(gt_ids.map((group_type_id) => ({ group_id, group_type_id })))
			);
		}
		if (af_ids.length) {
			inserts.push(
				requestSupabase
					.from('group_x_audience_focuses')
					.insert(af_ids.map((audience_focus_id) => ({ group_id, audience_focus_id })))
			);
		}
		if (rd_ids.length) {
			inserts.push(
				requestSupabase
					.from('group_x_riding_disciplines')
					.insert(rd_ids.map((riding_discipline_id) => ({ group_id, riding_discipline_id })))
			);
		}
		if (sl_ids.length) {
			inserts.push(
				requestSupabase
					.from('group_x_skill_levels')
					.insert(sl_ids.map((skill_level_id) => ({ group_id, skill_level_id })))
			);
		}

		if (inserts.length) {
			const results = await Promise.all(inserts);
			const joinError = results.find((r) => r.error)?.error;
			if (joinError) {
				console.error('Unable to link group categories:', joinError);
				return {
					success: true,
					slug: groupRes.slug,
					warning: 'Group created, but some selected details could not be saved.'
				};
			}
		}

		// Redirect to the manage edit page to complete optional details
		throw redirect(303, `/groups/${groupRes.slug}/manage/edit`);
	}
};
