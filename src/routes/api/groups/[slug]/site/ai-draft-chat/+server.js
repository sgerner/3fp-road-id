import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { getAiConfigurationError, isAiModelConfigured, requireAiModel } from '$lib/server/ai/models';
import { mergeGroupSiteConfig } from '$lib/microsites/config';
import { generateGroupSiteDraft } from '$lib/server/groupSiteDesigner';
import { getGroupSiteConfig, upsertGroupSiteConfig } from '$lib/server/groupSites';

const MAX_MESSAGES = 20;
const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['action', 'reply'],
	properties: {
		action: { type: 'string', enum: ['ask', 'generate'] },
		reply: { type: 'string' },
		generation_prompt: { type: 'string', nullable: true }
	}
};

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeMessages(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((entry) => {
			const role =
				entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : null;
			const content = cleanText(entry?.content);
			if (!role || !content) return null;
			return { role, content };
		})
		.filter(Boolean)
		.slice(-MAX_MESSAGES);
}

function countAssistantQuestions(messages) {
	return messages.filter((entry) => entry.role === 'assistant' && entry.content.includes('?')).length;
}

function safeParseJson(text) {
	const source = cleanText(text);
	if (!source) return null;
	const first = source.indexOf('{');
	const last = source.lastIndexOf('}');
	if (first === -1 || last === -1 || last <= first) return null;
	try {
		return JSON.parse(source.slice(first, last + 1));
	} catch {
		return null;
	}
}

