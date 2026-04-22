import { error } from '@sveltejs/kit';
import { buildIcsContent, eventLocation } from '$lib/calendar/links';
import { getActivityServiceClient, loadRideBySlug } from '$lib/server/activities';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function parseDate(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function makeFilename(slug, occurrenceId) {
	const base = (safeTrim(slug) || 'ride').replace(/[^a-z0-9-]/gi, '-');
	const occurrence = safeTrim(occurrenceId).replace(/[^a-z0-9-]/gi, '-');
	return `${base}${occurrence ? `-occurrence-${occurrence}` : ''}.ics`;
}

function selectOccurrence(ride, occurrenceId) {
	const occurrences = Array.isArray(ride?.occurrences) ? ride.occurrences : [];
	if (!occurrences.length) return null;
	if (occurrenceId) {
		return occurrences.find((occurrence) => String(occurrence.id) === String(occurrenceId)) || null;
	}
	const now = Date.now();
	const scheduled = occurrences.filter((occurrence) => occurrence.status === 'scheduled');
	const upcoming = scheduled.find(
		(occurrence) => parseDate(occurrence.starts_at)?.getTime() >= now
	);
	return upcoming || scheduled[0] || occurrences[0] || null;
}

export async function GET({ params, url }) {
	const slug = safeTrim(params.slug);
	if (!slug) throw error(404, 'Ride not found.');

	const supabase = getActivityServiceClient();
	if (!supabase) throw error(500, 'Service role unavailable.');

	const ride = await loadRideBySlug(supabase, slug, { includeTemplates: false }).catch(() => null);
	if (!ride || ride.activity?.status !== 'published') throw error(404, 'Ride not found.');

	const occurrenceId = safeTrim(url.searchParams.get('occurrenceId'));
	const occurrence = selectOccurrence(ride, occurrenceId);
	const title = safeTrim(ride.activity?.title) || 'Ride';
	const start =
		occurrence?.starts_at || ride.activity?.next_occurrence_start || ride.activity?.starts_at;
	const end =
		occurrence?.ends_at || ride.activity?.next_occurrence_end || ride.activity?.ends_at || start;
	const location = eventLocation(
		occurrence?.start_location_name || ride.activity?.start_location_name,
		occurrence?.start_location_address || ride.activity?.start_location_address
	);
	const rideUrl = `${url.origin}/ride/${encodeURIComponent(ride.activity.slug)}`;
	const description = [safeTrim(ride.activity?.summary), safeTrim(ride.activity?.description)]
		.filter(Boolean)
		.join('\n\n');

	const ics = buildIcsContent({
		uid: `ride-${ride.activity.id}-${occurrence?.id || 'default'}@3fp`,
		title,
		start,
		end,
		description,
		location,
		url: rideUrl
	});
	if (!ics) throw error(400, 'This ride does not have a calendar-ready schedule yet.');

	return new Response(ics, {
		status: 200,
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${makeFilename(ride.activity.slug, occurrence?.id)}"`,
			'Cache-Control': 'public, max-age=300'
		}
	});
}
