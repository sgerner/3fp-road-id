export const COVER_MOOD_OPTIONS = [
	{
		id: 'passionate_advocate',
		label: 'Passionate Advocate',
		description: 'Confident poses, uplifting contrast, purposeful community movement.',
		imagePrompt: 'Confident poses, uplifting contrast, purposeful community movement.'
	},
	{
		id: 'rebellious',
		label: 'Rebellious',
		description: 'Defiant poses, bold graphic contrast, unconventional framing.',
		imagePrompt: 'Defiant poses, bold graphic contrast, unconventional framing.'
	},
	{
		id: 'playful',
		label: 'Playful',
		description: 'Warm colors, playful gestures, lighthearted visual details.',
		imagePrompt: 'Warm colors, playful gestures, lighthearted visual details.'
	},
	{
		id: 'serious_organizer',
		label: 'Serious Organizer',
		description: 'Ordered composition, grounded colors, clear purposeful subjects.',
		imagePrompt: 'Ordered composition, grounded colors, clear purposeful subjects.'
	},
	{
		id: 'wonky_teacher',
		label: 'Wonky Teacher',
		description:
			'Clear visual hierarchy, precise meaningful details, uncluttered editorial composition.',
		imagePrompt:
			'Clear visual hierarchy, precise meaningful details, uncluttered editorial composition.'
	},
	{
		id: 'neighborly',
		label: 'Neighborly',
		description: 'Approachable subjects, warm light, welcoming community composition.',
		imagePrompt: 'Approachable subjects, warm light, welcoming community composition.'
	},
	{
		id: 'bold_beautiful',
		label: 'Bold & beautiful',
		description:
			'Strong silhouettes, rich colors, elegant confident poses, striking focal contrast.',
		imagePrompt:
			'Strong silhouettes, rich colors, elegant confident poses, striking focal contrast.'
	},
	{
		id: 'eccentric',
		label: 'Eccentric',
		description:
			'Unexpected color pairings, quirky original props, asymmetrical but readable composition.',
		imagePrompt:
			'Unexpected color pairings, quirky original props, asymmetrical but readable composition.'
	},
	{
		id: 'calm_collected',
		label: 'Calm & collected',
		description:
			'Balanced spacious composition, poised subjects, restrained contrast, orderly visual rhythm.',
		imagePrompt:
			'Balanced spacious composition, poised subjects, restrained contrast, orderly visual rhythm.'
	},
	{
		id: 'peaceful_mindful',
		label: 'Peaceful / mindful',
		description:
			'Soft light, generous negative space, unhurried movement, gentle natural atmosphere.',
		imagePrompt:
			'Soft light, generous negative space, unhurried movement, gentle natural atmosphere.'
	},
	{
		id: 'feisty',
		label: 'Feisty',
		description:
			'Determined expressions, punchy contrasts, forward motion, assertive diagonal framing.',
		imagePrompt:
			'Determined expressions, punchy contrasts, forward motion, assertive diagonal framing.'
	},
	{
		id: 'boisterous',
		label: 'Boisterous',
		description:
			'Big joyful gestures, lively group movement, saturated accents, energetic composition with a clear focal point.',
		imagePrompt:
			'Big joyful gestures, lively group movement, saturated accents, energetic composition with a clear focal point.'
	},
	{
		id: 'flaming_gay',
		label: 'Joyful Pride',
		description:
			'Joyful queer Pride celebration, rainbow accents, expressive styling, exuberant movement, dignified inclusive representation without stereotypes.',
		imagePrompt:
			'Joyful queer Pride celebration, rainbow accents, expressive styling, exuberant movement, dignified inclusive representation without stereotypes.'
	}
];

export const IMAGE_TONE_OPTIONS = COVER_MOOD_OPTIONS;

export function getImageTonePreset(toneId) {
	return COVER_MOOD_OPTIONS.find((option) => option.id === toneId) ?? null;
}
