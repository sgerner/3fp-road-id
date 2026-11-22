import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import {
	applyGroupSearchFilter,
	buildCoordinateBounds,
	buildSearchQueryText,
	expandStateCandidates,
	isPostalCodeQuery,
	resolvePostalGeocodeBounds,
	resolveStandaloneStateCandidates,
	tokenizeSearch
} from './groupSearch.js';

function createMockQueryBuilder() {
	const calls = [];
	const builder = {
		calls,
		textSearch(column, query, options) {
			calls.push({ op: 'textSearch', column, query, options });
			return builder;
		},
		or(filters) {
			calls.push({ op: 'or', filters });
			return builder;
		},
		not(column, operator, value) {
			calls.push({ op: 'not', column, operator, value });
			return builder;
		},
		gte(column, value) {
			calls.push({ op: 'gte', column, value });
			return builder;
		},
		lte(column, value) {
			calls.push({ op: 'lte', column, value });
			return builder;
		}
	};
	return builder;
}

test('preserves unstemmed city queries and applies simple websearch configuration', () => {
	assert.equal(buildSearchQueryText('Los Angeles'), 'los angeles');
	assert.equal(buildSearchQueryText('Montréal'), 'montreal');
	assert.equal(buildSearchQueryText('St. Louis'), '(st OR saint) louis');

	const query = createMockQueryBuilder();
	applyGroupSearchFilter(query, { q: 'Los Angeles' });
	assert.deepEqual(query.calls, [
		{
			op: 'textSearch',
			column: 'search_document',
			query: 'los angeles',
			options: { type: 'websearch', config: 'simple' }
		}
	]);
});

