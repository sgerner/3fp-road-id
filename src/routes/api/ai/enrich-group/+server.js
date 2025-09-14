import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

const ai = new GoogleGenAI({ apiKey: env.GENAI_API_KEY });

/**
 * Fetch a URL and return { url, html, text } with minimal sanitization.
 */
async function fetchAndExtract(url) {
	try {
		const res = await fetch(url, { redirect: 'follow' });
		if (!res.ok) return null;
		const html = await res.text();
		const clean = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
			.replace(/<!--([\s\S]*?)-->/g, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return { url, html, text: clean.slice(0, 20000) }; // cap to ~20k chars
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
		if (main) scraped.push(main);
		try {
			// basic internal links discovery from the raw HTML
			const res = await fetch(site, { redirect: 'follow' });
			if (res.ok) {
				const html = await res.text();
				const origin = new URL(site).origin;
				const rels = Array.from(html.matchAll(/href\s*=\s*"([^"]+)"/gi))
					.map((m) => m[1])
					.filter(
						(h) => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:')
					);
				const abs = [];
				for (const h of rels) {
					try {
						const u = new URL(h, site);
						if (u.origin === origin && !urls.includes(u.href) && !abs.includes(u.href))
							abs.push(u.href);
					} catch {}
				}
				// Fetch up to 5 internal links
				const limited = abs.slice(0, 5);
				const more = await Promise.all(limited.map((u) => fetchAndExtract(u)));
				for (const m of more) if (m) scraped.push(m);
			}
		} catch {}
	}

	const instruction = `You are helping populate a public directory entry for a cycling-related group.
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
Context name (if provided by user): ${name || ''}`;

	const contents = [instruction];
	// Include raw URLs to enable urlContext tool
	for (const u of urls) contents.push(u);
	// Include scraped text chunks (limited)
	for (const doc of scraped) contents.push(`Content from ${doc.url}:\n${doc.text}`);

	try {
		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash',
			contents,
			config: {
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
