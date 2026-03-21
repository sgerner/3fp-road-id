const BIKE_VIBE_OPTIONS_INTERNAL = [
	{
		id: 'road_race',
		label: 'Road Race Bike',
		promptCue: 'sleek road race bike, dropped bars, lightweight performance geometry'
	},
	{
		id: 'gravel_adventure',
		label: 'Gravel Adventure Bike',
		promptCue: 'gravel bike with wider tires, adventure setup, mixed-surface capability'
	},
	{
		id: 'ebike_commuter',
		label: 'E-Bike Commuter',
		promptCue: 'modern e-bike with practical commuter setup, integrated battery and lights'
	},
	{
		id: 'mountain_trail',
		label: 'Mountain Trail Bike',
		promptCue: 'mountain bike with rugged trail posture, knobby tires, technical terrain confidence'
	},
	{
		id: 'fixie_minimal',
		label: 'Fixie Minimal',
		promptCue: 'minimal fixed-gear bike aesthetic, clean lines, urban street style'
	},
	{
		id: 'chop_shop_survivor',
		label: 'Chop Shop Survivor',
		promptCue:
			'mismatched reclaimed-parts bike, improvised repairs, gritty but rideable survivor character'
	},
	{
		id: 'budget_big_box',
		label: 'Cheap Big-Box Bike',
		promptCue: 'entry-level budget bike vibe, basic components, everyday practical look'
	},
	{
		id: 'kids_playbike',
		label: 'Kids Bike',
		promptCue: 'small playful kids bike, colorful details, joyful beginner-bike personality'
	},
	{
		id: 'bougie_titanium',
		label: 'Bougie Titanium',
		promptCue:
			'high-end titanium bike aesthetic, premium craftsmanship, subtle luxury performance vibe'
	}
];

export const BIKE_VIBE_OPTIONS = [...BIKE_VIBE_OPTIONS_INTERNAL];

const BIKE_VIBE_BY_ID = new Map(BIKE_VIBE_OPTIONS.map((option) => [option.id, option]));

export function normalizeBikeVibeId(value) {
	const normalized = String(value ?? '').trim();
	return BIKE_VIBE_BY_ID.has(normalized) ? normalized : '';
}

export function getBikeVibeById(value) {
	const normalized = normalizeBikeVibeId(value);
	return normalized ? BIKE_VIBE_BY_ID.get(normalized) || null : null;
}
