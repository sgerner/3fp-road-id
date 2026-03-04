export const IMAGE_STYLE_PRESETS = [
	{
		id: 'comic_house',
		label: '3FP House Style',
		description: 'Golden-age comic poster energy with a recurring 3 FT visual motif.',
		prompt: `classic golden-age comic book illustration, 1960s cycling superhero poster style, bold black ink outlines, halftone dot shading, flat primary colors, vintage comic printing texture, exaggerated heroic poses, dynamic action lines, retro typography banners, wholesome and slightly ridiculous tone, dramatic lighting, highly stylized illustration, not photorealistic

Visual characteristics: thick black outlines, halftone dots, screenprint texture, exaggerated motion, vintage comic color palette.

Color palette: bright red, sunshine yellow, sky blue, comic pink, deep navy outlines. Avoid gradients.

Character direction: cyclists posed like comic book heroes, confident expressions, dramatic pedaling motion, flowing hair or helmets, dynamic speed lines behind bikes.

Composition rules: retro comic title banner shapes, explosion or starburst callouts, dramatic perspective, city skyline or desert background, comic panel composition.

Recurring Easter egg: include a subtle glowing "3 FT" safety bubble around riders or a mildly shocked driver in the distant background.

Avoid photorealism, muddy colors, soft cinematic blur, modern 3D rendering, realistic camera artifacts, and text-heavy layouts.`
	},
	{
		id: 'comic_pedal_power',
		label: 'Pedal Power',
		description: 'More motion, humor, sound effects, and kinetic absurdity.',
		prompt: `classic golden-age comic book illustration, 1960s cycling superhero poster style, bold black ink outlines, halftone dot shading, flat primary colors, vintage comic printing texture, exaggerated heroic poses, wholesome and slightly ridiculous tone, dramatic lighting, highly stylized illustration, not photorealistic

Lean into playful motion: lightning bolts behind wheels, dramatic speed streaks, exaggerated speed trails, comic sound effects like "WHOOSH!" and "PEDAL POWER!", starburst captions, dynamic diagonals, action-packed composition.

Keep riders heroic, joyful, and energetic. Use thick black outlines, halftone dots, screenprint texture, and a bright red, yellow, blue comic palette with deep navy outlines. Avoid gradients.

Include a subtle recurring 3FP Easter egg such as a glowing "3 FT" bubble, a startled motorist in the background, or a tiny helmet mascot.

Avoid photorealism, muted palettes, realistic signage, and bland stock-poster composition.`
	},
	{
		id: 'comic_civic_sunrise',
		label: 'Civic Sunrise',
		description: 'A calmer but still bold poster look for community identity and educational art.',
		prompt: `classic golden-age comic book illustration, 1960s cycling superhero poster style, bold black ink outlines, halftone dot shading, flat primary colors, vintage comic printing texture, wholesome and slightly ridiculous tone, dramatic lighting, highly stylized illustration, not photorealistic

Favor a noble community-poster composition: dramatic sunrise or desert light, heroic group silhouettes, clean comic panel framing, city skyline or neighborhood backdrop, rally-poster energy, approachable community warmth.

Use thick outlines, halftone texture, flat primary colors, and a vintage print look. Keep cyclists and neighbors stylized like comic heroes rather than ordinary posed people.

Include a subtle recurring 3FP Easter egg such as a glowing "3 FT" bubble or a tiny shocked driver far in the background.

Avoid gradients, photorealism, gritty realism, muddy colors, and cluttered signage.`
	}
];

export function getImageStylePreset(styleId) {
	return IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? IMAGE_STYLE_PRESETS[0];
}
