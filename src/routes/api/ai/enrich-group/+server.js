import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { searchGeocode } from '$lib/server/geocoding';
import {
	getAiConfigurationError,
	isAiModelConfigured,
	getAiModel,
	requireAiModel
} from '$lib/server/ai/models';

// Ensure Vercel runs this on the Node runtime and gives us enough time for the AI call.
export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

const DEFAULT_FETCH_TIMEOUT = 3000; // ms
const SITE_CRAWL_PAGE_LIMIT = 5;
const SITE_CRAWL_BATCH_SIZE = 3;
const SITE_CANDIDATE_LIMIT = 25;
const MAX_TEXT_PER_DOC = 12000;
const MAX_CONTEXT_TEXT_BUDGET = 14000;
const MAX_CONTEXT_TEXT_PER_DOC = 3500;
const MAX_CONTEXT_DOCS = 4;
const MAX_CONTEXT_URLS = 6;
const MAX_STRUCTURED_SNIPPETS = 3;
const MAX_CONTEXT_STRUCTURED_SNIPPETS = 4;
const MAX_ASSET_LINKS = 1;
const MAX_EVIDENCE_SNIPPETS_PER_FIELD = 3;
const MAX_NARRATIVE_EVIDENCE_SNIPPETS = 16;
const MAX_SOCIAL_FALLBACK_SITES = 0;
const RECENT_DAYS_WINDOW = 365;
const ENABLE_GOOGLE_SEARCH_TOOL = false;
const ENABLE_SITEMAP_DISCOVERY = false;
const ENABLE_ASSET_FETCH = false;
const EXTRACTION_PASS_TIMEOUT_MS = 30000;
const EXTRACTION_RETRY_TIMEOUT_MS = 22000;
const NARRATIVE_PASS_TIMEOUT_MS = 12000;
const ENRICHMENT_SOFT_BUDGET_MS = 55000;
const MIN_TIME_LEFT_FOR_NARRATIVE_MS = 8000;
const PRIORITY_FIELDS = [
	'how_to_join_instructions',
	'membership_info',
	'service_area_description',
	'activity_frequency',
	'typical_activity_day_time',
	'preferred_contact_method_instructions'
];
const VOICE_FIELDS = [
	'tagline',
	'description',
	'how_to_join_instructions',
	'membership_info',
	'service_area_description',
	'preferred_contact_method_instructions'
];
const ALL_FIELD_KEYS = [
	'name',
	'tagline',
	'description',
	'city',
	'state_region',
	'country',
	'website_url',
	'public_contact_email',
	'public_phone_number',
	'preferred_contact_method_instructions',
	'how_to_join_instructions',
	'membership_info',
	'specific_meeting_point_address',
	'latitude',
	'longitude',
	'service_area_description',
	'skill_levels_description',
	'activity_frequency',
	'typical_activity_day_time',
	'logo_url',
	'cover_photo_url'
];
const SOCIAL_FIELD_KEYS = [
	'instagram',
	'facebook',
	'x',
	'threads',
	'mastodon',
	'youtube',
	'tiktok',
	'strava',
	'bluesky',
	'linkedin',
	'discord',
	'other'
];
const SOURCE_RELIABILITY_WEIGHTS = {
	'website-root': 1,
	'homepage-link': 0.95,
	'internal-link': 0.92,
	sitemap: 0.88,
	'heuristic-path': 0.84,
	'asset-ics': 0.86,
	'asset-pdf': 0.82,
	'existing-profile': 0.78,
	'instagram-api': 0.8,
	instagram: 0.75,
	facebook: 0.68,
	'url-context': 0.72,
	'user-input': 0.9,
	crawler: 0.82,
	ai: 0.72,
	unknown: 0.62
};
const BROWSER_LIKE_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9'
};

const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['fields', 'categories'],
	properties: {
		fields: {
			type: 'object',
			additionalProperties: false,
			required: ['social_links'],
			properties: {
				name: { type: 'string', nullable: true },
				tagline: { type: 'string', nullable: true },
				description: { type: 'string', nullable: true },
				city: { type: 'string', nullable: true },
				state_region: { type: 'string', nullable: true },
				country: { type: 'string', nullable: true },
				website_url: { type: 'string', nullable: true },
				public_contact_email: { type: 'string', nullable: true },
				public_phone_number: { type: 'string', nullable: true },
				preferred_contact_method_instructions: { type: 'string', nullable: true },
				how_to_join_instructions: { type: 'string', nullable: true },
				membership_info: { type: 'string', nullable: true },
				specific_meeting_point_address: { type: 'string', nullable: true },
				latitude: { type: 'number', nullable: true },
				longitude: { type: 'number', nullable: true },
				service_area_description: { type: 'string', nullable: true },
				skill_levels_description: { type: 'string', nullable: true },
				activity_frequency: { type: 'string', nullable: true },
				typical_activity_day_time: { type: 'string', nullable: true },
				logo_url: { type: 'string', nullable: true },
				cover_photo_url: { type: 'string', nullable: true },
				social_links: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					required: [
						'instagram',
						'facebook',
						'x',
						'threads',
						'mastodon',
						'youtube',
						'tiktok',
						'strava',
						'bluesky',
						'linkedin',
						'discord',
						'other'
					],
					properties: {
						instagram: { type: 'string', nullable: true },
						facebook: { type: 'string', nullable: true },
						x: { type: 'string', nullable: true },
						threads: { type: 'string', nullable: true },
						mastodon: { type: 'string', nullable: true },
						youtube: { type: 'string', nullable: true },
						tiktok: { type: 'string', nullable: true },
						strava: { type: 'string', nullable: true },
						bluesky: { type: 'string', nullable: true },
						linkedin: { type: 'string', nullable: true },
						discord: { type: 'string', nullable: true },
						other: { type: 'string', nullable: true }
					}
				}
			}
		},
		categories: {
			type: 'object',
			additionalProperties: false,
			required: ['group_types', 'audience_focuses', 'riding_disciplines'],
			properties: {
				group_types: { type: 'array', items: { type: 'string' } },
				audience_focuses: { type: 'array', items: { type: 'string' } },
				riding_disciplines: { type: 'array', items: { type: 'string' } }
			}
		}
	}
};

const NARRATIVE_RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['narrative_fields'],
	properties: {
		narrative_fields: {
			type: 'object',
			additionalProperties: false,
			properties: {
				tagline: { type: 'string', nullable: true },
				description: { type: 'string', nullable: true },
				how_to_join_instructions: { type: 'string', nullable: true },
				membership_info: { type: 'string', nullable: true },
				service_area_description: { type: 'string', nullable: true },
				preferred_contact_method_instructions: { type: 'string', nullable: true }
			}
		}
	}
};

/**
 * Fetch a URL and return { url, html, text } with minimal sanitization.
 */
