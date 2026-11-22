import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildClientGotoOptions,
	buildDeferredFormUpdateOptions,
	buildShallowQueryUrl,
	buildShallowReplaceGotoOptions,
	createClientNavigationHelpers,
	guardUnsavedNavigation,
	isNonShallowNavigation
} from '#lib/client/navigationCore.js';

test('SvelteKit 3 option builders emit non-deprecated option keys', () => {
	const formDefault = buildDeferredFormUpdateOptions();
	assert.deepEqual(formDefault, { reset: false, refreshAll: false });
	assert.equal('invalidateAll' in formDefault, false);

	const formReset = buildDeferredFormUpdateOptions({ reset: true });
	assert.deepEqual(formReset, { reset: true, refreshAll: false });

	const shallowOpts = buildShallowReplaceGotoOptions({ modal: 'compose' });
	assert.deepEqual(shallowOpts, {
		state: { modal: 'compose' },
		shallow: true,
		replace: true
	});
	assert.equal('replaceState' in shallowOpts, false);

	const gotoOpts = buildClientGotoOptions({ refreshAll: true, replace: true });
	assert.deepEqual(gotoOpts, { refreshAll: true, replace: true });
	assert.equal('invalidateAll' in gotoOpts, false);
	assert.equal('replaceState' in gotoOpts, false);
});

test('completeFormUpdate preserves update -> onSuccess -> refreshAll callback ordering and skips refresh on failure', async () => {
	const events = [];
	const helpers = createClientNavigationHelpers({
		goto: async () => {
			events.push('goto');
		},
		refreshAll: async () => {
			events.push('refreshAll');
		}
	});

	const didComplete = await helpers.completeFormUpdate(
		async (opts) => {
			events.push(['update', opts]);
		},
		{ type: 'success', data: { ok: true } },
		{
			onSuccess: async () => {
				events.push('onSuccess');
			}
		}
	);

	assert.equal(didComplete, true);
	assert.deepEqual(events, [
		['update', { reset: false, refreshAll: false }],
		'onSuccess',
		'refreshAll'
	]);

	events.length = 0;
	const failedResult = { type: 'success', data: { accounting_error: 'Unbalanced journal' } };
	const succeeded = failedResult.type === 'success' && !failedResult.data?.accounting_error;
	const didCompleteIdempotentFailure = await helpers.completeFormUpdate(
		async (opts) => {
			events.push(['update', opts]);
		},
		failedResult,
		{
			reset: succeeded,
			succeeded,
			onSuccess: () => {
				events.push('rotateRequestId');
			}
		}
	);

	assert.equal(didCompleteIdempotentFailure, false);
	assert.deepEqual(events, [['update', { reset: false, refreshAll: false }]]);

	events.length = 0;
	const didCompleteWithoutUpdateFn = await helpers.completeFormUpdate(
		null,
		{ type: 'success' },
		{
			reset: true,
			onSuccess: () => {
				events.push('rotated');
			}
		}
	);
	assert.equal(didCompleteWithoutUpdateFn, true);
	assert.deepEqual(events, ['rotated', 'refreshAll']);
});

test('replaceShallowQueryParam updates query parameters in place via shallow goto and no-ops without href', async () => {
	const calls = [];
	const helpers = createClientNavigationHelpers({
		goto: async (url, opts) => {
			calls.push({ url: url.toString(), opts });
		},
		refreshAll: async () => {},
		getHref: () => 'https://3fp.org/groups/tbag/manage/email?foo=1'
	});

	await helpers.replaceShallowQueryParam('view', 'review');
	assert.deepEqual(calls, [
		{
			url: 'https://3fp.org/groups/tbag/manage/email?foo=1&view=review',
			opts: { state: {}, shallow: true, replace: true }
		}
	]);

	const cleared = buildShallowQueryUrl(
		'https://3fp.org/groups/tbag/manage/site?view=appearance&editor=1',
		'view',
		null
	);
	assert.equal(cleared.toString(), 'https://3fp.org/groups/tbag/manage/site?editor=1');

	const ssrHelpers = createClientNavigationHelpers({
		goto: async () => {
			throw new Error('should not navigate without href');
		},
		refreshAll: async () => {},
		getHref: () => undefined
	});
	assert.equal(ssrHelpers.replaceShallowQueryParam('view', 'compose'), undefined);
});

test('guardUnsavedNavigation skips shallow tab updates and guards non-shallow exits', () => {
	let cancelled = false;
	let prompted = 0;

	const shallowBlocked = guardUnsavedNavigation(
		{
			shallow: true,
			cancel: () => {
				cancelled = true;
			}
		},
		{
			shouldWarn: true,
			message: 'Leave without saving your email draft?',
			confirmFn: () => {
				prompted += 1;
				return false;
			}
		}
	);
	assert.equal(shallowBlocked, false);
	assert.equal(cancelled, false);
	assert.equal(prompted, 0);
	assert.equal(isNonShallowNavigation({ shallow: true }), false);
	assert.equal(isNonShallowNavigation({ shallow: false }), true);

	const leaveDeclined = guardUnsavedNavigation(
		{
			shallow: false,
			cancel: () => {
				cancelled = true;
			}
		},
		{
			shouldWarn: true,
			message: 'Leave without publishing your website changes?',
			confirmFn: (msg) => {
				prompted += 1;
				assert.equal(msg, 'Leave without publishing your website changes?');
				return false;
			}
		}
	);
	assert.equal(leaveDeclined, true);
	assert.equal(cancelled, true);
	assert.equal(prompted, 1);

	cancelled = false;
	const leaveAccepted = guardUnsavedNavigation(
		{
			shallow: false,
			cancel: () => {
				cancelled = true;
			}
		},
		{
			shouldWarn: true,
			confirmFn: () => true
		}
	);
	assert.equal(leaveAccepted, false);
	assert.equal(cancelled, false);
});

test('post-mutation and location-replacement helpers map refreshAll and replace consistently', async () => {
	const calls = [];
	const helpers = createClientNavigationHelpers({
		goto: async (url, opts) => {
			calls.push({ url, opts });
		},
		refreshAll: async () => {
			calls.push({ refreshAll: true });
		}
	});

	await helpers.navigateAfterMutation('/ride/friday-social', { replace: false });
	await helpers.navigateAfterMutation('/ride/friday-social/manage');
	await helpers.replaceClientLocation('/groups/tbag/manage/edit');
	await helpers.refreshPageData();

	assert.deepEqual(calls, [
		{ url: '/ride/friday-social', opts: { refreshAll: true, replace: false } },
		{ url: '/ride/friday-social/manage', opts: { refreshAll: true, replace: true } },
		{ url: '/groups/tbag/manage/edit', opts: { refreshAll: false, replace: true } },
		{ refreshAll: true }
	]);
});
