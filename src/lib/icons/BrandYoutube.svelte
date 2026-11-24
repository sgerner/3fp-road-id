<script>
	import { siYoutube } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siYoutube.path}
	title={siYoutube.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
