import assert from 'node:assert/strict';
import test from 'node:test';
import {
	PUBLIC_GROUP_NEWS_GROUP_COLUMNS,
	PUBLIC_GROUP_NEWS_POST_COLUMNS,
	PUBLIC_GROUP_NEWS_PROFILE_COLUMNS,
	getGroupNewsProfilesMap,
	getPublicGroupBySlug,
	listPublicGroupNewsPosts
} from './groupNewsPublic.js';

function createSupabaseStub(handlers = {}) {
	const queries = [];

	function createBuilder(table) {
		const record = { table, operations: [] };
		queries.push(record);
		const handler = handlers[table] ?? (() => ({ data: null, error: null }));

		const builder = {
			select(columns, options) {
				record.operations.push({ method: 'select', columns, ...(options ? { options } : {}) });
				return this;
			},
			eq(column, value) {
				record.operations.push({ method: 'eq', column, value });
				return this;
			},
			not(column, operator, value) {
				record.operations.push({ method: 'not', column, operator, value });
				return this;
			},
			in(column, values) {
				record.operations.push({ method: 'in', column, values });
				return this;
			},
			order(column, options) {
				record.operations.push({ method: 'order', column, options });
				return this;
			},
			limit(value) {
				record.operations.push({ method: 'limit', value });
				return this;
			},
			maybeSingle() {
				record.operations.push({ method: 'maybeSingle' });
				return Promise.resolve(handler(record));
			},
			then(resolve, reject) {
				return Promise.resolve(handler(record)).then(resolve, reject);
			}
		};

		return builder;
	}

	return {
		queries,
		from(table) {
			return createBuilder(table);
		}
	};
}

test('getPublicGroupBySlug enforces published predicate and public group column projection', async () => {
	const supabase = createSupabaseStub({
		groups: () => ({
			data: {
				id: 'group_tbag',
				slug: 'tempe-bicycle-action-group',
				name: 'Tempe Bicycle Action Group',
				tagline: 'Better biking in Tempe',
				description: 'Advocacy group',
				logo_url: 'https://example.org/logo.png',
				cover_photo_url: 'https://example.org/cover.png',
				is_published: true,
				internal_notes: 'should-not-leak'
			},
			error: null
		})
	});

	const group = await getPublicGroupBySlug(supabase, ' tempe-bicycle-action-group ');

	assert.equal(supabase.queries.length, 1);
	assert.equal(supabase.queries[0].table, 'groups');
	assert.deepEqual(supabase.queries[0].operations, [
		{ method: 'select', columns: PUBLIC_GROUP_NEWS_GROUP_COLUMNS },
		{ method: 'eq', column: 'slug', value: 'tempe-bicycle-action-group' },
		{ method: 'eq', column: 'is_published', value: true },
		{ method: 'maybeSingle' }
	]);
	assert.equal(PUBLIC_GROUP_NEWS_GROUP_COLUMNS.includes('*'), false);
	assert.equal('internal_notes' in group, false);
	assert.equal(group.slug, 'tempe-bicycle-action-group');
});

test('getPublicGroupBySlug returns null when group is unpublished', async () => {
	const supabase = createSupabaseStub({
		groups: () => ({
			data: {
				id: 'group_draft',
				slug: 'draft-group',
				name: 'Draft Group',
				is_published: false
			},
			error: null
		})
	});

	assert.equal(await getPublicGroupBySlug(supabase, 'draft-group'), null);
});

test('listPublicGroupNewsPosts excludes unpublished groups without querying news posts', async () => {
	const supabase = createSupabaseStub({
		groups: () => ({
			data: null,
			error: null
		}),
		group_news_posts: () => {
			assert.fail('group_news_posts should not be queried for unpublished groups');
		}
	});

	const posts = await listPublicGroupNewsPosts(supabase, 'group_unpublished', { limit: 3 });
	assert.deepEqual(posts, []);
	assert.equal(supabase.queries.length, 1);
	assert.deepEqual(supabase.queries[0].operations, [
		{ method: 'select', columns: 'id,is_published' },
		{ method: 'eq', column: 'id', value: 'group_unpublished' },
		{ method: 'eq', column: 'is_published', value: true },
		{ method: 'maybeSingle' }
	]);
});

