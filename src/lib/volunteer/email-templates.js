import { escapeHtml } from '$lib/markdown';

function safeTrim(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function formatDateTime(value, timezone, options = {}) {
	if (!value) return '';
	try {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const config = { ...options };
		const tz = timezone || options.timeZone;
		if (tz) config.timeZone = tz;
		if (!config.dateStyle && !config.timeStyle) {
			config.dateStyle = 'medium';
			config.timeStyle = 'short';
		}
		const formatter = new Intl.DateTimeFormat(undefined, config);
		return formatter.format(date);
	} catch (error) {
		try {
			return new Date(value).toLocaleString();
		} catch {
			return '';
		}
	}
}

function isSameDay(startIso, endIso, timezone) {
	if (!startIso || !endIso) return false;
	try {
		const tz = timezone || 'UTC';
		const formatter = new Intl.DateTimeFormat(undefined, {
			timeZone: tz,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric'
		});
		return formatter.format(new Date(startIso)) === formatter.format(new Date(endIso));
	} catch {
		return false;
	}
}

function formatShiftRange(shift, eventTimezone) {
	if (!shift) return 'Shift time coming soon';
	const tz = shift.timezone || eventTimezone;
	const start = formatDateTime(shift.starts_at, tz, { dateStyle: 'medium', timeStyle: 'short' });
	const end = formatDateTime(shift.ends_at, tz, { dateStyle: 'none', timeStyle: 'short' });
	if (shift.starts_at && shift.ends_at) {
		return isSameDay(shift.starts_at, shift.ends_at, tz)
			? `${start} - ${end}`
			: `${start} → ${formatDateTime(shift.ends_at, tz, { dateStyle: 'medium', timeStyle: 'short' })}`;
	}
	return start || end || 'Shift time coming soon';
}

function joinDetails(values, separator = ', ') {
	return values
		.map((value) => safeTrim(value))
		.filter(Boolean)
		.join(separator);
}

function buildShiftDetails(shifts, { event, opportunity }) {
	return shifts.map((shift, index) => {
		const title = shift.title || opportunity?.title || event?.title || `Shift ${index + 1}`;
		const time = formatShiftRange(shift, event?.timezone);
		const locationName =
			shift.location_name || opportunity?.location_name || event?.location_name || '';
		const locationAddress =
			shift.location_address || opportunity?.location_address || event?.location_address || '';
		const notes = shift.notes || opportunity?.location_notes || '';
		return {
			id: shift.id ?? index,
			title,
			time,
			location: joinDetails([locationName, locationAddress]),
			notes: safeTrim(notes)
		};
	});
}

function buildEventDetails(event) {
	const start = formatDateTime(event?.event_start, event?.timezone, {
		dateStyle: 'full',
		timeStyle: 'short'
	});
	const end = formatDateTime(event?.event_end, event?.timezone, {
		dateStyle: 'full',
		timeStyle: 'short'
	});
	const sameDay = isSameDay(event?.event_start, event?.event_end, event?.timezone);
	return {
		title: safeTrim(event?.title) || 'Volunteer Event',
		start,
		end,
		sameDay,
		location: joinDetails([event?.location_name, event?.location_address]),
		timezone: safeTrim(event?.timezone)
	};
}

function buildContactDetails({ event, hostGroup, contactEmail, contactPhone, hostEmail }) {
	const resolvedEmail =
		safeTrim(contactEmail) || safeTrim(event?.contact_email) || safeTrim(hostEmail);
	const phone = safeTrim(contactPhone) || safeTrim(event?.contact_phone);
	const hostName =
		safeTrim(event?.host_name) ||
		safeTrim(hostGroup?.name) ||
		safeTrim(event?.contact_name) ||
		'The host';
	const website = safeTrim(hostGroup?.website_url || hostGroup?.website);
	return { email: resolvedEmail, phone, hostName, website };
}

function htmlList(items) {
	if (!items.length) return '';
	return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function textList(items) {
	if (!items.length) return '';
	return items.map((item) => `• ${item}`).join('\n');
}

export function buildVolunteerStatusUpdateEmail(options) {
	if (!options) return null;
	const {
		event,
		opportunity,
		shifts,
		volunteer,
		hostGroup,
		contactEmail,
		contactPhone,
		hostEmail,
		eventUrl,
		shiftsUrl,
		status
	} = options;

	if (!volunteer?.email) return null;

	const volunteerName = safeTrim(volunteer?.name) || 'there';
	const eventDetails = buildEventDetails(event);
	const shiftDetails = buildShiftDetails(shifts || [], { event, opportunity });
	if (!shiftDetails.length) return null;

	const contactDetails = buildContactDetails({
		event,
		hostGroup,
		contactEmail,
		contactPhone,
		hostEmail
	});

	const replyTo = contactDetails.email || undefined;

	let subject = `An update on your volunteer application for ${eventDetails.title}`;
	let introHtml = 'Thanks for your interest in this volunteer opportunity.';
	let introText = 'Thanks for your interest in this volunteer opportunity.';

	switch (status) {
		case 'approved':
			subject = `You're confirmed for ${eventDetails.title}`;
			introHtml =
				"We're excited to see you! Your shift is confirmed and the host appreciates you volunteering.";
			introText =
				"We're excited to see you! Your shift is confirmed and the host appreciates you volunteering.";
			break;
		case 'pending':
			subject = `Thanks for volunteering for ${eventDetails.title}`;
			introHtml =
				"Thanks for signing up! The host reviews volunteer signups before confirming shifts. We'll notify you once your shift is approved.";
			introText =
				"Thanks for signing up! The host reviews volunteer signups before confirming shifts. We'll notify you once your shift is approved.";
			break;
		case 'waitlisted':
			subject = `You're on the waitlist for ${eventDetails.title}`;
			introHtml =
				"Thank you for your interest in volunteering! The shift you signed up for is currently full, so we've added you to the waitlist. We'll notify you right away if a spot opens up.";
			introText =
				"Thank you for your interest in volunteering! The shift you signed up for is currently full, so we've added you to the waitlist. We'll notify you right away if a spot opens up.";
			break;
		case 'declined':
			subject = `An update on your volunteer application for ${eventDetails.title}`;
			introHtml =
				'Thank you for your interest in volunteering for this event. Unfortunately, the host has declined your application for this shift. Sometimes shifts fill up quickly or plans change. We appreciate you offering to help and encourage you to look for other volunteer opportunities.';
			introText =
				'Thank you for your interest in volunteering for this event. Unfortunately, the host has declined your application for this shift. Sometimes shifts fill up quickly or plans change. We appreciate you offering to help and encourage you to look for other volunteer opportunities.';
			break;
	}

	const shiftHtmlItems = shiftDetails.map((shift) => {
		const pieces = [
			`<strong>${escapeHtml(shift.title)}</strong>: ${escapeHtml(shift.time)}`,
			shift.location ? `Location: ${escapeHtml(shift.location)}` : '',
			shift.notes ? `Notes: ${escapeHtml(shift.notes)}` : ''
		].filter(Boolean);
		return pieces.join('<br />');
	});

	const shiftTextItems = shiftDetails.map((shift, index) => {
		const lines = [`Shift ${index + 1}: ${shift.time}`];
		if (shift.location) lines.push(`Location: ${shift.location}`);
		if (shift.notes) lines.push(`Notes: ${shift.notes}`);
		return lines.join('\n');
	});

	const eventHtmlItems = [
		`<strong>Event:</strong> ${escapeHtml(eventDetails.title)}`,
		eventDetails.start ? `<strong>Starts:</strong> ${escapeHtml(eventDetails.start)}` : '',
		eventDetails.end && !eventDetails.sameDay
			? `<strong>Ends:</strong> ${escapeHtml(eventDetails.end)}`
			: '',
		eventDetails.location ? `<strong>Location:</strong> ${escapeHtml(eventDetails.location)}` : '',
		eventDetails.timezone ? `<strong>Timezone:</strong> ${escapeHtml(eventDetails.timezone)}` : ''
	].filter(Boolean);

	const eventTextItems = [
		`Event: ${eventDetails.title}`,
		eventDetails.start ? `Starts: ${eventDetails.start}` : '',
		eventDetails.end && !eventDetails.sameDay ? `Ends: ${eventDetails.end}` : '',
		eventDetails.location ? `Location: ${eventDetails.location}` : '',
		eventDetails.timezone ? `Timezone: ${eventDetails.timezone}` : ''
	].filter(Boolean);

	const contactHtmlItems = [
		contactDetails.email
			? `<strong>Email:</strong> <a href="mailto:${escapeHtml(contactDetails.email)}">${escapeHtml(contactDetails.email)}</a>`
			: '',
		contactDetails.phone
			? `<strong>Phone:</strong> <a href="tel:${escapeHtml(contactDetails.phone)}">${escapeHtml(contactDetails.phone)}</a>`
			: '',
		contactDetails.website
			? `<strong>Website:</strong> <a href="${escapeHtml(contactDetails.website)}">${escapeHtml(contactDetails.website)}</a>`
			: '',
		contactDetails.hostName ? `<strong>Host:</strong> ${escapeHtml(contactDetails.hostName)}` : ''
	].filter(Boolean);

	const contactTextItems = [
		contactDetails.email ? `Email: ${contactDetails.email}` : '',
		contactDetails.phone ? `Phone: ${contactDetails.phone}` : '',
		contactDetails.website ? `Website: ${contactDetails.website}` : '',
		contactDetails.hostName ? `Host: ${contactDetails.hostName}` : ''
	].filter(Boolean);

	const html = `
<p>Hi ${escapeHtml(volunteerName)},</p>
<p>${introHtml}</p>
<h3>Event details</h3>
${htmlList(eventHtmlItems)}
<h3>Your shift${shiftDetails.length > 1 ? 's' : ''}</h3>
${htmlList(shiftHtmlItems)}
<h3>Stay connected</h3>
${htmlList(
	[
		contactHtmlItems.length
			? htmlList(contactHtmlItems)
			: '<p>The host will follow up with more details soon.</p>',
		shiftsUrl ? `<a href="${escapeHtml(shiftsUrl)}">Manage your volunteer shifts</a>` : '',
		eventUrl ? `<a href="${escapeHtml(eventUrl)}">View the event page</a>` : ''
	].filter(Boolean)
)}
<p>Thank you,<br />${escapeHtml(contactDetails.hostName || 'The 3 Feet Please Team')}</p>
`;

	const textSections = [
		`Hi ${volunteerName},`,
		'',
		introText,
		'',
		'Event details:',
		textList(eventTextItems),
		'',
		'Your shifts:',
		textList(shiftTextItems),
		'',
		'Stay connected:',
		contactTextItems.length
			? textList(contactTextItems)
			: 'The host will follow up with more details soon.',
		shiftsUrl ? `Manage your volunteer shifts: ${shiftsUrl}` : '',
		eventUrl ? `Event page: ${eventUrl}` : '',
		'',
		`Thank you,`,
		contactDetails.hostName || 'The 3 Feet Please Team'
	].filter((line) => line !== undefined && line !== null);

	const text = textSections.join('\n');

	return {
		to: volunteer.email,
		subject,
		html,
		text,
		replyTo,
		tags: [
			{ Name: 'context', Value: 'volunteer-signup-confirmation' },
			event?.id ? { Name: 'volunteer_event_id', Value: String(event.id) } : null,
			opportunity?.id ? { Name: 'volunteer_opportunity_id', Value: String(opportunity.id) } : null
		].filter(Boolean)
	};
}
