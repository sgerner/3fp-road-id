import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from 'svelte/compiler';
import { normalizeUsStateCode } from '../geo/usStates.js';

function parseRouteInputs(relativePath) {
	const source = fs.readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
	const ast = parse(source, { modern: true });
	const inputs = [];

	function walk(node) {
		if (!node || typeof node !== 'object') return;
		if (
			(node.type === 'RegularElement' && node.name === 'input') ||
			(node.type === 'Component' && node.name === 'Combobox.Input')
		) {
			const attrs = {};
			const binds = {};
			for (const attr of node.attributes ?? []) {
				if (attr.type === 'Attribute') {
					if (attr.value === true) {
						attrs[attr.name] = true;
					} else if (Array.isArray(attr.value)) {
						attrs[attr.name] = attr.value
							.map((chunk) =>
								chunk.type === 'Text' ? chunk.data : source.slice(chunk.start, chunk.end)
							)
							.join('');
					} else if (attr.value && typeof attr.value === 'object') {
						attrs[attr.name] = source.slice(attr.value.start, attr.value.end);
					}
				} else if (attr.type === 'BindDirective') {
					binds[attr.name] = attr.expression
						? source.slice(attr.expression.start, attr.expression.end)
						: attr.name;
				}
			}
			inputs.push({ tag: node.name, attrs, binds });
		}

		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const item of value) walk(item);
			} else if (value && typeof value === 'object') {
				walk(value);
			}
		}
	}

	walk(ast.fragment);
	return { source, inputs };
}

function findById(inputs, id) {
	return inputs.filter((entry) => entry.attrs.id === id);
}

test('merch checkout personal and shipping inputs expose Technique H98 autocomplete tokens and normalize state autofill', () => {
	const { source, inputs } = parseRouteInputs('src/routes/merch/checkout/+page.svelte');

	assert.equal(findById(inputs, 'customer_name')[0]?.attrs.autocomplete, 'name');
	assert.equal(findById(inputs, 'customer_email')[0]?.attrs.autocomplete, 'email');
	assert.equal(findById(inputs, 'customer_phone')[0]?.attrs.type, 'tel');
	assert.equal(findById(inputs, 'customer_phone')[0]?.attrs.autocomplete, 'tel');

	assert.equal(findById(inputs, 'line1')[0]?.attrs.autocomplete, 'shipping address-line1');
	assert.equal(findById(inputs, 'line2')[0]?.attrs.autocomplete, 'shipping address-line2');
	assert.equal(findById(inputs, 'city')[0]?.attrs.autocomplete, 'shipping address-level2');
	assert.equal(findById(inputs, 'postal')[0]?.attrs.autocomplete, 'shipping postal-code');

	const stateInput = findById(inputs, 'state')[0];
	assert.equal(stateInput?.tag, 'Combobox.Input');
	assert.equal(stateInput?.attrs.autocomplete, 'shipping address-level1');
	assert.ok(stateInput?.attrs.oninput, '#state Combobox.Input should handle native input events');
	assert.ok(stateInput?.attrs.onchange, '#state Combobox.Input should handle native change events');

	assert.match(source, /normalizeUsStateCode/);
	assert.equal(normalizeUsStateCode('OR'), 'OR');
	assert.equal(normalizeUsStateCode('Oregon'), 'OR');
});

test('donate, profile, layout, and auth confirmation routes expose personal autocomplete tokens and preserve honeypots', () => {
	const donate = parseRouteInputs('src/routes/donate/+page.svelte');
	assert.equal(findById(donate.inputs, 'donor_name')[0]?.attrs.autocomplete, 'name');
	assert.equal(findById(donate.inputs, 'donor_email')[0]?.attrs.autocomplete, 'email');

	const profile = parseRouteInputs('src/routes/profile/+page.svelte');
	const fullNameInput = profile.inputs.find((entry) => entry.binds.value === 'fullName');
	assert.equal(fullNameInput?.attrs.autocomplete, 'name');

	const layout = parseRouteInputs('src/routes/+layout.svelte');
	assert.equal(findById(layout.inputs, 'login-email-m')[0]?.attrs.autocomplete, 'email');
	assert.equal(findById(layout.inputs, 'login-email')[0]?.attrs.autocomplete, 'email');
	const layoutHoneypots = layout.inputs.filter((entry) => entry.attrs.name === 'website');
	assert.equal(layoutHoneypots.length, 2);
	assert.ok(layoutHoneypots.every((entry) => entry.attrs.autocomplete === 'off'));

	const authConfirm = parseRouteInputs('src/routes/auth/confirm/+page.svelte');
	assert.equal(findById(authConfirm.inputs, 'resend-email')[0]?.attrs.autocomplete, 'email');
	const confirmHoneypots = authConfirm.inputs.filter((entry) => entry.attrs.name === 'website');
	assert.equal(confirmHoneypots.length, 1);
	assert.equal(confirmHoneypots[0]?.attrs.autocomplete, 'off');
});

test('Road ID scopes personal autocomplete to the rider and disables autofill on emergency contacts and honeypots', () => {
	const roadId = parseRouteInputs('src/routes/roadid/[code]/+page.svelte');

	const emailInputs = findById(roadId.inputs, 'email');
	assert.equal(emailInputs.length, 2);
	assert.ok(emailInputs.every((entry) => entry.attrs.autocomplete === 'email'));

	const fullName = findById(roadId.inputs, 'full_name')[0];
	assert.equal(fullName?.attrs.autocomplete, 'name');
	assert.ok(fullName?.attrs.onchange, '#full_name should save on onchange for autofill');
	assert.ok(fullName?.attrs.onblur, '#full_name should save on onblur');

	const riderPhone = findById(roadId.inputs, 'phone')[0];
	assert.equal(riderPhone?.attrs.autocomplete, 'tel');

	const emergencyContactIds = [
		'{`contact-name-${contact.id}`}',
		'{`contact-relationship-${contact.id}`}',
		'{`contact-phone-${contact.id}`}',
		'contact_name',
		'contact_relationship',
		'contact_phone'
	];
	for (const id of emergencyContactIds) {
		const match = findById(roadId.inputs, id)[0];
		assert.ok(match, `expected emergency contact input ${id}`);
		assert.equal(
			match.attrs.autocomplete,
			'off',
			`emergency contact input ${id} must set autocomplete="off"`
		);
	}

	const roadIdHoneypots = roadId.inputs.filter((entry) => entry.attrs.name === 'website');
	assert.equal(roadIdHoneypots.length, 2);
	assert.ok(roadIdHoneypots.every((entry) => entry.attrs.autocomplete === 'off'));
});
