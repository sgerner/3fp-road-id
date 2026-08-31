import { createGroupSiteBlock } from './blocks.js';
import {
	normalizeGroupSiteNavigation,
	normalizeGroupSitePages,
	createGroupSitePage
} from './pages.js';

export const TBAG_SOURCE_URL = 'https://www.biketempe.org';
export const TBAG_SOURCE_NAME = 'Tempe Bicycle Action Group';
export const TBAG_MICROSITE_VARIANT = 'tbag';
export const TBAG_SOURCE_CONTENT_REVISION = '2026-08-31-source-audit';

const TBAG_SOURCE_AUDITED_PAGE_IDS = new Set([
	'about',
	'board',
	'bylaws',
	'advocacy-resources',
	'bike-count-data',
	'bike-count-2025',
	'bike-racks',
	'bike-valet',
	'cyclists-feat',
	'bike-friendly-businesses',
	'general',
	'social-contract-to-volunteers'
]);

// The old site is still the import source, but it is no longer a public
// destination. Keep the replacement routes in one place so seeded content,
// legacy database rows, and archived article links all converge on this site.
export const TBAG_INTERNAL_ROUTES = Object.freeze({
	action: '/take-action',
	calendar: '/calendar',
	resources: '/assets',
	about: '/about',
	board: '/board',
	bylaws: '/bylaws',
	advocacyResources: '/advocacy-resources',
	bikeCountData: '/bike-count-data',
	bikeCount: '/bike-count-2025',
	bikeRacks: '/bike-racks',
	bikeValet: '/bike-valet',
	cyclistsFeat: '/cyclists-feat',
	bikeFriendlyBusinesses: '/bike-friendly-businesses',
	general: '/general',
	socialContract: '/social-contract-to-volunteers',
	join: '/join',
	donate: '/join#donate'
});

export const TBAG_LEGACY_HOSTNAMES = Object.freeze(['biketempe.org', 'www.biketempe.org']);

// The former WordPress site stored page photos in a shared media library. Keep
// a small, deterministic filename index so pages can still find their original
// images while older imports are upgraded with the newer source_page metadata.
// This is intentionally about provenance, not presentation: owners can still
// replace or remove the photos from the asset library.
const TBAG_SOURCE_MEDIA_PAGE_PATTERNS = Object.freeze({
	board: ['cropped-tbagheader'],
	'bike-count-2025': ['bike-count-2025-header'],
	'bike-racks': [
		'32629_10200100808536748_1392903074_n',
		'rag-o-rama',
		'dance-studio-1',
		'wp_20221013_17_03_17_pro',
		'four-peaks-2',
		'wp_20221206_12_38_34_pro',
		'wp_20230107_11_04_45_pro',
		'ups-store',
		'az-powder-coat-colors'
	],
	'bike-valet': ['bicycle-valet-header', '2020-inningsfest-b'],
	'cyclists-feat': [
		'capture',
		'1377462_700391943323479_32731899_n',
		'1381713_10151902306058130_67525067_n',
		'img_2766',
		'img_2769',
		'img_2771',
		'2020-3-e-south-east',
		'wp_20221117_12_32_03_pro',
		'cyclistsfeatfarmerave',
		'unnamed-1'
	],
	'bike-friendly-businesses': [
		'lovebikers2',
		'80555737_2741977015823226_192467659311284224_n',
		'92591643_2615521115348934_5858051906722594816_n',
		'/o.',
		'screen-shot-2021-03-09-at-10.17.34',
		'screen-shot-2021-03-09-at-10.19.01',
		'14444720_520612431479451_300145071237420015_o',
		'static1.squarespace'
	]
});

export function inferTbagSourceMediaPage(value) {
	const normalized = clean(value).toLowerCase();
	if (!normalized) return '';
	for (const [page, patterns] of Object.entries(TBAG_SOURCE_MEDIA_PAGE_PATTERNS)) {
		if (patterns.some((pattern) => normalized.includes(pattern))) return page;
	}
	return '';
}

// WordPress creates several resized URLs for the same uploaded image. Treat
// those variants as one source asset so an imported page does not show the
// same photograph twice just because the legacy markup linked a different
// size than the seed inventory.
export function tbagSourceMediaKey(value) {
	const raw = clean(value);
	if (!raw) return '';
	try {
		const parsed = new URL(raw);
		const pathname = parsed.pathname
			.toLowerCase()
			.replace(/-\d+x\d+(?=\.[^.]+$)/i, '')
			.replace(/-scaled(?=\.[^.]+$)/i, '');
		return `${parsed.hostname.toLowerCase()}${pathname}`;
	} catch {
		return raw.toLowerCase();
	}
}

const TBAG_LEGACY_ROUTE_MAP = Object.freeze({
	'/': '/',
	'/about': TBAG_INTERNAL_ROUTES.about,
	'/advocacy-resources': TBAG_INTERNAL_ROUTES.advocacyResources,
	'/bike-count-data': TBAG_INTERNAL_ROUTES.bikeCountData,
	'/bylaws': TBAG_INTERNAL_ROUTES.bylaws,
	'/bike-valet': TBAG_INTERNAL_ROUTES.bikeValet,
	'/bicycle-friendly-restaurants': TBAG_INTERNAL_ROUTES.bikeFriendlyBusinesses,
	'/by-laws': TBAG_INTERNAL_ROUTES.bylaws,
	'/calendar': TBAG_INTERNAL_ROUTES.calendar,
	'/count': TBAG_INTERNAL_ROUTES.bikeCount,
	'/current-board': TBAG_INTERNAL_ROUTES.board,
	'/cyclists-feat-farmer-artwork': TBAG_INTERNAL_ROUTES.cyclistsFeat,
	'/donate': TBAG_INTERNAL_ROUTES.donate,
	'/general': TBAG_INTERNAL_ROUTES.general,
	'/join-us': TBAG_INTERNAL_ROUTES.join,
	'/racks': TBAG_INTERNAL_ROUTES.bikeRacks,
	'/social-contract-to-volunteers': TBAG_INTERNAL_ROUTES.socialContract
});

export const TBAG_COLORS = Object.freeze({
	primary: '#155E75',
	secondary: '#2F7A78',
	accent: '#C96F52',
	surface: '#102E3A'
});

function clean(value) {
	return String(value ?? '').trim();
}

function hostname(value) {
	const raw = clean(value);
	if (!raw) return '';
	try {
		const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
		return new URL(normalized).hostname.toLowerCase().replace(/\.$/, '');
	} catch {
		return '';
	}
}

export function isTbagLegacyUrl(value) {
	const raw = clean(value);
	if (!raw) return false;
	try {
		return TBAG_LEGACY_HOSTNAMES.includes(new URL(raw).hostname.toLowerCase().replace(/\.$/, ''));
	} catch {
		return false;
	}
}

export function mapTbagLegacyUrl(value) {
	const raw = clean(value);
	if (!raw || !isTbagLegacyUrl(raw)) return raw;

	try {
		const parsed = new URL(raw);
		const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
		const mapped =
			TBAG_LEGACY_ROUTE_MAP[pathname] ||
			(pathname.startsWith('/20')
				? '/updates'
				: pathname.startsWith('/wp-content/')
					? '/assets'
					: '/assets');
		const hash = mapped.includes('#') ? '' : parsed.hash;
		return `${mapped}${hash}`;
	} catch {
		return TBAG_INTERNAL_ROUTES.resources;
	}
}

function block(type, overrides = {}, id = '') {
	return createGroupSiteBlock(type, { id, overrides });
}

export function isTempeBicycleActionGroup(group = {}) {
	group = group || {};
	const name = clean(group.name).toLowerCase();
	const slug = clean(group.slug).toLowerCase();
	const website = hostname(group.website_url);
	return (
		name.includes('tempe bicycle action group') ||
		name === 'tbag' ||
		slug === 'tempe-bicycle-action-group' ||
		website === 'biketempe.org' ||
		website.endsWith('.biketempe.org')
	);
}

function buildNavigation(pages) {
	return normalizeGroupSiteNavigation(
		{
			items: [
				{ id: 'page:home', placement: 'primary' },
				{ id: 'page:take-action', label: 'Take action', placement: 'primary' },
				{ id: 'page:projects', placement: 'primary' },
				{ id: 'page:about', placement: 'primary' },
				{ id: 'special:updates', label: 'News', placement: 'more' },
				{ id: 'page:calendar', placement: 'more' },
				{ id: 'special:resources', placement: 'more' },
				{ id: 'special:contact', placement: 'more' },
				{ id: 'special:join', placement: 'hidden' }
			]
		},
		{ pages }
	).items;
}

