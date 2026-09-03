const BRAND = Object.freeze({
	name: '3 Feet Please',
	logoPath: '/3fp.png?v=2',
	background: '#020617',
	surface: '#0f172a',
	border: 'rgba(148,163,184,0.28)',
	text: '#e2e8f0',
	muted: '#94a3b8',
	accent: '#38bdf8'
});

export const VOLUNTEER_PORTAL_PATH = '/volunteer/shifts';
export const DEFAULT_BRAND_ORIGIN = 'https://3fp.org';

const SAFE_CSS_COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|rgba?\([-\d\s.,%+]+\)|hsla?\([-\d\s.,%+]+\))$/i;

function stripTrailingSlash(value) {
	if (!value) return '';
	return String(value).replace(/\s+/g, '').replace(/\/+$/, '');
}

function ensureOrigin(origin) {
	const cleaned = stripTrailingSlash(origin);
	if (cleaned) {
		if (/^https?:\/\//i.test(cleaned)) {
			return cleaned;
		}
		return `https://${cleaned}`;
	}
	return DEFAULT_BRAND_ORIGIN;
}

function cleanText(value, maxLength) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function normalizeCssColor(value, fallback) {
	const cleaned = cleanText(value, 80);
	return SAFE_CSS_COLOR_PATTERN.test(cleaned) ? cleaned : fallback;
}

