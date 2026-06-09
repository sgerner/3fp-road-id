import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export const load = async ({ params }) => {
	const supabase = createServiceSupabaseClient();
	if (!supabase) return { error: 'Reports are unavailable.' };
	const { data: group } = await supabase
		.from('groups')
		.select('id,slug,name,logo_url')
		.eq('slug', params.slug)
		.maybeSingle();
	if (!group) return { error: 'Group not found.' };
	const { data: report, error } = await supabase
		.from('group_accounting_public_reports')
		.select('*')
		.eq('group_id', group.id)
		.eq('slug', params.reportSlug)
		.eq('published', true)
		.maybeSingle();
	if (error) return { error: error.message };
	if (!report) return { error: 'Report not found.' };
	return { group, report };
};
