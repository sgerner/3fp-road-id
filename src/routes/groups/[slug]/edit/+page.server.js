import { supabase } from '$lib/supabaseClient';
import { fail, redirect } from '@sveltejs/kit';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

async function mirrorRemoteImageToStorage(remoteUrl, destBasePath) {
  try {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) return null;
    const res = await fetch(remoteUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    const ext = (() => {
      if (ct.includes('jpeg')) return 'jpg';
      if (ct.includes('png')) return 'png';
      if (ct.includes('webp')) return 'webp';
      if (ct.includes('gif')) return 'gif';
      return 'img';
    })();
    const path = `${destBasePath}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('storage').upload(path, ab, {
      contentType: ct,
      upsert: true
    });
    if (up.error) return null;
    const { data } = supabase.storage.from('storage').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

async function uploadLocalImageToStorage(file, destBasePath) {
  try {
    if (!file || typeof file.arrayBuffer !== 'function') return null;
    const ct = file.type || 'application/octet-stream';
    if (!ct.startsWith('image/')) return null;
    const ab = await file.arrayBuffer();
    const ext = (() => {
      if (ct.includes('jpeg')) return 'jpg';
      if (ct.includes('png')) return 'png';
      if (ct.includes('webp')) return 'webp';
      if (ct.includes('gif')) return 'gif';
      return 'img';
    })();
    const path = `${destBasePath}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('storage').upload(path, ab, { contentType: ct, upsert: true });
    if (up.error) return null;
    const { data } = supabase.storage.from('storage').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!m) return null;
  const [, mime, b64] = m;
  try {
    const buf = Buffer.from(b64, 'base64');
    return { mime, buffer: buf };
  } catch {
    return null;
  }
}

