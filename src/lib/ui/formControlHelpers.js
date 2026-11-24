export function clampNumber(value, min, max) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return min;
	return Math.min(max, Math.max(min, numeric));
}

export function reorderListItem(items, fromIndex, toIndex) {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (fromIndex < 0 || fromIndex >= items.length) return [...items];
	const clampedTarget = Math.min(items.length - 1, Math.max(0, Math.trunc(Number(toIndex) || 0)));
	if (clampedTarget === fromIndex) return [...items];
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	next.splice(clampedTarget, 0, moved);
	return next;
}

/**
 * @param {any[]} articles
 * @param {any[]} subcategories
 * @param {{ articleId?: any; targetSubcategorySlug?: any; targetIndex?: number }} [options]
 */
export function reassignAndOrderLearnArticles(
	articles,
	subcategories,
	{ articleId = undefined, targetSubcategorySlug = undefined, targetIndex = undefined } = {}
) {
	const safeArticles = Array.isArray(articles) ? articles : [];
	const safeSubcategories = Array.isArray(subcategories) ? subcategories : [];

	const orderedGroupIds = ['uncategorized', ...safeSubcategories.map((sub) => sub.slug)];
	/** @type {Map<string, any[]>} */
	const groupMap = new Map(orderedGroupIds.map((groupId) => [groupId, []]));

	for (const article of safeArticles) {
		const groupId = article.subcategory_slug || 'uncategorized';
		if (!groupMap.has(groupId)) {
			groupMap.set(groupId, []);
			orderedGroupIds.push(groupId);
		}
		groupMap.get(groupId)?.push({ ...article });
	}

	let sourceGroupId = null;
	let sourceIndex = -1;
	for (const groupId of orderedGroupIds) {
		const list = groupMap.get(groupId) || [];
		const idx = list.findIndex((item) => item.id === articleId);
		if (idx !== -1) {
			sourceGroupId = groupId;
			sourceIndex = idx;
			break;
		}
	}

	if (sourceGroupId === null || sourceIndex === -1) {
		const unchanged = orderedGroupIds.flatMap((groupId) => {
			const slug = groupId === 'uncategorized' ? null : groupId;
			return (groupMap.get(groupId) || []).map((item, idx) => ({
				...item,
				subcategory_slug: slug,
				sort_order: idx
			}));
		});
		return {
			articles: unchanged,
			payload: unchanged.map((item) => ({
				id: item.id,
				sort_order: item.sort_order,
				subcategory_slug: item.subcategory_slug
			})),
			movedArticle: null,
			position: 1,
			sectionCount: 0,
			sectionSlug: null
		};
	}

	const nextSlug =
		targetSubcategorySlug === undefined
			? sourceGroupId === 'uncategorized'
				? null
				: sourceGroupId
			: targetSubcategorySlug
				? String(targetSubcategorySlug).trim()
				: null;
	const destGroupId = nextSlug || 'uncategorized';
	if (!groupMap.has(destGroupId)) {
		groupMap.set(destGroupId, []);
		orderedGroupIds.push(destGroupId);
	}

	let finalIndex = sourceIndex;
	if (destGroupId === sourceGroupId) {
		const currentList = groupMap.get(sourceGroupId) || [];
		const desiredIndex = targetIndex === undefined ? sourceIndex : targetIndex;
		const reordered = reorderListItem(currentList, sourceIndex, desiredIndex);
		finalIndex = Math.min(
			Math.max(0, Math.trunc(Number(desiredIndex) || 0)),
			Math.max(0, reordered.length - 1)
		);
		groupMap.set(sourceGroupId, reordered);
	} else {
		const sourceList = [...(groupMap.get(sourceGroupId) || [])];
		const [moved] = sourceList.splice(sourceIndex, 1);
		groupMap.set(sourceGroupId, sourceList);

		const destList = [...(groupMap.get(destGroupId) || [])];
		const insertAt =
			targetIndex === undefined
				? destList.length
				: Math.min(destList.length, Math.max(0, Math.trunc(Number(targetIndex) || 0)));
		destList.splice(insertAt, 0, { ...moved, subcategory_slug: nextSlug });
		finalIndex = insertAt;
		groupMap.set(destGroupId, destList);
	}

	const nextArticles = orderedGroupIds.flatMap((groupId) => {
		const slug = groupId === 'uncategorized' ? null : groupId;
		return (groupMap.get(groupId) || []).map((item, idx) => ({
			...item,
			subcategory_slug: slug,
			sort_order: idx
		}));
	});

	const destList = groupMap.get(destGroupId) || [];
	const movedArticle = nextArticles.find((item) => item.id === articleId) || null;

	return {
		articles: nextArticles,
		payload: nextArticles.map((item) => ({
			id: item.id,
			sort_order: item.sort_order,
			subcategory_slug: item.subcategory_slug
		})),
		movedArticle,
		position: finalIndex + 1,
		sectionCount: destList.length,
		sectionSlug: nextSlug
	};
}

