<script>
	import { siFacebook } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siFacebook.path} title={siFacebook.title} {className} />
