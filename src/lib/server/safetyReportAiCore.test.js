import test from 'node:test';
import assert from 'node:assert/strict';
import {
	retrieveReportContext,
	normalizeReportAnswer,
	validateReportInput,
	buildSafetyReportPrompt
} from './safetyReportAiCore.js';

const report = {
	sections: [
		{
			id: 'roads',
			title: 'Protected lanes',
			plainText: 'Infrastructure separates riders from traffic.',
			takeaways: [],
			sourceIds: ['R42']
		},
		{
			id: 'helmets',
			title: 'Helmets',
			plainText: 'Helmet use and head injury outcomes.',
			takeaways: [],
			sourceIds: ['R7']
		}
	],
	sources: [
		{
			record: 'R42',
			title: 'Lane study',
			finding: 'Fewer conflicts',
			limits: 'Observational design',
			url: 'https://example.com/42'
		},
		{
			record: 'R7',
			title: 'Helmet study',
			finding: 'Head injury',
			limits: 'Selection bias',
			url: 'https://example.com/7'
		}
	]
};

test('retrieves relevant sections and reference findings and limitations', () => {
	const context = retrieveReportContext('What do protected lanes show?', [], report);
	assert.equal(context.sections[0].id, 'roads');
	assert.equal(context.sources.find((s) => s.record === 'R42').limits, 'Observational design');
});

test('retrieves explicit record IDs and follows conversation context', () => {
	assert.equal(retrieveReportContext('What does R42 say?', [], report).sources[0].record, 'R42');
	assert.equal(
		retrieveReportContext(
			'What are its limits?',
			[{ role: 'user', content: 'Tell me about helmets' }],
			report
		).sections[0].id,
		'helmets'
	);
	assert.deepEqual(retrieveReportContext('unrelated aardvark', [], report).sections, []);
});

test('rejects unknown IDs and strips HTML from output', () => {
	const context = retrieveReportContext('R42', [], report);
	const result = normalizeReportAnswer(
		{
			answer: '<b>Answer</b>',
			sourceIds: ['R42', 'R999', 'R42'],
			sectionIds: ['roads', 'unknown'],
			nextSteps: ['<em>Read</em>']
		},
		context
	);
	assert.equal(result.answer, 'Answer');
	assert.deepEqual(result.sourceIds, ['R42']);
	assert.deepEqual(result.sectionIds, ['roads']);
	assert.deepEqual(result.nextSteps, ['Read']);
});

test('enforces input limits and bounds prompt context', () => {
	assert.ok(validateReportInput('x'.repeat(1201), []));
	assert.ok(validateReportInput('x', Array(7).fill({ role: 'user', content: 'x' })));
	assert.ok(validateReportInput('x', [{ role: 'user', content: 'x'.repeat(6001) }]));
	assert.ok(validateReportInput('x', [{ role: 'system', content: 'x' }]));
	const large = {
		sections: Array.from({ length: 8 }, (_, i) => ({
			id: String(i),
			title: 'bike',
			plainText: 'bike '.repeat(2000),
			takeaways: [],
			sourceIds: []
		})),
		sources: []
	};
	const context = retrieveReportContext('bike', [], large);
	assert.ok(
		buildSafetyReportPrompt('bike', [{ role: 'user', content: 'x'.repeat(6000) }], context).length <
			24000
	);
});

test('real report retrieves the intended chapters and respects topic changes', async () => {
	const { readFile } = await import('node:fs/promises');
	const real = JSON.parse(
		await readFile(new URL('../content/safetyReport.json', import.meta.url), 'utf8')
	);
	for (const [question, chapter] of [
		['passing', 'chapter-4'],
		['doors', 'chapter-5'],
		['story', 'chapter-6'],
		['lights', 'chapter-9'],
		['R42', 'chapter-9']
	]) {
		const context = retrieveReportContext(question, [], real);
		assert.equal(context.sections[0].id, chapter, question);
		assert.ok(!context.sections.some((section) => section.id === 'references'));
	}
	const context = retrieveReportContext(
		'What about lights?',
		[{ role: 'user', content: 'Tell me about passing and passing campaigns.' }],
		real
	);
	assert.equal(context.sections[0].id, 'chapter-9');
	assert.equal(retrieveReportContext('R42', [], real).sources[0].record, 'R42');
});

test('preserves long URLs and meaningful limitations; removes invented citations', async () => {
	const longUrl = `https://example.com/${'a'.repeat(300)}`;
	const context = retrieveReportContext('lanes', [], {
		sections: [{ id: 'lanes', title: 'lanes', plainText: 'lanes', sourceIds: ['R42'] }],
		sources: [
			{ record: 'R42', title: 'lanes', url: longUrl, limits: `${'x'.repeat(500)} qualification` }
		]
	});
	assert.equal(context.sources[0].url, longUrl);
	assert.ok(context.sources[0].limits.endsWith('qualification'));
	const answer = normalizeReportAnswer(
		{ answer: 'R42 supports this, but R999 does not.', sourceIds: ['R42'], sectionIds: [] },
		context
	);
	assert.ok(!answer.answer.includes('R999'));
	assert.ok(answer.answer.includes('R42'));
	const { hasGroundedReportAnswer } = await import('./safetyReportAiCore.js');
	assert.equal(
		hasGroundedReportAnswer({ answer: 'Some unsupported claim.', sourceIds: [], sectionIds: [] }),
		false
	);
	assert.equal(
		hasGroundedReportAnswer({
			answer: 'This is not covered by the report.',
			sourceIds: [],
			sectionIds: []
		}),
		true
	);
	assert.match(buildSafetyReportPrompt('law?', [], context), /current legal advice/);
});
