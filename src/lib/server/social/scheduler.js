import { SOCIAL_SCHEDULING_INTERVAL_MINUTES } from '$lib/server/social/types';

function toDate(value) {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}

export function getScheduleIntervalMilliseconds(minutes = SOCIAL_SCHEDULING_INTERVAL_MINUTES) {
	const value = Number(minutes);
	if (!Number.isFinite(value) || value <= 0) {
		return SOCIAL_SCHEDULING_INTERVAL_MINUTES * 60_000;
	}
	return Math.floor(value) * 60_000;
}

export function roundToNextScheduleBucket(value, minutes = SOCIAL_SCHEDULING_INTERVAL_MINUTES) {
	const date = toDate(value);
	if (!date) return null;
	const intervalMs = getScheduleIntervalMilliseconds(minutes);
	const rounded = Math.ceil(date.getTime() / intervalMs) * intervalMs;
	return new Date(rounded);
}

export function roundToNearestFutureScheduleBucket(
	value,
	{ now = new Date(), minutes = SOCIAL_SCHEDULING_INTERVAL_MINUTES, requireFuture = true } = {}
) {
	const requestedDate = toDate(value);
	if (!requestedDate) return null;
	const baseNow = toDate(now) || new Date();
	const baseDate =
		requireFuture && requestedDate.getTime() <= baseNow.getTime()
			? new Date(baseNow.getTime() + 1000)
			: requestedDate;
	return roundToNextScheduleBucket(baseDate, minutes);
}

export function normalizeScheduledPostTime(value, { now = new Date() } = {}) {
	const scheduledFor = toDate(value);
	if (!scheduledFor) {
		return { ok: false, error: 'A valid schedule time is required.' };
	}

	const current = toDate(now) || new Date();
	if (scheduledFor.getTime() <= current.getTime()) {
		return { ok: false, error: 'Scheduled time must be in the future.' };
	}

	const scheduleBucket = roundToNearestFutureScheduleBucket(scheduledFor, {
		now: current,
		minutes: SOCIAL_SCHEDULING_INTERVAL_MINUTES,
		requireFuture: false
	});
	if (!scheduleBucket) {
		return { ok: false, error: 'Unable to compute schedule window.' };
	}

	return {
		ok: true,
		scheduledFor,
		scheduleBucket,
		scheduleBucketIso: scheduleBucket.toISOString()
	};
}

export function listUpcomingScheduleBuckets({
	from = new Date(),
	count = 16,
	minutes = SOCIAL_SCHEDULING_INTERVAL_MINUTES
} = {}) {
	const start = roundToNextScheduleBucket(from, minutes);
	if (!start) return [];
	const intervalMs = getScheduleIntervalMilliseconds(minutes);
	const safeCount = Math.max(1, Math.min(96, Number.parseInt(String(count), 10) || 16));
	const buckets = [];
	for (let index = 0; index < safeCount; index += 1) {
		buckets.push(new Date(start.getTime() + index * intervalMs));
	}
	return buckets;
}
