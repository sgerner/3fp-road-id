import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { compile, parse } from 'svelte/compiler';

const componentUrl = new URL('../components/ui/SearchableSelect.svelte', import.meta.url);
const themeCssUrl = new URL('../../3fp.css', import.meta.url);
const skeletonThemeUrl = new URL(
	'../../../node_modules/@skeletonlabs/skeleton/src/base/theme.css',
	import.meta.url
);

const componentSource = fs.readFileSync(componentUrl, 'utf8');
const themeCss = fs.readFileSync(themeCssUrl, 'utf8');
const skeletonThemeCss = fs.readFileSync(skeletonThemeUrl, 'utf8');

function walkAst(node, visit) {
	if (!node || typeof node !== 'object') return;
	visit(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const entry of value) walkAst(entry, visit);
		} else if (value && typeof value === 'object') {
			walkAst(value, visit);
		}
	}
}

function getElementsByName(ast, name) {
	const matches = [];
	walkAst(ast.fragment, (node) => {
		if (node.type === 'RegularElement' && node.name === name) {
			matches.push(node);
		}
	});
	return matches;
}

function getAttribute(element, attrName) {
	return element.attributes.find((attr) => attr.type === 'Attribute' && attr.name === attrName);
}

function getAttributeStaticText(element, attrName) {
	const attr = getAttribute(element, attrName);
	if (!attr || attr.value === true) return '';
	const chunks = Array.isArray(attr.value) ? attr.value : [attr.value];
	return chunks
		.map((chunk) => {
			if (chunk.type === 'Text') return chunk.data;
			if (chunk.type === 'ExpressionTag') {
				return componentSource.slice(chunk.expression.start, chunk.expression.end);
			}
			return '';
		})
		.join('');
}

function getAttributeExpressionSource(element, attrName) {
	const attr = getAttribute(element, attrName);
	if (!attr || attr.value === true) return null;
	const chunks = Array.isArray(attr.value) ? attr.value : [attr.value];
	const exprChunk = chunks.find((chunk) => chunk.type === 'ExpressionTag');
	if (!exprChunk) return null;
	return componentSource.slice(exprChunk.expression.start, exprChunk.expression.end).trim();
}

