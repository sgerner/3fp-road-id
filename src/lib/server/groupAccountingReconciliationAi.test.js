import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenAiResponseBody, OPENAI_GPT_6_LUNA_MODEL } from './ai/openai.js';
import {
	extractReconciliationStatement,
	matchReconciliationStatement,
	matchReconciliationStatementWithAi,
	RECONCILIATION_AI_LIMITS,
	suggestReconciliationResolutions
} from './groupAccountingReconciliationAi.js';

function fakePdfFile(text = '%PDF-1.7\n1 0 obj <</Type /Page>>\n') {
	const bytes = Buffer.from(text, 'latin1');
	return {
		name: 'statement.pdf',
		type: 'application/pdf',
		size: bytes.length,
		async arrayBuffer() {
			return Uint8Array.from(bytes).buffer;
		}
	};
}

function extractedStatement(overrides = {}) {
	return {
		period_start: '2026-08-01',
		period_end: '2026-08-31',
		currency: 'USD',
		beginning_balance: '100.00',
		ending_balance: '350.00',
		printed_debits_total: '0.00',
		printed_credits_total: '250.00',
		lines: [
			{
				transaction_date: '2026-08-05',
				description: 'Member dues',
				amount: '250.00',
				direction: 'credit',
				currency: 'USD',
				page_number: 1,
				confidence: 0.98,
				needs_review: false,
				uncertainty_reason: ''
			}
		],
		...overrides
	};
}

function injectedAi(statement) {
	let request;
	const client = {
		async generateContent(value) {
			request = value;
			return { text: JSON.stringify(statement) };
		}
	};
	return {
		client,
		model: { provider: 'openai', model: OPENAI_GPT_6_LUNA_MODEL },
		getRequest: () => request
	};
}

test('statement extraction sends a multimodal Responses API file with strict output and validates arithmetic', async () => {
	const ai = injectedAi(extractedStatement());
	const result = await extractReconciliationStatement(fakePdfFile(), {
		client: ai.client,
		model: ai.model,
		expectedCurrency: 'USD'
	});
	const request = ai.getRequest();

	assert.equal(request.model, OPENAI_GPT_6_LUNA_MODEL);
	assert.equal(request.contents[0].content[1].type, 'input_file');
	assert.match(request.contents[0].content[1].file_data, /^data:application\/pdf;base64,/);
	assert.equal(request.config.schemaName, 'bank_statement_reconciliation');
	assert.equal(request.config.store, false);
	assert.equal(result.beginning_balance_cents, 10_000);
	assert.equal(result.ending_balance_cents, 35_000);
	assert.equal(result.lines[0].amount_cents, 25_000);
	assert.equal(result.lines[0].page_number, 1);
	assert.equal(result.totals_valid, true);
	assert.equal(result.needs_review, false);

	const body = buildOpenAiResponseBody({
		model: request.model,
		contents: request.contents,
		config: { responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } } }
	});
	assert.equal(body.input[0].content[1].type, 'input_file');
	assert.equal(body.text.format.type, 'json_schema');
});

test('statement extraction signs debit amounts and flags invalid dates, currency, page, and arithmetic', async () => {
	const statement = extractedStatement({
		ending_balance: '351.00',
		lines: [
			{
				transaction_date: '2026-02-30',
				description: 'Service fee',
				amount: '$1.50',
				direction: 'debit',
				currency: 'ZZZ',
				page_number: 2,
				confidence: 0.7,
				needs_review: false,
				uncertainty_reason: ''
			}
		]
	});
	const ai = injectedAi(statement);
	const result = await extractReconciliationStatement(fakePdfFile(), {
		client: ai.client,
		model: ai.model,
		expectedCurrency: 'USD'
	});

	assert.equal(result.lines[0].transaction_date, null);
	assert.equal(result.lines[0].amount_cents, -150);
	assert.equal(result.lines[0].currency, 'ZZZ');
	assert.equal(result.lines[0].page_number, 2);
	assert.equal(result.lines[0].needs_review, true);
	assert.equal(result.totals_valid, false);
	assert.match(result.warnings.join(' '), /does not match the ending balance/);
});

test('statement extraction leaves an unsigned unknown-direction amount unresolved', async () => {
	const statement = extractedStatement({
		lines: [
			{
				transaction_date: '2026-08-05',
				description: 'Unclear transaction',
				amount: '50.00',
				direction: 'unknown',
				currency: 'USD',
				page_number: 1,
				confidence: 0.99,
				needs_review: false,
				uncertainty_reason: ''
			}
		]
	});
	const ai = injectedAi(statement);
	const result = await extractReconciliationStatement(fakePdfFile(), {
		client: ai.client,
		model: ai.model
	});
	assert.equal(result.lines[0].amount_cents, null);
	assert.equal(result.lines[0].needs_review, true);
});

