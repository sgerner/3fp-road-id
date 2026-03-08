import { randomBytes } from 'node:crypto';
import { sendEmail } from '$lib/services/email';
import {
	calculatePrintfulShippingRatesV2,
	listPrintfulProductsWithVariantsV2,
	listPrintfulStoresV2,
	refreshPrintfulAccessToken,
	sendPrintfulRequest
} from '$lib/server/printful';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { getStripeClient, resolvePublicBaseUrl } from '$lib/server/stripe';

const MAIN_STORE_SLUG = 'main';
const MAX_CART_LINES = 30;
const MAX_QTY_PER_LINE = 20;
const MERCH_IMAGE_BUCKET = 'merch-media';
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PRINTFUL_PROVIDER = 'printful';
const PRINTFUL_ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PRINTFUL_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
	if (!value || typeof value !== 'string') return '';
	const cleaned = value.trim().toLowerCase();
	return /^\S+@\S+\.\S+$/.test(cleaned) ? cleaned : '';
}

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizePositiveInt(value, fallback = 0) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function toCents(value, fallback = 0) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.round(parsed));
}

function formatCurrency(cents, currency = 'usd') {
	const amount = Number(cents || 0) / 100;
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: String(currency || 'usd').toUpperCase()
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

function normalizeCartItems(items) {
	if (!Array.isArray(items)) return [];
	const out = [];
	for (const raw of items.slice(0, MAX_CART_LINES)) {
		const variantId = cleanText(raw?.variantId || raw?.variant_id, 64);
		const quantity = normalizePositiveInt(raw?.quantity, 0);
		if (!variantId || quantity <= 0) continue;
		out.push({ variantId, quantity: Math.min(quantity, MAX_QTY_PER_LINE) });
	}
	return out;
}

function createOrderNumber() {
	const ts = Date.now().toString(36).toUpperCase();
	const suffix = randomBytes(3).toString('hex').toUpperCase();
	return `M-${ts}-${suffix}`;
}

function sanitizeAddress(address = {}) {
	return {
		line1: cleanText(address?.line1, 120),
		line2: cleanText(address?.line2, 120),
		city: cleanText(address?.city, 80),
		state: cleanText(address?.state, 80),
		postal_code: cleanText(address?.postal_code, 20),
		country: cleanText(address?.country || 'US', 2).toUpperCase()
	};
}

function inferImageExtension(contentType) {
	if (contentType.includes('jpeg')) return 'jpg';
	if (contentType.includes('png')) return 'png';
	if (contentType.includes('webp')) return 'webp';
	if (contentType.includes('gif')) return 'gif';
	return 'img';
}

function normalizeMerchImageFile(input) {
	if (!input || typeof input !== 'object') return null;
	if (typeof input.arrayBuffer !== 'function') return null;
	const size = Number(input.size || 0);
	if (size <= 0) return null;
	return input;
}

function summarizeOptionValues(optionValues) {
	if (!optionValues || typeof optionValues !== 'object') return '';
	return Object.entries(optionValues)
		.map(([k, v]) => `${k}: ${v}`)
		.join(' · ');
}

async function getServiceSupabase() {
	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}
	return supabase;
}

export async function getMerchStoreBySlug(slug = MAIN_STORE_SLUG) {
	const supabase = await getServiceSupabase();
	const storeSlug = cleanText(slug || MAIN_STORE_SLUG, 64) || MAIN_STORE_SLUG;
	const { data: store, error } = await supabase
		.from('merch_stores')
		.select('*')
		.eq('slug', storeSlug)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!store) throw new Error('Merch store not found.');
	return store;
}

async function getMerchStoreById(supabase, storeId) {
	const id = cleanText(storeId, 64);
	if (!id) return null;
	const { data: store, error } = await supabase
		.from('merch_stores')
		.select('*')
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return store ?? null;
}

async function getMerchStoreByGroupId(supabase, groupId) {
	if (!groupId) return null;
	const { data: store, error } = await supabase
		.from('merch_stores')
		.select('*')
		.eq('group_id', groupId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return store ?? null;
}

function summarizePartnerAccount(account) {
	if (!account) return null;
	return {
		id: account.id,
		store_id: account.store_id,
		partner_provider: account.partner_provider,
		account_label: account.account_label || null,
		external_account_id: account.external_account_id || null,
		token_type: account.token_type || null,
		scopes: Array.isArray(account.scopes) ? account.scopes : [],
		access_token_expires_at: account.access_token_expires_at || null,
		refresh_token_expires_at: account.refresh_token_expires_at || null,
		connected_at: account.connected_at || null,
		disconnected_at: account.disconnected_at || null,
		last_refreshed_at: account.last_refreshed_at || null,
		last_error: account.last_error || null,
		updated_at: account.updated_at || null
	};
}

async function getMerchPartnerAccountRecord(
	supabase,
	storeId,
	partnerProvider = PRINTFUL_PROVIDER
) {
	const { data, error } = await supabase
		.from('merch_partner_accounts')
		.select('*')
		.eq('store_id', storeId)
		.eq('partner_provider', partnerProvider)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

function buildPrintfulRefreshExpiry() {
	return new Date(Date.now() + PRINTFUL_REFRESH_TOKEN_TTL_MS).toISOString();
}

function parsePrintfulPartnerRef(value) {
	const cleaned = cleanText(value, 2000);
	if (!cleaned) return null;

	if (cleaned.startsWith('{')) {
		try {
			const parsed = JSON.parse(cleaned);
			const productId = cleanText(parsed?.product_id || parsed?.productId, 120);
			const variantId = cleanText(parsed?.variant_id || parsed?.variantId, 120);
			const catalogVariantId = cleanText(
				parsed?.catalog_variant_id || parsed?.catalogVariantId,
				120
			);
			if ((!productId || !variantId) && !catalogVariantId) return null;
			return {
				productId,
				variantId,
				catalogVariantId,
				placements: normalizePrintfulPlacements(parsed?.placements)
			};
		} catch {
			return null;
		}
	}

	const [productId, variantId] = cleaned.split(':').map((entry) => cleanText(entry, 120));
	if (!productId || !variantId) return null;
	return { productId, variantId };
}

function normalizePrintfulPlacements(placements) {
	if (!Array.isArray(placements)) return [];
	const normalized = [];
	for (const placement of placements) {
		const layers = [];
		for (const layer of Array.isArray(placement?.layers) ? placement.layers : []) {
			const layerId = cleanText(layer?.id, 120);
			const layerUrl = cleanText(layer?.url, 2000);
			if (!layerId && !layerUrl) continue;

			const normalizedLayer = {};
			if (layerId) normalizedLayer.id = layerId;
			if (layerUrl) normalizedLayer.url = layerUrl;

			const layerType = cleanText(layer?.type, 40);
			if (layerType) normalizedLayer.type = layerType;
			if (layer?.position && typeof layer.position === 'object') normalizedLayer.position = layer.position;
			if (Array.isArray(layer?.layer_options) && layer.layer_options.length) {
				normalizedLayer.layer_options = layer.layer_options;
			}
			layers.push(normalizedLayer);
		}
		if (!layers.length) continue;

		const normalizedPlacement = { layers };
		const placementName = cleanText(placement?.placement, 120);
		if (placementName) normalizedPlacement.placement = placementName;
		const technique = cleanText(placement?.technique, 120);
		if (technique) normalizedPlacement.technique = technique;
		if (Array.isArray(placement?.placement_options) && placement.placement_options.length) {
			normalizedPlacement.placement_options = placement.placement_options;
		}
		normalized.push(normalizedPlacement);
	}
	return normalized;
}

function buildPrintfulItemPayload(item) {
	const printfulRef = parsePrintfulPartnerRef(item.partner_variant_ref || '');
	if (!printfulRef?.catalogVariantId && (!printfulRef?.productId || !printfulRef?.variantId)) {
		throw new Error(
			'Printful v2 items require product/variant ids or a catalog variant id.'
		);
	}

	const catalogVariantId = normalizePositiveInt(printfulRef.catalogVariantId, null);
	const productTemplateId = normalizePositiveInt(printfulRef.productId, null);
	const templateVariantId = normalizePositiveInt(printfulRef.variantId, null);
	let payload = null;

	if (catalogVariantId) {
		payload = {
			source: 'catalog',
			catalog_variant_id: catalogVariantId,
			quantity: item.quantity,
			retail_price: (item.unit_price_cents / 100).toFixed(2),
			name: `${item.product_name} - ${item.variant_name}`
		};
	} else if (productTemplateId && templateVariantId) {
		payload = {
			source: 'product_template',
			product_template_id: productTemplateId,
			variant_id: templateVariantId,
			quantity: item.quantity,
			retail_price: (item.unit_price_cents / 100).toFixed(2),
			name: `${item.product_name} - ${item.variant_name}`
		};
	} else {
		throw new Error(
			'Printful order item is missing a numeric catalog variant id. Re-sync the catalog and try again.'
		);
	}

	const placements = normalizePrintfulPlacements(printfulRef.placements);
	if (placements.length) {
		payload.placements = placements;
	}
	return payload;
}

async function upsertPrintfulPartnerAccountRecord(
	supabase,
	store,
	tokenSet,
	{ connectedAt = null, disconnectedAt = null, lastError = null } = {}
) {
	const storeLabel = cleanText(store?.name, 160) || 'Printful';
	const nowIso = new Date().toISOString();
	const payload = {
		store_id: store.id,
		partner_provider: PRINTFUL_PROVIDER,
		account_label: storeLabel,
		external_account_id: cleanText(store?.slug, 160) || null,
		access_token: cleanText(tokenSet?.accessToken, 4000) || null,
		refresh_token: cleanText(tokenSet?.refreshToken, 4000) || null,
		token_type: cleanText(tokenSet?.tokenType, 40) || 'Bearer',
		scopes: Array.isArray(tokenSet?.scopes) ? tokenSet.scopes : [],
		access_token_expires_at: tokenSet?.accessTokenExpiresAt || null,
		refresh_token_expires_at: tokenSet?.refreshToken ? buildPrintfulRefreshExpiry() : null,
		connected_at: connectedAt || nowIso,
		disconnected_at: disconnectedAt,
		last_refreshed_at: nowIso,
		last_error: lastError,
		metadata: {
			store_slug: store.slug,
			recipient_type: store.recipient_type
		},
		updated_at: nowIso
	};

	const { data, error } = await supabase
		.from('merch_partner_accounts')
		.upsert(payload, { onConflict: 'store_id,partner_provider' })
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function setPrintfulPartnerError(supabase, storeId, message) {
	const { error } = await supabase
		.from('merch_partner_accounts')
		.update({
			last_error: cleanText(message, 1000) || null,
			updated_at: new Date().toISOString()
		})
		.eq('store_id', storeId)
		.eq('partner_provider', PRINTFUL_PROVIDER);
	if (error) throw new Error(error.message);
}

async function getValidPrintfulAccessToken(supabase, store, { forceRefresh = false } = {}) {
	const account = await getMerchPartnerAccountRecord(supabase, store.id, PRINTFUL_PROVIDER);
	if (!account || !account.refresh_token) {
		throw new Error('Printful is not connected for this merch store.');
	}

	const accessToken = cleanText(account.access_token, 4000);
	const expiresAtMs = Date.parse(account.access_token_expires_at || '');
	if (
		!forceRefresh &&
		accessToken &&
		(!Number.isFinite(expiresAtMs) ||
			expiresAtMs > Date.now() + PRINTFUL_ACCESS_TOKEN_REFRESH_BUFFER_MS)
	) {
		return accessToken;
	}

	try {
		const refreshed = await refreshPrintfulAccessToken({ refreshToken: account.refresh_token });
		const updatedAccount = await upsertPrintfulPartnerAccountRecord(supabase, store, refreshed, {
			connectedAt: account.connected_at || new Date().toISOString()
		});
		return cleanText(updatedAccount?.access_token, 4000);
	} catch (error) {
		await setPrintfulPartnerError(supabase, store.id, error?.message || 'Failed to refresh token.');
		throw error;
	}
}

function normalizePrintfulStoreSummary(rawStore) {
	if (!rawStore || typeof rawStore !== 'object') return null;
	const id = cleanText(rawStore?.id || rawStore?.store_id, 120);
	if (!id) return null;
	return {
		id,
		name:
			cleanText(rawStore?.name || rawStore?.store_name || rawStore?.label, 200) ||
			`Store ${id}`,
		type: cleanText(rawStore?.type || rawStore?.kind, 120) || null,
		status: cleanText(rawStore?.status, 120) || null,
		isDefault: rawStore?.is_default === true
	};
}

function parseMoneyStringToCents(value, fallback = 0) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.round(value * 100));
	}
	const cleaned = cleanText(value, 120).replace(/[^0-9.-]/g, '');
	if (!cleaned) return fallback;
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : fallback;
}

