/**
 * Pure SvelteKit 3 client navigation option builders, shallow-navigation guards,
 * and dependency-injected helper factories. Kept free of `$app/*` imports so
 * server/Node test suites can verify option mappings and execution ordering directly.
 */

export function buildDeferredFormUpdateOptions({ reset = false, navigate } = {}) {
	const options = {
		reset: Boolean(reset),
		refreshAll: false
	};
	if (typeof navigate === 'boolean') {
		options.navigate = navigate;
	}
	return options;
}

export function buildShallowReplaceGotoOptions(state = {}) {
	return {
		state,
		shallow: true,
		replace: true
	};
}

export function buildClientGotoOptions({ refreshAll = false, replace = false } = {}) {
	return {
		refreshAll: Boolean(refreshAll),
		replace: Boolean(replace)
	};
}

export function buildShallowQueryUrl(currentHref, param, value) {
	const url = new URL(currentHref);
	if (value == null) {
		url.searchParams.delete(param);
	} else {
		url.searchParams.set(param, String(value));
	}
	return url;
}

export function isNonShallowNavigation(navigation) {
	return !navigation?.shallow;
}

export function guardUnsavedNavigation(
	navigation,
	{
		shouldWarn = false,
		message = 'Leave without saving your changes?',
		confirmFn = globalThis.confirm
	} = {}
) {
	if (!isNonShallowNavigation(navigation) || !shouldWarn) {
		return false;
	}
	if (typeof confirmFn === 'function' && !confirmFn(message)) {
		navigation?.cancel?.();
		return true;
	}
	return false;
}

export function createClientNavigationHelpers({
	goto,
	refreshAll,
	getHref = () => globalThis.window?.location?.href
}) {
	if (typeof goto !== 'function' || typeof refreshAll !== 'function') {
		throw new TypeError('createClientNavigationHelpers requires goto and refreshAll functions.');
	}

	function refreshPageData() {
		return refreshAll();
	}

	async function applyFormUpdate(update, { reset = false, navigate } = {}) {
		if (typeof update === 'function') {
			await update(buildDeferredFormUpdateOptions({ reset, navigate }));
		}
	}

	async function completeFormUpdate(
		update,
		result,
		{ reset = false, succeeded = result?.type === 'success', onSuccess } = {}
	) {
		await applyFormUpdate(update, { reset });
		if (!succeeded) return false;
		if (typeof onSuccess === 'function') {
			await onSuccess(result);
		}
		await refreshPageData();
		return true;
	}

	function replaceShallowState(url, state = {}) {
		return goto(url, buildShallowReplaceGotoOptions(state));
	}

	function replaceShallowQueryParam(param, value, { href = getHref(), state = {} } = {}) {
		if (!href) return undefined;
		const url = buildShallowQueryUrl(href, param, value);
		return replaceShallowState(url, state);
	}

	function navigateClient(url, { refreshAll: shouldRefreshAll = false, replace = false } = {}) {
		return goto(url, buildClientGotoOptions({ refreshAll: shouldRefreshAll, replace }));
	}

	function navigateAfterMutation(url, { replace = true } = {}) {
		return navigateClient(url, { refreshAll: true, replace });
	}

	function replaceClientLocation(url) {
		return navigateClient(url, { refreshAll: false, replace: true });
	}

	return {
		applyFormUpdate,
		completeFormUpdate,
		navigateAfterMutation,
		navigateClient,
		refreshPageData,
		replaceClientLocation,
		replaceShallowQueryParam,
		replaceShallowState
	};
}
