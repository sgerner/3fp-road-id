import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const ENCRYPTION_VERSION = 'v1';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function decodeKey(value) {
	const key = cleanText(value);
	if (!key) return null;

	if (/^[A-Fa-f0-9]{64}$/.test(key)) {
		return Buffer.from(key, 'hex');
	}

	try {
		const decoded = Buffer.from(key, 'base64');
		if (decoded.length === 32) return decoded;
	} catch {
		// noop
	}

	return createHash('sha256').update(key).digest();
}

function getEncryptionKey() {
	const key = decodeKey(env.SOCIAL_TOKEN_ENCRYPTION_KEY);
	if (!key || key.length !== 32) {
		throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must resolve to a 32-byte encryption key.');
	}
	return key;
}

export function encryptSocialToken(plainText) {
	const value = cleanText(plainText);
	if (!value) return null;
	const key = getEncryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		ENCRYPTION_VERSION,
		iv.toString('base64url'),
		tag.toString('base64url'),
		encrypted.toString('base64url')
	].join('.');
}

export function decryptSocialToken(cipherText) {
	const value = cleanText(cipherText);
	if (!value) return null;
	const [version, ivRaw, tagRaw, encryptedRaw] = value.split('.');
	if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
		throw new Error('Invalid encrypted social token payload.');
	}

	const key = getEncryptionKey();
	const iv = Buffer.from(ivRaw, 'base64url');
	const tag = Buffer.from(tagRaw, 'base64url');
	const encrypted = Buffer.from(encryptedRaw, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
	return decrypted.toString('utf8');
}
