import test from 'node:test';
import assert from 'node:assert/strict';
import { json } from '@sveltejs/kit';
import {
	buildSafetyReportDispatchBody,
	dispatchContextualAssistantRequest,
	MODE_MAX_BYTES,
	resolveAssistantDispatch,
	sanitizeDispatchMessages
} from './assistantDispatch.js';
import {
	buildSafetyReportPrompts,
	getContextualModeDefaults,
	getDiscoveryConfigForPathname,
	matchSafetyReportTemplates,
	rideDraftFingerprint,
	summarizeRideDraft,
	verifyAppliedFingerprint,
	verifyBaseFingerprint
} from '#lib/ai/assistantHelpers.js';

function createMockEvent({
	pathname = '/api/ai/assistant',
	origin = 'https://3fp.org',
	headers = {}
} = {}) {
	const reqHeaders = new Headers({
		'content-type': 'application/json',
		origin,
		...headers
	});
	const url = new URL(pathname, 'https://3fp.org');
	return {
		url,
		params: {},
		cookies: {},
		locals: {},
		getClientAddress: () => '203.0.113.10',
		request: new Request(url.toString(), {
			method: 'POST',
			headers: reqHeaders,
			body: '{}'
		})
	};
}

test('resolveAssistantDispatch infers contextual modes from pathname and respects explicit discover override', () => {
	assert.equal(resolveAssistantDispatch({ pathname: '/learn' }).mode, 'learn-library');
	assert.equal(
		resolveAssistantDispatch({ pathname: '/learn/category/commuting' }).mode,
		'learn-library'
	);
	assert.equal(
		resolveAssistantDispatch({ pathname: '/learn/safer-cycling-better-messages' }).mode,
		'safety-report'
	);

	const articleTarget = resolveAssistantDispatch({ pathname: '/learn/safe-passing-basics' });
	assert.equal(articleTarget.mode, 'learn-article');
	assert.equal(articleTarget.articleSlug, 'safe-passing-basics');

	// Viewing an older article revision omits current-article mode
	assert.equal(
		resolveAssistantDispatch({ pathname: '/learn/safe-passing-basics?revision=rev-2' }).mode,
		'discover'
	);
	assert.equal(
		resolveAssistantDispatch({ pathname: '/learn/safe-passing-basics', viewingRevision: true })
			.mode,
		'discover'
	);

	assert.equal(resolveAssistantDispatch({ pathname: '/learn/new' }).mode, 'learn-write');
	assert.equal(
		resolveAssistantDispatch({ pathname: '/learn/safe-passing-basics/edit' }).mode,
		'learn-write'
	);
	assert.equal(resolveAssistantDispatch({ pathname: '/ride/new' }).mode, 'ride-write');
	assert.equal(
		resolveAssistantDispatch({ pathname: '/ride/morning-coffee-roll/manage' }).mode,
		'ride-write'
	);

	const groupTarget = resolveAssistantDispatch({
		pathname: '/groups/desert-spoke/manage/site?view=builder'
	});
	assert.equal(groupTarget.mode, 'group-site-write');
	assert.equal(groupTarget.groupSlug, 'desert-spoke');

	// Explicit discover override always switches to general discovery even on contextual routes
	assert.equal(
		resolveAssistantDispatch({
			mode: 'discover',
			pathname: '/learn/safer-cycling-better-messages'
		}).mode,
		'discover'
	);
	assert.equal(resolveAssistantDispatch({ pathname: '/volunteer' }).mode, 'discover');
});

