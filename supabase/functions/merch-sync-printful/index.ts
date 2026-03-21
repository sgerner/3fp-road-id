/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('PROJECT_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRINTFUL_CLIENT_ID = Deno.env.get('PRINTFUL_CLIENT_ID') || '';
const PRINTFUL_CLIENT_SECRET = Deno.env.get('PRINTFUL_CLIENT_SECRET') || '';
const PRINTFUL_OAUTH_URL = 'https://www.printful.com/oauth/token';
const PRINTFUL_API_BASE_URL = 'https://api.printful.com/v2';

function cleanText(value: unknown, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned;
}

function normalizePositiveInt(value: unknown) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseMoneyStringToCents(value: unknown, fallback = 0) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.round(value * 100));
	}
	const cleaned = cleanText(value, 120).replace(/[^0-9.-]/g, '');
	if (!cleaned) return fallback;
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : fallback;
}

function slugifyName(name: string) {
	return cleanText(name, 120)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function buildImportedProductSlug(name: string, externalProductId: string) {
	const base = slugifyName(name) || 'printful-product';
	const suffix = cleanText(externalProductId, 40)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${base}-${suffix || 'pf'}`.slice(0, 80);
}

function normalizeResultList(payload: any) {
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.result)) return payload.result;
	if (Array.isArray(payload?.result?.data)) return payload.result.data;
	return [];
}

function resolveNextHref(payload: any) {
	const href =
		cleanText(payload?._links?.next?.href, 4000) ||
		cleanText(payload?.links?.next?.href, 4000) ||
		cleanText(payload?.paging?.next, 4000) ||
		cleanText(payload?.result?.paging?.next, 4000);
	if (!href) return '';
	if (href.startsWith(PRINTFUL_API_BASE_URL)) return href.slice(PRINTFUL_API_BASE_URL.length);
	if (href.startsWith('https://api.printful.com'))
		return href.slice('https://api.printful.com'.length);
	return href;
}

function extractPrintfulProductName(product: any) {
	return (
		cleanText(
			product?.name ||
				product?.display_name ||
				product?.title ||
				product?.external_data?.name ||
				product?.sync_product?.name,
			160
		) || 'Printful Product'
	);
}

function extractPrintfulProductDescription(product: any) {
	return (
		cleanText(
			product?.description ||
				product?.external_data?.description ||
				product?.sync_product?.description ||
				product?.product?.description,
			3000
		) || null
	);
}

function extractPrintfulProductImageUrl(product: any) {
	return (
		cleanText(
			product?.thumbnail_url ||
				product?.image ||
				product?.image_url ||
				product?.product?.image ||
				product?.external_data?.image_url,
			2000
		) || null
	);
}

function collectPrintfulOptionValues(variant: any) {
	const optionValues: Record<string, string> = {};
	const explicitColor = cleanText(
		variant?.color ||
			variant?.color_name ||
			variant?.catalog_color ||
			variant?.external_data?.color,
		80
	);
	const explicitSize = cleanText(
		variant?.size || variant?.size_name || variant?.catalog_size || variant?.external_data?.size,
		80
	);
	if (explicitColor) optionValues.color = explicitColor;
	if (explicitSize) optionValues.size = explicitSize;

	for (const option of Array.isArray(variant?.options) ? variant.options : []) {
		const key = cleanText(option?.id || option?.name || option?.option || option?.title, 80)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_');
		const value = cleanText(option?.value || option?.display_value || option?.name, 80);
		if (!key || !value) continue;
		if (key.includes('color') && !optionValues.color) optionValues.color = value;
		else if (key.includes('size') && !optionValues.size) optionValues.size = value;
		else optionValues[key] = value;
	}

	return optionValues;
}

function extractPrintfulVariantName(variant: any) {
	return (
		cleanText(
			variant?.name || variant?.display_name || variant?.title || variant?.variant_name,
			160
		) || 'Variant'
	);
}

function buildPrintfulPartnerVariantRef({
	productId,
	variantId,
	catalogVariantId,
	placements
}: {
	productId: string;
	variantId: string;
	catalogVariantId?: string;
	placements?: unknown[];
}) {
	const payload: Record<string, unknown> = {
		product_id: cleanText(productId, 120),
		variant_id: cleanText(variantId, 120)
	};
	const cleanCatalogVariantId = cleanText(catalogVariantId, 120);
	if (cleanCatalogVariantId) payload.catalog_variant_id = cleanCatalogVariantId;
	if (Array.isArray(placements) && placements.length) payload.placements = placements;
	return JSON.stringify(payload);
}

async function refreshPrintfulAccessToken(refreshToken: string) {
	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: PRINTFUL_CLIENT_ID,
		client_secret: PRINTFUL_CLIENT_SECRET
	});
	const response = await fetch(PRINTFUL_OAUTH_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: body.toString()
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(
			payload?.error?.message || payload?.message || 'Failed to refresh Printful token.'
		);
	}
	const expiresAt = Number(payload?.expires_at);
	return {
		access_token: cleanText(payload?.access_token, 4000),
		refresh_token: cleanText(payload?.refresh_token, 4000) || refreshToken,
		token_type: cleanText(payload?.token_type, 40) || 'Bearer',
		scopes: cleanText(payload?.scope, 4000)
			.split(/[\s,]+/)
			.map((entry) => cleanText(entry, 120))
			.filter(Boolean),
		access_token_expires_at: Number.isFinite(expiresAt)
			? new Date(expiresAt * 1000).toISOString()
			: null,
		refresh_token_expires_at: null
	};
}

async function printfulRequest(
	accessToken: string,
	path: string,
	{
		method = 'GET',
		body,
		storeId
	}: { method?: string; body?: unknown; storeId?: number | null } = {}
) {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
		Accept: 'application/json'
	};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (storeId) headers['X-PF-Store-Id'] = String(storeId);
	const response = await fetch(`${PRINTFUL_API_BASE_URL}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(
			payload?.error?.message || payload?.message || `Printful request failed (${response.status})`
		);
	}
	return payload;
}

