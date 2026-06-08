import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import {
	addWorkspaceUserAlias,
	createWorkspaceUser,
	deleteWorkspaceUser,
	deleteWorkspaceUserAlias,
	getDelegatedAdminEmail,
	getWorkspaceUser,
	listWorkspaceUsers,
	listWorkspaceOrgUnits,
	setWorkspaceUserPassword,
	setWorkspaceUserSuspended,
	signOutWorkspaceUser,
	updateWorkspaceUser,
	workspaceConfigured
} from '$lib/server/googleWorkspace';
import {
	cleanText,
	confirmationMatches,
	exactText,
	expectedConfirmation,
	normalizeWorkspaceAliases,
	sameEmail
} from '$lib/server/googleWorkspaceRules';

function normalizeError(error, fallback) {
	return error?.body?.message || error?.message || fallback;
}

async function assertNotIntegrationAdmin(userKey, operation) {
	const delegatedAdminEmail = getDelegatedAdminEmail();
	if (!delegatedAdminEmail) return;

	const target = await getWorkspaceUser(userKey);
	if (sameEmail(target?.primaryEmail, delegatedAdminEmail)) {
		throw new Error(
			`Cannot ${operation} ${delegatedAdminEmail}; this account is used for Workspace API delegation.`
		);
	}
}

export async function load({ cookies, url }) {
	await requireAdmin(cookies, {
		redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
	});

	const search = cleanText(url.searchParams.get('q'));
	const pageToken = cleanText(url.searchParams.get('pageToken'));
	const configured = workspaceConfigured();

	let users = [];
	let orgUnits = [{ name: 'Root', orgUnitPath: '/', description: '' }];
	let nextPageToken = '';
	let loadError = '';
	let orgUnitsError = '';

	if (configured) {
		const [usersResult, orgUnitsResult] = await Promise.allSettled([
			listWorkspaceUsers({ query: search, pageToken, maxResults: 50 }),
			listWorkspaceOrgUnits({ orgUnitPath: '/', type: 'ALL' })
		]);

		if (usersResult.status === 'fulfilled') {
			users = usersResult.value.users.map((user) => ({
				...user,
				aliases: normalizeWorkspaceAliases(user.aliases)
			}));
			nextPageToken = usersResult.value.nextPageToken;
		} else {
			loadError = normalizeError(usersResult.reason, 'Unable to load Workspace users.');
		}

		if (orgUnitsResult.status === 'fulfilled') {
			const orgUnitResult = orgUnitsResult.value;
			const orgUnitPaths = new Set(orgUnitResult.map((item) => item.orgUnitPath));
			if (!orgUnitPaths.has('/')) {
				orgUnits = [{ name: 'Root', orgUnitPath: '/', description: '' }, ...orgUnitResult];
			} else {
				orgUnits = orgUnitResult;
			}
		} else {
			orgUnitsError = normalizeError(orgUnitsResult.reason, 'Unable to load organizational units.');
		}
	}

	return {
		configured,
		search,
		pageToken,
		nextPageToken,
		users,
		orgUnits,
		loadError,
		orgUnitsError
	};
}