async function uploadDataUrlToStorage(dataUrl, destBasePath) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const { mime, buffer } = parsed;
  const ct = mime || 'image/jpeg';
  if (!ct.startsWith('image/')) return null;
  const ext = (() => {
    if (ct.includes('jpeg')) return 'jpg';
    if (ct.includes('png')) return 'png';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('gif')) return 'gif';
    return 'img';
  })();
  const path = `${destBasePath}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('storage').upload(path, buffer, { contentType: ct, upsert: true });
  if (up.error) return null;
  const { data } = supabase.storage.from('storage').getPublicUrl(path);
  return data?.publicUrl || null;
}

export const load = async ({ params, cookies }) => {
  const slug = params.slug;

  // Require authenticated user
  const sessionCookie = cookies.get('sb_session');
  if (!sessionCookie) throw redirect(303, `/groups/${slug}?auth=required`);
  let parsed;
  try {
    parsed = JSON.parse(sessionCookie);
  } catch {
    parsed = null;
  }
  const access_token = parsed?.access_token;
  if (!access_token) throw redirect(303, `/groups/${slug}?auth=required`);
  const { data: userRes } = await supabase.auth.getUser(access_token);
  const user_id = userRes?.user?.id;
  if (!user_id) throw redirect(303, `/groups/${slug}?auth=required`);

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .single();
  if (groupError) return { error: groupError.message };

  // Admin or Ownership check
  let isAdmin = false;
  let profileRow = null;
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('user_id, email, admin')
      .eq('user_id', user_id)
      .maybeSingle();
    profileRow = prof || null;
    isAdmin = !!prof?.admin;
  } catch (e) {
    // ignore
  }


  if (!isAdmin) {
    const { data: ownerRows, error: ownerErr } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('role', 'owner')
      .eq('user_id', user_id);
    if (ownerErr) throw redirect(303, `/groups/${slug}`);
    if (!ownerRows || ownerRows.length === 0) throw redirect(303, `/groups/${slug}?auth=forbidden`);
  }

  // Fetch all owners for display
  const { data: allOwners, error: allOwnersErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', group.id)
    .eq('role', 'owner');
  if (allOwnersErr) {
    return { error: allOwnersErr.message };
  }

  // Fetch emails for owners from profiles mapping
  const ownerIds = (allOwners ?? []).map((r) => r.user_id);
  let ownerEmails = [];
  if (ownerIds.length) {
    const { data: emailsData } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', ownerIds);
    ownerEmails = emailsData || [];
  }

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
    },
    owners: (allOwners ?? []).map((r) => ({
      user_id: r.user_id,
      email: (ownerEmails.find((e) => e.user_id === r.user_id)?.email) || ''
    })),
    current_user_id: user_id,
    current_profile: profileRow
  };
};

export const actions = {
  default: async ({ params, request, cookies }) => {
    const slug = params.slug;

    // Require authenticated owner
    const sessionCookie = cookies.get('sb_session');
    if (!sessionCookie) return fail(401, { error: 'Authentication required.' });
    let parsed;
    try { parsed = JSON.parse(sessionCookie); } catch { parsed = null; }
    const access_token = parsed?.access_token;
    if (!access_token) return fail(401, { error: 'Authentication required.' });
    const { data: userRes } = await supabase.auth.getUser(access_token);
    const user_id = userRes?.user?.id;
    if (!user_id) return fail(401, { error: 'Authentication required.' });
    const { data: group, error: ge } = await supabase
      .from('groups')
      .select('id, slug, logo_url, cover_photo_url')
      .eq('slug', slug)
      .single();
    if (ge || !group) return fail(404, { error: 'Group not found' });
    const group_id = group.id;

    // Admin or owner can proceed
    let isAdmin = false;
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, email, admin')
        .eq('user_id', user_id)
        .maybeSingle();
      isAdmin = !!prof?.admin;
    } catch (e) {
      // ignore
    }
    if (!isAdmin) {
      const { data: ownerRows } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', group_id)
        .eq('role', 'owner')
        .eq('user_id', user_id);
      if (!ownerRows || ownerRows.length === 0) return fail(403, { error: 'You do not have permission to edit this group.' });
    }

    const form = await request.formData();

    const payload = {
      city: form.get('city')?.toString().trim() ?? '',
      state_region: form.get('state_region')?.toString().trim() ?? '',
      country: form.get('country')?.toString().trim()?.toUpperCase() ?? 'US',
      tagline: form.get('tagline')?.toString().trim() || null,
      description: form.get('description')?.toString().trim() || null,
      website_url: form.get('website_url')?.toString().trim() || null,
      public_contact_email: form.get('public_contact_email')?.toString().trim() || null,
      public_phone_number: form.get('public_phone_number')?.toString().trim() || null,
      preferred_contact_method_instructions:
        form.get('preferred_contact_method_instructions')?.toString().trim() || null,
      how_to_join_instructions: form.get('how_to_join_instructions')?.toString().trim() || null,
      specific_meeting_point_address: form.get('specific_meeting_point_address')?.toString().trim() || null,
      latitude: (() => {
        const v = form.get('latitude');
        if (v === null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      longitude: (() => {
        const v = form.get('longitude');
        if (v === null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      service_area_description: form.get('service_area_description')?.toString().trim() || null,
      // skill_levels now managed via join table
      activity_frequency: form.get('activity_frequency')?.toString().trim() || null,
      typical_activity_day_time: form.get('typical_activity_day_time')?.toString().trim() || null,
      membership_info: form.get('membership_info')?.toString().trim() || null,
      preferred_cta_kind: (() => {
        const v = (form.get('preferred_cta_kind')?.toString() || 'auto').toLowerCase();
        return ['auto', 'website', 'email', 'phone', 'custom', 'facebook', 'instagram', 'strava', 'x', 'tiktok'].includes(v) ? v : 'auto';
      })(),
      preferred_cta_label: null,
      preferred_cta_url: null,
      // logo/cover handled below (mirror to storage first)
      social_links: (() => {
        const get = (k) => form.get(k)?.toString().trim() || '';
        const buildUrl = (val, prefix) => {
          if (!val) return null;
          if (/^https?:\/\//i.test(val)) return val;
          return `${prefix}${val.replace(/^@/, '')}`;
        };
        const obj = {
          instagram: buildUrl(get('social_instagram'), 'https://www.instagram.com/'),
          facebook: buildUrl(get('social_facebook'), 'https://www.facebook.com/'),
          x: buildUrl(get('social_x'), 'https://x.com/'),
          threads: buildUrl(get('social_threads'), 'https://www.threads.net/@'),
          youtube: (() => {
            const v = get('social_youtube');
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            const handle = v.startsWith('@') ? v : `@${v}`;
            return `https://www.youtube.com/${handle}`;
          })(),
          tiktok: buildUrl(get('social_tiktok'), 'https://www.tiktok.com/@'),
          strava: (() => {
            const v = get('social_strava');
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            return `https://www.strava.com/clubs/${v}`;
          })(),
          bluesky: (() => {
            const v = get('social_bluesky');
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            return `https://bsky.app/profile/${v.replace(/^@/, '')}`;
          })(),
          linkedin: (() => {
            const v = get('social_linkedin');
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            // best-effort: company page
            return `https://www.linkedin.com/company/${v}`;
          })(),
          
        };
        // Drop nulls
        const cleaned = Object.fromEntries(Object.entries(obj).filter(([_, v]) => !!v));
        return Object.keys(cleaned).length ? cleaned : null;
      })()
    };

    if (payload.preferred_cta_kind === 'custom') {
      const lbl = (form.get('preferred_cta_label')?.toString().trim() || '').slice(0, 10);
      const url = form.get('preferred_cta_url')?.toString().trim() || '';
      if (!lbl) return fail(400, { error: 'Custom CTA label is required and must be 10 characters or fewer.' });
      if (!url) return fail(400, { error: 'Custom CTA URL is required.' });
      payload.preferred_cta_label = lbl;
      payload.preferred_cta_url = url;
    }

    // Optional name update (avoid null overwriting not-null column)
    const incomingName = form.get('name')?.toString().trim() || '';
    if (incomingName) payload.name = incomingName;

    // Basic required validation
    if (!payload.state_region || !payload.country) {
      return fail(400, { error: 'State/Region and Country are required.' });
    }

    // Handle images: prefer uploaded file, else mirror remote URL, empty clears
    const incomingLogo = form.get('logo_url')?.toString().trim() || '';
    const incomingCover = form.get('cover_photo_url')?.toString().trim() || '';
    const clearLogo = (form.get('clear_logo')?.toString() || '') === '1';
    const clearCover = (form.get('clear_cover')?.toString() || '') === '1';
    const logoFile = form.get('logo_file');
    const coverFile = form.get('cover_file');
    const logoCropped = form.get('logo_file_cropped')?.toString() || '';
    const coverCropped = form.get('cover_file_cropped')?.toString() || '';

    // Hard limit server-side for safety
    if (logoFile && logoFile.size && logoFile.size > MAX_BYTES) {
      return fail(400, { error: 'Logo file exceeds 10MB limit.' });
    }
    if (coverFile && coverFile.size && coverFile.size > MAX_BYTES) {
      return fail(400, { error: 'Cover image exceeds 10MB limit.' });
    }
    // Validate cropped data URLs size if provided
    if (logoCropped) {
      const parsed = parseDataUrl(logoCropped);
      if (!parsed || parsed.buffer.length > MAX_BYTES) return fail(400, { error: 'Cropped logo exceeds 10MB limit.' });
    }
    if (coverCropped) {
      const parsed = parseDataUrl(coverCropped);
      if (!parsed || parsed.buffer.length > MAX_BYTES) return fail(400, { error: 'Cropped cover exceeds 10MB limit.' });
    }
    if (clearLogo) payload.logo_url = null;
    if (clearCover) payload.cover_photo_url = null;
    if (logoCropped) {
      const newLogo = await uploadDataUrlToStorage(logoCropped, `groups/${group_id}/logo`);
      if (newLogo) payload.logo_url = newLogo;
      else if (group.logo_url) payload.logo_url = group.logo_url;
    } else if (logoFile && logoFile.size) {
      const newLogo = await uploadLocalImageToStorage(logoFile, `groups/${group_id}/logo`);
      if (newLogo) payload.logo_url = newLogo;
      else if (group.logo_url) payload.logo_url = group.logo_url;
    } else if (incomingLogo && /^https?:\/\//i.test(incomingLogo)) {
      const newLogo = await mirrorRemoteImageToStorage(incomingLogo, `groups/${group_id}/logo`);
      if (newLogo) payload.logo_url = newLogo;
      else if (group.logo_url) payload.logo_url = group.logo_url; // keep previous if mirror fails
    }
    if (coverCropped) {
      const newCover = await uploadDataUrlToStorage(coverCropped, `groups/${group_id}/cover`);
      if (newCover) payload.cover_photo_url = newCover;
      else if (group.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
    } else if (coverFile && coverFile.size) {
      const newCover = await uploadLocalImageToStorage(coverFile, `groups/${group_id}/cover`);
      if (newCover) payload.cover_photo_url = newCover;
      else if (group.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
    } else if (incomingCover && /^https?:\/\//i.test(incomingCover)) {
      const newCover = await mirrorRemoteImageToStorage(incomingCover, `groups/${group_id}/cover`);
      if (newCover) payload.cover_photo_url = newCover;
      else if (group.cover_photo_url) payload.cover_photo_url = group.cover_photo_url;
    }

    const { error: upErr } = await supabase.from('groups').update(payload).eq('id', group_id);
    if (upErr) return fail(500, { error: upErr.message });

    // Update many-to-many mappings by replacing sets
    const gt_ids = form.getAll('group_type_ids').map((v) => Number(v)).filter(Boolean);
    const af_ids = form.getAll('audience_focus_ids').map((v) => Number(v)).filter(Boolean);
    const rd_ids = form.getAll('riding_discipline_ids').map((v) => Number(v)).filter(Boolean);

    const ops = [];
    ops.push(supabase.from('group_x_group_types').delete().eq('group_id', group_id));
    ops.push(supabase.from('group_x_audience_focuses').delete().eq('group_id', group_id));
    ops.push(supabase.from('group_x_riding_disciplines').delete().eq('group_id', group_id));
    ops.push(supabase.from('group_x_skill_levels').delete().eq('group_id', group_id));

    const delRes = await Promise.all(ops);
    const delErr = delRes.find((r) => r.error)?.error;
    if (delErr) return fail(500, { error: delErr.message });

    const inserts = [];
    if (gt_ids.length)
      inserts.push(
        supabase.from('group_x_group_types').insert(gt_ids.map((group_type_id) => ({ group_id, group_type_id })))
      );
    if (af_ids.length)
      inserts.push(
        supabase
          .from('group_x_audience_focuses')
          .insert(af_ids.map((audience_focus_id) => ({ group_id, audience_focus_id })))
      );
    if (rd_ids.length)
      inserts.push(
        supabase
          .from('group_x_riding_disciplines')
          .insert(rd_ids.map((riding_discipline_id) => ({ group_id, riding_discipline_id })))
      );
    const sl_ids = form.getAll('skill_level_ids').map((v) => Number(v)).filter(Boolean);
    if (sl_ids.length)
      inserts.push(
        supabase
          .from('group_x_skill_levels')
          .insert(sl_ids.map((skill_level_id) => ({ group_id, skill_level_id })))
      );

    if (inserts.length) {
      const insRes = await Promise.all(inserts);
      const insErr = insRes.find((r) => r.error)?.error;
      if (insErr) return fail(500, { error: insErr.message });
    }

    throw redirect(303, `/groups/${slug}/edit?saved=1`);
  }
};
