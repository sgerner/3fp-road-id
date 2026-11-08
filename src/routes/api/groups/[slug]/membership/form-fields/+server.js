import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import {
	listMembershipFormFields,
	createMembershipFormField,
	updateMembershipFormField,
	deleteMembershipFormField
} from '#lib/server/memberships';

function resolveFieldId(url, payload = {}) {
	return payload?.id || payload?.field_id || url.searchParams.get('id') || null;
}

export async function GET({ params, cookies, url }) {
	const includeInactive =
		url.searchParams.get('include_inactive') === '1' ||
		url.searchParams.get('include_inactive') === 'true';
	const result = await listMembershipFormFields({
		cookies,
		groupSlug: params.slug,
		includeInactive
	});
	return respond(result);
}

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await createMembershipFormField({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result, 201);
}

export async function PUT({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const fieldId = resolveFieldId(url, payload);
	if (!fieldId) {
		return json({ error: 'Field id is required.' }, { status: 400 });
	}
	const result = await updateMembershipFormField({
		cookies,
		groupSlug: params.slug,
		fieldId,
		payload
	});
	return respond(result);
}

export async function DELETE({ params, cookies, request, url }) {
	const payload = await request.json().catch(() => ({}));
	const fieldId = resolveFieldId(url, payload);
	if (!fieldId) {
		return json({ error: 'Field id is required.' }, { status: 400 });
	}
	const result = await deleteMembershipFormField({
		cookies,
		groupSlug: params.slug,
		fieldId
	});
	return respond(result);
}