export const actions = {
	createUser: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const primaryEmail = cleanText(formData.get('primaryEmail')).toLowerCase();
		const givenName = cleanText(formData.get('givenName'));
		const familyName = cleanText(formData.get('familyName'));
		const password = exactText(formData.get('password'));
		const orgUnitPath = cleanText(formData.get('orgUnitPath')) || '/';
		const changePasswordAtNextLogin = formData.get('changePasswordAtNextLogin') === 'on';

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});

			if (!primaryEmail || !givenName || !familyName || !password) {
				return fail(400, { error: 'First name, last name, email, and password are required.' });
			}

			await createWorkspaceUser({
				primaryEmail,
				givenName,
				familyName,
				password,
				changePasswordAtNextLogin,
				orgUnitPath
			});
			return { success: true, message: `Created ${primaryEmail}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to create user.') });
		}
	},

	updateUser: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const primaryEmail = cleanText(formData.get('primaryEmail')).toLowerCase();
		const givenName = cleanText(formData.get('givenName'));
		const familyName = cleanText(formData.get('familyName'));
		const orgUnitPath = cleanText(formData.get('orgUnitPath'));

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey) return fail(400, { error: 'User identifier is required.' });

			const payload = {};
			if (primaryEmail) payload.primaryEmail = primaryEmail;
			if (givenName || familyName) {
				payload.name = {};
				if (givenName) payload.name.givenName = givenName;
				if (familyName) payload.name.familyName = familyName;
			}
			if (orgUnitPath) payload.orgUnitPath = orgUnitPath;
			if (!Object.keys(payload).length) {
				return fail(400, { error: 'No updates provided.' });
			}

			await assertNotIntegrationAdmin(userKey, 'update');
			await updateWorkspaceUser(userKey, payload);
			return { success: true, message: `Updated ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to update user.') });
		}
	},

	resetPassword: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const password = exactText(formData.get('password'));
		const changePasswordAtNextLogin = formData.get('changePasswordAtNextLogin') === 'on';

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey || !password) {
				return fail(400, { error: 'User identifier and new password are required.' });
			}

			await setWorkspaceUserPassword(userKey, password, { changePasswordAtNextLogin });
			return { success: true, message: `Password updated for ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to reset password.') });
		}
	},

	deleteUser: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const confirmText = cleanText(formData.get('confirmText'));

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey) return fail(400, { error: 'User identifier is required.' });
			const expected = expectedConfirmation('DELETE', userKey);
			if (!confirmationMatches(confirmText, 'DELETE', userKey)) {
				return fail(400, { error: `Confirmation mismatch. Type exactly: ${expected}` });
			}
			await assertNotIntegrationAdmin(userKey, 'delete');
			await deleteWorkspaceUser(userKey);
			return { success: true, message: `Deleted ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to delete user.') });
		}
	},

	setSuspended: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const suspended = cleanText(formData.get('suspended')) === 'true';
		const confirmText = cleanText(formData.get('confirmText'));

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey) return fail(400, { error: 'User identifier is required.' });
			const action = suspended ? 'SUSPEND' : 'UNSUSPEND';
			const expected = expectedConfirmation(action, userKey);
			if (!confirmationMatches(confirmText, action, userKey)) {
				return fail(400, { error: `Confirmation mismatch. Type exactly: ${expected}` });
			}
			if (suspended) {
				await assertNotIntegrationAdmin(userKey, 'suspend');
			}
			await setWorkspaceUserSuspended(userKey, suspended);
			return { success: true, message: `${suspended ? 'Suspended' : 'Restored'} ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to update suspension.') });
		}
	},

	signOut: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const confirmText = cleanText(formData.get('confirmText'));

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey) return fail(400, { error: 'User identifier is required.' });
			const expected = expectedConfirmation('SIGNOUT', userKey);
			if (!confirmationMatches(confirmText, 'SIGNOUT', userKey)) {
				return fail(400, { error: `Confirmation mismatch. Type exactly: ${expected}` });
			}
			await signOutWorkspaceUser(userKey);
			return { success: true, message: `Signed out all sessions for ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to sign out user.') });
		}
	},

	addAlias: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const alias = cleanText(formData.get('alias')).toLowerCase();

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey || !alias)
				return fail(400, { error: 'User identifier and alias are required.' });
			await addWorkspaceUserAlias(userKey, alias);
			return { success: true, message: `Added alias ${alias} to ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to add alias.') });
		}
	},

	deleteAlias: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const userKey = cleanText(formData.get('userKey'));
		const alias = cleanText(formData.get('alias'));
		const confirmText = cleanText(formData.get('confirmText'));

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});
			if (!userKey || !alias)
				return fail(400, { error: 'User identifier and alias are required.' });
			const expected = expectedConfirmation('REMOVE', alias);
			if (!confirmationMatches(confirmText, 'REMOVE', alias)) {
				return fail(400, { error: `Confirmation mismatch. Type exactly: ${expected}` });
			}
			await deleteWorkspaceUserAlias(userKey, alias);
			return { success: true, message: `Deleted alias ${alias} from ${userKey}.` };
		} catch (error) {
			return fail(400, { error: normalizeError(error, 'Unable to delete alias.') });
		}
	}
};
