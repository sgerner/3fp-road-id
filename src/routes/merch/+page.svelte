<script>
	import { onMount } from 'svelte';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
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
	import { merchCart } from '$lib/merch/cart';

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
		// Try stripping "<ProductName> / " or "<ProductName> - " prefix
		const prefixSlash = productName + ' / ';
		const prefixDash = productName + ' - ';
		if (variantName.startsWith(prefixSlash)) return variantName.slice(prefixSlash.length);
		if (variantName.startsWith(prefixDash)) return variantName.slice(prefixDash.length);
		// Also handle lowercase variants
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
		if (list.length) return list;
		return product?.image_url ? [product.image_url] : [];
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
		setTimeout(() => { addedProductId = null; }, 1800);
		setTimeout(() => { cartBounce = false; }, 500);
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
	<meta name="description" content="Rep the movement. Every piece of 3FP gear is a rolling billboard for safer streets. Shop apparel and accessories that fund real advocacy." />
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 pb-24 lg:pb-12">

	<!-- ═══ HERO ══════════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div class="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:p-12 lg:gap-12">

			<!-- Left: copy -->
			<div class="flex flex-col gap-6 justify-center">
				<!-- Impact badge -->
				<div class="flex flex-wrap items-center gap-2">
					<span class="impact-badge">
						<IconBike class="h-3.5 w-3.5" />
						100% funds street safety advocacy
					</span>
				</div>

				<div class="space-y-4">
					<h1 class="merch-headline text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
						Wear the<br />
						<span class="merch-headline-accent">mission.</span>
					</h1>
					<p class="hero-subhead max-w-lg text-base sm:text-lg leading-relaxed">
						Every piece of 3FP gear is a rolling billboard for safer streets.
						<strong class="text-primary-300 font-semibold">Look sharp. Ride loud. Fund the fight.</strong>
					</p>
				</div>

				<div class="flex flex-wrap gap-3">
					<a href="#merch-catalog" class="btn preset-filled-primary-500 gap-2 font-semibold shadow-lg shadow-primary-500/20">
						Shop the Drop
						<IconArrowRight class="h-4 w-4" />
					</a>
					{#if data.isAdmin}
						<a href="/merch/manage" class="btn preset-tonal-surface gap-2 font-medium">
							Manage Store
						</a>
					{/if}
				</div>

				<!-- Trust stat row -->
				<div class="flex flex-wrap gap-4 pt-2">
					<div class="stat-pill">
						<IconHeart class="h-3.5 w-3.5 text-tertiary-400" />
						Community-backed
					</div>
					<div class="stat-pill">
						<IconShieldCheck class="h-3.5 w-3.5 text-success-500" />
						Secure checkout
					</div>
					<div class="stat-pill">
						<IconSparkles class="h-3.5 w-3.5 text-warning-400" />
						Real local impact
					</div>
				</div>
			</div>

			<!-- Right: featured product card -->
			<div class="flex items-center justify-center lg:justify-end">
				{#if data.products?.length > 0}
					{@const featured = data.products[0]}
					<div class="featured-card w-full max-w-sm">
						<div class="featured-card-label">
							<IconSparkles class="h-3.5 w-3.5 text-warning-400" />
							Featured Drop
						</div>

						{#if productFeaturedImage(featured)}
							<button
								type="button"
								class="featured-card-img-wrap"
								onclick={() => openLightbox(featured, 0)}
								aria-label={`View ${featured.name}`}
							>
								<img
									src={productFeaturedImage(featured)}
									alt={featured.name}
									class="h-full w-full object-contain transition duration-500 hover:scale-[1.04]"
								/>
								<div class="cinema-overlay">
									<IconExpand class="h-3.5 w-3.5" />
									View
								</div>
							</button>
						{/if}

						<div class="mt-4 flex items-end justify-between gap-3">
							<div>
								<h3 class="text-lg font-bold leading-tight">{featured.name}</h3>
								<p class="mt-0.5 text-2xl font-extrabold text-primary-400">
									{featured.variants?.[0] ? formatCurrency(featured.variants[0].price_cents) : ''}
								</p>
							</div>
							<a href="#merch-catalog" class="btn btn-sm preset-filled-primary-500 gap-1.5 shrink-0">
								Shop This Drop
								<IconArrowRight class="h-3.5 w-3.5" />
							</a>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<!-- ═══ CATALOG + SIDEBAR ════════════════════════════════════ -->
	<div id="merch-catalog" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">

		<!-- Product grid -->
		<div class="space-y-4">
			{#if data.loadError}
				<section class="rounded-2xl border border-error-500/30 bg-error-500/10 p-4 text-sm">
					{data.loadError}
				</section>
			{:else if !(data.products?.length > 0)}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
					<div class="mb-3 flex justify-center opacity-40">
						<IconSparkles class="h-10 w-10" />
					</div>
					<p class="text-lg font-semibold">Fresh drops are loading…</p>
					<p class="mt-2 text-sm opacity-70">
						Check back soon to grab new gear and support safer streets in style.
					</p>
					{#if data.isAdmin}
						<a href="/merch/manage" class="btn preset-filled-primary-500 mt-5">Open Merch Manager</a>
					{/if}
				</section>
			{:else}
				<div class="grid gap-5 sm:grid-cols-2">
					{#each data.products as product (product.id)}
						<article class="merch-card group relative overflow-hidden rounded-2xl p-4 flex flex-col gap-4">

							<!-- Image carousel -->
							<div class="cinema-wrap">
								{#if productImages(product).length > 0}
									<div class="cinema-rail">
										{#each productImages(product) as image, index (`${product.id}-${image}`)}
											<button
												type="button"
												class="cinema-slide"
												onclick={() => openLightbox(product, index)}
												aria-label={`View ${product.name} image ${index + 1}`}
											>
												<img
													src={image}
													alt={`${product.name} image ${index + 1}`}
													class="h-full w-full object-contain transition duration-500 group-hover:scale-[1.02]"
												/>
												<div class="cinema-overlay">
													<IconExpand class="h-3.5 w-3.5" />
													Tap to expand
												</div>
											</button>
										{/each}
									</div>
								{:else}
									<div class="cinema-fallback">
										<IconSparkles class="h-6 w-6 opacity-40" />
									</div>
								{/if}

								{#if productImages(product).length > 1}
									<div class="cinema-dots" aria-hidden="true">
										{#each productImages(product) as _, i}
											<span class="cinema-dot {i === 0 ? 'active' : ''}"></span>
										{/each}
									</div>
								{/if}
							</div>

							<!-- Info -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2">
									<h2 class="text-lg font-bold leading-snug">{product.name}</h2>
									<span class="product-price shrink-0">
										{formatCurrency(selectedVariant(product)?.price_cents || 0)}
									</span>
								</div>
								{#if product.description}
									<p class="mt-1 text-sm leading-relaxed opacity-65 line-clamp-2">{product.description}</p>
								{/if}
							</div>

							<!-- Variant selector: pill buttons -->
							{#if (product.variants?.length ?? 0) > 1}
								<div>
									<p class="mb-1.5 text-xs font-semibold uppercase tracking-wider opacity-60">Size / Variation</p>
									<div class="variant-pill-row">
										{#each product.variants as variant (variant.id)}
											<button
												type="button"
												class="variant-pill {(selectedVariant(product)?.id === variant.id) ? 'selected' : ''}"
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
							<div class="flex items-center gap-3 mt-auto">
								<!-- Stepper -->
								<div class="qty-stepper">
									<button
										type="button"
										class="qty-btn"
										onclick={() => decrementQty(product.id)}
										aria-label="Decrease quantity"
									>
										<IconMinus class="h-3 w-3" />
									</button>
									<span class="qty-display">{selectedQuantity(product.id)}</span>
									<button
										type="button"
										class="qty-btn"
										onclick={() => incrementQty(product.id)}
										aria-label="Increase quantity"
									>
										<IconPlus class="h-3 w-3" />
									</button>
								</div>

								<!-- Add to cart -->
								<button
									type="button"
									class="add-btn flex-1 {addedProductId === product.id ? 'added' : ''}"
									onclick={() => addToCart(product)}
								>
									{#if addedProductId === product.id}
										<IconShieldCheck class="h-4 w-4" />
										Added!
									{:else}
										<IconPlus class="h-4 w-4" />
										Add to Cart
									{/if}
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<!-- ═══ SIDEBAR (desktop) ════════════════════════════════ -->
		<aside class="hidden lg:block space-y-4">
			<section class="cart-panel sticky top-20 rounded-2xl p-5">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<div class="cart-icon-wrap {cartBounce ? 'bounce' : ''}">
							<IconShoppingBag class="h-4 w-4" />
						</div>
						<h2 class="text-sm font-bold uppercase tracking-wider">Cart</h2>
					</div>
					<span class="cart-count-badge">{cartLineCount}</span>
				</div>

				{#if ($merchCart ?? []).length === 0}
					<div class="py-6 text-center">
						<IconShoppingBag class="h-8 w-8 mx-auto mb-2 opacity-20" />
						<p class="text-sm opacity-60">Your cart is empty.</p>
						<p class="mt-1 text-xs opacity-40">Browse the drops above ↑</p>
					</div>
				{:else}
					<ul class="space-y-2">
						{#each $merchCart as line (line.variantId)}
							<li class="cart-line rounded-xl p-3">
								<div class="flex items-start gap-3">
									{#if line.productImageUrl}
										<img
											src={line.productImageUrl}
											alt={line.productName}
											class="h-11 w-11 rounded-lg object-contain bg-surface-950/60 shrink-0"
										/>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold leading-tight">{line.productName}</p>
										<p class="truncate text-xs opacity-60">{line.variantName}</p>
										<p class="mt-0.5 text-xs font-medium text-primary-400">
											{line.quantity} × {formatCurrency(line.priceCents)}
										</p>
									</div>
									<button
										type="button"
										class="remove-btn shrink-0"
										onclick={() => removeCartLine(line.variantId)}
										aria-label="Remove item"
									>
										<IconX class="h-3.5 w-3.5" />
									</button>
								</div>
							</li>
						{/each}
					</ul>

					<div class="mt-4 border-t border-white/10 pt-4 space-y-3">
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-65">Subtotal</span>
							<strong class="text-base font-bold text-primary-300">{formatCurrency(cartTotalCents)}</strong>
						</div>
						{#if data.canCheckout}
							<a href="/merch/checkout" class="btn preset-filled-primary-500 w-full gap-2 font-semibold">
								Proceed to Checkout
								<IconArrowRight class="h-4 w-4" />
							</a>
						{:else}
							<div class="rounded-xl border border-warning-500/30 bg-warning-500/10 px-3 py-2.5 text-xs leading-relaxed opacity-80">
								Checkout will be available once Stripe is connected.
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<!-- Mission impact card -->
			<section class="impact-card rounded-2xl p-5 space-y-4">
				<div class="flex items-start gap-3">
					<div class="impact-icon-wrap">
						<IconBike class="h-4 w-4" />
					</div>
					<div>
						<p class="font-semibold text-sm">Wear the Mission</p>
						<p class="mt-1 text-xs leading-relaxed opacity-70">
							This gear shows up loud for safer streets and a stronger bike culture — everywhere you ride.
						</p>
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="impact-icon-wrap">
						<IconShieldCheck class="h-4 w-4" />
					</div>
					<div>
						<p class="font-semibold text-sm">Feel Good Checkout</p>
						<p class="mt-1 text-xs leading-relaxed opacity-70">
							Every purchase directly backs real, local advocacy. No middlemen. No fluff.
						</p>
					</div>
				</div>
				{#if data.isAdmin}
					<a href="/merch/manage" class="btn preset-outlined-primary-500 w-full mt-1 text-sm">
						Manage Merch Store
					</a>
				{/if}
			</section>
		</aside>
	</div>
</div>

<!-- ═══ MOBILE STICKY CART BAR ══════════════════════════════════ -->
<div class="mobile-cart-bar lg:hidden" class:open={mobileCartOpen}>
	{#if !mobileCartOpen}
		<button
			type="button"
			class="mobile-cart-trigger"
			onclick={() => mobileCartOpen = true}
		>
			<div class="flex items-center gap-3">
				<div class="relative">
					<IconShoppingBag class="h-5 w-5" />
					{#if cartLineCount > 0}
						<span class="mobile-cart-badge">{cartLineCount}</span>
					{/if}
				</div>
				<span class="font-semibold text-sm">
					{cartLineCount === 0 ? 'Your cart is empty' : `${cartLineCount} item${cartLineCount > 1 ? 's' : ''} · ${formatCurrency(cartTotalCents)}`}
				</span>
			</div>
			{#if cartLineCount > 0}
				{#if data.canCheckout}
					<a
						href="/merch/checkout"
						class="btn btn-sm preset-filled-primary-500 gap-1.5 font-semibold"
						onclick={(e) => e.stopPropagation()}
					>
						Checkout
						<IconArrowRight class="h-3.5 w-3.5" />
					</a>
				{:else}
					<span class="text-xs opacity-50">Stripe pending</span>
				{/if}
			{/if}
		</button>
	{:else}
		<div class="mobile-cart-sheet">
			<div class="flex items-center justify-between p-4 border-b border-white/10">
				<div class="flex items-center gap-2">
					<IconShoppingBag class="h-4 w-4" />
					<h3 class="font-bold text-sm uppercase tracking-wide">Cart — {cartLineCount} items</h3>
				</div>
				<button
					type="button"
					class="btn btn-sm preset-tonal-surface"
					onclick={() => mobileCartOpen = false}
					aria-label="Close cart"
				>
					<IconX class="h-4 w-4" />
				</button>
			</div>

			<div class="overflow-y-auto max-h-72 p-4 space-y-2">
				{#if ($merchCart ?? []).length === 0}
					<p class="text-sm opacity-60 text-center py-4">Your cart is empty.</p>
				{:else}
					{#each $merchCart as line (line.variantId)}
						<div class="cart-line rounded-xl p-3">
							<div class="flex items-start gap-3">
								{#if line.productImageUrl}
									<img
										src={line.productImageUrl}
										alt={line.productName}
										class="h-10 w-10 rounded-lg object-contain bg-surface-950/60 shrink-0"
									/>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold">{line.productName}</p>
									<p class="text-xs opacity-60">{line.variantName}</p>
									<p class="text-xs font-medium text-primary-400">{line.quantity} × {formatCurrency(line.priceCents)}</p>
								</div>
								<button
									type="button"
									class="remove-btn"
									onclick={() => removeCartLine(line.variantId)}
									aria-label="Remove"
								>
									<IconX class="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			{#if ($merchCart ?? []).length > 0}
				<div class="p-4 border-t border-white/10 space-y-3">
					<div class="flex justify-between text-sm">
						<span class="opacity-65">Subtotal</span>
						<strong class="text-primary-300">{formatCurrency(cartTotalCents)}</strong>
					</div>
					{#if data.canCheckout}
						<a href="/merch/checkout" class="btn preset-filled-primary-500 w-full gap-2 font-semibold">
							Proceed to Checkout
							<IconArrowRight class="h-4 w-4" />
						</a>
					{:else}
						<div class="rounded-xl border border-warning-500/30 bg-warning-500/10 px-3 py-2.5 text-xs">
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
		class="lightbox-backdrop"
		role="button"
		aria-label="Close gallery overlay"
		tabindex="0"
		onclick={closeLightbox}
		onkeydown={(event) => event.key === 'Escape' && closeLightbox()}
	>
		<div
			class="lightbox-panel"
			role="dialog"
			aria-modal="true"
			aria-label={lightboxProductName}
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<div class="lightbox-header">
				<div>
					<p class="text-xs uppercase tracking-[0.2em] opacity-50">Merch Gallery</p>
					<h3 class="text-base font-bold">{lightboxProductName}</h3>
				</div>
				<button type="button" class="btn btn-sm preset-tonal-surface" onclick={closeLightbox} aria-label="Close gallery">
					<IconX class="h-4 w-4" />
				</button>
			</div>
			<div class="lightbox-stage">
				{#if lightboxImages.length > 0}
					<img src={lightboxImages[lightboxIndex]} alt={`${lightboxProductName} image ${lightboxIndex + 1}`} />
				{/if}
				{#if lightboxImages.length > 1}
					<button type="button" class="lightbox-nav lightbox-nav-left" onclick={prevLightbox} aria-label="Previous image">
						<IconChevronLeft class="h-5 w-5" />
					</button>
					<button type="button" class="lightbox-nav lightbox-nav-right" onclick={nextLightbox} aria-label="Next image">
						<IconChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>
			{#if lightboxImages.length > 1}
				<div class="lightbox-thumbs">
					{#each lightboxImages as image, index (`${image}-${index}`)}
						<button
							type="button"
							class={`lightbox-thumb ${index === lightboxIndex ? 'active' : ''}`}
							onclick={() => (lightboxIndex = index)}
							aria-label={`View image ${index + 1}`}
						>
							<img src={image} alt={`${lightboxProductName} thumbnail ${index + 1}`} />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── Hero ── */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-950) 90%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		min-height: 340px;
	}
						/* Impact badge */
	.impact-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-400) 40%, transparent);
		color: var(--color-primary-200);
	}

	/* Stat pills */
	.stat-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 500;
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		opacity: 0.85;
	}

	/* Headline */
	.merch-headline {
		color: var(--color-primary-50);
		text-align: left;
		line-height: 1.05;
	}
	.merch-headline-accent {
		background: linear-gradient(120deg, var(--color-primary-300), var(--color-secondary-300), var(--color-tertiary-300));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	.hero-subhead {
		color: color-mix(in oklab, var(--color-surface-50) 82%, transparent);
	}

	/* Featured card */
	.featured-card {
		background: linear-gradient(
			155deg,
			color-mix(in oklab, var(--color-surface-900) 88%, var(--color-primary-500) 12%),
			color-mix(in oklab, var(--color-surface-900) 85%, var(--color-secondary-500) 15%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 20%, transparent);
		border-radius: 1.25rem;
		padding: 1.25rem;
		box-shadow: 0 20px 60px rgba(0,0,0,0.4);
	}
	.featured-card-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		opacity: 0.65;
		margin-bottom: 0.75rem;
	}
	.featured-card-img-wrap {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 0.9rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		cursor: pointer;
	}

	/* Product cards */
	.merch-card {
		background: linear-gradient(
			130deg,
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-primary-500) 8%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		transition: transform 200ms ease, box-shadow 200ms ease;
	}
	.merch-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
	}

	/* Product price accent */
	.product-price {
		font-size: 1.15rem;
		font-weight: 800;
		color: var(--color-primary-300);
	}

	/* Variant pills */
	.variant-pill-row {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
		scrollbar-width: none;
		/* Support multi-line wrap only when pills fit — prefer single row */
		flex-wrap: wrap;
	}
	.variant-pill-row::-webkit-scrollbar { display: none; }
	.variant-pill {
		padding: 0.28rem 0.7rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
		color: color-mix(in oklab, var(--color-surface-50) 75%, transparent);
		transition: all 120ms ease;
		cursor: pointer;
		flex-shrink: 0;
	}
	.variant-pill:hover {
		border-color: color-mix(in oklab, var(--color-primary-400) 50%, transparent);
		color: var(--color-primary-100);
	}
	.variant-pill.selected {
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-400) 70%, transparent);
		color: var(--color-primary-100);
	}

	/* Quantity stepper */
	.qty-stepper {
		display: flex;
		align-items: center;
		gap: 0;
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 25%, transparent);
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in oklab, var(--color-surface-900) 60%, transparent);
	}
	.qty-btn {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
		transition: background 120ms ease;
	}
	.qty-btn:hover {
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
	}
	.qty-display {
		min-width: 2rem;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 700;
	}

	/* Add to cart button */
	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.5rem 1.1rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 200ms ease, color 200ms ease, transform 100ms ease;
		background: color-mix(in oklab, var(--color-primary-500) 90%, transparent);
		color: var(--color-primary-contrast-500);
		border: none;
	}
	.add-btn:hover:not(.added) {
		background: var(--color-primary-400);
		transform: translateY(-1px);
	}
	.add-btn.added {
		background: color-mix(in oklab, var(--color-success-500) 80%, transparent);
		color: var(--color-surface-950);
	}

	/* Image cinema wrapper */
	.cinema-wrap {
		position: relative;
		border-radius: 0.9rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		/* Slightly lighter bg so white-background product photos blend more naturally */
		background: color-mix(in oklab, var(--color-surface-800) 40%, var(--color-surface-950) 60%);
	}
	.cinema-rail {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 100%;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}
	.cinema-rail::-webkit-scrollbar { display: none; }
	.cinema-slide {
		position: relative;
		aspect-ratio: 1 / 1;
		scroll-snap-align: start;
		overflow: hidden;
	}
	.cinema-overlay {
		position: absolute;
		right: 0.6rem;
		bottom: 0.6rem;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.55rem;
		border-radius: 999px;
		font-size: 0.68rem;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 20%, transparent);
		opacity: 0;
		transition: opacity 150ms ease;
	}
	.cinema-slide:hover .cinema-overlay,
	.featured-card-img-wrap:hover .cinema-overlay {
		opacity: 1;
	}
	.cinema-dots {
		position: absolute;
		bottom: 0.55rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.3rem;
	}
	.cinema-dot {
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: color-mix(in oklab, var(--color-surface-50) 40%, transparent);
		transition: background 200ms ease;
	}
	.cinema-dot.active {
		background: var(--color-primary-400);
	}
	.cinema-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1 / 1;
	}

	/* Cart panel (desktop sidebar) */
	.cart-panel {
		background: linear-gradient(
			160deg,
			color-mix(in oklab, var(--color-surface-900) 93%, var(--color-tertiary-500) 7%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-primary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 22%, transparent);
	}
	.cart-icon-wrap {
		display: grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 0.4rem;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
	}
	.cart-icon-wrap.bounce {
		animation: cart-pop 0.35s ease;
	}
	@keyframes cart-pop {
		0%   { transform: scale(1); }
		40%  { transform: scale(1.3); }
		70%  { transform: scale(0.9); }
		100% { transform: scale(1); }
	}
	.cart-count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		background: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-400) 35%, transparent);
		padding: 0 0.35rem;
	}
	.cart-line {
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
	}
	.remove-btn {
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 0.3rem;
		opacity: 0.45;
		transition: opacity 120ms ease, background 120ms ease;
		cursor: pointer;
	}
	.remove-btn:hover {
		opacity: 1;
		background: color-mix(in oklab, var(--color-error-500) 20%, transparent);
	}

	/* Mission / impact card */
	.impact-card {
		background: linear-gradient(
			140deg,
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-500) 10%),
			color-mix(in oklab, var(--color-surface-950) 95%, var(--color-tertiary-500) 5%)
		);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
	}
	.impact-icon-wrap {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-secondary-400) 25%, transparent);
		flex-shrink: 0;
	}

	/* Mobile sticky cart bar */
	.mobile-cart-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background: linear-gradient(
			160deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-secondary-500) 8%)
		);
		border-top: 1px solid color-mix(in oklab, var(--color-surface-400) 22%, transparent);
		backdrop-filter: blur(12px);
	}
	.mobile-cart-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		padding: 0.85rem 1.25rem;
		text-align: left;
	}
	.mobile-cart-badge {
		position: absolute;
		top: -0.3rem;
		right: -0.3rem;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		font-size: 0.6rem;
		font-weight: 800;
		display: grid;
		place-items: center;
	}
	.mobile-cart-sheet {
		display: flex;
		flex-direction: column;
		max-height: 80vh;
	}

	/* Lightbox */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 9, 12, 0.88);
		backdrop-filter: blur(10px);
	}
	.lightbox-panel {
		width: min(100%, 64rem);
		max-height: 96vh;
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1.25rem;
		background: linear-gradient(
			160deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-secondary-500) 8%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 20%, transparent);
		box-shadow: 0 30px 80px rgba(0,0,0,0.6);
	}
	.lightbox-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.lightbox-stage {
		position: relative;
		border-radius: 0.9rem;
		overflow: hidden;
		aspect-ratio: 1 / 1;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}
	.lightbox-stage img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 28%, transparent);
		cursor: pointer;
		transition: background 120ms ease;
	}
	.lightbox-nav:hover {
		background: color-mix(in oklab, var(--color-primary-500) 20%, var(--color-surface-950) 80%);
	}
	.lightbox-nav-left { left: 0.75rem; }
	.lightbox-nav-right { right: 0.75rem; }
	.lightbox-thumbs {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(4.5rem, 6rem);
		gap: 0.45rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
		scrollbar-width: thin;
	}
	.lightbox-thumb {
		aspect-ratio: 1 / 1;
		border-radius: 0.6rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 18%, transparent);
		opacity: 0.6;
		cursor: pointer;
		transition: opacity 120ms ease, border-color 120ms ease;
	}
	.lightbox-thumb:hover { opacity: 0.9; }
	.lightbox-thumb.active {
		opacity: 1;
		border-color: color-mix(in oklab, var(--color-primary-500) 70%, transparent);
	}
	.lightbox-thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
