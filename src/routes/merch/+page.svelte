<script>
	import { onMount } from 'svelte';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconX from '@lucide/svelte/icons/x';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconExpand from '@lucide/svelte/icons/expand';
	import IconMinus from '@lucide/svelte/icons/minus';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconHeart from '@lucide/svelte/icons/heart';
	import { merchCart } from '#lib/merch/cart';
	import { optimizedImageUrl } from '#lib/media/optimized';

	let { data } = $props();
	let selectedVariantIdByProduct = $state({});
	let quantityByProduct = $state({});
	let addedProductId = $state(null);
	let cartBounce = $state(false);
	let lightboxOpen = $state(false);
	let lightboxProductName = $state('');
	let lightboxImages = $state([]);
	let lightboxIndex = $state(0);
	let mobileCartOpen = $state(false);

	onMount(() => {
		merchCart.load();
	});

	function formatCurrency(cents) {
		const amount = Number(cents || 0) / 100;
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
	}

	function summarizeOptions(optionValues = {}) {
		return Object.entries(optionValues)
			.map(([k, v]) => `${k}: ${v}`)
			.join(' · ');
	}

	/**
	 * Strip the product name prefix from a variant label so pills just show
	 * the size/colour: e.g. "Neon Ride Tee / XS" → "XS"
	 */
	function trimVariantLabel(variantName = '', productName = '') {
		const prefixSlash = productName + ' / ';
		const prefixDash = productName + ' - ';
		if (variantName.startsWith(prefixSlash)) return variantName.slice(prefixSlash.length);
		if (variantName.startsWith(prefixDash)) return variantName.slice(prefixDash.length);
		const lower = variantName.toLowerCase();
		const lowerSlash = productName.toLowerCase() + ' / ';
		const lowerDash = productName.toLowerCase() + ' - ';
		if (lower.startsWith(lowerSlash)) return variantName.slice(lowerSlash.length);
		if (lower.startsWith(lowerDash)) return variantName.slice(lowerDash.length);
		return variantName;
	}

	function selectedVariant(product) {
		const selectedId = selectedVariantIdByProduct[product.id];
		const variants = product?.variants ?? [];
		if (!variants.length) return null;
		return variants.find((variant) => variant.id === selectedId) || variants[0];
	}

	function selectedQuantity(productId) {
		return Number(quantityByProduct[productId] || 1);
	}

	function productImages(product) {
		const list = Array.isArray(product?.images) ? product.images : [];
		const images = list.length ? list : product?.image_url ? [product.image_url] : [];
		return images.map((image) => optimizedImageUrl(image, { width: 768, quality: 64 }));
	}

	function productFeaturedImage(product) {
		return productImages(product)[0] || '';
	}

	function openLightbox(product, startIndex = 0) {
		const images = productImages(product);
		if (!images.length) return;
		lightboxImages = images;
		lightboxProductName = product?.name || 'Product';
		lightboxIndex = Math.max(0, Math.min(startIndex, images.length - 1));
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
		lightboxImages = [];
		lightboxIndex = 0;
		lightboxProductName = '';
	}

	function prevLightbox() {
		if (!lightboxImages.length) return;
		lightboxIndex = lightboxIndex <= 0 ? lightboxImages.length - 1 : lightboxIndex - 1;
	}

	function nextLightbox() {
		if (!lightboxImages.length) return;
		lightboxIndex = lightboxIndex >= lightboxImages.length - 1 ? 0 : lightboxIndex + 1;
	}

	function onWindowKeydown(event) {
		if (!lightboxOpen) return;
		if (event.key === 'Escape') closeLightbox();
		if (event.key === 'ArrowLeft') prevLightbox();
		if (event.key === 'ArrowRight') nextLightbox();
	}

	function addToCart(product) {
		const variant = selectedVariant(product);
		if (!variant) return;
		const qty = Math.max(1, Math.min(20, selectedQuantity(product.id)));
		merchCart.add({
			variantId: variant.id,
			productName: product.name,
			productImageUrl: productFeaturedImage(product),
			variantName: variant.name,
			optionValues: variant.option_values || {},
			partnerProvider: variant.partner_provider || 'manual',
			priceCents: variant.price_cents,
			quantity: qty
		});
		addedProductId = product.id;
		cartBounce = true;
		setTimeout(() => {
			addedProductId = null;
		}, 1800);
		setTimeout(() => {
			cartBounce = false;
		}, 500);
	}

	function removeCartLine(variantId) {
		merchCart.remove(variantId);
	}

	function incrementQty(productId) {
		const current = selectedQuantity(productId);
		if (current < 20) {
			quantityByProduct = { ...quantityByProduct, [productId]: current + 1 };
		}
	}

	function decrementQty(productId) {
		const current = selectedQuantity(productId);
		if (current > 1) {
			quantityByProduct = { ...quantityByProduct, [productId]: current - 1 };
		}
	}

	const cartLineCount = $derived(
		($merchCart ?? []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)
	);
	const cartTotalCents = $derived(
		($merchCart ?? []).reduce(
			(sum, line) => sum + Number(line.priceCents || 0) * Number(line.quantity || 0),
			0
		)
	);
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<title>Merch Store • 3 Feet Please</title>
	<meta
		name="description"
		content="Rep the movement. Every piece of 3FP gear is a rolling billboard for safer streets. Shop apparel and accessories that fund real advocacy."
	/>
