export const GROUP_SITE_BLOCK_LIMIT = 20;

const GROUP_SITE_ACCENTED_BLOCK_TYPES = new Set([
	'call_to_action',
	'updates',
	'volunteer',
	'email_signup',
	'resources',
	'membership',
	'donation'
]);

const GROUP_SITE_CALLOUT_TONES = Object.freeze(['surface', 'secondary', 'tertiary']);

export function getGroupSiteBlockTone(type, index = 0) {
	if (!GROUP_SITE_ACCENTED_BLOCK_TYPES.has(type)) return 'surface';
	return GROUP_SITE_CALLOUT_TONES[Math.abs(Number(index) || 0) % GROUP_SITE_CALLOUT_TONES.length];
}

export const GROUP_SITE_BLOCK_TYPES = Object.freeze({
	hero: {
		label: 'Hero',
		description: 'The opening welcome and primary call to action.',
		singleton: true,
		locked: true,
		defaults: { eyebrow: 'Welcome', title: '', body: '', button_label: '', button_url: '' }
	},
	story: {
		label: 'About us',
		description: 'Your story, mission, and helpful facts for new riders.',
		singleton: true,
		defaults: {
			eyebrow: 'About us',
			title: 'Who we are',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	events: {
		label: 'Upcoming activity',
		description: 'Live rides, volunteer opportunities, and group updates.',
		singleton: true,
		defaults: {
			eyebrow: 'Coming up',
			title: "What's happening",
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	gallery: {
		label: 'Gallery',
		description: 'Recent group photos and Instagram posts.',
		singleton: true,
		defaults: {
			eyebrow: 'Gallery',
			title: 'Scenes from our rides',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	ride_calendar: {
		label: 'Ride calendar',
		description: 'A searchable calendar of published rides.',
		singleton: true,
		defaults: {
			eyebrow: 'Plan a ride',
			title: 'Ride calendar',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	contact: {
		label: 'Contact',
		description: 'Ways to reach and follow the group.',
		singleton: true,
		defaults: {
			eyebrow: 'Get in touch',
			title: 'Connect with us',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	sponsors: {
		label: 'Partners',
		description: 'Logos and links for sponsors and community partners.',
		singleton: true,
		defaults: {
			eyebrow: 'Community partners',
			title: 'Thanks to our partners',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	donation: {
		label: 'Donation',
		description: 'A quick donation amount picker when fundraising is enabled.',
		singleton: true,
		defaults: {
			eyebrow: 'Support the group',
			title: 'Support our work',
			body: '',
			button_label: '',
			button_url: ''
		}
	},
	text: {
		label: 'Text',
		description: 'A simple heading and paragraph for anything else.',
		singleton: false,
		defaults: {
			eyebrow: 'Our community',
			title: 'Add a clear headline',
			body: 'Share the useful details visitors need to know.',
			button_label: '',
			button_url: ''
		}
	},
	call_to_action: {
		label: 'Call to action',
		description: 'A focused message with one clear button.',
		singleton: false,
		defaults: {
			eyebrow: 'Ready to ride?',
			title: 'Join us for the next one',
			body: 'Everyone is welcome. See what is coming up and find your next ride.',
			button_label: 'See upcoming rides',
			button_url: '/ride'
		}
	},
	email_signup: {
		label: 'Email signup',
		description: 'Invite visitors to follow the group and receive email updates.',
		singleton: true,
		defaults: {
			eyebrow: 'Stay in the loop',
			title: 'Get updates from us',
			body: 'Be the first to hear about rides, events, and important group news.',
			button_label: 'Sign up for updates',
			button_url: ''
		}
	},
	membership: {
		label: 'Join the group',
		description: 'Send visitors to your membership or follower signup.',
		singleton: true,
		defaults: {
			eyebrow: 'Join us',
			title: 'Become part of the group',
			body: 'Choose the membership or follow option that works for you.',
			button_label: 'View membership options',
			button_url: '/join'
		}
	},
	volunteer: {
		label: 'Volunteer',
		description: 'Help visitors find your current volunteer opportunities.',
		singleton: true,
		defaults: {
			eyebrow: 'Lend a hand',
			title: 'Volunteer with us',
			body: 'Find a role, choose a shift, and help make the next event happen.',
			button_label: 'See volunteer opportunities',
			button_url: ''
		}
	},
	updates: {
		label: 'Latest updates',
		description: 'Point visitors to announcements and group news.',
		singleton: true,
		defaults: {
			eyebrow: 'Latest news',
			title: 'What’s new with the group',
			body: 'Read the latest announcements, recaps, and important updates.',
			button_label: 'Read our updates',
			button_url: '/updates'
		}
	},
	resources: {
		label: 'Shared resources',
		description: 'Link to downloadable routes, guides, and group files.',
		singleton: true,
		defaults: {
			eyebrow: 'Resources',
			title: 'Helpful files and guides',
			body: 'Browse the routes, documents, and resources our group shares.',
			button_label: 'Browse resources',
			button_url: '/assets'
		}
	},
	law_directory: {
		label: 'State law directory',
		description: 'A searchable state-by-state safe-passing law reference.',
		singleton: true,
		defaults: {
			eyebrow: 'State-by-state guide',
			title: 'Find the law where you ride',
			body: 'Search the reference directory by state, statute, or keyword.',
			button_label: '',
			button_url: ''
		}
	}
});

export const GROUP_SITE_BLOCK_PALETTE = Object.freeze([
	'story',
	'events',
	'gallery',
	'ride_calendar',
	'contact',
	'sponsors',
	'donation',
	'email_signup',
	'membership',
	'volunteer',
	'updates',
	'resources',
	'law_directory',
	'text',
	'call_to_action'
]);

const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

function cleanText(value, limit) {
	const text = value === null || value === undefined ? '' : String(value).trim();
	return text.slice(0, limit);
}

function normalizeUrl(value) {
	const raw = cleanText(value, 500);
	if (!raw) return '';
	if (/^(https?:\/\/|mailto:|tel:)/i.test(raw) || raw.startsWith('/')) return raw;
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
	return `https://${raw}`;
}

function blockDefaults(type) {
	return GROUP_SITE_BLOCK_TYPES[type]?.defaults || GROUP_SITE_BLOCK_TYPES.text.defaults;
}

function canonicalBlockId(type) {
	return `site-${type.replaceAll('_', '-')}`;
}

function uniqueBlockId(candidate, type, usedIds, index) {
	const preferred = cleanText(candidate, 80);
	const base =
		(preferred && BLOCK_ID_PATTERN.test(preferred) ? preferred : '') ||
		(GROUP_SITE_BLOCK_TYPES[type]?.singleton
			? canonicalBlockId(type)
			: `site-${type}-${index + 1}`);
	let id = base;
	let suffix = 2;
	while (usedIds.has(id)) id = `${base.slice(0, 72)}-${suffix++}`;
	usedIds.add(id);
	return id;
}

export function createGroupSiteBlock(type, { id = '', overrides = {} } = {}) {
	const definition = GROUP_SITE_BLOCK_TYPES[type];
	if (!definition) return null;
	const defaults = blockDefaults(type);
	return {
		id: cleanText(id, 80) || (definition.singleton ? canonicalBlockId(type) : ''),
		type,
		eyebrow: cleanText(overrides.eyebrow ?? defaults.eyebrow, 80),
		title: cleanText(overrides.title ?? defaults.title, 140),
		body: cleanText(overrides.body ?? defaults.body, 1200),
		button_label: cleanText(overrides.button_label ?? defaults.button_label, 80),
		button_url: normalizeUrl(overrides.button_url ?? defaults.button_url)
	};
}

export function buildDefaultGroupSiteBlocks({ sections = {}, rideWidgetEnabled = false } = {}) {
	const includeEvents =
		sections.rides !== false || sections.volunteer !== false || sections.news !== false;
	return [
		createGroupSiteBlock('hero'),
		sections.story === false ? null : createGroupSiteBlock('story'),
		includeEvents ? createGroupSiteBlock('events') : null,
		sections.gallery === false ? null : createGroupSiteBlock('gallery'),
		rideWidgetEnabled ? createGroupSiteBlock('ride_calendar') : null,
		sections.contact === false ? null : createGroupSiteBlock('contact'),
		createGroupSiteBlock('sponsors'),
		createGroupSiteBlock('donation')
	].filter(Boolean);
}

export function normalizeGroupSiteBlocks(value, { sections = {}, rideWidgetEnabled = false } = {}) {
	let source = value;
	if (typeof source === 'string') {
		try {
			source = JSON.parse(source);
		} catch {
			source = null;
		}
	}
	if (!Array.isArray(source) || source.length === 0) {
		return buildDefaultGroupSiteBlocks({ sections, rideWidgetEnabled });
	}

	const usedIds = new Set();
	const usedSingletons = new Set();
	const normalized = [];
	for (const [index, entry] of source.entries()) {
		if (normalized.length >= GROUP_SITE_BLOCK_LIMIT) break;
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const type = cleanText(entry.type, 40).toLowerCase();
		const definition = GROUP_SITE_BLOCK_TYPES[type];
		if (!definition || (definition.singleton && usedSingletons.has(type))) continue;
		if (definition.singleton) usedSingletons.add(type);
		const block = createGroupSiteBlock(type, { overrides: entry });
		block.id = uniqueBlockId(entry.id, type, usedIds, index);
		normalized.push(block);
	}

	const hero = normalized.find((block) => block.type === 'hero') || createGroupSiteBlock('hero');
	return [hero, ...normalized.filter((block) => block.type !== 'hero')].slice(
		0,
		GROUP_SITE_BLOCK_LIMIT
	);
}

export function groupSiteBlockAt(blocks, type) {
	return (Array.isArray(blocks) ? blocks : []).find((block) => block?.type === type) || null;
}

export function groupSiteBlockOrder(blocks, type, fallback = 100) {
	const index = (Array.isArray(blocks) ? blocks : []).findIndex((block) => block?.type === type);
	return index < 0 ? fallback : index;
}

export function hasGroupSiteBlock(blocks, type) {
	return groupSiteBlockOrder(blocks, type, -1) >= 0;
}

export function deriveLegacySiteVisibility(blocks, previousSections = {}) {
	const hasEvents = hasGroupSiteBlock(blocks, 'events');
	return {
		sections: {
			...previousSections,
			join:
				hasGroupSiteBlock(blocks, 'membership') ||
				hasGroupSiteBlock(blocks, 'email_signup') ||
				Boolean(previousSections.join),
			story: hasGroupSiteBlock(blocks, 'story'),
			rides: hasEvents,
			volunteer: hasEvents || hasGroupSiteBlock(blocks, 'volunteer'),
			news: hasEvents || hasGroupSiteBlock(blocks, 'updates'),
			gallery: hasGroupSiteBlock(blocks, 'gallery'),
			contact: hasGroupSiteBlock(blocks, 'contact')
		},
		ride_widget_enabled: hasGroupSiteBlock(blocks, 'ride_calendar')
	};
}
