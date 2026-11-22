const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;

const VALID_ARIA_ROLES = new Set([
	'alert',
	'alertdialog',
	'button',
	'checkbox',
	'dialog',
	'group',
	'listbox',
	'menu',
	'menubar',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'presentation',
	'progressbar',
	'radio',
	'radiogroup',
	'region',
	'separator',
	'slider',
	'switch',
	'tab',
	'tablist',
	'tabpanel',
	'textbox',
	'toolbar',
	'tooltip',
	'tree',
	'treeitem'
]);

const POPUP_CLASS_LABELS = [
	['toastui-editor-popup-add-heading', 'Headings'],
	['toastui-editor-popup-add-link', 'Insert link'],
	['toastui-editor-popup-add-image', 'Insert image'],
	['toastui-editor-popup-add-table', 'Insert table']
];

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'summary',
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])'
].join(', ');

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function isElement(node) {
	return Boolean(
		node &&
		typeof node === 'object' &&
		(node.nodeType === 1 || typeof node.getAttribute === 'function')
	);
}

function hasClass(el, className) {
	if (!isElement(el)) return false;
	if (el.classList && typeof el.classList.contains === 'function') {
		return el.classList.contains(className);
	}
	const rawClass = safeTrim(el.className || el.getAttribute?.('class'));
	return rawClass.split(/\s+/).includes(className);
}

function setAttributeIfChanged(el, name, value) {
	if (!isElement(el)) return;
	const next = String(value);
	if (el.getAttribute(name) !== next) {
		el.setAttribute(name, next);
	}
}

function removeAttributeIfPresent(el, name) {
	if (!isElement(el)) return;
	if (
		typeof el.hasAttribute === 'function' ? el.hasAttribute(name) : el.getAttribute(name) !== null
	) {
		el.removeAttribute(name);
	}
}

function closestElement(target, selector) {
	const start = isElement(target) ? target : (target?.parentElement ?? null);
	if (start && typeof start.closest === 'function') {
		return start.closest(selector);
	}
	return null;
}

function isInsideRoot(node, rootEl) {
	if (!isElement(node) || !isElement(rootEl)) return false;
	if (typeof rootEl.contains === 'function') {
		return rootEl.contains(node);
	}
	let current = node;
	while (current) {
		if (current === rootEl) return true;
		current = current.parentElement ?? current.parentNode ?? null;
	}
	return false;
}

function isElementDisplayed(el) {
	if (!isElement(el)) return false;
	if (el.hidden || el.getAttribute('hidden') !== null) return false;
	if (el.getAttribute('aria-hidden') === 'true') return false;

	let current = el;
	const view = el.ownerDocument?.defaultView;
	while (isElement(current)) {
		if (current.hidden || current.getAttribute?.('hidden') !== null) return false;
		const inlineDisplay = safeTrim(current.style?.display).toLowerCase();
		const inlineVisibility = safeTrim(current.style?.visibility).toLowerCase();
		if (inlineDisplay === 'none' || inlineVisibility === 'hidden') return false;
		if (view && typeof view.getComputedStyle === 'function') {
			const computed = view.getComputedStyle(current);
			if (computed.display === 'none' || computed.visibility === 'hidden') return false;
		}
		current = current.parentElement ?? null;
	}
	return true;
}

function isOverlayOpen(el) {
	if (!isElement(el)) return false;
	const inlineDisplay = safeTrim(el.style?.display).toLowerCase();
	if (inlineDisplay === 'none') return false;
	return isElementDisplayed(el);
}