test('expands unstemmed category and discipline synonyms', () => {
	const advocacyQuery = buildSearchQueryText('advocacy');
	assert.match(advocacyQuery, /^\(advocacy OR /);
	assert.match(advocacyQuery, /\badvocate\b/);
	assert.match(advocacyQuery, /\badvocates\b/);
	assert.match(advocacyQuery, /\bactivism\b/);
	assert.match(advocacyQuery, /\bcampaign\b/);
	assert.match(advocacyQuery, /\bnonprofit\b/);

	const commuterQuery = buildSearchQueryText('commuter');
	assert.match(commuterQuery, /\bcommute\b/);
	assert.match(commuterQuery, /\bcommuter\b/);
	assert.match(commuterQuery, /\bcommuters\b/);
	assert.match(commuterQuery, /\bcommuting\b/);

	const mtbQuery = buildSearchQueryText('mtb');
	assert.match(mtbQuery, /\bmountain\b/);
	assert.match(mtbQuery, /\btrail\b/);
	assert.match(mtbQuery, /\btrails\b/);

	const query = createMockQueryBuilder();
	applyGroupSearchFilter(query, { q: 'advocacy' });
	assert.equal(query.calls.length, 1);
	assert.equal(query.calls[0].op, 'textSearch');
	assert.deepEqual(query.calls[0].options, { type: 'websearch', config: 'simple' });
});

test('expands Delaware, DE, and multi-word state names while matching standalone codes against state_region', () => {
	assert.equal(buildSearchQueryText('Delaware'), '(delaware OR de)');
	assert.equal(buildSearchQueryText('DE'), '(de OR delaware)');
	assert.equal(buildSearchQueryText('New York'), '("new york" OR ny)');
	assert.equal(
		buildSearchQueryText('clubs in North Carolina'),
		'(clubs OR club OR group OR groups OR community OR communities OR team OR teams OR coalition OR alliance) ("north carolina" OR nc)'
	);

	assert.deepEqual(resolveStandaloneStateCandidates('', 'DE'), ['DE', 'Delaware']);
	assert.deepEqual(expandStateCandidates('US', 'Delaware'), ['Delaware', 'DELAWARE', 'DE']);
	assert.deepEqual(resolveStandaloneStateCandidates('AU', 'WA'), ['WA', 'Western Australia']);
	assert.deepEqual(resolveStandaloneStateCandidates('US', 'WA'), ['WA', 'Washington']);

	const stateNameQuery = createMockQueryBuilder();
	applyGroupSearchFilter(stateNameQuery, { q: 'Delaware' });
	assert.deepEqual(stateNameQuery.calls, [
		{
			op: 'textSearch',
			column: 'search_document',
			query: '(delaware OR de)',
			options: { type: 'websearch', config: 'simple' }
		}
	]);

	const stateCodeQuery = createMockQueryBuilder();
	applyGroupSearchFilter(stateCodeQuery, { q: 'DE' });
	assert.deepEqual(stateCodeQuery.calls, [
		{
			op: 'or',
			filters: 'state_region.ilike.DE,state_region.ilike.Delaware'
		}
	]);
});

test('preserves standalone and uppercase IN, OR, and ON and quotes literal "or"', () => {
	assert.deepEqual(tokenizeSearch('IN'), ['in']);
	assert.deepEqual(tokenizeSearch('in'), ['in']);
	assert.deepEqual(tokenizeSearch('OR'), ['or']);
	assert.deepEqual(tokenizeSearch('ON'), ['on']);
	assert.deepEqual(tokenizeSearch('Portland, OR'), ['portland', 'or']);
	assert.deepEqual(tokenizeSearch('Indianapolis, IN'), ['indianapolis', 'in']);
	assert.deepEqual(tokenizeSearch('Toronto, ON'), ['toronto', 'on']);

	assert.equal(buildSearchQueryText('IN'), '(in OR indiana)');
	assert.equal(buildSearchQueryText('OR'), '("or" OR oregon)');
	assert.equal(buildSearchQueryText('ON'), '(on OR ontario)');
	assert.equal(buildSearchQueryText('Portland, OR'), 'portland ("or" OR oregon)');
	assert.equal(buildSearchQueryText('Indianapolis, IN'), 'indianapolis (in OR indiana)');
	assert.equal(buildSearchQueryText('Toronto, ON'), 'toronto (on OR ontario)');

	const indianaQuery = createMockQueryBuilder();
	applyGroupSearchFilter(indianaQuery, { q: 'IN' });
	assert.deepEqual(indianaQuery.calls, [
		{
			op: 'or',
			filters: 'state_region.ilike.IN,state_region.ilike.Indiana'
		}
	]);

	const oregonQuery = createMockQueryBuilder();
	applyGroupSearchFilter(oregonQuery, { q: 'OR' });
	assert.deepEqual(oregonQuery.calls, [
		{
			op: 'or',
			filters: 'state_region.ilike.OR,state_region.ilike.Oregon'
		}
	]);
});

test('strips lowercase stop words including in, or, and on inside multi-word phrases', () => {
	assert.deepEqual(tokenizeSearch('clubs in seattle'), ['clubs', 'seattle']);
	assert.deepEqual(tokenizeSearch('In Seattle'), ['seattle']);
	assert.deepEqual(tokenizeSearch('road or gravel'), ['road', 'gravel']);
	assert.deepEqual(tokenizeSearch('rides on sunday with the team'), ['rides', 'sunday', 'team']);

	const seattleClubs = buildSearchQueryText('clubs in seattle');
	assert.ok(!/\bindiana\b/.test(seattleClubs));
	assert.ok(!/\bin\b/.test(seattleClubs));
	assert.match(seattleClubs, /\bseattle$/);

	const roadOrGravel = buildSearchQueryText('road or gravel');
	assert.ok(!/\boregon\b/.test(roadOrGravel));
	assert.ok(!roadOrGravel.includes('"or"'));
});

test('handles postal queries, geocoding fallback bounds, USA retry, and short timeouts', async () => {
	assert.equal(isPostalCodeQuery('85281'), true);
	assert.equal(isPostalCodeQuery('85281-1234', 'US'), true);
	assert.equal(isPostalCodeQuery('M5V 3L9', 'CA'), true);
	assert.equal(isPostalCodeQuery('SW1A 1AA', 'GB'), true);
	assert.equal(isPostalCodeQuery('Los Angeles'), false);

	assert.equal(buildSearchQueryText('85281'), '85281');
	assert.equal(buildSearchQueryText('85281-1234'), '("85281-1234" OR 85281)');
	assert.equal(buildSearchQueryText('M5V 3L9'), '("m5v 3l9" OR m5v3l9)');

	const seenQueries = [];
	const bounds = await resolvePostalGeocodeBounds('85281-1234', {
		country: 'US',
		radiusMiles: 25,
		geocode: async (q, opts) => {
			seenQueries.push({ q, countryCodes: opts.countryCodes });
			if (q === '85281-1234') return [];
			return [{ label: 'Tempe, AZ 85281, USA', latitude: 33.4255, longitude: -111.94 }];
		}
	});
	assert.deepEqual(seenQueries, [
		{ q: '85281-1234', countryCodes: 'us' },
		{ q: '85281, USA', countryCodes: 'us' }
	]);
	assert.ok(bounds);
	assert.equal(bounds.latitude, 33.4255);
	assert.equal(bounds.longitude, -111.94);
	assert.ok(bounds.minLat < 33.4255 && bounds.maxLat > 33.4255);
	assert.ok(bounds.minLng < -111.94 && bounds.maxLng > -111.94);

	const fallbackQuery = createMockQueryBuilder();
	applyGroupSearchFilter(fallbackQuery, {
		q: '85281',
		postalBounds: buildCoordinateBounds(33.4255, -111.94, 25)
	});
	assert.deepEqual(
		fallbackQuery.calls.map((entry) => entry.op),
		['not', 'not', 'gte', 'lte', 'gte', 'lte']
	);

	let signalAborted = false;
	const start = Date.now();
	const timedOut = await resolvePostalGeocodeBounds('85281', {
		timeoutMs: 40,
		fetchImpl: (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					signalAborted = true;
					reject(new Error('Aborted'));
				});
			}),
		geocode: (_q, { fetchImpl }) => fetchImpl('https://nominatim.openstreetmap.org/search')
	});
	const elapsed = Date.now() - start;
	assert.equal(timedOut, null);
	assert.equal(signalAborted, true);
	assert.ok(elapsed < 500, `Expected fast timeout, took ${elapsed}ms`);
});

