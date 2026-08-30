export const LAZY_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

/**
 * Defers non-critical image requests until they are close to the viewport.
 * Native lazy loading is still useful, but browsers intentionally fetch images
 * well before they are visible. This action keeps below-the-fold media from
 * competing with the first screen on image-heavy tenant pages.
 */
export function lazyImage(node) {
	const source = node.dataset.src;
	if (!source) return {};

	let loaded = false;
	let observer = null;

	function load() {
		if (loaded) return;
		loaded = true;
		node.src = source;
		node.removeAttribute('data-src');
		observer?.disconnect();
	}

	if ('IntersectionObserver' in window) {
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) load();
			},
			{ rootMargin: '200px 0px' }
		);
		observer.observe(node);
	} else {
		load();
	}

	return {
		destroy() {
			observer?.disconnect();
		}
	};
}