function resolvePopupLabel(popupEl) {
	const popupBody = popupEl.querySelector?.('.toastui-editor-popup-body') ?? null;
	const firstBodyChild = popupBody?.firstElementChild ?? popupBody?.children?.[0] ?? null;

	if (isElement(firstBodyChild)) {
		const rawChildLabel = safeTrim(firstBodyChild.getAttribute('aria-label'));
		const tagName = safeTrim(firstBodyChild.tagName).toLowerCase();
		const childRole = safeTrim(firstBodyChild.getAttribute('role'));

		if (rawChildLabel) {
			if ((tagName === 'div' || tagName === 'span') && !childRole) {
				setAttributeIfChanged(firstBodyChild, 'data-popup-label', rawChildLabel);
				removeAttributeIfPresent(firstBodyChild, 'aria-label');
			}
			return rawChildLabel;
		}

		const storedLabel = safeTrim(firstBodyChild.getAttribute('data-popup-label'));
		if (storedLabel) {
			return storedLabel;
		}
	}

	for (const [className, label] of POPUP_CLASS_LABELS) {
		if (hasClass(popupEl, className)) {
			return label;
		}
	}

	const existing = safeTrim(popupEl.getAttribute('aria-label'));
	return existing || 'Editor dialog';
}

function canUseLabelledBy(rootEl, labelId) {
	if (!labelId) return false;
	const doc = rootEl.ownerDocument;
	const isConnected = rootEl.isConnected ?? Boolean(doc?.body?.contains?.(rootEl));
	if (isConnected && doc && typeof doc.getElementById === 'function') {
		return Boolean(doc.getElementById(labelId));
	}
	return true;
}

export function syncLearnEditorAccessibility(rootEl, options = {}) {
	if (!isElement(rootEl) || typeof rootEl.querySelectorAll !== 'function') return;

	const trimmedLabelId = safeTrim(options.labelId);
	const fallbackAriaLabel = safeTrim(options.ariaLabel) || 'Rich text editor';
	const useLabelledBy = canUseLabelledBy(rootEl, trimmedLabelId);

	for (const proseMirrorEl of rootEl.querySelectorAll('.ProseMirror')) {
		setAttributeIfChanged(proseMirrorEl, 'role', 'textbox');
		setAttributeIfChanged(proseMirrorEl, 'aria-multiline', 'true');
		if (useLabelledBy) {
			setAttributeIfChanged(proseMirrorEl, 'aria-labelledby', trimmedLabelId);
			removeAttributeIfPresent(proseMirrorEl, 'aria-label');
		} else {
			setAttributeIfChanged(proseMirrorEl, 'aria-label', fallbackAriaLabel);
			removeAttributeIfPresent(proseMirrorEl, 'aria-labelledby');
		}
	}

	for (const clipboardEl of rootEl.querySelectorAll('.toastui-editor-pseudo-clipboard')) {
		setAttributeIfChanged(clipboardEl, 'tabindex', '-1');
		setAttributeIfChanged(clipboardEl, 'aria-hidden', 'true');
	}

	for (const ariaRoleEl of rootEl.querySelectorAll('[aria-role]')) {
		const rawRole = safeTrim(ariaRoleEl.getAttribute('aria-role')).toLowerCase();
		removeAttributeIfPresent(ariaRoleEl, 'aria-role');

		let mappedRole = '';
		if (hasClass(ariaRoleEl, 'toastui-editor-tabs')) {
			mappedRole = 'tablist';
		} else if (hasClass(ariaRoleEl, 'tab-item')) {
			mappedRole = 'tab';
		} else if (hasClass(ariaRoleEl, 'toastui-editor-popup')) {
			mappedRole = 'dialog';
		} else if (VALID_ARIA_ROLES.has(rawRole)) {
			mappedRole = rawRole;
		}

		if (mappedRole) {
			setAttributeIfChanged(ariaRoleEl, 'role', mappedRole);
		}
	}

	for (const tabsEl of rootEl.querySelectorAll('.toastui-editor-tabs')) {
		setAttributeIfChanged(tabsEl, 'role', 'tablist');
		for (const tabItemEl of tabsEl.querySelectorAll('.tab-item')) {
			setAttributeIfChanged(tabItemEl, 'role', 'tab');
			const isActive = hasClass(tabItemEl, 'active');
			if (!safeTrim(tabItemEl.getAttribute('aria-selected'))) {
				setAttributeIfChanged(tabItemEl, 'aria-selected', isActive ? 'true' : 'false');
			}
			if (!safeTrim(tabItemEl.getAttribute('tabindex'))) {
				setAttributeIfChanged(tabItemEl, 'tabindex', isActive ? '0' : '-1');
			}
		}
	}

	for (const menuGroupEl of rootEl.querySelectorAll('.menu-group')) {
		setAttributeIfChanged(menuGroupEl, 'role', 'group');
	}

	for (const contextMenuEl of rootEl.querySelectorAll('.toastui-editor-context-menu')) {
		if (!safeTrim(contextMenuEl.getAttribute('role'))) {
			setAttributeIfChanged(contextMenuEl, 'role', 'menu');
		}
		if (
			!safeTrim(contextMenuEl.getAttribute('aria-label')) &&
			!safeTrim(contextMenuEl.getAttribute('aria-labelledby'))
		) {
			setAttributeIfChanged(contextMenuEl, 'aria-label', 'Context menu');
		}
	}

	for (const popupEl of rootEl.querySelectorAll('.toastui-editor-popup')) {
		setAttributeIfChanged(popupEl, 'role', 'dialog');
		if (!safeTrim(popupEl.getAttribute('aria-labelledby'))) {
			setAttributeIfChanged(popupEl, 'aria-label', resolvePopupLabel(popupEl));
		}
	}

	for (const moreEl of rootEl.querySelectorAll('button.more, .toastui-editor-toolbar .more')) {
		if (
			!safeTrim(moreEl.getAttribute('aria-label')) &&
			!safeTrim(moreEl.getAttribute('aria-labelledby')) &&
			!safeTrim(moreEl.textContent)
		) {
			setAttributeIfChanged(moreEl, 'aria-label', 'More');
		}
	}

	for (const checkboxEl of rootEl.querySelectorAll(
		'.scroll-sync input[type="checkbox"], input.scroll-sync[type="checkbox"]'
	)) {
		if (
			!safeTrim(checkboxEl.getAttribute('aria-label')) &&
			!safeTrim(checkboxEl.getAttribute('aria-labelledby'))
		) {
			setAttributeIfChanged(checkboxEl, 'aria-label', 'Scroll sync');
		}
	}
}

