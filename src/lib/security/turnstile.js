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

export async function renderTurnstile(element, options = {}) {
	if (!element) return null;
	const turnstile = await loadTurnstile();
	if (!turnstile) return null;
	return turnstile.render(element, options);
}

export function executeTurnstile(widgetId, options = {}) {
	if (typeof window === 'undefined') return Promise.resolve(null);
	if (!window.turnstile || widgetId == null) return Promise.resolve(null);
	return new Promise((resolve) => {
		window.turnstile.execute(widgetId, {
			...options,
			callback(token) {
				options?.callback?.(token);
				resolve(token);
			},
			'error-callback': () => {
				options?.['error-callback']?.();
				resolve(null);
			},
			'expired-callback': () => {
				options?.['expired-callback']?.();
				resolve(null);
			}
		});
	});
}

export function resetTurnstile(widgetId) {
	if (typeof window === 'undefined') return;
	if (!window.turnstile || widgetId == null) return;
	window.turnstile.reset(widgetId);
}
