<script>
	import LearnEditor from '$lib/components/learn/LearnEditor.svelte';
	import LearnMediaUploader from '$lib/components/learn/LearnMediaUploader.svelte';
	import ImageGeneratorPanel from '$lib/components/ai/ImageGeneratorPanel.svelte';
	import IconPencil from '@lucide/svelte/icons/pencil';

	const { data, form } = $props();

	const values = $derived(form?.values ?? data?.initialValues ?? {});
	const assetLibrary = $derived(
		Array.from(
			new Map(
				[...(data.articleAssets ?? []), ...(data.recentAssets ?? [])].map((asset) => [
					asset.id,
					asset
				])
			).values()
		)
	);
	let formEl = $state();
	let coverImageUrl = $state('');

	$effect(() => {
		coverImageUrl = values.coverImageUrl || '';
	});

	function buildImageContext() {
		const formData = new FormData(formEl);
		return {
			title: formData.get('title')?.toString().trim() || data.article.title || '',
			summary: formData.get('summary')?.toString().trim() || '',
			category: formData.get('categoryName')?.toString().trim() || '',
			subcategory:
				data.subcategories.find((sub) => sub.slug === formData.get('subcategorySlug')?.toString())
					?.name || '',
			bodyMarkdown: formData.get('bodyMarkdown')?.toString() || ''
		};
	}

	function applyGeneratedImage(result) {
		coverImageUrl = result?.url || coverImageUrl;
	}
</script>

<svelte:head>
	<title>Edit {data.article.title} · Learn</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<h1 class="text-left text-3xl font-black">Edit article</h1>

	<form class="space-y-6" method="POST" bind:this={formEl}>
		<section
			class="border-surface-500/20 bg-surface-950/50 space-y-6 rounded-[2rem] border p-6 shadow-xl"
		>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-2">
					<span class="label">Title</span>
					<input class="input" name="title" required value={values.title || ''} />
				</label>
				<label class="space-y-2">
					<span class="label">Slug</span>
					<input class="input" name="slug" value={values.slug || ''} />
				</label>
			</div>

			<label class="space-y-2">
				<span class="label">Summary</span>
				<textarea class="textarea min-h-28" name="summary">{values.summary || ''}</textarea>
			</label>

			<div class="grid gap-4 md:grid-cols-3">
				<label class="space-y-2">
					<span class="label">Category</span>
					<input class="input" name="categoryName" value={values.categoryName || ''} />
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
					<input class="input" name="coverImageUrl" bind:value={coverImageUrl} />
				</label>
			</div>

			<ImageGeneratorPanel
				target="learn"
				heading="Generate article cover art"
				description="Use the article draft on this page to create a comic-style cover image and add it to the asset library."
				helperText="Generated learn images are stored like uploaded assets, so they can be reused later."
				articleId={data.article.id}
				currentImageUrl={coverImageUrl}
				buildContext={buildImageContext}
				onApply={applyGeneratedImage}
			/>

			<LearnEditor value={values.bodyMarkdown || ''} mode={values.editorMode || 'wysiwyg'} />

			{#if form?.error}
				<p class="text-error-500 text-sm">{form.error}</p>
			{/if}

			<div class="flex flex-wrap gap-3">
				<button class="btn preset-filled-primary-500 gap-2" type="submit">
					<IconPencil class="h-4 w-4" />
					Save revision
				</button>
				<a class="btn preset-tonal-surface" href={`/learn/${data.article.slug}`}>Cancel</a>
			</div>
		</section>

		<LearnMediaUploader
			articleId={data.article.id}
			uploaded={assetLibrary}
			heading="Asset Library"
			description="Browse files already attached to this article, reuse recent uploads, or add new media and documents."
		/>

		<section class="border-surface-500/20 bg-surface-900/55 rounded-[1.75rem] border p-5 shadow-lg">
			<p class="label">Revision safety</p>
			<p class="mt-3 text-sm leading-6 opacity-75">
				Saving this form updates the live article immediately and snapshots the previous state into
				version history.
			</p>
		</section>
	</form>
</div>
