import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import {
	DEFAULT_CREATED_BY_USER_ID,
	importRideSeedData,
	parseRideSeedJson
} from '$lib/server/ride-imports';

export async function load({ cookies, url }) {
	await requireAdmin(cookies, {
		redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
	});

	return {
		initialValues: {
			json: '',
			slugPrefix: '',
			createdByUserId: DEFAULT_CREATED_BY_USER_ID,
			publish: true,
			dryRun: false
		}
	};
}

export const actions = {
	default: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const rawJson = String(formData.get('json') || '').trim();
		const slugPrefix = String(formData.get('slugPrefix') || '').trim();
		const createdByUserId =
			String(formData.get('createdByUserId') || '').trim() || DEFAULT_CREATED_BY_USER_ID;
		const publish = formData.get('publish') === 'on';
		const dryRun = formData.get('dryRun') === 'on';
		const values = { json: rawJson, slugPrefix, createdByUserId, publish, dryRun };

		try {
			await requireAdmin(cookies, {
				redirectTo: `/?auth=forbidden&returnTo=${encodeURIComponent(url.pathname)}`
			});

			if (!rawJson) {
				return fail(400, {
					error: 'JSON is required.',
					values
				});
			}

			const source = parseRideSeedJson(rawJson);
			const supabase = createServiceSupabaseClient();
			if (!supabase) {
				return fail(500, {
					error: 'Ride import is not configured.',
					values
				});
			}

			const result = await importRideSeedData(supabase, source, {
				createdByUserId,
				slugPrefix,
				publish,
				dryRun
			});

			return {
				success: true,
				result,
				values
			};
		} catch (actionError) {
			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to import rides.',
				values
			});
		}
	}
};
