import { getGroupClaimStatus } from '#lib/server/groupClaimStatus.js';
import { invalidateGroupSnapshotCache } from '#lib/server/groupSnapshots.js';

const VALID_EVENT_TYPES = new Set(['ride', 'volunteer']);
const MAX_MESSAGE_LENGTH = 1000;
const SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR =
	'Event sponsorship requests are temporarily unavailable while database updates finish applying.';

/** @param {unknown} value */
function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

/** @param {any} error */
export function isMissingSponsorshipSchemaError(error) {
	if (!error) return false;
	const code = safeTrim(error.code).toUpperCase();
	if (code === '42P01' || code === 'PGRST205') return true;
	const combined = `${safeTrim(error.message)} ${safeTrim(error.details)} ${safeTrim(error.hint)}`;
	return (
		/event_sponsorship_requests/i.test(combined) &&
		/(does not exist|schema cache|could not find)/i.test(combined)
	);
}

/** @param {unknown} value */
function escapeHtml(value) {
	return safeTrim(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * @param {string | null | undefined} isoValue
 * @param {string} [timezone]
 */
function formatEventDateLabel(isoValue, timezone = 'UTC') {
	if (!isoValue) return 'Date TBD';
	const parsed = new Date(isoValue);
	if (Number.isNaN(parsed.getTime())) return 'Date TBD';
	try {
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZone: timezone || 'UTC'
		}).format(parsed);
	} catch {
		return parsed.toISOString();
	}
}

/**
 * Determine whether a ride update needs to authorize a new host_group_id.
 * Preserves unchanged host_group_id when invited co-hosts edit other ride details.
 *
 * @param {string | null | undefined} existingHostGroupId
 * @param {string | null | undefined} nextHostGroupId
 */
export function shouldAuthorizeRideHostGroupChange(existingHostGroupId, nextHostGroupId) {
	const next = safeTrim(nextHostGroupId);
	if (!next) return false;
	return next !== safeTrim(existingHostGroupId);
}

/**
 * Resolve the updated host_user_id on ride edits without clobbering the primary
 * host when an invited co-host saves changes.
 *
 * @param {{
 *   existingHostUserId?: string | null,
 *   editorUserId?: string | null,
 *   isHost?: boolean,
 *   sponsorshipGroupId?: string | null
 * }} [options]
 */
export function resolveUpdatedRideHostUserId({
	existingHostUserId = null,
	editorUserId = null,
	isHost = false,
	sponsorshipGroupId = null
} = {}) {
	const existing = safeTrim(existingHostUserId) || null;
	const editor = safeTrim(editorUserId) || null;
	if (safeTrim(sponsorshipGroupId)) {
		return existing || editor;
	}
	if (isHost) {
		return existing || editor;
	}
	if (existing && existing !== editor) {
		return existing;
	}
	return null;
}

/**
 * @param {any} supabase
 * @param {any} serviceSupabase
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} groupId
 */
export async function canUserManageGroupCore(supabase, serviceSupabase, userId, groupId) {
	if (!userId || !groupId) return false;
	const db = serviceSupabase || supabase;
	if (!db) return false;

	const [{ data: memberRows }, { data: profile }] = await Promise.all([
		db
			.from('group_members')
			.select('role')
			.eq('group_id', groupId)
			.eq('user_id', userId)
			.in('role', ['owner', 'admin']),
		db.from('profiles').select('admin').eq('user_id', userId).maybeSingle()
	]);

	if (profile?.admin === true) return true;
	return Array.isArray(memberRows) && memberRows.length > 0;
}

/**
 * @param {any} supabase
 * @param {any} serviceSupabase
 * @param {string | null | undefined} userId
 * @param {Record<string, any> | null | undefined} eventRecord
 */
export async function canUserManageVolunteerEventCore(
	supabase,
	serviceSupabase,
	userId,
	eventRecord
) {
	if (!userId || !eventRecord?.id) return false;
	if (
		String(eventRecord.host_user_id || '') === String(userId) ||
		String(eventRecord.created_by_user_id || '') === String(userId)
	) {
		return true;
	}

	if (supabase?.rpc) {
		const { data, error } = await supabase.rpc('can_manage_volunteer_event', {
			target_event_id: eventRecord.id
		});
		if (!error && typeof data === 'boolean') {
			return data;
		}
	}

	const db = serviceSupabase || supabase;
	if (!db) return false;

	const [{ data: cohostRow }, canManageHostGroup, { data: profile }] = await Promise.all([
		db
			.from('volunteer_event_hosts')
			.select('user_id')
			.eq('event_id', eventRecord.id)
			.eq('user_id', userId)
			.maybeSingle(),
		eventRecord.host_group_id
			? canUserManageGroupCore(supabase, serviceSupabase, userId, eventRecord.host_group_id)
			: Promise.resolve(false),
		db.from('profiles').select('admin').eq('user_id', userId).maybeSingle()
	]);

	return Boolean(cohostRow?.user_id || canManageHostGroup || profile?.admin === true);
}

