function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim().toLowerCase();
}

export function getPlatformComposeConstraints(platform) {
	const key = cleanText(platform);
	if (key === 'instagram') {
		return {
			requiresMedia: true,
			maxCaptionLength: 2200,
			notes: ['Instagram personal accounts are not supported in this v1 implementation.']
		};
	}
	if (key === 'facebook') {
		return {
			requiresMedia: false,
			maxCaptionLength: 4000,
			notes: []
		};
	}
	return {
		requiresMedia: false,
		maxCaptionLength: 4000,
		notes: []
	};
}

export function validatePlatformPostPayload(platform, { caption = '', media = [] } = {}) {
	const constraints = getPlatformComposeConstraints(platform);
	const errors = [];
	if (constraints.requiresMedia && (!Array.isArray(media) || media.length === 0)) {
		errors.push('This platform requires at least one media item for publishing.');
	}
	if (typeof caption === 'string' && caption.length > constraints.maxCaptionLength) {
		errors.push(`Caption exceeds ${constraints.maxCaptionLength} characters for this platform.`);
	}
	return {
		ok: errors.length === 0,
		errors,
		constraints
	};
}
