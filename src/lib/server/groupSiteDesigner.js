import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';
import {
	buildDefaultGroupSiteConfig,
	mergeGroupSiteConfig,
	normalizeGroupSiteConfig
} from '$lib/microsites/config';

const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['site'],
	properties: {
		site: {
			type: 'object',
			additionalProperties: false,
			properties: {
				site_title: { type: 'string', nullable: true },
				site_tagline: { type: 'string', nullable: true },
				home_intro: { type: 'string', nullable: true },
				featured_quote: { type: 'string', nullable: true },
				footer_blurb: { type: 'string', nullable: true },
				seo_description: { type: 'string', nullable: true },
				layout_preset: { type: 'string', nullable: true },
				hero_style: { type: 'string', nullable: true },
				nav_style: { type: 'string', nullable: true },
				font_pairing: { type: 'string', nullable: true },
				theme_mode: { type: 'string', nullable: true },
				theme_name: { type: 'string', nullable: true },
				theme_colors: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					properties: {
						primary: { type: 'string', nullable: true },
						secondary: { type: 'string', nullable: true },
						accent: { type: 'string', nullable: true },
						surface: { type: 'string', nullable: true }
					}
				},
				sections: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					properties: {
						story: { type: 'boolean', nullable: true },
						stats: { type: 'boolean', nullable: true },
						join: { type: 'boolean', nullable: true },
						rides: { type: 'boolean', nullable: true },
						volunteer: { type: 'boolean', nullable: true },
						news: { type: 'boolean', nullable: true },
						gallery: { type: 'boolean', nullable: true },
						contact: { type: 'boolean', nullable: true }
					}
				}
			}
		}
	}
};

let schemaUnsupported = false;

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function safeParseJson(text) {
	if (!text) return null;
	const first = text.indexOf('{');
	const last = text.lastIndexOf('}');
	if (first === -1 || last === -1 || last <= first) return null;
	try {
		return JSON.parse(text.slice(first, last + 1));
	} catch {
		return null;
	}
}

function isSchemaUnsupportedError(error) {
	const message = cleanText(error?.message);
	return /response_schema/i.test(message) || /Invalid JSON payload/i.test(message);
}

function buildPrompt({ group, currentConfig, prompt }) {
	return `
You are designing a polished, low-maintenance community microsite for a bike group on 3FP.

Rules:
- Return JSON only.
- Stay tasteful, simple, and confident.
- Do not invent logistics, locations, schedules, or policies that the group has not stated.
- Prefer concise writing over marketing fluff.
- The microsite should feel distinct from the main 3FP brand, but still clean and usable.
- Favor layouts that work well on mobile.
- If custom theme colors are used, output valid 6-digit hex colors.
- If a repo theme is better, set theme_mode to "repo" and use one of: 3fp, mint, cerberus, catppuccin, legacy, nouveau, rose, sahara, seafoam, wintry.
- If custom colors are better, set theme_mode to "custom" and provide primary, secondary, accent, and surface.

Group context:
- name: ${cleanText(group?.name)}
- tagline: ${cleanText(group?.tagline)}
- description: ${cleanText(group?.description)}
- city: ${cleanText(group?.city)}
- state: ${cleanText(group?.state_region)}
- website: ${cleanText(group?.website_url)}
- join instructions: ${cleanText(group?.how_to_join_instructions)}
- membership info: ${cleanText(group?.membership_info)}
- service area: ${cleanText(group?.service_area_description)}
- activity frequency: ${cleanText(group?.activity_frequency)}
- typical time: ${cleanText(group?.typical_activity_day_time)}

Current site config:
${JSON.stringify(currentConfig, null, 2)}

Owner request:
${cleanText(prompt) || 'Refresh the microsite so it feels intentional, welcoming, and distinct while remaining easy to maintain.'}
`;
}

function buildFallbackDraft({ group, currentConfig, prompt }) {
	const base = buildDefaultGroupSiteConfig(group);
	const seed = cleanText(prompt).toLowerCase();
	const layout =
		seed.includes('minimal') || seed.includes('clean')
			? 'minimal'
			: seed.includes('editorial') || seed.includes('magazine')
				? 'editorial'
				: seed.includes('split')
					? 'split'
					: 'poster';
	return mergeGroupSiteConfig(base, currentConfig, {
		layout_preset: layout,
		hero_style: layout === 'minimal' ? 'plain' : layout === 'split' ? 'spotlight' : 'immersive',
		nav_style: layout === 'minimal' ? 'minimal' : 'floating',
		font_pairing: layout === 'editorial' ? 'editorial' : 'poster',
		site_tagline: currentConfig.site_tagline || base.site_tagline,
		home_intro: cleanText(prompt)
			? `${base.home_intro} ${cleanText(prompt).replace(/\s+/g, ' ')}`
			: currentConfig.home_intro || base.home_intro
	});
}

export async function generateGroupSiteDraft({ group, currentConfig, prompt }) {
	const normalizedCurrent = normalizeGroupSiteConfig(currentConfig, { group });
	if (!isAiModelConfigured('structured_text')) {
		return {
			ok: false,
			source: 'fallback',
			error: getAiConfigurationError('structured_text'),
			config: buildFallbackDraft({ group, currentConfig: normalizedCurrent, prompt })
		};
	}

	const { client, model } = requireAiModel('structured_text');
	const contents = buildPrompt({ group, currentConfig: normalizedCurrent, prompt });
	const aiConfig = { responseMimeType: 'application/json' };
	if (!schemaUnsupported) aiConfig.responseSchema = RESPONSE_SCHEMA;

	try {
		const response = await client.generateContent({
			model: model.model,
			contents,
			config: aiConfig
		});
		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		return {
			ok: true,
			source: 'ai',
			config: mergeGroupSiteConfig(
				buildDefaultGroupSiteConfig(group),
				normalizedCurrent,
				parsed?.site || {}
			)
		};
	} catch (error) {
		if (!schemaUnsupported && isSchemaUnsupportedError(error)) {
			schemaUnsupported = true;
			return generateGroupSiteDraft({ group, currentConfig: normalizedCurrent, prompt });
		}

		return {
			ok: false,
			source: 'fallback',
			error: cleanText(error?.message) || 'AI request failed.',
			config: buildFallbackDraft({ group, currentConfig: normalizedCurrent, prompt })
		};
	}
}

