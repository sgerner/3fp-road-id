import adapter from '@sveltejs/adapter-auto';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	ssr: {
		// Bundle the CommonJS sanitizer and its ESM parser together so Vercel's
		// runtime does not have to require an ES module from node_modules.
		noExternal: ['sanitize-html', 'htmlparser2']
	},
	build: {
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						{
							name: 'prosemirror',
							test: /node_modules[\\/](?:prosemirror-[^\\/]+|orderedmap|rope-sequence|w3c-keyname)[\\/]/
						}
					]
				}
			}
		}
	},
	resolve: {
		alias: {
			'#lib': fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	plugins: [
		sveltekit({
			adapter: adapter(),
			preprocess: vitePreprocess(),
			// Inline small route stylesheets so the first paint does not wait on
			// another request. The larger shared stylesheet stays cacheable.
			inlineStyleThreshold: 100_000
		}),
		tailwindcss()
	]
});
