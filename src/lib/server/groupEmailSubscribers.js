import { DEFAULT_BRAND_ORIGIN, normalizeEmailBrand } from '../email/branding.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GROUP_SUBSCRIBER_WELCOME_CONTEXT = 'group-subscriber-welcome';

const WELCOME_TENANTS = Object.freeze({
	tbag: {
		key: 'tbag',
		name: 'Tempe Bicycle Action Group',
		subject: 'Welcome to Tempe Bicycle Action Group',
		heading: "You're on the list.",
		paragraphs: [
			'Thanks for joining Tempe Bicycle Action Group’s email list.',
			'We’ll share practical updates about safer streets, local advocacy, community events, volunteer opportunities, and ways to show up for better bicycling in Tempe.'
		],
		actionLabel: 'Explore TBAG',
		brand: {
			name: 'Tempe Bicycle Action Group',
			logoPath: '',
			background: '#081B23',
			surface: '#102E3A',
			border: 'rgba(201,111,82,0.45)',
			text: '#F5F7F5',
			muted: '#B7C7C7',
			accent: '#C96F52'
		}
	},
	threeFeetPlease: {
		key: '3fp',
		name: '3 Feet Please',
		subject: 'Welcome to 3 Feet Please',
		heading: 'Let’s make every pass safer.',
		paragraphs: [
			'Thanks for joining 3 Feet Please.',
			'We’ll send practical safe-passing education, advocacy resources, and occasional ways to help make roads safer for everyone.'
		],
		actionLabel: 'Explore 3 Feet Please',
		brand: {
			name: '3 Feet Please',
			logoPath: '/3fp.png?v=2',
			background: '#071923',
			surface: '#0B2533',
			border: 'rgba(196,211,45,0.45)',
			text: '#F4F7E8',
			muted: '#B6C7C4',
			accent: '#C4D32D'
		}
	},
	group: {
		key: 'group',
		subjectPrefix: 'Welcome to',
		heading: 'You’re on the list.',
		actionLabelPrefix: 'Explore',
		brand: {
			logoPath: ''
		}
	}
});

function clean(value, limit = 320) {
	return String(value ?? '')
		.trim()
		.slice(0, limit);
}

function normalizeKey(value) {
	return clean(value, 200).toLowerCase();
}

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizeOrigin(value) {
	const candidate = clean(value, 2000);
	if (!candidate) return DEFAULT_BRAND_ORIGIN;

	try {
		const parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
		if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
			return DEFAULT_BRAND_ORIGIN;
		}
		return parsed.origin;
	} catch {
		return DEFAULT_BRAND_ORIGIN;
	}
}

function normalizeHttpUrl(value) {
	const candidate = clean(value, 2000);
	if (!candidate) return '';
	try {
		const parsed = new URL(candidate);
		return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname
			? parsed.toString().replace(/\/$/, '')
			: '';
	} catch {
		return '';
	}
}

function resolveTenantKey({ group = {}, siteConfig = {} } = {}) {
	const groupSlug = normalizeKey(group.slug);
	const micrositeSlug = normalizeKey(group.microsite_slug);
	const groupName = normalizeKey(group.name);
	const siteVariant = normalizeKey(siteConfig.site_variant);

	if (
		groupSlug === '3-feet-please' ||
		micrositeSlug === '3feetplease' ||
		groupName === '3 feet please'
	) {
		return 'threeFeetPlease';
	}

	if (
		siteVariant === 'tbag' ||
		groupSlug === 'tempe-bicycle-action-group' ||
		micrositeSlug === 'biketempe' ||
		groupName === 'tempe bicycle action group' ||
		groupName === 'tbag'
	) {
		return 'tbag';
	}

	return 'group';
}

function groupNameForEmail(group, tenant, siteConfig = {}) {
	if (tenant.key === 'tbag' || tenant.key === '3fp') return tenant.name;
	return clean(siteConfig?.site_title, 160) || clean(group?.name, 160) || 'your group';
}

function buildGenericBrand({ group = {}, siteConfig = {} } = {}) {
	const colors =
		siteConfig.theme_colors && typeof siteConfig.theme_colors === 'object'
			? siteConfig.theme_colors
			: {};
	const groupName = clean(siteConfig.site_title, 120) || clean(group.name, 120) || 'Group updates';

	return normalizeEmailBrand({
		name: groupName,
		logoPath: '',
		logoUrl: clean(group.logo_url, 2000),
		background: colors.surface,
		surface: colors.surface,
		border: colors.secondary,
		text: '#F8FAFC',
		muted: '#CBD5E1',
		accent: colors.accent || colors.primary
	});
}

