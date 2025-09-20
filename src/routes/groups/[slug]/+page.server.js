import { supabase } from '$lib/supabaseClient';

export const load = async ({ params, cookies }) => {
	const slug = params.slug;

	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.single();
	if (groupError) return { error: groupError.message };

	const [gt, af, rd, sl, gx, ax, rx, sx, owners] = await Promise.all([
		supabase.from('group_types').select('id, name').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name'),
		supabase.from('skill_levels').select('id, name').order('name'),
		supabase.from('group_x_group_types').select('group_type_id').eq('group_id', group.id),
		supabase.from('group_x_audience_focuses').select('audience_focus_id').eq('group_id', group.id),
		supabase
			.from('group_x_riding_disciplines')
			.select('riding_discipline_id')
			.eq('group_id', group.id),
		supabase.from('group_x_skill_levels').select('skill_level_id').eq('group_id', group.id),
		supabase.from('group_members').select('user_id').eq('group_id', group.id).eq('role', 'owner')
	]);

	return {
		group,
		group_types: gt.data ?? [],
		audience_focuses: af.data ?? [],
		riding_disciplines: rd.data ?? [],
		skill_levels: sl.data ?? [],
		selected: {
			group_type_ids: (gx.data ?? []).map((r) => r.group_type_id),
			audience_focus_ids: (ax.data ?? []).map((r) => r.audience_focus_id),
			riding_discipline_ids: (rx.data ?? []).map((r) => r.riding_discipline_id),
			skill_level_ids: (sx.data ?? []).map((r) => r.skill_level_id)
		},
		owners_count: (owners.data ?? []).length,
		// Determine if current user can edit (owner or admin member)
		is_owner: await (async () => {
			try {
				const session = cookies.get('sb_session');
				if (!session) return false;
				const parsed = JSON.parse(session);
				const access_token = parsed?.access_token;
				if (!access_token) return false;
				const { data: userRes } = await supabase.auth.getUser(access_token);
				const user_id = userRes?.user?.id;
				if (!user_id) return false;
				const { data: ownerRows } = await supabase
					.from('group_members')
					.select('user_id')
					.eq('group_id', group.id)
					.eq('role', 'owner')
					.eq('user_id', user_id);
				return !!(ownerRows && ownerRows.length);
			} catch {
				return false;
			}
		})(),
		can_edit: await (async () => {
			try {
				const session = cookies.get('sb_session');
				if (!session) return false;
				const parsed = JSON.parse(session);
				const access_token = parsed?.access_token;
				if (!access_token) return false;
				const { data: userRes } = await supabase.auth.getUser(access_token);
				const user_id = userRes?.user?.id;
				if (!user_id) return false;
				// Global admins (profiles.admin) can edit any group
				const { data: prof } = await supabase
					.from('profiles')
					.select('user_id, admin')
					.eq('user_id', user_id)
					.maybeSingle();
				if (prof?.admin === true) return true;
				// Otherwise, owners of this group can edit
				const { data: ownerRows } = await supabase
					.from('group_members')
					.select('user_id')
					.eq('group_id', group.id)
					.eq('role', 'owner')
					.eq('user_id', user_id);
				return !!(ownerRows && ownerRows.length);
			} catch {
				return false;
			}
		})()
	};
};
