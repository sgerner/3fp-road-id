import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseDocument } from 'htmlparser2';
import { findAll, getAttributeValue, getInnerHTML, getName, textContent } from 'domutils';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { createClient } from '@supabase/supabase-js';
import {
	buildTempeBicycleActionGroupSite,
	mapTbagLegacyUrl,
	tbagSourceMediaKey,
	TBAG_SOURCE_URL
} from '../src/lib/microsites/tempeBicycleActionGroup.js';

const SOURCE_NAME = 'Tempe Bicycle Action Group';
const SOURCE_ORIGIN = TBAG_SOURCE_URL;
const GROUP_SLUG = 'tempe-bicycle-action-group';
const MICROSITE_SLUG = 'biketempe';
const IMPORT_BATCH = 'biketempe-public-archive';
const DEFAULT_COVER_URL = `${SOURCE_ORIGIN}/wp-content/uploads/2025/01/pedalpooza-1-1024x683.jpg`;
const DEFAULT_LOGO_URL = `${SOURCE_ORIGIN}/wp-content/uploads/2024/09/cropped-Bike-Tempe-Logo-Edit-Avatar-270x270.png`;

function readEnvValue(source, key) {
	const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
	if (!match) return '';
	const value = match[1].trim();
	return (value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
		? value.slice(1, -1)
		: value;
}

function clean(value) {
	return String(value ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function classNames(element) {
	return (getAttributeValue(element, 'class') || '').split(/\s+/).filter(Boolean);
}

function absoluteUrl(value, { allowMailto = false } = {}) {
	const raw = String(value || '').trim();
	if (!raw || raw.startsWith('#') || raw.startsWith('data:')) return '';
	try {
		const parsed = new URL(raw, SOURCE_ORIGIN);
		const allowedProtocols = allowMailto ? ['http:', 'https:', 'mailto:'] : ['http:', 'https:'];
		return allowedProtocols.includes(parsed.protocol) ? parsed.toString() : '';
	} catch {
		return '';
	}
}

function normalizeSourceMarkup(html) {
	return sanitizeHtml(html, {
		allowedTags: [
			'p',
			'br',
			'hr',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'ul',
			'ol',
			'li',
			'blockquote',
			'pre',
			'code',
			'strong',
			'b',
			'em',
			'i',
			's',
			'del',
			'a',
			'img',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td'
		],
		allowedAttributes: {
			a: ['href', 'title', 'target', 'rel'],
			img: ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height'],
			th: ['colspan', 'rowspan'],
			td: ['colspan', 'rowspan']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		transformTags: {
			a: (_tagName, attribs) => {
				const href = absoluteUrl(attribs.href, { allowMailto: true });
				const publicHref = mapTbagLegacyUrl(href);
				return {
					tagName: 'a',
					attribs: publicHref
						? {
								href: publicHref,
								target: /^https?:\/\//i.test(publicHref) ? '_blank' : undefined,
								rel: /^https?:\/\//i.test(publicHref) ? 'noopener noreferrer' : undefined
							}
						: {}
				};
			},
			img: (_tagName, attribs) => {
				const src = absoluteUrl(attribs.src);
				const srcset = String(attribs.srcset || '')
					.split(',')
					.map((candidate) => {
						const [url, descriptor] = candidate.trim().split(/\s+/, 2);
						const normalized = absoluteUrl(url);
						return normalized ? `${normalized}${descriptor ? ` ${descriptor}` : ''}` : '';
					})
					.filter(Boolean)
					.join(', ');
				return {
					tagName: 'img',
					attribs: {
						...(src ? { src } : {}),
						...(srcset ? { srcset } : {}),
						...(attribs.alt ? { alt: clean(attribs.alt) } : {})
					}
				};
			}
		}
	});
}

function slugify(value) {
	return clean(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 86);
}

function sourceSlug(url, title) {
	try {
		const pathname = new URL(url).pathname.replace(/\/+$/, '');
		const lastSegment = pathname.split('/').filter(Boolean).at(-1);
		return slugify(lastSegment || title) || slugify(title) || 'update';
	} catch {
		return slugify(title) || 'update';
	}
}

function parseDate(value) {
	const text = clean(value);
	if (!text) return null;
	const date = new Date(`${text} UTC`);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstImage(content) {
	const image = findAll((element) => getName(element) === 'img', content?.children || [])[0];
	return image ? absoluteUrl(getAttributeValue(image, 'src')) || '' : '';
}

function firstMeaningfulParagraph(content) {
	const paragraphs = findAll(
		(element) => getName(element) === 'p' && clean(textContent(element)).length > 24,
		content?.children || []
	);
	const text = paragraphs.length ? clean(textContent(paragraphs[0])) : '';
	return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}

function parsePost(url, html) {
	const document = parseDocument(html);
	const all = findAll(() => true, document.children);
	const article =
		all.find(
			(element) =>
				getName(element) === 'article' &&
				classNames(element).includes('type-post') &&
				classNames(element).includes('status-publish')
		) ||
		all.find(
			(element) => getName(element) === 'article' && classNames(element).includes('type-post')
		);
	if (!article) return null;

	const titleElement = findAll(
		(element) => getName(element) === 'h1' && classNames(element).includes('entry-title'),
		[article]
	)[0];
	const title = clean(textContent(titleElement));
	if (!title) return null;

	const content = findAll(
		(element) => getName(element) === 'div' && classNames(element).includes('entry-content'),
		[article]
	).at(-1);
	if (!content) return null;

	const dateElement = findAll(
		(element) => getName(element) === 'span' && classNames(element).includes('posts-date'),
		[article]
	)[0];
	const authorElement = findAll(
		(element) => getName(element) === 'span' && classNames(element).includes('posts-author'),
		[article]
	)[0];
	const bodyHtml = normalizeSourceMarkup(getInnerHTML(content));
	const turndown = new TurndownService({
		headingStyle: 'atx',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced'
	});
	const bodyMarkdown = turndown
		.turndown(bodyHtml)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (!bodyMarkdown) return null;

	return {
		title,
		slug: sourceSlug(url, title),
		summary: firstMeaningfulParagraph(content),
		body_markdown: bodyMarkdown,
		published_at: parseDate(dateElement ? textContent(dateElement) : ''),
		source_published_at: parseDate(dateElement ? textContent(dateElement) : ''),
		source_url: url,
		source_name: SOURCE_NAME,
		cover_image_url: firstImage(content),
		author: clean(authorElement ? textContent(authorElement) : '')
	};
}

async function fetchText(url, { timeoutMs = 20000 } = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				'user-agent': '3fp-tbag-site-import/1.0',
				accept: 'text/html,application/xml;q=0.9,*/*;q=0.8'
			}
		});
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
		return await response.text();
	} finally {
		clearTimeout(timer);
	}
}

const SOURCE_CONTENT_PAGES = Object.freeze([
	['board', `${SOURCE_ORIGIN}/current-board`],
	['bylaws', `${SOURCE_ORIGIN}/by-laws`],
	['advocacy-resources', `${SOURCE_ORIGIN}/advocacy-resources`],
	['bike-count-data', `${SOURCE_ORIGIN}/bike-count-data`],
	['bike-count-2025', `${SOURCE_ORIGIN}/count`],
	['bike-racks', `${SOURCE_ORIGIN}/racks`],
	['bike-valet', `${SOURCE_ORIGIN}/bike-valet`],
	['cyclists-feat', `${SOURCE_ORIGIN}/cyclists-feat-farmer-artwork`],
	['bike-friendly-businesses', `${SOURCE_ORIGIN}/bicycle-friendly-restaurants`],
	['about', `${SOURCE_ORIGIN}/about`],
	['general', `${SOURCE_ORIGIN}/general`],
	['social-contract-to-volunteers', `${SOURCE_ORIGIN}/social-contract-to-volunteers`]
]);

function isSourceUploadUrl(value) {
	try {
		const parsed = new URL(value);
		return (
			['biketempe.org', 'www.biketempe.org'].includes(parsed.hostname.toLowerCase()) &&
			parsed.pathname.startsWith('/wp-content/uploads/')
		);
	} catch {
		return false;
	}
}

function imageTitleFromUrl(sourceUrl, alt, pageSlug, index) {
	const explicit = clean(alt);
	if (explicit && !/^your paragraph text$/i.test(explicit)) return explicit;
	try {
		const filename = decodeURIComponent(new URL(sourceUrl).pathname.split('/').at(-1) || '')
			.replace(/-\d+x\d+(?=\.[^.]+$)/i, '')
			.replace(/-scaled(?=\.[^.]+$)/i, '')
			.replace(/\.[^.]+$/, '')
			.replace(/[-_]+/g, ' ')
			.trim();
		if (filename) return filename.replace(/\b\w/g, (letter) => letter.toUpperCase());
	} catch {
		// Fall through to a stable page-local label.
	}
	return `${pageSlug} archive image ${index + 1}`;
}

function sourcePageEntryContent(html) {
	const document = parseDocument(html);
	const all = findAll(() => true, document.children);
	const article = all.find(
		(element) => getName(element) === 'article' && classNames(element).includes('page')
	);
	if (!article) return null;
	return findAll(
		(element) => getName(element) === 'div' && classNames(element).includes('entry-content'),
		[article]
	).at(-1);
}

function extractSourcePageMedia(pageSlug, html) {
	const content = sourcePageEntryContent(html);
	if (!content) return [];
	const seen = new Set();
	return findAll((element) => getName(element) === 'img', [content])
		.map((element, index) => {
			const linkedSource =
				element.parent && getName(element.parent) === 'a'
					? getAttributeValue(element.parent, 'href')
					: '';
			const sourceCandidates = [linkedSource, getAttributeValue(element, 'src')];
			const sourceUrl = sourceCandidates
				.map((candidate) => absoluteUrl(candidate))
				.find((candidate) => isSourceUploadUrl(candidate));
			if (!isSourceUploadUrl(sourceUrl) || seen.has(sourceUrl)) return null;
			seen.add(sourceUrl);
			return [
				imageTitleFromUrl(sourceUrl, getAttributeValue(element, 'alt'), pageSlug, index),
				sourceUrl,
				`Media used on the original ${pageSlug} page.`,
				pageSlug
			];
		})
		.filter(Boolean);
}

async function crawlSourcePageMedia() {
	const crawled = await mapWithConcurrency(SOURCE_CONTENT_PAGES, 4, async ([pageSlug, url]) => {
		try {
			return extractSourcePageMedia(pageSlug, await fetchText(url));
		} catch (error) {
			console.warn(`skip source page media ${url}: ${error.message}`);
			return [];
		}
	});
	return crawled.flat();
}

function mergeSourcePhotos(crawledPhotos = []) {
	const merged = new Map(SOURCE_PHOTOS.map((photo) => [tbagSourceMediaKey(photo[1]), photo]));
	for (const photo of crawledPhotos) {
		const key = tbagSourceMediaKey(photo[1]);
		if (key && !merged.has(key)) merged.set(key, photo);
	}
	return [...merged.values()];
}

async function getPostUrls() {
	const sitemap = await fetchText(`${SOURCE_ORIGIN}/wp-sitemap-posts-post-1.xml`);
	return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
		.map((match) => match[1].trim())
		.filter(Boolean);
}

async function mapWithConcurrency(items, limit, worker) {
	const output = new Array(items.length);
	let nextIndex = 0;
	async function run() {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			output[index] = await worker(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
	return output;
}

async function crawlPosts() {
	const urls = await getPostUrls();
	let complete = 0;
	const results = await mapWithConcurrency(urls, 8, async (url) => {
		try {
			const html = await fetchText(url);
			const post = parsePost(url, html);
			complete += 1;
			if (complete % 50 === 0) console.log(`crawled ${complete}/${urls.length} posts`);
			return post;
		} catch (error) {
			complete += 1;
			console.warn(`skip ${url}: ${error.message}`);
			return null;
		}
	});
	const posts = results.filter(Boolean);
	const usedSlugs = new Set();
	for (const post of posts) {
		const base = post.slug || 'update';
		let candidate = base;
		let suffix = 2;
		while (usedSlugs.has(candidate)) candidate = `${base}-${suffix++}`.slice(0, 96);
		usedSlugs.add(candidate);
		post.slug = candidate;
	}
	posts.sort((a, b) => {
		const aTime = new Date(a.published_at || 0).getTime();
		const bTime = new Date(b.published_at || 0).getTime();
		return bTime - aTime;
	});
	return posts;
}

function buildGroupPayload() {
	return {
		slug: GROUP_SLUG,
		microsite_slug: MICROSITE_SLUG,
		name: SOURCE_NAME,
		city: 'Tempe',
		state_region: 'Arizona',
		country: 'US',
		tagline: 'Safer streets. Better bicycling. A stronger Tempe.',
		description:
			'Working to make bicycling a prominent, safe, and convenient form of transportation and recreation in Tempe, Arizona and surrounding areas through education, grassroots events, and civic participation.',
		website_url: SOURCE_ORIGIN,
		public_contact_email: 'info@biketempe.org',
		preferred_contact_method_instructions:
			'Email info@biketempe.org for general questions, calendar corrections, project ideas, or volunteer opportunities.',
		how_to_join_instructions:
			'Join the email list for advocacy alerts, volunteer opportunities, leadership opportunities, rides, events, and fun.',
		membership_info:
			'A community-led 501(c)(3) bicycle advocacy organization serving Tempe and surrounding areas.',
		service_area_description: 'Tempe and surrounding East Valley communities',
		activity_frequency:
			'Public meetings, action alerts, and community events are announced as scheduled.',
		typical_activity_day_time: null,
		logo_url: DEFAULT_LOGO_URL,
		cover_photo_url: DEFAULT_COVER_URL,
		social_links: {
			facebook: 'https://www.facebook.com/biketempe',
			instagram: 'https://www.instagram.com/biketempe/',
			x: 'https://twitter.com/biketempe',
			youtube: null,
			linkedin: null,
			threads: null,
			mastodon: null,
			tiktok: null,
			strava: null,
			bluesky: null,
			discord: null
		},
		preferred_cta_kind: 'custom',
		preferred_cta_label: 'Act now',
		preferred_cta_url: '/take-action',
		is_published: true
	};
}

async function findOrCreateGroup(db, ownerId) {
	const byMicrosite = await db
		.from('groups')
		.select('*')
		.eq('microsite_slug', MICROSITE_SLUG)
		.maybeSingle();
	if (byMicrosite.error) throw byMicrosite.error;
	const bySlug = byMicrosite.data
		? { data: byMicrosite.data, error: null }
		: await db.from('groups').select('*').eq('slug', GROUP_SLUG).maybeSingle();
	if (bySlug.error) throw bySlug.error;

	const payload = buildGroupPayload();
	let group = bySlug.data;
	if (group) {
		const updated = await db.from('groups').update(payload).eq('id', group.id).select('*').single();
		if (updated.error) throw updated.error;
		group = updated.data;
	} else {
		const inserted = await db.from('groups').insert(payload).select('*').single();
		if (inserted.error) throw inserted.error;
		group = inserted.data;
	}

	const existingOwner = await db
		.from('group_members')
		.select('user_id')
		.eq('group_id', group.id)
		.eq('user_id', ownerId)
		.maybeSingle();
	if (existingOwner.error) throw existingOwner.error;
	if (!existingOwner.data) {
		const membership = await db
			.from('group_members')
			.insert({ group_id: group.id, user_id: ownerId, role: 'owner' });
		if (membership.error) throw membership.error;
	}
	return group;
}

async function findOwner(db) {
	const override = process.env.TBAG_OWNER_USER_ID?.trim();
	if (override) return override;
	const sourceGroup = await db.from('groups').select('id').eq('slug', '3-feet-please').single();
	if (sourceGroup.error) throw sourceGroup.error;
	const owners = await db
		.from('group_members')
		.select('user_id')
		.eq('group_id', sourceGroup.data.id)
		.eq('role', 'owner');
	if (owners.error) throw owners.error;
	if (!owners.data?.length)
		throw new Error('No TBAG owner selected. Set TBAG_OWNER_USER_ID before running the importer.');
	const ids = owners.data.map((row) => row.user_id).filter(Boolean);
	const profiles = await db.from('profiles').select('user_id,full_name').in('user_id', ids);
	if (!profiles.error) {
		const named = profiles.data?.find((profile) => /steve|steven/i.test(profile.full_name || ''));
		if (named?.user_id) return named.user_id;
	}
	return ids[0];
}

function siteConfigPayload(config, groupId) {
	return {
		group_id: groupId,
		site_title: config.site_title,
		site_tagline: config.site_tagline,
		home_intro: config.home_intro,
		featured_quote: config.featured_quote,
		footer_blurb: config.footer_blurb,
		seo_description: config.seo_description,
		hero_style: config.hero_style,
		background_style: config.background_style,
		panel_style: config.panel_style,
		panel_tone: config.panel_tone,
		panel_density: config.panel_density,
		font_pairing: config.font_pairing,
		theme_mode: config.theme_mode,
		theme_name: config.theme_name || null,
		theme_colors: config.theme_colors,
		simple_mode: config.simple_mode,
		site_variant: config.site_variant,
		microsite_notice: config.microsite_notice || null,
		microsite_notice_href: config.microsite_notice_href || null,
		new_rider_note: config.new_rider_note || null,
		meeting_instructions: config.meeting_instructions || null,
		faq_1_q: config.faq_1_q || null,
		faq_1_a: config.faq_1_a || null,
		faq_2_q: config.faq_2_q || null,
		faq_2_a: config.faq_2_a || null,
		safety_note: config.safety_note || null,
		sponsor_links: config.sponsor_links || [],
		sponsor_items: config.sponsor_items || [],
		ride_widget_enabled: false,
		ride_widget_title: config.ride_widget_title || 'Ride calendar',
		ride_widget_host_scope: config.ride_widget_host_scope || 'group_only',
		ride_widget_group_ids: [],
		ride_widget_config: config.ride_widget_config || {},
		announcement_expires_at: null,
		sections: config.sections,
		page_blocks: config.page_blocks,
		site_pages: config.site_pages,
		ai_prompt: null,
		published: true,
		updated_at: new Date().toISOString()
	};
}

async function storeBrandImage(db, groupId, kind, sourceUrl, ownerId) {
	const response = await fetch(sourceUrl, {
		headers: { 'user-agent': '3fp-tbag-site-import/1.0' }
	});
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
	const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
	const bytes = Buffer.from(await response.arrayBuffer());
	const extension = contentType.includes('png')
		? 'png'
		: contentType.includes('webp')
			? 'webp'
			: 'jpg';
	const objectPath = `groups/${groupId}/brand/tbag-${kind}.${extension}`;
	const upload = await db.storage.from('group-assets').upload(objectPath, bytes, {
		contentType,
		upsert: true,
		cacheControl: '31536000'
	});
	if (upload.error) throw upload.error;
	const { data } = db.storage.from('group-assets').getPublicUrl(objectPath);
	return { url: data.publicUrl, objectPath, contentType, bytes, ownerId };
}

const SOURCE_LINKS = [
	[
		'TBAG public calendar',
		`${SOURCE_ORIGIN}/calendar`,
		'Public meetings and community events; verify details before attending.'
	],
	[
		'Advocacy resources',
		`${SOURCE_ORIGIN}/advocacy-resources`,
		'City, biking, safety, and active transportation resources.'
	],
	[
		'Biking data',
		`${SOURCE_ORIGIN}/bike-count-data`,
		'Tempe bike count reports, raw data, and related research.'
	],
	[
		'Bike Count 2025',
		`${SOURCE_ORIGIN}/count`,
		'Community bike count information and volunteer context.'
	],
	[
		'Bike racks for businesses',
		`${SOURCE_ORIGIN}/racks`,
		'The history and practical details of TBAG bike rack projects.'
	],
	[
		'Bike valet',
		`${SOURCE_ORIGIN}/bike-valet`,
		'Program history and volunteer context; current availability may change.'
	],
	[
		'Cyclist’s Feat — Farmer Avenue artwork',
		`${SOURCE_ORIGIN}/cyclists-feat-farmer-artwork`,
		'A Tempe traffic-calming and public-art project.'
	],
	[
		'Businesses with cyclist discounts',
		`${SOURCE_ORIGIN}/bicycle-friendly-restaurants`,
		'Local businesses that have offered cyclist-friendly discounts.'
	],
	[
		'Mission and goals',
		`${SOURCE_ORIGIN}/about`,
		'The original mission, goals, and organizational background.'
	],
	[
		'Board members',
		`${SOURCE_ORIGIN}/current-board`,
		'The source site’s board listing; roles can change.'
	],
	['Bylaws', `${SOURCE_ORIGIN}/by-laws`, 'Organizational bylaws and governance reference.'],
	[
		'General contact',
		`${SOURCE_ORIGIN}/general`,
		'Official general email and mailing address for TBAG.'
	],
	[
		'Social Contract to Volunteers',
		`${SOURCE_ORIGIN}/social-contract-to-volunteers`,
		'Ratified expectations for organizers, volunteers, communication, and conduct.'
	],
	[
		'Donate',
		`${SOURCE_ORIGIN}/donate`,
		'Official donation options, including Venmo and nonprofit information.'
	],
	[
		'Join the email list',
		`${SOURCE_ORIGIN}/join-us`,
		'Original signup page and communication preferences.'
	],
	[
		'3fp.org community hub',
		'https://3fp.org',
		'Find local cycling groups, rides, resources, and practical support.'
	]
];

const SOURCE_PHOTOS = [
	[
		'Pedalpalooza in Tempe',
		`${SOURCE_ORIGIN}/wp-content/uploads/2025/01/pedalpooza-1-1024x683.jpg`,
		'Community cycling in Tempe.',
		'home'
	],
	[
		'Cyclists making a safer crossing',
		`${SOURCE_ORIGIN}/wp-content/uploads/2025/09/DSC_0168-1024x683.jpg`,
		'People riding together in the city.',
		'home'
	],
	[
		'Tempe cycling community',
		`${SOURCE_ORIGIN}/wp-content/uploads/2025/07/514948242_10239112425648221_1149743675650499483_n-1024x1365.jpg`,
		'A community moment from the source archive.',
		'home'
	],
	[
		'A ride in motion',
		`${SOURCE_ORIGIN}/wp-content/uploads/2024/07/IMG_3894-2-1024x1024.jpg`,
		'A local ride photo from the source archive.',
		'home'
	],
	[
		'Community ride scene',
		`${SOURCE_ORIGIN}/wp-content/uploads/2024/06/unnamed-2-734x1024.jpg`,
		'A Tempe cycling moment from the source archive.',
		'home'
	],
	[
		'Bike valet at Innings Festival',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/2020-InningsFest-b-1024x599.jpg`,
		'Historical TBAG bike valet program photo.',
		'bike-valet'
	],
	[
		'Bike valet program header',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/Bicycle-Valet-Header.png`,
		'Historical TBAG bike valet program image.',
		'bike-valet'
	],
	[
		'2025 Tempe bike count',
		`${SOURCE_ORIGIN}/wp-content/uploads/2025/03/Bike-Count-2025-Header-1024x349.png`,
		'Header image from the original 2025 Tempe bike count page.',
		'bike-count-2025'
	],
	[
		'Cornish Pasty bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/06/32629_10200100808536748_1392903074_n.jpg`,
		'Bike rack project at Cornish Pasty on Hardy and University.',
		'bike-racks'
	],
	[
		'Rag-O-Rama bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/Rag-O-Rama.jpg`,
		'Bike rack project at the former Rag-O-Rama location.',
		'bike-racks'
	],
	[
		'Dance studio bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/Dance-Studio-1.jpg`,
		'Bike rack project at a local dance studio.',
		'bike-racks'
	],
	[
		'Fuel to Fit bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/WP_20221013_17_03_17_Pro.jpg`,
		'Bike rack installation documented by TBAG.',
		'bike-racks'
	],
	[
		'Four Peaks bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/Four-Peaks-2-scaled.jpg`,
		'Bike rack installation at Four Peaks.',
		'bike-racks'
	],
	[
		'N.O.A.H. bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/12/WP_20221206_12_38_34_Pro-scaled.jpg`,
		'Shortened and powder-coated bike rack at Neighborhood Outreach Access to Health.',
		'bike-racks'
	],
	[
		'Pinnacle Prevention bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2023/01/WP_20230107_11_04_45_Pro-1024x577.jpg`,
		'Bike rack project at Pinnacle Prevention in Chandler.',
		'bike-racks'
	],
	[
		'UPS Store bike rack',
		`${SOURCE_ORIGIN}/wp-content/uploads/2023/01/UPS-store.jpg`,
		'Bike rack behind Ted’s Hot Dogs near the UPS Store.',
		'bike-racks'
	],
	[
		'Bike rack powder coat colors',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/AZ-Powder-coat-colors-scaled.jpg`,
		'Powder coat color board from the bike rack project archive.',
		'bike-racks'
	],
	[
		'Cyclist’s Feat concept image',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/Capture.jpg`,
		'Cyclist’s Feat public art on Farmer Avenue.',
		'cyclists-feat'
	],
	[
		'Farmer Avenue artwork',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/10/1377462_700391943323479_32731899_n.jpg`,
		'Cyclist’s Feat public art on Farmer Avenue.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat public art',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/10/1381713_10151902306058130_67525067_n.jpg`,
		'Cyclist’s Feat public art on Farmer Avenue.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat installation',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/10/IMG_2771.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat detail',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/10/IMG_2769.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat boulder',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/10/IMG_2766.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat on Farmer Avenue',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/2020-3-e-South-east-scaled.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat streetscape',
		`${SOURCE_ORIGIN}/wp-content/uploads/2022/11/WP_20221117_12_32_03_Pro-scaled.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat Farmer Avenue view',
		`${SOURCE_ORIGIN}/wp-content/uploads/2023/02/cyclistsfeatfarmerave-1024x768.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist’s Feat archive image',
		`${SOURCE_ORIGIN}/wp-content/uploads/2023/02/unnamed-1-1024x935.jpg`,
		'Cyclist’s Feat installation photo from the TBAG archive.',
		'cyclists-feat'
	],
	[
		'Cyclist-friendly business sticker',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/lovebikers2.png`,
		'TBAG cyclist-friendly business sticker.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/80555737_2741977015823226_192467659311284224_n.jpg`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business storefront',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/92591643_2615521115348934_5858051906722594816_n.jpg`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business archive image',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/o.jpg`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business sign',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/Screen-Shot-2021-03-09-at-10.17.34-AM.png`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business listing',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/Screen-Shot-2021-03-09-at-10.19.01-AM.png`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business group',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/14444720_520612431479451_300145071237420015_o-1024x403.png`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'Cyclist-friendly business archive',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/03/static1.squarespace.png`,
		'Local business image from the TBAG cyclist-friendly list.',
		'bike-friendly-businesses'
	],
	[
		'TBAG board archive header',
		`${SOURCE_ORIGIN}/wp-content/uploads/2015/06/cropped-tbagheader-300x29.png`,
		'Header image from the original TBAG board page.',
		'board'
	]
];

const SOURCE_FILES = [
	[
		'Bylaws — amended July 25, 2021',
		`${SOURCE_ORIGIN}/wp-content/uploads/2021/08/Bylaws_amended_7-21.pdf`,
		'Official bylaws PDF mirrored from the former TBAG website.'
	],
	[
		'Tempe Bike Count Report 2011',
		`${SOURCE_ORIGIN}/wp-content/uploads/2011/12/Tempe-Bike-Count-2011-Final-Report1.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2012',
		`${SOURCE_ORIGIN}/wp-content/uploads/2013/01/Tempe_Bike_Count_Report_2012.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2013',
		`${SOURCE_ORIGIN}/wp-content/uploads/2014/04/Tempe_Bike_Count_Report_2013.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2014',
		`${SOURCE_ORIGIN}/dls/Tempe_Bike_Count_Report_2014.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2015',
		`${SOURCE_ORIGIN}/wp-content/uploads/2016/07/Tempe_Bike_Count_Report_20151.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2016',
		`${SOURCE_ORIGIN}/wp-content/uploads/2016/07/Tempe_Bike_Count_Report_2016corr.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2017',
		`${SOURCE_ORIGIN}/wp-content/uploads/2019/05/Tempe_Bike_Count_Report_2017_rev2.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2018',
		`${SOURCE_ORIGIN}/wp-content/uploads/2019/05/Tempe_Bike_Count_Report_2018.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Tempe Bike Count Report 2024',
		`${SOURCE_ORIGIN}/wp-content/uploads/2024/07/Tempe-Bike-Count-Report-2024.pdf`,
		'Original Tempe bike count report.'
	],
	[
		'Cyclist’s Feat initial proposal',
		`${SOURCE_ORIGIN}/wp-content/uploads/2012/01/TBAGbicycleART.pdf`,
		'Initial coLAB Studio proposal for the Farmer Avenue artwork.'
	]
];

async function ensureSection(db, groupId, ownerId, slug, name, sectionType, description) {
	const existing = await db
		.from('group_asset_sections')
		.select('id')
		.eq('group_id', groupId)
		.eq('slug', slug)
		.maybeSingle();
	if (existing.error) throw existing.error;
	if (existing.data) return existing.data.id;
	const inserted = await db
		.from('group_asset_sections')
		.insert({
			group_id: groupId,
			created_by_user_id: ownerId,
			name,
			slug,
			description,
			section_type: sectionType,
			sort_order: slug === 'photos' ? 0 : slug === 'links' ? 1 : 2
		})
		.select('id')
		.single();
	if (inserted.error) throw inserted.error;
	return inserted.data.id;
}

async function seedLinks(db, groupId, ownerId) {
	const sectionId = await ensureSection(
		db,
		groupId,
		ownerId,
		'links',
		'Links',
		'links',
		'Official TBAG pages, local tools, and trusted partner resources.'
	);
	const rows = SOURCE_LINKS.map(([title, url, description], index) => ({
		group_id: groupId,
		section_id: sectionId,
		created_by_user_id: ownerId,
		asset_kind: 'link',
		title,
		description,
		sort_order: index,
		external_url: mapTbagLegacyUrl(url),
		metadata: {
			bucket: 'links',
			source_url: url,
			source_name: SOURCE_NAME,
			import_batch: IMPORT_BATCH
		}
	}));
	for (const row of rows) {
		const publicExisting = await db
			.from('group_assets')
			.select('id')
			.eq('group_id', groupId)
			.eq('asset_kind', 'link')
			.eq('external_url', row.external_url)
			.maybeSingle();
		if (publicExisting.error) throw publicExisting.error;
		let existing = publicExisting.data;
		if (!existing) {
			const legacyExisting = await db
				.from('group_assets')
				.select('id')
				.eq('group_id', groupId)
				.eq('asset_kind', 'link')
				.eq('external_url', row.metadata.source_url)
				.maybeSingle();
			if (legacyExisting.error) throw legacyExisting.error;
			existing = legacyExisting.data;
		}
		if (!existing) {
			const titleExisting = await db
				.from('group_assets')
				.select('id, external_url, metadata')
				.eq('group_id', groupId)
				.eq('asset_kind', 'link')
				.eq('title', row.title)
				.maybeSingle();
			if (titleExisting.error) throw titleExisting.error;
			const candidate = titleExisting.data;
			const candidateSource = candidate?.metadata?.source_url;
			if (
				candidate &&
				(candidateSource === row.metadata.source_url ||
					(!candidateSource && ['/assets', '/take-action'].includes(candidate.external_url)))
			) {
				existing = candidate;
			}
		}
		if (existing) {
			const updated = await db.from('group_assets').update(row).eq('id', existing.id);
			if (updated.error) throw updated.error;
		} else {
			const inserted = await db.from('group_assets').insert(row);
			if (inserted.error) throw inserted.error;
		}
	}
	return rows.length;
}

async function seedPhotos(db, groupId, ownerId, sourcePhotos = SOURCE_PHOTOS) {
	const sectionId = await ensureSection(
		db,
		groupId,
		ownerId,
		'photos',
		'Photos',
		'gallery',
		'Photos imported from the former biketempe.org site.'
	);
	let imported = 0;
	for (const [title, sourceUrl, description, sourcePage] of sourcePhotos) {
		try {
			const response = await fetch(sourceUrl, {
				headers: { 'user-agent': '3fp-tbag-site-import/1.0' }
			});
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
			const bytes = Buffer.from(await response.arrayBuffer());
			const extension = contentType.includes('png')
				? 'png'
				: contentType.includes('webp')
					? 'webp'
					: 'jpg';
			const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10);
			const objectPath = `groups/${groupId}/assets/photos/tbag-${hash}.${extension}`;
			const upload = await db.storage.from('group-assets').upload(objectPath, bytes, {
				contentType,
				upsert: true,
				cacheControl: '31536000'
			});
			if (upload.error) throw upload.error;
			const { data: publicUrl } = db.storage.from('group-assets').getPublicUrl(objectPath);
			const metadata = {
				bucket: 'photos',
				source_url: sourceUrl,
				source_name: SOURCE_NAME,
				import_batch: IMPORT_BATCH,
				...(sourcePage ? { source_page: sourcePage } : {}),
				alt: title
			};
			const existing = await db
				.from('group_assets')
				.select('id')
				.eq('group_id', groupId)
				.eq('asset_kind', 'file')
				.eq('object_path', objectPath)
				.maybeSingle();
			if (existing.error) throw existing.error;
			const row = {
				group_id: groupId,
				section_id: sectionId,
				created_by_user_id: ownerId,
				asset_kind: 'file',
				title,
				description,
				sort_order: imported,
				file_url: publicUrl.publicUrl,
				bucket_id: 'group-assets',
				object_path: objectPath,
				file_name: `tbag-${hash}.${extension}`,
				mime_type: contentType,
				size_bytes: bytes.byteLength,
				metadata
			};
			if (existing.data) {
				const updated = await db.from('group_assets').update(row).eq('id', existing.data.id);
				if (updated.error) throw updated.error;
			} else {
				const inserted = await db.from('group_assets').insert(row);
				if (inserted.error) throw inserted.error;
			}
			imported += 1;
		} catch (error) {
			console.warn(`skip photo ${sourceUrl}: ${error.message}`);
		}
	}
	await removeDuplicateManagedPhotos(db, groupId, sectionId, sourcePhotos);
	return imported;
}

async function removeDuplicateManagedPhotos(db, groupId, sectionId, sourcePhotos) {
	const managed = await db
		.from('group_assets')
		.select('id,object_path,metadata')
		.eq('group_id', groupId)
		.eq('section_id', sectionId)
		.eq('asset_kind', 'file');
	if (managed.error) throw managed.error;

	const sourceKeys = new Set(sourcePhotos.map((photo) => tbagSourceMediaKey(photo[1])));
	const candidates = managed.data.filter(
		(asset) =>
			asset.metadata?.import_batch === IMPORT_BATCH &&
			asset.metadata?.source_url &&
			sourceKeys.has(tbagSourceMediaKey(asset.metadata.source_url))
	);
	const bySource = new Map();
	for (const asset of candidates) {
		const key = tbagSourceMediaKey(asset.metadata.source_url);
		const rows = bySource.get(key) || [];
		rows.push(asset);
		bySource.set(key, rows);
	}

	const preferredUrls = new Set(sourcePhotos.map((photo) => photo[1]));
	for (const rows of bySource.values()) {
		if (rows.length < 2) continue;
		const keep = rows.find((row) => preferredUrls.has(row.metadata.source_url)) || rows[0];
		for (const duplicate of rows) {
			if (duplicate.id === keep.id) continue;
			if (duplicate.object_path) {
				const removed = await db.storage.from('group-assets').remove([duplicate.object_path]);
				if (removed.error) throw removed.error;
			}
			const deleted = await db.from('group_assets').delete().eq('id', duplicate.id);
			if (deleted.error) throw deleted.error;
		}
	}
}

function fileExtension(sourceUrl, contentType = '') {
	const normalizedType = String(contentType).split(';')[0].trim().toLowerCase();
	if (normalizedType === 'application/pdf') return '.pdf';
	if (normalizedType === 'text/plain') return '.txt';
	if (normalizedType === 'text/csv') return '.csv';
	try {
		const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
		return extension && extension.length <= 8 ? extension : '.bin';
	} catch {
		return '.bin';
	}
}

async function seedFiles(db, groupId, ownerId) {
	const sectionId = await ensureSection(
		db,
		groupId,
		ownerId,
		'files',
		'Files',
		'documents',
		'Original TBAG documents mirrored from the former biketempe.org site.'
	);
	let imported = 0;
	for (const [title, sourceUrl, description] of SOURCE_FILES) {
		try {
			const response = await fetch(sourceUrl, {
				headers: { 'user-agent': '3fp-tbag-site-import/1.0' }
			});
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			// All entries in SOURCE_FILES are PDFs. Use the known allowlisted type even
			// when the legacy server responds with application/octet-stream.
			const contentType = 'application/pdf';
			const bytes = Buffer.from(await response.arrayBuffer());
			if (!bytes.length) throw new Error('empty response');
			if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('response is not a PDF');
			if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('file exceeds the 25 MB limit');
			const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10);
			const extension = fileExtension(sourceUrl, contentType);
			const objectPath = `groups/${groupId}/assets/files/tbag-${hash}${extension}`;
			const upload = await db.storage.from('group-assets').upload(objectPath, bytes, {
				contentType,
				upsert: true,
				cacheControl: '31536000'
			});
			if (upload.error) throw upload.error;
			const { data: publicUrl } = db.storage.from('group-assets').getPublicUrl(objectPath);
			const metadata = {
				bucket: 'files',
				source_url: sourceUrl,
				source_name: SOURCE_NAME,
				import_batch: IMPORT_BATCH
			};
			const existing = await db
				.from('group_assets')
				.select('id')
				.eq('group_id', groupId)
				.eq('asset_kind', 'file')
				.eq('object_path', objectPath)
				.maybeSingle();
			if (existing.error) throw existing.error;
			const row = {
				group_id: groupId,
				section_id: sectionId,
				created_by_user_id: ownerId,
				asset_kind: 'file',
				title,
				description,
				sort_order: imported,
				file_url: publicUrl.publicUrl,
				bucket_id: 'group-assets',
				object_path: objectPath,
				file_name: `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}${extension}`,
				mime_type: contentType,
				size_bytes: bytes.byteLength,
				metadata
			};
			if (existing.data) {
				const updated = await db.from('group_assets').update(row).eq('id', existing.data.id);
				if (updated.error) throw updated.error;
			} else {
				const inserted = await db.from('group_assets').insert(row);
				if (inserted.error) throw inserted.error;
			}
			imported += 1;
		} catch (error) {
			console.warn(`skip file ${sourceUrl}: ${error.message}`);
		}
	}
	return imported;
}

async function seedNews(db, groupId, ownerId, posts) {
	let imported = 0;
	for (let offset = 0; offset < posts.length; offset += 40) {
		const chunk = posts.slice(offset, offset + 40).map((post) => ({
			group_id: groupId,
			title: post.title,
			slug: post.slug,
			summary: post.summary || null,
			body_markdown: post.body_markdown,
			is_private: false,
			published_at: post.published_at || new Date().toISOString(),
			created_by_user_id: ownerId,
			updated_by_user_id: ownerId,
			source_url: post.source_url,
			source_name: post.source_name,
			source_published_at: post.source_published_at,
			cover_image_url: post.cover_image_url || null,
			updated_at: new Date().toISOString()
		}));
		const result = await db
			.from('group_news_posts')
			.upsert(chunk, { onConflict: 'group_id,source_url' });
		if (result.error) throw result.error;
		imported += chunk.length;
		console.log(`imported ${imported}/${posts.length} posts`);
	}
	return imported;
}

async function main() {
	const envSource = await readFile(new URL('../.env', import.meta.url), 'utf8').catch(() => '');
	const supabaseUrl =
		process.env.PUBLIC_SUPABASE_URL || readEnvValue(envSource, 'PUBLIC_SUPABASE_URL');
	const serviceRoleKey =
		process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvValue(envSource, 'SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !serviceRoleKey)
		throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

	const db = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const ownerId = await findOwner(db);
	console.log(`using existing organization owner ${ownerId.slice(0, 8)}…`);
	const group = await findOrCreateGroup(db, ownerId);
	console.log(`group ready: ${group.slug} (${group.id})`);

	const brand = {};
	for (const [kind, sourceUrl] of [
		['logo', DEFAULT_LOGO_URL],
		['cover', DEFAULT_COVER_URL]
	]) {
		try {
			brand[kind] = await storeBrandImage(db, group.id, kind, sourceUrl, ownerId);
		} catch (error) {
			console.warn(`could not mirror ${kind}: ${error.message}`);
		}
	}
	if (brand.logo?.url || brand.cover?.url) {
		const updates = {
			...(brand.logo?.url ? { logo_url: brand.logo.url } : {}),
			...(brand.cover?.url ? { cover_photo_url: brand.cover.url } : {})
		};
		const updated = await db.from('groups').update(updates).eq('id', group.id);
		if (updated.error) throw updated.error;
	}

	const config = buildTempeBicycleActionGroupSite({ ...group, slug: GROUP_SLUG });
	const storedConfig = await db
		.from('group_site_configs')
		.upsert(siteConfigPayload(config, group.id), { onConflict: 'group_id' })
		.select('group_id,published,site_variant,site_pages')
		.single();
	if (storedConfig.error) throw storedConfig.error;

	const sourcePhotos = mergeSourcePhotos(await crawlSourcePageMedia());
	console.log(`found ${sourcePhotos.length} source page photos to mirror`);
	const [links, photos, files] = await Promise.all([
		seedLinks(db, group.id, ownerId),
		seedPhotos(db, group.id, ownerId, sourcePhotos),
		seedFiles(db, group.id, ownerId)
	]);
	const posts = await crawlPosts();
	const news = await seedNews(db, group.id, ownerId, posts);
	console.log(
		JSON.stringify({
			group: group.slug,
			microsite: group.microsite_slug,
			published: storedConfig.data.published,
			pages: storedConfig.data.site_pages.map((page) => page.slug || 'home'),
			links,
			photos,
			files,
			posts: news
		})
	);
}

export {
	crawlPosts,
	crawlSourcePageMedia,
	extractSourcePageMedia,
	mergeSourcePhotos,
	parsePost,
	seedFiles,
	SOURCE_CONTENT_PAGES,
	SOURCE_FILES,
	SOURCE_LINKS,
	SOURCE_PHOTOS
};

const isDirectRun = process.argv[1] && new URL(process.argv[1], 'file:').href === import.meta.url;
if (isDirectRun) {
	main().catch((error) => {
		console.error(error?.stack || error?.message || error);
		process.exitCode = 1;
	});
}
