import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

// Ensure Vercel runs this on the Node runtime and gives us enough time for the AI call.
export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

const ai = new GoogleGenAI({ apiKey: env.GENAI_API_KEY });

const DEFAULT_FETCH_TIMEOUT = 6000; // ms
const INTERNAL_LINK_LIMIT = 3;
const MAX_STRUCTURED_SNIPPETS = 3;
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
					required: ['instagram', 'facebook', 'x', 'threads', 'youtube', 'tiktok', 'strava', 'bluesky', 'linkedin', 'other'],
					properties: {
						instagram: { type: 'string', nullable: true },
						facebook: { type: 'string', nullable: true },
						x: { type: 'string', nullable: true },
						threads: { type: 'string', nullable: true },
						youtube: { type: 'string', nullable: true },
						tiktok: { type: 'string', nullable: true },
						strava: { type: 'string', nullable: true },
						bluesky: { type: 'string', nullable: true },
						linkedin: { type: 'string', nullable: true },
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
		const clean = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
			.replace(/<!--([\s\S]*?)-->/g, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return { url, html, text: clean.slice(0, 20000), structured }; // cap to ~20k chars
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
	const body = await request.json().catch(() => ({}));
	const { instagram, facebook, website, name } = body || {};

	const urls = [];
	const ig = buildInstagramUrl(instagram);
	if (ig) urls.push(ig);
	const fb = buildFacebookUrl(facebook);
	if (fb) urls.push(fb);

	let site = normalizeUrl(website);
	if (site) urls.push(site);

	// Scrape website and a handful of internal links
	const scraped = [];
	if (site) {
		const main = await fetchAndExtract(site);
		if (main) {
			scraped.push(main);
			const existing = [...urls, ...scraped.map((doc) => doc.url)];
			const links = discoverInternalLinks(main.html, site, INTERNAL_LINK_LIMIT, existing);
			if (links.length) {
				const more = await Promise.all(links.map((u) => fetchAndExtract(u)));
				for (const m of more) if (m) scraped.push(m);
			}
		}
	}

	if (ig) pushAll(scraped, await scrapeInstagramProfile(ig));
	if (fb) pushAll(scraped, await scrapeFacebookPage(fb));

	const hints = buildHighLevelHints(scraped, { urls, name });
	const hintBlock = hints.length
		? `High-level cues derived from retrieved content:\n${hints
				.map((h) => `- ${h}`)
				.join('\n')}\n`
		: '';
	const priorityList = PRIORITY_FIELDS.map((f) => `fields.${f}`).join(', ');
	const voiceList = VOICE_FIELDS.join(', ');

	const instruction = `You are helping populate a public directory entry for a cycling-related group.
${hintBlock}Focus on capturing ${priorityList} whenever evidence exists. Highlight mission, audience focus, ride cadence, and concrete meeting/joining details.
Write narrative fields (${voiceList}) in the organization's own voice — mirror first-person language or tone used in the sources rather than shifting to an external narrator. Keep summaries concise and information-rich.
Return STRICT JSON only with the following shape (include values when confidently inferred):
{
  "fields": {
    "name": string|null, // Group name if confidently inferred
    "tagline": string|null,
    "description": string|null,
    "city": string|null,
    "state_region": string|null,
    "country": string|null, // Prefer 2-letter code (e.g. US, CA) if obvious
    "website_url": string|null,
    "public_contact_email": string|null,
    "public_phone_number": string|null,
    "preferred_contact_method_instructions": string|null,
    "how_to_join_instructions": string|null,
    "membership_info": string|null,
    "specific_meeting_point_address": string|null,
    "latitude": number|null,
    "longitude": number|null,
    "service_area_description": string|null,
    "skill_levels_description": string|null,
    "activity_frequency": string|null,
    "typical_activity_day_time": string|null,
    "logo_url": string|null,
    "cover_photo_url": string|null,
    "social_links": {
      "instagram": string|null,
      "facebook": string|null,
      "x": string|null,
      "threads": string|null,
      "youtube": string|null,
      "tiktok": string|null,
      "strava": string|null,
      "bluesky": string|null,
      "linkedin": string|null,
      "other": string|null
    }|null
  },
  "categories": {
    "group_types": string[],            // names like "Club", "Team", "Advocacy"
    "audience_focuses": string[],       // names like "Women", "Beginners", "Youth"
    "riding_disciplines": string[]      // names like "Road", "MTB", "Gravel"
  }
}
Use the links and text provided. If unsure, leave fields null and arrays empty. Avoid hallucinating.
When social profiles (Instagram, Facebook, etc.) are provided, call the urlContext tool to read them directly if needed.
Context name (if provided by user): ${name || ''}`;

	const contents = [instruction];
		// Include raw URLs to enable urlContext tool
	for (const u of urls) contents.push(u);
			// Include scraped text chunks and any structured data we found
			for (const doc of scraped) {
				contents.push(`Content from ${doc.url}:\n${doc.text}`);
				for (const snippet of doc.structured || []) {
					contents.push(`Structured data from ${doc.url} (${snippet.label}):\n${snippet.json}`);
				}
			}

	try {
		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash',
			contents,
			config: {
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA,
				tools: [
					{
						google_search: {}
					},
					{ urlContext: {} }
				]
			}
		});

		let text = response.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		if (!parsed) return json({ fields: {}, categories: {}, raw: text }, { status: 200 });

		// Attempt to mirror any remote logo/cover to Supabase storage and replace URLs
		try {
			const now = Date.now();
			if (parsed?.fields?.logo_url && /^https?:\/\//i.test(parsed.fields.logo_url)) {
				const url = await mirrorRemoteImageToStorage(parsed.fields.logo_url, `enrich/${now}/logo`);
				if (url) parsed.fields.logo_url = url;
			}
			if (parsed?.fields?.cover_photo_url && /^https?:\/\//i.test(parsed.fields.cover_photo_url)) {
				const url = await mirrorRemoteImageToStorage(
					parsed.fields.cover_photo_url,
					`enrich/${now}/cover`
				);
				if (url) parsed.fields.cover_photo_url = url;
			}
		} catch (e) {
			// Non-fatal; keep original URLs
		}

		return json(parsed);
	} catch (e) {
		return new Response(`AI error: ${e.message || e}`, { status: 500 });
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

function discoverInternalLinks(html, baseUrl, limit = INTERNAL_LINK_LIMIT, existing = []) {
	if (!html) return [];
	try {
		const origin = new URL(baseUrl).origin;
		const skip = new Set(existing);
		const rels = Array.from(html.matchAll(/href\s*=\s*"([^"]+)"/gi))
			.map((m) => m[1])
			.filter((h) => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:'));
		const uniques = [];
		for (const rel of rels) {
			try {
				const u = new URL(rel, baseUrl);
				if (u.origin === origin && !skip.has(u.href)) {
					uniques.push(u.href);
					skip.add(u.href);
					if (uniques.length >= limit) break;
				}
			} catch {}
		}
		return uniques;
	} catch {
		return [];
	}
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
		if (embedDoc) docs.push({ ...embedDoc, url: `https://www.instagram.com/${username}/embed/` });
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
		{ url: `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(url)}&tabs=timeline&width=500&height=600&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`, label: `${url} (plugin)` },
		{ url: `https://r.jina.ai/https://m.facebook.com${path}?_rdr`, label: `${url} (via jina.ai)` }
	];

	for (const attempt of attempts) {
		const doc = await fetchAndExtract(attempt.url);
		if (doc && doc.text) {
			docs.push({ ...doc, url: attempt.label });
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
		const url = new URL(trimmed.includes('instagram.com') ? trimmed : `https://www.instagram.com/${trimmed}`);
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
	return { url: apiUrl, html: '', text, structured };
}

async function fetchInstagramViaProxy(username) {
	const proxyUrl = `https://r.jina.ai/https://www.instagram.com/${username}/`;
	const doc = await fetchAndExtract(proxyUrl);
	if (!doc || !doc.text) return null;
	return { ...doc, url: `https://www.instagram.com/${username}/ (via r.jina.ai)` };
}

function instagramUserToText(user) {
	const parts = [`Instagram profile: @${user.username || ''}`.trim()];
	if (user.full_name) parts.push(`Name: ${user.full_name}`);
	const bio = user.biography_with_entities?.raw_text || user.biography;
	if (bio) parts.push(`Bio: ${bio}`);
	const category = user.category_name || user.business_category_name;
	if (category) parts.push(`Category: ${category}`);
	if (typeof user.is_verified === 'boolean') parts.push(`Verified: ${user.is_verified ? 'yes' : 'no'}`);
	const followers = user.edge_followed_by?.count ?? user.follower_count;
	if (typeof followers === 'number') parts.push(`Followers: ${formatNumber(followers)}`);
	const following = user.edge_follow?.count ?? user.following_count;
	if (typeof following === 'number') parts.push(`Following: ${formatNumber(following)}`);
	const posts = user.edge_owner_to_timeline_media?.count ?? user.media_count;
	if (typeof posts === 'number') parts.push(`Posts: ${formatNumber(posts)}`);
	if (user.external_url) parts.push(`External link: ${user.external_url}`);
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

function buildHighLevelHints(docs, { urls = [], name } = {}) {
	const hints = [];
	const combined = docs.map((doc) => doc?.text || '').join(' ').toLowerCase();
	const add = (condition, message) => {
		if (condition) hints.push(message);
	};

	if (name) add(true, `Organization referenced as "${name}".`);
	if (urls.length) add(true, `Social/context links available: ${urls.join(', ')}.`);

	const keywordRules = [
		{ pattern: /women|female|femme|ladies|girlboss|she\/her/, message: 'Audience likely centers women, femme, or non-men riders.' },
		{ pattern: /beginner|new rider|no experience|learn to ride|first ride/, message: 'Stresses beginner-friendly programming — call out accessible options.' },
		{ pattern: /youth|kid|teen|family|school/, message: 'Youth or family engagement is mentioned; include that audience focus.' },
		{ pattern: /gravel|mtb|mountain|trail|singletrack/, message: 'Off-road / gravel / MTB riding appears important.' },
		{ pattern: /cyclocross|cross race/, message: 'Cyclocross activity detected.' },
		{ pattern: /road ride|road cycling|road race/, message: 'Road riding emphasis appears in the sources.' },
		{ pattern: /track cycling|velodrome/, message: 'Track cycling references present.' },
		{ pattern: /bmx/, message: 'BMX activity mentioned.' },
		{ pattern: /advocacy|nonprofit|501c3|campaign/, message: 'Advocacy or nonprofit mission is highlighted.' },
		{ pattern: /weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|each week/, message: 'Regular weekly cadence noted — capture activity_frequency and timing.' },
		{ pattern: /monthly|once a month|every month/, message: 'Monthly programming noted — record cadence.' },
		{ pattern: /saturday|sunday|monday|tuesday|wednesday|thursday|friday/, message: 'Specific day of week mentioned; capture typical_activity_day_time.' },
		{ pattern: /am\b|pm\b|morning|afternoon|evening|sunrise|sunset/, message: 'Specific time-of-day cues present; include in typical_activity_day_time.' },
		{ pattern: /membership|dues|join|sign up|register|rsvp/, message: 'Joining instructions or membership details available — summarize clearly.' },
		{ pattern: /meetup|start point|meet at|location|parking/, message: 'Physical meetup/start location referenced — capture specific_meeting_point_address if possible.' }
	];

	for (const rule of keywordRules) add(rule.pattern.test(combined), rule.message);

	const followersMatch = /followers:\s*([^\n]+)/i.exec(docs.map((doc) => doc?.text || '').join('\n'));
	if (followersMatch) add(true, `Instagram follower count noted as ${followersMatch[1].trim()}.`);

	const externalLinkMatch = /External link:\s*([^\n]+)/i.exec(docs.map((doc) => doc?.text || '').join('\n'));
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
		add(true, `Representative snippets: ${sentences.map((s) => `"${truncate(s, 140)}"`).join(' / ')}`);
	}

	return hints.slice(0, 8);
}
