<script>
	import { page } from '$app/stores';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import SectionSecondaryNav from '$lib/components/navigation/SectionSecondaryNav.svelte';

	let { children } = $props();

	const pathname = $derived($page.url.pathname);
	const currentUser = $derived($page.data?.currentUser ?? null);
	const currentArticle = $derived($page.data?.article ?? null);
	const currentArticleSlug = $derived($page.data?.article?.slug ?? null);
	const canEditCurrentArticle = $derived(
		Boolean(
			currentArticleSlug &&
			($page.data?.canEdit ||
				pathname === `/learn/${currentArticleSlug}/edit` ||
				pathname.startsWith(`/learn/${currentArticleSlug}/edit`))
		)
	);

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Learn Library',
						href: '/learn',
						icon: IconBookOpen
					}
				]
			}
		];

		const currentCategorySlug = $page.data?.category?.slug ?? $page.data?.article?.category_slug;
		const currentCategoryName = $page.data?.category?.name ?? $page.data?.article?.category_name;

		if (currentCategorySlug) {
			sections.push({
				label: '',
				items: [
					{
						label: currentCategoryName || 'Overview',
						href: `/learn/category/${currentCategorySlug}`,
						icon: IconBookOpen
					}
				]
			});
		}

		if (currentUser) {
			sections[0].items.push({
				label: 'Create Article',
				href: '/learn/new',
				icon: IconPlus,
				tone: 'secondary'
			});
		}

		if (currentArticleSlug) {
			const articleItems = [];

			if (canEditCurrentArticle) {
				articleItems.push({
					label: 'Edit Article',
					href: `/learn/${currentArticleSlug}/edit`,
					icon: IconSquarePen,
					tone: 'secondary'
				});
			}

			if ($page.data?.viewingRevision) {
				articleItems.push({
					label: `Revision ${$page.data.viewingRevision.revisionNumber}`,
					href: `/learn/${currentArticleSlug}?revision=${$page.data.viewingRevision.id}`,
					icon: IconHistory,
					tone: 'tertiary'
				});
			}
		}

		return sections;
	});
</script>

<SectionSecondaryNav title="Learn" sections={navSections} currentPath={pathname} layout="split" />

{@render children()}
