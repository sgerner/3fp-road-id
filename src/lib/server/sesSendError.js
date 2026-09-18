const ERROR_MESSAGES = new Map([
	[
		'AccessDenied',
		'Amazon SES denied the send request. Grant the configured AWS credentials ses:SendEmail permission.'
	],
	[
		'AccessDeniedException',
		'Amazon SES denied the send request. Grant the configured AWS credentials ses:SendEmail permission.'
	],
	[
		'UnauthorizedOperation',
		'Amazon SES denied the send request. Grant the configured AWS credentials ses:SendEmail permission.'
	],
	[
		'InvalidClientTokenId',
		'Amazon SES could not authenticate the configured AWS credentials. Update the SES access key and secret.'
	],
	[
		'UnrecognizedClientException',
		'Amazon SES could not authenticate the configured AWS credentials. Update the SES access key and secret.'
	],
	[
		'SignatureDoesNotMatch',
		'Amazon SES could not authenticate the configured AWS credentials. Update the SES access key and secret.'
	],
	[
		'ExpiredTokenException',
		'Amazon SES credentials have expired. Refresh the configured AWS credentials.'
	],
	[
		'MessageRejected',
		'Amazon SES rejected this message. Check the recipient address, sender verification, and SES suppression settings.'
	],
	[
		'AccountSendingPausedException',
		'Amazon SES has paused sending for this account. Review the account status in AWS SES.'
	],
	[
		'SendingPausedException',
		'Amazon SES has paused sending for this account. Review the account status in AWS SES.'
	],
	['Throttling', 'Amazon SES is rate limiting email sends. Wait a moment and try again.'],
	['ThrottlingException', 'Amazon SES is rate limiting email sends. Wait a moment and try again.'],
	[
		'LimitExceededException',
		'Amazon SES sending quota has been reached. Review the account sending quota in AWS SES.'
	]
]);

function readErrorCode(error) {
	if (!error || typeof error !== 'object') return '';
	for (const value of [error.name, error.Code, error.code]) {
		if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,99}$/.test(value.trim())) {
			return value.trim();
		}
	}
	return '';
}

function readRequestId(error) {
	const requestId = error?.$metadata?.requestId ?? error?.requestId;
	if (typeof requestId !== 'string') return null;
	const normalized = requestId.trim();
	return normalized && normalized.length <= 160 ? normalized : null;
}

export function describeSesSendFailure(error) {
	const code = readErrorCode(error) || 'SES_SEND_FAILED';
	const requestId = readRequestId(error);
	const rawMessage = typeof error?.message === 'string' ? error.message : '';
	const message =
		code === 'MessageRejected' && /email address is not verified/i.test(rawMessage)
			? 'Amazon SES rejected this message because the sender or recipient is not verified in the configured AWS region. Check AWS_SES_REGION and verify the sender identity there; SES sandbox accounts can send only to verified recipients or mailbox simulator addresses.'
			: ERROR_MESSAGES.get(code) ||
				'Amazon SES could not accept this message. Review the server log for the SES error.';
	return {
		code,
		requestId,
		message: requestId ? `${message} Reference: ${requestId}.` : message
	};
}
