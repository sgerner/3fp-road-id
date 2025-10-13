import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import {
	fetchList,
	fetchSingle,
	loadAssignmentContext,
	normalizeId
} from '../../../volunteer/shifts/shift-actions.server.js';

const NOTIFICATION_TYPES = new Set(['register', 'cancel']);

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function truthy(value) {
	if (value === true) return true;
	if (value === false) return false;
	const normalized = safeTrim(value).toLowerCase();
	if (!normalized) return false;
	return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function escapeHtml(value) {
	return safeTrim(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function formatDateTime(value, timezone, options = {}) {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	try {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: timezone || 'UTC',
			...options
		}).format(date);
	} catch (error) {
		console.warn('Unable to format volunteer host notification time', error);
		return new Intl.DateTimeFormat('en-US', options).format(date);
	}
}

function formatShiftWindow({ shift, event, includeDate = true }) {
	if (!shift) return '';
	const timezone =
		shift.timezone ||
		shift.time_zone ||
		shift.timeZone ||
		event?.timezone ||
		event?.time_zone ||
		'UTC';
	const startsAt = shift.starts_at || shift.startsAt || null;
	const endsAt = shift.ends_at || shift.endsAt || null;
	const dateLabel = includeDate
		? formatDateTime(startsAt || endsAt, timezone, {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			})
		: '';
	const startTime = startsAt
		? formatDateTime(startsAt, timezone, { hour: 'numeric', minute: '2-digit' })
		: '';
	const endTime = endsAt
		? formatDateTime(endsAt, timezone, { hour: 'numeric', minute: '2-digit' })
		: '';
	if (startTime && endTime) {
		return dateLabel ? `${dateLabel} • ${startTime} – ${endTime}` : `${startTime} – ${endTime}`;
	}
	return dateLabel || startTime || endTime || '';
}

function buildManageUrl(origin, event) {
	const base = origin || '';
	const slug = safeTrim(event?.slug);
	if (!base) return '';
	if (slug) return `${base.replace(/\/$/, '')}/volunteer/${encodeURIComponent(slug)}/manage`;
	return `${base.replace(/\/$/, '')}/volunteer/shifts`;
}

async function loadEventHostRecipients(fetchImpl, eventRecord) {
	const recipients = new Map();
	const eventId = normalizeId(eventRecord?.id);
	const hostUserId = normalizeId(eventRecord?.host_user_id ?? eventRecord?.hostUserId);
	const hostGroupId = normalizeId(eventRecord?.host_group_id ?? eventRecord?.hostGroupId);

	const addRecipient = (record) => {
		if (!record) return;
		const email =
			safeTrim(
				record.email ??
					record.profile?.email ??
					record.profile?.email_address ??
					record.user?.email ??
					record.contact_email ??
					null
			) || '';
		if (!email) return;
		const key = email.toLowerCase();
		if (recipients.has(key)) return;
		const name =
			safeTrim(
				record.full_name ??
					record.name ??
					record.profile?.full_name ??
					record.profile?.name ??
					record.user?.full_name ??
					null
			) || '';
		recipients.set(key, { email, name });
	};

	if (hostUserId) {
		const profile = await fetchSingle(fetchImpl, 'profiles', {
			params: {
				user_id: `eq.${hostUserId}`,
				select: 'user_id,email,full_name',
				single: 'true'
			}
		}).catch((error) => {
			if (error?.status === 404 || error?.status === 403) return null;
			throw error;
		});
		if (profile) addRecipient(profile);
	}

	if (eventId) {
		const hostRows = await fetchList(fetchImpl, 'v-volunteer-event-hosts-with-profiles', {
			params: {
				event_id: `eq.${eventId}`
			}
		});
		for (const host of hostRows ?? []) {
			addRecipient(host);
		}
	}

	if (hostGroupId) {
		const ownerRows = await fetchList(fetchImpl, 'group-members', {
			params: {
				group_id: `eq.${hostGroupId}`,
				role: 'eq.owner',
				select: 'user_id,profile:profiles(email,full_name)'
			}
		});
		for (const owner of ownerRows ?? []) {
			addRecipient(owner);
		}
	}

	return Array.from(recipients.values());
}

function buildEmailContent({ type, eventRecord, contexts, origin }) {
	const eventTitle = safeTrim(eventRecord?.title) || 'Volunteer event';

	// All contexts should be for the same volunteer, but let's be safe
	const firstContext = contexts[0] || {};
	const { signup } = firstContext;
	const volunteerName = safeTrim(signup?.volunteer_name);

	const action =
		type === 'register'
			? 'has signed up for the following shifts'
			: 'has cancelled the following shifts';

	const shiftLines = contexts
		.map((context) => {
			const opportunityTitle = safeTrim(context.opportunity?.title) || 'Volunteer shift';
			const shiftSchedule = formatShiftWindow({ shift: context.shift, event: eventRecord });
			return `<li><strong>${escapeHtml(opportunityTitle)}</strong>: ${escapeHtml(shiftSchedule)}</li>`;
		})
		.join('');

	const lines = `<p><strong>${escapeHtml(
		volunteerName
	)}</strong> ${action} for ${escapeHtml(eventTitle)}:</p><ul>${shiftLines}</ul>`;

	const manageUrl = buildManageUrl(origin, eventRecord);
	const subjectPrefix = type === 'register' ? 'New volunteer signup' : 'Volunteer cancellation';
	const subject = `${subjectPrefix}: ${eventTitle}`;

	const volunteerDetails = [
		volunteerName ? `<strong>Name:</strong> ${volunteerName}` : null,
		signup?.volunteer_email ? `<strong>Email:</strong> ${signup.volunteer_email}` : null,
		signup?.volunteer_phone ? `<strong>Phone:</strong> ${signup.volunteer_phone}` : null
	]
		.filter(Boolean)
		.join('<br />');

	const textLines = contexts.map(
		(c) => `- ${c.opportunity?.title}: ${formatShiftWindow({ shift: c.shift, event: eventRecord })}`
	);

	const textParts = [
		`Hello host,`,
		'',
		`${volunteerName} ${action} for ${eventTitle}:`,
		...textLines,
		volunteerDetails ? `\nVolunteer contact:\n${volunteerDetails}` : null,
		manageUrl ? `\nReview the roster: ${manageUrl}` : null,
		'',
		'Thanks for supporting your volunteer team!'
	].filter(Boolean);

	const htmlParts = [
		'<p>Hello host,</p>',
		lines,
		volunteerDetails
			? `<p><strong>Volunteer contact</strong><br />${escapeHtml(volunteerDetails).replace(
					'\n',
					'<br />'
				)}</p>`
			: '',
		manageUrl
			? `<p><a href="${escapeHtml(
					manageUrl
				)}" style="color:#2563eb;text-decoration:underline;">Open event management</a></p>`
			: '',
		'<p>Thanks for supporting your volunteer team!</p>'
	].filter(Boolean);

	return {
		subject,
		text: textParts.join('\n'),
		html: htmlParts.join('\n')
	};
}

export const POST = async (event) => {
	let body;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const typeRaw = safeTrim(body?.type).toLowerCase();
	if (!NOTIFICATION_TYPES.has(typeRaw)) {
		return json({ error: 'Unsupported notification type.' }, { status: 400 });
	}

	const assignmentId = normalizeId(body?.assignment_id);
	const assignmentIdsRaw = Array.isArray(body?.assignment_ids) ? body.assignment_ids : [];
	let assignmentIds = [assignmentId, ...assignmentIdsRaw].map(normalizeId).filter(Boolean);

	if (assignmentIds.length === 0) {
		return json({ error: 'assignment_id or assignment_ids is required.' }, { status: 400 });
	}
	assignmentIds = [...new Set(assignmentIds)]; // Make unique

	const contexts = await Promise.all(
		assignmentIds.map((id) =>
			loadAssignmentContext(event.fetch, id).catch((err) => {
				console.warn(`Failed to load context for assignment ${id}`, err);
				return null;
			})
		)
	).then((results) => results.filter(Boolean));

	if (contexts.length === 0) {
		return json({ error: 'No valid assignment contexts could be loaded.' }, { status: 404 });
	}

	// Group contexts by event
	const contextsByEvent = contexts.reduce((acc, context) => {
		const eventId = context.event?.id;
		if (!eventId) return acc;
		if (!acc.has(eventId)) {
			acc.set(eventId, []);
		}
		acc.get(eventId).push(context);
		return acc;
	}, new Map());

	let sentCount = 0;

	for (const [eventId, eventContexts] of contextsByEvent.entries()) {
		const firstContext = eventContexts[0];
		const { event: eventRecord } = firstContext;

		if (!eventRecord) continue;

		const notificationsEnabled =
			typeRaw === 'register'
				? truthy(eventRecord.register_notifications ?? eventRecord.registerNotifications)
				: truthy(eventRecord.cancel_notifications ?? eventRecord.cancelNotifications);

		if (!notificationsEnabled) {
			continue;
		}

		const recipients = await loadEventHostRecipients(event.fetch, eventRecord);
		if (!recipients.length) {
			continue;
		}

		const emailContent = buildEmailContent({
			type: typeRaw,
			eventRecord,
			contexts: eventContexts,
			origin: event.url.origin
		});

		try {
			const tags = [
				{ Name: 'context', Value: 'volunteer-host-notification-bulk' },
				{ Name: 'volunteer_event_id', Value: String(eventId) },
				{ Name: 'volunteer_notification_type', Value: typeRaw }
			];

			await sendEmail(
				{
					to: recipients.map((entry) => entry.email),
					subject: emailContent.subject,
					text: emailContent.text,
					html: emailContent.html,
					replyTo: safeTrim(eventRecord.contact_email ?? eventRecord.contactEmail) || undefined,
					tags
				},
				{ fetch: event.fetch }
			);
			sentCount += recipients.length;
		} catch (error) {
			console.error(`Failed to send bulk volunteer host notification for event ${eventId}`, error);
		}
	}

	return json({
		success: true,
		recipients: sentCount
	});
};
