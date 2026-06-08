import { siFacebook, siInstagram } from 'simple-icons';

const PROFILE_ADDRESS = '2628 W Birchwood Cir, STE C, Mesa, AZ 85202';

const BRAND_URLS = {
	website: 'https://3fp.org',
	facebook: 'https://www.facebook.com/3FeetPlease/',
	instagram: 'https://www.instagram.com/3feetplease'
};

const BRAND_ACCENTS = {
	primary: {
		label: '3FP Yellow',
		oklch: [0.968, 0.21, 109.76],
		ink: '#7a5f00',
		wash: '#fff7d1'
	},
	secondary: {
		label: '3FP Purple',
		oklch: [0.4907, 0.23, 300.46],
		ink: '#5b2a93',
		wash: '#f1e8ff'
	},
	tertiary: {
		label: '3FP Coral',
		oklch: [0.6454, 0.26, 2.48],
		ink: '#ae1d4f',
		wash: '#ffe8f0'
	}
};

export const LOGO_OPTIONS = [
	{
		key: 'classic',
		label: 'Classic',
		url: 'https://3fp.org/3fp.png?v=2'
	},
	{
		key: 'blackOutline',
		label: 'Black Outline',
		url: 'https://3fp.org/logos/3FeetPlease_BlackOutline.png'
	},
	{
		key: 'blackOutlineTagline',
		label: 'Black Outline + Tagline',
		url: 'https://3fp.org/logos/3FeetPlease_BlackOutline_Tagline.png'
	},
	{
		key: 'solidBlackRoad',
		label: 'Solid Black Road',
		url: 'https://3fp.org/logos/3FeetPlease_SolidBlackRoad.png'
	},
	{
		key: 'solidBlackRoadTagline',
		label: 'Solid Black Road + Tagline',
		url: 'https://3fp.org/logos/3FeetPlease_SolidBlackRoad_Tagline.png'
	},
	{
		key: 'whiteOutline',
		label: 'White Outline',
		url: 'https://3fp.org/logos/3FeetPlease_WhiteOutline.png'
	},
	{
		key: 'whiteOutlineTagline',
		label: 'White Outline + Tagline',
		url: 'https://3fp.org/logos/3FeetPlease_WhiteOutline_Tagline.png'
	}
];

export const DEFAULT_SIGNATURE_FORM = {
	title: 'Volunteer',
	phone: '',
	showPhone: false,
	showAddress: false,
	accent: 'primary',
	logo: 'classic'
};

function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizePhone(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	return raw.replace(/^tel:/i, '').replace(/\s+/g, ' ').trim();
}

function telHref(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	const digits = raw.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
	return digits ? `tel:${digits}` : '';
}

