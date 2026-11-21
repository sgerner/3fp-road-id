import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGroupSocialLinkInputs } from '#lib/groups/socialLinks.js';

test('group form submissions preserve Mastodon and Discord and normalize Instagram posts', () => {
	const form = new FormData();
	form.set('social_mastodon', '@club@cycling.example');
	form.set('social_discord', 'community');
	form.set(
		'social_instagram_posts',
		[
			'https://instagram.com/p/one/?ref=abc',
			'https://www.instagram.com/p/one/',
			'https://unrelated.example/p/nope/',
			'https://www.instagram.com/reel/two',
			'https://www.instagram.com/tv/three',
			'https://www.instagram.com/p/four'
		].join('\n')
	);

	assert.deepEqual(
		collectGroupSocialLinkInputs((field) => form.get(`social_${field}`)),
		{
			mastodon: 'https://cycling.example/@club',
			discord: 'https://discord.gg/community',
			instagram_posts: [
				'https://www.instagram.com/p/one/',
				'https://www.instagram.com/reel/two/',
				'https://www.instagram.com/tv/three/'
			]
		}
	);
});
