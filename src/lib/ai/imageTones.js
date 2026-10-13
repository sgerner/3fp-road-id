export const IMAGE_TONE_OPTIONS = [
	{
		id: 'passionate_advocate',
		imagePrompt: 'Confident poses, uplifting contrast, purposeful community movement.',
		label: 'Passionate Advocate',
		guidance:
			'Passionate, persuasive, and energizing. Sound like a committed bike advocate rallying people to care and act.',
		example:
			'Example energy: "This law exists for a reason. Riders deserve real space, not excuses."'
	},
	{
		id: 'rebellious',
		imagePrompt: 'Defiant poses, bold graphic contrast, unconventional framing.',
		label: 'Rebellious',
		guidance:
			'Rebellious, sharp, and defiant without sounding reckless. Challenge the status quo and make the post feel bold.',
		example:
			'Example energy: "No, cyclists are not asking for special treatment. We are asking drivers to follow the law."'
	},
	{
		id: 'playful',
		imagePrompt: 'Warm colors, playful gestures, lighthearted visual details.',
		label: 'Playful',
		guidance:
			'Playful, witty, and socially warm. Keep it clever and light without becoming vague or unserious.',
		example:
			'Example energy: "Three feet is not a huge ask. It is basically one good golden retriever."'
	},
	{
		id: 'serious_organizer',
		imagePrompt: 'Ordered composition, grounded colors, clear purposeful subjects.',
		label: 'Serious Organizer',
		guidance:
			'Serious, credible, and organized. Sound like a movement leader giving people a clear reason and next step.',
		example:
			'Example energy: "If we want safer streets, we need people who know the law and are willing to insist on it."'
	},
	{
		id: 'wonky_teacher',
		imagePrompt:
			'Clear visual hierarchy, precise meaningful details, uncluttered editorial composition.',
		label: 'Wonky Teacher',
		guidance:
			'Wonky, educational, and precise. Explain the issue clearly like a smart bike-law explainer who enjoys the details.',
		example:
			'Example energy: "The 3-foot law is not a courtesy guideline. It is a legal minimum clearance requirement."'
	},
	{
		id: 'neighborly',
		imagePrompt: 'Approachable subjects, warm light, welcoming community composition.',
		label: 'Neighborly',
		guidance:
			'Neighborly, welcoming, and community-first. Sound like a trusted local group inviting people in.',
		example:
			'Example energy: "We all want to get home safe. Giving people space on bikes is part of being a good neighbor."'
	},
	{
		id: 'bold_beautiful',
		label: 'Bold & beautiful',
		guidance:
			'Confident, expressive, and uplifting. Celebrate strength and beauty with vivid language.',
		imagePrompt:
			'Strong silhouettes, rich colors, elegant confident poses, striking focal contrast.',
		example: ''
	},
	{
		id: 'eccentric',
		label: 'Eccentric',
		guidance:
			'Offbeat, imaginative, and charmingly unexpected. Use playful surprising turns of phrase while keeping the message clear.',
		imagePrompt:
			'Unexpected color pairings, quirky original props, asymmetrical but readable composition.',
		example: ''
	},
	{
		id: 'calm_collected',
		label: 'Calm & collected',
		guidance:
			'Measured, reassuring, and quietly confident. Use clear grounded language without hype.',
		imagePrompt:
			'Balanced spacious composition, poised subjects, restrained contrast, orderly visual rhythm.',
		example: ''
	},
	{
		id: 'peaceful_mindful',
		label: 'Peaceful / mindful',
		guidance:
			'Gentle, reflective, and present. Invite people to slow down and notice their surroundings.',
		imagePrompt:
			'Soft light, generous negative space, unhurried movement, gentle natural atmosphere.',
		example: ''
	},
	{
		id: 'feisty',
		label: 'Feisty',
		guidance:
			'Spirited, cheeky, and determined. Bring punchy wit and conviction without attacking people.',
		imagePrompt:
			'Determined expressions, punchy contrasts, forward motion, assertive diagonal framing.',
		example: ''
	},
	{
		id: 'boisterous',
		label: 'Boisterous',
		guidance:
			'Loud, exuberant, and full of communal joy. Use lively rhythms and infectious enthusiasm.',
		imagePrompt:
			'Big joyful gestures, lively group movement, saturated accents, energetic composition with a clear focal point.',
		example: ''
	},
	{
		id: 'flaming_gay',
		label: 'Flaming fucking gay',
		guidance:
			'Unapologetically queer, exuberant, camp, and proud. Celebrate belonging with wit and warmth; avoid stereotypes or making assumptions about real people. Profanity is optional, never required.',
		imagePrompt:
			'Joyful queer Pride celebration, rainbow accents, expressive styling, exuberant movement, dignified inclusive representation without stereotypes.',
		example: ''
	}
];

export function getImageTonePreset(toneId) {
	return IMAGE_TONE_OPTIONS.find((option) => option.id === toneId) ?? null;
}
