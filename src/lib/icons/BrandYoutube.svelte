<script>
	import { siYoutube } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siYoutube.path} title={siYoutube.title} {className} />
