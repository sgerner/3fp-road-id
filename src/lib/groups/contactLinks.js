import IconGlobe from '@lucide/svelte/icons/globe';
import IconMail from '@lucide/svelte/icons/mail';
import IconPhone from '@lucide/svelte/icons/phone';
import IconInstagram from '@lucide/svelte/icons/instagram';
import IconFacebook from '@lucide/svelte/icons/facebook';
import BrandX from '$lib/icons/BrandX.svelte';
import IconYoutube from '@lucide/svelte/icons/youtube';
import IconLinkedin from '@lucide/svelte/icons/linkedin';
import IconLink from '@lucide/svelte/icons/link';
import BrandThreads from '$lib/icons/BrandThreads.svelte';
import BrandTikTok from '$lib/icons/BrandTikTok.svelte';
import BrandBluesky from '$lib/icons/BrandBluesky.svelte';
import BrandDiscord from '$lib/icons/BrandDiscord.svelte';
import BrandMastodon from '$lib/icons/BrandMastodon.svelte';
import BrandStrava from '$lib/icons/BrandStrava.svelte';

export function extractSocialLinks(group) {
	if (group?.social_links && typeof group.social_links === 'object') {
		try {
			const obj = group.social_links;
			return Object.entries(obj)
				.filter(([_, value]) => Boolean(value))
				.map(([key, value]) => ({ key, href: value }));
		} catch (err) {
			console.warn('Failed to parse group social links', err);
		}
	}
	return [];
}

export function buildContactLinks(group) {
	const g = group || {};
	const website = g.website_url ? [{ key: 'website', href: g.website_url }] : [];
	const socials = extractSocialLinks(g);

	const socialIcons = {
		instagram: IconInstagram,
		facebook: IconFacebook,
		x: BrandX,
		youtube: IconYoutube,
		linkedin: IconLinkedin,
		threads: BrandThreads,
		mastodon: BrandMastodon,
		tiktok: BrandTikTok,
		strava: BrandStrava,
		bluesky: BrandBluesky,
		discord: BrandDiscord
	};

	const socialLinks = socials.map((social) => ({
		...social,
		icon: socialIcons[social.key] || IconLink
	}));

	const tail = [];
	if (g.public_contact_email) {
		tail.push({
			key: 'email',
			href: `mailto:${g.public_contact_email}`,
			icon: IconMail,
			label: g.public_contact_email,
			showText: true
		});
	}
	if (g.public_phone_number) {
		tail.push({
			key: 'phone',
			href: `tel:${g.public_phone_number}`,
			icon: IconPhone,
			label: g.public_phone_number,
			showText: true
		});
	}

	return [...website, ...socialLinks, ...tail];
}

export function selectPrimaryCta(group, contactLinks = []) {
	const g = group || {};
	const links = Array.isArray(contactLinks) ? contactLinks : [];
	const kind = g.preferred_cta_kind || 'auto';

	const lookup = (key) => links.find((link) => link.key === key);

	if (kind === 'custom') {
		const label = (g.preferred_cta_label || '').slice(0, 10);
		const href = g.preferred_cta_url || '';
		if (label && href) return { key: 'custom', href, label };
	}

	const order =
		kind === 'auto'
			? [
					'website',
					'email',
					'phone',
					'facebook',
					'instagram',
					'strava',
					'x',
					'tiktok',
					'mastodon',
					'discord'
				]
			: [kind];

	for (const key of order) {
		const match = lookup(key);
		if (!match) continue;
		const label =
			key === 'website'
				? 'Website'
				: key === 'email'
					? 'Email'
					: key === 'phone'
						? 'Call'
						: key === 'facebook'
							? 'Facebook'
							: key === 'instagram'
								? 'Instagram'
								: key === 'strava'
									? 'Strava'
									: key === 'x'
										? 'X'
										: key === 'tiktok'
											? 'TikTok'
											: key === 'mastodon'
												? 'Mastodon'
												: key === 'discord'
													? 'Discord'
													: 'Open Link';
		return { ...match, label };
	}

	const fallback = links[0];
	return fallback ? { ...fallback, label: 'Open Link' } : null;
}

export const CTA_ICON_MAP = {
	website: IconGlobe,
	email: IconMail,
	phone: IconPhone,
	facebook: IconFacebook,
	instagram: IconInstagram,
	strava: BrandStrava,
	x: BrandX,
	tiktok: BrandTikTok,
	mastodon: BrandMastodon,
	discord: BrandDiscord
};

export const CONTACT_ICON_MAP = {
	website: IconGlobe,
	email: IconMail,
	phone: IconPhone,
	instagram: IconInstagram,
	facebook: IconFacebook,
	x: BrandX,
	youtube: IconYoutube,
	linkedin: IconLinkedin,
	threads: BrandThreads,
	tiktok: BrandTikTok,
	strava: BrandStrava,
	bluesky: BrandBluesky,
	mastodon: BrandMastodon,
	discord: BrandDiscord
};
