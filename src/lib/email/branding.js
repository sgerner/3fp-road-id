const BRAND = {
	name: '3 Feet Please',
	logoPath: '/3fp.png',
	background: '#020617',
	surface: '#0f172a',
	border: 'rgba(148,163,184,0.28)',
	text: '#e2e8f0',
	muted: '#94a3b8',
	accent: '#38bdf8'
};

export const VOLUNTEER_PORTAL_PATH = '/volunteer/shifts';
export const DEFAULT_BRAND_ORIGIN = 'https://3fp.org';

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

function resolvePortalUrl({ origin, portalUrl }) {
	if (portalUrl) {
		return portalUrl;
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

export function wrapHtmlWithBranding(bodyHtml, options = {}) {
	const bodyContent = typeof bodyHtml === 'string' ? bodyHtml.trim() : '';
	if (!bodyContent) return '';

	const origin = ensureOrigin(options.origin);
	const portalUrl = resolvePortalUrl({ origin, portalUrl: options.portalUrl });
	const category = resolveCategory(options.category);
	const subjectLine = resolveSubjectLine(options.subjectLine);
	const headerSubtitle = subjectLine ? `${category} · ${subjectLine}` : category;
	const documentTitle = options.documentTitle
		? String(options.documentTitle).trim()
		: subjectLine
			? `${BRAND.name} — ${subjectLine}`
			: `${BRAND.name} — ${category}`;

	const portalLink = portalUrl
		? `<div style="margin-top:8px;"><a href="${escapeAttribute(portalUrl)}" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">Visit the volunteer portal</a></div>`
		: '';

	return (
		`<!DOCTYPE html>` +
		`<html lang="en">` +
		`<head>` +
		`<meta charset="utf-8" />` +
		`<meta name="viewport" content="width=device-width, initial-scale=1" />` +
		`<title>${escapeHtml(documentTitle)}</title>` +
		`</head>` +
		`<body style="margin:0;padding:0;background:${BRAND.background};font-family:'Inter','Segoe UI',Tahoma,Arial,sans-serif;color:${BRAND.text};">` +
		`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.background};padding:32px 16px;">` +
		`<tr><td align="center">` +
		`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${BRAND.surface};border-radius:24px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 20px 45px rgba(15,23,42,0.55);">` +
		`<tr>` +
		`<td style="padding:28px 24px 20px;text-align:center;background:${BRAND.background};">` +
		`<img src="${escapeAttribute(`${origin}${BRAND.logoPath}`)}" alt="${escapeHtml(BRAND.name)}" width="48" height="48" style="display:block;margin:0 auto 12px;border-radius:12px;" />` +
		`<div style="font-size:22px;font-weight:700;letter-spacing:0.01em;color:#f8fafc;">${escapeHtml(BRAND.name)}</div>` +
		(headerSubtitle
			? `<div style="margin-top:6px;font-size:14px;color:${BRAND.muted};">${escapeHtml(headerSubtitle)}</div>`
			: '') +
		`</td>` +
		`</tr>` +
		`<tr>` +
		`<td style="padding:32px 24px;background:linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.88));font-size:15px;line-height:1.6;">` +
		bodyContent +
		`</td>` +
		`</tr>` +
		`<tr>` +
		`<td style="padding:20px 24px;text-align:center;background:${BRAND.background};color:${BRAND.muted};font-size:12px;line-height:1.5;">` +
		`You're receiving this email because you volunteered at ${escapeHtml(DEFAULT_BRAND_ORIGIN)}.` +
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

	const origin = ensureOrigin(options.origin);
	const portalUrl = resolvePortalUrl({ origin, portalUrl: options.portalUrl });
	const category = resolveCategory(options.category);
	const subjectLine = resolveSubjectLine(options.subjectLine);
	const heading = `${BRAND.name} ${category}${subjectLine ? ` — ${subjectLine}` : ''}`;
	const divider = '='.repeat(Math.max(heading.length, 3));

	const lines = [heading, divider, '', bodyContent];
	if (portalUrl) {
		lines.push('', `Volunteer portal: ${portalUrl}`);
	}
	lines.push('', `Thanks for supporting ${BRAND.name}!`);

	return lines
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export { BRAND };
