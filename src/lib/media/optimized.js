const OPTIMIZABLE_HOSTS = [
	(hostname) => hostname === 's3.amazonaws.com' || hostname.endsWith('.amazonaws.com'),
	(hostname) => hostname === 'supabase.co' || hostname.endsWith('.supabase.co'),
	(hostname) => hostname === 'clubexpress.com' || hostname.endsWith('.clubexpress.com'),
	(hostname) => hostname === 'pmbcaz.org' || hostname.endsWith('.pmbcaz.org'),
	(hostname) => hostname === 'wsimg.com' || hostname.endsWith('.wsimg.com'),
	(hostname) => hostname === 'smugmug.com' || hostname.endsWith('.smugmug.com'),
	(hostname) => hostname === 'phoenixbikes.org' || hostname.endsWith('.phoenixbikes.org'),
	(hostname) => hostname === 'wp.com' || hostname.endsWith('.wp.com'),
	(hostname) => hostname === 'squarespace-cdn.com' || hostname.endsWith('.squarespace-cdn.com'),
	(hostname) => hostname === 'cdninstagram.com' || hostname.endsWith('.cdninstagram.com'),
	(hostname) => hostname === 'files.cdn.printful.com' || hostname.endsWith('.cdn.printful.com')
];

export function isOptimizableImageHost(source) {
	try {
		const hostname = new URL(source).hostname.toLowerCase();
		return OPTIMIZABLE_HOSTS.some((matches) => matches(hostname));
	} catch {
		return false;
	}
}

export function optimizedImageUrl(source, options = {}) {
	const value = String(source || '').trim();
	if (!value || !/^https?:\/\//i.test(value)) return value;
	if (!isOptimizableImageHost(value)) return value.replace(/^http:\/\//i, 'https://');

	const width = Math.min(1600, Math.max(32, Math.round(Number(options.width) || 768)));
	const height = options.height
		? Math.min(1600, Math.max(32, Math.round(Number(options.height) || width)))
		: 0;
	const quality = Math.min(90, Math.max(40, Math.round(Number(options.quality) || 68)));
	const params = new URLSearchParams({
		src: value,
		width: String(width),
		quality: String(quality)
	});
	if (height) params.set('height', String(height));
	return `/api/media/image?${params.toString()}`;
}

export function watchImageError(node, options) {
	let current = options;
	let reportedSrc = '';

	function applyFallback() {
		if (!current) return;
		const currentSrc = node.currentSrc || node.src || '';
		if (currentSrc && currentSrc === reportedSrc) return;
		reportedSrc = currentSrc;

		if (typeof current === 'function') {
			current(node);
			return;
		}
		const fallbackSrc = typeof current === 'string' ? current : current.fallbackSrc;
		if (fallbackSrc && !node.dataset?.fallback) {
			if (node.dataset) node.dataset.fallback = '1';
			node.src = fallbackSrc;
		}
		if (typeof current === 'object' && typeof current.onError === 'function') {
			current.onError(node);
		}
	}

	function checkBroken() {
		const hasSrc =
			!('src' in node) || Boolean(node.currentSrc || node.src || node.getAttribute?.('src'));
		if (hasSrc && node.complete && node.naturalWidth === 0) {
			applyFallback();
		}
	}

	function handleError() {
		applyFallback();
	}

	node.addEventListener?.('error', handleError);
	checkBroken();

	return {
		update(nextOptions) {
			current = nextOptions;
			checkBroken();
		},
		destroy() {
			node.removeEventListener?.('error', handleError);
		}
	};
}
