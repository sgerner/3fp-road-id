import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

// Adds the current authenticated user as an owner of the group.
// Used by invite links (magic link flow) after authentication.
export async function POST({ params, cookies }) {
  try {
    const slug = params.slug;
    const sessionCookie = cookies.get('sb_session');
    if (!sessionCookie) return json({ error: 'Not authenticated' }, { status: 401 });
    let parsed;
    try { parsed = JSON.parse(sessionCookie); } catch { parsed = null; }
    const access_token = parsed?.access_token;
    if (!access_token) return json({ error: 'Not authenticated' }, { status: 401 });

    const { data: userRes, error: userErr } = await supabase.auth.getUser(access_token);
    if (userErr || !userRes?.user?.id) return json({ error: 'Invalid user' }, { status: 401 });
    const user_id = userRes.user.id;

    // Resolve group
    const { data: group, error: ge } = await supabase.from('groups').select('id, slug').eq('slug', slug).single();
    if (ge || !group) return json({ error: 'Group not found' }, { status: 404 });

    // Upsert owner membership
    const { data: existing, error: exErr } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('user_id', user_id)
      .eq('role', 'owner');
    if (exErr) return json({ error: exErr.message }, { status: 400 });

    if (!existing || !existing.length) {
      const { error: insErr } = await supabase
        .from('group_members')
        .insert([{ group_id: group.id, user_id, role: 'owner' }]);
      if (insErr) return json({ error: insErr.message }, { status: 400 });
    }

    return json({ ok: true, slug: group.slug });
  } catch (e) {
    console.error('Add owner error', e);
    return json({ error: 'Unexpected error' }, { status: 500 });
  }
}

