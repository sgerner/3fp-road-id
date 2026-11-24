import assert from 'node:assert/strict';
import test from 'node:test';
import * as turnstileModule from './turnstile.js';
import {
	TURNSTILE_FAILURE_MESSAGE,
	TURNSTILE_TIMEOUT_MS,
	createTurnstileGate,
	requestTurnstileToken
} from './turnstile.js';

const TURNSTILE_TEST_SITEKEYS = {
	pass: '1x00000000000000000000AA',
	fail: '2x00000000000000000000AB',
	interactive: '3x00000000000000000000FF'
};

function createFakeCloudflareTurnstile() {
	let nextWidgetId = 1;
	const widgets = new Map();
	const events = [];

	const api = {
		events,
		widgets,
		loadCount: 0,
		render(element, options) {
			const id = `widget-${nextWidgetId++}`;
			widgets.set(id, { element, options, executed: false, removed: false });
			events.push({ type: 'render', id, sitekey: options.sitekey, options });
			return id;
		},
		execute(id) {
			const widget = widgets.get(id);
			assert.ok(widget, `Expected widget ${id} to exist when executed`);
			widget.executed = true;
			events.push({ type: 'execute', id, sitekey: widget.options.sitekey });

			const { sitekey } = widget.options;
			if (sitekey === TURNSTILE_TEST_SITEKEYS.pass) {
				queueMicrotask(() => {
					if (!widgets.has(id)) return;
					widget.options.callback?.(`XXXX.DUMMY.TOKEN.${id}`);
				});
				return;
			}
			if (sitekey === TURNSTILE_TEST_SITEKEYS.fail) {
				queueMicrotask(() => {
					if (!widgets.has(id)) return;
					widget.options['error-callback']?.('600010');
				});
				return;
			}
			if (sitekey === TURNSTILE_TEST_SITEKEYS.interactive) {
				queueMicrotask(() => {
					if (!widgets.has(id)) return;
					widget.options['before-interactive-callback']?.();
				});
			}
		},
		completeInteractive(id, token = `XXXX.INTERACTIVE.TOKEN.${id}`) {
			const widget = widgets.get(id);
			assert.ok(widget, `Expected interactive widget ${id} to still be mounted`);
			widget.options['after-interactive-callback']?.();
			widget.options.callback?.(token);
		},
		remove(id) {
			const widget = widgets.get(id);
			if (widget) {
				widget.removed = true;
				widgets.delete(id);
			}
			events.push({ type: 'remove', id });
		}
	};

	const loadTurnstileImpl = async () => {
		api.loadCount += 1;
		return api;
	};

	return { api, loadTurnstileImpl };
}

test('retires legacy eager-mount helpers and enforces a 120-second default timeout', () => {
	assert.equal(TURNSTILE_TIMEOUT_MS, 120_000);
	assert.equal('renderTurnstile' in turnstileModule, false);
	assert.equal('executeTurnstile' in turnstileModule, false);
	assert.equal('resetTurnstile' in turnstileModule, false);
});

test('asynchronous request flows issue fresh tokens, show interactive prompts, and recover from failures with Cloudflare test sitekeys', async () => {
	const { api, loadTurnstileImpl } = createFakeCloudflareTurnstile();
	const slotElement = { isConnected: true };
	let currentSitekey = TURNSTILE_TEST_SITEKEYS.fail;
	const stateSnapshots = [];

	const gate = createTurnstileGate({
		isEnabled: () => true,
		getSiteKey: () => currentSitekey,
		prepareElement: async () => slotElement,
		requestTokenImpl: (el, key, opts) =>
			requestTurnstileToken(el, key, { ...opts, loadTurnstileImpl }),
		onStateChange: (snapshot) => stateSnapshots.push({ ...snapshot })
	});

	// 1. Local validation / honeypot failures short-circuit before loading or mounting Turnstile.
	let sentPayloads = [];
	const invalidAttempt = await gate.submit({
		validate: () => false,
		onSubmit: async (token) => sentPayloads.push(token)
	});
	assert.equal(invalidAttempt.ok, false);
	assert.equal(invalidAttempt.invalid, true);
	assert.equal(api.loadCount, 0);
	assert.equal(api.events.length, 0);
	assert.equal(sentPayloads.length, 0);

	// 2. Fail test sitekey (2x00000000000000000000AB) cleans up widget and announces accessible failure.
	const failedAttempt = await gate.submit({
		validate: () => true,
		onSubmit: async (token) => sentPayloads.push(token)
	});
	assert.equal(failedAttempt.ok, false);
	assert.equal(gate.state.error, TURNSTILE_FAILURE_MESSAGE);
	assert.equal(gate.state.busy, false);
	assert.equal(api.widgets.size, 0);
	assert.equal(sentPayloads.length, 0);
	assert.equal(api.events[0].options.size, 'flexible');
	assert.equal(api.events[0].options.execution, 'execute');
	assert.equal(api.events[0].options.appearance, 'interaction-only');
	assert.equal(api.events[0].options.retry, 'never');

	// 3. Interactive test sitekey (3x00000000000000000000FF) surfaces interactive state, blocks concurrent submits, and cleans up on completion.
	currentSitekey = TURNSTILE_TEST_SITEKEYS.interactive;
	const interactivePromise = gate.submit({
		validate: () => true,
		onSubmit: async (token) => {
			sentPayloads.push(token);
		}
	});

	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(gate.state.verifying, true);
	assert.equal(gate.state.interactive, true);
	assert.equal(gate.state.error, '');
	assert.equal(api.widgets.size, 1);

	const duplicateAttempt = await gate.submit({
		validate: () => true,
		onSubmit: async (token) => sentPayloads.push(token)
	});
	assert.equal(duplicateAttempt.ok, false);
	assert.equal(duplicateAttempt.duplicate, true);

	const [activeWidgetId] = api.widgets.keys();
	api.completeInteractive(activeWidgetId);

	const interactiveResult = await interactivePromise;
	assert.equal(interactiveResult.ok, true);
	assert.match(interactiveResult.token, /^XXXX\.INTERACTIVE\.TOKEN\./);
	assert.equal(api.widgets.size, 0);
	assert.equal(gate.state.busy, false);
	assert.equal(gate.state.interactive, false);

	// 4. Pass test sitekey (1x00000000000000000000AA) issues a fresh distinct token per submit.
	currentSitekey = TURNSTILE_TEST_SITEKEYS.pass;
	const passOne = await gate.submit({
		validate: () => true,
		onSubmit: async (token) => sentPayloads.push(token)
	});
	const passTwo = await gate.submit({
		validate: () => true,
		onSubmit: async (token) => sentPayloads.push(token)
	});
	assert.equal(passOne.ok, true);
	assert.equal(passTwo.ok, true);
	assert.notEqual(passOne.token, passTwo.token);
	assert.equal(sentPayloads.length, 3);
	assert.equal(api.widgets.size, 0);
});

