import {
	BIKE_VIBE_STYLE_ID,
	IMAGE_STYLE_GROUPS,
	IMAGE_STYLE_PRESETS,
	STATE_MASCOT_STYLE_ID,
	getImageStylePreset
} from '#lib/ai/imageStyles.js';
import { BIKE_VIBE_OPTIONS, getBikeVibeById, normalizeBikeVibeId } from '#lib/ai/bikeVibes.js';
import { getUsStateName, normalizeUsStateCode, US_STATE_OPTIONS } from '#lib/geo/usStates.js';

export {
	BIKE_VIBE_OPTIONS,
	BIKE_VIBE_STYLE_ID,
	IMAGE_STYLE_GROUPS,
	IMAGE_STYLE_PRESETS,
	STATE_MASCOT_STYLE_ID,
	US_STATE_OPTIONS,
	getBikeVibeById,
	getImageStylePreset,
	getUsStateName,
	normalizeBikeVibeId,
	normalizeUsStateCode
};

export function styleRequiresStateSelection(styleId) {
	return styleId === STATE_MASCOT_STYLE_ID;
}

export function styleRequiresBikeVibeSelection(styleId) {
	return styleId === BIKE_VIBE_STYLE_ID;
}

/**
 * @param {Record<string, any> | null} [context]
 */
export function inferStateCodeFromContext(context = {}) {
	if (!context || typeof context !== 'object') return '';
	const directCandidates = [
		context.state,
		context.stateCode,
		context.state_region,
		context.geoState,
		context.geo_state,
		context.hostGroupState,
		context.groupState
	];
	for (const value of directCandidates) {
		const normalized = normalizeUsStateCode(value);
		if (normalized) return normalized;
	}

	const locationCandidates = [
		context.location,
		context.startLocation,
		context.endLocation,
		context.serviceArea,
		context.hostGroupLocation,
		context.groupLocation
	];
	for (const value of locationCandidates) {
		const text = String(value ?? '').trim();
		if (!text) continue;
		const parts = text
			.split(/[,\u00b7|/]+/g)
			.map((part) => part.trim())
			.filter(Boolean);
		for (const part of parts.reverse()) {
			const normalized = normalizeUsStateCode(part);
			if (normalized) return normalized;
		}
	}

	return '';
}

/**
 * @param {Record<string, any> | null} [context]
 */
export function inferBikeVibeIdFromContext(context = {}) {
	if (!context || typeof context !== 'object') return '';
	const textBlob = [
		context.disciplines,
		context.ridingDisciplines,
		context.summary,
		context.description,
		context.title,
		context.name,
		context.tagline,
		context.prompt
	]
		.flat()
		.filter(Boolean)
		.map((value) => String(value).toLowerCase())
		.join(' ');

	if (/\b(gravel)\b/.test(textBlob)) return 'gravel_adventure';
	if (/\b(e[-\s]?bike|electric)\b/.test(textBlob)) return 'ebike_commuter';
	if (/\b(mountain|mtb|trail)\b/.test(textBlob)) return 'mountain_trail';
	if (/\b(fixie|fixed gear|track)\b/.test(textBlob)) return 'fixie_minimal';
	if (/\b(kid|kids|youth|child)\b/.test(textBlob)) return 'kids_playbike';
	if (/\b(road|race|criterium|crit)\b/.test(textBlob)) return 'road_race';
	return '';
}

/**
 * @param {{
 *   currentStateCode?: string;
 *   context?: Record<string, any> | null;
 *   fetchImpl?: ((input: any, init?: any) => Promise<{ ok?: boolean; json: () => Promise<any> }>) | null;
 * }} [options]
 */
export async function resolveDefaultStateCode({
	currentStateCode = '',
	context = {},
	fetchImpl = typeof fetch === 'function' ? fetch : null
} = {}) {
	const existing = normalizeUsStateCode(currentStateCode);
	if (existing) return existing;

	const fromContext = inferStateCodeFromContext(context);
	if (fromContext) return fromContext;

	if (!fetchImpl) return '';
	try {
		const response = await fetchImpl('/api/location/region');
		const payload = await response.json().catch(() => ({}));
		const fromIp = normalizeUsStateCode(payload?.stateCode);
		if (response.ok && fromIp) return fromIp;
	} catch {
		// Best effort only.
	}
	return '';
}

/**
 * @param {{ currentBikeVibeId?: string; context?: Record<string, any> | null }} [options]
 */
export function resolveDefaultBikeVibeId({ currentBikeVibeId = '', context = {} } = {}) {
	const existing = normalizeBikeVibeId(currentBikeVibeId);
	if (existing) return existing;
	return normalizeBikeVibeId(inferBikeVibeIdFromContext(context));
}

/**
 * @param {{ styleId?: string; stateCode?: string; bikeVibeId?: string }} [options]
 */
export function validateArtworkStyleSelection({
	styleId = '',
	stateCode = '',
	bikeVibeId = ''
} = {}) {
	if (styleRequiresStateSelection(styleId) && !normalizeUsStateCode(stateCode)) {
		return 'Select a state or territory for this style.';
	}
	if (styleRequiresBikeVibeSelection(styleId) && !normalizeBikeVibeId(bikeVibeId)) {
		return 'Select a bike type or vibe for this style.';
	}
	return '';
}

/**
 * @param {{ styleId?: string; stateCode?: string; bikeVibeId?: string }} [options]
 * @returns {Record<string, any>}
 */
export function buildArtworkStyleOptions({ styleId = '', stateCode = '', bikeVibeId = '' } = {}) {
	const normalizedState = normalizeUsStateCode(stateCode);
	const normalizedBikeVibe = normalizeBikeVibeId(bikeVibeId);
	const bikeVibe = normalizedBikeVibe ? getBikeVibeById(normalizedBikeVibe) : null;

	return {
		...(styleRequiresStateSelection(styleId) && normalizedState
			? {
					stateCode: normalizedState,
					stateName: getUsStateName(normalizedState)
				}
			: {}),
		...(styleRequiresBikeVibeSelection(styleId) && normalizedBikeVibe
			? {
					bikeVibeId: normalizedBikeVibe,
					bikeVibeLabel: bikeVibe?.label || '',
					bikeVibePrompt: bikeVibe?.promptCue || ''
				}
			: {})
	};
}