</svelte:head>

<div class="text-surface-50 flex flex-col overflow-hidden pb-20 lg:pb-0">
	<!-- ═══ HERO ══════════════════════════════════════════════════ -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
		aria-labelledby="merch-hero-heading"
	>
		<!-- Left: copy -->
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<div class="flex flex-col gap-3">
				<p
					class="text-primary-500 m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<span class="bg-tertiary-500 h-2.5 w-2.5 shrink-0" aria-hidden="true"></span>
					<IconBike class="h-4 w-4 shrink-0" />
					<span>100% funds street safety advocacy</span>
				</p>

				<h1
					id="merch-hero-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Wear the <span class="text-primary-500">mission.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-xl text-base leading-snug font-medium text-balance">
					Every piece of 3FP gear is a rolling billboard for safer streets.
					<strong class="text-surface-50 font-black uppercase italic"
						>Look sharp. Ride loud. Fund the fight.</strong
					>
				</p>
			</div>

			<div class="border-surface-800 flex flex-col gap-5 border-t pt-5">
				<div class="flex flex-wrap gap-3">
					<a
						href="#merch-catalog"
						class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<span>Shop the Drop</span>
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</a>
					{#if data.isAdmin}
						<a
							href="/merch/manage"
							class="border-surface-600 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex items-center justify-center gap-2 border-2 px-5 py-2.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						>
							Manage Store
						</a>
					{/if}
				</div>

				<!-- Trust stat strip -->
				<div class="flex flex-wrap gap-6" aria-label="Store highlights">
					<div
						class="text-surface-300 flex items-center gap-2 text-xs font-black tracking-[0.14em] uppercase"
					>
						<IconHeart class="text-tertiary-500 h-4 w-4 shrink-0" />
						<span>Community-backed</span>
					</div>
					<div
						class="text-surface-300 flex items-center gap-2 text-xs font-black tracking-[0.14em] uppercase"
					>
						<IconShieldCheck class="text-secondary-400 h-4 w-4 shrink-0" />
						<span>Secure checkout</span>
					</div>
					<div
						class="text-surface-300 flex items-center gap-2 text-xs font-black tracking-[0.14em] uppercase"
					>
						<IconSparkles class="text-primary-500 h-4 w-4 shrink-0" />
						<span>Real local impact</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Right: featured product showcase -->
		<div
			class="bg-surface-900 border-surface-800 relative flex min-h-[16rem] flex-col justify-between border-t-2 lg:border-t-0 lg:border-l-2"
		>
			<div class="bg-tertiary-500 absolute inset-y-0 left-0 z-10 w-2" aria-hidden="true"></div>

			{#if data.products?.length > 0}
				{@const featured = data.products[0]}
				<div class="flex flex-1 flex-col justify-between pl-2">
					{#if productFeaturedImage(featured)}
						<button
							type="button"
							class="group bg-surface-900 relative flex min-h-[13rem] w-full flex-1 cursor-pointer items-center justify-center overflow-hidden p-6 text-left"
							onclick={() => openLightbox(featured, 0)}
							aria-label={`View ${featured.name}`}
						>
							<span
								class="bg-secondary-500 text-surface-50 absolute top-0 left-0 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] font-black tracking-[0.2em] uppercase"
							>
								<IconSparkles class="text-primary-500 h-3 w-3" />
								Featured Drop
							</span>
							<img
								src={productFeaturedImage(featured)}
								alt={featured.name}
								class="max-h-48 w-full object-contain transition duration-300 group-hover:scale-105"
								width="768"
								height="768"
								loading="eager"
								fetchpriority="high"
								decoding="async"
							/>
							<span
								class="bg-surface-950 text-primary-500 border-surface-700 absolute right-0 bottom-0 inline-flex items-center gap-1.5 border-t border-l px-2.5 py-1 text-[0.65rem] font-black tracking-[0.18em] uppercase"
							>
								<IconExpand class="h-3 w-3" />
								View
							</span>
						</button>
					{/if}

					<div
						class="bg-surface-950 text-surface-50 border-surface-800 flex flex-wrap items-center justify-between gap-4 border-t-2 px-5 py-3.5"
					>
						<div class="min-w-0">
							<span
								class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.22em] uppercase"
							>
								Now available
							</span>
							<h3 class="text-surface-50! m-0 truncate text-base font-black uppercase sm:text-lg">
								{featured.name}
							</h3>
							<p class="text-primary-500 m-0 text-lg font-black italic tabular-nums">
								{featured.variants?.[0] ? formatCurrency(featured.variants[0].price_cents) : ''}
							</p>
						</div>
						<a
							href="#merch-catalog"
							class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
						>
							<span>Shop Drop</span>
							<IconArrowRight class="h-3.5 w-3.5 transition group-hover:translate-x-1" />
						</a>
					</div>
				</div>
			{:else}
				<div class="flex flex-1 flex-col justify-between gap-4 py-8 pr-6 pl-8">
					<span
						class="bg-secondary-500 text-surface-50 self-start px-3 py-1.5 text-xs font-black tracking-[0.2em] uppercase"
					>
						Official Gear
					</span>
					<p
						class="text-primary-500 m-0 text-5xl leading-[0.8] font-black tracking-[-0.06em] uppercase italic sm:text-6xl"
						aria-hidden="true"
					>
						3FT
					</p>
					<p class="text-surface-300 m-0 max-w-sm text-sm leading-relaxed">
						High-visibility advocacy apparel and street-ready gear built for every ride.
					</p>
				</div>
			{/if}
		</div>
	</section>

	<!-- ═══ CATALOG + SIDEBAR ════════════════════════════════════ -->
	<section
		id="merch-catalog"
		class="bg-surface-950 grid lg:grid-cols-[minmax(0,1fr)_24rem]"
		aria-labelledby="catalog-heading"
	>
		<!-- Product grid column -->
		<div
			class="border-surface-800 flex min-w-0 flex-col gap-6 px-6 py-10 sm:px-10 lg:border-r-2 lg:px-12 lg:py-12"
		>
			<div class="flex flex-wrap items-end justify-between gap-4">
				<div class="flex flex-col gap-2">
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Official 3FP Gear
					</p>
					<h2
						id="catalog-heading"
						class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						The Drop.
					</h2>
				</div>
				<p class="text-surface-300 m-0 text-xs font-bold tracking-[0.2em] uppercase">
					{data.products?.length ?? 0}
					{(data.products?.length ?? 0) === 1 ? 'Item' : 'Items'} Available
				</p>
			</div>

			<!-- Lane divider -->
			<div
				class="h-1 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_48px,transparent_48px_80px)]"
				aria-hidden="true"
			></div>

			{#if data.loadError}
				<div class="bg-tertiary-500 text-surface-950 p-6 font-bold">
					{data.loadError}
				</div>
			{:else if !(data.products?.length > 0)}
				<div class="border-surface-50 flex flex-col items-start gap-5 border-t-2 pt-8">
					<span class="bg-primary-500 text-surface-950 flex h-12 w-12 items-center justify-center">
						<IconSparkles class="h-6 w-6" />
					</span>
					<div class="flex flex-col gap-2">
						<p class="text-surface-50 m-0 text-2xl font-black uppercase italic">
							Fresh drops are loading…
						</p>
						<p class="text-surface-300 m-0 max-w-md text-base leading-relaxed">
							Check back soon to grab new gear and support safer streets in style.
						</p>
					</div>
					{#if data.isAdmin}
						<a
							href="/merch/manage"
							class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						>
							Open Merch Manager
						</a>
					{/if}
				</div>
			{:else}
				<div class="border-surface-800 grid border-t-[3px] border-l-[3px] sm:grid-cols-2">
					{#each data.products as product, productIndex (product.id)}
						{@const activeVariant = selectedVariant(product)}
						{@const optionSummary = summarizeOptions(activeVariant?.option_values)}
						<article
							class="border-surface-800 bg-surface-950 group flex flex-col justify-between border-r-[3px] border-b-[3px]"
						>
							<!-- Top index & price bar -->
							<div
								class="border-surface-800 flex items-center justify-between gap-3 border-b-2 px-5 py-3"
							>
								<span
									class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
								>
									{String(productIndex + 1).padStart(2, '0')}
								</span>
								<span
									class="bg-primary-500 text-surface-950 px-3 py-1 text-base font-black italic tabular-nums"
								>
									{formatCurrency(activeVariant?.price_cents || 0)}
								</span>
							</div>

							<!-- Image carousel -->
							<div class="bg-surface-900 border-surface-800 relative border-b-2">
								{#if productImages(product).length > 0}
									<div class="cinema-rail">
										{#each productImages(product) as image, index (`${product.id}-${image}`)}
											<button
												type="button"
												class="cinema-slide group/slide"
												onclick={() => openLightbox(product, index)}
												aria-label={`View ${product.name} image ${index + 1}`}
											>
												<img
													src={image}
													alt={`${product.name} image ${index + 1}`}
													class="h-full w-full object-contain p-6 transition duration-300 group-hover/slide:scale-105"
													width="768"
													height="768"
													loading={index === 0 ? 'eager' : 'lazy'}
													decoding="async"
												/>
												<span
													class="bg-surface-950 text-surface-50 border-surface-700 absolute right-0 bottom-0 inline-flex items-center gap-1.5 border-t-2 border-l-2 px-3 py-1.5 text-[0.65rem] font-black tracking-[0.18em] uppercase"
												>
													<IconExpand class="h-3 w-3" />
													Tap to expand
												</span>
											</button>
										{/each}
									</div>
								{:else}
									<div class="flex aspect-square w-full items-center justify-center">
										<IconSparkles class="text-surface-300 h-8 w-8" />
									</div>
								{/if}

								{#if productImages(product).length > 1}
									<div class="absolute bottom-2 left-3 flex gap-1.5" aria-hidden="true">
										{#each productImages(product) as _, i}
											<span class="h-1.5 w-4 {i === 0 ? 'bg-primary-500' : 'bg-surface-700'}"
											></span>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Product details & controls -->
							<div class="flex flex-1 flex-col justify-between gap-5 p-6">
								<div class="flex flex-col gap-2">
									<h3 class="text-surface-50! m-0 text-2xl leading-tight font-black uppercase">
										{product.name}
									</h3>
									{#if product.description}
										<p class="text-surface-300 m-0 line-clamp-3 text-sm leading-relaxed">
											{product.description}
										</p>
									{/if}
									{#if optionSummary}
										<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.14em] uppercase">
											{optionSummary}
										</p>
									{/if}
								</div>

								<div class="flex flex-col gap-4">
									<!-- Variant selector -->
									{#if (product.variants?.length ?? 0) > 1}
										<div class="flex flex-col gap-2">
											<p class="text-surface-300 m-0 text-xs font-bold tracking-[0.22em] uppercase">
												Size / Variation
											</p>
											<div class="flex flex-wrap gap-1.5">
												{#each product.variants as variant (variant.id)}
													{@const isSelected = activeVariant?.id === variant.id}
													<button
														type="button"
														class="cursor-pointer border-2 px-3 py-1.5 text-xs font-black tracking-wide uppercase transition {isSelected
															? 'border-primary-500 bg-primary-500 text-surface-950'
															: 'border-surface-700 bg-surface-950 text-surface-50 hover:border-primary-500 hover:text-primary-500'}"
														onclick={() => {
															selectedVariantIdByProduct = {
																...selectedVariantIdByProduct,
																[product.id]: variant.id
															};
														}}
													>
														{trimVariantLabel(variant.name, product.name)}
													</button>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Qty + CTA -->
									<div class="flex items-stretch gap-3 pt-1">
										<div class="border-surface-50 bg-surface-950 flex items-center border-2">
											<button
												type="button"
												class="text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex h-12 w-10 cursor-pointer items-center justify-center transition"
												onclick={() => decrementQty(product.id)}
												aria-label="Decrease quantity"
											>
												<IconMinus class="h-3.5 w-3.5" />
											</button>
											<span class="w-9 text-center text-sm font-black tabular-nums">
												{selectedQuantity(product.id)}
											</span>
											<button
												type="button"
												class="text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex h-12 w-10 cursor-pointer items-center justify-center transition"
												onclick={() => incrementQty(product.id)}
												aria-label="Increase quantity"
											>
												<IconPlus class="h-3.5 w-3.5" />
											</button>
										</div>

										<button
											type="button"
											class="flex flex-1 cursor-pointer items-center justify-center gap-2 px-5 py-3 text-sm font-black tracking-wide uppercase transition {addedProductId ===
											product.id
												? 'bg-secondary-500 text-surface-50'
												: 'bg-primary-500 text-surface-950 hover:bg-tertiary-500'}"
											onclick={() => addToCart(product)}
										>
											{#if addedProductId === product.id}
												<IconShieldCheck class="h-4 w-4 shrink-0" />
												<span>Added!</span>
											{:else}
												<IconPlus class="h-4 w-4 shrink-0" />
												<span>Add to Cart</span>
											{/if}
										</button>
									</div>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<!-- ═══ SIDEBAR (desktop) ════════════════════════════════ -->
		<aside class="bg-surface-950 hidden lg:block" aria-label="Shopping cart and impact">
			<div class="sticky top-16 flex flex-col">
				<!-- Cart Block -->
				<section
					class="bg-surface-900 text-surface-50 border-surface-800 border-t-secondary-500 flex flex-col gap-5 border-t-4 border-b-2 p-7"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<span
								class="bg-primary-500 text-surface-950 flex h-9 w-9 items-center justify-center {cartBounce
									? 'scale-110'
									: ''} transition"
							>
								<IconShoppingBag class="h-4 w-4" />
							</span>
							<h2 class="text-surface-50! m-0 text-xl font-black uppercase italic">Cart</h2>
						</div>
						<span
							class="bg-primary-500 text-surface-950 px-2.5 py-0.5 text-xs font-black tabular-nums"
						>
							{cartLineCount}
						</span>
					</div>

					{#if ($merchCart ?? []).length === 0}
						<div class="border-surface-800 flex flex-col gap-1.5 border-t-2 pt-5">
							<p class="m-0 text-sm font-black uppercase">Your cart is empty.</p>
							<p class="text-surface-300 m-0 text-xs">Browse the drops on the left to gear up.</p>
						</div>
					{:else}
						<ul class="border-surface-800 m-0 list-none border-t-2 p-0">
							{#each $merchCart as line (line.variantId)}
								<li class="border-surface-800 border-b py-3.5">
									<div class="flex items-start gap-3">
										{#if line.productImageUrl}
											<img
												src={line.productImageUrl}
												alt={line.productName}
												class="bg-surface-950 border-surface-700 h-14 w-14 shrink-0 border object-contain p-1"
											/>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="m-0 truncate text-sm leading-tight font-black uppercase">
												{line.productName}
											</p>
											<p class="text-surface-400 m-0 mt-0.5 truncate text-xs">{line.variantName}</p>
											<p class="text-primary-500 m-0 mt-1 text-xs font-black tabular-nums">
												{line.quantity} × {formatCurrency(line.priceCents)}
											</p>
										</div>
										<button
											type="button"
											class="border-surface-700 text-surface-300 hover:border-primary-500 hover:text-primary-500 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center border-2 transition"
											onclick={() => removeCartLine(line.variantId)}
											aria-label="Remove item"
										>
											<IconX class="h-3.5 w-3.5" />
										</button>
									</div>
								</li>
							{/each}
						</ul>

						<div class="border-surface-800 flex flex-col gap-4 border-t-2 pt-4">
							<div class="flex items-baseline justify-between">
								<span class="text-surface-300 text-xs font-bold tracking-[0.2em] uppercase">
									Subtotal
								</span>
								<strong class="text-primary-500 text-xl font-black italic tabular-nums">
									{formatCurrency(cartTotalCents)}
								</strong>
							</div>
							{#if data.canCheckout}
								<a
									href="/merch/checkout"
									class="group bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-xs font-black tracking-wide uppercase transition hover:no-underline"
								>
									<span>Proceed to Checkout</span>
									<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
								</a>
							{:else}
								<div
									class="bg-surface-950 text-primary-500 border-surface-800 border p-3.5 text-xs font-bold"
								>
									Checkout will be available once Stripe is connected.
								</div>
							{/if}
						</div>
					{/if}
				</section>

				<!-- Mission impact block -->
				<section
					class="bg-surface-900 text-surface-50 border-t-tertiary-500 flex flex-col gap-5 border-t-4 p-7"
				>
					<p class="text-tertiary-500 m-0 text-xs font-black tracking-[0.22em] uppercase">
						Every order counts
					</p>
					<div class="flex flex-col gap-4">
						<div class="flex items-start gap-3.5">
							<span
								class="bg-surface-950 text-primary-500 border-surface-700 flex h-9 w-9 shrink-0 items-center justify-center border"
							>
								<IconBike class="h-4 w-4" />
							</span>
							<div>
								<p class="m-0 text-sm font-black uppercase">Wear the Mission</p>
								<p class="text-surface-300 m-0 mt-0.5 text-xs leading-snug font-medium">
									This gear shows up loud for safer streets and a stronger bike culture — everywhere
									you ride.
								</p>
							</div>
						</div>
						<div class="flex items-start gap-3.5">
							<span
								class="bg-surface-950 text-primary-500 border-surface-700 flex h-9 w-9 shrink-0 items-center justify-center border"
							>
								<IconShieldCheck class="h-4 w-4" />
							</span>
							<div>
								<p class="m-0 text-sm font-black uppercase">Feel Good Checkout</p>
								<p class="text-surface-300 m-0 mt-0.5 text-xs leading-snug font-medium">
									Every purchase directly backs real, local advocacy. No middlemen. No fluff.
								</p>
							</div>
						</div>
					</div>
					{#if data.isAdmin}
						<a
							href="/merch/manage"
							class="border-surface-700 text-surface-200 hover:border-primary-500 hover:text-primary-500 inline-flex w-full items-center justify-center border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
						>
							Manage Merch Store
						</a>
					{/if}
				</section>
			</div>
		</aside>
	</section>
</div>

<!-- ═══ MOBILE STICKY CART BAR ══════════════════════════════════ -->
<div
	class="bg-secondary-500 text-surface-50 border-primary-500 fixed right-0 bottom-0 left-0 z-50 border-t-[3px] lg:hidden"
>
	{#if !mobileCartOpen}
		<div class="flex items-center justify-between gap-3 px-4 py-3">
			<button
				type="button"
				class="text-surface-50 flex flex-1 cursor-pointer items-center gap-3 text-left"
				onclick={() => (mobileCartOpen = true)}
			>
				<span
					class="bg-primary-500 text-surface-950 relative flex h-9 w-9 items-center justify-center"
				>
					<IconShoppingBag class="h-4 w-4" />
					{#if cartLineCount > 0}
						<span
							class="bg-tertiary-500 text-surface-950 absolute -top-1.5 -right-1.5 px-1.5 text-[0.65rem] font-black"
						>
							{cartLineCount}
						</span>
					{/if}
				</span>
				<span class="text-xs font-black tracking-wide uppercase">
					{cartLineCount === 0
						? 'Your cart is empty'
						: `${cartLineCount} item${cartLineCount > 1 ? 's' : ''} · ${formatCurrency(cartTotalCents)}`}
				</span>
			</button>
			{#if cartLineCount > 0}
				{#if data.canCheckout}
					<a
						href="/merch/checkout"
						class="bg-primary-500 text-surface-950 inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-black tracking-wide uppercase hover:no-underline"
					>
						<span>Checkout</span>
						<IconArrowRight class="h-3.5 w-3.5" />
					</a>
				{:else}
					<span class="text-xs font-bold uppercase opacity-75">Stripe pending</span>
				{/if}
			{/if}
		</div>
	{:else}
		<div class="flex max-h-[80vh] flex-col">
			<div class="border-surface-950 flex items-center justify-between border-b-2 px-5 py-4">
				<div class="flex items-center gap-2">
					<IconShoppingBag class="text-primary-500 h-4 w-4" />
					<h3 class="text-surface-50! m-0 text-sm font-black tracking-[0.18em] uppercase">
						Cart — {cartLineCount} items
					</h3>
				</div>
				<button
					type="button"
					class="border-surface-50 text-surface-50 hover:bg-surface-950 flex h-8 w-8 cursor-pointer items-center justify-center border-2"
					onclick={() => (mobileCartOpen = false)}
					aria-label="Close cart"
				>
					<IconX class="h-4 w-4" />
				</button>
			</div>

			<div class="max-h-72 overflow-y-auto px-5 py-2">
				{#if ($merchCart ?? []).length === 0}
					<p class="py-4 text-center text-sm font-bold uppercase">Your cart is empty.</p>
				{:else}
					{#each $merchCart as line (line.variantId)}
						<div class="border-secondary-300/40 flex items-start gap-3 border-b py-3">
							{#if line.productImageUrl}
								<img
									src={line.productImageUrl}
									alt={line.productName}
									class="bg-surface-50 h-12 w-12 shrink-0 object-contain p-1"
								/>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="m-0 truncate text-sm font-black uppercase">{line.productName}</p>
								<p class="m-0 text-xs opacity-85">{line.variantName}</p>
								<p class="text-primary-500 m-0 text-xs font-black">
									{line.quantity} × {formatCurrency(line.priceCents)}
								</p>
							</div>
							<button
								type="button"
								class="border-surface-50 text-surface-50 flex h-7 w-7 cursor-pointer items-center justify-center border-2"
								onclick={() => removeCartLine(line.variantId)}
								aria-label="Remove"
							>
								<IconX class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				{/if}
			</div>

			{#if ($merchCart ?? []).length > 0}
				<div class="border-surface-950 flex flex-col gap-3 border-t-2 p-5">
					<div class="flex items-baseline justify-between">
						<span class="text-xs font-bold tracking-[0.18em] uppercase">Subtotal</span>
						<strong class="text-primary-500 text-xl font-black italic">
							{formatCurrency(cartTotalCents)}
						</strong>
					</div>
					{#if data.canCheckout}
						<a
							href="/merch/checkout"
							class="bg-primary-500 text-surface-950 inline-flex w-full items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-wide uppercase hover:no-underline"
						>
							<span>Proceed to Checkout</span>
							<IconArrowRight class="h-4 w-4" />
						</a>
					{:else}
						<div class="bg-surface-950 text-primary-500 p-3 text-xs font-bold">
							Checkout will be available once Stripe is connected.
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- ═══ LIGHTBOX ════════════════════════════════════════════════ -->
{#if lightboxOpen}
	<div
		class="bg-surface-950/95 fixed inset-0 z-80 grid place-items-center p-4"
		role="button"
		aria-label="Close gallery overlay"
		tabindex="0"
		onclick={closeLightbox}
		onkeydown={(event) => event.key === 'Escape' && closeLightbox()}
	>
		<div
			class="bg-surface-950 border-primary-500 grid max-h-[94vh] w-full max-w-4xl gap-4 border-[3px] p-5"
			role="dialog"
			aria-modal="true"
			aria-label={lightboxProductName}
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<div class="border-surface-800 flex items-center justify-between gap-4 border-b-2 pb-3">
				<div>
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Merch Gallery
					</p>
					<h3 class="text-surface-50! m-0 text-xl font-black uppercase">{lightboxProductName}</h3>
				</div>
				<button
					type="button"
					class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex h-10 w-10 cursor-pointer items-center justify-center border-2 transition"
					onclick={closeLightbox}
					aria-label="Close gallery"
				>
					<IconX class="h-5 w-5" />
				</button>
			</div>

			<div class="bg-surface-900 relative aspect-square max-h-[65vh] w-full overflow-hidden">
				{#if lightboxImages.length > 0}
					<img
						src={lightboxImages[lightboxIndex]}
						alt={`${lightboxProductName} image ${lightboxIndex + 1}`}
						class="h-full w-full object-contain p-4"
					/>
				{/if}
				{#if lightboxImages.length > 1}
					<button
						type="button"
						class="bg-surface-950 text-primary-500 border-primary-500 hover:bg-primary-500 hover:text-surface-950 absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center border-2 transition"
						onclick={prevLightbox}
						aria-label="Previous image"
					>
						<IconChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						class="bg-surface-950 text-primary-500 border-primary-500 hover:bg-primary-500 hover:text-surface-950 absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center border-2 transition"
						onclick={nextLightbox}
						aria-label="Next image"
					>
						<IconChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>

			{#if lightboxImages.length > 1}
				<div class="flex gap-2 overflow-x-auto pb-1">
					{#each lightboxImages as image, index (`${image}-${index}`)}
						<button
							type="button"
							class="bg-surface-900 h-16 w-16 shrink-0 cursor-pointer border-2 p-1 transition {index ===
							lightboxIndex
								? 'border-primary-500 opacity-100'
								: 'border-surface-700 opacity-60 hover:opacity-100'}"
							onclick={() => (lightboxIndex = index)}
							aria-label={`View image ${index + 1}`}
						>
							<img
								src={image}
								alt={`${lightboxProductName} thumbnail ${index + 1}`}
								class="h-full w-full object-contain"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.cinema-rail {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 100%;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}
	.cinema-rail::-webkit-scrollbar {
		display: none;
	}
	.cinema-slide {
		position: relative;
		aspect-ratio: 1 / 1;
		scroll-snap-align: start;
		overflow: hidden;
		cursor: pointer;
	}
</style>
