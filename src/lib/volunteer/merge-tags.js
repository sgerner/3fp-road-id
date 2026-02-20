import { escapeHtml, renderMarkdown } from '$lib/markdown';
import {
	VOLUNTEER_PORTAL_PATH,
	wrapHtmlWithBranding,
	wrapTextWithBranding
} from '$lib/email/branding';

function safeString(value, fallback = '') {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'string') return value;
	return String(value);
}

function coerceArray(value) {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function parseDate(value) {
	if (!value) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function formatDateTime(date, timezone, options = {}) {
	const parsed = parseDate(date);
	if (!parsed) return '';
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone || undefined,
			...options
		});
		return formatter.format(parsed);
	} catch (error) {
		console.warn('Unable to format volunteer merge-tag date', error);
		return parsed.toLocaleString();
	}
}

function formatEventSchedule(event) {
	if (!event.start && !event.end) return 'Schedule coming soon';
	const timezone = event.timezone;
	const startLabel = formatDateTime(event.start, timezone, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
	if (!event.end) return startLabel || 'Schedule coming soon';
	const endLabel = formatDateTime(event.end, timezone, {
		dateStyle:
			event.start &&
			formatDateTime(event.start, timezone, { dateStyle: 'short' }) ===
				formatDateTime(event.end, timezone, { dateStyle: 'short' })
				? undefined
				: 'medium',
		timeStyle: 'short'
	});
	return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
}

function normalizeEvent(eventLike = {}) {
	const normalized = {
		title:
			safeString(
				eventLike.title ??
					eventLike.event_title ??
					eventLike.name ??
					eventLike.eventName ??
					'Volunteer event'
			) || 'Volunteer event',
		start:
			eventLike.eventStart ??
			eventLike.event_start ??
			eventLike.starts_at ??
			eventLike.start ??
			eventLike.start_time ??
			null,
		end:
			eventLike.eventEnd ??
			eventLike.event_end ??
			eventLike.ends_at ??
			eventLike.end ??
			eventLike.end_time ??
			null,
		timezone:
			eventLike.timezone ??
			eventLike.timezone_name ??
			eventLike.timezoneName ??
			eventLike.time_zone ??
			null,
		locationName: safeString(
			eventLike.locationName ??
				eventLike.location_name ??
				eventLike.venue ??
				eventLike.meetup_spot ??
				''
		),
		locationAddress: safeString(
			eventLike.locationAddress ?? eventLike.location_address ?? eventLike.address ?? ''
		),
		contactEmail: safeString(
			eventLike.contactEmail ??
				eventLike.contact_email ??
				eventLike.host_email ??
				eventLike.organizerEmail ??
				''
		),
		contactPhone: safeString(
			eventLike.contactPhone ?? eventLike.contact_phone ?? eventLike.host_phone ?? ''
		),
		hostName: safeString(
			eventLike.hostName ??
				eventLike.host_name ??
				eventLike.contact_name ??
				eventLike.organizerName ??
				''
		)
	};
	return normalized;
}

function normalizeOpportunity(opportunityLike = {}, event = {}) {
	return {
		id: opportunityLike.id ? String(opportunityLike.id) : null,
		title: safeString(opportunityLike.title ?? opportunityLike.name ?? 'Volunteer activity'),
		locationName: safeString(
			opportunityLike.locationName ?? opportunityLike.location_name ?? event.locationName ?? ''
		),
		locationAddress: safeString(
			opportunityLike.locationAddress ??
				opportunityLike.location_address ??
				event.locationAddress ??
				''
		),
		notes: safeString(opportunityLike.locationNotes ?? opportunityLike.notes ?? ''),
		shifts: coerceArray(opportunityLike.shifts ?? opportunityLike.shiftOptions ?? [])
			.map((shift) => normalizeShift(shift, opportunityLike, event))
			.filter(Boolean)
	};
}

function normalizeShift(shiftLike = {}, opportunity = {}, event = {}) {
	const id = shiftLike.id ?? shiftLike.shift_id ?? shiftLike.volunteer_shift_id;
	if (!id && !shiftLike.title && !shiftLike.starts_at && !shiftLike.startsAt) return null;
	const title =
		safeString(
			shiftLike.title ?? shiftLike.name ?? opportunity.title ?? event.title ?? 'Volunteer shift'
		) || 'Volunteer shift';
	const startsAt =
		shiftLike.startsAt ??
		shiftLike.starts_at ??
		shiftLike.start_time ??
		shiftLike.start ??
		shiftLike.starts ??
		null;
	const endsAt =
		shiftLike.endsAt ??
		shiftLike.ends_at ??
		shiftLike.end_time ??
		shiftLike.end ??
		shiftLike.ends ??
		null;
	const timezone =
		shiftLike.timezone ??
		shiftLike.timezone_name ??
		shiftLike.time_zone ??
		opportunity.timezone ??
		event.timezone ??
		null;
	const locationName = safeString(
		shiftLike.locationName ??
			shiftLike.location_name ??
			opportunity.locationName ??
			opportunity.location_name ??
			event.locationName ??
			''
	);
	const locationAddress = safeString(
		shiftLike.locationAddress ??
			shiftLike.location_address ??
			opportunity.locationAddress ??
			opportunity.location_address ??
			event.locationAddress ??
			''
	);
	const notes = safeString(shiftLike.notes ?? shiftLike.instructions ?? opportunity.notes ?? '');
	return {
		id: id ? String(id) : null,
		title,
		startsAt,
		endsAt,
		timezone,
		locationName,
		locationAddress,
		notes,
		opportunityTitle: safeString(opportunity.title ?? event.title ?? '')
	};
}

function formatShiftWindow(shift, eventTimezone) {
	if (!shift.startsAt && !shift.endsAt) return 'Shift time coming soon';
	const timezone = shift.timezone || eventTimezone;
	const startLabel = formatDateTime(shift.startsAt, timezone, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
	const endLabel = formatDateTime(shift.endsAt, timezone, {
		dateStyle:
			shift.startsAt &&
			formatDateTime(shift.startsAt, timezone, { dateStyle: 'short' }) ===
				formatDateTime(shift.endsAt, timezone, { dateStyle: 'short' })
				? undefined
				: 'medium',
		timeStyle: 'short'
	});
	return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
}

function normalizeHost(hostLike = {}, event = {}) {
	return {
		name:
			safeString(
				hostLike.hostName ?? hostLike.name ?? event.hostName ?? event.hostGroupName ?? 'Your host'
			) || 'Your host',
		email: safeString(hostLike.contactEmail ?? hostLike.email ?? event.contactEmail ?? ''),
		phone: safeString(hostLike.contactPhone ?? hostLike.phone ?? event.contactPhone ?? ''),
		website: safeString(hostLike.website ?? hostLike.websiteUrl ?? '')
	};
}

function ensureOrigin(origin) {
	if (origin) return origin.replace(/\/$/, '');
	if (typeof window !== 'undefined' && window.location?.origin) {
		return window.location.origin.replace(/\/$/, '');
	}
	return 'https://example.org';
}

function buildShiftDetails({ assignments = [], opportunities = [], event, origin }) {
	const mapById = new Map();
	for (const opportunity of opportunities) {
		for (const shift of opportunity.shifts) {
			if (!shift.id) continue;
			mapById.set(String(shift.id), shift);
		}
	}

	const details = [];
	for (const assignment of assignments) {
		const shift = assignment.shift ? assignment.shift : mapById.get(String(assignment.shiftId));
		if (!shift) continue;
		const label = shift.title || shift.opportunityTitle || event.title;
		const timeWindow = formatShiftWindow(shift, event.timezone);
		const location = [shift.locationName, shift.locationAddress].filter(Boolean).join(', ');
		const confirmUrl = `${origin}${VOLUNTEER_PORTAL_PATH}/${assignment.id}/confirm`;
		const cancelUrl = `${origin}${VOLUNTEER_PORTAL_PATH}/${assignment.id}/cancel`;
		details.push({
			assignmentId: assignment.id,
			shiftId: assignment.shiftId,
			title: label,
			timeWindow,
			location,
			notes: shift.notes || '',
			confirmUrl,
			cancelUrl
		});
	}

	if (!details.length) {
		const sample = opportunities[0]?.shifts?.[0];
		if (sample) {
			details.push({
				assignmentId: 'sample-assignment',
				shiftId: sample.id ?? 'sample-shift',
				title: sample.title || opportunities[0]?.title || event.title,
				timeWindow: formatShiftWindow(sample, event.timezone),
				location: [sample.locationName, sample.locationAddress].filter(Boolean).join(', '),
				notes: sample.notes || '',
				confirmUrl: `${origin}${VOLUNTEER_PORTAL_PATH}/sample-assignment/confirm`,
				cancelUrl: `${origin}${VOLUNTEER_PORTAL_PATH}/sample-assignment/cancel`
			});
		}
	}

	return details;
}

function buildEventDetailsBlock(event) {
	const items = [
		event.title ? `<strong>Event:</strong> ${escapeHtml(event.title)}` : '',
		formatEventSchedule(event)
			? `<strong>Schedule:</strong> ${escapeHtml(formatEventSchedule(event))}`
			: '',
		[event.locationName, event.locationAddress]
			.filter(Boolean)
			.map((part) => escapeHtml(part))
			.join(', ')
			? `<strong>Where:</strong> ${[event.locationName, event.locationAddress]
					.filter(Boolean)
					.map((part) => escapeHtml(part))
					.join(', ')}`
			: '',
		event.timezone ? `<strong>Timezone:</strong> ${escapeHtml(event.timezone)}` : ''
	].filter(Boolean);

	if (!items.length) {
		return '<p>Event details coming soon.</p>';
	}

	return `
<section class="merge-block" style="border-radius:16px;padding:16px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.4);">
        <h4 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#e2e8f0;">Event details</h4>
        <ul style="margin:0;padding:0 0 0 18px;color:#cbd5f5;font-size:14px;line-height:1.6;">
                ${items.map((item) => `<li style="margin-bottom:6px;">${item}</li>`).join('')}
        </ul>
</section>
`.trim();
}

function buildEventDetailsText(event) {
	const lines = [];
	if (event.title) lines.push(`Event: ${event.title}`);
	const schedule = formatEventSchedule(event);
	if (schedule) lines.push(`Schedule: ${schedule}`);
	const location = [event.locationName, event.locationAddress].filter(Boolean).join(', ');
	if (location) lines.push(`Where: ${location}`);
	if (event.timezone) lines.push(`Timezone: ${event.timezone}`);
	return lines.length ? lines.join('\n') : 'Event details coming soon.';
}

function buildShiftDetailsBlock({ shiftDetails = [], event }) {
	if (!shiftDetails.length) {
		return '<p>Shift assignments will appear here once confirmed.</p>';
	}

	const cards = shiftDetails
		.map((shift) => {
			const location = shift.location
				? `<div style="margin:4px 0;color:#cbd5f5;">${escapeHtml(shift.location)}</div>`
				: '';
			const notes = shift.notes
				? `<div style="margin:4px 0;color:#94a3b8;font-size:13px;">${escapeHtml(shift.notes)}</div>`
				: '';
			return `
<div style="border-radius:14px;padding:14px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.3);margin-bottom:12px;">
        <div style="font-weight:600;color:#e2e8f0;font-size:15px;">${escapeHtml(shift.title)}</div>
        <div style="margin:4px 0;color:#cbd5f5;">${escapeHtml(shift.timeWindow || formatEventSchedule(event))}</div>
        ${location}
        ${notes}
</div>`;
		})
		.join('');

	return `
<section class="merge-block" style="border-radius:16px;padding:16px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.35);">
        <h4 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#e2e8f0;">Your shift${shiftDetails.length > 1 ? 's' : ''}</h4>
        ${cards}
</section>
`.trim();
}

function buildShiftDetailsText({ shiftDetails = [], event }) {
	if (!shiftDetails.length) return 'Shift assignments will appear once confirmed.';
	const sections = shiftDetails.map((shift, index) => {
		const lines = [`Shift ${index + 1}: ${shift.title}`];
		if (shift.timeWindow) lines.push(`Time: ${shift.timeWindow}`);
		if (shift.location) lines.push(`Location: ${shift.location}`);
		if (shift.notes) lines.push(`Notes: ${shift.notes}`);
		return lines.join('\n');
	});
	return sections.join('\n\n');
}

function buildShiftConfirmationBlock({ shiftDetails = [], portalUrl }) {
	if (!shiftDetails.length) {
		return '<p>Confirmation buttons will appear once volunteers are assigned to shifts.</p>';
	}

	const cards = shiftDetails
		.map((shift) => {
			if (!shift.assignmentId) return '';
			return `
<div style="border-radius:14px;padding:14px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.3);margin-bottom:12px;">
        <div style="font-weight:600;color:#e2e8f0;font-size:15px;">${escapeHtml(shift.title)}</div>
        <div style="margin:4px 0;color:#cbd5f5;">${escapeHtml(shift.timeWindow)}</div>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;">
                <a href="${escapeHtml(shift.confirmUrl)}" style="background:#34d399;color:#0f172a;padding:10px 14px;border-radius:999px;font-weight:600;text-decoration:none;">Confirm shift</a>
                <a href="${escapeHtml(shift.cancelUrl)}" style="background:#f87171;color:#0f172a;padding:10px 14px;border-radius:999px;font-weight:600;text-decoration:none;">Cancel shift</a>
        </div>
        <div style="margin-top:8px;color:#94a3b8;font-size:12px;">Buttons not working? Copy these links:<br /><a href="${escapeHtml(shift.confirmUrl)}" style="color:#38bdf8;text-decoration:underline;">Confirm</a> · <a href="${escapeHtml(shift.cancelUrl)}" style="color:#f87171;text-decoration:underline;">Cancel</a></div>
</div>`;
		})
		.filter(Boolean)
		.join('');

	const manageLink = portalUrl
		? `<p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">Need a different time? <a href="${escapeHtml(portalUrl)}" style="color:#38bdf8;text-decoration:underline;">View all volunteer shifts</a>.</p>`
		: '';

	return `
<section class="merge-block" style="border-radius:16px;padding:16px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.35);">
        <h4 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#e2e8f0;">Confirm your shift</h4>
        ${cards || '<p>No shift assignments found yet.</p>'}
        ${manageLink}
</section>
`.trim();
}

function buildShiftConfirmationText({ shiftDetails = [], portalUrl }) {
	if (!shiftDetails.length) {
		return 'Confirmation buttons will appear once shifts are assigned.';
	}
	const lines = shiftDetails
		.filter((shift) => shift.assignmentId)
		.map((shift, index) => {
			const block = [`Shift ${index + 1}: ${shift.title}`];
			block.push(`Confirm: ${shift.confirmUrl}`);
			block.push(`Cancel: ${shift.cancelUrl}`);
			return block.join('\n');
		});
	if (portalUrl) {
		lines.push(`Manage or reschedule shifts: ${portalUrl}`);
	}
	return lines.join('\n\n');
}

function buildHostContactBlock(host) {
	const rows = [
		host.name ? `<li><strong>Host:</strong> ${escapeHtml(host.name)}</li>` : '',
		host.email
			? `<li><strong>Email:</strong> <a href="mailto:${escapeHtml(host.email)}" style="color:#38bdf8;">${escapeHtml(host.email)}</a></li>`
			: '',
		host.phone
			? `<li><strong>Phone:</strong> <a href="tel:${escapeHtml(host.phone)}" style="color:#38bdf8;">${escapeHtml(host.phone)}</a></li>`
			: '',
		host.website
			? `<li><strong>Website:</strong> <a href="${escapeHtml(host.website)}" style="color:#38bdf8;">${escapeHtml(host.website)}</a></li>`
			: ''
	].filter(Boolean);

	if (!rows.length) {
		return '<p>We will share contact details soon.</p>';
	}

	return `
<section class="merge-block" style="border-radius:16px;padding:16px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.35);">
        <h4 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#e2e8f0;">Host contact</h4>
        <ul style="margin:0;padding:0 0 0 18px;color:#cbd5f5;font-size:14px;line-height:1.6;">
                ${rows.join('')}
        </ul>
</section>
`.trim();
}

function buildHostContactText(host) {
	const lines = [];
	if (host.name) lines.push(`Host: ${host.name}`);
	if (host.email) lines.push(`Email: ${host.email}`);
	if (host.phone) lines.push(`Phone: ${host.phone}`);
	if (host.website) lines.push(`Website: ${host.website}`);
	return lines.length ? lines.join('\n') : 'We will share contact details soon.';
}

function buildPortalBlock(portalUrl) {
	const url = escapeHtml(portalUrl);
	return `
<section class="merge-block" style="border-radius:16px;padding:16px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.25);text-align:center;">
        <h4 style="margin:0 0 8px;font-size:16px;font-weight:600;color:#e2e8f0;">Manage your volunteer shifts</h4>
        <p style="margin:0 0 12px;color:#cbd5f5;font-size:14px;">Review your schedule, update your availability, or grab another shift.</p>
        <a href="${url}" style="display:inline-block;background:#38bdf8;color:#0f172a;padding:12px 18px;border-radius:999px;font-weight:600;text-decoration:none;">Open volunteer portal</a>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Link not working? Copy this URL: <span style="color:#38bdf8;">${url}</span></p>
</section>
`.trim();
}

function buildPortalText(portalUrl) {
	return `Manage your volunteer shifts: ${portalUrl}`;
}

const MERGE_TAG_DEFINITIONS = [
	{
		token: '{{volunteer_name}}',
		label: 'Volunteer name',
		description: 'Personalises the message with the volunteer’s preferred name.',
		resolve: (context) => {
			const name = context.volunteerName || 'there';
			const escaped = escapeHtml(name);
			return { text: name, html: escaped };
		}
	},
	{
		token: '{{event_title}}',
		label: 'Event title',
		description: 'Inserts the volunteer event title.',
		resolve: (context) => {
			const title = context.event.title || 'Volunteer event';
			const escaped = escapeHtml(title);
			return { text: title, html: escaped };
		}
	},
	{
		token: '{{event_day_time}}',
		label: 'Event schedule',
		description: 'Displays the start and end time in one line.',
		resolve: (context) => {
			const schedule = formatEventSchedule(context.event);
			const escaped = escapeHtml(schedule);
			return { text: schedule, html: escaped };
		}
	},
	{
		token: '{{event_location}}',
		label: 'Event location',
		description: 'Shows the primary meetup location.',
		resolve: (context) => {
			const location = [context.event.locationName, context.event.locationAddress]
				.filter(Boolean)
				.join(', ');
			const escaped = escapeHtml(location || 'Location coming soon');
			return { text: location || 'Location coming soon', html: escaped };
		}
	},
	{
		token: '{{event_start}}',
		label: 'Event start time',
		description: 'Formats the event start using the event timezone.',
		resolve: (context) => {
			const value = formatDateTime(context.event.start, context.event.timezone, {
				dateStyle: 'full',
				timeStyle: 'short'
			});
			const escaped = escapeHtml(value || 'TBD');
			return { text: value || 'TBD', html: escaped };
		}
	},
	{
		token: '{{event_details_block}}',
		label: 'Event overview block',
		description: 'Card with event title, schedule, location, and timezone.',
		block: true,
		resolve: (context) => ({
			text: buildEventDetailsText(context.event),
			html: buildEventDetailsBlock(context.event)
		})
	},
	{
		token: '{{shift_details_block}}',
		label: 'Shift assignments block',
		description: 'Lists assigned shifts with timing, location, and quick action buttons.',
		block: true,
		resolve: (context) => ({
			text: buildShiftDetailsText(context),
			html: buildShiftDetailsBlock(context)
		})
	},

	{
		token: '{{shift_confirmation_block}}',
		label: 'Confirm or cancel buttons',
		description: 'Adds confirm/cancel buttons for each assigned shift plus fallback links.',
		block: true,
		resolve: (context) => ({
			text: buildShiftConfirmationText(context),
			html: buildShiftConfirmationBlock(context)
		})
	},
	{
		token: '{{volunteer_portal_block}}',
		label: 'Volunteer portal link',
		description: 'Highlights the link to view or reschedule all volunteer shifts.',
		block: true,
		resolve: (context) => ({
			text: buildPortalText(context.portalUrl),
			html: buildPortalBlock(context.portalUrl)
		})
	}
];

function applyTokens(template, context, format, placeholders) {
	let output = template ?? '';
	for (const definition of MERGE_TAG_DEFINITIONS) {
		const { token } = definition;
		const resolved = definition.resolve?.(context) ?? { text: '', html: '' };
		const replacement = format === 'html' ? (resolved.html ?? '') : (resolved.text ?? '');
		if (format === 'html' && definition.block) {
			const key = `[[[MERGE_BLOCK_${placeholders.size}]]]`;
			placeholders.set(key, replacement);
			output = output.replaceAll(token, key);
		} else {
			output = output.replaceAll(token, replacement);
		}
	}
	return output;
}

function htmlToPlainText(html) {
	return html
		.replace(/<\/(h[1-6]|p|div|section)>/gi, '\n\n')
		.replace(/<br\s*\/?\s*>/gi, '\n')
		.replace(/<li>(.*?)<\/li>/gi, '- $1\n')
		.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
		.replace(/<[^>]+>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function renderEmailBody(template, context) {
	const placeholders = new Map();
	const markdownWithPlaceholders = applyTokens(template, context, 'html', placeholders);
	const htmlMarkdown = renderMarkdown(markdownWithPlaceholders);
	let htmlOutput = htmlMarkdown || '';
	for (const [marker, value] of placeholders.entries()) {
		htmlOutput = htmlOutput.replaceAll(`<p>${marker}</p>`, value);
		htmlOutput = htmlOutput.replaceAll(marker, value);
	}

	const textMarkdown = applyTokens(template, context, 'text', new Map());
	const textHtml = renderMarkdown(textMarkdown);
	const textOutput = htmlToPlainText(textHtml || textMarkdown || '');

	const eventTitle = safeString(context?.event?.title ?? '');
	const brandingOptions = {
		origin: context?.origin,
		portalUrl: context?.portalUrl,
		category: 'Volunteer update',
		subjectLine: eventTitle
	};

	const trimmedHtml = htmlOutput?.trim?.() ? htmlOutput.trim() : '';
	const brandedHtml = trimmedHtml ? wrapHtmlWithBranding(trimmedHtml, brandingOptions) : '';

	const trimmedText = textOutput?.trim?.() ? textOutput.trim() : '';
	const brandedText = trimmedText ? wrapTextWithBranding(trimmedText, brandingOptions) : '';

	return {
		html: trimmedHtml,
		text: trimmedText,
		markdown: textMarkdown,
		brandedHtml,
		brandedText
	};
}

export function renderSubject(template, context) {
	const replaced = applyTokens(template, context, 'text', new Map());
	return replaced.trim();
}

export function createMergeContext({
	event = {},
	eventDetails = {},
	opportunities = [],
	volunteer = {},
	assignments = [],
	host = {},
	origin,
	requireConfirmation = false
} = {}) {
	const normalizedEvent = normalizeEvent({ ...eventDetails, ...event });
	const normalizedOpportunities = opportunities
		.map((opp) => normalizeOpportunity(opp, normalizedEvent))
		.filter(Boolean);
	const normalizedAssignments = coerceArray(assignments).map((assignment) => ({
		id: assignment?.id ? String(assignment.id) : null,
		shiftId: assignment?.shiftId ?? assignment?.shift_id ?? assignment?.volunteer_shift_id ?? null,
		shift: assignment?.shift ?? null
	}));

	const baseOrigin = ensureOrigin(origin);
	const portalUrl = `${baseOrigin}${VOLUNTEER_PORTAL_PATH}`;
	const volunteerName = safeString(
		volunteer?.name ??
			volunteer?.full_name ??
			volunteer?.displayName ??
			volunteer?.first_name ??
			volunteer?.email ??
			''
	);

	const hostDetails = normalizeHost(host, normalizedEvent);
	const shiftDetails = buildShiftDetails({
		assignments: normalizedAssignments,
		opportunities: normalizedOpportunities,
		event: normalizedEvent,
		origin: baseOrigin
	});

	return {
		event: normalizedEvent,
		opportunities: normalizedOpportunities,
		volunteerName,
		host: hostDetails,
		portalUrl,
		shiftDetails,
		requireConfirmation,
		origin: baseOrigin
	};
}

export function createPreviewContext({ eventDetails = {}, opportunities = [], origin } = {}) {
	const context = createMergeContext({
		eventDetails,
		opportunities,
		volunteer: { name: 'Jordan Volunteer' },
		assignments: [
			{ id: 'sample-assignment', shiftId: opportunities?.[0]?.shifts?.[0]?.id ?? 'shift-1' }
		],
		origin
	});
	return context;
}

export const VOLUNTEER_MERGE_TAGS = MERGE_TAG_DEFINITIONS.map(
	({ token, label, description, block }) => ({
		token,
		label,
		description,
		block: !!block
	})
);

export function getMergeTagExample(token, context, format = 'text') {
	const definition = MERGE_TAG_DEFINITIONS.find((item) => item.token === token);
	if (!definition) return '';
	const resolved = definition.resolve?.(context) ?? { text: '', html: '' };
	return format === 'html' ? (resolved.html ?? '') : (resolved.text ?? '');
}

export { VOLUNTEER_PORTAL_PATH };
