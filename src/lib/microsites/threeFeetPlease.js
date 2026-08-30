import { createGroupSiteBlock } from './blocks.js';
import { normalizeGroupSiteConfig } from './config.js';
import { createGroupSitePage, normalizeGroupSitePages } from './pages.js';

const SHOP_URL = 'https://store.voler.com/collections/collection-3-feet-please';

function block(type, overrides = {}) {
	return createGroupSiteBlock(type, { overrides });
}

function page(input) {
	return createGroupSitePage(input);
}

export function buildThreeFeetPleaseSite({ group = {}, currentConfig = {} } = {}) {
	const pages = normalizeGroupSitePages([
		page({
			id: 'home',
			title: 'Home',
			nav_label: 'Home',
			is_home: true,
			description: 'Making roads safer for cyclists through education, advocacy, and action.',
			blocks: [
				block('hero', {
					eyebrow: 'The law: 3ft between cars & bikes',
					title: 'Making roads safer for cyclists',
					button_label: 'Explore safety resources',
					button_url: '/safety-tips'
				}),
				block('call_to_action', {
					eyebrow: 'One road. Shared responsibility.',
					title: 'More space. More awareness. Safer roads.',
					body: 'Cycling is freedom—let’s make it safer for everyone. Drivers, riders, and communities all have a role to play. Start with practical habits, then find people, rides, and support on 3fp.org.',
					button_label: 'Explore safety tips',
					button_url: '/safety-tips'
				}),
				block('gallery', {
					eyebrow: 'Brighten your ride',
					title: 'Stand out, stay safe, stay connected.',
					body: 'Visibility is one part of a safer ride—and a great way to start a conversation about sharing the road.'
				}),
				block('text', {
					eyebrow: 'Our mission',
					title: 'Education. Advocacy. Action.',
					body: '3 Feet Please helps people understand safe passing, equips local advocates with practical resources, and makes the message visible on roads across the country. Through partnerships, merchandise, and grassroots efforts, we support safer cycling communities and educational programs for everyone who shares the road.'
				}),
				block('call_to_action', {
					eyebrow: 'Tools for the work',
					title: 'Bring safer-streets resources to your community',
					body: 'Find advocacy best practices, a starter kit, and practical ways to share accurate safety information with your club, school, workplace, or local campaign.',
					button_label: 'Open the advocacy guide',
					button_url: '/advocacy'
				}),
				block('call_to_action', {
					eyebrow: 'Shop to support',
					title: 'Wear the message. Fund the mission.',
					body: 'Be bold, be bright, be visible. Our 3 Feet Please and 4 Feet Please gear helps start safer-road conversations, while every purchase supports cycling-safety education and community programs.',
					button_label: 'Shop high-visibility jerseys',
					button_url: SHOP_URL
				}),
				block('call_to_action', {
					eyebrow: 'The community hub',
					title: 'Find your people, rides, and support.',
					body: 'The day-to-day community lives on 3fp.org. Discover groups, browse upcoming rides, learn safer-road habits, and find practical ways to keep cycling moving forward.',
					button_label: 'Explore 3fp.org',
					button_url: 'https://3fp.org'
				}),
				block('email_signup', {
					eyebrow: 'Stay in gear',
					title: 'Get quarterly safety and community updates',
					body: 'Pedal into our newsletter for wheelie good news, safety tips, and new ways to help make roads safer for everyone.'
				})
			]
		}),
		page({
			id: 'page-laws',
			title: 'State Safe-Passing Laws',
			nav_label: 'State Laws',
			slug: 'laws',
			description:
				'Understand the safe-passing rule where you live and how to verify the latest law.',
			seo_description:
				'A practical guide to state safe-passing laws and the three-foot rule for motorists overtaking bicyclists.',
			blocks: [
				block('hero'),
				block('text', {
					eyebrow: 'Start with the principle',
					title: 'A safe pass leaves room for real life',
					body: 'People on bicycles may need to avoid debris, potholes, wind, opening doors, and other hazards. A safe-passing buffer gives the driver and cyclist room to handle the unexpected without a collision.'
				}),
				block('law_directory', {
					eyebrow: 'State-by-state guide',
					title: 'Find the law where you ride',
					body: 'Search the reference directory by state, statute, distance, or keyword. Open a state to see the rule, notable details, and source link.'
				}),
				block('call_to_action', {
					eyebrow: 'Read with care',
					title: 'Use the linked source before you act',
					body: 'This directory is an educational reference assembled from the 3FT Laws workbook and reflects a 2022 research snapshot. Laws and interpretations can change. Check your state legislature or transportation agency for the current text. This is not legal advice.',
					button_label: 'Contact us with an update',
					button_url: 'mailto:hi@3fp.org'
				})
			]
		}),
		page({
			id: 'page-safety',
			title: 'Safety Tips',
			nav_label: 'Safety Tips',
			slug: 'safety-tips',
			description: 'Simple habits for safer riding, driving, and group cycling.',
			blocks: [
				block('hero'),
				block('text', {
					eyebrow: 'Shared responsibility',
					title: 'Safer roads take predictable, attentive road users',
					body: 'Drivers should slow down, look before turning or opening a door, and leave a safe buffer when passing. Riders should be visible, communicate clearly, follow traffic laws, and choose a road position that keeps them out of avoidable hazards.'
				}),
				block('text', {
					eyebrow: 'A · Aware',
					title: 'Scan for what could change next',
					body: 'Watch turning vehicles, opening doors, road debris, potholes, pedestrians, and changes in traffic. Give yourself time and space to respond.'
				}),
				block('text', {
					eyebrow: 'L · Lawful',
					title: 'Ride predictably with traffic',
					body: 'Obey signals and stop signs, ride in the direction of traffic, and use a safe lane position. Predictability helps every road user understand what comes next.'
				}),
				block('text', {
					eyebrow: 'E · Eye-catching',
					title: 'Make yourself easy to notice',
					body: 'Use a white front light and red rear light, choose bright or reflective clothing, and avoid lingering where a driver is least likely to see you.'
				}),
				block('text', {
					eyebrow: 'R · Ride ready',
					title: 'Check the bike and plan the ride',
					body: 'Complete an ABC Quick Check, plan a route appropriate for your comfort and skills, carry essentials, and wear clothing and protective equipment suited to the conditions.'
				}),
				block('text', {
					eyebrow: 'T · Telegraph',
					title: 'Communicate before you move',
					body: 'Scan, signal turns and lane changes, make eye contact when possible, and leave enough room around parked vehicles. In a group, call out hazards without creating more danger.'
				}),
				block('text', {
					eyebrow: 'For drivers · S.M.A.R.T.',
					title: 'Give every rider time, space, and your full attention.',
					body: 'S · Space — leave a generous buffer when passing.\nM · Minimize distractions — put the phone away and keep your eyes up.\nA · Attention — scan for bikes before turning, merging, or opening a door.\nR · Reduce speed — slow down before a pass and wait when the space is not right.\nT · Turn carefully — check mirrors and blind spots before crossing a bike’s path.'
				}),
				block('call_to_action', {
					eyebrow: 'Wear the message',
					title: 'Visibility can start a safer conversation',
					body: 'Bright gear helps you stand out, while the 3 Feet Please message reminds drivers how to pass safely.',
					button_label: 'Shop high-visibility jerseys',
					button_url: SHOP_URL
				})
			]
		}),
		page({
			id: 'page-advocacy',
			title: 'Advocacy Guide',
			nav_label: 'Advocacy',
			slug: 'advocacy',
			description: 'Practical, education-first guidance for local safe-streets advocates.',
			blocks: [
				block('hero'),
				block('text', {
					eyebrow: 'Begin locally',
					title: 'Build a coalition rooted in the community',
					body: 'Bring together local cyclists, safety advocates, businesses, nonprofits, planners, and concerned residents. Policymakers need to hear a clear, credible message from the people they represent.'
				}),
				block('text', {
					eyebrow: 'Make the case',
					title: 'Lead with education and public safety',
					body: 'Explain how unsafe passing puts vulnerable road users at risk. Use official crash data, real local experiences, and examples from comparable communities. Keep claims accurate and make the requested action easy to understand.'
				}),
				block('text', {
					eyebrow: 'Learn from experience',
					title: 'Connect with advocates who have done the work',
					body: 'Talk with people who have led both successful and unsuccessful campaigns. Ask what built support, where opposition emerged, and what they would change. Adapt those lessons to local culture and law.'
				}),
				block('text', {
					eyebrow: 'Keep momentum',
					title: 'Use clear messaging and patient follow-through',
					body: 'Frame safe passing as a shared public-safety issue, prepare concise materials, build relationships with policymakers and local media, document community support, and follow up respectfully. Durable change often takes time.'
				}),
				block('call_to_action', {
					eyebrow: 'Need a connection?',
					title: 'We can help you find educational resources',
					body: 'Tell us where you are and what your community is working on. We may be able to connect you with experienced advocates or useful examples.',
					button_label: 'Contact 3 Feet Please',
					button_url: 'mailto:hi@3fp.org'
				})
			]
		}),
		page({
			id: 'page-involved',
			title: 'Get Involved',
			nav_label: 'Get Involved',
			slug: 'get-involved',
			description:
				'Volunteer, become a safety ambassador, shop to support the work, or make a gift.',
			blocks: [
				block('hero'),
				block('volunteer', {
					eyebrow: 'Volunteer',
					title: 'Put your skills behind safer streets',
					body: 'Help create short-form educational videos, share success stories, support outreach, or honor people lost to traffic violence. Remote and community-based roles are available as projects grow.'
				}),
				block('text', {
					eyebrow: 'Become a safety ambassador',
					title: 'Carry the message into your community',
					body: 'Share safe-passing information, distribute educational materials, model predictable riding, and help local partners make safety visible.'
				}),
				block('call_to_action', {
					eyebrow: 'Shop to support',
					title: 'Turn visibility into impact',
					body: '3 Feet Please and 4 Feet Please merchandise helps spread the message and funds cycling-safety initiatives.',
					button_label: 'Visit the jersey shop',
					button_url: SHOP_URL
				}),
				block('donation', {
					eyebrow: 'Give',
					title: 'Fund education and community programs',
					body: 'Donations to CycleSafe Coalition support the 3 Feet Please mission and are tax-deductible to the extent allowed by law.'
				}),
				block('email_signup', {
					eyebrow: 'Keep moving with us',
					title: 'Get quarterly 3 Feet Please updates',
					body: 'Hear about safety resources, advocacy lessons, new programs, and practical ways to participate.'
				}),
				block('contact', {
					eyebrow: 'Start here',
					title: 'Tell us how you want to help',
					body: 'Email hi@3fp.org with your location, interests, and the kind of impact you would like to make.'
				})
			]
		}),
		page({
			id: 'page-about',
			title: 'About 3 Feet Please',
			nav_label: 'About',
			slug: 'about',
			description: 'Meet the nonprofit and people behind the national safe-passing message.',
			blocks: [
				block('hero'),
				block('text', {
					eyebrow: 'Why we exist',
					title: 'A simple message for a safer pass',
					body: '3 Feet Please makes safe passing easier to see, remember, and discuss. We combine education, visible reminders, partnerships, and grassroots action to help motorists and cyclists share the road more safely.'
				}),
				block('text', {
					eyebrow: 'Our organization',
					title: 'A program of CycleSafe Coalition',
					body: 'CycleSafe Coalition owns the 3 Feet Please trademark and is a 501(c)(3) nonprofit organization. EIN 99-3658890. Donations are tax-deductible to the extent allowed by law.'
				}),
				block('call_to_action', {
					eyebrow: 'Your community home',
					title: 'Take the next step on 3fp.org.',
					body: 'The day-to-day work lives on our community site: discover groups, browse upcoming rides, learn practical safety habits, and find ways to help.',
					button_label: 'Explore the community',
					button_url: 'https://3fp.org'
				}),
				block('text', {
					eyebrow: 'Our board',
					title: 'The people guiding the work',
					body: 'Stevie Milne, Board Chair · Katie Boligitz, Financial Officer · Jack Ketcham, Executive Officer. Our work is strengthened by volunteers, advocates, riders, donors, and partners across the country.'
				}),
				block('contact', {
					eyebrow: 'Connect',
					title: 'Partnerships start with a conversation',
					body: 'For program, education, media, or partnership questions, contact hi@3fp.org.'
				})
			]
		}),
		page({
			id: 'page-news',
			title: 'News and Updates',
			nav_label: 'News',
			slug: 'news',
			description:
				'Safety education, advocacy lessons, campaign updates, and stories from the road.',
			show_in_nav: true,
			blocks: [
				block('hero'),
				block('updates', {
					eyebrow: 'Latest news',
					title: 'What’s happening at 3 Feet Please',
					body: 'Read campaign announcements, safety resources, community stories, and updates from our national network.',
					button_label: 'Read all updates'
				}),
				block('email_signup', {
					eyebrow: 'Newsletter',
					title: 'Stay in gear with 3 Feet Please',
					body: 'Get quarterly news, safety tips, and new ways to help make roads safer for cyclists.'
				})
			]
		})
	]);

	return normalizeGroupSiteConfig(
		{
			...currentConfig,
			site_title: '3 Feet Please',
			site_tagline: 'Cycling is freedom—let’s make it safer for everyone.',
			home_intro:
				'3 Feet Please helps everyone share the road safely—and connects the cycling community with the people, rides, and tools to keep moving.',
			footer_blurb:
				'3 Feet Please is a program of CycleSafe Coalition, a 501(c)(3) nonprofit organization. EIN 99-3658890.',
			seo_description:
				'3 Feet Please promotes safe passing and practical road-safety education, then connects cyclists with groups, rides, and community tools at 3fp.org.',
			theme_mode: 'custom',
			theme_name: '',
			theme_colors: {
				primary: '#D7F205',
				secondary: '#17324D',
				accent: '#F05A3C',
				surface: '#10202E'
			},
			background_style: 'void',
			panel_style: 'filled',
			panel_tone: 'surface',
			panel_density: 'comfortable',
			font_pairing: 'friendly',
			microsite_notice: '',
			microsite_notice_href: '',
			sections: {
				...(currentConfig.sections || {}),
				story: true,
				rides: false,
				gallery: true,
				volunteer: false,
				news: true,
				contact: false
			},
			page_blocks: pages[0].blocks,
			site_pages: pages,
			published: true
		},
		{ group }
	);
}
