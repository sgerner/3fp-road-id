import { error } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { buildGoogleCalendarUrl, buildIcsContent, eventLocation } from '$lib/calendar/links';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function toDate(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function makeFilename(slug, shiftId) {
	const base = (safeTrim(slug) || 'volunteer-event').replace(/[^a-z0-9-]/gi, '-');
	const shift = safeTrim(shiftId).replace(/[^a-z0-9-]/gi, '-');
	return `${base}${shift ? `-shift-${shift}` : ''}.ics`;
}

async function loadFirstShiftForEvent(supabase, eventId) {
	const { data: opportunities, error: oppError } = await supabase
		.from('volunteer_opportunities')
		.select('id,title,description,location_name,location_address')
		.eq('event_id', eventId)
		.order('title', { ascending: true });
	if (oppError) throw oppError;

	const opportunityIds = (opportunities ?? []).map((row) => row.id).filter(Boolean);
	if (!opportunityIds.length) return { shift: null, opportunity: null };

	const { data: shifts, error: shiftError } = await supabase
		.from('volunteer_opportunity_shifts')
		.select('id,opportunity_id,starts_at,ends_at,timezone,location_name,location_address,notes')
		.in('opportunity_id', opportunityIds)
		.order('starts_at', { ascending: true })
		.limit(1);
	if (shiftError) throw shiftError;

	const shift = shifts?.[0] ?? null;
	const opportunity = shift
		? (opportunities.find((row) => String(row.id) === String(shift.opportunity_id)) ?? null)
		: null;
	return { shift, opportunity };
}

export async function GET({ params, url }) {
	const slug = safeTrim(params.slug);
	if (!slug) throw error(404, 'Volunteer event not found.');

	const supabase = createServiceSupabaseClient();
	if (!supabase) throw error(500, 'Service role unavailable.');

	const { data: eventRow, error: eventError } = await supabase
		.from('volunteer_events')
		.select(
			'id,slug,title,summary,description,event_start,event_end,timezone,location_name,location_address'
		)
		.eq('slug', slug)
		.maybeSingle();
	if (eventError) throw error(500, eventError.message);
	if (!eventRow) throw error(404, 'Volunteer event not found.');

	const shiftId = safeTrim(url.searchParams.get('shiftId'));
	let shift = null;
	let opportunity = null;

	if (shiftId) {
		const { data: shiftRow, error: shiftError } = await supabase
			.from('volunteer_opportunity_shifts')
			.select('id,opportunity_id,starts_at,ends_at,timezone,location_name,location_address,notes')
			.eq('id', shiftId)
			.maybeSingle();
		if (shiftError) throw error(500, shiftError.message);
		if (!shiftRow) throw error(404, 'Shift not found.');

		const { data: opportunityRow, error: oppError } = await supabase
			.from('volunteer_opportunities')
			.select('id,event_id,title,description,location_name,location_address')
			.eq('id', shiftRow.opportunity_id)
			.maybeSingle();
		if (oppError) throw error(500, oppError.message);
		if (!opportunityRow || String(opportunityRow.event_id) !== String(eventRow.id)) {
			throw error(404, 'Shift not found for this event.');
		}

		shift = shiftRow;
		opportunity = opportunityRow;
	} else {
		const first = await loadFirstShiftForEvent(supabase, eventRow.id);
		shift = first.shift;
		opportunity = first.opportunity;
	}

	const titleParts = [safeTrim(eventRow.title) || 'Volunteer event'];
	const opportunityTitle = safeTrim(opportunity?.title);
	if (opportunityTitle && !titleParts[0].toLowerCase().includes(opportunityTitle.toLowerCase())) {
		titleParts.push(opportunityTitle);
	}
	const title = titleParts.join(' - ');
	const start = shift?.starts_at || eventRow.event_start;
	const end = shift?.ends_at || eventRow.event_end || start;
	const location = eventLocation(
		shift?.location_name || opportunity?.location_name || eventRow.location_name,
		shift?.location_address || opportunity?.location_address || eventRow.location_address
	);
	const notes = [
		safeTrim(shift?.notes),
		safeTrim(opportunity?.description),
		safeTrim(eventRow.summary)
	]
		.filter(Boolean)
		.join('\n\n');
	const eventUrl = `${url.origin}/volunteer/${encodeURIComponent(eventRow.slug)}`;
	const googleUrl = buildGoogleCalendarUrl({
		title,
		start,
		end,
		description: notes || safeTrim(eventRow.description),
		location,
		url: eventUrl
	});
	const ics = buildIcsContent({
		uid: `volunteer-${eventRow.id}-${shift?.id || 'event'}@3fp`,
		title,
		start,
		end,
		description: notes || safeTrim(eventRow.description),
		location,
		url: eventUrl
	});
	if (!ics) throw error(400, 'This event does not have a calendar-ready schedule yet.');

	return new Response(ics, {
		status: 200,
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${makeFilename(eventRow.slug, shift?.id)}"`,
			'Cache-Control': 'public, max-age=300',
			'X-Calendar-Google-Url': googleUrl
		}
	});
}
