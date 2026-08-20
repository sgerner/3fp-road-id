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
					button_label: 'Start with safety tips',
					button_url: '/safety-tips'
				}),
				block('text', {
					eyebrow: 'Give cyclists room to ride',
					title: 'Three feet is a small distance that makes a life-saving difference',
					body: 'Safe-passing laws ask drivers to leave at least three feet—or the distance required in their state—when overtaking a person on a bicycle. That buffer reduces dangerous close passes and gives everyone more room to respond.'
				}),
				block('call_to_action', {
					eyebrow: 'Know the law',
					title: 'See safe-passing guidance for your state',
					body: 'Learn what safe passing means, why the details vary, and where to verify the current law before you ride or drive.',
					button_label: 'Explore state laws',
					button_url: '/laws'
				}),
				block('story', {
					eyebrow: 'Our mission',
					title: 'Education. Advocacy. Action.',
					body: '3 Feet Please helps people understand safe passing, equips local advocates with practical resources, and makes the message visible on roads across the country. Merchandise proceeds support cycling-safety education and community programs.'
				}),
				block('call_to_action', {
					eyebrow: 'Brighten your ride',
					title: 'Stand out and support safer streets',
					body: 'Our high-visibility jerseys carry a simple message drivers can understand in an instant. Every purchase helps fund education and outreach.',
					button_label: 'Shop 3 Feet Please jerseys',
					button_url: SHOP_URL
				}),
				block('volunteer', {
					eyebrow: 'Make a difference',
					title: 'Help the safety message travel farther',
					body: 'Join the volunteer social squad, share useful stories, or become a safety ambassador in your community.',
					button_label: 'Ways to get involved'
				}),
				block('donation', {
					eyebrow: 'Fuel the mission',
					title: 'Help build safer roads for everyone',
					body: 'Your tax-deductible gift supports cycling-safety education, public awareness, and community grants.'
				}),
				block('email_signup', {
					eyebrow: 'Stay in gear',
					title: 'Get practical safety news in your inbox',
					body: 'Subscribe for quarterly safety tips, program updates, and new ways to help make roads safer for cyclists.'
				}),
				block('contact', {
					eyebrow: 'Questions or ideas?',
					title: 'Connect with 3 Feet Please',
					body: 'Reach out for educational resources, partnership ideas, or help getting a local safety effort started.'
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
				block('text', {
					eyebrow: 'Laws vary by state',
					title: 'Three feet is common—but it is not universal',
					body: 'Many states name a three-foot minimum. Some require four feet, a full lane change, or a distance described as safe and reasonable. Local rules may add protections. Always verify the current statute and any local ordinance before relying on a summary.'
				}),
				block('text', {
					eyebrow: 'For drivers',
					title: 'Slow down, wait, and change lanes when safe',
					body: 'Treat a bicyclist as the operator of a vehicle. Reduce speed, do not squeeze through a narrow gap, and move fully or partly into the next lane when the law and traffic conditions allow. Return to the lane only after you are safely clear.'
				}),
				block('text', {
					eyebrow: 'For riders and advocates',
					title: 'Use primary legal sources',
					body: 'State statutes change. Check your legislature or transportation agency for the current text, effective date, exceptions, and penalties. This educational page is not legal advice. If you spot outdated information, tell us so we can investigate.'
				}),
				block('call_to_action', {
					eyebrow: 'Help improve this resource',
					title: 'Share a law update or ask a question',
					body: 'Send the state, statute number, and an official source. We welcome corrections and additions from local advocates.',
					button_label: 'Email hi@3fp.org',
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
				block('story', {
					eyebrow: 'Why we exist',
					title: 'A simple message for a safer pass',
					body: '3 Feet Please makes safe passing easier to see, remember, and discuss. We combine education, visible reminders, partnerships, and grassroots action to help motorists and cyclists share the road more safely.'
				}),
				block('text', {
					eyebrow: 'Our organization',
					title: 'A program of CycleSafe Coalition',
					body: 'CycleSafe Coalition owns the 3 Feet Please trademark and is a 501(c)(3) nonprofit organization. EIN 99-3658890. Donations are tax-deductible to the extent allowed by law.'
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
			site_tagline: 'Making roads safer for cyclists through education, advocacy, and action.',
			home_intro:
				'Cycling is freedom. Together, we can give every rider the room they need to return home safely.',
			footer_blurb:
				'3 Feet Please is a program of CycleSafe Coalition, a 501(c)(3) nonprofit organization. EIN 99-3658890.',
			seo_description:
				'3 Feet Please promotes safe passing, cycling-safety education, and practical resources for riders, drivers, and local advocates.',
			microsite_notice: '',
			microsite_notice_href: '',
			sections: {
				...(currentConfig.sections || {}),
				story: true,
				volunteer: true,
				news: true,
				contact: true
			},
			page_blocks: pages[0].blocks,
			site_pages: pages,
			published: true
		},
		{ group }
	);
}