test('standard SvelteKit enhance form actions attach fresh tokens, cancel on failure, and block duplicate submits', async () => {
	const { api, loadTurnstileImpl } = createFakeCloudflareTurnstile();
	const slotElement = { isConnected: true };
	let currentSitekey = TURNSTILE_TEST_SITEKEYS.fail;

	const gate = createTurnstileGate({
		isEnabled: () => true,
		getSiteKey: () => currentSitekey,
		prepareElement: async () => slotElement,
		requestTokenImpl: (el, key, opts) =>
			requestTurnstileToken(el, key, { ...opts, loadTurnstileImpl })
	});

	const handler = gate.enhance({
		fieldName: 'turnstileToken',
		validate: ({ formData }) => Boolean(formData.get('opportunityIds'))
	});

	// Missing local required selection cancels before Turnstile executes.
	let cancelled = false;
	const missingRoleData = new FormData();
	const missingResult = await handler({
		formData: missingRoleData,
		cancel: () => {
			cancelled = true;
		}
	});
	assert.equal(cancelled, true);
	assert.equal(missingResult, undefined);
	assert.equal(api.loadCount, 0);

	// Fail test sitekey cancels submission and sets error.
	cancelled = false;
	const failFormData = new FormData();
	failFormData.set('opportunityIds', 'role-1');
	const failCallback = await handler({
		formData: failFormData,
		cancel: () => {
			cancelled = true;
		}
	});
	assert.equal(cancelled, true);
	assert.equal(failCallback, undefined);
	assert.equal(gate.state.error, TURNSTILE_FAILURE_MESSAGE);
	assert.equal(api.widgets.size, 0);

	// Pass test sitekey attaches token, blocks concurrent submit while action POST is in flight, then unlocks after update().
	currentSitekey = TURNSTILE_TEST_SITEKEYS.pass;
	cancelled = false;
	const validFormData = new FormData();
	validFormData.set('opportunityIds', 'role-1');
	const postSubmitCallback = await handler({
		formData: validFormData,
		cancel: () => {
			cancelled = true;
		}
	});
	assert.equal(cancelled, false);
	assert.equal(typeof postSubmitCallback, 'function');
	assert.match(String(validFormData.get('turnstileToken')), /^XXXX\.DUMMY\.TOKEN\./);
	assert.equal(gate.state.busy, true);

	let duplicateCancelled = false;
	await handler({
		formData: new FormData(),
		cancel: () => {
			duplicateCancelled = true;
		}
	});
	assert.equal(duplicateCancelled, true);

	let updatedWithReset = null;
	await postSubmitCallback({
		update: async (opts) => {
			updatedWithReset = opts?.reset;
		}
	});
	assert.equal(updatedWithReset, false);
	assert.equal(gate.state.busy, false);
});

test('timeout and disabled Turnstile environments clean up widgets and bypass challenges cleanly', async () => {
	// 1. Timeout resolves null, removes widget, and announces failure.
	const { api, loadTurnstileImpl } = createFakeCloudflareTurnstile();
	const slotElement = { isConnected: true };

	const timeoutGate = createTurnstileGate({
		isEnabled: () => true,
		getSiteKey: () => TURNSTILE_TEST_SITEKEYS.interactive,
		prepareElement: async () => slotElement,
		getTimeoutMs: () => 25,
		requestTokenImpl: (el, key, opts) =>
			requestTurnstileToken(el, key, { ...opts, loadTurnstileImpl })
	});

	const timedOut = await timeoutGate.requestToken();
	assert.equal(timedOut.ok, false);
	assert.equal(timeoutGate.state.error, TURNSTILE_FAILURE_MESSAGE);
	assert.equal(api.widgets.size, 0);

	// 2. Disabled Turnstile bypasses without loading Cloudflare script.
	const { api: disabledApi, loadTurnstileImpl: disabledLoad } = createFakeCloudflareTurnstile();
	const disabledGate = createTurnstileGate({
		isEnabled: () => false,
		getSiteKey: () => TURNSTILE_TEST_SITEKEYS.pass,
		prepareElement: async () => slotElement,
		requestTokenImpl: (el, key, opts) =>
			requestTurnstileToken(el, key, { ...opts, loadTurnstileImpl: disabledLoad })
	});

	let submittedToken = null;
	const bypassed = await disabledGate.submit({
		validate: () => true,
		onSubmit: async (token) => {
			submittedToken = token;
		}
	});
	assert.equal(bypassed.ok, true);
	assert.equal(submittedToken, '');
	assert.equal(disabledApi.loadCount, 0);
});