async function fetchAndExtract(url) {
	try {
		const res = await fetchWithTimeout(
			url,
			{ redirect: 'follow', headers: BROWSER_LIKE_HEADERS },
			DEFAULT_FETCH_TIMEOUT
		);
		if (!res || !res.ok) return null;
		const html = await res.text();
		const structured = extractEmbeddedJson(html);
		const pageSignals = extractPageSignals(html);
		const clean = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
			.replace(/<!--([\s\S]*?)-->/g, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return {
			url,
			html,
			text: clean.slice(0, MAX_TEXT_PER_DOC),
			structured,
			pageSignals
		};
	} catch (_) {
		return null;
	}
}

function normalizeUrl(input) {
	if (!input) return null;
	try {
		// If missing scheme, assume https
		if (!/^https?:\/\//i.test(input)) return `https://${input}`;
		return input;
	} catch {
		return null;
	}
}

function buildInstagramUrl(username) {
	if (!username) return null;
	const u = username.replace(/^@/, '').trim();
	if (!u) return null;
	return `https://www.instagram.com/${u}`;
}

function buildFacebookUrl(name) {
	if (!name) return null;
	const n = name.trim();
	if (!n) return null;
	// Prefer groups pattern; if it's a URL already, pass through
	if (/^https?:\/\//i.test(n)) return n;
	return `https://www.facebook.com/${encodeURIComponent(n)}`;
}

export const POST = async ({ request }) => {
	if (!isAiModelConfigured('group_enrichment')) {
		return json({ error: getAiConfigurationError('group_enrichment') }, { status: 503 });
	}
	const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
	const startedAt = Date.now();
	const timeRemaining = () => Math.max(0, ENRICHMENT_SOFT_BUDGET_MS - (Date.now() - startedAt));
	const hasTime = (reserveMs = 0) => timeRemaining() > reserveMs;
	const logStage = (stage, startedMs, details = '') => {
		const elapsed = Date.now() - startedMs;
		const tail = details ? ` ${details}` : '';
		console.info(`[enrich-group:${requestId}] ${stage} in ${elapsed}ms${tail}`);
	};

	const body = await request.json().catch(() => ({}));
	const { instagram, facebook, website, name, existing_profile, existing_categories } = body || {};
	const existingProfile = normalizeExistingProfileInput({
		fields: existing_profile?.fields || existing_profile || {},
		categories: existing_profile?.categories || existing_categories || body?.categories || {},
		extras: existing_profile?.extras || {}
	});
	const existingSocialLinks = existingProfile?.fields?.social_links || {};

	const urls = [];
	const ig = buildInstagramUrl(instagram || existingSocialLinks.instagram || '');
	if (ig) urls.push(ig);
	const fb = buildFacebookUrl(facebook || existingSocialLinks.facebook || '');
	if (fb) urls.push(fb);

	const requestedSite = normalizeUrl(
		website || existingProfile?.fields?.website_url || existingSocialLinks.other || ''
	);
	if (requestedSite) urls.push(requestedSite);

	const socialStartedAt = Date.now();
	const [igDocs, fbDocs] = await Promise.all([
		ig ? scrapeInstagramProfile(ig) : Promise.resolve([]),
		fb ? scrapeFacebookPage(fb) : Promise.resolve([])
	]);
	logStage(
		'social-scrape',
		socialStartedAt,
		`docs=${(igDocs?.length || 0) + (fbDocs?.length || 0)}`
	);
	const socialDocs = dedupeDocs([...igDocs, ...fbDocs]);
	const socialFacts = deriveSocialFactsFromDocs(socialDocs, {
		instagramUrl: ig,
		facebookUrl: fb
	});

	const scraped = [];
	const existingProfileDoc = buildExistingProfileDoc(existingProfile);
	if (existingProfileDoc) scraped.push(existingProfileDoc);
	pushAll(scraped, socialDocs);
	let siteCrawlPlan = [];
	let selectedSite = null;
	const websiteCandidates = buildWebsiteCandidateList({
		requestedSite,
		socialFacts,
		socialDocs
	});
	const crawlStartedAt = Date.now();
	for (const candidate of websiteCandidates) {
		if (!hasTime(20000)) break;
		const bundle = await scrapeWebsiteBundle(candidate, [
			...urls,
			...scraped.map((doc) => doc.url)
		]);
		if (!bundle.docs.length) continue;
		selectedSite = candidate;
		if (!urls.includes(candidate)) urls.push(candidate);
		pushAll(scraped, bundle.docs);
		siteCrawlPlan = bundle.plan;
		break;
	}
	logStage(
		'site-crawl',
		crawlStartedAt,
		`docs=${scraped.length} selected=${selectedSite || 'none'}`
	);

	const hints = buildHighLevelHints(scraped, {
		urls,
		name,
		crawlPlan: siteCrawlPlan,
		socialFacts,
		existingProfile
	});
	const deterministicFacts = extractDeterministicFacts(scraped, {
		name,
		requestedSite,
		selectedSite,
		socialFacts,
		existingProfile
	});
	const context = buildModelContext({
		urls,
		scraped,
		siteCrawlPlan,
		name,
		hints,
		socialFacts,
		deterministicFacts,
		existingProfile
	});

	let aiParsed = null;
	let extractionRaw = '';
	let narrativeRaw = '';
	const aiErrors = [];

	try {
		const extractionModelPrimary = requireAiModel('group_enrichment');
		const extractionModelRetry = getAiModel('group_enrichment_retry');
		const narrativeModel = getAiModel('narrative_text_fast') || extractionModelPrimary;
		let extractionPassStatus = 'ok';

		const extractionPrimaryStartedAt = Date.now();
		let extraction = await withTimeout(
			runExtractionPass({
				client: extractionModelPrimary.client,
				model: extractionModelPrimary.model.model,
				context,
				name
			}),
			EXTRACTION_PASS_TIMEOUT_MS,
			'Extraction pass timeout'
		);
		logStage(
			'ai-extraction-primary',
			extractionPrimaryStartedAt,
			`model=${extractionModelPrimary.model.model}`
		);
		aiParsed = extraction.parsed;
		extractionRaw = extraction.raw;

		const shouldRetryExtraction =
			extractionModelRetry &&
			extractionModelRetry.model.model !== extractionModelPrimary.model.model &&
			hasTime(MIN_TIME_LEFT_FOR_NARRATIVE_MS + 4000) &&
			shouldRetryExtractionPass(aiParsed);
		if (shouldRetryExtraction) {
			const extractionRetryStartedAt = Date.now();
			const retryExtraction = await withTimeout(
				runExtractionPass({
					client: extractionModelRetry.client,
					model: extractionModelRetry.model.model,
					context,
					name
				}),
				EXTRACTION_RETRY_TIMEOUT_MS,
				'Extraction retry timeout'
			).catch(() => null);
			if (retryExtraction) {
				logStage(
					'ai-extraction-retry',
					extractionRetryStartedAt,
					`model=${extractionModelRetry.model.model}`
				);
				const primaryScore = extractionPayloadScore(aiParsed);
				const retryScore = extractionPayloadScore(retryExtraction.parsed);
				if (retryScore >= primaryScore) {
					aiParsed = retryExtraction.parsed;
					extractionRaw = retryExtraction.raw;
					extractionPassStatus = 'retried';
				}
			} else {
				aiErrors.push('Extraction retry timed out; keeping primary extraction result.');
			}
		}

		if (!aiParsed?.fields || !aiParsed?.categories) {
			aiErrors.push('Extraction pass returned non-parseable JSON; deterministic fallback used.');
			extractionPassStatus = 'fallback';
		}

		const resolved = mergeAndResolveFacts({
			aiFields: aiParsed?.fields || {},
			aiCategories: aiParsed?.categories || {},
			deterministicFacts,
			docs: scraped,
			selectedSite,
			requestedSite,
			socialFacts
		});

		let normalized = normalizeAndValidateResult(resolved);
		const locationResolutionPromise = resolveLocationFields({
			fields: normalized.fields,
			socialFacts,
			fieldEvidence: resolved.fieldEvidence
		});
		let locationResolution = { applied: false };
		let narrativePassStatus = 'ok';
		const shouldRunNarrative =
			hasTime(MIN_TIME_LEFT_FOR_NARRATIVE_MS) &&
			shouldRunNarrativePass({ fields: normalized.fields, fieldEvidence: resolved.fieldEvidence });
		if (shouldRunNarrative) {
			const narrativeStartedAt = Date.now();
			const narrativePromise = withTimeout(
				runNarrativePass({
					client: narrativeModel.client,
					model: narrativeModel.model.model,
					facts: normalized.fields,
					categories: normalized.categories,
					evidence: resolved.fieldEvidence,
					name
				}),
				NARRATIVE_PASS_TIMEOUT_MS,
				'Narrative pass timeout'
			);
			const [resolvedLocation, narrative] = await Promise.all([
				locationResolutionPromise,
				narrativePromise
			]);
			locationResolution = resolvedLocation || { applied: false };
			logStage('ai-narrative', narrativeStartedAt, `model=${narrativeModel.model.model}`);
			narrativeRaw = narrative.raw;
			if (narrative.parsed?.narrative_fields) {
				for (const key of VOICE_FIELDS) {
					const value = narrative.parsed.narrative_fields?.[key];
					if (typeof value === 'string' && value.trim()) normalized.fields[key] = value.trim();
				}
				normalized = normalizeAndValidateResult({
					fields: normalized.fields,
					categories: normalized.categories
				});
			} else {
				aiErrors.push(
					'Narrative pass returned non-parseable JSON; retained factual narrative fields.'
				);
				narrativePassStatus = 'fallback';
			}
		} else {
			locationResolution = (await locationResolutionPromise) || { applied: false };
			aiErrors.push('Narrative pass skipped due to quality/time budget.');
			narrativePassStatus = 'skipped';
		}
		normalized.fields = applyFieldQualityGuards({
			fields: normalized.fields,
			existingProfile,
			selectedSite,
			requestedSite
		});

		if (hasTime(1500)) {
			await mirrorImageFields(normalized.fields);
		}

		const metadata = buildEnrichmentMetadata({
			fields: normalized.fields,
			categories: normalized.categories,
			docs: scraped,
			fieldEvidence: resolved.fieldEvidence,
			conflicts: resolved.conflicts,
			selectedSite,
			requestedSite,
			socialFacts,
			aiErrors,
			locationResolution,
			existingProfile
		});
		logStage('total', startedAt, `remaining=${timeRemaining()}ms`);

		return json({
			fields: normalized.fields,
			categories: normalized.categories,
			enrichment_meta: {
				...metadata,
				passes: {
					extraction: extractionPassStatus,
					narrative: narrativePassStatus
				}
			}
		});
	} catch (e) {
		aiErrors.push(`AI pipeline error: ${e.message || e}`);
		logStage('ai-error', startedAt, `${e.message || e}`);
		const resolved = mergeAndResolveFacts({
			aiFields: aiParsed?.fields || {},
			aiCategories: aiParsed?.categories || {},
			deterministicFacts,
			docs: scraped,
			selectedSite,
			requestedSite,
			socialFacts
		});
		const normalized = normalizeAndValidateResult(resolved);
		const locationResolution = await resolveLocationFields({
			fields: normalized.fields,
			socialFacts,
			fieldEvidence: resolved.fieldEvidence
		});
		normalized.fields = applyFieldQualityGuards({
			fields: normalized.fields,
			existingProfile,
			selectedSite,
			requestedSite
		});
		const metadata = buildEnrichmentMetadata({
			fields: normalized.fields,
			categories: normalized.categories,
			docs: scraped,
			fieldEvidence: resolved.fieldEvidence,
			conflicts: resolved.conflicts,
			selectedSite,
			requestedSite,
			socialFacts,
			aiErrors,
			locationResolution,
			existingProfile
		});
		return json({
			fields: normalized.fields,
			categories: normalized.categories,
			enrichment_meta: {
				...metadata,
				passes: {
					extraction: aiParsed?.fields ? 'partial' : 'fallback',
					narrative: narrativeRaw ? 'partial' : 'fallback'
				}
			}
		});
	}
};

function safeParseJson(s) {
	if (!s) return null;
	// Extract first {...} block
	const i = s.indexOf('{');
	const j = s.lastIndexOf('}');
	if (i === -1 || j === -1 || j <= i) return null;
	const candidate = s.slice(i, j + 1);
	try {
		return JSON.parse(candidate);
	} catch {
		// try to remove code fences/backticks
		const cleaned = candidate.replace(/^```[a-zA-Z]*\n|\n```$/g, '');
		try {
			return JSON.parse(cleaned);
		} catch {
			return null;
		}
	}
}

async function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function mirrorRemoteImageToStorage(remoteUrl, destBasePath) {
	try {
		if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null;
		const res = await fetchWithTimeout(
			remoteUrl,
			{ redirect: 'follow', headers: BROWSER_LIKE_HEADERS },
			DEFAULT_FETCH_TIMEOUT
		);
		if (!res || !res.ok) return null;
		const ct = res.headers.get('content-type') || '';
		if (!ct.startsWith('image/')) return null;
		const ab = await res.arrayBuffer();
		const ext = (() => {
			const lower = ct.toLowerCase();
			if (lower.includes('jpeg')) return 'jpg';
			if (lower.includes('png')) return 'png';
			if (lower.includes('webp')) return 'webp';
			if (lower.includes('gif')) return 'gif';
			return 'img';
		})();
		const path = `${destBasePath}.${ext}`;
		const up = await supabase.storage
			.from('storage')
			.upload(path, ab, { contentType: ct, upsert: true });
		if (up.error) return null;
		const { data } = supabase.storage.from('storage').getPublicUrl(path);
		return data?.publicUrl || null;
	} catch {
		return null;
	}
}

async function mirrorImageFields(fields) {
	if (!fields || typeof fields !== 'object') return;
	try {
		const now = Date.now();
		if (fields.logo_url && /^https?:\/\//i.test(fields.logo_url)) {
			const url = await mirrorRemoteImageToStorage(fields.logo_url, `enrich/${now}/logo`);
			if (url) fields.logo_url = url;
		}
		if (fields.cover_photo_url && /^https?:\/\//i.test(fields.cover_photo_url)) {
			const url = await mirrorRemoteImageToStorage(fields.cover_photo_url, `enrich/${now}/cover`);
			if (url) fields.cover_photo_url = url;
		}
	} catch {
		// Non-fatal
	}
}

async function runExtractionPass({ client, model, context, name }) {
	const { contents, contextMode } = buildExtractionContents(context, name);
	const tools = [];
	if (contextMode === 'url') {
		tools.push({ urlContext: {} });
		if (ENABLE_GOOGLE_SEARCH_TOOL) tools.unshift({ google_search: {} });
	}
	const response = await client.generateContent({
		model,
		contents,
		config: {
			responseSchema: RESPONSE_SCHEMA,
			...(tools.length ? { tools } : {})
		}
	});
	let text = response.text ?? '';
	if (typeof text === 'function') text = text();
	const parsed = safeParseJson(text);
	return { parsed, raw: text };
}

async function runNarrativePass({ client, model, facts, categories, evidence, name }) {
	const evidenceLines = [];
	for (const field of VOICE_FIELDS) {
		const meta = evidence?.[field];
		if (!meta?.evidence?.length) continue;
		for (const ev of meta.evidence) {
			evidenceLines.push(`${field} <- ${ev.url}: ${truncate(ev.snippet || '', 160)}`);
			if (evidenceLines.length >= MAX_NARRATIVE_EVIDENCE_SNIPPETS) break;
		}
		if (evidenceLines.length >= MAX_NARRATIVE_EVIDENCE_SNIPPETS) break;
	}

	const instruction = `You will refine only narrative fields for a cycling group profile.
Rules:
- Use ONLY the structured facts and evidence provided.
- Keep factual values (contacts, location, cadence, categories) unchanged.
- Keep each field concise and grounded; if uncertain return null.
- Use the organization's own tone where possible.
- Never use navigation/footer/copyright text as output.
- Tagline must be 1 sentence and at most 120 characters.
- preferred_contact_method_instructions must be actionable (email/call/form), not menu labels.
Return STRICT JSON:
{
  "narrative_fields": {
    "tagline": string|null,
    "description": string|null,
    "how_to_join_instructions": string|null,
    "membership_info": string|null,
    "service_area_description": string|null,
    "preferred_contact_method_instructions": string|null
  }
}
Organization name hint: ${name || facts?.name || ''}
Facts JSON:
${JSON.stringify({ fields: facts, categories }, null, 2)}
Evidence:
${evidenceLines.join('\n') || '(none provided)'}`;

	const response = await client.generateContent({
		model,
		contents: [instruction],
		config: {
			responseSchema: NARRATIVE_RESPONSE_SCHEMA
		}
	});
	let text = response.text ?? '';
	if (typeof text === 'function') text = text();
	return { parsed: safeParseJson(text), raw: text };
}

function buildModelContext({
	urls,
	scraped,
	siteCrawlPlan,
	name,
	hints,
	socialFacts,
	deterministicFacts,
	existingProfile
}) {
	const docs = (scraped || []).map((doc) => ({
		...doc,
		recency: doc?.recency || extractRecencyInfo(doc)
	}));
	const dedupedUrls = uniqueNormalizedValues(
		(urls || []).map((u) => normalizeAnyUrl(u)).filter(Boolean)
	);
	return {
		urls: dedupedUrls,
		scraped: docs,
		siteCrawlPlan: siteCrawlPlan || [],
		name: name || '',
		hints: hints || [],
		socialFacts: socialFacts || {},
		deterministicFacts: deterministicFacts || {},
		existingProfile: existingProfile || null
	};
}

function buildExtractionContents(context, name) {
	const { urls, scraped, siteCrawlPlan, hints, socialFacts, deterministicFacts, existingProfile } =
		context;
	const rankedDocs = rankDocsForContext(scraped, siteCrawlPlan);
	const totalTextChars = rankedDocs.reduce(
		(sum, doc) => sum + Math.min((doc?.text || '').length, MAX_CONTEXT_TEXT_PER_DOC),
		0
	);
	const useTextContext = totalTextChars >= 2200 || rankedDocs.length >= 2;
	const hintBlock = hints.length
		? `High-level cues derived from retrieved content:\n${hints.map((h) => `- ${h}`).join('\n')}\n`
		: '';
	const priorityList = PRIORITY_FIELDS.map((f) => `fields.${f}`).join(', ');
	const voiceList = VOICE_FIELDS.join(', ');
	const socialOnlyNotice =
		!siteCrawlPlan.length && socialFacts?.websiteCandidates?.length
			? `No first-party website was supplied. Social profiles mention possible websites: ${socialFacts.websiteCandidates.join(', ')}.`
			: !siteCrawlPlan.length
				? 'No first-party website pages were retrievable; prioritize social-profile evidence and avoid over-claiming.'
				: '';
	const deterministicSummary = buildDeterministicSummary(deterministicFacts);
	const existingSummary = summarizeExistingProfile(existingProfile);

	const instruction = `You are helping populate a public directory entry for a cycling-related group.
${hintBlock}${socialOnlyNotice}
Focus on capturing ${priorityList} whenever evidence exists. Highlight mission, audience focus, ride cadence, and concrete meeting/joining details.
Pass 1 goal: factual extraction only. Prefer direct facts over polished copy.
If two sources conflict, prefer more recent and more authoritative pages (official website > Instagram API > scraped social snippets).
Write narrative fields (${voiceList}) in the organization's own voice, but keep them concise and fact-grounded.
Use dedicated join/membership/events/contact/about pages as high-value evidence.
Never use navigation/footer/copyright boilerplate as name, tagline, or contact instructions.
Only output phone numbers that are likely callable phones (ignore coordinates, IDs, timestamps, and query params).
You may receive an existing profile baseline from admins. Treat those values as a starting draft: preserve them when no stronger evidence is found, but update when new evidence is clearly better.
Existing profile baseline summary: ${existingSummary}
Deterministic pre-extracted clues (may be incomplete): ${deterministicSummary}
Return STRICT JSON only in the schema. If unsure, leave fields null and arrays empty.
Context is provided in "${useTextContext ? 'text' : 'url'}" mode. Use only that context and do not assume missing data.
Context name (if provided by user): ${name || ''}`;

	const contents = [instruction];
	if (useTextContext) {
		let textBudget = MAX_CONTEXT_TEXT_BUDGET;
		let structuredBudget = MAX_CONTEXT_STRUCTURED_SNIPPETS;
		let docsAdded = 0;
		for (const doc of rankedDocs) {
			if (textBudget <= 0 || docsAdded >= MAX_CONTEXT_DOCS) break;
			const text = truncate(doc.text || '', Math.min(MAX_CONTEXT_TEXT_PER_DOC, textBudget));
			if (!text) continue;
			docsAdded += 1;
			textBudget -= text.length;
			const contextLabel = buildDocContextLabel(doc, siteCrawlPlan);
			const recency = describeDocRecency(doc);
			contents.push(
				`Content from ${doc.url}${contextLabel ? ` (${contextLabel})` : ''}${recency ? ` [${recency}]` : ''}:\n${text}`
			);
			const signalText = buildPageSignalsText(doc.pageSignals);
			if (signalText) contents.push(`Page signals from ${doc.url}:\n${signalText}`);
			for (const snippet of doc.structured || []) {
				if (structuredBudget <= 0) break;
				structuredBudget -= 1;
				contents.push(`Structured data from ${doc.url} (${snippet.label}):\n${snippet.json}`);
			}
		}
	} else {
		const urlCandidates = uniqueNormalizedValues([
			...(urls || []),
			...(siteCrawlPlan || []).map((page) => page?.url).filter(Boolean)
		]).slice(0, MAX_CONTEXT_URLS);
		for (const u of urlCandidates) contents.push(u);
	}
	return { contents, contextMode: useTextContext ? 'text' : 'url' };
}

function buildDeterministicSummary(deterministicFacts) {
	if (!deterministicFacts?.fields) return '(none)';
	const out = {};
	for (const key of ALL_FIELD_KEYS) {
		const value = deterministicFacts.fields[key];
		if (value == null || value === '') continue;
		out[key] = value;
	}
	if (deterministicFacts.fields?.social_links)
		out.social_links = deterministicFacts.fields.social_links;
	return truncate(JSON.stringify(out), 2500);
}

function normalizeExistingProfileInput(input = {}) {
	const sourceFields =
		input?.fields && typeof input.fields === 'object'
			? input.fields
			: input && typeof input === 'object'
				? input
				: {};
	const sourceCategories =
		input?.categories && typeof input.categories === 'object' ? input.categories : {};
	const sourceExtras = input?.extras && typeof input.extras === 'object' ? input.extras : {};

	const fields = {};
	for (const key of ALL_FIELD_KEYS) {
		if (sourceFields[key] != null) fields[key] = sourceFields[key];
	}
	fields.social_links = normalizeSocialLinks(sourceFields.social_links || {});

	const categories = {
		group_types: normalizeStringArray(sourceCategories.group_types || []),
		audience_focuses: normalizeStringArray(sourceCategories.audience_focuses || []),
		riding_disciplines: normalizeStringArray(sourceCategories.riding_disciplines || []),
		skill_levels: normalizeStringArray(sourceCategories.skill_levels || [])
	};

	const extras = {};
	for (const [k, v] of Object.entries({ ...sourceFields, ...sourceExtras })) {
		if (k in fields || k === 'social_links' || k === 'categories') continue;
		if (v == null) continue;
		if (typeof v === 'string') {
			const trimmed = normalizeText(v);
			if (trimmed) extras[k] = truncate(trimmed, 300);
		} else if (typeof v === 'number' && Number.isFinite(v)) {
			extras[k] = v;
		}
	}

	return { fields, categories, extras };
}

function summarizeExistingProfile(existingProfile) {
	if (!existingProfile) return '(none)';
	const summary = {};
	for (const key of ALL_FIELD_KEYS) {
		const value = existingProfile?.fields?.[key];
		if (value == null || value === '') continue;
		summary[key] = value;
	}
	if (existingProfile?.fields?.social_links) {
		const links = Object.fromEntries(
			Object.entries(existingProfile.fields.social_links || {}).filter(([_, v]) => Boolean(v))
		);
		if (Object.keys(links).length) summary.social_links = links;
	}
	if (existingProfile?.categories) {
		const cat = {};
		if (existingProfile.categories.group_types?.length)
			cat.group_types = existingProfile.categories.group_types;
		if (existingProfile.categories.audience_focuses?.length)
			cat.audience_focuses = existingProfile.categories.audience_focuses;
		if (existingProfile.categories.riding_disciplines?.length)
			cat.riding_disciplines = existingProfile.categories.riding_disciplines;
		if (existingProfile.categories.skill_levels?.length)
			cat.skill_levels = existingProfile.categories.skill_levels;
		if (Object.keys(cat).length) summary.categories = cat;
	}
	if (existingProfile?.extras && Object.keys(existingProfile.extras).length) {
		summary.extras = existingProfile.extras;
	}
	return Object.keys(summary).length ? truncate(JSON.stringify(summary), 2500) : '(none)';
}

function buildExistingProfileDoc(existingProfile) {
	if (!existingProfile) return null;
	const lines = ['Existing profile baseline (admin-provided):'];
	for (const key of ALL_FIELD_KEYS) {
		const value = existingProfile?.fields?.[key];
		if (value == null || value === '') continue;
		lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
	}
	const socialPairs = Object.entries(existingProfile?.fields?.social_links || {}).filter(([_, v]) =>
		Boolean(v)
	);
	if (socialPairs.length)
		lines.push(`social_links: ${socialPairs.map(([k, v]) => `${k}=${v}`).join(', ')}`);
	for (const [k, arr] of Object.entries(existingProfile?.categories || {})) {
		if (Array.isArray(arr) && arr.length) lines.push(`${k}: ${arr.join(', ')}`);
	}
	for (const [k, v] of Object.entries(existingProfile?.extras || {})) {
		if (v == null || v === '') continue;
		lines.push(`${k}: ${v}`);
	}
	if (lines.length <= 1) return null;
	return {
		url: 'existing://profile',
		html: '',
		text: truncate(lines.join('\n'), MAX_TEXT_PER_DOC),
		structured: [
			{ label: 'existing_profile', json: truncate(JSON.stringify(existingProfile), 5000) }
		],
		source: 'existing-profile',
		recency: null
	};
}

function buildWebsiteCandidateList({ requestedSite, socialFacts, socialDocs }) {
	const candidates = [];
	const seen = new Set();
	const pushCandidate = (value) => {
		const normalized = normalizeAnyUrl(value);
		if (!normalized) return;
		let host;
		try {
			host = new URL(normalized).hostname.toLowerCase();
		} catch {
			return;
		}
		if (isSocialHost(host)) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		candidates.push(normalized);
	};

	pushCandidate(requestedSite);
	for (const candidate of socialFacts?.websiteCandidates || []) pushCandidate(candidate);
	for (const doc of socialDocs || []) {
		for (const found of extractUrls(doc?.text || '')) pushCandidate(found);
	}
	return candidates.slice(0, Math.max(1, MAX_SOCIAL_FALLBACK_SITES + 1));
}

async function scrapeWebsiteBundle(baseSiteUrl, existing = []) {
	const docs = [];
	let plan = [];
	const root = await fetchAndExtract(baseSiteUrl);
	if (!root) return { docs, plan };
	root.source = 'website-root';
	root.recency = extractRecencyInfo(root);
	docs.push(root);

	const crawl = await crawlImportantSitePages({
		baseUrl: baseSiteUrl,
		rootDoc: root,
		existing: [...existing, root.url],
		limit: SITE_CRAWL_PAGE_LIMIT - 1
	});
	for (const doc of crawl.docs) {
		doc.recency = extractRecencyInfo(doc);
		docs.push(doc);
	}
	plan = crawl.plan;

	if (ENABLE_ASSET_FETCH) {
		const assets = await fetchAssetDocsFromSite(docs, baseSiteUrl, existing);
		for (const doc of assets) docs.push(doc);
	}
	return { docs: dedupeDocs(docs), plan };
}

async function fetchAssetDocsFromSite(siteDocs, baseSiteUrl, existing = []) {
	const assetLinks = collectAssetLinks(siteDocs, baseSiteUrl, existing);
	if (!assetLinks.length) return [];
	const out = [];
	for (const asset of assetLinks) {
		if (/\.ics($|\?)/i.test(asset) || /\.ical($|\?)/i.test(asset)) {
			const icsDoc = await fetchIcsAsset(asset);
			if (icsDoc) out.push(icsDoc);
			continue;
		}
		if (/\.pdf($|\?)/i.test(asset)) {
			const pdfDoc = await fetchPdfAsset(asset);
			if (pdfDoc) out.push(pdfDoc);
		}
		if (out.length >= MAX_ASSET_LINKS) break;
	}
	return out;
}

function collectAssetLinks(siteDocs, baseSiteUrl, existing = []) {
	const seen = new Set(existing.map((u) => normalizeAnyUrl(u)).filter(Boolean));
	const found = [];
	for (const doc of siteDocs) {
		if (!doc?.html) continue;
		const regex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/gi;
		let match;
		while ((match = regex.exec(doc.html))) {
			const href = match[1] || match[2] || match[3] || '';
			if (!href) continue;
			const normalized = normalizeAssetUrl(href, baseSiteUrl);
			if (!normalized || seen.has(normalized)) continue;
			if (!/\.(pdf|ics|ical)(\?|$)/i.test(normalized)) continue;
			seen.add(normalized);
			found.push(normalized);
			if (found.length >= MAX_ASSET_LINKS) return found;
		}
	}
	return found;
}

function normalizeAssetUrl(input, baseUrl) {
	if (!input) return null;
	try {
		const parsed = new URL(input, baseUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) return null;
		parsed.hash = '';
		return parsed.href;
	} catch {
		return null;
	}
}

async function fetchPdfAsset(assetUrl) {
	const proxy = `https://r.jina.ai/${assetUrl}`;
	const doc = await fetchAndExtract(proxy);
	if (!doc?.text) return null;
	return {
		url: assetUrl,
		html: '',
		text: truncate(`PDF text from ${assetUrl}\n${doc.text}`, MAX_TEXT_PER_DOC),
		structured: [],
		source: 'asset-pdf',
		recency: extractRecencyInfo({ ...doc, url: assetUrl })
	};
}

async function fetchIcsAsset(assetUrl) {
	const res = await fetchWithTimeout(
		assetUrl,
		{ redirect: 'follow', headers: { ...BROWSER_LIKE_HEADERS, Accept: 'text/calendar,*/*' } },
		DEFAULT_FETCH_TIMEOUT
	);
	if (!res?.ok) return null;
	const raw = await res.text().catch(() => '');
	if (!raw) return null;
	const lines = raw.split(/\r?\n/);
	const events = [];
	let current = {};
	for (const line of lines) {
		if (line.startsWith('BEGIN:VEVENT')) current = {};
		if (line.startsWith('SUMMARY:')) current.summary = decodeSimpleEntities(line.slice(8).trim());
		if (line.startsWith('LOCATION:')) current.location = decodeSimpleEntities(line.slice(9).trim());
		if (line.startsWith('DTSTART')) {
			const [_, value = ''] = line.split(':');
			current.start = value.trim();
		}
		if (line.startsWith('RRULE:')) current.rrule = line.slice(6).trim();
		if (line.startsWith('END:VEVENT')) {
			events.push(current);
			current = {};
		}
		if (events.length >= 8) break;
	}
	const textParts = [`Calendar feed: ${assetUrl}`];
	for (const event of events) {
		const parts = [];
		if (event.summary) parts.push(`Summary: ${event.summary}`);
		if (event.location) parts.push(`Location: ${event.location}`);
		if (event.start) parts.push(`Start: ${event.start}`);
		if (event.rrule) parts.push(`Rule: ${event.rrule}`);
		if (parts.length) textParts.push(parts.join(' | '));
	}
	return {
		url: assetUrl,
		html: '',
		text: truncate(textParts.join('\n'), MAX_TEXT_PER_DOC),
		structured: [{ label: 'ics', json: truncate(JSON.stringify(events), 4000) }],
		source: 'asset-ics',
		recency: extractRecencyInfo({ url: assetUrl, text: textParts.join(' ') })
	};
}

function deriveSocialFactsFromDocs(docs, { instagramUrl, facebookUrl } = {}) {
	const facts = {
		websiteCandidates: [],
		emails: [],
		phones: [],
		nameCandidates: [],
		bioSnippets: [],
		locationSnippets: [],
		social_links: {
			instagram: instagramUrl || null,
			facebook: facebookUrl || null,
			x: null,
			threads: null,
			mastodon: null,
			youtube: null,
			tiktok: null,
			strava: null,
			bluesky: null,
			linkedin: null,
			discord: null,
			other: null
		}
	};
	const addUnique = (list, value) => {
		const v = (value || '').trim();
		if (!v || list.includes(v)) return;
		list.push(v);
	};

	for (const doc of docs || []) {
		const text = doc?.text || '';
		for (const email of extractEmailCandidates(text)) addUnique(facts.emails, email);
		for (const phone of extractPhoneCandidates(text)) addUnique(facts.phones, phone);
		for (const url of extractUrls(text)) {
			const normalized = normalizeAnyUrl(url);
			if (!normalized) continue;
			let host = '';
			try {
				host = new URL(normalized).hostname.toLowerCase();
			} catch {}
			if (!host) continue;
			if (isSocialHost(host)) {
				applySocialUrlByHost(facts.social_links, normalized);
			} else {
				addUnique(facts.websiteCandidates, normalized);
			}
		}
		const nameMatch = /(?:^|\n)\s*Name:\s*([^\n]+)/i.exec(text);
		if (nameMatch?.[1]) addUnique(facts.nameCandidates, nameMatch[1].trim());
		const bioMatch = /(?:^|\n)\s*Bio:\s*([^\n]+)/i.exec(text);
		if (bioMatch?.[1]) addUnique(facts.bioSnippets, truncate(bioMatch[1].trim(), 220));
		const extLinkMatch = /(?:^|\n)\s*External link:\s*([^\n]+)/i.exec(text);
		if (extLinkMatch?.[1]) {
			const normalized = normalizeAnyUrl(extLinkMatch[1].trim());
			if (normalized) addUnique(facts.websiteCandidates, normalized);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(based in|serving|chapter|community|city|county)\b/i,
			2
		)) {
			addUnique(facts.locationSnippets, sentence);
		}
	}

	return facts;
}

function extractDeterministicFacts(
	docs,
	{ name, requestedSite, selectedSite, socialFacts, existingProfile }
) {
	const candidatesByField = {};
	const addCandidate = (field, value, score, evidence, doc, source = inferDocSourceType(doc)) => {
		const normalizedValue = normalizeCandidateValue(field, value);
		if (normalizedValue == null || normalizedValue === '') return;
		if (!candidatesByField[field]) candidatesByField[field] = [];
		candidatesByField[field].push({
			value: normalizedValue,
			field_key: field,
			score,
			evidence: evidence || '',
			url: doc?.url || '',
			source_type: source,
			recency: recencyBoost(doc),
			date: doc?.recency?.date || null
		});
	};

	const socialLinks = {
		instagram: socialFacts?.social_links?.instagram || null,
		facebook: socialFacts?.social_links?.facebook || null,
		x: socialFacts?.social_links?.x || null,
		threads: socialFacts?.social_links?.threads || null,
		mastodon: socialFacts?.social_links?.mastodon || null,
		youtube: socialFacts?.social_links?.youtube || null,
		tiktok: socialFacts?.social_links?.tiktok || null,
		strava: socialFacts?.social_links?.strava || null,
		bluesky: socialFacts?.social_links?.bluesky || null,
		linkedin: socialFacts?.social_links?.linkedin || null,
		discord: socialFacts?.social_links?.discord || null,
		other: socialFacts?.social_links?.other || null
	};

	if (name) addCandidate('name', name, 0.95, 'Provided by user input', null, 'user-input');
	if (requestedSite)
		addCandidate('website_url', requestedSite, 0.95, 'Provided website input', null, 'user-input');
	if (selectedSite)
		addCandidate(
			'website_url',
			selectedSite,
			0.9,
			'Website discovered and crawled',
			null,
			'crawler'
		);
	for (const key of ALL_FIELD_KEYS) {
		const value = existingProfile?.fields?.[key];
		if (value == null || value === '') continue;
		addCandidate(
			key,
			value,
			0.76,
			`Existing profile baseline value for ${key}`,
			{ url: 'existing://profile', source: 'existing-profile' },
			'existing-profile'
		);
	}
	for (const [socialKey, value] of Object.entries(existingProfile?.fields?.social_links || {})) {
		if (!value || !SOCIAL_FIELD_KEYS.includes(socialKey)) continue;
		applySocialUrlByHost(socialLinks, value);
	}

	for (const doc of docs || []) {
		if (!doc?.text) continue;
		const sourceType = inferDocSourceType(doc);
		const weight = SOURCE_RELIABILITY_WEIGHTS[sourceType] ?? SOURCE_RELIABILITY_WEIGHTS.unknown;
		const baseScore = Math.max(0.45, weight + recencyBoost(doc));
		const text = doc.text;
		const pageTitle = doc.pageSignals?.title;
		if (pageTitle && !isLowValueTitle(pageTitle)) {
			const titleName = extractNameFromPageTitle(pageTitle);
			if (titleName) addCandidate('name', titleName, baseScore, pageTitle, doc, sourceType);
		}
		for (const heading of doc.pageSignals?.h1 || []) {
			if (!heading || isLowValueNameCandidate(heading)) continue;
			addCandidate('name', heading, baseScore + 0.03, `H1: ${heading}`, doc, sourceType);
		}
		for (const email of extractEmailCandidates(text)) {
			addCandidate(
				'public_contact_email',
				email,
				baseScore + 0.08,
				`Email found: ${email}`,
				doc,
				sourceType
			);
		}
		for (const phone of extractPhoneCandidates(text)) {
			addCandidate(
				'public_phone_number',
				phone,
				baseScore + 0.06,
				`Phone found: ${phone}`,
				doc,
				sourceType
			);
		}
		for (const url of extractUrls(text)) {
			const normalized = normalizeAnyUrl(url);
			if (!normalized) continue;
			let host = '';
			try {
				host = new URL(normalized).hostname.toLowerCase();
			} catch {}
			if (!host) continue;
			if (isSocialHost(host)) {
				applySocialUrlByHost(socialLinks, normalized);
			} else {
				addCandidate(
					'website_url',
					normalized,
					baseScore - 0.05,
					`Website URL found: ${normalized}`,
					doc,
					sourceType
				);
			}
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(join|register|sign up|become a member|apply)\b/i,
			2
		)) {
			addCandidate('how_to_join_instructions', sentence, baseScore, sentence, doc, sourceType);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(dues|membership|member benefits|annual fee)\b/i,
			2
		)) {
			addCandidate('membership_info', sentence, baseScore, sentence, doc, sourceType);
		}
		for (const sentence of pickSentencesByRegex(text, /\b(weekly|monthly|every|each)\b/i, 2)) {
			if (/\b(ride|event|meet|training|group)\b/i.test(sentence)) {
				addCandidate('activity_frequency', sentence, baseScore - 0.03, sentence, doc, sourceType);
			}
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|morning|evening)\b/i,
			2
		)) {
			addCandidate(
				'typical_activity_day_time',
				sentence,
				baseScore - 0.03,
				sentence,
				doc,
				sourceType
			);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(meet at|meeting point|start at|start point|parking|address)\b/i,
			2
		)) {
			addCandidate(
				'specific_meeting_point_address',
				sentence,
				baseScore - 0.04,
				sentence,
				doc,
				sourceType
			);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(serving|based in|across|throughout|chapter)\b/i,
			2
		)) {
			addCandidate(
				'service_area_description',
				sentence,
				baseScore - 0.04,
				sentence,
				doc,
				sourceType
			);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(beginner|all levels|intermediate|advanced|no-drop)\b/i,
			2
		)) {
			addCandidate(
				'skill_levels_description',
				sentence,
				baseScore - 0.04,
				sentence,
				doc,
				sourceType
			);
		}
		for (const sentence of pickSentencesByRegex(
			text,
			/\b(email|dm|message us|contact us|text us|call us)\b/i,
			2
		)) {
			addCandidate(
				'preferred_contact_method_instructions',
				sentence,
				baseScore - 0.04,
				sentence,
				doc,
				sourceType
			);
		}
		const taglineCandidates = pickSentencesByRegex(
			text,
			/\b(community|inclusive|mission|empower|ride together|ride with us)\b/i,
			1
		);
		if (taglineCandidates[0]) {
			addCandidate(
				'tagline',
				taglineCandidates[0],
				baseScore - 0.12,
				taglineCandidates[0],
				doc,
				sourceType
			);
		}
		const descCandidates = pickSentencesByRegex(
			text,
			/\b(we are|our mission|about us|founded|we organize)\b/i,
			2
		);
		if (descCandidates[0]) {
			addCandidate(
				'description',
				descCandidates.join(' '),
				baseScore - 0.08,
				descCandidates[0],
				doc,
				sourceType
			);
		}

		const logoUrl = extractLikelyImageFromStructured(doc, /logo/i);
		const coverUrl = extractLikelyImageFromStructured(doc, /(cover|hero|banner)/i);
		if (logoUrl)
			addCandidate(
				'logo_url',
				logoUrl,
				baseScore + 0.04,
				`Image candidate: ${logoUrl}`,
				doc,
				sourceType
			);
		if (coverUrl)
			addCandidate(
				'cover_photo_url',
				coverUrl,
				baseScore + 0.03,
				`Image candidate: ${coverUrl}`,
				doc,
				sourceType
			);
	}

	for (const email of socialFacts?.emails || [])
		addCandidate('public_contact_email', email, 0.74, email, null, 'social');
	for (const phone of socialFacts?.phones || [])
		addCandidate('public_phone_number', phone, 0.72, phone, null, 'social');
	for (const candidateName of socialFacts?.nameCandidates || [])
		addCandidate('name', candidateName, 0.75, candidateName, null, 'social');
	if (!candidatesByField.description?.length && socialFacts?.bioSnippets?.length) {
		addCandidate(
			'description',
			socialFacts.bioSnippets[0],
			0.72,
			socialFacts.bioSnippets[0],
			null,
			'social'
		);
	}

	const fields = {};
	for (const key of ALL_FIELD_KEYS) {
		fields[key] = selectBestCandidateValue(candidatesByField[key], key)?.value ?? null;
	}
	fields.social_links = normalizeSocialLinks(socialLinks);

	const categories = mergeCategorySets(
		inferCategoriesFromDocs(docs),
		existingProfile?.categories || {}
	);
	return { fields, categories, candidatesByField };
}

