import { supabase } from '$lib/supabaseClient';

export const load = async ({ params }) => {
  const slug = params.slug;

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .single();
  if (groupError) return { error: groupError.message };

  const [gt, af, rd, sl, gx, ax, rx, sx] = await Promise.all([
    supabase.from('group_types').select('id, name').order('name'),
    supabase.from('audience_focuses').select('id, name').order('name'),
    supabase.from('riding_disciplines').select('id, name').order('name'),
    supabase.from('skill_levels').select('id, name').order('name'),
    supabase.from('group_x_group_types').select('group_type_id').eq('group_id', group.id),
    supabase.from('group_x_audience_focuses').select('audience_focus_id').eq('group_id', group.id),
    supabase.from('group_x_riding_disciplines').select('riding_discipline_id').eq('group_id', group.id),
    supabase.from('group_x_skill_levels').select('skill_level_id').eq('group_id', group.id)
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
    }
  };
};
