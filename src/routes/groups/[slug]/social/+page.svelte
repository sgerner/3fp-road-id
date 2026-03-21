<script>
	import GroupSocialManager from '$lib/components/groups/GroupSocialManager.svelte';

	let { data } = $props();
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-3 py-6 md:px-4 lg:px-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<p class="text-surface-700-300 text-xs tracking-[0.2em] uppercase">Group Dashboard</p>
			<h1 class="text-2xl font-semibold">Social Media Manager</h1>
			<p class="text-surface-700-300 mt-1 text-sm">
				Manage publishing, scheduling, and comment replies.
			</p>
		</div>
		<a href={`/groups/${data.group?.slug}`} class="btn btn-sm preset-tonal-surface">Back to Group</a
		>
	</div>

	<GroupSocialManager
		slug={data.group?.slug}
		canManageSocial={data.can_manage_social === true}
		showClaimMessage={Boolean(data.session_user_id) && data.is_claimed === false}
		group={data.group}
	/>
</div>
