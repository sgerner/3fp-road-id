import { goto, refreshAll } from '$app/navigation';
import {
	buildClientGotoOptions,
	buildDeferredFormUpdateOptions,
	buildShallowQueryUrl,
	buildShallowReplaceGotoOptions,
	createClientNavigationHelpers,
	guardUnsavedNavigation,
	isNonShallowNavigation
} from '#lib/client/navigationCore.js';

const helpers = createClientNavigationHelpers({ goto, refreshAll });

export const {
	applyFormUpdate,
	completeFormUpdate,
	navigateAfterMutation,
	navigateClient,
	refreshPageData,
	replaceClientLocation,
	replaceShallowQueryParam,
	replaceShallowState
} = helpers;

export {
	buildClientGotoOptions,
	buildDeferredFormUpdateOptions,
	buildShallowQueryUrl,
	buildShallowReplaceGotoOptions,
	createClientNavigationHelpers,
	guardUnsavedNavigation,
	isNonShallowNavigation
};
