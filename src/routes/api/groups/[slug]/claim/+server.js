import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ params, cookies }) {
  try {
    const slug = params.slug;
    const sessionCookie = cookies.get('sb_session');
    if (!sessionCookie) return json({ error: 'Not authenticated' }, { status: 401 });
    let parsed;
    try { parsed = JSON.parse(sessionCookie); } catch { parsed = null; }
    const access_token = parsed?.access_token;
    if (!access_token) return json({ error: 'Not authenticated' }, { status: 401 });

    // Validate user
    const { data: userRes, error: userErr } = await supabase.auth.getUser(access_token);
    if (userErr || !userRes?.user?.id) return json({ error: 'Invalid user' }, { status: 401 });
    const user_id = userRes.user.id;

    // Find group by slug
    const { data: group, error: ge } = await supabase.from('groups').select('id, slug').eq('slug', slug).single();
    if (ge || !group) return json({ error: 'Group not found' }, { status: 404 });

    // Check if already owned
    const { data: owners, error: oe } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('role', 'owner');
    if (oe) return json({ error: oe.message }, { status: 400 });
    if ((owners || []).length > 0) return json({ error: 'Group already claimed' }, { status: 409 });

    // Claim
    const { error: insErr } = await supabase
      .from('group_members')
      .insert([{ group_id: group.id, user_id, role: 'owner' }]);
    if (insErr) return json({ error: insErr.message }, { status: 400 });

    return json({ ok: true, slug: group.slug });
  } catch (e) {
    console.error('Claim group error', e);
    return json({ error: 'Unexpected error' }, { status: 500 });
  }
}

