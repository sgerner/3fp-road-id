import { env } from '$env/dynamic/private';
import { Vercel } from '@vercel/sdk';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function toFloat(value, fallback = 0) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

function toCents(value) {
	return Math.max(0, Math.round(toFloat(value, 0) * 100));
}

export function normalizeDomain(value) {
	return cleanText(value)
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/.*$/, '')
		.replace(/\.$/, '');
}

function assertDomain(domain) {
	const normalized = normalizeDomain(domain);
	if (!normalized || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalized)) {
		throw new Error('Please enter a valid domain name.');
	}
	return normalized;
}

function getVercelClient() {
	const token = cleanText(env.VERCEL_API_TOKEN);
	if (!token) {
		throw new Error('VERCEL_API_TOKEN is not configured.');
	}
	return new Vercel({ bearerToken: token });
}

function getTeamContext() {
	const teamId = cleanText(env.VERCEL_TEAM_ID);
	const slug = cleanText(env.VERCEL_TEAM_SLUG);
	return {
		...(teamId ? { teamId } : {}),
		...(slug ? { slug } : {})
	};
}

function getProjectIdOrName() {
	const projectIdOrName =
		cleanText(env.VERCEL_MICROSITE_PROJECT_ID) || cleanText(env.VERCEL_PROJECT_ID);
	if (!projectIdOrName) {
		throw new Error('VERCEL_MICROSITE_PROJECT_ID (or VERCEL_PROJECT_ID) is not configured.');
	}
	return projectIdOrName;
}

function mapVerificationToDns(verification = []) {
	if (!Array.isArray(verification)) return [];
	return verification.map((item) => {
		const type = cleanText(item?.type).toUpperCase();
		if (type === 'TXT') {
			return {
				type: 'TXT',
				name: cleanText(item?.domain),
				value: cleanText(item?.value),
				reason: cleanText(item?.reason)
			};
		}
		return {
			type: type || 'UNKNOWN',
			name: cleanText(item?.domain),
			value: cleanText(item?.value),
			reason: cleanText(item?.reason)
		};
	});
}

export async function addDomainToMicrositeProject(domain) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const response = await vercel.projects.addProjectDomain({
		idOrName: getProjectIdOrName(),
		...getTeamContext(),
		requestBody: {
			name: normalized
		}
	});

	return {
		domain: normalized,
		projectId: response.projectId || getProjectIdOrName(),
		verified: response.verified === true,
		verification: response.verification || [],
		dnsRecords: mapVerificationToDns(response.verification || [])
	};
}

export async function verifyMicrositeProjectDomain(domain) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const response = await vercel.projects.verifyProjectDomain({
		idOrName: getProjectIdOrName(),
		domain: normalized,
		...getTeamContext()
	});
	return {
		domain: normalized,
		verified: response.verified === true,
		verification: response.verification || [],
		dnsRecords: mapVerificationToDns(response.verification || [])
	};
}

export async function getDomainConfigForProject(domain) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const response = await vercel.domains.getDomainConfig({
		domain: normalized,
		projectIdOrName: getProjectIdOrName(),
		...getTeamContext()
	});
	return {
		domain: normalized,
		configuredBy: response.configuredBy || null,
		acceptedChallenges: Array.isArray(response.acceptedChallenges)
			? response.acceptedChallenges
			: [],
		recommendedIPv4: Array.isArray(response.recommendedIPv4) ? response.recommendedIPv4 : [],
		recommendedCNAME: Array.isArray(response.recommendedCNAME) ? response.recommendedCNAME : [],
		misconfigured: response.misconfigured === true
	};
}

export async function searchBulkDomainAvailability(domains = []) {
	const vercel = getVercelClient();
	const normalized = Array.from(new Set(domains.map((value) => assertDomain(value)))).slice(0, 50);
	if (!normalized.length) return [];
	const response = await vercel.domainsRegistrar.getBulkAvailability({
		...getTeamContext(),
		requestBody: {
			domains: normalized
		}
	});
	return Array.isArray(response?.results)
		? response.results.map((item) => ({
				domain: normalizeDomain(item?.domain),
				available: item?.available === true
			}))
		: [];
}

export async function getDomainPriceQuote(domain, years = 1) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const safeYears = Math.max(1, Math.min(10, Number.isFinite(Number(years)) ? Number(years) : 1));
	const response = await vercel.domainsRegistrar.getDomainPrice({
		domain: normalized,
		years: String(safeYears),
		...getTeamContext()
	});
	return {
		domain: normalized,
		years: Number(response?.years || safeYears),
		purchasePriceCents: toCents(response?.purchasePrice),
		renewalPriceCents: toCents(response?.renewalPrice),
		transferPriceCents: toCents(response?.transferPrice)
	};
}

export async function buyDomainWithVercel({
	domain,
	years = 1,
	autoRenew = true,
	expectedPriceCents,
	contactInformation
}) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const safeYears = Math.max(1, Math.min(10, Number.isFinite(Number(years)) ? Number(years) : 1));
	const expectedPrice = toFloat(expectedPriceCents, 0) / 100;
	if (!(expectedPrice > 0)) {
		throw new Error('Expected domain purchase price is required.');
	}

	const response = await vercel.domainsRegistrar.buySingleDomain({
		domain: normalized,
		...getTeamContext(),
		requestBody: {
			autoRenew: autoRenew === true,
			years: safeYears,
			expectedPrice,
			contactInformation
		}
	});

	return {
		domain: normalized,
		orderId: cleanText(response?.orderId),
		links: response?.links || {}
	};
}

export async function getVercelDomainOrder(orderId) {
	const vercel = getVercelClient();
	const cleanedOrderId = cleanText(orderId);
	if (!cleanedOrderId) throw new Error('Vercel order id is required.');
	return vercel.domainsRegistrar.getOrder({
		orderId: cleanedOrderId,
		...getTeamContext()
	});
}

export async function renewDomainWithVercel({ domain, years = 1, expectedPriceCents }) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	const safeYears = Math.max(1, Math.min(10, Number.isFinite(Number(years)) ? Number(years) : 1));
	const expectedPrice = toFloat(expectedPriceCents, 0) / 100;
	if (!(expectedPrice > 0)) {
		throw new Error('Expected renewal price is required.');
	}
	return vercel.domainsRegistrar.renewDomain({
		domain: normalized,
		...getTeamContext(),
		requestBody: {
			years: safeYears,
			expectedPrice
		}
	});
}

export async function updateVercelDomainAutoRenew({ domain, autoRenew }) {
	const vercel = getVercelClient();
	const normalized = assertDomain(domain);
	await vercel.domainsRegistrar.updateDomainAutoRenew({
		domain: normalized,
		...getTeamContext(),
		requestBody: {
			autoRenew: autoRenew === true
		}
	});
	return {
		domain: normalized,
		autoRenew: autoRenew === true
	};
}

export async function listProjectDomains() {
	const vercel = getVercelClient();
	const response = await vercel.projects.getProjectDomains({
		idOrName: getProjectIdOrName(),
		...getTeamContext()
	});
	return Array.isArray(response?.domains) ? response.domains : [];
}