/**
 * @param {any} supabase
 * @param {any} serviceSupabase
 * @param {string | null | undefined} userId
 * @param {Record<string, any> | null | undefined} eventRecord
 */
async function defaultCanManageRide(supabase, serviceSupabase, userId, eventRecord) {
	if (!userId || !eventRecord?.id) return false;
	if (
		String(eventRecord.host_user_id || '') === String(userId) ||
		String(eventRecord.created_by_user_id || '') === String(userId)
	) {
		return true;
	}
	if (supabase?.rpc) {
		const { data, error } = await supabase.rpc('can_manage_activity', {
			target_activity_event_id: eventRecord.id
		});
		if (!error && typeof data === 'boolean') return data;
	}
	const db = serviceSupabase || supabase;
	if (!db) return false;
	const { data: hostRow } = await db
		.from('activity_hosts')
		.select('user_id')
		.eq('activity_event_id', eventRecord.id)
		.eq('user_id', userId)
		.maybeSingle();
	if (hostRow?.user_id) return true;
	if (eventRecord.host_group_id) {
		return canUserManageGroupCore(supabase, serviceSupabase, userId, eventRecord.host_group_id);
	}
	return false;
}

/**
 * @param {any} serviceSupabase
 * @param {string} eventType
 * @param {string} eventId
 */
async function loadTargetEvent(serviceSupabase, eventType, eventId) {
	if (eventType === 'ride') {
		const { data, error } = await serviceSupabase
			.from('activity_events')
			.select(
				'id, activity_type, title, slug, status, starts_at, ends_at, timezone, host_user_id, created_by_user_id, host_group_id, contact_email'
			)
			.eq('id', eventId)
			.eq('activity_type', 'ride')
			.maybeSingle();
		if (error) throw error;
		return data
			? {
					...data,
					eventType: 'ride',
					startsAt: data.starts_at,
					endsAt: data.ends_at,
					publicPath: data.slug ? `/ride/${encodeURIComponent(data.slug)}` : '/ride'
				}
			: null;
	}

	const { data, error } = await serviceSupabase
		.from('volunteer_events')
		.select(
			'id, title, slug, status, event_start, event_end, timezone, host_user_id, created_by_user_id, host_group_id, contact_email'
		)
		.eq('id', eventId)
		.maybeSingle();
	if (error) throw error;
	return data
		? {
				...data,
				eventType: 'volunteer',
				startsAt: data.event_start,
				endsAt: data.event_end,
				publicPath: data.slug ? `/volunteer/${encodeURIComponent(data.slug)}` : '/volunteer'
			}
		: null;
}

/**
 * @param {any} serviceSupabase
 * @param {Record<string, any> | null | undefined} group
 */
async function resolveGroupManagerEmails(serviceSupabase, group) {
	const emails = new Set();
	const { data: members } = await serviceSupabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', group?.id)
		.eq('role', 'owner');

	const userIds = Array.from(
		new Set((members ?? []).map((/** @type {any} */ row) => row?.user_id).filter(Boolean))
	);

	if (userIds.length > 0) {
		const { data: profiles } = await serviceSupabase
			.from('profiles')
			.select('email')
			.in('user_id', userIds);
		for (const profile of profiles ?? []) {
			const email = safeTrim(profile?.email).toLowerCase();
			if (email && email.includes('@')) {
				emails.add(email);
			}
		}
	}

	if (emails.size === 0) {
		const fallbackEmail = safeTrim(group?.public_contact_email).toLowerCase();
		if (fallbackEmail && fallbackEmail.includes('@')) {
			emails.add(fallbackEmail);
		}
	}

	return Array.from(emails);
}

/**
 * @param {Record<string, any> | null | undefined} row
 * @param {{ group?: Record<string, any> | null, event?: Record<string, any> | null, requesterName?: string }} [context]
 */
