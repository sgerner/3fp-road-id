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
		id: 'risograph_patchwork',
		label: 'Risograph Patchwork',
		description:
			'Graphic editorial collage with layered shapes, paper grain, and bold limited inks.',
		prompt: `bold risograph poster illustration, layered cut-paper collage, geometric patchwork shapes, offset ink registration, visible paper grain, limited spot-color palette, playful abstract composition, editorial illustration energy, handmade print imperfections, not photorealistic

Visual characteristics: torn paper edges, simplified blocky forms, overlapping translucent ink layers, stencil-like shadows, graphic negative space, screenprinted poster texture.

Color direction: choose 3 to 5 inks only, such as fluorescent orange, teal, ultramarine, black, and warm cream paper. Avoid gradients, chrome, and airbrush rendering.

Character direction: simplify people and bikes into elegant graphic silhouettes and expressive shapes rather than detailed comic characters.

Composition rules: poster-like balance, symbolic scenery, strong foreground/background separation, large fields of color, clean editorial storytelling, room for calm focal hierarchy.

Include a subtle recurring 3FP Easter egg as a small circular "3 FT" icon, badge, or pattern element integrated into the design.

Avoid photorealism, glossy 3D rendering, dense linework, faux camera effects, and literal stock-photo staging.`
	},
	{
		id: 'quiet_gouache',
		label: 'Quiet Gouache',
		description:
			'Calm editorial gouache scenes with soft edges, muted warmth, and a reflective tone.',
		prompt: `stylized gouache editorial illustration, matte painted texture, soft brushed edges, visible pigment grain, muted earthy palette, gentle shapes, calm contemplative composition, storybook poster feel, hand-painted paper surface, not photorealistic

Visual characteristics: flat gouache blocks, subtle dry-brush texture, soft edge transitions without glossy gradients, simplified forms, warm atmospheric layering, quiet handcrafted detail.

Color direction: muted sage, dusty blue, terracotta, warm sand, cream, charcoal accents. Keep the palette restrained and soothing.

Character direction: people and cyclists should feel approachable, thoughtful, and human-scaled rather than bombastic superheroes.

Composition rules: spacious layouts, slower rhythms, clear focal subject, gentle neighborhood or landscape backdrops, poetic symbolic storytelling, minimal clutter.

Include a subtle recurring 3FP Easter egg as a small "3 FT" sign, painted curb marking, or tiny emblem tucked into the environment.

Avoid photorealism, glossy rendering, loud neon color, comic sound effects, extreme action poses, and noisy over-detailed backgrounds.`
	}
];

export function getImageStylePreset(styleId) {
	return IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? IMAGE_STYLE_PRESETS[0];
}