function isFocusableCandidate(el) {
	if (!isElement(el) || !isElementDisplayed(el)) return false;
	if (el.disabled || el.getAttribute('disabled') !== null) return false;
	const tabIndexAttr = safeTrim(el.getAttribute('tabindex'));
	if (tabIndexAttr && Number(tabIndexAttr) < 0) return false;
	if (typeof el.tabIndex === 'number' && el.tabIndex < 0 && !el.isContentEditable) return false;
	return typeof el.focus === 'function';
}

function findExitFocusTarget(rootEl) {
	const doc = rootEl.ownerDocument;
	if (!doc || typeof doc.querySelectorAll !== 'function') return null;

	const candidates = Array.from(doc.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
		(el) => !isInsideRoot(el, rootEl) && isFocusableCandidate(el)
	);
	if (!candidates.length) return null;

	if (typeof rootEl.compareDocumentPosition === 'function') {
		const following = candidates.find(
			(candidate) => (rootEl.compareDocumentPosition(candidate) & DOCUMENT_POSITION_FOLLOWING) !== 0
		);
		if (following) return following;

		const preceding = [...candidates]
			.reverse()
			.find(
				(candidate) =>
					(rootEl.compareDocumentPosition(candidate) & DOCUMENT_POSITION_PRECEDING) !== 0
			);
		if (preceding) return preceding;
	}

	const allElements = Array.from(doc.querySelectorAll('*'));
	const rootIndex = allElements.indexOf(rootEl);
	if (rootIndex !== -1) {
		const followingByOrder = candidates.find((el) => allElements.indexOf(el) > rootIndex);
		if (followingByOrder) return followingByOrder;
	}

	return candidates[0] ?? null;
}

