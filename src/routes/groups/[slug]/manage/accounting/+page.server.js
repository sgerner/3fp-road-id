import { fail } from '@sveltejs/kit';
import {
	actionFailure,
	addManualFeedItem,
	autoMatchFeedItems,
	completeAutomatedReconciliation,
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
	requireGroupAccountingManager,
	saveConnections,
	saveSettings,
	syncAllBankTransactions,
	syncMercuryTransactions,
	syncStripeFinancialConnectionsTransactions,
	syncStripeTransactions,
	unpublishSnapshot,
	updateBudget,
	updateEntryByReplacement,
	updateTransaction,
	updateAccount,
	updateAccountGroup,
	updateProviderAccountMapping,
	voidEntry,
	reclassifyReceipt
} from '$lib/server/groupAccounting';

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
			await postSimpleEntry(auth, await request.formData());
		}),
	transfer: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postTransfer(auth, await request.formData());
		}),
	journal: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postJournal(auth, await request.formData());
		}),
	openingBalance: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postOpeningBalance(auth, await request.formData());
		}),
	createAccount: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await createAccount(auth, await request.formData());
		}),
	updateAccount: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateAccount(auth, await request.formData());
			return { account_updated: true };
		}),
	updateAccountGroup: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateAccountGroup(auth, await request.formData());
			return { account_group_updated: true };
		}),
	updateBudget: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateBudget(auth, await request.formData());
		}),
	saveSettings: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await saveSettings(auth, await request.formData());
		}),
	saveConnections: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await saveConnections(auth, await request.formData());
		}),
	addManualFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await addManualFeedItem(auth, await request.formData());
		}),
	importBankCsv: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await importBankCsv(auth, await request.formData());
		}),
	postFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await postFeedItem(auth, await request.formData());
		}),
	matchFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await matchFeedItemToEntry(auth, await request.formData());
		}),
	ignoreFeedItem: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await ignoreFeedItem(auth, await request.formData());
		}),
	reconcile: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await createReconciliation(auth, await request.formData());
		}),
	completeReconciliation: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await completeAutomatedReconciliation(auth, await request.formData());
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
			await syncAllBankTransactions(auth);
		}),
	syncMercury: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await syncMercuryTransactions(auth);
		}),
	updateProviderAccountMapping: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateProviderAccountMapping(auth, await request.formData());
			return { provider_account_updated: true };
		}),
	syncStripe: async ({ cookies, params }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await syncStripeTransactions(auth);
		}),
	voidEntry: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await voidEntry(auth, await request.formData());
		}),
	updateEntry: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateEntryByReplacement(auth, await request.formData());
		}),
	updateTransaction: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await updateTransaction(auth, await request.formData());
			return { transaction_updated: true };
		}),
	reclassifyReceipt: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await reclassifyReceipt(auth, await request.formData());
		}),
	publishSnapshot: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await publishSnapshot(auth, await request.formData());
		}),
	unpublishSnapshot: async ({ cookies, params, request }) =>
		withAccountingAuth(cookies, params, async (auth) => {
			await unpublishSnapshot(auth, await request.formData());
		})
};
