<script>
	import WebsitePage from '../+page.svelte';
	/** @type {Record<string, any>} */
	let { data } = $props();
</script>

<WebsitePage {data} />
