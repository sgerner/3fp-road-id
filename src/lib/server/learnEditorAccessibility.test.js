import test from 'node:test';
import assert from 'node:assert/strict';
import {
	attachLearnEditorAccessibility,
	syncLearnEditorAccessibility
} from '../learn/editorAccessibility.js';

function matchesSingleSelector(el, rawSelector) {
	let selector = rawSelector.trim();
	if (!selector) return false;
	if (selector === '*') return true;

	const notMatches = [...selector.matchAll(/:not\(([^)]+)\)/g)];
	selector = selector.replace(/:not\([^)]+\)/g, '');

	const attrMatches = [...selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
	selector = selector.replace(/\[[^\]]+\]/g, '');

	let id = '';
	selector = selector.replace(/#([a-zA-Z0-9_-]+)/g, (_, matchedId) => {
		id = matchedId;
		return '';
	});

	const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
	const tag = selector
		.replace(/\.[a-zA-Z0-9_-]+/g, '')
		.trim()
		.toUpperCase();

	if (tag && el.tagName !== tag) return false;
	if (id && el.getAttribute('id') !== id) return false;
	for (const cls of classes) {
		if (!el.classList.contains(cls)) return false;
	}
	for (const [, attrName, attrVal] of attrMatches) {
		if (!el.hasAttribute(attrName)) return false;
		if (attrVal !== undefined && el.getAttribute(attrName) !== attrVal) return false;
	}
	for (const [, inner] of notMatches) {
		if (matchesSingleSelector(el, inner)) return false;
	}
	return true;
}

function matchesSelector(el, selectorGroup) {
	return selectorGroup.split(',').some((part) => {
		const tokens = part.trim().split(/\s+/).filter(Boolean);
		if (!tokens.length) return false;
		if (!matchesSingleSelector(el, tokens[tokens.length - 1])) return false;
		let current = el.parentElement;
		for (let i = tokens.length - 2; i >= 0; i -= 1) {
			while (current && !matchesSingleSelector(current, tokens[i])) {
				current = current.parentElement;
			}
			if (!current) return false;
			current = current.parentElement;
		}
		return true;
	});
}

class FakeElement {
	constructor(tagName, ownerDocument, attrs = {}) {
		this.nodeType = 1;
		this.tagName = tagName.toUpperCase();
		this.ownerDocument = ownerDocument;
		this.parentElement = null;
		this.children = [];
		this.attributes = new Map();
		this.listeners = new Map();
		this.textContent = '';
		this.disabled = false;
		this.hidden = false;
		this._style = { display: '', visibility: '' };

		const notifyStyle = () => {
			ownerDocument._notifyMutation({ type: 'attributes', attributeName: 'style', target: this });
		};
		this.style = new Proxy(this._style, {
			set(target, prop, val) {
				target[prop] = String(val ?? '');
				notifyStyle();
				return true;
			}
		});

		this.classList = {
			contains: (cls) => this._classes().includes(cls),
			add: (...items) => {
				const set = new Set(this._classes());
				for (const item of items) set.add(item);
				this.setAttribute('class', [...set].join(' '));
			},
			remove: (...items) => {
				const next = this._classes().filter((c) => !items.includes(c));
				this.setAttribute('class', next.join(' '));
			}
		};

		for (const [key, value] of Object.entries(attrs)) {
			if (key === 'textContent') {
				this.textContent = String(value);
			} else if (key === 'style' && typeof value === 'object') {
				Object.assign(this._style, value);
			} else {
				this.attributes.set(key, String(value));
			}
		}
	}

	get className() {
		return this.getAttribute('class') ?? '';
	}

	set className(value) {
		this.setAttribute('class', value);
	}

	get id() {
		return this.getAttribute('id') ?? '';
	}

	get firstElementChild() {
		return this.children[0] ?? null;
	}

	get isConnected() {
		return this.ownerDocument.body.contains(this);
	}

	get isContentEditable() {
		return this.getAttribute('contenteditable') === 'true';
	}

