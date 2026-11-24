import { json } from '@sveltejs/kit';
import { getActivityClient } from '#lib/server/activities';
import {
	dispatchContextualAssistantRequest,
	MAX_ASSISTANT_ENVELOPE_BYTES
} from '#lib/server/assistantDispatch.js';
import { enforceRateLimit, readRequestBytes } from '#lib/server/security';
import {
	extractLatestUserMessage,
	normalizeMessages,
	persistLearnedAssistantContext,
	runAssistantTurn,
	safeTrim,
	uniqStrings
} from '#lib/server/assistantCore';
import { POST as learnAiPost } from '../../learn/ai/+server.js';
import { POST as safetyReportAskPost } from '../../learn/safety-report/ask/+server.js';
import { POST as rideWriterPost } from '../ride-writer/+server.js';
import { POST as groupSiteDraftChatPost } from '../../groups/[slug]/site/ai-draft-chat/+server.js';

export const config = { maxDuration: 60 };

const FOCUS_ALLOWED = new Set(['groups', 'rides', 'volunteer']);

function normalizeObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

function summarizeProfileContext(profile) {
	const metadata = normalizeObject(profile?.metadata);
	const recommendationContext = normalizeObject(metadata.recommendation_context);
	const assistantMemory = normalizeObject(metadata.ai_assistant);
	const homeLocation = normalizeObject(recommendationContext.home_location);
	return {
		recommendationContext: {
			location: safeTrim(homeLocation.label || recommendationContext.location).slice(0, 120),
			home_location: homeLocation.label ? homeLocation : null,
			interests: uniqStrings(recommendationContext.interests, 12),
			recommendation_focus: uniqStrings(recommendationContext.recommendation_focus, 3)
				.map((value) => value.toLowerCase())
				.filter((value) => FOCUS_ALLOWED.has(value))
		},
		assistantMemory: {
			learned_location: safeTrim(assistantMemory.learned_location).slice(0, 120),
			learned_interests: uniqStrings(assistantMemory.learned_interests, 12),
			recent_topics: uniqStrings(assistantMemory.recent_topics, 16)
		}
	};
}

async function safeSelect(queryPromise, label) {
	try {
		const { data, error } = await queryPromise;
		if (error) {
			console.warn(`assistant query failed for ${label}`, error);
			return [];
		}
		return Array.isArray(data) ? data : [];
	} catch (error) {
		console.warn(`assistant query threw for ${label}`, error);
		return [];
	}
}

async function loadUserData(supabase, user) {
	if (!user?.id) {
		return {
			profile: null,
			recommendationContext: { location: '', interests: [], recommendation_focus: [] },
			assistantMemory: { learned_location: '', learned_interests: [], recent_topics: [] },
			rideHistory: [],
			volunteerHistory: [],
			groupMemberships: [],
			groupNames: [],
			historyGroupIds: [],
			feedbackEvents: [],
			articleUserWeights: null
		};
	}

	const [
		profileResult,
		rideHistoryRows,
		groupMemberships,
		feedbackEvents,
		articleUserWeightsResult
	] = await Promise.all([
		supabase
			.from('profiles')
			.select('id,user_id,email,metadata')
			.eq('user_id', user.id)
			.maybeSingle(),
		safeSelect(
			supabase
				.from('activity_rsvps')
				.select('id,activity_event_id,status,created_at')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(24),
			'ride history'
		),
		safeSelect(
			supabase
				.from('group_members')
				.select('group_id,role,joined_at')
				.eq('user_id', user.id)
				.order('joined_at', { ascending: false })
				.limit(24),
			'group memberships'
		),
		safeSelect(
			supabase
				.from('learn_article_feedback_events')
				.select('article_id,chunk_id,feedback_type,dwell_seconds,created_at')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(120),
			'learn article feedback'
		),
		supabase
			.from('learn_article_user_weights')
			.select(
				'user_id,lexical_weight,semantic_weight,freshness_weight,personalization_weight,location_weight,diversity_weight'
			)
			.eq('user_id', user.id)
			.maybeSingle()
	]);

	if (profileResult?.error) {
		console.warn('assistant profile lookup failed', profileResult.error);
	}
	if (articleUserWeightsResult?.error) {
		console.warn('assistant article user weights lookup failed', articleUserWeightsResult.error);
	}

	const profile = profileResult?.data || null;
	const contextSummary = summarizeProfileContext(profile);
	const profileEmail = safeTrim(profile?.email || user?.email || '').toLowerCase();

	let volunteerQuery = supabase
		.from('volunteer_signups')
		.select('id,event_id,status,created_at,volunteer_user_id,volunteer_email')
		.order('created_at', { ascending: false })
		.limit(24);
	if (profileEmail) {
		volunteerQuery = volunteerQuery.or(
			`volunteer_user_id.eq.${user.id},volunteer_email.eq.${profileEmail}`
		);
	} else {
		volunteerQuery = volunteerQuery.eq('volunteer_user_id', user.id);
	}

	const rideEventIds = uniqStrings(
		rideHistoryRows.map((row) => row.activity_event_id),
		40
	);
	const membershipGroupIds = uniqStrings(
		groupMemberships.map((row) => row.group_id),
		40
	);

	const [volunteerHistoryRows, rideEvents, memberGroups] = await Promise.all([
		safeSelect(volunteerQuery, 'volunteer history'),
		rideEventIds.length
			? safeSelect(
					supabase
						.from('activity_events')
						.select('id,title,slug,host_group_id,start_location_name,start_location_address')
						.in('id', rideEventIds),
					'ride history events'
				)
			: Promise.resolve([]),
		membershipGroupIds.length
			? safeSelect(
					supabase.from('groups').select('id,name').in('id', membershipGroupIds),
					'member group names'
				)
			: Promise.resolve([])
	]);

	const volunteerEventIds = uniqStrings(
		volunteerHistoryRows.map((row) => row.event_id),
		40
	);
	const volunteerEvents = volunteerEventIds.length
		? await safeSelect(
				supabase
					.from('volunteer_events')
					.select('id,title,slug,host_group_id,location_name,location_address,event_start')
					.in('id', volunteerEventIds),
				'volunteer history events'
			)
		: [];

	const rideEventMap = new Map(rideEvents.map((row) => [String(row.id), row]));
	const volunteerEventMap = new Map(volunteerEvents.map((row) => [String(row.id), row]));
	const groupNameMap = new Map(memberGroups.map((row) => [String(row.id), row.name]));

	const historyGroupIds = uniqStrings(
		[
			...groupMemberships.map((row) => row.group_id),
			...rideEvents.map((row) => row.host_group_id),
			...volunteerEvents.map((row) => row.host_group_id)
		],
		80
	);

	const rideHistory = rideHistoryRows.map((row) => ({
		...row,
		activity: rideEventMap.get(String(row.activity_event_id)) || null
	}));
	const volunteerHistory = volunteerHistoryRows.map((row) => ({
		...row,
		event: volunteerEventMap.get(String(row.event_id)) || null
	}));
	const groupNames = groupMemberships
		.map((row) => groupNameMap.get(String(row.group_id)))
		.filter(Boolean);

	return {
		profile,
		recommendationContext: contextSummary.recommendationContext,
		assistantMemory: contextSummary.assistantMemory,
		rideHistory,
		volunteerHistory,
		groupMemberships,
		groupNames,
		historyGroupIds,
		feedbackEvents,
		articleUserWeights: articleUserWeightsResult?.data || null
	};
}

