import { fail } from '@sveltejs/kit';
import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';
import { requireAdmin } from '$lib/server/admin';
import { resolveSession } from '$lib/server/session';
import { sendEmail } from '$lib/services/email';

const emailPattern = /^\S+@\S+\.\S+$/;
const hasTurnstileSecret = Boolean(TURNSTILE_SECRET_KEY);
let warnedMissingTurnstileSecret = false;

function normalizeField(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function uniqueNonEmpty(values) {
	return Array.from(new Set(values.map((value) => normalizeField(value)).filter(Boolean)));
}

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

async function notifyAdminsOfInterestSubmission({
	fetch,
	supabase,
	opportunities,
	fullName,
	email,
	phone,
	message,
	userId
}) {
	const { data: admins, error: adminsError } = await supabase
		.from('profiles')
		.select('email')
		.eq('admin', true)
		.not('email', 'is', null);

	if (adminsError) {
		console.warn('Unable to load admin recipients for get involved email', adminsError);
		return;
	}

	const recipients = uniqueNonEmpty((admins ?? []).map((admin) => admin?.email || ''));
	if (!recipients.length) return;

	const opportunityTitles = opportunities.map((opportunity) => opportunity.title).filter(Boolean);
	const escapedOpportunities = opportunityTitles
		.map((title) => `<li>${escapeHtml(title)}</li>`)
		.join('');
	const escapedMessage = escapeHtml(message || '');

	const html = `
<p>A new Get Involved interest form was submitted.</p>
<p><strong>Name:</strong> ${escapeHtml(fullName)}<br />
<strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br />
<strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}<br />
<strong>User ID:</strong> ${escapeHtml(userId || 'Guest')}</p>
<h3>Selected opportunities</h3>
<ul>${escapedOpportunities}</ul>
${escapedMessage ? `<h3>Message</h3><p>${escapedMessage}</p>` : ''}
`;

	const textLines = [
		'A new Get Involved interest form was submitted.',
		'',
		`Name: ${fullName}`,
		`Email: ${email}`,
		`Phone: ${phone || 'Not provided'}`,
		`User ID: ${userId || 'Guest'}`,
		'',
		'Selected opportunities:',
		...opportunityTitles.map((title) => `- ${title}`)
	];
	if (message) {
		textLines.push('', 'Message:', message);
	}

	try {
		await sendEmail(
			{
				to: recipients,
				replyTo: email,
				subject: `New Get Involved interest from ${fullName}`,
				html,
				text: textLines.join('\n'),
				tags: [
					{ Name: 'context', Value: 'volunteer-get-involved-interest' },
					{ Name: 'surface', Value: 'get-involved' }
				]
			},
			{ fetch }
		);
	} catch (error) {
		console.warn('Unable to send admin get involved notification email', error);
	}
}

async function verifyTurnstile(request, token) {
	if (!isTurnstileEnabled()) return true;
	if (!hasTurnstileSecret) {
		if (!warnedMissingTurnstileSecret) {
			console.warn('TURNSTILE_SECRET_KEY is not configured; skipping verification.');
			warnedMissingTurnstileSecret = true;
		}
		return true;
	}

	if (!token || typeof token !== 'string') return false;

	const payload = new URLSearchParams({
		secret: TURNSTILE_SECRET_KEY,
		response: token
	});
	const connectingIp =
		request.headers.get('cf-connecting-ip') ||
		(request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim();
	if (connectingIp) payload.append('remoteip', connectingIp);

	const verificationResponse = await fetch(
		'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		{
			method: 'POST',
			body: payload
		}
	);

	if (!verificationResponse.ok) {
		console.error('Turnstile verification failed to respond:', verificationResponse.status);
		return false;
	}

	const verification = await verificationResponse.json().catch(() => ({ success: false }));
	if (!verification?.success) {
		console.warn('Turnstile verification failure', verification);
		return false;
	}

	return true;
}

export const load = async ({ cookies, parent }) => {
	const parentData = await parent().catch(() => ({}));
	const { accessToken, user } = resolveSession(cookies);
	const supabase = createRequestSupabaseClient(accessToken);

	const { data: opportunities, error: opportunitiesError } = await supabase
		.from('get_involved_opportunities')
		.select('id,title,description,sort_order,created_at')
		.eq('is_active', true)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });

	if (opportunitiesError) {
		console.error('Unable to load get involved opportunities', opportunitiesError);
	}

	let profile = null;
	if (user?.id) {
		const { data: profileData, error: profileError } = await supabase
			.from('profiles')
			.select('full_name,email,phone')
			.eq('user_id', user.id)
			.maybeSingle();
		if (profileError) {
			console.warn('Unable to load profile prefill data', profileError);
		} else {
			profile = profileData;
		}
	}

	return {
		opportunities: opportunities ?? [],
		isAdmin: Boolean(parentData?.isAdmin),
		turnstileEnabled: parentData?.turnstileEnabled !== false,
		user: user?.id
			? {
					id: user.id,
					email: profile?.email || user.email || null
				}
			: null,
		prefill: {
			fullName: profile?.full_name || '',
			email: profile?.email || user?.email || '',
			phone: profile?.phone || ''
		}
	};
};

