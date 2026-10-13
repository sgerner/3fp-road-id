import { PUBLIC_URL_BASE } from '$app/env/public';
import { DEFAULT_BRAND_ORIGIN } from '#lib/email/branding';
import { normalizePublicOrigin } from '#lib/security/origin';

export function getConfiguredPublicOrigin() {
	return normalizePublicOrigin(PUBLIC_URL_BASE, DEFAULT_BRAND_ORIGIN);
}