test('statement extraction follows the selected credit-card balance convention', async () => {
	const statement = extractedStatement({
		beginning_balance: '200.00',
		ending_balance: '280.00',
		printed_credits_total: '80.00',
		lines: [
			{
				transaction_date: '2026-08-05',
				description: 'Card purchase',
				amount: '80.00',
				direction: 'credit',
				currency: 'USD',
				page_number: 1,
				confidence: 0.98,
				needs_review: false,
				uncertainty_reason: ''
			}
		]
	});
	const ai = injectedAi(statement);
	const result = await extractReconciliationStatement(fakePdfFile(), {
		client: ai.client,
		model: ai.model,
		accountKind: 'liability',
		normalSide: 'credit'
	});

	assert.equal(result.lines[0].amount_cents, 8000);
	assert.equal(result.account_kind, 'liability');
	assert.equal(result.normal_side, 'credit');
	assert.match(ai.getRequest().contents[0].content[0].text, /purchases and charges.*positive/s);
});

test('statement uploads reject mismatched MIME signatures and files above the limit', async () => {
	const ai = injectedAi(extractedStatement());
	const mislabeled = {
		...fakePdfFile(),
		type: 'image/png'
	};
	await assert.rejects(
		extractReconciliationStatement(mislabeled, { client: ai.client, model: ai.model }),
		/file type does not match/
	);
	assert.equal(RECONCILIATION_AI_LIMITS.maxUploadBytes, 10 * 1024 * 1024);
	const tooLarge = {
		...fakePdfFile(),
		size: RECONCILIATION_AI_LIMITS.maxUploadBytes + 1
	};
	await assert.rejects(
		extractReconciliationStatement(tooLarge, { client: ai.client, model: ai.model }),
		/10 MB or smaller/
	);
});

test('matching respects signed amounts, account lines, normal side, duplicates, and one-to-one assignment', () => {
	const statementLines = [
		{
			line_id: 's1',
			transaction_date: '2026-08-05',
			description: 'Office supplies',
			amount_cents: -1200,
			currency: 'USD'
		}
	];
	const feedRows = [
		{
			id: 'f1',
			transaction_date: '2026-08-05',
			description: 'Office supplies',
			amount_cents: -1200,
			currency: 'USD',
			status: 'posted'
		}
	];
	const ledgerRows = [
		{
			id: 'e1',
			entry_date: '2026-08-05',
			description: 'Office supplies',
			currency: 'USD',
			lines: [
				{ account_id: 'cash', debit_cents: 0, credit_cents: 1200 },
				{ account_id: 'supplies', debit_cents: 1200, credit_cents: 0 }
			]
		}
	];
	const result = matchReconciliationStatement({
		statementLines,
		feedRows,
		ledgerRows,
		accountId: 'cash',
		normalSide: 'debit'
	});
	assert.equal(result.lines[0].candidates.length, 2);
	assert.deepEqual(
		result.lines[0].candidates.map((candidate) => candidate.amount_cents),
		[-1200, -1200]
	);
	assert.equal(result.lines[0].suggested_match, null);
	assert.equal(result.lines[0].needs_review, true);

	const duplicate = matchReconciliationStatement({
		statementLines,
		feedRows: [feedRows[0], { ...feedRows[0], id: 'f2' }]
	});
	assert.equal(duplicate.lines[0].suggested_match, null);
	assert.equal(
		duplicate.lines[0].candidates.every((candidate) => candidate.duplicate),
		true
	);
	assert.equal(duplicate.duplicate_feed_groups[0].count, 2);
});

test('ledger matching requires the requested account line and applies credit normal-side polarity', () => {
	const input = {
		statementLines: [
			{
				transaction_date: '2026-08-05',
				description: 'Card settlement',
				amount_cents: 1800,
				currency: 'USD'
			}
		],
		ledgerRows: [
			{
				id: 'e1',
				entry_date: '2026-08-05',
				description: 'Card settlement',
				currency: 'USD',
				lines: [
					{ account_id: 'card-liability', debit_cents: 0, credit_cents: 1800 },
					{ account_id: 'cash', debit_cents: 1800, credit_cents: 0 }
				]
			}
		]
	};
	const correctSide = matchReconciliationStatement({
		...input,
		accountId: 'card-liability',
		normalSide: 'credit'
	});
	assert.equal(correctSide.lines[0].candidates[0].amount_cents, 1800);
	const wrongAccount = matchReconciliationStatement({ ...input, accountId: 'checking' });
	assert.equal(wrongAccount.lines[0].candidates.length, 0);
	const voidEntry = matchReconciliationStatement({
		...input,
		accountId: 'card-liability',
		normalSide: 'credit',
		ledgerRows: input.ledgerRows.map((entry) => ({ ...entry, status: 'void' }))
	});
	assert.equal(voidEntry.lines[0].candidates.length, 0);
});

