import { json } from '@sveltejs/kit';
import {
	listMembershipTiers,
	createMembershipTier,
	updateMembershipTier,
	deleteMembershipTier
} from '$lib/server/memberships';

function respond(result, successStatus = 200) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data }, { status: successStatus });
}

function resolveTierId(url, payload = {}) {
	return payload?.id || payload?.tier_id || url.searchParams.get('id') || null;
}

export async function GET({ params, cookies, url }) {
	const includeInactive =
		url.searchParams.get('include_inactive') === '1' ||
		url.searchParams.get('include_inactive') === 'true';
	const result = await listMembershipTiers({
		cookies,
		groupSlug: params.slug,
		includeInactive
	});
	return respond(result);
}

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createMembershipTier({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result, 201);
}

export async function PUT({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const tierId = resolveTierId(url, payload);
	if (!tierId) {
		return json({ error: 'Tier id is required.' }, { status: 400 });
	}
	const result = await updateMembershipTier({
		cookies,
		groupSlug: params.slug,
		tierId,
		payload
	});
	return respond(result);
}

export async function DELETE({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const tierId = resolveTierId(url, payload);
	if (!tierId) {
		return json({ error: 'Tier id is required.' }, { status: 400 });
	}
	const result = await deleteMembershipTier({
		cookies,
		groupSlug: params.slug,
		tierId
	});
	return respond(result);
}
