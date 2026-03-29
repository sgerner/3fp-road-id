import { fail, redirect } from '@sveltejs/kit';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabase } from '$lib/supabaseClient';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import {
	buildMicrositeUrl,
	isReservedMicrositeSlug,
	normalizeMicrositeSlug
} from '$lib/microsites/host';
import {
	buildDefaultGroupSiteConfig,
	mergeGroupSiteConfig,
	parseGroupSiteFormData
} from '$lib/microsites/config';
import {
	deriveGroupSitePalette,
	getGroupSiteConfig,
	upsertGroupSiteConfig
} from '$lib/server/groupSites';

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
		.filter((item) => item.name || item.text || item.logo || item.url);
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
	if (!sponsorItems.length) return;

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for sponsor logo uploads.');
	}

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

		const { data: publicData } = serviceSupabase.storage
			.from(SPONSOR_LOGO_BUCKET)
			.getPublicUrl(objectPath);
		if (!publicData?.publicUrl) {
			throw new Error('Failed to get a public URL for uploaded sponsor logo.');
		}

		sponsorItems[index].logo = publicData.publicUrl;
	}

	formData.set('sponsor_items_json', JSON.stringify(sponsorItems));
}

async function requireSiteManager(cookies, slug) {
	const sessionCookie = cookies.get('sb_session');
	if (!sessionCookie) throw redirect(303, `/groups/${slug}?auth=required`);

	let parsed = null;
	try {
		parsed = JSON.parse(sessionCookie);
	} catch {
		parsed = null;
	}

	const accessToken = parsed?.access_token;
	if (!accessToken) throw redirect(303, `/groups/${slug}?auth=required`);

	const { data: userRes } = await supabase.auth.getUser(accessToken);
	const userId = userRes?.user?.id;
	if (!userId) throw redirect(303, `/groups/${slug}?auth=required`);

	const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).maybeSingle();
	if (!group) throw redirect(303, `/groups/${slug}`);

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', userId).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', userId)
			.eq('role', 'owner')
	]);

	if (!(profile?.admin === true) && !(ownerRows ?? []).length) {
		throw redirect(303, `/groups/${slug}?auth=forbidden`);
	}

	return { group, userId, isAdmin: profile?.admin === true };
}

function deriveMicrositeDomainSuffix(liveUrl, micrositeSlug) {
	try {
		const parsed = new URL(liveUrl);
		const host = parsed.host;
		const normalized = normalizeMicrositeSlug(micrositeSlug);
		if (normalized && host.startsWith(`${normalized}.`)) {
			return host.slice(normalized.length);
		}
		if (parsed.hostname.endsWith('.3fp.bike')) return '.3fp.bike';
		if (parsed.hostname.endsWith('.localhost')) return `.localhost${parsed.port ? `:${parsed.port}` : ''}`;
	} catch {
		// ignore
	}
	return '.3fp.bike';
}

export const load = async ({ parent, url }) => {
	const parentData = await parent();
	const group = parentData.group;
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
	const micrositeDomainSuffix = deriveMicrositeDomainSuffix(liveUrl, micrositeSlug);

	return {
		group,
		micrositeSlug,
		micrositeDomainSuffix,
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
		const formData = await request.formData();
		try {
			await uploadSponsorLogosAndRewriteJson({ formData, groupId: auth.group.id });
		} catch (error) {
			return fail(400, { error: error?.message || 'Unable to upload sponsor logo.' });
		}
		const requestedMicrositeSlug = normalizeMicrositeSlug(formData.get('microsite_slug'));
		if (!requestedMicrositeSlug) {
			return fail(400, { error: 'Website slug is required and can only use letters/numbers.' });
		}
		if (isReservedMicrositeSlug(requestedMicrositeSlug)) {
			return fail(400, { error: 'That website slug is reserved. Pick another one.' });
		}

		const currentMicrositeSlug = normalizeMicrositeSlug(auth.group.microsite_slug || auth.group.slug);
		if (requestedMicrositeSlug !== currentMicrositeSlug) {
			const { error: slugError } = await supabase
				.from('groups')
				.update({ microsite_slug: requestedMicrositeSlug })
				.eq('id', auth.group.id);
			if (slugError) {
				const message = String(slugError.message || '').toLowerCase();
				if (slugError.code === '23505' || message.includes('duplicate')) {
					return fail(409, { error: 'That website slug is already taken. Try another one.' });
				}
				return fail(400, { error: slugError.message });
			}
		}

		const nextConfig = parseGroupSiteFormData(formData, { group: auth.group });
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		throw redirect(303, `/groups/${params.slug}/manage/site?saved=1`);
	},
	deriveTheme: async ({ params, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
		const palette = await deriveGroupSitePalette(auth.group, currentConfig);
		const nextConfig = mergeGroupSiteConfig(currentConfig, {
			theme_mode: 'custom',
			theme_colors: palette
		});
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		throw redirect(303, `/groups/${params.slug}/manage/site?saved=palette`);
	},
	reset: async ({ params, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const { error } = await supabase.from('group_site_configs').delete().eq('group_id', auth.group.id);
		if (error) {
			return fail(400, { error: error.message });
		}
		throw redirect(303, `/groups/${params.slug}/manage/site?reset=1`);
	}
};
