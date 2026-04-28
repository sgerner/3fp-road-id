const PRIVATE_PATHS = [
	'/admin/',
	'/auth/',
	'/profile/',
	'/groups/new',
	'/groups/my',
	'/groups/*/manage/',
	'/ride/new',
	'/ride/*/manage/',
	'/volunteer/new',
	'/volunteer/*/manage/',
	'/merch/checkout',
	'/merch/manage',
	'/api/cron/',
	'/api/stripe/',
	'/api/vercel/'
];

const AI_CRAWLERS = [
	'GPTBot',
	'OAI-SearchBot',
	'Claude-Web',
	'ClaudeBot',
	'Google-Extended',
	'PerplexityBot',
	'Bytespider',
	'CCBot'
];

function buildRulesBlock(userAgent, origin) {
	const lines = [`User-agent: ${userAgent}`, 'Allow: /'];
	for (const path of PRIVATE_PATHS) {
		lines.push(`Disallow: ${path}`);
	}
	lines.push(`Sitemap: ${origin}/sitemap.xml`);
	return lines.join('\n');
}

export const GET = async ({ url }) => {
	const blocks = [buildRulesBlock('*', url.origin), ...AI_CRAWLERS.map((agent) => buildRulesBlock(agent, url.origin))];
	blocks.push('Content-Signal: ai-train=no, search=yes, ai-input=yes');

	return new Response(blocks.join('\n\n') + '\n', {
		status: 200,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400'
		}
	});
};
