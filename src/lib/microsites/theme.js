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
		base: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
		heading: '"Arial Black", "Impact", "Franklin Gothic Heavy", sans-serif'
	},
	editorial: {
		base: 'Georgia, "Times New Roman", Times, serif',
		heading: '"Palatino Linotype", "Book Antiqua", Palatino, serif'
	},
	friendly: {
		base: 'Verdana, "Geneva", "Segoe UI", sans-serif',
		heading: '"Lucida Sans", "Trebuchet MS", "Segoe UI", sans-serif'
	},
	utility: {
		base: '"Courier New", "Liberation Mono", Menlo, monospace',
		heading: 'Consolas, "Lucida Console", monospace'
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

function rgbToHsl({ r, g, b }) {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const lightness = (max + min) / 2;
	const delta = max - min;

	if (!delta) return { h: 0, s: 0, l: lightness };

	const saturation =
		lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let hue = 0;
	if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
	else if (max === green) hue = (blue - red) / delta + 2;
	else hue = (red - green) / delta + 4;

	return { h: hue / 6, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }) {
	if (s <= 0) {
		const value = l * 255;
		return { r: value, g: value, b: value };
	}

	const hueToRgb = (p, q, t) => {
		let temp = t;
		if (temp < 0) temp += 1;
		if (temp > 1) temp -= 1;
		if (temp < 1 / 6) return p + (q - p) * 6 * temp;
		if (temp < 1 / 2) return q;
		if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
		return p;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;

	return {
		r: 255 * hueToRgb(p, q, h + 1 / 3),
		g: 255 * hueToRgb(p, q, h),
		b: 255 * hueToRgb(p, q, h - 1 / 3)
	};
}

function rotateHueColor(baseHex, rotation, options = {}) {
	const rgb = hexToRgb(baseHex);
	if (!rgb) return normalizeHexColor(baseHex) || '#64748B';
	const base = rgbToHsl(rgb);
	const saturation = clamp(
		base.s * (options.saturationMultiplier ?? 1) + (options.saturationOffset ?? 0),
		options.minSaturation ?? 0,
		options.maxSaturation ?? 1
	);
	const lightness = clamp(
		base.l * (options.lightnessMultiplier ?? 1) + (options.lightnessOffset ?? 0),
		options.minLightness ?? 0,
		options.maxLightness ?? 1
	);
	return rgbToHex(
		hslToRgb({
			h: (base.h + rotation / 360 + 1) % 1,
			s: saturation,
			l: lightness
		})
	);
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

function deriveSurfaceFromPrimary(primaryHex) {
	return rotateHueColor(primaryHex, 8, {
		saturationMultiplier: 0.08,
		saturationOffset: 0.02,
		minSaturation: 0.03,
		maxSaturation: 0.14,
		lightnessMultiplier: 0.24,
		lightnessOffset: 0.02,
		minLightness: 0.07,
		maxLightness: 0.18
	});
}

function deriveCompanionColorsFromPrimary(primaryHex) {
	const primary = normalizeHexColor(primaryHex) || '#64748B';

	const secondary = rotateHueColor(primary, 268, {
		saturationMultiplier: 1.05,
		saturationOffset: 0.03,
		minSaturation: 0.42,
		maxSaturation: 0.92,
		lightnessMultiplier: 1.01,
		lightnessOffset: 0.02,
		minLightness: 0.34,
		maxLightness: 0.68
	});

	const accent = rotateHueColor(primary, 332, {
		saturationMultiplier: 1.12,
		saturationOffset: 0.02,
		minSaturation: 0.46,
		maxSaturation: 0.95,
		lightnessMultiplier: 1.04,
		lightnessOffset: 0.03,
		minLightness: 0.38,
		maxLightness: 0.74
	});

	return { secondary, accent };
}

function deriveSemanticBaseColors(palette) {
	const primary = normalizeHexColor(palette?.primary) || '#64748B';
	return {
		success: rotateHueColor(primary, 162, {
			saturationMultiplier: 0.86,
			saturationOffset: 0.03,
			minSaturation: 0.34,
			maxSaturation: 0.78,
			lightnessMultiplier: 1.06,
			lightnessOffset: 0.03,
			minLightness: 0.4,
			maxLightness: 0.7
		}),
		warning: rotateHueColor(primary, 56, {
			saturationMultiplier: 0.96,
			saturationOffset: 0.05,
			minSaturation: 0.46,
			maxSaturation: 0.9,
			lightnessMultiplier: 1.08,
			lightnessOffset: 0.04,
			minLightness: 0.46,
			maxLightness: 0.74
		}),
		error: rotateHueColor(primary, 12, {
			saturationMultiplier: 1.1,
			saturationOffset: 0.06,
			minSaturation: 0.56,
			maxSaturation: 0.96,
			lightnessMultiplier: 0.98,
			lightnessOffset: 0.02,
			minLightness: 0.34,
			maxLightness: 0.64
		})
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
	const primary = normalizeHexColor(source.primary) || fallback.primary;
	const companions = deriveCompanionColorsFromPrimary(primary);
	const derivedSurface = deriveSurfaceFromPrimary(primary);

	return {
		primary,
		secondary: normalizeHexColor(source.secondary) || companions.secondary,
		accent: normalizeHexColor(source.accent) || companions.accent,
		surface: normalizeHexColor(source.surface) || derivedSurface || fallback.surface
	};
}

export function buildMicrositeThemeStyle({ palette, fontPairing = 'poster' } = {}) {
	const resolvedPalette = normalizePalette(palette);
	const fonts = FONT_PAIRINGS[fontPairing] || FONT_PAIRINGS.poster;
	const primaryScale = createScale(resolvedPalette.primary);
	const secondaryScale = createScale(resolvedPalette.secondary);
	const tertiaryScale = createScale(resolvedPalette.accent);
	const surfaceScale = createSurfaceScale(resolvedPalette.surface);
	const semanticBases = deriveSemanticBaseColors(resolvedPalette);
	const successScale = createScale(semanticBases.success);
	const warningScale = createScale(semanticBases.warning);
	const errorScale = createScale(semanticBases.error);

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
		...toCssVars('surface', surfaceScale),
		...toCssVars('success', successScale),
		...toCssVars('warning', warningScale),
		...toCssVars('error', errorScale)
	]);

	return Array.from(vars.entries())
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}
