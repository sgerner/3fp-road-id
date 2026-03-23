import { normalizeHexColor } from '$lib/microsites/config';

const FALLBACK_PALETTES = [
	{ primary: '#F59E0B', secondary: '#0EA5E9', accent: '#FB7185', surface: '#111827' },
	{ primary: '#22C55E', secondary: '#14B8A6', accent: '#F97316', surface: '#101A18' },
	{ primary: '#F43F5E', secondary: '#8B5CF6', accent: '#14B8A6', surface: '#160F16' },
	{ primary: '#06B6D4', secondary: '#6366F1', accent: '#F59E0B', surface: '#0E1726' },
	{ primary: '#EAB308', secondary: '#84CC16', accent: '#EC4899', surface: '#171510' },
	{ primary: '#F97316', secondary: '#06B6D4', accent: '#A855F7', surface: '#1A120F' }
];

const FONT_PAIRINGS = {
	poster: {
		base: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
		heading: '"Impact", "Avenir Next Condensed", "Trebuchet MS", sans-serif'
	},
	editorial: {
		base: '"Avenir Next", "Helvetica Neue", sans-serif',
		heading: '"Georgia", "Palatino Linotype", serif'
	},
	friendly: {
		base: '"Gill Sans", "Trebuchet MS", sans-serif',
		heading: '"Gill Sans", "Trebuchet MS", sans-serif'
	},
	utility: {
		base: '"Verdana", "Geneva", sans-serif',
		heading: '"Trebuchet MS", "Segoe UI", sans-serif'
	}
};

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function hashString(value) {
	const input = cleanText(value) || 'microsite';
	let hash = 0;
	for (let index = 0; index < input.length; index += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash);
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function hexToRgb(value) {
	const normalized = normalizeHexColor(value);
	if (!normalized) return null;
	const raw = normalized.slice(1);
	return {
		r: Number.parseInt(raw.slice(0, 2), 16),
		g: Number.parseInt(raw.slice(2, 4), 16),
		b: Number.parseInt(raw.slice(4, 6), 16)
	};
}

function rgbToHex({ r, g, b }) {
	return `#${[r, g, b]
		.map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase()}`;
}

function mixColors(startHex, endHex, ratio) {
	const start = hexToRgb(startHex);
	const end = hexToRgb(endHex);
	if (!start || !end) return normalizeHexColor(startHex) || normalizeHexColor(endHex) || '#000000';
	return rgbToHex({
		r: start.r + (end.r - start.r) * ratio,
		g: start.g + (end.g - start.g) * ratio,
		b: start.b + (end.b - start.b) * ratio
	});
}

function luminance(value) {
	const rgb = hexToRgb(value);
	if (!rgb) return 0;
	const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
		const srgb = channel / 255;
		return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function readableTextColor(background) {
	return luminance(background) > 0.46 ? '#111827' : '#F8FAFC';
}

function createScale(baseHex) {
	const normalized = normalizeHexColor(baseHex) || '#64748B';
	return {
		50: mixColors(normalized, '#FFFFFF', 0.88),
		100: mixColors(normalized, '#FFFFFF', 0.75),
		200: mixColors(normalized, '#FFFFFF', 0.58),
		300: mixColors(normalized, '#FFFFFF', 0.42),
		400: mixColors(normalized, '#FFFFFF', 0.2),
		500: normalized,
		600: mixColors(normalized, '#000000', 0.14),
		700: mixColors(normalized, '#000000', 0.28),
		800: mixColors(normalized, '#000000', 0.42),
		900: mixColors(normalized, '#000000', 0.56),
		950: mixColors(normalized, '#000000', 0.7)
	};
}

function createSurfaceScale(baseHex) {
	const normalized = normalizeHexColor(baseHex) || '#111827';
	return {
		50: '#F8FAFC',
		100: mixColors(normalized, '#FFFFFF', 0.74),
		200: mixColors(normalized, '#FFFFFF', 0.58),
		300: mixColors(normalized, '#FFFFFF', 0.42),
		400: mixColors(normalized, '#FFFFFF', 0.24),
		500: mixColors(normalized, '#FFFFFF', 0.1),
		600: mixColors(normalized, '#000000', 0.08),
		700: mixColors(normalized, '#000000', 0.16),
		800: mixColors(normalized, '#000000', 0.28),
		900: mixColors(normalized, '#000000', 0.42),
		950: mixColors(normalized, '#000000', 0.58)
	};
}

function toCssVars(prefix, scale) {
	return Object.entries(scale).flatMap(([step, color]) => {
		const contrast = readableTextColor(color);
		return [
			[`--color-${prefix}-${step}`, color],
			[`--color-${prefix}-contrast-${step}`, contrast]
		];
	});
}

export function getFallbackPalette(seed) {
	return FALLBACK_PALETTES[hashString(seed) % FALLBACK_PALETTES.length];
}

export function normalizePalette(value, fallbackSeed = '') {
	const source = value && typeof value === 'object' ? value : {};
	const fallback = getFallbackPalette(fallbackSeed);
	return {
		primary: normalizeHexColor(source.primary) || fallback.primary,
		secondary: normalizeHexColor(source.secondary) || fallback.secondary,
		accent: normalizeHexColor(source.accent) || fallback.accent,
		surface: normalizeHexColor(source.surface) || fallback.surface
	};
}

export function buildMicrositeThemeStyle({ palette, fontPairing = 'poster' } = {}) {
	const resolvedPalette = normalizePalette(palette);
	const fonts = FONT_PAIRINGS[fontPairing] || FONT_PAIRINGS.poster;
	const primaryScale = createScale(resolvedPalette.primary);
	const secondaryScale = createScale(resolvedPalette.secondary);
	const tertiaryScale = createScale(resolvedPalette.accent);
	const surfaceScale = createSurfaceScale(resolvedPalette.surface);

	const vars = new Map([
		['--base-font-family', fonts.base],
		['--heading-font-family', fonts.heading],
		['--anchor-font-color', primaryScale[400]],
		['--anchor-font-color-dark', primaryScale[400]],
		['--body-background-color', surfaceScale[50]],
		['--body-background-color-dark', surfaceScale[950]],
		...toCssVars('primary', primaryScale),
		...toCssVars('secondary', secondaryScale),
		...toCssVars('tertiary', tertiaryScale),
		...toCssVars('surface', surfaceScale)
	]);

	return Array.from(vars.entries())
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