function normalizeLogoReference(value) {
	const cleaned = cleanText(value, 2000);
	if (!cleaned) return '';
	if (/^\/(?!\/)/.test(cleaned)) return cleaned;
	if (!/^https?:\/\//i.test(cleaned)) return '';

	try {
		const parsed = new URL(cleaned);
		return parsed.hostname ? parsed.toString() : '';
	} catch {
		return '';
	}
}

/**
 * Normalize the small set of presentation values that can be used by the
 * shared email shell. Tenant data can customize the shell without allowing
 * arbitrary CSS or non-web image protocols into an email.
 */
export function normalizeEmailBrand(source = {}, fallback = BRAND) {
	const input = source && typeof source === 'object' ? source : {};
	const base = fallback && typeof fallback === 'object' ? fallback : BRAND;
	const hasLogoPath = Object.prototype.hasOwnProperty.call(input, 'logoPath');
	const hasLogoUrl = Object.prototype.hasOwnProperty.call(input, 'logoUrl');
	const fallbackBrand = {
		name: cleanText(base.name, 120) || BRAND.name,
		logoPath: normalizeLogoReference(base.logoPath) || BRAND.logoPath,
		logoUrl: normalizeLogoReference(base.logoUrl),
		background: normalizeCssColor(base.background, BRAND.background),
		surface: normalizeCssColor(base.surface, BRAND.surface),
		border: normalizeCssColor(base.border, BRAND.border),
		text: normalizeCssColor(base.text, BRAND.text),
		muted: normalizeCssColor(base.muted, BRAND.muted),
		accent: normalizeCssColor(base.accent, BRAND.accent)
	};

	return {
		name: cleanText(input.name, 120) || fallbackBrand.name,
		logoPath: hasLogoPath ? normalizeLogoReference(input.logoPath) : fallbackBrand.logoPath,
		logoUrl: hasLogoUrl ? normalizeLogoReference(input.logoUrl) : fallbackBrand.logoUrl,
		background: normalizeCssColor(input.background, fallbackBrand.background),
		surface: normalizeCssColor(input.surface, fallbackBrand.surface),
		border: normalizeCssColor(input.border, fallbackBrand.border),
		text: normalizeCssColor(input.text, fallbackBrand.text),
		muted: normalizeCssColor(input.muted, fallbackBrand.muted),
		accent: normalizeCssColor(input.accent, fallbackBrand.accent)
	};
}

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeAttribute(value = '') {
	return escapeHtml(value);
}

function resolveLogoUrl({ origin, brand }) {
	if (brand.logoUrl) return brand.logoUrl;
	const logoPath = brand.logoPath;
	if (!logoPath) return '';
	return `${origin}${logoPath.startsWith('/') ? logoPath : `/${logoPath}`}`;
}

function resolvePortalUrl({ origin, portalUrl }) {
	const candidate = cleanText(portalUrl, 2000);
	if (candidate && (/^https?:\/\//i.test(candidate) || /^\/(?!\/)/.test(candidate))) {
		return candidate;
	}
	const base = ensureOrigin(origin);
	return `${base}${VOLUNTEER_PORTAL_PATH}`;
}

function resolveCategory(category) {
	const label = category ? String(category).trim() : '';
	return label || 'Volunteer update';
}

function resolveSubjectLine(subjectLine) {
	return subjectLine ? String(subjectLine).trim() : '';
}

function resolveRecipientReason(recipientReason, brand) {
	const label = recipientReason ? String(recipientReason).trim() : '';
	return label || `You're receiving this email from ${brand.name}.`;
}

function resolveActionLabel(actionLabel, brand) {
	const label = actionLabel ? String(actionLabel).trim() : '';
	return label || `Open ${brand.name}`;
}

export function wrapHtmlWithBranding(bodyHtml, options = {}) {
	const bodyContent = typeof bodyHtml === 'string' ? bodyHtml.trim() : '';
	if (!bodyContent) return '';

	const brand = normalizeEmailBrand(options.brand);
	const origin = ensureOrigin(options.origin);
	const portalUrl = resolvePortalUrl({ origin, portalUrl: options.portalUrl });
	const category = resolveCategory(options.category);
	const subjectLine = resolveSubjectLine(options.subjectLine);
	const recipientReason = resolveRecipientReason(options.recipientReason, brand);
	const actionLabel = resolveActionLabel(options.actionLabel, brand);
	const headerSubtitle = subjectLine ? `${category} · ${subjectLine}` : category;
	const documentTitle = options.documentTitle
		? String(options.documentTitle).trim()
		: subjectLine
			? `${brand.name} — ${subjectLine}`
			: `${brand.name} — ${category}`;

	const portalLink = portalUrl
		? `<div style="margin-top:8px;"><a href="${escapeAttribute(portalUrl)}" style="color:${brand.accent};text-decoration:none;font-weight:600;">${escapeHtml(actionLabel)}</a></div>`
		: '';

	return (
		`<!DOCTYPE html>` +
		`<html lang="en">` +
		`<head>` +
		`<meta charset="utf-8" />` +
		`<meta name="viewport" content="width=device-width, initial-scale=1" />` +
		`<title>${escapeHtml(documentTitle)}</title>` +
		`</head>` +
		`<body style="margin:0;padding:0;background:${brand.background};font-family:'Inter','Segoe UI',Tahoma,Arial,sans-serif;color:${brand.text};">` +
		`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background};padding:32px 16px;">` +
		`<tr><td align="center">` +
		`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${brand.surface};border-radius:24px;overflow:hidden;border:1px solid ${brand.border};box-shadow:0 20px 45px rgba(15,23,42,0.55);">` +
		`<tr>` +
		`<td style="padding:28px 24px 20px;text-align:center;background:${brand.background};">` +
		(resolveLogoUrl({ origin, brand })
			? `<img src="${escapeAttribute(resolveLogoUrl({ origin, brand }))}" alt="${escapeHtml(brand.name)}" width="48" height="48" style="display:block;margin:0 auto 12px;border-radius:12px;" />`
			: '') +
		`<div style="font-size:22px;font-weight:700;letter-spacing:0.01em;color:#f8fafc;">${escapeHtml(brand.name)}</div>` +
		(headerSubtitle
			? `<div style="margin-top:6px;font-size:14px;color:${brand.muted};">${escapeHtml(headerSubtitle)}</div>`
			: '') +
		`</td>` +
		`</tr>` +
		`<tr>` +
		`<td style="padding:32px 24px;background:linear-gradient(180deg,${brand.surface},${brand.surface});font-size:15px;line-height:1.6;">` +
		bodyContent +
		`</td>` +
		`</tr>` +
		`<tr>` +
		`<td style="padding:20px 24px;text-align:center;background:${brand.background};color:${brand.muted};font-size:12px;line-height:1.5;">` +
		escapeHtml(recipientReason) +
		portalLink +
		`</td>` +
		`</tr>` +
		`</table>` +
		`</td></tr>` +
		`</table>` +
		`</body>` +
		`</html>`
	);
}

export function wrapTextWithBranding(textBody, options = {}) {
	const bodyContent = typeof textBody === 'string' ? textBody.trim() : '';
	if (!bodyContent) return '';

	const brand = normalizeEmailBrand(options.brand);
	const origin = ensureOrigin(options.origin);
	const portalUrl = resolvePortalUrl({ origin, portalUrl: options.portalUrl });
	const category = resolveCategory(options.category);
	const subjectLine = resolveSubjectLine(options.subjectLine);
	const recipientReason = resolveRecipientReason(options.recipientReason, brand);
	const actionLabel = resolveActionLabel(options.actionLabel, brand);
	const heading = `${brand.name} ${category}${subjectLine ? ` — ${subjectLine}` : ''}`;
	const divider = '='.repeat(Math.max(heading.length, 3));

	const lines = [heading, divider, '', bodyContent];
	if (portalUrl) {
		lines.push('', `${actionLabel}: ${portalUrl}`);
	}
	lines.push('', recipientReason);

	return lines
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export { BRAND };