function createSearchableSelectHarness(initialProps = {}) {
	/** @type {any} */
	const ast = parse(componentSource, { modern: true });
	const moduleCode = ast.module
		? componentSource.slice(ast.module.content.start, ast.module.content.end)
		: '';
	const instanceRaw = componentSource.slice(ast.instance.content.start, ast.instance.content.end);

	const inputEl = getElementsByName(ast, 'input')[0];
	const optionEl = getElementsByName(ast, 'button')[0];

	const inputHandlersSource = {
		onfocus: getAttributeExpressionSource(inputEl, 'onfocus'),
		onclick: getAttributeExpressionSource(inputEl, 'onclick'),
		onblur: getAttributeExpressionSource(inputEl, 'onblur'),
		oninput: getAttributeExpressionSource(inputEl, 'oninput'),
		onkeydown: getAttributeExpressionSource(inputEl, 'onkeydown')
	};
	const optionHandlersSource = {
		onpointerdown: getAttributeExpressionSource(optionEl, 'onpointerdown'),
		onmousedown: getAttributeExpressionSource(optionEl, 'onmousedown'),
		onclick: getAttributeExpressionSource(optionEl, 'onclick')
	};

	const reactiveStatements = [];
	let transformedInstance = instanceRaw
		.replace(/^\s*import\s+[^;]+;\s*$/gm, '')
		.replace(/^\s*export\s+let\s+([A-Za-z0-9_$]+)\s*=\s*([^;]+);/gm, (_, name, fallback) => {
			return `let ${name} = Object.prototype.hasOwnProperty.call(__props, '${name}') ? __props.${name} : (${fallback});`;
		});

	transformedInstance = transformedInstance.replace(
		/^\s*\$:\s*([\s\S]*?)(?=^\s*(?:\$:|\bfunction\b|\basync\s+function\b|$))/gm,
		(_, body) => {
			const trimmed = body.trim();
			if (/^[A-Za-z0-9_$]+\s*=/.test(trimmed) && !trimmed.startsWith('if')) {
				const varName = trimmed.match(/^([A-Za-z0-9_$]+)\s*=/)[1];
				reactiveStatements.push(trimmed);
				return `let ${varName};`;
			}
			reactiveStatements.push(trimmed);
			return '';
		}
	);

	let nextTimerId = 1;
	const timers = new Map();
	const scrolledIds = [];

	const sandbox = {
		__props: { ...initialProps },
		tick: () => Promise.resolve(),
		setTimeout(fn, delay) {
			const id = nextTimerId++;
			timers.set(id, { fn, delay });
			return id;
		},
		clearTimeout(id) {
			timers.delete(id);
		},
		document: {
			getElementById(id) {
				return {
					scrollIntoView() {
						scrolledIds.push(id);
					}
				};
			}
		}
	};

	const harnessSource = `
		${moduleCode}
		function __mount(__props) {
			${transformedInstance}
			function __recompute() {
				${reactiveStatements.join('\n')}
			}
			__recompute();

			const __inputHandlers = {
				onfocus: ${inputHandlersSource.onfocus},
				onclick: ${inputHandlersSource.onclick},
				onblur: ${inputHandlersSource.onblur},
				oninput: ${inputHandlersSource.oninput},
				onkeydown: ${inputHandlersSource.onkeydown}
			};

			function __optionHandlers(item, index) {
				return {
					onpointerdown: ${optionHandlersSource.onpointerdown},
					onmousedown: ${optionHandlersSource.onmousedown},
					onclick: ${optionHandlersSource.onclick}
				};
			}

			return {
				getState() {
					__recompute();
					return {
						open,
						query,
						listboxId,
						activeIndex,
						disabled,
						visibleItems
					};
				},
				setProps(nextProps) {
					if ('items' in nextProps) items = nextProps.items;
					if ('query' in nextProps) query = nextProps.query;
					if ('disabled' in nextProps) disabled = nextProps.disabled;
					if ('maxItems' in nextProps) maxItems = nextProps.maxItems;
					__recompute();
				},
				focusInput(event = {}) {
					__inputHandlers.onfocus(event);
					__recompute();
				},
				clickInput(event = {}) {
					__inputHandlers.onclick(event);
					__recompute();
				},
				blurInput(event = {}) {
					__inputHandlers.onblur(event);
					__recompute();
				},
				inputValue(value) {
					__inputHandlers.oninput({ currentTarget: { value } });
					__recompute();
				},
				keydownInput(key) {
					let defaultPrevented = false;
					__inputHandlers.onkeydown({
						key,
						preventDefault() {
							defaultPrevented = true;
						}
					});
					__recompute();
					return { defaultPrevented };
				},
				pointerdownOption(index) {
					__recompute();
					const item = visibleItems[index];
					let defaultPrevented = false;
					__optionHandlers(item, index).onpointerdown({
						preventDefault() {
							defaultPrevented = true;
						}
					});
					__recompute();
					return { defaultPrevented };
				},
				mousedownOption(index) {
					__recompute();
					const item = visibleItems[index];
					let defaultPrevented = false;
					__optionHandlers(item, index).onmousedown({
						preventDefault() {
							defaultPrevented = true;
						}
					});
					__recompute();
					return { defaultPrevented };
				},
				clickOption(index) {
					__recompute();
					const item = visibleItems[index];
					__optionHandlers(item, index).onclick({});
					__recompute();
				}
			};
		}
	`;

	vm.createContext(sandbox);
	vm.runInContext(harnessSource, sandbox);
	const instance = sandbox.__mount(sandbox.__props);

	return {
		...instance,
		scrolledIds,
		pendingTimerCount: () => timers.size,
		flushTimers() {
			for (const [id, entry] of [...timers.entries()]) {
				timers.delete(id);
				entry.fn();
			}
		}
	};
}