function mergeAndResolveFacts({
	aiFields,
	aiCategories,
	deterministicFacts,
	docs,
	selectedSite,
	requestedSite,
	socialFacts
}) {
	const fields = {};
	const conflicts = [];
	const fieldEvidence = {};
	for (const key of ALL_FIELD_KEYS) {
		const candidates = [...(deterministicFacts.candidatesByField?.[key] || [])];
		const aiValue = aiFields?.[key];
		if (aiValue != null && aiValue !== '') {
			candidates.push({
				value: aiValue,
				field_key: key,
				score: scoreAiCandidate(key, aiValue, docs),
				evidence: `AI extracted value for ${key}`,
				url: '',
				source_type: 'ai',
				recency: 0,
				date: null
			});
		}
		const winner = selectBestCandidateValue(candidates, key);
		fields[key] = winner?.value ?? null;
		fieldEvidence[key] = buildFieldEvidenceMeta(key, winner, candidates);
		const distinctValues = uniqueNormalizedValues(candidates.map((c) => c?.value));
		if (distinctValues.length > 1) {
			conflicts.push({
				field: key,
				values: distinctValues.slice(0, 4),
				resolved_to: winner?.value ?? null
			});
		}
	}

	const socialLinks = normalizeSocialLinks({
		...(deterministicFacts.fields?.social_links || {}),
		...(aiFields?.social_links || {})
	});
	fields.social_links = socialLinks;
	for (const socialKey of SOCIAL_FIELD_KEYS) {
		const value = socialLinks?.[socialKey] ?? null;
		fieldEvidence[`social_links.${socialKey}`] = {
			confidence: value ? 0.78 : 0,
			evidence: value ? [{ url: value, snippet: `Detected ${socialKey} profile URL.` }] : [],
			source: value ? 'social' : null
		};
	}

	if (!fields.website_url) {
		fields.website_url =
			selectedSite || requestedSite || socialFacts?.websiteCandidates?.[0] || null;
	}
	if (!fields.name && socialFacts?.nameCandidates?.[0]) fields.name = socialFacts.nameCandidates[0];

	const categories = mergeCategorySets(aiCategories, deterministicFacts.categories);
	return { fields, categories, conflicts, fieldEvidence };
}

