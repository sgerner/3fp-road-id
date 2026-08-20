import { fail, redirect } from '@sveltejs/kit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import {
	buildMicrositeUrl,
	isReservedMicrositeSlug,
	normalizeMicrositeSlug
} from '$lib/microsites/host';
import { buildDefaultGroupSiteConfig, parseGroupSiteFormData } from '$lib/microsites/config';
import { getGroupSiteConfig, upsertGroupSiteConfig } from '$lib/server/groupSites';

const SPONSOR_LOGO_BUCKET = 'group-assets';
const SPONSOR_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const SPONSOR_LOGO_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/svg+xml'
]);

function sanitizeSponsorItems(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => ({
			name: String(item?.name || '').trim(),
			text: String(item?.text || '').trim(),
			logo: String(item?.logo || '').trim(),
			url: String(item?.url || '').trim()
		}))
		.slice(0, 12);
}

function parseSponsorItemsJson(formData) {
	const raw = formData.get('sponsor_items_json');
	if (!raw) return [];
	try {
		return sanitizeSponsorItems(JSON.parse(String(raw)));
	} catch {
		return [];
	}
}

function buildSponsorLogoObjectPath(groupId, fileName) {
	const extension = path.extname(String(fileName || '')).toLowerCase() || '.png';
	return `groups/${groupId}/microsite/sponsors/${Date.now()}-${randomUUID()}${extension}`;
}

async function uploadSponsorLogosAndRewriteJson({ formData, groupId }) {
	const sponsorItems = parseSponsorItemsJson(formData);
	if (!sponsorItems.length) return [];

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for sponsor logo uploads.');
	}

	const uploadedPaths = [];
	try {
		for (let index = 0; index < sponsorItems.length; index += 1) {
			const file = formData.get(`sponsor_logo_file_${index}`);
			if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) continue;

			if (!SPONSOR_LOGO_MIME_TYPES.has(file.type)) {
				throw new Error(`Unsupported sponsor logo type: ${file.type || 'unknown type'}`);
			}
			if (file.size > SPONSOR_LOGO_MAX_BYTES) {
				throw new Error(`${file.name || 'Sponsor logo'} exceeds the 5 MB limit.`);
			}

			const objectPath = buildSponsorLogoObjectPath(groupId, file.name);
			const buffer = Buffer.from(await file.arrayBuffer());
			const { error: uploadError } = await serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.upload(objectPath, buffer, {
					contentType: file.type || 'application/octet-stream',
					upsert: false
				});
			if (uploadError) throw uploadError;
			uploadedPaths.push(objectPath);

			const { data: publicData } = serviceSupabase.storage
				.from(SPONSOR_LOGO_BUCKET)
				.getPublicUrl(objectPath);
			if (!publicData?.publicUrl) {
				throw new Error('Failed to get a public URL for uploaded sponsor logo.');
			}

			sponsorItems[index].logo = publicData.publicUrl;
		}
	} catch (error) {
		if (uploadedPaths.length) {
			await serviceSupabase.storage.from(SPONSOR_LOGO_BUCKET).remove(uploadedPaths);
		}
		throw error;
	}

	formData.set(
		'sponsor_items_json',
		JSON.stringify(sponsorItems.filter((item) => item.name || item.text || item.logo || item.url))
	);
	return uploadedPaths;
}

async function removeSponsorLogoObjects(paths) {
	if (!paths?.length) return;
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return;
	await serviceSupabase.storage.from(SPONSOR_LOGO_BUCKET).remove(paths);
}

function managedSponsorLogoObjectPaths(config, groupId) {
	const marker = `/storage/v1/object/public/${SPONSOR_LOGO_BUCKET}/`;
	const prefix = `groups/${groupId}/microsite/sponsors/`;
	return new Set(
		(Array.isArray(config?.sponsor_items) ? config.sponsor_items : [])
			.map((item) => {
				try {
					const pathname = new URL(String(item?.logo || '')).pathname;
					const markerIndex = pathname.indexOf(marker);
					if (markerIndex < 0) return '';
					const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
					return objectPath.startsWith(prefix) ? objectPath : '';
				} catch {
					return '';
				}
			})
			.filter(Boolean)
	);
}

async function removeUnusedSponsorLogoObjects({ previousConfig, nextConfig, groupId }) {
	const previousPaths = managedSponsorLogoObjectPaths(previousConfig, groupId);
	const nextPaths = managedSponsorLogoObjectPaths(nextConfig, groupId);
	await removeSponsorLogoObjects(
		[...previousPaths].filter((objectPath) => !nextPaths.has(objectPath))
	);
}

async function requireSiteManager(cookies, slug) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) throw redirect(303, `/groups/${slug}?auth=required`);

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).maybeSingle();
	if (!group) throw redirect(303, `/groups/${slug}`);

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	if (!(profile?.admin === true) && !(ownerRows ?? []).length) {
		throw redirect(303, `/groups/${slug}?auth=forbidden`);
	}

	return { group, userId: user.id, isAdmin: profile?.admin === true, supabase };
}

