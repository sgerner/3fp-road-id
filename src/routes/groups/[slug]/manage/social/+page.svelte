<script>
	import GroupSocialManager from '$lib/components/groups/GroupSocialManager.svelte';

	let { data } = $props();
</script>

<div class="social-manage space-y-6 pb-10">
	<GroupSocialManager
		slug={data.group?.slug}
		canManageSocial={data.can_manage_social === true}
		showClaimMessage={Boolean(data.session_user_id) && data.is_claimed === false}
	/>
</div>
