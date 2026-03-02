<script>
	import LearnEditor from '$lib/components/learn/LearnEditor.svelte';
	import LearnMediaUploader from '$lib/components/learn/LearnMediaUploader.svelte';
	import IconBookPlus from '@lucide/svelte/icons/book-plus';

	const { data, form } = $props();

	const values = $derived(form?.values ?? data?.initialValues ?? {});
</script>

<svelte:head>
	<title>Create Article · Learn</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<h1 class="text-left text-3xl font-black">Create a new wiki article</h1>

	<form class="space-y-6" method="POST">
		<section
			class="border-surface-500/20 bg-surface-950/50 space-y-6 rounded-[2rem] border p-6 shadow-xl"
		>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-2">
					<span class="label">Title</span>
					<input
						class="input"
						name="title"
						placeholder="Community Hub"
						required
						value={values.title || ''}
					/>
				</label>
				<label class="space-y-2">
					<span class="label">Slug</span>
					<input
						class="input"
						name="slug"
						placeholder="optional-custom-slug"
						value={values.slug || ''}
					/>
				</label>
			</div>

			<label class="space-y-2">
				<span class="label">Summary</span>
				<textarea
					class="textarea min-h-28"
					name="summary"
					placeholder="Short description shown on cards and search results."
					>{values.summary || ''}</textarea
				>
			</label>

			<div class="grid gap-4 md:grid-cols-3">
				<label class="space-y-2">
					<span class="label">Category</span>
					<input
						class="input"
						name="categoryName"
						placeholder="Education"
						value={values.categoryName || ''}
					/>
				</label>
				<label class="space-y-2">
					<span class="label">Subcategory</span>
					<select class="select" name="subcategorySlug">
						<option value="">None</option>
						{#each data.subcategories as sub}
							<option value={sub.slug} selected={values.subcategorySlug === sub.slug}>
								{sub.category_slug} - {sub.name}
							</option>
						{/each}
					</select>
				</label>
				<label class="space-y-2">
					<span class="label">Cover image URL</span>
					<input
						class="input"
						name="coverImageUrl"
						placeholder="https://..."
						value={values.coverImageUrl || ''}
					/>
				</label>
			</div>

			<LearnEditor
				value={values.bodyMarkdown || ''}
				mode={values.editorMode || 'wysiwyg'}
				placeholder="Start with the field guide, story, or template you want the community to use."
			/>

			{#if form?.error}
				<p class="text-error-500 text-sm">{form.error}</p>
			{/if}

			<div class="flex flex-wrap gap-3">
				<button class="btn preset-filled-primary-500 gap-2" type="submit">
					<IconBookPlus class="h-4 w-4" />
					Publish article
				</button>
				<a class="btn preset-tonal-surface" href="/learn">Cancel</a>
			</div>
		</section>

		<LearnMediaUploader />

		<section class="border-surface-500/20 bg-surface-900/55 rounded-[1.75rem] border p-5 shadow-lg">
			<p class="label">Publishing model</p>
			<p class="mt-3 text-sm leading-6 opacity-75">
				New articles publish immediately. Every save creates a revision so editors can recover prior
				versions from the article history.
			</p>
		</section>
	</form>
</div>
