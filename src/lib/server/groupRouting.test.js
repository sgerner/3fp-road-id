import assert from 'node:assert/strict';
import test from 'node:test';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
	DEFAULT_GROUP_DISPLAY_NAME,
	buildGroupNewsPath,
	buildGroupPath,
	buildGroupRedirectLocation,
	buildGroupSitemapPaths,
	buildMicrositeRootPath,
	buildVolunteerGroupPath,
	lookupGroupBySlugOrMicrositeSlug,
	resolveGroupDisplayName,
	resolveGroupRoute
} from './groupRouting.js';

function createFetchStub(handler) {
	const calls = [];
	const fetchImpl = async (input) => {
		const url = String(input);
		calls.push(url);
		const result = await handler(url);
		const status = result?.status ?? 200;
		const body =
			result?.body === undefined
				? ''
				: typeof result.body === 'string'
					? result.body
					: JSON.stringify(result.body);
		return new Response(body, {
			status,
			headers: { 'content-type': 'application/json' }
		});
	};
	fetchImpl.calls = calls;
	return fetchImpl;
}

test('sitemap path helpers preserve hyphenated group slugs and keep normalized microsite slugs for root paths', () => {
	const group = {
		slug: 'reston-bike-club-reston-va',
		microsite_slug: 'restonbikeclubrestonva'
	};

	assert.equal(buildGroupPath(group.slug), '/groups/reston-bike-club-reston-va');
	assert.equal(buildGroupNewsPath(group.slug), '/groups/reston-bike-club-reston-va/news');
	assert.equal(buildVolunteerGroupPath(group.slug), '/volunteer/groups/reston-bike-club-reston-va');
	assert.equal(buildMicrositeRootPath(group), '/restonbikeclubrestonva');
	assert.deepEqual(buildGroupSitemapPaths(group), {
		groupPath: '/groups/reston-bike-club-reston-va',
		groupNewsPath: '/groups/reston-bike-club-reston-va/news',
		volunteerGroupPath: '/volunteer/groups/reston-bike-club-reston-va',
		micrositePath: '/restonbikeclubrestonva'
	});
});

test('group path helpers URL-encode reserved characters and return empty strings for blank slugs', () => {
	assert.equal(buildGroupPath('velo club/east'), '/groups/velo%20club%2Feast');
	assert.equal(buildGroupNewsPath('velo club/east'), '/groups/velo%20club%2Feast/news');
	assert.equal(buildVolunteerGroupPath('velo club/east'), '/volunteer/groups/velo%20club%2Feast');
	assert.equal(buildGroupPath(''), '');
	assert.equal(buildGroupPath('   '), '');
	assert.equal(buildGroupNewsPath(null), '');
	assert.equal(buildVolunteerGroupPath(undefined), '');
	assert.equal(buildMicrositeRootPath({ slug: '---' }), '');
});

test('resolveGroupRoute returns canonical hyphenated group without redirecting or querying microsite_slug', async () => {
	const canonicalGroup = {
		id: 'group_1',
		slug: 'reston-bike-club-reston-va',
		microsite_slug: 'restonbikeclubrestonva',
		name: 'Reston Bike Club'
	};
	const fetchStub = createFetchStub((url) => {
		if (url === '/api/v1/groups?slug=eq.reston-bike-club-reston-va&single=true') {
			return { status: 200, body: { data: canonicalGroup } };
		}
		return { status: 404, body: { error: 'Not found' } };
	});

	const resolved = await resolveGroupRoute({
		fetch: fetchStub,
		slug: 'reston-bike-club-reston-va',
		search: '?auto_follow=1'
	});

	assert.deepEqual(resolved, canonicalGroup);
	assert.deepEqual(fetchStub.calls, [
		'/api/v1/groups?slug=eq.reston-bike-club-reston-va&single=true'
	]);
});

