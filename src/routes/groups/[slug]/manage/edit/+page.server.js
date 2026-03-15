// Re-use load from the canonical edit server
export { load } from '../../edit/+page.server.js';

// Re-use actions but override the final redirect to stay in manage shell
import { redirect } from '@sveltejs/kit';
import { actions as editActions } from '../../edit/+page.server.js';

export const actions = {
	default: async (event) => {
		const slug = event.params.slug;
		// Run the canonical action
		const result = await editActions.default(event).catch((e) => {
			// The canonical action throws a redirect — intercept and reroute
			if (e?.status && e.status >= 300 && e.status < 400) {
				throw redirect(e.status, `/groups/${slug}/manage/edit?saved=1`);
			}
			throw e;
		});
		return result;
	}
};
