import { createGroupSiteBlock, deriveLegacySiteVisibility } from './blocks.js';
import { createGroupSitePage, normalizeGroupSitePages } from './pages.js';

function clean(value) {
	return String(value ?? '').trim();
}

function groupContext(group = {}) {
	const name = clean(group.name) || 'Your cycling group';
	const location = [clean(group.city), clean(group.state_region)].filter(Boolean).join(', ');
	return { name, location, locationPhrase: location ? ` in ${location}` : '' };
}

function block(type, overrides = {}, id = '') {
	return createGroupSiteBlock(type, { id, overrides });
}

function templateConfig(template, group) {
	const context = groupContext(group);
	const pageBlocks = template.buildBlocks(context).filter(Boolean);
	const visibility = deriveLegacySiteVisibility(pageBlocks, {});
	const sitePages = normalizeGroupSitePages(
		[
			createGroupSitePage({
				id: 'home',
				title: 'Home',
				is_home: true,
				description: template.copy.tagline(context),
				seo_description: template.copy.seo(context),
				blocks: pageBlocks
			}),
			...(template.buildPages?.(context) || [])
		],
		{ homeBlocks: pageBlocks }
	);
	return {
		site_tagline: template.copy.tagline(context),
		home_intro: template.copy.intro(context),
		footer_blurb: template.copy.footer(context),
		seo_description: template.copy.seo(context),
		new_rider_note: template.copy.newRiderNote?.(context) || '',
		safety_note: template.copy.safetyNote?.(context) || '',
		hero_style: template.design.heroStyle,
		background_style: template.design.backgroundStyle,
		panel_style: template.design.panelStyle,
		panel_tone: template.design.panelTone,
		panel_density: template.design.panelDensity,
		font_pairing: template.design.fontPairing,
		theme_mode: 'custom',
		theme_name: '',
		theme_colors: { ...template.design.colors },
		simple_mode: template.design.simpleMode,
		sections: visibility.sections,
		page_blocks: pageBlocks,
		site_pages: sitePages,
		ride_widget_enabled: visibility.ride_widget_enabled,
		ride_widget_title: template.rideWidgetTitle || 'Ride calendar'
	};
}

