import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const MAX_LIMIT = 1000;
const CLAIM_ROLE = 'owner';
const MANAGER_ROLES = ['owner', 'admin'];

function asPositiveInt(value, fallback, min, max) {
	const parsed = Number.parseInt(String(value ?? '').trim(), 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, parsed));
}

function toMs(value) {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}

function maxIso(...values) {
	let maxMs = null;
	for (const value of values) {
		const ms = toMs(value);
		if (ms === null) continue;
		if (maxMs === null || ms > maxMs) maxMs = ms;
	}
	return maxMs === null ? null : new Date(maxMs).toISOString();
}

function daysSince(isoValue, nowMs) {
	const ms = toMs(isoValue);
	if (ms === null) return null;
	return Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
}

function healthRank(status) {
	if (status === 'inactive') return 0;
	if (status === 'critical') return 1;
	if (status === 'watch') return 2;
	if (status === 'healthy') return 3;
	return 4;
}

function computeHealth(group, { nowMs, windowDays }) {
	const reasons = [];
	let score = 100;

	const activityInWindow =
		group.activity.rides_published_in_window +
		group.activity.volunteer_events_published_in_window +
		group.activity.news_published_in_window +
		group.social.posts_published_in_window;
	const upcomingCount = group.activity.rides_upcoming + group.activity.volunteer_events_upcoming;
	const lastActivityDays = daysSince(group.signals.last_activity_at, nowMs);

	if (lastActivityDays === null) {
		score -= 50;
		reasons.push('No measurable activity found.');
	} else if (lastActivityDays > windowDays) {
		score -= 35;
		reasons.push(`No activity in the last ${windowDays} days.`);
	}
	if (upcomingCount === 0) {
		score -= 10;
		reasons.push('No upcoming rides or volunteer events.');
	}
	if (group.social.accounts_connected > 0 && group.social.accounts_active === 0) {
		score -= 15;
		reasons.push('Social accounts exist but none are active.');
	}
	if (group.social.posts_failed_in_window >= 3) {
		score -= 15;
		reasons.push('Multiple social posts failed in the current window.');
	}
	if (group.membership.program_enabled && group.membership.active_members === 0) {
		score -= 10;
		reasons.push('Membership is enabled but has no active members.');
	}
	if (activityInWindow > 0) score += 5;
	if (group.membership.active_members > 0) score += 5;

	score = Math.max(0, Math.min(100, score));

	let status = 'healthy';
	if (score < 45) status = 'critical';
	else if (score < 75) status = 'watch';

	if (lastActivityDays !== null && lastActivityDays > 90) {
		status = 'inactive';
		if (!reasons.includes('No meaningful activity for over 90 days.')) {
			reasons.push('No meaningful activity for over 90 days.');
		}
	}

	return {
		score,
		status,
		reasons
	};
}

function initGroupSummary(group, ownerClaimedAt) {
	return {
		group: {
			id: group.id,
			slug: group.slug,
			name: group.name,
			city: group.city,
			state_region: group.state_region,
			created_at: group.created_at || null,
			updated_at: group.updated_at || null
		},
		claim: {
			claimed_at: ownerClaimedAt || null,
			owners_count: 0,
			managers_count: 0
		},
		activity: {
			rides_total: 0,
			rides_published: 0,
			rides_upcoming: 0,
			rides_published_in_window: 0,
			last_ride_published_at: null,
			volunteer_events_total: 0,
			volunteer_events_published: 0,
			volunteer_events_upcoming: 0,
			volunteer_events_published_in_window: 0,
			last_volunteer_event_published_at: null,
			news_posts_total: 0,
			news_published_total: 0,
			news_published_in_window: 0,
			last_news_published_at: null
		},
		social: {
			accounts_connected: 0,
			accounts_active: 0,
			accounts_attention: 0,
			posts_total: 0,
			posts_scheduled: 0,
			posts_failed: 0,
			posts_failed_in_window: 0,
			posts_published_total: 0,
			posts_published_in_window: 0,
			last_post_published_at: null
		},
		membership: {
			program_enabled: false,
			active_members: 0,
			past_due_members: 0,
			pending_applications: 0
		},
		monetization: {
			donations_connected: false
		},
		microsite: {
			config_published: false,
			config_updated_at: null
		},
		signals: {
			last_activity_at: null,
			days_since_last_activity: null
		},
		health: {
			score: 0,
			status: 'critical',
			reasons: []
		}
	};
}