export const actions = {
	createOpportunity: async ({ request, cookies }) => {
		let admin;
		try {
			admin = await requireAdmin(cookies);
		} catch {
			return fail(403, { createOpportunityError: 'Admin access required.' });
		}

		const formData = await request.formData();
		const title = normalizeField(formData.get('title'));
		const description = normalizeField(formData.get('description'));

		const createValues = { title, description };

		if (!title) {
			return fail(400, {
				createOpportunityError: 'A title is required.',
				createValues
			});
		}

		const { error: insertError } = await admin.supabase.from('get_involved_opportunities').insert({
			title,
			description: description || null,
			created_by_user_id: admin.user.id
		});

		if (insertError) {
			console.error('Unable to create get involved opportunity', insertError);
			const duplicate = insertError.code === '23505';
			return fail(400, {
				createOpportunityError: duplicate
					? 'That opportunity title already exists.'
					: 'Could not create opportunity right now.',
				createValues
			});
		}

		return {
			createOpportunitySuccess: 'Opportunity posted.',
			createValues: { title: '', description: '' }
		};
	},

	submitInterest: async ({ request, cookies, fetch }) => {
		const { accessToken, user } = resolveSession(cookies);
		const supabase = createRequestSupabaseClient(accessToken);
		const formData = await request.formData();

		const opportunityIds = uniqueNonEmpty(formData.getAll('opportunityIds'));
		const fullName = normalizeField(formData.get('fullName'));
		const email = normalizeField(formData.get('email'));
		const phone = normalizeField(formData.get('phone'));
		const message = normalizeField(formData.get('message'));
		const turnstileToken = normalizeField(formData.get('turnstileToken'));

		const interestValues = {
			opportunityIds,
			fullName,
			email,
			phone,
			message
		};

		if (!opportunityIds.length) {
			return fail(400, {
				interestError: 'Choose at least one opportunity.',
				interestValues
			});
		}
		if (!fullName) {
			return fail(400, {
				interestError: 'Name is required.',
				interestValues
			});
		}
		if (!email || !emailPattern.test(email)) {
			return fail(400, {
				interestError: 'A valid email is required.',
				interestValues
			});
		}

		if (!user?.id) {
			const verified = await verifyTurnstile(request, turnstileToken);
			if (!verified) {
				return fail(400, {
					interestError: 'Verification failed. Please try again.',
					interestValues
				});
			}
		}

		const { data: opportunities, error: opportunityError } = await supabase
			.from('get_involved_opportunities')
			.select('id,title')
			.in('id', opportunityIds)
			.eq('is_active', true)
			.order('sort_order', { ascending: true });

		if (opportunityError) {
			console.error('Unable to validate selected opportunity', opportunityError);
			return fail(500, {
				interestError: 'Could not submit right now. Please try again shortly.',
				interestValues
			});
		}

		if (!Array.isArray(opportunities) || opportunities.length !== opportunityIds.length) {
			return fail(400, {
				interestError: 'One or more selected opportunities are no longer available.',
				interestValues
			});
		}

		const submissionRows = opportunities.map((opportunity) => ({
			opportunity_id: opportunity.id,
			user_id: user?.id || null,
			full_name: fullName,
			email,
			phone: phone || null,
			message: message || null
		}));

		const { error: insertError } = await supabase
			.from('get_involved_interest_submissions')
			.insert(submissionRows);

		if (insertError) {
			console.error('Unable to create interest submission', insertError);
			return fail(500, {
				interestError: 'Could not submit right now. Please try again shortly.',
				interestValues
			});
		}

		await notifyAdminsOfInterestSubmission({
			fetch,
			supabase,
			opportunities,
			fullName,
			email,
			phone,
			message,
			userId: user?.id || null
		});

		return {
			interestSuccess: 'Thanks! We received your interest and will follow up soon.'
		};
	}
};