async function prepareSiteSettingsForm({ auth, request }) {
	const formData = await request.formData();
	const requestedMicrositeSlug = normalizeMicrositeSlug(formData.get('microsite_slug'));
	if (!requestedMicrositeSlug) {
		return {
			ok: false,
			response: fail(400, { error: 'Website slug is required and can only use letters/numbers.' })
		};
	}
	if (isReservedMicrositeSlug(requestedMicrositeSlug)) {
		return {
			ok: false,
			response: fail(400, { error: 'That website slug is reserved. Pick another one.' })
		};
	}

	const currentMicrositeSlug = normalizeMicrositeSlug(auth.group.microsite_slug || auth.group.slug);
	let slugChanged = false;
	if (requestedMicrositeSlug !== currentMicrositeSlug) {
		const { error: slugError } = await auth.supabase
			.from('groups')
			.update({ microsite_slug: requestedMicrositeSlug })
			.eq('id', auth.group.id);
		if (slugError) {
			const message = String(slugError.message || '').toLowerCase();
			if (slugError.code === '23505' || message.includes('duplicate')) {
				return {
					ok: false,
					response: fail(409, { error: 'That website slug is already taken. Try another one.' })
				};
			}
			return { ok: false, response: fail(400, { error: slugError.message }) };
		}
		slugChanged = true;
	}

	let uploadedPaths = [];
	try {
		uploadedPaths = await uploadSponsorLogosAndRewriteJson({
			formData,
			groupId: auth.group.id
		});
	} catch (error) {
		if (slugChanged) {
			await auth.supabase
				.from('groups')
				.update({ microsite_slug: currentMicrositeSlug })
				.eq('id', auth.group.id);
		}
		return {
			ok: false,
			response: fail(400, { error: error?.message || 'Unable to upload sponsor logo.' })
		};
	}

	return {
		ok: true,
		config: parseGroupSiteFormData(formData, { group: auth.group }),
		returnView: ['builder', 'quick', 'appearance', 'rides', 'address', 'more'].includes(
			String(formData.get('return_view') || '')
		)
			? String(formData.get('return_view'))
			: 'builder',
		uploadedPaths,
		slugChanged,
		previousMicrositeSlug: currentMicrositeSlug
	};
}

async function rollbackPreparedSiteSettings(auth, prepared) {
	await removeSponsorLogoObjects(prepared.uploadedPaths);
	if (!prepared.slugChanged) return;
	await auth.supabase
		.from('groups')
		.update({ microsite_slug: prepared.previousMicrositeSlug })
		.eq('id', auth.group.id);
}

export const load = async ({ parent, url, cookies }) => {
	const parentData = await parent();
	const group = parentData.group;
	const { accessToken } = resolveSession(cookies);
	const supabase = createRequestSupabaseClient(accessToken);

	const [siteConfig, groupsResponse] = await Promise.all([
		getGroupSiteConfig(group.id, { group }),
		supabase
			.from('groups')
			.select('id,slug,name,city,state_region')
			.order('name', { ascending: true })
			.limit(500)
	]);
	const availableGroups = Array.isArray(groupsResponse?.data) ? groupsResponse.data : [];
	const micrositeSlug = normalizeMicrositeSlug(group.microsite_slug || group.slug);
	const previewPath = `/${encodeURIComponent(micrositeSlug)}`;
	const liveUrl = buildMicrositeUrl(micrositeSlug, url);

	return {
		group,
		micrositeSlug,
		availableGroups,
		siteConfig,
		defaultSiteConfig: buildDefaultGroupSiteConfig(group),
		previewPath,
		liveUrl,
		saved: (url.searchParams.get('saved') || '').trim(),
		generated: (url.searchParams.get('generated') || '').trim(),
		reset: (url.searchParams.get('reset') || '').trim()
	};
};

export const actions = {
	save: async ({ params, request, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const previousConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
		const prepared = await prepareSiteSettingsForm({ auth, request });
		if (!prepared.ok) return prepared.response;
		try {
			await upsertGroupSiteConfig(auth.group.id, prepared.config);
		} catch (error) {
			await rollbackPreparedSiteSettings(auth, prepared);
			return fail(400, { error: error?.message || 'Unable to publish website changes.' });
		}
		await removeUnusedSponsorLogoObjects({
			previousConfig,
			nextConfig: prepared.config,
			groupId: auth.group.id
		});
		throw redirect(
			303,
			`/groups/${params.slug}/manage/site?saved=1&view=${encodeURIComponent(prepared.returnView)}`
		);
	},
	reset: async ({ params, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const { supabase } = auth;
		const previousConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
		const { error } = await supabase
			.from('group_site_configs')
			.delete()
			.eq('group_id', auth.group.id);
		if (error) {
			return fail(400, { error: error.message });
		}
		await removeSponsorLogoObjects([
			...managedSponsorLogoObjectPaths(previousConfig, auth.group.id)
		]);
		throw redirect(303, `/groups/${params.slug}/manage/site?reset=1`);
	}
};