function parseOklchToRelativeLuminance(oklchValue) {
	const match = oklchValue.match(
		/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+(?:none|([\d.]+)(?:deg)?)\s*\)/i
	);
	assert.ok(match, `Expected valid oklch() token, got: ${oklchValue}`);

	const l = oklchValue.includes('%') ? Number(match[1]) / 100 : Number(match[1]);
	const c = Number(match[2]);
	const hRad = match[3] ? (Number(match[3]) * Math.PI) / 180 : 0;

	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const lCube = l_ ** 3;
	const mCube = m_ ** 3;
	const sCube = s_ ** 3;

	const rLin = Math.min(
		1,
		Math.max(0, 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube)
	);
	const gLin = Math.min(
		1,
		Math.max(0, -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube)
	);
	const bLin = Math.min(
		1,
		Math.max(0, -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube)
	);

	return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatio(lumA, lumB) {
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}

function getThemeCustomProperty(css, propName) {
	const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
	assert.ok(match, `Missing custom property ${propName}`);
	return match[1].trim();
}

test('SearchableSelect compiles cleanly for client and server targets', () => {
	const clientResult = compile(componentSource, {
		filename: 'SearchableSelect.svelte',
		generate: 'client'
	});
	const serverResult = compile(componentSource, {
		filename: 'SearchableSelect.svelte',
		generate: 'server'
	});
	assert.ok(clientResult.js.code.length > 0);
	assert.ok(serverResult.js.code.length > 0);
});

test('SearchableSelect reopens listbox on tap/click and typing while input remains focused', () => {
	const items = [
		{ id: 'checking', label: 'Operating Checking', group: 'Cash' },
		{ id: 'dues', label: 'Membership Dues', group: 'Income' }
	];
	const queries = [];
	const selections = [];

	const harness = createSearchableSelectHarness({
		items,
		onQueryChange: (value) => queries.push(value),
		onSelect: (item) => selections.push(item)
	});

	assert.equal(harness.getState().open, false);

	// Initial focus opens listbox and initializes listboxId.
	harness.focusInput();
	assert.equal(harness.getState().open, true);
	assert.match(harness.getState().listboxId, /^searchable-select-\d+$/);

	// Selecting an option keeps input focused via pointerdown/mousedown preventDefault and closes on click.
	assert.equal(harness.pointerdownOption(0).defaultPrevented, true);
	assert.equal(harness.mousedownOption(0).defaultPrevented, true);
	assert.equal(harness.getState().open, true);
	assert.equal(selections.length, 0);

	harness.clickOption(0);
	assert.equal(harness.getState().open, false);
	assert.equal(harness.getState().query, 'Operating Checking');
	assert.deepEqual(selections, [items[0]]);

	// Re-tapping the still-focused input fires onclick without onfocus and reopens the listbox.
	harness.clickInput();
	assert.equal(harness.getState().open, true);

	// Choosing again closes the listbox; clearing search input ('') via oninput reopens unfiltered options.
	harness.clickOption(1);
	assert.equal(harness.getState().open, false);
	assert.equal(harness.getState().query, 'Membership Dues');

	harness.inputValue('');
	assert.equal(harness.getState().open, true);
	assert.equal(harness.getState().query, '');
	assert.equal(queries.at(-1), '');
});

test('SearchableSelect selects options once via onclick for both touch/mouse and screen reader .click()', () => {
	const items = [
		{ id: 'supplies', label: 'Event Supplies' },
		{ id: 'grants', label: 'Safety Grants' }
	];
	const selected = [];

	const harness = createSearchableSelectHarness({
		items,
		onSelect: (item) => selected.push(item.id)
	});

	// Full pointer + mouse + click sequence selects once and cancels pending blur closeTimer.
	harness.focusInput();
	harness.blurInput();
	assert.equal(harness.pendingTimerCount(), 1);

	assert.equal(harness.pointerdownOption(0).defaultPrevented, true);
	assert.equal(harness.pendingTimerCount(), 0);
	assert.equal(harness.mousedownOption(0).defaultPrevented, true);
	assert.deepEqual(selected, []);

	harness.clickOption(0);
	assert.deepEqual(selected, ['supplies']);
	assert.equal(harness.getState().open, false);

	// Screen reader (VoiceOver / TalkBack) synthetic .click() after blur selects once before 80ms timer elapses.
	harness.clickInput();
	assert.equal(harness.getState().open, true);
	harness.blurInput();
	assert.equal(harness.pendingTimerCount(), 1);

	harness.clickOption(1);
	assert.deepEqual(selected, ['supplies', 'grants']);
	assert.equal(harness.getState().open, false);
	assert.equal(harness.pendingTimerCount(), 0);

	// Standard blur dismissal still closes after 80ms when no option is clicked.
	harness.clickInput();
	assert.equal(harness.getState().open, true);
	harness.blurInput();
	harness.flushTimers();
	assert.equal(harness.getState().open, false);
});