function resourcePage({ id, slug, title, description, seo_description, blocks }) {
	return createGroupSitePage({
		id,
		slug,
		title,
		nav_label: title,
		description,
		seo_description,
		source_revision: TBAG_SOURCE_CONTENT_REVISION,
		show_in_nav: false,
		blocks
	});
}

/**
 * Pages imported from the former TBAG site. They are deliberately hidden
 * from the primary header: visitors reach them from the Resources page,
 * while site owners can still edit them like any other website page.
 */
export function buildTempeBicycleActionGroupResourcePages() {
	return [
		resourcePage({
			id: 'board',
			slug: 'board',
			title: 'Board members',
			description: 'Meet the volunteer leaders who help guide TBAG’s work.',
			seo_description:
				'Meet the volunteer board members and learn how to connect with Tempe Bicycle Action Group leadership.',
			blocks: [
				block('hero', {
					eyebrow: 'People behind the work',
					title: 'A volunteer board with a local point of view.',
					button_label: 'See ways to help',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'Current board',
					title: 'Leadership grounded in Tempe’s everyday streets',
					body: 'President: Katie Boligitz\nVice President: Ignacio Delgadillo\nTreasurer: Hannah Moulton Belec\nSecretary: Andrew Platt\nDirector (Rides): Stevie Milne\nDirector (Social Media): Emma Lodes\nDirector: Julie Cameron\nDirector: Dave Matthews\nDirector: Andrew Miller\n\nYou can email the entire board through [info@biketempe.org](mailto:info@biketempe.org).'
				}),
				block('text', {
					eyebrow: 'Previous board iterations',
					title: 'A record of the people who carried the work.',
					body: 'Jan 2025\nPresident: Jack Ketcham\nVice President (Rides): Ainsley Pfeiffer\nTreasurer (Bike Racks): Jeff Caslake\nSecretary: Andrew Platt\nDirector: Steven Gerner\nDirector: Stevie Milne\nDirector: Kendra Flory\nDirector: Hannah Moulton Belec\nDirector: Katie Boligitz\n\nDec 2022\nPresident: Steven Gerner\nVice President (Rides): Andrew Platt\nTreasurer (Bike Racks): Jeff Caslake\nSecretary: Emily Shaw\nDirector (Ninja Lights): Susan Neill-Eastwood\nDirector (ASU Liaison): Ken Wang\nDirector (Social Media): Anna van Duijnhoven\nDirector (Bike Valet): Noti Peppas\nDirector: Brando Miquirray'
				}),
				block('text', {
					eyebrow: 'Board history · 2022–2018',
					title: 'Roles changed as the organization grew.',
					body: 'Mar 2022\nPresident: Stevie Milne\nVice President: Steven Gerner\nTreasurer: Steve Letsis\nSecretary: Ken Wang\nDirector (Rides): Lyndsey Lyon\nDirector (Ninja Lights): Susan Neill-Eastwood\nDirector (Social Media): Emily Shaw\nDirector: Jon Mulford\n\nJan 2021\nPresident: Stevie Milne\nVice President: Emily Shaw\nDirector: Susan Neill-Eastwood\nDirector: Lyndsey Lyon\nDirector: Stephany Altamirano\n\nJan 2020\nPresident: Stevie Milne\nTreasurer: Jeff Caslake\nFundraising & Business Outreach: Ivan Lopez\nEducation: Susan Conklu\nDirector: Amanda Riske\nDirector: Emily Shaw\nDirector: Vincent Li\nDirector: Jason Simons\n\nDecember 2018\nPresident: Jackie Martin\nVice President: Susan Conklu\nFundraising & Business Outreach: Ivan Lopez\nSocial Media: Meghan Herrick\nDirector: Jeff Caslake\nDirector: Michael Morgan\nDirector: Stevie Milne\nDirector: Cliff Anderson\nDirector: Casey Sattler'
				}),
				block('text', {
					eyebrow: 'Board history · 2016–2012',
					title: 'A long-running local effort.',
					body: 'March 2016\nPresident: Patrick Valandra\nVice President: Jeff Caslake\nTreasurer: Nate FitzGerald\nSecretary: Ben Nyer\nWebmaster: Preston Swan\nBoard Member: Shamus Burns\nBoard Member: Jackie Edens\nBoard Member: Bill Terrance\nBoard Member: Jeff Titone\n\nApril 2015\nPresident: Patrick Valandra\nVice President: Bill Terrance\nArt: Bill Terrance\nTreasurer: Denise Johnson\nBoard Member: Shamus Burns\nAdult Education: Ben Nyer\nBoard Member: Patrick Carlson\nBoard Member: Preston Swan\nBoard Member: Nate FitzGerald\n\nFebruary 2014\nAdvocacy: Scott Walters\nEvents/Social Rides: Dee Kuijer-Watts\nAdult Education: Ben Nyer\nPublic Art and Special Projects: Eric Iwersen\nTreasurer: Joseph Perez\nBudget: Ryan Cook\n\nMay 2013\nPresident: Mark Tauber\nAdvocacy: Scott Walters\nEvents/Social Rides: Dee Kuijer-Watts\nAdult Education: Ben Nyer\nPublic Art and Special Projects: Eric Iwersen\nTreasurer: Joseph Perez\nBudget: Ryan Cook'
				}),
				block('text', {
					eyebrow: 'Board history · 2012–2006',
					title: 'The archive continues to the beginning.',
					body: 'April 2012\nPresident: Ryan Guzy\nAdvocacy: Aaron Golub\nEvents/Social Rides: Jeremy Deatherage\nYouth Education: Robert Chacon\nAdult Education: Ashley Lanoue\nPublic Art and Special Projects: Eric Iwersen\nTreasurer: Joseph Perez\nFundraising: Andrew Hamilton\nBudget: Ryan Cook\n\nJanuary 2009\nPresident: Mark Neff\nVice President: Ryan Guzy\nAdvocacy: Arron Golub\nEvents/Propaganda: Jeremy Deatherage\nSafe Routes 2 School: Sam Bollinger\nSecretary: Rebecca Hale\nTreasurer: Rebecca Clark\nWebmaster: Thomas Tomczyk\nMIA: Jeff Dunn\n\nJune 2008\nPresident: Mark Neff\nVice President: Stan Klonowski\nSecretary: Kate Darby\nTreasurer: Rebecca Clark\nWebmaster: Chris Crosby\nEx-Officio: Scott Nowicki\n\nAugust 2007 and July 2006\nPresident & Webmaster: Chris Crosby\nVice President: Kate Darby\nSecretary: Mark Neff\nTreasurer: Stan Klonowski\nEx-Officio: Scott Nowicki'
				}),
				block('call_to_action', {
					eyebrow: 'Have a question for the board?',
					title: 'Bring an idea, concern, or partnership our way.',
					body: 'TBAG is a community organization. We welcome thoughtful questions about local projects, advocacy, and ways to participate.',
					button_label: 'Contact TBAG',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'bylaws',
			slug: 'bylaws',
			title: 'Bylaws',
			description: 'A plain-language guide to TBAG’s governance and responsibilities.',
			seo_description:
				'Read the Tempe Bicycle Action Group governance reference, objectives, membership rules, board responsibilities, and nonprofit commitments.',
			blocks: [
				block('hero', {
					eyebrow: 'Governance reference',
					title: 'The adopted rules behind the work.',
					button_label: 'Download the source PDF',
					button_url: '/assets?panel=files&q=Bylaws'
				}),
				block('text', {
					eyebrow: 'Source document',
					title: 'Bylaws of the Tempe Bicycle Action Group',
					body: 'An Arizona Nonprofit Corporation\nAs amended July 25th, 2021\n\nARTICLE I — NAME, LOCATION & OBJECTIVES\n\nSection 1. Name and location: The name of the Corporation is Tempe Bicycle Action Group, Inc., hereinafter referred to as “TBAG.” TBAG shall be a not-for-profit Arizona Corporation with federal 501(c)(3) Tax Exempt status. The principal office of TBAG is Tempe, Arizona, but meetings of members and Directors may be held at such places within the State of Arizona, as may be designated by the Board of Directors.\n\nSection 2. Objectives: TBAG is an organization working to make bicycling a prominent, safe and convenient form of transportation and recreation in Tempe, Arizona and surrounding areas through education, grassroots events, and civic participation.'
				}),
				block('text', {
					eyebrow: 'Article I · objectives',
					title: 'The organization’s stated purposes',
					body: 'The objectives of this corporation shall be:\n- To collaborate with the City of Tempe and neighboring communities to enable bicycling as a prominent, safe and convenient form of everyday transportation and recreation;\n- To cooperate with other bicycle and alternative transportation entities;\n- To provide an online knowledge base for regional cycling information, including commuting routes, group ride opportunities, bicycling events, cycling organizations, etc.;\n- To represent the interests of cyclists in local, regional and state government;\n- To organize and promote grassroots cycling events;\n- To partner with local employers to develop policies and infrastructure to encourage their workforce to bicycle commute; and\n- To support bicycling as a tool for community sustainability.'
				}),
				block('text', {
					eyebrow: 'Article II · definitions',
					title: 'The terms used in the document',
					body: 'Section 1. “TBAG” shall mean the Corporation.\nSection 2. “Officer” shall mean any Member serving in the elected position of President, Vice-President, Secretary, Treasurer, or Webmaster upon the Board of Directors of TBAG.\nSection 3. “Director” shall mean any Member serving in an elected or appointed leadership position, including those positions provided in Article IV, upon the Board of Directors of TBAG.\nSection 4. “Board” shall mean the Members serving in the capacities of Officers and Directors upon the Board of Directors in furtherance of TBAG’s objectives.\nSection 5. “Member” shall mean any person who has filed a Membership Agreement and meets the obligations set forth in Article III.\nSection 6. “Annual Meeting” shall mean the Annual Meeting of all Members as set forth in Article VI, Section 1 for the purpose of electing the Board.\nSection 7. “Directors Meetings” shall mean those meetings called by the Board as set forth in Article IV, Sections 12–15 for the purpose of conducting business.'
				}),
				block('text', {
					eyebrow: 'Article III · membership',
					title: 'Who can join and what membership means',
					body: 'Section 1. Membership qualifications: Membership is open to any person who supports the objectives of TBAG. In order to become a Member, a person shall complete the required application and pay the annual dues, where required as established by the Board.\n\nSection 2. Types of membership: There shall be three classes of membership: Individual, Joint, and Business. Joint membership shall be available to any two members of the same household who choose to join together rather than as individuals. Each member in a joint membership shall enjoy full privileges, including voting. Each business paying dues shall have voting privileges equivalent to those of an individual member.\n\nSection 3. Membership dues: The Board may establish annual dues for each class of Membership. Any such dues shall be due annually.'
				}),
				block('text', {
					eyebrow: 'Article IV · board of directors',
					title: 'Management, elections, and terms',
					body: 'Section 1. Management: The management of TBAG shall be vested in a Board of Directors, elected and chosen as provided herein.\n\nSection 2. The initial Board of Directors shall consist of Chris Crosby, Kate Darby, Stan Klonowski, Mark Neff, and Scott Nowicki.\n\nSection 3. Number of Directors: The board shall consist of five (5) to nine (9) Directors, as determined by the Board of Directors.\n\nSection 4. Election of Directors: Election to the Board shall be conducted at the Annual Meeting, or annually by mailed ballot in November. Candidates must be nominated by a Member before the election and submit a short description of their qualifications and interest. If there are insufficient nominees, the standing board can appoint additional Directors from the Community.\n\nSection 5. Selection of Officers: The Directors shall appoint by consensus or secret ballot, according to need and ability, four or five of the Directors to the positions of Officers.'
				}),
				block('text', {
					eyebrow: 'Article IV · board of directors',
					title: 'Duties, qualifications, and term limits',
					body: 'Section 6. Establishment of duties: The Directors may, by simple majority vote, establish or modify the duties of the Officers, create additional Board positions and appoint Members to fill said positions.\n\nSection 7. Qualifications for Directors: Any voting Member over the age of eighteen (18) years in good standing may serve as a Director having been duly elected or appointed.\n\nSection 8. Term of office: Directors shall serve a two (2) year term beginning immediately upon election or appointment at the Annual Meeting. Directors shall serve no more than two (2) consecutive terms. After completing two consecutive terms (four years), a one-year break must be observed before reinstatement. A Director Emeritus may serve a one-year nonvoting term when involved in an essential Board project. A Director dismissed by vote from the board is no longer eligible for re-election.'
				}),
				block('text', {
					eyebrow: 'Article IV · board of directors',
					title: 'Vacancies, meetings, and financial controls',
					body: 'Section 9. Removal, resignation or vacancy: Any Director may be removed with or without cause by a two-thirds (2/3) majority of the other Directors. A successor may be selected by a simple majority vote of remaining Directors to serve the unexpired term.\n\nSection 10. Compensation: No Member shall receive compensation for services as a Director. With prior Board approval, a Director or dues-paying Member may be compensated for other services or reimbursed for approved out-of-pocket expenses.\n\nSection 11. Action without meeting: Directors may act without a meeting by obtaining written or electronic-mail approval of two-thirds (2/3) of the Directors.\n\nSections 12–15. Regular meetings shall be held at least annually, are open to Members, and require notice. Directors are expected to attend. Special meetings require notice, and one-third (1/3) of Directors constitutes a quorum except for financial expenditures, which require a simple majority.\n\nSection 16. Expenses or withdrawals greater than $100 require consent of two TBAG Officers; the corporation’s policy is not to borrow money.'
				}),
				block('text', {
					eyebrow: 'Article V · officers',
					title: 'The officer roles and their responsibilities',
					body: 'Section 1. The Officers shall be President, Vice President, Secretary, Treasurer, and Webmaster.\n\nSection 3. President: Establish the agenda, preside at Board and Annual Meetings, appoint committees, and cast the deciding vote in a tie.\n\nSection 4. Vice President: Keep abreast of TBAG issues and concerns and perform the President’s duties at the President’s request or in their absence.\n\nSection 5. Secretary: Conduct official correspondence, cause annual reports and other documents to be filed, keep a true record of meeting minutes, and provide Directors with copies before the next Board meeting.\n\nSection 6. Treasurer: Have charge of TBAG funds, keep an accurate account of financial transactions, and provide the Board with a current financial report at each meeting.\n\nSection 7. Webmaster: Maintain the website, post information about meetings and events, and respond to emails and inquiries received through the webpage. The Webmaster may hold a second Officer position.'
				}),
				block('text', {
					eyebrow: 'Articles VI–VII · general and amendments',
					title: 'Meetings, interpretation, and changing the bylaws',
					body: 'Article VI — General\nThe Annual Meeting of all interested Members shall be held in November each year at a time and place determined by the Board, with at least thirty days’ notice. Meetings follow the ABCs of Parliamentary Procedure. Members who want to address the Board should ask to be placed on the agenda through a call to the public at the end of a meeting. The fiscal year ends on December 31.\n\nArticle VII — Construction and Amendments\nQuestions regarding the meaning or construction of the Articles of Incorporation or By-laws shall be decided by the Board. These By-laws may be amended by a simple majority of Members present at a duly called Annual Meeting or by a two-thirds (2/3) majority of the whole number of Directors at a duly called Directors’ Meeting. Notice of a proposed amendment and arguments for and against must be provided by email and published on the TBAG website at least thirty days before that meeting.'
				}),
				block('text', {
					eyebrow: 'Articles VIII–IX · responsibility',
					title: 'Risk, insurance, and conflicts of interest',
					body: 'Article VIII — Limitations of Liability and Indemnification\nTBAG will not be liable to a Member for actions undertaken by the Member. The Board may maintain insurance for Directors, Officers, and TBAG. Anyone who participates in activities organized or promoted by the Board understands that the risk of participation and financial responsibility for injury or loss are borne by the participant. Each participant must provide a signed Acknowledgement of Risk form; a parent or legal guardian must also sign for a minor.\n\nArticle IX — Conflicts of Interest\nTBAG adopts the conflict-of-interest policy set forth in the appendices to the IRS instructions for Form 1023.'
				}),
				block('text', {
					eyebrow: 'Articles X–XI · stewardship and inclusion',
					title: 'Dissolution and nondiscrimination',
					body: 'Article X — Dissolution of TBAG\nUpon voluntary or involuntary dissolution, assets remaining after payment of internal and external debts shall be given to one or more nonprofit charitable organizations, preferably organizations promoting bicycling or the interests of bicyclists, chosen by a simple majority vote of the Board.\n\nArticle XI — Nondiscrimination and Nonharassment\nThe Tempe Bicycle Action Group prohibits discrimination and harassment on the basis of race, color, religion, ancestry, national origin, citizenship, sex, sexual orientation, marital status, or age (over 18) in its functions and activities.\n\nThe source PDF’s attestation states that the bylaws were adopted May 22, 2007 and amended March 20, 2016; its title identifies the July 25, 2021 amendment. The official record should be requested from TBAG when the exact approved copy matters.'
				}),
				block('resources', {
					eyebrow: 'Document archive',
					title: 'Keep a copy of the source reference',
					body: 'The signed PDF belongs in the tenant’s shared file library so it remains available even if the old website is retired.',
					button_label: 'Open the document archive',
					button_url: '/assets?panel=files&q=Bylaws'
				}),
				block('call_to_action', {
					eyebrow: 'Need the official record?',
					title: 'Ask TBAG for the current approved copy.',
					body: 'This page keeps the governance information readable and findable. If you need the signed organizational record for a formal purpose, contact the organization before relying on an archived version.',
					button_label: 'Contact TBAG',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'advocacy-resources',
			slug: 'advocacy-resources',
			title: 'Advocacy resources',
			description: 'Practical city, safety, and transportation resources for Tempe.',
			seo_description:
				'Find Tempe transportation links, safer-riding tools, issue reporting options, and regional advocacy resources.',
			blocks: [
				block('hero', {
					eyebrow: 'Tools for the street',
					title: 'Use your voice. Find your way around Tempe.',
					button_label: 'Take action',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'City and biking',
					title: 'T.B.A.G. advocate resources',
					body: 'Use these resources to get around by bike and make it easier for others.\n\nCity & Biking Resources\nThe [Tempe Transportation Department](https://www.tempe.gov/government/engineering-and-transportation/transportation) is the city starting point for transportation information. Its [Bike & Pedestrian page](https://www.tempe.gov/government/engineering-and-transportation/transportation/bicycle-pedestrian) collects local programs, projects, and contacts. [BIKEiT](https://www.tempe.gov/government/engineering-and-transportation/transportation/bicycle-pedestrian/bikeit) is the city’s bicycle education and encouragement program. Read the city’s [bike and scooter safety guidance](https://www.tempe.gov/government/engineering-and-transportation/transportation/bicycle-pedestrian/bike-and-scooter-safety).'
				}),
				block('text', {
					eyebrow: 'City tools',
					title: 'Plan a trip and keep your bike visible.',
					body: 'Subscribe to the city transportation [newsletter](https://mailchi.mp/tempe/inmotion), [register your bike](https://www.tempe.gov/government/police/bicycle-registration), read the city’s [transit history](https://www.tempe.gov/government/engineering-and-transportation/transportation/resources/transit-history), and review [traffic counts](https://www.tempe.gov/government/engineering-and-transportation/transportation/streets-signals-traffic/traffic-counts). Check [Tempe street closures and restrictions](https://www.tempe.gov/government/engineering-and-transportation/transportation/streets-signals-traffic/street-closures-restrictions) before a trip when events or construction may affect your route.'
				}),
				block('text', {
					eyebrow: 'City and regional maps',
					title: 'See the network—and tell planners what you experience.',
					body: '[MAG Bikeways map](https://geo.azmag.gov/maps/bikemap/) shows existing, locally designated bicycle facilities. The map is produced under the direction of the MAG Active Transportation Committee.\n\nUse the [MAG Active Transportation interactive comment map](https://geo.azmag.gov/ActiveMap/) to share knowledge and preferences about biking and walking in the region. Your input helps local and regional planners understand experiences by location and corridor. Call 602-254-6300 if you need to reach MAG about the interactive map.\n\nFor background, the Maricopa Association of Governments plans and finances the regional transportation system, coordinates cross-city bikeways, and supports bicycle counts and long-range planning.'
				}),
				block('text', {
					eyebrow: 'Report issues',
					title: 'A problem becomes useful when it gets reported.',
					body: 'Tempe 311 handles non-emergency city service requests such as broken bike signals, damaged transit signs, and issues on multi-use pathways. Use the [Tempe 311 website](https://www.tempe.gov/government/communication-and-marketing/tempe-311) or the mobile app to submit GPS coordinates and photos and track a request. Call 480-350-4311.\n\nFor a bike-lane obstruction, use [Bike Lane Uprising](https://www.bikelaneuprising.com) and its [iOS app](https://apps.apple.com/us/app/bike-lane-uprising/id1437608346) or [Android app](https://play.google.com/store/apps/details?id=com.bikelaneuprising.app).\n\nFor people experiencing homelessness on bike paths, the Tempe HOPE Team can usually send someone to help: 480-350-8950.'
				}),
				block('text', {
					eyebrow: 'Report issues · signals',
					title: 'When a signal does not see your bike',
					body: 'For a traffic signal that is damaged, flashing, malfunctioning, or too short or long, call police non-emergency at 480-350-8311. The original TBAG resource page also listed John Hoang at 480-350-8033 for signal concerns.\n\nFor emergencies, call 911. Include the intersection, direction of travel, time of day, and what you observed so the report can be routed clearly.'
				}),
				block('text', {
					eyebrow: 'Advocacy',
					title: 'Show up where transportation decisions are made.',
					body: 'The Tempe Transportation Commission advises and makes recommendations to the City Council and assists City departments and the City Manager with transportation projects. The original resource page noted that it typically met on the second Tuesday of the month at 7:30 a.m. at the Tempe Transportation Center. Check the City’s [Transportation Commission page](https://www.tempe.gov/government/city-clerk-s-office/boards-and-commissions/active-boards-commissions-committees-and-other-public-bodies/transportation-commission) and [meeting calendar](https://www.tempe.gov/government/city-clerk-s-office/boards-and-commissions/calendar-of-all-board-committee-and-commission-meetings) for current details.\n\nThe [Tempe Forum](https://communityfeedback.opengov.com/portals/99/forum_home) collects comments and surveys on city decisions. The [Mayor and City Council](https://www.tempe.gov/government/mayor-and-city-council) can be reached at 480-350-8110.'
				}),
				block('text', {
					eyebrow: 'Advocacy · regional',
					title: 'Bring local experience to regional planning.',
					body: 'The original resource page also pointed to the Tempe City Manager’s Office at 480-350-8221, with [OpenTownHall](https://www.opentownhall.com) and the City’s [budget information](https://www.tempe.gov/government/city-manager-s-office/budget) as ways to follow city decisions. The [Maricopa Association of Governments (MAG)](https://azmag.gov) plans and finances the regional transportation system. Learn about MAG’s [Active Transportation Committee](https://azmag.gov/Committees/Technical-Committees-A-O/Active-Transportation-Committee), which supports cross-city bikeways, counts, and long-range planning. Bring a specific observation, a clear request, and the experience of the people who use the street.'
				}),
				block('call_to_action', {
					eyebrow: 'Keep the list useful',
					title: 'Know a resource that belongs here?',
					body: 'Tell TBAG what is missing or out of date so this page can stay a practical starting point for the community.',
					button_label: 'Suggest a resource',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'bike-count-data',
			slug: 'bike-count-data',
			title: 'Biking data',
			description: 'A record of Tempe bike counts, reports, raw data, and related research.',
			seo_description:
				'Explore Tempe bicycle count reports, raw data, regional studies, and transportation research collected over time.',
			blocks: [
				block('hero', {
					eyebrow: 'Evidence for better streets',
					title: 'Count what matters.',
					button_label: 'Explore TBAG projects',
					button_url: '/projects'
				}),
				block('text', {
					eyebrow: 'Tempe Bike Count',
					title: 'A long-running community record',
					body: 'Bicycling in Tempe — An Interactive and Multimedia Experience\n\nThe Tempe Bike Count archive includes reports for 2011, 2012, 2013, 2014 (updated 3/5/2017), 2015 (updated 9/19/2017), 2016 (updated 9/19/2017), 2017 (updated 3/4/2019), 2018, and 2024. The reports document where people ride, rider behavior, traffic conditions, and the intersections that deserve attention.\n\nThe complete downloadable report set is kept in the tenant’s [document archive](/assets?panel=files&q=Tempe%20Bike%20Count).'
				}),
				block('text', {
					eyebrow: 'Explore the work',
					title: 'The count is also a story about the city.',
					body: 'The [Bicycling in Tempe interactive exhibition](https://sites.google.com/asu.edu/bicyclingintempe/home) uses data, maps, personal stories, and multimedia stations to explore bicycling in a city dominated by cars. The original archive also points to raw data for all years on [GitHub](https://github.com/biketempe/DataAnalysis) and the [2024 interactive data](https://observablehq.com/@jketcham/tempe-bike-count-2024).\n\nCheck each report for its collection date, methods, sample size, and limitations before using a number to make a decision.'
				}),
				block('text', {
					eyebrow: 'Regional comparisons',
					title: 'The original research library',
					body: 'Pima County Association of Governments (PAG): [2011 count report](https://www.pagnet.org/documents/bicycle/2011RegionalBicycleCountReport.pdf), [2012 report](https://www.pagnet.org/documents/bicycle/2012RegionalBicycleCountReport.pdf), [2013 report](https://www.pagnet.org/documents/bicycle/2013RegionalBicycleCountReport.pdf), and [2014 report](https://www.pagnet.org/documents/bicycle/2014RegionalBicyclePedestrianCountReport.pdf).\n\nMaricopa Association of Governments (MAG): [Bicycle Count final report and implementation plan](https://www.azmag.gov/Documents/BaP_2014-08-21_FINAL-MAG-Bicycle-Count-Data-Summary-Report.pdf) and [data summary presentation](https://www.azmag.gov/Documents/BaP_2014-05-21_MAG-Bicycle-Count-Data-Summary-Presentation.pdf).\n\nArizona State University: [Bike Network Connectivity Study for the SRP service area](https://www.public.asu.edu/~mikekuby/BikeNetworkConnectivity/).'
				}),
				block('text', {
					eyebrow: 'City and collision data',
					title: 'Put the numbers in context.',
					body: 'The source list also includes the [Tempe Transportation Master Plan](https://www.tempe.gov/home/showdocument?id=30317), the [Tempe Bicycle Friendly Community report](https://www.bikeleague.org/sites/default/files/bfareportcards/BFC_Fall_2015_ReportCard_Tempe_AZ.pdf), [City of Tempe traffic count data](https://data.tempe.gov/), the [ADOT traffic collision database](https://azbikelaw.org/blog/adot-traffic-collision-database/), and [Tempe traffic collisions](https://azbikelaw.org/tempe-traffic-collisions/) from Arizona Bike Law.\n\nThese sources come from different years and use different methods. Treat them as a research library, not as one directly comparable dataset.'
				}),
				block('resources', {
					eyebrow: 'Downloadable archive',
					title: 'Open the reports and source files',
					body: 'The report PDFs imported from the former TBAG site are available in this tenant’s file library.',
					button_label: 'Browse bike-count files',
					button_url: '/assets?panel=files&q=Tempe%20Bike%20Count'
				}),
				block('call_to_action', {
					eyebrow: 'Add to the record',
					title: 'Help make the next count stronger.',
					body: 'Volunteer for a count, share a dataset, or bring a question about what the numbers do—and do not—tell us.',
					button_label: 'Join the next project',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'bike-count-2025',
			slug: 'bike-count-2025',
			title: 'Bike Count 2025',
			description: 'The archived community-driven March 2025 Tempe bike count project.',
			seo_description:
				'Learn how Tempe Bicycle Action Group’s March 2025 bike count captured community data to support safer, more welcoming streets.',
			blocks: [
				block('hero', {
					eyebrow: 'March 2025 archive',
					title: 'Every ride counts.',
					button_label: 'Volunteer with TBAG',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'Why participate?',
					title: 'Join Tempe’s annual community bike count.',
					body: 'On March 26th, 27th, and 29th, volunteers were invited to help capture the pulse of cycling throughout Tempe. This initiative is more than counting bikes: it helps the community understand local needs and advocate for streets that prioritize safety, accessibility, and enjoyment for all.\n\nYour participation supports safer streets, connects you with fellow cycling advocates, and creates data that can inform city planning and transportation policies.'
				}),
				block('text', {
					eyebrow: 'What volunteers do',
					title: 'No previous experience is necessary.',
					body: '1. Sign up — all are welcome.\n2. Attend a brief training — choose one of two in-person sessions or a virtual training.\n3. Choose your shift(s) — morning and evening rush-hour shifts are available on each count day, and TBAG will match volunteers with intersections.\n4. Count — spend a few hours observing and tallying bicyclists at your assigned location with the information and tools provided.'
				}),
				block('text', {
					eyebrow: 'Why the record matters',
					title: 'Every ride helps make the case.',
					body: 'The results lay groundwork for a more bike-friendly Tempe and a safer, more enjoyable environment for everyone. Together, we are not just counting bikes; we are making every ride count. Dates and signup details change from year to year, so join the email list for the next call.'
				}),
				block('gallery', {
					eyebrow: '2025 project archive',
					title: 'The 2025 count, in the field.',
					gallery_source_page: 'bike-count-2025'
				}),
				block('call_to_action', {
					eyebrow: 'The invitation',
					title: 'Count with us the next time the project opens.',
					body: 'The dates and signup details change from year to year. Join the email list for the next call, training information, and volunteer updates.',
					button_label: 'Get project updates',
					button_url: TBAG_INTERNAL_ROUTES.join
				}),
				block('email_signup', {
					eyebrow: 'Stay ready',
					title: 'Hear when the next count is announced.',
					body: 'We will share the next volunteer window, training details, and ways to make the data useful.'
				})
			]
		}),
		resourcePage({
			id: 'bike-racks',
			slug: 'bike-racks',
			title: 'Bike racks for businesses',
			description: 'A practical TBAG program connecting local businesses with better bike parking.',
			seo_description:
				'Learn how Tempe Bicycle Action Group helps local businesses add practical, welcoming bike parking.',
			blocks: [
				block('hero', {
					eyebrow: 'Make arrival easier',
					title: 'Good bike parking is an invitation.',
					button_label: 'Start a conversation',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'The program',
					title: 'Used racks, local volunteers, practical installations.',
					body: 'Many years ago TBAG conceptualized purchasing used bike racks and installing them inexpensively at local businesses. The project ebbs and flows with the supply of used racks and motivated volunteers. One of the first installs we remember is at Cornish Pasty on Hardy and University—and it is still there.\n\nDuring the Preston Swan years, another flurry of installs included Rag-O-Rama (now Arizona Distilling Co.) and a dance studio on McClintock.'
				}),
				block('text', {
					eyebrow: 'Local examples',
					title: 'Every site has a different constraint.',
					body: 'Recent installs include a shortened, freshened-up rack at Neighborhood Outreach Access to Health (N.O.A.H.), where an 8-foot rack was too long for the available space. A welder removed a hoop, reattached the tabs, and the rack received a bright blue powder coat (RAL 5015).\n\nFour Peaks kept the original brown/rust finish and used the rack’s weight so the paver area can stay multiuse. Fuel to Fit had concrete alcoves exactly 8 feet wide, so Bob from [Bike Saviours](https://www.bikesaviours.org) modified a rack to fit before the City Transit team installed it in the right-of-way.'
				}),
				block('text', {
					eyebrow: 'More local examples',
					title: 'A rack project is also a partnership.',
					body: 'TBAG worked with Kenneth at Pinnacle Prevention in Chandler to select a flat black that matched the building trim; a board member borrowed a hammer drill and installed it. A bright safety-orange rack was installed behind Ted’s Hot Dogs on Broadway Road, making it easier to bike to the nearby UPS Store. There was also a new Korean BBQ place and another restaurant finishing its remodel before opening.\n\nThe source page thanks Seth, Brandon, Richard, Bob, Pat, EVBOM, Bike Saviours, and the City Transit team for helping turn a small idea into useful bike parking.'
				}),
				block('gallery', {
					eyebrow: 'From the project archive',
					title: 'See the racks and the places they serve',
					gallery_source_page: 'bike-racks'
				}),
				block('call_to_action', {
					eyebrow: 'For businesses and neighbors',
					title: 'Know a place that needs better bike parking?',
					body: 'Share the location and what you are seeing. TBAG can explain current costs and options, and the source page invites interested businesses to reach out for a site conversation at [info@biketempe.org](mailto:info@biketempe.org).',
					button_label: 'Tell TBAG about it',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'bike-valet',
			slug: 'bike-valet',
			title: 'Bike valet',
			description: 'The TBAG bike valet program and volunteer story.',
			seo_description:
				'Learn about Tempe Bicycle Action Group’s free bike valet program, event partnerships, and volunteer opportunities.',
			blocks: [
				block('hero', {
					eyebrow: 'Arrive without the parking hassle',
					title: 'A safe, simple place to leave your bike.',
					button_label: 'Volunteer with TBAG',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'Why bike valet matters',
					title: 'Better event access for more people.',
					body: 'Tempe Bicycle Action Group offers free Bike Valet at nearby events. It gives attendees a safe, economical, and eco-friendly transportation option, especially in congested downtown areas where parking is scarce. TBAG has historically served as the City of Tempe’s bike-valet concessionaire and hosted two large and several smaller valet events each year.'
				}),
				block('text', {
					eyebrow: 'Program history',
					title: 'Built by volunteers, one event at a time.',
					body: 'The Innings Festival in February has historically been the largest event, with volunteers parking as many as 400 bikes in a day. Oktoberfest is another major event, where volunteers have enjoyed Four Peaks brews and brats.\n\nTBAG uses collapsible aluminum racks made by [Moved by Bikes](https://movedbybikes.com) and/or existing bike racks, plus a ticketed system for fast, reliable drop-off and pickup. Volunteer shifts are usually no more than four hours. Questions can be sent to [info@biketempe.org](mailto:info@biketempe.org).'
				}),
				block('gallery', {
					eyebrow: 'From the program archive',
					title: 'Bike valet in the community',
					gallery_source_page: 'bike-valet'
				}),
				block('call_to_action', {
					eyebrow: 'Want to help?',
					title: 'A short shift can make the whole event feel more welcoming.',
					body: 'Volunteer shifts are usually no more than a few hours. The next opportunity will be announced through TBAG’s email list and calendar.',
					button_label: 'See ways to help',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'cyclists-feat',
			slug: 'cyclists-feat',
			title: 'Cyclist’s Feat — Farmer Avenue artwork',
			description:
				'The story of the public artwork created for a traffic-calming project on Farmer Avenue.',
			seo_description:
				'Read the story of Cyclist’s Feat, the Farmer Avenue public-art and traffic-calming project supported by Tempe Bicycle Action Group.',
			blocks: [
				block('hero', {
					eyebrow: 'A street can tell a story',
					title: 'Cyclist’s Feat on Farmer Avenue.',
					button_label: 'See more photos',
					button_url: `${TBAG_INTERNAL_ROUTES.cyclistsFeat}#gallery`
				}),
				block('text', {
					eyebrow: '2011–2013',
					title: 'Public art shaped around safer movement.',
					body: 'In 2011, TBAG worked with [coLAB Studio](https://www.colabstudio.com) to design artwork for the right of way on Farmer Avenue. The City of Tempe’s call to artists was intended to enhance a traffic-calming project that built four sets of chicanes. You can also view [coLAB’s initial proposal](/assets?panel=files&q=Cyclist%27s%20Feat).\n\nThe installation was completed in late 2013. coLAB hand-selected each boulder to fit and support the artwork, and TBAG kept photos from immediately after installation.'
				}),
				block('text', {
					eyebrow: 'The work continued',
					title: 'Public projects live in the real world.',
					body: 'Drivers repeatedly struck the installations, probably within the first year or two. coLAB repaired the damaged artwork and found new boulders that worked with the existing pieces. TBAG then worked with the City to have the artwork adopted into the City’s public-art program so the City could pursue compensation from drivers’ insurance for future repairs.\n\nMost damage happened at night in single-car collisions without police reports. The City eventually paused repairs and decided relocation was the better solution. TBAG proposed Papago Park; the City found easement spaces along Farmer instead. In late 2022, TBAG noticed that coLAB had already selected and installed the new boulders. The source archive closes with photos of the completed artwork, including one from a rare rainy day.'
				}),
				block('gallery', {
					eyebrow: 'From the archive',
					title: 'See the artwork and the places around it',
					gallery_source_page: 'cyclists-feat'
				})
			]
		}),
		resourcePage({
			id: 'bike-friendly-businesses',
			slug: 'bike-friendly-businesses',
			title: 'Businesses with cyclist discounts',
			description: 'A community list of places that have welcomed customers arriving by bike.',
			seo_description:
				'Find Tempe and nearby businesses that have offered cyclist discounts, and suggest a business for the community list.',
			blocks: [
				block('hero', {
					eyebrow: 'Ride, arrive, enjoy',
					title: 'Good places make room for bikes.',
					button_label: 'Suggest a business',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'Community list',
					title: 'Look for the cyclist-friendly sticker.',
					body: 'TBAG’s list shared businesses offering discounts to bikers. Look for the sticker in the window.\n\n[Pastries N Chaat](https://www.pastriesnchaattempe.com)\n920 E University Dr, Unit 103 · Tempe, AZ 85281 · (602) 365-0850\n\n[The Hudson](https://hudsontempe.com)\n1601 East Apache Boulevard · Tempe, AZ 85281 · (480) 699-4173\n\n[Shawarma Paradise](https://places.singleplatform.com)\n1045 E Lemon St · Tempe, AZ 85281 · (480) 968-8646\n\n[Chen’s Noodle House](https://chensnoodletogo.com)\n1043 E Lemon St · Tempe, AZ 85281 · (480) 912-2773'
				}),
				block('text', {
					eyebrow: 'Community list · continued',
					title: 'More places that welcomed riders.',
					body: 'Ako’s International Marketplace\n1400 S McClintock Dr #14 · Tempe, AZ 85281 · (480) 317-9000\n\n[Que Chevere](https://quechevereaz.com)\n142 W Main St · Mesa, AZ 85201 · (480) 474-4954\n\n[Tacos Chiwas](https://www.tacoschiwas.com)\n127 W Main St · Mesa, AZ 85201 · (480) 590-7163\n\nThis is an archived community list. Discounts, addresses, phone numbers, and business status can change, so confirm before making a special trip.'
				}),
				block('gallery', {
					eyebrow: 'The original window sticker',
					title: 'A small sign that welcomed riders.',
					gallery_source_page: 'bike-friendly-businesses'
				}),
				block('text', {
					eyebrow: 'Keep it current',
					title: 'A useful recommendation has a date on it.',
					body: 'If you own a business, know of a new cyclist-friendly place, or notice an outdated listing, let TBAG know. We can update the list so it reflects what the community can actually expect.'
				}),
				block('call_to_action', {
					eyebrow: 'Share a local favorite',
					title: 'Help more riders find their next stop.',
					body: 'Tell us the business name, location, and what makes it welcoming to people arriving by bike.',
					button_label: 'Send a suggestion',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'general',
			slug: 'general',
			title: 'General contact',
			description: 'The official general contact information for Tempe Bicycle Action Group.',
			seo_description:
				'Contact Tempe Bicycle Action Group by email or mail for general questions and organizational matters.',
			blocks: [
				block('hero', {
					eyebrow: 'Reach the organization',
					title: 'Questions, ideas, or a good reason to connect?',
					button_label: 'Email TBAG',
					button_url: 'mailto:info@biketempe.org'
				}),
				block('text', {
					eyebrow: 'General contact',
					title: 'Start with the shared inbox.',
					body: 'EMAIL\n[info@biketempe.org](mailto:info@biketempe.org)\n\nPOST MAIL\nTempe Bicycle Action Group\nP.O. Box 1884\nTempe, AZ 85280'
				}),
				block('contact', {
					eyebrow: 'Keep in touch',
					title: 'Stay connected to the work.'
				}),
				block('call_to_action', {
					eyebrow: 'Find your next step',
					title: 'See the work, then join in.',
					body: 'Browse current projects and practical resources, or join the email list for the next action and volunteer opportunity.',
					button_label: 'Take action',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		}),
		resourcePage({
			id: 'social-contract-to-volunteers',
			slug: 'social-contract-to-volunteers',
			title: 'Social Contract to Volunteers',
			description:
				'TBAG’s ratified expectations for organizers, volunteers, and a respectful working environment.',
			seo_description:
				'Read Tempe Bicycle Action Group’s Social Contract to Volunteers, including organization, communication, support, and conduct expectations.',
			blocks: [
				block('hero', {
					eyebrow: 'RATIFIED',
					title: 'A clear promise to the people who make the work happen.',
					button_label: 'Volunteer with TBAG',
					button_url: TBAG_INTERNAL_ROUTES.action
				}),
				block('text', {
					eyebrow: 'The promise',
					title: 'No surprises for organizers and volunteers.',
					body: 'TBAG Social Contract to Organizers — RATIFIED. The contract explains what the organization will do, will not do, and may do for people who volunteer to organize projects. It exists so organizers can understand their role, know the expectations on both sides, have a pleasant experience, and be free from unpleasant surprises.'
				}),
				block('text', {
					eyebrow: 'How TBAG is organized',
					title: 'Roles are clear, but the work is shared.',
					body: 'The organization has a Board, team leads appointed by the Board, and volunteer team members. Some roles are temporary and some continue over time. The Board may appoint organizers, fill vacancies, or hire and replace organizers when a project requires it. Each role should have a clear description, and volunteers can give input about what that role needs.'
				}),
				block('text', {
					eyebrow: 'Communication and support',
					title: 'Use the right channel and make the details visible.',
					body: 'Basecamp is TBAG’s primary communication tool for todos, deadlines, and project discussions. Keeping the work there reduces the need for status reports and managers and lets project organizers come and go without losing track of volunteers or other resources. If you prefer not to use Basecamp, provide equivalent details to the President or Board.'
				}),
				block('text', {
					eyebrow: 'Communication and support · continued',
					title: 'An org chart makes ownership easier to find.',
					body: 'TBAG keeps an org chart up to date. Some contacts are aliases, such as [info@biketempe.org](mailto:info@biketempe.org), or Basecamp teams that can be added to a discussion; other contacts are individual people. Volunteers have freedom to choose artists, volunteers, and many project details, while some resources are controlled by a position or team, such as social media. Job descriptions identify who owns a responsibility—for example, a project may buy T-shirts with an approved budget, while the communications team has final say over what enters the newsletter.'
				}),
				block('text', {
					eyebrow: 'A respectful environment',
					title: 'Open work requires respect.',
					body: 'No one may insult, intimidate, threaten, or harass another person while doing TBAG work or representing TBAG. TBAG does not discriminate on the basis of ethnicity, gender, religion, gender identity, or sexual preference, and aims to accommodate differences in ability and age. The Board is responsible for resolving conflicts and may remove people when necessary to maintain an open, accepting environment.'
				}),
				block('text', {
					eyebrow: 'A clear point of contact',
					title: 'Concerns should arrive through the person you choose.',
					body: 'When you take on a role, a Board member is appointed as your primary contact, and you have input into who that is. You may ask another Board member to take over if the working relationship is not productive. If the Board has a concern, your point of contact is the person who should raise it with you; comments from volunteers, former Board members, or the wider community are suggestions. The President is always available for conflict resolution.'
				}),
				block('text', {
					eyebrow: 'Roles and accountability',
					title: 'Freedom comes with a visible way to adjust course.',
					body: 'You do not have to talk with everyone. If your role reports to the Board, you may be asked questions at a Board meeting, added to the Board Basecamp, and notified of meetings. If you are managing something unfamiliar, TBAG can assign a mentor; a mentor is separate from your primary Board contact. Board recommendations are suggestions unless the Board reaches a majority consensus about a concern. The Board may change coordinators when deadlines, inactivity, or a time-sensitive project require it, but aims to communicate concerns through the point of contact first.'
				}),
				block('text', {
					eyebrow: 'Roles and accountability · continued',
					title: 'Volunteers shape their role.',
					body: 'You do not have a boss, and no one may order you to do work outside your position description. You have input into the description and may redefine your role. A significant change should come to the Board through your primary contact. The Board may add help or replace an organizer when it believes that is the best way to meet a deadline, but the contract’s intent is to work with people and avoid surprises.'
				}),
				block('call_to_action', {
					eyebrow: 'Ready to contribute?',
					title: 'Find a role that fits your time and skills.',
					body: 'Volunteer with clear expectations, a point of contact, and support from the community around you.',
					button_label: 'See ways to help',
					button_url: TBAG_INTERNAL_ROUTES.action
				})
			]
		})
	];
}

export function ensureTempeBicycleActionGroupPages(value, { group = {}, homeBlocks = [] } = {}) {
	const currentPages = normalizeGroupSitePages(value, { homeBlocks });
	const defaultPages = buildTempeBicycleActionGroupSite(group).site_pages;
	const defaultById = new Map(defaultPages.map((page) => [page.id, page]));
	const refreshedPages = currentPages.map((page) => {
		const sourcePage = defaultById.get(page.id);
		// Pages created by the first importer were intentionally marked only after
		// the source-audit pass. Refresh those unmarked source pages once, while
		// preserving later owner edits to pages carrying a source revision.
		if (sourcePage && TBAG_SOURCE_AUDITED_PAGE_IDS.has(page.id) && !page.source_revision) {
			return sourcePage;
		}
		return page;
	});
	const currentIds = new Set(refreshedPages.map((page) => page.id));
	const missingPages = defaultPages.filter((page) => !currentIds.has(page.id));
	return normalizeGroupSitePages([...refreshedPages, ...missingPages], { homeBlocks });
}

export function buildTempeBicycleActionGroupSite(group = {}) {
	const homeBlocks = [
		block('hero', {
			eyebrow: 'Tempe’s bicycle advocacy organization',
			title: 'Make every Tempe trip safer by bike.',
			button_label: 'Take action',
			button_url: '/take-action'
		}),
		block('story', {
			eyebrow: 'Why this matters',
			title: 'A more bikeable Tempe is built together.'
		}),
		block('updates', {
			eyebrow: 'The work in motion',
			title: 'News, campaigns, and community updates',
			body: 'Follow the latest calls to action, public conversations, project updates, and stories from Tempe’s cycling community.',
			button_label: 'Read the news'
		}),
		block(
			'call_to_action',
			{
				eyebrow: 'Use your voice',
				title: 'Help shape streets that work for everyone.',
				body: 'Learn what is changing in Tempe, find practical ways to help, and show decision-makers that safe, connected transportation matters.',
				button_label: 'See ways to help',
				button_url: '/take-action'
			},
			'site-tbag-action'
		),
		block('resources', {
			eyebrow: 'Practical tools',
			title: 'Maps, data, guides, and local know-how',
			body: 'Find the resources that make it easier to ride, advocate, and help more people feel at home on Tempe streets.',
			button_label: 'Browse resources'
		}),
		block('gallery', {
			eyebrow: 'Around Tempe',
			title: 'The people and places behind the work'
		}),
		block('email_signup', {
			eyebrow: 'Stay connected',
			title: 'Get the next useful update',
			body: 'Choose the updates you want—from advocacy alerts and volunteer opportunities to rides, events, and fun.'
		}),
		block('contact', {
			eyebrow: 'Keep in touch',
			title: 'Questions, ideas, or a project to share?'
		})
	].filter(Boolean);

	const pages = normalizeGroupSitePages(
		[
			createGroupSitePage({
				id: 'home',
				title: 'Home',
				nav_label: 'Home',
				is_home: true,
				description: 'A trusted local voice for safer streets and better bicycling in Tempe.',
				seo_description:
					'Tempe Bicycle Action Group works for safer streets, better bicycling, and a more connected Tempe through education, grassroots events, and civic participation.',
				blocks: homeBlocks
			}),
			createGroupSitePage({
				id: 'take-action',
				title: 'Take Action',
				nav_label: 'Take action',
				slug: 'take-action',
				description: 'Turn concern into practical, local action for safer streets.',
				blocks: [
					block('hero', {
						title: 'Your voice belongs in the transportation conversation.',
						button_label: 'Join the email list',
						button_url: TBAG_INTERNAL_ROUTES.join
					}),
					block('text', {
						eyebrow: 'Start here',
						title: 'Small actions add up to visible change.',
						body: 'Join the email list for clear action alerts, learn how Tempe decisions affect people who bike, and bring your experience to the people planning our streets.'
					}),
					block('volunteer', {
						eyebrow: 'Lend a hand',
						title: 'Help make the next project happen.',
						body: 'There are many ways to help: count bikes, share information, support events, write a letter, or contribute a skill.',
						button_label: 'Join the email list',
						button_url: TBAG_INTERNAL_ROUTES.join
					}),
					block('email_signup', {
						eyebrow: 'Stay ready',
						title: 'Get advocacy alerts and volunteer asks',
						body: 'Choose only the topics you want to hear about. You can unsubscribe at any time.'
					}),
					block(
						'call_to_action',
						{
							eyebrow: 'Support the mission',
							title: 'Help fund local bicycle advocacy.',
							body: 'Your support helps TBAG keep showing up for safer, more convenient bicycling in Tempe.',
							button_label: 'See donation options',
							button_url: TBAG_INTERNAL_ROUTES.donate
						},
						'site-tbag-donate'
					),
					block('contact')
				]
			}),
			createGroupSitePage({
				id: 'projects',
				title: 'Projects',
				nav_label: 'Projects',
				slug: 'projects',
				description:
					'Explore the programs, projects, and partnerships that make bicycling more visible in Tempe.',
				blocks: [
					block('hero', {
						title: 'Practical projects. Long-term change.',
						button_label: 'Explore projects',
						button_url: '/assets'
					}),
					block('text', {
						eyebrow: 'What we do',
						title: 'From bike counts to bike racks, the details matter.',
						body: 'TBAG has helped bring bicycle valet to local events, supported bike rack installations, promoted cyclist-friendly businesses, organized bike counts, and partnered with the community on better street design.'
					}),
					block('resources', {
						eyebrow: 'Explore the work',
						title: 'Project pages, reports, and local partners',
						body: 'Browse the project links and source material that document the work over the years.',
						button_label: 'Open project resources'
					}),
					block('gallery', { eyebrow: 'In the community', title: 'Projects in the real world' }),
					block(
						'call_to_action',
						{
							eyebrow: 'Have a project idea?',
							title: 'Tell us what you are seeing on the street.',
							body: 'Share a safety concern, a useful local resource, or a business that makes arriving by bike easier.',
							button_label: 'Contact TBAG',
							button_url: '/#contact'
						},
						'site-tbag-project-contact'
					)
				]
			}),
			createGroupSitePage({
				id: 'calendar',
				title: 'Calendar',
				nav_label: 'Calendar',
				slug: 'calendar',
				description: 'Public meetings, community events, and opportunities to show up.',
				blocks: [
					block('hero', {
						title: 'Find a good time to show up.',
						button_label: 'Open the calendar',
						button_url: TBAG_INTERNAL_ROUTES.calendar
					}),
					block('text', {
						eyebrow: 'Before you go',
						title: 'Check the live calendar for the latest details.',
						body: 'The calendar includes public meetings and community gatherings. Some events are not hosted or endorsed by TBAG, and dates can change, so confirm the details before attending.'
					}),
					block(
						'call_to_action',
						{
							eyebrow: 'TBAG public calendar',
							title: 'See current dates and event details.',
							body: 'Check the public calendar before you go for the latest meeting times, locations, and event notes.',
							button_label: 'Open the calendar',
							button_url: TBAG_INTERNAL_ROUTES.calendar
						},
						'site-tbag-calendar'
					),
					block('email_signup', {
						eyebrow: 'Never miss the useful part',
						title: 'Get meeting reminders and action alerts.'
					})
				]
			}),
			createGroupSitePage({
				id: 'about',
				title: 'About',
				nav_label: 'About',
				slug: 'about',
				description: 'Learn about TBAG’s mission, history, and people.',
				source_revision: TBAG_SOURCE_CONTENT_REVISION,
				blocks: [
					block('hero', {
						eyebrow: 'Our mission',
						title: 'Make bicycling prominent, safe, and convenient in Tempe.',
						button_label: 'Take action',
						button_url: '/take-action'
					}),
					block('story', {
						eyebrow: 'Why TBAG exists',
						title: 'A unified voice for people who ride.',
						body: 'Tempe Bicycle Action Group is an organized group of people who ride bicycles and want to make bicycling a prominent, safe, and convenient form of transportation and recreation in Tempe, Arizona and surrounding areas. We work through education, grassroots events, and civic participation.'
					}),
					block('text', {
						eyebrow: 'Our goals',
						title: 'Build the conditions for everyday bicycling.',
						body: '- Collaborate with Tempe and neighboring communities to make bicycling prominent, safe, and convenient.\n- Cooperate with bicycle and alternative-transportation organizations.\n- Provide an online knowledge base for regional cycling information, routes, rides, events, and organizations.\n- Represent cyclists’ interests in local, regional, and state government.'
					}),
					block('text', {
						eyebrow: 'Our goals · continued',
						title: 'Turn a shared belief into visible work.',
						body: '- Organize and promote grassroots cycling events.\n- Partner with local employers on policies and infrastructure that encourage bicycle commuting.\n- Support bicycling as a tool for community sustainability.\n\nTBAG brings a unified voice to City feedback, local advocacy, and conversations with the Mayor and City Council.'
					}),
					block('text', {
						eyebrow: 'Work you can see',
						title: 'Education, events, and practical projects.',
						body: 'The organization’s work has included free bike valet at events, installing bike racks, building a bicycle-friendly business program, participating in Bike Month and Bike to Work Day, organizing social rides, distributing lights and locks, and offering safety and commuting training.'
					}),
					block('text', {
						eyebrow: 'Open records',
						title: 'Understand the people and promises behind the work.',
						body: 'Read the [board history](/board), [bylaws](/bylaws), [general contact information](/general), and [Social Contract to Volunteers](/social-contract-to-volunteers). These pages preserve the source organization’s public record while keeping the site’s working details easy to find.'
					}),
					block('contact', { eyebrow: 'Reach the organization', title: 'Connect with TBAG' })
				]
			}),
			...buildTempeBicycleActionGroupResourcePages()
		],
		{ homeBlocks }
	);

	pages[0].navigation = { items: buildNavigation(pages) };

	const name = clean(group.name) || TBAG_SOURCE_NAME;
	return {
		site_title: name,
		site_tagline: 'Safer streets. Better bicycling. A stronger Tempe.',
		home_intro:
			'Tempe Bicycle Action Group works to make bicycling a prominent, safe, and convenient way to get around and enjoy Tempe. We bring the cycling community together to educate, show up, and help shape a more connected city.',
		featured_quote:
			'A more bikeable Tempe is built one voice, one trip, and one welcoming street at a time.',
		footer_blurb:
			'A Tempe-based 501(c)(3) working through education, grassroots events, and civic participation.',
		seo_description:
			'Tempe Bicycle Action Group works for safer streets, better bicycling, and a more connected Tempe through education, grassroots events, and civic participation.',
		hero_style: 'bold',
		background_style: 'cinematic',
		panel_style: 'filled',
		panel_tone: 'surface',
		panel_density: 'comfortable',
		font_pairing: 'editorial',
		theme_mode: 'custom',
		theme_name: '',
		theme_colors: { ...TBAG_COLORS },
		simple_mode: true,
		microsite_notice: '',
		microsite_notice_href: '',
		new_rider_note: '',
		meeting_instructions:
			'Public meetings and events are announced through the calendar and email list. Details can change, so check before attending.',
		faq_1_q: 'What does TBAG work on?',
		faq_1_a:
			'We support safer bicycle infrastructure, transportation planning, education, grassroots events, and practical resources for people who bike in Tempe and nearby communities.',
		faq_2_q: 'How can I help?',
		faq_2_a:
			'Join the email list, attend a public meeting, volunteer for a project, share what you are seeing on the street, or support the work financially.',
		safety_note:
			'Traffic laws and event details change. Check the linked source before you ride or attend.',
		sponsor_links: [],
		sponsor_items: [],
		ride_widget_enabled: false,
		ride_widget_title: 'Ride calendar',
		ride_widget_host_scope: 'group_only',
		ride_widget_group_ids: [],
		ride_widget_config: {},
		announcement_expires_at: null,
		sections: {
			story: true,
			stats: false,
			join: true,
			rides: false,
			volunteer: true,
			news: true,
			gallery: true,
			contact: true
		},
		page_blocks: homeBlocks,
		site_pages: pages,
		ai_prompt: '',
		published: true,
		site_variant: TBAG_MICROSITE_VARIANT
	};
}