function extractPrintfulProductName(product) {
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

function extractPrintfulProductDescription(product) {
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

function extractPrintfulProductImageUrl(product) {
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

function resolveMerchProductImages(product) {
	const seen = new Set();
	const ordered = [];
	const push = (value) => {
		const url = cleanText(value, 2000);
		if (!url || seen.has(url)) return;
		seen.add(url);
		ordered.push(url);
	};

	const metadataImages = Array.isArray(product?.metadata?.printful_images)
		? product.metadata.printful_images
		: [];
	for (const image of metadataImages) push(image);
	push(product?.image_url);

	return ordered;
}

async function collectPrintfulProductImageGallery({ accessToken, storeId, product }) {
	const seen = new Set();
	const images = [];
	const details = [];
	const addImage = (url, source, extra = {}) => {
		const cleanUrl = cleanText(url, 2000);
		if (!cleanUrl || seen.has(cleanUrl)) return;
		seen.add(cleanUrl);
		images.push(cleanUrl);
		details.push({
			url: cleanUrl,
			source,
			placement: cleanText(extra?.placement, 120) || null,
			catalog_variant_id: cleanText(extra?.catalogVariantId, 120) || null
		});
	};

	// Only ingest store-synced visuals. Catalog-variant image endpoints return generic/full mockup sets
	// that do not respect a merchant's selected mockups and can omit artwork overlays.
	const featuredImageUrl = extractPrintfulProductImageUrl(product);
	if (featuredImageUrl) addImage(featuredImageUrl, 'sync_product_thumbnail');
	addImage(product?.thumbnail_url, 'sync_product_thumbnail');
	addImage(product?.preview_url, 'sync_product_preview');
	addImage(product?.image_url, 'sync_product_image');

	for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
		addImage(variant?.thumbnail_url, 'sync_variant_thumbnail');
		addImage(variant?.preview_url, 'sync_variant_preview');
		addImage(variant?.image_url, 'sync_variant_image');

		for (const file of Array.isArray(variant?.files) ? variant.files : []) {
			addImage(file?.preview_url, 'sync_variant_file_preview');
			addImage(file?.thumbnail_url, 'sync_variant_file_thumbnail');
			addImage(file?.url, 'sync_variant_file');
		}

		for (const placement of Array.isArray(variant?.placements) ? variant.placements : []) {
			for (const layer of Array.isArray(placement?.layers) ? placement.layers : []) {
				addImage(layer?.url, 'sync_variant_layer', { placement: placement?.placement || null });
			}
		}
	}

	return {
		featuredImageUrl: images[0] || featuredImageUrl || null,
		images,
		details
	};
}

function collectPrintfulOptionValues(variant) {
	const optionValues = {};
	const explicitColor = cleanText(
		variant?.color || variant?.color_name || variant?.catalog_color || variant?.external_data?.color,
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

function extractPrintfulVariantName(variant) {
	return (
		cleanText(
			variant?.name || variant?.display_name || variant?.title || variant?.variant_name,
			160
		) || 'Variant'
	);
}

function buildPrintfulPartnerVariantRef({ productId, variantId, catalogVariantId, placements }) {
	const payload = {
		product_id: cleanText(productId, 120),
		variant_id: cleanText(variantId, 120)
	};
	const cleanCatalogVariantId = cleanText(catalogVariantId, 120);
	if (cleanCatalogVariantId) payload.catalog_variant_id = cleanCatalogVariantId;
	const normalizedPlacements = normalizePrintfulPlacements(placements);
	if (normalizedPlacements.length) payload.placements = normalizedPlacements;
	return JSON.stringify(payload);
}

function normalizePrintfulShippingOption(option) {
	if (!option || typeof option !== 'object') return null;
	const id =
		cleanText(option?.id || option?.shipping || option?.shipping_id || option?.rate_id, 120) ||
		cleanText(option?.name, 120);
	if (!id) return null;
	const amountCents = parseMoneyStringToCents(
		option?.rate ?? option?.price ?? option?.shipping_rate ?? option?.amount,
		0
	);
	const minDays = normalizePositiveInt(option?.min_delivery_days, null);
	const maxDays = normalizePositiveInt(option?.max_delivery_days, null);
	return {
		id,
		name:
			cleanText(option?.name || option?.shipping_name || option?.shipping, 160) || 'Shipping',
		amountCents,
		currency: cleanText(option?.currency, 12) || 'USD',
		minDeliveryDays: minDays,
		maxDeliveryDays: maxDays,
		raw: option
	};
}

function buildPrintfulRecipient(address, order = {}) {
	return {
		full_name: cleanText(order?.customer_name, 160) || 'Customer',
		address1: address.line1,
		address2: address.line2 || undefined,
		city: address.city,
		state_code: address.state,
		country_code: address.country,
		zip: address.postal_code,
		email: cleanText(order?.customer_email, 200) || undefined,
		phone_number: cleanText(order?.customer_phone, 60) || undefined
	};
}

function buildPrintfulShippingItemPayload(item) {
	const printfulRef = parsePrintfulPartnerRef(item.partner_variant_ref || '');
	if (!printfulRef) {
		throw new Error('Printful item reference is missing or invalid.');
	}

	const catalogVariantId = normalizePositiveInt(printfulRef.catalogVariantId, null);
	if (catalogVariantId) {
		return {
			source: 'catalog',
			catalog_variant_id: catalogVariantId,
			quantity: item.quantity
		};
	}

	const productTemplateId = normalizePositiveInt(printfulRef.productId, null);
	const templateVariantId = normalizePositiveInt(printfulRef.variantId, null);
	if (productTemplateId && templateVariantId) {
		return {
			source: 'product_template',
			product_template_id: productTemplateId,
			variant_id: templateVariantId,
			quantity: item.quantity
		};
	}

	const fallbackCatalogVariantId = normalizePositiveInt(printfulRef.variantId, null);
	if (fallbackCatalogVariantId) {
		return {
			source: 'catalog',
			catalog_variant_id: fallbackCatalogVariantId,
			quantity: item.quantity
		};
	}
	throw new Error(
		'Printful shipping item is missing a numeric catalog variant id. Re-sync the catalog and try again.'
	);
}

export async function getOrCreateGroupMerchStore(group) {
	const supabase = await getServiceSupabase();
	if (!group?.id) throw new Error('Group is required.');

	const existing = await getMerchStoreByGroupId(supabase, group.id);
	if (existing) return existing;

	const payload = {
		slug: cleanText(group.slug, 64),
		name: `${cleanText(group.name, 120) || 'Group'} Merch`,
		description: `Official merch from ${cleanText(group.name, 120) || 'this group'}.`,
		group_id: group.id,
		recipient_type: 'group',
		is_active: false,
		updated_at: new Date().toISOString()
	};

	const { data, error } = await supabase.from('merch_stores').insert(payload).select('*').single();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function getExistingGroupMerchStore(groupId) {
	const supabase = await getServiceSupabase();
	return getMerchStoreByGroupId(supabase, groupId);
}

export async function getPrintfulConnectionSummaryForStoreSlug(storeSlug = MAIN_STORE_SLUG) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const account = await getMerchPartnerAccountRecord(supabase, store.id, PRINTFUL_PROVIDER);
	return summarizePartnerAccount(account);
}

export async function getPrintfulConnectionSummaryForGroup(groupId) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreByGroupId(supabase, groupId);
	if (!store) return null;
	const account = await getMerchPartnerAccountRecord(supabase, store.id, PRINTFUL_PROVIDER);
	return summarizePartnerAccount(account);
}

export async function connectPrintfulForStore({ store, tokenSet }) {
	const supabase = await getServiceSupabase();
	const account = await upsertPrintfulPartnerAccountRecord(supabase, store, tokenSet);
	const summary = summarizePartnerAccount(account);

	try {
		const availableStores = (await listPrintfulStoresV2({ accessToken: tokenSet?.accessToken }))
			.map(normalizePrintfulStoreSummary)
			.filter(Boolean);
		const selectedStore =
			availableStores.find((entry) => entry.isDefault) ||
			(availableStores.length === 1 ? availableStores[0] : null);

		if (selectedStore?.id) {
			await updateMerchStorePrintfulSettings(supabase, store.id, {
				printfulStoreId: selectedStore.id,
				printfulSyncEnabled: true,
				printfulLastSyncError: null
			});
		}
	} catch (storeError) {
		await updateMerchStorePrintfulSettings(supabase, store.id, {
			printfulLastSyncError: storeError?.message || 'Unable to determine authorized Printful store.'
		}).catch(() => {});
	}

	return summary;
}

export async function disconnectPrintfulForStore(storeId) {
	const supabase = await getServiceSupabase();
	const store = cleanText(storeId, 64);
	if (!store) throw new Error('Store id is required.');

	const { error } = await supabase
		.from('merch_partner_accounts')
		.update({
			access_token: null,
			refresh_token: null,
			access_token_expires_at: null,
			refresh_token_expires_at: null,
			disconnected_at: new Date().toISOString(),
			last_error: null,
			updated_at: new Date().toISOString()
		})
		.eq('store_id', store)
		.eq('partner_provider', PRINTFUL_PROVIDER);
	if (error) throw new Error(error.message);

	await supabase
		.from('merch_stores')
		.update({
			printful_store_id: null,
			printful_sync_enabled: false,
			printful_last_sync_error: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', store);
}

async function updateMerchStorePrintfulSettings(supabase, storeId, changes) {
	const payload = { updated_at: new Date().toISOString() };
	if (changes.printfulStoreId !== undefined) {
		const storeIdValue = normalizePositiveInt(changes.printfulStoreId, 0);
		payload.printful_store_id = storeIdValue > 0 ? storeIdValue : null;
	}
	if (changes.printfulSyncEnabled !== undefined) {
		payload.printful_sync_enabled = changes.printfulSyncEnabled === true;
	}
	if (changes.printfulLastSyncedAt !== undefined) {
		payload.printful_last_synced_at = changes.printfulLastSyncedAt || null;
	}
	if (changes.printfulLastSyncError !== undefined) {
		payload.printful_last_sync_error = cleanText(changes.printfulLastSyncError, 1000) || null;
	}

	const { data, error } = await supabase
		.from('merch_stores')
		.update(payload)
		.eq('id', storeId)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function listPrintfulStoresForStore(supabase, store) {
	if (!store?.id) return [];
	const accessToken = await getValidPrintfulAccessToken(supabase, store);
	const stores = await listPrintfulStoresV2({ accessToken });
	return stores.map(normalizePrintfulStoreSummary).filter(Boolean);
}

function buildImportedProductSlug(name, externalProductId) {
	const base = slugifyName(name) || 'printful-product';
	const suffix = cleanText(externalProductId, 40)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${base}-${suffix || 'pf'}`.slice(0, 80);
}

async function syncPrintfulCatalogForStoreInternal(supabase, store, { accessToken, printfulStoreId }) {
	const syncedAt = new Date().toISOString();
	const products = await listPrintfulProductsWithVariantsV2({
		accessToken,
		storeId: printfulStoreId
	});

	if (!products.length) {
		throw new Error(
			'Printful returned no synced products for the selected store. Confirm the selected Printful store has synced products, then retry Import / Sync.'
		);
	}

	const seenProductIds = new Set();
	const seenVariantIdsByProductId = new Map();
	let syncedProducts = 0;
	let syncedVariants = 0;

	for (const product of products) {
		const externalProductId = cleanText(product?.id, 120);
		if (!externalProductId) continue;
		seenProductIds.add(externalProductId);
		const imageGallery = await collectPrintfulProductImageGallery({
			accessToken,
			storeId: printfulStoreId,
			product
		});

		const productPayload = {
			store_id: store.id,
			name: extractPrintfulProductName(product),
			slug: buildImportedProductSlug(extractPrintfulProductName(product), externalProductId),
			description: extractPrintfulProductDescription(product),
			image_url: imageGallery.featuredImageUrl || extractPrintfulProductImageUrl(product),
			status: 'active',
			default_partner: PRINTFUL_PROVIDER,
			source_of_truth: 'printful',
			external_provider: PRINTFUL_PROVIDER,
			external_product_id: externalProductId,
			external_store_id: normalizePositiveInt(printfulStoreId, 0) || null,
			external_synced_at: syncedAt,
			metadata: {
				printful_product: product,
				printful_featured_image: imageGallery.featuredImageUrl || null,
				printful_images: imageGallery.images,
				printful_image_details: imageGallery.details
			},
			updated_at: syncedAt
		};

		const { data: productRows, error: productError } = await supabase
			.from('merch_products')
			.upsert(productPayload, { onConflict: 'store_id,external_provider,external_product_id' })
			.select('*')
			.single();
		if (productError) throw new Error(productError.message);
		const localProduct = productRows;
		if (!localProduct?.id) continue;
		syncedProducts += 1;

		const seenVariantIds = new Set();
		for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
			const externalVariantId = cleanText(variant?.id, 120);
			if (!externalVariantId) continue;
			seenVariantIds.add(externalVariantId);

			const priceCents = parseMoneyStringToCents(
				variant?.retail_price ?? variant?.price ?? variant?.price_data?.retail_price,
				0
			);
			if (priceCents <= 0) continue;

			const costCents = parseMoneyStringToCents(
				variant?.price ?? variant?.cost ?? variant?.price_data?.price,
				0
			);
			const optionValues = collectPrintfulOptionValues(variant);
			const catalogVariantId = cleanText(
				variant?.catalog_variant_id || variant?.catalogVariantId,
				120
			);
			const variantPayload = {
				product_id: localProduct.id,
				name: extractPrintfulVariantName(variant),
				sku: cleanText(variant?.sku || variant?.external_id, 120) || null,
				option_values: optionValues,
				partner_provider: PRINTFUL_PROVIDER,
				partner_variant_ref: buildPrintfulPartnerVariantRef({
					productId: externalProductId,
					variantId: externalVariantId,
					catalogVariantId,
					placements: Array.isArray(variant?.placements) ? variant.placements : undefined
				}),
				price_cents: priceCents,
				cost_cents: costCents || null,
				is_active:
					variant?.is_enabled === false || variant?.availability_status === 'discontinued'
						? false
						: true,
				catalog_variant_id: normalizePositiveInt(catalogVariantId, null),
				external_variant_id: externalVariantId,
				external_synced_at: syncedAt,
				inventory_count:
					variant?.in_stock === false
						? 0
						: Number.isFinite(Number(variant?.stock))
							? Number(variant.stock)
							: null,
				updated_at: syncedAt
			};

			const { error: variantError } = await supabase
				.from('merch_product_variants')
				.upsert(variantPayload, { onConflict: 'product_id,external_variant_id' });
			if (variantError) throw new Error(variantError.message);
			syncedVariants += 1;
		}

		seenVariantIdsByProductId.set(localProduct.id, seenVariantIds);
	}

	const { data: existingImportedProducts, error: existingImportedProductsError } = await supabase
		.from('merch_products')
		.select('id, external_product_id')
		.eq('store_id', store.id)
		.eq('external_provider', PRINTFUL_PROVIDER);
	if (existingImportedProductsError) throw new Error(existingImportedProductsError.message);

	for (const localProduct of existingImportedProducts ?? []) {
		if (!seenProductIds.has(cleanText(localProduct.external_product_id, 120))) {
			const { error } = await supabase
				.from('merch_products')
				.update({ status: 'archived', updated_at: syncedAt })
				.eq('id', localProduct.id);
			if (error) throw new Error(error.message);
			continue;
		}

		const seenVariantIds = seenVariantIdsByProductId.get(localProduct.id) || new Set();
		const { data: localVariants, error: localVariantsError } = await supabase
			.from('merch_product_variants')
			.select('id, external_variant_id')
			.eq('product_id', localProduct.id)
			.eq('partner_provider', PRINTFUL_PROVIDER);
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

	await updateMerchStorePrintfulSettings(supabase, store.id, {
		printfulStoreId,
		printfulLastSyncedAt: syncedAt,
		printfulLastSyncError: null
	});

	return {
		syncedAt,
		productCount: syncedProducts,
		variantCount: syncedVariants
	};
}

export async function updatePrintfulStoreSelection({
	storeSlug = MAIN_STORE_SLUG,
	printfulStoreId,
	syncEnabled = true
}) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const selectedStoreId = normalizePositiveInt(printfulStoreId, 0);
	if (selectedStoreId <= 0) throw new Error('Select a Printful store.');

	const availableStores = await listPrintfulStoresForStore(supabase, store);
	if (!availableStores.some((entry) => Number(entry.id) === selectedStoreId)) {
		throw new Error('The selected Printful store is not available for this connection.');
	}

	return updateMerchStorePrintfulSettings(supabase, store.id, {
		printfulStoreId: selectedStoreId,
		printfulSyncEnabled: syncEnabled === true
	});
}

export async function syncPrintfulCatalogForStore({
	storeSlug = MAIN_STORE_SLUG,
	storeId = null
} = {}) {
	const supabase = await getServiceSupabase();
	const store = storeId ? await getMerchStoreById(supabase, storeId) : await getMerchStoreBySlug(storeSlug);
	if (!store?.id) throw new Error('Merch store not found.');
	const printfulStoreId = normalizePositiveInt(store.printful_store_id, 0);
	if (printfulStoreId <= 0) throw new Error('Choose a Printful store before importing products.');

	try {
		const accessToken = await getValidPrintfulAccessToken(supabase, store);
		return await syncPrintfulCatalogForStoreInternal(supabase, store, {
			accessToken,
			printfulStoreId
		});
	} catch (error) {
		await updateMerchStorePrintfulSettings(supabase, store.id, {
			printfulLastSyncError: error?.message || 'Printful sync failed.'
		});
		throw error;
	}
}

async function getStoreTaxSettings(supabase, storeId) {
	const { data, error } = await supabase
		.from('merch_tax_settings')
		.select('*')
		.eq('store_id', storeId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? { mode: 'none', flat_rate_bps: 0, notes: '' };
}

async function getStoreStripeAccount(supabase, store) {
	if (!store) return null;
	let query = supabase.from('donation_accounts').select('*');
	if (store.recipient_type === 'group' && store.group_id) {
		query = query.eq('group_id', store.group_id);
	} else {
		query = query.eq('id', 'main');
	}
	const { data, error } = await query.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function getMerchProductsWithVariants(supabase, storeId, includeInactive = false) {
	const productQuery = supabase
		.from('merch_products')
		.select('*')
		.eq('store_id', storeId)
		.order('created_at', { ascending: false });
	if (!includeInactive) productQuery.eq('status', 'active');

	const { data: products, error: productError } = await productQuery;
	if (productError) throw new Error(productError.message);

	const productIds = Array.from(
		new Set((products ?? []).map((product) => product.id).filter(Boolean))
	);
	if (!productIds.length) return [];

	const variantQuery = supabase
		.from('merch_product_variants')
		.select('*')
		.in('product_id', productIds)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });
	if (!includeInactive) variantQuery.eq('is_active', true);

	const { data: variants, error: variantError } = await variantQuery;
	if (variantError) throw new Error(variantError.message);

	const productMap = new Map(
		(products ?? []).map((product) => {
			const images = resolveMerchProductImages(product);
			return [
				product.id,
				{
					...product,
					images,
					featured_image_url: images[0] || null,
					variants: []
				}
			];
		})
	);
	for (const variant of variants ?? []) {
		const target = productMap.get(variant.product_id);
		if (!target) continue;
		target.variants.push(variant);
	}
	return Array.from(productMap.values());
}

async function getStoreFulfillmentMethods(supabase, storeId, includeInactive = false) {
	const methodsQuery = supabase
		.from('merch_fulfillment_methods')
		.select('*')
		.eq('store_id', storeId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });
	if (!includeInactive) methodsQuery.eq('is_active', true);

	const { data: methods, error: methodsError } = await methodsQuery;
	if (methodsError) throw new Error(methodsError.message);

	const methodIds = (methods ?? []).map((method) => method.id);
	if (!methodIds.length) return [];

	const { data: rules, error: rulesError } = await supabase
		.from('merch_shipping_rules')
		.select('*')
		.in('fulfillment_method_id', methodIds)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });
	if (rulesError && !String(rulesError.message || '').includes('relation "public.merch_shipping_rules" does not exist')) {
		throw new Error(rulesError.message);
	}

	const ruleMap = new Map();
	for (const rule of rules ?? []) {
		const list = ruleMap.get(rule.fulfillment_method_id) || [];
		list.push(rule);
		ruleMap.set(rule.fulfillment_method_id, list);
	}

	return (methods ?? []).map((method) => ({
		...method,
		shipping_rules: ruleMap.get(method.id) || []
	}));
}

export async function getPublicMerchCatalog(storeSlug = MAIN_STORE_SLUG) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const [products, taxSettings, fulfillmentMethods, stripeAccount] = await Promise.all([
		getMerchProductsWithVariants(supabase, store.id, false),
		getStoreTaxSettings(supabase, store.id),
		getStoreFulfillmentMethods(supabase, store.id, false),
		getStoreStripeAccount(supabase, store)
	]);
	return {
		store,
		taxSettings,
		fulfillmentMethods,
		products,
		canCheckout: Boolean(stripeAccount?.stripe_account_id && stripeAccount?.charges_enabled),
		stripeAccount
	};
}

function extractAddressFromPayload(payload = {}) {
	return sanitizeAddress({
		line1: payload?.line1 || payload?.address1,
		line2: payload?.line2 || payload?.address2,
		city: payload?.city,
		state: payload?.state,
		postal_code: payload?.postalCode || payload?.postal_code,
		country: payload?.country || 'US'
	});
}

function validateAddress(address) {
	return Boolean(
		address.line1 && address.city && address.state && address.postal_code && address.country
	);
}

function isUnitedStatesCountry(value) {
	const country = cleanText(value || 'US', 8).toUpperCase();
	return country === 'US' || country === 'USA' || country === 'UNITED STATES';
}

function validateUsShippingAddress(address) {
	return validateAddress(address) && isUnitedStatesCountry(address.country);
}

function calculateManualFulfillmentFee(method, lines) {
	if (!method) return { feeCents: 0, matchedRule: null };
	if (method.method_type !== 'shipping') {
		return { feeCents: toCents(method.base_fee_cents, 0), matchedRule: null };
	}

	const mode = cleanText(method.rate_rule_mode, 20) || 'flat';
	if (mode === 'flat') {
		return { feeCents: toCents(method.base_fee_cents, 0), matchedRule: null };
	}

	const quantity = lines.reduce((sum, line) => sum + toCents(line.quantity, 0), 0);
	const subtotalCents = lines.reduce((sum, line) => sum + toCents(line.lineTotalCents, 0), 0);
	const metricValue = mode === 'subtotal' ? subtotalCents : quantity;
	const matchedRule = (Array.isArray(method.shipping_rules) ? method.shipping_rules : []).find((rule) => {
		if (cleanText(rule.metric_type, 20) !== mode) return false;
		const min = toCents(rule.min_value, 0);
		const max = rule.max_value === null ? null : toCents(rule.max_value, 0);
		return metricValue >= min && (max === null || metricValue <= max);
	});

	return {
		feeCents: matchedRule ? toCents(matchedRule.rate_cents, 0) : toCents(method.base_fee_cents, 0),
		matchedRule: matchedRule || null
	};
}

export async function calculateMerchQuote({
	storeId,
	items,
	manualFulfillmentMethodId,
	printfulShippingOptionId,
	shippingAddress,
	donationCents = 0
}) {
	const supabase = await getServiceSupabase();
	const cartItems = normalizeCartItems(items);
	if (!cartItems.length) {
		return { ok: false, status: 400, error: 'Cart is empty.' };
	}

	const address = extractAddressFromPayload(shippingAddress || {});
	if (cleanText(address.country, 8) && !isUnitedStatesCountry(address.country)) {
		return { ok: false, status: 400, error: 'Merch shipping is currently limited to the United States.' };
	}

	const variantIds = Array.from(new Set(cartItems.map((item) => item.variantId)));
	const [{ data: variants, error: variantError }, store, taxSettings, fulfillmentMethods] = await Promise.all([
		supabase.from('merch_product_variants').select('*').in('id', variantIds),
		getMerchStoreById(supabase, storeId),
		getStoreTaxSettings(supabase, storeId),
		getStoreFulfillmentMethods(supabase, storeId, false)
	]);
	if (variantError) return { ok: false, status: 500, error: variantError.message };
	if (!store?.id) return { ok: false, status: 404, error: 'Merch store not found.' };

	const productIds = Array.from(
		new Set((variants ?? []).map((variant) => variant.product_id).filter(Boolean))
	);
	const { data: products, error: productError } = await supabase
		.from('merch_products')
		.select('*')
		.in('id', productIds);
	if (productError) return { ok: false, status: 500, error: productError.message };

	const variantMap = new Map((variants ?? []).map((variant) => [variant.id, variant]));
	const productMap = new Map((products ?? []).map((product) => [product.id, product]));

	const lines = [];
	let subtotalCents = 0;
	for (const cartLine of cartItems) {
		const variant = variantMap.get(cartLine.variantId);
		if (!variant || variant.is_active !== true) {
			return { ok: false, status: 400, error: 'A product variation in your cart is unavailable.' };
		}
		const product = productMap.get(variant.product_id);
		if (!product || product.store_id !== storeId || product.status !== 'active') {
			return { ok: false, status: 400, error: 'A product in your cart is unavailable.' };
		}
		const unitPriceCents = toCents(variant.price_cents, 0);
		if (unitPriceCents <= 0) {
			return { ok: false, status: 400, error: `Variant "${variant.name}" has an invalid price.` };
		}
		const lineTotalCents = unitPriceCents * cartLine.quantity;
		subtotalCents += lineTotalCents;
		lines.push({
			variantId: variant.id,
			productId: product.id,
			productName: product.name,
			productSlug: product.slug,
			productImageUrl: product.image_url,
			variantName: variant.name,
			sku: variant.sku,
			optionValues: variant.option_values ?? {},
			partnerProvider: variant.partner_provider === PRINTFUL_PROVIDER ? PRINTFUL_PROVIDER : 'manual',
			partnerVariantRef: variant.partner_variant_ref || '',
			quantity: cartLine.quantity,
			unitPriceCents,
			lineTotalCents
		});
	}

	const manualLines = lines.filter((line) => line.partnerProvider !== PRINTFUL_PROVIDER);
	const printfulLines = lines.filter((line) => line.partnerProvider === PRINTFUL_PROVIDER);
	const activeFulfillmentMethods = fulfillmentMethods ?? [];

	let manualMethod = null;
	let manualFeeCents = 0;
	let manualMatchedRule = null;
	if (manualLines.length) {
		if (!activeFulfillmentMethods.length) {
			return { ok: false, status: 400, error: 'No fulfillment methods are available for manual items.' };
		}
		manualMethod = manualFulfillmentMethodId
			? activeFulfillmentMethods.find((method) => method.id === manualFulfillmentMethodId) || null
			: activeFulfillmentMethods[0];
		if (!manualMethod) {
			return { ok: false, status: 400, error: 'Selected fulfillment method is not available.' };
		}
		const manualFee = calculateManualFulfillmentFee(manualMethod, manualLines);
		manualFeeCents = manualFee.feeCents;
		manualMatchedRule = manualFee.matchedRule;
	}

	const needsShippingAddress = Boolean(printfulLines.length || manualMethod?.requires_address);
	if (needsShippingAddress && cleanText(address.country, 8) && !isUnitedStatesCountry(address.country)) {
		return { ok: false, status: 400, error: 'Merch shipping is currently limited to the United States.' };
	}

	let printfulShippingOptions = [];
	let selectedPrintfulOption = null;
	let printfulShippingFeeCents = 0;
	const shippingAddressReady = validateUsShippingAddress(address);

	if (printfulLines.length) {
		const printfulStoreId = normalizePositiveInt(store.printful_store_id, 0);
		if (printfulStoreId <= 0) {
			return { ok: false, status: 409, error: 'Printful is not configured for this merch store.' };
		}

		if (shippingAddressReady) {
			try {
				const accessToken = await getValidPrintfulAccessToken(supabase, store);
				const recipient = buildPrintfulRecipient(address);
				const rates = await calculatePrintfulShippingRatesV2({
					accessToken,
					storeId: printfulStoreId,
					recipient,
					orderItems: printfulLines.map((line) =>
						buildPrintfulShippingItemPayload({
							partner_variant_ref: line.partnerVariantRef,
							quantity: line.quantity
						})
					)
				});
				printfulShippingOptions = rates.map(normalizePrintfulShippingOption).filter(Boolean);
			} catch (error) {
				return {
					ok: false,
					status: 502,
					error: error?.message || 'Unable to retrieve Printful shipping rates.'
				};
			}

			if (!printfulShippingOptions.length) {
				return {
					ok: false,
					status: 400,
					error: 'No Printful shipping options are available for this address.'
				};
			}

			selectedPrintfulOption = printfulShippingOptionId
				? printfulShippingOptions.find((option) => option.id === printfulShippingOptionId) || null
				: printfulShippingOptions[0];
			if (!selectedPrintfulOption) {
				return {
					ok: false,
					status: 400,
					error: 'Selected Printful shipping option is no longer available.'
				};
			}
			printfulShippingFeeCents = selectedPrintfulOption.amountCents;
		}
	}

	const normalizedDonationCents = Math.max(0, toCents(donationCents, 0));
	const rateBps = taxSettings?.mode === 'flat_rate' ? toCents(taxSettings?.flat_rate_bps, 0) : 0;
	const taxCents = rateBps > 0 ? Math.round((subtotalCents * rateBps) / 10000) : 0;
	const fulfillmentFeeCents = manualFeeCents + printfulShippingFeeCents;
	const totalCents = subtotalCents + taxCents + fulfillmentFeeCents + normalizedDonationCents;

	const manualBreakdown =
		manualLines.length > 0
			? {
					present: true,
					items: manualLines,
					methods: activeFulfillmentMethods,
					selectedMethod: manualMethod,
					feeCents: manualFeeCents,
					matchedRule: manualMatchedRule,
					requiresAddress: Boolean(manualMethod?.requires_address),
					shippingSpeedLabel: cleanText(manualMethod?.shipping_speed_label, 120) || null
				}
			: {
					present: false,
					items: [],
					methods: [],
					selectedMethod: null,
					feeCents: 0,
					matchedRule: null,
					requiresAddress: false,
					shippingSpeedLabel: null
				};

	const printfulBreakdown =
		printfulLines.length > 0
			? {
					present: true,
					items: printfulLines,
					storeId: normalizePositiveInt(store.printful_store_id, 0) || null,
					addressReady: shippingAddressReady,
					options: printfulShippingOptions,
					selectedOption: selectedPrintfulOption,
					feeCents: printfulShippingFeeCents,
					requiresAddress: true
				}
			: {
					present: false,
					items: [],
					storeId: null,
					addressReady: false,
					options: [],
					selectedOption: null,
					feeCents: 0,
					requiresAddress: false
				};

	return {
		ok: true,
		quote: {
			items: lines,
			subtotalCents,
			taxCents,
			manualShippingFeeCents: manualFeeCents,
			printfulShippingFeeCents,
			fulfillmentFeeCents,
			donationCents: normalizedDonationCents,
			totalCents,
			taxSettings,
			requiresShippingAddress: needsShippingAddress,
			shippingAddressReady,
			manual: manualBreakdown,
			printful: printfulBreakdown,
			shippingBreakdown: {
				manual: {
					methodId: manualMethod?.id || null,
					methodName: manualMethod?.name || null,
					methodType: manualMethod?.method_type || null,
					shippingSpeedLabel: cleanText(manualMethod?.shipping_speed_label, 120) || null,
					feeCents: manualFeeCents
				},
				printful: {
					storeId: normalizePositiveInt(store.printful_store_id, 0) || null,
					optionId: selectedPrintfulOption?.id || null,
					optionName: selectedPrintfulOption?.name || null,
					feeCents: printfulShippingFeeCents
				}
			}
		}
	};
}

export async function createMerchCheckoutSession({
	requestUrl,
	storeSlug = MAIN_STORE_SLUG,
	items,
	manualFulfillmentMethodId,
	printfulShippingOptionId,
	donationAmount,
	customer,
	shippingAddress,
	notes,
	customerUserId
}) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const donationCents = Math.max(0, Math.round(Number(donationAmount || 0) * 100));

	const quoteResult = await calculateMerchQuote({
		storeId: store.id,
		items,
		manualFulfillmentMethodId,
		printfulShippingOptionId,
		shippingAddress,
		donationCents
	});
	if (!quoteResult.ok) return quoteResult;
	const quote = quoteResult.quote;

	const customerEmail = normalizeEmail(customer?.email);
	const customerName = cleanText(customer?.name, 140);
	const customerPhone = cleanText(customer?.phone, 40);
	if (!customerEmail) {
		return { ok: false, status: 400, error: 'A valid customer email is required.' };
	}
	if (quote.manual.present && !quote.manual.selectedMethod) {
		return { ok: false, status: 400, error: 'Select a fulfillment method for manual items.' };
	}
	if (quote.printful.present && !quote.printful.addressReady) {
		return { ok: false, status: 400, error: 'Enter a valid United States shipping address.' };
	}
	if (quote.printful.present && !quote.printful.selectedOption) {
		return { ok: false, status: 400, error: 'Select a Printful shipping option.' };
	}

	const address = extractAddressFromPayload(shippingAddress || {});
	if (quote.requiresShippingAddress && !validateUsShippingAddress(address)) {
		return {
			ok: false,
			status: 400,
			error: 'A complete United States shipping address is required for this order.'
		};
	}

	const stripeAccount = await getStoreStripeAccount(supabase, store);
	if (!stripeAccount?.stripe_account_id) {
		return { ok: false, status: 409, error: 'This merch store has not connected Stripe yet.' };
	}
	if (stripeAccount?.charges_enabled !== true) {
		return {
			ok: false,
			status: 409,
			error: 'Stripe account is connected but not ready for charges yet.'
		};
	}

	const orderNumber = createOrderNumber();
	const orderInsertPayload = {
		order_number: orderNumber,
		store_id: store.id,
		customer_user_id: customerUserId || null,
		customer_email: customerEmail,
		customer_name: customerName || null,
		customer_phone: customerPhone || null,
		fulfillment_method_id: quote.manual.selectedMethod?.id || null,
		fulfillment_snapshot: quote.shippingBreakdown,
		shipping_address: quote.requiresShippingAddress ? address : {},
		notes: cleanText(notes, 1000) || null,
		donation_cents: quote.donationCents,
		subtotal_cents: quote.subtotalCents,
		tax_cents: quote.taxCents,
		fulfillment_fee_cents: quote.fulfillmentFeeCents,
		total_cents: quote.totalCents,
		currency: 'usd',
		status: 'pending',
		payment_status: 'unpaid',
		fulfillment_status: 'not_started',
		stripe_connected_account_id: stripeAccount.stripe_account_id,
		manual_shipping_method_id: quote.manual.selectedMethod?.id || null,
		manual_shipping_snapshot: quote.manual.selectedMethod
			? {
					...quote.manual.selectedMethod,
					shipping_speed_label: quote.manual.shippingSpeedLabel,
					matched_rule: quote.manual.matchedRule
				}
			: {},
		manual_shipping_fee_cents: quote.manualShippingFeeCents,
		printful_shipping_option_id: quote.printful.selectedOption?.id || null,
		printful_shipping_snapshot: quote.printful.selectedOption || {},
		printful_shipping_fee_cents: quote.printfulShippingFeeCents,
		shipping_breakdown: quote.shippingBreakdown
	};

	const { data: insertedOrders, error: orderInsertError } = await supabase
		.from('merch_orders')
		.insert(orderInsertPayload)
		.select('*')
		.single();
	if (orderInsertError) return { ok: false, status: 500, error: orderInsertError.message };
	const order = insertedOrders;
	if (!order?.id) return { ok: false, status: 500, error: 'Failed to create order.' };

	const orderItemsPayload = quote.items.map((item) => ({
		order_id: order.id,
		product_id: item.productId,
		variant_id: item.variantId,
		product_name: item.productName,
		variant_name: item.variantName,
		sku: item.sku || null,
		quantity: item.quantity,
		unit_price_cents: item.unitPriceCents,
		line_total_cents: item.lineTotalCents,
		partner_provider: item.partnerProvider,
		partner_variant_ref: item.partnerVariantRef || null,
		option_values: item.optionValues || {}
	}));
	const { error: orderItemsError } = await supabase
		.from('merch_order_items')
		.insert(orderItemsPayload);
	if (orderItemsError) {
		await supabase.from('merch_orders').delete().eq('id', order.id);
		return { ok: false, status: 500, error: orderItemsError.message };
	}

	const lineItems = [];
	for (const item of quote.items) {
		const optionLabel = summarizeOptionValues(item.optionValues);
		lineItems.push({
			quantity: item.quantity,
			price_data: {
				currency: 'usd',
				unit_amount: item.unitPriceCents,
				product_data: {
					name: `${item.productName} · ${item.variantName}`,
					description: optionLabel || undefined,
					images: item.productImageUrl ? [item.productImageUrl] : undefined
				}
			}
		});
	}
	if (quote.manualShippingFeeCents > 0) {
		lineItems.push({
			quantity: 1,
			price_data: {
				currency: 'usd',
				unit_amount: quote.manualShippingFeeCents,
				product_data: {
					name: `Manual ${quote.manual.selectedMethod?.name || 'Fulfillment'}`
				}
			}
		});
	}
	if (quote.printfulShippingFeeCents > 0) {
		lineItems.push({
			quantity: 1,
			price_data: {
				currency: 'usd',
				unit_amount: quote.printfulShippingFeeCents,
				product_data: {
					name: `Printful Shipping: ${quote.printful.selectedOption?.name || 'Shipping'}`
				}
			}
		});
	}
	if (quote.taxCents > 0) {
		lineItems.push({
			quantity: 1,
			price_data: {
				currency: 'usd',
				unit_amount: quote.taxCents,
				product_data: {
					name: 'Sales Tax'
				}
			}
		});
	}
	if (quote.donationCents > 0) {
		lineItems.push({
			quantity: 1,
			price_data: {
				currency: 'usd',
				unit_amount: quote.donationCents,
				product_data: {
					name: 'Additional Donation'
				}
			}
		});
	}

	const baseUrl = resolvePublicBaseUrl(requestUrl);
	if (!baseUrl) return { ok: false, status: 500, error: 'PUBLIC_URL_BASE is not configured.' };

	const stripe = getStripeClient();
	let session = null;
	try {
		session = await stripe.checkout.sessions.create(
			{
				mode: 'payment',
				submit_type: 'pay',
				customer_email: customerEmail,
				success_url: `${baseUrl}/merch/confirmation?session_id={CHECKOUT_SESSION_ID}`,
				cancel_url: `${baseUrl}/merch/checkout?canceled=1`,
				line_items: lineItems,
				metadata: {
					order_id: order.id,
					order_number: order.order_number,
					store_slug: store.slug
				},
				payment_intent_data: {
					metadata: {
						order_id: order.id,
						order_number: order.order_number
					}
				}
			},
			{ stripeAccount: stripeAccount.stripe_account_id }
		);
	} catch {
		await supabase
			.from('merch_orders')
			.update({ status: 'failed', payment_status: 'failed', updated_at: new Date().toISOString() })
			.eq('id', order.id);
		return { ok: false, status: 502, error: 'Unable to create Stripe checkout session.' };
	}

	const { error: orderUpdateError } = await supabase
		.from('merch_orders')
		.update({
			stripe_checkout_session_id: session.id,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);
	if (orderUpdateError) {
		return { ok: false, status: 500, error: orderUpdateError.message };
	}

	return { ok: true, checkoutUrl: session.url, orderNumber: order.order_number };
}

export async function createMerchPaymentIntent({
	requestUrl,
	storeSlug = MAIN_STORE_SLUG,
	items,
	manualFulfillmentMethodId,
	printfulShippingOptionId,
	donationAmount,
	customer,
	shippingAddress,
	notes,
	customerUserId
}) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const donationCents = Math.max(0, Math.round(Number(donationAmount || 0) * 100));

	const quoteResult = await calculateMerchQuote({
		storeId: store.id,
		items,
		manualFulfillmentMethodId,
		printfulShippingOptionId,
		shippingAddress,
		donationCents
	});
	if (!quoteResult.ok) return quoteResult;
	const quote = quoteResult.quote;

	const customerEmail = normalizeEmail(customer?.email);
	const customerName = cleanText(customer?.name, 140);
	const customerPhone = cleanText(customer?.phone, 40);
	if (!customerEmail) {
		return { ok: false, status: 400, error: 'A valid customer email is required.' };
	}
	if (quote.manual.present && !quote.manual.selectedMethod) {
		return { ok: false, status: 400, error: 'Select a fulfillment method for manual items.' };
	}
	if (quote.printful.present && !quote.printful.addressReady) {
		return { ok: false, status: 400, error: 'Enter a valid United States shipping address.' };
	}
	if (quote.printful.present && !quote.printful.selectedOption) {
		return { ok: false, status: 400, error: 'Select a Printful shipping option.' };
	}

	const address = extractAddressFromPayload(shippingAddress || {});
	if (quote.requiresShippingAddress && !validateUsShippingAddress(address)) {
		return {
			ok: false,
			status: 400,
			error: 'A complete United States shipping address is required for this order.'
		};
	}

	const stripeAccount = await getStoreStripeAccount(supabase, store);
	if (!stripeAccount?.stripe_account_id) {
		return { ok: false, status: 409, error: 'This merch store has not connected Stripe yet.' };
	}
	if (stripeAccount?.charges_enabled !== true) {
		return {
			ok: false,
			status: 409,
			error: 'Stripe account is connected but not ready for charges yet.'
		};
	}

	const orderNumber = createOrderNumber();
	const orderInsertPayload = {
		order_number: orderNumber,
		store_id: store.id,
		customer_user_id: customerUserId || null,
		customer_email: customerEmail,
		customer_name: customerName || null,
		customer_phone: customerPhone || null,
		fulfillment_method_id: quote.manual.selectedMethod?.id || null,
		fulfillment_snapshot: quote.shippingBreakdown,
		shipping_address: quote.requiresShippingAddress ? address : {},
		notes: cleanText(notes, 1000) || null,
		donation_cents: quote.donationCents,
		subtotal_cents: quote.subtotalCents,
		tax_cents: quote.taxCents,
		fulfillment_fee_cents: quote.fulfillmentFeeCents,
		total_cents: quote.totalCents,
		currency: 'usd',
		status: 'pending',
		payment_status: 'unpaid',
		fulfillment_status: 'not_started',
		stripe_connected_account_id: stripeAccount.stripe_account_id,
		manual_shipping_method_id: quote.manual.selectedMethod?.id || null,
		manual_shipping_snapshot: quote.manual.selectedMethod
			? {
					...quote.manual.selectedMethod,
					shipping_speed_label: quote.manual.shippingSpeedLabel,
					matched_rule: quote.manual.matchedRule
				}
			: {},
		manual_shipping_fee_cents: quote.manualShippingFeeCents,
		printful_shipping_option_id: quote.printful.selectedOption?.id || null,
		printful_shipping_snapshot: quote.printful.selectedOption || {},
		printful_shipping_fee_cents: quote.printfulShippingFeeCents,
		shipping_breakdown: quote.shippingBreakdown
	};

	const { data: insertedOrders, error: orderInsertError } = await supabase
		.from('merch_orders')
		.insert(orderInsertPayload)
		.select('*')
		.single();
	if (orderInsertError) return { ok: false, status: 500, error: orderInsertError.message };
	const order = insertedOrders;
	if (!order?.id) return { ok: false, status: 500, error: 'Failed to create order.' };

	const orderItemsPayload = quote.items.map((item) => ({
		order_id: order.id,
		product_id: item.productId,
		variant_id: item.variantId,
		product_name: item.productName,
		variant_name: item.variantName,
		sku: item.sku || null,
		quantity: item.quantity,
		unit_price_cents: item.unitPriceCents,
		line_total_cents: item.lineTotalCents,
		partner_provider: item.partnerProvider,
		partner_variant_ref: item.partnerVariantRef || null,
		option_values: item.optionValues || {}
	}));
	const { error: orderItemsError } = await supabase
		.from('merch_order_items')
		.insert(orderItemsPayload);
	if (orderItemsError) {
		await supabase.from('merch_orders').delete().eq('id', order.id);
		return { ok: false, status: 500, error: orderItemsError.message };
	}

	const baseUrl = resolvePublicBaseUrl(requestUrl);
	if (!baseUrl) return { ok: false, status: 500, error: 'PUBLIC_URL_BASE is not configured.' };

	const stripe = getStripeClient();
	let paymentIntent = null;
	try {
		paymentIntent = await stripe.paymentIntents.create(
			{
				amount: quote.totalCents,
				currency: 'usd',
				automatic_payment_methods: { enabled: true },
				description: `Merch order ${order.order_number}`,
				receipt_email: customerEmail,
				metadata: {
					order_id: order.id,
					order_number: order.order_number,
					store_slug: store.slug,
					customer_email: customerEmail
				}
			},
			{ stripeAccount: stripeAccount.stripe_account_id }
		);
	} catch (error) {
		await supabase
			.from('merch_orders')
			.update({ status: 'failed', payment_status: 'failed', updated_at: new Date().toISOString() })
			.eq('id', order.id);
		return { ok: false, status: 502, error: error?.message || 'Unable to create Stripe payment intent.' };
	}

	if (!paymentIntent?.id || !paymentIntent?.client_secret) {
		return { ok: false, status: 502, error: 'Stripe did not return a payment intent.' };
	}

	const { error: orderUpdateError } = await supabase
		.from('merch_orders')
		.update({
			stripe_payment_intent_id: paymentIntent.id,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);
	if (orderUpdateError) {
		return { ok: false, status: 500, error: orderUpdateError.message };
	}

	return {
		ok: true,
		clientSecret: paymentIntent.client_secret,
		paymentIntentId: paymentIntent.id,
		connectedAccountId: stripeAccount.stripe_account_id,
		returnUrl: `${baseUrl}/merch/confirmation`,
		orderNumber: order.order_number
	};
}

export async function updateMerchPaymentIntent({
	paymentIntentId,
	items,
	manualFulfillmentMethodId,
	printfulShippingOptionId,
	donationAmount,
	customer,
	shippingAddress,
	notes
}) {
	const cleanedPaymentIntentId = cleanText(paymentIntentId, 255);
	if (!cleanedPaymentIntentId) {
		return { ok: false, status: 400, error: 'Missing payment intent id.' };
	}

	const supabase = await getServiceSupabase();
	const { data: order, error: orderError } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('stripe_payment_intent_id', cleanedPaymentIntentId)
		.maybeSingle();
	if (orderError) return { ok: false, status: 500, error: orderError.message };
	if (!order) return { ok: false, status: 404, error: 'Order record not found.' };
	if (order.payment_status === 'paid' || order.status === 'paid') {
		return { ok: false, status: 409, error: 'This order has already been completed.' };
	}

	const donationCents = Math.max(0, Math.round(Number(donationAmount || 0) * 100));
	const quoteResult = await calculateMerchQuote({
		storeId: order.store_id,
		items,
		manualFulfillmentMethodId,
		printfulShippingOptionId,
		shippingAddress,
		donationCents
	});
	if (!quoteResult.ok) return quoteResult;
	const quote = quoteResult.quote;

	const customerEmail = normalizeEmail(customer?.email);
	const customerName = cleanText(customer?.name, 140);
	const customerPhone = cleanText(customer?.phone, 40);
	if (!customerEmail) {
		return { ok: false, status: 400, error: 'A valid customer email is required.' };
	}
	if (quote.manual.present && !quote.manual.selectedMethod) {
		return { ok: false, status: 400, error: 'Select a fulfillment method for manual items.' };
	}
	if (quote.printful.present && !quote.printful.addressReady) {
		return { ok: false, status: 400, error: 'Enter a valid United States shipping address.' };
	}
	if (quote.printful.present && !quote.printful.selectedOption) {
		return { ok: false, status: 400, error: 'Select a Printful shipping option.' };
	}

	const address = extractAddressFromPayload(shippingAddress || {});
	if (quote.requiresShippingAddress && !validateUsShippingAddress(address)) {
		return {
			ok: false,
			status: 400,
			error: 'A complete United States shipping address is required for this order.'
		};
	}

	const stripe = getStripeClient();
	try {
		await stripe.paymentIntents.update(
			cleanedPaymentIntentId,
			{
				amount: quote.totalCents,
				receipt_email: customerEmail,
				description: `Merch order ${order.order_number}`,
				metadata: {
					order_id: order.id,
					order_number: order.order_number,
					customer_email: customerEmail
				}
			},
			{ stripeAccount: order.stripe_connected_account_id }
		);
	} catch (error) {
		return { ok: false, status: 502, error: error?.message || 'Unable to update Stripe payment.' };
	}

	const orderUpdatePayload = {
		customer_email: customerEmail,
		customer_name: customerName || null,
		customer_phone: customerPhone || null,
		fulfillment_method_id: quote.manual.selectedMethod?.id || null,
		fulfillment_snapshot: quote.shippingBreakdown,
		shipping_address: quote.requiresShippingAddress ? address : {},
		notes: cleanText(notes, 1000) || null,
		donation_cents: quote.donationCents,
		subtotal_cents: quote.subtotalCents,
		tax_cents: quote.taxCents,
		fulfillment_fee_cents: quote.fulfillmentFeeCents,
		total_cents: quote.totalCents,
		manual_shipping_method_id: quote.manual.selectedMethod?.id || null,
		manual_shipping_snapshot: quote.manual.selectedMethod
			? {
					...quote.manual.selectedMethod,
					shipping_speed_label: quote.manual.shippingSpeedLabel,
					matched_rule: quote.manual.matchedRule
				}
			: {},
		manual_shipping_fee_cents: quote.manualShippingFeeCents,
		printful_shipping_option_id: quote.printful.selectedOption?.id || null,
		printful_shipping_snapshot: quote.printful.selectedOption || {},
		printful_shipping_fee_cents: quote.printfulShippingFeeCents,
		shipping_breakdown: quote.shippingBreakdown,
		updated_at: new Date().toISOString()
	};
	const { error: updateOrderError } = await supabase
		.from('merch_orders')
		.update(orderUpdatePayload)
		.eq('id', order.id);
	if (updateOrderError) return { ok: false, status: 500, error: updateOrderError.message };

	const { error: deleteItemsError } = await supabase
		.from('merch_order_items')
		.delete()
		.eq('order_id', order.id);
	if (deleteItemsError) return { ok: false, status: 500, error: deleteItemsError.message };

	const orderItemsPayload = quote.items.map((item) => ({
		order_id: order.id,
		product_id: item.productId,
		variant_id: item.variantId,
		product_name: item.productName,
		variant_name: item.variantName,
		sku: item.sku || null,
		quantity: item.quantity,
		unit_price_cents: item.unitPriceCents,
		line_total_cents: item.lineTotalCents,
		partner_provider: item.partnerProvider,
		partner_variant_ref: item.partnerVariantRef || null,
		option_values: item.optionValues || {}
	}));
	if (orderItemsPayload.length) {
		const { error: insertItemsError } = await supabase
			.from('merch_order_items')
			.insert(orderItemsPayload);
		if (insertItemsError) return { ok: false, status: 500, error: insertItemsError.message };
	}

	return { ok: true, amountCents: quote.totalCents };
}

async function getAdminEmails(supabase) {
	const { data, error } = await supabase.from('profiles').select('email').eq('admin', true);
	if (error || !data?.length) return [];
	return Array.from(new Set(data.map((row) => normalizeEmail(row.email)).filter(Boolean)));
}

function buildOrderSummaryLines(order, orderItems) {
	const lines = orderItems.map((item) => {
		const options = summarizeOptionValues(item.option_values);
		const optionSuffix = options ? ` (${options})` : '';
		return `${item.quantity} × ${item.product_name} — ${item.variant_name}${optionSuffix}: ${formatCurrency(item.line_total_cents, order.currency)}`;
	});
	lines.push(`Subtotal: ${formatCurrency(order.subtotal_cents, order.currency)}`);
	if (order.tax_cents > 0) lines.push(`Tax: ${formatCurrency(order.tax_cents, order.currency)}`);
	if (toCents(order.manual_shipping_fee_cents, 0) > 0) {
		const label =
			cleanText(order?.manual_shipping_snapshot?.name, 160) ||
			cleanText(order?.shipping_breakdown?.manual?.methodName, 160) ||
			'Manual Fulfillment';
		lines.push(`${label}: ${formatCurrency(order.manual_shipping_fee_cents, order.currency)}`);
	}
	if (toCents(order.printful_shipping_fee_cents, 0) > 0) {
		const label =
			cleanText(order?.printful_shipping_snapshot?.name, 160) ||
			cleanText(order?.shipping_breakdown?.printful?.optionName, 160) ||
			'Printful Shipping';
		lines.push(`${label}: ${formatCurrency(order.printful_shipping_fee_cents, order.currency)}`);
	}
	if (
		toCents(order.manual_shipping_fee_cents, 0) === 0 &&
		toCents(order.printful_shipping_fee_cents, 0) === 0 &&
		order.fulfillment_fee_cents > 0
	) {
		lines.push(`Fulfillment: ${formatCurrency(order.fulfillment_fee_cents, order.currency)}`);
	}
	if (order.donation_cents > 0) {
		lines.push(`Donation: ${formatCurrency(order.donation_cents, order.currency)}`);
	}
	lines.push(`Total: ${formatCurrency(order.total_cents, order.currency)}`);
	return lines;
}

async function sendOrderEmails({ supabase, order, orderItems, fetchImpl }) {
	const summaryLines = buildOrderSummaryLines(order, orderItems);
	const summaryHtml = summaryLines.map((line) => `<li>${line}</li>`).join('');

	if (!order.email_customer_sent_at && normalizeEmail(order.customer_email)) {
		const customerHtml = [
			`<p>Thanks for your order <strong>${order.order_number}</strong> with 3 Feet Please.</p>`,
			`<p>We received your payment and started processing your order.</p>`,
			`<ul>${summaryHtml}</ul>`
		].join('');
		const customerText = [
			`Thanks for your order ${order.order_number} with 3 Feet Please.`,
			'We received your payment and started processing your order.',
			'',
			...summaryLines
		].join('\n');
		try {
			await sendEmail(
				{
					to: order.customer_email,
					subject: `Order Confirmation ${order.order_number}`,
					html: customerHtml,
					text: customerText,
					tags: [{ Name: 'context', Value: 'merch-order-customer' }]
				},
				{ fetch: fetchImpl }
			);
			await supabase
				.from('merch_orders')
				.update({
					email_customer_sent_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', order.id)
				.is('email_customer_sent_at', null);
		} catch (error) {
			console.error('Failed to send merch customer email', error);
		}
	}

	if (!order.email_admin_sent_at) {
		const adminEmails = await getAdminEmails(supabase);
		if (adminEmails.length) {
			const adminHtml = [
				`<p>New merch order received: <strong>${order.order_number}</strong></p>`,
				`<p>Customer: ${order.customer_name || 'N/A'} (${order.customer_email})</p>`,
				`<ul>${summaryHtml}</ul>`
			].join('');
			const adminText = [
				`New merch order received: ${order.order_number}`,
				`Customer: ${order.customer_name || 'N/A'} (${order.customer_email})`,
				'',
				...summaryLines
			].join('\n');
			try {
				await sendEmail(
					{
						to: adminEmails,
						subject: `New Merch Order ${order.order_number}`,
						html: adminHtml,
						text: adminText,
						tags: [{ Name: 'context', Value: 'merch-order-admin' }]
					},
					{ fetch: fetchImpl }
				);
				await supabase
					.from('merch_orders')
					.update({
						email_admin_sent_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					})
					.eq('id', order.id)
					.is('email_admin_sent_at', null);
			} catch (error) {
				console.error('Failed to send merch admin email', error);
			}
		}
	}
}

async function dispatchManualItem(supabase, order, item) {
	const payload = {
		order_number: order.order_number,
		order_item_id: item.id,
		partner_provider: 'manual'
	};
	const { error } = await supabase.from('merch_dispatch_jobs').upsert(
		{
			order_id: order.id,
			order_item_id: item.id,
			partner_provider: 'manual',
			status: 'sent',
			external_reference: `manual-${order.order_number}`,
			request_payload: payload,
			response_payload: { queued_for_manual_fulfillment: true },
			attempts: 1,
			dispatched_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'order_item_id,partner_provider' }
	);
	if (error) throw new Error(error.message);
	return { ok: true, status: 'sent' };
}

async function upsertPrintfulDispatchJobs(
	supabase,
	order,
	items,
	{ status, externalReference = null, requestPayload = {}, responsePayload = {}, errorMessage = null }
) {
	const nowIso = new Date().toISOString();
	for (const item of items) {
		const { error } = await supabase.from('merch_dispatch_jobs').upsert(
			{
				order_id: order.id,
				order_item_id: item.id,
				partner_provider: PRINTFUL_PROVIDER,
				status,
				external_reference: externalReference || null,
				request_payload: requestPayload,
				response_payload: responsePayload,
				error_message: errorMessage || null,
				attempts: 1,
				dispatched_at: status === 'sent' ? nowIso : null,
				updated_at: nowIso
			},
			{ onConflict: 'order_item_id,partner_provider' }
		);
		if (error) throw new Error(error.message);
	}
}

async function dispatchPrintfulItems(supabase, order, items) {
	if (!items.length) return { ok: true, status: 'sent', skipped: true };

	const store = order?.store_id
		? await getMerchStoreById(supabase, order.store_id).catch(() => null)
		: await getMerchStoreBySlug(MAIN_STORE_SLUG).catch(() => null);
	if (!store?.id) {
		await upsertPrintfulDispatchJobs(supabase, order, items, {
			status: 'failed',
			errorMessage: 'Merch store could not be resolved for Printful fulfillment.'
		});
		return { ok: false, status: 'failed' };
	}

	const address = order.shipping_address || {};
	if (!validateUsShippingAddress(address)) {
		await upsertPrintfulDispatchJobs(supabase, order, items, {
			status: 'failed',
			errorMessage: 'Shipping address is incomplete for Printful fulfillment.'
		});
		return { ok: false, status: 'failed' };
	}

	try {
		items.map((item) => buildPrintfulItemPayload(item));
	} catch (error) {
		await upsertPrintfulDispatchJobs(supabase, order, items, {
			status: 'failed',
			errorMessage: error?.message || 'Printful item reference is missing or invalid.'
		});
		return { ok: false, status: 'failed' };
	}

	const printfulItems = items.map((item) => buildPrintfulItemPayload(item));
	const usesProductSource = printfulItems.some((entry) => cleanText(entry?.source, 24) === 'product');

	const requestPayload = {
		external_id: order.order_number,
		status: 'draft',
		shipping:
			cleanText(order.printful_shipping_option_id, 120) ||
			cleanText(order?.shipping_breakdown?.printful?.optionId, 120) ||
			undefined,
		recipient: buildPrintfulRecipient(address, order)
	};
	if (usesProductSource) requestPayload.items = printfulItems;
	else requestPayload.order_items = printfulItems;

	let responsePayload = {};
	let status = 'failed';
	let externalReference = null;
	let errorMessage = '';
	try {
		let accessToken = await getValidPrintfulAccessToken(supabase, store);
			let createOrderResult = await sendPrintfulRequest({
				path: '/v2/orders',
				method: 'POST',
				accessToken,
				storeId: store.printful_store_id,
				body: requestPayload
			});
			if (createOrderResult.status === 401) {
				accessToken = await getValidPrintfulAccessToken(supabase, store, { forceRefresh: true });
				createOrderResult = await sendPrintfulRequest({
					path: '/v2/orders',
					method: 'POST',
					accessToken,
					storeId: store.printful_store_id,
					body: requestPayload
				});
			}

		responsePayload = {
			create_order: createOrderResult.payload
		};

		if (!createOrderResult.ok) {
			errorMessage = `Printful v2 order create failed (${createOrderResult.status})`;
		} else {
			const orderId = String(
				createOrderResult?.payload?.result?.id ??
					createOrderResult?.payload?.data?.id ??
					createOrderResult?.payload?.id ??
					''
			);
			if (!orderId) {
				errorMessage = 'Printful v2 create order response did not include an order id.';
			} else {
					let confirmOrderResult = await sendPrintfulRequest({
						path: `/v2/orders/${encodeURIComponent(orderId)}/confirm`,
						method: 'POST',
						accessToken,
						storeId: store.printful_store_id
					});
					if (confirmOrderResult.status === 401) {
						accessToken = await getValidPrintfulAccessToken(supabase, store, {
							forceRefresh: true
						});
						confirmOrderResult = await sendPrintfulRequest({
							path: `/v2/orders/${encodeURIComponent(orderId)}/confirm`,
							method: 'POST',
							accessToken,
							storeId: store.printful_store_id
						});
					}
					responsePayload.confirm_order = confirmOrderResult.payload;
				if (!confirmOrderResult.ok) {
					errorMessage = `Printful v2 order confirmation failed (${confirmOrderResult.status})`;
				} else {
					status = 'sent';
					externalReference = orderId;
					await setPrintfulPartnerError(supabase, store.id, null);
				}
			}
		}
	} catch (error) {
		errorMessage = error?.message || 'Failed to call Printful API.';
	}

	await upsertPrintfulDispatchJobs(supabase, order, items, {
		status,
		externalReference,
		requestPayload,
		responsePayload,
		errorMessage
	});
	return { ok: status === 'sent', status };
}

async function dispatchOrderItems(supabase, order, orderItems) {
	const { data: existingJobs } = await supabase
		.from('merch_dispatch_jobs')
		.select('order_item_id,partner_provider,status')
		.eq('order_id', order.id);
	const sentMap = new Map(
		(existingJobs ?? [])
			.filter((row) => row.status === 'sent')
			.map((row) => [`${row.order_item_id}:${row.partner_provider}`, true])
	);

	const results = [];
	const pendingPrintfulItems = [];
	for (const item of orderItems) {
		const provider = item.partner_provider === 'printful' ? 'printful' : 'manual';
		if (sentMap.get(`${item.id}:${provider}`)) {
			results.push({ provider, status: 'sent', skipped: true });
			continue;
		}
		if (provider === 'printful') {
			pendingPrintfulItems.push(item);
		} else {
			results.push(await dispatchManualItem(supabase, order, item));
		}
	}
	if (pendingPrintfulItems.length) {
		results.push(await dispatchPrintfulItems(supabase, order, pendingPrintfulItems));
	}

	const sentCount = results.filter((result) => result.status === 'sent').length;
	const failedCount = results.filter((result) => result.status === 'failed').length;
	let fulfillmentStatus = 'not_started';
	if (sentCount > 0 && failedCount === 0) fulfillmentStatus = 'queued';
	if (sentCount > 0 && failedCount > 0) fulfillmentStatus = 'in_progress';
	if (sentCount === 0 && failedCount > 0) fulfillmentStatus = 'failed';

	await supabase
		.from('merch_orders')
		.update({
			status: order.status === 'paid' ? 'processing' : order.status,
			fulfillment_status: fulfillmentStatus,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);
}

export async function finalizeMerchOrderBySessionId(sessionId, fetchImpl) {
	const cleanedSessionId = cleanText(sessionId, 255);
	if (!cleanedSessionId) return { ok: false, status: 400, error: 'Missing checkout session id.' };

	const supabase = await getServiceSupabase();
	const { data: order, error: orderError } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('stripe_checkout_session_id', cleanedSessionId)
		.maybeSingle();
	if (orderError) return { ok: false, status: 500, error: orderError.message };
	if (!order) return { ok: false, status: 404, error: 'Order record not found.' };

	const stripe = getStripeClient();
	let session = null;
	try {
		session = await stripe.checkout.sessions.retrieve(
			cleanedSessionId,
			{ expand: ['payment_intent'] },
			{ stripeAccount: order.stripe_connected_account_id }
		);
	} catch {
		return { ok: false, status: 502, error: 'Unable to verify Stripe session.' };
	}

	const paymentIntentId =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: session.payment_intent?.id || null;
	const paid = session.payment_status === 'paid';
	const nextStatus = paid ? 'paid' : order.status;
	const nextPaymentStatus = paid ? 'paid' : order.payment_status;

	const { data: updatedRows, error: updateError } = await supabase
		.from('merch_orders')
		.update({
			status: nextStatus,
			payment_status: nextPaymentStatus,
			stripe_payment_intent_id: paymentIntentId,
			paid_at: paid ? new Date().toISOString() : order.paid_at,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id)
		.select('*')
		.single();
	if (updateError) return { ok: false, status: 500, error: updateError.message };
	const currentOrder = updatedRows ?? order;

	const { data: orderItems, error: orderItemsError } = await supabase
		.from('merch_order_items')
		.select('*')
		.eq('order_id', order.id)
		.order('created_at', { ascending: true });
	if (orderItemsError) return { ok: false, status: 500, error: orderItemsError.message };

	if (paid) {
		await sendOrderEmails({
			supabase,
			order: currentOrder,
			orderItems: orderItems ?? [],
			fetchImpl
		});
		await dispatchOrderItems(supabase, currentOrder, orderItems ?? []);
	}

	const { data: reloadedOrder } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('id', order.id)
		.maybeSingle();
	const { data: dispatchJobs } = await supabase
		.from('merch_dispatch_jobs')
		.select('*')
		.eq('order_id', order.id)
		.order('created_at', { ascending: true });
	return {
		ok: true,
		paid,
		order: reloadedOrder ?? currentOrder,
		orderItems: orderItems ?? [],
		dispatchJobs: dispatchJobs ?? []
	};
}

export async function finalizeMerchOrderByPaymentIntentId(paymentIntentId, fetchImpl) {
	const cleanedPaymentIntentId = cleanText(paymentIntentId, 255);
	if (!cleanedPaymentIntentId) {
		return { ok: false, status: 400, error: 'Missing payment intent id.' };
	}

	const supabase = await getServiceSupabase();
	const { data: order, error: orderError } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('stripe_payment_intent_id', cleanedPaymentIntentId)
		.maybeSingle();
	if (orderError) return { ok: false, status: 500, error: orderError.message };
	if (!order) return { ok: false, status: 404, error: 'Order record not found.' };

	const stripe = getStripeClient();
	let paymentIntent = null;
	try {
		paymentIntent = await stripe.paymentIntents.retrieve(
			cleanedPaymentIntentId,
			{ expand: ['latest_charge'] },
			{ stripeAccount: order.stripe_connected_account_id }
		);
	} catch {
		return { ok: false, status: 502, error: 'Unable to verify Stripe payment intent.' };
	}

	const paid = paymentIntent.status === 'succeeded';
	const failed =
		paymentIntent.status === 'canceled' || paymentIntent.status === 'requires_payment_method';
	const amountTotal = Number(
		paymentIntent.amount_received || paymentIntent.amount || order.total_cents
	);

	const { data: updatedRows, error: updateError } = await supabase
		.from('merch_orders')
		.update({
			customer_email:
				normalizeEmail(paymentIntent.receipt_email) || normalizeEmail(order.customer_email) || null,
			status: paid ? 'paid' : failed ? 'failed' : order.status,
			payment_status: paid ? 'paid' : failed ? 'failed' : order.payment_status,
			total_cents: Number.isFinite(amountTotal) && amountTotal > 0 ? amountTotal : order.total_cents,
			paid_at: paid ? new Date().toISOString() : order.paid_at,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id)
		.select('*')
		.single();
	if (updateError) return { ok: false, status: 500, error: updateError.message };
	const currentOrder = updatedRows ?? order;

	const { data: orderItems, error: orderItemsError } = await supabase
		.from('merch_order_items')
		.select('*')
		.eq('order_id', order.id)
		.order('created_at', { ascending: true });
	if (orderItemsError) return { ok: false, status: 500, error: orderItemsError.message };

	if (paid) {
		await sendOrderEmails({
			supabase,
			order: currentOrder,
			orderItems: orderItems ?? [],
			fetchImpl
		});
		await dispatchOrderItems(supabase, currentOrder, orderItems ?? []);
	}

	const { data: reloadedOrder } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('id', order.id)
		.maybeSingle();
	const { data: dispatchJobs } = await supabase
		.from('merch_dispatch_jobs')
		.select('*')
		.eq('order_id', order.id)
		.order('created_at', { ascending: true });

	return {
		ok: true,
		paid,
		order: reloadedOrder ?? currentOrder,
		orderItems: orderItems ?? [],
		dispatchJobs: dispatchJobs ?? []
	};
}

export async function listMerchOrdersForUser({
	userId,
	userEmail,
	isAdmin = false,
	storeSlug = MAIN_STORE_SLUG
}) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);

	let orderQuery = supabase
		.from('merch_orders')
		.select('*')
		.eq('store_id', store.id)
		.order('created_at', { ascending: false })
		.limit(100);
	if (!isAdmin) {
		const email = normalizeEmail(userEmail);
		if (!userId && !email) return { store, orders: [], orderItemsByOrderId: new Map() };
		if (userId && email) {
			orderQuery = orderQuery.or(`customer_user_id.eq.${userId},customer_email.eq.${email}`);
		} else if (userId) {
			orderQuery = orderQuery.eq('customer_user_id', userId);
		} else {
			orderQuery = orderQuery.eq('customer_email', email);
		}
	}
	const { data: orders, error } = await orderQuery;
	if (error) throw new Error(error.message);

	const orderIds = (orders ?? []).map((order) => order.id);
	if (!orderIds.length) return { store, orders: [], orderItemsByOrderId: new Map() };
	const { data: orderItems, error: itemError } = await supabase
		.from('merch_order_items')
		.select('*')
		.in('order_id', orderIds)
		.order('created_at', { ascending: true });
	if (itemError) throw new Error(itemError.message);

	const orderItemsByOrderId = new Map();
	for (const item of orderItems ?? []) {
		const list = orderItemsByOrderId.get(item.order_id) || [];
		list.push(item);
		orderItemsByOrderId.set(item.order_id, list);
	}
	return { store, orders: orders ?? [], orderItemsByOrderId };
}

export async function getMerchAdminDashboard(storeSlug = MAIN_STORE_SLUG) {
	const supabase = await getServiceSupabase();
	const store = await getMerchStoreBySlug(storeSlug);
	const [taxSettings, fulfillmentMethods, products, ordersResult, printfulAccount] = await Promise.all([
		getStoreTaxSettings(supabase, store.id),
		getStoreFulfillmentMethods(supabase, store.id, true),
		getMerchProductsWithVariants(supabase, store.id, true),
		listMerchOrdersForUser({ isAdmin: true, storeSlug }),
		getMerchPartnerAccountRecord(supabase, store.id, PRINTFUL_PROVIDER)
	]);

	let printfulStores = [];
	if (printfulAccount?.refresh_token) {
		try {
			printfulStores = await listPrintfulStoresForStore(supabase, store);
		} catch (error) {
			await setPrintfulPartnerError(
				supabase,
				store.id,
				error?.message || 'Unable to load available Printful stores.'
			).catch(() => {});
		}
	}

	return {
		store,
		taxSettings,
		fulfillmentMethods,
		products,
		orders: ordersResult.orders,
		orderItemsByOrderId: ordersResult.orderItemsByOrderId,
		printfulAccount: summarizePartnerAccount(printfulAccount),
		printfulStores
	};
}

function slugifyName(name) {
	return cleanText(name, 120)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export async function upsertMerchProduct({
	storeId,
	productId,
	name,
	description,
	imageUrl,
	clearImage = false,
	status,
	defaultPartner,
	userId
}) {
	const supabase = await getServiceSupabase();
	const cleanName = cleanText(name, 120);
	if (!cleanName) throw new Error('Product name is required.');
	const payload = {
		store_id: storeId,
		name: cleanName,
		slug: slugifyName(cleanName),
		description: cleanText(description, 3000) || null,
		status: ['active', 'draft', 'archived'].includes(status) ? status : 'active',
		default_partner: defaultPartner === 'printful' ? 'printful' : 'manual',
		created_by_user_id: userId || null,
		updated_at: new Date().toISOString()
	};
	if (clearImage) {
		payload.image_url = null;
	} else if (imageUrl !== undefined) {
		payload.image_url = cleanText(imageUrl, 1000) || null;
	}

	let product = null;
	if (productId) {
		const { data, error } = await supabase
			.from('merch_products')
			.update(payload)
			.eq('id', productId)
			.select('*')
			.single();
		if (error) throw new Error(error.message);
		product = data ?? null;
	} else {
		const { data, error } = await supabase
			.from('merch_products')
			.insert(payload)
			.select('*')
			.single();
		if (error) throw new Error(error.message);
		product = data ?? null;
	}
	if (!product?.id) throw new Error('Failed to save product.');
	return product;
}

export async function uploadMerchProductImage({ storeId, productId, file }) {
	const supabase = await getServiceSupabase();
	const normalizedFile = normalizeMerchImageFile(file);
	if (!normalizedFile) throw new Error('No product image file was provided.');

	const contentType = cleanText(normalizedFile.type, 120).toLowerCase();
	if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(contentType)) {
		throw new Error('Product image must be JPG, PNG, WEBP, or GIF.');
	}
	if (normalizedFile.size > MAX_PRODUCT_IMAGE_BYTES) {
		throw new Error('Product image exceeds the 10MB limit.');
	}

	const ext = inferImageExtension(contentType);
	const safeStoreId = cleanText(storeId, 64) || 'store';
	const safeProductId = cleanText(productId, 64) || 'draft';
	const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
	const objectPath = `stores/${safeStoreId}/products/${safeProductId}/${fileName}`;
	const arrayBuffer = await normalizedFile.arrayBuffer();

	const { error: uploadError } = await supabase.storage
		.from(MERCH_IMAGE_BUCKET)
		.upload(objectPath, arrayBuffer, { contentType, upsert: true });
	if (uploadError) throw new Error(uploadError.message);

	const { data: publicUrlData } = supabase.storage
		.from(MERCH_IMAGE_BUCKET)
		.getPublicUrl(objectPath);
	const publicUrl = cleanText(publicUrlData?.publicUrl, 2000);
	if (!publicUrl) {
		throw new Error('Image upload succeeded but public URL could not be resolved.');
	}
	return publicUrl;
}

export async function deleteMerchProduct(productId) {
	const supabase = await getServiceSupabase();
	const id = cleanText(productId, 64);
	if (!id) throw new Error('Product id is required.');
	const { error } = await supabase.from('merch_products').delete().eq('id', id);
	if (error) throw new Error(error.message);
}

export async function upsertMerchVariant({
	productId,
	variantId,
	name,
	sku,
	size,
	color,
	priceDollars,
	partnerProvider,
	partnerVariantRef,
	isActive
}) {
	const supabase = await getServiceSupabase();
	const cleanName = cleanText(name, 120);
	if (!cleanName) throw new Error('Variant name is required.');
	const priceCents = Math.round(Number(priceDollars || 0) * 100);
	if (!Number.isFinite(priceCents) || priceCents <= 0)
		throw new Error('Variant price must be positive.');

	const optionValues = {};
	const cleanSize = cleanText(size, 40);
	const cleanColor = cleanText(color, 40);
	if (cleanSize) optionValues.size = cleanSize;
	if (cleanColor) optionValues.color = cleanColor;

	const payload = {
		product_id: productId,
		name: cleanName,
		sku: cleanText(sku, 100) || null,
		option_values: optionValues,
		partner_provider: partnerProvider === 'printful' ? 'printful' : 'manual',
		partner_variant_ref: cleanText(partnerVariantRef, 2000) || null,
		price_cents: priceCents,
		is_active: isActive === false ? false : true,
		updated_at: new Date().toISOString()
	};

	if (variantId) {
		const { error } = await supabase
			.from('merch_product_variants')
			.update(payload)
			.eq('id', variantId);
		if (error) throw new Error(error.message);
	} else {
		const { error } = await supabase.from('merch_product_variants').insert(payload);
		if (error) throw new Error(error.message);
	}
}

export async function deleteMerchVariant(variantId) {
	const supabase = await getServiceSupabase();
	const id = cleanText(variantId, 64);
	if (!id) throw new Error('Variant id is required.');
	const { error } = await supabase.from('merch_product_variants').delete().eq('id', id);
	if (error) throw new Error(error.message);
}

export async function upsertMerchTaxSettings({ storeId, mode, flatRatePercent, notes }) {
	const supabase = await getServiceSupabase();
	const m = mode === 'flat_rate' ? 'flat_rate' : 'none';
	const bps = m === 'flat_rate' ? Math.max(0, Math.round(Number(flatRatePercent || 0) * 100)) : 0;
	const { error } = await supabase.from('merch_tax_settings').upsert(
		{
			store_id: storeId,
			mode: m,
			flat_rate_bps: bps,
			notes: cleanText(notes, 1000) || null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'store_id' }
	);
	if (error) throw new Error(error.message);
}

export async function createMerchFulfillmentMethod({
	storeId,
	name,
	methodType,
	description,
	baseFeeDollars,
	requiresAddress,
	shippingSpeedLabel,
	rateRuleMode = 'flat'
}) {
	const supabase = await getServiceSupabase();
	const cleanName = cleanText(name, 120);
	if (!cleanName) throw new Error('Fulfillment method name is required.');
	const resolvedMethodType = ['pickup', 'delivery', 'shipping'].includes(methodType)
		? methodType
		: 'pickup';
	const feeCents = Math.max(0, Math.round(Number(baseFeeDollars || 0) * 100));
	const { error } = await supabase.from('merch_fulfillment_methods').insert({
		store_id: storeId,
		name: cleanName,
		method_type: resolvedMethodType,
		description: cleanText(description, 1000) || null,
		base_fee_cents: feeCents,
		requires_address: resolvedMethodType === 'shipping' ? true : requiresAddress === true,
		shipping_speed_label: cleanText(shippingSpeedLabel, 120) || null,
		shipping_zone: 'US',
		rate_rule_mode: ['flat', 'quantity', 'subtotal'].includes(rateRuleMode)
			? rateRuleMode
			: 'flat'
	});
	if (error) throw new Error(error.message);
}

export async function updateMerchFulfillmentMethod({
	methodId,
	name,
	methodType,
	description,
	baseFeeDollars,
	requiresAddress,
	shippingSpeedLabel,
	rateRuleMode,
	isActive
}) {
	const supabase = await getServiceSupabase();
	const id = cleanText(methodId, 64);
	if (!id) throw new Error('Fulfillment method id is required.');
	const resolvedMethodType = ['pickup', 'delivery', 'shipping'].includes(methodType)
		? methodType
		: 'pickup';
	const payload = {
		name: cleanText(name, 120),
		method_type: resolvedMethodType,
		description: cleanText(description, 1000) || null,
		base_fee_cents: Math.max(0, Math.round(Number(baseFeeDollars || 0) * 100)),
		requires_address: resolvedMethodType === 'shipping' ? true : requiresAddress === true,
		shipping_speed_label: cleanText(shippingSpeedLabel, 120) || null,
		shipping_zone: 'US',
		rate_rule_mode: ['flat', 'quantity', 'subtotal'].includes(rateRuleMode) ? rateRuleMode : 'flat',
		is_active: isActive === false ? false : true,
		updated_at: new Date().toISOString()
	};
	if (!payload.name) throw new Error('Fulfillment method name is required.');
	const { error } = await supabase.from('merch_fulfillment_methods').update(payload).eq('id', id);
	if (error) throw new Error(error.message);
}

export async function upsertMerchShippingRule({
	fulfillmentMethodId,
	ruleId,
	metricType,
	minValue,
	maxValue,
	rateDollars,
	sortOrder
}) {
	const supabase = await getServiceSupabase();
	const methodId = cleanText(fulfillmentMethodId, 64);
	if (!methodId) throw new Error('Fulfillment method id is required.');
	const metric = metricType === 'subtotal' ? 'subtotal' : 'quantity';
	const min = Math.max(
		0,
		Math.round(Number(minValue || 0) * (metric === 'subtotal' ? 100 : 1))
	);
	const max = cleanText(maxValue, 40)
		? Math.max(min, Math.round(Number(maxValue) * (metric === 'subtotal' ? 100 : 1)))
		: null;
	const rateCents = Math.max(0, Math.round(Number(rateDollars || 0) * 100));
	const payload = {
		fulfillment_method_id: methodId,
		metric_type: metric,
		min_value: min,
		max_value: Number.isFinite(max) ? max : null,
		rate_cents: rateCents,
		sort_order: Math.max(0, Math.round(Number(sortOrder || 0))),
		updated_at: new Date().toISOString()
	};
	if (ruleId) {
		const { error } = await supabase.from('merch_shipping_rules').update(payload).eq('id', ruleId);
		if (error) throw new Error(error.message);
	} else {
		const { error } = await supabase.from('merch_shipping_rules').insert(payload);
		if (error) throw new Error(error.message);
	}
}

export async function deleteMerchShippingRule(ruleId) {
	const supabase = await getServiceSupabase();
	const id = cleanText(ruleId, 64);
	if (!id) throw new Error('Shipping rule id is required.');
	const { error } = await supabase.from('merch_shipping_rules').delete().eq('id', id);
	if (error) throw new Error(error.message);
}

export async function deleteMerchFulfillmentMethod(methodId) {
	const supabase = await getServiceSupabase();
	const id = cleanText(methodId, 64);
	if (!id) throw new Error('Fulfillment method id is required.');
	const { error } = await supabase.from('merch_fulfillment_methods').delete().eq('id', id);
	if (error) throw new Error(error.message);
}

export async function toggleMerchFulfillmentMethod(methodId, isActive) {
	const supabase = await getServiceSupabase();
	const id = cleanText(methodId, 64);
	if (!id) throw new Error('Fulfillment method id is required.');
	const { error } = await supabase
		.from('merch_fulfillment_methods')
		.update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
		.eq('id', id);
	if (error) throw new Error(error.message);
}

export async function markMerchOrderFulfilled(orderId) {
	const supabase = await getServiceSupabase();
	const id = cleanText(orderId, 64);
	if (!id) throw new Error('Order id is required.');
	const { error } = await supabase
		.from('merch_orders')
		.update({
			status: 'fulfilled',
			fulfillment_status: 'fulfilled',
			updated_at: new Date().toISOString()
		})
		.eq('id', id);
	if (error) throw new Error(error.message);
}

export async function refundMerchOrder({
	orderId,
	amountDollars,
	reason,
	createdByUserId,
	fetchImpl
}) {
	const supabase = await getServiceSupabase();
	const id = cleanText(orderId, 64);
	if (!id) throw new Error('Order id is required.');
	const { data: order, error } = await supabase
		.from('merch_orders')
		.select('*')
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!order) throw new Error('Order not found.');
	if (!order.stripe_payment_intent_id || !order.stripe_connected_account_id) {
		throw new Error('Order is missing Stripe payment details.');
	}
	if (order.payment_status !== 'paid') throw new Error('Only paid orders can be refunded.');

	const refundAmountCents = amountDollars
		? Math.max(1, Math.round(Number(amountDollars) * 100))
		: order.total_cents;
	if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
		throw new Error('Refund amount is invalid.');
	}

	const stripe = getStripeClient();
	const refund = await stripe.refunds.create(
		{
			payment_intent: order.stripe_payment_intent_id,
			amount: Math.min(refundAmountCents, order.total_cents),
			reason:
				reason === 'fraudulent' || reason === 'requested_by_customer' || reason === 'duplicate'
					? reason
					: undefined,
			metadata: { order_id: order.id, order_number: order.order_number }
		},
		{ stripeAccount: order.stripe_connected_account_id }
	);

	const refundStatus =
		refund?.status === 'succeeded'
			? 'succeeded'
			: refund?.status === 'failed'
				? 'failed'
				: 'pending';
	const normalizedReason = cleanText(reason, 240) || null;
	const { error: refundInsertError } = await supabase.from('merch_refunds').insert({
		order_id: order.id,
		stripe_refund_id: refund.id,
		amount_cents: refund.amount,
		reason: normalizedReason,
		status: refundStatus,
		created_by_user_id: createdByUserId || null
	});
	if (refundInsertError) throw new Error(refundInsertError.message);

	const { data: refundRows } = await supabase
		.from('merch_refunds')
		.select('amount_cents,status')
		.eq('order_id', order.id);
	const refundedTotal = (refundRows ?? [])
		.filter((row) => row.status === 'succeeded')
		.reduce((sum, row) => sum + toCents(row.amount_cents, 0), 0);
	const fullyRefunded = refundedTotal >= order.total_cents;

	await supabase
		.from('merch_orders')
		.update({
			status: fullyRefunded ? 'refunded' : order.status,
			payment_status: fullyRefunded ? 'refunded' : order.payment_status,
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);

	const orderEmail = normalizeEmail(order.customer_email);
	if (orderEmail && fetchImpl) {
		try {
			await sendEmail(
				{
					to: orderEmail,
					subject: `Refund processed for order ${order.order_number}`,
					html: `<p>We processed a refund of <strong>${formatCurrency(refund.amount, order.currency)}</strong> for order <strong>${order.order_number}</strong>.</p>`,
					text: `We processed a refund of ${formatCurrency(refund.amount, order.currency)} for order ${order.order_number}.`,
					tags: [{ Name: 'context', Value: 'merch-refund-customer' }]
				},
				{ fetch: fetchImpl }
			);
		} catch (errorSend) {
			console.error('Failed to send refund email to customer', errorSend);
		}
	}

	return { refundId: refund.id, amountCents: refund.amount, fullyRefunded };
}
