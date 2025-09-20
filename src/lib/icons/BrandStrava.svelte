<script>
	import { siStrava } from 'simple-icons/icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siStrava.path} title={siStrava.title} {className} />