function hydrateRequestSummary(row, { group = null, event = null, requesterName = '' } = {}) {
	if (!row) return null;
	const eventType = row.activity_event_id ? 'ride' : 'volunteer';
	return {
		id: row.id,
		groupId: row.group_id,
		groupName: group?.name ?? '',
		groupSlug: group?.slug ?? '',
		requesterUserId: row.requester_user_id,
		requesterName: requesterName || 'Community organizer',
		eventType,
		eventId: row.activity_event_id || row.volunteer_event_id,
		activityEventId: row.activity_event_id ?? null,
		volunteerEventId: row.volunteer_event_id ?? null,
		eventTitle: event?.title ?? 'Untitled event',
		eventSlug: event?.slug ?? '',
		eventStatus: event?.status ?? 'draft',
		eventStartsAt: event?.startsAt ?? event?.starts_at ?? event?.event_start ?? null,
		eventTimezone: event?.timezone ?? 'UTC',
		eventPublicPath:
			event?.publicPath ??
			(event?.slug
				? eventType === 'ride'
					? `/ride/${encodeURIComponent(event.slug)}`
					: `/volunteer/${encodeURIComponent(event.slug)}`
				: ''),
		message: row.message ?? '',
		status: row.status,
		decisionNote: row.decision_note ?? '',
		reviewedAt: row.reviewed_at ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

/**
 * @param {{
 *   serviceSupabase?: any,
 *   activityEventId?: string | null,
 *   volunteerEventId?: string | null
 * }} [options]
 */
export async function loadActiveEventSponsorshipRequestCore({
	serviceSupabase = null,
	activityEventId = null,
	volunteerEventId = null
} = {}) {
	if (!serviceSupabase || (!activityEventId && !volunteerEventId)) return null;

	let rows = null;
	try {
		let query = serviceSupabase
			.from('event_sponsorship_requests')
			.select('*')
			.in('status', ['pending', 'declined'])
			.order('created_at', { ascending: false })
			.limit(1);

		if (activityEventId) {
			query = query.eq('activity_event_id', activityEventId);
		} else {
			query = query.eq('volunteer_event_id', volunteerEventId);
		}

		const { data, error } = await query;
		if (error) {
			if (!isMissingSponsorshipSchemaError(error)) {
				console.warn('Unable to load active sponsorship request', error);
			}
			return null;
		}
		rows = data;
	} catch (error) {
		if (!isMissingSponsorshipSchemaError(error)) {
			console.warn('Unable to load active sponsorship request', error);
		}
		return null;
	}
	const row = rows?.[0];
	if (!row) return null;

	const { data: group } = await serviceSupabase
		.from('groups')
		.select('id, name, slug, city, state_region')
		.eq('id', row.group_id)
		.maybeSingle();

	return hydrateRequestSummary(row, { group });
}

/**
 * @param {{
 *   serviceSupabase?: any,
 *   activityEventId?: string | null,
 *   volunteerEventId?: string | null
 * }} [options]
 */
export async function cancelPendingSponsorshipRequestsForEventCore({
	serviceSupabase = null,
	activityEventId = null,
	volunteerEventId = null
} = {}) {
	if (!serviceSupabase || (!activityEventId && !volunteerEventId)) return;
	const nowIso = new Date().toISOString();
	try {
		let query = serviceSupabase
			.from('event_sponsorship_requests')
			.update({ status: 'cancelled', updated_at: nowIso })
			.eq('status', 'pending');

		if (activityEventId) {
			query = query.eq('activity_event_id', activityEventId);
		} else {
			query = query.eq('volunteer_event_id', volunteerEventId);
		}
		const { error } = await query;
		if (error && !isMissingSponsorshipSchemaError(error)) {
			console.warn('Unable to cancel superseded sponsorship requests', error);
		}
	} catch (error) {
		if (!isMissingSponsorshipSchemaError(error)) {
			console.warn('Unable to cancel superseded sponsorship requests', error);
		}
	}
}

/**
 * @param {{
 *   supabase?: any,
 *   serviceSupabase?: any,
 *   user?: Record<string, any> | null,
 *   eventType?: string,
 *   eventId?: string,
 *   groupId?: string,
 *   message?: string | null,
 *   fetchImpl?: any,
 *   canManageRideFn?: ((supabase: any, activityEventId: string) => Promise<boolean> | boolean) | null,
 *   sendEmailFn?: ((payload: any, opts?: any) => Promise<any>) | null,
 *   publicOrigin?: string
 * }} [options]
 */
export async function createOrUpdateEventSponsorshipRequestCore({
	supabase = null,
	serviceSupabase = null,
	user = null,
	eventType = '',
	eventId = '',
	groupId = '',
	message = '',
	fetchImpl = undefined,
	canManageRideFn = null,
	sendEmailFn = null,
	publicOrigin = 'https://3fp.org'
} = {}) {
	if (!user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}
	if (!serviceSupabase) {
		return { ok: false, status: 503, error: 'Sponsorship requests are temporarily unavailable.' };
	}

	const normalizedType = safeTrim(eventType).toLowerCase();
	const normalizedEventId = safeTrim(eventId);
	const normalizedGroupId = safeTrim(groupId);
	const normalizedMessage = safeTrim(message).slice(0, MAX_MESSAGE_LENGTH) || null;

	if (!VALID_EVENT_TYPES.has(normalizedType) || !normalizedEventId || !normalizedGroupId) {
		return {
			ok: false,
			status: 400,
			error: 'Event type, event ID, and target organization are required.'
		};
	}

	const [targetEvent, { data: group, error: groupError }] = await Promise.all([
		loadTargetEvent(serviceSupabase, normalizedType, normalizedEventId).catch((err) => {
			console.error('Unable to load event for sponsorship request', err);
			return null;
		}),
		serviceSupabase
			.from('groups')
			.select('id, name, slug, city, state_region, public_contact_email')
			.eq('id', normalizedGroupId)
			.maybeSingle()
	]);

	if (!targetEvent) {
		return { ok: false, status: 404, error: 'Event not found.' };
	}
	if (groupError || !group) {
		return { ok: false, status: 404, error: 'Organization not found.' };
	}

	const canManageEvent =
		normalizedType === 'ride'
			? canManageRideFn
				? await Promise.resolve(canManageRideFn(supabase, normalizedEventId)).catch(() => false)
				: await defaultCanManageRide(supabase, serviceSupabase, user.id, targetEvent)
			: await canUserManageVolunteerEventCore(supabase, serviceSupabase, user.id, targetEvent);

	if (!canManageEvent) {
		return {
			ok: false,
			status: 403,
			error: 'You do not have permission to request sponsorship for this event.'
		};
	}

	const isClaimed = await getGroupClaimStatus(serviceSupabase, group.id);
	if (isClaimed === false) {
		return {
			ok: false,
			status: 409,
			code: 'GROUP_UNCLAIMED',
			error:
				'This organization is unclaimed. Claim it inline to publish under its name, or continue with personal hosting.'
		};
	}

	const alreadyManagesGroup = await canUserManageGroupCore(
		supabase,
		serviceSupabase,
		user.id,
		group.id
	);
	if (alreadyManagesGroup) {
		return {
			ok: false,
			status: 409,
			code: 'GROUP_ALREADY_MANAGED',
			error: 'You already manage this organization and can attach it directly.'
		};
	}

	const nowIso = new Date().toISOString();
	const eventColumn = normalizedType === 'ride' ? 'activity_event_id' : 'volunteer_event_id';
	let existingPending = null;
	try {
		const { data: pendingRow, error: pendingError } = await serviceSupabase
			.from('event_sponsorship_requests')
			.select('*')
			.eq(eventColumn, normalizedEventId)
			.eq('status', 'pending')
			.maybeSingle();
		if (pendingError) {
			if (isMissingSponsorshipSchemaError(pendingError)) {
				return {
					ok: false,
					status: 503,
					code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
					error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
				};
			}
			console.error('Unable to query pending sponsorship request', pendingError);
			return { ok: false, status: 400, error: 'Unable to create sponsorship request.' };
		}
		existingPending = pendingRow;
	} catch (error) {
		if (isMissingSponsorshipSchemaError(error)) {
			return {
				ok: false,
				status: 503,
				code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
				error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
			};
		}
		console.error('Unable to query pending sponsorship request', error);
		return { ok: false, status: 400, error: 'Unable to create sponsorship request.' };
	}

	if (targetEvent.host_group_id !== null) {
		const tableName = normalizedType === 'ride' ? 'activity_events' : 'volunteer_events';
		const { error: resetHostGroupError } = await serviceSupabase
			.from(tableName)
			.update({
				host_group_id: null,
				host_user_id: targetEvent.host_user_id || user.id,
				updated_at: nowIso
			})
			.eq('id', normalizedEventId);
		if (resetHostGroupError) {
			console.error(
				'Unable to switch event to personal hosting for sponsorship',
				resetHostGroupError
			);
			return { ok: false, status: 400, error: 'Unable to update event hosting state.' };
		}
		targetEvent.host_group_id = null;
	}

	if (existingPending && String(existingPending.group_id) === String(group.id)) {
		const { data: updatedRow, error: updateError } = await serviceSupabase
			.from('event_sponsorship_requests')
			.update({
				message: normalizedMessage,
				updated_at: nowIso
			})
			.eq('id', existingPending.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Unable to update existing sponsorship request', updateError);
			return { ok: false, status: 400, error: 'Unable to update sponsorship request.' };
		}

		return {
			ok: true,
			status: 200,
			notified: false,
			data: hydrateRequestSummary(updatedRow, { group, event: targetEvent })
		};
	}

	if (existingPending) {
		await serviceSupabase
			.from('event_sponsorship_requests')
			.update({ status: 'cancelled', updated_at: nowIso })
			.eq('id', existingPending.id);
	}

	const insertPayload = {
		group_id: group.id,
		requester_user_id: user.id,
		activity_event_id: normalizedType === 'ride' ? normalizedEventId : null,
		volunteer_event_id: normalizedType === 'volunteer' ? normalizedEventId : null,
		message: normalizedMessage,
		status: 'pending',
		created_at: nowIso,
		updated_at: nowIso
	};

	const { data: createdRow, error: insertError } = await serviceSupabase
		.from('event_sponsorship_requests')
		.insert(insertPayload)
		.select('*')
		.single();

	if (insertError) {
		if (isMissingSponsorshipSchemaError(insertError)) {
			return {
				ok: false,
				status: 503,
				code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
				error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
			};
		}
		console.error('Unable to create sponsorship request', insertError);
		return { ok: false, status: 400, error: 'Unable to create sponsorship request.' };
	}

	const { data: requesterProfile } = await serviceSupabase
		.from('profiles')
		.select('full_name, email')
		.eq('user_id', user.id)
		.maybeSingle();

	const requesterName =
		safeTrim(requesterProfile?.full_name) ||
		safeTrim(requesterProfile?.email) ||
		safeTrim(user.email) ||
		'A local organizer';

	let notified = false;
	try {
		const recipients = await resolveGroupManagerEmails(serviceSupabase, group);
		if (recipients.length > 0 && typeof sendEmailFn === 'function') {
			const baseOrigin = safeTrim(publicOrigin).replace(/\/$/, '');
			const manageUrl = baseOrigin
				? `${baseOrigin}/groups/${encodeURIComponent(group.slug)}/manage#sponsorship-requests`
				: `/groups/${encodeURIComponent(group.slug)}/manage#sponsorship-requests`;
			const eventLabel = normalizedType === 'ride' ? 'ride' : 'volunteer event';
			const whenLabel = formatEventDateLabel(targetEvent.startsAt, targetEvent.timezone);

			const textLines = [
				`${requesterName} requested ${group.name} sponsorship for a ${eventLabel}: "${targetEvent.title}".`,
				`When: ${whenLabel}`,
				normalizedMessage ? `Note from organizer: ${normalizedMessage}` : null,
				'',
				'Review and approve or decline this request in your group dashboard:',
				manageUrl
			].filter((line) => line !== null);

			const html = `
				<p><strong>${escapeHtml(requesterName)}</strong> requested <strong>${escapeHtml(group.name)}</strong> sponsorship for a ${escapeHtml(eventLabel)}.</p>
				<ul>
					<li><strong>Event:</strong> ${escapeHtml(targetEvent.title)}</li>
					<li><strong>When:</strong> ${escapeHtml(whenLabel)}</li>
					${normalizedMessage ? `<li><strong>Organizer note:</strong> ${escapeHtml(normalizedMessage)}</li>` : ''}
				</ul>
				<p><a href="${escapeHtml(manageUrl)}">Review request in your group dashboard</a></p>
			`.trim();

			await sendEmailFn(
				{
					to: recipients,
					subject: `Sponsorship request for ${group.name}: ${targetEvent.title}`,
					text: textLines.join('\n'),
					html,
					replyTo: safeTrim(targetEvent.contact_email || requesterProfile?.email) || undefined,
					tags: [
						{ Name: 'context', Value: 'event-sponsorship-request' },
						{ Name: 'event_type', Value: normalizedType }
					]
				},
				{ fetch: fetchImpl }
			);
			notified = true;
		}
	} catch (emailError) {
		console.warn('Sponsorship request saved, but notification email failed', emailError);
	}

	return {
		ok: true,
		status: 201,
		notified,
		data: hydrateRequestSummary(createdRow, {
			group,
			event: targetEvent,
			requesterName
		})
	};
}

/**
 * @param {{
 *   supabase?: any,
 *   serviceSupabase?: any,
 *   user?: Record<string, any> | null,
 *   requestId?: string,
 *   eventType?: string,
 *   eventId?: string,
 *   canManageRideFn?: ((supabase: any, activityEventId: string) => Promise<boolean> | boolean) | null
 * }} [options]
 */
export async function cancelEventSponsorshipRequestCore({
	supabase = null,
	serviceSupabase = null,
	user = null,
	requestId = '',
	eventType = '',
	eventId = '',
	canManageRideFn = null
} = {}) {
	if (!user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}
	if (!serviceSupabase) {
		return { ok: false, status: 503, error: 'Sponsorship requests are temporarily unavailable.' };
	}

	let query = serviceSupabase
		.from('event_sponsorship_requests')
		.select('*')
		.eq('status', 'pending');

	if (safeTrim(requestId)) {
		query = query.eq('id', safeTrim(requestId));
	} else if (VALID_EVENT_TYPES.has(safeTrim(eventType).toLowerCase()) && safeTrim(eventId)) {
		const col =
			safeTrim(eventType).toLowerCase() === 'ride' ? 'activity_event_id' : 'volunteer_event_id';
		query = query.eq(col, safeTrim(eventId));
	} else {
		return { ok: false, status: 400, error: 'Request ID or event target is required.' };
	}

	let row = null;
	try {
		const { data: fetchedRow, error } = await query.maybeSingle();
		if (error) {
			if (isMissingSponsorshipSchemaError(error)) {
				return {
					ok: false,
					status: 503,
					code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
					error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
				};
			}
			console.error('Unable to look up sponsorship request to cancel', error);
			return { ok: false, status: 400, error: 'Unable to cancel sponsorship request.' };
		}
		row = fetchedRow;
	} catch (error) {
		if (isMissingSponsorshipSchemaError(error)) {
			return {
				ok: false,
				status: 503,
				code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
				error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
			};
		}
		console.error('Unable to look up sponsorship request to cancel', error);
		return { ok: false, status: 400, error: 'Unable to cancel sponsorship request.' };
	}
	if (!row) {
		return { ok: true, status: 200, data: { cancelled: false } };
	}

	let authorized = String(row.requester_user_id) === String(user.id);
	if (!authorized) {
		const rowEventType = row.activity_event_id ? 'ride' : 'volunteer';
		const rowEventId = row.activity_event_id || row.volunteer_event_id;
		const targetEvent = await loadTargetEvent(serviceSupabase, rowEventType, rowEventId).catch(
			() => null
		);
		if (targetEvent) {
			authorized =
				rowEventType === 'ride'
					? canManageRideFn
						? await Promise.resolve(canManageRideFn(supabase, rowEventId)).catch(() => false)
						: await defaultCanManageRide(supabase, serviceSupabase, user.id, targetEvent)
					: await canUserManageVolunteerEventCore(supabase, serviceSupabase, user.id, targetEvent);
		}
	}

	if (!authorized) {
		return { ok: false, status: 403, error: 'You do not have permission to cancel this request.' };
	}

	const nowIso = new Date().toISOString();
	const { error: cancelError } = await serviceSupabase
		.from('event_sponsorship_requests')
		.update({ status: 'cancelled', updated_at: nowIso })
		.eq('id', row.id);

	if (cancelError) {
		console.error('Unable to cancel sponsorship request', cancelError);
		return { ok: false, status: 400, error: 'Unable to cancel sponsorship request.' };
	}

	return { ok: true, status: 200, data: { cancelled: true, id: row.id } };
}

/**
 * @param {{
 *   serviceSupabase?: any,
 *   groupId?: string | null,
 *   group?: Record<string, any> | null,
 *   limit?: number
 * }} [options]
 */
export async function listGroupSponsorshipRequestsCore({
	serviceSupabase = null,
	groupId = null,
	group = null,
	limit = 50
} = {}) {
	if (!serviceSupabase || !groupId) return [];

	let rows = null;
	try {
		const { data, error } = await serviceSupabase
			.from('event_sponsorship_requests')
			.select('*')
			.eq('group_id', groupId)
			.in('status', ['pending', 'approved', 'declined'])
			.order('created_at', { ascending: false })
			.limit(Math.max(1, Math.min(200, Number(limit) || 50)));

		if (error || !Array.isArray(data) || data.length === 0) {
			if (error && !isMissingSponsorshipSchemaError(error)) {
				console.warn('Unable to list group sponsorship requests', error);
			}
			return [];
		}
		rows = data;
	} catch (error) {
		if (!isMissingSponsorshipSchemaError(error)) {
			console.warn('Unable to list group sponsorship requests', error);
		}
		return [];
	}

	const activityIds = Array.from(new Set(rows.map((r) => r.activity_event_id).filter(Boolean)));
	const volunteerIds = Array.from(new Set(rows.map((r) => r.volunteer_event_id).filter(Boolean)));
	const requesterIds = Array.from(new Set(rows.map((r) => r.requester_user_id).filter(Boolean)));

	const [activityRes, volunteerRes, profilesRes] = await Promise.all([
		activityIds.length
			? serviceSupabase
					.from('activity_events')
					.select('id, title, slug, status, starts_at, timezone')
					.in('id', activityIds)
			: Promise.resolve({ data: [] }),
		volunteerIds.length
			? serviceSupabase
					.from('volunteer_events')
					.select('id, title, slug, status, event_start, timezone')
					.in('id', volunteerIds)
			: Promise.resolve({ data: [] }),
		requesterIds.length
			? serviceSupabase
					.from('profiles')
					.select('user_id, full_name, email')
					.in('user_id', requesterIds)
			: Promise.resolve({ data: [] })
	]);

	const activitiesById = new Map(
		(activityRes.data ?? []).map((/** @type {any} */ item) => [
			String(item.id),
			{
				...item,
				startsAt: item.starts_at,
				publicPath: item.slug ? `/ride/${encodeURIComponent(item.slug)}` : '/ride'
			}
		])
	);
	const volunteersById = new Map(
		(volunteerRes.data ?? []).map((/** @type {any} */ item) => [
			String(item.id),
			{
				...item,
				startsAt: item.event_start,
				publicPath: item.slug ? `/volunteer/${encodeURIComponent(item.slug)}` : '/volunteer'
			}
		])
	);
	const requesterNamesById = new Map(
		(profilesRes.data ?? []).map((/** @type {any} */ profile) => [
			String(profile.user_id),
			safeTrim(profile.full_name) || safeTrim(profile.email) || 'Community organizer'
		])
	);

	return rows.map((row) => {
		const event = row.activity_event_id
			? activitiesById.get(String(row.activity_event_id))
			: volunteersById.get(String(row.volunteer_event_id));
		const requesterName =
			requesterNamesById.get(String(row.requester_user_id)) || 'Community organizer';
		return hydrateRequestSummary(row, { group, event, requesterName });
	});
}

/**
 * @param {{
 *   supabase?: any,
 *   serviceSupabase?: any,
 *   user?: Record<string, any> | null,
 *   groupSlug?: string,
 *   requestId?: string,
 *   decision?: string,
 *   decisionNote?: string | null,
 *   fetchImpl?: any,
 *   sendEmailFn?: ((payload: any, opts?: any) => Promise<any>) | null,
 *   invalidateGroupCacheFn?: ((target: any, maybeSlug?: any) => any) | null,
 *   publicOrigin?: string
 * }} [options]
 */
export async function reviewEventSponsorshipRequestCore({
	supabase = null,
	serviceSupabase = null,
	user = null,
	groupSlug = '',
	requestId = '',
	decision = '',
	decisionNote = '',
	fetchImpl = undefined,
	sendEmailFn = null,
	invalidateGroupCacheFn = invalidateGroupSnapshotCache,
	publicOrigin = 'https://3fp.org'
} = {}) {
	if (!user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}
	if (!serviceSupabase) {
		return { ok: false, status: 503, error: 'Sponsorship review is temporarily unavailable.' };
	}

	const normalizedDecision = safeTrim(decision).toLowerCase();
	if (normalizedDecision !== 'approve' && normalizedDecision !== 'decline') {
		return { ok: false, status: 400, error: 'Decision must be "approve" or "decline".' };
	}

	const { data: group, error: groupError } = await serviceSupabase
		.from('groups')
		.select('id, name, slug')
		.eq('slug', safeTrim(groupSlug))
		.maybeSingle();

	if (groupError || !group) {
		return { ok: false, status: 404, error: 'Organization not found.' };
	}

	const canManage = await canUserManageGroupCore(supabase, serviceSupabase, user.id, group.id);
	if (!canManage) {
		return {
			ok: false,
			status: 403,
			error: 'You do not have permission to review sponsorship requests for this organization.'
		};
	}

	let existing = null;
	try {
		const { data: existingRow, error: existingError } = await serviceSupabase
			.from('event_sponsorship_requests')
			.select('*')
			.eq('id', safeTrim(requestId))
			.eq('group_id', group.id)
			.maybeSingle();

		if (existingError) {
			if (isMissingSponsorshipSchemaError(existingError)) {
				return {
					ok: false,
					status: 503,
					code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
					error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
				};
			}
			return { ok: false, status: 404, error: 'Sponsorship request not found.' };
		}
		existing = existingRow;
	} catch (error) {
		if (isMissingSponsorshipSchemaError(error)) {
			return {
				ok: false,
				status: 503,
				code: 'SPONSORSHIP_SCHEMA_UNAVAILABLE',
				error: SPONSORSHIP_SCHEMA_UNAVAILABLE_ERROR
			};
		}
		return { ok: false, status: 404, error: 'Sponsorship request not found.' };
	}

	if (!existing) {
		return { ok: false, status: 404, error: 'Sponsorship request not found.' };
	}
	if (existing.status !== 'pending') {
		return {
			ok: false,
			status: 409,
			error: `This sponsorship request was already ${existing.status}.`
		};
	}

	const eventType = existing.activity_event_id ? 'ride' : 'volunteer';
	const eventId = existing.activity_event_id || existing.volunteer_event_id;
	const targetEvent = await loadTargetEvent(serviceSupabase, eventType, eventId).catch(() => null);
	if (!targetEvent) {
		return { ok: false, status: 404, error: 'The requested event is no longer available.' };
	}

	const nowIso = new Date().toISOString();
	const nextStatus = normalizedDecision === 'approve' ? 'approved' : 'declined';
	const cleanNote = safeTrim(decisionNote).slice(0, MAX_MESSAGE_LENGTH) || null;

	const { data: updatedRequest, error: updateError } = await serviceSupabase
		.from('event_sponsorship_requests')
		.update({
			status: nextStatus,
			reviewed_by_user_id: user.id,
			reviewed_at: nowIso,
			decision_note: cleanNote,
			updated_at: nowIso
		})
		.eq('id', existing.id)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();

	if (updateError || !updatedRequest) {
		return {
			ok: false,
			status: 409,
			error: 'Unable to update sponsorship request. Refresh and try again.'
		};
	}

	if (normalizedDecision === 'approve') {
		const tableName = eventType === 'ride' ? 'activity_events' : 'volunteer_events';
		const { error: linkError } = await serviceSupabase
			.from(tableName)
			.update({
				host_group_id: group.id,
				updated_at: nowIso
			})
			.eq('id', eventId);

		if (linkError) {
			console.error('Unable to attach approved host organization to event', linkError);
			return {
				ok: false,
				status: 500,
				error: 'Request marked approved, but linking the organization to the event failed.'
			};
		}

		if (typeof invalidateGroupCacheFn === 'function') {
			invalidateGroupCacheFn({ groupId: group.id, slug: group.slug });
		}
	}

	try {
		const { data: requesterProfile } = await serviceSupabase
			.from('profiles')
			.select('email, full_name')
			.eq('user_id', existing.requester_user_id)
			.maybeSingle();
		const requesterEmail = safeTrim(requesterProfile?.email);
		if (requesterEmail && requesterEmail.includes('@') && typeof sendEmailFn === 'function') {
			const baseOrigin = safeTrim(publicOrigin).replace(/\/$/, '');
			const eventUrl = baseOrigin
				? `${baseOrigin}${targetEvent.publicPath}`
				: targetEvent.publicPath;
			const actionWord = normalizedDecision === 'approve' ? 'approved' : 'declined';
			const textLines = [
				`${group.name} ${actionWord} your sponsorship request for "${targetEvent.title}".`,
				normalizedDecision === 'approve'
					? `${group.name} is now listed as the host organization on your event page.`
					: 'Your event remains under your personal hosting.',
				cleanNote ? `Note from ${group.name}: ${cleanNote}` : null,
				eventUrl ? `View event: ${eventUrl}` : null
			].filter(Boolean);

			await sendEmailFn(
				{
					to: [requesterEmail],
					subject: `Sponsorship ${actionWord}: ${targetEvent.title} (${group.name})`,
					text: textLines.join('\n'),
					html: `<p><strong>${escapeHtml(group.name)}</strong> ${escapeHtml(actionWord)} your sponsorship request for <strong>${escapeHtml(targetEvent.title)}</strong>.</p>${cleanNote ? `<p><strong>Note:</strong> ${escapeHtml(cleanNote)}</p>` : ''}${eventUrl ? `<p><a href="${escapeHtml(eventUrl)}">View event</a></p>` : ''}`,
					tags: [
						{ Name: 'context', Value: 'event-sponsorship-decision' },
						{ Name: 'decision', Value: nextStatus }
					]
				},
				{ fetch: fetchImpl }
			);
		}
	} catch (emailError) {
		console.warn('Sponsorship decision saved, but requester notification failed', emailError);
	}

	return {
		ok: true,
		status: 200,
		data: hydrateRequestSummary(updatedRequest, { group, event: targetEvent })
	};
}