test('dispatchContextualAssistantRequest enforces exact per-mode byte limits', async () => {
	const handlers = {};
	const event = createMockEvent();

	const overSafetyReport = await dispatchContextualAssistantRequest({
		event,
		payload: {
			mode: 'safety-report',
			messages: [{ role: 'user', content: 'What works?' }]
		},
		byteLength: MODE_MAX_BYTES['safety-report'] + 1,
		handlers
	});
	assert.equal(overSafetyReport.status, 413);

	const overLearn = await dispatchContextualAssistantRequest({
		event,
		payload: {
			mode: 'learn-library',
			messages: [{ role: 'user', content: 'Commuting' }]
		},
		byteLength: MODE_MAX_BYTES['learn-library'] + 1,
		handlers
	});
	assert.equal(overLearn.status, 413);

	const overDiscover = await dispatchContextualAssistantRequest({
		event,
		payload: {
			mode: 'discover',
			messages: [{ role: 'user', content: 'Find rides' }]
		},
		byteLength: MODE_MAX_BYTES.discover + 1,
		handlers
	});
	assert.equal(overDiscover.status, 413);

	// Discover within 64KB returns null so /api/ai/assistant runs the discovery pipeline
	const validDiscover = await dispatchContextualAssistantRequest({
		event,
		payload: {
			mode: 'discover',
			messages: [{ role: 'user', content: 'Find rides' }]
		},
		byteLength: 1024,
		handlers
	});
	assert.equal(validDiscover, null);
});

test('sanitizeDispatchMessages strips synthetic greetings and bounds safety-report history', () => {
	const cleaned = sanitizeDispatchMessages([
		{ id: 'welcome', role: 'assistant', synthetic: true, content: 'Welcome question?' },
		{ role: 'assistant', content: 'Leading orphan greeting?' },
		{ role: 'user', content: 'What does the evidence say about passing?' },
		{ role: 'assistant', content: 'Clear passing distances reduce close passes.' },
		{ role: 'user', content: 'Which studies support that?' }
	]);
	assert.equal(cleaned.length, 3);
	assert.equal(cleaned[0].role, 'user');

	const reportBody = buildSafetyReportDispatchBody(cleaned, '4. Passing Encounters: Lateral Space');
	assert.equal(
		reportBody.question,
		'Which studies support that?\nReport topic: Passing Encounters'
	);
	assert.equal(reportBody.history.length, 2);
});

test('dispatchContextualAssistantRequest delegates learn-library, learn-article, and safety-report preserving status and evidence', async () => {
	let capturedLearnBody = null;
	const handlers = {
		learnAi: async (subEvent) => {
			capturedLearnBody = await subEvent.request.json();
			if (capturedLearnBody.action === 'navigate') {
				return json({
					answer: 'Start with our commuting basics guide.',
					articles: [
						{
							id: 'art-1',
							slug: 'commuting-101',
							title: 'Commuting 101',
							summary: 'Everyday route and visibility tips.',
							category_name: 'Commuting'
						}
					]
				});
			}
			return json({
				answer: 'Signal early and take the lane when narrow.',
				article: { slug: 'commuting-101', title: 'Commuting 101' }
			});
		},
		safetyReportAsk: async (subEvent) => {
			const origin = subEvent.request.headers.get('origin');
			if (origin && origin !== subEvent.url.origin) {
				return json({ error: 'Invalid request origin.', sections: [] }, { status: 403 });
			}
			const body = await subEvent.request.json();
			if (body.question.includes('unavailable')) {
				return json(
					{
						error: 'The report assistant is unavailable right now.',
						sections: [{ id: 'chapter-4', title: '4. Passing Encounters' }]
					},
					{ status: 503 }
				);
			}
			return json({
				answer: 'Specific passing behaviors outperform vague slogans.',
				nextSteps: ['Test with local drivers'],
				sections: [{ id: 'chapter-4', title: '4. Passing Encounters' }],
				sources: [
					{ record: 'R42', title: 'Lateral passing distance study', url: 'https://example.org/r42' }
				]
			});
		}
	};

	const navRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			pathname: '/learn',
			messages: [{ role: 'user', content: 'How do I start commuting?' }]
		},
		byteLength: 200,
		handlers
	});
	assert.equal(navRes.status, 200);
	const navData = await navRes.json();
	assert.equal(navData.mode, 'learn-library');
	assert.equal(navData.recommendations.length, 1);
	assert.equal(navData.recommendations[0].url, '/learn/commuting-101');

	const articleRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			pathname: '/learn/commuting-101',
			messages: [{ role: 'user', content: 'Explain this simply' }]
		},
		byteLength: 200,
		handlers
	});
	const articleData = await articleRes.json();
	assert.equal(articleData.mode, 'learn-article');
	assert.equal(capturedLearnBody.articleSlug, 'commuting-101');
	assert.match(articleData.reply, /Signal early/);

	// Bad Origin on safety report preserves 403
	const badOriginRes = await dispatchContextualAssistantRequest({
		event: createMockEvent({ origin: 'https://evil.example' }),
		payload: {
			mode: 'safety-report',
			messages: [{ role: 'user', content: 'Passing?' }]
		},
		byteLength: 200,
		handlers
	});
	assert.equal(badOriginRes.status, 403);

	// 503 AI_UNAVAILABLE preserves related report sections for citation navigation
	const unavailableRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			mode: 'safety-report',
			messages: [{ role: 'user', content: 'Simulate unavailable service' }]
		},
		byteLength: 200,
		handlers
	});
	assert.equal(unavailableRes.status, 503);
	const unavailableData = await unavailableRes.json();
	assert.equal(unavailableData.reportEvidence.sections[0].id, 'chapter-4');

	// 200 safety report includes sections and sources
	const reportRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			mode: 'safety-report',
			topic: '4. Passing Encounters',
			messages: [{ role: 'user', content: 'What works for passing?' }]
		},
		byteLength: 200,
		handlers
	});
	assert.equal(reportRes.status, 200);
	const reportData = await reportRes.json();
	assert.equal(reportData.reportEvidence.sections[0].id, 'chapter-4');
	assert.equal(reportData.reportEvidence.sources[0].record, 'R42');
});