function oklchToHex([l, c, h]) {
	const hr = (h * Math.PI) / 180;
	const a = c * Math.cos(hr);
	const b = c * Math.sin(hr);

	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const l3 = l_ ** 3;
	const m3 = m_ ** 3;
	const s3 = s_ ** 3;

	const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
	const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
	const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

	const srgb = [r, g, bl].map((channel) => {
		const clamped = Math.min(1, Math.max(0, channel));
		return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
	});

	return `#${srgb
		.map((channel) =>
			Math.round(channel * 255)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}

function getAccentTone(accent) {
	return BRAND_ACCENTS[accent] || BRAND_ACCENTS.primary;
}

function getAccentBand(accent) {
	if (accent === 'secondary') {
		return 'linear-gradient(135deg, #7926cb 0%, #ff0180 100%)';
	}
	if (accent === 'tertiary') {
		return 'linear-gradient(135deg, #ff0180 0%, #ffff0a 100%)';
	}
	return 'linear-gradient(135deg, #ffff0a 0%, #ff0180 100%)';
}

function iconSvg(svg, { size = 16, color = 'currentColor' } = {}) {
	return svg
		.replace(
			'<svg ',
			`<svg width="${size}" height="${size}" fill="currentColor" style="color:${color}" aria-hidden="true" focusable="false" `
		)
		.replace(/<title>.*?<\/title>/, '');
}

function globeIconSvg() {
	return [
		'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">',
		'<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />',
		'<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />',
		'<path d="M2 12h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />',
		'</svg>'
	].join('');
}

function socialButton(label, href, svg, background, color = '#ffffff') {
	return `
		<a href="${escapeHtml(href)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin-right:8px;border-radius:999px;background:${background};color:${color};text-decoration:none;vertical-align:middle;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
			${svg}
		</a>
	`;
}

export function getAccentOptions() {
	return Object.entries(BRAND_ACCENTS).map(([key, item]) => ({
		key,
		label: item.label,
		hex: oklchToHex(item.oklch)
	}));
}

export function getLogoOptions() {
	return LOGO_OPTIONS;
}

export function buildSignatureHtml({
	fullName,
	email,
	title = '',
	phone = '',
	showPhone = false,
	showAddress = false,
	accent = 'primary',
	logo = 'classic'
} = {}) {
	const safeName = String(fullName || 'Your Name').trim();
	const safeEmail = String(email || 'your@email.com').trim();
	const safeTitle = String(title || '').trim();
	const safePhone = normalizePhone(phone);
	const accentTone = getAccentTone(accent);
	const accentInk = accentTone.ink || '#0f172a';
	const accentWash = accentTone.wash || '#f8fafc';
	const accentBand = getAccentBand(accent);
	const phoneHref = safePhone ? telHref(safePhone) : '';
	const logoItem = LOGO_OPTIONS.find((o) => o.key === logo) || LOGO_OPTIONS[0];
	const logoUrl = logoItem.url;
	const logoAlt = logoItem.label;

	const websiteIcon = iconSvg(globeIconSvg(), { size: 13, color: '#ffffff' });
	const facebookIcon = iconSvg(siFacebook.svg, { size: 13, color: '#ffffff' });
	const instagramIcon = iconSvg(siInstagram.svg, { size: 13, color: '#ffffff' });

	const contactRows = [
		`<tr>
			<td style="padding:4px 0 2px 0;font-size:13px;line-height:1.4;color:#334155;">
				<a href="mailto:${escapeHtml(safeEmail)}" style="color:#334155;text-decoration:none;font-weight:600;">${escapeHtml(safeEmail)}</a>
			</td>
		</tr>`,
		showPhone && safePhone
			? `<tr>
				<td style="padding:2px 0;font-size:13px;line-height:1.4;color:#334155;">
					<a href="${escapeHtml(phoneHref)}" style="color:#334155;text-decoration:none;font-weight:600;">${escapeHtml(safePhone)}</a>
				</td>
			</tr>`
			: '',
		showAddress
			? `<tr>
				<td style="padding:2px 0 0 0;font-size:12px;line-height:1.4;color:#64748b;">
					${escapeHtml(PROFILE_ADDRESS)}
				</td>
			</tr>`
			: ''
	].filter(Boolean);

	const hasContactRows = contactRows.length > 0;

	return `
<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
	<tr>
		<td style="padding:0;">
			<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #f1f5f9;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.05);">
				<tr>
					<td colspan="3" style="padding:0;height:6px;background:${accentBand};font-size:0;line-height:0;">&nbsp;</td>
				</tr>
				<tr>
					<td style="padding:24px 16px 24px 24px;vertical-align:middle;background:${accentWash};width:160px;">
						<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:160px;height:160px;border-radius:50%;background:${accentBand};overflow:hidden;">
							<tr><td style="padding:5px;vertical-align:middle;text-align:center;">
								<img src="${logoUrl}" alt="${escapeHtml(logoAlt)}" width="150" height="150" style="display:inline-block;width:150px;height:150px;border:none;border-radius:50%;object-fit:contain;vertical-align:middle;" />
							</td></tr>
						</table>
					</td>
					<td style="padding:0;width:1px;background:${accentInk}15;">&nbsp;</td>
					<td style="padding:24px 24px 24px 20px;vertical-align:middle;">
						<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
							<tr><td style="padding:0 0 2px;font-size:22px;line-height:1.15;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(safeName)}</td></tr>
							${
								safeTitle
									? `<tr><td style="padding:0 0 14px;font-size:11px;line-height:1.4;font-weight:700;color:${accentInk};text-transform:uppercase;letter-spacing:0.18em;">${escapeHtml(safeTitle)}</td></tr>`
									: '<tr><td style="padding:0 0 14px;font-size:0;line-height:0;">&nbsp;</td></tr>'
							}
							<tr><td style="padding:0;height:3px;background:${accentBand};font-size:0;line-height:0;border-radius:2px;">&nbsp;</td></tr>
							${hasContactRows ? contactRows.join('') : ''}
							<tr><td style="padding:14px 0 0;">${socialButton('Website', BRAND_URLS.website, websiteIcon, accentBand, '#ffffff')}${socialButton('Facebook', BRAND_URLS.facebook, facebookIcon, accentBand, '#ffffff')}${socialButton('Instagram', BRAND_URLS.instagram, instagramIcon, accentBand, '#ffffff')}</td></tr>
						</table>
					</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
`.trim();
}

export { PROFILE_ADDRESS, BRAND_ACCENTS, BRAND_URLS };
