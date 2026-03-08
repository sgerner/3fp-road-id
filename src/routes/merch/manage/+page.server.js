import { fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import {
	createMerchFulfillmentMethod,
	deleteMerchShippingRule,
	deleteMerchFulfillmentMethod,
	deleteMerchProduct,
	deleteMerchVariant,
	disconnectPrintfulForStore,
	getMerchAdminDashboard,
	getMerchStoreBySlug,
	markMerchOrderFulfilled,
	refundMerchOrder,
	syncPrintfulCatalogForStore,
	toggleMerchFulfillmentMethod,
	updateMerchFulfillmentMethod,
	updatePrintfulStoreSelection,
	upsertMerchProduct,
	upsertMerchShippingRule,
	uploadMerchProductImage,
	upsertMerchTaxSettings,
	upsertMerchVariant
} from '$lib/server/merch';

function formValue(formData, key) {
	return formData.get(key)?.toString() ?? '';
}

export const load = async ({ cookies, url }) => {
	await requireAdmin(cookies);
	const dashboard = await getMerchAdminDashboard('main');
	return {
		...dashboard,
		updated: (url.searchParams.get('updated') || '').trim(),
		printfulStatus: (url.searchParams.get('printful') || '').trim(),
		printfulReason: (url.searchParams.get('printful_reason') || '').trim()
	};
};

export const actions = {
	saveTax: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await upsertMerchTaxSettings({
				storeId: formValue(form, 'store_id'),
				mode: formValue(form, 'mode'),
				flatRatePercent: formValue(form, 'flat_rate_percent'),
				notes: formValue(form, 'notes')
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to save tax settings.' });
		}
		throw redirect(303, '/merch/manage?updated=tax');
	},
	savePrintfulSettings: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await updatePrintfulStoreSelection({
				storeSlug: 'main',
				printfulStoreId: formValue(form, 'printful_store_id'),
				syncEnabled: formValue(form, 'printful_sync_enabled') === '1'
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to save Printful settings.' });
		}
		throw redirect(303, '/merch/manage?updated=printful');
	},
	syncPrintfulCatalog: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			if (formValue(form, 'printful_store_id')) {
				await updatePrintfulStoreSelection({
					storeSlug: 'main',
					printfulStoreId: formValue(form, 'printful_store_id'),
					syncEnabled: formValue(form, 'printful_sync_enabled') === '1'
				});
			}
			await syncPrintfulCatalogForStore({ storeSlug: 'main' });
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to sync Printful catalog.' });
		}
		throw redirect(303, '/merch/manage?updated=printful_sync');
	},
	createFulfillment: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await createMerchFulfillmentMethod({
				storeId: formValue(form, 'store_id'),
				name: formValue(form, 'name'),
				methodType: formValue(form, 'method_type'),
				description: formValue(form, 'description'),
				baseFeeDollars: formValue(form, 'base_fee_dollars'),
				requiresAddress: formValue(form, 'requires_address') === '1',
				shippingSpeedLabel: formValue(form, 'shipping_speed_label'),
				rateRuleMode: formValue(form, 'rate_rule_mode')
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to create fulfillment method.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	saveFulfillment: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await updateMerchFulfillmentMethod({
				methodId: formValue(form, 'method_id'),
				name: formValue(form, 'name'),
				methodType: formValue(form, 'method_type'),
				description: formValue(form, 'description'),
				baseFeeDollars: formValue(form, 'base_fee_dollars'),
				requiresAddress: formValue(form, 'requires_address') === '1',
				shippingSpeedLabel: formValue(form, 'shipping_speed_label'),
				rateRuleMode: formValue(form, 'rate_rule_mode'),
				isActive: formValue(form, 'is_active') !== '0'
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to update fulfillment method.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	toggleFulfillment: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await toggleMerchFulfillmentMethod(
				formValue(form, 'method_id'),
				formValue(form, 'is_active') === '1'
			);
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to update fulfillment method.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	saveShippingRule: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await upsertMerchShippingRule({
				fulfillmentMethodId: formValue(form, 'fulfillment_method_id'),
				ruleId: formValue(form, 'rule_id') || null,
				metricType: formValue(form, 'metric_type'),
				minValue: formValue(form, 'min_value'),
				maxValue: formValue(form, 'max_value'),
				rateDollars: formValue(form, 'rate_dollars'),
				sortOrder: formValue(form, 'sort_order')
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to save shipping rule.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	deleteShippingRule: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await deleteMerchShippingRule(formValue(form, 'rule_id'));
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to delete shipping rule.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	deleteFulfillment: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await deleteMerchFulfillmentMethod(formValue(form, 'method_id'));
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to delete fulfillment method.' });
		}
		throw redirect(303, '/merch/manage?updated=fulfillment');
	},
	saveProduct: async ({ cookies, request }) => {
		const { user } = await requireAdmin(cookies);
		const form = await request.formData();
		const storeId = formValue(form, 'store_id');
		const existingProductId = formValue(form, 'product_id') || null;
		const clearImage = formValue(form, 'clear_image') === '1';
		const maybeImageFile = form.get('image_file');
		const imageFile =
			maybeImageFile &&
			typeof maybeImageFile === 'object' &&
			typeof maybeImageFile.arrayBuffer === 'function'
				? maybeImageFile
				: null;
		try {
			let uploadedImageUrl;
			if (imageFile?.size > 0) {
				uploadedImageUrl = await uploadMerchProductImage({
					storeId,
					productId: existingProductId,
					file: imageFile
				});
			}

			await upsertMerchProduct({
				storeId,
				productId: existingProductId,
				name: formValue(form, 'name'),
				description: formValue(form, 'description'),
				imageUrl: uploadedImageUrl,
				clearImage: clearImage && !uploadedImageUrl,
				status: formValue(form, 'status'),
				defaultPartner: formValue(form, 'default_partner'),
				userId: user?.id || null
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to save product.' });
		}
		throw redirect(303, '/merch/manage?updated=products');
	},
	deleteProduct: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await deleteMerchProduct(formValue(form, 'product_id'));
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to delete product.' });
		}
		throw redirect(303, '/merch/manage?updated=products');
	},
	saveVariant: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await upsertMerchVariant({
				productId: formValue(form, 'product_id'),
				variantId: formValue(form, 'variant_id') || null,
				name: formValue(form, 'name'),
				sku: formValue(form, 'sku'),
				size: formValue(form, 'size'),
				color: formValue(form, 'color'),
				priceDollars: formValue(form, 'price_dollars'),
				partnerProvider: formValue(form, 'partner_provider'),
				partnerVariantRef: formValue(form, 'partner_variant_ref'),
				isActive: formValue(form, 'is_active') !== '0'
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to save variant.' });
		}
		throw redirect(303, '/merch/manage?updated=variants');
	},
	deleteVariant: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await deleteMerchVariant(formValue(form, 'variant_id'));
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to delete variant.' });
		}
		throw redirect(303, '/merch/manage?updated=variants');
	},
	disconnectPrintful: async ({ cookies }) => {
		await requireAdmin(cookies);
		try {
			const store = await getMerchStoreBySlug('main');
			await disconnectPrintfulForStore(store.id);
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to disconnect Printful.' });
		}
		throw redirect(303, '/merch/manage?printful=disconnected');
	},
	markFulfilled: async ({ cookies, request }) => {
		await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await markMerchOrderFulfilled(formValue(form, 'order_id'));
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to mark order fulfilled.' });
		}
		throw redirect(303, '/merch/manage?updated=orders');
	},
	refundOrder: async ({ cookies, request, fetch }) => {
		const { user } = await requireAdmin(cookies);
		const form = await request.formData();
		try {
			await refundMerchOrder({
				orderId: formValue(form, 'order_id'),
				amountDollars: formValue(form, 'amount_dollars'),
				reason: formValue(form, 'reason'),
				createdByUserId: user?.id || null,
				fetchImpl: fetch
			});
		} catch (error) {
			return fail(400, { error: error?.message || 'Failed to process refund.' });
		}
		throw redirect(303, '/merch/manage?updated=refund');
	}
};