test('dispatchContextualAssistantRequest delegates authoring modes and preserves auth/rate-limit errors', async () => {
	const handlers = {
		learnAi: async (subEvent) => {
			const body = await subEvent.request.json();
			if (!subEvent.request.headers.get('x-auth')) {
				return json({ error: 'Authentication required.' }, { status: 401 });
			}
			if (body.action === 'takeaways') {
				return json({
					summary: 'Quick pre-ride checklist for new commuters.',
					takeaways: ['Check tire pressure', 'Pack front and rear lights']
				});
			}
			if (body.action === 'audit_alt') {
				return json({
					totalImages: 2,
					flaggedCount: 1,
					proposals: [
						{
							index: 1,
							imageUrl: '/community/1.jpg',
							currentAlt: '1.jpg',
							proposedAlt: 'Open Volunteer Tabling Canva template: neighborhood flyer',
							isDecorative: false,
							isSoleLinkContent: true,
							isCanvaLink: true,
							enclosingLinkUrl: 'https://www.canva.com/design/DAGabc/view',
							sectionHeading: 'Canva Flyers',
							status: 'ok'
						}
					]
				});
			}
			return json({ draft: '# Updated Guide\n\nClear steps for new riders.' });
		},
		rideWriter: async () =>
			json({
				reply: 'Prepared your Saturday coffee ride draft.',
				follow_up_questions: ['Should riders bring lights?'],
				draft: {
					metadata: {
						title: 'Saturday Coffee Spin',
						start_location_name: 'Civic Plaza'
					},
					ride: {
						estimated_distance_miles: 16,
						is_no_drop: true
					}
				}
			}),
		groupSiteDraftChat: async (subEvent) => {
			const body = await subEvent.request.json();
			return json({
				reply: `Prepared a warm homepage update for ${subEvent.params.slug}.`,
				generated: true,
				source: 'ai',
				config: { ...body.currentConfig, site_title: 'Desert Spoke Collective' },
				generationPrompt: 'Warm welcoming community feel',
				summary: ['Site title: Desert Spoke Collective']
			});
		}
	};

	// Unauthenticated learn-write returns 401
	const unauthWrite = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			mode: 'learn-write',
			messages: [{ role: 'user', content: 'Polish my draft' }],
			editorContext: { title: 'Draft', bodyMarkdown: 'Initial text' }
		},
		byteLength: 300,
		handlers
	});
	assert.equal(unauthWrite.status, 401);

	// Authenticated learn-write returns preview proposal with baseMarkdown
	const authedWrite = await dispatchContextualAssistantRequest({
		event: createMockEvent({ headers: { 'x-auth': 'user-1' } }),
		payload: {
			mode: 'learn-write',
			messages: [{ role: 'user', content: 'Polish my draft' }],
			editorContext: { title: 'Draft', bodyMarkdown: 'Initial text', baseMarkdown: 'Initial text' }
		},
		byteLength: 300,
		handlers
	});
	const writeData = await authedWrite.json();
	assert.equal(writeData.proposal.kind, 'learn-draft');
	assert.equal(writeData.proposal.baseMarkdown, 'Initial text');
	assert.match(writeData.proposal.draft, /Updated Guide/);

	// Takeaways preview
	const takeawaysRes = await dispatchContextualAssistantRequest({
		event: createMockEvent({ headers: { 'x-auth': 'user-1' } }),
		payload: {
			mode: 'learn-write',
			learnAction: 'takeaways',
			messages: [{ role: 'user', content: 'Preview takeaways' }],
			editorContext: { title: 'Draft', bodyMarkdown: 'Body', summary: 'Old summary' }
		},
		byteLength: 300,
		handlers
	});
	const takeawaysData = await takeawaysRes.json();
	assert.equal(takeawaysData.proposal.kind, 'learn-takeaways');
	assert.equal(takeawaysData.proposal.baseSummary, 'Old summary');
	assert.equal(takeawaysData.proposal.takeaways.length, 2);

	// Alt-text audit preview (both explicit learnAction and natural-language prompt)
	const altAuditRes = await dispatchContextualAssistantRequest({
		event: createMockEvent({ headers: { 'x-auth': 'user-1' } }),
		payload: {
			mode: 'learn-write',
			learnAction: 'audit_alt',
			messages: [{ role: 'user', content: 'Audit image alt text in my current draft' }],
			editorContext: {
				title: 'Volunteer Outreach',
				bodyMarkdown: '[![1.jpg](/community/1.jpg)](https://www.canva.com/design/DAGabc/view)',
				baseMarkdown: '[![1.jpg](/community/1.jpg)](https://www.canva.com/design/DAGabc/view)'
			}
		},
		byteLength: 400,
		handlers
	});
	const altAuditData = await altAuditRes.json();
	assert.equal(altAuditData.proposal.kind, 'learn-alt-audit');
	assert.equal(altAuditData.proposal.totalImages, 2);
	assert.equal(altAuditData.proposal.flaggedCount, 1);
	assert.equal(altAuditData.proposal.items.length, 1);
	assert.equal(altAuditData.proposal.items[0].isCanvaLink, true);
	assert.equal(altAuditData.proposal.items[0].isSoleLinkContent, true);
	assert.equal(altAuditData.proposal.items[0].selected, true);
	assert.match(altAuditData.reply, /Flagged 1 image/);

	// Ride writer returns preview proposal with baseFingerprint and diff summary
	const initialRide = { title: '', estimatedDistanceMiles: '' };
	const baseFp = rideDraftFingerprint(initialRide);
	const rideRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			pathname: '/ride/new',
			messages: [{ role: 'user', content: 'Saturday coffee ride, 16 miles' }],
			editorContext: { payload: initialRide, fingerprint: baseFp }
		},
		byteLength: 400,
		handlers
	});
	const rideData = await rideRes.json();
	assert.equal(rideData.mode, 'ride-write');
	assert.equal(rideData.proposal.kind, 'ride-draft');
	assert.equal(rideData.proposal.baseFingerprint, baseFp);
	assert.ok(rideData.proposal.summary.some((line) => line.includes('Saturday Coffee Spin')));

	// Group site draft chat delegates slug param and preserves baseFingerprint
	const siteRes = await dispatchContextualAssistantRequest({
		event: createMockEvent(),
		payload: {
			pathname: '/groups/desert-spoke/manage/site',
			messages: [{ role: 'user', content: 'Make it welcoming' }],
			editorContext: {
				currentConfig: { site_title: 'Old Title' },
				baseFingerprint: 'fp-old'
			}
		},
		byteLength: 400,
		handlers
	});
	const siteData = await siteRes.json();
	assert.equal(siteData.mode, 'group-site-write');
	assert.equal(siteData.proposal.kind, 'group-site-draft');
	assert.equal(siteData.proposal.baseFingerprint, 'fp-old');
	assert.match(siteData.reply, /desert-spoke/);
});

