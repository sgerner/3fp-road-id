<script>
	import { siX } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siX.path}
	title={siX.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
