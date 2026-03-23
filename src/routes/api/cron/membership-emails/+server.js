import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { processScheduledMembershipEmails } from '$lib/server/memberships';

function enforceCronSecret(request) {
	const secret =
		env.CRON_SECRET || env.MEMBERSHIP_EMAIL_CRON_SECRET || env.VERCEL_CRON_SECRET || null;
	if (!secret) return null;

	const headerSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret');

	if (headerSecret !== secret) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	return null;
}

export async function POST({ request, fetch, url }) {
	const unauthorized = enforceCronSecret(request);
	if (unauthorized) return unauthorized;

	const maxCampaignsRaw = Number.parseInt(url.searchParams.get('limit') || '25', 10);
	const maxCampaigns =
		Number.isFinite(maxCampaignsRaw) && maxCampaignsRaw > 0 ? Math.min(maxCampaignsRaw, 200) : 25;

	try {
		const result = await processScheduledMembershipEmails({
			fetchImpl: fetch,
			maxCampaigns,
			now: new Date()
		});
		return json({ ok: true, ...result });
	} catch (error) {
		console.error('Unable to process scheduled membership emails', error);
		return json(
			{ error: error?.message || 'Unable to process scheduled membership emails.' },
			{ status: 500 }
		);
	}
}
