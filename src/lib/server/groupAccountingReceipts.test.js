import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroupAccountingReceiptViewUrl } from './groupAccountingReceipts.js';

const groupId = '00000000-0000-4000-8000-000000000001';
const receiptId = '00000000-0000-4000-8000-000000000002';
const bucketId = 'group-accounting-receipts';

function createSupabaseStub(receipt) {
	const filters = [];
	const signed = [];
	const query = {
		select(columns) {
			assert.equal(columns, 'bucket_id,object_path');
			return query;
		},
		eq(column, value) {
			filters.push([column, value]);
			return query;
		},
		async maybeSingle() {
			return { data: receipt, error: null };
		}
	};
	return {
		filters,
		signed,
		from(table) {
			assert.equal(table, 'group_accounting_receipts');
			return query;
		},
		storage: {
			from(bucket) {
				assert.equal(bucket, bucketId);
				return {
					async createSignedUrl(path, expiresIn) {
						signed.push([path, expiresIn]);
						return { data: { signedUrl: 'https://storage.example/signed' }, error: null };
					}
				};
			}
		}
	};
}

test('receipt view links are scoped to the group and expire quickly', async () => {
	const db = createSupabaseStub({
		bucket_id: bucketId,
		object_path: `${groupId}/feed-items/item/receipt.pdf`
	});
	const signedUrl = await createGroupAccountingReceiptViewUrl(db, groupId, receiptId, bucketId);

	assert.equal(signedUrl, 'https://storage.example/signed');
	assert.deepEqual(db.filters, [
		['group_id', groupId],
		['id', receiptId]
	]);
	assert.deepEqual(db.signed, [[`${groupId}/feed-items/item/receipt.pdf`, 60]]);
});

test('receipt view does not sign missing, cross-group, or unexpected-bucket objects', async () => {
	for (const receipt of [
		null,
		{ bucket_id: bucketId, object_path: '00000000-0000-4000-8000-000000000099/receipt.pdf' },
		{ bucket_id: bucketId, object_path: `${groupId}/../other-group/receipt.pdf` },
		{ bucket_id: 'public-assets', object_path: `${groupId}/receipt.pdf` },
		{ bucket_id: bucketId, object_path: null }
	]) {
		const db = createSupabaseStub(receipt);
		const signedUrl = await createGroupAccountingReceiptViewUrl(db, groupId, receiptId, bucketId);
		assert.equal(signedUrl, null);
		assert.deepEqual(db.signed, []);
	}
});
