import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { compile, parse } from 'svelte/compiler';

const componentUrl = new URL('../components/groups/GroupSocialManager.svelte', import.meta.url);
const source = fs.readFileSync(componentUrl, 'utf8');
const ast = parse(source, { modern: true });

function selectorText(rule) {
	return source.slice(rule.prelude.start, rule.prelude.end).trim();
}

function declarationsMap(rule) {
	const map = new Map();
	for (const child of rule.block?.children ?? []) {
		if (child.type === 'Declaration') {
			map.set(child.property.trim(), child.value.trim());
		}
	}
	return map;
}

function findTopLevelRules(targetSelector) {
	return (ast.css?.children ?? []).filter(
		(node) => node.type === 'Rule' && selectorText(node) === targetSelector
	);
}

function findMediaRules(mediaQuerySubstring, targetSelector) {
	const matches = [];
	for (const node of ast.css?.children ?? []) {
		if (
			node.type === 'Atrule' &&
			node.name === 'media' &&
			node.prelude.includes(mediaQuerySubstring)
		) {
			for (const child of node.block?.children ?? []) {
				if (child.type === 'Rule' && selectorText(child) === targetSelector) {
					matches.push(child);
				}
			}
		}
	}
	return matches;
}

function parseMinHeightPx(value) {
	if (!value) return 0;
	const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
	if (pxMatch) return Number(pxMatch[1]);
	const remMatch = value.match(/^(\d+(?:\.\d+)?)rem$/);
	if (remMatch) return Number(remMatch[1]) * 16;
	return 0;
}

function walkTemplate(node, visitor) {
	if (!node || typeof node !== 'object') return;
	visitor(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const entry of value) walkTemplate(entry, visitor);
		} else if (value && typeof value === 'object' && typeof value.type === 'string') {
			walkTemplate(value, visitor);
		}
	}
}

function getStaticClassValue(element) {
	const attr = element.attributes?.find(
		(entry) => entry.type === 'Attribute' && entry.name === 'class'
	);
	if (!attr || !Array.isArray(attr.value)) return '';
	return attr.value
		.filter((part) => part.type === 'Text')
		.map((part) => part.data)
		.join(' ');
}

test('GroupSocialManager compiles cleanly for client and server targets', () => {
	const serverCompiled = compile(source, {
		filename: 'GroupSocialManager.svelte',
		generate: 'server'
	});
	const clientCompiled = compile(source, {
		filename: 'GroupSocialManager.svelte',
		generate: 'client'
	});
	assert.ok(serverCompiled.js.code.length > 0);
	assert.ok(clientCompiled.js.code.length > 0);
});

test('mobile preview replaces the composer form below 1024px and restores cleanly', () => {
	assert.match(
		source,
		/const\s+mobilePreviewOpenEffective\s*=\s*\$derived\.by\(\s*\(\)\s*=>\s*mobilePreviewOpen\s*&&\s*composerPreviewHasImage\s*\)/
	);
	assert.match(source, /if\s*\(!composerPreviewHasImage\s*&&\s*mobilePreviewOpen\)/);

	let composerFormElement = null;
	let composerPreviewElement = null;
	walkTemplate(ast.fragment, (node) => {
		if (node.type === 'RegularElement' && getStaticClassValue(node) === 'composer-form') {
			composerFormElement = node;
		}
		if (node.type === 'RegularElement' && getStaticClassValue(node) === 'composer-preview') {
			composerPreviewElement = node;
		}
	});

	assert.ok(composerFormElement, 'expected .composer-form element');
	const mobileHiddenDirective = composerFormElement.attributes.find(
		(attr) => attr.type === 'ClassDirective' && attr.name === 'composer-form--mobile-hidden'
	);
	assert.ok(mobileHiddenDirective, 'expected class:composer-form--mobile-hidden on .composer-form');
	assert.equal(
		source.slice(mobileHiddenDirective.expression.start, mobileHiddenDirective.expression.end),
		'mobilePreviewOpenEffective'
	);

	assert.ok(composerPreviewElement, 'expected .composer-preview element');
	const mobileOpenDirective = composerPreviewElement.attributes.find(
		(attr) => attr.type === 'ClassDirective' && attr.name === 'composer-preview--mobile-open'
	);
	assert.ok(
		mobileOpenDirective,
		'expected class:composer-preview--mobile-open on .composer-preview'
	);
	assert.equal(
		source.slice(mobileOpenDirective.expression.start, mobileOpenDirective.expression.end),
		'mobilePreviewOpenEffective'
	);

	const mobileHiddenRules = findMediaRules('max-width: 1023px', '.composer-form--mobile-hidden');
	assert.equal(mobileHiddenRules.length, 1);
	assert.equal(declarationsMap(mobileHiddenRules[0]).get('display'), 'none');
	assert.equal(
		findTopLevelRules('.composer-form--mobile-hidden').length,
		0,
		'.composer-form--mobile-hidden must not hide .composer-form at >= 1024px'
	);

	const desktopHiddenRules = findMediaRules('min-width: 1024px', '.composer-form--hidden');
	assert.equal(desktopHiddenRules.length, 1);
	assert.equal(declarationsMap(desktopHiddenRules[0]).get('display'), 'none');

	const mobileOpenRules = findMediaRules('max-width: 1023px', '.composer-preview--mobile-open');
	assert.equal(mobileOpenRules.length, 1);
	const mobileOpenDecls = declarationsMap(mobileOpenRules[0]);
	assert.equal(mobileOpenDecls.get('display'), 'flex');
	assert.equal(mobileOpenDecls.get('width'), '100%');
	assert.ok(
		mobileOpenDecls.get('flex')?.startsWith('1'),
		'expected mobile preview to flex-fill body'
	);

	const showPreviewBtnRules = findTopLevelRules('.composer-mobile-preview-toggle');
	assert.equal(showPreviewBtnRules.length, 1);
	assert.ok(
		parseMinHeightPx(declarationsMap(showPreviewBtnRules[0]).get('min-height')) >= 44,
		'expected .composer-mobile-preview-toggle min-height >= 44px'
	);

	const backToEditorBtnRules = findTopLevelRules('.composer-preview-toggle--mobile');
	assert.equal(backToEditorBtnRules.length, 1);
	assert.ok(
		parseMinHeightPx(declarationsMap(backToEditorBtnRules[0]).get('min-height')) >= 44,
		'expected .composer-preview-toggle--mobile min-height >= 44px'
	);

	const baseToggleRule = findTopLevelRules('.composer-preview-toggle')[0];
	const mobileDesktopHideRule = findMediaRules(
		'max-width: 1023px',
		'.composer-preview-toggle--desktop'
	)[0];
	assert.ok(
		baseToggleRule.end < mobileDesktopHideRule.start,
		'expected .composer-preview-toggle base rule before @media (max-width: 1023px) override'
	);
});

