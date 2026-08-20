import { json } from '@sveltejs/kit';
import { normalizeGroupEmailSignup } from '$lib/server/groupEmailSubscribers';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export async function POST({ params, request }) {
	const payload = await request.json().catch(() => ({}));
	const signup = normalizeGroupEmailSignup(payload);
	if (!signup.ok) return json({ error: signup.error }, { status: 400 });
	if (signup.honeypot) return json({ ok: true });

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return json({ error: 'Email signup is unavailable.' }, { status: 503 });

	let { data: group, error: groupError } = await serviceSupabase
		.from('groups')
		.select('id,name')
		.eq('slug', params.slug)
		.maybeSingle();
	if (!group && !groupError) {
		const fallback = await serviceSupabase
			.from('groups')
			.select('id,name')
			.eq('microsite_slug', params.slug)
			.maybeSingle();
		group = fallback.data;
		groupError = fallback.error;
	}
	if (groupError || !group) return json({ error: 'Group not found.' }, { status: 404 });

	const now = new Date().toISOString();
	const { error } = await serviceSupabase.from('group_email_subscribers').upsert(
		{
			group_id: group.id,
			email: signup.email,
			first_name: signup.firstName || null,
			status: 'subscribed',
			consent_at: now,
			unsubscribed_at: null,
			source: 'website',
			updated_at: now
		},
		{ onConflict: 'group_id,email' }
	);
	if (error)
		return json({ error: 'Unable to save your signup. Please try again.' }, { status: 500 });

	return json({ ok: true, message: `You're signed up for updates from ${group.name}.` });
}
