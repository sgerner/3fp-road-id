import adapter from '@sveltejs/adapter-vercel';
import adapterNode from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	ssr: {
		// Bundle the sanitizer's entire dependency tree: external CommonJS
		// requires become dynamic helpers that Vercel cannot reliably trace.
		// Development must let Node load these CommonJS packages normally.
		noExternal:
			command === 'build'
				? [
						'sanitize-html',
						'deepmerge',
						'escape-string-regexp',
						'htmlparser2',
						'domelementtype',
						'domhandler',
						'domutils',
						'dom-serializer',
						'entities',
						'is-plain-object',
						'launder',
						'dayjs',
						'parse-srcset',
						'postcss',
						'nanoid',
						'picocolors',
						'source-map-js'
					]
				: []
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
	plugins: [
		sveltekit({
			adapter: process.env.DEPLOY_TARGET === 'node' ? adapterNode() : adapter(),
			preprocess: vitePreprocess(),
			// Inline small route stylesheets so the first paint does not wait on
			// another request. The larger shared stylesheet stays cacheable.
			inlineStyleThreshold: 100_000
		}),
		tailwindcss()
	]
}));
