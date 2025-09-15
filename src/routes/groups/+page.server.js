import { supabase } from '$lib/supabaseClient';

export const load = async ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  const country = (url.searchParams.get('country') || '').trim().toUpperCase();
  const state_region = (url.searchParams.get('state_region') || '').trim();

  // Flexible state/region candidates (abbrev <-> full names)
  const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
  };
  const CA_PROVINCES = { AB:'Alberta', BC:'British Columbia', MB:'Manitoba', NB:'New Brunswick', NL:'Newfoundland and Labrador', NT:'Northwest Territories', NS:'Nova Scotia', NU:'Nunavut', ON:'Ontario', PE:'Prince Edward Island', QC:'Quebec', SK:'Saskatchewan', YT:'Yukon' };
  const AU_STATES = { ACT:'Australian Capital Territory', NSW:'New South Wales', NT:'Northern Territory', QLD:'Queensland', SA:'South Australia', TAS:'Tasmania', VIC:'Victoria', WA:'Western Australia' };

  function expandStateCandidates(cn, input) {
    const val = (input || '').trim();
    if (!val) return [];
    const up = val.toUpperCase();
    const list = [];
    function add(x) { if (x && !list.includes(x)) list.push(x); }
    add(val); // original
    add(up);
    // Title case helper
    const tcase = val.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    add(tcase);
    const maps = [];
    if (!cn || cn === 'US') maps.push(US_STATES);
    if (!cn || cn === 'CA') maps.push(CA_PROVINCES);
    if (!cn || cn === 'AU') maps.push(AU_STATES);
    for (const MAP of maps) {
      // code -> name
      if (MAP[up]) add(MAP[up]), add(MAP[up].toUpperCase());
      // name -> code
      for (const [code, name] of Object.entries(MAP)) {
        if (name.toLowerCase() === val.toLowerCase()) add(code), add(code.toUpperCase());
      }
    }
    return list;
  }
  const skill_level_ids = url.searchParams
    .getAll('skill_level_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  const audience_focus_ids = url.searchParams
    .getAll('audience_focus_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  const riding_discipline_ids = url.searchParams
    .getAll('riding_discipline_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  const group_type_ids = url.searchParams
    .getAll('group_type_ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  let query = supabase
    .from('groups')
    .select('id, slug, name, tagline, description, membership_info, service_area_description, city, state_region, country, logo_url, cover_photo_url, latitude, longitude')
    .order('name');

  if (q) {
    const like = `%${q}%`;
    // Broader initial scope to cut result size before fuzzy matching
    query = query.or(
      [
        `name.ilike.${like}`,
        `tagline.ilike.${like}`,
        `description.ilike.${like}`,
        `membership_info.ilike.${like}`,
        `service_area_description.ilike.${like}`,
        `city.ilike.${like}`,
        `state_region.ilike.${like}`,
        `country.ilike.${like}`
      ].join(',')
    );
  }
  if (country) query = query.eq('country', country);
  if (state_region) {
    const candidates = expandStateCandidates(country, state_region).map((t) => `%${t}%`);
    if (candidates.length) {
      const ors = candidates.map((c) => `state_region.ilike.${c}`).join(',');
      query = query.or(ors);
    }
  }

  if (skill_level_ids.length) {
    const { data: maps, error: mapErr } = await supabase
      .from('group_x_skill_levels')
      .select('group_id, skill_level_id')
      .in('skill_level_id', skill_level_ids);
    if (!mapErr) {
      const ids = Array.from(new Set((maps || []).map((m) => m.group_id)));
      if (ids.length === 0) {
        const [levels, types] = await Promise.all([
          supabase.from('skill_levels').select('id, name').order('name'),
          supabase.from('group_types').select('id, name').order('name')
        ]);
        return {
          groups: [],
          error: null,
          filters: { q, country, state_region, skill_level_ids, audience_focus_ids, riding_discipline_ids },
          skill_levels: levels.data || [],
          group_types: types.data || [],
          audience_focuses: (await supabase.from('audience_focuses').select('id, name').order('name')).data || [],
          riding_disciplines: (await supabase.from('riding_disciplines').select('id, name').order('name')).data || [],
          group_types_map: {}
        };
      }
      query = query.in('id', ids);
    }
  }

  if (group_type_ids.length) {
    const { data: maps, error: mapErr } = await supabase
      .from('group_x_group_types')
      .select('group_id, group_type_id')
      .in('group_type_id', group_type_ids);
    if (!mapErr) {
      const ids = Array.from(new Set((maps || []).map((m) => m.group_id)));
      if (ids.length === 0) {
        const [levels, types] = await Promise.all([
          supabase.from('skill_levels').select('id, name').order('name'),
          supabase.from('group_types').select('id, name').order('name')
        ]);
        return {
          groups: [],
          error: null,
          filters: { q, country, state_region, skill_level_ids, group_type_ids, audience_focus_ids, riding_discipline_ids },
          skill_levels: levels.data || [],
          group_types: types.data || [],
          audience_focuses: (await supabase.from('audience_focuses').select('id, name').order('name')).data || [],
          riding_disciplines: (await supabase.from('riding_disciplines').select('id, name').order('name')).data || [],
          group_types_map: {}
        };
      }
      query = query.in('id', ids);
    }
  }

  if (audience_focus_ids.length) {
    const { data: maps, error: mapErr } = await supabase
      .from('group_x_audience_focuses')
      .select('group_id, audience_focus_id')
      .in('audience_focus_id', audience_focus_ids);
    if (!mapErr) {
      const ids = Array.from(new Set((maps || []).map((m) => m.group_id)));
      if (ids.length === 0) {
        const [levels, types] = await Promise.all([
          supabase.from('skill_levels').select('id, name').order('name'),
          supabase.from('group_types').select('id, name').order('name')
        ]);
        return {
          groups: [],
          error: null,
          filters: { q, country, state_region, skill_level_ids, group_type_ids, audience_focus_ids, riding_discipline_ids },
          skill_levels: levels.data || [],
          group_types: types.data || [],
          audience_focuses: (await supabase.from('audience_focuses').select('id, name').order('name')).data || [],
          riding_disciplines: (await supabase.from('riding_disciplines').select('id, name').order('name')).data || [],
          group_types_map: {}
        };
      }
      query = query.in('id', ids);
    }
  }

  if (riding_discipline_ids.length) {
    const { data: maps, error: mapErr } = await supabase
      .from('group_x_riding_disciplines')
      .select('group_id, riding_discipline_id')
      .in('riding_discipline_id', riding_discipline_ids);
    if (!mapErr) {
      const ids = Array.from(new Set((maps || []).map((m) => m.group_id)));
      if (ids.length === 0) {
        const [levels, types] = await Promise.all([
          supabase.from('skill_levels').select('id, name').order('name'),
          supabase.from('group_types').select('id, name').order('name')
        ]);
        return {
          groups: [],
          error: null,
          filters: { q, country, state_region, skill_level_ids, group_type_ids, audience_focus_ids, riding_discipline_ids },
          skill_levels: levels.data || [],
          group_types: types.data || [],
          audience_focuses: (await supabase.from('audience_focuses').select('id, name').order('name')).data || [],
          riding_disciplines: (await supabase.from('riding_disciplines').select('id, name').order('name')).data || [],
          group_types_map: {}
        };
      }
      query = query.in('id', ids);
    }
  }

  const [groupsRes, levelsRes, typesAllRes, afRes, rdRes] = await Promise.all([
    query,
    supabase.from('skill_levels').select('id, name').order('name'),
    supabase.from('group_types').select('id, name').order('name'),
    supabase.from('audience_focuses').select('id, name').order('name'),
    supabase.from('riding_disciplines').select('id, name').order('name')
  ]);


  let groups = groupsRes.data || [];
  // Fetch group types for displayed groups to render chips on cards
  let group_types_map = {};
  if (groups.length) {
    const ids = groups.map((g) => g.id);
    const [gxRes] = await Promise.all([
      supabase.from('group_x_group_types').select('group_id, group_type_id').in('group_id', ids)
    ]);
    const typeNameById = Object.fromEntries((typesAllRes.data || []).map((t) => [t.id, t.name]));
    const map = {};
    for (const row of gxRes.data || []) {
      const arr = map[row.group_id] || (map[row.group_id] = []);
      const nm = typeNameById[row.group_type_id];
      if (nm) arr.push(nm);
    }
    group_types_map = map;
  }

  // Fuzzy filter and sort if q provided
  function norm(s = '') {
    return (s || '').toString().toLowerCase();
  }
  function levenshtein(a, b) {
    a = norm(a); b = norm(b);
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }
  // Always order alphabetically by name
  groups = (groups || []).slice().sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }));

  return {
    groups,
    error: groupsRes.error?.message || null,
    filters: { q, country, state_region, skill_level_ids, group_type_ids, audience_focus_ids, riding_discipline_ids },
    skill_levels: levelsRes.data || [],
    group_types_map,
    group_types: typesAllRes.data || [],
    audience_focuses: afRes.data || [],
    riding_disciplines: rdRes.data || []
  };
};
