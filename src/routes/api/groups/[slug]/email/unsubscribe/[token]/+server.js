import { error } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export async function GET({ params }) {
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) throw error(503, 'Unsubscribe is unavailable.');
	const now = new Date().toISOString();
	const { data, error: updateError } = await serviceSupabase
		.from('group_email_subscribers')
		.update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
		.eq('unsubscribe_token', params.token)
		.select('id')
		.maybeSingle();
	if (updateError || !data) throw error(404, 'This unsubscribe link is invalid or expired.');

	return new Response(
		'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto"><h1>You’re unsubscribed</h1><p>You will no longer receive newsletter emails from this group.</p></body></html>',
		{ headers: { 'content-type': 'text/html; charset=utf-8' } }
	);
}