const databaseUrl = process.env.ACCOUNTING_TEST_DATABASE_URL;
test(
	'search_document migration indexes zip_code and specific_meeting_point_address with simple config',
	{ skip: !databaseUrl },
	() => {
		if (!databaseUrl) return;
		const url = new URL(databaseUrl);
		assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
		const dbName = `group_search_test_${process.pid}`;
		const run = (connection, sql) =>
			execFileSync('psql', [connection, '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
				input: sql,
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe']
			});
		run(databaseUrl, fs.readFileSync('supabase/tests/bootstrap_roles.sql', 'utf8'));
		run(databaseUrl, `create database ${dbName}`);
		url.pathname = `/${dbName}`;
		try {
			run(
				url.toString(),
				`
				create table public.groups (
					id uuid primary key,
					slug text unique not null,
					name text not null,
					tagline text,
					description text,
					membership_info text,
					service_area_description text,
					city text,
					state_region text not null,
					country text not null,
					zip_code text,
					specific_meeting_point_address text,
					is_published boolean not null default true,
					search_document tsvector
				);

				create or replace function public.groups_build_search_document(
					group_name text,
					group_tagline text,
					group_description text,
					group_membership_info text,
					group_service_area_description text,
					group_city text,
					group_state_region text,
					group_country text
				)
				returns tsvector
				language sql
				stable
				set search_path to 'public'
				as $function$
					select
						setweight(to_tsvector('simple', coalesce(group_name, '')), 'A') ||
						setweight(to_tsvector('simple', coalesce(group_tagline, '')), 'A') ||
						setweight(to_tsvector('simple', coalesce(group_description, '')), 'B') ||
						setweight(to_tsvector('simple', coalesce(group_membership_info, '')), 'B') ||
						setweight(to_tsvector('simple', coalesce(group_service_area_description, '')), 'B') ||
						setweight(to_tsvector('simple', coalesce(group_city, '')), 'C') ||
						setweight(to_tsvector('simple', coalesce(group_state_region, '')), 'C') ||
						setweight(to_tsvector('simple', coalesce(group_country, '')), 'C');
				$function$;

				insert into public.groups (
					id, slug, name, description, city, state_region, country, zip_code, specific_meeting_point_address
				) values
					('00000000-0000-0000-0000-000000000001', 'la-wheelmen', 'LA Wheelmen', 'Weekly rides across Southern California.', 'Los Angeles', 'CA', 'US', '90012', '200 N Spring St'),
					('00000000-0000-0000-0000-000000000002', 'tbag', 'Tempe Bicycle Action Group', 'Local bicycle advocacy and safer streets.', 'Tempe', 'AZ', 'US', '85281', '425 S Mill Ave'),
					('00000000-0000-0000-0000-000000000003', 'first-state-velo', 'First State Velo', 'Group rides on quiet roads.', 'Wilmington', 'DE', 'US', '19801', null),
					('00000000-0000-0000-0000-000000000004', 'rose-city-riders', 'Rose City Riders', 'Casual rides in the Pacific Northwest.', 'Portland', 'OR', 'US', '97204', null);

				${fs.readFileSync('supabase/migrations/20261121193000_index_group_postal_and_meeting_address.sql', 'utf8')}
				`
			);

			const overloads = run(
				url.toString(),
				`select pronargs || ':' || coalesce(array_to_string(proconfig, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'groups_build_search_document';`
			).trim();
			assert.equal(overloads, '10:search_path=public');

			const matchSlugs = (queryText) =>
				run(
					url.toString(),
					`select coalesce(string_agg(slug, ',' order by slug), '') from public.groups where search_document @@ websearch_to_tsquery('simple', '${queryText.replace(/'/g, "''")}');`
				).trim();

			assert.equal(matchSlugs(buildSearchQueryText('Los Angeles')), 'la-wheelmen');
			assert.equal(matchSlugs(buildSearchQueryText('advocacy')), 'tbag');
			assert.equal(matchSlugs(buildSearchQueryText('Delaware')), 'first-state-velo');
			assert.equal(matchSlugs(buildSearchQueryText('Portland, OR')), 'rose-city-riders');
			assert.equal(matchSlugs(buildSearchQueryText('85281')), 'tbag');
			assert.equal(matchSlugs(buildSearchQueryText('Mill Ave')), 'tbag');
		} finally {
			run(databaseUrl, `drop database ${dbName} with (force)`);
		}
	}
);
