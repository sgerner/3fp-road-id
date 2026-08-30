const OPTIMIZABLE_HOSTS = [
	(hostname) => hostname === 's3.amazonaws.com' || hostname.endsWith('.amazonaws.com'),
	(hostname) => hostname === 'supabase.co' || hostname.endsWith('.supabase.co'),
	(hostname) => hostname === 'clubexpress.com' || hostname.endsWith('.clubexpress.com'),
	(hostname) => hostname === 'pmbcaz.org' || hostname.endsWith('.pmbcaz.org'),
	(hostname) => hostname === 'wsimg.com' || hostname.endsWith('.wsimg.com'),
	(hostname) => hostname === 'smugmug.com' || hostname.endsWith('.smugmug.com'),
	(hostname) => hostname === 'phoenixbikes.org' || hostname.endsWith('.phoenixbikes.org'),
	(hostname) => hostname === 'wp.com' || hostname.endsWith('.wp.com'),
	(hostname) => hostname === 'squarespace-cdn.com' || hostname.endsWith('.squarespace-cdn.com')
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
	if (!value || !/^https?:\/\//i.test(value) || !isOptimizableImageHost(value)) return value;

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
