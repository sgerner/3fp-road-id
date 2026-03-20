<script>
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import GroupNewsEditorForm from '$lib/components/groups/GroupNewsEditorForm.svelte';

	const { data, form } = $props();
	const values = $derived(form?.values ?? data.initialValues ?? {});
	const emailMembers = $derived(Boolean(form?.emailMembers));
	const editingSlug = $derived(form?.editingSlug ?? data.selectedSlug ?? '');
	const selectedPost = $derived(
		editingSlug
			? (data.posts.find((post) => post.slug === editingSlug) ?? data.selectedPost ?? null)
			: null
	);
	const isEditing = $derived(Boolean(values.postId || selectedPost));
	const isPublished = $derived(Boolean(selectedPost?.is_published));

	function formatDate(value) {
		if (!value) return 'Draft';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Draft';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6">
	<section class="border-surface-500/20 bg-surface-950/55 rounded-[2rem] border p-6 shadow-xl">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="max-w-3xl">
				<div class="mb-2 flex items-center gap-2 opacity-70">
					<IconNewspaper class="h-4 w-4" />
					<span class="label">Updates</span>
				</div>
				<h1 class="text-4xl font-black">Group updates</h1>
				<p class="mt-3 text-base leading-7 opacity-75">
					Keep this lightweight. Post route changes, event reminders, recaps, volunteer asks, and
					other timely notes. Live updates show on the group page and in the public archive. Use the
					AI drafting panel when you want a polished first pass or quick revisions.
				</p>
				<p class="mt-3 text-sm opacity-60">
					{data.memberEmailCount ?? 0}
					{(data.memberEmailCount ?? 0) === 1
						? ' active member can'
						: ' active members can'} receive update emails.
				</p>
			</div>
			<a
				class="btn preset-tonal-surface gap-2"
				href={`/groups/${data.group.slug}/news`}
				target="_blank"
			>
				<IconArrowUpRight class="h-4 w-4" />
				View public updates
			</a>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[0.9fr,1.5fr]">
		<aside class="space-y-6">
			<section class="border-surface-500/20 bg-surface-950/45 rounded-[2rem] border p-5 shadow-xl">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="label opacity-60">Library</p>
						<h2 class="text-2xl font-black">All updates</h2>
					</div>
					<a
						class="btn btn-sm preset-filled-primary-500 gap-2"
						href={`/groups/${data.group.slug}/manage/news`}
					>
						<IconPlus class="h-4 w-4" />
						New
					</a>
				</div>

				{#if data.posts.length}
					<div class="mt-5 space-y-3">
						{#each data.posts as post}
							<a
								class="border-surface-500/20 bg-surface-900/40 hover:bg-surface-900/70 block rounded-[1.5rem] border p-4 transition-colors {editingSlug ===
								post.slug
									? 'ring-primary-500/45 border-primary-500/40 ring-2'
									: ''}"
								href={`/groups/${data.group.slug}/manage/news?edit=${post.slug}`}
							>
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="chip {post.is_published
											? 'preset-filled-success-500'
											: 'preset-tonal-warning'}"
									>
										{post.is_published ? 'Live' : 'Draft'}
									</span>
									<span class="text-xs uppercase opacity-60">
										{post.is_published
											? `Published ${formatDate(post.published_at)}`
											: `Updated ${formatDate(post.updated_at)}`}
									</span>
								</div>
								<h3 class="mt-3 text-lg leading-snug font-bold">{post.title}</h3>
								{#if post.preview_text}
									<p class="mt-2 text-sm leading-6 opacity-75">{post.preview_text}</p>
								{/if}
							</a>
						{/each}
					</div>
				{:else}
					<div
						class="border-surface-500/20 bg-surface-900/30 mt-5 rounded-[1.5rem] border border-dashed p-6 text-center"
					>
						<p class="font-semibold">No updates yet</p>
						<p class="mt-2 text-sm leading-6 opacity-70">
							Start with a short welcome or your next important update.
						</p>
					</div>
				{/if}
			</section>

			<section class="border-surface-500/20 bg-surface-950/35 rounded-[2rem] border p-5 shadow-xl">
				<p class="label opacity-60">What works best</p>
				<ul class="mt-4 space-y-3 text-sm leading-6 opacity-80">
					<li>Lead with the takeaway in the title.</li>
					<li>Keep most updates under a few short paragraphs.</li>
					<li>Add links only when members need a next step.</li>
				</ul>
			</section>
		</aside>

		<div class="space-y-6">
			<GroupNewsEditorForm
				group={data.group}
				{values}
				error={form?.error || ''}
				{isEditing}
				{isPublished}
				memberEmailCount={data.memberEmailCount ?? 0}
				{emailMembers}
				publicHref={selectedPost?.is_published
					? `/groups/${data.group.slug}/news/${selectedPost.slug}`
					: ''}
				resetHref={`/groups/${data.group.slug}/manage/news`}
			/>

			{#if selectedPost}
				<section class="grid gap-6 lg:grid-cols-[1fr,auto]">
					<div class="border-surface-500/20 bg-surface-950/40 rounded-[2rem] border p-5 shadow-xl">
						<p class="label opacity-60">Selected update</p>
						<h2 class="mt-2 text-2xl font-black">{selectedPost.title}</h2>
						<div class="mt-3 flex flex-wrap gap-3 text-sm opacity-70">
							<div>{selectedPost.is_published ? 'Live' : 'Draft'}</div>
							<div>
								{selectedPost.is_published
									? `Published ${formatDate(selectedPost.published_at)}`
									: `Last updated ${formatDate(selectedPost.updated_at)}`}
							</div>
						</div>
						{#if selectedPost.preview_text}
							<p class="mt-4 max-w-3xl text-sm leading-6 opacity-75">{selectedPost.preview_text}</p>
						{/if}
					</div>

					<section class="border-error-500/25 bg-error-500/8 rounded-[2rem] border p-5 shadow-xl">
						<p class="label text-error-300 opacity-80">Delete</p>
						<p class="mt-3 max-w-sm text-sm leading-6 opacity-80">
							Remove this update permanently. Existing public links will stop working.
						</p>
						<form method="POST" class="mt-4">
							<input type="hidden" name="postId" value={selectedPost.id} />
							<button
								class="btn preset-filled-error-500 gap-2"
								type="submit"
								name="intent"
								value="delete"
								onclick={(event) => {
									if (!confirm('Delete this update permanently?')) {
										event.preventDefault();
									}
								}}
							>
								<IconTrash2 class="h-4 w-4" />
								Delete update
							</button>
						</form>
					</section>
				</section>
			{/if}
		</div>
	</div>
</div>
