import { json } from '@sveltejs/kit';
import report from '#lib/content/safetyReport.json';
import { answerSafetyReportQuestion } from '#lib/server/safetyReportAi';
import { retrieveReportContext, validateReportInput } from '#lib/server/safetyReportAiCore';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';

const headers = { 'cache-control': 'no-store' };
const fail = (error, status, sections = []) => json({ error, sections }, { status, headers });

export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'safety-report-ask',
		limit: 20,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;
	const origin = event.request.headers.get('origin');
	if (origin && origin !== event.url.origin) return fail('Invalid request origin.', 403);
	const parsed = await readJsonBody(event.request, { maxBytes: 16 * 1024 });
	if (!parsed.ok) return fail(parsed.error, parsed.status);
	const { question, history = [] } = parsed.value || {};
	const invalid = validateReportInput(question, history);
	if (invalid) return fail(invalid, 400);
	const conversation = history.map(({ role, content }) => ({ role, content }));
	const context = retrieveReportContext(question, conversation, report);
	const sections = context.sections.map(({ id, title }) => ({ id, title }));
	if (!context.sections.length && !context.sources.length)
		return fail(
			'I could not find relevant material in this report. Try another question or browse the report.',
			503,
			sections
		);
	try {
		return json(await answerSafetyReportQuestion({ question, history: conversation, context }), {
			headers
		});
	} catch (error) {
		if (error?.code === 'AI_UNAVAILABLE')
			return fail(
				'The report assistant is unavailable right now. You can browse the related sections.',
				503,
				sections
			);
		console.warn('Safety report assistant request failed.');
		return fail(
			'The report assistant could not answer right now. Please try again.',
			502,
			sections
		);
	}
}
