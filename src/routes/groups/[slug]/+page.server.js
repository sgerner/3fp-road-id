import { supabase } from '$lib/supabaseClient';

export const load = async ({ params, cookies }) => {
        const slug = params.slug;

        const { data: group, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('slug', slug)
                .single();
        if (groupError) return { error: groupError.message };

        let sessionUserId = null;
        let sessionIsAdmin = false;

        const sessionCookie = cookies.get('sb_session');
        if (sessionCookie) {
                try {
                        const parsed = JSON.parse(sessionCookie);
                        const access_token = parsed?.access_token;
                        if (access_token) {
                                const { data: userRes } = await supabase.auth.getUser(access_token);
                                sessionUserId = userRes?.user?.id ?? null;
                                if (sessionUserId) {
                                        const { data: prof } = await supabase
                                                .from('profiles')
                                                .select('admin')
                                                .eq('user_id', sessionUserId)
                                                .maybeSingle();
                                        sessionIsAdmin = prof?.admin === true;
                                }
                        }
                } catch (err) {
                        console.warn('Failed to resolve session for group page', err);
                        sessionUserId = null;
                        sessionIsAdmin = false;
                }
        }

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

        const ownerRows = Array.isArray(owners.data) ? owners.data : [];
        const ownerIds = ownerRows.map((row) => row.user_id).filter(Boolean);
        const is_owner = sessionUserId ? ownerIds.includes(sessionUserId) : false;
        const can_edit = sessionIsAdmin || is_owner;

        const nowIso = new Date().toISOString();
        let volunteerEvents = [];
        try {
                const { data: eventRows, error: volunteerError } = await supabase
                        .from('volunteer_events')
                        .select(
                                [
                                        'id',
                                        'slug',
                                        'title',
                                        'summary',
                                        'event_start',
                                        'event_end',
                                        'timezone',
                                        'location_name',
                                        'location_address',
                                        'host_group_id',
                                        'host_user_id'
                                ].join(', ')
                        )
                        .eq('host_group_id', group.id)
                        .eq('status', 'published')
                        .gte('event_start', nowIso)
                        .order('event_start', { ascending: true })
                        .limit(3);

                if (volunteerError) {
                        console.warn('Failed to load volunteer events for group page', volunteerError);
                } else if (Array.isArray(eventRows)) {
                        volunteerEvents = eventRows.map((row) => ({
                                id: row.id,
                                slug: row.slug,
                                title: row.title,
                                summary: row.summary,
                                event_start: row.event_start,
                                event_end: row.event_end,
                                timezone: row.timezone,
                                location_name: row.location_name,
                                location_address: row.location_address,
                                host_group_id: row.host_group_id,
                                can_manage:
                                        sessionIsAdmin ||
                                        is_owner ||
                                        (sessionUserId && row.host_user_id && row.host_user_id === sessionUserId)
                        }));
                }
        } catch (err) {
                console.warn('Unexpected error loading volunteer events for group page', err);
        }

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
                owners_count: ownerIds.length,
                is_owner,
                can_edit,
                volunteer_events: volunteerEvents
        };
};
