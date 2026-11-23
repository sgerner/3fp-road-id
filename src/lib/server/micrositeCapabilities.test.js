import assert from 'node:assert/strict';
import test from 'node:test';
import {
	deriveMicrositeCapabilities,
	isSamePageReloadHref,
	resolveMicrositeActionHref
} from '../microsites/capabilities.js';
import { mergeGroupSiteConfig, normalizeGroupSiteConfig } from '../microsites/config.js';
import {
	buildTempeBicycleActionGroupSite,
	TBAG_FOLLOW_CALENDAR_REVISION
} from '../microsites/tempeBicycleActionGroup.js';

test('deriveMicrositeCapabilities enables email follow for claimed groups and hides empty memberships', () => {
	const capabilities = deriveMicrositeCapabilities({
		group: {
			slug: 'mesa-velo',
			name: 'Mesa Velo',
			website_url: 'https://mesavelo.example.org',
			public_contact_email: 'hello@mesavelo.example.org'
		},
		siteConfig: {
			sections: { join: true, contact: true },
			site_pages: [
				{
					id: 'home',
					is_home: true,
					blocks: [{ type: 'hero' }, { type: 'contact' }]
				}
			]
		},
		trust: { isClaimed: true, ownerCount: 2 },
		membershipProgram: { enabled: true, cta_label: 'Join Mesa Velo' },
		membershipTiers: [],
		donationEnabled: false
	});

	assert.equal(capabilities.isClaimed, true);
	assert.equal(capabilities.hasMembership, false);
	assert.equal(capabilities.hasDonation, false);
	assert.equal(capabilities.hasEmailFollow, true);
	assert.equal(capabilities.hasFollowOptions, true);
	assert.equal(capabilities.canShowFollowNav, true);
	assert.equal(capabilities.membershipCtaLabel, 'Join Mesa Velo');
	assert.equal(capabilities.canShowContactNav, true);
	assert.equal(capabilities.externalWebsiteUrl, 'https://mesavelo.example.org/');
	assert.equal(capabilities.groupProfileHref, '/groups/mesa-velo');
});

test('deriveMicrositeCapabilities hides Follow nav on unclaimed groups without active follow options', () => {
	const capabilities = deriveMicrositeCapabilities({
		group: {
			slug: '3-feet-cycling-olathe-ks',
			name: '3 Feet Cycling',
			website_url: 'https://3feetcycling.example.com',
			social_links: { instagram: 'https://instagram.com/3feetcycling' }
		},
		siteConfig: {
			sections: { join: true, contact: true },
			site_pages: [
				{
					id: 'home',
					is_home: true,
					blocks: [{ type: 'hero' }, { type: 'story' }]
				}
			]
		},
		trust: { isClaimed: false, ownerCount: 0 },
		membershipProgram: null,
		membershipTiers: [],
		donationEnabled: false
	});

	assert.equal(capabilities.isClaimed, false);
	assert.equal(capabilities.hasConfiguredEmailSignup, false);
	assert.equal(capabilities.hasEmailFollow, false);
	assert.equal(capabilities.hasMembership, false);
	assert.equal(capabilities.hasDonation, false);
	assert.equal(capabilities.hasFollowOptions, false);
	assert.equal(capabilities.canShowFollowNav, false);
	assert.equal(capabilities.canShowContactNav, false);
	assert.equal(capabilities.externalWebsiteUrl, 'https://3feetcycling.example.com/');
	assert.equal(capabilities.hasContactLinks, true);
	assert.equal(capabilities.hasContact, true);
	assert.equal(capabilities.groupProfileHref, '/groups/3-feet-cycling-olathe-ks');
});

