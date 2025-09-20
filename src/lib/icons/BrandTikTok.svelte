<script>
	import { siTiktok } from 'simple-icons/icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siTiktok.path} title={siTiktok.title} {className} />
