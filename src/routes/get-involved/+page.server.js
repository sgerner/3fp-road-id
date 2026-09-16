import { dev } from '$app/environment';
import { fail } from '@sveltejs/kit';
import { TURNSTILE_SECRET_KEY } from '$env/static/private';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';
import { requireAdmin } from '$lib/server/admin';
import { resolveVerifiedSession } from '$lib/server/session';
import { sendServerEmail as sendEmail } from '$lib/server/email';
import { enforceRateLimit, readFormData } from '$lib/server/security';

const emailPattern = /^\S+@\S+\.\S+$/;
const hasTurnstileSecret = Boolean(TURNSTILE_SECRET_KEY);
const MAX_OPPORTUNITIES_PER_SUBMISSION = 20;
const MAX_NAME_LENGTH = 160;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 4_000;

function normalizeField(value, maxLength = MAX_MESSAGE_LENGTH) {
	return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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
	const recipientSupabase = createServiceSupabaseClient() || supabase;
	const { data: admins, error: adminsError } = await recipientSupabase
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

async function verifyTurnstile(token) {
	if (!isTurnstileEnabled()) return true;
	if (!hasTurnstileSecret) {
		console.error('TURNSTILE_SECRET_KEY is not configured while Turnstile is enabled.');
		return dev;
	}

	if (!token || typeof token !== 'string') return false;

	const payload = new URLSearchParams({
		secret: TURNSTILE_SECRET_KEY,
		response: token
	});
	const verificationResponse = await fetch(
		'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		{
			method: 'POST',
			redirect: 'error',
			body: payload,
			signal: AbortSignal.timeout(5000)
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
	const { accessToken, user } = await resolveVerifiedSession(cookies);
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

		const parsedForm = await readFormData(request, { maxBytes: 32 * 1024 });
		if (!parsedForm.ok) {
			return fail(parsedForm.status, { createOpportunityError: parsedForm.error });
		}
		const formData = parsedForm.value;
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

	submitInterest: async (event) => {
		const { request, cookies, fetch } = event;
		const { accessToken, user } = await resolveVerifiedSession(cookies);
		const limited = enforceRateLimit(event, {
			name: 'get-involved-interest',
			limit: user?.id ? 20 : 5,
			windowMs: 60 * 60 * 1000,
			key: user?.id || ''
		});
		if (limited) {
			return fail(429, {
				interestError: 'Too many submissions. Please try again later.'
			});
		}
		const supabase = createRequestSupabaseClient(accessToken);
		const parsedForm = await readFormData(request, { maxBytes: 32 * 1024 });
		if (!parsedForm.ok) {
			return fail(parsedForm.status, { interestError: parsedForm.error });
		}
		const formData = parsedForm.value;

		const opportunityIds = uniqueNonEmpty(formData.getAll('opportunityIds')).slice(
			0,
			MAX_OPPORTUNITIES_PER_SUBMISSION
		);
		const fullName = normalizeField(formData.get('fullName'), MAX_NAME_LENGTH);
		const email = normalizeField(formData.get('email'), MAX_EMAIL_LENGTH).toLowerCase();
		const phone = normalizeField(formData.get('phone'), MAX_PHONE_LENGTH);
		const message = normalizeField(formData.get('message'), MAX_MESSAGE_LENGTH);
		const turnstileToken = normalizeField(formData.get('turnstileToken'), 4_000);

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
			const verified = await verifyTurnstile(turnstileToken);
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
