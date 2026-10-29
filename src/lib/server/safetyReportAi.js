import { isAiModelConfigured, requireAiModel } from '#lib/server/ai/models';
import { parseLearnAiJson, withLearnAiTimeout } from './learnAiCore.js';
import {
	buildSafetyReportPrompt,
	normalizeReportAnswer,
	hasGroundedReportAnswer
} from './safetyReportAiCore.js';

const schema = {
	type: 'object',
	additionalProperties: false,
	required: ['answer', 'nextSteps', 'sourceIds', 'sectionIds'],
	properties: {
		answer: { type: 'string' },
		nextSteps: { type: 'array', items: { type: 'string' } },
		sourceIds: { type: 'array', items: { type: 'string' } },
		sectionIds: { type: 'array', items: { type: 'string' } }
	}
};

export async function answerSafetyReportQuestion({ question, history, context }) {
	if (!isAiModelConfigured('structured_text'))
		throw Object.assign(new Error('AI unavailable'), { code: 'AI_UNAVAILABLE' });
	const { client, model } = requireAiModel('structured_text');
	const response = await withLearnAiTimeout(
		client.generateContent({
			model: model.model,
			contents: buildSafetyReportPrompt(question, history, context),
			config: {
				responseMimeType: 'application/json',
				responseSchema: schema,
				schemaName: 'safety_report_answer'
			}
		}),
		30_000
	);
	let text = response?.text ?? '';
	if (typeof text === 'function') text = text();
	const raw = parseLearnAiJson(text);
	const result = normalizeReportAnswer(raw, context);
	if (!hasGroundedReportAnswer(result)) throw new Error('Invalid AI response');
	return result;
}