test('AI settings row wraps without hidden scrollbars and enforces 44px touch targets', () => {
	const rowRules = findTopLevelRules('.ai-settings-row');
	assert.equal(rowRules.length, 1);
	const rowDecls = declarationsMap(rowRules[0]);
	assert.equal(rowDecls.get('display'), 'flex');
	assert.equal(rowDecls.get('flex-wrap'), 'wrap');
	assert.equal(rowDecls.has('overflow-x'), false);
	assert.equal(rowDecls.has('scrollbar-width'), false);
	assert.equal(rowDecls.has('-ms-overflow-style'), false);
	assert.equal(findTopLevelRules('.ai-settings-row::-webkit-scrollbar').length, 0);

	const selectRules = findTopLevelRules('.ai-setting__select');
	assert.equal(selectRules.length, 1);
	const selectDecls = declarationsMap(selectRules[0]);
	assert.notEqual(selectDecls.get('width'), 'max-content');
	assert.equal(selectDecls.get('width'), '100%');
	assert.equal(selectDecls.get('max-width'), '100%');
	assert.equal(selectDecls.get('min-width'), '0');
	assert.ok(
		parseMinHeightPx(selectDecls.get('min-height')) >= 44,
		'expected .ai-setting__select min-height >= 44px'
	);

	const modelBtnRules = findTopLevelRules('.ai-model-toggle__btn');
	assert.equal(modelBtnRules.length, 1);
	assert.ok(
		parseMinHeightPx(declarationsMap(modelBtnRules[0]).get('min-height')) >= 44,
		'expected .ai-model-toggle__btn min-height >= 44px'
	);

	const switchRules = findTopLevelRules('.ai-switch');
	assert.equal(switchRules.length, 1);
	assert.ok(
		parseMinHeightPx(declarationsMap(switchRules[0]).get('min-height')) >= 44,
		'expected .ai-switch min-height >= 44px'
	);

	assert.match(
		source,
		/\{#if\s+!isComposerStoryTarget\(\)\}\s*<div class="ai-setting ai-setting--switch">/
	);
});

test('week calendar renders lg:hidden day cards without slicing posts and hides wide table below lg', () => {
	let weekIfBranch = null;
	walkTemplate(ast.fragment, (node) => {
		if (
			node.type === 'IfBlock' &&
			source.slice(node.test.start, node.test.end).trim() === "calendarView === 'week'"
		) {
			weekIfBranch = node.consequent;
		}
	});

	assert.ok(weekIfBranch, "expected {:else if calendarView === 'week'} branch");
	const weekMarkup = source.slice(weekIfBranch.start, weekIfBranch.end);

	const topDivs = weekIfBranch.nodes.filter((node) => node.type === 'RegularElement');
	assert.equal(
		topDivs.length,
		2,
		'expected mobile card list and desktop table wrapper in week view'
	);

	const mobileClasses = getStaticClassValue(topDivs[0]).split(/\s+/);
	assert.ok(mobileClasses.includes('lg:hidden'), 'expected lg:hidden on mobile week agenda');

	const desktopClasses = getStaticClassValue(topDivs[1]).split(/\s+/);
	assert.ok(desktopClasses.includes('hidden'), 'expected hidden on desktop week table wrapper');
	assert.ok(
		desktopClasses.includes('overflow-x-auto'),
		'expected overflow-x-auto on desktop week table wrapper'
	);
	assert.ok(desktopClasses.includes('lg:block'), 'expected lg:block on desktop week table wrapper');

	const mobileMarkup = source.slice(topDivs[0].start, topDivs[0].end);
	assert.match(mobileMarkup, /\{#each\s+weekDays\s+as\s+day/);
	assert.match(mobileMarkup, /\{#each\s+day\.posts\s+as\s+post\}/);
	assert.doesNotMatch(mobileMarkup, /day\.posts\.slice/);
	assert.match(mobileMarkup, /handleCalendarSlotClick\(day\.date,\s*9\)/);
	assert.match(mobileMarkup, /handleCalendarPostClick\(post\)/);
	assert.match(weekMarkup, /<table class="table min-w-\[1100px\]">/);
});
