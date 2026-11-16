import { json } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/admin';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';
import { calculateGroupCompleteness } from '#lib/server/groupCompleteness';

export async function GET({ cookies, url }) {
	await requireAdmin(cookies);

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Service role key missing' }, { status: 500 });
	}

	const status = url.searchParams.get('status') || 'all';
	const rawLimit = Number.parseInt(url.searchParams.get('limit') || '0', 10);
	const limit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(rawLimit, 200)) : 0;
	const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);

	// Use a more robust way to find unclaimed groups.
	// We'll fetch all groups and then filter based on whether they have an owner.

	// Fetch groups (increased limit to handle large databases)
	const { data: groups, error: groupsError } = await supabase
		.from('groups')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(5000);

	if (groupsError) {
		console.error('Groups Fetch Error:', groupsError);
		return json({ error: groupsError.message }, { status: 500 });
	}

	// Fetch owners to filter (increased limit)
	const { data: owners, error: ownersError } = await supabase
		.from('group_members')
		.select('group_id')
		.eq('role', 'owner')
		.limit(5000);

	if (ownersError) {
		console.error('Owners Fetch Error:', ownersError);
		return json({ error: ownersError.message }, { status: 500 });
	}

	const claimedSet = new Set(owners.map((o) => o.group_id).filter(Boolean));

	// Optional: Fetch enrichment and outreach separately
	const { data: enrichments } = await supabase
		.from('group_enrichment')
		.select('*')
		.limit(5000)
		.catch(() => ({ data: [] }));
	const { data: outreachHistory } = await supabase
		.from('group_outreach')
		.select('group_id, contacted_at, contact_method')
		.limit(5000)
		.catch(() => ({ data: [] }));

	const enrichmentMap = new Map((enrichments || []).map((e) => [e.group_id, e]));
	const outreachMap = new Map();
	(outreachHistory || []).forEach((o) => {
		if (!outreachMap.has(o.group_id)) outreachMap.set(o.group_id, []);
		outreachMap.get(o.group_id).push(o);
	});

	// Process and filter
	const processedGroups = groups
		.filter((g) => !claimedSet.has(g.id))
		.map((g) => {
			const completeness = calculateGroupCompleteness(g);
			const enrichment = enrichmentMap.get(g.id) || null;
			const history = outreachMap.get(g.id) || [];
			const lastContact = history.length
				? [...history].sort((a, b) => new Date(b.contacted_at) - new Date(a.contacted_at))[0]
				: null;

			return {
				id: g.id,
				name: g.name,
				slug: g.slug,
				city: g.city,
				state_region: g.state_region,
				website_url: g.website_url,
				public_contact_email: g.public_contact_email,
				social_links: g.social_links,
				completeness,
				enrichment,
				last_contact: lastContact,
				outreach_status: enrichment?.outreach_status || 'pending'
			};
		});

	// Apply filtering in JS
	let filtered = processedGroups;
	if (status !== 'all') {
		filtered = filtered.filter((g) => g.outreach_status === status);
	}

	// Sorting
	const sort = url.searchParams.get('sort') || 'completeness';
	if (sort === 'completeness') {
		filtered.sort((a, b) => b.completeness - a.completeness);
	} else if (sort === 'newest') {
		filtered.sort(
			(a, b) =>
				new Date(b.enrichment?.created_at || b.last_contact?.contacted_at || 0) -
				new Date(a.enrichment?.created_at || a.last_contact?.contacted_at || 0)
		);
	}

	const total = filtered.length;
	const paginated = limit > 0 ? filtered.slice(offset, offset + limit) : filtered;

	return json({
		groups: paginated,
		total,
		limit,
		offset
	});
}