async function listPrintfulProductsWithVariants(accessToken: string, storeId: number) {
	const products: any[] = [];
	let nextPath = '/products?limit=100';
	while (nextPath) {
		const payload = await printfulRequest(accessToken, nextPath, { storeId });
		products.push(...normalizeResultList(payload));
		nextPath = resolveNextHref(payload);
	}

	const result = [];
	for (const product of products) {
		const productId = cleanText(product?.id, 120);
		if (!productId) continue;
		const variants: any[] = [];
		let nextVariantPath = `/products/${encodeURIComponent(productId)}/variants?limit=100`;
		while (nextVariantPath) {
			const payload = await printfulRequest(accessToken, nextVariantPath, { storeId });
			variants.push(...normalizeResultList(payload));
			nextVariantPath = resolveNextHref(payload);
		}
		result.push({ ...product, variants });
	}
	return result;
}

async function syncStore(
	supabase: ReturnType<typeof createClient>,
	store: any,
	partnerAccount: any
) {
	const syncedAt = new Date().toISOString();
	const refreshed = await refreshPrintfulAccessToken(
		cleanText(partnerAccount?.refresh_token, 4000)
	);
	const { error: accountError } = await supabase
		.from('merch_partner_accounts')
		.update({
			access_token: refreshed.access_token,
			refresh_token: refreshed.refresh_token,
			token_type: refreshed.token_type,
			scopes: refreshed.scopes,
			access_token_expires_at: refreshed.access_token_expires_at,
			last_refreshed_at: syncedAt,
			last_error: null,
			updated_at: syncedAt
		})
		.eq('id', partnerAccount.id);
	if (accountError) throw new Error(accountError.message);

	const printfulStoreId = normalizePositiveInt(store?.printful_store_id);
	if (!printfulStoreId) throw new Error('Printful store id is missing.');
	const printfulProducts = await listPrintfulProductsWithVariants(
		refreshed.access_token,
		printfulStoreId
	);

	const seenProductIds = new Set<string>();
	const seenVariantIdsByProductId = new Map<string, Set<string>>();
	let productCount = 0;
	let variantCount = 0;

	for (const product of printfulProducts) {
		const externalProductId = cleanText(product?.id, 120);
		if (!externalProductId) continue;
		seenProductIds.add(externalProductId);
		const productName = extractPrintfulProductName(product);

		const { data: productRows, error: productError } = await supabase
			.from('merch_products')
			.upsert(
				{
					store_id: store.id,
					name: productName,
					slug: buildImportedProductSlug(productName, externalProductId),
					description: extractPrintfulProductDescription(product),
					image_url: extractPrintfulProductImageUrl(product),
					status: 'active',
					default_partner: 'printful',
					source_of_truth: 'printful',
					external_provider: 'printful',
					external_product_id: externalProductId,
					external_store_id: printfulStoreId,
					external_synced_at: syncedAt,
					metadata: { printful_product: product },
					updated_at: syncedAt
				},
				{ onConflict: 'store_id,external_provider,external_product_id' }
			)
			.select('id')
			.limit(1);
		if (productError) throw new Error(productError.message);
		const localProduct = productRows?.[0];
		if (!localProduct?.id) continue;
		productCount += 1;

		const seenVariantIds = new Set<string>();
		for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
			const externalVariantId = cleanText(variant?.id, 120);
			if (!externalVariantId) continue;
			const priceCents = parseMoneyStringToCents(variant?.retail_price ?? variant?.price, 0);
			if (priceCents <= 0) continue;
			seenVariantIds.add(externalVariantId);
			const catalogVariantId = cleanText(
				variant?.catalog_variant_id || variant?.catalogVariantId,
				120
			);

			const { error: variantError } = await supabase.from('merch_product_variants').upsert(
				{
					product_id: localProduct.id,
					name: extractPrintfulVariantName(variant),
					sku: cleanText(variant?.sku || variant?.external_id, 120) || null,
					option_values: collectPrintfulOptionValues(variant),
					partner_provider: 'printful',
					partner_variant_ref: buildPrintfulPartnerVariantRef({
						productId: externalProductId,
						variantId: externalVariantId,
						catalogVariantId,
						placements: Array.isArray(variant?.placements) ? variant.placements : undefined
					}),
					price_cents: priceCents,
					cost_cents: parseMoneyStringToCents(variant?.price ?? variant?.cost, 0) || null,
					is_active:
						variant?.is_enabled === false || variant?.availability_status === 'discontinued'
							? false
							: true,
					catalog_variant_id: normalizePositiveInt(catalogVariantId),
					external_variant_id: externalVariantId,
					external_synced_at: syncedAt,
					inventory_count:
						variant?.in_stock === false
							? 0
							: Number.isFinite(Number(variant?.stock))
								? Number(variant.stock)
								: null,
					updated_at: syncedAt
				},
				{ onConflict: 'product_id,external_variant_id' }
			);
			if (variantError) throw new Error(variantError.message);
			variantCount += 1;
		}
		seenVariantIdsByProductId.set(localProduct.id, seenVariantIds);
	}

	const { data: existingProducts, error: existingProductsError } = await supabase
		.from('merch_products')
		.select('id, external_product_id')
		.eq('store_id', store.id)
		.eq('external_provider', 'printful');
	if (existingProductsError) throw new Error(existingProductsError.message);

	for (const localProduct of existingProducts ?? []) {
		if (!seenProductIds.has(cleanText(localProduct.external_product_id, 120))) {
			const { error } = await supabase
				.from('merch_products')
				.update({ status: 'archived', updated_at: syncedAt })
				.eq('id', localProduct.id);
			if (error) throw new Error(error.message);
			continue;
		}

		const seenVariantIds = seenVariantIdsByProductId.get(localProduct.id) || new Set<string>();
		const { data: localVariants, error: localVariantsError } = await supabase
			.from('merch_product_variants')
			.select('id, external_variant_id')
			.eq('product_id', localProduct.id)
			.eq('partner_provider', 'printful');
		if (localVariantsError) throw new Error(localVariantsError.message);
		for (const localVariant of localVariants ?? []) {
			if (seenVariantIds.has(cleanText(localVariant.external_variant_id, 120))) continue;
			const { error } = await supabase
				.from('merch_product_variants')
				.update({ is_active: false, updated_at: syncedAt })
				.eq('id', localVariant.id);
			if (error) throw new Error(error.message);
		}
	}

	const { error: storeUpdateError } = await supabase
		.from('merch_stores')
		.update({
			printful_last_synced_at: syncedAt,
			printful_last_sync_error: null,
			updated_at: syncedAt
		})
		.eq('id', store.id);
	if (storeUpdateError) throw new Error(storeUpdateError.message);

	return { storeId: store.id, slug: store.slug, productCount, variantCount };
}