/**
 * @param {any} rootEl
 * @param {Record<string, any>} [initialOptions]
 */
export function attachLearnEditorAccessibility(rootEl, initialOptions = {}) {
	if (!isElement(rootEl)) {
		const noop = () => {};
		noop.destroy = noop;
		noop.disconnect = noop;
		noop.sync = noop;
		return noop;
	}

	let currentOptions = { ...initialOptions };
	let isSyncing = false;
	let lastToolbarTrigger = null;

	const sync = (nextOptions) => {
		if (nextOptions && typeof nextOptions === 'object') {
			currentOptions = { ...currentOptions, ...nextOptions };
		}
		if (isSyncing) return;
		isSyncing = true;
		try {
			syncLearnEditorAccessibility(rootEl, currentOptions);
		} finally {
			isSyncing = false;
		}
	};

	sync();

	const ObserverCtor =
		currentOptions.MutationObserver ??
		rootEl.ownerDocument?.defaultView?.MutationObserver ??
		globalThis.MutationObserver ??
		null;

	let observer = null;
	if (typeof ObserverCtor === 'function') {
		observer = new ObserverCtor(() => {
			if (!isSyncing) {
				sync();
			}
		});
		observer.observe(rootEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-role', 'class', 'style']
		});
	}

	const handleClickCapture = (event) => {
		const toolbarBtn = closestElement(event?.target, '.toastui-editor-toolbar button');
		if (toolbarBtn && isInsideRoot(toolbarBtn, rootEl)) {
			lastToolbarTrigger = toolbarBtn;
		}
	};

	const closeOpenOverlays = (eventTarget) => {
		const openPopups = Array.from(rootEl.querySelectorAll('.toastui-editor-popup')).filter(
			isOverlayOpen
		);
		const openDropdowns = Array.from(
			rootEl.querySelectorAll('.toastui-editor-dropdown-toolbar')
		).filter(isOverlayOpen);
		const openMenus = Array.from(rootEl.querySelectorAll('.toastui-editor-context-menu')).filter(
			isOverlayOpen
		);

		if (!openPopups.length && !openDropdowns.length && !openMenus.length) {
			return false;
		}

		const doc = rootEl.ownerDocument;
		const activeEl = doc?.activeElement ?? eventTarget ?? null;
		const focusWasInDropdown = openDropdowns.some(
			(el) => isInsideRoot(activeEl, el) || isInsideRoot(eventTarget, el)
		);
		const focusWasInOverlay = [...openPopups, ...openDropdowns, ...openMenus].some(
			(el) => isInsideRoot(activeEl, el) || isInsideRoot(eventTarget, el)
		);

		if (openPopups.length) {
			currentOptions.editor?.eventEmitter?.emit?.('closePopup');
			for (const popupEl of openPopups) {
				if (isOverlayOpen(popupEl)) {
					const cancelBtn = popupEl.querySelector?.('.toastui-editor-close-button');
					cancelBtn?.click?.();
				}
				if (isOverlayOpen(popupEl) && popupEl.style) {
					popupEl.style.display = 'none';
				}
			}
		}

		if (openDropdowns.length || openMenus.length) {
			const EventCtor =
				doc?.defaultView?.MouseEvent ?? globalThis.MouseEvent ?? globalThis.Event ?? null;
			const clickTarget = doc?.body ?? rootEl;
			if (typeof EventCtor === 'function' && typeof clickTarget?.dispatchEvent === 'function') {
				clickTarget.dispatchEvent(new EventCtor('click', { bubbles: true }));
			}
			for (const overlayEl of [...openDropdowns, ...openMenus]) {
				if (isOverlayOpen(overlayEl) && overlayEl.style) {
					overlayEl.style.display = 'none';
				}
			}
		}

		if (focusWasInOverlay) {
			const moreBtn = focusWasInDropdown
				? rootEl.querySelector('button.more, .toastui-editor-toolbar .more')
				: null;
			if (moreBtn && isFocusableCandidate(moreBtn)) {
				moreBtn.focus();
			} else if (lastToolbarTrigger && isFocusableCandidate(lastToolbarTrigger)) {
				lastToolbarTrigger.focus();
			} else if (typeof currentOptions.editor?.focus === 'function') {
				currentOptions.editor.focus();
			} else {
				const visibleProseMirror = Array.from(rootEl.querySelectorAll('.ProseMirror')).find(
					isElementDisplayed
				);
				visibleProseMirror?.focus?.();
			}
		}

		sync();
		return true;
	};

	const handleKeydownCapture = (event) => {
		if (!event || event.isComposing) return;
		const hasCommandModifier = Boolean(event.altKey || event.ctrlKey || event.metaKey);

		if (event.key === 'Tab' && !hasCommandModifier) {
			const proseMirrorEl = closestElement(event.target, '.ProseMirror');
			if (proseMirrorEl && isInsideRoot(proseMirrorEl, rootEl)) {
				event.stopPropagation();
				return;
			}
		}

		if (event.key === 'Escape' && !hasCommandModifier) {
			if (closeOpenOverlays(event.target)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			const proseMirrorEl = closestElement(event.target, '.ProseMirror');
			if (proseMirrorEl && isInsideRoot(proseMirrorEl, rootEl)) {
				event.preventDefault();
				event.stopPropagation();
				const exitTarget = findExitFocusTarget(rootEl);
				if (exitTarget) {
					exitTarget.focus();
				} else {
					proseMirrorEl.blur?.();
					currentOptions.editor?.blur?.();
				}
				return;
			}
		}

		if (!hasCommandModifier) {
			const tabEl = closestElement(event.target, '.tab-item[role="tab"]');
			if (tabEl && isInsideRoot(tabEl, rootEl)) {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					event.stopPropagation();
					tabEl.click?.();
					sync();
					return;
				}

				if (
					event.key === 'ArrowRight' ||
					event.key === 'ArrowLeft' ||
					event.key === 'Home' ||
					event.key === 'End'
				) {
					const tablist = closestElement(tabEl, '[role="tablist"], .toastui-editor-tabs');
					const tabs = Array.from(tablist?.querySelectorAll?.('.tab-item[role="tab"]') ?? []);
					if (tabs.length > 1) {
						const currentIndex = Math.max(0, tabs.indexOf(tabEl));
						let nextIndex = currentIndex;
						if (event.key === 'ArrowRight') {
							nextIndex = (currentIndex + 1) % tabs.length;
						} else if (event.key === 'ArrowLeft') {
							nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
						} else if (event.key === 'Home') {
							nextIndex = 0;
						} else if (event.key === 'End') {
							nextIndex = tabs.length - 1;
						}

						const targetTab = tabs[nextIndex];
						if (targetTab) {
							event.preventDefault();
							event.stopPropagation();
							targetTab.click?.();
							sync();
							const refreshedTabs = Array.from(
								tablist?.querySelectorAll?.('.tab-item[role="tab"]') ?? []
							);
							(refreshedTabs[nextIndex] ?? targetTab)?.focus?.();
						}
					}
				}
			}
		}
	};

	rootEl.addEventListener?.('click', handleClickCapture, true);
	rootEl.addEventListener?.('keydown', handleKeydownCapture, true);

	const destroy = () => {
		observer?.disconnect?.();
		observer = null;
		rootEl.removeEventListener?.('click', handleClickCapture, true);
		rootEl.removeEventListener?.('keydown', handleKeydownCapture, true);
		lastToolbarTrigger = null;
	};

	destroy.destroy = destroy;
	destroy.disconnect = destroy;
	destroy.sync = sync;

	return destroy;
}