function normalizeAndValidateResult({ fields = {}, categories = {} }) {
	const out = {};
	for (const key of ALL_FIELD_KEYS) out[key] = normalizeFieldValue(key, fields[key]);
	out.latitude = normalizeLatitudeLongitude(out.latitude, 'lat');
	out.longitude = normalizeLatitudeLongitude(out.longitude, 'lng');
	if (out.latitude == null || out.longitude == null) {
		out.latitude = null;
		out.longitude = null;
	}
	if (out.public_contact_email && !isLikelyEmail(out.public_contact_email))
		out.public_contact_email = null;
	if (out.public_phone_number) out.public_phone_number = normalizePhone(out.public_phone_number);
	if (out.country) out.country = normalizeCountryCode(out.country);
	out.social_links = normalizeSocialLinks(fields.social_links || {});
	return {
		fields: out,
		categories: {
			group_types: normalizeStringArray(categories.group_types || []),
			audience_focuses: normalizeStringArray(categories.audience_focuses || []),
			riding_disciplines: normalizeStringArray(categories.riding_disciplines || [])
		}
	};
}

function buildEnrichmentMetadata({
	fields,
	categories,
	docs,
	fieldEvidence,
	conflicts,
	selectedSite,
	requestedSite,
	socialFacts,
	aiErrors,
	locationResolution,
	existingProfile
}) {
	const fieldConfidence = {};
	for (const key of ALL_FIELD_KEYS) {
		fieldConfidence[key] = finalizeFieldConfidence(key, fields[key], fieldEvidence?.[key]);
	}
	for (const socialKey of SOCIAL_FIELD_KEYS) {
		const key = `social_links.${socialKey}`;
		fieldConfidence[key] = finalizeFieldConfidence(
			key,
			fields?.social_links?.[socialKey] ?? null,
			fieldEvidence?.[key]
		);
	}

	return {
		selected_website: selectedSite || null,
		requested_website: requestedSite || null,
		used_social_website_fallback: Boolean(!requestedSite && selectedSite),
		documents_used: (docs || []).slice(0, 20).map((doc) => ({
			url: doc.url,
			source: inferDocSourceType(doc),
			recency: describeDocRecency(doc) || null
		})),
		social_discovery: {
			website_candidates: (socialFacts?.websiteCandidates || []).slice(0, 6),
			email_candidates: (socialFacts?.emails || []).slice(0, 4),
			phone_candidates: (socialFacts?.phones || []).slice(0, 4)
		},
		existing_profile: {
			provided: Boolean(existingProfile),
			field_count: existingProfile
				? ALL_FIELD_KEYS.filter((key) => {
						const value = existingProfile?.fields?.[key];
						return value != null && value !== '';
					}).length
				: 0
		},
		conflicts: conflicts || [],
		field_confidence: fieldConfidence,
		category_counts: {
			group_types: categories?.group_types?.length || 0,
			audience_focuses: categories?.audience_focuses?.length || 0,
			riding_disciplines: categories?.riding_disciplines?.length || 0
		},
		location_resolution: locationResolution || { applied: false },
		ai_errors: aiErrors || []
	};
}

async function resolveLocationFields({ fields, socialFacts, fieldEvidence }) {
	const base = fields || {};
	const output = {
		applied: false,
		method: null,
		query: null,
		label: null,
		source: null,
		confidence: 0
	};

	const queryCandidates = buildLocationQueries(base, socialFacts);
	if (!queryCandidates.length) return output;

	const countryCodes = locationCountryCodes(base.country);
	for (const candidate of queryCandidates) {
		const matches = await searchGeocode(candidate.query, {
			limit: 1,
			countryCodes
		}).catch(() => []);
		if (!matches?.length) continue;
		const top = matches[0];
		if (!Number.isFinite(top.latitude) || !Number.isFinite(top.longitude)) continue;
		const parsed = parseGeocodeLabel(top.label || '');
		const confidence = scoreLocationResolutionConfidence({
			candidate,
			match: top,
			existing: base
		});

		let changed = false;
		if (base.latitude == null || base.longitude == null) {
			base.latitude = Number(top.latitude.toFixed(6));
			base.longitude = Number(top.longitude.toFixed(6));
			applyFieldEvidence(fieldEvidence, 'latitude', top.label, top, confidence);
			applyFieldEvidence(fieldEvidence, 'longitude', top.label, top, confidence);
			changed = true;
		}

		if (!base.country && parsed.country) {
			base.country = parsed.country;
			applyFieldEvidence(fieldEvidence, 'country', top.label, top, confidence - 0.05);
			changed = true;
		}
		if (!base.state_region && parsed.state_region) {
			base.state_region = parsed.state_region;
			applyFieldEvidence(fieldEvidence, 'state_region', top.label, top, confidence - 0.08);
			changed = true;
		}
		if (!base.city && parsed.city) {
			base.city = parsed.city;
			applyFieldEvidence(fieldEvidence, 'city', top.label, top, confidence - 0.08);
			changed = true;
		}
		if (!base.specific_meeting_point_address && parsed.address && candidate.type === 'address') {
			base.specific_meeting_point_address = parsed.address;
			applyFieldEvidence(
				fieldEvidence,
				'specific_meeting_point_address',
				top.label,
				top,
				confidence - 0.04
			);
			changed = true;
		}

		output.applied = changed;
		output.method = candidate.type;
		output.query = candidate.query;
		output.label = top.label || null;
		output.source = top.source || null;
		output.confidence = clamp(confidence, 0, 0.99);
		return output;
	}

	return output;
}

