import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { getDomainConfigForProject, verifyMicrositeProjectDomain } from '$lib/server/vercelDomains';

export const config = { runtime: 'nodejs20.x', maxDuration: 300 };

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function derivePolledStatus({ domainRow, verification, config, verifyError, configError }) {
	const isVerified = verification?.verified === true;
	const isConfigured = config?.misconfigured === false;
	if (isVerified && isConfigured) {
		return {
			status: 'active',
			errorMessage: ''
		};
	}

	if (verification || config) {
		const isRegisteredDomain = cleanText(domainRow?.source) === 'registered';
		return {
			status: isRegisteredDomain ? 'provisioning' : 'pending_dns',
			errorMessage: ''
		};
	}

	const reasons = [verifyError, configError].filter(Boolean);
	return {
		status: 'failed',
		errorMessage: reasons.join(' | ') || 'Unable to verify domain state with Vercel.'
	};
}

async function verifyCronRequest(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('domain_status_poll', providedSecret);
}

async function pollDomainStatus(serviceSupabase, domainRow) {
	const domain = cleanText(domainRow?.domain).toLowerCase();
	if (!domain) throw new Error('Domain is missing.');

	const [verifyResult, configResult] = await Promise.allSettled([
		verifyMicrositeProjectDomain(domain),
		getDomainConfigForProject(domain)
	]);

	const verification = verifyResult.status === 'fulfilled' ? verifyResult.value : null;
	const config = configResult.status === 'fulfilled' ? configResult.value : null;
	const verifyError =
		verifyResult.status === 'rejected' ? cleanText(verifyResult.reason?.message) : '';
	const configError =
		configResult.status === 'rejected' ? cleanText(configResult.reason?.message) : '';

	const next = derivePolledStatus({
		domainRow,
		verification,
		config,
		verifyError,
		configError
	});

	const updates = {
		status: next.status,
		vercel_verified: next.status === 'active',
		last_error: next.status === 'failed' ? next.errorMessage : null,
		updated_at: new Date().toISOString()
	};

	if (verification) {
		updates.verification = Array.isArray(verification.verification)
			? verification.verification
			: [];
	}
	if (config) {
		updates.dns_config = config;
	}

	const { error: updateError } = await serviceSupabase
		.from('group_site_domains')
		.update(updates)
		.eq('id', domainRow.id);
	if (updateError) throw updateError;

	if (cleanText(domainRow.status) !== next.status) {
		await serviceSupabase.from('group_site_domain_events').insert({
			group_id: domainRow.group_id || null,
			domain_id: domainRow.id,
			provider: 'system',
			event_type: 'domain_status_polled',
			payload: {
				domain,
				previous_status: domainRow.status,
				next_status: next.status
			}
		});
	}

	return {
		domain,
		previousStatus: domainRow.status,
		status: next.status
	};
}

async function handleCron(event) {
	const authorized = await verifyCronRequest(event.request);
	if (!authorized) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 });
	}

	const { data: domains, error: fetchError } = await serviceSupabase
		.from('group_site_domains')
		.select('id,group_id,domain,source,status,updated_at')
		.neq('status', 'active')
		.order('updated_at', { ascending: true });
	if (fetchError) {
		return json(
			{ error: fetchError.message || 'Unable to load domains for polling.' },
			{ status: 500 }
		);
	}

	const summary = {
		polled: 0,
		active: 0,
		provisioning: 0,
		pending_dns: 0,
		failed: 0,
		results: []
	};

	for (const domainRow of Array.isArray(domains) ? domains : []) {
		try {
			const result = await pollDomainStatus(serviceSupabase, domainRow);
			summary.polled += 1;
			if (result.status === 'active') summary.active += 1;
			else if (result.status === 'provisioning') summary.provisioning += 1;
			else if (result.status === 'pending_dns') summary.pending_dns += 1;
			else if (result.status === 'failed') summary.failed += 1;
			summary.results.push({
				domain: result.domain,
				previous_status: result.previousStatus,
				status: result.status
			});
		} catch (error) {
			const message = cleanText(error?.message) || 'Unable to poll domain status.';
			await serviceSupabase
				.from('group_site_domains')
				.update({
					status: 'failed',
					last_error: message,
					updated_at: new Date().toISOString()
				})
				.eq('id', domainRow.id)
				.catch(() => null);
			summary.polled += 1;
			summary.failed += 1;
			summary.results.push({
				domain: cleanText(domainRow?.domain).toLowerCase(),
				previous_status: domainRow?.status || null,
				status: 'failed',
				error: message
			});
		}
	}

	return json({
		ok: true,
		selection: 'status != active',
		...summary
	});
}

export const GET = handleCron;
export const POST = handleCron;