export async function GET({ cookies, url }) {
	await requireAdmin(cookies);

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json(
			{
				error: 'Service role is required for admin group health.'
			},
			{ status: 500 }
		);
	}

	const windowDays = asPositiveInt(
		url.searchParams.get('window_days'),
		DEFAULT_WINDOW_DAYS,
		1,
		MAX_WINDOW_DAYS
	);
	const limit = asPositiveInt(url.searchParams.get('limit'), 0, 0, MAX_LIMIT);

	const now = new Date();
	const nowMs = now.getTime();
	const windowStartMs = nowMs - windowDays * DAY_MS;
	const windowStartIso = new Date(windowStartMs).toISOString();
	const warnings = [];

	const { data: ownerRows, error: ownerError } = await supabase
		.from('group_members')
		.select('group_id,user_id,joined_at')
		.eq('role', CLAIM_ROLE);

	if (ownerError) {
		return json({ error: ownerError.message || 'Unable to load claimed groups.' }, { status: 500 });
	}

	const claimRows = Array.isArray(ownerRows) ? ownerRows : [];
	const claimedGroupIds = Array.from(new Set(claimRows.map((row) => row.group_id).filter(Boolean)));
	if (!claimedGroupIds.length) {
		return json({
			ok: true,
			generated_at: now.toISOString(),
			window_days: windowDays,
			window_start: windowStartIso,
			totals: {
				claimed_groups: 0,
				returned_groups: 0,
				healthy: 0,
				watch: 0,
				critical: 0,
				inactive: 0
			},
			groups: [],
			warnings
		});
	}

	const { data: groupsData, error: groupsError } = await supabase
		.from('groups')
		.select('id,slug,name,city,state_region,created_at,updated_at')
		.in('id', claimedGroupIds);
	if (groupsError) {
		return json({ error: groupsError.message || 'Unable to load groups.' }, { status: 500 });
	}

	const groups = Array.isArray(groupsData) ? groupsData : [];
	const groupsById = new Map();
	const ownerClaimedAtByGroup = new Map();
	for (const row of claimRows) {
		if (!row?.group_id) continue;
		const previous = ownerClaimedAtByGroup.get(row.group_id);
		const previousMs = toMs(previous);
		const currentMs = toMs(row.joined_at);
		if (!previous) {
			ownerClaimedAtByGroup.set(row.group_id, row.joined_at || null);
		} else if (previousMs !== null && currentMs !== null && currentMs < previousMs) {
			ownerClaimedAtByGroup.set(row.group_id, row.joined_at);
		}
	}

	for (const group of groups) {
		groupsById.set(group.id, initGroupSummary(group, ownerClaimedAtByGroup.get(group.id) || null));
	}

	const groupIds = Array.from(groupsById.keys());

	async function fetchRows(table, select, applyFilters = null) {
		let query = supabase.from(table).select(select);
		if (typeof applyFilters === 'function') query = applyFilters(query);
		const { data, error } = await query;
		if (error) {
			warnings.push(`${table}: ${error.message}`);
			return [];
		}
		return Array.isArray(data) ? data : [];
	}

	const [
		managerRows,
		rideRows,
		volunteerRows,
		newsRows,
		socialAccountRows,
		socialPostRows,
		membershipProgramRows,
		membershipRows,
		membershipApplicationRows,
		donationRows,
		micrositeRows
	] = await Promise.all([
		fetchRows('group_members', 'group_id,user_id,role', (q) =>
			q.in('group_id', groupIds).in('role', MANAGER_ROLES)
		),
		fetchRows(
			'activity_events',
			'host_group_id,status,published_at,next_occurrence_start,updated_at,created_at',
			(q) => q.in('host_group_id', groupIds)
		),
		fetchRows(
			'volunteer_events',
			'host_group_id,status,event_start,published_at,updated_at,created_at',
			(q) => q.in('host_group_id', groupIds)
		),
		fetchRows('group_news_posts', 'group_id,published_at,updated_at,created_at', (q) =>
			q.in('group_id', groupIds)
		),
		fetchRows(
			'group_social_accounts',
			'group_id,status,last_sync_at,updated_at,token_expires_at',
			(q) => q.in('group_id', groupIds)
		),
		fetchRows(
			'group_social_posts',
			'group_id,status,published_at,scheduled_for,updated_at,created_at',
			(q) => q.in('group_id', groupIds)
		),
		fetchRows('group_membership_programs', 'group_id,enabled,updated_at', (q) =>
			q.in('group_id', groupIds)
		),
		fetchRows('group_memberships', 'group_id,status,updated_at,created_at', (q) =>
			q.in('group_id', groupIds)
		),
		fetchRows(
			'group_membership_applications',
			'group_id,status,submitted_at,updated_at,created_at',
			(q) => q.in('group_id', groupIds)
		),
		fetchRows(
			'donation_accounts',
			'group_id,stripe_account_id,charges_enabled,payouts_enabled',
			(q) => q.eq('recipient_type', 'group').in('group_id', groupIds)
		),
		fetchRows('group_site_configs', 'group_id,published,updated_at', (q) =>
			q.in('group_id', groupIds)
		)
	]);

	const ownerUserSetByGroup = new Map();
	for (const row of claimRows) {
		if (!row?.group_id || !row?.user_id) continue;
		const key = row.group_id;
		if (!ownerUserSetByGroup.has(key)) ownerUserSetByGroup.set(key, new Set());
		ownerUserSetByGroup.get(key).add(row.user_id);
	}

	const managerUserSetByGroup = new Map();
	for (const row of managerRows) {
		if (!row?.group_id || !row?.user_id) continue;
		const key = row.group_id;
		if (!managerUserSetByGroup.has(key)) managerUserSetByGroup.set(key, new Set());
		managerUserSetByGroup.get(key).add(row.user_id);
	}

	for (const groupId of groupIds) {
		const summary = groupsById.get(groupId);
		if (!summary) continue;
		summary.claim.owners_count = ownerUserSetByGroup.get(groupId)?.size || 0;
		summary.claim.managers_count = managerUserSetByGroup.get(groupId)?.size || 0;
	}

	for (const row of rideRows) {
		const groupId = row?.host_group_id;
		const summary = groupsById.get(groupId);
		if (!summary) continue;

		summary.activity.rides_total += 1;
		if (row.status === 'published') {
			summary.activity.rides_published += 1;
			if (toMs(row.published_at) !== null && toMs(row.published_at) >= windowStartMs) {
				summary.activity.rides_published_in_window += 1;
			}
			summary.activity.last_ride_published_at = maxIso(
				summary.activity.last_ride_published_at,
				row.published_at
			);
		}
		if (toMs(row.next_occurrence_start) !== null && toMs(row.next_occurrence_start) >= nowMs) {
			summary.activity.rides_upcoming += 1;
		}
	}

	for (const row of volunteerRows) {
		const groupId = row?.host_group_id;
		const summary = groupsById.get(groupId);
		if (!summary) continue;

		summary.activity.volunteer_events_total += 1;
		if (row.status === 'published') {
			summary.activity.volunteer_events_published += 1;
			if (toMs(row.published_at) !== null && toMs(row.published_at) >= windowStartMs) {
				summary.activity.volunteer_events_published_in_window += 1;
			}
			summary.activity.last_volunteer_event_published_at = maxIso(
				summary.activity.last_volunteer_event_published_at,
				row.published_at
			);
		}
		if (toMs(row.event_start) !== null && toMs(row.event_start) >= nowMs) {
			summary.activity.volunteer_events_upcoming += 1;
		}
	}

	for (const row of newsRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		summary.activity.news_posts_total += 1;
		if (row.published_at) {
			summary.activity.news_published_total += 1;
			if (toMs(row.published_at) !== null && toMs(row.published_at) >= windowStartMs) {
				summary.activity.news_published_in_window += 1;
			}
			summary.activity.last_news_published_at = maxIso(
				summary.activity.last_news_published_at,
				row.published_at
			);
		}
	}

	for (const row of socialAccountRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		summary.social.accounts_connected += 1;
		if (row.status === 'active') summary.social.accounts_active += 1;
		else summary.social.accounts_attention += 1;
	}

	for (const row of socialPostRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		summary.social.posts_total += 1;
		if (row.status === 'scheduled' || row.status === 'queued') summary.social.posts_scheduled += 1;
		if (row.status === 'failed') {
			summary.social.posts_failed += 1;
			if (toMs(row.updated_at) !== null && toMs(row.updated_at) >= windowStartMs) {
				summary.social.posts_failed_in_window += 1;
			}
		}
		if (row.status === 'published') {
			summary.social.posts_published_total += 1;
			if (toMs(row.published_at) !== null && toMs(row.published_at) >= windowStartMs) {
				summary.social.posts_published_in_window += 1;
			}
			summary.social.last_post_published_at = maxIso(
				summary.social.last_post_published_at,
				row.published_at
			);
		}
	}

	for (const row of membershipProgramRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		if (row.enabled === true) summary.membership.program_enabled = true;
	}

	for (const row of membershipRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		if (row.status === 'active') summary.membership.active_members += 1;
		if (row.status === 'past_due') summary.membership.past_due_members += 1;
	}

	for (const row of membershipApplicationRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		if (
			row.status === 'submitted' ||
			row.status === 'under_review' ||
			row.status === 'payment_pending'
		) {
			summary.membership.pending_applications += 1;
		}
	}

	for (const row of donationRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		summary.monetization.donations_connected = Boolean(
			row?.stripe_account_id && row?.charges_enabled === true
		);
	}

	for (const row of micrositeRows) {
		const summary = groupsById.get(row?.group_id);
		if (!summary) continue;
		summary.microsite.config_published = row?.published === true;
		summary.microsite.config_updated_at = row?.updated_at || null;
	}

	for (const summary of groupsById.values()) {
		const lastActivityAt = maxIso(
			summary.activity.last_ride_published_at,
			summary.activity.last_volunteer_event_published_at,
			summary.activity.last_news_published_at,
			summary.social.last_post_published_at,
			summary.microsite.config_updated_at,
			summary.group.updated_at
		);
		summary.signals.last_activity_at = lastActivityAt;
		summary.signals.days_since_last_activity = daysSince(lastActivityAt, nowMs);
		summary.health = computeHealth(summary, { nowMs, windowDays });
	}

	let groupsOutput = Array.from(groupsById.values());
	groupsOutput.sort((a, b) => {
		const rankDelta = healthRank(a.health.status) - healthRank(b.health.status);
		if (rankDelta !== 0) return rankDelta;
		if (a.health.score !== b.health.score) return a.health.score - b.health.score;
		const aDays = a.signals.days_since_last_activity ?? Number.POSITIVE_INFINITY;
		const bDays = b.signals.days_since_last_activity ?? Number.POSITIVE_INFINITY;
		if (aDays !== bDays) return bDays - aDays;
		return a.group.name.localeCompare(b.group.name);
	});
	if (limit > 0) groupsOutput = groupsOutput.slice(0, limit);

	const totals = {
		claimed_groups: groupsById.size,
		returned_groups: groupsOutput.length,
		healthy: 0,
		watch: 0,
		critical: 0,
		inactive: 0,
		rides_total: 0,
		rides_upcoming: 0,
		volunteer_events_total: 0,
		volunteer_events_upcoming: 0,
		news_posts_total: 0,
		social_accounts_connected: 0,
		social_posts_scheduled: 0,
		membership_active_members: 0,
		groups_with_donations_connected: 0
	};

	for (const group of groupsOutput) {
		if (group.health.status === 'healthy') totals.healthy += 1;
		else if (group.health.status === 'watch') totals.watch += 1;
		else if (group.health.status === 'inactive') totals.inactive += 1;
		else totals.critical += 1;

		totals.rides_total += group.activity.rides_total;
		totals.rides_upcoming += group.activity.rides_upcoming;
		totals.volunteer_events_total += group.activity.volunteer_events_total;
		totals.volunteer_events_upcoming += group.activity.volunteer_events_upcoming;
		totals.news_posts_total += group.activity.news_posts_total;
		totals.social_accounts_connected += group.social.accounts_connected;
		totals.social_posts_scheduled += group.social.posts_scheduled;
		totals.membership_active_members += group.membership.active_members;
		if (group.monetization.donations_connected) totals.groups_with_donations_connected += 1;
	}

	return json({
		ok: true,
		generated_at: now.toISOString(),
		window_days: windowDays,
		window_start: windowStartIso,
		totals,
		groups: groupsOutput,
		warnings
	});
}
