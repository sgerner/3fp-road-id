import assert from 'node:assert/strict';
import test from 'node:test';
import {
	INSUFFICIENT_PRIVILEGE_MESSAGE,
	UNAUTHORIZED_HOST_GROUP_MESSAGE,
	getApiV1ErrorStatus,
	resolveApiV1WriteError
} from './apiV1Errors.js';

test('SQLSTATE 42501 maps to HTTP 403 instead of masking as HTTP 400', () => {
	assert.equal(getApiV1ErrorStatus({ code: '42501' }), 403);
	assert.equal(getApiV1ErrorStatus({ code: '23505' }), 400);
	assert.equal(getApiV1ErrorStatus({ code: '409' }), 409);
});

test('resolveApiV1WriteError returns clear host organization permission copy for unauthorized host_group_id writes', () => {
	const triggerFailure = resolveApiV1WriteError(
		{
			code: '42501',
			message: 'You do not have permission to host an event under this organization.'
		},
		{ tableName: 'volunteer_events', body: { host_group_id: 'group-123' } }
	);
	assert.equal(triggerFailure.status, 403);
	assert.equal(triggerFailure.error, UNAUTHORIZED_HOST_GROUP_MESSAGE);

	const rlsInsertFailure = resolveApiV1WriteError(
		{
			code: '42501',
			message: 'new row violates row-level security policy for table "volunteer_events"'
		},
		{ tableName: 'volunteer_events', body: { title: 'Clean Up', host_group_id: 'group-456' } }
	);
	assert.equal(rlsInsertFailure.status, 403);
	assert.equal(rlsInsertFailure.error, UNAUTHORIZED_HOST_GROUP_MESSAGE);
});

test('resolveApiV1WriteError returns generic 403 for non-host-group privilege rejections and 400 for validation errors', () => {
	const genericForbidden = resolveApiV1WriteError(
		{ code: '42501', message: 'new row violates row-level security policy' },
		{ tableName: 'profiles', body: { full_name: 'Alice' } }
	);
	assert.equal(genericForbidden.status, 403);
	assert.equal(genericForbidden.error, INSUFFICIENT_PRIVILEGE_MESSAGE);

	const badRequest = resolveApiV1WriteError(
		{ code: '22P02', message: 'invalid input syntax for type uuid' },
		{ tableName: 'volunteer_events', body: { title: 'Test' } }
	);
	assert.equal(badRequest.status, 400);
	assert.equal(badRequest.error, 'Unable to complete request.');
});
