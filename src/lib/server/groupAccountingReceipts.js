export async function createGroupAccountingReceiptViewUrl(
	serviceSupabase,
	groupId,
	receiptId,
	bucketId
) {
	const { data: receipt, error } = await serviceSupabase
		.from('group_accounting_receipts')
		.select('bucket_id,object_path')
		.eq('group_id', groupId)
		.eq('id', receiptId)
		.maybeSingle();
	if (error) throw new Error('Unable to load receipt.');
	const pathSegments =
		typeof receipt?.object_path === 'string' ? receipt.object_path.split('/') : [];
	if (
		!receipt ||
		receipt.bucket_id !== bucketId ||
		pathSegments.length < 3 ||
		pathSegments[0] !== groupId ||
		pathSegments.some((segment) => !segment || segment === '.' || segment === '..')
	) {
		return null;
	}
	const { data, error: signedUrlError } = await serviceSupabase.storage
		.from(bucketId)
		.createSignedUrl(receipt.object_path, 60);
	if (signedUrlError || !data?.signedUrl) throw new Error('Unable to create receipt link.');
	return data.signedUrl;
}