export const DEFAULT_DISPLAY_GROUPS_BY_KIND = {
	asset: ['Where money lives', 'Other'],
	income: ['Money in', 'Other'],
	expense: ['Money out', 'Other'],
	liability: ['What we owe', 'Other'],
	equity: ['Group balance', 'Other']
};

export function buildAccountingBucketOptions(kind, existingGroups = [], currentGroup = '') {
	const seen = new Set();
	const options = [];
	const pushOption = (raw) => {
		const label = String(raw || '').trim();
		if (!label || seen.has(label)) return;
		seen.add(label);
		options.push(label);
	};

	pushOption(currentGroup);
	for (const group of Array.isArray(existingGroups) ? existingGroups : []) {
		pushOption(typeof group === 'string' ? group : group?.displayGroup);
	}
	for (const fallback of DEFAULT_DISPLAY_GROUPS_BY_KIND[kind] || ['Other']) {
		pushOption(fallback);
	}
	return options;
}

export const IMAGE_FRAME_PRESETS = [
	{ id: 'top-left', label: 'Top left', panX: -100, panY: -100 },
	{ id: 'top', label: 'Top', panX: 0, panY: -100 },
	{ id: 'top-right', label: 'Top right', panX: 100, panY: -100 },
	{ id: 'left', label: 'Left', panX: -100, panY: 0 },
	{ id: 'center', label: 'Center', panX: 0, panY: 0 },
	{ id: 'right', label: 'Right', panX: 100, panY: 0 },
	{ id: 'bottom-left', label: 'Bottom left', panX: -100, panY: 100 },
	{ id: 'bottom', label: 'Bottom', panX: 0, panY: 100 },
	{ id: 'bottom-right', label: 'Bottom right', panX: 100, panY: 100 }
];

export function getImageOutputDimensions(target) {
	if (target === 'logo') {
		return {
			width: 800,
			height: 800,
			aspectRatio: 1,
			aspectCss: '1 / 1',
			label: '1:1'
		};
	}
	return {
		width: 1600,
		height: 900,
		aspectRatio: 16 / 9,
		aspectCss: '16 / 9',
		label: '16:9'
	};
}

export function computeBoundedImageFrame({
	naturalWidth,
	naturalHeight,
	frameWidth,
	frameHeight,
	zoom = 1,
	panX = 0,
	panY = 0,
	minZoom = 1,
	maxZoom = 3
}) {
	const clampedZoom = clampNumber(zoom, minZoom, maxZoom);
	const clampedPanX = clampNumber(panX, -100, 100);
	const clampedPanY = clampNumber(panY, -100, 100);

	if (
		!Number.isFinite(naturalWidth) ||
		!Number.isFinite(naturalHeight) ||
		!Number.isFinite(frameWidth) ||
		!Number.isFinite(frameHeight) ||
		naturalWidth <= 0 ||
		naturalHeight <= 0 ||
		frameWidth <= 0 ||
		frameHeight <= 0
	) {
		return {
			zoom: clampedZoom,
			panX: clampedPanX,
			panY: clampedPanY,
			baseScale: 1,
			scale: clampedZoom,
			drawWidth: frameWidth || 0,
			drawHeight: frameHeight || 0,
			drawX: 0,
			drawY: 0,
			maxOffsetX: 0,
			maxOffsetY: 0,
			widthPercent: 100 * clampedZoom,
			heightPercent: 100 * clampedZoom,
			leftPercent: (1 - clampedZoom) * 50,
			topPercent: (1 - clampedZoom) * 50
		};
	}

	const baseScale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
	const scale = baseScale * clampedZoom;
	const drawWidth = naturalWidth * scale;
	const drawHeight = naturalHeight * scale;
	const maxOffsetX = Math.max(0, (drawWidth - frameWidth) / 2);
	const maxOffsetY = Math.max(0, (drawHeight - frameHeight) / 2);
	const offsetX = -(clampedPanX / 100) * maxOffsetX;
	const offsetY = -(clampedPanY / 100) * maxOffsetY;
	const drawX = (frameWidth - drawWidth) / 2 + offsetX;
	const drawY = (frameHeight - drawHeight) / 2 + offsetY;

	return {
		zoom: clampedZoom,
		panX: clampedPanX,
		panY: clampedPanY,
		baseScale,
		scale,
		drawWidth,
		drawHeight,
		drawX,
		drawY,
		maxOffsetX,
		maxOffsetY,
		widthPercent: (drawWidth / frameWidth) * 100,
		heightPercent: (drawHeight / frameHeight) * 100,
		leftPercent: (drawX / frameWidth) * 100,
		topPercent: (drawY / frameHeight) * 100
	};
}
