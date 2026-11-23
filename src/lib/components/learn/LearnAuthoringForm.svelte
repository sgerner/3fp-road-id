<script>
	import { enhance } from '$app/forms';
	import LearnEditor from '#lib/components/learn/LearnEditor.svelte';
	import LearnMediaUploader from '#lib/components/learn/LearnMediaUploader.svelte';
	import LearnWritingAssistant from '#lib/components/learn/LearnWritingAssistant.svelte';
	import CoverMediaField from '#lib/components/ai/CoverMediaField.svelte';
	import IconBookPlus from '@lucide/svelte/icons/book-plus';
	import IconPencil from '@lucide/svelte/icons/pencil';

	/** @type {Record<string, any>} */
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
	let coverUploading = $state(false);
	let coverUploadError = $state('');
	let extraUploadedAssets = $state([]);
	let summaryValue = $state('');
	/** @type {any} */
	let editorApi = $state(null);
	let editorReady = $state(false);
	let saving = $state(false);

	const mergedAssets = $derived(
		Array.from(
			new Map(
				[...extraUploadedAssets, ...(editing ? assetLibrary : (data.recentAssets ?? []))].map(
					(asset) => [asset.id || asset.url, asset]
				)
			).values()
		)
	);

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
		coverUploadError = '';
		coverImageUrl = result?.url || coverImageUrl;
		if (result?.asset) {
			extraUploadedAssets = [result.asset, ...extraUploadedAssets];
		}
	}

	async function uploadCoverFiles(files) {
		const file = files?.[0];
		if (!file) return;
		coverUploadError = '';
		if (file.size > 25 * 1024 * 1024) {
			coverUploadError = 'Cover image exceeds the 25 MB upload limit.';
			return;
		}
		coverUploading = true;
		try {
			const payload = new FormData();
			payload.append('files', file);
			if (article?.id) payload.append('articleId', article.id);

			const response = await fetch('/api/learn/assets', {
				method: 'POST',
				body: payload
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(body?.error || 'Unable to upload cover image.');
			}
			const uploadedAsset = body?.files?.[0];
			if (!uploadedAsset?.url) {
				throw new Error('Unable to upload cover image.');
			}
			coverImageUrl = uploadedAsset.url;
			extraUploadedAssets = [uploadedAsset, ...extraUploadedAssets];
		} catch (uploadError) {
			coverUploadError = uploadError?.message || 'Unable to upload cover image.';
		} finally {
			coverUploading = false;
		}
	}

	function removeCoverImage() {
		coverUploadError = '';
		coverImageUrl = '';
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
		<section class="bg-surface-950 space-y-5 p-4 sm:p-7" aria-label="Article draft">
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

			<details class="border-surface-500/30 bg-surface-900 border-t p-4 sm:p-5">
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

			<details class="border-surface-500/30 bg-surface-900 border-t p-4 sm:p-5">
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
					</div>
					<input type="hidden" name="coverImageUrl" value={coverImageUrl} />
					<CoverMediaField
						label="Article cover"
						description="Upload a cover image directly, or open the studio to create editorial cover art."
						helperNote="PNG, JPG, WebP, or GIF · Max 25 MB · 16:9 recommended"
						imageUrl={coverImageUrl}
						uploading={coverUploading}
						error={coverUploadError}
						target="learn"
						articleId={article?.id}
						defaultStyleId="quiet_gouache"
						studioHeading="Create cover art"
						studioDescription="Create an editorial illustration from the article you are writing."
						studioHelperText="Works best for bold, symbolic cover art."
						{buildContext}
						onSelectFiles={uploadCoverFiles}
						onRemove={coverImageUrl ? removeCoverImage : null}
						onApplyArtwork={applyGeneratedImage}
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

		<details class="border-surface-500/30 bg-surface-900 border-t p-4 sm:p-5">
			<summary class="cursor-pointer font-semibold"
				>Add or reuse photos, files, and media <span class="ml-1 text-sm font-normal opacity-60"
					>(optional)</span
				></summary
			>
			<div class="mt-4">
				<LearnMediaUploader
					articleId={article?.id}
					uploaded={mergedAssets}
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
