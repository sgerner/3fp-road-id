<script>
	import DonatePage from '../../../donate/+page.svelte';

	/** @type {Record<string, any>} */
	let { data } = $props();
</script>

<DonatePage {data} />