test('resolveGroupRoute redirects stripped microsite_slug requests via 308 while preserving query parameters', async () => {
	const canonicalGroup = {
		id: 'group_1',
		slug: 'reston-bike-club-reston-va',
		microsite_slug: 'restonbikeclubrestonva',
		name: 'Reston Bike Club'
	};
	const fetchStub = createFetchStub((url) => {
		if (url === '/api/v1/groups?slug=eq.restonbikeclubrestonva&single=true') {
			return { status: 404, body: { error: 'Unable to complete request.' } };
		}
		if (url === '/api/v1/groups?microsite_slug=eq.restonbikeclubrestonva&single=true') {
			return { status: 200, body: { data: canonicalGroup } };
		}
		return { status: 404, body: { error: 'Not found' } };
	});

	let thrown = null;
	try {
		await resolveGroupRoute({
			fetch: fetchStub,
			slug: 'restonbikeclubrestonva',
			search: '?auto_follow=1&auto_follow_tier=tier_free'
		});
	} catch (err) {
		thrown = err;
	}

	assert.equal(isRedirect(thrown), true);
	assert.equal(thrown.status, 308);
	assert.equal(
		thrown.location,
		'/groups/reston-bike-club-reston-va?auto_follow=1&auto_follow_tier=tier_free'
	);
	assert.deepEqual(fetchStub.calls, [
		'/api/v1/groups?slug=eq.restonbikeclubrestonva&single=true',
		'/api/v1/groups?microsite_slug=eq.restonbikeclubrestonva&single=true'
	]);
});

test('resolveGroupRoute does not self-redirect when canonical slug already matches microsite_slug', async () => {
	const group = {
		id: 'group_tbag',
		slug: 'tbag',
		microsite_slug: 'tbag',
		name: 'Tempe Bicycle Action Group'
	};
	const fetchStub = createFetchStub((url) => {
		if (url === '/api/v1/groups?slug=eq.tbag&single=true') {
			return { status: 200, body: { data: group } };
		}
		return { status: 404, body: { error: 'Not found' } };
	});

	const resolved = await resolveGroupRoute({
		fetch: fetchStub,
		slug: 'tbag'
	});

	assert.deepEqual(resolved, group);
	assert.equal(fetchStub.calls.length, 1);
});

test('resolveGroupRoute throws 404 when neither slug nor microsite_slug matches', async () => {
	const fetchStub = createFetchStub(() => ({
		status: 404,
		body: { error: 'Unable to complete request.' }
	}));

	let thrown = null;
	try {
		await resolveGroupRoute({
			fetch: fetchStub,
			slug: '3-feet-please'
		});
	} catch (err) {
		thrown = err;
	}

	assert.equal(isHttpError(thrown), true);
	assert.equal(thrown.status, 404);
	assert.equal(thrown.body?.message, 'Group not found');
	assert.deepEqual(fetchStub.calls, [
		'/api/v1/groups?slug=eq.3-feet-please&single=true',
		'/api/v1/groups?microsite_slug=eq.3feetplease&single=true'
	]);
});

test('lookupGroupBySlugOrMicrositeSlug skips microsite_slug query when normalized slug is empty', async () => {
	const fetchStub = createFetchStub(() => ({
		status: 404,
		body: { error: 'Not found' }
	}));

	const result = await lookupGroupBySlugOrMicrositeSlug(fetchStub, '---');
	assert.deepEqual(result, { group: null, matchedBy: null });
	assert.deepEqual(fetchStub.calls, ['/api/v1/groups?slug=eq.---&single=true']);
});

test('resolveGroupRoute throws 500 when group lookup fails with upstream error', async () => {
	const fetchStub = createFetchStub(() => ({
		status: 500,
		body: { error: 'Supabase client not available' }
	}));

	const originalWarn = console.warn;
	console.warn = () => {};
	let thrown = null;
	try {
		await resolveGroupRoute({
			fetch: fetchStub,
			slug: 'reston-bike-club-reston-va'
		});
	} catch (err) {
		thrown = err;
	} finally {
		console.warn = originalWarn;
	}

	assert.equal(isHttpError(thrown), true);
	assert.equal(thrown.status, 500);
	assert.equal(thrown.body?.message, 'Failed to load group');
});

test('buildGroupRedirectLocation and resolveGroupDisplayName handle query strings and blank names cleanly', () => {
	assert.equal(
		buildGroupRedirectLocation('reston-bike-club-reston-va', ''),
		'/groups/reston-bike-club-reston-va'
	);
	assert.equal(
		buildGroupRedirectLocation('reston-bike-club-reston-va', 'auto_follow=1'),
		'/groups/reston-bike-club-reston-va?auto_follow=1'
	);
	assert.equal(resolveGroupDisplayName({ name: 'Reston Bike Club' }), 'Reston Bike Club');
	assert.equal(resolveGroupDisplayName({ name: '   ' }), DEFAULT_GROUP_DISPLAY_NAME);
	assert.equal(resolveGroupDisplayName({ name: '' }), DEFAULT_GROUP_DISPLAY_NAME);
	assert.equal(resolveGroupDisplayName(null), DEFAULT_GROUP_DISPLAY_NAME);
});
