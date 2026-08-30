import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		// Inline the small route stylesheets so the first paint does not wait on
		// another request. The larger shared stylesheet stays cacheable.
		inlineStyleThreshold: 100_000
	}
};

export default config;