function buildLocationQueries(fields = {}, socialFacts = {}) {
	const queries = [];
	const pushQuery = (query, type, priority) => {
		const q = normalizeText(query);
		if (!q) return;
		if (queries.some((item) => item.query.toLowerCase() === q.toLowerCase())) return;
		queries.push({ query: q, type, priority });
	};

	const city = normalizeText(fields.city || '');
	const state = normalizeText(fields.state_region || '');
	const country = normalizeCountryCode(fields.country) || normalizeText(fields.country || '');
	const meeting = normalizeText(fields.specific_meeting_point_address || '');
	const serviceArea = normalizeText(fields.service_area_description || '');

	if (meeting) {
		pushQuery(composeLocationQuery([meeting, city, state, country]), 'address', 1);
		pushQuery(meeting, 'address', 2);
	}
	if (city || state || country) {
		pushQuery(composeLocationQuery([city, state, country]), 'city_state', 3);
	}
	if (!city && !state && serviceArea) {
		const hint = extractLocationHintFromText(serviceArea);
		if (hint) pushQuery(hint, 'service_area', 4);
	}
	if (socialFacts?.locationSnippets?.length) {
		for (const snippet of socialFacts.locationSnippets.slice(0, 2)) {
			const hint = extractLocationHintFromText(snippet);
			if (hint) pushQuery(hint, 'social_location', 5);
		}
	}
	if (fields.latitude != null && fields.longitude != null) {
		pushQuery(`${fields.latitude}, ${fields.longitude}`, 'coordinates', 6);
	}

	return queries.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

function composeLocationQuery(parts = []) {
	return parts
		.map((part) => normalizeText(part || ''))
		.filter(Boolean)
		.join(', ');
}

function locationCountryCodes(country) {
	const code = normalizeCountryCode(country);
	if (!code) return '';
	return code.toLowerCase();
}

function parseGeocodeLabel(label = '') {
	const text = normalizeText(label);
	if (!text) return { city: null, state_region: null, country: null, address: null };
	const parts = text
		.split(',')
		.map((p) => normalizeText(p))
		.filter(Boolean);
	if (!parts.length) return { city: null, state_region: null, country: null, address: null };
	const countryPart = parts[parts.length - 1] || '';
	const country = normalizeCountryCode(countryPart);
	const secondLast = parts.length >= 2 ? parts[parts.length - 2] : '';
	const thirdLast = parts.length >= 3 ? parts[parts.length - 3] : '';
	let state_region = null;
	let city = null;

	if (/^[A-Z]{2}$/.test(secondLast)) state_region = secondLast;
	else if (secondLast && !/\d/.test(secondLast) && secondLast.length <= 40)
		state_region = secondLast;

	if (thirdLast && !/\d/.test(thirdLast) && thirdLast.length <= 60) city = thirdLast;
	else if (parts[0] && !/\d/.test(parts[0]) && parts[0].length <= 60) city = parts[0];

	return {
		city: city || null,
		state_region: state_region || null,
		country: country || null,
		address: parts.slice(0, Math.max(1, parts.length - 2)).join(', ')
	};
}

function extractLocationHintFromText(text = '') {
	const normalized = normalizeText(text);
	if (!normalized) return '';
	const patterns = [
		/\b(?:based in|serving|across|throughout|chapter in)\s+([A-Za-z\s'.-]{3,80})/i,
		/\b([A-Za-z\s'.-]{2,50},\s*[A-Z]{2})\b/,
		/\b([A-Za-z\s'.-]{2,50},\s*(?:United States|USA|Canada|Mexico|United Kingdom|Australia))\b/i
	];
	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		if (match?.[1]) return normalizeText(match[1]);
	}
	return '';
}

function scoreLocationResolutionConfidence({ candidate, match, existing }) {
	let score = 0.62;
	if (candidate.type === 'address') score += 0.2;
	if (candidate.type === 'city_state') score += 0.12;
	if (candidate.type === 'social_location') score += 0.06;
	if (candidate.type === 'coordinates') score += 0.1;
	if (existing?.country) {
		const existingCode = normalizeCountryCode(existing.country);
		const parsed = parseGeocodeLabel(match?.label || '');
		if (existingCode && parsed.country && existingCode === parsed.country) score += 0.05;
	}
	if (match?.source === 'google') score += 0.04;
	return score;
}

function applyFieldEvidence(fieldEvidence, fieldKey, label, match, confidence) {
	if (!fieldEvidence || !fieldKey) return;
	const existing = fieldEvidence[fieldKey] || { confidence: 0, evidence: [], source: null };
	existing.confidence = Math.max(existing.confidence || 0, clamp(confidence, 0, 0.99));
	existing.source = match?.source || existing.source || 'geocode';
	const snippet = `Resolved from geocode result "${truncate(label || '', 180)}".`;
	const evidence = {
		url: '',
		snippet,
		source: match?.source || 'geocode',
		date: null
	};
	const seen = new Set((existing.evidence || []).map((item) => item.snippet));
	const nextEvidence = [...(existing.evidence || [])];
	if (!seen.has(snippet)) nextEvidence.push(evidence);
	existing.evidence = nextEvidence.slice(0, MAX_EVIDENCE_SNIPPETS_PER_FIELD);
	fieldEvidence[fieldKey] = existing;
}

function normalizeAnyUrl(input) {
	if (!input) return null;
	try {
		const normalized = /^https?:\/\//i.test(input) ? input.trim() : `https://${input.trim()}`;
		const url = new URL(normalized);
		if (!['http:', 'https:'].includes(url.protocol)) return null;
		url.hash = '';
		for (const key of Array.from(url.searchParams.keys())) {
			if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(key)) url.searchParams.delete(key);
		}
		if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
		return url.href;
	} catch {
		return null;
	}
}

function isSocialHost(host = '') {
	const h = host.replace(/^www\./i, '').toLowerCase();
	return [
		'instagram.com',
		'facebook.com',
		'm.facebook.com',
		'mbasic.facebook.com',
		'x.com',
		'twitter.com',
		'threads.net',
		'youtube.com',
		'youtu.be',
		'tiktok.com',
		'strava.com',
		'bsky.app',
		'blueskyweb.xyz',
		'linkedin.com',
		'discord.gg',
		'discord.com',
		'mastodon.social'
	].some((item) => h === item || h.endsWith(`.${item}`));
}

function extractUrls(text = '') {
	if (!text) return [];
	return Array.from(text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi))
		.map((m) => m[0].trim().replace(/[),.;]+$/, ''))
		.filter(Boolean);
}

function applySocialUrlByHost(socialLinks, url) {
	if (!socialLinks || !url) return;
	let host = '';
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return;
	}
	if (/(^|\.)instagram\.com$/.test(host)) socialLinks.instagram = socialLinks.instagram || url;
	else if (/(^|\.)facebook\.com$/.test(host)) socialLinks.facebook = socialLinks.facebook || url;
	else if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)) socialLinks.x = socialLinks.x || url;
	else if (/(^|\.)threads\.net$/.test(host)) socialLinks.threads = socialLinks.threads || url;
	else if (/(^|\.)mastodon\.social$/.test(host) || /\/@/.test(url))
		socialLinks.mastodon = socialLinks.mastodon || url;
	else if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host))
		socialLinks.youtube = socialLinks.youtube || url;
	else if (/(^|\.)tiktok\.com$/.test(host)) socialLinks.tiktok = socialLinks.tiktok || url;
	else if (/(^|\.)strava\.com$/.test(host)) socialLinks.strava = socialLinks.strava || url;
	else if (/(^|\.)bsky\.app$|(^|\.)blueskyweb\.xyz$/.test(host))
		socialLinks.bluesky = socialLinks.bluesky || url;
	else if (/(^|\.)linkedin\.com$/.test(host)) socialLinks.linkedin = socialLinks.linkedin || url;
	else if (/(^|\.)discord\.gg$|(^|\.)discord\.com$/.test(host))
		socialLinks.discord = socialLinks.discord || url;
	else socialLinks.other = socialLinks.other || url;
}

function pickSentencesByRegex(text = '', regex, limit = 1) {
	const sentences = [];
	const parts = text.split(/(?<=[.!?])\s+/).slice(0, 180);
	for (const part of parts) {
		const sentence = normalizeText(part);
		if (!sentence || sentence.length < 25 || sentence.length > 260) continue;
		if (isLikelyBoilerplateText(sentence)) continue;
		if (!regex.test(sentence)) continue;
		sentences.push(sentence);
		if (sentences.length >= limit) break;
	}
	return sentences;
}

function inferDocSourceType(doc) {
	const source = (doc?.source || '').toLowerCase();
	const url = (doc?.url || '').toLowerCase();
	if (source === 'website-root') return 'website-root';
	if (source === 'homepage-link') return 'homepage-link';
	if (source === 'internal-link') return 'internal-link';
	if (source === 'sitemap') return 'sitemap';
	if (source === 'heuristic-path') return 'heuristic-path';
	if (source === 'asset-ics') return 'asset-ics';
	if (source === 'asset-pdf') return 'asset-pdf';
	if (source === 'instagram-api') return 'instagram-api';
	if (source.includes('instagram') || url.includes('instagram.com')) return 'instagram';
	if (source.includes('facebook') || url.includes('facebook.com')) return 'facebook';
	return source || 'unknown';
}

function extractRecencyInfo(doc) {
	const text = [doc?.pageSignals?.title || '', doc?.pageSignals?.description || '', doc?.text || '']
		.join(' ')
		.slice(0, 9000);
	const dates = parseDateCandidates(text);
	if (!dates.length) return null;
	const now = Date.now();
	let best = null;
	for (const date of dates) {
		const ts = date.getTime();
		const ageDays = (now - ts) / (1000 * 60 * 60 * 24);
		if (Number.isNaN(ageDays)) continue;
		if (ageDays < -1200 || ageDays > 3650) continue;
		if (!best || Math.abs(ageDays) < Math.abs(best.ageDays)) best = { date, ageDays };
	}
	if (!best) return null;
	return {
		date: best.date.toISOString().slice(0, 10),
		age_days: Math.round(best.ageDays),
		score: computeRecencyScore(best.ageDays)
	};
}

function parseDateCandidates(text = '') {
	const dates = [];
	const isoMatches = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g) || [];
	for (const m of isoMatches.slice(0, 12)) {
		const d = new Date(`${m}T00:00:00Z`);
		if (!Number.isNaN(d.getTime())) dates.push(d);
	}
	const longMatches =
		text.match(
			/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/gi
		) || [];
	for (const m of longMatches.slice(0, 12)) {
		const d = new Date(m);
		if (!Number.isNaN(d.getTime())) dates.push(d);
	}
	return dates;
}

function computeRecencyScore(ageDays) {
	if (ageDays < 0 && ageDays >= -120) return 0.18;
	if (ageDays >= 0 && ageDays <= RECENT_DAYS_WINDOW)
		return 0.16 * (1 - ageDays / RECENT_DAYS_WINDOW);
	if (ageDays > RECENT_DAYS_WINDOW && ageDays <= 3 * RECENT_DAYS_WINDOW) return -0.04;
	return -0.1;
}

function recencyBoost(doc) {
	if (!doc) return 0;
	if (!doc?.recency) doc.recency = extractRecencyInfo(doc);
	return doc?.recency?.score || 0;
}

function describeDocRecency(doc) {
	if (!doc) return '';
	if (!doc?.recency) doc.recency = extractRecencyInfo(doc);
	if (!doc?.recency?.date) return '';
	if (doc.recency.age_days < 0) return `dated ${doc.recency.date} (upcoming/recent)`;
	return `dated ${doc.recency.date}`;
}

function normalizeCandidateValue(field, value) {
	if (value == null) return null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const text = normalizeText(`${value}`);
	if (!text) return null;
	if (['website_url', 'logo_url', 'cover_photo_url'].includes(field)) return normalizeAnyUrl(text);
	if (field === 'public_contact_email') return text.toLowerCase();
	if (field === 'public_phone_number') return normalizePhone(text);
	if (field === 'country') return normalizeCountryCode(text);
	if (field === 'latitude' || field === 'longitude') {
		const n = Number.parseFloat(text);
		return Number.isFinite(n) ? n : null;
	}
	return truncate(text, 600);
}

function selectBestCandidateValue(candidates = [], field = null) {
	if (!candidates.length) return null;
	const sorted = [...candidates]
		.map((item) => ({
			...item,
			score_final:
				(item.score || 0) +
				(item.recency || 0) +
				qualityAdjustmentForField(field || item.field_key || null, item.value, item.source_type)
		}))
		.sort((a, b) => b.score_final - a.score_final);
	const winner = sorted[0];
	return {
		...winner,
		confidence: scoreToConfidence(winner.score_final)
	};
}

function scoreToConfidence(score = 0) {
	return clamp(0.05 + (score - 0.35) * 0.55, 0, 0.98);
}

function buildFieldEvidenceMeta(field, winner, allCandidates = []) {
	if (!winner) return { confidence: 0, evidence: [], source: null };
	const evidence = allCandidates
		.filter((candidate) => normalizeCandidateValue(field, candidate.value) === winner.value)
		.sort((a, b) => (b.score || 0) - (a.score || 0))
		.slice(0, MAX_EVIDENCE_SNIPPETS_PER_FIELD)
		.map((candidate) => ({
			url: candidate.url || '',
			snippet: truncate(candidate.evidence || `${field}: ${winner.value}`, 180),
			source: candidate.source_type || null,
			date: candidate.date || null
		}));
	return {
		confidence: winner.confidence,
		evidence,
		source: winner.source_type || null
	};
}

function uniqueNormalizedValues(values = []) {
	const out = [];
	const seen = new Set();
	for (const raw of values) {
		if (raw == null || raw === '') continue;
		const key = `${raw}`.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(raw);
	}
	return out;
}

function inferCategoriesFromDocs(docs = []) {
	const text = docs
		.map((doc) => doc?.text || '')
		.join(' ')
		.toLowerCase();
	const categories = {
		group_types: [],
		audience_focuses: [],
		riding_disciplines: []
	};
	const pushUnique = (list, value) => {
		if (!list.includes(value)) list.push(value);
	};

	if (/\b(advocacy|nonprofit|campaign|policy)\b/.test(text))
		pushUnique(categories.group_types, 'Advocacy');
	if (/\b(team|race team|racing)\b/.test(text)) pushUnique(categories.group_types, 'Team');
	if (/\b(club|group ride|cycling club|chapter)\b/.test(text))
		pushUnique(categories.group_types, 'Club');
	if (!categories.group_types.length && text) pushUnique(categories.group_types, 'Club');

	if (/\b(women|female|femme|ladies|non-binary)\b/.test(text))
		pushUnique(categories.audience_focuses, 'Women');
	if (/\b(beginner|new rider|no-drop|first ride)\b/.test(text))
		pushUnique(categories.audience_focuses, 'Beginners');
	if (/\b(youth|kids|teen|family|school)\b/.test(text))
		pushUnique(categories.audience_focuses, 'Youth');

	if (/\b(road|criterium|century)\b/.test(text)) pushUnique(categories.riding_disciplines, 'Road');
	if (/\b(mtb|mountain|singletrack|trail)\b/.test(text))
		pushUnique(categories.riding_disciplines, 'MTB');
	if (/\b(gravel)\b/.test(text)) pushUnique(categories.riding_disciplines, 'Gravel');
	if (/\b(cyclocross|cross race)\b/.test(text))
		pushUnique(categories.riding_disciplines, 'Cyclocross');
	if (/\b(track|velodrome)\b/.test(text)) pushUnique(categories.riding_disciplines, 'Track');
	if (/\b(bmx)\b/.test(text)) pushUnique(categories.riding_disciplines, 'BMX');

	return categories;
}