	get tabIndex() {
		const raw = this.getAttribute('tabindex');
		if (raw !== null) return Number(raw);
		if (
			['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'A'].includes(this.tagName) ||
			this.isContentEditable
		) {
			return 0;
		}
		return -1;
	}

	_classes() {
		return (this.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}

	hasAttribute(name) {
		return this.attributes.has(name);
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
		this.ownerDocument._notifyMutation({ type: 'attributes', attributeName: name, target: this });
	}

	removeAttribute(name) {
		if (this.attributes.delete(name)) {
			this.ownerDocument._notifyMutation({ type: 'attributes', attributeName: name, target: this });
		}
	}

	append(...nodes) {
		for (const node of nodes) {
			node.parentElement = this;
			this.children.push(node);
			this.ownerDocument._notifyMutation({ type: 'childList', target: this });
		}
		return this;
	}

	contains(target) {
		let cur = target;
		while (cur) {
			if (cur === this) return true;
			cur = cur.parentElement;
		}
		return false;
	}

	closest(selector) {
		if (matchesSelector(this, selector)) return this;
		let cur = this.parentElement;
		while (cur) {
			if (matchesSelector(cur, selector)) return cur;
			cur = cur.parentElement;
		}
		return null;
	}

	querySelectorAll(selector) {
		const matches = [];
		const visit = (parent) => {
			for (const child of parent.children) {
				if (matchesSelector(child, selector)) matches.push(child);
				visit(child);
			}
		};
		visit(this);
		return matches;
	}

	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	/**
	 * @param {string} type
	 * @param {any} fn
	 * @param {boolean | { capture?: boolean }} [options]
	 */
	addEventListener(type, fn, options = false) {
		const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
		if (!this.listeners.has(type)) this.listeners.set(type, []);
		this.listeners.get(type).push({ fn, capture });
	}

	/**
	 * @param {string} type
	 * @param {any} fn
	 * @param {boolean | { capture?: boolean }} [options]
	 */
	removeEventListener(type, fn, options = false) {
		const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
		const list = this.listeners.get(type) ?? [];
		this.listeners.set(
			type,
			list.filter((entry) => !(entry.fn === fn && entry.capture === capture))
		);
	}

	dispatchEvent(event) {
		event.target = event.target ?? this;
		const path = [this];
		let cur = this.parentElement;
		while (cur) {
			path.push(cur);
			cur = cur.parentElement;
		}

		for (let i = path.length - 1; i >= 1; i -= 1) {
			if (event._propagationStopped) return !event.defaultPrevented;
			event.currentTarget = path[i];
			for (const entry of [...(path[i].listeners.get(event.type) ?? [])]) {
				if (entry.capture) {
					entry.fn(event);
					if (event._immediateStopped) break;
				}
			}
		}

		if (!event._propagationStopped) {
			event.currentTarget = this;
			for (const entry of [...(this.listeners.get(event.type) ?? [])]) {
				entry.fn(event);
				if (event._immediateStopped) break;
			}
		}

		if (event.bubbles !== false) {
			for (let i = 1; i < path.length; i += 1) {
				if (event._propagationStopped) break;
				event.currentTarget = path[i];
				for (const entry of [...(path[i].listeners.get(event.type) ?? [])]) {
					if (!entry.capture) {
						entry.fn(event);
						if (event._immediateStopped) break;
					}
				}
			}
		}

		return !event.defaultPrevented;
	}

	focus() {
		this.ownerDocument.activeElement = this;
	}

	blur() {
		if (this.ownerDocument.activeElement === this) {
			this.ownerDocument.activeElement = this.ownerDocument.body;
		}
	}

	click() {
		const ev = createKeyOrClickEvent('click', { bubbles: true });
		this.dispatchEvent(ev);
	}
}

function createKeyOrClickEvent(type, init = {}) {
	return {
		type,
		bubbles: init.bubbles ?? true,
		key: init.key ?? '',
		shiftKey: Boolean(init.shiftKey),
		ctrlKey: Boolean(init.ctrlKey),
		altKey: Boolean(init.altKey),
		metaKey: Boolean(init.metaKey),
		isComposing: Boolean(init.isComposing),
		defaultPrevented: false,
		_propagationStopped: false,
		_immediateStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this._propagationStopped = true;
		},
		stopImmediatePropagation() {
			this._propagationStopped = true;
			this._immediateStopped = true;
		}
	};
}

function createEditorFixture() {
	const observers = [];

	class FakeMutationObserver {
		constructor(callback) {
			this.callback = callback;
			this.active = false;
			observers.push(this);
		}
		observe(target, options) {
			this.target = target;
			this.options = options;
			this.active = true;
		}
		disconnect() {
			this.active = false;
		}
	}

	const doc = {
		activeElement: null,
		defaultView: {
			MutationObserver: FakeMutationObserver,
			MouseEvent: class {
				constructor(type, opts = {}) {
					return createKeyOrClickEvent(type, opts);
				}
			}
		},
		_notifyMutation(record) {
			for (const obs of observers) {
				if (!obs.active || !obs.target.contains(record.target)) continue;
				if (
					record.type === 'attributes' &&
					obs.options?.attributeFilter &&
					!obs.options.attributeFilter.includes(record.attributeName)
				) {
					continue;
				}
				obs.callback([record]);
			}
		},
		querySelectorAll(selector) {
			return this.body.querySelectorAll(selector);
		},
		getElementById(id) {
			return this.body.querySelector(`#${id}`);
		}
	};

	doc.body = new FakeElement('body', doc);
	doc.activeElement = doc.body;
	const el = (tag, attrs) => new FakeElement(tag, doc, attrs);

	const beforeInput = el('input', { id: 'title-input', type: 'text' });
	const labelEl = el('p', {
		id: 'learn-editor-1-label',
		class: 'label',
		textContent: 'Article body'
	});
	const rootEl = el('div', { class: 'learn-editor-mount' });
	const afterButton = el('button', {
		id: 'publish-button',
		type: 'submit',
		textContent: 'Publish'
	});

	const toolbar = el('div', { class: 'toastui-editor-toolbar' });
	const mdTabContainer = el('div', { class: 'toastui-editor-md-tab-container' });
	const tabs = el('div', { class: 'toastui-editor-tabs', 'aria-role': 'tabpanel' });
	const writeTab = el('div', {
		class: 'tab-item active',
		'aria-role': 'tab',
		'aria-label': 'Write',
		'aria-selected': 'true',
		tabindex: '0',
		textContent: 'Write'
	});
	const previewTab = el('div', {
		class: 'tab-item',
		'aria-role': 'tab',
		'aria-label': 'Preview',
		'aria-selected': 'false',
		tabindex: '-1',
		textContent: 'Preview'
	});
	tabs.append(writeTab, previewTab);
	mdTabContainer.append(tabs);

	const linkButton = el('button', {
		type: 'button',
		class: 'link toastui-editor-toolbar-icons',
		'aria-label': 'Insert link'
	});
	const moreButton = el('button', {
		type: 'button',
		class: 'more toastui-editor-toolbar-icons'
	});
	const scrollSyncLabel = el('label', { class: 'scroll-sync active' });
	const scrollSyncCheckbox = el('input', { type: 'checkbox' });
	scrollSyncLabel.append(scrollSyncCheckbox);

	const popup = el('div', {
		class: 'toastui-editor-popup toastui-editor-popup-add-link',
		'aria-role': 'dialog',
		style: { display: 'none' }
	});
	const popupBody = el('div', { class: 'toastui-editor-popup-body' });
	const linkPopupWrapper = el('div', { 'aria-label': 'Insert link' });
	const linkUrlInput = el('input', { id: 'toastuiLinkUrlInput', type: 'text' });
	linkPopupWrapper.append(linkUrlInput);
	popupBody.append(linkPopupWrapper);
	popup.append(popupBody);

	toolbar.append(mdTabContainer, linkButton, scrollSyncLabel, moreButton, popup);

	const mdEditorWrap = el('div', { class: 'toastui-editor md-mode' });
	const clipboard = el('textarea', { class: 'toastui-editor-pseudo-clipboard' });
	const mdProseMirror = el('div', { class: 'ProseMirror', contenteditable: 'true' });
	mdEditorWrap.append(clipboard, mdProseMirror);

	const wwEditorWrap = el('div', { class: 'toastui-editor ww-mode' });
	const wwProseMirror = el('div', { class: 'ProseMirror', contenteditable: 'true' });
	wwEditorWrap.append(wwProseMirror);

	const contextMenu = el('div', {
		class: 'toastui-editor-context-menu',
		'aria-role': 'menu',
		style: { display: 'none' }
	});
	const menuGroup = el('ul', { class: 'menu-group' });
	const menuItem = el('li', {
		class: 'menu-item',
		'aria-role': 'menuitem',
		textContent: 'Add row to down'
	});
	menuGroup.append(menuItem);
	contextMenu.append(menuGroup);

	rootEl.append(toolbar, mdEditorWrap, wwEditorWrap, contextMenu);
	doc.body.append(beforeInput, labelEl, rootEl, afterButton);

	return {
		doc,
		el,
		beforeInput,
		labelEl,
		rootEl,
		afterButton,
		tabs,
		writeTab,
		previewTab,
		linkButton,
		moreButton,
		scrollSyncCheckbox,
		popup,
		popupBody,
		linkPopupWrapper,
		linkUrlInput,
		clipboard,
		mdProseMirror,
		wwProseMirror,
		contextMenu,
		menuGroup,
		menuItem
	};
}

test('syncLearnEditorAccessibility normalizes ProseMirror names, pseudo-clipboard, and ARIA roles', () => {
	const fixture = createEditorFixture();

	syncLearnEditorAccessibility(fixture.rootEl, {
		labelId: 'learn-editor-1-label',
		ariaLabel: 'Article body'
	});

	for (const pm of [fixture.mdProseMirror, fixture.wwProseMirror]) {
		assert.equal(pm.getAttribute('role'), 'textbox');
		assert.equal(pm.getAttribute('aria-multiline'), 'true');
		assert.equal(pm.getAttribute('aria-labelledby'), 'learn-editor-1-label');
		assert.equal(pm.getAttribute('aria-label'), null);
	}

	assert.equal(fixture.clipboard.getAttribute('tabindex'), '-1');
	assert.equal(fixture.clipboard.getAttribute('aria-hidden'), 'true');

	assert.equal(fixture.rootEl.querySelectorAll('[aria-role]').length, 0);
	assert.equal(fixture.tabs.getAttribute('role'), 'tablist');
	assert.equal(fixture.writeTab.getAttribute('role'), 'tab');
	assert.equal(fixture.previewTab.getAttribute('role'), 'tab');
	assert.equal(fixture.popup.getAttribute('role'), 'dialog');
	assert.equal(fixture.popup.getAttribute('aria-label'), 'Insert link');
	assert.equal(fixture.linkPopupWrapper.getAttribute('aria-label'), null);
	assert.equal(fixture.contextMenu.getAttribute('role'), 'menu');
	assert.equal(fixture.menuGroup.getAttribute('role'), 'group');
	assert.equal(fixture.menuItem.getAttribute('role'), 'menuitem');
	assert.equal(fixture.moreButton.getAttribute('aria-label'), 'More');
	assert.equal(fixture.scrollSyncCheckbox.getAttribute('aria-label'), 'Scroll sync');

	// Fallback to aria-label when no visual label element exists (e.g., GroupNewsEditorForm)
	syncLearnEditorAccessibility(fixture.rootEl, {
		labelId: '',
		ariaLabel: 'Update body'
	});

	for (const pm of [fixture.mdProseMirror, fixture.wwProseMirror]) {
		assert.equal(pm.getAttribute('aria-labelledby'), null);
		assert.equal(pm.getAttribute('aria-label'), 'Update body');
	}
});

test('attachLearnEditorAccessibility lets unmodified Tab and Shift+Tab exit ProseMirror without preventDefault', () => {
	const fixture = createEditorFixture();
	let proseMirrorKeydownCount = 0;

	fixture.wwProseMirror.addEventListener('keydown', (ev) => {
		proseMirrorKeydownCount += 1;
		ev.preventDefault();
	});

	const cleanup = attachLearnEditorAccessibility(fixture.rootEl, {
		labelId: 'learn-editor-1-label',
		ariaLabel: 'Article body'
	});

	const tabEvent = createKeyOrClickEvent('keydown', { key: 'Tab' });
	fixture.wwProseMirror.dispatchEvent(tabEvent);
	assert.equal(proseMirrorKeydownCount, 0);
	assert.equal(tabEvent.defaultPrevented, false);

	const shiftTabEvent = createKeyOrClickEvent('keydown', { key: 'Tab', shiftKey: true });
	fixture.wwProseMirror.dispatchEvent(shiftTabEvent);
	assert.equal(proseMirrorKeydownCount, 0);
	assert.equal(shiftTabEvent.defaultPrevented, false);

	// Modified Ctrl+Tab is not swallowed by the Tab exit guard
	const ctrlTabEvent = createKeyOrClickEvent('keydown', { key: 'Tab', ctrlKey: true });
	fixture.wwProseMirror.dispatchEvent(ctrlTabEvent);
	assert.equal(proseMirrorKeydownCount, 1);

	cleanup.destroy();
});

test('attachLearnEditorAccessibility closes open popups on Escape and exits ProseMirror on Escape when no popup is open', () => {
	const fixture = createEditorFixture();
	let closePopupEvents = 0;

	const mockEditor = {
		eventEmitter: {
			emit(eventName) {
				if (eventName === 'closePopup') {
					closePopupEvents += 1;
					fixture.popup.style.display = 'none';
				}
			}
		},
		focus() {
			fixture.wwProseMirror.focus();
		},
		blur() {
			fixture.wwProseMirror.blur();
		}
	};

	const cleanup = attachLearnEditorAccessibility(fixture.rootEl, {
		editor: mockEditor,
		labelId: 'learn-editor-1-label',
		ariaLabel: 'Article body'
	});

	// Open popup from toolbar trigger, move focus inside popup, then press Escape
	fixture.linkButton.click();
	fixture.popup.style.display = 'block';
	fixture.linkUrlInput.focus();
	assert.equal(fixture.doc.activeElement, fixture.linkUrlInput);

	const closePopupEsc = createKeyOrClickEvent('keydown', { key: 'Escape' });
	fixture.linkUrlInput.dispatchEvent(closePopupEsc);
	assert.equal(closePopupEvents, 1);
	assert.equal(fixture.popup.style.display, 'none');
	assert.equal(closePopupEsc.defaultPrevented, true);
	assert.equal(fixture.doc.activeElement, fixture.linkButton);

	// With popup closed, pressing Escape inside ProseMirror moves focus to the next form control
	fixture.wwProseMirror.focus();
	assert.equal(fixture.doc.activeElement, fixture.wwProseMirror);

	const exitEditorEsc = createKeyOrClickEvent('keydown', { key: 'Escape' });
	fixture.wwProseMirror.dispatchEvent(exitEditorEsc);
	assert.equal(exitEditorEsc.defaultPrevented, true);
	assert.equal(fixture.doc.activeElement, fixture.afterButton);

	cleanup.destroy();
});

test('attachLearnEditorAccessibility activates tabs via keyboard and normalizes mutated popup nodes', () => {
	const fixture = createEditorFixture();
	let activatedTab = 'write';

	fixture.writeTab.addEventListener('click', () => {
		activatedTab = 'write';
		fixture.writeTab.classList.add('active');
		fixture.writeTab.setAttribute('aria-selected', 'true');
		fixture.writeTab.setAttribute('tabindex', '0');
		fixture.previewTab.classList.remove('active');
		fixture.previewTab.setAttribute('aria-selected', 'false');
		fixture.previewTab.setAttribute('tabindex', '-1');
	});

	fixture.previewTab.addEventListener('click', () => {
		activatedTab = 'preview';
		fixture.previewTab.classList.add('active');
		fixture.previewTab.setAttribute('aria-selected', 'true');
		fixture.previewTab.setAttribute('tabindex', '0');
		fixture.writeTab.classList.remove('active');
		fixture.writeTab.setAttribute('aria-selected', 'false');
		fixture.writeTab.setAttribute('tabindex', '-1');
	});

	const cleanup = attachLearnEditorAccessibility(fixture.rootEl, {
		labelId: 'learn-editor-1-label',
		ariaLabel: 'Article body'
	});

	fixture.writeTab.focus();
	const arrowRightEvent = createKeyOrClickEvent('keydown', { key: 'ArrowRight' });
	fixture.writeTab.dispatchEvent(arrowRightEvent);
	assert.equal(arrowRightEvent.defaultPrevented, true);
	assert.equal(activatedTab, 'preview');
	assert.equal(fixture.doc.activeElement, fixture.previewTab);

	const enterOnWrite = createKeyOrClickEvent('keydown', { key: 'Enter' });
	fixture.writeTab.dispatchEvent(enterOnWrite);
	assert.equal(enterOnWrite.defaultPrevented, true);
	assert.equal(activatedTab, 'write');

	// Simulate @toast-ui/editor mounting HeadingPopupBody dynamically with invalid aria-role
	const headingMenu = fixture.el('ul', {
		'aria-role': 'menu',
		'aria-label': 'Headings'
	});
	const headingItem = fixture.el('li', {
		'aria-role': 'menuitem',
		textContent: 'Heading 1'
	});
	headingMenu.append(headingItem);
	fixture.popup.setAttribute('class', 'toastui-editor-popup toastui-editor-popup-add-heading');
	fixture.popupBody.children = [];
	fixture.popupBody.append(headingMenu);

	assert.equal(headingMenu.getAttribute('aria-role'), null);
	assert.equal(headingMenu.getAttribute('role'), 'menu');
	assert.equal(headingItem.getAttribute('aria-role'), null);
	assert.equal(headingItem.getAttribute('role'), 'menuitem');
	assert.equal(fixture.popup.getAttribute('aria-label'), 'Headings');

	cleanup.destroy();
});