test('authoring fingerprint helpers prevent overwriting newer manual edits on apply and undo', () => {
	const initialPayload = { title: 'Morning Ride', summary: 'Easy spin', isNoDrop: true };
	const baseFp = rideDraftFingerprint(initialPayload);
	assert.equal(verifyBaseFingerprint(baseFp, baseFp).ok, true);

	const manuallyEditedFp = rideDraftFingerprint({
		...initialPayload,
		title: 'Morning Gravel Ride'
	});
	const applyCheck = verifyBaseFingerprint(manuallyEditedFp, baseFp);
	assert.equal(applyCheck.ok, false);
	assert.equal(applyCheck.conflict, true);

	const appliedFp = rideDraftFingerprint({
		...initialPayload,
		summary: 'AI updated summary'
	});
	assert.equal(verifyAppliedFingerprint(appliedFp, appliedFp).ok, true);

	const postApplyEditFp = rideDraftFingerprint({
		...initialPayload,
		summary: 'AI updated summary plus manual note'
	});
	const undoCheck = verifyAppliedFingerprint(postApplyEditFp, appliedFp);
	assert.equal(undoCheck.ok, false);
	assert.equal(undoCheck.conflict, true);

	const summaryLines = summarizeRideDraft(initialPayload, {
		metadata: { title: 'Sunrise Coffee Ride', start_location_name: 'Roastery' },
		ride: { estimated_distance_miles: 14, is_no_drop: true }
	});
	assert.ok(summaryLines.some((item) => item.includes('Sunrise Coffee Ride')));
	assert.ok(summaryLines.some((item) => item.includes('Roastery')));
});

