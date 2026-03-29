import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';
import {
	GROUP_SITE_BACKGROUND_STYLES,
	GROUP_SITE_FONT_PAIRINGS,
	GROUP_SITE_HERO_STYLES,
	GROUP_SITE_PANEL_DENSITIES,
	GROUP_SITE_PANEL_STYLES,
	GROUP_SITE_PANEL_TONES,
	GROUP_SITE_THEME_MODES,
	GROUP_SITE_THEME_OPTIONS,
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
				hero_style: { type: 'string', nullable: true, enum: GROUP_SITE_HERO_STYLES },
				background_style: { type: 'string', nullable: true, enum: GROUP_SITE_BACKGROUND_STYLES },
				panel_style: { type: 'string', nullable: true, enum: GROUP_SITE_PANEL_STYLES },
				panel_tone: { type: 'string', nullable: true, enum: GROUP_SITE_PANEL_TONES },
				panel_density: { type: 'string', nullable: true, enum: GROUP_SITE_PANEL_DENSITIES },
				font_pairing: { type: 'string', nullable: true, enum: GROUP_SITE_FONT_PAIRINGS },
				theme_mode: { type: 'string', nullable: true, enum: GROUP_SITE_THEME_MODES },
				theme_name: {
					type: 'string',
					nullable: true,
					enum: GROUP_SITE_THEME_OPTIONS.map((theme) => theme.value)
				},
				simple_mode: { type: 'boolean', nullable: true },
				microsite_notice: { type: 'string', nullable: true },
				microsite_notice_href: { type: 'string', nullable: true },
				new_rider_note: { type: 'string', nullable: true },
				meeting_instructions: { type: 'string', nullable: true },
				faq_1_q: { type: 'string', nullable: true },
				faq_1_a: { type: 'string', nullable: true },
				faq_2_q: { type: 'string', nullable: true },
				faq_2_a: { type: 'string', nullable: true },
				sponsor_links: {
					type: 'array',
					nullable: true,
					maxItems: 3,
					items: { type: 'string' }
				},
				sponsor_items: {
					type: 'array',
					nullable: true,
					maxItems: 3,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							name: { type: 'string', nullable: true },
							text: { type: 'string', nullable: true },
							logo: { type: 'string', nullable: true },
							url: { type: 'string', nullable: true }
						}
					}
				},
				ride_widget_enabled: { type: 'boolean', nullable: true },
				ride_widget_title: { type: 'string', nullable: true },
				ride_widget_host_scope: {
					type: 'string',
					nullable: true,
					enum: ['all', 'group_only', 'selected_groups']
				},
				ride_widget_group_ids: {
					type: 'array',
					nullable: true,
					items: { type: 'string' }
				},
				ride_widget_config: {
					type: 'object',
					nullable: true
				},
				announcement_expires_at: { type: 'string', nullable: true },
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

function buildPrompt({ group, currentConfig, prompt, allowDesignChanges }) {
	return `
You are designing a polished, low-maintenance community microsite for a bike group on 3FP.

Rules:
- Return JSON only.
- Stay tasteful, simple, and confident.
- Do not invent logistics, locations, schedules, or policies that the group has not stated.
- Prefer concise writing over marketing fluff.
- The microsite should feel distinct from the main 3FP brand, but still clean and usable.
- Favor layouts that work well on mobile.
- Treat the editor audience as non-technical: defaults should be obvious and low-maintenance.
- Keep typography mode-safe: avoid hardcoding light-only heading/body colors.
- Prefer paired semantic tokens (for example: surface-950-50, surface-800-200) over dark: prefixed class variants.
- Use Skeleton/Tailwind utility vocabulary only; do not invent custom framework class names.
- Do not modify site navigation structure or behavior.
- Keep design controls constrained to enums only:
  - hero_style: immersive, orbit, bold
  - background_style: cinematic, aurora, prism, void
  - panel_style: glass, filled, outlined
  - panel_tone: surface, primary, secondary, tertiary
  - panel_density: compact, comfortable, airy
- For buttons, cards, and chips, require explicit Skeleton preset classes with concrete color variants (examples: preset-tonal-primary, preset-outlined-secondary-500, preset-filled-surface-50-950).
- If custom theme colors are used, output valid 6-digit hex colors.
- Keep custom content concise: notice <= 180 chars, FAQ answers <= 320 chars, max 3 sponsors.
- ride_widget_group_ids should only contain group UUIDs.
- font_pairing must be one of exactly: poster, editorial, friendly, utility.
- Font pairing meanings:
  - poster: bold display headings with clean sans-serif body text.
  - editorial: classic serif reading tone for body and headings.
  - friendly: softer humanist sans-serif tone for both heading and body.
  - utility: technical monospace-forward style.
- If a repo theme is better, set theme_mode to "repo" and use one of: ${GROUP_SITE_THEME_OPTIONS.map((theme) => theme.value).join(', ')}.
- If custom colors are better, set theme_mode to "custom" and provide primary, secondary, accent, and surface.
${allowDesignChanges ? '- Design changes are enabled for this run. You may update hero, background, panel style/tone/density, font pairing, and theme selections if it improves quality.' : '- Design changes are NOT enabled for this run. Keep hero_style, background_style, panel_style, panel_tone, panel_density, font_pairing, theme_mode, theme_name, and theme_colors exactly as they are.'}

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
	const wantsVoid = seed.includes('minimal') || seed.includes('clean') || seed.includes('void');
	const isEditorial = seed.includes('editorial') || seed.includes('magazine');
	const hero = seed.includes('bold') || seed.includes('centered')
		? 'bold'
		: seed.includes('orbit') || seed.includes('panel')
			? 'orbit'
			: 'immersive';
	return mergeGroupSiteConfig(base, currentConfig, {
		hero_style: hero,
		background_style: wantsVoid ? 'void' : isEditorial ? 'prism' : 'cinematic',
		panel_style: wantsVoid ? 'outlined' : 'glass',
		panel_tone: isEditorial ? 'secondary' : 'surface',
		panel_density: wantsVoid ? 'compact' : 'comfortable',
		font_pairing: isEditorial ? 'editorial' : 'poster',
		site_tagline: currentConfig.site_tagline || base.site_tagline,
		home_intro: cleanText(prompt)
			? `${base.home_intro} ${cleanText(prompt).replace(/\s+/g, ' ')}`
			: currentConfig.home_intro || base.home_intro
	});
}

export async function generateGroupSiteDraft({ group, currentConfig, prompt, allowDesignChanges = false }) {
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
	const contents = buildPrompt({ group, currentConfig: normalizedCurrent, prompt, allowDesignChanges });
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
		const draftConfig = mergeGroupSiteConfig(
			buildDefaultGroupSiteConfig(group),
			normalizedCurrent,
			parsed?.site || {}
		);
		const lockedConfig = allowDesignChanges
			? draftConfig
			: mergeGroupSiteConfig(draftConfig, {
					hero_style: normalizedCurrent.hero_style,
					background_style: normalizedCurrent.background_style,
					panel_style: normalizedCurrent.panel_style,
					panel_tone: normalizedCurrent.panel_tone,
					panel_density: normalizedCurrent.panel_density,
					font_pairing: normalizedCurrent.font_pairing,
					theme_mode: normalizedCurrent.theme_mode,
					theme_name: normalizedCurrent.theme_name,
					theme_colors: normalizedCurrent.theme_colors
				});
		return {
			ok: true,
			source: 'ai',
			config: lockedConfig
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