function mergeCategorySets(aiCategories = {}, deterministicCategories = {}) {
	return {
		group_types: unionCategoryList(aiCategories.group_types, deterministicCategories.group_types),
		audience_focuses: unionCategoryList(
			aiCategories.audience_focuses,
			deterministicCategories.audience_focuses
		),
		riding_disciplines: unionCategoryList(
			aiCategories.riding_disciplines,
			deterministicCategories.riding_disciplines
		)
	};
}

function unionCategoryList(a = [], b = []) {
	return normalizeStringArray([...(a || []), ...(b || [])]).slice(0, 8);
}

function scoreAiCandidate(field, value, docs = []) {
	let score = 0.66;
	const normalizedValue = normalizeCandidateValue(field, value);
	if (normalizedValue == null || normalizedValue === '') return 0.1;
	const needle =
		typeof normalizedValue === 'string' ? normalizedValue.toLowerCase() : `${normalizedValue}`;
	let mentions = 0;
	for (const doc of docs) {
		const hay = `${doc?.text || ''} ${doc?.pageSignals?.title || ''}`.toLowerCase();
		if (!needle || needle.length < 4) break;
		if (hay.includes(needle)) mentions += 1;
	}
	score += Math.min(mentions, 4) * 0.06;
	if (
		['website_url', 'logo_url', 'cover_photo_url'].includes(field) &&
		normalizeAnyUrl(normalizedValue)
	)
		score += 0.04;
	if (field === 'public_contact_email' && isLikelyEmail(normalizedValue)) score += 0.05;
	if (field === 'public_phone_number' && normalizePhone(normalizedValue)) score += 0.04;
	score += qualityAdjustmentForField(field, normalizedValue, 'ai');
	return score;
}

function normalizeFieldValue(field, value) {
	if (value == null || value === '') return null;
	if (field === 'latitude' || field === 'longitude')
		return normalizeLatitudeLongitude(value, field);
	if (field === 'public_contact_email') {
		const email = normalizeText(`${value}`).toLowerCase();
		return isLikelyEmail(email) ? email : null;
	}
	if (field === 'public_phone_number') return normalizePhone(value);
	if (field === 'country') return normalizeCountryCode(value);
	if (['website_url', 'logo_url', 'cover_photo_url'].includes(field))
		return normalizeAnyUrl(`${value}`);
	const text = normalizeText(`${value}`);
	if (!text) return null;
	if (field === 'name' && isLowValueNameCandidate(text)) return null;
	if (field === 'tagline') return sanitizeTagline(text);
	if (field === 'preferred_contact_method_instructions') return sanitizeContactInstruction(text);
	const maxByField = {
		tagline: 140,
		description: 1800,
		how_to_join_instructions: 800,
		membership_info: 800,
		service_area_description: 500,
		preferred_contact_method_instructions: 220,
		activity_frequency: 400,
		typical_activity_day_time: 400,
		specific_meeting_point_address: 320,
		skill_levels_description: 320
	};
	return truncateAtWord(text, maxByField[field] || 320);
}

function normalizeLatitudeLongitude(value, mode) {
	const n = typeof value === 'number' ? value : Number.parseFloat(`${value}`);
	if (!Number.isFinite(n)) return null;
	if (mode === 'lat' || mode === 'latitude')
		return n >= -90 && n <= 90 ? Number(n.toFixed(6)) : null;
	if (mode === 'lng' || mode === 'longitude')
		return n >= -180 && n <= 180 ? Number(n.toFixed(6)) : null;
	return null;
}