test('SearchableSelect preserves keyboard navigation and blocks mutations when disabled', () => {
	const items = [
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' }
	];
	const queries = [];
	const selected = [];

	const harness = createSearchableSelectHarness({
		items,
		onQueryChange: (value) => queries.push(value),
		onSelect: (item) => selected.push(item.id)
	});

	assert.equal(harness.keydownInput('ArrowDown').defaultPrevented, true);
	assert.equal(harness.getState().open, true);
	assert.equal(harness.getState().activeIndex, 0);

	assert.equal(harness.keydownInput('ArrowDown').defaultPrevented, true);
	assert.equal(harness.getState().activeIndex, 1);

	assert.equal(harness.keydownInput('Enter').defaultPrevented, true);
	assert.equal(harness.getState().open, false);
	assert.deepEqual(selected, ['b']);

	assert.equal(harness.keydownInput('ArrowUp').defaultPrevented, true);
	assert.equal(harness.getState().open, true);
	assert.equal(harness.getState().activeIndex, 1);

	assert.equal(harness.keydownInput('Escape').defaultPrevented, true);
	assert.equal(harness.getState().open, false);
	assert.equal(harness.getState().activeIndex, -1);

	// Disabled combobox ignores focus, click, input, keydown, and option selection.
	const queryCountBeforeDisable = queries.length;
	harness.setProps({ disabled: true });
	harness.focusInput();
	harness.clickInput();
	harness.inputValue('Blocked');
	harness.keydownInput('ArrowDown');
	harness.clickOption(0);

	assert.equal(harness.getState().open, false);
	assert.equal(harness.getState().query, 'Beta');
	assert.equal(queries.length, queryCountBeforeDisable);
	assert.deepEqual(selected, ['b']);
});

test('SearchableSelect enforces >=44px mobile tap targets and >=16px input text under 3fp scaling', () => {
	const ast = parse(componentSource, { modern: true });
	const inputEl = getElementsByName(ast, 'input')[0];
	const optionEl = getElementsByName(ast, 'button')[0];

	const inputClasses = getAttributeStaticText(inputEl, 'class').split(/\s+/);
	const optionClasses = getAttributeStaticText(optionEl, 'class').split(/\s+/);

	assert.ok(inputClasses.includes('min-h-11'), 'Expected min-h-11 on combobox input');
	assert.ok(inputClasses.includes('py-2'), 'Expected py-2 on combobox input');
	assert.ok(inputClasses.includes('text-base'), 'Expected text-base on combobox input');
	assert.ok(!inputClasses.includes('py-1.5'), 'Expected py-1.5 to be removed from combobox input');
	assert.ok(
		!inputClasses.includes('text-sm'),
		'Expected text-sm to be removed from combobox input'
	);
	assert.ok(optionClasses.includes('min-h-11'), 'Expected min-h-11 on listbox option button');

	const textScaling = Number(getThemeCustomProperty(themeCss, '--text-scaling'));
	const spacingRem = parseFloat(getThemeCustomProperty(themeCss, '--spacing'));
	const rootFontPx = 16;

	const minTapTargetPx = 11 * spacingRem * rootFontPx;
	const inputFontSizePx = 1 * textScaling * rootFontPx;

	assert.equal(minTapTargetPx, 44);
	assert.ok(
		inputFontSizePx >= 16,
		`Expected input font size >= 16px, got ${inputFontSizePx.toFixed(3)}px`
	);
});

