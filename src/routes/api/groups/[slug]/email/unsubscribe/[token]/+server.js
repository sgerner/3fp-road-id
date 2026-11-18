import { createServiceSupabaseClient } from '#lib/server/supabaseClient';

function unsubscribePage(title, body, status = 200) {
	return new Response(
		`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto"><h1>${title}</h1>${body}</body></html>`,
		{
			status,
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'private, no-store',
				'referrer-policy': 'same-origin'
			}
		}
	);
}

export function GET() {
	return unsubscribePage(
		'Unsubscribe from group emails',
		'<p>Confirm that you want to stop receiving newsletter emails from this group.</p><form method="post"><button type="submit">Unsubscribe</button></form>'
	);
}

export async function POST({ params }) {
	if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(params.token)) {
		return unsubscribePage(
			'Invalid unsubscribe link',
			'<p>This link is invalid or expired.</p>',
			404
		);
	}
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return unsubscribePage('Unsubscribe is unavailable', '<p>Please try again later.</p>', 503);
	}
	const now = new Date().toISOString();
	const { data, error: updateError } = await serviceSupabase
		.from('group_email_subscribers')
		.update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
		.eq('unsubscribe_token', params.token)
		.select('id')
		.maybeSingle();
	if (updateError) {
		return unsubscribePage('Unsubscribe is unavailable', '<p>Please try again later.</p>', 503);
	}
	if (!data) {
		return unsubscribePage(
			'Invalid unsubscribe link',
			'<p>This link is invalid or expired.</p>',
			404
		);
	}
	return unsubscribePage(
		'You’re unsubscribed',
		'<p>You will no longer receive newsletter emails from this group.</p>'
	);
}