function isLikelyEmail(value = '') {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
	if (value == null) return null;
	let raw = `${value}`.trim();
	if (!raw) return null;
	raw = raw.replace(/\b(?:ext|extension|x)\s*\d{1,6}\b/gi, '').trim();
	if (/^-?\d{1,3}\.\d{4,}$/.test(raw)) return null;
	const hasPlus = raw.startsWith('+');
	const digits = raw.replace(/[^\d]/g, '');
	if (digits.length < 7 || digits.length > 15) return null;
	if (!hasPlus && digits.length < 10) return null;
	if (/^(\d)\1{6,}$/.test(digits)) return null;
	if (!hasPlus && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	return `${hasPlus ? '+' : ''}${digits}`;
}

function normalizeCountryCode(value) {
	if (!value) return null;
	const normalized = normalizeText(`${value}`).toUpperCase();
	const map = {
		'UNITED STATES': 'US',
		USA: 'US',
		US: 'US',
		CANADA: 'CA',
		CA: 'CA',
		MEXICO: 'MX',
		MX: 'MX',
		'UNITED KINGDOM': 'GB',
		UK: 'GB',
		GB: 'GB',
		AUSTRALIA: 'AU',
		AU: 'AU'
	};
	if (map[normalized]) return map[normalized];
	if (/^[A-Z]{2}$/.test(normalized)) return normalized;
	return null;
}

function normalizeSocialLinks(socialLinks = {}) {
	const out = {};
	for (const key of SOCIAL_FIELD_KEYS) {
		out[key] = normalizeSocialLinkValue(key, socialLinks?.[key]);
	}
	return out;
}

function normalizeSocialLinkValue(key, value) {
	if (!value) return null;
	const v = `${value}`.trim();
	if (!v) return null;
	if (/^https?:\/\//i.test(v)) return normalizeAnyUrl(v);
	const stripped = v.replace(/^@/, '').trim();
	if (!stripped) return null;
	if (key === 'instagram') return normalizeAnyUrl(`https://www.instagram.com/${stripped}`);
	if (key === 'facebook') return normalizeAnyUrl(`https://www.facebook.com/${stripped}`);
	if (key === 'x') return normalizeAnyUrl(`https://x.com/${stripped}`);
	if (key === 'threads') return normalizeAnyUrl(`https://www.threads.net/@${stripped}`);
	if (key === 'mastodon') {
		if (stripped.includes('@')) {
			const cleaned = stripped.replace(/^@/, '');
			const [user, host] = cleaned.split('@');
			if (user && host) return normalizeAnyUrl(`https://${host}/@${user}`);
		}
		return normalizeAnyUrl(`https://mastodon.social/@${stripped.replace(/^@/, '')}`);
	}
	if (key === 'youtube') return normalizeAnyUrl(`https://www.youtube.com/${stripped}`);
	if (key === 'tiktok') return normalizeAnyUrl(`https://www.tiktok.com/@${stripped}`);
	if (key === 'strava') return normalizeAnyUrl(`https://www.strava.com/${stripped}`);
	if (key === 'bluesky') return normalizeAnyUrl(`https://bsky.app/profile/${stripped}`);
	if (key === 'linkedin') return normalizeAnyUrl(`https://www.linkedin.com/${stripped}`);
	if (key === 'discord') return normalizeAnyUrl(`https://discord.gg/${stripped.replace(/^@/, '')}`);
	return normalizeAnyUrl(v);
}

function normalizeStringArray(values = []) {
	const seen = new Set();
	const out = [];
	for (const value of values) {
		const normalized = normalizeText(`${value || ''}`);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(normalized);
	}
	return out;
}

function finalizeFieldConfidence(key, value, meta) {
	if (value == null || value === '') return { confidence: 0, evidence: [] };
	const confidence = clamp(meta?.confidence ?? 0.6, 0.05, 0.99);
	const evidence = (meta?.evidence || []).slice(0, MAX_EVIDENCE_SNIPPETS_PER_FIELD);
	return { confidence, evidence };
}

function extractLikelyImageFromStructured(doc, keyPattern) {
	for (const snippet of doc?.structured || []) {
		const text = snippet?.json || '';
		if (!text) continue;
		const maybeUrls = text.match(/https?:\/\/[^\s"']+\.(?:jpe?g|png|webp|gif)/gi) || [];
		for (const url of maybeUrls) {
			const around = text.slice(
				Math.max(0, text.indexOf(url) - 40),
				text.indexOf(url) + url.length + 40
			);
			if (keyPattern.test(around.toLowerCase())) return normalizeAnyUrl(url);
		}
	}
	return null;
}

function extractEmailCandidates(text = '') {
	return uniqueNormalizedValues(
		(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.toLowerCase())
	);
}

function extractPhoneCandidates(text = '') {
	if (!text) return [];
	const textWithoutUrls = text.replace(/https?:\/\/[^\s<>"')\]]+/gi, ' ');
	const matches = Array.from(textWithoutUrls.matchAll(/(?:\+?\d[\d\s().-]{7,}\d)/g));
	const out = [];
	for (const match of matches) {
		const raw = match?.[0] || '';
		const idx = match?.index || 0;
		const context = textWithoutUrls.slice(
			Math.max(0, idx - 40),
			Math.min(textWithoutUrls.length, idx + raw.length + 40)
		);
		if (/(?:lat|lng|lon|long|longitude|latitude|coord|coordinates|map)/i.test(context)) continue;
		const normalized = normalizePhone(raw);
		if (!normalized) continue;
		if (!out.includes(normalized)) out.push(normalized);
		if (out.length >= 8) break;
	}
	return out;
}

function isLowValueTitle(title = '') {
	const t = title.toLowerCase();
	return /privacy|terms|cookies|login|sign in|404|not found/.test(t);
}

function extractNameFromPageTitle(title = '') {
	const cleaned = normalizeText(title);
	if (!cleaned) return null;
	const pieces = cleaned
		.split(/[-–—|:•·/]/g)
		.map((p) => normalizeText(p))
		.filter(Boolean)
		.slice(0, 8);
	if (!pieces.length) return null;
	const ranked = pieces
		.map((piece, index) => {
			let score = piece.length;
			if (piece.split(' ').length >= 2) score += 5;
			if (
				/\b(cycling|bicycle|bike|velo|riders?|club|team|community|association|foundation)\b/i.test(
					piece
				)
			)
				score += 12;
			if (index === pieces.length - 1) score += 3;
			if (isLowValueNameCandidate(piece)) score -= 50;
			return { piece, score };
		})
		.sort((a, b) => b.score - a.score);
	if (!ranked[0] || ranked[0].score < 5) return null;
	return ranked[0].piece;
}

function isLowValueNameCandidate(value = '') {
	const text = normalizeText(value).toLowerCase();
	if (!text) return true;
	if (text.length <= 2) return true;
	if (
		/^(home|about|about us|contact|contact us|membership|join|events?|rides?|calendar|schedule|benefits|welcome)$/.test(
			text
		)
	)
		return true;
	if (isLikelyBoilerplateText(text)) return true;
	return false;
}

function isLikelyBoilerplateText(value = '') {
	const text = normalizeText(value).toLowerCase();
	if (!text) return false;
	if (
		/\b(copyright|all rights reserved|terms of use|terms & conditions|privacy policy|cookie policy|powered by|skip to content)\b/.test(
			text
		)
	)
		return true;
	if (/\b(home|contact us|terms|privacy)\b/.test(text) && (text.match(/\|/g) || []).length >= 2)
		return true;
	if (text.length > 90 && /^home\s*\|/i.test(text)) return true;
	return false;
}

function isLowValueContactInstruction(value = '') {
	const text = normalizeText(value);
	if (!text) return true;
	if (isLikelyBoilerplateText(text)) return true;
	if (
		/\b(copyright|all rights reserved|terms|privacy|powered by|home\s*\||\|\s*home)\b/i.test(text)
	)
		return true;
	if (
		!/\b(email|call|text|dm|message|contact form|contact us|reach us|phone|website)\b/i.test(text)
	)
		return true;
	return false;
}

function qualityAdjustmentForField(field, value, sourceType = '') {
	if (value == null || value === '') return -0.4;
	if (typeof value !== 'string') return 0;
	const text = normalizeText(value);
	if (!text) return -0.4;
	let adjustment = 0;
	if (isLikelyBoilerplateText(text)) adjustment -= 0.35;
	if (field === 'name' && isLowValueNameCandidate(text)) adjustment -= 0.7;
	if (field === 'tagline') {
		if (text.length > 140) adjustment -= 0.25;
		if (text.split(/[.!?]/).filter(Boolean).length > 2) adjustment -= 0.16;
		if (/\n/.test(value)) adjustment -= 0.18;
	}
	if (field === 'preferred_contact_method_instructions' && isLowValueContactInstruction(text))
		adjustment -= 0.8;
	if (field === 'public_phone_number' && !normalizePhone(text)) adjustment -= 0.7;
	if (sourceType === 'ai' && isLikelyBoilerplateText(text)) adjustment -= 0.1;
	return adjustment;
}

function truncateAtWord(text = '', max = 160) {
	if (!text || text.length <= max) return text;
	const clipped = text.slice(0, max + 1);
	const idx = clipped.lastIndexOf(' ');
	return (idx > Math.floor(max * 0.6) ? clipped.slice(0, idx) : clipped.slice(0, max)).trim();
}

function sanitizeTagline(value) {
	const text = normalizeText(value);
	if (!text || isLikelyBoilerplateText(text)) return null;
	const sentences = text
		.split(/(?<=[.!?])\s+/)
		.map((part) => normalizeText(part))
		.filter(Boolean);
	const best = sentences.find((sentence) => {
		if (sentence.length < 20 || sentence.length > 130) return false;
		if (isLikelyBoilerplateText(sentence)) return false;
		return true;
	});
	const candidate = best || truncateAtWord(text, 120);
	if (!candidate || candidate.length < 12) return null;
	return candidate.replace(/\s+\.\.\.$/, '').trim();
}

function sanitizeContactInstruction(value) {
	const text = normalizeText(value);
	if (!text || isLowValueContactInstruction(text)) return null;
	const sentence = text
		.split(/(?<=[.!?])\s+/)
		.map((part) => normalizeText(part))
		.find((part) => part && !isLowValueContactInstruction(part));
	return truncateAtWord(sentence || text, 220);
}

function deriveTaglineFromDescription(description) {
	const text = normalizeText(description || '');
	if (!text) return null;
	const sentence = text
		.split(/(?<=[.!?])\s+/)
		.map((part) => normalizeText(part))
		.find((part) => part.length >= 20 && part.length <= 120 && !isLikelyBoilerplateText(part));
	return sentence || null;
}

function buildPreferredContactFallback(fields = {}) {
	const email = fields.public_contact_email;
	const phone = fields.public_phone_number;
	const website = fields.website_url;
	if (email && phone) return `Email ${email} or call ${phone}.`;
	if (email) return `Email ${email}.`;
	if (phone) return `Call ${phone}.`;
	if (website) return `Use the contact form on ${website}.`;
	return null;
}

function shouldRunNarrativePass({ fields = {}, fieldEvidence = {} }) {
	for (const key of VOICE_FIELDS) {
		if (!fields?.[key]) return true;
	}
	if ((fields.tagline || '').length > 130) return true;
	if (isLowValueContactInstruction(fields.preferred_contact_method_instructions || '')) return true;
	const criticalNarrative = ['tagline', 'description', 'how_to_join_instructions'];
	for (const key of criticalNarrative) {
		const conf = fieldEvidence?.[key]?.confidence;
		if (typeof conf === 'number' && conf < 0.45) return true;
	}
	return false;
}

function shouldRetryExtractionPass(parsed) {
	if (!parsed?.fields || !parsed?.categories) return true;
	const fields = parsed.fields || {};
	const critical = [
		'name',
		'description',
		'how_to_join_instructions',
		'membership_info',
		'service_area_description',
		'preferred_contact_method_instructions'
	];
	let present = 0;
	for (const key of critical) {
		const value = fields?.[key];
		if (typeof value === 'string' && value.trim()) present += 1;
	}
	const categoryCount =
		(parsed?.categories?.group_types?.length || 0) +
		(parsed?.categories?.audience_focuses?.length || 0) +
		(parsed?.categories?.riding_disciplines?.length || 0);
	return present < 3 || categoryCount < 2;
}

function extractionPayloadScore(parsed) {
	if (!parsed?.fields || !parsed?.categories) return 0;
	const fields = parsed.fields || {};
	const weighted = [
		{ key: 'name', score: 2.5 },
		{ key: 'description', score: 2 },
		{ key: 'how_to_join_instructions', score: 1.6 },
		{ key: 'membership_info', score: 1.4 },
		{ key: 'service_area_description', score: 1.2 },
		{ key: 'preferred_contact_method_instructions', score: 1.2 },
		{ key: 'public_contact_email', score: 1.2 },
		{ key: 'public_phone_number', score: 1.1 },
		{ key: 'tagline', score: 0.8 },
		{ key: 'website_url', score: 0.6 }
	];
	let score = 0;
	for (const item of weighted) {
		const value = fields?.[item.key];
		if (typeof value === 'string' && value.trim()) score += item.score;
	}
	score += Math.min(parsed?.categories?.group_types?.length || 0, 3) * 0.4;
	score += Math.min(parsed?.categories?.audience_focuses?.length || 0, 3) * 0.3;
	score += Math.min(parsed?.categories?.riding_disciplines?.length || 0, 3) * 0.3;
	return score;
}

function applyFieldQualityGuards({
	fields = {},
	existingProfile = null,
	selectedSite = null,
	requestedSite = null
}) {
	const out = { ...fields, social_links: normalizeSocialLinks(fields.social_links || {}) };
	const baseline = existingProfile?.fields || {};
	if (out.public_phone_number) out.public_phone_number = normalizePhone(out.public_phone_number);
	if (out.name && isLowValueNameCandidate(out.name)) out.name = null;
	if (!out.name && baseline.name && !isLowValueNameCandidate(baseline.name))
		out.name = normalizeText(baseline.name);

	out.tagline = sanitizeTagline(out.tagline);
	if (!out.tagline)
		out.tagline =
			sanitizeTagline(baseline.tagline || '') || deriveTaglineFromDescription(out.description);

	out.preferred_contact_method_instructions = sanitizeContactInstruction(
		out.preferred_contact_method_instructions
	);
	if (!out.preferred_contact_method_instructions) {
		out.preferred_contact_method_instructions = sanitizeContactInstruction(
			baseline.preferred_contact_method_instructions || ''
		);
	}
	if (!out.preferred_contact_method_instructions) {
		out.preferred_contact_method_instructions = buildPreferredContactFallback({
			...out,
			website_url: out.website_url || selectedSite || requestedSite || null
		});
	}

	for (const key of ALL_FIELD_KEYS) out[key] = normalizeFieldValue(key, out[key]);
	out.social_links = normalizeSocialLinks(out.social_links || {});
	return out;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_FETCH_TIMEOUT) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const res = await fetch(url, { ...options, signal: controller.signal });
		return res;
	} catch {
		// Treat aborts/timeouts as a null response; other errors fall through as null as well.
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function crawlImportantSitePages({
	baseUrl,
	rootDoc,
	existing = [],
	limit = SITE_CRAWL_PAGE_LIMIT
}) {
	if (!rootDoc?.html || !baseUrl || limit <= 0) return { docs: [], plan: [] };
	let base;
	try {
		base = new URL(baseUrl);
	} catch {
		return { docs: [], plan: [] };
	}

	const origin = base.origin;
	const visited = new Set(existing.map((u) => canonicalizeUrl(u, baseUrl)).filter(Boolean));
	const planned = new Set();
	const planMap = new Map();
	const queue = [];
	const docs = [];

	const enqueue = (candidate) => {
		if (!candidate?.url || visited.has(candidate.url) || planned.has(candidate.url)) return;
		planned.add(candidate.url);
		planMap.set(candidate.url, candidate);
		queue.push(candidate);
	};

	const seedCandidates = getInternalLinkCandidates(rootDoc.html, baseUrl, { depth: 0 });
	for (const candidate of seedCandidates) enqueue(candidate);

	if (ENABLE_SITEMAP_DISCOVERY) {
		const sitemapCandidates = await discoverSitemapCandidates(baseUrl, baseUrl, visited);
		for (const candidate of sitemapCandidates) enqueue(candidate);
	}

	const predictablePaths = [
		'/about',
		'/about-us',
		'/mission',
		'/rides',
		'/events',
		'/calendar',
		'/join',
		'/membership',
		'/contact',
		'/faq',
		'/community'
	];
	for (const path of predictablePaths) {
		const url = canonicalizeUrl(new URL(path, origin).href, baseUrl);
		if (!url || visited.has(url) || planned.has(url)) continue;
		const score = scoreInternalLink(url, path.replace(/\//g, ' '), 0);
		enqueue({
			url,
			score,
			anchorText: path.replace(/\//g, ' '),
			source: 'heuristic-path',
			depth: 0
		});
	}

	while (docs.length < limit && queue.length) {
		queue.sort((a, b) => b.score - a.score);
		const nextBatch = queue.splice(0, SITE_CRAWL_BATCH_SIZE);
		const fetched = await Promise.all(
			nextBatch.map(async (candidate) => {
				visited.add(candidate.url);
				const doc = await fetchAndExtract(candidate.url);
				if (!doc || !doc.text) return null;
				doc.source = candidate.source;
				doc.crawl = {
					score: candidate.score,
					depth: candidate.depth,
					anchorText: candidate.anchorText || ''
				};
				return doc;
			})
		);

		for (const doc of fetched) {
			if (!doc) continue;
			docs.push(doc);
			if (docs.length >= limit) break;
			for (const child of getInternalLinkCandidates(doc.html, baseUrl, {
				depth: (doc.crawl?.depth || 0) + 1
			})) {
				enqueue(child);
			}
		}
	}

	const plan = docs
		.map((doc) => {
			const fromPlan = planMap.get(doc.url);
			return {
				url: doc.url,
				score: doc.crawl?.score ?? fromPlan?.score ?? 0,
				source: doc.source || fromPlan?.source || 'internal-link',
				anchorText: doc.crawl?.anchorText || fromPlan?.anchorText || ''
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, SITE_CANDIDATE_LIMIT);

	return { docs: dedupeDocs(docs), plan };
}

function getInternalLinkCandidates(html, baseUrl, { depth = 0 } = {}) {
	if (!html) return [];
	const matches = extractAnchorMatches(html);
	const byUrl = new Map();
	for (const match of matches) {
		const url = canonicalizeUrl(match.href, baseUrl);
		if (!url) continue;
		const score = scoreInternalLink(url, match.text, depth);
		const existing = byUrl.get(url);
		const candidate = {
			url,
			score,
			anchorText: match.text,
			source: depth === 0 ? 'homepage-link' : 'internal-link',
			depth
		};
		if (!existing || existing.score < score) byUrl.set(url, candidate);
	}
	return Array.from(byUrl.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, SITE_CANDIDATE_LIMIT);
}

function extractAnchorMatches(html) {
	const anchors = [];
	const regex = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))[^>]*>([\s\S]*?)<\/a>/gi;
	let match;
	while ((match = regex.exec(html))) {
		const href = (match[1] || match[2] || match[3] || '').trim();
		if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
			continue;
		const text = normalizeText(match[4] || '');
		anchors.push({ href, text });
		if (anchors.length >= 700) break;
	}
	return anchors;
}

async function discoverSitemapCandidates(baseUrl, normalizeBaseUrl, existingSet) {
	let root;
	try {
		root = new URL(baseUrl);
	} catch {
		return [];
	}
	const origin = root.origin;
	const sitemapUrls = new Set([`${origin}/sitemap.xml`]);
	const robots = await fetchWithTimeout(
		`${origin}/robots.txt`,
		{ redirect: 'follow', headers: BROWSER_LIKE_HEADERS },
		DEFAULT_FETCH_TIMEOUT
	);
	if (robots?.ok) {
		const robotsText = await robots.text().catch(() => '');
		for (const line of robotsText.split('\n')) {
			const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
			if (!match?.[1]) continue;
			const url = canonicalizeUrl(match[1], normalizeBaseUrl);
			if (url) sitemapUrls.add(url);
		}
	}

	const discovered = new Map();
	const processed = new Set();
	const queue = Array.from(sitemapUrls).slice(0, 4);

	while (queue.length && processed.size < 5) {
		const sitemapUrl = queue.shift();
		if (!sitemapUrl || processed.has(sitemapUrl)) continue;
		processed.add(sitemapUrl);
		const res = await fetchWithTimeout(
			sitemapUrl,
			{ redirect: 'follow', headers: BROWSER_LIKE_HEADERS },
			DEFAULT_FETCH_TIMEOUT
		);
		if (!res?.ok) continue;
		const xml = await res.text().catch(() => '');
		if (!xml) continue;
		const locs = Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
			.map((m) => decodeSimpleEntities((m[1] || '').trim()))
			.filter(Boolean);
		for (const loc of locs) {
			const url = canonicalizeUrl(loc, normalizeBaseUrl);
			if (!url) continue;
			if (/\.xml$/i.test(url)) {
				if (!processed.has(url) && queue.length < 8) queue.push(url);
				continue;
			}
			if (existingSet?.has(url)) continue;
			const score = scoreInternalLink(url, '', 0) + 1.5;
			const existing = discovered.get(url);
			const candidate = { url, score, anchorText: '', source: 'sitemap', depth: 0 };
			if (!existing || existing.score < score) discovered.set(url, candidate);
		}
	}

	return Array.from(discovered.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, SITE_CANDIDATE_LIMIT);
}

function canonicalizeUrl(input, baseUrl) {
	if (!input) return null;
	try {
		const parsed = new URL(input, baseUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) return null;
		const base = new URL(baseUrl);
		if (parsed.origin !== base.origin) return null;
		if (parsed.username || parsed.password) return null;
		parsed.hash = '';
		for (const key of Array.from(parsed.searchParams.keys())) {
			if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(key)) parsed.searchParams.delete(key);
		}
		if (isLikelyBinaryPath(parsed.pathname)) return null;
		if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
		return parsed.href;
	} catch {
		return null;
	}
}

function scoreInternalLink(url, anchorText = '', depth = 0) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return -10;
	}
	const path = parsed.pathname.toLowerCase();
	const anchor = anchorText.toLowerCase();
	let score = 0;

	const highValueKeywords = [
		'about',
		'mission',
		'who-we-are',
		'story',
		'community',
		'contact',
		'join',
		'membership',
		'members',
		'faq',
		'ride',
		'event',
		'calendar',
		'schedule',
		'route',
		'team',
		'leadership',
		'volunteer',
		'get-involved',
		'new-riders',
		'beginner',
		'location',
		'meet'
	];
	for (const keyword of highValueKeywords) {
		if (path.includes(keyword)) score += 2.8;
		if (anchor.includes(keyword)) score += 2.1;
	}

	if (/^\/(about|about-us|mission|our-story)$/.test(path)) score += 6;
	if (/^\/(join|membership|get-involved|members)$/.test(path)) score += 7;
	if (/^\/(contact|contact-us)$/.test(path)) score += 6;
	if (/^\/(rides|events|calendar|schedule)$/.test(path)) score += 6;

	const lowValueKeywords = [
		'login',
		'signin',
		'wp-admin',
		'account',
		'checkout',
		'cart',
		'privacy',
		'terms',
		'policy',
		'cookie',
		'author',
		'tag',
		'category'
	];
	for (const keyword of lowValueKeywords) {
		if (path.includes(keyword)) score -= 3.2;
	}
	if (/\/page\/\d+/.test(path)) score -= 2.2;
	if (parsed.search) score -= 1.2;

	if (/(\/20\d{2}\/|\/\d{4}\/\d{2}\/)/.test(path)) score -= 2.5;
	if (path === '/' || path === '') score -= 4;
	const depthPenalty = Math.max(depth, path.split('/').filter(Boolean).length - 2);
	score -= depthPenalty * 0.8;

	return score;
}

function isLikelyBinaryPath(pathname = '') {
	return /\.(?:jpe?g|png|gif|webp|svg|ico|pdf|zip|rar|7z|tar|gz|mp[34]|avi|mov|wmv|m4v|webm|docx?|xlsx?|pptx?)$/i.test(
		pathname
	);
}

function extractPageSignals(html) {
	if (!html) return null;
	const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const metaDescriptionMatch = html.match(
		/<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i
	);
	const h1Matches = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
		.map((m) => normalizeText(m[1] || ''))
		.filter(Boolean)
		.slice(0, 2);
	const h2Matches = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
		.map((m) => normalizeText(m[1] || ''))
		.filter(Boolean)
		.slice(0, 4);

	const title = normalizeText(titleMatch?.[1] || '');
	const description = normalizeText(metaDescriptionMatch?.[1] || '');
	if (!title && !description && !h1Matches.length && !h2Matches.length) return null;
	return {
		title: truncate(title, 180),
		description: truncate(description, 260),
		h1: h1Matches.map((h) => truncate(h, 120)),
		h2: h2Matches.map((h) => truncate(h, 120))
	};
}

function rankDocsForContext(docs, crawlPlan = []) {
	if (!docs?.length) return [];
	const scoreByUrl = new Map(crawlPlan.map((item) => [item.url, item.score || 0]));
	return [...docs].sort((a, b) => {
		const aScore =
			a?.crawl?.score ?? scoreByUrl.get(a?.url) ?? (a?.source === 'website-root' ? 50 : 0);
		const bScore =
			b?.crawl?.score ?? scoreByUrl.get(b?.url) ?? (b?.source === 'website-root' ? 50 : 0);
		return bScore - aScore;
	});
}

function buildDocContextLabel(doc, crawlPlan = []) {
	if (!doc) return '';
	const plan = crawlPlan.find((item) => item.url === doc.url);
	const parts = [];
	if (doc?.source || plan?.source) parts.push(`source: ${doc.source || plan.source}`);
	const score = doc?.crawl?.score ?? plan?.score;
	if (typeof score === 'number') parts.push(`importance ${Math.round(score * 10) / 10}`);
	const anchorText = doc?.crawl?.anchorText || plan?.anchorText;
	if (anchorText) parts.push(`anchor "${truncate(anchorText, 80)}"`);
	return parts.join(', ');
}

function buildPageSignalsText(signals) {
	if (!signals) return '';
	const lines = [];
	if (signals.title) lines.push(`Title: ${signals.title}`);
	if (signals.description) lines.push(`Meta description: ${signals.description}`);
	if (signals.h1?.length) lines.push(`H1: ${signals.h1.join(' | ')}`);
	if (signals.h2?.length) lines.push(`H2: ${signals.h2.join(' | ')}`);
	return lines.join('\n');
}

function normalizeText(text = '') {
	if (!text) return '';
	return decodeSimpleEntities(
		text
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function decodeSimpleEntities(text = '') {
	return text
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#x2F;/gi, '/');
}

function extractEmbeddedJson(html) {
	if (!html) return [];
	const snippets = [];
	const pushSnippet = (label, raw) => {
		if (!raw) return;
		const text = raw.trim();
		if (!text) return;
		try {
			// Attempt to parse/normalize to compact JSON; fall back to raw text if parsing fails.
			const parsed = JSON.parse(text);
			const json = JSON.stringify(parsed);
			snippets.push({ label, json: truncate(json, 5000) });
		} catch {
			const cleaned = text.replace(/^window\.[A-Z0-9_]+\s*=\s*/, '').replace(/;\s*$/, '');
			try {
				const parsed = JSON.parse(cleaned);
				const json = JSON.stringify(parsed);
				snippets.push({ label, json: truncate(json, 5000) });
			} catch {
				snippets.push({ label, json: truncate(text, 5000) });
			}
		}
	};

	const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;
	while ((match = ldJsonRegex.exec(html)) && snippets.length < MAX_STRUCTURED_SNIPPETS) {
		pushSnippet('ld+json', match[1]);
	}

	const nextDataRegex = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
	while ((match = nextDataRegex.exec(html)) && snippets.length < MAX_STRUCTURED_SNIPPETS) {
		pushSnippet('__NEXT_DATA__', match[1]);
	}

	const windowDataRegexes = [
		/window\.__INITIAL_DATA__\s*=\s*(\{[\s\S]*?\});/gi,
		/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/gi,
		/window\._sharedData\s*=\s*(\{[\s\S]*?\});/gi
	];
	for (const regex of windowDataRegexes) {
		while ((match = regex.exec(html)) && snippets.length < MAX_STRUCTURED_SNIPPETS) {
			pushSnippet('windowData', match[1]);
		}
	}

	return snippets;
}

function truncate(text, max) {
	return text.length > max ? `${text.slice(0, max)}...` : text;
}

function pushAll(target, extras) {
	if (!extras || !Array.isArray(extras)) return;
	for (const item of extras) {
		if (item) target.push(item);
	}
}

async function scrapeInstagramProfile(url) {
	const username = extractInstagramUsername(url);
	if (!username) return [];
	const docs = [];

	const apiDoc = await fetchInstagramProfileJson(username);
	if (apiDoc) docs.push(apiDoc);

	if (!apiDoc || (apiDoc?.text?.length || 0) < 200) {
		const embedDoc = await fetchAndExtract(`https://www.instagram.com/${username}/embed/`);
		if (embedDoc) {
			docs.push({
				...embedDoc,
				url: `https://www.instagram.com/${username}/embed/`,
				source: 'instagram'
			});
		}
		const jinaDoc = await fetchInstagramViaProxy(username);
		if (jinaDoc) docs.push(jinaDoc);
	}

	return dedupeDocs(docs);
}

async function scrapeFacebookPage(url) {
	const path = extractFacebookPath(url);
	if (!path) return [];
	const docs = [];
	const attempts = [
		{ url: `https://m.facebook.com${path}?_rdr`, label: `${url} (m.facebook)` },
		{ url: `https://mbasic.facebook.com${path}?_rdr`, label: `${url} (mbasic)` },
		{
			url: `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(url)}&tabs=timeline&width=500&height=600&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`,
			label: `${url} (plugin)`
		},
		{ url: `https://r.jina.ai/https://m.facebook.com${path}?_rdr`, label: `${url} (via jina.ai)` }
	];

	for (const attempt of attempts) {
		const doc = await fetchAndExtract(attempt.url);
		if (doc && doc.text) {
			docs.push({ ...doc, url: attempt.label, source: 'facebook' });
			if (docs.length >= 2 && doc.text.length > 500) break;
		}
	}

	return dedupeDocs(docs);
}

function extractInstagramUsername(input) {
	if (!input) return null;
	const trimmed = input.replace(/^@/, '').trim();
	if (!trimmed) return null;
	try {
		const url = new URL(
			trimmed.includes('instagram.com') ? trimmed : `https://www.instagram.com/${trimmed}`
		);
		const segments = url.pathname.split('/').filter(Boolean);
		if (!segments.length) return null;
		const first = segments[0];
		if (['explore', 'reel', 'p'].includes(first.toLowerCase())) return null;
		return first;
	} catch {
		return trimmed;
	}
}

function extractFacebookPath(input) {
	if (!input) return null;
	try {
		const url = new URL(/^https?:\/\//i.test(input) ? input : `https://www.facebook.com/${input}`);
		const path = url.pathname.replace(/\/+/g, '/');
		const cleaned = path.endsWith('/') ? path.slice(0, -1) : path;
		return cleaned || null;
	} catch {
		const safe = input.trim().replace(/^\//, '');
		return safe ? `/${safe}` : null;
	}
}

async function fetchInstagramProfileJson(username) {
	const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
	const res = await fetchWithTimeout(
		apiUrl,
		{
			headers: {
				...BROWSER_LIKE_HEADERS,
				'X-IG-App-ID': '936619743392459',
				Referer: 'https://www.instagram.com/'
			},
			redirect: 'follow'
		},
		DEFAULT_FETCH_TIMEOUT
	);
	if (!res || !res.ok) return null;
	const data = await res.json().catch(() => null);
	const user = data?.data?.user;
	if (!user) return null;
	const text = instagramUserToText(user);
	const structured = [{ label: 'instagram_api', json: truncate(JSON.stringify(user), 5000) }];
	return { url: apiUrl, html: '', text, structured, source: 'instagram-api' };
}

async function fetchInstagramViaProxy(username) {
	const proxyUrl = `https://r.jina.ai/https://www.instagram.com/${username}/`;
	const doc = await fetchAndExtract(proxyUrl);
	if (!doc || !doc.text) return null;
	return {
		...doc,
		url: `https://www.instagram.com/${username}/ (via r.jina.ai)`,
		source: 'instagram'
	};
}

function instagramUserToText(user) {
	const parts = [`Instagram profile: @${user.username || ''}`.trim()];
	if (user.full_name) parts.push(`Name: ${user.full_name}`);
	const bio = user.biography_with_entities?.raw_text || user.biography;
	if (bio) parts.push(`Bio: ${bio}`);
	const category = user.category_name || user.business_category_name;
	if (category) parts.push(`Category: ${category}`);
	if (typeof user.is_verified === 'boolean')
		parts.push(`Verified: ${user.is_verified ? 'yes' : 'no'}`);
	const followers = user.edge_followed_by?.count ?? user.follower_count;
	if (typeof followers === 'number') parts.push(`Followers: ${formatNumber(followers)}`);
	const following = user.edge_follow?.count ?? user.following_count;
	if (typeof following === 'number') parts.push(`Following: ${formatNumber(following)}`);
	const posts = user.edge_owner_to_timeline_media?.count ?? user.media_count;
	if (typeof posts === 'number') parts.push(`Posts: ${formatNumber(posts)}`);
	if (user.external_url) parts.push(`External link: ${user.external_url}`);
	if (user.business_email || user.public_email)
		parts.push(`Public email: ${user.business_email || user.public_email}`);
	if (user.business_phone_number || user.public_phone_number)
		parts.push(`Public phone: ${user.business_phone_number || user.public_phone_number}`);
	if (user.address_street) parts.push(`Address: ${user.address_street}`);
	if (user.city_name || user.address_city)
		parts.push(`City: ${user.city_name || user.address_city}`);
	if (user.contact_phone_number) parts.push(`Contact phone: ${user.contact_phone_number}`);
	return parts.join('\n');
}

function formatNumber(n) {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (n < 1000000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
	return `${(n / 1000000000).toFixed(1).replace(/\.0$/, '')}b`;
}

function dedupeDocs(docs) {
	if (!docs?.length) return [];
	const seen = new Set();
	const out = [];
	for (const doc of docs) {
		const key = doc?.url;
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(doc);
	}
	return out;
}

function buildHighLevelHints(
	docs,
	{ urls = [], name, crawlPlan = [], socialFacts = {}, existingProfile = null } = {}
) {
	const hints = [];
	const combined = docs
		.map((doc) => doc?.text || '')
		.join(' ')
		.toLowerCase();
	const add = (condition, message) => {
		if (condition) hints.push(message);
	};

	if (name) add(true, `Organization referenced as "${name}".`);
	if (urls.length) add(true, `Social/context links available: ${urls.join(', ')}.`);
	if (!crawlPlan.length)
		add(
			true,
			'No complete website crawl available; infer conservatively from social/profile evidence.'
		);
	if (crawlPlan.length) {
		const top = crawlPlan
			.slice(0, 5)
			.map((item) => {
				try {
					const u = new URL(item.url);
					return `${u.pathname || '/'} (${item.source})`;
				} catch {
					return item.url;
				}
			})
			.join(', ');
		add(true, `Important internal pages crawled: ${top}.`);
	}
	if (socialFacts?.websiteCandidates?.length && !crawlPlan.length) {
		add(
			true,
			`Social profiles reference possible websites: ${socialFacts.websiteCandidates.slice(0, 3).join(', ')}.`
		);
	}
	if (socialFacts?.emails?.length) {
		add(
			true,
			`Possible public emails from social sources: ${socialFacts.emails.slice(0, 2).join(', ')}.`
		);
	}
	if (socialFacts?.phones?.length) {
		add(
			true,
			`Possible public phones from social sources: ${socialFacts.phones.slice(0, 2).join(', ')}.`
		);
	}
	if (existingProfile) {
		const existingFieldCount = ALL_FIELD_KEYS.filter((key) => {
			const value = existingProfile?.fields?.[key];
			return value != null && value !== '';
		}).length;
		if (existingFieldCount) {
			add(true, `Existing profile baseline contains ${existingFieldCount} non-empty fields.`);
		}
		const baselineCats = [
			...(existingProfile?.categories?.group_types || []),
			...(existingProfile?.categories?.audience_focuses || []),
			...(existingProfile?.categories?.riding_disciplines || [])
		];
		if (baselineCats.length)
			add(true, `Existing categories include: ${baselineCats.slice(0, 8).join(', ')}.`);
	}

	const keywordRules = [
		{
			pattern: /women|female|femme|ladies|girlboss|she\/her/,
			message: 'Audience likely centers women, femme, or non-men riders.'
		},
		{
			pattern: /beginner|new rider|no experience|learn to ride|first ride/,
			message: 'Stresses beginner-friendly programming — call out accessible options.'
		},
		{
			pattern: /youth|kid|teen|family|school/,
			message: 'Youth or family engagement is mentioned; include that audience focus.'
		},
		{
			pattern: /gravel|mtb|mountain|trail|singletrack/,
			message: 'Off-road / gravel / MTB riding appears important.'
		},
		{ pattern: /cyclocross|cross race/, message: 'Cyclocross activity detected.' },
		{
			pattern: /road ride|road cycling|road race/,
			message: 'Road riding emphasis appears in the sources.'
		},
		{ pattern: /track cycling|velodrome/, message: 'Track cycling references present.' },
		{ pattern: /bmx/, message: 'BMX activity mentioned.' },
		{
			pattern: /advocacy|nonprofit|501c3|campaign/,
			message: 'Advocacy or nonprofit mission is highlighted.'
		},
		{
			pattern: /weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|each week/,
			message: 'Regular weekly cadence noted — capture activity_frequency and timing.'
		},
		{
			pattern: /monthly|once a month|every month/,
			message: 'Monthly programming noted — record cadence.'
		},
		{
			pattern: /saturday|sunday|monday|tuesday|wednesday|thursday|friday/,
			message: 'Specific day of week mentioned; capture typical_activity_day_time.'
		},
		{
			pattern: /am\b|pm\b|morning|afternoon|evening|sunrise|sunset/,
			message: 'Specific time-of-day cues present; include in typical_activity_day_time.'
		},
		{
			pattern: /membership|dues|join|sign up|register|rsvp/,
			message: 'Joining instructions or membership details available — summarize clearly.'
		},
		{
			pattern: /meetup|start point|meet at|location|parking/,
			message:
				'Physical meetup/start location referenced — capture specific_meeting_point_address if possible.'
		}
	];

	for (const rule of keywordRules) add(rule.pattern.test(combined), rule.message);

	const followersMatch = /followers:\s*([^\n]+)/i.exec(
		docs.map((doc) => doc?.text || '').join('\n')
	);
	if (followersMatch) add(true, `Instagram follower count noted as ${followersMatch[1].trim()}.`);

	const externalLinkMatch = /External link:\s*([^\n]+)/i.exec(
		docs.map((doc) => doc?.text || '').join('\n')
	);
	if (externalLinkMatch) add(true, `External website referenced: ${externalLinkMatch[1].trim()}.`);

	const sentences = [];
	for (const doc of docs) {
		if (!doc?.text) continue;
		const found = doc.text.match(/[^.!?]{40,220}[.!?]/g) || [];
		for (const fragment of found) {
			const trimmed = fragment.trim();
			if (!trimmed || sentences.includes(trimmed)) continue;
			sentences.push(trimmed);
			if (sentences.length >= 2) break;
		}
		if (sentences.length >= 2) break;
	}
	if (sentences.length) {
		add(
			true,
			`Representative snippets: ${sentences.map((s) => `"${truncate(s, 140)}"`).join(' / ')}`
		);
	}

	return hints.slice(0, 8);
}
