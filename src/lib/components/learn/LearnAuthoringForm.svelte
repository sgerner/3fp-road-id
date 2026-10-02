<script>
	import { enhance } from '$app/forms';
	import LearnEditor from '$lib/components/learn/LearnEditor.svelte';
	import LearnMediaUploader from '$lib/components/learn/LearnMediaUploader.svelte';
	import LearnWritingAssistant from '$lib/components/learn/LearnWritingAssistant.svelte';
	import ImageGeneratorPanel from '$lib/components/ai/ImageGeneratorPanel.svelte';
	import IconBookPlus from '@lucide/svelte/icons/book-plus';
	import IconPencil from '@lucide/svelte/icons/pencil';

	let { data, form, editing = false } = $props();
	const values = $derived(form?.values ?? data?.initialValues ?? {});
	const article = $derived(data?.article ?? null);
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
	let summaryValue = $state('');
	let editorApi = $state(null);
	let editorReady = $state(false);
	let saving = $state(false);

	$effect(() => {
		coverImageUrl = values.coverImageUrl || '';
		summaryValue = values.summary || '';
	});

	function buildContext() {
		if (!formEl) return {};
		const formData = new FormData(formEl);
		return {
			title: formData.get('title')?.toString().trim() || article?.title || '',
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
	<title>{editing ? `Edit ${article?.title || 'article'}` : 'Create article'} · Learn</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<header class="space-y-2">
		<a
			class="text-primary-300 inline-flex items-center gap-2 text-sm font-medium hover:underline"
			href={editing ? `/learn/${article?.slug}` : '/learn'}
		>
			<span aria-hidden="true">←</span>
			{editing ? 'Back to article' : 'Learn library'}
		</a>
		<h1 class="text-3xl font-black tracking-tight sm:text-4xl">
			{editing ? 'Edit article' : 'Create an article'}
		</h1>
		<p class="max-w-2xl text-sm leading-6 opacity-70">
			Start with the idea and the useful details. You can add a summary, category, and media
			whenever you need them.
		</p>
	</header>

	<form
		class="space-y-5"
		method="POST"
		bind:this={formEl}
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
	>
		<section
			class="border-surface-500/20 bg-surface-950 space-y-5 rounded-3xl border p-4 shadow-xl sm:p-7"
			aria-label="Article draft"
		>
			<label class="block space-y-2">
				<span class="label">Article title</span>
				<input
					class="input text-lg"
					name="title"
					placeholder="A clear, useful title"
					required
					value={values.title || ''}
				/>
			</label>

			<details class="border-surface-500/15 bg-surface-900/35 rounded-2xl border p-4 sm:p-5">
				<summary class="cursor-pointer list-none font-semibold">
					<span class="flex items-center justify-between gap-3"
						>Writing help <span class="text-xs font-normal opacity-60">Optional AI assistant</span
						></span
					>
				</summary>
				<div class="mt-4">
					<LearnWritingAssistant
						articleId={article?.id ?? null}
						canAsk={!!article?.id}
						getContext={buildContext}
						getEditor={() => editorApi}
						setSummary={(value) => (summaryValue = value)}
					/>
				</div>
			</details>

			<LearnEditor
				label="Article body"
				name="bodyMarkdown"
				modeName="editorMode"
				value={values.bodyMarkdown || ''}
				mode={values.editorMode || 'wysiwyg'}
				placeholder="Give people a practical guide, story, or template they can use."
				height="min(62vh, 680px)"
				onReady={(api) => {
					editorApi = api;
					editorReady = !!api;
				}}
			/>

			<details class="border-surface-500/15 bg-surface-900/30 rounded-2xl border p-4 sm:p-5">
				<summary class="cursor-pointer list-none font-semibold marker:hidden">
					<span class="flex items-center justify-between gap-3"
						>Article details <span class="text-xs font-normal opacity-60"
							>Summary, URL, category, and cover</span
						></span
					>
				</summary>
				<div class="mt-5 space-y-5">
					<label class="block space-y-2">
						<span class="label">Short summary</span>
						<textarea
							class="textarea min-h-24"
							name="summary"
							placeholder="A short description for article cards and search results."
							bind:value={summaryValue}></textarea>
					</label>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="space-y-2">
							<span class="label"
								>Custom URL slug <span class="font-normal opacity-60">(optional)</span></span
							>
							<input
								class="input"
								name="slug"
								placeholder="generated-from-title"
								value={values.slug || ''}
							/>
						</label>
						<label class="space-y-2">
							<span class="label">Category</span>
							<input
								class="input"
								name="categoryName"
								list="learn-category-options"
								placeholder="Education"
								value={values.categoryName || ''}
							/>
							<datalist id="learn-category-options">
								{#each data.categories ?? [] as category}<option value={category.name}
									></option>{/each}
							</datalist>
						</label>
						<label class="space-y-2 md:col-span-2">
							<span class="label">Subcategory</span>
							<select class="select" name="subcategorySlug">
								<option value="">None</option>
								{#each data.subcategories as sub}
									<option value={sub.slug} selected={values.subcategorySlug === sub.slug}
										>{sub.category_slug} · {sub.name}</option
									>
								{/each}
							</select>
						</label>
						<label class="space-y-2 md:col-span-2">
							<span class="label">Cover image URL</span>
							<input
								class="input"
								name="coverImageUrl"
								placeholder="https://…"
								bind:value={coverImageUrl}
							/>
						</label>
					</div>
					<ImageGeneratorPanel
						target="learn"
						heading="Create cover art"
						description="Create a visual from the article you are writing."
						helperText="Works best for bold, symbolic cover art."
						articleId={article?.id}
						defaultStyleId="quiet_gouache"
						currentImageUrl={coverImageUrl}
						buildContext
						onApply={applyGeneratedImage}
					/>
				</div>
			</details>

			{#if form?.error}<p class="text-error-500 text-sm" role="alert">{form.error}</p>{/if}
			<div class="border-surface-500/15 flex flex-wrap items-center gap-3 border-t pt-5">
				<button
					class="btn preset-filled-primary-500 gap-2"
					type="submit"
					disabled={!editorReady || saving}
				>
					{#if saving}Saving…{:else if !editorReady}Preparing editor…{:else if editing}<IconPencil
							class="h-4 w-4"
						/> Save changes{:else}<IconBookPlus class="h-4 w-4" /> Publish article{/if}
				</button>
				<a class="btn preset-tonal-surface" href={editing ? `/learn/${article?.slug}` : '/learn'}
					>Cancel</a
				>
				<p class="basis-full text-xs leading-5 opacity-60">
					{editing
						? 'Saving updates the live article and keeps the previous version in its history.'
						: 'New articles publish immediately. You can revise them later.'}
				</p>
			</div>
		</section>

		<details class="border-surface-500/15 bg-surface-900/25 rounded-2xl border p-4 sm:p-5">
			<summary class="cursor-pointer font-semibold"
				>Add or reuse photos, files, and media <span class="ml-1 text-sm font-normal opacity-60"
					>(optional)</span
				></summary
			>
			<div class="mt-4">
				<LearnMediaUploader
					articleId={article?.id}
					uploaded={editing ? assetLibrary : data.recentAssets}
					heading="Asset library"
					description={editing
						? 'Browse assets attached to this article, reuse recent uploads, or add new files.'
						: 'Add an upload and insert it into the draft, or reuse something from a recent upload.'}
					onInsertSnippet={(snippet) => editorApi?.insertSnippet?.(snippet) ?? false}
				/>
			</div>
		</details>
	</form>
</div>
