export const STATE_MASCOT_STYLE_ID = 'state_mascot_bike';
export const BIKE_VIBE_STYLE_ID = 'bike_vibe_spotlight';

export const IMAGE_STYLE_PRESETS = [
	{
		id: 'comic_house',
		label: '3FP House Style',
		description: 'Golden-age comic poster energy with a recurring 3 FT visual motif.',
		prompt: `classic golden-age comic book illustration, 1960s cycling superhero poster style, bold black ink outlines, halftone dot shading, flat primary colors, vintage comic printing texture, exaggerated heroic poses, dynamic action lines, wholesome and slightly ridiculous tone, dramatic lighting, highly stylized illustration, not photorealistic

Visual characteristics: thick black outlines, halftone dots, screenprint texture, exaggerated motion, vintage comic color palette.

Color palette: bright red, sunshine yellow, sky blue, comic pink, deep navy outlines. Avoid gradients.

Character direction: cyclists posed like comic book heroes, confident expressions, dramatic pedaling motion, flowing hair or helmets, dynamic speed lines behind bikes.

Composition rules: retro comic panel composition, explosion or starburst callouts, dramatic perspective, city skyline or desert background.

Recurring Easter egg: include a subtle glowing "3 FT" safety bubble around riders or a mildly shocked driver in the distant background.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

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

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

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

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid photorealism, glossy rendering, loud neon color, comic sound effects, extreme action poses, and noisy over-detailed backgrounds.`
	},
	{
		id: 'wpa_travel_poster',
		label: 'WPA Travel Poster',
		description:
			'1930s-inspired Works Progress Administration travel poster look with bold shapes, scenic depth, and civic optimism.',
		prompt: `1930s WPA-era travel poster illustration, art deco influenced composition, block-printed texture, simplified geometric forms, strong poster hierarchy, stylized landscape perspective, civic-era optimism, not photorealistic

Visual characteristics: bold contour shapes, limited tonal bands, subtle paper grain, crisp silhouette cutouts, screenprint-like ink texture, confident negative space.

Color direction: restrained vintage palette such as deep navy, rust red, forest green, warm cream, muted gold. Avoid neon and glossy effects.

Character direction: if people appear, render them as simplified heroic silhouettes integrated into the scenery, with bicycles and streets readable at a glance.

Composition rules: scenic destination-poster framing, dramatic sky or horizon, architectural or natural landmarks, strong foreground/midground/background layering.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid photorealism, modern lens artifacts, soft cinematic blur, corporate stock-photo layouts, and over-detailed microtextures.`
	},
	{
		id: 'bubbly_nautical_cartoon',
		label: 'Bubbly Nautical Cartoon',
		description:
			'Playful undersea cartoon energy with bubbly shapes, bright colors, and goofy bike-forward action.',
		prompt: `bubbly nautical cartoon illustration, cheerful undersea-inspired world, rounded squishy forms, expressive faces, hand-drawn ink outlines, bright saturated palette, whimsical comedy tone, playful environmental details, not photorealistic

Visual characteristics: floating bubbles, coral-like shapes, wavy organic lines, rubbery squash-and-stretch posing, simple high-contrast shading, crisp readable silhouettes.

Color direction: sunny yellow, sea blue, turquoise, coral pink, lime accents, warm sand tones. Keep colors vivid but clean.

Character direction: original fictional characters only, goofy and friendly, energetic bicycle motion, exaggerated expressions, strong pose clarity.

Composition rules: lively action scene with ocean-town or beach-town motifs, layered foreground props, clean focal subject, poster-friendly framing.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid direct imitation of existing copyrighted characters or logos, photorealism, muddy palettes, heavy noise, and cluttered unreadable layouts.`
	},
	{
		id: 'anime',
		label: 'Anime',
		description:
			'Expressive anime-inspired illustration with cinematic framing, bold character poses, and clean cel shading.',
		prompt: `anime-inspired stylized illustration, dynamic composition, expressive character posing, clean linework, cel shading, dramatic but readable lighting, poster-ready scene design, not photorealistic

Visual characteristics: crisp outlines, simplified high-contrast shading, clear focal subject, strong silhouettes, selective environmental detail.

Color direction: vibrant but controlled palette with defined shadow tones and highlight accents; avoid muddy realism.

Composition rules: cinematic framing, clear depth layers, action-forward posture, scene clarity at thumbnail size.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid direct imitation of copyrighted characters, logos, photorealistic skin rendering, and cluttered backgrounds.`
	},
	{
		id: 'crafty_clay',
		label: 'Crafty Clay',
		description:
			'Handmade clay-diorama look with tactile textures, playful forms, and stop-motion charm.',
		prompt: `handcrafted clay art style, miniature diorama aesthetic, tactile sculpted forms, soft studio lighting, subtle stop-motion charm, whimsical composition, not photorealistic

Visual characteristics: visible clay fingerprints, rounded handmade forms, layered paper-and-clay props, soft shadows, practical handcrafted imperfections.

Color direction: warm playful palette with matte clay surfaces, balanced contrast, no glossy CGI plastic look.

Composition rules: one strong focal subject, simple layered environment, clear foreground/midground/background separation.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid hyper-real CGI, polished 3D rendering, tiny noisy details, and logo-heavy props.`
	},
	{
		id: 'fantasy_art',
		label: 'Fantasy Art',
		description:
			'Epic fantasy illustration with painterly atmosphere, symbolic worldbuilding, and heroic visual storytelling.',
		prompt: `stylized fantasy illustration, epic yet readable scene, painterly atmosphere, heroic composition, imaginative environmental storytelling, not photorealistic

Visual characteristics: dramatic skies, rich texture, stylized light shafts, symbolic props, strong silhouette readability.

Color direction: high-contrast cinematic palette with jewel tones and warm highlights; avoid washed-out realism.

Composition rules: clear hero subject, layered depth, environmental motifs that support mythic tone without clutter.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid copied IP, modern brand logos, photoreal human skin detail, and overpacked chaotic scenes.`
	},
	{
		id: 'line_art',
		label: 'Line Art',
		description:
			'Minimalist line-focused illustration with strong contours, elegant negative space, and editorial clarity.',
		prompt: `minimalist line-art illustration, clean contour drawing, bold and delicate stroke variation, strong negative space, graphic editorial clarity, not photorealistic

Visual characteristics: high line fidelity, limited fill areas, restrained shading, simplified forms, crisp composition.

Color direction: monochrome or very limited accent palette; prioritize line hierarchy over color complexity.

Composition rules: clear primary subject, uncluttered framing, strong readability at small sizes.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid dense crosshatching noise, painterly realism, 3D rendering artifacts, and cluttered backgrounds.`
	},
	{
		id: 'origami',
		label: 'Origami',
		description:
			'Paper-folded origami aesthetic with geometric forms, crisp creases, and handcrafted visual rhythm.',
		prompt: `origami-inspired paper art illustration, folded geometric forms, visible crease lines, layered paper scene construction, handcrafted precision, not photorealistic

Visual characteristics: faceted paper surfaces, crisp folds, tactile paper grain, directional shadows, simplified shape language.

Color direction: harmonious paper palette with 3 to 6 tones, clean contrast, no glossy plastic materials.

Composition rules: one clear focal subject built from folded forms, balanced scene geometry, strong depth cues.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid CGI realism, chaotic micro-fold detail, logo marks, and visual clutter that breaks paper readability.`
	},
	{
		id: 'pixel_art',
		label: 'Pixel Art',
		description:
			'Retro pixel-art scene with deliberate sprite-like forms, limited palette, and crisp low-res style.',
		prompt: `retro pixel art illustration, deliberate low-resolution sprite aesthetic, visible pixel grid, limited palette, game-like scene readability, not photorealistic

Visual characteristics: crisp pixel edges, blocky forms, controlled dithering, simple tile-like backgrounds, strong icon clarity.

Color direction: tightly limited palette with intentional contrast bands; avoid smooth gradients and anti-aliased blur.

Composition rules: clear central subject, clean background separation, readable silhouette at very small sizes.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid modern painterly rendering, vector-like smooth curves, noisy texture overlays, and over-detailed backgrounds.`
	},
	{
		id: BIKE_VIBE_STYLE_ID,
		label: 'Bike Vibe Spotlight',
		description:
			'Bike-centric art that emphasizes a selected bike type or personality vibe as the hero.',
		prompt: `bike-centric stylized illustration, the bicycle itself is the star subject, strong design personality, clear mechanical silhouette, expressive mood, poster-ready composition, not photorealistic

Visual characteristics: highly readable bike frame profile, intentional components, tasteful detail focus on wheels, cockpit, and accessories, graphic clarity at thumbnail size.

Character direction: if riders appear, they should support the bike personality rather than overpower it; keep rider styling aligned with the chosen bike vibe.

Composition rules: prioritize the selected bike vibe as the focal point, with scene props and environment reinforcing the same aesthetic story.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid generic one-size-fits-all bike depictions, photorealism, brand logos, and clutter that obscures bike identity.`
	},
	{
		id: STATE_MASCOT_STYLE_ID,
		label: 'State Mascot Ride',
		description:
			'State-specific poster art with an imaginary mascot cyclist and local landmarks, icons, and scenery.',
		prompt: `state-specific illustrated cycling poster, imaginary mascot character riding a bike as the hero, rich local symbolism, iconic landmarks and landscapes, energetic composition, bold graphic shapes, handcrafted illustration texture, not photorealistic

Visual characteristics: a single memorable mascot cyclist as the focal point, supporting icons arranged around the rider, lively movement, layered scene depth, clean silhouette readability.

Character direction: mascot must be fictional and original, friendly and playful, clearly in motion on a bicycle, wearing practical ride gear.

Composition rules: surround the mascot with imagery unique to the selected state or territory, including landmarks, nature, street details, local flora/fauna, and culture cues.

Text guidance: avoid paragraphs and dense text blocks; if any lettering appears, keep it to at most 1 short phrase.

Avoid logos, brand marks, copyrighted mascots, photorealism, stock-photo staging, and overloaded visual clutter.`
	}
];

export function getImageStylePreset(styleId) {
	return IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? IMAGE_STYLE_PRESETS[0];
}
