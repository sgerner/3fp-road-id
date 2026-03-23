<script>
	import {
		GROUP_SITE_FONT_PAIRINGS,
		GROUP_SITE_HERO_STYLES,
		GROUP_SITE_LAYOUT_PRESETS,
		GROUP_SITE_NAV_STYLES,
		GROUP_SITE_SECTION_KEYS,
		GROUP_SITE_THEME_MODES,
		GROUP_SITE_THEME_OPTIONS
	} from '$lib/microsites/config';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconPalette from '@lucide/svelte/icons/palette';
	import IconRefreshCcw from '@lucide/svelte/icons/refresh-ccw';

	let { data, form } = $props();

	let themeMode = $state('derived');
	const themeLabels = {
		derived: 'Derived from branding',
		repo: 'Repo theme',
		custom: 'Custom colors'
	};
	const sectionLabels = {
		story: 'Story',
		stats: 'Stats',
		join: 'Join',
		rides: 'Rides',
		volunteer: 'Volunteer',
		news: 'Updates',
		gallery: 'Gallery',
		contact: 'Contact'
	};

	$effect(() => {
		themeMode = data.siteConfig.theme_mode || 'derived';
	});
</script>

<div class="space-y-6 pb-10">
	<section class="grid gap-4 lg:grid-cols-[0.75fr,1.25fr]">
		<div class="manage-card rounded-3xl p-5">
			<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">Microsite</p>
			<h1 class="mt-3 text-3xl font-black tracking-tight text-white">Website builder</h1>
			<p class="mt-3 text-sm leading-7 text-white/70">
				Every group now has a default microsite at its subdomain. Use this page to tune the layout,
				theme, sections, and copy.
			</p>
			<div class="mt-5 grid gap-3">
				<a href={data.previewPath} target="_blank" rel="noopener noreferrer" class="website-link">
					Preview path
					<span>{data.previewPath}</span>
				</a>
				<a href={data.liveUrl} target="_blank" rel="noopener noreferrer" class="website-link">
					Live subdomain
					<span>{data.liveUrl}</span>
				</a>
			</div>
			{#if data.saved}
				<div class="notice mt-5 rounded-2xl p-3 text-sm">
					{data.saved === 'palette' ? 'Palette updated from branding.' : 'Microsite settings saved.'}
				</div>
			{/if}
			{#if data.generated}
				<div class="notice mt-3 rounded-2xl p-3 text-sm">
					{data.generated === 'ai'
						? 'AI draft applied to the microsite.'
						: 'AI fallback draft applied. Review and refine before publishing changes.'}
				</div>
			{/if}
			{#if data.reset}
				<div class="notice mt-3 rounded-2xl p-3 text-sm">Microsite reset to the default generated site.</div>
			{/if}
			{#if form?.error}
				<div class="error-box mt-3 rounded-2xl p-3 text-sm">{form.error}</div>
			{/if}
		</div>

		<div class="manage-card rounded-3xl p-3 md:p-4">
			<iframe
				title="Microsite preview"
				src={data.previewPath}
				class="h-[680px] w-full rounded-[1.4rem] border border-white/10 bg-black/30"
			></iframe>
		</div>
	</section>

	<section class="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
		<form method="POST" action="?/save" class="manage-card rounded-3xl p-5 md:p-6">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">Site settings</p>
					<h2 class="mt-2 text-2xl font-black tracking-tight text-white">Design + content</h2>
				</div>
				<button class="btn preset-filled-primary-500">Save website</button>
			</div>

			<div class="mt-6 grid gap-6">
				<div class="grid gap-4 md:grid-cols-2">
					<label class="field">
						<span>Site title</span>
						<input class="input" name="site_title" value={data.siteConfig.site_title} />
					</label>
					<label class="field">
						<span>Tagline</span>
						<input class="input" name="site_tagline" value={data.siteConfig.site_tagline} />
					</label>
				</div>

				<label class="field">
					<span>Home intro</span>
					<textarea class="textarea min-h-36" name="home_intro">{data.siteConfig.home_intro}</textarea>
				</label>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="field">
						<span>Featured quote</span>
						<textarea class="textarea min-h-28" name="featured_quote">{data.siteConfig.featured_quote}</textarea>
					</label>
					<label class="field">
						<span>Footer blurb</span>
						<textarea class="textarea min-h-28" name="footer_blurb">{data.siteConfig.footer_blurb}</textarea>
					</label>
				</div>

				<label class="field">
					<span>SEO description</span>
					<input class="input" name="seo_description" value={data.siteConfig.seo_description} />
				</label>

				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<label class="field">
						<span>Layout preset</span>
						<select class="select" name="layout_preset">
							{#each GROUP_SITE_LAYOUT_PRESETS as option}
								<option value={option} selected={data.siteConfig.layout_preset === option}>{option}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Hero style</span>
						<select class="select" name="hero_style">
							{#each GROUP_SITE_HERO_STYLES as option}
								<option value={option} selected={data.siteConfig.hero_style === option}>{option}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Nav style</span>
						<select class="select" name="nav_style">
							{#each GROUP_SITE_NAV_STYLES as option}
								<option value={option} selected={data.siteConfig.nav_style === option}>{option}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Font pairing</span>
						<select class="select" name="font_pairing">
							{#each GROUP_SITE_FONT_PAIRINGS as option}
								<option value={option} selected={data.siteConfig.font_pairing === option}>{option}</option>
							{/each}
						</select>
					</label>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<label class="field">
						<span>Theme mode</span>
						<select class="select" name="theme_mode" bind:value={themeMode}>
							{#each GROUP_SITE_THEME_MODES as option}
								<option value={option}>{themeLabels[option]}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Repo theme</span>
						<select class="select" name="theme_name" disabled={themeMode !== 'repo'}>
							{#each GROUP_SITE_THEME_OPTIONS as theme}
								<option value={theme.value} selected={data.siteConfig.theme_name === theme.value}>
									{theme.label}
								</option>
							{/each}
						</select>
					</label>
				</div>

				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<label class="field">
						<span>Primary</span>
						<input class="input" type="color" name="theme_primary" value={data.siteConfig.theme_colors.primary || '#F59E0B'} disabled={themeMode === 'repo'} />
					</label>
					<label class="field">
						<span>Secondary</span>
						<input class="input" type="color" name="theme_secondary" value={data.siteConfig.theme_colors.secondary || '#0EA5E9'} disabled={themeMode === 'repo'} />
					</label>
					<label class="field">
						<span>Accent</span>
						<input class="input" type="color" name="theme_accent" value={data.siteConfig.theme_colors.accent || '#FB7185'} disabled={themeMode === 'repo'} />
					</label>
					<label class="field">
						<span>Surface</span>
						<input class="input" type="color" name="theme_surface" value={data.siteConfig.theme_colors.surface || '#111827'} disabled={themeMode === 'repo'} />
					</label>
				</div>

				<div>
					<p class="mb-3 text-sm font-semibold text-white">Sections</p>
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{#each GROUP_SITE_SECTION_KEYS as key}
							<label class="toggle-card">
								<input type="checkbox" name={`section_${key}`} checked={data.siteConfig.sections[key]} />
								<span>{sectionLabels[key]}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>
		</form>

		<div class="space-y-6">
			<form method="POST" action="?/generate" class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconSparkles class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">AI draft</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">Generate a fresh site direction</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					Give the AI a concise direction. It will generate structured microsite settings and save them immediately.
				</p>
				<textarea
					class="textarea mt-4 min-h-36"
					name="generation_prompt"
					placeholder="Examples: editorial and civic, warm and neighborhood-focused, energetic ride-club poster look, minimal and practical..."
				>{data.siteConfig.ai_prompt || ''}</textarea>
				<button class="btn preset-filled-primary-500 mt-4 w-full justify-center">
					Generate microsite draft
				</button>
			</form>

			<form method="POST" action="?/deriveTheme" class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconPalette class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">Brand palette</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">Pull colors from logo or cover</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					This samples the group branding image, converts it into editable custom colors, and applies the result to the microsite.
				</p>
				<button class="btn preset-outlined-primary-500 mt-4 w-full justify-center">
					Derive palette from branding
				</button>
			</form>

			<form method="POST" action="?/reset" class="manage-card rounded-3xl p-5 md:p-6">
				<div class="flex items-start gap-3">
					<div class="action-icon">
						<IconRefreshCcw class="h-5 w-5" />
					</div>
					<div>
						<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">Reset</p>
						<h2 class="mt-2 text-2xl font-black tracking-tight text-white">Return to the default microsite</h2>
					</div>
				</div>
				<p class="mt-4 text-sm leading-7 text-white/70">
					This removes the saved microsite config for the group. The public site still exists, but it falls back to the generated default state.
				</p>
				<button class="btn preset-outlined-warning-500 mt-4 w-full justify-center">Reset customizations</button>
			</form>

			<div class="manage-card rounded-3xl p-5 md:p-6">
				<p class="text-xs font-semibold tracking-[0.24em] uppercase text-white/48">Quick links</p>
				<div class="mt-4 grid gap-3">
					<a href={data.previewPath} target="_blank" rel="noopener noreferrer" class="website-link">
						Open preview path
						<IconExternalLink class="h-4 w-4" />
					</a>
					<a href={data.liveUrl} target="_blank" rel="noopener noreferrer" class="website-link">
						Open subdomain
						<IconExternalLink class="h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.manage-card,
	.toggle-card,
	.notice,
	.error-box,
	.website-link,
	.action-icon {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 76%, transparent);
		backdrop-filter: blur(18px);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field span {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgb(255 255 255 / 0.55);
	}

	.input,
	.textarea,
	.select {
		background: color-mix(in oklab, var(--color-surface-950) 86%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}

	.toggle-card {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.85rem 1rem;
		border-radius: 1rem;
		color: white;
	}

	.notice {
		color: white;
		background: color-mix(in oklab, var(--color-success-500) 12%, var(--color-surface-950) 88%);
	}

	.error-box {
		color: white;
		background: color-mix(in oklab, var(--color-error-500) 14%, var(--color-surface-950) 86%);
	}

	.website-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.95rem 1rem;
		border-radius: 1rem;
		text-decoration: none;
		color: white;
	}

	.website-link span {
		min-width: 0;
		flex: 1;
		font-size: 0.85rem;
		text-align: right;
		color: rgb(255 255 255 / 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		color: white;
		flex-shrink: 0;
	}
</style>