Deno.serve(async (req) => {
	if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
		return new Response(JSON.stringify({ error: 'Supabase service role is not configured.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	if (!PRINTFUL_CLIENT_ID || !PRINTFUL_CLIENT_SECRET) {
		return new Response(
			JSON.stringify({ error: 'Printful OAuth credentials are not configured.' }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false }
	});

	const body = await req.json().catch(() => ({}));
	const requestedStoreId = cleanText(body?.store_id || body?.storeId, 64);
	const requestedStoreSlug = cleanText(body?.store_slug || body?.storeSlug, 64);

	let storeQuery = supabase
		.from('merch_stores')
		.select('id, slug, printful_store_id, printful_sync_enabled')
		.not('printful_store_id', 'is', null);
	if (requestedStoreId) storeQuery = storeQuery.eq('id', requestedStoreId);
	else if (requestedStoreSlug) storeQuery = storeQuery.eq('slug', requestedStoreSlug);
	else storeQuery = storeQuery.eq('printful_sync_enabled', true);

	const { data: stores, error: storesError } = await storeQuery;
	if (storesError) {
		return new Response(JSON.stringify({ error: storesError.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	if (!(stores?.length > 0)) {
		return new Response(JSON.stringify({ ok: true, synced: [], failed: [] }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const storeIds = stores.map((store) => store.id);
	const { data: accounts, error: accountsError } = await supabase
		.from('merch_partner_accounts')
		.select('id, store_id, refresh_token')
		.eq('partner_provider', 'printful')
		.in('store_id', storeIds);
	if (accountsError) {
		return new Response(JSON.stringify({ error: accountsError.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const accountMap = new Map((accounts ?? []).map((account) => [account.store_id, account]));
	const synced: unknown[] = [];
	const failed: unknown[] = [];

	for (const store of stores) {
		const partnerAccount = accountMap.get(store.id);
		if (!partnerAccount?.refresh_token) {
			failed.push({
				storeId: store.id,
				slug: store.slug,
				error: 'Missing Printful refresh token.'
			});
			continue;
		}
		try {
			synced.push(await syncStore(supabase, store, partnerAccount));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown Printful sync failure.';
			failed.push({ storeId: store.id, slug: store.slug, error: message });
			await supabase
				.from('merch_stores')
				.update({ printful_last_sync_error: message, updated_at: new Date().toISOString() })
				.eq('id', store.id);
			await supabase
				.from('merch_partner_accounts')
				.update({ last_error: message, updated_at: new Date().toISOString() })
				.eq('id', partnerAccount.id);
		}
	}

	return new Response(JSON.stringify({ ok: true, synced, failed }), {
		headers: { 'Content-Type': 'application/json' }
	});
});
