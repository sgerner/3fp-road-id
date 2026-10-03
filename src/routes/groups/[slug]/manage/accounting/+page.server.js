import { fail, redirect } from '@sveltejs/kit';
import { readFormData } from '$lib/server/security';
import {
	actionFailure,
	attachReceiptToEntry,
	addManualFeedItem,
	autoMatchFeedItems,
	completeAutomatedReconciliation,
	createReconciliationStatementDownload,
	createAccount,
	createReconciliation,
	ignoreFeedItem,
	importBankCsv,
	loadAccountingDashboard,
	matchFeedItemToEntry,
	postFeedItem,
	postJournal,
	postOpeningBalance,
	postSimpleEntry,
	postTransfer,
	publishSnapshot,
	reopenReconciliation,
	requireGroupAccountingManager,
	resolveProviderCorrection,
	saveConnections,
	saveSettings,
	syncAllBankTransactions,
	syncMercuryTransactions,
	syncStripeFinancialConnectionsTransactions,
	syncStripeTransactions,
	unpublishSnapshot,
	updateBudget,
	updateTransaction,
	updateAccount,
	updateAccountGroup,
	updateProviderAccountMapping,
	voidEntry,
	reclassifyReceipt
} from '$lib/server/groupAccounting';

const MAX_ACCOUNTING_FORM_BYTES = 12 * 1024 * 1024;

async function readAccountingFormData(request) {
	const result = await readFormData(request, { maxBytes: MAX_ACCOUNTING_FORM_BYTES });
	if (!result.ok) {
		const error = new Error(result.error);
		error.status = result.status;
		throw error;
	}
	return result.value;
}

async function withAccountingAuth(cookies, params, handler) {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) return fail(auth.status, { accounting_error: auth.error });
	try {
		const result = await handler(auth);
		return result ?? { accounting_success: true };
	} catch (error) {
		return actionFailure(error);
	}
}

export const load = async ({ cookies, params, url }) => {
	const auth = await requireGroupAccountingManager(cookies, params.slug);
	if (!auth.ok) {
		return {
			accounting_error: auth.error,
			settings: null,
			accounts: [],
			report: null,
			entries: [],
			budgets: [],
			feed_items: [],
			connections: [],
			reconciliations: [],
			public_reports: [],
			year: new Date().getFullYear(),
			report_period_key: 'this_year',
			report_period_label: 'This year',
			report_from: `${new Date().getFullYear()}-01-01`,
			report_to: new Date().toISOString().slice(0, 10),
			report_filter_active: false
		};
	}
	return loadAccountingDashboard(auth, url);
};

export const actions = {
	recordMoney: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			const entry = await postSimpleEntry(auth, await readAccountingFormData(request));
			return { accounting_success: true, accounting_warning: entry.receipt_warning || null };
		}),
	transfer: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postTransfer(auth, await readAccountingFormData(request));
		}),
	journal: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postJournal(auth, await readAccountingFormData(request));
		}),
	openingBalance: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postOpeningBalance(auth, await readAccountingFormData(request));
		}),
	createAccount: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await createAccount(auth, await readAccountingFormData(request));
		}),
	updateAccount: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateAccount(auth, await readAccountingFormData(request));
			return { account_updated: true };
		}),
	updateAccountGroup: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateAccountGroup(auth, await readAccountingFormData(request));
			return { account_group_updated: true };
		}),
	updateBudget: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateBudget(auth, await readAccountingFormData(request));
		}),
	saveSettings: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await saveSettings(auth, await readAccountingFormData(request));
		}),
	saveConnections: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await saveConnections(auth, await readAccountingFormData(request));
		}),
	addManualFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await addManualFeedItem(auth, await readAccountingFormData(request));
		}),
	importBankCsv: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await importBankCsv(auth, await readAccountingFormData(request));
		}),
	postFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postFeedItem(auth, await readAccountingFormData(request));
		}),
	matchFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await matchFeedItemToEntry(auth, await readAccountingFormData(request));
		}),
	ignoreFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await ignoreFeedItem(auth, await readAccountingFormData(request));
		}),
	reconcile: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await createReconciliation(auth, await readAccountingFormData(request));
		}),
	completeReconciliation: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await completeAutomatedReconciliation(auth, await readAccountingFormData(request));
		}),
	reopenReconciliation: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await reopenReconciliation(auth, await readAccountingFormData(request));
		}),
	downloadReconciliationStatement: async ({ cookies, params, request }) => {
		const result = await withAccountingAuth(cookies, params, async (auth) => {
			const formData = await readAccountingFormData(request);
			return await createReconciliationStatementDownload(auth, formData.get('reconciliationId'));
		});
		if (result?.url) throw redirect(303, result.url);
		return result;
	},
	resolveProviderCorrection: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await resolveProviderCorrection(auth, await readAccountingFormData(request));
		}),
	autoMatch: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await autoMatchFeedItems(auth);
		}),
	syncLinkedAccounts: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await syncStripeFinancialConnectionsTransactions(auth);
		}),
	syncAll: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			const result = await syncAllBankTransactions(auth);
			if (result.errors?.length) {
				return {
					accounting_error: `Imported ${result.inserted} new items, but some connections failed: ${result.errors.join(' ')}`
				};
			}
			return { accounting_success: true, imported_items: result.inserted };
		}),
	syncMercury: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await syncMercuryTransactions(auth);
		}),
	updateProviderAccountMapping: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateProviderAccountMapping(auth, await readAccountingFormData(request));
			return { provider_account_updated: true };
		}),
	syncStripe: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			const result = await syncStripeTransactions(auth);
			if (result.skipped) {
				return {
					accounting_error: `Imported ${result.inserted} new items. ${result.skipped} Stripe transactions had incomplete or inconsistent data and need provider review.`
				};
			}
			return { accounting_success: true, imported_items: result.inserted };
		}),
	voidEntry: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await voidEntry(auth, await readAccountingFormData(request));
		}),
	updateTransaction: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateTransaction(auth, await readAccountingFormData(request));
			return { transaction_updated: true };
		}),
	reclassifyReceipt: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await reclassifyReceipt(auth, await readAccountingFormData(request));
		}),
	attachReceipt: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await attachReceiptToEntry(auth, await readAccountingFormData(request));
			return { accounting_success: true, receipt_attached: true };
		}),
	publishSnapshot: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await publishSnapshot(auth, await readAccountingFormData(request));
		}),
	unpublishSnapshot: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await unpublishSnapshot(auth, await readAccountingFormData(request));
		})
};
