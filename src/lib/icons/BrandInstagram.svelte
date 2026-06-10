<script>
	import { siInstagram } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siInstagram.path} title={siInstagram.title} {className} />