test('listPublicGroupNewsPosts filters out drafts and private posts and projects public columns', async () => {
	const supabase = createSupabaseStub({
		groups: () => ({
			data: { id: 'group_tbag', is_published: true },
			error: null
		}),
		group_news_posts: () => ({
			data: [
				{
					id: 'post_public',
					group_id: 'group_tbag',
					created_by_user_id: 'user_1',
					updated_by_user_id: 'user_1',
					title: 'Bike Count Results',
					slug: 'bike-count-results',
					summary: null,
					body_markdown: '## Volunteers counted **412 riders** across Tempe.',
					published_at: '2026-09-10T18:00:00Z',
					created_at: '2026-09-10T17:00:00Z',
					updated_at: '2026-09-10T18:00:00Z',
					source_url: null,
					source_name: null,
					source_published_at: null,
					cover_image_url: null,
					is_private: false,
					secret_column: 'hidden'
				},
				{
					id: 'post_private',
					group_id: 'group_tbag',
					title: 'Members Only',
					slug: 'members-only',
					body_markdown: 'Private details',
					published_at: '2026-09-11T18:00:00Z',
					is_private: true
				},
				{
					id: 'post_draft',
					group_id: 'group_tbag',
					title: 'Unpublished Draft',
					slug: 'unpublished-draft',
					body_markdown: 'Draft body',
					published_at: null,
					is_private: false
				}
			],
			error: null
		})
	});

	const posts = await listPublicGroupNewsPosts(supabase, 'group_tbag', { limit: 3 });

	assert.equal(supabase.queries.length, 2);
	assert.equal(supabase.queries[1].table, 'group_news_posts');
	assert.deepEqual(supabase.queries[1].operations, [
		{ method: 'select', columns: PUBLIC_GROUP_NEWS_POST_COLUMNS },
		{ method: 'eq', column: 'group_id', value: 'group_tbag' },
		{ method: 'not', column: 'published_at', operator: 'is', value: null },
		{ method: 'eq', column: 'is_private', value: false },
		{
			method: 'order',
			column: 'published_at',
			options: { ascending: false, nullsFirst: false }
		},
		{
			method: 'order',
			column: 'created_at',
			options: { ascending: false }
		},
		{ method: 'limit', value: 3 }
	]);

	assert.equal(PUBLIC_GROUP_NEWS_POST_COLUMNS.includes('*'), false);
	assert.equal(PUBLIC_GROUP_NEWS_POST_COLUMNS.includes('is_private'), false);
	assert.equal(posts.length, 1);
	assert.equal(posts[0].id, 'post_public');
	assert.equal(posts[0].preview_text, 'Volunteers counted 412 riders across Tempe.');
	assert.equal('is_private' in posts[0], false);
	assert.equal('secret_column' in posts[0], false);
});

test('getGroupNewsProfilesMap projects only public profile display columns', async () => {
	const supabase = createSupabaseStub({
		public_profiles: () => ({
			data: [
				{
					user_id: 'user_1',
					full_name: 'Alex Rider',
					avatar_url: 'https://example.org/avatar.jpg',
					email: 'should-not-expose@example.org'
				}
			],
			error: null
		})
	});

	const map = await getGroupNewsProfilesMap(supabase, ['user_1', 'user_1', '']);
	assert.equal(supabase.queries.length, 1);
	assert.deepEqual(supabase.queries[0].operations, [
		{ method: 'select', columns: PUBLIC_GROUP_NEWS_PROFILE_COLUMNS },
		{ method: 'in', column: 'user_id', values: ['user_1'] }
	]);
	assert.deepEqual(map.get('user_1'), {
		user_id: 'user_1',
		full_name: 'Alex Rider',
		avatar_url: 'https://example.org/avatar.jpg'
	});
});