test('AI description matching validates candidate IDs and leaves its proposal for human review', async () => {
	const input = {
		statementLines: [
			{
				line_id: 'statement-1',
				transaction_date: '2026-08-05',
				description: 'WEB*BIKE PARTS',
				amount_cents: -1200,
				currency: 'USD'
			}
		],
		feedRows: [
			{
				id: 'f1',
				transaction_date: '2026-08-05',
				description: 'SP BIKE SUPPLY',
				amount_cents: -1200,
				currency: 'USD'
			}
		]
	};
	const client = {
		async generateContent(request) {
			assert.equal(request.config.responseSchema.properties.matches.type, 'array');
			assert.equal(JSON.stringify(request.contents).includes('f1'), false);
			return {
				text: JSON.stringify({
					matches: [
						{
							line_id: 'line-1',
							candidate_source: 'feed',
							candidate_id: 'candidate-1',
							confidence: 0.9,
							reason: 'The merchant abbreviations describe a bike parts seller.',
							needs_review: false
						}
					]
				})
			};
		}
	};
	const result = await matchReconciliationStatementWithAi(input, {
		client,
		model: { provider: 'openai', model: OPENAI_GPT_6_LUNA_MODEL }
	});
	assert.equal(result.lines[0].suggested_match.id, 'f1');
	assert.equal(result.lines[0].suggested_match.ai_assisted, true);
	assert.equal(result.lines[0].needs_review, true);
});

test('pending provider rows cannot become match suggestions, even through AI description matching', async () => {
	let aiCalled = false;
	const result = await matchReconciliationStatementWithAi(
		{
			statementLines: [
				{
					line_id: 'statement-1',
					transaction_date: '2026-08-05',
					description: 'Member dues',
					amount_cents: 2500,
					currency: 'USD'
				}
			],
			feedRows: [
				{
					id: 'f-pending',
					transaction_date: '2026-08-05',
					description: 'Member dues',
					amount_cents: 2500,
					currency: 'USD',
					status: 'needs_review',
					provider_status: 'pending'
				}
			]
		},
		{
			client: {
				async generateContent() {
					aiCalled = true;
					return { text: JSON.stringify({ matches: [] }) };
				}
			},
			model: { provider: 'openai', model: OPENAI_GPT_6_LUNA_MODEL }
		}
	);
	assert.equal(aiCalled, false);
	assert.equal(result.lines[0].suggested_match, null);
	assert.equal(result.lines[0].needs_review, true);
});

test('resolution suggestions classify pending feed rows, missing ledger entries, timing, and fees', () => {
	const statementLines = [
		{
			line_id: 'pending',
			transaction_date: '2026-08-05',
			description: 'Member dues',
			amount_cents: 2500,
			currency: 'USD'
		},
		{
			line_id: 'fee',
			transaction_date: '2026-08-06',
			description: 'Monthly service fee',
			amount_cents: -500,
			currency: 'USD'
		},
		{
			line_id: 'late',
			transaction_date: '2026-08-10',
			description: 'Ride supplies',
			amount_cents: -3000,
			currency: 'USD'
		}
	];
	const result = suggestReconciliationResolutions({
		statementLines,
		feedRows: [
			{
				id: 'f1',
				transaction_date: '2026-08-05',
				description: 'Member dues',
				amount_cents: 2500,
				currency: 'USD',
				status: 'needs_review',
				provider_status: 'pending'
			},
			{
				id: 'f2',
				transaction_date: '2026-07-20',
				description: 'Ride supplies',
				amount_cents: -3000,
				currency: 'USD',
				status: 'posted'
			}
		],
		ledgerRows: []
	});
	assert.deepEqual(
		result.suggestions.map((suggestion) => suggestion.kind),
		['unposted_feed_item', 'possible_bank_fee_or_interest', 'timing_difference']
	);
	assert.equal(result.summary.total, 3);
	assert.equal(
		result.suggestions.every((suggestion) => suggestion.suggested_action),
		true
	);
});