test('SearchableSelect uses paired surface tokens exceeding WCAG AA contrast in light and dark modes', () => {
	const ast = parse(componentSource, { modern: true });
	const divs = getElementsByName(ast, 'div');
	const listboxEl = divs.find((el) => getAttributeStaticText(el, 'role') === 'listbox');
	const emptyEl = divs.find((el) => getAttributeStaticText(el, 'role') === 'status');
	const optionEl = getElementsByName(ast, 'button')[0];
	const spans = getElementsByName(ast, 'span');
	const metaSpan = spans[1];

	assert.ok(listboxEl, 'Expected [role="listbox"] container');
	assert.ok(emptyEl, 'Expected [role="status"] empty state');

	const listboxClasses = getAttributeStaticText(listboxEl, 'class').split(/\s+/);
	const optionClassText = getAttributeStaticText(optionEl, 'class');
	const metaClasses = getAttributeStaticText(metaSpan, 'class').split(/\s+/);
	const emptyClasses = getAttributeStaticText(emptyEl, 'class').split(/\s+/);

	assert.ok(listboxClasses.includes('bg-surface-50-950'));
	assert.ok(listboxClasses.includes('text-surface-950-50'));
	assert.ok(listboxClasses.includes('border-surface-300-700'));
	assert.ok(!listboxClasses.includes('bg-surface-950/95'));
	assert.ok(!listboxClasses.includes('border-surface-500/10'));
	assert.ok(!listboxClasses.includes('backdrop-blur'));

	assert.match(optionClassText, /\bhover:bg-surface-200-800\b/);
	assert.match(optionClassText, /\bbg-surface-200-800\b/);
	assert.doesNotMatch(optionClassText, /bg-surface-500\/10/);

	assert.ok(metaClasses.includes('text-surface-700-300'));
	assert.ok(!metaClasses.includes('text-surface-500'));
	assert.ok(emptyClasses.includes('text-surface-700-300'));
	assert.ok(!emptyClasses.includes('text-surface-500'));

	// Verify Skeleton paired surface tokens exist in @skeletonlabs/skeleton theme.css
	for (const pairedToken of [
		'--color-surface-50-950',
		'--color-surface-950-50',
		'--color-surface-300-700',
		'--color-surface-700-300',
		'--color-surface-200-800'
	]) {
		assert.ok(getThemeCustomProperty(skeletonThemeCss, pairedToken));
	}

	const surfaceLum = {
		50: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-50')),
		200: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-200')),
		300: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-300')),
		700: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-700')),
		800: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-800')),
		950: parseOklchToRelativeLuminance(getThemeCustomProperty(themeCss, '--color-surface-950'))
	};

	// Light mode: bg-surface-50, active bg-surface-200, label text-surface-950, meta/empty text-surface-700
	const lightLabelContrast = contrastRatio(surfaceLum[950], surfaceLum[50]);
	const lightMetaContrast = contrastRatio(surfaceLum[700], surfaceLum[50]);
	const lightActiveLabelContrast = contrastRatio(surfaceLum[950], surfaceLum[200]);
	const lightActiveMetaContrast = contrastRatio(surfaceLum[700], surfaceLum[200]);

	assert.ok(Math.abs(lightLabelContrast - 18.88) < 0.05, `Got ${lightLabelContrast}`);
	assert.ok(Math.abs(lightMetaContrast - 9.74) < 0.05, `Got ${lightMetaContrast}`);
	assert.ok(lightActiveLabelContrast >= 4.5, `Got ${lightActiveLabelContrast}`);
	assert.ok(lightActiveMetaContrast >= 4.5, `Got ${lightActiveMetaContrast}`);

	// Dark mode: bg-surface-950, active bg-surface-800, label text-surface-50, meta/empty text-surface-300
	const darkLabelContrast = contrastRatio(surfaceLum[50], surfaceLum[950]);
	const darkMetaContrast = contrastRatio(surfaceLum[300], surfaceLum[950]);
	const darkActiveLabelContrast = contrastRatio(surfaceLum[50], surfaceLum[800]);
	const darkActiveMetaContrast = contrastRatio(surfaceLum[300], surfaceLum[800]);

	assert.ok(Math.abs(darkLabelContrast - 18.88) < 0.05, `Got ${darkLabelContrast}`);
	assert.ok(darkMetaContrast >= 4.5, `Got ${darkMetaContrast}`);
	assert.ok(darkActiveLabelContrast >= 4.5, `Got ${darkActiveLabelContrast}`);
	assert.ok(darkActiveMetaContrast >= 4.5, `Got ${darkActiveMetaContrast}`);
});
