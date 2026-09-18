const CREDENTIAL_SETS = [
	{
		accessKeyId: 'AWS_SES_ACCESS_KEY_ID',
		secretAccessKey: 'AWS_SES_SECRET_ACCESS_KEY',
		sessionToken: 'AWS_SESSION_TOKEN'
	},
	{
		accessKeyId: 'AWS_ACCESS_KEY_ID',
		secretAccessKey: 'AWS_SECRET_ACCESS_KEY',
		sessionToken: 'AWS_SESSION_TOKEN'
	},
	{
		accessKeyId: 'AWS_BEDROCK_ACCESS_KEY_ID',
		secretAccessKey: 'AWS_BEDROCK_SECRET_ACCESS_KEY',
		sessionToken: 'AWS_BEDROCK_SESSION_TOKEN'
	}
];

function cleanCredential(value) {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function selectAwsSesCredentials(source) {
	for (const set of CREDENTIAL_SETS) {
		const accessKeyId = cleanCredential(source?.[set.accessKeyId]);
		const secretAccessKey = cleanCredential(source?.[set.secretAccessKey]);
		if (!accessKeyId || !secretAccessKey) continue;

		return {
			accessKeyId,
			secretAccessKey,
			sessionToken: cleanCredential(source?.[set.sessionToken]) || undefined
		};
	}

	return null;
}
