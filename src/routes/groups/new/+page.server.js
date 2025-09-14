import { supabase } from '$lib/supabaseClient';
import { fail, redirect } from '@sveltejs/kit';

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

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const load = async () => {
  const [gt, af, rd, sl] = await Promise.all([
    supabase.from('group_types').select('id, name').order('name'),
    supabase.from('audience_focuses').select('id, name').order('name'),
    supabase.from('riding_disciplines').select('id, name').order('name'),
    supabase.from('skill_levels').select('id, name').order('name')
  ]);

  return {
    group_types: gt.data ?? [],
    audience_focuses: af.data ?? [],
    riding_disciplines: rd.data ?? [],
    skill_levels: sl.data ?? []
  };
};

export const actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = form.get('name')?.toString().trim();
    const city = form.get('city')?.toString().trim() ?? '';
    const state_region = form.get('state_region')?.toString().trim();
    const _country = form.get('country')?.toString().trim();
    const country = _country ? _country.toUpperCase() : null;
    const tagline = form.get('tagline')?.toString().trim() || null;
    const description = form.get('description')?.toString().trim() || null;
    const visible_website_url = form.get('website_url')?.toString().trim() || '';
    const suggested_website_url = form.get('suggested_website_url')?.toString().trim() || '';
    const website_url = visible_website_url || suggested_website_url || null;
    const public_contact_email = form.get('public_contact_email')?.toString().trim() || null;
    const public_phone_number = form.get('public_phone_number')?.toString().trim() || null;
    const preferred_contact_method_instructions = form
      .get('preferred_contact_method_instructions')
      ?.toString()
      .trim() || null;
    const how_to_join_instructions = form.get('how_to_join_instructions')?.toString().trim() || null;
    // Extra, potentially AI-suggested fields
    const membership_info = form.get('membership_info')?.toString().trim() || null;
    const specific_meeting_point_address =
      form.get('specific_meeting_point_address')?.toString().trim() || null;
    const latitude = (() => {
      const v = form.get('latitude');
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })();
    const longitude = (() => {
      const v = form.get('longitude');
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })();
    const service_area_description = form.get('service_area_description')?.toString().trim() || null;
    // Deprecated: skill_levels_description now replaced by discrete selections
    const activity_frequency = form.get('activity_frequency')?.toString().trim() || null;
    const typical_activity_day_time = form.get('typical_activity_day_time')?.toString().trim() || null;
    const incoming_logo_url = form.get('logo_url')?.toString().trim() || '';
    const incoming_cover_url = form.get('cover_photo_url')?.toString().trim() || '';
    const social_links = (() => {
      const raw = form.get('social_links')?.toString().trim();
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })();

    if (!name || !state_region || !country) {
      return fail(400, { error: 'Please fill required fields.', values: Object.fromEntries(form) });
    }

    let slug = slugify(form.get('slug')?.toString() || name);
    if (!slug) slug = slugify(name);

    // Attempt insert, handle potential slug conflict once by suffixing a short hash
    const insertPayload = {
      slug,
      name,
      city,
      state_region,
      country,
      tagline,
      description,
      website_url,
      public_contact_email,
      public_phone_number,
      preferred_contact_method_instructions,
      how_to_join_instructions,
      membership_info,
      specific_meeting_point_address,
      latitude,
      longitude,
      service_area_description,
      activity_frequency,
      typical_activity_day_time,
      social_links
    };

    let { data: groupRes, error: groupErr } = await supabase
      .from('groups')
      .insert(insertPayload)
      .select('id, slug')
      .single();

    if (groupErr && groupErr.code === '23505') {
      // unique_violation on slug; try once with suffix
      const suffix = Math.random().toString(36).slice(2, 6);
      insertPayload.slug = `${slug}-${suffix}`;
      const retry = await supabase.from('groups').insert(insertPayload).select('id, slug').single();
      groupRes = retry.data;
      groupErr = retry.error;
    }

    if (groupErr) {
      return fail(500, { error: groupErr.message, values: Object.fromEntries(form) });
    }

    const group_id = groupRes.id;

    // Mirror remote images to storage after group creation and update the record
    const updates = {};
    if (incoming_logo_url && /^https?:\/\//i.test(incoming_logo_url)) {
      const publicUrl = await mirrorRemoteImageToStorage(incoming_logo_url, `groups/${group_id}/logo`);
      if (publicUrl) updates.logo_url = publicUrl;
    }
    if (incoming_cover_url && /^https?:\/\//i.test(incoming_cover_url)) {
      const publicUrl = await mirrorRemoteImageToStorage(incoming_cover_url, `groups/${group_id}/cover`);
      if (publicUrl) updates.cover_photo_url = publicUrl;
    }
    if (Object.keys(updates).length) {
      await supabase.from('groups').update(updates).eq('id', group_id);
    }

    // Handle many-to-many selections
    const gt_ids = form.getAll('group_type_ids').map((v) => Number(v)).filter(Boolean);
    const af_ids = form.getAll('audience_focus_ids').map((v) => Number(v)).filter(Boolean);
    const rd_ids = form.getAll('riding_discipline_ids').map((v) => Number(v)).filter(Boolean);
    const sl_ids = form.getAll('skill_level_ids').map((v) => Number(v)).filter(Boolean);

    const inserts = [];
    if (gt_ids.length) {
      inserts.push(
        supabase
          .from('group_x_group_types')
          .insert(gt_ids.map((group_type_id) => ({ group_id, group_type_id })))
      );
    }
    if (af_ids.length) {
      inserts.push(
        supabase
          .from('group_x_audience_focuses')
          .insert(af_ids.map((audience_focus_id) => ({ group_id, audience_focus_id })))
      );
    }
    if (rd_ids.length) {
      inserts.push(
        supabase
          .from('group_x_riding_disciplines')
          .insert(rd_ids.map((riding_discipline_id) => ({ group_id, riding_discipline_id })))
      );
    }
    if (sl_ids.length) {
      inserts.push(
        supabase
          .from('group_x_skill_levels')
          .insert(sl_ids.map((skill_level_id) => ({ group_id, skill_level_id })))
      );
    }

    if (inserts.length) {
      const results = await Promise.all(inserts);
      const joinError = results.find((r) => r.error)?.error;
      if (joinError) {
        // Not fatal to group creation; report but continue
        return {
          success: true,
          slug: groupRes.slug,
          warning: `Group created, but linking failed: ${joinError.message}`
        };
      }
    }

    // Redirect to the edit page to complete optional details
    throw redirect(303, `/groups/${groupRes.slug}/edit`);
  }
};
