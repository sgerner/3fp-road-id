<script>
	import IconCheck from '@lucide/svelte/icons/check';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import GroupNewsEditorForm from '$lib/components/groups/GroupNewsEditorForm.svelte';

	const { data, form } = $props();
	const values = $derived(form?.values ?? data.initialValues ?? {});
	const emailMembers = $derived(Boolean(form?.emailMembers));
	const emailAudienceStatuses = $derived(
		Array.isArray(form?.emailAudienceStatuses) && form.emailAudienceStatuses.length
			? form.emailAudienceStatuses
			: Array.isArray(values?.emailAudienceStatuses) && values.emailAudienceStatuses.length
				? values.emailAudienceStatuses
				: ['active']
	);
	const editingSlug = $derived(form?.editingSlug ?? data.selectedSlug ?? '');
	const sortedPosts = $derived(
		[...(data.posts ?? [])].sort((a, b) => {
			const aTime = Date.parse(a?.published_at || a?.updated_at || a?.created_at || 0);
			const bTime = Date.parse(b?.published_at || b?.updated_at || b?.created_at || 0);
			return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
		})
	);
	const selectedPost = $derived(
		editingSlug
			? (sortedPosts.find((post) => post.slug === editingSlug) ?? data.selectedPost ?? null)
			: null
	);
	const isEditing = $derived(Boolean(values.postId || selectedPost));
	const isPublished = $derived(Boolean(selectedPost?.is_published));
	const visiblePosts = $derived(showAllPosts ? sortedPosts : sortedPosts.slice(0, 3));
	const canShowMore = $derived(sortedPosts.length > 3 && !showAllPosts);
	const canShowLess = $derived(sortedPosts.length > 3 && showAllPosts);

	let postsOpen = $state(false);
	let postsOpenInitialized = $state(false);
	let showAllPosts = $state(false);
	let showDeleteConfirm = $state(false);

	$effect(() => {
		if (postsOpenInitialized) return;
		postsOpenInitialized = true;
		postsOpen = data.posts.length > 0;
	});

	function formatDateParts(value) {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return {
			month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
			day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date)
		};
	}

	function confirmDelete(post) {
		if (confirm(`Delete "${post.title}" permanently? This cannot be undone.`)) {
			return true;
		}
		return false;
	}
</script>