export function resolveGroupEmailWelcomeTenant({ group = {}, siteConfig = {} } = {}) {
	const key = resolveTenantKey({ group, siteConfig });
	const preset = WELCOME_TENANTS[key];
	const name = groupNameForEmail(group, preset, siteConfig);

	if (key === 'group') {
		const genericName = name;
		return {
			...preset,
			name: genericName,
			subject: `${preset.subjectPrefix} ${genericName}`,
			paragraphs: [
				`Thanks for joining ${genericName}’s email list.`,
				`We’ll share updates, opportunities, and useful news from ${genericName}.`
			],
			actionLabel: `${preset.actionLabelPrefix} ${genericName}`,
			brand: buildGenericBrand({ group, siteConfig })
		};
	}

	const brandInput = { ...preset.brand };
	const logoUrl = clean(group.logo_url, 2000);
	if (logoUrl) brandInput.logoUrl = logoUrl;

	return {
		...preset,
		name,
		brand: normalizeEmailBrand(brandInput)
	};
}

export function buildGroupMicrositeUrl({ group = {}, origin, siteUrl } = {}) {
	const baseOrigin = normalizeOrigin(origin);
	const explicitUrl = normalizeHttpUrl(siteUrl);
	if (explicitUrl) return explicitUrl;

	const micrositeSlug = clean(group.microsite_slug, 200) || clean(group.slug, 200);
	if (!micrositeSlug) return baseOrigin;
	return `${baseOrigin}/${encodeURIComponent(micrositeSlug)}`;
}

export function shouldSendGroupSubscriberWelcome(existingSubscriber) {
	return (
		!existingSubscriber ||
		existingSubscriber.status === 'unsubscribed' ||
		!existingSubscriber.welcome_email_sent_at
	);
}

export function buildGroupSubscriberWelcomeEmail({
	group = {},
	siteConfig = {},
	subscriber = {},
	firstName = '',
	origin,
	siteUrl,
	unsubscribeToken
} = {}) {
	const tenant = resolveGroupEmailWelcomeTenant({ group, siteConfig });
	const recipientName = clean(firstName || subscriber.first_name, 120);
	const displayName = groupNameForEmail(group, tenant, siteConfig);
	const publicSiteUrl = buildGroupMicrositeUrl({ group, origin, siteUrl });
	const unsubscribePath =
		clean(group.slug, 200) && clean(unsubscribeToken, 200)
			? `/api/groups/${encodeURIComponent(clean(group.slug, 200))}/email/unsubscribe/${encodeURIComponent(clean(unsubscribeToken, 200))}`
			: '';
	const unsubscribeUrl = unsubscribePath ? `${normalizeOrigin(origin)}${unsubscribePath}` : '';
	const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,';
	const paragraphs = tenant.paragraphs.map((paragraph) =>
		paragraph.replace(/\bthe group\b/gi, displayName)
	);

	const htmlParagraphs = paragraphs
		.map((paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`)
		.join('');
	const unsubscribeHtml = unsubscribeUrl
		? `<p style="margin:24px 0 0;font-size:12px;color:${tenant.brand.muted};">Prefer not to receive these updates? <a href="${escapeHtml(unsubscribeUrl)}" style="color:${tenant.brand.accent};">Unsubscribe</a>.</p>`
		: '';
	const html =
		`<div>` +
		`<p style="margin:0 0 18px;color:${tenant.brand.muted};">${escapeHtml(greeting)}</p>` +
		`<h1 style="margin:0 0 20px;font-size:30px;line-height:1.15;color:${tenant.brand.text};">${escapeHtml(tenant.heading)}</h1>` +
		htmlParagraphs +
		unsubscribeHtml +
		`</div>`;

	const textLines = [greeting, '', tenant.heading, '', ...paragraphs];
	if (unsubscribeUrl) {
		textLines.push('', `Unsubscribe: ${unsubscribeUrl}`);
	}

	return {
		subject: tenant.subject,
		html,
		text: textLines.join('\n'),
		branding: {
			brand: tenant.brand,
			category: 'Welcome',
			recipientReason: `You signed up for email updates from ${displayName}.`,
			actionUrl: publicSiteUrl,
			actionLabel: tenant.actionLabel
		},
		tags: [
			{ Name: 'context', Value: GROUP_SUBSCRIBER_WELCOME_CONTEXT },
			...(group.id ? [{ Name: 'group_id', Value: String(group.id) }] : [])
		],
		siteUrl: publicSiteUrl,
		unsubscribeUrl,
		tenant: tenant.key
	};
}

export function normalizeGroupEmailSignup(payload = {}) {
	if (clean(payload.company, 200)) return { ok: true, honeypot: true };
	if (payload.consent !== true) {
		return { ok: false, error: 'Please agree to receive emails from this group.' };
	}

	const email = clean(payload.email).toLowerCase();
	if (!EMAIL_PATTERN.test(email)) {
		return { ok: false, error: 'Enter a valid email address.' };
	}

	return {
		ok: true,
		honeypot: false,
		email,
		firstName: clean(payload.first_name, 120)
	};
}
