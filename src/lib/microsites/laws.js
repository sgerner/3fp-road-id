/**
 * State safe-passing reference data supplied in 3FT Laws.xlsx.
 *
 * This is intentionally presented as a dated educational reference. Traffic
 * statutes change, so the UI points people back to the linked source before
 * they rely on a rule for advocacy, enforcement, or legal advice.
 */
export const THREE_FEET_LAWS_LAST_REVIEWED = '2022';
export const THREE_FEET_LAWS_SOURCE_FILE = '3FT Laws.xlsx';

export const THREE_FEET_LAWS = Object.freeze([
	{
		state: 'Alabama',
		passed: 2015,
		ranking: 44,
		status: 'specific',
		distance: '3 feet',
		statute: 'Alabama Code 32-5A-82',
		summary:
			'Alabama requires at least three feet when passing a cyclist. The law has exceptions tied to vehicle speed, roadway markings, and riding near the right shoulder, so the rule can be difficult to apply in practice.',
		sourceLabel: 'Alabama Code 32-5A-82',
		sourceUrl:
			'https://codes.findlaw.com/al/title-32-motor-vehicles-and-traffic/al-code-sect-32-5a-82.html'
	},
	{
		state: 'Alaska',
		passed: null,
		ranking: 41,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: '13 AAC 02.065',
		summary:
			'Alaska is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general vehicle-passing rules that require a safe distance.',
		sourceLabel: 'Bicycle Friendly States report card',
		sourceUrl: 'https://bikeleague.org/sites/default/files/BFS_Report_Card_2022_Alaska.pdf'
	},
	{
		state: 'Arizona',
		passed: 2000,
		ranking: 31,
		status: 'specific',
		distance: '3 feet',
		statute: 'Arizona Revised Statutes 28-735',
		summary:
			'Arizona requires at least three feet when passing a bicycle. The workbook notes questions around civil penalties and how the rule interacts with a present and passable bike lane.',
		sourceLabel: 'Arizona Revised Statutes 28-735',
		sourceUrl: 'https://www.azleg.gov/ars/28/00735.htm'
	},
	{
		state: 'Arkansas',
		passed: 2007,
		ranking: 39,
		status: 'specific',
		distance: '3 feet',
		statute: 'Arkansas Code 27-51-311',
		summary:
			'Arkansas requires at least three feet when passing a bicycle and does not add the bike-lane or vehicle-speed restrictions found in some other states. The workbook lists fines up to $100, or up to $1,000 for serious injury or death.',
		sourceLabel: 'Arkansas Code 27-51-311',
		sourceUrl:
			'https://law.justia.com/codes/arkansas/2020/title-27/subtitle-4/chapter-51/subchapter-3/section-27-51-311/'
	},
	{
		state: 'California',
		passed: 2014,
		ranking: 4,
		status: 'specific',
		distance: '3 feet',
		statute: 'California Vehicle Code 21760',
		summary:
			'California requires at least three feet when passing a bicycle. A driver may pass with less only when it is reasonable and prudent and does not endanger the person riding.',
		sourceLabel: 'California Vehicle Code 21760',
		sourceUrl:
			'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=21760.&lawCode=VEH'
	},
	{
		state: 'Colorado',
		passed: 2009,
		ranking: 7,
		status: 'variable-standard',
		distance: 'Safe clearance',
		statute: 'Colorado Title 42-4-1004',
		summary:
			'Colorado addresses passing cyclists through multiple traffic statutes covering oncoming vehicles and passing on the left or right. The law also explains how to measure the clearance between the vehicle and cyclist.',
		sourceLabel: 'Colorado Revised Statutes 42-4-1004',
		sourceUrl:
			'https://law.justia.com/codes/colorado/2021/title-42/article-4/part-10/section-42-4-1004/'
	},
	{
		state: 'Connecticut',
		passed: 2008,
		ranking: 20,
		status: 'specific',
		distance: '3 feet',
		statute: 'Connecticut General Statutes 14-232',
		summary:
			'Connecticut requires at least three feet when passing a bicycle. Breaking the rule is listed as an infraction.',
		sourceLabel: 'Connecticut General Statutes 14-232',
		sourceUrl:
			'https://codes.findlaw.com/ct/title-14-motor-vehicles-use-of-the-highway-by-vehicles-gasoline/ct-gen-st-sect-14-232.html'
	},
	{
		state: 'Delaware',
		passed: 2011,
		ranking: 9,
		status: 'specific',
		distance: '3 feet + lane change when available',
		statute: 'Delaware Code Title 21, § 4116',
		summary:
			'Delaware requires at least three feet and asks drivers to change lanes when a same-direction lane is available. When no extra lane exists, the three-foot minimum still applies.',
		sourceLabel: 'Delaware Code Title 21, § 4116',
		sourceUrl: 'https://codes.findlaw.com/de/title-21-motor-vehicles/de-code-sect-21-4116.html'
	},
	{
		state: 'District of Columbia',
		passed: null,
		ranking: null,
		status: 'specific',
		distance: '3 feet',
		statute: 'D.C. Code 18-2202.10',
		summary:
			'D.C. requires a driver to exercise due care and leave a safe distance, in no case less than three feet, when overtaking and passing a bicycle.',
		sourceLabel: 'D.C. Code 18-2202.10',
		sourceUrl: 'https://code.dccouncil.gov/us/dc/council/code/sections/50-2201.04'
	},
	{
		state: 'Florida',
		passed: 2006,
		ranking: 8,
		status: 'specific',
		distance: '3 feet',
		statute: 'Florida Statute 316.083',
		summary:
			'Florida requires at least three feet when passing a bicycle and applies the passing protection to other nonmotorized vehicles as well.',
		sourceLabel: 'Florida Statute 316.083',
		sourceUrl:
			'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0316/Sections/0316.083.html'
	},
	{
		state: 'Georgia',
		passed: 2011,
		ranking: 24,
		status: 'specific',
		distance: '3 feet',
		statute: 'Georgia Code 40-6-56',
		summary: 'Georgia requires at least three feet when passing a bicycle.',
		sourceLabel: 'Georgia Code 40-6-56',
		sourceUrl:
			'https://law.justia.com/codes/georgia/2021/title-40/chapter-6/article-3/section-40-6-56/'
	},
	{
		state: 'Hawaii',
		passed: 2018,
		ranking: 27,
		status: 'specific',
		distance: '3 feet',
		statute: 'Hawaii Revised Statutes 291C-43',
		summary:
			'Hawaii requires at least three feet of separation between the right side of the driver vehicle, including mirrors or projections, and the left side of the bicyclist.',
		sourceLabel: 'Hawaii Revised Statutes 291C-43',
		sourceUrl: 'https://codes.findlaw.com/hi/division-1-government/hi-rev-st-sect-291c-43.html'
	},
	{
		state: 'Idaho',
		passed: null,
		ranking: 40,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'Idaho Code 49-632',
		summary:
			'Idaho is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general vehicle-passing rules requiring a safe distance.',
		sourceLabel: 'Idaho Code 49-632',
		sourceUrl: 'https://codes.findlaw.com/id/title-49-motor-vehicles/id-st-sect-49-632/'
	},
	{
		state: 'Illinois',
		passed: 2007,
		ranking: 16,
		status: 'specific',
		distance: '3 feet',
		statute: 'Illinois Compiled Statutes 625 ILCS 5/11-703',
		summary: 'Illinois requires at least three feet when passing a bicycle or individual.',
		sourceLabel: 'Illinois Compiled Statutes 625 ILCS 5/11-703',
		sourceUrl: 'https://codes.findlaw.com/il/chapter-625-vehicles/il-st-sect-625-5-11-703/'
	},
	{
		state: 'Indiana',
		passed: 2019,
		ranking: 24,
		status: 'specific',
		distance: '3 feet',
		statute: 'Indiana Code 9-21-8-5',
		summary:
			'Indiana requires at least three feet when a vehicle overtakes a bicycle or electric bicycle. The workbook notes that the rule is difficult to find and was introduced through HB 1236.',
		sourceLabel: 'Indiana Code 9-21-8-5',
		sourceUrl: 'https://codes.findlaw.com/in/title-9-motor-vehicles/in-code-sect-9-21-8-5/'
	},
	{
		state: 'Iowa',
		passed: null,
		ranking: 25,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'Iowa Code 321.299',
		summary:
			'Iowa is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general passing rules requiring a safe distance; the workbook points advocates toward the Iowa Bicycle Coalition.',
		sourceLabel: 'Bicycle Friendly States report card',
		sourceUrl: 'https://bikeleague.org/sites/default/files/BFS_Report_Card_2022_Iowa.pdf'
	},
	{
		state: 'Kansas',
		passed: 2011,
		ranking: 30,
		status: 'specific',
		distance: '3 feet',
		statute: 'Kansas Statutes 8-1516',
		summary:
			'Kansas requires at least three feet when passing a bicycle. The law permits passing in a no-passing zone only when it is safe to do so.',
		sourceLabel: 'Kansas Statutes 8-1516',
		sourceUrl:
			'https://codes.findlaw.com/ks/chapter-8-automobiles-and-other-vehicles/ks-st-sect-8-1516.html'
	},
	{
		state: 'Kentucky',
		passed: 2018,
		ranking: 37,
		status: 'specific',
		distance: '3 feet',
		statute: 'Kentucky Revised Statute 189.340',
		summary:
			'Kentucky requires a minimum of three feet when passing a bicycle and also applies the legislation to electric low-speed scooters. Where three feet is unavailable, the driver must use reasonable caution.',
		sourceLabel: 'Kentucky Revised Statute 189.340',
		sourceUrl: 'https://law.justia.com/codes/kentucky/2022/chapter-189/section-189-340/'
	},
	{
		state: 'Louisiana',
		passed: 2009,
		ranking: 33,
		status: 'specific',
		distance: '3 feet',
		statute: 'Louisiana Revised Statutes 32:76.1',
		summary:
			'Louisiana requires a minimum of three feet when passing a bicycle. Passing in a no-passing zone is allowed only when it is safe to do so.',
		sourceLabel: 'Louisiana Revised Statutes 32:76.1',
		sourceUrl: 'https://codes.findlaw.com/la/revised-statutes/la-rev-stat-tit-32-sect-76-1.html'
	},
	{
		state: 'Maine',
		passed: 2007,
		ranking: 26,
		status: 'specific',
		distance: '3 feet',
		statute: 'Maine Revised Statutes, Title 29-A',
		summary:
			'Maine requires at least three feet when passing a bicycle and expressly allows a vehicle to cross the centerline in a no-passing zone to pass when it is safe.',
		sourceLabel: 'Maine Department of Transportation bicycle laws',
		sourceUrl: 'https://www.maine.gov/mdot/bikeped/docs/MaineBicyclingLaws.pdf'
	},
	{
		state: 'Maryland',
		passed: 2010,
		ranking: 14,
		status: 'specific',
		distance: '3 feet',
		statute: 'Maryland Transportation Code 21-1209',
		summary:
			'Maryland requires at least three feet when passing a bicycle, with exceptions related to road width, the rider position, and whether the rider alone caused the clearance to be smaller.',
		sourceLabel: 'Maryland Transportation Code 21-1209',
		sourceUrl: 'https://codes.findlaw.com/md/transportation/md-code-transp-sect-21-1209.html'
	},
	{
		state: 'Massachusetts',
		passed: 2022,
		ranking: 1,
		status: 'higher-standard',
		distance: '4 feet',
		statute: 'Massachusetts General Laws, Chapter 90, § 14',
		summary:
			'Massachusetts is listed as a four-foot passing state. The workbook identifies it as the third state to adopt a four-foot law, alongside Pennsylvania and New Jersey.',
		sourceLabel: 'Bicycle Friendly States report card',
		sourceUrl: 'https://bikeleague.org/sites/default/files/BFS_Report_Card_2022_Massachusetts.pdf'
	},
	{
		state: 'Michigan',
		passed: 2018,
		ranking: 11,
		status: 'specific',
		distance: '3 feet',
		statute: 'Michigan Compiled Laws 257.636',
		summary:
			'Michigan requires at least three feet when passing a bicycle. Passing in a no-passing zone is allowed when it is safe to do so.',
		sourceLabel: 'Michigan Compiled Laws 257.636',
		sourceUrl: 'https://codes.findlaw.com/mi/chapter-257-motor-vehicles/mi-comp-laws-257-636/'
	},
	{
		state: 'Minnesota',
		passed: 2004,
		ranking: 5,
		status: 'specific',
		distance: '3 feet',
		statute: 'Minnesota Statutes 169.18',
		summary:
			'Minnesota requires no less than three feet of clearance when passing a bicycle. The workbook notes a narrow exception for peace officers riding bicycles while performing their duties.',
		sourceLabel: 'Minnesota Statutes 169.18',
		sourceUrl: 'https://codes.findlaw.com/mn/transportation-ch-160-174a/mn-st-sect-169-18.html'
	},
	{
		state: 'Mississippi',
		passed: 2010,
		ranking: 48,
		status: 'specific',
		distance: '3 feet',
		statute: 'Mississippi Code 63-3-1309',
		summary:
			'Mississippi requires at least three feet when passing a bicycle. Passing in a no-passing zone is allowed only when it is safe to do so.',
		sourceLabel: 'Mississippi Code 63-3-1309',
		sourceUrl:
			'https://codes.findlaw.com/ms/title-63-motor-vehicles-traffic-regulations/ms-code-sect-63-3-1309.html'
	},
	{
		state: 'Missouri',
		passed: null,
		ranking: 45,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'Missouri Revised Statute 300.411',
		summary:
			'Missouri is listed without a specific statewide passing-distance requirement for cyclists. General rules require a safe distance and the highest degree of care to avoid collisions.',
		sourceLabel: 'Missouri Revised Statute 300.411',
		sourceUrl:
			'https://codes.findlaw.com/mo/title-xix-motor-vehicles-watercraft-and-aviation/mo-rev-st-300-411.html'
	},
	{
		state: 'Montana',
		passed: null,
		ranking: 42,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'Montana Code 61-8-320',
		summary:
			'Montana is listed without a specific statewide passing-distance requirement for cyclists. The statute still bars intentional interference and passing unless it can be done safely without endangering the person riding.',
		sourceLabel: 'Montana Code 61-8-320',
		sourceUrl: 'https://codes.findlaw.com/mt/title-61-motor-vehicles/mt-code-ann-sect-61-8-320.html'
	},
	{
		state: 'Nebraska',
		passed: 2012,
		ranking: 49,
		status: 'specific',
		distance: '3 feet',
		statute: 'Nebraska Revised Statute 60-6,133',
		summary: 'Nebraska requires no less than three feet when passing a bicycle.',
		sourceLabel: 'Nebraska Revised Statute 60-6,133',
		sourceUrl: 'https://codes.findlaw.com/ne/chapter-60-motor-vehicles/ne-rev-st-sect-60-6-133.html'
	},
	{
		state: 'New Hampshire',
		passed: 2008,
		ranking: 36,
		status: 'variable-standard',
		distance: '3 feet at 30 mph; +1 foot per 10 mph',
		statute: 'New Hampshire Revised Statutes 265:143-a',
		summary:
			'New Hampshire starts at three feet and adds one foot for every 10 mph over 30 mph: at least four feet at 40 mph, five feet at 50 mph, and so on.',
		sourceLabel: 'New Hampshire Revised Statutes 265:143-a',
		sourceUrl:
			'https://law.justia.com/codes/new-hampshire/2021/title-xxi/title-265/section-265-143-a/'
	},
	{
		state: 'North Carolina',
		passed: 1995,
		ranking: 18,
		status: 'limited-standard',
		distance: '2 feet',
		statute: 'North Carolina General Statutes 20-149',
		summary:
			'North Carolina is listed with a two-foot passing rule, but the rule applies to a vehicle passing another vehicle rather than specifically to a vehicle passing a bicycle.',
		sourceLabel: 'North Carolina General Statutes 20-149',
		sourceUrl: 'https://codes.findlaw.com/nc/chapter-20-motor-vehicles/nc-gen-st-sect-20-149.html'
	},
	{
		state: 'North Dakota',
		passed: 2021,
		ranking: 38,
		status: 'specific',
		distance: '3 feet',
		statute: 'North Dakota Century Code 39-10-11',
		summary: 'North Dakota requires no less than three feet when passing a bicycle.',
		sourceLabel: 'North Dakota Century Code 39-10-11',
		sourceUrl:
			'https://codes.findlaw.com/nd/title-39-motor-vehicles/nd-cent-code-sect-39-10-11.html'
	},
	{
		state: 'Nevada',
		passed: 2011,
		ranking: 34,
		status: 'specific',
		distance: '3 feet + move left when available',
		statute: 'Nevada Revised Statute 484B.270',
		summary:
			'Nevada requires at least three feet and asks drivers to move to the lane immediately left when there is more than one same-direction lane and it is reasonably safe.',
		sourceLabel: 'Nevada Revised Statute 484B.270',
		sourceUrl:
			'https://codes.findlaw.com/nv/title-43-public-safety-vehicles-watercraft/nv-rev-st-484b-270/'
	},
	{
		state: 'New Jersey',
		passed: 2021,
		ranking: 16,
		status: 'higher-standard',
		distance: '4 feet + no more than 25 mph',
		statute: 'New Jersey Statute 39:4-92.4',
		summary:
			'New Jersey requires at least four feet when passing a bicycle and limits the passing vehicle to no more than 25 mph.',
		sourceLabel: 'New Jersey Statute 39:4-92.4',
		sourceUrl: 'https://law.justia.com/codes/new-jersey/2021/title-39/section-39-4-92-4/'
	},
	{
		state: 'New Mexico',
		passed: null,
		ranking: 44,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'New Mexico Statutes 66-7-310',
		summary:
			'New Mexico is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general vehicle-passing rules requiring a safe distance.',
		sourceLabel: 'New Mexico Statutes 66-7-310',
		sourceUrl: 'https://codes.findlaw.com/nm/chapter-66-motor-vehicles/nm-st-sect-66-7-310.html'
	},
	{
		state: 'New York',
		passed: null,
		ranking: 13,
		status: 'no-specific-law',
		distance: 'Safe distance',
		statute: 'New York Vehicle and Traffic Law 1122-a',
		summary:
			'New York is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general vehicle-passing rules requiring a safe distance.',
		sourceLabel: 'New York Vehicle and Traffic Law 1122-a',
		sourceUrl: 'https://codes.findlaw.com/ny/vehicle-and-traffic-law/vat-sect-1122-a.html'
	},
	{
		state: 'Ohio',
		passed: 2016,
		ranking: 17,
		status: 'specific',
		distance: '3 feet',
		statute: 'Ohio Revised Code 4511.27',
		summary:
			'Ohio requires three feet or greater when passing a bicycle. The workbook notes an additional fine when distracted driving contributes to the violation.',
		sourceLabel: 'Bicycle Friendly States report card',
		sourceUrl: 'https://bikeleague.org/sites/default/files/BFS_Report_Card_2022_Ohio.pdf'
	},
	{
		state: 'Oklahoma',
		passed: 2006,
		ranking: 47,
		status: 'specific',
		distance: '3 feet',
		statute: 'Oklahoma Statute 47-11-1208',
		summary: 'Oklahoma requires at least three feet when passing a bicycle.',
		sourceLabel: 'Oklahoma Statute 47-11-1208',
		sourceUrl: 'https://law.justia.com/codes/oklahoma/2022/title-47/section-47-11-1208/'
	},
	{
		state: 'Oregon',
		passed: 2007,
		ranking: 2,
		status: 'variable-standard',
		distance: 'Enough room to avoid contact if rider falls',
		statute: 'Oregon Revised Statute 811.065',
		summary:
			'Oregon requires a distance sufficient to prevent contact if the person operating the bicycle were to fall into the driver lane. The workbook notes that applying this flexible standard can be difficult.',
		sourceLabel: 'Oregon Revised Statute 811.065',
		sourceUrl:
			'https://codes.findlaw.com/or/title-59-oregon-vehicle-code/or-rev-st-sect-811-065.html'
	},
	{
		state: 'Pennsylvania',
		passed: 2012,
		ranking: 11,
		status: 'higher-standard',
		distance: '4 feet',
		statute: 'Pennsylvania Consolidated Statutes Title 75, § 3303',
		summary:
			'Pennsylvania requires at least four feet when passing a bicycle, the largest fixed minimum identified in the workbook.',
		sourceLabel: 'Pennsylvania Consolidated Statutes Title 75, § 3303',
		sourceUrl: 'https://codes.findlaw.com/pa/title-75-pacsa-vehicles/pa-csa-sect-75-3303.html'
	},
	{
		state: 'Rhode Island',
		passed: 2021,
		ranking: 21,
		status: 'variable-standard',
		distance: 'Enough room to avoid contact if rider falls',
		statute: 'Rhode Island General Laws 31-15-18',
		summary:
			'Rhode Island requires a distance sufficient to prevent contact if the person operating the bicycle were to fall into the driver lane. The workbook notes that this flexible standard can be difficult to apply.',
		sourceLabel: 'Rhode Island General Laws 31-15-18',
		sourceUrl:
			'https://codes.findlaw.com/ri/title-31-motor-and-other-vehicles/ri-gen-laws-sect-31-15-18.html'
	},
	{
		state: 'South Carolina',
		passed: null,
		ranking: 43,
		status: 'no-specific-law',
		distance: 'Safe operating distance',
		statute: 'South Carolina Bicycle Laws, Article 27',
		summary:
			'South Carolina is listed without a specific statewide passing-distance requirement for cyclists. People riding rely on general vehicle-passing rules requiring a safe operating distance.',
		sourceLabel: 'Bicycle Friendly States report card',
		sourceUrl: 'https://bikeleague.org/sites/default/files/BFS_Report_Card_2022_South_Carolina.pdf'
	},
	{
		state: 'South Dakota',
		passed: 2015,
		ranking: 46,
		status: 'higher-standard',
		distance: '3 feet at 35 mph or less; 6 feet above 35 mph',
		statute: 'South Dakota Codified Laws 32-26-26.1',
		summary:
			'South Dakota requires three feet when the posted speed limit is 35 mph or less and six feet when the posted speed limit is greater than 35 mph.',
		sourceLabel: 'South Dakota Codified Laws 32-26-26.1',
		sourceUrl: 'https://sdlegislature.gov/Statutes/Codified_Laws/2055018'
	},
	{
		state: 'Tennessee',
		passed: 2007,
		ranking: 19,
		status: 'specific',
		distance: '3 feet',
		statute: 'Tennessee Code 55-8-175(c)',
		summary: 'Tennessee requires at least three feet when passing a bicycle.',
		sourceLabel: 'Tennessee Code 55-8-175(c)',
		sourceUrl:
			'https://codes.findlaw.com/tn/title-55-motor-and-other-vehicles/tn-code-sect-55-8-175.html'
	},
	{
		state: 'Texas',
		passed: null,
		ranking: 32,
		status: 'no-specific-law',
		distance: 'Safe operating distance',
		statute: 'Texas Transportation Code 545.053',
		summary:
			'Texas is listed without a statewide passing-distance requirement specific to cyclists. General rules require a safe operating distance, while some cities have adopted their own protections.',
		sourceLabel: 'Texas Transportation Code 545.053',
		sourceUrl: 'https://codes.findlaw.com/tx/transportation-code/transp-sect-545-053.html'
	},
	{
		state: 'Utah',
		passed: 2006,
		ranking: 10,
		status: 'specific',
		distance: '3 feet',
		statute: 'Utah Code 41-6a-706.5',
		summary: 'Utah requires a vehicle to pass a bicycle within three feet.',
		sourceLabel: 'Utah Code 41-6a-706.5',
		sourceUrl: 'https://codes.findlaw.com/ut/title-41-motor-vehicles/ut-code-sect-41-6a-706-5/'
	},
	{
		state: 'Vermont',
		passed: null,
		ranking: 23,
		status: 'recommended-standard',
		distance: 'Recommended 4 feet',
		statute: 'Vermont Title 23, § 1033',
		summary:
			'Vermont directs drivers to use due care, reduce speed, and increase clearance to a recommended four feet. The workbook notes that the wording makes the four-foot distance a recommendation rather than an enforceable minimum.',
		sourceLabel: 'Vermont Title 23, § 1033',
		sourceUrl: 'https://law.justia.com/codes/vermont/2021/title-23/chapter-13/section-1033/'
	},
	{
		state: 'Virginia',
		passed: 2014,
		ranking: 7,
		status: 'specific',
		distance: '3 feet',
		statute: 'Virginia Code 46.2-839',
		summary:
			'Virginia requires at least three feet when passing a bicycle and extends the protection to several other vulnerable road users, including electric bicycles and mopeds.',
		sourceLabel: 'Virginia Code 46.2-839',
		sourceUrl: 'https://codes.findlaw.com/va/title-46-2-motor-vehicles/va-code-sect-46-2-839.html'
	},
	{
		state: 'Washington',
		passed: 2019,
		ranking: 3,
		status: 'specific',
		distance: '3 feet + full lane when needed',
		statute: 'Washington Revised Code 46.61.110',
		summary:
			'Washington requires at least three feet, a speed reduction relative to the person riding, and a complete move into the opposing lane when there is not enough room in the travel lane and it is safe.',
		sourceLabel: 'Washington Revised Code 46.61.110',
		sourceUrl: 'https://codes.findlaw.com/wa/title-46-motor-vehicles/wa-rev-code-46-61-110.html'
	},
	{
		state: 'West Virginia',
		passed: 2014,
		ranking: 28,
		status: 'specific',
		distance: '3 feet at a careful, reduced speed',
		statute: 'West Virginia Code 17C-7-3',
		summary:
			'West Virginia requires at least three feet at a careful and reduced speed when passing a bicycle.',
		sourceLabel: 'West Virginia Code 17C-7-3',
		sourceUrl:
			'https://codes.findlaw.com/wv/chapter-17c-traffic-regulations-and-laws-of-the-road/wv-code-sect-17c-7-3.html'
	},
	{
		state: 'Wisconsin',
		passed: 1973,
		ranking: 29,
		status: 'specific',
		distance: '3 feet',
		statute: 'Wisconsin Statutes 346.075',
		summary: 'Wisconsin requires no less than three feet of clearance when passing a bicycle.',
		sourceLabel: 'Wisconsin Statutes 346.075',
		sourceUrl: 'https://law.justia.com/codes/wisconsin/2022/chapter-346/section-346-075/'
	},
	{
		state: 'Wyoming',
		passed: 2015,
		ranking: 50,
		status: 'specific',
		distance: '3 feet',
		statute: 'Wyoming Statutes 31-5-203',
		summary: 'Wyoming requires at least a three-foot separation when passing a bicycle.',
		sourceLabel: 'Wyoming Statutes 31-5-203',
		sourceUrl: 'https://codes.findlaw.com/wy/title-31-motor-vehicles/wy-st-sect-31-5-203.html'
	}
]);

export const THREE_FEET_LAW_STATUS_LABELS = Object.freeze({
	specific: 'Specific passing rule',
	'higher-standard': 'Higher or graduated standard',
	'variable-standard': 'Flexible standard',
	'limited-standard': 'Limited rule',
	'recommended-standard': 'Recommended standard',
	'no-specific-law': 'No specific statewide distance'
});
