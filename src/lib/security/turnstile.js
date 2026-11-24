export const TURNSTILE_TIMEOUT_MS = 120_000;
export const TURNSTILE_FAILURE_MESSAGE = 'Verification failed. Please try again.';

let loadPromise;

function appendScript() {
	return new Promise((resolve, reject) => {
		if (typeof document === 'undefined') {
			resolve(null);
			return;
		}
		const existing = document.querySelector('script[data-turnstile]');
		if (existing) {
			if (window.turnstile) {
				resolve(window.turnstile);
				return;
			}
			existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
			existing.addEventListener('error', (event) => reject(event), { once: true });
			return;
		}
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		script.async = true;
		script.defer = true;
		script.dataset.turnstile = 'true';
		script.onload = () => resolve(window.turnstile);
		script.onerror = (event) => reject(event);
		document.head.appendChild(script);
	});
}

export async function loadTurnstile() {
	if (typeof window === 'undefined') return null;
	if (window.turnstile) return window.turnstile;
	if (!loadPromise) {
		loadPromise = appendScript().catch((error) => {
			console.error('Failed to load Cloudflare Turnstile:', error);
			loadPromise = undefined;
			return null;
		});
	}
	return loadPromise;
}

/**
 * @param {any} element
 * @param {string} sitekey
 * @param {Record<string, any>} [options]
 */
export async function requestTurnstileToken(
	element,
	sitekey,
	{
		timeoutMs = TURNSTILE_TIMEOUT_MS,
		signal,
		onBeforeInteractive,
		onAfterInteractive,
		loadTurnstileImpl = loadTurnstile
	} = {}
) {
	if (!sitekey || signal?.aborted || !element?.isConnected) return null;
	const turnstile = await loadTurnstileImpl();
	if (!turnstile || signal?.aborted || !element?.isConnected) return null;

	let widgetId;
	let timeout;
	let abortHandler;
	try {
		return await new Promise((resolve) => {
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				resolve(value);
			};

			if (signal) {
				if (signal.aborted) {
					finish(null);
					return;
				}
				abortHandler = () => finish(null);
				signal.addEventListener('abort', abortHandler, { once: true });
			}

			timeout = setTimeout(() => finish(null), timeoutMs);

			try {
				widgetId = turnstile.render(element, {
					sitekey,
					size: 'flexible',
					execution: 'execute',
					appearance: 'interaction-only',
					retry: 'never',
					callback: (token) => finish(typeof token === 'string' && token ? token : null),
					'before-interactive-callback': () => {
						onBeforeInteractive?.();
					},
					'after-interactive-callback': () => {
						onAfterInteractive?.();
					},
					'error-callback': () => {
						finish(null);
						return true;
					},
					'expired-callback': () => finish(null),
					'timeout-callback': () => finish(null),
					'unsupported-callback': () => finish(null)
				});
				if (widgetId == null) {
					finish(null);
					return;
				}
				turnstile.execute(widgetId);
			} catch (error) {
				console.error('Failed to execute Cloudflare Turnstile:', error);
				finish(null);
			}
		});
	} finally {
		clearTimeout(timeout);
		if (signal && abortHandler) {
			signal.removeEventListener('abort', abortHandler);
		}
		if (widgetId != null) {
			try {
				turnstile.remove(widgetId);
			} catch {
				// Ignore cleanup errors if widget container was already detached.
			}
		}
	}
}

/**
 * @param {Record<string, any>} [options]
 */
export function createTurnstileGate({
	isEnabled = () => true,
	getSiteKey = () => '',
	prepareElement = async () => null,
	requestTokenImpl = requestTurnstileToken,
	timeoutMs = TURNSTILE_TIMEOUT_MS,
	getTimeoutMs,
	getFailureMessage = () => TURNSTILE_FAILURE_MESSAGE,
	onStateChange = () => {}
} = {}) {
	let verifying = false;
	let submitting = false;
	let interactive = false;
	let error = '';
	/** @type {AbortController | null} */
	let activeAbortController = null;

	function sync() {
		onStateChange({
			verifying,
			submitting,
			busy: verifying || submitting,
			interactive,
			error
		});
	}

	function clearError() {
		if (!error) return;
		error = '';
		sync();
	}

	function abort() {
		if (activeAbortController) {
			activeAbortController.abort();
			activeAbortController = null;
		}
		if (verifying || interactive) {
			verifying = false;
			interactive = false;
			sync();
		}
	}

	async function verifyInternal() {
		const sitekey = getSiteKey();
		if (!isEnabled() || !sitekey) {
			return { ok: true, token: '', bypassed: true };
		}

		const abortController = new AbortController();
		activeAbortController = abortController;
		verifying = true;
		interactive = false;
		sync();

		try {
			const element = await prepareElement();
			if (abortController.signal.aborted) {
				return { ok: false, token: '', aborted: true };
			}
			const token = await requestTokenImpl(element, sitekey, {
				timeoutMs: getTimeoutMs ? getTimeoutMs() : timeoutMs,
				signal: abortController.signal,
				onBeforeInteractive: () => {
					if (activeAbortController !== abortController) return;
					interactive = true;
					sync();
				},
				onAfterInteractive: () => {
					if (activeAbortController !== abortController) return;
					interactive = false;
					sync();
				}
			});
			if (abortController.signal.aborted) {
				return { ok: false, token: '', aborted: true };
			}
			if (!token) {
				error = getFailureMessage() || TURNSTILE_FAILURE_MESSAGE;
				return { ok: false, token: '' };
			}
			return { ok: true, token };
		} finally {
			if (activeAbortController === abortController) {
				activeAbortController = null;
			}
			verifying = false;
			interactive = false;
			sync();
		}
	}

	async function requestToken() {
		if (verifying || submitting) {
			return { ok: false, token: '', duplicate: true };
		}
		clearError();
		return verifyInternal();
	}

	/**
	 * @param {{ validate?: () => any, onSubmit?: (token: string) => any }} [options]
	 */
	async function submit({ validate, onSubmit } = {}) {
		if (verifying || submitting) {
			return { ok: false, duplicate: true };
		}
		clearError();
		if (validate) {
			const valid = await validate();
			if (valid === false) {
				return { ok: false, invalid: true };
			}
		}

		const verification = await verifyInternal();
		if (!verification.ok) {
			return verification;
		}

		submitting = true;
		sync();
		try {
			await onSubmit?.(verification.token);
			return { ok: true, token: verification.token };
		} finally {
			submitting = false;
			sync();
		}
	}

	/**
	 * @param {{ validate?: (input: any) => any, fieldName?: string, onResult?: (input: any) => any }} [options]
	 */
	function enhance({ validate, fieldName = 'turnstileToken', onResult } = {}) {
		return async (submitInput) => {
			const { formData, cancel } = submitInput;
			if (verifying || submitting) {
				cancel();
				return;
			}
			clearError();
			if (validate) {
				const valid = await validate(submitInput);
				if (valid === false) {
					cancel();
					return;
				}
			}

			const verification = await verifyInternal();
			if (!verification.ok) {
				cancel();
				return;
			}

			if (fieldName) {
				formData.set(fieldName, verification.token);
			}

			submitting = true;
			sync();

			return async (resultInput) => {
				try {
					if (onResult) {
						await onResult(resultInput);
					} else {
						await resultInput.update({ reset: false });
					}
				} finally {
					submitting = false;
					sync();
				}
			};
		};
	}

	return {
		get state() {
			return {
				verifying,
				submitting,
				busy: verifying || submitting,
				interactive,
				error
			};
		},
		clearError,
		abort,
		requestToken,
		submit,
		enhance
	};
}