test('deriveMicrositeCapabilities recognizes configured email_signup and calendar blocks and filters retired TBAG website', () => {
	const tbagConfig = buildTempeBicycleActionGroupSite({
		name: 'Tempe Bicycle Action Group',
		city: 'Tempe',
		state_region: 'AZ'
	});
	const capabilities = deriveMicrositeCapabilities({
		group: {
			slug: 'tempe-bicycle-action-group',
			name: 'Tempe Bicycle Action Group',
			website_url: 'https://www.biketempe.org',
			public_contact_email: 'info@biketempe.org',
			social_links: { instagram: 'https://instagram.com/biketempe' }
		},
		siteConfig: tbagConfig,
		trust: { isClaimed: false, ownerCount: 0 },
		donationEnabled: false
	});

	assert.equal(capabilities.hasConfiguredEmailSignup, true);
	assert.equal(capabilities.hasEmailFollow, true);
	assert.equal(capabilities.canShowFollowNav, true);
	assert.equal(capabilities.hasRideCalendarBlock, true);
	assert.equal(capabilities.hasRideWidget, true);
	assert.equal(capabilities.hasCalendarContent, true);
	assert.equal(capabilities.externalWebsiteUrl, '');
	assert.ok(capabilities.contactLinks.every((link) => link.key !== 'website'));
	assert.ok(capabilities.contactLinks.some((link) => link.key === 'email'));
});

test('resolveMicrositeActionHref routes /join#donate to /biketempe/join#donate when active and #contact when inactive', () => {
	const tbagConfig = buildTempeBicycleActionGroupSite({
		name: 'Tempe Bicycle Action Group',
		city: 'Tempe',
		state_region: 'AZ'
	});
	const takeActionPage = tbagConfig.site_pages.find((page) => page.slug === 'take-action');
	const donateBlock = takeActionPage.blocks.find(
		(block) => block.button_label === 'See donation options'
	);

	const baseSite = {
		group: {
			slug: 'tempe-bicycle-action-group',
			name: 'Tempe Bicycle Action Group',
			public_contact_email: 'info@biketempe.org'
		},
		siteConfig: tbagConfig,
		basePath: '/biketempe',
		trust: { isClaimed: true, ownerCount: 1 }
	};

	const inactiveHref = resolveMicrositeActionHref(donateBlock, {
		site: { ...baseSite, donationEnabled: false },
		currentPage: takeActionPage,
		currentPathname: '/biketempe/take-action',
		basePath: '/biketempe',
		origin: 'https://3fp.org'
	});
	assert.equal(inactiveHref, '#contact');

	const activeHref = resolveMicrositeActionHref(donateBlock, {
		site: { ...baseSite, donationEnabled: true },
		currentPage: takeActionPage,
		currentPathname: '/biketempe/take-action',
		basePath: '/biketempe',
		origin: 'https://3fp.org'
	});
	assert.equal(activeHref, '/biketempe/join#donate');

	const legacyDonateHref = resolveMicrositeActionHref(
		{ type: 'call_to_action', button_url: 'https://www.biketempe.org/donate/' },
		{
			site: { ...baseSite, donationEnabled: false },
			currentPage: tbagConfig.site_pages.find((page) => page.slug === 'projects'),
			currentPathname: '/biketempe/projects',
			basePath: '/biketempe',
			origin: 'https://3fp.org'
		}
	);
	assert.equal(legacyDonateHref, '/biketempe#contact');
});

test('resolveMicrositeActionHref hides self-referential page reload buttons while preserving anchors', () => {
	const tbagConfig = buildTempeBicycleActionGroupSite({
		name: 'Tempe Bicycle Action Group',
		city: 'Tempe',
		state_region: 'AZ'
	});
	const calendarPage = tbagConfig.site_pages.find((page) => page.slug === 'calendar');
	const site = {
		group: {
			slug: 'tempe-bicycle-action-group',
			name: 'Tempe Bicycle Action Group',
			public_contact_email: 'info@biketempe.org'
		},
		siteConfig: tbagConfig,
		basePath: '/biketempe'
	};

	assert.equal(
		isSamePageReloadHref('/biketempe/calendar', {
			currentPathname: '/biketempe/calendar',
			origin: 'https://3fp.org'
		}),
		true
	);
	assert.equal(
		isSamePageReloadHref('#rides-widget', {
			currentPathname: '/biketempe/calendar',
			origin: 'https://3fp.org'
		}),
		false
	);

	const selfLinkHref = resolveMicrositeActionHref(
		{ type: 'call_to_action', button_url: '/calendar' },
		{
			site,
			currentPage: calendarPage,
			currentPathname: '/biketempe/calendar',
			basePath: '/biketempe',
			origin: 'https://3fp.org'
		}
	);
	assert.equal(selfLinkHref, '');

	const anchorHref = resolveMicrositeActionHref(calendarPage.blocks[0], {
		site,
		currentPage: calendarPage,
		currentPathname: '/biketempe/calendar',
		basePath: '/biketempe',
		origin: 'https://3fp.org'
	});
	assert.equal(anchorHref, '#rides-widget');
});

