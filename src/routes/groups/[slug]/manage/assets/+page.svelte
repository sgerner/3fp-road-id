<script>
	import GroupAssetManager from '$lib/components/groups/GroupAssetManager.svelte';

	let { data, form } = $props();
</script>

<div class="space-y-6 pb-10">
	<GroupAssetManager slug={data.group?.slug} buckets={data.buckets ?? []} {form} />
</div>
