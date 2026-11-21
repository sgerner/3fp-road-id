const SOCIAL_LINK_FIELDS = [
	'instagram',
	'facebook',
	'x',
	'threads',
	'mastodon',
	'youtube',
	'tiktok',
	'strava',
	'bluesky',
	'discord',
	'linkedin'
];

function parseInstagramPostUrls(raw) {
	const lines = String(raw || '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const posts = [];
	const seen = new Set();

	for (const line of lines) {
		let parsed;
		try {
			parsed = new URL(line);
		} catch {
			continue;
		}

		if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) continue;
		const [kind, shortcode] = parsed.pathname.split('/').filter(Boolean);
		if (!['p', 'reel', 'tv'].includes(kind) || !shortcode) continue;

		const canonical = `https://www.instagram.com/${kind}/${shortcode}/`;
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		posts.push(canonical);
	}

	return posts.slice(0, 3);
}

function buildUrl(value, prefix) {
	if (!value) return null;
	if (/^https?:\/\//i.test(value)) return value;
	return `${prefix}${value.replace(/^@/, '')}`;
}

function normalizeGroupSocialLinks(values = {}) {
	const get = (field) => String(values[field] ?? '').trim();
	const mastodon = get('mastodon');
	const youtube = get('youtube');
	const strava = get('strava');
	const bluesky = get('bluesky');
	const discord = get('discord');
	const linkedin = get('linkedin');
	const instagramPosts = parseInstagramPostUrls(values.instagram_posts);

	const links = {
		instagram: buildUrl(get('instagram'), 'https://www.instagram.com/'),
		facebook: buildUrl(get('facebook'), 'https://www.facebook.com/'),
		x: buildUrl(get('x'), 'https://x.com/'),
		threads: buildUrl(get('threads'), 'https://www.threads.net/@'),
		mastodon: (() => {
			if (!mastodon) return null;
			if (/^https?:\/\//i.test(mastodon)) return mastodon;
			const account = mastodon.replace(/^@/, '');
			if (account.includes('@')) {
				const [user, host] = account.split('@');
				if (user && host) return `https://${host}/@${user}`;
			}
			return `https://mastodon.social/@${account}`;
		})(),
		youtube: (() => {
			if (!youtube) return null;
			if (/^https?:\/\//i.test(youtube)) return youtube;
			const handle = youtube.startsWith('@') ? youtube : `@${youtube}`;
			return `https://www.youtube.com/${handle}`;
		})(),
		tiktok: buildUrl(get('tiktok'), 'https://www.tiktok.com/@'),
		strava: !strava
			? null
			: /^https?:\/\//i.test(strava)
				? strava
				: `https://www.strava.com/clubs/${strava}`,
		bluesky: !bluesky
			? null
			: /^https?:\/\//i.test(bluesky)
				? bluesky
				: `https://bsky.app/profile/${bluesky.replace(/^@/, '')}`,
		discord: !discord
			? null
			: /^https?:\/\//i.test(discord)
				? discord
				: `https://discord.gg/${discord.replace(/^@/, '')}`,
		linkedin: !linkedin
			? null
			: /^https?:\/\//i.test(linkedin)
				? linkedin
				: `https://www.linkedin.com/company/${linkedin}`,
		instagram_posts: instagramPosts.length ? instagramPosts : null
	};

	return Object.fromEntries(Object.entries(links).filter(([, value]) => Boolean(value)));
}

export function collectGroupSocialLinkInputs(getValue) {
	const values = Object.fromEntries(SOCIAL_LINK_FIELDS.map((field) => [field, getValue(field)]));
	values.instagram_posts = getValue('instagram_posts');
	return normalizeGroupSocialLinks(values);
}
