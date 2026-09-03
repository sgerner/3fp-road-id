import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildGroupSubscriberWelcomeEmail,
	normalizeGroupEmailSignup,
	resolveGroupEmailWelcomeTenant,
	shouldSendGroupSubscriberWelcome
} from './groupEmailSubscribers.js';
import { wrapHtmlWithBranding, wrapTextWithBranding } from '../email/branding.js';

test('newsletter signup requires explicit consent and a valid email', () => {
	assert.equal(normalizeGroupEmailSignup({ email: 'person@example.org' }).ok, false);
	assert.equal(normalizeGroupEmailSignup({ email: 'not-an-email', consent: true }).ok, false);
});

test('newsletter signup normalizes deliverable visitor details', () => {
	assert.deepEqual(
		normalizeGroupEmailSignup({
			email: ' Rider@Example.ORG ',
			first_name: '  Casey  ',
			consent: true
		}),
		{
			ok: true,
			honeypot: false,
			email: 'rider@example.org',
			firstName: 'Casey'
		}
	);
});

test('newsletter signup honeypot succeeds without storing data', () => {
	assert.deepEqual(normalizeGroupEmailSignup({ company: 'Spam Co' }), {
		ok: true,
		honeypot: true
	});
});

test('subscriber welcome selects the branded TBAG tenant and microsite links', () => {
	const welcome = buildGroupSubscriberWelcomeEmail({
		group: {
			id: 'tbag-id',
			slug: 'tempe-bicycle-action-group',
			microsite_slug: 'biketempe',
			name: 'Tempe Bicycle Action Group'
		},
		siteConfig: { site_variant: 'tbag' },
		firstName: 'Casey',
		origin: 'https://biketempe.3fp.bike',
		unsubscribeToken: 'unsubscribe-token'
	});

	assert.equal(welcome.tenant, 'tbag');
	assert.equal(welcome.subject, 'Welcome to Tempe Bicycle Action Group');
	assert.equal(welcome.branding.brand.name, 'Tempe Bicycle Action Group');
	assert.equal(welcome.branding.brand.accent, '#C96F52');
	assert.equal(welcome.branding.actionUrl, 'https://biketempe.3fp.bike/biketempe');
	assert.match(welcome.html, /Hi Casey,/);
	assert.match(
		welcome.html,
		/https:\/\/biketempe\.3fp\.bike\/api\/groups\/tempe-bicycle-action-group\/email\/unsubscribe\//
	);
	assert.doesNotMatch(welcome.html, /3 Feet Please/);
});

test('subscriber welcome selects the 3 Feet Please tenant without TBAG branding', () => {
	const group = {
		slug: '3-feet-please',
		microsite_slug: '3feetplease',
		name: '3 Feet Please'
	};
	const tenant = resolveGroupEmailWelcomeTenant({ group });
	const welcome = buildGroupSubscriberWelcomeEmail({
		group,
		origin: 'https://3fp.org',
		unsubscribeToken: 'unsubscribe-token'
	});

	assert.equal(tenant.key, '3fp');
	assert.equal(welcome.tenant, '3fp');
	assert.equal(welcome.subject, 'Welcome to 3 Feet Please');
	assert.equal(welcome.branding.brand.name, '3 Feet Please');
	assert.equal(welcome.branding.brand.accent, '#C4D32D');
	assert.match(welcome.text, /safe-passing education/);
	assert.doesNotMatch(welcome.html, /Tempe Bicycle Action Group/);
});

test('shared email shell applies the selected tenant palette and copy', () => {
	const welcome = buildGroupSubscriberWelcomeEmail({
		group: {
			slug: 'tempe-bicycle-action-group',
			microsite_slug: 'biketempe',
			name: 'Tempe Bicycle Action Group'
		},
		origin: 'https://biketempe.3fp.bike'
	});
	const options = {
		...welcome.branding,
		origin: 'https://biketempe.3fp.bike',
		subjectLine: welcome.subject
	};

	const html = wrapHtmlWithBranding(welcome.html, options);
	const text = wrapTextWithBranding(welcome.text, options);
	assert.match(html, /Tempe Bicycle Action Group/);
	assert.match(html, /background:#081B23/);
	assert.doesNotMatch(html, /3fp\.png/);
	assert.match(text, /^Tempe Bicycle Action Group Welcome/);
});

test('unrecognized groups get their own name and never inherit the platform logo', () => {
	const welcome = buildGroupSubscriberWelcomeEmail({
		group: {
			id: 'group-id',
			slug: 'local-bicycle-group',
			microsite_slug: 'localbicycle',
			name: 'Local Bicycle Group'
		},
		origin: 'https://localbicycle.3fp.bike'
	});
	const html = wrapHtmlWithBranding(welcome.html, {
		...welcome.branding,
		origin: 'https://localbicycle.3fp.bike',
		subjectLine: welcome.subject
	});

	assert.equal(welcome.subject, 'Welcome to Local Bicycle Group');
	assert.match(html, /Local Bicycle Group/);
	assert.doesNotMatch(html, /3fp\.png/);
});

test('subscriber welcome is sent only for a new or re-subscribed address', () => {
	assert.equal(shouldSendGroupSubscriberWelcome(null), true);
	assert.equal(shouldSendGroupSubscriberWelcome(undefined), true);
	assert.equal(shouldSendGroupSubscriberWelcome({ status: 'unsubscribed' }), true);
	assert.equal(shouldSendGroupSubscriberWelcome({ status: 'subscribed' }), true);
	assert.equal(
		shouldSendGroupSubscriberWelcome({
			status: 'subscribed',
			welcome_email_sent_at: '2026-09-02T00:00:00.000Z'
		}),
		false
	);
});
