<script>
	import { siStrava } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siStrava.path}
	title={siStrava.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