function buildPlannerPrompt({ group, currentConfig, messages }) {
	const transcript = messages.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`).join('\n\n');
	return `
You are the AI Draft guide for a community bike-group microsite editor.

Your job:
- Ask exactly ONE question per assistant turn while gathering intent.
- Keep questions specific and practical.
- Ask follow-up questions only when needed.
- Generate only when you have enough information.
- Assume sensible defaults instead of asking for every detail.

What you are allowed to change in the draft:
- Copy/content: title, tagline, intro, notice text, FAQs, sponsor text, section emphasis.
- Visual direction: hero/background/panel styles, font pairing, and theme choices/colors.
- Layout/settings: section toggles and practical microsite configuration choices.

Decision rules:
- If intent is incomplete, return action = "ask".
- If intent is sufficient, return action = "generate".
- When action = "generate", include generation_prompt: a concise but complete brief covering BOTH content and design direction.
- Never include more than one question mark in reply.
- Reply should be plain text only.
- Keep questions minimal: ask at most one clarifying question total unless absolutely blocked.

Sufficiency checklist (aim to infer most from user input, ask only for gaps):
- Desired tone/style
- Primary audience and outcome
- Any hard constraints or must-include sections/details

Group context:
- Name: ${cleanText(group?.name)}
- Tagline: ${cleanText(group?.tagline)}
- Description: ${cleanText(group?.description)}
- City/State: ${cleanText([group?.city, group?.state_region].filter(Boolean).join(', '))}

Current config summary:
${JSON.stringify(
		{
			site_title: currentConfig?.site_title || '',
			site_tagline: currentConfig?.site_tagline || '',
			hero_style: currentConfig?.hero_style || '',
			background_style: currentConfig?.background_style || '',
			panel_style: currentConfig?.panel_style || '',
			panel_tone: currentConfig?.panel_tone || '',
			panel_density: currentConfig?.panel_density || '',
			font_pairing: currentConfig?.font_pairing || '',
			theme_mode: currentConfig?.theme_mode || '',
			theme_name: currentConfig?.theme_name || '',
			sections: currentConfig?.sections || {}
		},
		null,
		2
	)}

Conversation transcript:
${transcript || '(no conversation yet)'}
`;
}

async function requireOwner(cookies, groupSlug) {
	const sessionCookie = cookies.get('sb_session');
	if (!sessionCookie) return { ok: false, status: 401, error: 'Authentication required.' };

	let parsed = null;
	try {
		parsed = JSON.parse(sessionCookie);
	} catch {
		parsed = null;
	}

	const accessToken = parsed?.access_token;
	if (!accessToken) return { ok: false, status: 401, error: 'Authentication required.' };
	const { data: userRes } = await supabase.auth.getUser(accessToken);
	const userId = userRes?.user?.id ?? null;
	if (!userId) return { ok: false, status: 401, error: 'Authentication required.' };

	const { data: group } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', groupSlug)
		.maybeSingle();
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', userId).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', userId)
			.eq('role', 'owner')
	]);

	if (!(profile?.admin === true) && !(ownerRows ?? []).length) {
		return { ok: false, status: 403, error: 'You do not have permission to manage this site.' };
	}

	return { ok: true, group };
}

export async function POST({ params, request, cookies }) {
	const auth = await requireOwner(cookies, params.slug);
	if (!auth.ok) {
		return json({ error: auth.error }, { status: auth.status });
	}

	const payload = await request.json().catch(() => ({}));
	const messages = normalizeMessages(payload?.messages);
	const userMessageCount = messages.filter((entry) => entry.role === 'user').length;
	const assistantQuestionCount = countAssistantQuestions(messages);

	const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });

	if (!isAiModelConfigured('structured_text')) {
		const fallbackPrompt =
			messages
				.filter((entry) => entry.role === 'user')
				.map((entry) => entry.content)
				.join('\n')
				.trim() || 'Refresh the microsite with a clear, welcoming, practical design.';
		const generated = await generateGroupSiteDraft({
			group: auth.group,
			currentConfig,
			prompt: fallbackPrompt,
			allowDesignChanges: true
		});
		const nextConfig = mergeGroupSiteConfig(generated.config, { ai_prompt: fallbackPrompt });
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		return json({
			reply:
				'AI guidance is unavailable right now, so I generated a full content-and-design draft from your notes.',
			generated: true,
			source: generated.source,
			redirectTo: `/groups/${params.slug}/manage/site?generated=${generated.source === 'ai' ? 'ai' : 'fallback'}`,
			error: getAiConfigurationError('structured_text')
		});
	}

	if (!userMessageCount) {
		return json({
			reply:
				'I can update your site copy, style, and layout. What kind of feel do you want visitors to get right away?',
			generated: false
		});
	}

	try {
		const { client, model } = requireAiModel('structured_text');
		const plannerPrompt = buildPlannerPrompt({
			group: auth.group,
			currentConfig,
			messages
		});
		const response = await client.generateContent({
			model: model.model,
			contents: plannerPrompt,
			config: {
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA
			}
		});

		let responseText = response?.text ?? '';
		if (typeof responseText === 'function') responseText = responseText();
		const parsed = safeParseJson(responseText) || {};
		let action = parsed.action === 'generate' ? 'generate' : 'ask';
		const reply = cleanText(parsed.reply) || 'Tell me a bit more about the tone and priorities you want.';
		let generationPrompt = cleanText(parsed.generation_prompt);

		// Keep questioning minimal: after one assistant question and a user reply, generate.
		if (assistantQuestionCount >= 1 && userMessageCount >= 1) {
			action = 'generate';
			if (!generationPrompt) {
				generationPrompt = messages
					.filter((entry) => entry.role === 'user')
					.map((entry) => entry.content)
					.join('\n')
					.trim();
			}
		}

		if (action !== 'generate' || !generationPrompt) {
			return json({ reply, generated: false });
		}

		const generated = await generateGroupSiteDraft({
			group: auth.group,
			currentConfig,
			prompt: generationPrompt,
			allowDesignChanges: true
		});

		const nextConfig = mergeGroupSiteConfig(generated.config, {
			ai_prompt: generationPrompt
		});
		await upsertGroupSiteConfig(auth.group.id, nextConfig);

		return json({
			reply,
			generated: true,
			source: generated.source,
			redirectTo: `/groups/${params.slug}/manage/site?generated=${generated.source === 'ai' ? 'ai' : 'fallback'}`
		});
	} catch (error) {
		return json(
			{
				error: cleanText(error?.message) || 'Unable to generate an AI draft right now.'
			},
			{ status: 500 }
		);
	}
}
