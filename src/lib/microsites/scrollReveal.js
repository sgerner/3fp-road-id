const REVEAL_SELECTOR = [
	'[data-scroll-reveal]',
	".microsite-page > section:not([data-site-block-type='hero'])",
	'.microsite-page > footer',
	'.microsite-join-page > section',
	'.microsite-updates-page > section'
].join(', ');

const REVEAL_CLASS = 'microsite-scroll-reveal';
const REVEALED_CLASS = 'is-visible';

function getTargets(node) {
	return Array.from(node.querySelectorAll(REVEAL_SELECTOR));
}

/**
 * Reveals tenant-site content as it approaches the viewport.
 *
 * The action only adds the hidden state in the browser, so server-rendered
 * content remains fully usable if JavaScript is unavailable. It also reveals
 * immediately when reduced motion is requested or IntersectionObserver is
 * unavailable.
 *
 * @param {HTMLElement} node
 */
export function scrollReveal(node) {
	if (typeof window === 'undefined') return {};

	const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	const observedTargets = new Set();
	let observer = null;

	const reveal = (target) => {
		target.classList.add(REVEALED_CLASS);
		observer?.unobserve(target);
	};

	const revealAll = () => {
		for (const target of getTargets(node)) reveal(target);
	};

	const registerTargets = () => {
		const targets = getTargets(node);
		for (const [index, target] of targets.entries()) {
			if (observedTargets.has(target)) continue;

			observedTargets.add(target);
			target.classList.add(REVEAL_CLASS);
			target.style.setProperty('--microsite-reveal-delay', `${Math.min((index % 5) * 45, 180)}ms`);

			if (motionQuery.matches || !observer) {
				reveal(target);
			} else {
				observer.observe(target);
			}
		}
	};

	if ('IntersectionObserver' in window) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) reveal(entry.target);
				}
			},
			{ rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
		);
	}

	registerTargets();

	const mutationObserver =
		'MutationObserver' in window ? new MutationObserver(registerTargets) : null;
	mutationObserver?.observe(node, { childList: true, subtree: true });

	const handleMotionPreferenceChange = () => {
		if (motionQuery.matches) revealAll();
		else registerTargets();
	};

	if (typeof motionQuery.addEventListener === 'function') {
		motionQuery.addEventListener('change', handleMotionPreferenceChange);
	} else {
		motionQuery.addListener(handleMotionPreferenceChange);
	}

	return {
		destroy() {
			mutationObserver?.disconnect();
			observer?.disconnect();
			if (typeof motionQuery.removeEventListener === 'function') {
				motionQuery.removeEventListener('change', handleMotionPreferenceChange);
			} else {
				motionQuery.removeListener(handleMotionPreferenceChange);
			}
		}
	};
}
