<script>
	import { onMount } from 'svelte';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconX from '@lucide/svelte/icons/x';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconExpand from '@lucide/svelte/icons/expand';
	import { merchCart } from '$lib/merch/cart';

	let { data } = $props();
	let selectedVariantIdByProduct = $state({});
	let quantityByProduct = $state({});
	let addMessage = $state('');
	let lightboxOpen = $state(false);
	let lightboxProductName = $state('');
	let lightboxImages = $state([]);
	let lightboxIndex = $state(0);

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
		addMessage = `${qty} × ${product.name} added to cart`;
		setTimeout(() => {
			if (addMessage.startsWith(`${qty} × ${product.name}`)) addMessage = '';
		}, 2200);
	}

	function removeCartLine(variantId) {
		merchCart.remove(variantId);
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
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 pb-12">
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:p-10"
		>
			<!-- Left: headline + chips + stats -->
			<div class="flex flex-col gap-6">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconShoppingBag class="h-3.5 w-3.5" />
						Merch Store
					</span>
					<span class="chip preset-tonal-secondary">Apparel</span>
					<span class="chip preset-tonal-tertiary">Accessories</span>
				</div>

				<div class="space-y-4">
					<h1
						class="merch-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						Look good.<br />
						<span class="merch-headline-accent">Do good.</span>
					</h1>
					<p class="max-w-xl text-base leading-relaxed opacity-75">
						Rep the movement in gear you will actually want to wear. Every purchase helps 3 Feet
						Please build safer streets for everyone.
					</p>
				</div>
			</div>

			<!-- Right: featured product -->
			<div class="flex items-center justify-center lg:justify-end">
				{#if data.products?.length > 0}
					<!-- Grab the first product as featured -->
					{@const featured = data.products[0]}
					<div
						class="card preset-filled-surface-50-950 flex w-full max-w-sm flex-col gap-4 p-5 shadow-2xl"
					>
						<div class="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] uppercase opacity-60">
							<IconSparkles class="h-4 w-4 text-warning-500" />
							Featured Drop
						</div>
						
						{#if productFeaturedImage(featured)}
							<div class="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-950/50">
								<img 
									src={productFeaturedImage(featured)} 
									alt={featured.name}
									class="h-full w-full object-cover" 
								/>
							</div>
						{/if}
						
						<div>
							<h3 class="text-xl font-bold">{featured.name}</h3>
							<div class="mt-2 flex items-center justify-between">
								<span class="font-medium text-lg">
									{featured.variants?.[0] ? formatCurrency(featured.variants[0].price_cents) : ''}
								</span>
								<a href="#merch-catalog" class="btn btn-sm preset-filled-primary-500 gap-2">
									Shop Now
									<IconArrowRight class="h-4 w-4" />
								</a>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<div id="merch-catalog" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
		<div class="space-y-4">
			{#if data.loadError}
				<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm">
					{data.loadError}
				</section>
			{:else if !(data.products?.length > 0)}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-6 text-center">
					<p class="text-lg font-semibold">Fresh drops are on the way.</p>
					<p class="mt-2 text-sm opacity-75">
						Check back soon to grab new gear and support safer streets in style.
					</p>
					{#if data.isAdmin}
						<a href="/merch/manage" class="btn preset-filled-primary-500 mt-4">Open Merch Manager</a
						>
					{/if}
				</section>
			{:else}
				<div class="grid gap-4 md:grid-cols-2">
					{#each data.products as product (product.id)}
						<article class="merch-card group relative overflow-hidden rounded-2xl p-4">
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
													class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
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
										<IconSparkles class="h-5 w-5" />
									</div>
								{/if}
							</div>

							<div class="mt-3 min-w-0">
								<h2 class="truncate text-lg leading-tight font-bold">{product.name}</h2>
								{#if product.description}
									<p class="mt-1 line-clamp-3 text-sm opacity-75">{product.description}</p>
								{/if}
								<div class="mt-2 flex flex-wrap gap-1.5">
									<span class="chip preset-tonal-surface text-[11px]">
										{#if (product.variants?.length ?? 0) > 1}
											Choose your fit
										{:else}
											Signature edition
										{/if}
									</span>
									{#if productImages(product).length > 1}
										<span class="chip preset-tonal-surface text-[11px]">
											{productImages(product).length} photos
										</span>
									{/if}
								</div>
							</div>

							{#if (product.variants?.length ?? 0) > 0}
								<div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem]">
									<div>
										<label class="label text-xs" for={`variant-${product.id}`}>Variation</label>
										<select
											id={`variant-${product.id}`}
											class="select mt-1 w-full"
											value={selectedVariant(product)?.id || ''}
											onchange={(event) => {
												selectedVariantIdByProduct = {
													...selectedVariantIdByProduct,
													[product.id]: event.currentTarget.value
												};
											}}
										>
											{#each product.variants as variant (variant.id)}
												<option value={variant.id}>
													{variant.name} · {formatCurrency(variant.price_cents)}
												</option>
											{/each}
										</select>
										{#if selectedVariant(product)?.option_values && Object.keys(selectedVariant(product)?.option_values || {}).length}
											<p class="mt-1 text-[11px] opacity-65">
												{summarizeOptions(selectedVariant(product)?.option_values || {})}
											</p>
										{/if}
									</div>
									<div>
										<label class="label text-xs" for={`qty-${product.id}`}>Qty</label>
										<input
											id={`qty-${product.id}`}
											type="number"
											min="1"
											max="20"
											step="1"
											value={selectedQuantity(product.id)}
											class="input mt-1 w-full"
											oninput={(event) => {
												quantityByProduct = {
													...quantityByProduct,
													[product.id]: event.currentTarget.value
												};
											}}
										/>
									</div>
								</div>

								<div class="mt-3 flex items-center justify-between gap-2">
									<div class="text-sm font-semibold">
										{formatCurrency(selectedVariant(product)?.price_cents || 0)}
									</div>
									<button
										type="button"
										class="btn btn-sm preset-filled-primary-500 flex items-center gap-1.5"
										onclick={() => addToCart(product)}
									>
										<IconPlus class="h-3.5 w-3.5" />
										Add to Cart
									</button>
								</div>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</div>

		<aside class="space-y-3">
			<section class="cart-panel sticky top-20 rounded-2xl p-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<IconShoppingBag class="h-4 w-4" />
						<h2 class="text-sm font-semibold uppercase">Cart</h2>
					</div>
					<span class="chip preset-tonal-surface text-xs">{cartLineCount} items</span>
				</div>

				{#if addMessage}
					<div
						class="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-2 text-xs"
					>
						{addMessage}
					</div>
				{/if}

				{#if ($merchCart ?? []).length === 0}
					<p class="mt-4 text-sm opacity-70">Your cart is empty.</p>
				{:else}
					<ul class="mt-4 space-y-2">
						{#each $merchCart as line (line.variantId)}
							<li class="cart-line rounded-xl p-2.5">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate text-sm leading-tight font-semibold">{line.productName}</p>
										<p class="truncate text-xs opacity-70">{line.variantName}</p>
										<p class="text-xs opacity-75">
											{line.quantity} × {formatCurrency(line.priceCents)}
										</p>
									</div>
									<button
										type="button"
										class="btn btn-xs preset-outlined-error-500"
										onclick={() => removeCartLine(line.variantId)}
										aria-label="Remove item"
									>
										<IconTrash2 class="h-3.5 w-3.5" />
									</button>
								</div>
							</li>
						{/each}
					</ul>
					<div class="mt-4 border-t border-white/10 pt-3">
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-70">Subtotal</span>
							<strong>{formatCurrency(cartTotalCents)}</strong>
						</div>
						{#if data.canCheckout}
							<a href="/merch/checkout" class="btn preset-filled-primary-500 mt-3 w-full">
								Checkout
							</a>
						{:else}
							<div
								class="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
							>
								Checkout is temporarily unavailable until Stripe is connected.
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<section class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
				<div class="flex items-start gap-2">
					<IconSparkles class="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p class="font-semibold">Wear the Mission</p>
						<p class="mt-1 opacity-75">
							This gear helps show up loud for safer streets and stronger bike culture.
						</p>
					</div>
				</div>
				<div class="mt-3 flex items-start gap-2">
					<IconShieldCheck class="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p class="font-semibold">Feel Good Checkout</p>
						<p class="mt-1 opacity-75">Know your purchase backs real local impact.</p>
					</div>
				</div>
				{#if data.isAdmin}
					<a href="/merch/manage" class="btn preset-outlined-primary-500 mt-4 w-full">
						Manage Merch Store
					</a>
				{/if}
			</section>
		</aside>
	</div>
</div>

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
					<p class="text-xs uppercase tracking-[0.2em] opacity-65">Merch Gallery</p>
					<h3 class="text-base font-semibold">{lightboxProductName}</h3>
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
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.hero-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}

	.hero-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}

	.hero-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}

	@keyframes orb-drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		100% {
			transform: translate(4%, 6%) scale(1.08);
		}
	}

	/* ── Headline accent ── */
	.merch-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.merch-headline-accent {
		background: linear-gradient(
			120deg,
			var(--color-primary-300),
			var(--color-secondary-300),
			var(--color-tertiary-300)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.merch-card {
		background: linear-gradient(
			130deg,
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-primary-500) 8%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
	}

	.cinema-wrap {
		position: relative;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 24%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 72%, transparent);
	}
	.cinema-rail {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 100%;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
	}
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
		padding: 0.3rem 0.5rem;
		border-radius: 999px;
		font-size: 0.7rem;
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 24%, transparent);
		opacity: 0.9;
	}
	.cinema-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1 / 1;
		opacity: 0.65;
	}

	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 9, 12, 0.84);
		backdrop-filter: blur(8px);
	}
	.lightbox-panel {
		width: min(100%, 64rem);
		max-height: 96vh;
		display: grid;
		gap: 0.8rem;
		padding: 0.8rem;
		border-radius: 1rem;
		background: linear-gradient(
			160deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-secondary-500) 8%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 18%, transparent);
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
		object-fit: cover;
	}
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--color-surface-950) 72%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 26%, transparent);
	}
	.lightbox-nav-left {
		left: 0.7rem;
	}
	.lightbox-nav-right {
		right: 0.7rem;
	}
	.lightbox-thumbs {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(5rem, 6.5rem);
		gap: 0.45rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
	}
	.lightbox-thumb {
		aspect-ratio: 1 / 1;
		border-radius: 0.6rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--color-surface-300) 18%, transparent);
		opacity: 0.7;
	}
	.lightbox-thumb.active {
		opacity: 1;
		border-color: color-mix(in oklab, var(--color-primary-500) 70%, transparent);
	}
	.lightbox-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.cart-panel {
		background: linear-gradient(
			160deg,
			color-mix(in oklab, var(--color-surface-900) 93%, var(--color-tertiary-500) 7%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-primary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 22%, transparent);
	}
	.cart-line {
		background: color-mix(in oklab, var(--color-surface-950) 62%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
	}
</style>