<div class="news-manage">
	<!-- Banners -->
	{#if form?.success}
		<div class="banner success" role="status">
			<div class="banner-content">
				<div class="banner-icon success">
					<IconCheck class="h-4 w-4" />
				</div>
				<div>
					<p class="banner-title">Saved</p>
					<p class="banner-subtitle">Update published.</p>
				</div>
			</div>
		</div>
	{/if}

	{#if form?.error}
		<div class="banner error" role="alert">
			<p class="banner-title">Failed to save</p>
			<p class="banner-subtitle">{form.error}</p>
		</div>
	{/if}

	<!-- Post Selector -->
	<section class="updates-card">
		<div class="updates-accent-bar" aria-hidden="true"></div>

		<div class="updates-header">
			<div class="updates-header-left">
				<div class="updates-icon">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						class="h-5 w-5"
					>
						<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
						<polyline points="22,6 12,13 2,6" />
					</svg>
				</div>
				<div class="updates-title-group">
					<h2 class="updates-title">Updates</h2>
					<span class="updates-count">{data.posts.length}</span>
				</div>
			</div>
			<div class="updates-header-right">
				<a class="btn-new" href={`/groups/${data.group.slug}/manage/news`}>
					<IconPlus class="h-4 w-4" />
					<span>New</span>
				</a>
				{#if data.posts.length > 0}
					<button
						class="btn-toggle"
						type="button"
						onclick={() => (postsOpen = !postsOpen)}
						aria-expanded={postsOpen}
					>
						<span>{postsOpen ? 'Hide' : 'Show'}</span>
						{#if postsOpen}
							<IconChevronUp class="h-4 w-4" />
						{:else}
							<IconChevronDown class="h-4 w-4" />
						{/if}
					</button>
				{/if}
			</div>
		</div>

		{#if postsOpen}
			<div class="updates-list">
				{#if sortedPosts.length}
					<div class="posts-container">
						{#each visiblePosts as post}
							{@const postDateParts = formatDateParts(
								post.is_published ? post.published_at : post.updated_at
							)}
							{@const isActive = editingSlug === post.slug}

							<div class="post-card-wrapper">
								<a
									class="post-card {isActive ? 'active' : ''}"
									href={`/groups/${data.group.slug}/manage/news?edit=${post.slug}#update-title-field`}
								>
									<div class="post-date">
										{#if postDateParts}
											<span class="post-month">{postDateParts.month}</span>
											<span class="post-day">{postDateParts.day}</span>
										{:else}
											<span class="post-month draft">Draft</span>
										{/if}
									</div>

									<div class="post-body">
										<div class="post-header-row">
											<h3 class="post-title">{post.title}</h3>
											<div class="post-meta">
												<span class="post-status {post.is_published ? 'live' : 'draft'}">
													{post.is_published ? (post.is_private ? 'Private' : 'Live') : 'Draft'}
												</span>
												<form
													class="delete-form-inline"
													method="POST"
													onsubmit={(e) => {
														e.preventDefault();
														if (confirmDelete(post)) {
															e.currentTarget.submit();
														}
													}}
												>
													<input type="hidden" name="postId" value={post.id} />
													<input type="hidden" name="intent" value="delete" />
													<button
														class="btn-delete-inline"
														type="submit"
														aria-label={`Delete ${post.title}`}
														title="Delete"
														onclick={(e) => e.stopPropagation()}
													>
														<IconTrash2 class="h-3.5 w-3.5" />
													</button>
												</form>
											</div>
										</div>
										{#if post.preview_text}
											<p class="post-preview">{post.preview_text}</p>
										{/if}
									</div>
								</a>
							</div>
						{/each}
					</div>

					{#if canShowMore || canShowLess}
						<div class="show-more-container">
							<button
								class="btn-show-more"
								type="button"
								onclick={() => (showAllPosts = !showAllPosts)}
							>
								{#if canShowMore}
									<span>Show {sortedPosts.length - 3} more</span>
									<IconChevronDown class="h-4 w-4" />
								{:else}
									<span>Show less</span>
									<IconChevronUp class="h-4 w-4" />
								{/if}
							</button>
						</div>
					{/if}
				{:else}
					<div class="empty-state">
						<div class="empty-icon">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="h-8 w-8"
							>
								<path d="M12 19l7-7 3 3-7 7-3-3z" />
								<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
								<path d="M2 2l7.586 7.586" />
								<circle cx="11" cy="11" r="2" />
							</svg>
						</div>
						<p class="empty-title">No updates yet</p>
						<p class="empty-subtitle">Create your first update to share with members</p>
					</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Editor -->
	<GroupNewsEditorForm
		group={data.group}
		{values}
		error={form?.error || ''}
		{isEditing}
		{isPublished}
		memberEmailCount={data.memberEmailCount ?? 0}
		memberEmailCountsByStatus={data.memberEmailCountsByStatus ?? {}}
		emailAudienceStatusOptions={data.emailAudienceStatusOptions ?? ['active', 'past_due', 'cancelled']}
		{emailMembers}
		{emailAudienceStatuses}
		publicHref={selectedPost?.is_published
			? selectedPost?.is_private
				? ''
				: `/groups/${data.group.slug}/news?open=${selectedPost.slug}`
			: ''}
		resetHref={`/groups/${data.group.slug}/manage/news`}
		onDelete={selectedPost
			? () => {
					showDeleteConfirm = true;
				}
			: null}
	/>

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm && selectedPost}
		<div
			class="delete-modal-overlay"
			role="button"
			tabindex="0"
			onclick={(event) => {
				if (event.target === event.currentTarget) showDeleteConfirm = false;
			}}
			onkeydown={(event) => {
				if (event.key === 'Escape') showDeleteConfirm = false;
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					if (event.target === event.currentTarget) showDeleteConfirm = false;
				}
			}}
		>
			<div class="delete-modal">
				<div class="delete-modal-header">
					<div class="delete-icon-large">
						<IconTrash2 class="h-6 w-6" />
					</div>
					<div>
						<h3 class="delete-modal-title">Delete update?</h3>
						<p class="delete-modal-subtitle">This action cannot be undone</p>
					</div>
				</div>

				<div class="delete-modal-content">
					<p class="delete-target">
						"{selectedPost.title}"
					</p>
				</div>

				<div class="delete-modal-actions">
					<button class="btn-cancel" type="button" onclick={() => (showDeleteConfirm = false)}>
						Cancel
					</button>
					<form method="POST" class="delete-form-inline">
						<input type="hidden" name="postId" value={selectedPost.id} />
						<button class="btn-delete-confirm" type="submit" name="intent" value="delete">
							<IconTrash2 class="h-4 w-4" />
							<span>Delete permanently</span>
						</button>
					</form>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.news-manage {
		--card-bg: color-mix(in oklab, var(--color-surface-900) 98%, var(--color-surface-500) 2%);
		--card-border: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		--hover-bg: color-mix(in oklab, var(--color-surface-800) 80%, transparent);
		--active-bg: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-900) 92%);
		--active-border: color-mix(in oklab, var(--color-primary-500) 35%, transparent);

		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	@media (min-width: 640px) {
		.news-manage {
			gap: 1.5rem;
		}
	}

	/* Banners */
	.banner {
		border-radius: 1rem;
		padding: 1rem 1.25rem;
		animation: slide-in 300ms ease both;
	}

	.banner.success {
		background: color-mix(in oklab, var(--color-success-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 20%, transparent);
	}

	.banner.error {
		background: color-mix(in oklab, var(--color-error-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 20%, transparent);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.banner-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
	}

	.banner-icon.success {
		background: color-mix(in oklab, var(--color-success-500) 15%, transparent);
		color: var(--color-success-400);
	}

	.banner-title {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.banner-subtitle {
		font-size: 0.75rem;
		opacity: 0.7;
		line-height: 1.25;
	}

	/* Updates Card */
	.updates-card {
		position: relative;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1.25rem;
		overflow: hidden;
		animation: card-in 360ms ease both;
		box-shadow:
			0 1px 3px color-mix(in oklab, black 8%, transparent),
			0 4px 12px color-mix(in oklab, black 4%, transparent);
	}

	.updates-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		opacity: 0.8;
		pointer-events: none;
	}

	.updates-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--card-border);
	}

	@media (max-width: 480px) {
		.updates-header {
			padding: 0.875rem 1rem;
		}
	}

	.updates-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.updates-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-400);
	}

	.updates-title-group {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.updates-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.updates-count {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		color: color-mix(in oklab, var(--color-surface-200) 90%, transparent);
	}

	.updates-header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-new {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: var(--color-primary-500);
		color: white;
		text-decoration: none;
		transition: all 150ms ease;
	}

	.btn-new:hover {
		background: var(--color-primary-600);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.btn-toggle {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		border: none;
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-toggle:hover {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	/* Updates List */
	.updates-list {
		animation: slide-down 250ms ease both;
	}

	.posts-container {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (max-width: 480px) {
		.posts-container {
			padding: 0.5rem;
			gap: 0.375rem;
		}
	}

	/* Post Card Wrapper */
	.post-card-wrapper {
		position: relative;
	}

	.post-card {
		display: flex;
		align-items: stretch;
		gap: 0;
		border-radius: 0.875rem;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		text-decoration: none;
		color: inherit;
		transition: all 180ms ease;
		overflow: hidden;
	}

	.post-card:hover {
		background: var(--hover-bg);
		border-color: color-mix(in oklab, var(--color-surface-400) 18%, transparent);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px color-mix(in oklab, black 8%, transparent);
	}

	.post-card.active {
		background: var(--active-bg);
		border-color: var(--active-border);
	}

	/* Date box - now fills full height */
	.post-date {
		flex-shrink: 0;
		width: 3.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		padding: 0.75rem 0.5rem;
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border-right: 1px solid color-mix(in oklab, var(--color-surface-400) 12%, transparent);
	}

	.post-month {
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.65;
		line-height: 1;
	}

	.post-month.draft {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	.post-day {
		font-size: 1.125rem;
		font-weight: 700;
		line-height: 1;
	}

	/* Post body */
	.post-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.875rem 1rem;
		justify-content: center;
	}

	@media (max-width: 480px) {
		.post-body {
			padding: 0.75rem;
		}
	}

	.post-header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.post-title {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}

	@media (max-width: 480px) {
		.post-title {
			font-size: 0.875rem;
		}
	}

	.post-status {
		flex-shrink: 0;
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.post-status.live {
		background: color-mix(in oklab, var(--color-success-500) 12%, transparent);
		color: var(--color-success-400);
	}

	.post-status.draft {
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-400);
	}

	.post-preview {
		font-size: 0.8125rem;
		opacity: 0.6;
		line-height: 1.4;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (max-width: 480px) {
		.post-preview {
			font-size: 0.75rem;
			line-clamp: 1;
			-webkit-line-clamp: 1;
		}
	}

	/* Post meta with delete button inline */
	.post-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	/* Inline delete button - always visible */
	.delete-form-inline {
		display: flex;
		align-items: center;
	}

	.btn-delete-inline {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.25rem;
		background: transparent;
		border: none;
		color: color-mix(in oklab, var(--color-error-500) 70%, transparent);
		cursor: pointer;
		transition: all 120ms ease;
		margin-left: 0.125rem;
	}

	.btn-delete-inline:hover {
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		color: var(--color-error-400);
	}

	.btn-delete-inline:active {
		transform: scale(0.92);
	}

	/* Show More */
	.show-more-container {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0.75rem 0.75rem;
	}

	.btn-show-more {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		border: none;
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-show-more:hover {
		background: color-mix(in oklab, var(--color-surface-500) 18%, transparent);
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2.5rem 1.5rem;
		text-align: center;
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		color: color-mix(in oklab, var(--color-surface-300) 60%, transparent);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.empty-subtitle {
		font-size: 0.8125rem;
		opacity: 0.6;
	}

	/* Delete Modal */
	.delete-modal-overlay {
		position: fixed;
		inset: 0;
		background: color-mix(in oklab, black 60%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 100;
		animation: fade-in 200ms ease;
		backdrop-filter: blur(4px);
	}

	.delete-modal {
		width: 100%;
		max-width: 24rem;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1rem;
		padding: 1.5rem;
		animation: modal-in 250ms ease;
		box-shadow:
			0 20px 25px -5px color-mix(in oklab, black 20%, transparent),
			0 8px 10px -6px color-mix(in oklab, black 10%, transparent);
	}

	.delete-modal-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1rem;
	}

	.delete-icon-large {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		color: var(--color-error-400);
	}

	.delete-modal-title {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.delete-modal-subtitle {
		font-size: 0.8125rem;
		opacity: 0.6;
		line-height: 1.25;
	}

	.delete-modal-content {
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border-radius: 0.625rem;
		margin-bottom: 1.25rem;
	}

	.delete-target {
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: center;
		opacity: 0.9;
	}

	.delete-modal-actions {
		display: flex;
		gap: 0.75rem;
	}

	.btn-cancel {
		flex: 1;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		border: none;
		color: inherit;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-cancel:hover {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.delete-form-inline {
		flex: 1;
	}

	.btn-delete-confirm {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: var(--color-error-500);
		border: none;
		color: white;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-delete-confirm:hover {
		background: var(--color-error-600);
	}

	/* Animations */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slide-down {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
