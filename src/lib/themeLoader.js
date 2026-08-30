const themeLoaders = {
	mint: () => import('@skeletonlabs/skeleton/themes/mint'),
	cerberus: () => import('@skeletonlabs/skeleton/themes/cerberus'),
	catppuccin: () => import('@skeletonlabs/skeleton/themes/catppuccin'),
	legacy: () => import('@skeletonlabs/skeleton/themes/legacy'),
	nouveau: () => import('@skeletonlabs/skeleton/themes/nouveau'),
	rose: () => import('@skeletonlabs/skeleton/themes/rose'),
	sahara: () => import('@skeletonlabs/skeleton/themes/sahara'),
	seafoam: () => import('@skeletonlabs/skeleton/themes/seafoam'),
	wintry: () => import('@skeletonlabs/skeleton/themes/wintry')
};

const loadedThemes = new Set();

export async function loadThemeStyles(theme) {
	if (!theme || theme === '3fp' || loadedThemes.has(theme)) return;
	const load = themeLoaders[theme];
	if (!load) return;
	await load();
	loadedThemes.add(theme);
}
