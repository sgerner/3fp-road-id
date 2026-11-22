/**
 * Pure SvelteKit 3 client navigation option builders, shallow-navigation guards,
 * and dependency-injected helper factories. Kept free of `$app/*` imports so
 * server/Node test suites can verify option mappings and execution ordering directly.
 */

/**
 * @param {{ reset?: boolean, navigate?: boolean }} [options]
 * @returns {{ reset: boolean, refreshAll: false, navigate?: boolean }}
 */
export function buildDeferredFormUpdateOptions({ reset = false, navigate } = {}) {
	/** @type {{ reset: boolean, refreshAll: false, navigate?: boolean }} */
	const options = {
		reset: Boolean(reset),
		refreshAll: false
	};
	if (typeof navigate === 'boolean') {
		options.navigate = navigate;
	}
	return options;
}

/**
 * @param {Record<string, any>} [state]
 */
export function buildShallowReplaceGotoOptions(state = {}) {
	return {
		state,
		shallow: true,
		replace: true
	};
}

/**
 * @param {{ refreshAll?: boolean, replace?: boolean }} [options]
 */
export function buildClientGotoOptions({ refreshAll = false, replace = false } = {}) {
	return {
		refreshAll: Boolean(refreshAll),
		replace: Boolean(replace)
	};
}

/**
 * @param {string | URL} currentHref
 * @param {string} param
 * @param {string | number | boolean | null | undefined} value
 */
export function buildShallowQueryUrl(currentHref, param, value) {
	const url = new URL(currentHref);
	if (value == null) {
		url.searchParams.delete(param);
	} else {
		url.searchParams.set(param, String(value));
	}
	return url;
}

/**
 * @param {{ shallow?: boolean } | null | undefined} navigation
 */
export function isNonShallowNavigation(navigation) {
	return !navigation?.shallow;
}

/**
 * @param {{ shallow?: boolean, cancel?: () => void } | null | undefined} navigation
 * @param {{
 *   shouldWarn?: boolean,
 *   message?: string,
 *   confirmFn?: ((message?: string) => boolean) | undefined
 * }} [options]
 */
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

/**
 * @param {{
 *   goto: (url: string | URL, opts?: any) => any,
 *   refreshAll: () => any,
 *   getHref?: () => string | null | undefined
 * }} deps
 */
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

	/**
	 * @param {((options?: { reset?: boolean, refreshAll?: boolean, navigate?: boolean }) => any) | null | undefined} update
	 * @param {{ reset?: boolean, navigate?: boolean }} [options]
	 */
	async function applyFormUpdate(update, { reset = false, navigate } = {}) {
		if (typeof update === 'function') {
			await update(buildDeferredFormUpdateOptions({ reset, navigate }));
		}
	}

	/**
	 * @param {((options?: { reset?: boolean, refreshAll?: boolean, navigate?: boolean }) => any) | null | undefined} update
	 * @param {any} result
	 * @param {{
	 *   reset?: boolean,
	 *   succeeded?: boolean,
	 *   onSuccess?: ((result: any) => any) | null
	 * }} [options]
	 */
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

	/**
	 * @param {string | URL} url
	 * @param {Record<string, any>} [state]
	 */
	function replaceShallowState(url, state = {}) {
		return goto(url, buildShallowReplaceGotoOptions(state));
	}

	/**
	 * @param {string} param
	 * @param {string | number | boolean | null | undefined} value
	 * @param {{ href?: string | null | undefined, state?: Record<string, any> }} [options]
	 */
	function replaceShallowQueryParam(param, value, { href = getHref(), state = {} } = {}) {
		if (!href) return undefined;
		const url = buildShallowQueryUrl(href, param, value);
		return replaceShallowState(url, state);
	}

	/**
	 * @param {string | URL} url
	 * @param {{ refreshAll?: boolean, replace?: boolean }} [options]
	 */
	function navigateClient(url, { refreshAll: shouldRefreshAll = false, replace = false } = {}) {
		return goto(url, buildClientGotoOptions({ refreshAll: shouldRefreshAll, replace }));
	}

	/**
	 * @param {string | URL} url
	 * @param {{ replace?: boolean }} [options]
	 */
	function navigateAfterMutation(url, { replace = true } = {}) {
		return navigateClient(url, { refreshAll: true, replace });
	}

	/**
	 * @param {string | URL} url
	 */
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
