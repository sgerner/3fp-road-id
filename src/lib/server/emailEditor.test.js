import assert from 'node:assert/strict';
import test from 'node:test';
import {
	cloneEmailBlocks,
	createDefaultEmailDraft,
	duplicateEmailBlock,
	getCampaignReadiness,
	MAX_EMAIL_BLOCKS,
	moveEmailBlock,
	newEmailBlock,
	renderCampaignHtml,
	renderCampaignText
} from '../groups/emailEditor.js';

test('email editor operations do not mutate blocks and preserve unique ids', () => {
	const source = [
		{ id: 'one', type: 'heading', text: 'Hello' },
		{ id: 'two', type: 'text', text: 'World' }
	];
	assert.deepEqual(
		moveEmailBlock(source, 0, 1).map((block) => block.id),
		['two', 'one']
	);
	const duplicated = duplicateEmailBlock(source, 'one');
	assert.equal(duplicated.length, 3);
	assert.notEqual(duplicated[1].id, 'one');
	assert.equal(source.length, 2);
	assert.ok(cloneEmailBlocks([{ type: 'text' }])[0].id.startsWith('email-text-'));
	assert.equal(
		newEmailBlock('button', 'https://example.com/group').url,
		'https://example.com/group'
	);
	assert.equal(newEmailBlock('button', 'not a url').url, 'https://3feetplease.org');
});

test('campaign rendering escapes content and drops unsafe URLs', () => {
	const draft = createDefaultEmailDraft({ name: '<script>bad</script>' });
	draft.blocks = [
		{ id: 'heading', type: 'heading', text: '<script>alert(1)</script>' },
		{ id: 'button', type: 'button', text: 'Click', url: 'javascript:alert(1)' }
	];
	const html = renderCampaignHtml({ draft, group: { name: '<b>Group</b>' } });
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /javascript:/);
	assert.match(html, /&lt;script&gt;/);
	assert.equal(renderCampaignText({ draft }), '<script>alert(1)</script>\n\nClick: ');
});

test('readiness separates blockers from editorial recommendations', () => {
	const draft = createDefaultEmailDraft({ name: 'Group', website_url: 'https://example.com' }, [
		{ id: 'sender', is_default: true, ses_verified_for_sending: true }
	]);
	draft.blocks.push({ id: 'bad', type: 'button', text: 'Bad', url: 'javascript:bad' });
	const checks = getCampaignReadiness({
		draft,
		senderDomains: [{ id: 'sender', ses_verified_for_sending: true }],
		audienceCount: 20
	});
	assert.deepEqual(
		checks.filter((check) => check.blocking && !check.ready).map((check) => check.key),
		['links']
	);
	assert.equal(checks.find((check) => check.key === 'cta').blocking, false);
});

test('readiness rejects incomplete URLs, oversized messages, and oversized audiences', () => {
	const draft = createDefaultEmailDraft({ name: 'Group', website_url: 'https://example.com' }, [
		{ id: 'sender', is_default: true, ses_verified_for_sending: true }
	]);
	draft.blocks = [
		...Array.from({ length: MAX_EMAIL_BLOCKS }, (_, index) => ({
			id: `text-${index}`,
			type: 'text',
			text: 'Useful update'
		})),
		{ id: 'incomplete', type: 'button', text: 'Read more', url: 'https://' }
	];
	const checks = getCampaignReadiness({
		draft,
		senderDomains: [{ id: 'sender', ses_verified_for_sending: true }],
		audienceCount: 2001,
		renderedHtmlLength: 50001
	});
	assert.deepEqual(
		checks.filter((check) => check.blocking && !check.ready).map((check) => check.key),
		['content', 'audience', 'links']
	);
});

test('readiness blocks images without an accessible description', () => {
	const draft = createDefaultEmailDraft({ name: 'Group', website_url: 'https://example.com' }, [
		{ id: 'sender', is_default: true, ses_verified_for_sending: true }
	]);
	draft.blocks = [{ id: 'image', type: 'image', url: 'https://example.com/ride.jpg', alt: '' }];
	const checks = getCampaignReadiness({
		draft,
		senderDomains: [{ id: 'sender', ses_verified_for_sending: true }],
		audienceCount: 10
	});
	assert.equal(checks.find((check) => check.key === 'alt').blocking, true);
	assert.equal(checks.find((check) => check.key === 'alt').ready, false);
});
