<script>
	import { siTiktok } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siTiktok.path}
	title={siTiktok.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