export const GROUP_SITE_TEMPLATES = Object.freeze([
	{
		id: 'community',
		label: 'Community & casual',
		shortLabel: 'Community',
		description: 'Welcoming rides, social connection, and easy ways to stay involved.',
		bestFor: 'Social rides, neighborhood groups, inclusive communities',
		primaryAction: 'Join the next ride',
		keywords: ['community', 'casual', 'social', 'inclusive', 'recreational', 'neighborhood'],
		design: {
			heroStyle: 'orbit',
			backgroundStyle: 'aurora',
			panelStyle: 'filled',
			panelTone: 'surface',
			panelDensity: 'comfortable',
			fontPairing: 'friendly',
			simpleMode: true,
			colors: {
				primary: '#EA580C',
				secondary: '#0F766E',
				accent: '#F59E0B',
				surface: '#FFF7ED'
			}
		},
		copy: {
			tagline: ({ locationPhrase }) =>
				`Good rides, good people, and room for everyone${locationPhrase}.`,
			intro: ({ name, locationPhrase }) =>
				`${name} brings riders together${locationPhrase} for welcoming rides, shared experiences, and an easy way to feel part of the local cycling community.`,
			footer: ({ name, location }) =>
				`${name}${location ? ` connects riders across ${location}` : ' connects local riders'}.`,
			seo: ({ name, locationPhrase }) =>
				`${name}${locationPhrase}: welcoming group rides, community events, and cycling updates.`,
			newRiderNote: () =>
				'New riders are welcome. Check the ride details for pace, distance, and what to bring.'
		},
		buildBlocks: () => [
			block('hero'),
			block('events', { eyebrow: 'Come ride with us', title: 'Your next good ride starts here' }),
			block('story', { eyebrow: 'Everyone belongs', title: 'A community on two wheels' }),
			block('ride_calendar', { eyebrow: 'Find a ride', title: 'Upcoming rides' }),
			block('membership', {
				eyebrow: 'Join the community',
				title: 'Ride with us more often',
				body: 'Follow the group or become a member to stay connected between rides.',
				button_label: 'Join the group'
			}),
			block('email_signup'),
			block('gallery'),
			block('contact')
		],
		buildPages: () => [
			createGroupSitePage({
				title: 'Rides',
				slug: 'rides',
				description: 'Find upcoming rides and everything you need to feel welcome.',
				blocks: [block('hero'), block('ride_calendar'), block('membership'), block('contact')]
			}),
			createGroupSitePage({
				title: 'About',
				slug: 'about',
				description: 'Meet the community and learn how we ride together.',
				blocks: [block('hero'), block('story'), block('gallery'), block('contact')]
			})
		],
		rideWidgetTitle: 'Find your next ride'
	},
	{
		id: 'ride-club',
		label: 'Organized ride club',
		shortLabel: 'Ride club',
		description: 'A clear calendar, club expectations, membership, and recurring rides.',
		bestFor: 'Road clubs, touring clubs, weekly ride organizations',
		primaryAction: 'View the ride calendar',
		keywords: ['club', 'road', 'touring', 'weekly', 'organized', 'recreation'],
		design: {
			heroStyle: 'immersive',
			backgroundStyle: 'cinematic',
			panelStyle: 'glass',
			panelTone: 'surface',
			panelDensity: 'comfortable',
			fontPairing: 'poster',
			simpleMode: false,
			colors: {
				primary: '#2563EB',
				secondary: '#0F766E',
				accent: '#F59E0B',
				surface: '#F8FAFC'
			}
		},
		copy: {
			tagline: ({ locationPhrase }) =>
				`Consistent rides, capable leaders, and miles worth remembering${locationPhrase}.`,
			intro: ({ name, locationPhrase }) =>
				`${name} organizes dependable group rides${locationPhrase} with clear routes, ride expectations, and options for riders who want to keep showing up.`,
			footer: ({ name, location }) =>
				`${name}${location ? ` rides from ${location}` : ' rides together year-round'}.`,
			seo: ({ name, locationPhrase }) =>
				`${name}${locationPhrase}: organized bicycle rides, club membership, routes, and schedules.`,
			newRiderNote: () =>
				'Review the pace, distance, regroup policy, and required equipment before joining a ride.',
			safetyNote: () => 'Follow ride-leader instructions and arrive with a road-ready bicycle.'
		},
		buildBlocks: () => [
			block('hero'),
			block('ride_calendar', { eyebrow: 'Plan your week', title: 'Club ride calendar' }),
			block('story', { eyebrow: 'Ride with confidence', title: 'How our club rides work' }),
			block('membership', {
				eyebrow: 'Become a member',
				title: 'Make the club your riding home',
				body: 'Join for regular rides, club communication, and the benefits your group offers.',
				button_label: 'View membership'
			}),
			block('events', { eyebrow: 'Beyond the weekly ride', title: 'What the club is doing next' }),
			block('resources', {
				eyebrow: 'Routes and guidance',
				title: 'Club resources',
				body: 'Find route files, ride guidelines, and practical information for club members.',
				button_label: 'Browse club resources'
			}),
			block('email_signup'),
			block('contact')
		],
		buildPages: () => [
			createGroupSitePage({
				title: 'Ride Calendar',
				slug: 'ride-calendar',
				description: 'Routes, pace groups, and the complete club schedule.',
				blocks: [block('hero'), block('ride_calendar'), block('resources'), block('contact')]
			}),
			createGroupSitePage({
				title: 'Membership',
				slug: 'membership',
				description: 'Club expectations, benefits, and how to join.',
				blocks: [block('hero'), block('story'), block('membership'), block('contact')]
			})
		],
		rideWidgetTitle: 'Club ride calendar'
	},
	{
		id: 'racing',
		label: 'Racing & performance',
		shortLabel: 'Racing',
		description: 'Results-minded positioning, team culture, sponsors, and recruitment.',
		bestFor: 'Race teams, development squads, competitive clubs',
		primaryAction: 'Race with the team',
		keywords: ['race', 'racing', 'competitive', 'performance', 'team', 'development'],
		design: {
			heroStyle: 'bold',
			backgroundStyle: 'void',
			panelStyle: 'outlined',
			panelTone: 'primary',
			panelDensity: 'compact',
			fontPairing: 'utility',
			simpleMode: false,
			colors: {
				primary: '#DC2626',
				secondary: '#1D4ED8',
				accent: '#FACC15',
				surface: '#111827'
			}
		},
		copy: {
			tagline: ({ locationPhrase }) =>
				`Train with purpose. Race as a team. Keep raising the standard${locationPhrase}.`,
			intro: ({ name, locationPhrase }) =>
				`${name} is a performance-focused cycling team${locationPhrase} built around smart training, committed teammates, and showing up ready to race.`,
			footer: ({ name }) => `${name}: preparation, teamwork, and performance on race day.`,
			seo: ({ name, locationPhrase }) =>
				`${name}${locationPhrase}: competitive cycling, team rides, racing, development, and sponsorship.`,
			newRiderNote: () =>
				'Team rides may require prior group-riding experience. Check the event details before attending.',
			safetyNote: () => 'Ride predictably, communicate clearly, and respect team and event rules.'
		},
		buildBlocks: () => [
			block('hero'),
			block('events', { eyebrow: 'Training and racing', title: 'What the team is preparing for' }),
			block('story', { eyebrow: 'The program', title: 'Built to race better together' }),
			block(
				'call_to_action',
				{
					eyebrow: 'Join the roster',
					title: 'Ready to race with us?',
					body: 'Learn what the team expects, what support is available, and how to express interest.',
					button_label: 'Explore team membership',
					button_url: '/join'
				},
				'site-racing-cta'
			),
			block('gallery', { eyebrow: 'Race day', title: 'The season in motion' }),
			block('sponsors', { eyebrow: 'Team partners', title: 'Backing the program' }),
			block('updates', {
				eyebrow: 'Team news',
				title: 'Results, stories, and announcements',
				button_label: 'Read team updates'
			}),
			block('email_signup', {
				eyebrow: 'Follow the season',
				title: 'Get team updates',
				body: 'Hear about races, results, recruitment, and ways to support the team.'
			}),
			block('contact')
		],
		buildPages: () => [
			createGroupSitePage({
				title: 'Team',
				slug: 'team',
				description: 'Meet the program, expectations, and team partners.',
				blocks: [block('hero'), block('story'), block('sponsors'), block('contact')]
			}),
			createGroupSitePage({
				title: 'Race Calendar',
				slug: 'race-calendar',
				description: 'Upcoming training, races, and team results.',
				blocks: [block('hero'), block('events'), block('updates'), block('contact')]
			})
		]
	},
	{
		id: 'advocacy',
		label: 'Advocacy & nonprofit',
		shortLabel: 'Advocacy',
		description: 'Mission-first storytelling, action alerts, volunteers, donations, and resources.',
		bestFor: 'Safety campaigns, advocacy coalitions, bicycle nonprofits',
		primaryAction: 'Take action',
		keywords: ['advocacy', 'nonprofit', 'safety', 'campaign', 'coalition', 'education', 'activism'],
		design: {
			heroStyle: 'bold',
			backgroundStyle: 'prism',
			panelStyle: 'filled',
			panelTone: 'surface',
			panelDensity: 'comfortable',
			fontPairing: 'editorial',
			simpleMode: true,
			colors: {
				primary: '#EAB308',
				secondary: '#1E3A8A',
				accent: '#DC2626',
				surface: '#FFFBEB'
			}
		},
		copy: {
			tagline: ({ locationPhrase }) =>
				`Safer streets, stronger voices, and better bicycling for everyone${locationPhrase}.`,
			intro: ({ name, locationPhrase }) =>
				`${name} organizes people${locationPhrase} to improve bicycle safety, influence decisions, educate the public, and turn community support into visible change.`,
			footer: ({ name }) => `${name} works for safer, more welcoming streets for everyone.`,
			seo: ({ name, locationPhrase }) =>
				`${name}${locationPhrase}: bicycle advocacy, safety education, volunteer action, and community resources.`
		},
		buildBlocks: () => [
			block('hero'),
			block('story', { eyebrow: 'Why this matters', title: 'Change starts with a clear mission' }),
			block('updates', {
				eyebrow: 'Action alerts',
				title: 'What needs your attention now',
				body: 'Follow current campaigns, public meetings, wins, and urgent opportunities to speak up.',
				button_label: 'Read action updates'
			}),
			block('volunteer', {
				eyebrow: 'Take action',
				title: 'Put your time behind the mission',
				body: 'Choose a volunteer role and help turn community support into practical progress.',
				button_label: 'Volunteer now'
			}),
			block('donation', { eyebrow: 'Fund the work', title: 'Help move the mission forward' }),
			block('email_signup', {
				eyebrow: 'Stay ready',
				title: 'Get action alerts',
				body: 'Receive campaign updates, meeting reminders, and clear ways to help.'
			}),
			block('resources', {
				eyebrow: 'Learn and share',
				title: 'Advocacy resources',
				body: 'Find guides, policy materials, safety information, and tools for local action.',
				button_label: 'Open the resource library'
			}),
			block('sponsors', { eyebrow: 'Community support', title: 'Partners in the work' }),
			block('contact')
		],
		buildPages: () => [
			createGroupSitePage({
				title: 'Learn',
				slug: 'learn',
				description: 'Understand the issue and share practical safety education.',
				blocks: [block('hero'), block('text'), block('resources'), block('email_signup')]
			}),
			createGroupSitePage({
				title: 'Take Action',
				slug: 'take-action',
				description: 'Volunteer, donate, and help move the mission forward.',
				blocks: [block('hero'), block('volunteer'), block('donation'), block('contact')]
			}),
			createGroupSitePage({
				title: 'About',
				slug: 'about',
				description: 'Our mission, approach, and community partners.',
				blocks: [block('hero'), block('story'), block('sponsors'), block('contact')]
			})
		]
	},
	{
		id: 'trail-stewardship',
		label: 'Trail & stewardship',
		shortLabel: 'Trail group',
		description: 'Trail conditions, work days, group rides, resources, and land stewardship.',
		bestFor: 'Mountain bike groups, trail alliances, stewardship crews',
		primaryAction: 'Join a work day',
		keywords: ['trail', 'mountain', 'mtb', 'stewardship', 'land', 'maintenance', 'off-road'],
		design: {
			heroStyle: 'immersive',
			backgroundStyle: 'cinematic',
			panelStyle: 'glass',
			panelTone: 'surface',
			panelDensity: 'airy',
			fontPairing: 'friendly',
			simpleMode: false,
			colors: {
				primary: '#4D7C0F',
				secondary: '#0F766E',
				accent: '#B45309',
				surface: '#F7FEE7'
			}
		},
		copy: {
			tagline: ({ locationPhrase }) =>
				`Ride the trails. Care for the land. Leave the network better${locationPhrase}.`,
			intro: ({ name, locationPhrase }) =>
				`${name} connects off-road riders${locationPhrase} through group rides, trail information, volunteer work days, and responsible stewardship.`,
			footer: ({ name }) => `${name} supports sustainable trails and the people who care for them.`,
			seo: ({ name, locationPhrase }) =>
				`${name}${locationPhrase}: mountain biking, trail conditions, group rides, stewardship, and volunteer work days.`,
			newRiderNote: () =>
				'Check trail difficulty, current conditions, and equipment requirements before joining a ride.',
			safetyNote: () =>
				'Respect closures, yield appropriately, and follow local trail-use guidance.'
		},
		buildBlocks: () => [
			block('hero'),
			block('events', { eyebrow: 'On the trail', title: 'Rides, work days, and trail updates' }),
			block('volunteer', {
				eyebrow: 'Dig in',
				title: 'Join the next trail work day',
				body: 'Help maintain the places we ride and learn practical stewardship skills.',
				button_label: 'Find a volunteer shift'
			}),
			block('ride_calendar', { eyebrow: 'Plan your ride', title: 'Upcoming trail rides' }),
			block('story', { eyebrow: 'Stewardship first', title: 'Why we care for these trails' }),
			block('resources', {
				eyebrow: 'Know before you go',
				title: 'Trail information and resources',
				body: 'Find route files, access guidance, trail etiquette, and useful local information.',
				button_label: 'Browse trail resources'
			}),
			block('donation', {
				eyebrow: 'Support the trails',
				title: 'Fund tools, materials, and maintenance'
			}),
			block('gallery', { eyebrow: 'From the trail', title: 'Recent rides and work days' }),
			block('contact')
		],
		buildPages: () => [
			createGroupSitePage({
				title: 'Trails',
				slug: 'trails',
				description: 'Trail conditions, access information, and route resources.',
				blocks: [block('hero'), block('resources'), block('ride_calendar'), block('contact')]
			}),
			createGroupSitePage({
				title: 'Stewardship',
				slug: 'stewardship',
				description: 'Work days, volunteer roles, and how we care for the land.',
				blocks: [block('hero'), block('volunteer'), block('events'), block('donation')]
			})
		],
		rideWidgetTitle: 'Upcoming trail rides'
	}
]);

export function getGroupSiteTemplate(templateId) {
	return GROUP_SITE_TEMPLATES.find((template) => template.id === templateId) || null;
}

export function buildGroupSiteTemplate(templateId, { group = {} } = {}) {
	const template = getGroupSiteTemplate(templateId) || GROUP_SITE_TEMPLATES[0];
	return templateConfig(template, group);
}

export function recommendGroupSiteTemplate({ group = {}, groupTypeNames = [] } = {}) {
	const haystack = [
		...groupTypeNames,
		group.name,
		group.tagline,
		group.description,
		group.audience_focus,
		group.service_area_description
	]
		.map(clean)
		.join(' ')
		.toLowerCase();
	let best = GROUP_SITE_TEMPLATES[0];
	let bestScore = 0;
	for (const template of GROUP_SITE_TEMPLATES) {
		const score = template.keywords.reduce(
			(total, keyword) => total + (haystack.includes(keyword) ? 1 : 0),
			0
		);
		if (score > bestScore) {
			best = template;
			bestScore = score;
		}
	}
	return best.id;
}