export async function POST(event) {
	const { request, cookies } = event;
	const rawBody = await readRequestBytes(request, MAX_ASSISTANT_ENVELOPE_BYTES);
	if (!rawBody.ok) {
		const limited = enforceRateLimit(event, {
			name: 'ai-assistant',
			limit: 30,
			windowMs: 10 * 60 * 1000
		});
		if (limited) return limited;
		return json({ error: rawBody.error }, { status: rawBody.status });
	}

	let payload = null;
	try {
		const text = rawBody.value.toString('utf8').trim();
		payload = text ? JSON.parse(text) : null;
	} catch {
		const limited = enforceRateLimit(event, {
			name: 'ai-assistant',
			limit: 30,
			windowMs: 10 * 60 * 1000
		});
		if (limited) return limited;
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		const limited = enforceRateLimit(event, {
			name: 'ai-assistant',
			limit: 30,
			windowMs: 10 * 60 * 1000
		});
		if (limited) return limited;
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	const delegated = await dispatchContextualAssistantRequest({
		event,
		payload,
		byteLength: rawBody.value.byteLength,
		handlers: {
			learnAi: learnAiPost,
			safetyReportAsk: safetyReportAskPost,
			rideWriter: rideWriterPost,
			groupSiteDraftChat: groupSiteDraftChatPost
		}
	});
	if (delegated) return delegated;

	const limited = enforceRateLimit(event, {
		name: 'ai-assistant',
		limit: 30,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;

	const messages = normalizeMessages(
		Array.isArray(payload?.messages)
			? payload.messages.filter((entry) => entry?.synthetic !== true)
			: payload?.messages
	);
	if (!messages.length) {
		return json({ error: 'messages array required' }, { status: 400 });
	}

	const latestUserMessage = extractLatestUserMessage(messages);
	if (!latestUserMessage) {
		return json({ error: 'At least one user message is required.' }, { status: 400 });
	}

	const { supabase, user } = await getActivityClient(cookies);
	const userData = await loadUserData(supabase, user);

	const turnResult = await runAssistantTurn({
		supabase,
		messages,
		user,
		userData,
		requestHeaders: request.headers
	});

	await persistLearnedAssistantContext({
		supabase,
		user,
		profile: userData.profile,
		recommendationContext: userData.recommendationContext,
		assistantMemory: userData.assistantMemory,
		learnedContext: turnResult.learnedContext,
		chatStatedLocation: turnResult.chatGroundedLocation,
		latestUserMessage,
		navigationTarget: turnResult.navigationTarget,
		historyContext: turnResult.historyContext
	});

	return json({
		mode: 'discover',
		reply: turnResult.reply,
		followUpQuestion: turnResult.followUpQuestion || null,
		recommendations: turnResult.recommendations,
		navigationTarget: turnResult.navigationTarget,
		context: turnResult.context
	});
}