test('mode metadata and report template matching cover standard pages and campaign topics', () => {
	for (const path of ['/', '/ride', '/groups', '/volunteer', '/learn', '/get-involved', '/merch']) {
		const discovery = getDiscoveryConfigForPathname(path);
		assert.ok(discovery.starterPrompts.length >= 3);
	}
	const reportDefaults = getContextualModeDefaults('safety-report', {
		topic: '4. Passing Encounters: Space'
	});
	assert.ok(reportDefaults.starterPrompts[0].includes('Passing Encounters'));
	assert.ok(
		buildSafetyReportPrompts('', 'Campaign Kit and Templates').some((prompt) =>
			prompt.includes('pretest draft campaign templates')
		)
	);
	assert.ok(
		buildSafetyReportPrompts('', 'Evidence Table').some((prompt) => prompt.includes('R42'))
	);

	const mockReport = {
		campaignGallery: [
			{
				campaign: '01-give-people-space',
				page: 1,
				assetId: 'asset-pass-1',
				title: 'Give People Space Poster',
				alt: 'Poster showing safe passing',
				src: '/report/pass.webp',
				pdfUrl: '/report/pass.pdf'
			}
		]
	};
	const matched = matchSafetyReportTemplates(mockReport, 'What works for safe passing?');
	assert.equal(matched.length, 1);
	assert.equal(matched[0].assetId, 'asset-pass-1');
});
