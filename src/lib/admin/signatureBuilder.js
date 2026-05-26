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

export const DEFAULT_SIGNATURE_FORM = {
	title: 'Volunteer',
	phone: '',
	showPhone: false,
	showAddress: false,
	accent: 'primary'
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
		return clamped <= 0.0031308
			? clamped * 12.92
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	});

	return `#${srgb
		.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0'))
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

function socialButton(label, href, svg, background, color = '#ffffff', border = 'rgba(15,23,42,0.10)') {
	return `
		<a href="${escapeHtml(href)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin-right:8px;border-radius:999px;background:${background};color:${color};text-decoration:none;vertical-align:middle;border:1px solid ${border};box-shadow:0 1px 1px rgba(15,23,42,0.04);">
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

export function buildSignatureHtml({
	fullName,
	email,
	title = '',
	phone = '',
	showPhone = false,
	showAddress = false,
	accent = 'primary'
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
	const websiteIcon = iconSvg(globeIconSvg(), {
		size: 15,
		color: '#ffffff'
	});
	const facebookIcon = iconSvg(
		siFacebook.svg,
		{ size: 15, color: `#${siFacebook.hex}` }
	);
	const instagramIcon = iconSvg(
		siInstagram.svg,
		{ size: 15, color: `#${siInstagram.hex}` }
	);

	const rows = [
		`<tr><td style="padding:0 0 2px;font-size:23px;line-height:1.08;font-weight:900;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(safeName)}</td></tr>`,
		safeTitle
			? `<tr><td style="padding:0 0 8px;font-size:12px;line-height:1.45;font-weight:800;color:${accentInk};text-transform:uppercase;letter-spacing:0.14em;">${escapeHtml(safeTitle)}</td></tr>`
			: '',
		`<tr><td style="padding:0 0 4px;font-size:14px;line-height:1.5;"><a href="mailto:${escapeHtml(safeEmail)}" style="color:#111827;text-decoration:none;font-weight:700;">${escapeHtml(safeEmail)}</a></td></tr>`,
		showPhone && safePhone
			? `<tr><td style="padding:0 0 4px;font-size:14px;line-height:1.5;color:#334155;"><a href="${escapeHtml(phoneHref)}" style="color:#334155;text-decoration:none;font-weight:600;">${escapeHtml(safePhone)}</a></td></tr>`
			: '',
		showAddress
			? `<tr><td style="padding:0 0 10px;font-size:13px;line-height:1.45;color:#475569;">${escapeHtml(PROFILE_ADDRESS)}</td></tr>`
			: '',
		`<tr><td style="padding-top:10px;">${socialButton('Website', BRAND_URLS.website, websiteIcon, accentInk, '#ffffff', accentInk)}${socialButton('Facebook', BRAND_URLS.facebook, facebookIcon, '#1877f2', '#ffffff', '#1877f2')}${socialButton('Instagram', BRAND_URLS.instagram, instagramIcon, '#ff0180', '#ffffff', '#ff0180')}</td></tr>`
	]
		.filter(Boolean)
		.join('');

	return `
<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#0f172a;">
	<tr>
		<td style="padding:0;">
			<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid rgba(15,23,42,0.10);border-left:6px solid ${accentInk};border-radius:22px;background:linear-gradient(180deg, ${accentWash} 0%, #ffffff 26%);overflow:hidden;">
				<tr>
					<td colspan="2" style="padding:0;">
						<div style="height:8px;background:${accentBand};"></div>
					</td>
				</tr>
				<tr>
					<td style="padding:20px 18px 18px 20px;vertical-align:top;width:126px;background:linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%);">
						<img src="https://3fp.org/3fp.png?v=2" alt="3 Feet Please" width="96" height="96" style="display:block;width:96px;height:96px;border:none;border-radius:24px;object-fit:contain;" />
					</td>
					<td style="padding:20px 20px 18px 0;vertical-align:top;">${rows}</td>
				</tr>
			</table>
		</td>
	</tr>
</table>
`.trim();
}

export { PROFILE_ADDRESS, BRAND_ACCENTS, BRAND_URLS };
