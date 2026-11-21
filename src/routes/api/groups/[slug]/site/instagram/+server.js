import { json } from '@sveltejs/kit';
import { loadGroupInstagram } from '#lib/server/groupSites';

export async function GET({ params, setHeaders }) {
	const feed = await loadGroupInstagram(params.slug).catch(() => null);
	if (!feed) return json({ error: 'Group not found.' }, { status: 404 });

	setHeaders({
		'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
	});

	return json({
		data: {
			connectedInstagram: feed.connectedInstagram || null,
			instagramPosts: Array.isArray(feed.instagramPosts) ? feed.instagramPosts.slice(0, 3) : [],
			instagramPostsSource: feed.instagramPostsSource || 'none'
		}
	});
}