test('normalizeGroupSiteConfig upgrades legacy Bike Tempe calendar and take-action pages to the live preset revision', () => {
	const legacyConfig = {
		site_variant: 'tbag',
		ride_widget_enabled: false,
		ride_widget_host_scope: 'group_only',
		ride_widget_config: {},
		site_pages: [
			{
				id: 'home',
				title: 'Home',
				is_home: true,
				blocks: [{ type: 'hero', title: 'Better streets for Tempe.' }, { type: 'contact' }]
			},
			{
				id: 'take-action',
				title: 'Take Action',
				slug: 'take-action',
				blocks: [
					{
						type: 'hero',
						title: 'Old take action hero',
						button_label: 'Donate',
						button_url: 'https://www.biketempe.org/donate/'
					}
				]
			},
			{
				id: 'calendar',
				title: 'Calendar',
				slug: 'calendar',
				blocks: [
					{
						type: 'hero',
						title: 'Find a good time to show up.',
						button_label: 'Open the calendar',
						button_url: '/calendar'
					},
					{
						type: 'text',
						title: 'Rides, meetings, and volunteer shifts'
					}
				]
			}
		]
	};

	const upgraded = normalizeGroupSiteConfig(legacyConfig, {
		group: {
			name: 'Tempe Bicycle Action Group',
			slug: 'tempe-bicycle-action-group',
			city: 'Tempe',
			state_region: 'AZ'
		}
	});

	assert.equal(upgraded.ride_widget_enabled, true);
	assert.equal(upgraded.ride_widget_host_scope, 'all');
	assert.equal(upgraded.ride_widget_config.city, 'Tempe');
	assert.equal(upgraded.ride_widget_config.defaultTab, 'calendar');

	const upgradedCalendar = upgraded.site_pages.find((page) => page.slug === 'calendar');
	assert.equal(upgradedCalendar.source_revision, TBAG_FOLLOW_CALENDAR_REVISION);
	assert.equal(upgradedCalendar.blocks[0].button_url, '#rides-widget');
	assert.ok(upgradedCalendar.blocks.some((block) => block.type === 'ride_calendar'));
	assert.ok(upgradedCalendar.blocks.some((block) => block.type === 'events'));
	assert.ok(upgradedCalendar.blocks.every((block) => block.button_url !== '/calendar'));

	const upgradedTakeAction = upgraded.site_pages.find((page) => page.slug === 'take-action');
	assert.equal(upgradedTakeAction.source_revision, TBAG_FOLLOW_CALENDAR_REVISION);
	assert.ok(upgradedTakeAction.blocks.some((block) => block.type === 'email_signup'));
	assert.ok(upgradedTakeAction.blocks.some((block) => block.type === 'contact'));
	assert.equal(
		upgradedTakeAction.blocks.find((block) => block.button_label === 'See donation options')
			?.button_url,
		'/join#donate'
	);

	// Custom edits saved on the current revision are preserved
	const editedConfig = structuredClone(upgraded);
	const editedCalendar = editedConfig.site_pages.find((page) => page.slug === 'calendar');
	editedCalendar.blocks[0].title = 'Custom Tempe Ride Week';
	const preserved = normalizeGroupSiteConfig(editedConfig, {
		group: {
			name: 'Tempe Bicycle Action Group',
			slug: 'tempe-bicycle-action-group',
			city: 'Tempe',
			state_region: 'AZ'
		}
	});
	assert.equal(
		preserved.site_pages.find((page) => page.slug === 'calendar').blocks[0].title,
		'Custom Tempe Ride Week'
	);

	const merged = mergeGroupSiteConfig(buildTempeBicycleActionGroupSite(null), upgraded);
	assert.equal(merged.site_variant, 'tbag');
	assert.equal(merged.ride_widget_enabled, true);
});
